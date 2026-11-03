-- ============================================================================
-- Liquid Messenger - Complete Production Database Schema
-- Compatible with MySQL 5.7+ / 8.0+ / MariaDB 10.3+
-- Full utf8mb4 multi-language & emoji support
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Core user accounts and profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `bio` text DEFAULT NULL,
  `profile_pic` varchar(255) DEFAULT 'default.png',
  `status` enum('online','offline','away') NOT NULL DEFAULT 'offline',
  `last_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uniq_email` (`email`),
  UNIQUE KEY `uniq_username` (`username`),
  KEY `idx_last_seen` (`last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: user_settings
-- User preferences, notification controls, privacy, and media auto-download
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_settings` (
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
  `last_seen_selected` text DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: user_sessions
-- Active device sessions and authentication tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_sessions` (
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
  UNIQUE KEY `uniq_session_token` (`session_token_hash`),
  KEY `idx_session_user` (`user_id`),
  KEY `idx_session_active` (`last_active`),
  CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: user_devices
-- Registered user device fingerprints
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_devices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `device_id` varchar(64) NOT NULL,
  `device_name` varchar(80) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_device` (`user_id`, `device_id`),
  KEY `idx_device_user` (`user_id`),
  KEY `idx_device_active` (`last_active`),
  CONSTRAINT `fk_user_devices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: user_keys
-- Backward compatibility key store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_keys` (
  `user_id` int(11) NOT NULL,
  `public_key` text NOT NULL,
  `encrypted_private_key` text DEFAULT NULL,
  `salt` varchar(64) DEFAULT NULL,
  `iv` varchar(32) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: user_folders
-- Custom chat organization folders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_folders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `name` varchar(64) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_folders` (`user_id`),
  CONSTRAINT `fk_user_folders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: user_folder_chats
-- Chat assignments to custom folders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_folder_chats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `folder_id` int(11) NOT NULL,
  `conversation_type` varchar(16) NOT NULL,
  `conversation_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_folder_chat` (`folder_id`, `conversation_type`, `conversation_id`),
  KEY `idx_folder_id` (`folder_id`),
  CONSTRAINT `fk_user_folder_chats_folder` FOREIGN KEY (`folder_id`) REFERENCES `user_folders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: contacts
-- Mutual contact list entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contacts` (
  `contact_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `contact_user_id` int(11) NOT NULL,
  `custom_name` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`contact_id`),
  UNIQUE KEY `uniq_contact` (`user_id`, `contact_user_id`),
  KEY `idx_contact_user` (`contact_user_id`),
  CONSTRAINT `fk_contacts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contacts_contact_user` FOREIGN KEY (`contact_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Table: groups
-- Group chat settings, permissions, and policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `groups` (
  `group_id` int(11) NOT NULL AUTO_INCREMENT,
  `group_name` varchar(100) NOT NULL,
  `group_description` text DEFAULT NULL,
  `group_pic` varchar(255) DEFAULT 'default_group.png',
  `created_by` int(11) NOT NULL,
  `join_policy` enum('open','invite','approval') NOT NULL DEFAULT 'invite',
  `slow_mode_seconds` int(11) NOT NULL DEFAULT 0,
  `slow_mode_admin_exempt` tinyint(1) NOT NULL DEFAULT 1,
  `disappear_after_seconds` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`),
  KEY `idx_group_creator` (`created_by`),
  CONSTRAINT `fk_groups_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Table: group_members
-- Group membership and administrative roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_group_member` (`group_id`, `user_id`),
  KEY `idx_group_member_user` (`user_id`),
  CONSTRAINT `fk_group_members_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. Table: group_admin_permissions
-- Granular administrative privileges in groups
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_admin_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `can_send_messages` tinyint(1) NOT NULL DEFAULT 1,
  `can_send_media` tinyint(1) NOT NULL DEFAULT 1,
  `can_pin_messages` tinyint(1) NOT NULL DEFAULT 1,
  `can_add_users` tinyint(1) NOT NULL DEFAULT 1,
  `can_remove_users` tinyint(1) NOT NULL DEFAULT 1,
  `can_change_info` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_group_admin_perm` (`group_id`, `user_id`),
  KEY `idx_group_perm_user` (`user_id`),
  CONSTRAINT `fk_group_perm_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_perm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. Table: group_keys
-- Backward compatibility group keys
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `wrapped_key` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_group_user_key` (`group_id`, `user_id`),
  KEY `idx_group_key_user` (`user_id`),
  CONSTRAINT `fk_group_keys_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. Table: group_user_last_send
-- Rate limiting and slow-mode tracker for group chats
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_user_last_send` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `last_sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_group_user_send` (`group_id`, `user_id`),
  KEY `idx_group_last_sent` (`last_sent_at`),
  CONSTRAINT `fk_group_last_send_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_last_send_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. Table: channels
-- Public and private broadcast channels
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `channels` (
  `channel_id` int(11) NOT NULL AUTO_INCREMENT,
  `channel_name` varchar(100) NOT NULL,
  `channel_username` varchar(50) DEFAULT NULL,
  `channel_description` text DEFAULT NULL,
  `channel_pic` varchar(255) DEFAULT 'default_group.png',
  `visibility` enum('public','private') NOT NULL DEFAULT 'public',
  `sign_messages` tinyint(1) NOT NULL DEFAULT 0,
  `disappear_after_seconds` int(11) NOT NULL DEFAULT 0,
  `created_by` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`channel_id`),
  UNIQUE KEY `uniq_channel_username` (`channel_username`),
  KEY `idx_channel_creator` (`created_by`),
  CONSTRAINT `fk_channels_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. Table: channel_members
-- Channel subscriptions and administrative roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `channel_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` enum('owner','admin','subscriber') NOT NULL DEFAULT 'subscriber',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_channel_member` (`channel_id`, `user_id`),
  KEY `idx_channel_member_user` (`user_id`),
  CONSTRAINT `fk_channel_members_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`channel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_channel_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. Table: channel_admin_permissions
-- Granular administrative privileges in channels
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `channel_admin_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `can_post` tinyint(1) NOT NULL DEFAULT 1,
  `can_edit` tinyint(1) NOT NULL DEFAULT 1,
  `can_delete` tinyint(1) NOT NULL DEFAULT 1,
  `can_pin` tinyint(1) NOT NULL DEFAULT 1,
  `can_manage` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_channel_admin_perm` (`channel_id`, `user_id`),
  KEY `idx_chan_perm_user` (`user_id`),
  CONSTRAINT `fk_channel_perm_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`channel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_channel_perm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. Table: channel_keys
-- Backward compatibility channel keys
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `channel_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `wrapped_key` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_channel_user_key` (`channel_id`, `user_id`),
  KEY `idx_chan_key_user` (`user_id`),
  CONSTRAINT `fk_channel_keys_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`channel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_channel_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 18. Table: messages
-- Primary messages repository (Direct, Group, Channel) with server-side AES-256-GCM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `message_id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) DEFAULT NULL,
  `group_id` int(11) DEFAULT NULL,
  `channel_id` int(11) DEFAULT NULL,
  `message_type` enum('text','image','voice','audio','video','video_note','file','album') NOT NULL DEFAULT 'text',
  `message_text` text DEFAULT NULL,
  `file_url` varchar(255) DEFAULT NULL,
  `reply_to_id` int(11) DEFAULT NULL,
  `encrypted_content` text NOT NULL,
  `key_sender` text DEFAULT NULL,
  `key_recipient` text DEFAULT NULL,
  `content_hash` char(64) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `delivered_at` datetime DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `edited_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`message_id`),
  KEY `idx_messages_sender` (`sender_id`),
  KEY `idx_messages_receiver` (`receiver_id`),
  KEY `idx_messages_group` (`group_id`),
  KEY `idx_messages_channel` (`channel_id`),
  KEY `idx_messages_reply` (`reply_to_id`),
  KEY `idx_messages_created` (`created_at`),
  KEY `idx_messages_expires` (`expires_at`),
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`channel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `messages` (`message_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 19. Table: message_reactions
-- Emoji reactions per message and user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_reactions` (
  `reaction_id` int(11) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `reaction` varchar(8) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reaction_id`),
  UNIQUE KEY `uniq_message_user_reaction` (`message_id`, `user_id`, `reaction`),
  KEY `idx_reaction_msg` (`message_id`),
  KEY `idx_reaction_user` (`user_id`),
  CONSTRAINT `fk_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 20. Table: message_keys
-- Backward compatibility message key entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `wrapped_key` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_msg_user_key` (`message_id`, `user_id`),
  KEY `idx_msg_keys_msg` (`message_id`),
  KEY `idx_msg_keys_user` (`user_id`),
  CONSTRAINT `fk_msg_keys_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 21. Table: message_mentions
-- Tracks @username user mentions for unread notifications and badge flags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_mentions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_msg_mention` (`message_id`, `user_id`),
  KEY `idx_mention_user` (`user_id`),
  CONSTRAINT `fk_mentions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mentions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 22. Table: message_deletes
-- Delete-for-me tracking per user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_deletes` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `deleted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_msg_delete` (`message_id`, `user_id`),
  KEY `idx_delete_user` (`user_id`),
  CONSTRAINT `fk_deletes_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_deletes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 23. Table: message_reads
-- Per-user read timestamps for group / channel messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_reads` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_msg_read` (`message_id`, `user_id`),
  KEY `idx_read_user` (`user_id`),
  CONSTRAINT `fk_reads_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 24. Table: files
-- File metadata registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `files` (
  `file_id` int(11) NOT NULL AUTO_INCREMENT,
  `message_id` int(11) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_type` varchar(50) NOT NULL,
  `file_size` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`file_id`),
  KEY `idx_files_message` (`message_id`),
  CONSTRAINT `fk_files_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 25. Table: scheduled_messages
-- Messages queued for automatic future delivery
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `scheduled_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `conversation_id` int(11) NOT NULL,
  `conversation_type` varchar(16) NOT NULL,
  `encrypted_payload` mediumtext NOT NULL,
  `meta_json` mediumtext DEFAULT NULL,
  `send_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dispatched_at` datetime DEFAULT NULL,
  `canceled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sched_user` (`user_id`),
  KEY `idx_sched_pending` (`conversation_type`, `conversation_id`, `send_at`),
  CONSTRAINT `fk_scheduled_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 26. Table: pinned_messages
-- Pinned messages in direct, group, or channel chats
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pinned_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `message_id` int(11) NOT NULL,
  `pinned_by` int(11) NOT NULL,
  `pinned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_chat_pin` (`chat_type`, `chat_id`),
  KEY `idx_pin_msg` (`message_id`),
  KEY `idx_pin_user` (`pinned_by`),
  CONSTRAINT `fk_pinned_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`message_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pinned_by_user` FOREIGN KEY (`pinned_by`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 27. Table: pinned_chats
-- Pinned conversations at top of chat list
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pinned_chats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `pinned_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_pinned_chat` (`user_id`, `chat_type`, `chat_id`),
  KEY `idx_pinned_chat_user` (`user_id`),
  CONSTRAINT `fk_pinned_chats_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 28. Table: events
-- Real-time event log for incremental sync and instant delivery
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `events` (
  `event_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `conversation_id` int(11) NOT NULL DEFAULT 0,
  `type` varchar(32) NOT NULL,
  `payload_json` mediumtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_events_user_event` (`user_id`, `event_id`),
  KEY `idx_events_created` (`created_at`),
  CONSTRAINT `fk_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 29. Table: conversation_reads
-- High-performance read watermarks per chat
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_reads` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `last_seen_message_id` int(11) NOT NULL DEFAULT 0,
  `seen_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversation_read_unique` (`user_id`, `chat_type`, `chat_id`),
  KEY `conversation_read_chat` (`chat_type`, `chat_id`, `last_seen_message_id`),
  KEY `conversation_read_user` (`user_id`),
  CONSTRAINT `fk_conv_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 30. Table: direct_chat_settings
-- Disappearing messages and timers in 1-on-1 chats
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `direct_chat_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_one` int(11) NOT NULL,
  `user_two` int(11) NOT NULL,
  `disappear_after_seconds` int(11) NOT NULL DEFAULT 0,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_direct_pair` (`user_one`, `user_two`),
  KEY `idx_direct_user_two` (`user_two`),
  KEY `idx_direct_updated_by` (`updated_by`),
  CONSTRAINT `fk_direct_settings_user_one` FOREIGN KEY (`user_one`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_direct_settings_user_two` FOREIGN KEY (`user_two`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_direct_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 31. Table: chat_clears
-- History clear tracking (Clear History) per user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chat_clears` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `cleared_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_chat_clear` (`user_id`, `chat_type`, `chat_id`),
  KEY `idx_chat_clear_lookup` (`user_id`, `chat_type`, `chat_id`),
  CONSTRAINT `fk_chat_clears_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 32. Table: chat_activity
-- Ephemeral typing & voice recording indicators
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chat_activity` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `activity_type` varchar(32) NOT NULL,
  `activity_value` varchar(64) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_activity` (`chat_type`, `chat_id`, `user_id`, `activity_type`),
  KEY `idx_chat_expires` (`chat_type`, `chat_id`, `expires_at`),
  CONSTRAINT `fk_chat_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 33. Table: chat_spam_locks
-- Anti-spam and rapid message flood protection locks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chat_spam_locks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `chat_type` varchar(16) NOT NULL,
  `chat_id` int(11) NOT NULL,
  `reason` varchar(32) NOT NULL DEFAULT 'spam_protection',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_chat_spam` (`user_id`, `chat_type`, `chat_id`),
  KEY `idx_spam_expires_at` (`expires_at`),
  CONSTRAINT `fk_chat_spam_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 34. Table: push_subscriptions
-- Web Push notification device subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
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
  KEY `idx_push_user` (`user_id`),
  CONSTRAINT `fk_push_subs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
-- ============================================================================
-- End of Database Schema
-- ============================================================================
