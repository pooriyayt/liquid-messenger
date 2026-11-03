<?php
if (!file_exists(__DIR__ . '/../includes/config.php') || (!file_exists(__DIR__ . '/../installed.lock') && !file_exists(__DIR__ . '/../storage/installed.lock'))) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'System not installed. Please run install.php']);
    exit;
}
require_once __DIR__ . '/../includes/config.php';
require_once '../includes/functions.php';
require_once '../includes/auth.php';
require_once '../includes/chat_functions.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

switch ($action) {
    case 'sync_events':
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) ($currentUser['user_id'] ?? 0);
        if (!$userId) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        cleanupExpiredMessages($conn, 200);
        lc_dispatch_scheduled_messages($conn, 25);
        $conn->query("DELETE FROM chat_activity WHERE expires_at < NOW()");

        $since = isset($_GET['since']) && is_numeric($_GET['since']) ? (int) $_GET['since'] : 0;
        $cursorOnly = !empty($_GET['cursor_only']);
        $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int) $_GET['limit'] : 200;
        $limit = max(1, min(300, $limit));

        $lastEventId = $since;
        if ($cursorOnly) {
            $stmt = $conn->prepare("SELECT MAX(event_id) as max_id FROM events WHERE user_id = ?");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $lastEventId = (int) ($row['max_id'] ?? 0);
            }
            echo json_encode([
                'success' => true,
                'last_event_id' => $lastEventId,
                'events' => []
            ]);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT event_id, conversation_id, type, payload_json, created_at
             FROM events
             WHERE user_id = ? AND event_id > ?
             ORDER BY event_id ASC
             LIMIT ?"
        );
        $stmt->bind_param("iii", $userId, $since, $limit);
        $stmt->execute();
        $result = $stmt->get_result();

        $events = [];
        while ($row = $result->fetch_assoc()) {
            $payload = null;
            if (!empty($row['payload_json'])) {
                $decoded = json_decode($row['payload_json'], true);
                if (is_array($decoded)) {
                    $payload = $decoded;
                }
            }
            $eventId = (int) $row['event_id'];
            $events[] = [
                'event_id' => $eventId,
                'conversation_id' => (int) $row['conversation_id'],
                'type' => $row['type'],
                'payload' => $payload,
                'created_at' => $row['created_at']
            ];
            if ($eventId > $lastEventId) {
                $lastEventId = $eventId;
            }
        }

        echo json_encode([
            'success' => true,
            'last_event_id' => $lastEventId,
            'events' => $events
        ]);
        break;
    case 'cleanup_expired':
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

        // Optional cron usage: define APP_CRON_TOKEN in config and call ?token=...
        $tokenRequired = defined('APP_CRON_TOKEN') ? (string) APP_CRON_TOKEN : '';
        $tokenProvided = isset($_GET['token']) ? (string) $_GET['token'] : '';

        if ($tokenRequired !== '') {
            if (!hash_equals($tokenRequired, $tokenProvided)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Invalid token']);
                exit;
            }
        } elseif (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 500;
        $limit = max(1, min(5000, $limit));
        $removed = cleanupExpiredMessages($conn, $limit);

        echo json_encode(['success' => true, 'removed' => $removed]);
        break;
    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        exit;
}
