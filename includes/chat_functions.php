<?php
require_once 'config.php';
require_once 'functions.php';

/**
 * Chat Functions Class
 */
class Chat {
    public static function sendTextMessage($senderId, $receiverId, $groupId, $message, $conn) {
        if ($message === null || trim((string) $message) === '') {
            return ['success' => false, 'message' => 'Message cannot be empty'];
        }
        $encrypted = Encryption::encryptMessage($message);
        $stmt = $conn->prepare(
            "INSERT INTO messages (sender_id, receiver_id, group_id, message_type, message_text, encrypted_content)
             VALUES (?, ?, ?, 'text', NULL, ?)"
        );
        $stmt->bind_param("iiis", $senderId, $receiverId, $groupId, $encrypted);
        if ($stmt->execute()) {
            return ['success' => true, 'message_id' => $stmt->insert_id];
        }
        return ['success' => false, 'message' => 'Failed to send message: ' . $stmt->error];
    }

    public static function sendFileMessage($senderId, $receiverId, $groupId, $fileType, $fileData, $conn) {
        $fileUrl = is_string($fileData) ? $fileData : ($fileData['file_url'] ?? '');
        $caption = is_array($fileData) ? ($fileData['caption'] ?? '') : '';
        $encrypted = Encryption::encryptMessage($caption);
        $stmt = $conn->prepare(
            "INSERT INTO messages (sender_id, receiver_id, group_id, message_type, file_url, message_text, encrypted_content)
             VALUES (?, ?, ?, ?, ?, NULL, ?)"
        );
        $stmt->bind_param("iiisss", $senderId, $receiverId, $groupId, $fileType, $fileUrl, $encrypted);
        if ($stmt->execute()) {
            return ['success' => true, 'message_id' => $stmt->insert_id];
        }
        return ['success' => false, 'message' => 'Failed to send file: ' . $stmt->error];
    }

    public static function getConversations($userId, $conn) {
        $conversations = [];
        $clears = self::getChatClears($userId, $conn);
        ensureConversationReadSchema($conn);
        ensureContactsSchema($conn);

        // Direct conversations (includes self as Saved Messages when present)
        $directQuery = "
            SELECT
                u.user_id, u.username, u.full_name, u.profile_pic, u.status, u.last_seen,
                us.last_seen_privacy, us.last_seen_selected,
                cnt.custom_name as contact_nickname,
                COALESCE(NULLIF(cnt.custom_name, ''), NULLIF(u.full_name, ''), u.username) as display_name,
                EXISTS(SELECT 1 FROM contacts c WHERE c.user_id = ? AND c.contact_user_id = u.user_id) as is_contact,
                m.message_id, m.message_type, m.encrypted_content, m.key_sender, m.key_recipient,
                m.file_url, m.created_at as message_date, m.sender_id as last_sender_id,
                m.read_at,
                cr.last_seen_message_id,
                mm.user_id as mention_user_id,
                p.created_at as pinned_at,
                md.message_id as deleted_for_user
            FROM users u
            LEFT JOIN user_settings us ON us.user_id = u.user_id
            LEFT JOIN contacts cnt ON cnt.user_id = ? AND cnt.contact_user_id = u.user_id
            JOIN (
                SELECT
                    CASE
                        WHEN sender_id = ? THEN receiver_id
                        ELSE sender_id
                    END as contact_id,
                    MAX(message_id) as latest_msg_id
                FROM messages
                WHERE (sender_id = ? OR receiver_id = ?) AND group_id IS NULL AND is_deleted = 0
                  AND (expires_at IS NULL OR expires_at > NOW())
                GROUP BY contact_id
            ) latest ON u.user_id = latest.contact_id
            JOIN messages m ON m.message_id = latest.latest_msg_id
            LEFT JOIN message_mentions mm ON mm.message_id = m.message_id AND mm.user_id = ?
            LEFT JOIN pinned_chats p ON p.user_id = ? AND p.chat_type = 'direct' AND p.chat_id = u.user_id
            LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
            LEFT JOIN conversation_reads cr
                ON cr.user_id = ?
               AND cr.chat_type = IF(u.user_id = ?, 'saved', 'direct')
               AND cr.chat_id = u.user_id
            ORDER BY m.created_at DESC
        ";

        $directStmt = $conn->prepare($directQuery);
        $hasSaved = false;
        if ($directStmt) {
            $directStmt->bind_param(
                "iiiiiiiiii",
                $userId,
                $userId,
                $userId,
                $userId,
                $userId,
                $userId,
                $userId,
                $userId,
                $userId,
                $userId
            );
            if ($directStmt->execute()) {
                $directResult = $directStmt->get_result();
                while ($row = $directResult->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['last_message'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            if ((int) $row['user_id'] === (int) $userId) {
                $row['type'] = 'saved';
                $row['full_name'] = 'Saved Messages';
                $row['username'] = 'saved';
                $row['profile_pic'] = 'saved.png';
                $hasSaved = true;
            } else {
                $row['type'] = 'direct';
                if (!empty($row['contact_nickname'])) {
                    $row['full_name'] = $row['contact_nickname'];
                }
                if (empty($row['profile_pic'])) {
                    $row['profile_pic'] = 'default.png';
                }
            }
            if ($row['type'] === 'direct') {
                $canView = canViewLastSeen(
                    $userId,
                    $row['user_id'],
                    $row['last_seen_privacy'] ?? 'everyone',
                    $row['last_seen_selected'] ?? '[]',
                    !empty($row['is_contact'])
                );
                if (!$canView) {
                    $row['last_seen'] = null;
                    $row['last_seen_hidden'] = 1;
                    $row['status'] = 'offline';
                } else {
                    $row['last_seen_hidden'] = 0;
                }
            }
            $lastSeenMessageId = isset($row['last_seen_message_id']) ? (int) $row['last_seen_message_id'] : 0;
            if ($lastSeenMessageId > 0) {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && (int) $row['message_id'] > $lastSeenMessageId) ? 1 : 0;
            } else {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && empty($row['read_at'])) ? 1 : 0;
            }
            $row['mention_flag'] = !empty($row['mention_user_id']) ? 1 : 0;
            unset($row['last_seen_privacy'], $row['last_seen_selected'], $row['is_contact'], $row['read_at'], $row['last_seen_message_id'], $row['mention_user_id']);
            $row['is_pinned'] = !empty($row['pinned_at']) ? 1 : 0;
            $clearAt = null;
            if ($row['type'] === 'saved') {
                $clearAt = $clears['saved'][$userId] ?? null;
            } else {
                $clearAt = $clears['direct'][$row['user_id']] ?? null;
            }
            if (!empty($row['deleted_for_user']) || ($clearAt && !empty($row['message_date']) && strtotime($row['message_date']) <= strtotime($clearAt))) {
                $row['message_id'] = null;
                $row['message_type'] = null;
                $row['encrypted_content'] = null;
                $row['file_url'] = null;
                $row['message_date'] = null;
                $row['last_sender_id'] = null;
                $row['key_sender'] = null;
                $row['key_recipient'] = null;
            }
            $conversations[] = $row;
                }
            }
            $directStmt->close();
        } else {
            error_log("Chat::getConversations directStmt prepare failed: " . $conn->error);
        }

