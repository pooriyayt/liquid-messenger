<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

function ensurePushSubscriptionSchema($conn) {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (!$conn || !($conn instanceof mysqli)) {
        return;
    }
    $conn->query(
        "CREATE TABLE IF NOT EXISTS `push_subscriptions` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `user_id` int(11) NOT NULL,
            `endpoint` text NOT NULL,
            `endpoint_hash` char(64) NOT NULL,
            `p256dh` varchar(255) DEFAULT NULL,
            `auth` varchar(255) DEFAULT NULL,
            `device_id` varchar(64) DEFAULT NULL,
            `user_agent` varchar(255) DEFAULT NULL,
            `created_at` datetime NOT NULL,
            `updated_at` datetime NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_endpoint` (`endpoint_hash`),
            KEY `idx_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function savePushSubscription($userId, $subscription, $conn) {
    if (!$userId || !$subscription || empty($subscription['endpoint'])) {
        return false;
    }
    ensurePushSubscriptionSchema($conn);
    $endpoint = $subscription['endpoint'];
    $keys = is_array($subscription['keys'] ?? null) ? $subscription['keys'] : [];
    $p256dh = $keys['p256dh'] ?? null;
    $auth = $keys['auth'] ?? null;
    $endpointHash = hash('sha256', $endpoint);
    $deviceId = ensureDeviceIdCookie();
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    $now = date('Y-m-d H:i:s');

    $stmt = $conn->prepare(
        "INSERT INTO push_subscriptions (
            user_id, endpoint, endpoint_hash, p256dh, auth, device_id, user_agent, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            p256dh = VALUES(p256dh),
            auth = VALUES(auth),
            device_id = VALUES(device_id),
            user_agent = VALUES(user_agent),
            updated_at = VALUES(updated_at)"
    );
    $stmt->bind_param(
        "issssssss",
        $userId,
        $endpoint,
        $endpointHash,
        $p256dh,
        $auth,
        $deviceId,
        $userAgent,
        $now,
        $now
    );
    return $stmt->execute();
}

function removePushSubscription($userId, $endpoint, $conn) {
    if (!$userId || !$endpoint) {
        return false;
    }
    ensurePushSubscriptionSchema($conn);
    $endpointHash = hash('sha256', $endpoint);
    $stmt = $conn->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?");
    $stmt->bind_param("is", $userId, $endpointHash);
    return $stmt->execute();
}

function removeAllPushSubscriptions($userId, $conn) {
    if (!$userId) {
        return false;
    }
    ensurePushSubscriptionSchema($conn);
    $stmt = $conn->prepare("DELETE FROM push_subscriptions WHERE user_id = ?");
    $stmt->bind_param("i", $userId);
    return $stmt->execute();
}

function getPushSubscriptionsForUsers($userIds, $conn) {
    ensurePushSubscriptionSchema($conn);
    $clean = array_values(array_unique(array_filter(array_map('intval', $userIds), function ($id) {
        return $id > 0;
    })));
    if (!$clean) {
        return [];
    }
    $in = implode(',', $clean);
    $result = $conn->query("SELECT id, user_id, endpoint, endpoint_hash FROM push_subscriptions WHERE user_id IN ($in)");
    if (!$result) {
        return [];
    }
    $subs = [];
    while ($row = $result->fetch_assoc()) {
        $subs[] = $row;
    }
    return $subs;
}

function getVapidStoragePath() {
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir . '/vapid_keys.json';
}

function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function derToJose($der, $length) {
    $offset = 3;
    $rLength = ord($der[$offset]);
    $r = substr($der, $offset + 1, $rLength);
    $offset += 2 + $rLength;
    $sLength = ord($der[$offset]);
    $s = substr($der, $offset + 1, $sLength);
    $r = ltrim($r, "\x00");
    $s = ltrim($s, "\x00");
    $r = str_pad($r, $length / 2, "\x00", STR_PAD_LEFT);
    $s = str_pad($s, $length / 2, "\x00", STR_PAD_LEFT);
    return $r . $s;
}

function generateVapidKeys() {
    $config = [
        'private_key_type' => OPENSSL_KEYTYPE_EC,
        'curve_name' => 'prime256v1'
    ];
    $res = openssl_pkey_new($config);
    if (!$res) {
        return null;
    }
    openssl_pkey_export($res, $privatePem);
    $details = openssl_pkey_get_details($res);
    if (empty($details['ec']['x']) || empty($details['ec']['y'])) {
        return null;
    }
    $publicKey = "\x04" . $details['ec']['x'] . $details['ec']['y'];
    return [
        'public_key' => base64UrlEncode($publicKey),
        'private_pem' => $privatePem
    ];
}

function getVapidKeys() {
    $path = getVapidStoragePath();
    if (file_exists($path)) {
        $raw = file_get_contents($path);
        if ($raw) {
            $data = json_decode($raw, true);
            if (is_array($data) && !empty($data['public_key']) && !empty($data['private_pem'])) {
                return $data;
            }
        }
    }
    $keys = generateVapidKeys();
    if (!$keys) {
        return null;
    }
    file_put_contents($path, json_encode($keys));
    return $keys;
}

function getVapidSubject() {
    if (defined('VAPID_SUBJECT')) {
        return VAPID_SUBJECT;
    }
    return 'mailto:admin@example.com';
}

function createVapidJwt($audience, $subject, $privatePem) {
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $payload = base64UrlEncode(json_encode([
        'aud' => $audience,
        'exp' => time() + 3600,
        'sub' => $subject
    ]));
    $data = $header . '.' . $payload;
    $signature = '';
    $ok = openssl_sign($data, $signature, $privatePem, OPENSSL_ALGO_SHA256);
    if (!$ok) {
        return null;
    }
    $jose = derToJose($signature, 64);
    return $data . '.' . base64UrlEncode($jose);
}

function getVapidAudience($endpoint) {
    $parts = parse_url($endpoint);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
        return null;
    }
    $aud = $parts['scheme'] . '://' . $parts['host'];
    if (!empty($parts['port'])) {
        $aud .= ':' . $parts['port'];
    }
    return $aud;
}

function sendWebPushRequest($endpoint, $vapid) {
    $audience = getVapidAudience($endpoint);
    if (!$audience || !$vapid) {
        return 0;
    }
    $jwt = createVapidJwt($audience, getVapidSubject(), $vapid['private_pem']);
    if (!$jwt) {
        return 0;
    }
    $publicKey = $vapid['public_key'];
    $headers = [
        'TTL: 60',
        'Authorization: vapid t=' . $jwt . ', k=' . $publicKey,
        'Crypto-Key: p256ecdsa=' . $publicKey,
        'Content-Length: 0'
    ];
    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, '');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
    curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_2_0);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($response === false || $status === 0) {
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    }
    curl_close($ch);
    return (int) $status;
}

