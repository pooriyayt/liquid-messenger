<?php
require_once 'config.php';
require_once 'encryption.php';

/**
 * Sanitize input to prevent XSS attacks
 *
 * @param string $input Input to sanitize
 * @return string Sanitized input
 */
function sanitize($input) {
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

/**
 * Trim string to a maximum number of characters.
 *
 * @param string|null $value
 * @param int $maxChars
 * @return string|null
 */
function lc_trim_text($value, $maxChars) {
    if ($value === null) {
        return null;
    }
    $text = (string) $value;
    if ($maxChars <= 0) {
        return '';
    }
    if (function_exists('mb_strlen')) {
        if (mb_strlen($text, 'UTF-8') <= $maxChars) {
            return $text;
        }
        return mb_substr($text, 0, $maxChars, 'UTF-8');
    }
    if (strlen($text) <= $maxChars) {
        return $text;
    }
    return substr($text, 0, $maxChars);
}

/**
 * Encrypt profile fields for storage.
 *
 * @param string|null $value
 * @return string|null
 */
function encryptProfileField($value) {
    if ($value === null) {
        return null;
    }
    if (!is_string($value)) {
        return $value;
    }
    if (strpos($value, 'v1:') === 0) {
        return $value;
    }
    return Encryption::wrapForStorage($value);
}

/**
 * Decrypt profile fields from storage.
 *
 * @param string|null $value
 * @return string|null
 */
function decryptProfileField($value) {
    if ($value === null) {
        return null;
    }
    if (!is_string($value)) {
        return $value;
    }
    return Encryption::unwrapFromStorage($value);
}

/**
 * Normalize profile fields in a user row.
 *
 * @param array $row
 * @return array
 */
function normalizeProfileRow($row) {
    if (!is_array($row)) {
        return $row;
    }
    if (array_key_exists('full_name', $row)) {
        $row['full_name'] = decryptProfileField($row['full_name']);
    }
    if (array_key_exists('bio', $row)) {
        $bio = decryptProfileField($row['bio']);
        if ($bio !== null && $bio !== '') {
            $bioDecoded = html_entity_decode((string) $bio, ENT_QUOTES, 'UTF-8');
            $bioTrimmed = lc_trim_text($bioDecoded, 140);
            $row['bio'] = htmlspecialchars($bioTrimmed, ENT_QUOTES, 'UTF-8');
        } else {
            $row['bio'] = $bio;
        }
    }
    if (array_key_exists('profile_pic', $row)) {
        $row['profile_pic'] = decryptProfileField($row['profile_pic']);
    }
    return $row;
}

/**
 * Redirect to another page
 *
 * @param string $url URL to redirect to
 * @return void
 */
function redirect($url) {
    header("Location: $url");
    exit();
}

/**
 * Check if the request is AJAX
 *
 * @return bool True if the request is AJAX
 */
function isAjax() {
    return !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && 
        strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
}

/**
 * Return a JSON response
 *
 * @param array $data Data to encode as JSON
 * @param int $statusCode HTTP status code (default 200)
 * @return void
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit();
}

/**
 * Parse a php.ini size value into bytes.
 *
 * @param string|int $value
 * @return int
 */
function lc_parse_size($value) {
    if (is_int($value) || is_float($value)) {
        return (int) $value;
    }
    if (!is_string($value)) {
        return 0;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return 0;
    }
    $unit = strtolower(substr($trimmed, -1));
    $number = (float) $trimmed;
    switch ($unit) {
        case 'g':
            return (int) ($number * 1024 * 1024 * 1024);
        case 'm':
            return (int) ($number * 1024 * 1024);
        case 'k':
            return (int) ($number * 1024);
        default:
            return (int) $number;
    }
}

/**
 * Determine the effective php.ini upload limit.
 *
 * @return int
 */
function lc_get_ini_upload_limit() {
    $uploadMax = lc_parse_size(ini_get('upload_max_filesize'));
    $postMax = lc_parse_size(ini_get('post_max_size'));
    if ($uploadMax <= 0 && $postMax <= 0) {
        return 0;
    }
    if ($uploadMax <= 0) {
        return $postMax;
    }
    if ($postMax <= 0) {
        return $uploadMax;
    }
    return min($uploadMax, $postMax);
}

/**
 * Build a consistent upload size label.
 *
 * @param int|null $maxBytes
 * @return string
 */
function lc_get_upload_limit_label($maxBytes = null) {
    $limit = $maxBytes;
    if (!$limit) {
        $limit = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);
    }
    $mb = (int) round($limit / (1024 * 1024));
    return "Max upload size is {$mb} MB";
}

/**
 * Build a user-facing upload error message with server limits.
 *
 * @param int|null $maxBytes
 * @return string
 */
function lc_get_upload_limit_error($maxBytes = null) {
    $label = lc_get_upload_limit_label($maxBytes);
    $iniLimit = lc_get_ini_upload_limit();
    $limit = $maxBytes ?: (defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024));
    if ($iniLimit > 0 && $iniLimit < $limit) {
        $serverMb = (int) floor($iniLimit / (1024 * 1024));
        return "Server upload limit is {$serverMb} MB. {$label}.";
    }
    return $label;
}

/**
 * Check if the request body exceeds effective upload limits.
 *
 * @param int|null $maxBytes
 * @return bool
 */
function lc_upload_request_too_large($maxBytes = null) {
    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($contentLength <= 0) {
        return false;
    }
    $limit = $maxBytes ?: (defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024));
    $iniLimit = lc_get_ini_upload_limit();
    if ($iniLimit > 0 && $iniLimit < $limit) {
        $limit = $iniLimit;
    }
    return $contentLength > $limit;
}

/**
 * Check if a file upload error indicates size limits.
 *
 * @param int $errorCode
 * @return bool
 */
function lc_is_upload_error_too_large($errorCode) {
    return $errorCode === UPLOAD_ERR_INI_SIZE || $errorCode === UPLOAD_ERR_FORM_SIZE;
}

/**
 * Generate a random string
 *
 * @param int $length Length of the random string
 * @return string Random string
 */
function generateRandomString($length = 10) {
    $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $randomString = '';
    
    for ($i = 0; $i < $length; $i++) {
        $randomString .= $characters[rand(0, strlen($characters) - 1)];
    }
    
    return $randomString;
}

/**
 * Format a date to a human-readable string
 *
 * @param string $date Date string
 * @return string Formatted date
 */