        if (!$hasSaved && $userId) {
            $savedConv = [
                'user_id' => (int) $userId,
                'username' => 'saved',
                'full_name' => 'Saved Messages',
                'profile_pic' => 'saved.png',
                'status' => 'online',
                'last_seen' => null,
                'last_seen_hidden' => 0,
                'is_contact' => 0,
                'message_id' => null,
                'message_type' => null,
                'encrypted_content' => null,
                'message_text' => null,
                'last_message' => null,
                'text' => null,
                'key_sender' => null,
                'key_recipient' => null,
                'file_url' => null,
                'message_date' => null,
                'last_sender_id' => null,
                'read_at' => null,
                'is_unread' => 0,
                'mention_flag' => 0,
                'is_pinned' => 1,
                'pinned_at' => date('Y-m-d H:i:s'),
                'type' => 'saved'
            ];
            array_unshift($conversations, $savedConv);
            $hasSaved = true;
        }

        // Group conversations
        $groupQuery = "
            SELECT
                g.group_id, g.group_name, g.group_pic, g.group_username, g.join_policy, g.content_protection,
                g.slow_mode_seconds, g.slow_mode_admin_exempt, g.disappear_after_seconds,
                gm.role as group_role,
                gp.can_send_messages, gp.can_send_media, gp.can_pin_messages, gp.can_add_users, gp.can_remove_users, gp.can_change_info,
                m.message_id, m.message_type, m.encrypted_content, m.file_url,
                m.created_at as message_date, m.sender_id as last_sender_id,
                u.username as last_sender_name,
                mk.wrapped_key as key_for_user,
                cr.last_seen_message_id,
                mr.read_at as message_read_at,
                mm.user_id as mention_user_id,
                p.created_at as pinned_at,
                md.message_id as deleted_for_user
            FROM groups g
            JOIN group_members gm ON g.group_id = gm.group_id
            LEFT JOIN group_admin_permissions gp ON gp.group_id = g.group_id AND gp.user_id = gm.user_id
            LEFT JOIN (
                SELECT
                    group_id,
                    MAX(message_id) as latest_msg_id
                FROM messages
                WHERE group_id IS NOT NULL AND is_deleted = 0
                  AND (expires_at IS NULL OR expires_at > NOW())
                GROUP BY group_id
            ) latest ON g.group_id = latest.group_id
            LEFT JOIN messages m ON m.message_id = latest.latest_msg_id
            LEFT JOIN users u ON u.user_id = m.sender_id
            LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
            LEFT JOIN message_reads mr ON mr.message_id = m.message_id AND mr.user_id = ?
            LEFT JOIN conversation_reads cr ON cr.user_id = ? AND cr.chat_type = 'group' AND cr.chat_id = g.group_id
            LEFT JOIN message_mentions mm ON mm.message_id = m.message_id AND mm.user_id = ?
            LEFT JOIN pinned_chats p ON p.user_id = ? AND p.chat_type = 'group' AND p.chat_id = g.group_id
            LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
            WHERE gm.user_id = ?
            ORDER BY m.created_at DESC
        ";

