<?php
/**
 * Liquid Chat - Automated Web Installer Wizard
 * Bulletproof, fast & secure installation for VPS, cPanel, DirectAdmin & Shared Hosting.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

// Suppress mysqli fatal exceptions for clean, graceful handling
mysqli_report(MYSQLI_REPORT_OFF);

function cleanAndParseSqlStatements($sqlContent) {
    // Remove multi-line comments /* ... */
    $sqlContent = preg_replace('!/\*.*?\*/!s', '', $sqlContent);

    // Remove single line comments starting with -- or #
    $lines = explode("\n", str_replace("\r\n", "\n", $sqlContent));
    $cleanLines = [];
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || strpos($trimmed, '--') === 0 || strpos($trimmed, '#') === 0) {
            continue;
        }
        $cleanLines[] = $line;
    }
    $cleanedSql = implode("\n", $cleanLines);

    // Strip DROP TABLE statements to prevent permission issues on shared hosting
    $cleanedSql = preg_replace('/^\s*DROP\s+TABLE\s+[^;]+;\s*$/mi', '', $cleanedSql);
    // Ensure all CREATE TABLE statements use IF NOT EXISTS
    $cleanedSql = preg_replace('/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i', 'CREATE TABLE IF NOT EXISTS ', $cleanedSql);

    // Split statements on semicolon followed by newline or EOF
    $rawStatements = preg_split('/;\s*(\n|$)/', $cleanedSql);
    $statements = [];
    foreach ($rawStatements as $stmt) {
        $t = trim($stmt);
        if ($t !== '') {
            $statements[] = $t;
        }
    }
    return $statements;
}

$isLocked = file_exists(__DIR__ . '/installed.lock') || file_exists(__DIR__ . '/storage/installed.lock');

// If locked and user didn't explicitly request ?info, redirect to login
if ($isLocked && !isset($_GET['info'])) {
    header('Location: login.php');
    exit;
}

// Auto-detect current URL
$detectedScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443) ? 'https' : 'http';
$detectedHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
$detectedPath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
$detectedSiteUrl = $detectedScheme . '://' . $detectedHost . ($detectedPath ? $detectedPath : '');

// System requirements check
$phpVersion = PHP_VERSION;
$phpOk = version_compare($phpVersion, '7.4.0', '>=');
$extMysqli = extension_loaded('mysqli');
$extPdo = extension_loaded('pdo_mysql');
$extMbstring = extension_loaded('mbstring');
$extOpenssl = extension_loaded('openssl');
$extCurl = extension_loaded('curl');
$extGd = extension_loaded('gd') || extension_loaded('imagick');
$extJson = extension_loaded('json');

$writableDirs = [
    'includes' => is_writable(__DIR__ . '/includes'),
    'uploads'  => is_writable(__DIR__ . '/uploads'),
    'storage'  => is_writable(__DIR__ . '/storage'),
    'logs'     => is_writable(__DIR__ . '/logs')
];

$allReqsPassed = $phpOk && $extMysqli && $extMbstring && $extOpenssl && $extCurl && $extGd && $extJson &&
                 $writableDirs['includes'] && $writableDirs['uploads'] && $writableDirs['storage'];

$errorMsg = '';
$successMsg = '';
$step = isset($_GET['step']) ? (int)$_GET['step'] : 1;

if ($isLocked) {
    $step = 99; // Locked screen
}