function formatDate($date) {
    $timestamp = strtotime($date);
    $now = time();
    $diff = $now - $timestamp;
    
    if ($diff < 60) {
        return 'Just now';
    } elseif ($diff < 3600) {
        $minutes = floor($diff / 60);
        return $minutes . ' min' . ($minutes > 1 ? 's' : '') . ' ago';
    } elseif ($diff < 86400) {
        $hours = floor($diff / 3600);
        return $hours . ' hour' . ($hours > 1 ? 's' : '') . ' ago';
    } elseif ($diff < 604800) {
        $days = floor($diff / 86400);
        return $days . ' day' . ($days > 1 ? 's' : '') . ' ago';
    } else {
        return date('M j, Y', $timestamp);
    }
}

/**
 * Get a user by ID, username, or email
 *
 * @param mixed $identifier User ID, username, or email
 * @param mysqli $conn Database connection
 * @return array|null User data or null if not found
 */
function getUser($identifier, $conn) {
    $sql = '';
    $param = '';
    
    if (is_numeric($identifier)) {
        // ID
        $sql = "SELECT * FROM users WHERE user_id = ?";
        $param = $identifier;
    } elseif (filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
        // Email
        $sql = "SELECT * FROM users WHERE email = ?";
        $param = $identifier;
    } else {
        // Username
        $sql = "SELECT * FROM users WHERE username = ?";
        $param = $identifier;
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $param);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        return normalizeProfileRow($row);
    }
    
    return null;
}

/**
 * Search for users by username or full name
 *
 * @param string $searchTerm Search term
 * @param int $currentUserId Current user ID to exclude from results
 * @param mysqli $conn Database connection
 * @return array Array of matching users
 */
function searchUsers($searchTerm, $currentUserId, $conn) {
    $term = trim($searchTerm);
    if ($term === '') {
        return [];
    }
    $cleanTerm = ltrim($term, '@');
    $like = "%$term%";
    $cleanLike = "%$cleanTerm%";
    $users = [];
    $seen = [];

    $stmt = $conn->prepare(
        "SELECT user_id, username, full_name, profile_pic, status, email
         FROM users
         WHERE (username LIKE ? OR username LIKE ? OR full_name LIKE ? OR full_name LIKE ? OR email LIKE ?) AND user_id != ?
         LIMIT 25"
    );
    if ($stmt) {
        $stmt->bind_param("sssssi", $like, $cleanLike, $like, $cleanLike, $like, $currentUserId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            unset($row['email']);
            $users[] = $row;
            $seen[(int) $row['user_id']] = true;
        }
        $stmt->close();
    }

    if (count($users) >= 20) {
        return $users;
    }

    $stmt = $conn->prepare(
        "SELECT user_id, username, full_name, profile_pic, status, email
         FROM users
         WHERE user_id != ?
         LIMIT 200"
    );
    $stmt->bind_param("i", $currentUserId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $userId = (int) $row['user_id'];
        if (isset($seen[$userId])) {
            continue;
        }
        $row = normalizeProfileRow($row);
        $haystack = strtolower(($row['full_name'] ?? '') . ' ' . ($row['username'] ?? '') . ' ' . ($row['email'] ?? ''));
        if (strpos($haystack, strtolower($term)) !== false || ($cleanTerm !== '' && strpos($haystack, strtolower($cleanTerm)) !== false)) {
            unset($row['email']);
            $users[] = $row;
            $seen[$userId] = true;
            if (count($users) >= 20) {
                break;
            }
        }
    }

    return $users;
}

/**
 * Check if user has unread messages
 *
 * @param int $userId User ID
 * @param mysqli $conn Database connection
 * @return int Number of unread messages
 */
function getUnreadMessageCount($userId, $conn) {
    $stmt = $conn->prepare(
        "SELECT COUNT(*) as count 
         FROM messages 
         WHERE receiver_id = ? AND is_read = 0 AND is_deleted = 0"
    );
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    return $row['count'];
}

/**
 * Get user's contacts
 *
 * @param int $userId User ID
 * @param mysqli $conn Database connection
 * @return array Array of contacts
 */
