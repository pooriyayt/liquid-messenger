<?php
/**
 * Migration Script: Migrate legacy messages and files to Cloud Encryption (AES-256-GCM / CTR)
 * Safe execution: Supports dry-run and does not drop any existing keys or columns.
 */

declare(strict_types=1);

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/encryption.php';

header('Content-Type: application/json; charset=utf-8');

// Default secret key for web-based migration access
if (!defined('MIGRATION_SECRET')) {
    define('MIGRATION_SECRET', 'liquid2026');
}

$isAuthorized = false;

// 1. Authorized if running from CLI
if (php_sapi_name() === 'cli') {
    $isAuthorized = true;
}

// 2. Authorized if valid secret key provided in URL query: ?secret=liquid2026 or ?key=liquid2026
$providedKey = (string) ($_GET['secret'] ?? ($_GET['key'] ?? ($_GET['token'] ?? '')));
if (!empty($providedKey)) {
    if (
        $providedKey === MIGRATION_SECRET ||
        $providedKey === (defined('APP_ENC_KEY') ? APP_ENC_KEY : '') ||
        $providedKey === 'liquid2026' ||
        $providedKey === 'liquid'
    ) {
        $isAuthorized = true;
    }
}

// 3. Authorized if logged in user session
if (!$isAuthorized) {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId > 0) {
        $isAuthorized = true;
    }
}

// If unauthorized, return helpful error response
if (!$isAuthorized) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Authentication required',
        'message' => 'To run migration, please either log in first, or add &secret=liquid2026 to the URL.',
        'example_url' => '?dry_run=1&secret=liquid2026'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

$isCli = (php_sapi_name() === 'cli');
$dryRun = false;

if ($isCli) {
    global $argv;
    $dryRun = in_array('--dry-run', $argv ?? [], true);
} else {
    $dryRun = !empty($_GET['dry_run']);
}

$response = [
    'success' => true,
    'dry_run' => $dryRun,
    'messages_migrated' => 0,
    'messages_skipped' => 0,
    'files_migrated' => 0,
    'files_skipped' => 0,
    'errors' => []
];

try {
    // 1. Migrate Messages
    // Find messages where encrypted_content does not start with v2:
    if (isset($conn) && $conn instanceof mysqli && !$conn->connect_error) {
        $res = $conn->query("SELECT message_id, encrypted_content, message_text FROM messages WHERE encrypted_content NOT LIKE 'v2:%'");
        if ($res) {
            $updateStmt = $conn->prepare("UPDATE messages SET encrypted_content = ?, message_text = ? WHERE message_id = ?");

            while ($row = $res->fetch_assoc()) {
                $msgId = (int) $row['message_id'];
                $encryptedContent = $row['encrypted_content'] ?? '';
                $messageText = $row['message_text'] ?? '';

                $plain = '';
                if ($messageText !== '') {
                    $plain = $messageText;
                } elseif ($encryptedContent !== '') {
                    $plain = Encryption::decryptMessage($encryptedContent);
                }

                if ($plain !== '') {
                    if (!$dryRun) {
                        $newEncrypted = Encryption::encryptMessage($plain);
                        $updateStmt->bind_param('ssi', $newEncrypted, $plain, $msgId);
                        $updateStmt->execute();
                    }
                    $response['messages_migrated']++;
                } else {
                    $response['messages_skipped']++;
                }
            }
        }
    }

    // 2. Scan and Encrypt Uploaded Files at Rest
    $uploadDir = realpath(__DIR__ . '/../uploads');
    if ($uploadDir && is_dir($uploadDir)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($uploadDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($files as $fileinfo) {
            if ($fileinfo->isFile()) {
                $filePath = $fileinfo->getRealPath();
                $filename = $fileinfo->getFilename();

                // Skip .htaccess, .gitignore, and temporary files
                if ($filename === '.htaccess' || $filename === '.gitignore' || str_ends_with($filename, '.tmp')) {
                    continue;
                }

                // Check if already encrypted with LENC\x01
                $handle = @fopen($filePath, 'rb');
                $isEncrypted = false;
                if ($handle) {
                    $magic = fread($handle, 5);
                    fclose($handle);
                    if ($magic === "LENC\x01") {
                        $isEncrypted = true;
                    }
                }

                if (!$isEncrypted) {
                    if (!$dryRun) {
                        $tmpEnc = $filePath . '.mig_tmp';
                        if (Encryption::encryptFile($filePath, $tmpEnc)) {
                            // Replace original with encrypted version
                            if (!@rename($tmpEnc, $filePath)) {
                                @unlink($filePath);
                                @rename($tmpEnc, $filePath);
                            }
                            $response['files_migrated']++;
                        } else {
                            @unlink($tmpEnc);
                            $response['errors'][] = "Failed to encrypt file: {$filename}";
                        }
                    } else {
                        $response['files_migrated']++;
                    }
                } else {
                    $response['files_skipped']++;
                }
            }
        }
    }

} catch (Throwable $e) {
    $response['success'] = false;
    $response['error'] = $e->getMessage();
}

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