function sendPushNotificationsToUsers($userIds, $conn) {
    $subs = getPushSubscriptionsForUsers($userIds, $conn);
    if (!$subs) {
        return;
    }
    $vapid = getVapidKeys();
    if (!$vapid) {
        return;
    }
    foreach ($subs as $sub) {
        $status = sendWebPushRequest($sub['endpoint'], $vapid);
        if (in_array($status, [404, 410], true)) {
            $stmt = $conn->prepare("DELETE FROM push_subscriptions WHERE endpoint_hash = ?");
            $stmt->bind_param("s", $sub['endpoint_hash']);
            $stmt->execute();
        }
    }
}

function sendPushForMessage($senderId, $receiverId, $groupId, $channelId, $conn) {
    $targets = [];
    if ($receiverId) {
        $targets[] = (int) $receiverId;
    }
    if ($groupId) {
        $stmt = $conn->prepare("SELECT user_id FROM group_members WHERE group_id = ?");
        $stmt->bind_param("i", $groupId);
        if ($stmt->execute()) {
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $targets[] = (int) $row['user_id'];
            }
        }
    }
    if ($channelId) {
        $stmt = $conn->prepare("SELECT user_id FROM channel_members WHERE channel_id = ?");
        $stmt->bind_param("i", $channelId);
        if ($stmt->execute()) {
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $targets[] = (int) $row['user_id'];
            }
        }
    }
    $targets = array_values(array_unique(array_filter($targets, function ($id) use ($senderId) {
        return $id > 0 && $id !== (int) $senderId;
    })));
    if (!$targets) {
        return;
    }
    sendPushNotificationsToUsers($targets, $conn);
}