function ensureContactsSchema($conn) {
    static $ensured = false;
    if ($ensured) return;
    $ensured = true;

    $conn->query("
        CREATE TABLE IF NOT EXISTS `contacts` (
          `contact_id` int(11) NOT NULL AUTO_INCREMENT,
          `user_id` int(11) NOT NULL,
          `contact_user_id` int(11) NOT NULL,
          `custom_name` varchar(100) DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`contact_id`),
          UNIQUE KEY `uniq_contact` (`user_id`, `contact_user_id`),
          KEY `idx_contact_user` (`contact_user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $colCheck = $conn->query("SHOW COLUMNS FROM `contacts` LIKE 'custom_name'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $conn->query("ALTER TABLE `contacts` ADD COLUMN `custom_name` VARCHAR(100) DEFAULT NULL AFTER `contact_user_id`");
    }
}

function getUserContacts($userId, $conn) {
    ensureContactsSchema($conn);
    $stmt = $conn->prepare(
        "SELECT u.user_id, u.username, u.full_name, u.profile_pic, u.status, u.last_seen,
                c.custom_name,
                COALESCE(NULLIF(c.custom_name, ''), NULLIF(u.full_name, ''), u.username) as display_name
         FROM contacts c
         JOIN users u ON c.contact_user_id = u.user_id
         WHERE c.user_id = ?
         ORDER BY COALESCE(NULLIF(c.custom_name, ''), NULLIF(u.full_name, ''), u.username)"
    );
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $contacts = [];
    while ($row = $result->fetch_assoc()) {
        $contacts[] = normalizeProfileRow($row);
    }
    
    return $contacts;
}

/**
 * Add a user to contacts
 *
 * @param int $userId User ID
 * @param int $contactId Contact user ID
 * @param mysqli $conn Database connection
 * @param string|null $customName Optional nickname
 * @return bool True if successful
 */
function addContact($userId, $contactId, $conn, $customName = null) {
    ensureContactsSchema($conn);
    $customName = $customName !== null ? trim((string)$customName) : null;
    if ($customName === '') $customName = null;

    $stmt = $conn->prepare(
        "INSERT INTO contacts (user_id, contact_user_id, custom_name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE custom_name = COALESCE(VALUES(custom_name), custom_name)"
    );
    $stmt->bind_param("iis", $userId, $contactId, $customName);
    return $stmt->execute();
}

/**
 * Save custom nickname for a contact
 *
 * @param int $userId User ID
 * @param int $contactId Contact user ID
 * @param string|null $nickname Nickname
 * @param mysqli $conn Database connection
 * @return bool True if successful
 */
function saveContactNickname($userId, $contactId, $nickname, $conn) {
    ensureContactsSchema($conn);
    $nickname = $nickname !== null ? trim((string)$nickname) : null;
    if ($nickname === '') $nickname = null;

    $stmt = $conn->prepare(
        "INSERT INTO contacts (user_id, contact_user_id, custom_name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE custom_name = VALUES(custom_name)"
    );
    $stmt->bind_param("iis", $userId, $contactId, $nickname);
    return $stmt->execute();
}

/**
 * Remove a contact
 *
 * @param int $userId User ID
 * @param int $contactId Contact user ID
 * @param mysqli $conn Database connection
 * @return bool True if successful
 */
function deleteContact($userId, $contactId, $conn) {
    ensureContactsSchema($conn);
    $stmt = $conn->prepare("DELETE FROM contacts WHERE user_id = ? AND contact_user_id = ?");
    $stmt->bind_param("ii", $userId, $contactId);
    return $stmt->execute();
}

/**
 * Format file size for display
 *
 * @param int $bytes File size in bytes
 * @return string Formatted file size
 */
function formatFileSize($bytes) {
    if ($bytes >= 1073741824) {
        return number_format($bytes / 1073741824, 2) . ' GB';
    } elseif ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 2) . ' MB';
    } elseif ($bytes >= 1024) {
        return number_format($bytes / 1024, 2) . ' KB';
    } else {
        return $bytes . ' bytes';
    }
}

/**
 * Insert a message into the database
 * 
 * @param array $data Message data
 * @param mysqli $conn Database connection
 * @return int|bool Message ID on success, false on failure
 */
function insertMessage($data, $conn) {
    try {
        $sql = "INSERT INTO messages (sender_id, receiver_id, group_id, channel_id, message_type, message_text, file_url, reply_to_id, encrypted_content, key_sender, key_recipient) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $stmt = $conn->prepare($sql);
        
        // Determine receiver_id and group_id
        $receiverId = isset($data['receiver_id']) ? $data['receiver_id'] : null;
        $groupId = isset($data['group_id']) ? $data['group_id'] : null;
        $channelId = isset($data['channel_id']) ? $data['channel_id'] : null;
        $replyToId = isset($data['reply_to_id']) ? $data['reply_to_id'] : null;
        $rawText = $data['message_text'] ?? ($data['text'] ?? ($data['encrypted_content'] ?? ''));
        $encryptedContent = Encryption::encryptMessage($rawText);
        $keySender = $data['key_sender'] ?? null;
        $keyRecipient = $data['key_recipient'] ?? null;
        
        $stmt->bind_param("iiiisssisss", 
            $data['sender_id'], 
            $receiverId, 
            $groupId, 
            $channelId,
            $data['message_type'], 
            $data['message_text'], 
            $data['file_url'],
            $replyToId,
            $encryptedContent,
            $keySender,
            $keyRecipient
        );
        
        if ($stmt->execute()) {
            return $stmt->insert_id;
        }
        
        return false;
    } catch (Exception $e) {
        error_log("Error inserting message: " . $e->getMessage());
        throw $e;
    }
}

function wrapCiphertext($payload) {
    return Encryption::wrapForStorage($payload);
}

function unwrapCiphertext($payload) {
    return Encryption::unwrapFromStorage($payload);
}

function getUserSettings($userId, $conn) {
    ensureUserSettingsSchema($conn);
    $stmt = $conn->prepare(
        "SELECT notify_enabled, notify_show_sender, notify_show_preview, notify_mode, key_sync_enabled,
                auto_download_images_wifi, auto_download_images_mobile,
                auto_download_videos_wifi, auto_download_videos_mobile,
                auto_download_video_limit, cache_limit_mb, cache_thumbnails_only, fast_reaction,
                last_seen_privacy, last_seen_selected
         FROM user_settings WHERE user_id = ?"
    );
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 1) {
        return $result->fetch_assoc();
    }
    return [
        'notify_enabled' => 1,
        'notify_show_sender' => 1,
        'notify_show_preview' => 1,
        'notify_mode' => 'all',
        'key_sync_enabled' => 0,
        'auto_download_images_wifi' => 1,
        'auto_download_images_mobile' => 1,
        'auto_download_videos_wifi' => 1,
        'auto_download_videos_mobile' => 0,
        'auto_download_video_limit' => 15,
        'auto_download_audio_wifi' => 1,
        'auto_download_audio_mobile' => 1,
        'cache_limit_mb' => 512,
        'cache_thumbnails_only' => 0,
        'fast_reaction' => "\u{1F44D}",
        'last_seen_privacy' => 'everyone',
        'last_seen_selected' => '[]'
    ];
}

function saveUserSettings($userId, $settings, $conn) {
    ensureUserSettingsSchema($conn);
    $stmt = $conn->prepare(
        "INSERT INTO user_settings (
            user_id, notify_enabled, notify_show_sender, notify_show_preview, notify_mode, key_sync_enabled,
            auto_download_images_wifi, auto_download_images_mobile,
            auto_download_videos_wifi, auto_download_videos_mobile,
            auto_download_video_limit, cache_limit_mb, cache_thumbnails_only, fast_reaction,
            last_seen_privacy, last_seen_selected
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            notify_enabled = VALUES(notify_enabled),
            notify_show_sender = VALUES(notify_show_sender),
            notify_show_preview = VALUES(notify_show_preview),
            notify_mode = VALUES(notify_mode),
            key_sync_enabled = VALUES(key_sync_enabled),
            auto_download_images_wifi = VALUES(auto_download_images_wifi),
            auto_download_images_mobile = VALUES(auto_download_images_mobile),
            auto_download_videos_wifi = VALUES(auto_download_videos_wifi),
            auto_download_videos_mobile = VALUES(auto_download_videos_mobile),
            auto_download_video_limit = VALUES(auto_download_video_limit),
            cache_limit_mb = VALUES(cache_limit_mb),
            cache_thumbnails_only = VALUES(cache_thumbnails_only),
            fast_reaction = VALUES(fast_reaction),
            last_seen_privacy = VALUES(last_seen_privacy),
            last_seen_selected = VALUES(last_seen_selected)"
    );
    $stmt->bind_param(
        "iiiisiiiiiiiisss",
        $userId,
        $settings['notify_enabled'],
        $settings['notify_show_sender'],
        $settings['notify_show_preview'],
        $settings['notify_mode'],
        $settings['key_sync_enabled'],
        $settings['auto_download_images_wifi'],
        $settings['auto_download_images_mobile'],
        $settings['auto_download_videos_wifi'],
        $settings['auto_download_videos_mobile'],
        $settings['auto_download_video_limit'],
        $settings['cache_limit_mb'],
        $settings['cache_thumbnails_only'],
        $settings['fast_reaction'],
        $settings['last_seen_privacy'],
        $settings['last_seen_selected']
    );
    return $stmt->execute();
}

function ensureUserSettingsSchema($conn) {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (!$conn || !($conn instanceof mysqli)) {
        return;
    }
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `user_settings` (
            `user_id` int(11) NOT NULL,
            `notify_enabled` tinyint(1) NOT NULL DEFAULT 1,
            `notify_show_sender` tinyint(1) NOT NULL DEFAULT 1,
            `notify_show_preview` tinyint(1) NOT NULL DEFAULT 1,
            `notify_mode` varchar(16) NOT NULL DEFAULT 'all',
            `key_sync_enabled` tinyint(1) NOT NULL DEFAULT 0,
            `auto_download_images_wifi` tinyint(1) NOT NULL DEFAULT 0,
            `auto_download_images_mobile` tinyint(1) NOT NULL DEFAULT 0,
            `auto_download_videos_wifi` tinyint(1) NOT NULL DEFAULT 0,
            `auto_download_videos_mobile` tinyint(1) NOT NULL DEFAULT 0,
            `auto_download_video_limit` int(11) NOT NULL DEFAULT 10,
            `cache_limit_mb` int(11) NOT NULL DEFAULT 512,
            `cache_thumbnails_only` tinyint(1) NOT NULL DEFAULT 0,
            `fast_reaction` varchar(8) DEFAULT NULL,
            `last_seen_privacy` varchar(16) NOT NULL DEFAULT 'everyone',
            `last_seen_selected` text,
            PRIMARY KEY (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $result = $conn->query("SHOW COLUMNS FROM user_settings");
    if (!$result) {
        return;
    }
    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[$row['Field']] = true;
    }
    if (!isset($columns['last_seen_privacy'])) {
        $conn->query("ALTER TABLE user_settings ADD COLUMN last_seen_privacy VARCHAR(16) NOT NULL DEFAULT 'everyone'");
    }
    if (!isset($columns['last_seen_selected'])) {
        $conn->query("ALTER TABLE user_settings ADD COLUMN last_seen_selected TEXT");
    }
    if (!isset($columns['notify_mode'])) {
        $conn->query("ALTER TABLE user_settings ADD COLUMN notify_mode VARCHAR(16) NOT NULL DEFAULT 'all'");
    }
}

function parseLastSeenSelected($value) {
    $list = [];
    if (is_array($value)) {
        $list = $value;
    } elseif (is_string($value) && $value !== '') {
        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            $list = $decoded;
        }
    }
    $selected = [];
    foreach ($list as $item) {
        $id = (int) $item;
        if ($id > 0) {
            $selected[$id] = true;
        }
    }
    return array_keys($selected);
}

function canViewLastSeen($viewerId, $targetUserId, $privacy, $selected, $isContact) {
    $viewerId = (int) $viewerId;
    $targetUserId = (int) $targetUserId;
    if (!$viewerId || !$targetUserId) {
        return false;
    }
    if ($viewerId === $targetUserId) {
        return true;
    }
    $privacy = $privacy ?: 'everyone';
    if (!in_array($privacy, ['everyone', 'nobody', 'contacts', 'selected'], true)) {
        $privacy = 'everyone';
    }
    if ($privacy === 'everyone') {
        return true;
    }
    if ($privacy === 'nobody') {
        return false;
    }
    if ($privacy === 'contacts') {
        return (bool) $isContact;
    }
    $selectedList = parseLastSeenSelected($selected);
    return in_array($viewerId, $selectedList, true);
}

function lc_is_https_request() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
}

function lc_set_cookie_value($name, $value, $expiresAt, $httpOnly = true) {
    $options = [
        'expires' => (int) $expiresAt,
        'path' => '/',
        'secure' => lc_is_https_request(),
        'httponly' => (bool) $httpOnly,
        'samesite' => 'Lax'
    ];
    setcookie($name, $value, $options);
    if ($value === '') {
        unset($_COOKIE[$name]);
        return;
    }
    $_COOKIE[$name] = $value;
}

function lc_clear_cookie_value($name, $httpOnly = true) {
    lc_set_cookie_value($name, '', time() - 3600, $httpOnly);
}

function lc_clear_php_session_cookie() {
    if (session_status() === PHP_SESSION_NONE) {
        return;
    }
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $params['path'] ?? '/',
        'domain' => $params['domain'] ?? '',
        'secure' => !empty($params['secure']),
        'httponly' => !empty($params['httponly']),
        'samesite' => $params['samesite'] ?? 'Lax'
    ]);
}

function lc_clear_auth_cookies() {
    lc_clear_cookie_value('lc_session', true);
    lc_clear_cookie_value('lc_device_token', true);
}

function lc_destroy_local_session() {
    if (session_status() === PHP_SESSION_NONE) {
        return;
    }
    $_SESSION = [];
    session_unset();
    lc_clear_php_session_cookie();
    session_destroy();
}

function ensureUserSessionSchema($conn) {
    static $checked = false;
    if ($checked) {
        return;
    }
    if (!$conn || !($conn instanceof mysqli)) {
        return;
    }
    $checked = true;
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `user_sessions` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `user_id` int(11) NOT NULL,
            `session_token_hash` char(64) NOT NULL,
            `device_token_hash` char(64) DEFAULT NULL,
            `php_session_id` varchar(128) DEFAULT NULL,
            `device_id` varchar(64) DEFAULT NULL,
            `device_name` varchar(80) DEFAULT NULL,
            `user_agent` varchar(255) DEFAULT NULL,
            `ip_address` varchar(64) DEFAULT NULL,
            `ip_hash` char(64) DEFAULT NULL,
            `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `last_active` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `revoked_at` datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `session_token_hash` (`session_token_hash`),
            KEY `user_id` (`user_id`),
            KEY `last_active` (`last_active`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $result = $conn->query("SHOW COLUMNS FROM user_sessions");
    if (!$result) {
        return;
    }
    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[$row['Field']] = true;
    }
    if (!isset($columns['device_token_hash'])) {
        $conn->query("ALTER TABLE user_sessions ADD COLUMN device_token_hash CHAR(64) DEFAULT NULL AFTER session_token_hash");
    }
    if (!isset($columns['php_session_id'])) {
        $conn->query("ALTER TABLE user_sessions ADD COLUMN php_session_id VARCHAR(128) DEFAULT NULL AFTER device_token_hash");
    }
}

function ensureConversationReadSchema($conn) {
    static $checked = false;
    if ($checked) {
        return;
    }
    if (!$conn || !($conn instanceof mysqli)) {
        return;
    }
    $checked = true;
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `conversation_reads` (
            `id` bigint(20) NOT NULL AUTO_INCREMENT,
            `user_id` int(11) NOT NULL,
            `chat_type` varchar(16) NOT NULL,
            `chat_id` int(11) NOT NULL,
            `last_seen_message_id` int(11) NOT NULL DEFAULT 0,
            `seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `conversation_read_unique` (`user_id`,`chat_type`,`chat_id`),
            KEY `conversation_read_chat` (`chat_type`,`chat_id`,`last_seen_message_id`),
            KEY `conversation_read_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function getDeviceIdFromCookie() {
    return $_COOKIE['lc_device_id'] ?? null;
}

function ensureDeviceIdCookie() {
    $deviceId = getDeviceIdFromCookie();
    if ($deviceId) {
        return $deviceId;
    }
    $deviceId = bin2hex(random_bytes(16));
    lc_set_cookie_value('lc_device_id', $deviceId, time() + (86400 * 365 * 2), true);
    return $deviceId;
}

function parseDeviceName($userAgent) {
    $agent = strtolower($userAgent ?? '');
    $platform = 'Unknown OS';
    if (strpos($agent, 'windows') !== false) {
        $platform = 'Windows';
    } elseif (strpos($agent, 'mac') !== false) {
        $platform = 'macOS';
    } elseif (strpos($agent, 'android') !== false) {
        $platform = 'Android';
    } elseif (strpos($agent, 'iphone') !== false || strpos($agent, 'ipad') !== false) {
        $platform = 'iOS';
    } elseif (strpos($agent, 'linux') !== false) {
        $platform = 'Linux';
    }
    $browser = 'Browser';
    if (strpos($agent, 'edg') !== false) {
        $browser = 'Edge';
    } elseif (strpos($agent, 'chrome') !== false) {
        $browser = 'Chrome';
    } elseif (strpos($agent, 'safari') !== false) {
        $browser = 'Safari';
    } elseif (strpos($agent, 'firefox') !== false) {
        $browser = 'Firefox';
    }
    return $browser . ' on ' . $platform;
}

function lc_get_client_ip() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!is_string($ip) || $ip === '') {
        return '';
    }
    return $ip;
}

function lc_mask_ip($ip) {
    if (!is_string($ip) || $ip === '') {
        return '';
    }
    if (strpos($ip, ':') !== false) {
        $parts = explode(':', $ip);
        if (count($parts) > 2) {
            return implode(':', array_slice($parts, 0, 3)) . '::';
        }
        return $ip;
    }
    $parts = explode('.', $ip);
    if (count($parts) === 4) {
        $parts[3] = '0';
        return implode('.', $parts);
    }
    return $ip;
}

function lc_hash_token($token) {
    if (!is_string($token) || $token === '') {
        return '';
    }
    return hash('sha256', $token);
}

function lc_generate_session_token() {
    return bin2hex(random_bytes(32));
}

function lc_generate_device_token() {
    return bin2hex(random_bytes(32));
}

function lc_get_session_cookie() {
    return $_COOKIE['lc_session'] ?? null;
}

function lc_set_session_cookie($token) {
    if (!$token) {
        return;
    }
    lc_set_cookie_value('lc_session', $token, time() + (86400 * 45), true);
}

function lc_get_device_token_cookie() {
    return $_COOKIE['lc_device_token'] ?? null;
}

function lc_set_device_token_cookie($token) {
    if (!$token) {
        return;
    }
    lc_set_cookie_value('lc_device_token', $token, time() + (86400 * 45), true);
}

function lc_revoke_session_by_id($sessionId, $conn) {
    $sessionId = (int) $sessionId;
    if (!$sessionId || !$conn) {
        return false;
    }
    $stmt = $conn->prepare("UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL");
    $stmt->bind_param("i", $sessionId);
    $stmt->execute();
    return $stmt->affected_rows > 0;
}

function lc_register_user_session($userId, $conn) {
    if (!$userId || !$conn) {
        return null;
    }
    ensureUserSessionSchema($conn);
    $token = lc_generate_session_token();
    $tokenHash = lc_hash_token($token);
    $deviceToken = lc_generate_device_token();
    $deviceTokenHash = lc_hash_token($deviceToken);
    $deviceId = ensureDeviceIdCookie();
    $phpSessionId = session_id();
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    $deviceName = parseDeviceName($userAgent);
    $ip = lc_get_client_ip();
    $ipHash = $ip ? hash('sha256', $ip) : null;
    if ($phpSessionId) {
        $revokeStmt = $conn->prepare(
            "UPDATE user_sessions
             SET revoked_at = NOW()
             WHERE user_id = ? AND php_session_id = ? AND revoked_at IS NULL"
        );
        $revokeStmt->bind_param("is", $userId, $phpSessionId);
        $revokeStmt->execute();
    }
    $stmt = $conn->prepare(
        "INSERT INTO user_sessions (
            user_id, session_token_hash, device_token_hash, php_session_id, device_id,
            device_name, user_agent, ip_address, ip_hash, created_at, last_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
    );
    $stmt->bind_param(
        "issssssss",
        $userId,
        $tokenHash,
        $deviceTokenHash,
        $phpSessionId,
        $deviceId,
        $deviceName,
        $userAgent,
        $ip,
        $ipHash
    );
    $stmt->execute();
    lc_set_session_cookie($token);
    lc_set_device_token_cookie($deviceToken);
    return $token;
}

function lc_revoke_session_by_token($token, $conn, $userId = null) {
    if (!$token || !$conn) {
        return false;
    }
    $hash = lc_hash_token($token);
    if (!$hash) {
        return false;
    }
    if ($userId) {
        $stmt = $conn->prepare(
            "UPDATE user_sessions SET revoked_at = NOW() WHERE session_token_hash = ? AND user_id = ?"
        );
        $stmt->bind_param("si", $hash, $userId);
    } else {
        $stmt = $conn->prepare(
            "UPDATE user_sessions SET revoked_at = NOW() WHERE session_token_hash = ?"
        );
        $stmt->bind_param("s", $hash);
    }
    $stmt->execute();
    return $stmt->affected_rows > 0;
}

function lc_validate_user_session($userId, $conn) {
    if (!$userId || !$conn) {
        return false;
    }
    ensureUserSessionSchema($conn);
    $token = lc_get_session_cookie();
    if (!$token) {
        return false;
    }
    $hash = lc_hash_token($token);
    if (!$hash) {
        return false;
    }
    $stmt = $conn->prepare(
        "SELECT id, created_at, last_active, revoked_at, device_token_hash, php_session_id, user_agent
         FROM user_sessions
         WHERE user_id = ? AND session_token_hash = ? LIMIT 1"
    );
    $stmt->bind_param("is", $userId, $hash);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        return false;
    }
    $row = $result->fetch_assoc();
    if (!empty($row['revoked_at'])) {
        return false;
    }
    $deviceToken = lc_get_device_token_cookie();
    if (!$deviceToken) {
        lc_revoke_session_by_id((int) $row['id'], $conn);
        return false;
    }
    $deviceHash = lc_hash_token($deviceToken);
    if (!$deviceHash) {
        lc_revoke_session_by_id((int) $row['id'], $conn);
        return false;
    }
    $currentSessionId = session_id();
    $storedSessionId = (string) ($row['php_session_id'] ?? '');
    if ($storedSessionId === '' || $currentSessionId === '' || !hash_equals($storedSessionId, $currentSessionId)) {
        lc_revoke_session_by_id((int) $row['id'], $conn);
        return false;
    }
    $storedDeviceHash = (string) ($row['device_token_hash'] ?? '');
    if ($storedDeviceHash === '' || !hash_equals($storedDeviceHash, $deviceHash)) {
        lc_revoke_session_by_id((int) $row['id'], $conn);
        return false;
    }
    $storedUa = (string) ($row['user_agent'] ?? '');
    $currentUa = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    if ($storedUa !== '' && !hash_equals($storedUa, $currentUa)) {
        lc_revoke_session_by_id((int) $row['id'], $conn);
        return false;
    }
    $now = time();
    $createdAt = !empty($row['created_at']) ? strtotime($row['created_at']) : 0;
    $rotate = $createdAt && ($now - $createdAt) > (86400 * 7);
    if ($rotate) {
        $newToken = lc_generate_session_token();
        $newHash = lc_hash_token($newToken);
        $update = $conn->prepare(
            "UPDATE user_sessions SET session_token_hash = ?, last_active = NOW() WHERE id = ?"
        );
        $update->bind_param("si", $newHash, $row['id']);
        $update->execute();
        lc_set_session_cookie($newToken);
    } else {
        $touch = $conn->prepare("UPDATE user_sessions SET last_active = NOW() WHERE id = ?");
        $touch->bind_param("i", $row['id']);
        $touch->execute();
    }
    return true;
}

function lc_get_current_session_row($userId, $conn) {
    if (!$userId || !$conn) {
        return null;
    }
    ensureUserSessionSchema($conn);
    $token = lc_get_session_cookie();
    if (!$token) {
        return null;
    }
    $hash = lc_hash_token($token);
    if (!$hash) {
        return null;
    }
    $stmt = $conn->prepare(
        "SELECT id, device_name, device_id, user_agent, ip_address, created_at, last_active
         FROM user_sessions
         WHERE user_id = ? AND session_token_hash = ? AND revoked_at IS NULL
         LIMIT 1"
    );
    $stmt->bind_param("is", $userId, $hash);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        return null;
    }
    return $result->fetch_assoc();
}