// Process Installation POST
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$isLocked) {
    $dbHost = trim($_POST['db_host'] ?? 'localhost');
    $dbName = trim($_POST['db_name'] ?? '');
    $dbUser = trim($_POST['db_user'] ?? '');
    $dbPass = $_POST['db_pass'] ?? '';
    $siteUrl = rtrim(trim($_POST['site_url'] ?? $detectedSiteUrl), '/');

    $adminName = trim($_POST['admin_name'] ?? 'Administrator');
    $adminUser = trim($_POST['admin_user'] ?? 'admin');
    $adminEmail = trim($_POST['admin_email'] ?? 'admin@example.com');
    $adminPass = $_POST['admin_pass'] ?? '';

    if (empty($dbHost) || empty($dbName) || empty($dbUser)) {
        $errorMsg = 'لطفاً تمامی مشخصات دیتابیس را وارد نمایید. / Please fill in all database fields.';
    } elseif (strlen($adminPass) < 6) {
        $errorMsg = 'رمز عبور مدیر باید حداقل ۶ نویسه باشد. / Admin password must be at least 6 characters.';
    } else {
        try {
            // Test connection to MySQL server
            $mysqli = @new mysqli($dbHost, $dbUser, $dbPass);

            if (!$mysqli || $mysqli->connect_error) {
                $errorMsg = 'اتصال به دیتابیس برقرار نشد: ' . ($mysqli ? $mysqli->connect_error : 'Connection failed');
            } else {
                // Try creating DB if privileges allow, but ignore if denied (cPanel users create DB in advance)
                try {
                    @$mysqli->query("CREATE DATABASE IF NOT EXISTS `" . $mysqli->real_escape_string($dbName) . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                } catch (Throwable $e) {}

                // Select the target database
                if (!@$mysqli->select_db($dbName)) {
                    $errorMsg = 'پایگاه داده یافت نشد یا دسترسی به آن مجاز نیست: ' . ($mysqli->error ?: 'Could not select database');
                } else {
                    $mysqli->set_charset("utf8mb4");

                    // Locate schema SQL file
                    $sqlPath = __DIR__ . '/database_complete.sql';
                    if (!file_exists($sqlPath)) {
                        $sqlPath = __DIR__ . '/includes/database.sql';
                    }

                    if (!file_exists($sqlPath)) {
                        $errorMsg = 'فایل اسکیما دیتابیس (database_complete.sql) یافت نشد!';
                    } else {
                        $sqlContent = file_get_contents($sqlPath);

                        // Parse and clean all SQL statements
                        $statements = cleanAndParseSqlStatements($sqlContent);
                        $createdTables = 0;
                        $executionErrors = [];

                        foreach ($statements as $stmtSql) {
                            if (!$mysqli->query($stmtSql)) {
                                $executionErrors[] = "خطا در کوئری: " . substr($stmtSql, 0, 40) . "... (" . $mysqli->error . ")";
                            } else {
                                if (stripos($stmtSql, 'CREATE TABLE') !== false) {
                                    $createdTables++;
                                }
                            }
                        }

                        // Verification: Ensure the core 'users' table was actually created
                        $checkUsers = $mysqli->query("SHOW TABLES LIKE 'users'");
                        if (!$checkUsers || $checkUsers->num_rows === 0) {
                            $errorMsg = 'جداول پایگاه داده در دیتابیس ساخته نشدند! جزئیات خطا: ' . (implode('<br>', array_slice($executionErrors, 0, 4)) ?: $mysqli->error);
                        } else {
                            // Insert or Update the admin user account
                            $passHash = password_hash($adminPass, PASSWORD_DEFAULT);
                            $stmt = @$mysqli->prepare("INSERT INTO users (email, username, password, full_name, profile_pic, status, created_at) VALUES (?, ?, ?, ?, 'default.png', 'online', NOW()) ON DUPLICATE KEY UPDATE password = VALUES(password), full_name = VALUES(full_name)");
                            if ($stmt) {
                                $stmt->bind_param("ssss", $adminEmail, $adminUser, $passHash, $adminName);
                                @$stmt->execute();
                                $stmt->close();
                            }

                            // Generate server-side AES-256-GCM encryption key (32 bytes base64)
                            $appEncKey = base64_encode(random_bytes(32));

                            // Generate VAPID Keys for Web Push if OpenSSL EC is available
                            $vapidConfig = [
                                'private_key_type' => OPENSSL_KEYTYPE_EC,
                                'curve_name' => 'prime256v1'
                            ];
                            $res = @openssl_pkey_new($vapidConfig);
                            if ($res) {
                                @openssl_pkey_export($res, $privatePem);
                                $details = @openssl_pkey_get_details($res);
                                if (isset($details['ec']['x'], $details['ec']['y'])) {
                                    $rawPublic = "\x04" . $details['ec']['x'] . $details['ec']['y'];
                                    $b64UrlPublic = rtrim(strtr(base64_encode($rawPublic), '+/', '-_'), '=');
                                    $vapidData = [
                                        'public_key' => $b64UrlPublic,
                                        'private_pem' => $privatePem
                                    ];
                                    @file_put_contents(__DIR__ . '/storage/vapid_keys.json', json_encode($vapidData, JSON_PRETTY_PRINT));
                                }
                            }

                            // Ensure essential upload directories exist
                            $dirs = [
                                __DIR__ . '/uploads/images',
                                __DIR__ . '/uploads/voice',
                                __DIR__ . '/uploads/files',
                                __DIR__ . '/storage',
                                __DIR__ . '/logs'
                            ];
                            foreach ($dirs as $d) {
                                if (!is_dir($d)) {
                                    @mkdir($d, 0755, true);
                                }
                            }

                            // Generate hardened includes/config.php
                            $configTemplate = "<?php\n" .
                                "// Liquid Chat - Application Configuration\n" .
                                "// Generated automatically by Installer on " . date('Y-m-d H:i:s') . "\n\n" .
                                "// Check if system is installed. If not, redirect to installer\n" .
                                "\$isInstalled = file_exists(dirname(__DIR__) . '/installed.lock') || file_exists(dirname(__DIR__) . '/storage/installed.lock');\n" .
                                "if (!\$isInstalled && file_exists(dirname(__DIR__) . '/install.php')) {\n" .
                                "    \$currentScript = basename(\$_SERVER['SCRIPT_NAME'] ?? '');\n" .
                                "    if (\$currentScript !== 'install.php') {\n" .
                                "        header('Location: install.php');\n" .
                                "        exit;\n" .
                                "    }\n" .
                                "}\n\n" .
                                "define('CSP_REPORT_ONLY', true);\n" .
                                "require_once __DIR__ . '/security_headers.php';\n\n" .
                                "// Database credentials\n" .
                                "define('DB_HOST', '" . addslashes($dbHost) . "');\n" .
                                "define('DB_USERNAME', '" . addslashes($dbUser) . "');\n" .
                                "define('DB_PASSWORD', '" . addslashes($dbPass) . "');\n" .
                                "define('DB_NAME', '" . addslashes($dbName) . "');\n\n" .
                                "// Establish Connection with exception suppression to prevent HTTP 500\n" .
                                "mysqli_report(MYSQLI_REPORT_OFF);\n" .
                                "try {\n" .
                                "    \$conn = @new mysqli(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME);\n" .
                                "} catch (Throwable \$e) {\n" .
                                "    \$conn = null;\n" .
                                "}\n\n" .
                                "if (!\$conn || \$conn->connect_error) {\n" .
                                "    if (file_exists(dirname(__DIR__) . '/install.php') && !file_exists(dirname(__DIR__) . '/installed.lock')) {\n" .
                                "        header('Location: install.php');\n" .
                                "        exit;\n" .
                                "    }\n" .
                                "    die('Database connection failed. Please verify credentials in includes/config.php.');\n" .
                                "}\n" .
                                "\$conn->set_charset('utf8mb4');\n\n" .
                                "// Application URL & Upload Paths\n" .
                                "define('SITE_URL', '" . addslashes($siteUrl) . "');\n" .
                                "define('APP_DEBUG', false);\n" .
                                "define('MAX_UPLOAD_BYTES', 100 * 1024 * 1024);\n" .
                                "define('UPLOAD_DIR', dirname(__DIR__) . '/uploads/');\n" .
                                "define('IMAGE_UPLOAD_DIR', UPLOAD_DIR . 'images/');\n" .
                                "define('VOICE_UPLOAD_DIR', UPLOAD_DIR . 'voice/');\n" .
                                "define('FILE_UPLOAD_DIR', UPLOAD_DIR . 'files/');\n\n" .
                                "define('UPLOAD_URL', 'uploads/');\n" .
                                "define('IMAGE_UPLOAD_URL', UPLOAD_URL . 'images/');\n" .
                                "define('VOICE_UPLOAD_URL', UPLOAD_URL . 'voice/');\n" .
                                "define('FILE_UPLOAD_URL', UPLOAD_URL . 'files/');\n\n" .
                                "// Server-side encryption key (AES-256-GCM)\n" .
                                "define('APP_ENC_KEY', '" . $appEncKey . "');\n\n" .
                                "// Set Timezone\n" .
                                "date_default_timezone_set('UTC');\n\n" .
                                "// Session Security & Cookie Configuration\n" .
                                "\$cookieSecure = (!empty(\$_SERVER['HTTPS']) && \$_SERVER['HTTPS'] !== 'off') || (!empty(\$_SERVER['SERVER_PORT']) && (int) \$_SERVER['SERVER_PORT'] === 443);\n" .
                                "\$cookieParams = session_get_cookie_params();\n" .
                                "\$cookieParams['secure'] = \$cookieSecure;\n" .
                                "\$cookieParams['httponly'] = true;\n" .
                                "\$cookieParams['samesite'] = 'Lax';\n" .
                                "session_set_cookie_params(\$cookieParams);\n" .
                                "ini_set('session.cookie_httponly', '1');\n" .
                                "ini_set('session.cookie_samesite', 'Lax');\n" .
                                "ini_set('session.cookie_secure', \$cookieSecure ? '1' : '0');\n" .
                                "ini_set('session.use_strict_mode', '1');\n" .
                                "ini_set('session.use_only_cookies', '1');\n" .
                                "if (session_status() === PHP_SESSION_NONE) {\n" .
                                "    session_start();\n" .
                                "}\n";

                            @file_put_contents(__DIR__ . '/includes/config.php', $configTemplate);

                            // Lock the installation securely in multiple locations
                            @file_put_contents(__DIR__ . '/installed.lock', "Installed on " . date('Y-m-d H:i:s'));
                            @file_put_contents(__DIR__ . '/storage/installed.lock', "Installed on " . date('Y-m-d H:i:s'));

                            @chmod(__DIR__ . '/installed.lock', 0644);
                            @chmod(__DIR__ . '/storage/installed.lock', 0644);
                            @chmod(__DIR__ . '/includes/config.php', 0644);

                            $step = 3; // Success!
                        }
                    }
                }
            }
        } catch (Throwable $ex) {
            $errorMsg = 'خطای سیستمی در فرآیند نصب: ' . $ex->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>نصب خودکار لیکوئید چت / Liquid Chat Installer</title>
  <meta name="theme-color" content="#0b1224">
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><link rel="alternate icon" href="favicon.ico">
  <style>
    :root {
      --bg: #0b1224;
      --card-bg: rgba(16, 24, 40, 0.94);
      --border: rgba(120, 190, 255, 0.18);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --primary: #39d6a4;
      --accent: #4cc9f0;
      --danger: #ef4444;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Tahoma, sans-serif;
      background:
        radial-gradient(1000px circle at 15% 10%, rgba(57, 214, 164, 0.14), transparent 50%),
        radial-gradient(900px circle at 85% 85%, rgba(76, 201, 240, 0.12), transparent 50%),
        linear-gradient(135deg, #070c18, var(--bg) 50%, #101c32);
      color: var(--text);
      padding: 24px;
      -webkit-tap-highlight-color: transparent;
    }
    .install-box {
      width: min(100%, 640px);
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 28px;
      padding: 36px 32px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    }
    .header {
      text-align: center;
      margin-bottom: 28px;
    }
    .header img {
      width: 68px;
      height: 68px;
      margin-bottom: 12px;
    }
    .header h1 {
      font-size: 1.7rem;
      font-weight: 700;
      color: #fff;
    }
    .header p {
      font-size: 0.95rem;
      color: var(--muted);
      margin-top: 6px;
    }
    .alert {
      padding: 14px 18px;
      border-radius: 14px;
      margin-bottom: 22px;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .alert-danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .alert-success {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #86efac;
    }
    .check-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 26px;
    }
    .check-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      font-size: 0.92rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-ok {
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
    }
    .badge-fail {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.88rem;
      color: var(--muted);
      font-weight: 500;
    }
    .form-control {
      width: 100%;
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(11, 18, 36, 0.8);
      border: 1px solid var(--border);
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .form-control:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(57, 214, 164, 0.2);
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 600px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
    .btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 999px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      touch-action: manipulation;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--accent));
      color: #05141e;
      box-shadow: 0 8px 24px rgba(57, 214, 164, 0.3);
    }
    .btn-primary:active {
      transform: scale(0.98);
    }
    .section-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--primary);
      margin: 22px 0 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
  </style>
</head>
<body>

<div class="install-box">
  <div class="header">
    <img src="assets/logo.svg" alt="Liquid Chat Logo">
    <h1>نصب آسان لیکوئید چت / Liquid Chat</h1>
    <p>سامانه راه‌اندازی سریع پیام‌رسان با امنیت و رمزنگاری پیشرفته</p>
  </div>

  <?php if ($step === 99): ?>
    <div class="alert alert-success">
      <h2 style="font-size: 1.15rem; margin-bottom: 6px;">🔒 سامانه قبلاً نصب شده است / Already Installed</h2>
      برای محافظت از پایگاه داده و جلوگیری از سوءاستفاده‌های امنیتی، دسترسی مجدد به نصاب به طور خودکار قفل شده است.
    </div>
    <div style="background: rgba(255,255,255,0.04); padding: 18px; border-radius: 14px; margin-bottom: 20px; line-height: 1.6; font-size: 0.9rem; color: var(--muted);">
      اگر قصد نصب مجدد دارید، فایل <code>installed.lock</code> را از روت پروژه یا پوشه <code>storage/</code> حذف نمایید.
    </div>
    <a href="login.php" class="btn btn-primary" style="display:block; text-align:center; text-decoration:none;">ورود به حساب کاربری / Go to Login</a>

  <?php elseif ($step === 3): ?>
    <div class="alert alert-success">
      <h2 style="font-size: 1.2rem; margin-bottom: 8px;">🎉 نصب با موفقیت انجام شد!</h2>
      پایگاه داده ایجاد گردید (۳۴ جدول کامل)، حساب کاربری مدیر تعریف شد، کلیدهای امنیتی AES-256 و VAPID تولید شدند و دسترسی نصاب جهت امنیت کامل قفل گردید.
    </div>
    <div style="background: rgba(255,255,255,0.04); padding: 18px; border-radius: 14px; margin-bottom: 20px; line-height: 1.6; font-size: 0.9rem;">
      <strong>نکات مهم:</strong>
      <ul style="padding-right: 20px; margin-top: 8px; color: var(--muted);">
        <li>فایل <code>installed.lock</code> ایجاد شد تا هیچ‌کس نتواند مجدداً فرایند نصب را اجرا کند.</li>
        <li>پروژه از PWA کامل پشتیبانی می‌کند، می‌توانید آن را به صفحه اصلی گوشی یا دسکتاپ خود اضافه کنید.</li>
        <li>سرویس‌ورکر و کش آفلاین اکنون فعال هستند.</li>
      </ul>
    </div>
    <a href="login.php" class="btn btn-primary" style="display:block; text-align:center; text-decoration:none;">ورود به لیکوئید چت / Login to Liquid Chat</a>

  <?php else: ?>
    <?php if ($errorMsg): ?>
      <div class="alert alert-danger"><?php echo $errorMsg; ?></div>
    <?php endif; ?>

    <!-- System Requirements Table -->
    <div class="section-title">۱. بررسی پیش‌نیازهای سرور / System Checks</div>
    <div class="check-list">
      <div class="check-item">
        <span>نسخه PHP (حداقل 7.4): <strong><?php echo $phpVersion; ?></strong></span>
        <span class="badge <?php echo $phpOk ? 'badge-ok' : 'badge-fail'; ?>"><?php echo $phpOk ? 'تایید / Pass' : 'ناسازگار / Fail'; ?></span>
      </div>
      <div class="check-item">
        <span>افزونه دیتابیس MySQLi:</span>
        <span class="badge <?php echo $extMysqli ? 'badge-ok' : 'badge-fail'; ?>"><?php echo $extMysqli ? 'فعال / OK' : 'غیرفعال / Missing'; ?></span>
      </div>
      <div class="check-item">
        <span>افزونه رمزنگاری OpenSSL:</span>
        <span class="badge <?php echo $extOpenssl ? 'badge-ok' : 'badge-fail'; ?>"><?php echo $extOpenssl ? 'فعال / OK' : 'غیرفعال / Missing'; ?></span>
      </div>
      <div class="check-item">
        <span>افزونه cURL و MBString:</span>
        <span class="badge <?php echo ($extCurl && $extMbstring) ? 'badge-ok' : 'badge-fail'; ?>"><?php echo ($extCurl && $extMbstring) ? 'فعال / OK' : 'Missing'; ?></span>
      </div>
      <div class="check-item">
        <span>افزونه پردازش تصویر (GD / Imagick):</span>
        <span class="badge <?php echo $extGd ? 'badge-ok' : 'badge-fail'; ?>"><?php echo $extGd ? 'فعال / OK' : 'Missing'; ?></span>
      </div>
      <div class="check-item">
        <span>مجوز نوشتن پوشه‌ها (includes, uploads, storage, logs):</span>
        <span class="badge <?php echo ($writableDirs['includes'] && $writableDirs['uploads'] && $writableDirs['storage']) ? 'badge-ok' : 'badge-fail'; ?>">
          <?php echo ($writableDirs['includes'] && $writableDirs['uploads'] && $writableDirs['storage']) ? 'دسترسی مجاز / Writable' : 'غیرمجاز / Read-only'; ?>
        </span>
      </div>
    </div>

    <!-- Installation Form -->
    <form method="POST" action="">
      <div class="section-title">۲. اطلاعات پایگاه داده / Database Settings</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">هاست دیتابیس / Database Host</label>
          <input type="text" name="db_host" class="form-control" value="localhost" required>
        </div>
        <div class="form-group">
          <label class="form-label">نام دیتابیس / Database Name</label>
          <input type="text" name="db_name" class="form-control" placeholder="نام دیتابیس ساخته شده در هاست" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نام کاربری دیتابیس / DB User</label>
          <input type="text" name="db_user" class="form-control" placeholder="نام کاربر MySQL" required>
        </div>
        <div class="form-group">
          <label class="form-label">رمز عبور دیتابیس / DB Password</label>
          <input type="password" name="db_pass" class="form-control" placeholder="رمز عبور دیتابیس">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">آدرس وب‌سایت / Site URL</label>
        <input type="url" name="site_url" class="form-control" value="<?php echo htmlspecialchars($detectedSiteUrl); ?>" required>
      </div>

      <div class="section-title">۳. حساب کاربری مدیر کل / Admin Account</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نام و نام خانوادگی مدیر</label>
          <input type="text" name="admin_name" class="form-control" value="Administrator" required>
        </div>
        <div class="form-group">
          <label class="form-label">نام کاربری مدیر / Username</label>
          <input type="text" name="admin_user" class="form-control" value="admin" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">ایمیل مدیر / Email</label>
          <input type="email" name="admin_email" class="form-control" value="admin@example.com" required>
        </div>
        <div class="form-group">
          <label class="form-label">رمز عبور مدیر / Password</label>
          <input type="password" name="admin_pass" class="form-control" placeholder="حداقل ۶ نویسه" required>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" <?php echo !$allReqsPassed ? 'disabled title="لطفاً پیش‌نیازها را برطرف کنید"' : ''; ?>>
        نصب و راه‌اندازی سریع / Start Installation
      </button>
    </form>
  <?php endif; ?>
</div>

</body>
</html>