        $groupStmt = $conn->prepare($groupQuery);
        if ($groupStmt) {
            $groupStmt->bind_param("iiiiiii", $userId, $userId, $userId, $userId, $userId, $userId, $userId);
            if ($groupStmt->execute()) {
                $groupResult = $groupStmt->get_result();
                while ($row = $groupResult->fetch_assoc()) {
            $row['type'] = 'group';
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['last_message'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            $row['is_pinned'] = !empty($row['pinned_at']) ? 1 : 0;
            $lastSeenMessageId = isset($row['last_seen_message_id']) ? (int) $row['last_seen_message_id'] : 0;
            if ($lastSeenMessageId > 0) {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && (int) $row['message_id'] > $lastSeenMessageId) ? 1 : 0;
            } else {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && empty($row['message_read_at'])) ? 1 : 0;
            }
            $row['mention_flag'] = !empty($row['mention_user_id']) ? 1 : 0;
            $clearAt = $clears['group'][$row['group_id']] ?? null;
            if (!empty($row['deleted_for_user']) || ($clearAt && !empty($row['message_date']) && strtotime($row['message_date']) <= strtotime($clearAt))) {
                $row['message_id'] = null;
                $row['message_type'] = null;
                $row['encrypted_content'] = null;
                $row['file_url'] = null;
                $row['message_date'] = null;
                $row['last_sender_name'] = null;
                $row['key_for_user'] = null;
            }
            unset($row['last_seen_message_id'], $row['message_read_at'], $row['mention_user_id']);
                    $conversations[] = $row;
                }
            }
            $groupStmt->close();
        }

        // Channel conversations
        $channelQuery = "
            SELECT
                c.channel_id, c.channel_name, c.channel_pic, c.channel_username, c.visibility, c.content_protection,
                c.disappear_after_seconds,
                cm.role as channel_role,
                cap.can_post, cap.can_edit, cap.can_delete, cap.can_pin, cap.can_manage,
                m.message_id, m.message_type, m.encrypted_content, m.file_url,
                m.created_at as message_date, m.sender_id as last_sender_id,
                u.username as last_sender_name,
                mk.wrapped_key as key_for_user,
                cr.last_seen_message_id,
                mr.read_at as message_read_at,
                mm.user_id as mention_user_id,
                p.created_at as pinned_at,
                md.message_id as deleted_for_user
            FROM channels c
            JOIN channel_members cm ON c.channel_id = cm.channel_id
            LEFT JOIN channel_admin_permissions cap ON cap.channel_id = c.channel_id AND cap.user_id = cm.user_id
            LEFT JOIN (
                SELECT
                    channel_id,
                    MAX(message_id) as latest_msg_id
                FROM messages
                WHERE channel_id IS NOT NULL AND is_deleted = 0
                  AND (expires_at IS NULL OR expires_at > NOW())
                GROUP BY channel_id
            ) latest ON c.channel_id = latest.channel_id
            LEFT JOIN messages m ON m.message_id = latest.latest_msg_id
            LEFT JOIN users u ON u.user_id = m.sender_id
            LEFT JOIN message_keys mk ON mk.message_id = m.message_id AND mk.user_id = ?
            LEFT JOIN message_reads mr ON mr.message_id = m.message_id AND mr.user_id = ?
            LEFT JOIN conversation_reads cr ON cr.user_id = ? AND cr.chat_type = 'channel' AND cr.chat_id = c.channel_id
            LEFT JOIN message_mentions mm ON mm.message_id = m.message_id AND mm.user_id = ?
            LEFT JOIN pinned_chats p ON p.user_id = ? AND p.chat_type = 'channel' AND p.chat_id = c.channel_id
            LEFT JOIN message_deletes md ON md.message_id = m.message_id AND md.user_id = ?
            WHERE cm.user_id = ?
            ORDER BY m.created_at DESC
        ";

        $channelStmt = $conn->prepare($channelQuery);
        if ($channelStmt) {
            $channelStmt->bind_param("iiiiiii", $userId, $userId, $userId, $userId, $userId, $userId, $userId);
            if ($channelStmt->execute()) {
                $channelResult = $channelStmt->get_result();
                while ($row = $channelResult->fetch_assoc()) {
            $row['type'] = 'channel';
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['last_message'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            $row['is_pinned'] = !empty($row['pinned_at']) ? 1 : 0;
            $lastSeenMessageId = isset($row['last_seen_message_id']) ? (int) $row['last_seen_message_id'] : 0;
            if ($lastSeenMessageId > 0) {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && (int) $row['message_id'] > $lastSeenMessageId) ? 1 : 0;
            } else {
                $row['is_unread'] = (!empty($row['message_id']) && (int) $row['last_sender_id'] !== (int) $userId && empty($row['message_read_at'])) ? 1 : 0;
            }
            $row['mention_flag'] = !empty($row['mention_user_id']) ? 1 : 0;
            $clearAt = $clears['channel'][$row['channel_id']] ?? null;
            if (!empty($row['deleted_for_user']) || ($clearAt && !empty($row['message_date']) && strtotime($row['message_date']) <= strtotime($clearAt))) {
                $row['message_id'] = null;
                $row['message_type'] = null;
                $row['encrypted_content'] = null;
                $row['file_url'] = null;
                $row['message_date'] = null;
                $row['last_sender_name'] = null;
                $row['last_sender_id'] = null;
                $row['key_for_user'] = null;
            }
            unset($row['last_seen_message_id'], $row['message_read_at'], $row['mention_user_id']);
                    $conversations[] = $row;
                }
            }
            $channelStmt->close();
        }

        // Deduplicate conversations strictly
        $uniqueKeys = [];
        $dedupedConversations = [];
        foreach ($conversations as $conv) {
            $cType = $conv['type'] ?? 'direct';
            $isSelf = ((int) ($conv['user_id'] ?? 0) === (int) $userId);
            if ($cType === 'saved' || ($cType === 'direct' && $isSelf)) {
                $uniqKey = 'saved';
                $conv['type'] = 'saved';
                $conv['full_name'] = 'Saved Messages';
                $conv['username'] = 'saved';
                $conv['profile_pic'] = 'saved.png';
            } else {
                $cId = ($cType === 'group' ? ($conv['group_id'] ?? 0) : ($cType === 'channel' ? ($conv['channel_id'] ?? 0) : ($conv['user_id'] ?? 0)));
                $uniqKey = $cType . ':' . $cId;
            }
            if (!isset($uniqueKeys[$uniqKey])) {
                $uniqueKeys[$uniqKey] = true;
                $dedupedConversations[] = $conv;
            }
        }
        $conversations = $dedupedConversations;

        usort($conversations, function ($a, $b) {
            $aPinned = !empty($a['is_pinned']);
            $bPinned = !empty($b['is_pinned']);
            if ($aPinned !== $bPinned) {
                return $aPinned ? -1 : 1;
            }
            $dateA = $a['message_date'] ?? $a['created_at'] ?? null;
            $dateB = $b['message_date'] ?? $b['created_at'] ?? null;
            if ($dateA === null && $dateB === null) {
                return 0;
            }
            if ($dateA === null) {
                return 1;
            }
            if ($dateB === null) {
                return -1;
            }
            return strtotime($dateB) - strtotime($dateA);
        });

        return $conversations;
    }

    public static function getDirectMessages($userId, $otherUserId, $conn, $limit = 50, $offset = 0, $since = 0, $sinceId = 0) {
        $timeCondition = '';
        $useSince = $since > 0;
        $useSinceId = $sinceId > 0;
        if ($useSince && $useSinceId) {
            $timeCondition = " AND (UNIX_TIMESTAMP(m.created_at) > ? OR m.message_id > ?)";
        } elseif ($useSince) {
            $timeCondition = " AND UNIX_TIMESTAMP(m.created_at) > ?";
        } elseif ($useSinceId) {
            $timeCondition = " AND m.message_id > ?";
        }
        $isSaved = ((int) $userId === (int) $otherUserId);
        $clearType = $isSaved ? 'saved' : 'direct';
        $clearedAt = self::getChatClearTime($userId, $clearType, $otherUserId, $conn);
        $clearCondition = '';
        if ($clearedAt) {
            $clearCondition = " AND UNIX_TIMESTAMP(m.created_at) > UNIX_TIMESTAMP(?)";
        }

        if ($isSaved) {
            $chatCondition = "
                m.sender_id = ?
                AND (m.receiver_id = ? OR m.receiver_id IS NULL OR m.receiver_id = 0 OR m.receiver_id = m.sender_id)
                AND m.group_id IS NULL
                AND (m.channel_id IS NULL OR m.channel_id = 0)
            ";
            $params = [$userId, $userId, $userId];
            $types = "iii";
        } else {
            $chatCondition = "
                ((m.sender_id = ? AND m.receiver_id = ?) OR
                 (m.sender_id = ? AND m.receiver_id = ?))
                AND m.group_id IS NULL
                AND (m.channel_id IS NULL OR m.channel_id = 0)
            ";
            $params = [$userId, $userId, $otherUserId, $otherUserId, $userId];
            $types = "iiiii";
        }

        $orderClause = ($useSince || $useSinceId)
            ? "ORDER BY m.message_id ASC LIMIT ? OFFSET ?"
            : "ORDER BY m.message_id DESC LIMIT ? OFFSET ?";

        $query = "
            SELECT
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
            WHERE
                $chatCondition
                AND m.is_deleted = 0
                AND (m.expires_at IS NULL OR m.expires_at > NOW())
                AND md.message_id IS NULL
                $timeCondition
                $clearCondition
            $orderClause
        ";

        $stmt = $conn->prepare($query);
        if ($useSince && $useSinceId) {
            $types .= "i";
            $params[] = $since;
            $types .= "i";
            $params[] = $sinceId;
        } elseif ($useSince) {
            $types .= "i";
            $params[] = $since;
        } elseif ($useSinceId) {
            $types .= "i";
            $params[] = $sinceId;
        }
        if ($clearedAt) {
            $types .= "s";
            $params[] = $clearedAt;
        }
        $types .= "ii";
        $params[] = $limit;
        $params[] = $offset;
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();

        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            if (empty($row['profile_pic'])) {
                $row['profile_pic'] = 'default.png';
            }
            if ((int) $row['sender_id'] !== (int) $userId) {
                if (empty($row['delivered_at'])) {
                    $row['delivered_at'] = self::markMessageDelivered($row['message_id'], $conn);
                }
                if (empty($row['read_at'])) {
                    $row['read_at'] = self::markMessageRead($row['message_id'], $conn);
                }
            }
            $messages[] = $row;
        }

        if (!$useSince && !$useSinceId && !empty($messages)) {
            $messages = array_reverse($messages);
        }

        return $messages;
    }

    public static function getGroupMessages($userId, $groupId, $conn, $limit = 50, $offset = 0, $since = 0, $sinceId = 0) {
        $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $groupId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            return ['success' => false, 'message' => 'You are not a member of this group'];
        }

        $timeCondition = '';
        $useSince = $since > 0;
        $useSinceId = $sinceId > 0;
        if ($useSince && $useSinceId) {
            $timeCondition = " AND (UNIX_TIMESTAMP(m.created_at) > ? OR m.message_id > ?)";
        } elseif ($useSince) {
            $timeCondition = " AND UNIX_TIMESTAMP(m.created_at) > ?";
        } elseif ($useSinceId) {
            $timeCondition = " AND m.message_id > ?";
        }
        $clearedAt = self::getChatClearTime($userId, 'group', $groupId, $conn);
        $clearCondition = '';
        if ($clearedAt) {
            $clearCondition = " AND UNIX_TIMESTAMP(m.created_at) > UNIX_TIMESTAMP(?)";
        }

        $orderClause = ($useSince || $useSinceId)
            ? "ORDER BY m.message_id ASC LIMIT ? OFFSET ?"
            : "ORDER BY m.message_id DESC LIMIT ? OFFSET ?";

        $query = "
            SELECT
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
            $clearCondition
            $orderClause
        ";

        $stmt = $conn->prepare($query);
        $types = "iii";
        $params = [$userId, $userId, $groupId];
        if ($useSince && $useSinceId) {
            $types .= "i";
            $params[] = $since;
            $types .= "i";
            $params[] = $sinceId;
        } elseif ($useSince) {
            $types .= "i";
            $params[] = $since;
        } elseif ($useSinceId) {
            $types .= "i";
            $params[] = $sinceId;
        }
        if ($clearedAt) {
            $types .= "s";
            $params[] = $clearedAt;
        }
        $types .= "ii";
        $params[] = $limit;
        $params[] = $offset;
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();

        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            if (empty($row['profile_pic'])) {
                $row['profile_pic'] = 'default.png';
            }
            self::upsertGroupRead($row['message_id'], $userId, $conn);
            $messages[] = $row;
        }

        if (!$useSince && !$useSinceId && !empty($messages)) {
            $messages = array_reverse($messages);
        }

        return $messages;
    }

    public static function getChannelMessages($userId, $channelId, $conn, $limit = 50, $offset = 0, $since = 0, $sinceId = 0) {
        $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $channelId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();
        if ($memberResult->num_rows === 0) {
            return ['success' => false, 'message' => 'You are not subscribed to this channel'];
        }

        $timeCondition = '';
        $useSince = $since > 0;
        $useSinceId = $sinceId > 0;
        if ($useSince && $useSinceId) {
            $timeCondition = " AND (UNIX_TIMESTAMP(m.created_at) > ? OR m.message_id > ?)";
        } elseif ($useSince) {
            $timeCondition = " AND UNIX_TIMESTAMP(m.created_at) > ?";
        } elseif ($useSinceId) {
            $timeCondition = " AND m.message_id > ?";
        }
        $clearedAt = self::getChatClearTime($userId, 'channel', $channelId, $conn);
        $clearCondition = '';
        if ($clearedAt) {
            $clearCondition = " AND UNIX_TIMESTAMP(m.created_at) > UNIX_TIMESTAMP(?)";
        }

        $orderClause = ($useSince || $useSinceId)
            ? "ORDER BY m.message_id ASC LIMIT ? OFFSET ?"
            : "ORDER BY m.message_id DESC LIMIT ? OFFSET ?";

        $query = "
            SELECT
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
            $clearCondition
            $orderClause
        ";

        $stmt = $conn->prepare($query);
        $types = "iii";
        $params = [$userId, $userId, $channelId];
        if ($useSince && $useSinceId) {
            $types .= "i";
            $params[] = $since;
            $types .= "i";
            $params[] = $sinceId;
        } elseif ($useSince) {
            $types .= "i";
            $params[] = $since;
        } elseif ($useSinceId) {
            $types .= "i";
            $params[] = $sinceId;
        }
        if ($clearedAt) {
            $types .= "s";
            $params[] = $clearedAt;
        }
        $types .= "ii";
        $params[] = $limit;
        $params[] = $offset;
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();

        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $row = normalizeProfileRow($row);
            $row['encrypted_content'] = unwrapCiphertext($row['encrypted_content']);
            $row['message_text'] = $row['encrypted_content'];
            $row['text'] = $row['encrypted_content'];
            if (empty($row['profile_pic'])) {
                $row['profile_pic'] = 'default.png';
            }
            $messages[] = $row;
        }

        if (!$useSince && !$useSinceId && !empty($messages)) {
            $messages = array_reverse($messages);
        }

        return $messages;
    }

    private static function markMessageDelivered($messageId, $conn) {
        $stmt = $conn->prepare("UPDATE messages SET delivered_at = NOW() WHERE message_id = ? AND delivered_at IS NULL");
        $stmt->bind_param("i", $messageId);
        $stmt->execute();
        $timestamp = date('Y-m-d H:i:s');
        if ($stmt->affected_rows > 0) {
            $infoStmt = $conn->prepare("SELECT sender_id, receiver_id FROM messages WHERE message_id = ? LIMIT 1");
            $infoStmt->bind_param("i", $messageId);
            $infoStmt->execute();
            $info = $infoStmt->get_result()->fetch_assoc();
            if ($info && !empty($info['sender_id']) && !empty($info['receiver_id'])) {
                $payload = [
                    'message_id' => (int) $messageId,
                    'delivered_at' => $timestamp,
                    'read_at' => null,
                    'chat_type' => 'direct'
                ];
                lc_record_event((int) $info['sender_id'], (int) $info['receiver_id'], 'seen_update', $payload, $conn);
            }
        }
        return $timestamp;
    }

    private static function markMessageRead($messageId, $conn) {
        $stmt = $conn->prepare("UPDATE messages SET read_at = NOW() WHERE message_id = ? AND read_at IS NULL");
        $stmt->bind_param("i", $messageId);
        $stmt->execute();
        $timestamp = date('Y-m-d H:i:s');
        if ($stmt->affected_rows > 0) {
            $infoStmt = $conn->prepare("SELECT sender_id, receiver_id FROM messages WHERE message_id = ? LIMIT 1");
            $infoStmt->bind_param("i", $messageId);
            $infoStmt->execute();
            $info = $infoStmt->get_result()->fetch_assoc();
            if ($info && !empty($info['sender_id']) && !empty($info['receiver_id'])) {
                $payload = [
                    'message_id' => (int) $messageId,
                    'delivered_at' => null,
                    'read_at' => $timestamp,
                    'chat_type' => 'direct'
                ];
                lc_record_event((int) $info['sender_id'], (int) $info['receiver_id'], 'seen_update', $payload, $conn);
            }
        }
        return $timestamp;
    }

    private static function upsertGroupRead($messageId, $userId, $conn) {
        $stmt = $conn->prepare(
            "INSERT INTO message_reads (message_id, user_id, read_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)"
        );
        $stmt->bind_param("ii", $messageId, $userId);
        $stmt->execute();
    }

    public static function createGroup($userId, $groupName, $groupDescription, $groupUsername, $joinPolicy, $conn) {
        if (empty($groupName)) {
            return ['success' => false, 'message' => 'Group name cannot be empty'];
        }
        $joinPolicy = in_array($joinPolicy, ['invite', 'public'], true) ? $joinPolicy : 'invite';
        $groupUsername = trim($groupUsername);
        if (!empty($groupUsername) && !preg_match('/^[a-zA-Z0-9_]{4,32}$/', $groupUsername)) {
            return ['success' => false, 'message' => 'Invalid group username'];
        }

        $stmt = $conn->prepare(
            "INSERT INTO groups (group_name, group_description, group_username, join_policy, created_by)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->bind_param("ssssi", $groupName, $groupDescription, $groupUsername, $joinPolicy, $userId);

        if ($stmt->execute()) {
            $groupId = $stmt->insert_id;
            $memberStmt = $conn->prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')");
            $memberStmt->bind_param("ii", $groupId, $userId);
            $memberStmt->execute();
            $permStmt = $conn->prepare(
                "INSERT INTO group_admin_permissions
                    (group_id, user_id, can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info)
                 VALUES (?, ?, 1, 1, 1, 1, 1, 1)"
            );
            $permStmt->bind_param("ii", $groupId, $userId);
            $permStmt->execute();
            return ['success' => true, 'group_id' => $groupId];
        }
        return ['success' => false, 'message' => 'Failed to create group: ' . $conn->error];
    }

    public static function addGroupMember($groupId, $userId, $role, $addedBy, $conn) {
        $permissions = self::getGroupPermissions($groupId, $addedBy, $conn);
        if (!$permissions || $permissions['role'] === 'member') {
            return ['success' => false, 'message' => 'Only admins can add members to groups'];
        }
        if (empty($permissions['can_add_users'])) {
            return ['success' => false, 'message' => 'You do not have permission to add members'];
        }

        $memberCheck = $conn->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $groupId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();

        if ($memberResult->num_rows > 0) {
            return ['success' => false, 'message' => 'User is already a member of this group'];
        }

        $role = in_array($role, ['admin', 'member'], true) ? $role : 'member';
        $stmt = $conn->prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)");
        $stmt->bind_param("iis", $groupId, $userId, $role);

        if ($stmt->execute()) {
            if ($role === 'admin') {
                $permStmt = $conn->prepare(
                    "INSERT INTO group_admin_permissions
                        (group_id, user_id, can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info)
                     VALUES (?, ?, 1, 1, 1, 1, 1, 1)
                     ON DUPLICATE KEY UPDATE
                        can_send_messages = VALUES(can_send_messages),
                        can_send_media = VALUES(can_send_media),
                        can_pin_messages = VALUES(can_pin_messages),
                        can_add_users = VALUES(can_add_users),
                        can_remove_users = VALUES(can_remove_users),
                        can_change_info = VALUES(can_change_info)"
                );
                $permStmt->bind_param("ii", $groupId, $userId);
                $permStmt->execute();
            }
            return ['success' => true, 'message' => 'User added to group successfully'];
        }

        return ['success' => false, 'message' => 'Failed to add user to group: ' . $conn->error];
    }

    public static function createChannel($userId, $channelName, $channelDescription, $channelUsername, $visibility, $conn) {
        if (empty($channelName)) {
            return ['success' => false, 'message' => 'Channel name cannot be empty'];
        }
        $visibility = in_array($visibility, ['public', 'private'], true) ? $visibility : 'public';
        $channelUsername = trim($channelUsername);
        if (!empty($channelUsername) && !preg_match('/^[a-zA-Z0-9_]{4,32}$/', $channelUsername)) {
            return ['success' => false, 'message' => 'Invalid channel username'];
        }
        $stmt = $conn->prepare(
            "INSERT INTO channels (channel_name, channel_description, channel_username, visibility, created_by)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->bind_param("ssssi", $channelName, $channelDescription, $channelUsername, $visibility, $userId);

        if ($stmt->execute()) {
            $channelId = $stmt->insert_id;
            $memberStmt = $conn->prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')");
            $memberStmt->bind_param("ii", $channelId, $userId);
            $memberStmt->execute();
            $permStmt = $conn->prepare(
                "INSERT INTO channel_admin_permissions
                    (channel_id, user_id, can_post, can_edit, can_delete, can_pin, can_manage)
                 VALUES (?, ?, 1, 1, 1, 1, 1)"
            );
            $permStmt->bind_param("ii", $channelId, $userId);
            $permStmt->execute();
            return ['success' => true, 'channel_id' => $channelId];
        }
        return ['success' => false, 'message' => 'Failed to create channel: ' . $conn->error];
    }

    public static function addChannelMember($channelId, $userId, $role, $addedBy, $conn) {
        $permissions = self::getChannelPermissions($channelId, $addedBy, $conn);
        if (!$permissions || $permissions['role'] === 'subscriber') {
            return ['success' => false, 'message' => 'Only admins can add subscribers'];
        }
        if (empty($permissions['can_manage'])) {
            return ['success' => false, 'message' => 'You do not have permission to manage this channel'];
        }

        $memberCheck = $conn->prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $memberCheck->bind_param("ii", $channelId, $userId);
        $memberCheck->execute();
        $memberResult = $memberCheck->get_result();

        if ($memberResult->num_rows > 0) {
            return ['success' => false, 'message' => 'User is already subscribed to this channel'];
        }

        $role = in_array($role, ['admin', 'subscriber'], true) ? $role : 'subscriber';
        $stmt = $conn->prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)");
        $stmt->bind_param("iis", $channelId, $userId, $role);

        if ($stmt->execute()) {
            if ($role === 'admin') {
                $permStmt = $conn->prepare(
                    "INSERT INTO channel_admin_permissions
                        (channel_id, user_id, can_post, can_edit, can_delete, can_pin, can_manage)
                     VALUES (?, ?, 1, 1, 1, 1, 1)
                     ON DUPLICATE KEY UPDATE
                        can_post = VALUES(can_post),
                        can_edit = VALUES(can_edit),
                        can_delete = VALUES(can_delete),
                        can_pin = VALUES(can_pin),
                        can_manage = VALUES(can_manage)"
                );
                $permStmt->bind_param("ii", $channelId, $userId);
                $permStmt->execute();
            }
            return ['success' => true, 'message' => 'Subscriber added successfully'];
        }

        return ['success' => false, 'message' => 'Failed to add subscriber: ' . $conn->error];
    }

    public static function getGroupPermissions($groupId, $userId, $conn) {
        $stmt = $conn->prepare(
            "SELECT gm.role, gp.can_send_messages, gp.can_send_media, gp.can_pin_messages,
                    gp.can_add_users, gp.can_remove_users, gp.can_change_info
             FROM group_members gm
             LEFT JOIN group_admin_permissions gp ON gp.group_id = gm.group_id AND gp.user_id = gm.user_id
             WHERE gm.group_id = ? AND gm.user_id = ?"
        );
        $stmt->bind_param("ii", $groupId, $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            return null;
        }
        $row = $result->fetch_assoc();
        $role = $row['role'] ?? 'member';
        $defaults = [
            'role' => $role,
            'can_send_messages' => 1,
            'can_send_media' => 1,
            'can_pin_messages' => 0,
            'can_add_users' => 0,
            'can_remove_users' => 0,
            'can_change_info' => 0
        ];
        if ($role === 'member') {
            return [
                'role' => $role,
                'can_send_messages' => (int) ($row['can_send_messages'] ?? 1),
                'can_send_media' => (int) ($row['can_send_media'] ?? 1),
                'can_pin_messages' => 0,
                'can_add_users' => 0,
                'can_remove_users' => 0,
                'can_change_info' => 0
            ];
        }
        if ($role === 'owner') {
            return [
                'role' => $role,
                'can_send_messages' => 1,
                'can_send_media' => 1,
                'can_pin_messages' => 1,
                'can_add_users' => 1,
                'can_remove_users' => 1,
                'can_change_info' => 1
            ];
        }
        return [
            'role' => $role,
            'can_send_messages' => (int) ($row['can_send_messages'] ?? 1),
            'can_send_media' => (int) ($row['can_send_media'] ?? 1),
            'can_pin_messages' => (int) ($row['can_pin_messages'] ?? 1),
            'can_add_users' => (int) ($row['can_add_users'] ?? 1),
            'can_remove_users' => (int) ($row['can_remove_users'] ?? 1),
            'can_change_info' => (int) ($row['can_change_info'] ?? 1)
        ];
    }

    public static function getChannelPermissions($channelId, $userId, $conn) {
        $stmt = $conn->prepare(
            "SELECT cm.role, cap.can_post, cap.can_edit, cap.can_delete, cap.can_pin, cap.can_manage
             FROM channel_members cm
             LEFT JOIN channel_admin_permissions cap ON cap.channel_id = cm.channel_id AND cap.user_id = cm.user_id
             WHERE cm.channel_id = ? AND cm.user_id = ?"
        );
        $stmt->bind_param("ii", $channelId, $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            return null;
        }
        $row = $result->fetch_assoc();
        $role = $row['role'] ?? 'subscriber';
        if ($role === 'subscriber') {
            return [
                'role' => $role,
                'can_post' => 0,
                'can_edit' => 0,
                'can_delete' => 0,
                'can_pin' => 0,
                'can_manage' => 0
            ];
        }
        if ($role === 'owner') {
            return [
                'role' => $role,
                'can_post' => 1,
                'can_edit' => 1,
                'can_delete' => 1,
                'can_pin' => 1,
                'can_manage' => 1
            ];
        }
        return [
            'role' => $role,
            'can_post' => (int) ($row['can_post'] ?? 1),
            'can_edit' => (int) ($row['can_edit'] ?? 1),
            'can_delete' => (int) ($row['can_delete'] ?? 1),
            'can_pin' => (int) ($row['can_pin'] ?? 1),
            'can_manage' => (int) ($row['can_manage'] ?? 1)
        ];
    }

    private static function getChatClears($userId, $conn) {
        $clears = [
            'direct' => [],
            'group' => [],
            'channel' => [],
            'saved' => []
        ];
        if (!$conn || !($conn instanceof mysqli)) {
            return $clears;
        }
        $stmt = $conn->prepare("SELECT chat_type, chat_id, cleared_at FROM chat_clears WHERE user_id = ?");
        if (!$stmt) {
            return $clears;
        }
        $stmt->bind_param("i", $userId);
        if ($stmt->execute()) {
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $type = $row['chat_type'];
                if (!isset($clears[$type])) {
                    $clears[$type] = [];
                }
                $clears[$type][(int) $row['chat_id']] = $row['cleared_at'];
            }
        }
        $stmt->close();
        return $clears;
    }

    private static function getChatClearTime($userId, $chatType, $chatId, $conn) {
        if (!$conn || !($conn instanceof mysqli)) {
            return null;
        }
        if ($chatType === 'saved') {
            $stmt = $conn->prepare("SELECT cleared_at FROM chat_clears WHERE user_id = ? AND chat_type = 'saved' AND chat_id = ? LIMIT 1");
            if (!$stmt) return null;
            $stmt->bind_param("ii", $userId, $chatId);
        } else {
            $stmt = $conn->prepare("SELECT cleared_at FROM chat_clears WHERE user_id = ? AND chat_type = ? AND chat_id = ? LIMIT 1");
            if (!$stmt) return null;
            $stmt->bind_param("isi", $userId, $chatType, $chatId);
        }
        if (!$stmt->execute()) {
            $stmt->close();
            return null;
        }
        $result = $stmt->get_result();
        $clearedAt = null;
        if ($row = $result->fetch_assoc()) {
            $clearedAt = $row['cleared_at'];
        }
        $stmt->close();
        return $clearedAt;
    }
}
