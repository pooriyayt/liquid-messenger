<?php
if (!file_exists(__DIR__ . '/../includes/config.php') || (!file_exists(__DIR__ . '/../installed.lock') && !file_exists(__DIR__ . '/../storage/installed.lock'))) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'System not installed. Please run install.php']);
    exit;
}
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/encryption.php';

// Disable output buffering to allow direct streaming
if (ob_get_level()) {
    ob_end_clean();
}

$rawFile = isset($_GET['file']) ? (string) $_GET['file'] : (isset($_GET['f']) ? (string) $_GET['f'] : '');
if ($rawFile === '') {
    http_response_code(400);
    echo 'Missing file parameter';
    exit;
}

// Normalize and sanitize requested file path
$cleanFile = str_replace(['../', '..\\', "\0"], '', $rawFile);
$cleanFile = ltrim($cleanFile, '/\\');

// Target directory base
$baseDir = realpath(UPLOAD_DIR);
if ($baseDir === false) {
    // Fallback to relative path if UPLOAD_DIR realpath is false
    $baseDir = realpath(__DIR__ . '/../uploads');
}

$fullPath = realpath($baseDir . DIRECTORY_SEPARATOR . $cleanFile);
if ($fullPath === false || strpos($fullPath, $baseDir) !== 0 || !is_file($fullPath)) {
    // If not found in uploads root, check in uploads/images, uploads/voice, uploads/files
    $altDirs = [
        $baseDir . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . $cleanFile,
        $baseDir . DIRECTORY_SEPARATOR . 'voice' . DIRECTORY_SEPARATOR . $cleanFile,
        $baseDir . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $cleanFile,
    ];
    $found = false;
    foreach ($altDirs as $alt) {
        $realAlt = realpath($alt);
        if ($realAlt && strpos($realAlt, $baseDir) === 0 && is_file($realAlt)) {
            $fullPath = $realAlt;
            $found = true;
            break;
        }
    }
    if (!$found) {
        http_response_code(404);
        echo 'File not found';
        exit;
    }
}

// Check authorization:
// Avatars and default icons can be accessed publicly; chat attachments require authenticated session or valid signed token
$isPublicAvatar = (strpos($cleanFile, 'images/default') !== false || strpos($cleanFile, 'default.png') !== false || strpos($cleanFile, 'default_group.png') !== false);
if (!$isPublicAvatar) {
    $token = isset($_GET['token']) ? (string) $_GET['token'] : '';
    $expectedToken = hash_hmac('sha256', basename($fullPath), defined('APP_ENC_KEY') ? APP_ENC_KEY : 'secret');
    $hasValidToken = ($token !== '' && hash_equals($expectedToken, $token));

    // Must be either logged in or provide a valid signed HMAC token
    if (!Auth::isLoggedIn() && !$hasValidToken) {
        http_response_code(401);
        echo 'Unauthorized: Please log in to view chat media';
        exit;
    }

    if (Auth::isLoggedIn()) {
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];
        $fileName = basename($fullPath);

        // Verify if this is an avatar/profile image (accessible to any authenticated user)
        $isUserAvatar = false;
        if ($conn && $conn instanceof mysqli) {
            $avatarStmt = $conn->prepare("SELECT 1 FROM users WHERE profile_pic LIKE ? LIMIT 1");
            if ($avatarStmt) {
                $avLike = '%' . $conn->real_escape_string($fileName) . '%';
                $avatarStmt->bind_param("s", $avLike);
                $avatarStmt->execute();
                if ($avatarStmt->get_result()->num_rows > 0) {
                    $isUserAvatar = true;
                }
            }
        }

        // If not a user avatar, enforce strict message/chat permission checks
        if (!$isUserAvatar && $conn && $conn instanceof mysqli) {
            $likePattern = '%' . $conn->real_escape_string($fileName) . '%';
            $stmt = $conn->prepare("SELECT message_id, sender_id, receiver_id, group_id, channel_id FROM messages WHERE file_url LIKE ? LIMIT 5");
            if ($stmt) {
                $stmt->bind_param("s", $likePattern);
                $stmt->execute();
                $msgResult = $stmt->get_result();

                if ($msgResult->num_rows > 0) {
                    $hasAccess = false;
                    while ($m = $msgResult->fetch_assoc()) {
                        $senderId = (int)$m['sender_id'];
                        $receiverId = $m['receiver_id'] !== null ? (int)$m['receiver_id'] : null;
                        $groupId = $m['group_id'] !== null ? (int)$m['group_id'] : null;
                        $channelId = $m['channel_id'] !== null ? (int)$m['channel_id'] : null;

                        if ($senderId === $userId || $receiverId === $userId) {
                            $hasAccess = true;
                            break;
                        }

                        if ($groupId !== null) {
                            $checkGroup = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1");
                            if ($checkGroup) {
                                $checkGroup->bind_param("ii", $groupId, $userId);
                                $checkGroup->execute();
                                if ($checkGroup->get_result()->num_rows > 0) {
                                    $hasAccess = true;
                                    break;
                                }
                            }
                        }

                        if ($channelId !== null) {
                            $checkChan = $conn->prepare("SELECT 1 FROM channels WHERE channel_id = ? AND (type = 'public' OR EXISTS(SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?)) LIMIT 1");
                            if ($checkChan) {
                                $checkChan->bind_param("iii", $channelId, $channelId, $userId);
                                $checkChan->execute();
                                if ($checkChan->get_result()->num_rows > 0) {
                                    $hasAccess = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (!$hasAccess) {
                        http_response_code(403);
                        echo 'Forbidden: You do not have permission to access this attachment.';
                        exit;
                    }
                }
            }
        }
    }
}

// Determine MIME type
$ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
$mimeMap = [
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml',
    'mp3' => 'audio/mpeg',
    'ogg' => 'audio/ogg',
    'wav' => 'audio/wav',
    'webm' => 'video/webm',
    'mp4' => 'video/mp4',
    'mov' => 'video/quicktime',
    'pdf' => 'application/pdf',
    'txt' => 'text/plain',
    'zip' => 'application/zip',
];

$mimeType = $mimeMap[$ext] ?? 'application/octet-stream';
$totalSize = Encryption::getFileSize($fullPath);
$fileName = basename($fullPath);

// Support HTTP Range requests (crucial for video/audio seeking)
$start = 0;
$end = $totalSize - 1;
$length = $totalSize;
$isRangeRequest = false;

if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=\s*(\d+)-(\d*)/i', $_SERVER['HTTP_RANGE'], $matches)) {
    $isRangeRequest = true;
    $start = (int) $matches[1];
    if (!empty($matches[2])) {
        $end = (int) $matches[2];
    }
    if ($start > $end || $start >= $totalSize) {
        http_response_code(416);
        header("Content-Range: bytes */$totalSize");
        exit;
    }
    $length = $end - $start + 1;
}

header('Accept-Ranges: bytes');
header('Content-Type: ' . $mimeType);
header('Cache-Control: private, max-age=86400');
header('Content-Disposition: inline; filename="' . rawurlencode($fileName) . '"');

if ($isRangeRequest) {
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$totalSize");
    header("Content-Length: $length");
} else {
    http_response_code(200);
    header("Content-Length: $totalSize");
}

Encryption::streamFile($fullPath, $start, $length);
exit;