function lc_record_event($userId, $conversationId, $type, $payload, $conn) {
    if (!$conn || !$userId || !$conversationId || !$type) {
        return;
    }
    $payloadJson = $payload === null ? null : json_encode($payload);
    $stmt = $conn->prepare(
        "INSERT INTO events (user_id, conversation_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, NOW())"
    );
    $stmt->bind_param("iiss", $userId, $conversationId, $type, $payloadJson);
    $stmt->execute();
}

function lc_record_event_bulk($userIds, $conversationId, $type, $payload, $conn) {
    if (!$conn || !$userIds || !$conversationId || !$type) {
        return;
    }
    $payloadJson = $payload === null ? null : json_encode($payload);
    $stmt = $conn->prepare(
        "INSERT INTO events (user_id, conversation_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, NOW())"
    );
    foreach ($userIds as $userId) {
        $userId = (int) $userId;
        if ($userId <= 0) {
            continue;
        }
        $stmt->bind_param("iiss", $userId, $conversationId, $type, $payloadJson);
        $stmt->execute();
    }
}

function lc_get_chat_member_ids($chatType, $chatId, $conn) {
    $chatId = (int) $chatId;
    if (!$conn || !$chatId) {
        return [];
    }
    if ($chatType === 'group') {
        $stmt = $conn->prepare("SELECT user_id FROM group_members WHERE group_id = ?");
        $stmt->bind_param("i", $chatId);
    } elseif ($chatType === 'channel') {
        $stmt = $conn->prepare("SELECT user_id FROM channel_members WHERE channel_id = ?");
        $stmt->bind_param("i", $chatId);
    } else {
        return [];
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $ids = [];
    while ($row = $result->fetch_assoc()) {
        $ids[] = (int) $row['user_id'];
    }
    return $ids;
}

function lc_dispatch_scheduled_messages($conn, $limit = 20) {
    if (!$conn || !($conn instanceof mysqli)) {
        return 0;
    }
    $limit = max(1, (int) $limit);
    $nowUtc = gmdate('Y-m-d H:i:s');
    $nowLocal = date('Y-m-d H:i:s');
    $stmt = $conn->prepare(
        "SELECT * FROM scheduled_messages
         WHERE (send_at <= ? OR send_at <= ? OR send_at <= UTC_TIMESTAMP() OR send_at <= NOW())
           AND canceled_at IS NULL
           AND dispatched_at IS NULL
         ORDER BY send_at ASC
         LIMIT ?"
    );
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param("ssi", $nowUtc, $nowLocal, $limit);
    if (!$stmt->execute()) {
        return 0;
    }
    $result = $stmt->get_result();
    $count = 0;
    while ($row = $result->fetch_assoc()) {
        $scheduledId = (int) $row['id'];
        $userId = (int) $row['user_id'];
        $conversationId = (int) $row['conversation_id'];
        $conversationType = $row['conversation_type'] ?? '';
        $meta = [];
        if (!empty($row['meta_json'])) {
            $decoded = json_decode($row['meta_json'], true);
            if (is_array($decoded)) {
                $meta = $decoded;
            }
        }
        $messageType = $meta['message_type'] ?? 'text';
        $fileUrl = $meta['file_url'] ?? null;
        $replyToId = isset($meta['reply_to_id']) ? (int) $meta['reply_to_id'] : null;
        $keySender = $meta['key_sender'] ?? null;
        $keyRecipient = $meta['key_recipient'] ?? null;
        $contentHash = $meta['content_hash'] ?? null;
        $mentions = isset($meta['mentions']) && is_array($meta['mentions']) ? $meta['mentions'] : [];
        $messageKeys = isset($meta['message_keys']) && is_array($meta['message_keys']) ? $meta['message_keys'] : [];

        $receiverId = null;
        $groupId = null;
        $channelId = null;
        if ($conversationType === 'group') {
            $groupId = $conversationId;
        } elseif ($conversationType === 'channel') {
            $channelId = $conversationId;
        } else {
            $receiverId = $conversationId;
        }

        $expiresAt = null;
        $now = time();
        if ($groupId !== null) {
            $expireStmt = $conn->prepare("SELECT disappear_after_seconds FROM groups WHERE group_id = ?");
            $expireStmt->bind_param("i", $groupId);
            $expireStmt->execute();
            $expireResult = $expireStmt->get_result();
            if ($expireRow = $expireResult->fetch_assoc()) {
                $seconds = (int) ($expireRow['disappear_after_seconds'] ?? 0);
                if ($seconds > 0) {
                    $expiresAt = date('Y-m-d H:i:s', $now + $seconds);
                }
            }
        } elseif ($channelId !== null) {
            $expireStmt = $conn->prepare("SELECT disappear_after_seconds FROM channels WHERE channel_id = ?");
            $expireStmt->bind_param("i", $channelId);
            $expireStmt->execute();
            $expireResult = $expireStmt->get_result();
            if ($expireRow = $expireResult->fetch_assoc()) {
                $seconds = (int) ($expireRow['disappear_after_seconds'] ?? 0);
                if ($seconds > 0) {
                    $expiresAt = date('Y-m-d H:i:s', $now + $seconds);
                }
            }
        } elseif ($receiverId !== null) {
            $seconds = getDirectChatDisappearSeconds($userId, $receiverId, $conn);
            if ($seconds > 0) {
                $expiresAt = date('Y-m-d H:i:s', $now + $seconds);
            }
        }

        $rawPayload = unwrapCiphertext($row['encrypted_payload']);
        $msgText = $meta['message_text'] ?? null;
        $encryptedContent = $row['encrypted_payload'] ?: '';
        if ($rawPayload && (!str_starts_with(trim($rawPayload), '{') || stripos($rawPayload, 'ciphertext') === false)) {
            $msgText = $msgText ?: $rawPayload;
            $encryptedContent = wrapCiphertext($rawPayload);
        }
        if ($encryptedContent === null || $encryptedContent === '') {
            $encryptedContent = wrapCiphertext($msgText ?: '');
        }

        $insert = $conn->prepare(
            "INSERT INTO messages (sender_id, receiver_id, group_id, channel_id, message_type, message_text, file_url, reply_to_id, encrypted_content, key_sender, key_recipient, content_hash, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $insert->bind_param(
            "iiiisssisssss",
            $userId,
            $receiverId,
            $groupId,
            $channelId,
            $messageType,
            $msgText,
            $fileUrl,
            $replyToId,
            $encryptedContent,
            $keySender,
            $keyRecipient,
            $contentHash,
            $expiresAt
        );
        if (!$insert->execute()) {
            continue;
        }
        $messageId = $insert->insert_id;

        if (($groupId !== null || $channelId !== null) && $messageKeys) {
            $keyStmt = $conn->prepare("INSERT INTO message_keys (message_id, user_id, wrapped_key) VALUES (?, ?, ?)");
            foreach ($messageKeys as $entry) {
                $entryUserId = $entry['userId'] ?? ($entry['user_id'] ?? null);
                $entryWrapped = $entry['wrappedKey'] ?? ($entry['wrapped_key'] ?? null);
                if (!$entryUserId || !$entryWrapped) {
                    continue;
                }
                $memberId = (int) $entryUserId;
                $keyStmt->bind_param("iis", $messageId, $memberId, $entryWrapped);
                $keyStmt->execute();
            }
        }

        if (!empty($mentions)) {
            $mentionStmt = $conn->prepare("INSERT IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)");
            foreach ($mentions as $mentionId) {
                $mentionId = (int) $mentionId;
                if ($mentionId <= 0) {
                    continue;
                }
                $mentionStmt->bind_param("ii", $messageId, $mentionId);
                $mentionStmt->execute();
            }
        }

        $meta['message_id'] = $messageId;
        $metaJson = json_encode($meta);
        $update = $conn->prepare(
            "UPDATE scheduled_messages SET dispatched_at = NOW(), meta_json = ? WHERE id = ?"
        );
        $update->bind_param("si", $metaJson, $scheduledId);
        $update->execute();

        $decryptedScheduled = unwrapCiphertext($encryptedContent);
        $basePayload = [
            'message_id' => $messageId,
            'scheduled_id' => $scheduledId,
            'sender_id' => $userId,
            'receiver_id' => $receiverId,
            'group_id' => $groupId,
            'channel_id' => $channelId,
            'message_type' => $messageType,
            'message_text' => $msgText ?: $decryptedScheduled,
            'text' => $msgText ?: $decryptedScheduled,
            'file_url' => $fileUrl,
            'encrypted_content' => $encryptedContent ? $decryptedScheduled : null,
            'key_sender' => null,
            'key_recipient' => null,
            'created_at' => date('Y-m-d H:i:s'),
            'reply_to_id' => $replyToId,
            'mentions' => $mentions
        ];
        if ($groupId !== null || $channelId !== null) {
            $memberIds = lc_get_chat_member_ids($conversationType, $conversationId, $conn);
            foreach ($memberIds as $memberId) {
                $payload = $basePayload;
                $payload['key_for_user'] = null;
                if (!empty($messageKeys)) {
                    foreach ($messageKeys as $entry) {
                        $entryUserId = $entry['userId'] ?? ($entry['user_id'] ?? null);
                        if ((int) $entryUserId === (int) $memberId) {
                            $payload['key_for_user'] = $entry['wrappedKey'] ?? ($entry['wrapped_key'] ?? null);
                            break;
                        }
                    }
                }
                $payload['chat_type'] = $conversationType;
                lc_record_event($memberId, $conversationId, 'message_new', $payload, $conn);
            }
        } else {
            $payload = $basePayload;
            $payload['chat_type'] = $conversationType;
            $recipientIds = array_values(array_unique([$userId, $receiverId]));
            foreach ($recipientIds as $rid) {
                if (!$rid) {
                    continue;
                }
                lc_record_event($rid, $conversationId, 'message_new', $payload, $conn);
            }
        }

        $count++;
    }
    return $count;
}

function registerUserDevice($userId, $conn) {
    if (!$userId) {
        return null;
    }
    $deviceId = ensureDeviceIdCookie();
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    $deviceName = parseDeviceName($userAgent);
    $stmt = $conn->prepare(
        "INSERT INTO user_devices (user_id, device_id, device_name, user_agent, created_at, last_active)
         VALUES (?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE device_name = VALUES(device_name), user_agent = VALUES(user_agent), last_active = NOW(), revoked_at = NULL"
    );
    $stmt->bind_param("isss", $userId, $deviceId, $deviceName, $userAgent);
    $stmt->execute();
    return $deviceId;
}

function touchUserDevice($userId, $deviceId, $conn) {
    if (!$userId || !$deviceId) {
        return;
    }
    $stmt = $conn->prepare(
        "UPDATE user_devices SET last_active = NOW() WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL"
    );
    $stmt->bind_param("is", $userId, $deviceId);
    $stmt->execute();
}

function isDeviceRevoked($userId, $deviceId, $conn) {
    if (!$userId || !$deviceId) {
        return false;
    }
    $stmt = $conn->prepare("SELECT revoked_at FROM user_devices WHERE user_id = ? AND device_id = ?");
    $stmt->bind_param("is", $userId, $deviceId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        return false;
    }
    $row = $result->fetch_assoc();
    return !empty($row['revoked_at']);
}

function ensureReactionSchema($conn, $force = false) {
    static $checked = false;
    if ($checked && !$force) {
        return;
    }
    $checked = true;
    if (!$conn || !($conn instanceof mysqli)) {
        return;
    }
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `message_reactions` (
            `reaction_id` int(11) NOT NULL AUTO_INCREMENT,
            `message_id` int(11) NOT NULL,
            `user_id` int(11) NOT NULL,
            `reaction` varchar(8) NOT NULL,
            `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`reaction_id`),
            UNIQUE KEY `message_user_reaction` (`message_id`, `user_id`, `reaction`),
            KEY `message_id` (`message_id`),
            KEY `user_id` (`user_id`),
            CONSTRAINT `message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
            CONSTRAINT `message_reactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $result = $conn->query("SHOW INDEX FROM message_reactions");
    if (!$result) {
        return;
    }
    $indexes = [];
    while ($row = $result->fetch_assoc()) {
        $name = $row['Key_name'];
        if (!isset($indexes[$name])) {
            $indexes[$name] = [
                'unique' => ((int) $row['Non_unique'] === 0),
                'columns' => []
            ];
        }
        $seq = (int) $row['Seq_in_index'];
        $indexes[$name]['columns'][$seq] = $row['Column_name'];
    }
    foreach ($indexes as &$info) {
        ksort($info['columns']);
        $info['columns'] = array_values($info['columns']);
    }
    unset($info);

    $hasDesiredUnique = false;
    foreach ($indexes as $name => $info) {
        if ($info['unique'] && $info['columns'] === ['message_id', 'user_id', 'reaction']) {
            $hasDesiredUnique = true;
            break;
        }
    }
    if (!$hasDesiredUnique) {
        if (isset($indexes['message_user_reaction']) && $indexes['message_user_reaction']['columns'] !== ['message_id', 'user_id', 'reaction']) {
            $conn->query("ALTER TABLE message_reactions DROP INDEX `message_user_reaction`");
        }
        foreach ($indexes as $name => $info) {
            if ($name === 'PRIMARY' || !$info['unique']) {
                continue;
            }
            $columns = $info['columns'];
            if ($columns === ['message_id'] || $columns === ['message_id', 'user_id'] || $columns === ['message_id', 'reaction']) {
                $conn->query("ALTER TABLE message_reactions DROP INDEX `{$name}`");
            }
        }
        $conn->query(
            "ALTER TABLE message_reactions ADD UNIQUE KEY `message_user_reaction` (`message_id`, `user_id`, `reaction`)"
        );
    }
    if (!isset($indexes['message_id']) && !isset($indexes['message_id_2'])) {
        $conn->query("ALTER TABLE message_reactions ADD KEY `message_id` (`message_id`)");
    }
    if (!isset($indexes['user_id']) && !isset($indexes['user_id_2'])) {
        $conn->query("ALTER TABLE message_reactions ADD KEY `user_id` (`user_id`)");
    }
}

function getDirectChatPair($userId, $otherUserId) {
    $userId = (int) $userId;
    $otherUserId = (int) $otherUserId;
    if ($userId <= 0 || $otherUserId <= 0) {
        return null;
    }
    return [
        'user_one' => min($userId, $otherUserId),
        'user_two' => max($userId, $otherUserId)
    ];
}

function getDirectChatDisappearSeconds($userId, $otherUserId, $conn) {
    $pair = getDirectChatPair($userId, $otherUserId);
    if (!$pair) {
        return 0;
    }
    $stmt = $conn->prepare(
        "SELECT disappear_after_seconds FROM direct_chat_settings WHERE user_one = ? AND user_two = ? LIMIT 1"
    );
    $stmt->bind_param("ii", $pair['user_one'], $pair['user_two']);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        return (int) $row['disappear_after_seconds'];
    }
    return 0;
}

function setDirectChatDisappearSeconds($userId, $otherUserId, $seconds, $updatedBy, $conn) {
    $pair = getDirectChatPair($userId, $otherUserId);
    if (!$pair) {
        return false;
    }
    $seconds = max(0, (int) $seconds);
    $updatedBy = $updatedBy ? (int) $updatedBy : null;
    $stmt = $conn->prepare(
        "INSERT INTO direct_chat_settings (user_one, user_two, disappear_after_seconds, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE disappear_after_seconds = VALUES(disappear_after_seconds), updated_by = VALUES(updated_by)"
    );
    $stmt->bind_param("iiii", $pair['user_one'], $pair['user_two'], $seconds, $updatedBy);
    return $stmt->execute();
}

function cleanupExpiredMessages($conn, $limit = 200) {
    if (!$conn || !($conn instanceof mysqli)) {
        return 0;
    }
    $limit = max(1, (int) $limit);
    $stmt = $conn->prepare(
        "SELECT message_id FROM messages
         WHERE expires_at IS NOT NULL AND expires_at <= NOW()
         ORDER BY expires_at ASC
         LIMIT ?"
    );
    $stmt->bind_param("i", $limit);
    if (!$stmt->execute()) {
        return 0;
    }
    $result = $stmt->get_result();
    $ids = [];
    while ($row = $result->fetch_assoc()) {
        $ids[] = (int) $row['message_id'];
    }
    if (!$ids) {
        return 0;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $del = $conn->prepare("DELETE FROM messages WHERE message_id IN ($placeholders)");
    $del->bind_param($types, ...$ids);
    $del->execute();
    return count($ids);
}

function appDebugLog($message) {
    if (defined('APP_DEBUG') && APP_DEBUG) {
        error_log($message);
    }
}
