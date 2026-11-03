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
require_once '../includes/push_notifications.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

switch ($action) {
    case 'activity':
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            if (!is_array($data)) {
                echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
                exit;
            }

            $chatType = $data['chatType'] ?? null;
            $chatId = isset($data['chatId']) ? (int) $data['chatId'] : null;
            $activityType = $data['activityType'] ?? null;
            $activityValue = $data['activityValue'] ?? null;

            if (!in_array($chatType, ['direct', 'group'], true) || !$chatId) {
                echo json_encode(['success' => false, 'message' => 'Invalid chat target']);
                exit;
            }
            $allowedActivities = [
                'typing',
                'uploading',
                'recording',
                'upload_photo',
                'upload_video',
                'upload_file',
                'record_voice',
                'record_video'
            ];
            if (!in_array($activityType, $allowedActivities, true)) {
                echo json_encode(['success' => false, 'message' => 'Invalid activity type']);
                exit;
            }

            if ($activityValue === '' || $activityValue === null) {
                $stmt = $conn->prepare(
                    "DELETE FROM chat_activity WHERE chat_type = ? AND chat_id = ? AND user_id = ? AND activity_type = ?"
                );
                $stmt->bind_param("siis", $chatType, $chatId, $userId, $activityType);
                $stmt->execute();

                $payload = [
                    'chat_type' => $chatType,
                    'chat_id' => ($chatType === 'direct' ? $userId : $chatId),
                    'user_id' => $userId,
                    'sender_id' => $userId,
                    'receiver_id' => $chatId,
                    'activity_type' => $activityType,
                    'activity_value' => ''
                ];
                $eventType = ($activityType === 'typing') ? 'typing_stop' : 'activity_stop';
                if ($chatType === 'direct') {
                    lc_record_event($chatId, $userId, $eventType, $payload, $conn);
                } elseif ($chatType === 'group') {
                    $memberIds = lc_get_chat_member_ids('group', $chatId, $conn);
                    foreach ($memberIds as $memberId) {
                        if ((int) $memberId === (int) $userId) {
                            continue;
                        }
                        lc_record_event($memberId, $chatId, $eventType, $payload, $conn);
                    }
                }
                echo json_encode(['success' => true]);
                exit;
            }

            $stmt = $conn->prepare(
                "INSERT INTO chat_activity (chat_type, chat_id, user_id, activity_type, activity_value, expires_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 SECOND), NOW())
                 ON DUPLICATE KEY UPDATE
                    activity_value = VALUES(activity_value),
                    expires_at = VALUES(expires_at),
                    updated_at = NOW()"
            );
            $stmt->bind_param("siiss", $chatType, $chatId, $userId, $activityType, $activityValue);
            $stmt->execute();

            $payload = [
                'chat_type' => $chatType,
                'chat_id' => ($chatType === 'direct' ? $userId : $chatId),
                'user_id' => $userId,
                'sender_id' => $userId,
                'receiver_id' => $chatId,
                'activity_type' => $activityType,
                'activity_value' => (string) $activityValue
            ];
            $eventType = ($activityType === 'typing') ? 'typing_start' : 'activity_start';
            if ($chatType === 'direct') {
                lc_record_event($chatId, $userId, $eventType, $payload, $conn);
            } elseif ($chatType === 'group') {
                $memberIds = lc_get_chat_member_ids('group', $chatId, $conn);
                foreach ($memberIds as $memberId) {
                    if ((int) $memberId === (int) $userId) {
                        continue;
                    }
                    lc_record_event($memberId, $chatId, $eventType, $payload, $conn);
                }
            }

            echo json_encode(['success' => true]);
            exit;
        }

        // GET: fetch active activity
        $chatType = $_GET['chatType'] ?? null;
        $chatId = isset($_GET['chatId']) ? (int) $_GET['chatId'] : null;

        if (!in_array($chatType, ['direct', 'group'], true) || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat target']);
            exit;
        }

        // Purge expired activities
        $conn->query("DELETE FROM chat_activity WHERE expires_at < NOW()");

        $stmt = $conn->prepare(
            "SELECT user_id, activity_type, activity_value, updated_at
             FROM chat_activity
             WHERE chat_type = ? AND chat_id = ? AND expires_at > NOW() AND user_id != ?"
        );
        $stmt->bind_param("sii", $chatType, $chatId, $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        $activities = [];
        while ($row = $result->fetch_assoc()) {
            $activities[] = $row;
        }

        echo json_encode(['success' => true, 'activities' => $activities]);
        break;
    case 'add_contact':
    case 'save_contact':
    case 'update_contact_nickname':
        header('Content-Type: application/json');
        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $postData = json_decode(file_get_contents('php://input'), true);
        if (!is_array($postData)) {
            $postData = $_POST;
        }

        $contactId = isset($postData['contact_id']) ? (int) $postData['contact_id'] : (isset($postData['user_id']) ? (int) $postData['user_id'] : 0);
        $nickname = isset($postData['nickname']) ? (string) $postData['nickname'] : (isset($postData['custom_name']) ? (string) $postData['custom_name'] : null);

        if (!$contactId && !empty($postData['username'])) {
            $uName = trim((string) $postData['username']);
            $uName = ltrim($uName, '@');
            $uPhone = isset($postData['phone']) ? trim((string) $postData['phone']) : $uName;
            $uStmt = $conn->prepare("SELECT user_id, full_name FROM users WHERE username = ? OR phone = ? LIMIT 1");
            if ($uStmt) {
                $uStmt->bind_param("ss", $uName, $uPhone);
                $uStmt->execute();
                $uRes = $uStmt->get_result();
                if ($uRow = $uRes->fetch_assoc()) {
                    $contactId = (int) $uRow['user_id'];
                    if ($nickname === null && !empty($postData['name'])) {
                        $nickname = trim((string) $postData['name']);
                    }
                }
            }
        }

        if (!$contactId) {
            echo json_encode(['success' => false, 'message' => 'User not found or missing contact_id']);
            exit;
        }

        if ($userId === $contactId) {
            echo json_encode(['success' => false, 'message' => 'Cannot add yourself as a contact']);
            exit;
        }

        try {
            if ($nickname !== null) {
                saveContactNickname($userId, $contactId, $nickname, $conn);
            } else {
                addContact($userId, $contactId, $conn);
            }
            // Ensure bilateral contact entry
            addContact($contactId, $userId, $conn);

            echo json_encode([
                'success' => true,
                'message' => 'Contact saved successfully',
                'contact_id' => $contactId,
                'nickname' => $nickname
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error saving contact: ' . $e->getMessage()]);
        }
        break;

    case 'delete_contact':
        header('Content-Type: application/json');
        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];
        $postData = json_decode(file_get_contents('php://input'), true);
        if (!is_array($postData)) {
            $postData = $_POST;
        }
        $contactId = isset($postData['contact_id']) ? (int) $postData['contact_id'] : 0;
        if (!$contactId) {
            echo json_encode(['success' => false, 'message' => 'Missing contact_id']);
            exit;
        }
        try {
            deleteContact($userId, $contactId, $conn);
            echo json_encode(['success' => true, 'message' => 'Contact removed successfully']);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error deleting contact: ' . $e->getMessage()]);
        }
        break;
    case 'add_reaction':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];
        ensureReactionSchema($conn);

        // Get request data
        $data = json_decode(file_get_contents('php://input'), true);

        // Check if message_id and reaction are provided
        if (!isset($data['message_id']) || !is_numeric($data['message_id']) || !isset($data['reaction'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Missing or invalid parameters'
            ]);
            exit;
        }

        $messageId = (int)$data['message_id'];
        $reaction = $data['reaction'];

        // Validate reaction (emoji)
        $length = function_exists('mb_strlen') ? mb_strlen($reaction) : strlen($reaction);
        if ($length > 8) {
            echo json_encode([
                'success' => false,
                'message' => 'Invalid reaction'
            ]);
            exit;
        }

        try {
            $conn->begin_transaction();
            // Check if message exists
            $stmt = $conn->prepare("SELECT message_id, sender_id, receiver_id, group_id, channel_id FROM messages WHERE message_id = ? LIMIT 1");
            $stmt->bind_param("i", $messageId);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows === 0) {
                $conn->rollback();
                echo json_encode([
                    'success' => false,
                    'message' => 'Message not found'
                ]);
                exit;
            }
            
            $message = $result->fetch_assoc();
            $userReactions = [];
            $userStmt = $conn->prepare("SELECT DISTINCT reaction FROM message_reactions WHERE message_id = ? AND user_id = ? FOR UPDATE");
            $userStmt->bind_param("ii", $messageId, $userId);
            $userStmt->execute();
            $userResult = $userStmt->get_result();
            while ($row = $userResult->fetch_assoc()) {
                $userReactions[] = $row['reaction'];
            }

            $hasReaction = in_array($reaction, $userReactions, true);
            $changed = false;
            $blocked = false;

            if ($hasReaction) {
                $stmt = $conn->prepare("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?");
                $stmt->bind_param("iis", $messageId, $userId, $reaction);
                $stmt->execute();
                $changed = $stmt->affected_rows > 0;
            } else {
                if (count($userReactions) >= 3) {
                    $blocked = true;
                } else {
                    $stmt = $conn->prepare("INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)");
                    $stmt->bind_param("iis", $messageId, $userId, $reaction);
                    if (!$stmt->execute() && $stmt->errno === 1062) {
                        ensureReactionSchema($conn, true);
                        $stmt = $conn->prepare("INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)");
                        $stmt->bind_param("iis", $messageId, $userId, $reaction);
                        $stmt->execute();
                    }
                    $changed = $stmt->affected_rows > 0;
                }
            }

            if ($changed) {
                $touchStmt = $conn->prepare("UPDATE messages SET updated_at = NOW() WHERE message_id = ?");
                $touchStmt->bind_param("i", $messageId);
                $touchStmt->execute();
            }
            
            // Get all reactions for this message
            $stmt = $conn->prepare("SELECT reaction, COUNT(DISTINCT user_id) as count FROM message_reactions WHERE message_id = ? GROUP BY reaction");
            $stmt->bind_param("i", $messageId);
            $stmt->execute();
            $result = $stmt->get_result();
            
            $counts = [];
            while ($row = $result->fetch_assoc()) {
                $counts[$row['reaction']] = (int)$row['count'];
            }

            $mine = [];
            $mineStmt = $conn->prepare("SELECT DISTINCT reaction FROM message_reactions WHERE message_id = ? AND user_id = ?");
            $mineStmt->bind_param("ii", $messageId, $userId);
            $mineStmt->execute();
            $mineResult = $mineStmt->get_result();
            while ($row = $mineResult->fetch_assoc()) {
                $mine[] = $row['reaction'];
            }
            
            $conn->commit();
            if ($changed) {
                $conversationType = !empty($message['group_id']) ? 'group' : (!empty($message['channel_id']) ? 'channel' : 'direct');
                $conversationId = !empty($message['group_id']) ? (int) $message['group_id'] : (!empty($message['channel_id']) ? (int) $message['channel_id'] : (int) ($message['receiver_id'] ?? 0));
                $payload = [
                    'message_id' => $messageId,
                    'reaction' => $reaction,
                    'action' => $hasReaction ? 'remove' : 'add',
                    'counts' => $counts,
                    'actor_id' => (int) $userId,
                    'sender_id' => (int) ($message['sender_id'] ?? 0),
                    'receiver_id' => (int) ($message['receiver_id'] ?? 0),
                    'chat_type' => $conversationType
                ];
                if (!empty($message['group_id']) || !empty($message['channel_id'])) {
                    $memberIds = lc_get_chat_member_ids($conversationType, $conversationId, $conn);
                    foreach ($memberIds as $memberId) {
                        lc_record_event($memberId, $conversationId, $hasReaction ? 'reaction_remove' : 'reaction_add', $payload, $conn);
                    }
                } else {
                    $recipients = array_values(array_unique([(int) $message['sender_id'], (int) ($message['receiver_id'] ?? 0)]));
                    foreach ($recipients as $recipientId) {
                        if (!$recipientId) {
                            continue;
                        }
                        lc_record_event($recipientId, $conversationId, $hasReaction ? 'reaction_remove' : 'reaction_add', $payload, $conn);
                    }
                }
            }
            echo json_encode([
                'success' => true,
                'message' => $blocked ? 'Reaction limit reached' : 'Reaction updated',
                'reactions' => [
                    'counts' => $counts,
                    'mine' => $mine
                ]
            ]);
        } catch (Exception $e) {
            $conn->rollback();
            echo json_encode([
                'success' => false,
                'message' => 'Error updating reaction: ' . $e->getMessage()
            ]);
        }
        break;
    case 'channel_key':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            if (!isset($_GET['channel_id']) || !is_numeric($_GET['channel_id'])) {
                echo json_encode(['success' => false, 'message' => 'Missing or invalid channel_id']);
                exit;
            }
            $channelId = (int) $_GET['channel_id'];

            $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $channelId, $userId);
            $memberCheck->execute();
            $memberResult = $memberCheck->get_result();
            if ($memberResult->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Not a channel subscriber']);
                exit;
            }

            $stmt = $conn->prepare("SELECT wrapped_key FROM channel_keys WHERE channel_id = ? AND user_id = ? LIMIT 1");
            $stmt->bind_param("ii", $channelId, $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();

            echo json_encode([
                'success' => true,
                'wrapped_key' => $row ? $row['wrapped_key'] : null
            ]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        if (!isset($data['channel_id']) || !is_numeric($data['channel_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid channel_id']);
            exit;
        }

        $channelId = (int) $data['channel_id'];

        $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $channelId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Not a channel subscriber']);
            exit;
        }

        $keys = $data['keys'] ?? null;
        $wrappedKey = $data['wrapped_key'] ?? null;

        if (is_array($keys) && !empty($keys)) {
            $stmt = $conn->prepare(
                "INSERT INTO channel_keys (channel_id, user_id, wrapped_key)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE wrapped_key = VALUES(wrapped_key), updated_at = CURRENT_TIMESTAMP"
            );
            foreach ($keys as $entry) {
                $entryUserId = $entry['user_id'] ?? ($entry['userId'] ?? null);
                $entryWrapped = $entry['wrapped_key'] ?? ($entry['wrappedKey'] ?? null);
                if (!$entryUserId || !$entryWrapped) {
                    continue;
                }
                $memberId = (int) $entryUserId;
                $memberKey = $entryWrapped;
                $stmt->bind_param("iis", $channelId, $memberId, $memberKey);
                $stmt->execute();
            }
            appDebugLog("E2EE channel key stored for channel {$channelId} by user {$userId}");
            echo json_encode(['success' => true]);
            exit;
        }

        if ($wrappedKey) {
            $stmt = $conn->prepare(
                "INSERT INTO channel_keys (channel_id, user_id, wrapped_key)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE wrapped_key = VALUES(wrapped_key), updated_at = CURRENT_TIMESTAMP"
            );
            $stmt->bind_param("iis", $channelId, $userId, $wrappedKey);
            if ($stmt->execute()) {
                appDebugLog("E2EE channel key stored for channel {$channelId} by user {$userId}");
                echo json_encode(['success' => true]);
                exit;
            }
        }

        echo json_encode(['success' => false, 'message' => 'Missing keys payload']);
        break;
    case 'channel_members':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        if (!isset($_GET['channel_id']) || !is_numeric($_GET['channel_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid channel_id']);
            exit;
        }

        $channelId = (int) $_GET['channel_id'];
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $channelId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Not a channel subscriber']);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT u.user_id, u.username, u.full_name, u.profile_pic, cm.role
             FROM channel_members cm
             JOIN users u ON cm.user_id = u.user_id
             WHERE cm.channel_id = ?
             ORDER BY FIELD(cm.role, 'owner', 'admin', 'subscriber'), u.full_name ASC"
        );
        $stmt->bind_param("i", $channelId);
        $stmt->execute();
        $result = $stmt->get_result();

        $members = [];
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            if (empty($row['profile_pic'])) {
                $row['profile_pic'] = 'default.png';
            }
            $members[] = $row;
        }

        usort($members, function ($a, $b) {
            $order = ['owner' => 0, 'admin' => 1, 'subscriber' => 2];
            $roleA = $order[$a['role'] ?? 'subscriber'] ?? 99;
            $roleB = $order[$b['role'] ?? 'subscriber'] ?? 99;
            if ($roleA !== $roleB) {
                return $roleA <=> $roleB;
            }
            $nameA = $a['full_name'] ?? $a['username'] ?? '';
            $nameB = $b['full_name'] ?? $b['username'] ?? '';
            return strcasecmp($nameA, $nameB);
        });

        echo json_encode(['success' => true, 'members' => $members]);
        break;
    case 'chat_clear':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = $data['chatType'] ?? '';
        $chatId = $data['chatId'] ?? null;

        if (!in_array($chatType, ['direct', 'group', 'channel', 'saved'], true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat type']);
            exit;
        }

        if (!is_numeric($chatId)) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat ID']);
            exit;
        }

        $chatId = (int) $chatId;
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($chatType === 'group') {
            $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
            $memberCheck->execute();
            $memberResult = $memberCheck->get_result();
            if ($memberResult->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Not a group member']);
                exit;
            }
        }
        if ($chatType === 'channel') {
            $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
            $memberCheck->execute();
            $memberResult = $memberCheck->get_result();
            if ($memberResult->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Not a channel subscriber']);
                exit;
            }
        }

        try {
            $stmt = $conn->prepare(
                "INSERT INTO chat_clears (user_id, chat_type, chat_id, cleared_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE cleared_at = VALUES(cleared_at)"
            );
            $stmt->bind_param("isi", $userId, $chatType, $chatId);
            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'message' => 'Failed to clear chat']);
                exit;
            }

            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error clearing chat: ' . $e->getMessage()]);
        }
        break;
    case 'contacts':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];

        try {
            // Get contacts
            $contacts = getUserContacts($userId, $conn);
            
            // Make sure profile_pic is properly formatted for each contact
            foreach ($contacts as &$contact) {
                if (empty($contact['profile_pic'])) {
                    $contact['profile_pic'] = 'default.png';
                }
            }

            echo json_encode([
                'success' => true,
                'contacts' => $contacts
            ]);
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching contacts: ' . $e->getMessage()
            ]);
        }
        break;
    case 'conversations':
        // Set content type to JSON
        header('Content-Type: application/json; charset=utf-8');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        if (!$currentUser || empty($currentUser['user_id'])) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }
        $userId = $currentUser['user_id'];

        try {
            lc_dispatch_scheduled_messages($conn, 25);
            // Get conversations
            $conversations = Chat::getConversations($userId, $conn);
            if (!is_array($conversations)) {
                $conversations = [];
            }
            
            echo json_encode([
                'success' => true,
                'conversations' => $conversations
            ]);
        } catch (Throwable $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching conversations: ' . $e->getMessage()
            ]);
        }
        break;
    case 'create_channel':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $channelName = trim($data['channelName'] ?? '');
        $channelDescription = trim($data['channelDescription'] ?? '');
        $channelUsername = trim($data['channelUsername'] ?? '');
        $visibility = $data['visibility'] ?? 'public';

        $createResult = Chat::createChannel($userId, $channelName, $channelDescription, $channelUsername, $visibility, $conn);
        if (!$createResult['success']) {
            echo json_encode($createResult);
            exit;
        }

        $channelId = (int) $createResult['channel_id'];
        $memberIds = $data['memberIds'] ?? [];
        if (is_array($memberIds)) {
            foreach ($memberIds as $memberId) {
                $memberId = (int) $memberId;
                if ($memberId > 0 && $memberId !== $userId) {
                    Chat::addChannelMember($channelId, $memberId, 'subscriber', $userId, $conn);
                }
            }
        }

        echo json_encode(['success' => true, 'channel_id' => $channelId]);
        break;
    case 'create_group':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $groupName = trim($data['groupName'] ?? '');
        $groupDescription = trim($data['groupDescription'] ?? '');
        $groupUsername = trim($data['groupUsername'] ?? '');
        $joinPolicy = $data['joinPolicy'] ?? 'invite';

        $createResult = Chat::createGroup($userId, $groupName, $groupDescription, $groupUsername, $joinPolicy, $conn);
        if (!$createResult['success']) {
            echo json_encode($createResult);
            exit;
        }

        $groupId = (int) $createResult['group_id'];
        $memberIds = $data['memberIds'] ?? [];
        if (is_array($memberIds)) {
            foreach ($memberIds as $memberId) {
                $memberId = (int) $memberId;
                if ($memberId > 0 && $memberId !== $userId) {
                    Chat::addGroupMember($groupId, $memberId, 'member', $userId, $conn);
                }
            }
        }

        echo json_encode(['success' => true, 'group_id' => $groupId]);
        break;
    case 'current_user':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();

        // Remove sensitive information
        unset($currentUser['password']);
        unset($currentUser['password_reset_token']);
        unset($currentUser['password_reset_expires']);

        echo json_encode([
            'success' => true,
            'user' => $currentUser
        ]);
        break;
    case 'delete_chat':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = $data['chatType'] ?? '';
        $chatId = $data['chatId'] ?? null;
        $scope = $data['scope'] ?? 'me';

        if (!in_array($chatType, ['direct', 'group', 'channel', 'saved'], true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat type']);
            exit;
        }

        if (!in_array($scope, ['me', 'all'], true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid delete scope']);
            exit;
        }

        if (!is_numeric($chatId)) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat ID']);
            exit;
        }

        $chatId = (int) $chatId;
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        try {
            if ($scope === 'me') {
                $stmt = $conn->prepare(
                    "INSERT INTO chat_clears (user_id, chat_type, chat_id, cleared_at)
                     VALUES (?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE cleared_at = VALUES(cleared_at)"
                );
                $stmt->bind_param("isi", $userId, $chatType, $chatId);
                if (!$stmt->execute()) {
                    echo json_encode(['success' => false, 'message' => 'Failed to delete chat']);
                    exit;
                }
                echo json_encode(['success' => true]);
                exit;
            }

            if ($chatType === 'group') {
                $permissions = Chat::getGroupPermissions($chatId, $userId, $conn);
                if (!$permissions || $permissions['role'] === 'member' || empty($permissions['can_change_info'])) {
                    echo json_encode(['success' => false, 'message' => 'Only group admins can delete for everyone']);
                    exit;
                }
                $stmt = $conn->prepare("UPDATE messages SET is_deleted = 1, updated_at = NOW() WHERE group_id = ?");
                $stmt->bind_param("i", $chatId);
            } elseif ($chatType === 'channel') {
                $permissions = Chat::getChannelPermissions($chatId, $userId, $conn);
                if (!$permissions || empty($permissions['can_manage'])) {
                    echo json_encode(['success' => false, 'message' => 'Only channel admins can delete for everyone']);
                    exit;
                }
                $stmt = $conn->prepare("UPDATE messages SET is_deleted = 1, updated_at = NOW() WHERE channel_id = ?");
                $stmt->bind_param("i", $chatId);
            } elseif ($chatType === 'saved') {
                $stmt = $conn->prepare(
                    "UPDATE messages SET is_deleted = 1, updated_at = NOW()
                     WHERE group_id IS NULL AND sender_id = ? AND receiver_id = ?"
                );
                $stmt->bind_param("ii", $userId, $userId);
            } else {
                $stmt = $conn->prepare(
                    "UPDATE messages SET is_deleted = 1, updated_at = NOW()
                     WHERE group_id IS NULL
                       AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))"
                );
                $stmt->bind_param("iiii", $userId, $chatId, $chatId, $userId);
            }

            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'message' => 'Failed to delete chat']);
                exit;
            }

            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error deleting chat: ' . $e->getMessage()]);
        }
        break;
    case 'delete_message':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || !isset($data['message_id']) || !is_numeric($data['message_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid message_id']);
            exit;
        }

        $messageId = (int) $data['message_id'];
        $scope = $data['scope'] ?? 'me';
        if (!in_array($scope, ['me', 'all'], true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid delete scope']);
            exit;
        }

        try {
            $stmt = $conn->prepare("SELECT sender_id, receiver_id, group_id, channel_id FROM messages WHERE message_id = ? AND is_deleted = 0");
            $stmt->bind_param("i", $messageId);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Message not found']);
                exit;
            }

            $message = $result->fetch_assoc();
            $isParticipant = false;
            if (!empty($message['channel_id'])) {
                $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
                $memberCheck->bind_param("ii", $message['channel_id'], $userId);
                $memberCheck->execute();
                $memberResult = $memberCheck->get_result();
                $isParticipant = $memberResult->num_rows > 0;
            } elseif (!empty($message['group_id'])) {
                $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
                $memberCheck->bind_param("ii", $message['group_id'], $userId);
                $memberCheck->execute();
                $memberResult = $memberCheck->get_result();
                $isParticipant = $memberResult->num_rows > 0;
            } else {
                $isParticipant = ((int) $message['sender_id'] === (int) $userId) || ((int) $message['receiver_id'] === (int) $userId);
            }
            if (!$isParticipant) {
                echo json_encode(['success' => false, 'message' => 'You cannot delete this message']);
                exit;
            }

            if ($scope === 'all') {
                if (!empty($message['channel_id'])) {
                    $permissions = Chat::getChannelPermissions((int) $message['channel_id'], $userId, $conn);
                    if (!$permissions || empty($permissions['can_delete'])) {
                        echo json_encode(['success' => false, 'message' => 'You cannot delete channel posts']);
                        exit;
                    }
                } elseif ((int) $message['sender_id'] !== (int) $userId) {
                    echo json_encode(['success' => false, 'message' => 'You can only delete your own messages for everyone']);
                    exit;
                }
                $deleteStmt = $conn->prepare("UPDATE messages SET is_deleted = 1, updated_at = NOW() WHERE message_id = ?");
                $deleteStmt->bind_param("i", $messageId);

                if ($deleteStmt->execute()) {
                    $conversationType = !empty($message['group_id']) ? 'group' : (!empty($message['channel_id']) ? 'channel' : 'direct');
                    $conversationId = !empty($message['group_id']) ? (int) $message['group_id'] : (!empty($message['channel_id']) ? (int) $message['channel_id'] : (int) ($message['receiver_id'] ?? 0));
                    $payload = [
                        'message_id' => $messageId,
                        'scope' => 'all',
                        'sender_id' => (int) ($message['sender_id'] ?? 0),
                        'receiver_id' => (int) ($message['receiver_id'] ?? 0),
                        'chat_type' => $conversationType
                    ];
                    if (!empty($message['group_id']) || !empty($message['channel_id'])) {
                        $memberIds = lc_get_chat_member_ids($conversationType, $conversationId, $conn);
                        foreach ($memberIds as $memberId) {
                            lc_record_event($memberId, $conversationId, 'message_delete', $payload, $conn);
                        }
                    } else {
                        $recipients = array_values(array_unique([(int) $message['sender_id'], (int) ($message['receiver_id'] ?? 0)]));
                        foreach ($recipients as $recipientId) {
                            if (!$recipientId) {
                                continue;
                            }
                            lc_record_event($recipientId, $conversationId, 'message_delete', $payload, $conn);
                        }
                    }
                    echo json_encode(['success' => true, 'message' => 'Message deleted', 'scope' => 'all', 'message_id' => $messageId]);
                } else {
                    echo json_encode(['success' => false, 'message' => 'Failed to delete message']);
                }
                exit;
            }

            $deleteStmt = $conn->prepare(
                "INSERT INTO message_deletes (message_id, user_id, deleted_at)
                 VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at)"
            );
            $deleteStmt->bind_param("ii", $messageId, $userId);

            if ($deleteStmt->execute()) {
                $conversationType = !empty($message['group_id']) ? 'group' : (!empty($message['channel_id']) ? 'channel' : 'direct');
                $conversationId = !empty($message['group_id']) ? (int) $message['group_id'] : (!empty($message['channel_id']) ? (int) $message['channel_id'] : (int) ($message['receiver_id'] ?? 0));
                $payload = [
                    'message_id' => $messageId,
                    'scope' => 'me',
                    'sender_id' => (int) ($message['sender_id'] ?? 0),
                    'receiver_id' => (int) ($message['receiver_id'] ?? 0),
                    'chat_type' => $conversationType
                ];
                lc_record_event($userId, $conversationId, 'message_delete', $payload, $conn);
                echo json_encode(['success' => true, 'message' => 'Message deleted', 'scope' => 'me', 'message_id' => $messageId]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Failed to delete message']);
            }
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error deleting message: ' . $e->getMessage()]);
        }
        break;
    case 'devices':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        if (!$currentUser) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $userId = (int) $currentUser['user_id'];
        $currentDeviceId = getDeviceIdFromCookie();

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $conn->prepare(
                "SELECT device_id, device_name, user_agent, created_at, last_active
                 FROM user_devices
                 WHERE user_id = ? AND revoked_at IS NULL
                 ORDER BY last_active DESC"
            );
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            $devices = [];
            while ($row = $result->fetch_assoc()) {
                $row['is_current'] = ($currentDeviceId && $row['device_id'] === $currentDeviceId) ? 1 : 0;
                $devices[] = $row;
            }
            echo json_encode([
                'success' => true,
                'devices' => $devices,
                'current_device_id' => $currentDeviceId
            ]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['action'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid request']);
            exit;
        }

        if ($data['action'] === 'revoke') {
            if (empty($data['device_id'])) {
                echo json_encode(['success' => false, 'message' => 'Missing device_id']);
                exit;
            }
            $deviceId = $data['device_id'];
            $stmt = $conn->prepare(
                "UPDATE user_devices SET revoked_at = NOW() WHERE user_id = ? AND device_id = ?"
            );
            $stmt->bind_param("is", $userId, $deviceId);
            $stmt->execute();
            $forceLogout = $currentDeviceId && $deviceId === $currentDeviceId;
            if ($forceLogout) {
                session_unset();
                session_destroy();
            }
            echo json_encode([
                'success' => true,
                'force_logout' => $forceLogout
            ]);
            exit;
        }

        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
    case 'disappearing':
        header('Content-Type: application/json');

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

        $allowedDurations = [0, 3600, 86400, 604800];

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $chatType = $_GET['chat_type'] ?? '';
            $chatId = isset($_GET['chat_id']) ? (int) $_GET['chat_id'] : 0;
            if (!$chatType || !$chatId) {
                echo json_encode(['success' => false, 'message' => 'Missing chat parameters']);
                exit;
            }

            if ($chatType === 'group') {
                $stmt = $conn->prepare("SELECT disappear_after_seconds FROM groups WHERE group_id = ?");
                $stmt->bind_param("i", $chatId);
                $stmt->execute();
                $result = $stmt->get_result();
                $row = $result->fetch_assoc();
                echo json_encode(['success' => true, 'disappear_after_seconds' => (int) ($row['disappear_after_seconds'] ?? 0)]);
                exit;
            }
            if ($chatType === 'channel') {
                $stmt = $conn->prepare("SELECT disappear_after_seconds FROM channels WHERE channel_id = ?");
                $stmt->bind_param("i", $chatId);
                $stmt->execute();
                $result = $stmt->get_result();
                $row = $result->fetch_assoc();
                echo json_encode(['success' => true, 'disappear_after_seconds' => (int) ($row['disappear_after_seconds'] ?? 0)]);
                exit;
            }
            if ($chatType === 'direct' || $chatType === 'saved') {
                $otherId = $chatType === 'saved' ? $userId : $chatId;
                $seconds = getDirectChatDisappearSeconds($userId, $otherId, $conn);
                echo json_encode(['success' => true, 'disappear_after_seconds' => (int) $seconds]);
                exit;
            }

            echo json_encode(['success' => false, 'message' => 'Invalid chat type']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = $data['chat_type'] ?? '';
        $chatId = isset($data['chat_id']) ? (int) $data['chat_id'] : 0;
        $seconds = isset($data['disappear_after_seconds']) ? (int) $data['disappear_after_seconds'] : 0;
        if (!$chatType || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Missing chat parameters']);
            exit;
        }
        if (!in_array($seconds, $allowedDurations, true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid duration']);
            exit;
        }

        if ($chatType === 'group') {
            $permissions = Chat::getGroupPermissions($chatId, $userId, $conn);
            if (!$permissions || empty($permissions['can_change_info'])) {
                echo json_encode(['success' => false, 'message' => 'You do not have permission to change this setting']);
                exit;
            }
            $stmt = $conn->prepare("UPDATE groups SET disappear_after_seconds = ? WHERE group_id = ?");
            $stmt->bind_param("ii", $seconds, $chatId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        if ($chatType === 'channel') {
            $permissions = Chat::getChannelPermissions($chatId, $userId, $conn);
            if (!$permissions || empty($permissions['can_manage'])) {
                echo json_encode(['success' => false, 'message' => 'You do not have permission to change this setting']);
                exit;
            }
            $stmt = $conn->prepare("UPDATE channels SET disappear_after_seconds = ? WHERE channel_id = ?");
            $stmt->bind_param("ii", $seconds, $chatId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        if ($chatType === 'direct' || $chatType === 'saved') {
            $otherId = $chatType === 'saved' ? $userId : $chatId;
            $ok = setDirectChatDisappearSeconds($userId, $otherId, $seconds, $userId, $conn);
            echo json_encode(['success' => $ok]);
            exit;
        }

        echo json_encode(['success' => false, 'message' => 'Invalid chat type']);
        break;
    case 'edit_message':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        if (!isset($data['message_id']) || !is_numeric($data['message_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid message_id']);
            exit;
        }

        $rawText = $data['message_text'] ?? ($data['messageText'] ?? ($data['text'] ?? null));
        if ($rawText === null && isset($data['encryptedContent'])) {
            $rawText = is_string($data['encryptedContent']) ? $data['encryptedContent'] : json_encode($data['encryptedContent']);
        }
        if ($rawText === null || trim($rawText) === '') {
            echo json_encode(['success' => false, 'message' => 'Message text cannot be empty']);
            exit;
        }

        $messageId = (int) $data['message_id'];
        $encryptedContent = Encryption::encryptMessage($rawText);

        try {
            $stmt = $conn->prepare("SELECT sender_id, receiver_id, group_id, channel_id, message_type FROM messages WHERE message_id = ?");
            $stmt->bind_param("i", $messageId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($result->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Message not found']);
                exit;
            }

            $message = $result->fetch_assoc();
            if (!empty($message['channel_id'])) {
                $permissions = Chat::getChannelPermissions((int) $message['channel_id'], $userId, $conn);
                if (!$permissions || empty($permissions['can_edit'])) {
                    echo json_encode(['success' => false, 'message' => 'You cannot edit channel posts']);
                    exit;
                }
            } elseif ((int) $message['sender_id'] !== (int) $userId) {
                echo json_encode(['success' => false, 'message' => 'You can only edit your own messages']);
                exit;
            }

            if ($message['message_type'] !== 'text') {
                echo json_encode(['success' => false, 'message' => 'Only text messages can be edited']);
                exit;
            }

            $keySender = $data['keySender'] ?? null;
            $keyRecipient = $data['keyRecipient'] ?? null;

            $updateStmt = $conn->prepare(
                "UPDATE messages SET encrypted_content = ?, key_sender = ?, key_recipient = ?, updated_at = NOW(), edited_at = NOW() WHERE message_id = ?"
            );
            $updateStmt->bind_param("sssi", $encryptedContent, $keySender, $keyRecipient, $messageId);
            $updateStmt->execute();

            if ((!empty($message['group_id']) || !empty($message['channel_id'])) && isset($data['messageKeys']) && is_array($data['messageKeys'])) {
                $conn->query("DELETE FROM message_keys WHERE message_id = " . (int) $messageId);
                $keyStmt = $conn->prepare("INSERT INTO message_keys (message_id, user_id, wrapped_key) VALUES (?, ?, ?)");
                foreach ($data['messageKeys'] as $entry) {
                    if (!isset($entry['userId'], $entry['wrappedKey'])) {
                        continue;
                    }
                    $memberId = (int) $entry['userId'];
                    $wrappedKey = $entry['wrappedKey'];
                    $keyStmt->bind_param("iis", $messageId, $memberId, $wrappedKey);
                    $keyStmt->execute();
                }
            }

            $conversationType = !empty($message['group_id']) ? 'group' : (!empty($message['channel_id']) ? 'channel' : 'direct');
            $conversationId = !empty($message['group_id']) ? (int) $message['group_id'] : (!empty($message['channel_id']) ? (int) $message['channel_id'] : (int) ($message['receiver_id'] ?? 0));
            $payloadBase = [
                'message_id' => $messageId,
                'sender_id' => (int) $message['sender_id'],
                'receiver_id' => $message['receiver_id'] ?? null,
                'group_id' => $message['group_id'] ?? null,
                'channel_id' => $message['channel_id'] ?? null,
                'message_type' => $message['message_type'],
                'message_text' => $rawText,
                'text' => $rawText,
                'encrypted_content' => $rawText,
                'key_sender' => null,
                'key_recipient' => null,
                'updated_at' => date('Y-m-d H:i:s'),
                'edited_at' => date('Y-m-d H:i:s'),
                'chat_type' => $conversationType
            ];
            if (!empty($message['group_id']) || !empty($message['channel_id'])) {
                $memberIds = lc_get_chat_member_ids($conversationType, $conversationId, $conn);
                $keyMap = [];
                if (isset($data['messageKeys']) && is_array($data['messageKeys'])) {
                    foreach ($data['messageKeys'] as $entry) {
                        $entryUserId = $entry['userId'] ?? ($entry['user_id'] ?? null);
                        $entryWrapped = $entry['wrappedKey'] ?? ($entry['wrapped_key'] ?? null);
                        if ($entryUserId && $entryWrapped) {
                            $keyMap[(int) $entryUserId] = $entryWrapped;
                        }
                    }
                }
                foreach ($memberIds as $memberId) {
                    $payload = $payloadBase;
                    $payload['key_for_user'] = $keyMap[$memberId] ?? null;
                    lc_record_event($memberId, $conversationId, 'message_edit', $payload, $conn);
                }
            } else {
                $recipients = array_values(array_unique([(int) $message['sender_id'], (int) ($message['receiver_id'] ?? 0)]));
                foreach ($recipients as $recipientId) {
                    if (!$recipientId) {
                        continue;
                    }
                    lc_record_event($recipientId, $conversationId, 'message_edit', $payloadBase, $conn);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => 'Message updated successfully',
                'message_id' => $messageId
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error updating message: ' . $e->getMessage()]);
        }
        break;
    case 'folders':
        header('Content-Type: application/json');

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

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $conn->prepare("SELECT id, name, sort_order, created_at FROM user_folders WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC");
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            $folders = [];
            while ($row = $result->fetch_assoc()) {
                if ($row['name'] === '__seed__') {
                    continue;
                }
                $folders[] = $row;
            }

            $folderIds = array_map(function ($row) { return (int) $row['id']; }, $folders);
            $assignments = [];
            if ($folderIds) {
                $placeholders = implode(',', array_fill(0, count($folderIds), '?'));
                $types = str_repeat('i', count($folderIds));
                $assignStmt = $conn->prepare(
                    "SELECT folder_id, conversation_type, conversation_id
                     FROM user_folder_chats
                     WHERE folder_id IN ($placeholders)"
                );
                $assignStmt->bind_param($types, ...$folderIds);
                $assignStmt->execute();
                $assignResult = $assignStmt->get_result();
                while ($row = $assignResult->fetch_assoc()) {
                    $folderId = (int) $row['folder_id'];
                    if (!isset($assignments[$folderId])) {
                        $assignments[$folderId] = [];
                    }
                    $assignments[$folderId][] = [
                        'type' => $row['conversation_type'],
                        'id' => (int) $row['conversation_id']
                    ];
                }
            }

            echo json_encode(['success' => true, 'folders' => $folders, 'assignments' => $assignments]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $action = $data['action'] ?? '';
        if (!in_array($action, ['create', 'rename', 'delete', 'reorder', 'assign'], true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
            exit;
        }

        if ($action === 'create') {
            $name = trim((string) ($data['name'] ?? ''));
            if ($name === '') {
                echo json_encode(['success' => false, 'message' => 'Folder name is required']);
                exit;
            }
            if ($name === $seedName) {
                echo json_encode(['success' => false, 'message' => 'Folder name is not available']);
                exit;
            }
            if (strlen($name) > 64) {
                $name = substr($name, 0, 64);
            }
            $orderStmt = $conn->prepare("SELECT COALESCE(MAX(sort_order), 0) as max_order FROM user_folders WHERE user_id = ?");
            $orderStmt->bind_param("i", $userId);
            $orderStmt->execute();
            $orderResult = $orderStmt->get_result();
            $maxOrder = 0;
            if ($row = $orderResult->fetch_assoc()) {
                $maxOrder = (int) $row['max_order'];
            }
            $sortOrder = $maxOrder + 1;
            $stmt = $conn->prepare("INSERT INTO user_folders (user_id, name, sort_order) VALUES (?, ?, ?)");
            $stmt->bind_param("isi", $userId, $name, $sortOrder);
            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'message' => 'Failed to create folder']);
                exit;
            }
            echo json_encode(['success' => true, 'folder' => ['id' => $stmt->insert_id, 'name' => $name, 'sort_order' => $sortOrder]]);
            exit;
        }

        $folderId = isset($data['folder_id']) ? (int) $data['folder_id'] : 0;
        if ($folderId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Folder not found']);
            exit;
        }

        $ownerStmt = $conn->prepare("SELECT id, name FROM user_folders WHERE id = ? AND user_id = ?");
        $ownerStmt->bind_param("ii", $folderId, $userId);
        $ownerStmt->execute();
        $ownerResult = $ownerStmt->get_result();
        $ownerRow = $ownerResult->fetch_assoc();
        if (!$ownerRow) {
            echo json_encode(['success' => false, 'message' => 'Folder not found']);
            exit;
        }
        if ($ownerRow['name'] === $seedName) {
            echo json_encode(['success' => false, 'message' => 'Folder not found']);
            exit;
        }

        if ($action === 'rename') {
            $name = trim((string) ($data['name'] ?? ''));
            if ($name === '') {
                echo json_encode(['success' => false, 'message' => 'Folder name is required']);
                exit;
            }
            if ($name === $seedName) {
                echo json_encode(['success' => false, 'message' => 'Folder name is not available']);
                exit;
            }
            if (strlen($name) > 64) {
                $name = substr($name, 0, 64);
            }
            $stmt = $conn->prepare("UPDATE user_folders SET name = ? WHERE id = ? AND user_id = ?");
            $stmt->bind_param("sii", $name, $folderId, $userId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'delete') {
            $stmt = $conn->prepare("DELETE FROM user_folders WHERE id = ? AND user_id = ?");
            $stmt->bind_param("ii", $folderId, $userId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'reorder') {
            $order = $data['order'] ?? [];
            if (!is_array($order)) {
                echo json_encode(['success' => false, 'message' => 'Invalid order list']);
                exit;
            }
            $sort = 1;
            $update = $conn->prepare("UPDATE user_folders SET sort_order = ? WHERE id = ? AND user_id = ?");
            foreach ($order as $id) {
                $id = (int) $id;
                if ($id <= 0) {
                    continue;
                }
                $update->bind_param("iii", $sort, $id, $userId);
                $update->execute();
                $sort += 1;
            }
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'assign') {
            $chats = $data['chats'] ?? [];
            if (!is_array($chats)) {
                echo json_encode(['success' => false, 'message' => 'Invalid assignments']);
                exit;
            }
            $valid = [];
            foreach ($chats as $chat) {
                if (!is_array($chat)) {
                    continue;
                }
                $type = $chat['type'] ?? '';
                $id = isset($chat['id']) ? (int) $chat['id'] : 0;
                if (!in_array($type, ['direct', 'group', 'channel', 'saved'], true)) {
                    continue;
                }
                if ($id <= 0) {
                    continue;
                }
                $key = $type . ':' . $id;
                $valid[$key] = ['type' => $type, 'id' => $id];
            }
            $conn->begin_transaction();
            try {
                $del = $conn->prepare("DELETE FROM user_folder_chats WHERE folder_id = ?");
                $del->bind_param("i", $folderId);
                $del->execute();
                if ($valid) {
                    $insert = $conn->prepare("INSERT INTO user_folder_chats (folder_id, conversation_type, conversation_id) VALUES (?, ?, ?)");
                    foreach ($valid as $entry) {
                        $insert->bind_param("isi", $folderId, $entry['type'], $entry['id']);
                        $insert->execute();
                    }
                }
                $conn->commit();
                echo json_encode(['success' => true]);
                exit;
            } catch (Exception $e) {
                $conn->rollback();
                echo json_encode(['success' => false, 'message' => 'Failed to update folder assignments']);
                exit;
            }
        }
        break;
    case 'get_reactions':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];
        ensureReactionSchema($conn);

        // Check if message_ids is provided
        if (!isset($_GET['message_ids'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Missing message_ids parameter'
            ]);
            exit;
        }

        $messageIds = explode(',', $_GET['message_ids']);
        $messageIds = array_map('intval', $messageIds); // Ensure all IDs are integers

        if (empty($messageIds)) {
            echo json_encode([
                'success' => false,
                'message' => 'No valid message IDs provided'
            ]);
            exit;
        }

        try {
            // Prepare the IN clause
            $placeholders = str_repeat('?,', count($messageIds) - 1) . '?';
            
            // Get all reactions for these messages
            $stmt = $conn->prepare("SELECT message_id, reaction, COUNT(DISTINCT user_id) as count FROM message_reactions WHERE message_id IN ($placeholders) GROUP BY message_id, reaction");
            
            // Bind all message IDs
            $types = str_repeat('i', count($messageIds));
            $stmt->bind_param($types, ...$messageIds);
            
            $stmt->execute();
            $result = $stmt->get_result();
            
            // Group reactions by message ID
            $reactions = [];
            while ($row = $result->fetch_assoc()) {
                $messageId = $row['message_id'];
                $reaction = $row['reaction'];
                $count = (int)$row['count'];
                
                if (!isset($reactions[$messageId])) {
                    $reactions[$messageId] = ['counts' => [], 'mine' => []];
                }
                
                $reactions[$messageId]['counts'][$reaction] = $count;
            }

            $mineStmt = $conn->prepare("SELECT DISTINCT message_id, reaction FROM message_reactions WHERE message_id IN ($placeholders) AND user_id = ?");
            $typesMine = $types . 'i';
            $params = array_merge($messageIds, [$userId]);
            $mineStmt->bind_param($typesMine, ...$params);
            $mineStmt->execute();
            $mineResult = $mineStmt->get_result();
            while ($row = $mineResult->fetch_assoc()) {
                $messageId = $row['message_id'];
                if (!isset($reactions[$messageId])) {
                    $reactions[$messageId] = ['counts' => [], 'mine' => []];
                }
                $reactions[$messageId]['mine'][] = $row['reaction'];
            }
            
            echo json_encode([
                'success' => true,
                'reactions' => $reactions
            ]);
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching reactions: ' . $e->getMessage()
            ]);
        }
        break;
    case 'group':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];

        // Check if group_id is provided
        if (!isset($_GET['group_id']) || !is_numeric($_GET['group_id'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Missing or invalid group_id'
            ]);
            exit;
        }

        $groupId = (int)$_GET['group_id'];

        try {
            // Check if user is a member of the group
            $memberCheck = $conn->prepare("SELECT * FROM group_members WHERE group_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $groupId, $userId);
            $memberCheck->execute();
            $memberResult = $memberCheck->get_result();
            
            if ($memberResult->num_rows === 0) {
                echo json_encode([
                    'success' => false,
                    'message' => 'You are not a member of this group'
                ]);
                exit;
            }
            
            // Get group data
            $stmt = $conn->prepare("
                SELECT g.*, u.username as creator_name 
                FROM groups g
                JOIN users u ON g.created_by = u.user_id
                WHERE g.group_id = ?
            ");
            $stmt->bind_param("i", $groupId);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $group = $result->fetch_assoc();
                
                // Get member count
                $countStmt = $conn->prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ?");
                $countStmt->bind_param("i", $groupId);
                $countStmt->execute();
                $countResult = $countStmt->get_result();
                $countRow = $countResult->fetch_assoc();
                
                $group['member_count'] = $countRow['count'];
                
                // Make sure group_pic contains the correct path
                if (empty($group['group_pic'])) {
                    $group['group_pic'] = 'default_group.png';
                }
                
                echo json_encode([
                    'success' => true,
                    'group' => $group
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => 'Group not found'
                ]);
            }
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching group data: ' . $e->getMessage()
            ]);
        }
        break;
    case 'group_key':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            if (!isset($_GET['group_id']) || !is_numeric($_GET['group_id'])) {
                echo json_encode(['success' => false, 'message' => 'Missing or invalid group_id']);
                exit;
            }
            $groupId = (int) $_GET['group_id'];

            $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $groupId, $userId);
            $memberCheck->execute();
            $memberResult = $memberCheck->get_result();
            if ($memberResult->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Not a group member']);
                exit;
            }

            $stmt = $conn->prepare("SELECT wrapped_key FROM group_keys WHERE group_id = ? AND user_id = ? LIMIT 1");
            $stmt->bind_param("ii", $groupId, $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();

            echo json_encode([
                'success' => true,
                'wrapped_key' => $row ? $row['wrapped_key'] : null
            ]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        if (!isset($data['group_id']) || !is_numeric($data['group_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid group_id']);
            exit;
        }

        $groupId = (int) $data['group_id'];

        $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $groupId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Not a group member']);
            exit;
        }

        $keys = $data['keys'] ?? null;
        $wrappedKey = $data['wrapped_key'] ?? null;

        if (is_array($keys) && !empty($keys)) {
            $stmt = $conn->prepare(
                "INSERT INTO group_keys (group_id, user_id, wrapped_key)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE wrapped_key = VALUES(wrapped_key), updated_at = CURRENT_TIMESTAMP"
            );
            foreach ($keys as $entry) {
                $entryUserId = $entry['user_id'] ?? ($entry['userId'] ?? null);
                $entryWrapped = $entry['wrapped_key'] ?? ($entry['wrappedKey'] ?? null);
                if (!$entryUserId || !$entryWrapped) {
                    continue;
                }
                $memberId = (int) $entryUserId;
                $memberKey = $entryWrapped;
                $stmt->bind_param("iis", $groupId, $memberId, $memberKey);
                $stmt->execute();
            }
            appDebugLog("E2EE group key stored for group {$groupId} by user {$userId}");
            echo json_encode(['success' => true]);
            exit;
        }

        if ($wrappedKey) {
            $stmt = $conn->prepare(
                "INSERT INTO group_keys (group_id, user_id, wrapped_key)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE wrapped_key = VALUES(wrapped_key), updated_at = CURRENT_TIMESTAMP"
            );
            $stmt->bind_param("iis", $groupId, $userId, $wrappedKey);
            if ($stmt->execute()) {
                appDebugLog("E2EE group key stored for group {$groupId} by user {$userId}");
                echo json_encode(['success' => true]);
                exit;
            }
        }

        echo json_encode(['success' => false, 'message' => 'Missing keys payload']);
        break;
    case 'group_members':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        if (!isset($_GET['group_id']) || !is_numeric($_GET['group_id'])) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid group_id']);
            exit;
        }

        $groupId = (int) $_GET['group_id'];
        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $groupId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Not a group member']);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT u.user_id, u.username, u.full_name, u.profile_pic, gm.role
             FROM group_members gm
             JOIN users u ON gm.user_id = u.user_id
             WHERE gm.group_id = ?
             ORDER BY FIELD(gm.role, 'owner', 'admin', 'member'), u.full_name ASC"
        );
        $stmt->bind_param("i", $groupId);
        $stmt->execute();
        $result = $stmt->get_result();

        $members = [];
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            if (empty($row['profile_pic'])) {
                $row['profile_pic'] = 'default.png';
            }
            $members[] = $row;
        }

        usort($members, function ($a, $b) {
            $order = ['owner' => 0, 'admin' => 1, 'member' => 2];
            $roleA = $order[$a['role'] ?? 'member'] ?? 99;
            $roleB = $order[$b['role'] ?? 'member'] ?? 99;
            if ($roleA !== $roleB) {
                return $roleA <=> $roleB;
            }
            $nameA = $a['full_name'] ?? $a['username'] ?? '';
            $nameB = $b['full_name'] ?? $b['username'] ?? '';
            return strcasecmp($nameA, $nameB);
        });

        echo json_encode(['success' => true, 'members' => $members]);
        break;
    case 'join_channel':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $channelUsername = trim($data['channelUsername'] ?? '');
        if ($channelUsername === '') {
            echo json_encode(['success' => false, 'message' => 'Missing channel username']);
            exit;
        }

        $stmt = $conn->prepare("SELECT channel_id, visibility FROM channels WHERE channel_username = ?");
        $stmt->bind_param("s", $channelUsername);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Channel not found']);
            exit;
        }

        $channel = $result->fetch_assoc();
        if ($channel['visibility'] !== 'public') {
            echo json_encode(['success' => false, 'message' => 'This channel is private']);
            exit;
        }

        $channelId = (int) $channel['channel_id'];
        $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $channelId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows > 0) {
            echo json_encode(['success' => true, 'channel_id' => $channelId]);
            exit;
        }

        $joinStmt = $conn->prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'subscriber')");
        $joinStmt->bind_param("ii", $channelId, $userId);
        if (!$joinStmt->execute()) {
            echo json_encode(['success' => false, 'message' => 'Failed to join channel']);
            exit;
        }

        echo json_encode(['success' => true, 'channel_id' => $channelId]);
        break;
    case 'join_group':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['groupUsername'])) {
            echo json_encode(['success' => false, 'message' => 'Missing group username']);
            exit;
        }

        $groupUsername = trim($data['groupUsername']);

        $stmt = $conn->prepare("SELECT group_id, join_policy FROM groups WHERE group_username = ?");
        $stmt->bind_param("s", $groupUsername);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Group not found']);
            exit;
        }

        $group = $result->fetch_assoc();
        if ($group['join_policy'] !== 'public') {
            echo json_encode(['success' => false, 'message' => 'Group is invite-only']);
            exit;
        }

        $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $group['group_id'], $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows > 0) {
            echo json_encode(['success' => true, 'group_id' => (int) $group['group_id']]);
            exit;
        }

        $addStmt = $conn->prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')");
        $addStmt->bind_param("ii", $group['group_id'], $userId);
        $addStmt->execute();

        echo json_encode(['success' => true, 'group_id' => (int) $group['group_id']]);
        break;
    case 'keys':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $keys = Encryption::getUserKeys($userId, $conn);
            $settings = getUserSettings($userId, $conn);
            echo json_encode([
                'success' => true,
                'keys' => $keys,
                'settings' => $settings
            ]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        if (empty($data['publicKey'])) {
            echo json_encode(['success' => false, 'message' => 'Missing public key']);
            exit;
        }

        $publicKey = $data['publicKey'];
        $encryptedPrivateKey = $data['encryptedPrivateKey'] ?? null;
        $keyParams = $data['keyParams'] ?? null;

        if (is_array($keyParams)) {
            $keyParams = json_encode($keyParams);
        }
        if ($encryptedPrivateKey === '') {
            $encryptedPrivateKey = null;
            $keyParams = null;
        }

        if (!Encryption::storeUserKeys($userId, $publicKey, $encryptedPrivateKey, $keyParams, $conn)) {
            echo json_encode(['success' => false, 'message' => 'Failed to store keys']);
            exit;
        }

        $settings = getUserSettings($userId, $conn);
        if (!empty($encryptedPrivateKey)) {
            $settings['key_sync_enabled'] = 1;
            saveUserSettings($userId, $settings, $conn);
        }

        echo json_encode(['success' => true]);
        break;
    case 'mark_seen':
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

        ensureConversationReadSchema($conn);

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = isset($data['chatType']) ? (string) $data['chatType'] : (string) ($data['chat_type'] ?? '');
        $chatId = isset($data['chatId']) ? (int) $data['chatId'] : (int) ($data['chat_id'] ?? 0);
        $requestedMessageId = isset($data['messageId']) ? (int) $data['messageId'] : (int) ($data['message_id'] ?? 0);

        if (!in_array($chatType, ['direct', 'saved', 'group', 'channel'], true) || $requestedMessageId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Invalid request']);
            exit;
        }

        if ($chatType === 'saved') {
            $chatId = $userId;
        }
        if ($chatId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat']);
            exit;
        }

        $maxSeenMessageId = 0;
        $peerUserId = null;
        $storeType = $chatType;

        if ($chatType === 'group') {
            $memberStmt = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1");
            $memberStmt->bind_param("ii", $chatId, $userId);
            $memberStmt->execute();
            if ($memberStmt->get_result()->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'You are not a member of this group']);
                exit;
            }
            $maxStmt = $conn->prepare(
                "SELECT MAX(message_id) AS max_id
                 FROM messages
                 WHERE group_id = ?
                   AND is_deleted = 0
                   AND sender_id != ?
                   AND message_id <= ?"
            );
            $maxStmt->bind_param("iii", $chatId, $userId, $requestedMessageId);
            $maxStmt->execute();
            $maxRow = $maxStmt->get_result()->fetch_assoc();
            $maxSeenMessageId = (int) ($maxRow['max_id'] ?? 0);
        } elseif ($chatType === 'channel') {
            $memberStmt = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ? LIMIT 1");
            $memberStmt->bind_param("ii", $chatId, $userId);
            $memberStmt->execute();
            if ($memberStmt->get_result()->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'You are not subscribed to this channel']);
                exit;
            }
            $maxStmt = $conn->prepare(
                "SELECT MAX(message_id) AS max_id
                 FROM messages
                 WHERE channel_id = ?
                   AND is_deleted = 0
                   AND sender_id != ?
                   AND message_id <= ?"
            );
            $maxStmt->bind_param("iii", $chatId, $userId, $requestedMessageId);
            $maxStmt->execute();
            $maxRow = $maxStmt->get_result()->fetch_assoc();
            $maxSeenMessageId = (int) ($maxRow['max_id'] ?? 0);
        } else {
            $peerUserId = ($chatType === 'saved') ? $userId : $chatId;
            $maxStmt = $conn->prepare(
                "SELECT MAX(message_id) AS max_id
                 FROM messages
                 WHERE group_id IS NULL
                   AND channel_id IS NULL
                   AND is_deleted = 0
                   AND sender_id = ?
                   AND receiver_id = ?
                   AND message_id <= ?"
            );
            $maxStmt->bind_param("iii", $peerUserId, $userId, $requestedMessageId);
            $maxStmt->execute();
            $maxRow = $maxStmt->get_result()->fetch_assoc();
            $maxSeenMessageId = (int) ($maxRow['max_id'] ?? 0);
        }

        $currentSeenId = 0;
        $currentSeenAt = null;
        $seenStmt = $conn->prepare(
            "SELECT last_seen_message_id, seen_at
             FROM conversation_reads
             WHERE user_id = ? AND chat_type = ? AND chat_id = ?
             LIMIT 1"
        );
        $seenStmt->bind_param("isi", $userId, $storeType, $chatId);
        $seenStmt->execute();
        $seenResult = $seenStmt->get_result();
        if ($seenRow = $seenResult->fetch_assoc()) {
            $currentSeenId = (int) ($seenRow['last_seen_message_id'] ?? 0);
            $currentSeenAt = $seenRow['seen_at'] ?? null;
        }

        $nextSeenId = max($currentSeenId, $maxSeenMessageId);
        $updated = false;
        $seenAt = $currentSeenAt;

        if ($nextSeenId > $currentSeenId) {
            $upsertStmt = $conn->prepare(
                "INSERT INTO conversation_reads (user_id, chat_type, chat_id, last_seen_message_id, seen_at, created_at)
                 VALUES (?, ?, ?, ?, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    last_seen_message_id = VALUES(last_seen_message_id),
                    seen_at = NOW()"
            );
            $upsertStmt->bind_param("isii", $userId, $storeType, $chatId, $nextSeenId);
            $upsertStmt->execute();
            $updated = true;
            $seenAt = date('Y-m-d H:i:s');
        }

        if ($peerUserId !== null && $peerUserId !== $userId && $maxSeenMessageId > 0) {
            $readStmt = $conn->prepare(
                "UPDATE messages
                 SET read_at = NOW()
                 WHERE group_id IS NULL
                   AND channel_id IS NULL
                   AND sender_id = ?
                   AND receiver_id = ?
                   AND message_id <= ?
                   AND read_at IS NULL"
            );
            $readStmt->bind_param("iii", $peerUserId, $userId, $maxSeenMessageId);
            $readStmt->execute();
            if ($readStmt->affected_rows > 0) {
                $payload = [
                    'message_id' => $maxSeenMessageId,
                    'delivered_at' => null,
                    'read_at' => date('Y-m-d H:i:s'),
                    'chat_type' => 'direct'
                ];
                lc_record_event($peerUserId, $userId, 'seen_update', $payload, $conn);
            }
        }

        echo json_encode([
            'success' => true,
            'seen_message_id' => $nextSeenId,
            'seen_at' => $seenAt,
            'updated' => $updated ? 1 : 0
        ]);
        break;
    case 'messages':
        // Set content type to JSON
        header('Content-Type: application/json');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

        // Disable error reporting for production to prevent HTML errors
        error_reporting(0);
        ini_set('display_errors', 0);

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];
        ensureReactionSchema($conn);
        cleanupExpiredMessages($conn, 200);
        lc_dispatch_scheduled_messages($conn, 25);

        if (!function_exists('loadReactionUpdates')) {
            function loadReactionUpdates($conn, $messageIds, $userId) {
                if (!$messageIds) {
                    return [];
                }
                $ids = array_values(array_filter(array_map('intval', $messageIds)));
                if (!$ids) {
                    return [];
                }
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $types = str_repeat('i', count($ids));
                $stmt = $conn->prepare(
                    "SELECT message_id, reaction, COUNT(DISTINCT user_id) as count
                     FROM message_reactions
                     WHERE message_id IN ($placeholders)
                     GROUP BY message_id, reaction"
                );
                $stmt->bind_param($types, ...$ids);
                $stmt->execute();
                $result = $stmt->get_result();
                $reactions = [];
                while ($row = $result->fetch_assoc()) {
                    $messageId = (int) $row['message_id'];
                    if (!isset($reactions[$messageId])) {
                        $reactions[$messageId] = ['counts' => [], 'mine' => []];
                    }
                    $reactions[$messageId]['counts'][$row['reaction']] = (int) $row['count'];
                }
                $mineStmt = $conn->prepare(
                    "SELECT DISTINCT message_id, reaction
                     FROM message_reactions
                     WHERE message_id IN ($placeholders)
                       AND user_id = ?"
                );
                $typesMine = $types . 'i';
                $params = array_merge($ids, [$userId]);
                $mineStmt->bind_param($typesMine, ...$params);
                $mineStmt->execute();
                $mineResult = $mineStmt->get_result();
                while ($row = $mineResult->fetch_assoc()) {
                    $messageId = (int) $row['message_id'];
                    if (!isset($reactions[$messageId])) {
                        $reactions[$messageId] = ['counts' => [], 'mine' => []];
                    }
                    $reactions[$messageId]['mine'][] = $row['reaction'];
                }
                return $reactions;
            }
        }

        if (!function_exists('loadMentionsMap')) {
            function loadMentionsMap($conn, $messageIds) {
                if (!$messageIds) {
                    return [];
                }
                $ids = array_values(array_filter(array_map('intval', $messageIds)));
                if (!$ids) {
                    return [];
                }
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $types = str_repeat('i', count($ids));
                $stmt = $conn->prepare(
                    "SELECT message_id, user_id FROM message_mentions WHERE message_id IN ($placeholders)"
                );
                $stmt->bind_param($types, ...$ids);
                $stmt->execute();
                $result = $stmt->get_result();
                $mentions = [];
                while ($row = $result->fetch_assoc()) {
                    $messageId = (int) $row['message_id'];
                    if (!isset($mentions[$messageId])) {
                        $mentions[$messageId] = [];
                    }
                    $mentions[$messageId][] = (int) $row['user_id'];
                }
                return $mentions;
            }
        }

        if (!function_exists('loadTypingActivity')) {
            function loadTypingActivity($conn, $chatType, $chatId, $userId, $otherUserId = null) {
                if ($chatType === 'channel') {
                    return [];
                }
                // Purge expired activities
                $conn->query("DELETE FROM chat_activity WHERE expires_at < NOW()");
                if ($chatType === 'direct' && $otherUserId) {
                    if ((int) $otherUserId === (int) $userId) {
                        return [];
                    }
                    $stmt = $conn->prepare(
                        "SELECT user_id, activity_type, activity_value, updated_at
                         FROM chat_activity
                         WHERE chat_type = 'direct'
                           AND chat_id = ?
                           AND user_id = ?
                           AND expires_at > NOW()"
                    );
                    $stmt->bind_param("ii", $userId, $otherUserId);
                } else {
                    $stmt = $conn->prepare(
                        "SELECT user_id, activity_type, activity_value, updated_at
                         FROM chat_activity
                         WHERE chat_type = ?
                           AND chat_id = ?
                           AND user_id != ?
                           AND expires_at > NOW()"
                    );
                    $stmt->bind_param("sii", $chatType, $chatId, $userId);
                }
                $stmt->execute();
                $result = $stmt->get_result();
                $activities = [];
                while ($row = $result->fetch_assoc()) {
                    $activities[] = $row;
                }
                return $activities;
            }
        }

        // Check if since parameter is provided (for incremental loading)
        $since = isset($_GET['since']) && is_numeric($_GET['since']) ? (int)$_GET['since'] : 0;
        $sinceId = isset($_GET['since_id']) && is_numeric($_GET['since_id']) ? (int)$_GET['since_id'] : 0;
        $sinceEventId = isset($_GET['since_event_id']) && is_numeric($_GET['since_event_id']) ? (int)$_GET['since_event_id'] : 0;
        $sinceMessageId = isset($_GET['since_message_id']) && is_numeric($_GET['since_message_id']) ? (int)$_GET['since_message_id'] : 0;
        if ($sinceEventId && !$since) {
            $since = $sinceEventId;
        }
        if ($sinceMessageId && !$sinceId) {
            $sinceId = $sinceMessageId;
        }

        // Check if it's a direct message or group message
        $chatTypeParam = $_GET['chat_type'] ?? '';
        $isSaved = ($chatTypeParam === 'saved' || (isset($_GET['user_id']) && (int)$_GET['user_id'] === (int)$userId && $chatTypeParam !== 'group' && $chatTypeParam !== 'channel'));
        if ($isSaved || (isset($_GET['user_id']) && is_numeric($_GET['user_id']))) {
            // Direct or Saved message
            $otherUserId = $isSaved ? (int)$userId : (int)$_GET['user_id'];
            
            try {
                $messages = [];
                $deleted = [];
                $updates = [];
                $messages = Chat::getDirectMessages($userId, $otherUserId, $conn, 50, 0, $since, $sinceId);
                if ($since > 0 || $sinceId > 0) {
                    $deleted = [];
                    if ($isSaved) {
                        $deletedStmt = $conn->prepare(
                            "SELECT message_id FROM messages
                             WHERE group_id IS NULL
                               AND (channel_id IS NULL OR channel_id = 0)
                               AND sender_id = ?
                               AND (receiver_id = ? OR receiver_id IS NULL OR receiver_id = 0 OR receiver_id = sender_id)
                               AND is_deleted = 1
                               AND updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(updated_at) >= ?"
                        );
                        $deletedStmt->bind_param("iii", $userId, $userId, $since);
                    } else {
                        $deletedStmt = $conn->prepare(
                            "SELECT message_id FROM messages
                             WHERE group_id IS NULL
                               AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                               AND is_deleted = 1
                               AND updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(updated_at) >= ?"
                        );
                        $deletedStmt->bind_param("iiiii", $userId, $otherUserId, $otherUserId, $userId, $since);
                    }
                    $deletedStmt->execute();
                    $deletedResult = $deletedStmt->get_result();
                    while ($row = $deletedResult->fetch_assoc()) {
                        $deleted[] = (int) $row['message_id'];
                    }

                    if ($isSaved) {
                        $selfDeletedStmt = $conn->prepare(
                            "SELECT md.message_id FROM message_deletes md
                             JOIN messages m ON m.message_id = md.message_id
                             WHERE md.user_id = ?
                               AND m.group_id IS NULL
                               AND (m.channel_id IS NULL OR m.channel_id = 0)
                               AND m.sender_id = ?
                               AND (m.receiver_id = ? OR m.receiver_id IS NULL OR m.receiver_id = 0 OR m.receiver_id = m.sender_id)
                               AND UNIX_TIMESTAMP(md.deleted_at) >= ?"
                        );
                        $selfDeletedStmt->bind_param("iiii", $userId, $userId, $userId, $since);
                    } else {
                        $selfDeletedStmt = $conn->prepare(
                            "SELECT md.message_id FROM message_deletes md
                             JOIN messages m ON m.message_id = md.message_id
                             WHERE md.user_id = ?
                               AND m.group_id IS NULL
                               AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                               AND UNIX_TIMESTAMP(md.deleted_at) >= ?"
                        );
                        $selfDeletedStmt->bind_param("iiiiii", $userId, $userId, $otherUserId, $otherUserId, $userId, $since);
                    }
                    $selfDeletedStmt->execute();
                    $selfDeletedResult = $selfDeletedStmt->get_result();
                    while ($row = $selfDeletedResult->fetch_assoc()) {
                        $deleted[] = (int) $row['message_id'];
                    }
                    if ($deleted) {
                        $deleted = array_values(array_unique($deleted));
                    }

                    $updates = [];
                    if ($isSaved) {
                        $updatesStmt = $conn->prepare(
                            "SELECT m.message_id, m.sender_id, m.receiver_id, m.group_id,
                                    m.message_type, m.message_text, m.file_url,
                                    m.encrypted_content, m.key_sender, m.key_recipient,
                                    m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                                    m.delivered_at, m.read_at, m.expires_at
                             FROM messages m
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.group_id IS NULL
                               AND (m.channel_id IS NULL OR m.channel_id = 0)
                               AND m.sender_id = ?
                               AND (m.receiver_id = ? OR m.receiver_id IS NULL OR m.receiver_id = 0 OR m.receiver_id = m.sender_id)
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND (
                                    (m.updated_at IS NOT NULL AND UNIX_TIMESTAMP(m.updated_at) >= ?)
                                    OR (m.delivered_at IS NOT NULL AND UNIX_TIMESTAMP(m.delivered_at) >= ?)
                                    OR (m.read_at IS NOT NULL AND UNIX_TIMESTAMP(m.read_at) >= ?)
                               )
                               AND UNIX_TIMESTAMP(m.created_at) <= ?"
                        );
                        $updatesStmt->bind_param("iiiiiii", $userId, $userId, $userId, $since, $since, $since, $since);
                    } else {
                        $updatesStmt = $conn->prepare(
                            "SELECT m.message_id, m.sender_id, m.receiver_id, m.group_id,
                                    m.message_type, m.message_text, m.file_url,
                                    m.encrypted_content, m.key_sender, m.key_recipient,
                                    m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                                    m.delivered_at, m.read_at, m.expires_at
                             FROM messages m
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.group_id IS NULL
                               AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND (
                                    (m.updated_at IS NOT NULL AND UNIX_TIMESTAMP(m.updated_at) >= ?)
                                    OR (m.delivered_at IS NOT NULL AND UNIX_TIMESTAMP(m.delivered_at) >= ?)
                                    OR (m.read_at IS NOT NULL AND UNIX_TIMESTAMP(m.read_at) >= ?)
                               )
                               AND UNIX_TIMESTAMP(m.created_at) <= ?"
                        );
                        $updatesStmt->bind_param("iiiiiiiii", $userId, $userId, $otherUserId, $otherUserId, $userId, $since, $since, $since, $since);
                    }
                    $updatesStmt->execute();
                    $updatesResult = $updatesStmt->get_result();
                    while ($row = $updatesResult->fetch_assoc()) {
                        $decrypted = unwrapCiphertext($row['encrypted_content']);
                        $row['encrypted_content'] = $decrypted;
                        $row['message_text'] = $decrypted;
                        $row['text'] = $decrypted;
                        $updates[] = $row;
                    }
                }
                $reactionIds = $updates ? array_column($updates, 'message_id') : [];
                if ($since > 0) {
                    if ($isSaved) {
                        $reactionStmt = $conn->prepare(
                            "SELECT m.message_id FROM messages m
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.group_id IS NULL
                               AND (m.channel_id IS NULL OR m.channel_id = 0)
                               AND m.sender_id = ?
                               AND (m.receiver_id = ? OR m.receiver_id IS NULL OR m.receiver_id = 0 OR m.receiver_id = m.sender_id)
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND m.updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(m.updated_at) >= ?"
                        );
                        $reactionStmt->bind_param("iiii", $userId, $userId, $userId, $since);
                    } else {
                        $reactionStmt = $conn->prepare(
                            "SELECT m.message_id FROM messages m
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.group_id IS NULL
                               AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND m.updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(m.updated_at) >= ?"
                        );
                        $reactionStmt->bind_param("iiiiii", $userId, $userId, $otherUserId, $otherUserId, $userId, $since);
                    }
                    $reactionStmt->execute();
                    $reactionResult = $reactionStmt->get_result();
                    while ($row = $reactionResult->fetch_assoc()) {
                        $reactionIds[] = (int) $row['message_id'];
                    }
                }
                $reactionIds = array_values(array_unique(array_filter($reactionIds)));
                $mentionMap = loadMentionsMap($conn, array_merge(array_column($messages, 'message_id'), array_column($updates, 'message_id')));
                foreach ($messages as &$msg) {
                    $msgId = (int) ($msg['message_id'] ?? 0);
                    $msg['mentions'] = $mentionMap[$msgId] ?? [];
                }
                unset($msg);
                foreach ($updates as &$msg) {
                    $msgId = (int) ($msg['message_id'] ?? 0);
                    $msg['mentions'] = $mentionMap[$msgId] ?? [];
                }
                unset($msg);

                $reactionUpdates = $reactionIds ? loadReactionUpdates($conn, $reactionIds, $userId) : [];
                $activity = $isSaved ? [] : loadTypingActivity($conn, 'direct', $userId, $userId, $otherUserId);

                echo json_encode([
                    'success' => true,
                    'messages' => $messages,
                    'deleted' => $deleted,
                    'updates' => $updates,
                    'reaction_updates' => $reactionUpdates,
                    'activity' => $activity,
                    'server_time' => time()
                ]);
            } catch (Exception $e) {
                error_log("Error in messages.php (direct): " . $e->getMessage());
                echo json_encode([
                    'success' => false,
                    'message' => 'Error fetching messages'
                ]);
            }
        } elseif (isset($_GET['group_id']) && is_numeric($_GET['group_id'])) {
            // Group message
            $groupId = (int)$_GET['group_id'];
            
            try {
                $messages = [];
                $deleted = [];
                $updates = [];
                $messages = Chat::getGroupMessages($userId, $groupId, $conn, 50, 0, $since, $sinceId);
                if (is_array($messages) && isset($messages['success']) && $messages['success'] === false) {
                    echo json_encode([
                        'success' => false,
                        'message' => $messages['message'] ?? 'Error fetching group messages'
                    ]);
                    exit;
                }
                if ($since > 0 || $sinceId > 0) {
                    $deleted = [];
                    $deletedStmt = $conn->prepare(
                        "SELECT message_id FROM messages
                         WHERE group_id = ?
                           AND is_deleted = 1
                           AND updated_at IS NOT NULL
                           AND UNIX_TIMESTAMP(updated_at) >= ?"
                    );
                    $deletedStmt->bind_param("ii", $groupId, $since);
                    $deletedStmt->execute();
                    $deletedResult = $deletedStmt->get_result();
                    while ($row = $deletedResult->fetch_assoc()) {
                        $deleted[] = (int) $row['message_id'];
                    }

                    $selfDeletedStmt = $conn->prepare(
                        "SELECT md.message_id FROM message_deletes md
                         JOIN messages m ON m.message_id = md.message_id
                         WHERE md.user_id = ?
                           AND m.group_id = ?
                           AND UNIX_TIMESTAMP(md.deleted_at) >= ?"
                    );
                    $selfDeletedStmt->bind_param("iii", $userId, $groupId, $since);
                    $selfDeletedStmt->execute();
                    $selfDeletedResult = $selfDeletedStmt->get_result();
                    while ($row = $selfDeletedResult->fetch_assoc()) {
                        $deleted[] = (int) $row['message_id'];
                    }
                    if ($deleted) {
                        $deleted = array_values(array_unique($deleted));
                    }

                    $updates = [];
                    $updatesStmt = $conn->prepare(
                        "SELECT m.message_id, m.sender_id, m.group_id,
                                m.message_type, m.message_text, m.file_url,
                                m.encrypted_content, m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                                m.expires_at,
                                m.delivered_at, m.read_at,
                                mk.wrapped_key as key_for_user,
                                u.username, u.profile_pic
                         FROM messages m
                         JOIN users u ON m.sender_id = u.user_id
                         LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
                         LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                         WHERE m.group_id = ?
                           AND m.is_deleted = 0
                           AND (m.expires_at IS NULL OR m.expires_at > NOW())
                           AND md.message_id IS NULL
                           AND (
                                (m.updated_at IS NOT NULL AND UNIX_TIMESTAMP(m.updated_at) >= ?)
                                OR (m.delivered_at IS NOT NULL AND UNIX_TIMESTAMP(m.delivered_at) >= ?)
                                OR (m.read_at IS NOT NULL AND UNIX_TIMESTAMP(m.read_at) >= ?)
                           )
                           AND UNIX_TIMESTAMP(m.created_at) <= ?"
                    );
                    $updatesStmt->bind_param("iiiiiii", $userId, $userId, $groupId, $since, $since, $since, $since);
                    $updatesStmt->execute();
                    $updatesResult = $updatesStmt->get_result();
                    while ($row = $updatesResult->fetch_assoc()) {
                        $decrypted = unwrapCiphertext($row['encrypted_content']);
                        $row['encrypted_content'] = $decrypted;
                        $row['message_text'] = $decrypted;
                        $row['text'] = $decrypted;
                        $updates[] = $row;
                    }
                }
                $reactionIds = $updates ? array_column($updates, 'message_id') : [];
                if ($since > 0) {
                    $reactionStmt = $conn->prepare(
                        "SELECT m.message_id FROM messages m
                         LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                         WHERE m.group_id = ?
                           AND m.is_deleted = 0
                           AND (m.expires_at IS NULL OR m.expires_at > NOW())
                           AND md.message_id IS NULL
                           AND m.updated_at IS NOT NULL
                           AND UNIX_TIMESTAMP(m.updated_at) >= ?"
                    );
                    $reactionStmt->bind_param("iii", $userId, $groupId, $since);
                    $reactionStmt->execute();
                    $reactionResult = $reactionStmt->get_result();
                    while ($row = $reactionResult->fetch_assoc()) {
                        $reactionIds[] = (int) $row['message_id'];
                    }
                }
                $reactionIds = array_values(array_unique(array_filter($reactionIds)));
                $mentionMap = loadMentionsMap($conn, array_merge(array_column($messages, 'message_id'), array_column($updates, 'message_id')));
                foreach ($messages as &$msg) {
                    $msgId = (int) ($msg['message_id'] ?? 0);
                    $msg['mentions'] = $mentionMap[$msgId] ?? [];
                }
                unset($msg);
                foreach ($updates as &$msg) {
                    $msgId = (int) ($msg['message_id'] ?? 0);
                    $msg['mentions'] = $mentionMap[$msgId] ?? [];
                }
                unset($msg);

                $reactionUpdates = $reactionIds ? loadReactionUpdates($conn, $reactionIds, $userId) : [];
                $activity = loadTypingActivity($conn, 'group', $groupId, $userId);

                echo json_encode([
                    'success' => true,
                    'messages' => $messages,
                    'deleted' => $deleted,
                    'updates' => $updates,
                    'reaction_updates' => $reactionUpdates,
                    'activity' => $activity,
                    'server_time' => time()
                ]);
            } catch (Exception $e) {
                error_log("Error in messages.php (group): " . $e->getMessage());
                echo json_encode([
                    'success' => false,
                    'message' => 'Error fetching messages'
                ]);
            }
        } else {
            // Channel message
            if (isset($_GET['channel_id']) && is_numeric($_GET['channel_id'])) {
                $channelId = (int) $_GET['channel_id'];
                try {
                    $messages = [];
                    $deleted = [];
                    $updates = [];
                    $messages = Chat::getChannelMessages($userId, $channelId, $conn, 50, 0, $since, $sinceId);
                    if (is_array($messages) && isset($messages['success']) && $messages['success'] === false) {
                        echo json_encode([
                            'success' => false,
                            'message' => $messages['message'] ?? 'Error fetching channel messages'
                        ]);
                        exit;
                    }
                    if ($since > 0 || $sinceId > 0) {
                        $deleted = [];
                        $deletedStmt = $conn->prepare(
                            "SELECT message_id FROM messages
                             WHERE channel_id = ?
                               AND is_deleted = 1
                               AND updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(updated_at) >= ?"
                        );
                        $deletedStmt->bind_param("ii", $channelId, $since);
                        $deletedStmt->execute();
                        $deletedResult = $deletedStmt->get_result();
                        while ($row = $deletedResult->fetch_assoc()) {
                            $deleted[] = (int) $row['message_id'];
                        }

                        $selfDeletedStmt = $conn->prepare(
                            "SELECT md.message_id FROM message_deletes md
                             JOIN messages m ON m.message_id = md.message_id
                             WHERE md.user_id = ?
                               AND m.channel_id = ?
                               AND UNIX_TIMESTAMP(md.deleted_at) >= ?"
                        );
                        $selfDeletedStmt->bind_param("iii", $userId, $channelId, $since);
                        $selfDeletedStmt->execute();
                        $selfDeletedResult = $selfDeletedStmt->get_result();
                        while ($row = $selfDeletedResult->fetch_assoc()) {
                            $deleted[] = (int) $row['message_id'];
                        }
                        if ($deleted) {
                            $deleted = array_values(array_unique($deleted));
                        }

                        $updates = [];
                        $updatesStmt = $conn->prepare(
                            "SELECT m.message_id, m.sender_id, m.channel_id,
                                    m.message_type, m.message_text, m.file_url,
                                    m.encrypted_content, m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                                    m.expires_at,
                                    m.delivered_at, m.read_at,
                                    mk.wrapped_key as key_for_user,
                                    u.username, u.profile_pic
                             FROM messages m
                             JOIN users u ON m.sender_id = u.user_id
                             LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.channel_id = ?
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND (
                                    (m.updated_at IS NOT NULL AND UNIX_TIMESTAMP(m.updated_at) >= ?)
                                    OR (m.delivered_at IS NOT NULL AND UNIX_TIMESTAMP(m.delivered_at) >= ?)
                                    OR (m.read_at IS NOT NULL AND UNIX_TIMESTAMP(m.read_at) >= ?)
                               )
                               AND UNIX_TIMESTAMP(m.created_at) <= ?"
                        );
                        $updatesStmt->bind_param("iiiiiii", $userId, $userId, $channelId, $since, $since, $since, $since);
                        $updatesStmt->execute();
                        $updatesResult = $updatesStmt->get_result();
                        while ($row = $updatesResult->fetch_assoc()) {
                            $decrypted = unwrapCiphertext($row['encrypted_content']);
                            $row['encrypted_content'] = $decrypted;
                            $row['message_text'] = $decrypted;
                            $row['text'] = $decrypted;
                            $updates[] = $row;
                        }
                    }
                    $reactionIds = $updates ? array_column($updates, 'message_id') : [];
                    if ($since > 0) {
                        $reactionStmt = $conn->prepare(
                            "SELECT m.message_id FROM messages m
                             LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                             WHERE m.channel_id = ?
                               AND m.is_deleted = 0
                               AND (m.expires_at IS NULL OR m.expires_at > NOW())
                               AND md.message_id IS NULL
                               AND m.updated_at IS NOT NULL
                               AND UNIX_TIMESTAMP(m.updated_at) >= ?"
                        );
                        $reactionStmt->bind_param("iii", $userId, $channelId, $since);
                        $reactionStmt->execute();
                        $reactionResult = $reactionStmt->get_result();
                        while ($row = $reactionResult->fetch_assoc()) {
                            $reactionIds[] = (int) $row['message_id'];
                        }
                    }
                    $reactionIds = array_values(array_unique(array_filter($reactionIds)));
                    $mentionMap = loadMentionsMap($conn, array_merge(array_column($messages, 'message_id'), array_column($updates, 'message_id')));
                    foreach ($messages as &$msg) {
                        $msgId = (int) ($msg['message_id'] ?? 0);
                        $msg['mentions'] = $mentionMap[$msgId] ?? [];
                    }
                    unset($msg);
                    foreach ($updates as &$msg) {
                        $msgId = (int) ($msg['message_id'] ?? 0);
                        $msg['mentions'] = $mentionMap[$msgId] ?? [];
                    }
                    unset($msg);

                    $reactionUpdates = $reactionIds ? loadReactionUpdates($conn, $reactionIds, $userId) : [];

                    echo json_encode([
                        'success' => true,
                        'messages' => $messages,
                        'deleted' => $deleted,
                        'updates' => $updates,
                        'reaction_updates' => $reactionUpdates,
                        'activity' => [],
                        'server_time' => time()
                    ]);
                    exit;
                } catch (Exception $e) {
                    error_log("Error in messages.php (channel): " . $e->getMessage());
                    echo json_encode([
                        'success' => false,
                        'message' => 'Error fetching channel messages'
                    ]);
                    exit;
                }
            }
            echo json_encode([
                'success' => false,
                'message' => 'Missing or invalid parameters'
            ]);
        }
        break;
    case 'messages_history':
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

        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;
        if ($limit <= 0) {
            $limit = 50;
        }
        $limit = min(100, $limit);
        $beforeId = isset($_GET['before_id']) ? (int) $_GET['before_id'] : 0;

        $chatType = null;
        $chatId = null;
        if (isset($_GET['user_id']) && is_numeric($_GET['user_id'])) {
            $chatType = 'direct';
            $chatId = (int) $_GET['user_id'];
        } elseif (isset($_GET['group_id']) && is_numeric($_GET['group_id'])) {
            $chatType = 'group';
            $chatId = (int) $_GET['group_id'];
        } elseif (isset($_GET['channel_id']) && is_numeric($_GET['channel_id'])) {
            $chatType = 'channel';
            $chatId = (int) $_GET['channel_id'];
        } elseif (isset($_GET['chat_type'], $_GET['chat_id'])) {
            $chatType = $_GET['chat_type'];
            $chatId = (int) $_GET['chat_id'];
        }

        if (!$chatType || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Missing or invalid parameters']);
            exit;
        }
        if ($chatType === 'saved') {
            if ($chatId !== $userId) {
                echo json_encode(['success' => false, 'message' => 'Invalid chat']);
                exit;
            }
            $chatType = 'direct';
            $chatId = $userId;
        }

        $clearAt = null;
        if ($chatType === 'direct') {
            $clearType = ((int) $userId === (int) $chatId) ? 'saved' : 'direct';
            $stmt = $conn->prepare("SELECT cleared_at FROM chat_clears WHERE user_id = ? AND chat_type = ? AND chat_id = ? LIMIT 1");
            $stmt->bind_param("isi", $userId, $clearType, $chatId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $clearAt = $row['cleared_at'];
            }
        } elseif ($chatType === 'group' || $chatType === 'channel') {
            $stmt = $conn->prepare("SELECT cleared_at FROM chat_clears WHERE user_id = ? AND chat_type = ? AND chat_id = ? LIMIT 1");
            $stmt->bind_param("isi", $userId, $chatType, $chatId);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($row = $result->fetch_assoc()) {
                $clearAt = $row['cleared_at'];
            }
        }

        $messages = [];
        if ($chatType === 'direct') {
            $timeCondition = '';
            $types = 'iiiii';
            $params = [$userId, $userId, $chatId, $chatId, $userId];
            if ($beforeId > 0) {
                $timeCondition .= ' AND m.message_id < ?';
                $types .= 'i';
                $params[] = $beforeId;
            }
            if ($clearAt) {
                $timeCondition .= ' AND m.created_at > ?';
                $types .= 's';
                $params[] = $clearAt;
            }
            $types .= 'i';
            $params[] = $limit;

            $query = "SELECT
                        m.message_id, m.sender_id, m.receiver_id, m.group_id,
                        m.message_type, m.message_text, m.file_url,
                        m.encrypted_content, m.key_sender, m.key_recipient,
                        m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                        m.expires_at,
                        m.delivered_at, m.read_at,
                        u.username, u.profile_pic
                      FROM messages m
                      JOIN users u ON m.sender_id = u.user_id
                      LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                      WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                        AND m.group_id IS NULL AND m.is_deleted = 0
                        AND (m.expires_at IS NULL OR m.expires_at > NOW())
                        AND md.message_id IS NULL
                        $timeCondition
                      ORDER BY m.message_id DESC
                      LIMIT ?";
            $stmt = $conn->prepare($query);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $row = normalizeProfileRow($row);
                $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
                if (empty($row['profile_pic'])) {
                    $row['profile_pic'] = 'default.png';
                }
                $messages[] = $row;
            }
        } elseif ($chatType === 'group') {
            $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
            $memberCheck->execute();
            if ($memberCheck->get_result()->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'You are not a member of this group']);
                exit;
            }

            $timeCondition = '';
            $types = 'iii';
            $params = [$userId, $userId, $chatId];
            if ($beforeId > 0) {
                $timeCondition .= ' AND m.message_id < ?';
                $types .= 'i';
                $params[] = $beforeId;
            }
            if ($clearAt) {
                $timeCondition .= ' AND m.created_at > ?';
                $types .= 's';
                $params[] = $clearAt;
            }
            $types .= 'i';
            $params[] = $limit;

            $query = "SELECT
                        m.message_id, m.sender_id, m.group_id,
                        m.message_type, m.message_text, m.file_url,
                        m.encrypted_content, m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                        m.expires_at,
                        u.username, u.profile_pic,
                        mk.wrapped_key as key_for_user
                      FROM messages m
                      JOIN users u ON m.sender_id = u.user_id
                      LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
                      LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                      WHERE m.group_id = ? AND m.is_deleted = 0
                        AND (m.expires_at IS NULL OR m.expires_at > NOW())
                        AND md.message_id IS NULL
                        $timeCondition
                      ORDER BY m.message_id DESC
                      LIMIT ?";
            $stmt = $conn->prepare($query);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $row = normalizeProfileRow($row);
                $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
                if (empty($row['profile_pic'])) {
                    $row['profile_pic'] = 'default.png';
                }
                $messages[] = $row;
            }
        } elseif ($chatType === 'channel') {
            $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
            $memberCheck->execute();
            if ($memberCheck->get_result()->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'You are not subscribed to this channel']);
                exit;
            }

            $timeCondition = '';
            $types = 'iii';
            $params = [$userId, $userId, $chatId];
            if ($beforeId > 0) {
                $timeCondition .= ' AND m.message_id < ?';
                $types .= 'i';
                $params[] = $beforeId;
            }
            if ($clearAt) {
                $timeCondition .= ' AND m.created_at > ?';
                $types .= 's';
                $params[] = $clearAt;
            }
            $types .= 'i';
            $params[] = $limit;

            $query = "SELECT
                        m.message_id, m.sender_id, m.channel_id,
                        m.message_type, m.message_text, m.file_url,
                        m.encrypted_content, m.created_at, m.updated_at, m.edited_at, m.reply_to_id,
                        m.expires_at,
                        u.username, u.profile_pic,
                        mk.wrapped_key as key_for_user
                      FROM messages m
                      JOIN users u ON m.sender_id = u.user_id
                      LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
                      LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
                      WHERE m.channel_id = ? AND m.is_deleted = 0
                        AND (m.expires_at IS NULL OR m.expires_at > NOW())
                        AND md.message_id IS NULL
                        $timeCondition
                      ORDER BY m.message_id DESC
                      LIMIT ?";
            $stmt = $conn->prepare($query);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $row = normalizeProfileRow($row);
                $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
                if (empty($row['profile_pic'])) {
                    $row['profile_pic'] = 'default.png';
                }
                $messages[] = $row;
            }
        }

        $messages = array_reverse($messages);

        $mentionMap = [];
        if ($messages) {
            $ids = array_column($messages, 'message_id');
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $types = str_repeat('i', count($ids));
            $stmt = $conn->prepare("SELECT message_id, user_id FROM message_mentions WHERE message_id IN ($placeholders)");
            $stmt->bind_param($types, ...$ids);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $messageId = (int) $row['message_id'];
                if (!isset($mentionMap[$messageId])) {
                    $mentionMap[$messageId] = [];
                }
                $mentionMap[$messageId][] = (int) $row['user_id'];
            }
            foreach ($messages as &$msg) {
                $msgId = (int) ($msg['message_id'] ?? 0);
                $msg['mentions'] = $mentionMap[$msgId] ?? [];
            }
            unset($msg);
        }

        echo json_encode([
            'success' => true,
            'messages' => $messages
        ]);
        break;
    case 'pin_chat':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = $data['chatType'] ?? null;
        $chatId = isset($data['chatId']) ? (int) $data['chatId'] : null;
        $action = $data['action'] ?? 'pin';

        if (!in_array($chatType, ['direct', 'group', 'channel', 'saved'], true) || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat target']);
            exit;
        }

        if ($action === 'unpin') {
            $stmt = $conn->prepare("DELETE FROM pinned_chats WHERE user_id = ? AND chat_type = ? AND chat_id = ?");
            $stmt->bind_param("isi", $userId, $chatType, $chatId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        $stmt = $conn->prepare(
            "INSERT INTO pinned_chats (user_id, chat_type, chat_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP"
        );
        $stmt->bind_param("isi", $userId, $chatType, $chatId);
        $stmt->execute();

        echo json_encode(['success' => true]);
        break;
    case 'pin_message':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $chatType = $data['chatType'] ?? null;
        $chatId = isset($data['chatId']) && is_numeric($data['chatId']) ? (int) $data['chatId'] : null;
        $messageId = isset($data['messageId']) && is_numeric($data['messageId']) ? (int) $data['messageId'] : null;
        $action = $data['action'] ?? 'pin';

        if (!in_array($chatType, ['group', 'channel'], true) || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat target']);
            exit;
        }

        try {
            if ($chatType === 'group') {
                $permissions = Chat::getGroupPermissions($chatId, $userId, $conn);
                if (!$permissions || $permissions['role'] === 'member' || empty($permissions['can_pin_messages'])) {
                    echo json_encode(['success' => false, 'message' => 'You cannot pin messages in this group']);
                    exit;
                }
            } else {
                $permissions = Chat::getChannelPermissions($chatId, $userId, $conn);
                if (!$permissions || empty($permissions['can_pin'])) {
                    echo json_encode(['success' => false, 'message' => 'You cannot pin posts in this channel']);
                    exit;
                }
            }

            if ($action === 'unpin') {
                $stmt = $conn->prepare("DELETE FROM pinned_messages WHERE chat_type = ? AND chat_id = ?");
                $stmt->bind_param("si", $chatType, $chatId);
                $stmt->execute();
                echo json_encode(['success' => true, 'action' => 'unpin']);
                exit;
            }

            if (!$messageId) {
                echo json_encode(['success' => false, 'message' => 'Missing message ID']);
                exit;
            }

            $checkStmt = $conn->prepare(
                "SELECT message_id FROM messages WHERE message_id = ? AND " . ($chatType === 'group' ? "group_id = ?" : "channel_id = ?")
            );
            $checkStmt->bind_param("ii", $messageId, $chatId);
            $checkStmt->execute();
            $checkResult = $checkStmt->get_result();
            if ($checkResult->num_rows === 0) {
                echo json_encode(['success' => false, 'message' => 'Message not found in this chat']);
                exit;
            }

            $stmt = $conn->prepare(
                "INSERT INTO pinned_messages (chat_type, chat_id, message_id, pinned_by)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), pinned_by = VALUES(pinned_by), pinned_at = CURRENT_TIMESTAMP"
            );
            $stmt->bind_param("siii", $chatType, $chatId, $messageId, $userId);
            $stmt->execute();

            echo json_encode(['success' => true, 'action' => 'pin', 'message_id' => $messageId]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Error pinning message: ' . $e->getMessage()]);
        }
        break;
    case 'pinned_message':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $chatType = $_GET['chatType'] ?? null;
        $chatId = isset($_GET['chatId']) && is_numeric($_GET['chatId']) ? (int) $_GET['chatId'] : null;

        if (!in_array($chatType, ['group', 'channel'], true) || !$chatId) {
            echo json_encode(['success' => false, 'message' => 'Invalid chat target']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($chatType === 'group') {
            $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
        } else {
            $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
            $memberCheck->bind_param("ii", $chatId, $userId);
        }
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Not a member']);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT pm.message_id, pm.pinned_at,
                    m.sender_id, m.message_type, m.message_text, m.file_url,
                    m.encrypted_content, m.created_at, m.updated_at, m.reply_to_id,
                    mk.wrapped_key as key_for_user,
                    u.username, u.profile_pic
             FROM pinned_messages pm
             JOIN messages m ON m.message_id = pm.message_id
             JOIN users u ON u.user_id = m.sender_id
             LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
             WHERE pm.chat_type = ? AND pm.chat_id = ?
             LIMIT 1"
        );
        $stmt->bind_param("isi", $userId, $chatType, $chatId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            echo json_encode(['success' => true, 'pinned' => null]);
            exit;
        }

        $row = $result->fetch_assoc();
        $row = normalizeProfileRow($row);
        $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
        $decryptedPinned = Encryption::decryptMessage($row['encrypted_content']);
        if ($decryptedPinned !== '') {
            $row['message_text'] = $decryptedPinned;
            $row['text'] = $decryptedPinned;
        }
        if (empty($row['profile_pic'])) {
            $row['profile_pic'] = 'default.png';
        }

        echo json_encode(['success' => true, 'pinned' => $row]);
        break;
    case 'public_keys':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        if (empty($_GET['user_ids'])) {
            echo json_encode(['success' => false, 'message' => 'Missing user_ids']);
            exit;
        }

        $ids = array_filter(array_map('intval', explode(',', $_GET['user_ids'])));
        if (empty($ids)) {
            echo json_encode(['success' => false, 'message' => 'No valid user IDs']);
            exit;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $types = str_repeat('i', count($ids));

        $stmt = $conn->prepare("SELECT user_id, public_key FROM user_keys WHERE user_id IN ($placeholders)");
        $stmt->bind_param($types, ...$ids);
        $stmt->execute();
        $result = $stmt->get_result();

        $keys = [];
        while ($row = $result->fetch_assoc()) {
            $keys[$row['user_id']] = $row['public_key'];
        }

        echo json_encode(['success' => true, 'keys' => $keys]);
        break;
    case 'push_key':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $keys = getVapidKeys();
        if (!$keys || empty($keys['public_key'])) {
            echo json_encode(['success' => false, 'message' => 'VAPID keys not available']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'publicKey' => $keys['public_key']
        ]);
        break;
    case 'push_subscribe':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['endpoint'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid subscription payload']);
            exit;
        }

        $subscription = [
            'endpoint' => $data['endpoint'],
            'keys' => is_array($data['keys'] ?? null) ? $data['keys'] : []
        ];

        if (!savePushSubscription($userId, $subscription, $conn)) {
            echo json_encode(['success' => false, 'message' => 'Failed to save subscription']);
            exit;
        }

        echo json_encode(['success' => true]);
        break;
    case 'push_unsubscribe':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (is_array($data) && !empty($data['endpoint'])) {
            $ok = removePushSubscription($userId, $data['endpoint'], $conn);
            echo json_encode(['success' => $ok ? true : false]);
            exit;
        }

        $ok = removeAllPushSubscriptions($userId, $conn);
        echo json_encode(['success' => $ok ? true : false]);
        break;
    case 'scheduled_messages':
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

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $chatType = $_GET['chat_type'] ?? '';
            $chatId = isset($_GET['chat_id']) && is_numeric($_GET['chat_id']) ? (int) $_GET['chat_id'] : 0;
            if (!$chatType || !$chatId) {
                echo json_encode(['success' => false, 'message' => 'Missing chat parameters']);
                exit;
            }
            $stmt = $conn->prepare(
                "SELECT id, conversation_id, conversation_type, encrypted_payload, meta_json, send_at, created_at
                 FROM scheduled_messages
                 WHERE user_id = ? AND conversation_id = ? AND conversation_type = ?
                   AND canceled_at IS NULL AND dispatched_at IS NULL
                 ORDER BY send_at ASC"
            );
            $stmt->bind_param("iis", $userId, $chatId, $chatType);
            $stmt->execute();
            $result = $stmt->get_result();
            $items = [];
            while ($row = $result->fetch_assoc()) {
                $meta = null;
                if (!empty($row['meta_json'])) {
                    $decoded = json_decode($row['meta_json'], true);
                    if (is_array($decoded)) {
                        $meta = $decoded;
                    }
                }
                $items[] = [
                    'id' => (int) $row['id'],
                    'conversation_id' => (int) $row['conversation_id'],
                    'conversation_type' => $row['conversation_type'],
                    'encrypted_payload' => unwrapCiphertext($row['encrypted_payload']),
                    'meta' => $meta,
                    'send_at' => $row['send_at'],
                    'created_at' => $row['created_at']
                ];
            }
            echo json_encode(['success' => true, 'scheduled' => $items]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['action'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $action = $data['action'];
        if ($action === 'schedule') {
            $chatType = $data['chat_type'] ?? '';
            $chatId = isset($data['chat_id']) && is_numeric($data['chat_id']) ? (int) $data['chat_id'] : 0;
            $messageType = $data['message_type'] ?? $data['messageType'] ?? null;
            $encryptedContent = $data['encrypted_content'] ?? $data['encryptedContent'] ?? null;
            $sendAtRaw = $data['send_at'] ?? null;
            if (!$chatType || !$chatId || !$messageType || !$encryptedContent || !$sendAtRaw) {
                echo json_encode(['success' => false, 'message' => 'Missing schedule data']);
                exit;
            }
            $sendAt = date('Y-m-d H:i:s', strtotime($sendAtRaw));
            if (!$sendAt || $sendAt === '1970-01-01 00:00:00') {
                echo json_encode(['success' => false, 'message' => 'Invalid schedule time']);
                exit;
            }
            if (is_array($encryptedContent)) {
                $encryptedContent = json_encode($encryptedContent);
            }
            if (!is_string($encryptedContent) || $encryptedContent === '') {
                echo json_encode(['success' => false, 'message' => 'Invalid encrypted payload']);
                exit;
            }
            $wrappedPayload = wrapCiphertext($encryptedContent);
            $meta = [
                'chat_type' => $chatType,
                'message_type' => $messageType,
                'message_text' => $data['message_text'] ?? $data['text'] ?? (is_string($encryptedContent) && !str_starts_with(trim($encryptedContent), '{') ? $encryptedContent : null),
                'file_url' => $data['file_url'] ?? $data['fileUrl'] ?? null,
                'reply_to_id' => isset($data['reply_to_id']) ? (int) $data['reply_to_id'] : (isset($data['replyToId']) ? (int) $data['replyToId'] : null),
                'key_sender' => $data['key_sender'] ?? $data['keySender'] ?? null,
                'key_recipient' => $data['key_recipient'] ?? $data['keyRecipient'] ?? null,
                'message_keys' => $data['message_keys'] ?? $data['messageKeys'] ?? [],
                'mentions' => $data['mentions'] ?? [],
                'content_hash' => $data['content_hash'] ?? $data['contentHash'] ?? null
            ];
            $metaJson = json_encode($meta);

            $stmt = $conn->prepare(
                "INSERT INTO scheduled_messages (user_id, conversation_id, conversation_type, encrypted_payload, meta_json, send_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())"
            );
            $stmt->bind_param("iissss", $userId, $chatId, $chatType, $wrappedPayload, $metaJson, $sendAt);
            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'message' => 'Failed to schedule message']);
                exit;
            }
            echo json_encode(['success' => true, 'scheduled_id' => $stmt->insert_id]);
            exit;
        }

        if ($action === 'reschedule') {
            $scheduledId = isset($data['scheduled_id']) ? (int) $data['scheduled_id'] : 0;
            $sendAtRaw = $data['send_at'] ?? null;
            if (!$scheduledId || !$sendAtRaw) {
                echo json_encode(['success' => false, 'message' => 'Missing schedule id']);
                exit;
            }
            $sendAt = date('Y-m-d H:i:s', strtotime($sendAtRaw));
            if (!$sendAt || $sendAt === '1970-01-01 00:00:00') {
                echo json_encode(['success' => false, 'message' => 'Invalid schedule time']);
                exit;
            }
            $stmt = $conn->prepare(
                "UPDATE scheduled_messages SET send_at = ? WHERE id = ? AND user_id = ? AND canceled_at IS NULL AND dispatched_at IS NULL"
            );
            $stmt->bind_param("sii", $sendAt, $scheduledId, $userId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'cancel') {
            $scheduledId = isset($data['scheduled_id']) ? (int) $data['scheduled_id'] : 0;
            if (!$scheduledId) {
                echo json_encode(['success' => false, 'message' => 'Missing schedule id']);
                exit;
            }
            $stmt = $conn->prepare(
                "UPDATE scheduled_messages SET canceled_at = NOW() WHERE id = ? AND user_id = ? AND canceled_at IS NULL AND dispatched_at IS NULL"
            );
            $stmt->bind_param("ii", $scheduledId, $userId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
    case 'search_users':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];

        // Check if search term is provided
        if (!isset($_GET['term']) || empty($_GET['term'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Search term is required'
            ]);
            exit;
        }

        $searchTerm = trim($_GET['term'] ?? '');
        if ($searchTerm === '') {
            echo json_encode([
                'success' => false,
                'message' => 'Search term is required'
            ]);
            exit;
        }
        $cleanTerm = ltrim($searchTerm, '@');
        $like = "%$searchTerm%";
        $cleanLike = "%$cleanTerm%";

        try {
            // Search users
            $users = searchUsers($searchTerm, $userId, $conn);
            
            // Also search public groups & channels
            $groups = [];
            $channels = [];
            
            $gStmt = $conn->prepare("SELECT group_id, group_name, group_pic, group_username FROM `groups` WHERE (group_name LIKE ? OR group_username LIKE ? OR group_username LIKE ?) LIMIT 10");
            if ($gStmt) {
                $gStmt->bind_param("sss", $like, $like, $cleanLike);
                if ($gStmt->execute()) {
                    $gRes = $gStmt->get_result();
                    while ($gRow = $gRes->fetch_assoc()) {
                        $groups[] = [
                            'group_id' => (int) $gRow['group_id'],
                            'group_name' => $gRow['group_name'],
                            'group_pic' => $gRow['group_pic'] ?: 'default_group.png',
                            'group_username' => $gRow['group_username'] ?: ''
                        ];
                    }
                }
                $gStmt->close();
            }

            $cStmt = $conn->prepare("SELECT channel_id, channel_name, channel_pic, channel_username FROM `channels` WHERE (channel_name LIKE ? OR channel_username LIKE ? OR channel_username LIKE ?) LIMIT 10");
            if ($cStmt) {
                $cStmt->bind_param("sss", $like, $like, $cleanLike);
                if ($cStmt->execute()) {
                    $cRes = $cStmt->get_result();
                    while ($cRow = $cRes->fetch_assoc()) {
                        $channels[] = [
                            'channel_id' => (int) $cRow['channel_id'],
                            'channel_name' => $cRow['channel_name'],
                            'channel_pic' => $cRow['channel_pic'] ?: 'default_channel.png',
                            'channel_username' => $cRow['channel_username'] ?: ''
                        ];
                    }
                }
                $cStmt->close();
            }

            echo json_encode([
                'success' => true,
                'users' => $users,
                'groups' => $groups,
                'channels' => $channels
            ]);
        } catch (Throwable $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error searching: ' . $e->getMessage()
            ]);
        }
        break;
    case 'send_message':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $messageType = $data['messageType'] ?? ($data['message_type'] ?? null);
        if (!$messageType) {
            echo json_encode(['success' => false, 'message' => 'Missing message type']);
            exit;
        }

        $allowedTypes = ['text', 'image', 'voice', 'audio', 'video', 'video_note', 'file', 'album'];
        if (!in_array($messageType, $allowedTypes, true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid message type']);
            exit;
        }

        $receiverId = null;
        $groupId = null;
        $channelId = null;
        if (isset($data['recipientId']) && is_numeric($data['recipientId'])) {
            $receiverId = (int) $data['recipientId'];
        } elseif (isset($data['recipient_id']) && is_numeric($data['recipient_id'])) {
            $receiverId = (int) $data['recipient_id'];
        } elseif (isset($data['groupId']) && is_numeric($data['groupId'])) {
            $groupId = (int) $data['groupId'];
        } elseif (isset($data['group_id']) && is_numeric($data['group_id'])) {
            $groupId = (int) $data['group_id'];
        } elseif (isset($data['channelId']) && is_numeric($data['channelId'])) {
            $channelId = (int) $data['channelId'];
        } elseif (isset($data['channel_id']) && is_numeric($data['channel_id'])) {
            $channelId = (int) $data['channel_id'];
        } else {
            appDebugLog('E2EE send error: missing recipient/chat id for user ' . $userId);
            echo json_encode(['success' => false, 'message' => 'Missing recipient or chat ID']);
            exit;
        }

        $replyToId = null;
        if (isset($data['replyToId']) && is_numeric($data['replyToId'])) {
            $replyToId = (int) $data['replyToId'];
        } elseif (isset($data['reply_to_id']) && is_numeric($data['reply_to_id'])) {
            $replyToId = (int) $data['reply_to_id'];
        }

        $rawText = $data['message_text'] ?? ($data['messageText'] ?? ($data['text'] ?? null));
        if ($rawText === null && (isset($data['encryptedContent']) || isset($data['encrypted_content']))) {
            $legacyEnc = $data['encryptedContent'] ?? $data['encrypted_content'];
            $rawText = is_string($legacyEnc) ? $legacyEnc : json_encode($legacyEnc);
        }
        if ($rawText === null) {
            $rawText = '';
        }
        if ($messageType === 'text' && trim($rawText) === '') {
            echo json_encode(['success' => false, 'message' => 'Message text cannot be empty']);
            exit;
        }

        // Encrypt message text at rest using server-side AES-256-GCM
        $encryptedContent = Encryption::encryptMessage($rawText);

        $fileUrl = null;
        if (in_array($messageType, ['image', 'voice', 'audio', 'video', 'video_note', 'file'], true)) {
            if (empty($data['fileUrl']) && empty($data['file_url'])) {
                echo json_encode(['success' => false, 'message' => 'Missing file URL']);
                exit;
            }
            $fileUrl = $data['fileUrl'] ?? $data['file_url'];
        }

        try {
            cleanupExpiredMessages($conn, 200);

            if ($groupId !== null) {
                $permissions = Chat::getGroupPermissions($groupId, $userId, $conn);
                if (!$permissions) {
                    echo json_encode(['success' => false, 'message' => 'Not a group member']);
                    exit;
                }
                if ($messageType === 'text' && empty($permissions['can_send_messages'])) {
                    echo json_encode(['success' => false, 'message' => 'You cannot send messages in this group']);
                    exit;
                }
                if ($messageType !== 'text' && empty($permissions['can_send_media'])) {
                    echo json_encode(['success' => false, 'message' => 'You cannot send media in this group']);
                    exit;
                }
            }

            if ($channelId !== null) {
                $permissions = Chat::getChannelPermissions($channelId, $userId, $conn);
                if (!$permissions) {
                    echo json_encode(['success' => false, 'message' => 'Not a channel subscriber']);
                    exit;
                }
                if (empty($permissions['can_post'])) {
                    echo json_encode(['success' => false, 'message' => 'Only channel admins can post']);
                    exit;
                }
            }

            $now = time();
            $isDirectChat = ($receiverId !== null && $groupId === null && $channelId === null);
            $isSavedChat = ($isDirectChat && $receiverId === $userId);

            $contentHash = $data['contentHash'] ?? ($data['content_hash'] ?? null);
            if (is_string($contentHash)) {
                $contentHash = trim($contentHash);
                if ($contentHash === '') {
                    $contentHash = null;
                }
            } else {
                $contentHash = null;
            }
            if ($contentHash && strlen($contentHash) > 64) {
                $contentHash = substr($contentHash, 0, 64);
            }

            // Keep group slow mode behavior unchanged for group chats.
            if ($groupId !== null) {
                $slowModeStmt = $conn->prepare("SELECT slow_mode_seconds, slow_mode_admin_exempt FROM groups WHERE group_id = ? LIMIT 1");
                if ($slowModeStmt) {
                    $slowModeStmt->bind_param("i", $groupId);
                    $slowModeStmt->execute();
                    $slowModeResult = $slowModeStmt->get_result();
                    if ($slowModeRow = $slowModeResult->fetch_assoc()) {
                        $slowModeSeconds = (int) ($slowModeRow['slow_mode_seconds'] ?? 0);
                        $slowModeAdminExempt = (int) ($slowModeRow['slow_mode_admin_exempt'] ?? 0);
                        $role = $permissions['role'] ?? 'member';
                        $isGroupAdmin = in_array($role, ['admin', 'owner'], true);
                        $isExempt = ($slowModeAdminExempt === 1 && $isGroupAdmin);
                        if ($slowModeSeconds > 0 && !$isExempt) {
                            $lastSentStmt = $conn->prepare(
                                "SELECT UNIX_TIMESTAMP(last_sent_at) AS last_sent_unix
                                 FROM group_user_last_send
                                 WHERE group_id = ? AND user_id = ?
                                 LIMIT 1"
                            );
                            if ($lastSentStmt) {
                                $lastSentStmt->bind_param("ii", $groupId, $userId);
                                $lastSentStmt->execute();
                                $lastSentResult = $lastSentStmt->get_result();
                                if ($lastSentRow = $lastSentResult->fetch_assoc()) {
                                    $lastSentUnix = (int) ($lastSentRow['last_sent_unix'] ?? 0);
                                    if ($lastSentUnix > 0) {
                                        $remaining = $slowModeSeconds - ($now - $lastSentUnix);
                                        if ($remaining > 0) {
                                            echo json_encode([
                                                'success' => false,
                                                'message' => 'Slow mode: ' . $remaining . 's',
                                                'reason' => 'slow_mode',
                                                'remaining_seconds' => $remaining,
                                                'retry_after' => $remaining
                                            ]);
                                            exit;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // // DM anti-spam lock: per user + per direct chat only, short temporary lock.
            // if ($isDirectChat && !$isSavedChat && $receiverId > 0) {
            //     $spamReason = 'spam_protection';
            //     $spamLockSeconds = 5;
            //     $spamChatType = 'direct';
            //     $spamChatId = $receiverId;
            //     $lockStorageAvailable = true;

            //     $createSpamLockTable = $conn->query(
            //         "CREATE TABLE IF NOT EXISTS `chat_spam_locks` (
            //             `id` bigint(20) NOT NULL AUTO_INCREMENT,
            //             `user_id` int(11) NOT NULL,
            //             `chat_type` varchar(16) NOT NULL,
            //             `chat_id` int(11) NOT NULL,
            //             `reason` varchar(32) NOT NULL DEFAULT 'spam_protection',
            //             `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            //             `expires_at` datetime NOT NULL,
            //             PRIMARY KEY (`id`),
            //             UNIQUE KEY `uniq_user_chat` (`user_id`,`chat_type`,`chat_id`),
            //             KEY `idx_expires_at` (`expires_at`)
            //         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            //     );
            //     if ($createSpamLockTable === false) {
            //         $lockStorageAvailable = false;
            //     }

            //     if ($lockStorageAvailable) {
            //         $cleanupLocksStmt = $conn->prepare("DELETE FROM chat_spam_locks WHERE user_id = ? AND expires_at <= NOW()");
            //         if ($cleanupLocksStmt) {
            //             $cleanupLocksStmt->bind_param("i", $userId);
            //             $cleanupLocksStmt->execute();
            //         } else {
            //             $lockStorageAvailable = false;
            //         }
            //     }

            //     if ($lockStorageAvailable) {
            //         $activeLockStmt = $conn->prepare(
            //             "SELECT UNIX_TIMESTAMP(expires_at) AS expires_at_unix
            //              FROM chat_spam_locks
            //              WHERE user_id = ? AND chat_type = ? AND chat_id = ? AND expires_at > NOW()
            //              LIMIT 1"
            //         );
            //         if ($activeLockStmt) {
            //             $activeLockStmt->bind_param("isi", $userId, $spamChatType, $spamChatId);
            //             $activeLockStmt->execute();
            //             $activeLockResult = $activeLockStmt->get_result();
            //             if ($activeLockRow = $activeLockResult->fetch_assoc()) {
            //                 $expiresAtUnix = (int) ($activeLockRow['expires_at_unix'] ?? 0);
            //                 $remaining = $expiresAtUnix > 0 ? max(1, (int) ceil($expiresAtUnix - time())) : $spamLockSeconds;
            //                 echo json_encode([
            //                     'success' => false,
            //                     'message' => 'Spam protection: ' . $remaining . 's',
            //                     'reason' => $spamReason,
            //                     'remaining_seconds' => $remaining,
            //                     'retry_after' => $remaining
            //                 ]);
            //                 exit;
            //             }
            //         } else {
            //             $lockStorageAvailable = false;
            //         }
            //     }

            //     $spamTriggered = false;
            //     $burstWindowSeconds = 12;
            //     $burstLimit = 30;
            //     $burstSince = date('Y-m-d H:i:s', $now - $burstWindowSeconds);
            //     $burstStmt = $conn->prepare(
            //         "SELECT COUNT(*) as cnt
            //          FROM messages
            //          WHERE sender_id = ?
            //           AND receiver_id = ?
            //           AND group_id IS NULL
            //           AND channel_id IS NULL
            //           AND message_type = 'text'
            //           AND created_at >= ?
            //           AND is_deleted = 0"
            //     );
            //     if ($burstStmt) {
            //         $burstStmt->bind_param("iis", $userId, $receiverId, $burstSince);
            //         $burstStmt->execute();
            //         $burstResult = $burstStmt->get_result();
            //         if ($burstRow = $burstResult->fetch_assoc()) {
            //             if ((int) ($burstRow['cnt'] ?? 0) >= $burstLimit) {
            //                 $spamTriggered = true;
            //             }
            //         }
            //     }

            //     if (!$spamTriggered && $contentHash) {
            //         $repeatWindowSeconds = 120;
            //         $repeatLimit = 25;
            //         $repeatSince = date('Y-m-d H:i:s', $now - $repeatWindowSeconds);
            //         $repeatStmt = $conn->prepare(
            //             "SELECT COUNT(*) as cnt
            //              FROM messages
            //              WHERE sender_id = ?
            //               AND receiver_id = ?
            //               AND group_id IS NULL
            //               AND channel_id IS NULL
            //               AND message_type = 'text'
            //               AND content_hash = ?
            //               AND created_at >= ?
            //               AND is_deleted = 0"
            //         );
            //         if ($repeatStmt) {
            //             $repeatStmt->bind_param("iiss", $userId, $receiverId, $contentHash, $repeatSince);
            //             $repeatStmt->execute();
            //             $repeatResult = $repeatStmt->get_result();
            //             if ($repeatRow = $repeatResult->fetch_assoc()) {
            //                 if ((int) ($repeatRow['cnt'] ?? 0) >= $repeatLimit) {
            //                     $spamTriggered = true;
            //                 }
            //             }
            //         }
            //     }

            //     if (!$spamTriggered) {
            //         $patternWindowSeconds = 25;
            //         $patternBurstLimit = 30;
            //         $patternSince = date('Y-m-d H:i:s', $now - $patternWindowSeconds);
            //         $patternStmt = $conn->prepare(
            //             "SELECT COUNT(*) AS total_count, COUNT(DISTINCT content_hash) AS distinct_hashes
            //              FROM messages
            //              WHERE sender_id = ?
            //               AND receiver_id = ?
            //               AND group_id IS NULL
            //               AND channel_id IS NULL
            //               AND message_type = 'text'
            //               AND created_at >= ?
            //               AND is_deleted = 0"
            //         );
            //         if ($patternStmt) {
            //             $patternStmt->bind_param("iis", $userId, $receiverId, $patternSince);
            //             $patternStmt->execute();
            //             $patternResult = $patternStmt->get_result();
            //             if ($patternRow = $patternResult->fetch_assoc()) {
            //                 $totalCount = (int) ($patternRow['total_count'] ?? 0);
            //                 $distinctHashes = (int) ($patternRow['distinct_hashes'] ?? 0);
            //                 if ($totalCount >= $patternBurstLimit && $distinctHashes <= 2) {
            //                     $spamTriggered = true;
            //                 }
            //             }
            //         }
            //     }

            //     if ($spamTriggered) {
            //         if ($lockStorageAvailable) {
            //             $expiresAt = date('Y-m-d H:i:s', $now + $spamLockSeconds);
            //             $setLockStmt = $conn->prepare(
            //                 "INSERT INTO chat_spam_locks (user_id, chat_type, chat_id, reason, created_at, expires_at)
            //                  VALUES (?, ?, ?, ?, NOW(), ?)
            //                  ON DUPLICATE KEY UPDATE
            //                     reason = VALUES(reason),
            //                     created_at = NOW(),
            //                     expires_at = VALUES(expires_at)"
            //             );
            //             if ($setLockStmt) {
            //                 $setLockStmt->bind_param("isiss", $userId, $spamChatType, $spamChatId, $spamReason, $expiresAt);
            //                 $setLockStmt->execute();
            //             }
            //         }

            //         echo json_encode([
            //             'success' => false,
            //             'message' => 'Spam protection: ' . $spamLockSeconds . 's',
            //             'reason' => $spamReason,
            //             'remaining_seconds' => $spamLockSeconds,
            //             'retry_after' => $spamLockSeconds
            //         ]);
            //         exit;
            //     }
            // }

            $mentionIds = [];
            if (isset($data['mentions']) && is_array($data['mentions'])) {
                foreach ($data['mentions'] as $mentionId) {
                    $id = (int) $mentionId;
                    if ($id > 0) {
                        $mentionIds[$id] = true;
                    }
                }
            }

            if ($mentionIds) {
                $validMentions = [];
                if ($groupId !== null) {
                    $ids = array_keys($mentionIds);
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $types = str_repeat('i', count($ids));
                    $stmt = $conn->prepare(
                        "SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN ($placeholders)"
                    );
                    $bindTypes = 'i' . $types;
                    $params = array_merge([$groupId], $ids);
                    $stmt->bind_param($bindTypes, ...$params);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $validMentions[(int) $row['user_id']] = true;
                    }
                } elseif ($channelId !== null) {
                    $ids = array_keys($mentionIds);
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $types = str_repeat('i', count($ids));
                    $stmt = $conn->prepare(
                        "SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id IN ($placeholders)"
                    );
                    $bindTypes = 'i' . $types;
                    $params = array_merge([$channelId], $ids);
                    $stmt->bind_param($bindTypes, ...$params);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $validMentions[(int) $row['user_id']] = true;
                    }
                } elseif ($receiverId !== null) {
                    $validMentions[$receiverId] = true;
                    $validMentions[$userId] = true;
                }
                $mentionIds = array_keys($validMentions);
            }

            if (isset($data['origin']) && is_array($data['origin'])) {
                $originType = $data['origin']['type'] ?? null;
                $originId = isset($data['origin']['id']) && is_numeric($data['origin']['id']) ? (int) $data['origin']['id'] : null;
                if ($originId && in_array($originType, ['group', 'channel'], true)) {
                    if ($originType === 'group') {
                        $stmt = $conn->prepare("SELECT content_protection FROM groups WHERE group_id = ?");
                        $stmt->bind_param("i", $originId);
                    } else {
                        $stmt = $conn->prepare("SELECT content_protection FROM channels WHERE channel_id = ?");
                        $stmt->bind_param("i", $originId);
                    }
                    $stmt->execute();
                    $result = $stmt->get_result();
                    if ($row = $result->fetch_assoc()) {
                        if (!empty($row['content_protection'])) {
                            echo json_encode(['success' => false, 'message' => 'Forwarding is disabled for this chat']);
                            exit;
                        }
                    }
                }
            }

        $keySender = $data['keySender'] ?? ($data['key_sender'] ?? null);
        $keyRecipient = $data['keyRecipient'] ?? ($data['key_recipient'] ?? null);
        $messageKeys = $data['messageKeys'] ?? ($data['message_keys'] ?? []);

            $expiresAt = null;
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

            $stmt = $conn->prepare(
                "INSERT INTO messages (sender_id, receiver_id, group_id, channel_id, message_type, message_text, file_url, reply_to_id, encrypted_content, key_sender, key_recipient, content_hash, expires_at)
                 VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->bind_param(
                "iiiississsss",
                $userId,
                $receiverId,
                $groupId,
                $channelId,
                $messageType,
                $fileUrl,
                $replyToId,
                $encryptedContent,
                $keySender,
                $keyRecipient,
                $contentHash,
                $expiresAt
            );

            if (!$stmt->execute()) {
                echo json_encode(['success' => false, 'message' => 'Failed to send message: ' . $stmt->error]);
                exit;
            }

            $messageId = $stmt->insert_id;

            if ($groupId !== null || $channelId !== null) {
                if (is_array($messageKeys) && !empty($messageKeys)) {
                    $keyStmt = $conn->prepare("INSERT INTO message_keys (message_id, user_id, wrapped_key) VALUES (?, ?, ?)");
                    foreach ($messageKeys as $entry) {
                        $entryUserId = $entry['userId'] ?? ($entry['user_id'] ?? null);
                        $entryWrapped = $entry['wrappedKey'] ?? ($entry['wrapped_key'] ?? null);
                        if (!$entryUserId || !$entryWrapped) {
                            continue;
                        }
                        $memberId = (int) $entryUserId;
                        $wrappedKey = $entryWrapped;
                        $keyStmt->bind_param("iis", $messageId, $memberId, $wrappedKey);
                        $keyStmt->execute();
                    }
                }
            }

            if (!empty($mentionIds)) {
                $mentionStmt = $conn->prepare("INSERT IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)");
                foreach ($mentionIds as $mentionId) {
                    $mentionId = (int) $mentionId;
                    if ($mentionId <= 0) {
                        continue;
                    }
                    $mentionStmt->bind_param("ii", $messageId, $mentionId);
                    $mentionStmt->execute();
                }
            }

            if ($groupId !== null) {
                $lastStmt = $conn->prepare(
                    "INSERT INTO group_user_last_send (group_id, user_id, last_sent_at)
                     VALUES (?, ?, NOW())
                     ON DUPLICATE KEY UPDATE last_sent_at = VALUES(last_sent_at)"
                );
                if ($lastStmt) {
                    $lastStmt->bind_param("ii", $groupId, $userId);
                    $lastStmt->execute();
                }
            }

            sendPushForMessage($userId, $receiverId, $groupId, $channelId, $conn);

            $conversationType = $groupId !== null ? 'group' : ($channelId !== null ? 'channel' : (($receiverId !== null && $receiverId === $userId) ? 'saved' : 'direct'));
            $conversationId = $groupId !== null ? $groupId : ($channelId !== null ? $channelId : $receiverId);
            $eventPayloadBase = [
                'message_id' => $messageId,
                'sender_id' => $userId,
                'receiver_id' => $receiverId,
                'group_id' => $groupId,
                'channel_id' => $channelId,
                'message_type' => $messageType,
                'message_text' => $rawText,
                'text' => $rawText,
                'file_url' => $fileUrl,
                'username' => $currentUser['username'] ?? '',
                'sender_username' => $currentUser['username'] ?? '',
                'full_name' => $currentUser['full_name'] ?? '',
                'sender_name' => $currentUser['full_name'] ?? ($currentUser['username'] ?? ''),
                'profile_pic' => !empty($currentUser['profile_pic']) ? $currentUser['profile_pic'] : 'default.png',
                'encrypted_content' => $rawText,
                'key_sender' => null,
                'key_recipient' => null,
                'created_at' => date('Y-m-d H:i:s'),
                'reply_to_id' => $replyToId,
                'mentions' => $mentionIds,
                'chat_type' => $conversationType
            ];
            if ($groupId !== null || $channelId !== null) {
                $memberIds = lc_get_chat_member_ids($conversationType, $conversationId, $conn);
                $keyMap = [];
                if (is_array($messageKeys)) {
                    foreach ($messageKeys as $entry) {
                        $entryUserId = $entry['userId'] ?? ($entry['user_id'] ?? null);
                        $entryWrapped = $entry['wrappedKey'] ?? ($entry['wrapped_key'] ?? null);
                        if ($entryUserId && $entryWrapped) {
                            $keyMap[(int) $entryUserId] = $entryWrapped;
                        }
                    }
                }
                foreach ($memberIds as $memberId) {
                    $payload = $eventPayloadBase;
                    $payload['key_for_user'] = $keyMap[$memberId] ?? null;
                    lc_record_event($memberId, $conversationId, 'message_new', $payload, $conn);
                }
            } else {
                $recipients = array_values(array_unique([$userId, $receiverId]));
                foreach ($recipients as $recipientId) {
                    if (!$recipientId) {
                        continue;
                    }
                    lc_record_event($recipientId, $conversationId, 'message_new', $eventPayloadBase, $conn);
                }
            }

            // Immediately clear any active typing indicator for this sender in this chat
            if ($receiverId !== null) {
                $delActStmt = $conn->prepare("DELETE FROM chat_activity WHERE user_id = ? AND chat_type = 'direct' AND (chat_id = ? OR chat_id = ?)");
                if ($delActStmt) {
                    $delActStmt->bind_param("iii", $userId, $receiverId, $userId);
                    $delActStmt->execute();
                    $delActStmt->close();
                }
            } elseif ($groupId !== null) {
                $delActStmt = $conn->prepare("DELETE FROM chat_activity WHERE user_id = ? AND chat_type = 'group' AND chat_id = ?");
                if ($delActStmt) {
                    $delActStmt->bind_param("ii", $userId, $groupId);
                    $delActStmt->execute();
                    $delActStmt->close();
                }
            }

            // Broadcast typing_stop event
            $stopPayload = [
                'chat_type' => $conversationType,
                'chat_id' => ($conversationType === 'direct' ? $userId : $conversationId),
                'user_id' => $userId,
                'sender_id' => $userId,
                'receiver_id' => $receiverId,
                'activity_type' => 'typing',
                'activity_value' => ''
            ];
            if ($conversationType === 'direct' && $receiverId && (int) $receiverId !== (int) $userId) {
                lc_record_event($receiverId, $userId, 'typing_stop', $stopPayload, $conn);
            } elseif ($conversationType === 'group' && $groupId) {
                $mIds = lc_get_chat_member_ids('group', $groupId, $conn);
                foreach ($mIds as $mId) {
                    if ((int) $mId !== (int) $userId) {
                        lc_record_event($mId, $groupId, 'typing_stop', $stopPayload, $conn);
                    }
                }
            }

            echo json_encode([
                'success' => true,
                'message_id' => $messageId
            ]);
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error sending message: ' . $e->getMessage()
            ]);
        }
        break;
    case 'sessions':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        if (!$currentUser) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $userId = (int) $currentUser['user_id'];
        $currentSession = lc_get_current_session_row($userId, $conn);
        $currentSessionId = $currentSession ? (int) $currentSession['id'] : 0;

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $conn->prepare(
                "SELECT id, device_name, device_id, user_agent, ip_address, created_at, last_active
                 FROM user_sessions
                 WHERE user_id = ? AND revoked_at IS NULL
                 ORDER BY last_active DESC"
            );
            $stmt->bind_param("i", $userId);
            $stmt->execute();
            $result = $stmt->get_result();
            $sessions = [];
            while ($row = $result->fetch_assoc()) {
                $row['is_current'] = ($currentSessionId && (int) $row['id'] === $currentSessionId) ? 1 : 0;
                $row['ip_address'] = lc_mask_ip($row['ip_address'] ?? '');
                $sessions[] = $row;
            }
            echo json_encode(['success' => true, 'sessions' => $sessions]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['action'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid request']);
            exit;
        }

        if ($data['action'] === 'revoke') {
            $sessionId = isset($data['session_id']) ? (int) $data['session_id'] : 0;
            if (!$sessionId) {
                echo json_encode(['success' => false, 'message' => 'Missing session_id']);
                exit;
            }
            $stmt = $conn->prepare(
                "UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ?"
            );
            $stmt->bind_param("ii", $sessionId, $userId);
            $stmt->execute();
            $forceLogout = $currentSessionId && $sessionId === $currentSessionId;
            if ($forceLogout) {
                lc_clear_auth_cookies();
                lc_destroy_local_session();
            }
            echo json_encode(['success' => true, 'force_logout' => $forceLogout]);
            exit;
        }

        if ($data['action'] === 'revoke_others') {
            if (!$currentSessionId) {
                echo json_encode(['success' => false, 'message' => 'Missing current session']);
                exit;
            }
            $stmt = $conn->prepare(
                "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND id != ?"
            );
            $stmt->bind_param("ii", $userId, $currentSessionId);
            $stmt->execute();
            echo json_encode(['success' => true]);
            exit;
        }

        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
    case 'settings':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        $currentUser = Auth::getCurrentUser();
        $userId = (int) $currentUser['user_id'];

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            echo json_encode([
                'success' => true,
                'settings' => getUserSettings($userId, $conn)
            ]);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
            exit;
        }

        $settings = getUserSettings($userId, $conn);
        $settings['notify_enabled'] = !empty($data['notify_enabled']) ? 1 : 0;
        $settings['notify_show_sender'] = !empty($data['notify_show_sender']) ? 1 : 0;
        $settings['notify_show_preview'] = !empty($data['notify_show_preview']) ? 1 : 0;
        if (isset($data['notify_mode'])) {
            $mode = $data['notify_mode'];
            if (!in_array($mode, ['all', 'latest'], true)) {
                $mode = 'all';
            }
            $settings['notify_mode'] = $mode;
        } elseif (!isset($settings['notify_mode'])) {
            $settings['notify_mode'] = 'all';
        }
        if (isset($data['auto_download_images_wifi'])) {
            $settings['auto_download_images_wifi'] = !empty($data['auto_download_images_wifi']) ? 1 : 0;
        }
        if (isset($data['auto_download_images_mobile'])) {
            $settings['auto_download_images_mobile'] = !empty($data['auto_download_images_mobile']) ? 1 : 0;
        }
        if (isset($data['auto_download_videos_wifi'])) {
            $settings['auto_download_videos_wifi'] = !empty($data['auto_download_videos_wifi']) ? 1 : 0;
        }
        if (isset($data['auto_download_videos_mobile'])) {
            $settings['auto_download_videos_mobile'] = !empty($data['auto_download_videos_mobile']) ? 1 : 0;
        }
        if (isset($data['auto_download_video_limit'])) {
            $settings['auto_download_video_limit'] = (int) $data['auto_download_video_limit'];
        }
        if (isset($data['cache_limit_mb'])) {
            $settings['cache_limit_mb'] = (int) $data['cache_limit_mb'];
        }
        if (isset($data['cache_thumbnails_only'])) {
            $settings['cache_thumbnails_only'] = !empty($data['cache_thumbnails_only']) ? 1 : 0;
        }
        if (isset($data['fast_reaction'])) {
            $settings['fast_reaction'] = $data['fast_reaction'];
        } elseif (!isset($settings['fast_reaction'])) {
            $settings['fast_reaction'] = "\u{1F44D}";
        }
        if (isset($settings['fast_reaction'])) {
            if (function_exists('mb_strlen')) {
                if (mb_strlen($settings['fast_reaction']) > 8) {
                    $settings['fast_reaction'] = mb_substr($settings['fast_reaction'], 0, 8);
                }
            } else {
                if (strlen($settings['fast_reaction']) > 8) {
                    $settings['fast_reaction'] = substr($settings['fast_reaction'], 0, 8);
                }
            }
        }
        if (isset($data['key_sync_enabled'])) {
            $settings['key_sync_enabled'] = !empty($data['key_sync_enabled']) ? 1 : 0;
        }
        if (isset($data['last_seen_privacy'])) {
            $privacy = $data['last_seen_privacy'];
            if (!in_array($privacy, ['everyone', 'nobody', 'contacts', 'selected'], true)) {
                $privacy = 'everyone';
            }
            $settings['last_seen_privacy'] = $privacy;
        } elseif (!isset($settings['last_seen_privacy'])) {
            $settings['last_seen_privacy'] = 'everyone';
        }
        if (array_key_exists('last_seen_selected', $data)) {
            $selected = $data['last_seen_selected'];
            if (!is_array($selected)) {
                $decoded = json_decode((string) $selected, true);
                $selected = is_array($decoded) ? $decoded : [];
            }
            $clean = [];
            foreach ($selected as $item) {
                $id = (int) $item;
                if ($id > 0) {
                    $clean[$id] = true;
                }
            }
            $settings['last_seen_selected'] = json_encode(array_keys($clean));
        } elseif (!isset($settings['last_seen_selected'])) {
            $settings['last_seen_selected'] = '[]';
        }

        if (!saveUserSettings($userId, $settings, $conn)) {
            echo json_encode(['success' => false, 'message' => 'Failed to save settings']);
            exit;
        }

        echo json_encode(['success' => true, 'settings' => $settings]);
        break;
    case 'test_encryption':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];

        echo json_encode([
            'success' => true,
            'keys_ready' => true,
            'key_sync_enabled' => false,
            'cloud_encryption' => true,
            'message' => 'Cloud Encryption (AES-256-GCM) is active'
        ]);
        break;
    case 'update_status':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Get current user data
        $currentUser = Auth::getCurrentUser();
        $userId = $currentUser['user_id'];

        // Update user status to online
        try {
            Auth::updateUserStatus($userId, 'online', $conn);
            
            echo json_encode([
                'success' => true,
                'message' => 'Status updated'
            ]);
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error updating status: ' . $e->getMessage()
            ]);
        }
        break;
    case 'user':
        // Set content type to JSON
        header('Content-Type: application/json');

        // Check if user is logged in
        if (!Auth::isLoggedIn()) {
            echo json_encode([
                'success' => false,
                'message' => 'User not authenticated'
            ]);
            exit;
        }

        // Check if user_id is provided
        if (!isset($_GET['user_id']) || !is_numeric($_GET['user_id'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Missing or invalid user_id'
            ]);
            exit;
        }

        $userId = (int)$_GET['user_id'];

        try {
            // Get user data
            $user = getUser($userId, $conn);
            
            if ($user) {
                // Remove sensitive information
                unset($user['password']);
                
                // Make sure profile_pic contains the correct path
                if (empty($user['profile_pic'])) {
                    $user['profile_pic'] = 'default.png';
                }
                
                echo json_encode([
                    'success' => true,
                    'user' => $user
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => 'User not found'
                ]);
            }
        } catch (Exception $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching user data: ' . $e->getMessage()
            ]);
        }
        break;
    case 'user_profile':
        header('Content-Type: application/json');

        if (!Auth::isLoggedIn()) {
            echo json_encode(['success' => false, 'message' => 'User not authenticated']);
            exit;
        }

        // Current viewer
        $currentUser = Auth::getCurrentUser();
        $viewerId = $currentUser ? (int) $currentUser['user_id'] : 0;

        $userId = (isset($_GET['user_id']) && is_numeric($_GET['user_id'])) ? (int) $_GET['user_id'] : $viewerId;
        if ($userId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Missing user_id']);
            exit;
        }

        $stmt = $conn->prepare(
            "SELECT u.user_id, u.username, u.full_name, u.status, u.bio, u.profile_pic, u.last_seen,
                    us.last_seen_privacy, us.last_seen_selected,
                    EXISTS(SELECT 1 FROM contacts c WHERE c.user_id = u.user_id AND c.contact_user_id = ?) as is_contact
             FROM users u
             LEFT JOIN user_settings us ON us.user_id = u.user_id
             WHERE u.user_id = ?
             LIMIT 1"
        );
        $stmt->bind_param("ii", $viewerId, $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        if (!$row = $result->fetch_assoc()) {
            echo json_encode(['success' => false, 'message' => 'User not found']);
            exit;
        }
        $row = normalizeProfileRow($row);
        if (empty($row['profile_pic'])) {
            $row['profile_pic'] = 'default.png';
        }
        $canView = canViewLastSeen(
            $viewerId,
            $row['user_id'],
            $row['last_seen_privacy'] ?? 'everyone',
            $row['last_seen_selected'] ?? '[]',
            !empty($row['is_contact'])
        );
        $lastSeen = $canView ? $row['last_seen'] : null;
        $lastSeenHidden = $canView ? 0 : 1;
        if (!$canView) {
            $row['status'] = 'offline';
        }

        echo json_encode([
            'success' => true,
            'profile' => [
                'user_id' => (int) $row['user_id'],
                'username' => $row['username'],
                'full_name' => $row['full_name'],
                'status' => $row['status'],
                'last_seen' => $lastSeen,
                'last_seen_hidden' => $lastSeenHidden,
                'bio' => $row['bio'],
                'profile_pic' => $row['profile_pic']
            ]
        ]);
        break;
    case 'update_profile':
        header('Content-Type: application/json');
        if (!Auth::isLoggedIn()) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $userId = (int) $_SESSION['user_id'];
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        $fullName = isset($data['full_name']) ? trim((string)$data['full_name']) : '';
        $bio = isset($data['bio']) ? trim((string)$data['bio']) : '';
        $newUsername = isset($data['username']) ? trim(ltrim((string)$data['username'], '@')) : '';

        // If username is provided, validate and update
        if ($newUsername !== '') {
            $uRes = Auth::updateUsername($userId, $newUsername, $conn);
            if (!$uRes['success'] && ($uRes['status'] ?? 0) !== 200) {
                http_response_code($uRes['status'] ?? 400);
                echo json_encode(['success' => false, 'message' => $uRes['message']]);
                exit;
            }
        }

        // Update name and bio
        if ($fullName !== '' || isset($data['bio'])) {
            $updateData = [
                'full_name' => $fullName !== '' ? $fullName : ($_SESSION['full_name'] ?? ''),
                'bio' => $bio,
                'bio_raw' => $bio
            ];
            $pRes = Auth::updateProfile($userId, $updateData, $conn);
            if (!$pRes['success']) {
                http_response_code($pRes['status'] ?? 400);
                echo json_encode(['success' => false, 'message' => $pRes['message']]);
                exit;
            }
            if ($fullName !== '') {
                $_SESSION['full_name'] = $fullName;
            }
        }

        $freshUser = getUser($userId, $conn);
        $freshUser = normalizeProfileRow($freshUser);
        echo json_encode([
            'success' => true,
            'message' => 'Profile updated successfully',
            'user' => [
                'user_id' => (int) $freshUser['user_id'],
                'username' => $freshUser['username'],
                'full_name' => $freshUser['full_name'],
                'bio' => $freshUser['bio'] ?? '',
                'profile_pic' => $freshUser['profile_pic'] ?? 'default.png'
            ]
        ]);
        break;
    case 'update_profile_pic':
        header('Content-Type: application/json');
        if (!Auth::isLoggedIn()) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $userId = (int) $_SESSION['user_id'];
        $maxBytes = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);

        if (!isset($_FILES['profile_pic']) || $_FILES['profile_pic']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No image uploaded or upload error']);
            exit;
        }

        if ($_FILES['profile_pic']['size'] > $maxBytes) {
            http_response_code(413);
            echo json_encode(['success' => false, 'message' => 'Image file too large']);
            exit;
        }

        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        $origName = $_FILES['profile_pic']['name'];
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid image format (JPG, PNG, GIF, WEBP only)']);
            exit;
        }

        $tmpName = $_FILES['profile_pic']['tmp_name'];
        $imgInfo = @getimagesize($tmpName);
        if ($imgInfo === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid or corrupt image file']);
            exit;
        }

        $targetDir = IMAGE_UPLOAD_DIR;
        if (!is_dir($targetDir)) {
            @mkdir($targetDir, 0755, true);
        }

        $newFilename = time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $uploadPath = $targetDir . $newFilename;

        if (!move_uploaded_file($tmpName, $uploadPath)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to save profile picture']);
            exit;
        }

        $res = Auth::updateProfilePic($userId, $newFilename, $conn);
        if ($res['success']) {
            $_SESSION['profile_pic'] = $newFilename;
            echo json_encode([
                'success' => true,
                'message' => 'Profile picture updated successfully',
                'profile_pic' => $newFilename,
                'image_url' => 'uploads/images/' . $newFilename
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $res['message']]);
        }
        break;
    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        exit;
}
