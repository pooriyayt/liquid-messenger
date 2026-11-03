<?php
require_once 'config.php';
require_once 'functions.php';

/**
 * User Authentication Class
 */
class Auth {
    /**
     * Register a new user
     *
     * @param string $email User email
     * @param string $username User username
     * @param string $password User password
     * @param string $fullName User full name
     * @param mysqli $conn Database connection
     * @return array Result array with success status and message/user_id
     */
    public static function register($email, $username, $password, $fullName, $conn) {
        // Validate input
        if (empty($email) || empty($username) || empty($password) || empty($fullName)) {
            return ['success' => false, 'message' => 'All fields are required'];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => 'Invalid email format'];
        }

        if (strlen($password) < 8) {
            return ['success' => false, 'message' => 'Password must be at least 8 characters'];
        }

        // Check if email or username already exists
        $stmt = $conn->prepare("SELECT * FROM users WHERE email = ? OR username = ?");
        $stmt->bind_param("ss", $email, $username);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            $user = $result->fetch_assoc();
            if ($user['email'] === $email) {
                return ['success' => false, 'message' => 'Email already exists'];
            }
            if ($user['username'] === $username) {
                return ['success' => false, 'message' => 'Username already exists'];
            }
        }

        // Hash the password
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        // Insert the user
        $encryptedName = encryptProfileField($fullName);
        $stmt = $conn->prepare("INSERT INTO users (email, username, password, full_name) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("ssss", $email, $username, $hashedPassword, $encryptedName);

        if ($stmt->execute()) {
            $userId = $stmt->insert_id;
            return ['success' => true, 'user_id' => $userId];
        } else {
            return ['success' => false, 'message' => 'Registration failed: ' . $conn->error];
        }
    }

    /**
     * Authenticate a user
     *
     * @param string $username Username or email
     * @param string $password Password
     * @param mysqli $conn Database connection
     * @return array Result array with success status and message/user data
     */
    public static function login($username, $password, $conn) {
        // Validate input
        if (empty($username) || empty($password)) {
            return ['success' => false, 'message' => 'All fields are required'];
        }

        // Check if username is email or username
        $isEmail = filter_var($username, FILTER_VALIDATE_EMAIL);
        if ($isEmail) {
            $stmt = $conn->prepare("SELECT * FROM users WHERE email = ?");
        } else {
            $stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
        }

        if (!$stmt) {
            $checkTable = $conn->query("SHOW TABLES LIKE 'users'");
            if (!$checkTable || $checkTable->num_rows === 0) {
                if (file_exists(dirname(__DIR__) . '/install.php')) {
                    @unlink(dirname(__DIR__) . '/installed.lock');
                    @unlink(dirname(__DIR__) . '/storage/installed.lock');
                    header('Location: install.php');
                    exit;
                }
            }
            return ['success' => false, 'message' => 'خطای دیتابیس یا عدم وجود جدول کاربران: ' . ($conn ? $conn->error : 'No DB')];
        }

        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows === 0) {
            return ['success' => false, 'message' => 'User not found'];
        }

        $user = $result->fetch_assoc();

        // Verify password
        if (password_verify($password, $user['password'])) {
            $user = normalizeProfileRow($user);
            // Update user status to online
            self::updateUserStatus($user['user_id'], 'online', $conn);

            // Start the session if not already started
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            session_regenerate_id(true);

            // Store user data in session
            $_SESSION['user_id'] = $user['user_id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['full_name'] = $user['full_name'];
            registerUserDevice($user['user_id'], $conn);
            lc_register_user_session($user['user_id'], $conn);

            return ['success' => true, 'user' => $user];
        } else {
            return ['success' => false, 'message' => 'Invalid password'];
        }
    }

    /**
     * Logout the current user
     *
     * @param mysqli $conn Database connection
     * @return void
     */
    public static function logout($conn) {
        // Update user status to offline
        if (isset($_SESSION['user_id'])) {
            self::updateUserStatus($_SESSION['user_id'], 'offline', $conn);
            $token = lc_get_session_cookie();
            if ($token) {
                lc_revoke_session_by_token($token, $conn, $_SESSION['user_id']);
            }
        }
        lc_clear_auth_cookies();
        lc_destroy_local_session();
    }

    /**
     * Check if user is logged in
     *
     * @return bool True if logged in, false otherwise
     */
    public static function isLoggedIn() {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (!isset($_SESSION['user_id'])) {
            return false;
        }
        global $conn;
        if ($conn && $conn instanceof mysqli) {
            if (!lc_validate_user_session((int) $_SESSION['user_id'], $conn)) {
                lc_clear_auth_cookies();
                lc_destroy_local_session();
                return false;
            }
        }
        return true;
    }

    /**
     * Get current user data
     *
     * @return array|null User data or null if not logged in
     */
    public static function getCurrentUser() {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (!isset($_SESSION['user_id'])) {
            return null;
        }
        
        global $conn;
        if ($conn && $conn instanceof mysqli) {
            if (!lc_validate_user_session((int) $_SESSION['user_id'], $conn)) {
                lc_clear_auth_cookies();
                lc_destroy_local_session();
                return null;
            }
        }
        
        try {
            $stmt = $conn->prepare("SELECT * FROM users WHERE user_id = ?");
            $stmt->bind_param("i", $_SESSION['user_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows === 1) {
                $user = $result->fetch_assoc();
                $user = normalizeProfileRow($user);
                
                // Ensure profile_pic has the correct path
                if (empty($user['profile_pic'])) {
                    $user['profile_pic'] = 'default.png';
                }
                
                $deviceId = getDeviceIdFromCookie();
                if ($deviceId && isDeviceRevoked($user['user_id'], $deviceId, $conn)) {
                    $token = lc_get_session_cookie();
                    if ($token) {
                        lc_revoke_session_by_token($token, $conn, $user['user_id']);
                    }
                    lc_clear_auth_cookies();
                    lc_destroy_local_session();
                    return null;
                }
                if ($deviceId) {
                    touchUserDevice($user['user_id'], $deviceId, $conn);
                } else {
                    registerUserDevice($user['user_id'], $conn);
                }
                return $user;
            }
            
            return null;
        } catch (Exception $e) {
            error_log("Error getting current user: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Update user's online status
     *
     * @param int $userId User ID
     * @param string $status Status ('online', 'offline', 'away')
     * @param mysqli $conn Database connection
     * @return bool True if successful, false otherwise
     */
    public static function updateUserStatus($userId, $status, $conn) {
        $stmt = $conn->prepare("UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE user_id = ?");
        $stmt->bind_param("si", $status, $userId);
        return $stmt->execute();
    }

    /**
     * Update user profile
     *
     * @param int $userId User ID
     * @param array $data Profile data (full_name, bio)
     * @param mysqli $conn Database connection
     * @return array Result array with success status and message
     */
    public static function updateProfile($userId, $data, $conn) {
        $bioSource = isset($data['bio_raw']) ? (string) $data['bio_raw'] : (string) ($data['bio'] ?? '');
        $bioDecoded = html_entity_decode($bioSource, ENT_QUOTES, 'UTF-8');
        $bioLength = function_exists('mb_strlen') ? mb_strlen($bioDecoded, 'UTF-8') : strlen($bioDecoded);
        if ($bioLength > 140) {
            return [
                'success' => false,
                'message' => 'Bio must be 140 characters or less.',
                'status' => 422,
                'error' => 'Bio must be 140 characters or less.'
            ];
        }
        $fullName = encryptProfileField($data['full_name'] ?? '');
        $bio = encryptProfileField($data['bio'] ?? '');
        $stmt = $conn->prepare("UPDATE users SET full_name = ?, bio = ? WHERE user_id = ?");
        $stmt->bind_param("ssi", $fullName, $bio, $userId);

        if ($stmt->execute()) {
            return ['success' => true, 'message' => 'Profile updated successfully'];
        } else {
            return ['success' => false, 'message' => 'Failed to update profile: ' . $conn->error];
        }
    }

    /**
     * Update user username
     *
     * @param int $userId User ID
     * @param string $newUsername New username handle
     * @param mysqli $conn Database connection
     * @return array Result array with success status and message
     */
    public static function updateUsername($userId, $newUsername, $conn) {
        $userId = (int) $userId;
        $newUsername = trim(ltrim((string)$newUsername, '@'));

        // Validation: 3-32 characters, alphanumeric and underscore only
        if (!preg_match('/^[a-zA-Z0-9_]{3,32}$/', $newUsername)) {
            return [
                'success' => false,
                'status' => 422,
                'message' => 'Username must be 3 to 32 characters (letters, numbers, underscores only).'
            ];
        }

        // Check current username
        $stmtCurrent = $conn->prepare("SELECT username FROM users WHERE user_id = ?");
        $stmtCurrent->bind_param("i", $userId);
        $stmtCurrent->execute();
        $currRes = $stmtCurrent->get_result()->fetch_assoc();
        if ($currRes && strcasecmp($currRes['username'], $newUsername) === 0) {
            return [
                'success' => true,
                'status' => 200,
                'message' => 'Username unchanged',
                'username' => $newUsername
            ];
        }

        // Check if username taken by another user
        $stmtCheck = $conn->prepare("SELECT user_id FROM users WHERE LOWER(username) = LOWER(?) AND user_id != ? LIMIT 1");
        $stmtCheck->bind_param("si", $newUsername, $userId);
        $stmtCheck->execute();
        $exists = $stmtCheck->get_result()->fetch_assoc();
        if ($exists) {
            return [
                'success' => false,
                'status' => 409,
                'message' => 'This username is already taken by another user.'
            ];
        }

        // Update username in database
        $stmtUpdate = $conn->prepare("UPDATE users SET username = ? WHERE user_id = ?");
        $stmtUpdate->bind_param("si", $newUsername, $userId);
        if ($stmtUpdate->execute()) {
            $_SESSION['username'] = $newUsername;
            if (isset($_SESSION['user']) && is_array($_SESSION['user'])) {
                $_SESSION['user']['username'] = $newUsername;
            }
            return [
                'success' => true,
                'status' => 200,
                'message' => 'Username updated successfully',
                'username' => $newUsername
            ];
        } else {
            return [
                'success' => false,
                'status' => 500,
                'message' => 'Failed to update username: ' . $conn->error
            ];
        }
    }

    /**
     * Update user profile picture
     *
     * @param int $userId User ID
     * @param string $imagePath Path to the image
     * @param mysqli $conn Database connection
     * @return array Result array with success status and message
     */
    public static function updateProfilePic($userId, $imagePath, $conn) {
        $encryptedPath = encryptProfileField($imagePath);
        $stmt = $conn->prepare("UPDATE users SET profile_pic = ? WHERE user_id = ?");
        $stmt->bind_param("si", $encryptedPath, $userId);

        if ($stmt->execute()) {
            return ['success' => true, 'message' => 'Profile picture updated successfully'];
        } else {
            return ['success' => false, 'message' => 'Failed to update profile picture: ' . $conn->error];
        }
    }
}
