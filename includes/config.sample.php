<?php
/**
 * Liquid Chat - Application Configuration Template
 * Rename this file to config.php or run install.php in your browser.
 */

// Check if system is installed. If not, redirect to installer immediately
$isInstalled = file_exists(dirname(__DIR__) . '/installed.lock') || file_exists(dirname(__DIR__) . '/storage/installed.lock');
if (!$isInstalled && file_exists(dirname(__DIR__) . '/install.php')) {
    $currentScript = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if ($currentScript !== 'install.php') {
        header('Location: install.php');
        exit;
    }
}

define('CSP_REPORT_ONLY', true);
require_once __DIR__ . '/security_headers.php';

// Database credentials
define('DB_HOST', 'localhost');
define('DB_USERNAME', 'liquid_user');
define('DB_PASSWORD', 'your_secure_database_password_here');
define('DB_NAME', 'liquid_chat');

// Establish Connection with exception suppression to prevent HTTP 500 crashes
mysqli_report(MYSQLI_REPORT_OFF);

try {
    $conn = @new mysqli(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME);
} catch (Throwable $e) {
    $conn = null;
}

// Check Connection
if (!$conn || $conn->connect_error) {
    if (file_exists(dirname(__DIR__) . '/install.php') && !file_exists(dirname(__DIR__) . '/installed.lock')) {
        header('Location: install.php');
        exit;
    }
    die("Database connection failed. Please check includes/config.php or run install.php.");
}
$conn->set_charset("utf8mb4");

// Application settings
define('SITE_URL', 'https://chat.example.com');
define('APP_DEBUG', false);
define('MAX_UPLOAD_BYTES', 100 * 1024 * 1024);
define('UPLOAD_DIR', dirname(__DIR__) . '/uploads/');
define('IMAGE_UPLOAD_DIR', UPLOAD_DIR . 'images/');
define('VOICE_UPLOAD_DIR', UPLOAD_DIR . 'voice/');
define('FILE_UPLOAD_DIR', UPLOAD_DIR . 'files/');

// Public URLs for uploads
define('UPLOAD_URL', 'uploads/');
define('IMAGE_UPLOAD_URL', UPLOAD_URL . 'images/');
define('VOICE_UPLOAD_URL', UPLOAD_URL . 'voice/');
define('FILE_UPLOAD_URL', UPLOAD_URL . 'files/');

// Server-side encryption key (32 bytes base64). Generate with: openssl rand -base64 32
define('APP_ENC_KEY', 'CHANGE_THIS_TO_A_RANDOM_BASE64_32_BYTES_KEY=');

// Set timezone
date_default_timezone_set('UTC');

// Session configuration
$cookieSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
$cookieParams = session_get_cookie_params();
$cookieParams['secure'] = $cookieSecure;
$cookieParams['httponly'] = true;
$cookieParams['samesite'] = 'Lax';
session_set_cookie_params($cookieParams);
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_secure', $cookieSecure ? '1' : '0');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Create upload directories if they don't exist
$uploadDirs = [UPLOAD_DIR, IMAGE_UPLOAD_DIR, VOICE_UPLOAD_DIR, FILE_UPLOAD_DIR];
foreach ($uploadDirs as $dir) {
    if (!file_exists($dir)) {
        @mkdir($dir, 0755, true);
    }
}
