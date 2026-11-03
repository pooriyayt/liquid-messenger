<?php
if (!file_exists(__DIR__ . '/includes/config.php') || (!file_exists(__DIR__ . '/installed.lock') && !file_exists(__DIR__ . '/storage/installed.lock'))) {
    if (file_exists(__DIR__ . '/install.php')) {
        header('Location: install.php');
        exit;
    }
}
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';

// Check if user is logged in
if (!Auth::isLoggedIn()) {
    redirect('login');
}

// Get current user data
$currentUser = Auth::getCurrentUser();
if (!$currentUser) {
    redirect('login');
}

$currentUserDisplayName = trim((string) ($currentUser['full_name'] ?? ''));
if ($currentUserDisplayName === '') {
    $currentUserDisplayName = trim((string) ($currentUser['username'] ?? 'User'));
}

$currentUserProfilePic = trim((string) ($currentUser['profile_pic'] ?? ''));
$normalizedCurrentPic = strtolower($currentUserProfilePic);

$avatarNameParts = preg_split('/\s+/', $currentUserDisplayName);
$avatarNameParts = array_values(array_filter($avatarNameParts, static function ($part) {
    return $part !== '';
}));
$sliceInitial = static function ($value) {
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, 1, 'UTF-8');
    }
    return substr($value, 0, 1);
};
$upperInitials = static function ($value) {
    if (function_exists('mb_strtoupper')) {
        return mb_strtoupper($value, 'UTF-8');
    }
    return strtoupper($value);
};
$initialLength = static function ($value) {
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    return strlen($value);
};
$avatarInitials = '?';
if (!empty($avatarNameParts)) {
    $first = $sliceInitial($avatarNameParts[0]);
    if (count($avatarNameParts) > 1) {
        $second = $sliceInitial($avatarNameParts[1]);
        $avatarInitials = $upperInitials($first . $second);
    } else {
        $avatarInitials = $upperInitials($first);
    }
}
$avatarInitialsEscaped = htmlspecialchars($avatarInitials, ENT_QUOTES, 'UTF-8');
$avatarSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#5B8DEF"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="' . ($initialLength($avatarInitials) > 1 ? '34' : '42') . '" font-weight="600" fill="#ffffff">' . $avatarInitialsEscaped . '</text></svg>';
$currentUserAvatarFallback = 'data:image/svg+xml;utf8,' . rawurlencode($avatarSvg);

if ($currentUserProfilePic === '' || $normalizedCurrentPic === 'default.png' || $normalizedCurrentPic === 'default_group.png' || $normalizedCurrentPic === 'default_channel.png') {
    $currentUserAvatarSrc = $currentUserAvatarFallback;
} else {
    $currentUserAvatarSrc = 'uploads/images/' . $currentUserProfilePic . '?v=' . time();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Liquid Chat - Conversations</title>
    <meta name="user-id" content="<?php echo $currentUser['user_id']; ?>">
    <meta name="user-name" content="<?php echo htmlspecialchars($currentUser['full_name'] ?? '', ENT_QUOTES); ?>">
    <meta name="user-username" content="<?php echo htmlspecialchars($currentUser['username'] ?? '', ENT_QUOTES); ?>">
    <meta name="user-bio" content="<?php echo htmlspecialchars($currentUser['bio'] ?? '', ENT_QUOTES); ?>">
    <?php
    $vStyle = file_exists(__DIR__ . '/css/style.css') ? filemtime(__DIR__ . '/css/style.css') : time();
    $vTgCss = file_exists(__DIR__ . '/css/telegram-z.css') ? filemtime(__DIR__ . '/css/telegram-z.css') : time();
    $vThemeJs = file_exists(__DIR__ . '/js/theme.js') ? filemtime(__DIR__ . '/js/theme.js') : time();
    $vTgJs = file_exists(__DIR__ . '/js/telegram-z.js') ? filemtime(__DIR__ . '/js/telegram-z.js') : time();
    $vApiJs = file_exists(__DIR__ . '/js/api-client.js') ? filemtime(__DIR__ . '/js/api-client.js') : time();
    $vChatJs = file_exists(__DIR__ . '/js/chat.js') ? filemtime(__DIR__ . '/js/chat.js') : time();
    ?>
    <script src="js/theme.js?v=<?php echo $vThemeJs; ?>"></script>
    <script src="js/telegram-z.js?v=<?php echo $vTgJs; ?>" defer></script>
    <script src="js/api-client.js?v=<?php echo $vApiJs; ?>"></script>
    <link rel="stylesheet" href="css/style.css?v=<?php echo $vStyle; ?>">
    <link rel="stylesheet" href="css/telegram-z.css?v=<?php echo $vTgCss; ?>">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="chat-page" data-app-shell="1">
    <?php include 'includes/icons.php'; ?>
    <div class="chat-container">
        <!-- Chat Header -->
        <div class="chat-header">
            <div class="d-flex align-center">
                <button class="btn btn-icon menu-toggle" id="sidebar-toggle">
                    <svg class="icon" aria-hidden="true"><use href="#icon-menu"></use></svg>
                </button>
                <div class="app-logo">
                    <img src="assets/logo.svg" alt="Liquid Chat">
                    <span>Liquid Chat</span>
                </div>
            </div>
            <div class="user-menu">
                <div class="user-menu-toggle" id="user-menu-toggle">
                    <img id="current-user-avatar" src="<?php echo htmlspecialchars($currentUserAvatarSrc, ENT_QUOTES); ?>" data-fallback="<?php echo htmlspecialchars($currentUserAvatarFallback, ENT_QUOTES); ?>" data-profile-pic="<?php echo htmlspecialchars($currentUserProfilePic, ENT_QUOTES); ?>" data-profile-name="<?php echo htmlspecialchars($currentUserDisplayName, ENT_QUOTES); ?>" alt="<?php echo htmlspecialchars($currentUser['username'] ?? 'user', ENT_QUOTES); ?>" draggable="false">
                    <span><?php echo htmlspecialchars($currentUserDisplayName, ENT_QUOTES); ?></span>
                    <svg class="icon" aria-hidden="true"><use href="#icon-chevron-down"></use></svg>
                </div>
                <div class="user-menu-dropdown">
                    <a href="profile" class="dropdown-item">
                        <svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Profile
                    </a>
                    <a href="settings" class="dropdown-item">
                        <svg class="icon" aria-hidden="true"><use href="#icon-settings"></use></svg> Settings
                    </a>
                    <button class="dropdown-item pwa-install-trigger" id="lock-app-install-btn" type="button">
                        <svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg> Install App
                    </button>
                    <button class="dropdown-item" id="lock-app-btn" type="button">
                        <svg class="icon" aria-hidden="true"><use href="#icon-lock"></use></svg> Lock App
                    </button>
                    <a href="logout" class="dropdown-item">
                        <svg class="icon" aria-hidden="true"><use href="#icon-logout"></use></svg> Logout
                    </a>
                </div>
            </div>
        </div>

        <!-- Chat Sidebar -->
        <div class="chat-sidebar">
            <div class="search-bar">
                <svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>
                <input type="search" id="search-contacts" name="chat-search" placeholder="Search..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search" aria-label="Search chats" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true" readonly>
            </div>

            <div class="folder-bar" id="folder-bar" style="display: none;">
                <div class="folder-bar-row">
                    <div class="folder-list" id="folder-list"></div>
                    <button class="btn btn-icon folder-manage-btn" id="folder-manage-btn" type="button" title="Manage folders">
                        <svg class="icon" aria-hidden="true"><use href="#icon-settings"></use></svg>
                    </button>
                </div>
                <div class="folder-filters">
                    <label class="folder-filter">
                        <input type="checkbox" id="folder-filter-unread">
                        <span>Unread</span>
                    </label>
                </div>
            </div>
            
            <div class="d-flex justify-between py-10 px-20 tabs-row">
                <div class="tab active" data-tab="conversations">Chats</div>
                <div class="new-chat">
                    <button class="btn btn-icon" id="new-chat-btn">
                        <svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
                    </button>
                    <div class="chat-dropdown" id="chat-dropdown">
                        <div class="dropdown-item" id="start-direct-chat">
                            <svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Direct Message
                        </div>
                        <div class="dropdown-item" id="start-group-chat">
                            <svg class="icon" aria-hidden="true"><use href="#icon-users"></use></svg> New Group
                        </div>
                        <div class="dropdown-item" id="join-group-chat">
                            <svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg> Join Group
                        </div>
                        <div class="dropdown-item" id="start-channel-chat">
                            <svg class="icon" aria-hidden="true"><use href="#icon-channel"></use></svg> New Channel
                        </div>
                        <div class="dropdown-item" id="join-channel-chat">
                            <svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg> Join Channel
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="tab-content active" id="conversations-tab">
                <div id="conversations-list">
                    <!-- Conversations will be loaded here -->
                    <div class="spinner"></div>
                </div>
            </div>
            
            
        </div>

        <!-- Chat Main Area -->
        <div class="chat-main">
            <div class="chat-messages" id="message-container">
                <!-- Welcome message when no chat is selected -->
                <div class="text-center" id="welcome-message">
                    <div style="margin-top: 100px;">
                        <svg class="icon icon-xl" aria-hidden="true" style="color: var(--primary-color); margin-bottom: 20px;"><use href="#icon-comments"></use></svg>
                        <h2>Welcome to Liquid Chat</h2>
                        <p class="mt-10">Select a conversation to start chatting</p>
                    </div>
                </div>
            </div>
            
            <div class="chat-input" id="chat-input-container" style="display: none;">
                <div class="voice-recorder" id="voice-recorder" style="display: none;">
                    <div class="voice-recorder-info">
                        <span class="voice-recorder-dot"></span>
                        <span class="voice-recorder-time" id="voice-recorder-time">0:00</span>
                    </div>
                    <div class="voice-recorder-wave" id="voice-recorder-wave" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span><span></span>
                        <span></span><span></span><span></span><span></span><span></span><span></span>
                    </div>
                    <div class="voice-recorder-actions">
                        <button class="btn btn-icon" id="voice-recorder-pause" type="button" title="Pause recording">
                            <svg class="icon" aria-hidden="true"><use href="#icon-pause"></use></svg>
                        </button>
                        <button class="btn btn-icon" id="voice-recorder-stop" type="button" title="Send recording">
                            <svg class="icon" aria-hidden="true"><use href="#icon-send"></use></svg>
                        </button>
                        <button class="btn btn-icon" id="voice-recorder-cancel" type="button" title="Discard recording">
                            <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                        </button>
                    </div>
                </div>
                <div class="video-note-recorder" id="video-note-recorder" style="display: none;" data-state="idle">
                    <div class="video-note-circle">
                        <div class="video-note-ring" id="video-note-ring"></div>
                        <video id="video-note-video" class="video-note-media" muted playsinline></video>
                        <button class="btn btn-icon video-note-play" id="video-note-play" type="button" title="Play preview">
                            <svg class="icon" aria-hidden="true"><use href="#icon-play"></use></svg>
                        </button>
                    </div>
                    <div class="video-note-controls">
                        <div class="video-note-timer" id="video-note-timer">0:00</div>
                        <div class="video-note-actions video-note-actions-record" id="video-note-actions-record">
                            <button class="btn btn-icon" id="video-note-pause" type="button" title="Pause recording">
                                <svg class="icon" aria-hidden="true"><use href="#icon-pause"></use></svg>
                            </button>
                            <button class="btn btn-icon" id="video-note-stop" type="button" title="Stop recording">
                                <svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg>
                            </button>
                            <button class="btn btn-icon" id="video-note-cancel" type="button" title="Discard recording">
                                <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                            </button>
                        </div>
                        <div class="video-note-actions video-note-actions-preview" id="video-note-actions-preview">
                            <button class="btn btn-primary" id="video-note-send" type="button">Send</button>
                            <button class="btn btn-secondary" id="video-note-rerecord" type="button">Re-record</button>
                        </div>
                    </div>
                </div>
                <form id="composer-autofill-trap" autocomplete="off" novalidate aria-hidden="true" tabindex="-1" style="position:absolute; left:-10000px; top:auto; width:1px; height:1px; overflow:hidden;">
                    <input type="text" name="trap_username" autocomplete="username" tabindex="-1" aria-hidden="true">
                    <input type="password" name="trap_password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
                </form>
                <div class="chat-input-box">
                    <button class="btn btn-icon" id="emoji-btn">
                        <svg class="icon" aria-hidden="true"><use href="#icon-smile"></use></svg>
                    </button>
                    <textarea id="message-input" name="chat_message" form="composer-autofill-trap" placeholder="Type a message..." autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="send" rows="1" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true"></textarea>
                    <div class="chat-input-actions">
                        <button class="btn btn-icon" id="attach-btn">
                            <svg class="icon" aria-hidden="true"><use href="#icon-paperclip"></use></svg>
                        </button>
                        <input type="file" id="file-input" style="display: none;" multiple>
                        <div class="recording-toggle" id="recording-toggle">
                            <button class="btn btn-icon recording-toggle-btn" id="video-note-btn" title="Video message">
                                <svg class="icon" aria-hidden="true"><use href="#icon-camera"></use></svg>
                            </button>
                            <button class="btn btn-icon recording-toggle-btn active" id="voice-btn" title="Voice message">
                                <svg class="icon" aria-hidden="true"><use href="#icon-mic"></use></svg>
                            </button>
                        </div>
                        <button class="btn btn-icon" id="schedule-btn" type="button" title="Send later">
                            <svg class="icon" aria-hidden="true"><use href="#icon-clock"></use></svg>
                        </button>
                        <button class="btn btn-icon" id="send-btn">
                            <svg class="icon" aria-hidden="true"><use href="#icon-send"></use></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- New Chat Modal -->
    <div class="modal" id="new-chat-modal" style="display: none;">
        <div class="modal-content glass-card">
            <div class="modal-header">
                <h3>New Conversation</h3>
                <button class="btn btn-icon close-modal">
                    <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="tabs">
                    <div class="tab active" data-tab="new-direct">Direct Message</div>
                    <div class="tab" data-tab="new-group">New Group</div>
                    <div class="tab" data-tab="join-group">Join Group</div>
                    <div class="tab" data-tab="new-channel">New Channel</div>
                    <div class="tab" data-tab="join-channel">Join Channel</div>
                </div>
                <div class="tab-content active" id="new-direct-tab">
                    <div class="direct-message-panel">
                        <div class="direct-message-header">
                            <div class="direct-message-icon">
                                <svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg>
                            </div>
                            <div class="direct-message-title">
                                <h4>Start a direct message</h4>
                                <p>Find someone by username or email.</p>
                            </div>
                        </div>
                        <div class="direct-message-search">
                            <label for="user-search" class="form-label">Search people</label>
                            <div class="direct-message-field">
                                <svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>
                                <input type="text" id="user-search" name="user-search" class="form-control direct-message-input" placeholder="Type a username or email..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                            </div>
                            <div class="direct-message-hint">Type at least 2 characters to search.</div>
                        </div>
                        <div id="user-search-results" class="direct-message-results">
                            <!-- User search results will be displayed here -->
                        </div>
                    </div>
                </div>
                <div class="tab-content" id="new-group-tab">
                    <div class="form-group">
                        <label for="group-name" class="form-label">Group Name:</label>
                        <input type="text" id="group-name" class="form-control" placeholder="Enter group name..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div class="form-group">
                        <label for="group-username" class="form-label">Group ID (optional):</label>
                        <input type="text" id="group-username" class="form-control" placeholder="e.g. my_group_id" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                        <small>Use letters, numbers, and underscores (4-32 chars).</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Join Policy:</label>
                        <div class="d-flex align-center gap-10">
                            <label class="pill-option">
                                <input type="radio" name="group-join-policy" value="invite" checked>
                                <span>Invite Only</span>
                            </label>
                            <label class="pill-option">
                                <input type="radio" name="group-join-policy" value="public">
                                <span>Public by ID</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="group-members" class="form-label">Add Members:</label>
                        <input type="text" id="group-members-search" name="group-members-search" class="form-control" placeholder="Search contacts..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div id="selected-members">
                        <!-- Selected members will be displayed here -->
                    </div>
                    <div id="group-members-results" class="mt-10">
                        <!-- Group member search results -->
                    </div>
                </div>
                <div class="tab-content" id="join-group-tab">
                    <div class="form-group">
                        <label for="join-group-id" class="form-label">Group ID:</label>
                        <input type="text" id="join-group-id" class="form-control" placeholder="Enter group ID..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-primary w-100" id="join-group-btn">Join Group</button>
                    </div>
                </div>
                <div class="tab-content" id="new-channel-tab">
                    <div class="form-group">
                        <label for="channel-name" class="form-label">Channel Name:</label>
                        <input type="text" id="channel-name" class="form-control" placeholder="Enter channel name..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div class="form-group">
                        <label for="channel-description" class="form-label">Channel Description:</label>
                        <textarea id="channel-description" class="form-control" rows="3" placeholder="Describe your channel..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="channel-username" class="form-label">Channel ID (optional):</label>
                        <input type="text" id="channel-username" class="form-control" placeholder="e.g. my_channel" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                        <small>Use letters, numbers, and underscores (4-32 chars).</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Visibility:</label>
                        <div class="d-flex align-center gap-10">
                            <label class="pill-option">
                                <input type="radio" name="channel-visibility" value="public" checked>
                                <span>Public</span>
                            </label>
                            <label class="pill-option">
                                <input type="radio" name="channel-visibility" value="private">
                                <span>Private</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="channel-members-search" class="form-label">Add Subscribers:</label>
                        <input type="text" id="channel-members-search" name="channel-members-search" class="form-control" placeholder="Search users..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div id="selected-channel-members">
                        <!-- Selected channel members -->
                    </div>
                    <div id="channel-members-results" class="mt-10">
                        <!-- Channel member search results -->
                    </div>
                </div>
                <div class="tab-content" id="join-channel-tab">
                    <div class="form-group">
                        <label for="join-channel-id" class="form-label">Channel ID:</label>
                        <input type="text" id="join-channel-id" class="form-control" placeholder="Enter channel ID..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-lpignore="true" data-form-type="other" data-1p-ignore="true" data-bwignore="true">
                    </div>
                    <div class="form-group">
                        <button class="btn btn-primary w-100" id="join-channel-btn">Join Channel</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancel-new-chat">Cancel</button>
                <button class="btn btn-primary" id="create-new-chat">Create</button>
            </div>
        </div>
    </div>

    <script src="js/encryption.js"></script>
    <script src="js/media_cache.js"></script>
    <script nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        window.APP_DEBUG = <?php echo APP_DEBUG ? 'true' : 'false'; ?>;
        window.LC_MAX_UPLOAD_BYTES = <?php echo (int) (defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024)); ?>;
    </script>
    <script src="js/twemoji.min.js"></script>
    <script src="js/emoji-data.js"></script>
    <script src="js/share-modal.js"></script>
    <script src="js/chat.js?v=<?php echo $vChatJs; ?>"></script>
    <script src="js/app_lock.js"></script>
    <script nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        // Toggle user menu dropdown
        document.getElementById('user-menu-toggle').addEventListener('click', () => {
            document.querySelector('.user-menu-dropdown').classList.toggle('active');
        });

        // Toggle sidebar on mobile
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.querySelector('.chat-sidebar').classList.toggle('active');
        });

        // File input trigger
        document.getElementById('attach-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        
        // New chat dropdown toggle
        document.getElementById('new-chat-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('chat-dropdown').classList.toggle('active');
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#new-chat-btn') && !e.target.closest('#chat-dropdown')) {
                document.getElementById('chat-dropdown').classList.remove('active');
            }
        });
        
        // Direct message option click
        document.getElementById('start-direct-chat').addEventListener('click', () => {
            document.getElementById('chat-dropdown').classList.remove('active');
            document.getElementById('new-chat-modal').style.display = 'flex';
            // Activate direct message tab
            document.querySelector('#new-chat-modal .tab[data-tab="new-direct"]').click();
        });
        
        // Group chat option click
        document.getElementById('start-group-chat').addEventListener('click', () => {
            document.getElementById('chat-dropdown').classList.remove('active');
            document.getElementById('new-chat-modal').style.display = 'flex';
            // Activate group chat tab
            document.querySelector('#new-chat-modal .tab[data-tab="new-group"]').click();
        });
        
        // Join group option click
        document.getElementById('join-group-chat').addEventListener('click', () => {
            document.getElementById('chat-dropdown').classList.remove('active');
            document.getElementById('new-chat-modal').style.display = 'flex';
            // Activate join group tab
            document.querySelector('#new-chat-modal .tab[data-tab="join-group"]').click();
        });
        
        // New channel option click
        document.getElementById('start-channel-chat').addEventListener('click', () => {
            document.getElementById('chat-dropdown').classList.remove('active');
            document.getElementById('new-chat-modal').style.display = 'flex';
            // Activate new channel tab
            document.querySelector('#new-chat-modal .tab[data-tab="new-channel"]').click();
        });
        
        // Join channel option click
        document.getElementById('join-channel-chat').addEventListener('click', () => {
            document.getElementById('chat-dropdown').classList.remove('active');
            document.getElementById('new-chat-modal').style.display = 'flex';
            // Activate join channel tab
            document.querySelector('#new-chat-modal .tab[data-tab="join-channel"]').click();
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                // Get the parent element
                const tabs = this.closest('.tabs');
                if (!tabs) {
                    return;
                }
                const parent = tabs.parentElement;
                
                // Remove active class from all tabs in this group
                parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                this.classList.add('active');
                
                // Get the tab content to show
                const tabId = this.getAttribute('data-tab');
                
                // Hide all tab contents in this group
                parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Show the selected tab content
                parent.querySelector(`#${tabId}-tab`).classList.add('active');
            });
        });

        const buildFallbackAvatarDataUri = (name) => {
            const clean = String(name || '').trim();
            const parts = clean.split(/\s+/).filter(Boolean);
            const initials = parts.length > 1
                ? `${(parts[0][0] || '')}${(parts[1][0] || '')}`.toUpperCase()
                : (parts.length ? (parts[0][0] || '').toUpperCase() : '?');
            const safeInitials = (initials || '?').replace(/[&<>"']/g, (char) => (
                {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    '\'': '&#39;'
                }[char] || char
            ));
            const rootStyles = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
            const accent = (rootStyles ? rootStyles.getPropertyValue('--primary-color') : '').trim() || '#5B8DEF';
            const fontSize = initials.length > 1 ? 34 : 42;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${accent}"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff">${safeInitials}</text></svg>`;
            return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        };

        const resolveUserAvatar = (user) => {
            const displayName = user.full_name || user.username || 'User';
            const rawPic = typeof user.profile_pic === 'string' ? user.profile_pic.trim() : '';
            const normalizedPic = rawPic.toLowerCase();
            const hasProfilePic = !!rawPic && normalizedPic !== 'default.png' && normalizedPic !== 'default_group.png' && normalizedPic !== 'default_channel.png';
            const app = window.chatApp;
            if (app && typeof app.getAvatarUrl === 'function') {
                return app.getAvatarUrl(hasProfilePic ? rawPic : '', displayName, {
                    type: 'user',
                    cacheKey: user.user_id || user.username || user.full_name
                });
            }
            return hasProfilePic
                ? `uploads/images/${rawPic}?v=${Date.now()}`
                : buildFallbackAvatarDataUri(displayName);
        };

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Close modal buttons
        document.querySelectorAll('.close-modal, #cancel-new-chat').forEach(button => {
            button.addEventListener('click', () => {
                document.getElementById('new-chat-modal').style.display = 'none';
            });
        });
        
        const composerTrap = document.getElementById('composer-autofill-trap');
        if (composerTrap) {
            composerTrap.addEventListener('submit', (event) => event.preventDefault());
        }

        const searchResultsContainer = document.getElementById('user-search-results');
        const searchUserCache = new Map();
        if (searchResultsContainer) {
            searchResultsContainer.addEventListener('click', (event) => {
                const item = event.target.closest('.contact-item[data-user-id]');
                if (!item) {
                    return;
                }
                const userId = parseInt(item.dataset.userId, 10);
                const user = searchUserCache.get(userId);
                if (!user) {
                    return;
                }
                const safeFullName = user.full_name || user.username || '';
                selectUserForChat(user.user_id, user.username || '', safeFullName);
            });
        }

        // User search functionality
        document.getElementById('user-search').addEventListener('input', function() {
            const searchTerm = this.value.trim();
            const resultsContainer = searchResultsContainer;
            
            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                searchUserCache.clear();
                return;
            }
            
            // Search users via AJAX
            window.ApiClient.fetch('search_users', undefined, { term: searchTerm })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.users.length > 0) {
                        let html = '<div class="contact-list">';
                        searchUserCache.clear();
                        
                        data.users.forEach(user => {
                            // Add cache busting parameter
                            const profilePic = resolveUserAvatar(user);
                            searchUserCache.set(user.user_id, user);
                                
                            html += `
                                <div class="contact-item" data-id="${user.user_id}" data-type="direct" data-user-id="${user.user_id}">
                                    <div class="contact-avatar">
                                        <img src="${profilePic}" alt="${user.username}" loading="lazy" draggable="false">
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${user.full_name}
                                            <span class="status-indicator status-${user.status}"></span>
                                        </div>
                                        <div class="contact-status">@${user.username}</div>
                                    </div>
                                </div>
                            `;
                        });
                        
                        html += '</div>';
                        resultsContainer.innerHTML = html;
                    } else {
                        resultsContainer.innerHTML = '<p class="text-center">No users found</p>';
                        searchUserCache.clear();
                    }
                })
                .catch(error => {
                    console.error('Error searching users:', error);
                    resultsContainer.innerHTML = '<p class="text-center">Error searching users</p>';
                    searchUserCache.clear();
                });
        });
        
        // Selected user for chat
        let selectedUserId = null;
        let selectedUserName = '';
        let selectedUserFullName = '';
        const selectedGroupMembers = new Map();
        const selectedChannelMembers = new Map();
        
        function selectUserForChat(userId, username, fullName) {
            selectedUserId = userId;
            selectedUserName = username;
            selectedUserFullName = fullName || username;
            
            document.getElementById('user-search-results').innerHTML = 
                `<p class="text-center">Selected user: <strong>${selectedUserFullName}</strong></p>`;
        }

        function renderSelectedMembers() {
            const container = document.getElementById('selected-members');
            if (!container) {
                return;
            }
            if (!selectedGroupMembers.size) {
                container.innerHTML = '<p class="text-center">No members selected</p>';
                return;
            }
            container.innerHTML = '';
            selectedGroupMembers.forEach(member => {
                const chip = document.createElement('div');
                chip.className = 'member-chip';
                chip.innerHTML = `
                    <span>${member.full_name || member.username}</span>
                    <button class="btn btn-icon member-remove" data-user-id="${member.user_id}">
                        <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                    </button>
                `;
                container.appendChild(chip);
            });
        }

        function addGroupMember(member) {
            if (!member || !member.user_id) {
                return;
            }
            if (!selectedGroupMembers.has(member.user_id)) {
                selectedGroupMembers.set(member.user_id, member);
            }
            renderSelectedMembers();
        }

        function renderSelectedChannelMembers() {
            const container = document.getElementById('selected-channel-members');
            if (!container) {
                return;
            }
            if (!selectedChannelMembers.size) {
                container.innerHTML = '<p class="text-center">No subscribers selected</p>';
                return;
            }
            container.innerHTML = '';
            selectedChannelMembers.forEach(member => {
                const chip = document.createElement('div');
                chip.className = 'member-chip';
                chip.innerHTML = `
                    <span>${member.full_name || member.username}</span>
                    <button class="btn btn-icon member-remove" data-user-id="${member.user_id}">
                        <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                    </button>
                `;
                container.appendChild(chip);
            });
        }

        function addChannelMember(member) {
            if (!member || !member.user_id) {
                return;
            }
            if (!selectedChannelMembers.has(member.user_id)) {
                selectedChannelMembers.set(member.user_id, member);
            }
            renderSelectedChannelMembers();
        }

        document.getElementById('selected-members').addEventListener('click', (event) => {
            const button = event.target.closest('.member-remove');
            if (!button) {
                return;
            }
            const userId = parseInt(button.dataset.userId, 10);
            selectedGroupMembers.delete(userId);
            renderSelectedMembers();
        });

        document.getElementById('selected-channel-members').addEventListener('click', (event) => {
            const button = event.target.closest('.member-remove');
            if (!button) {
                return;
            }
            const userId = parseInt(button.dataset.userId, 10);
            selectedChannelMembers.delete(userId);
            renderSelectedChannelMembers();
        });

        document.getElementById('group-members-search').addEventListener('input', function() {
            const searchTerm = this.value.trim();
            const resultsContainer = document.getElementById('group-members-results');

            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                return;
            }

            window.ApiClient.fetch('search_users', undefined, { term: searchTerm })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.users.length > 0) {
                        let html = '<div class="contact-list">';
                        data.users.forEach(user => {
                            const profilePic = resolveUserAvatar(user);
                            const safeUsername = (user.username || '').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
                            const safeFullName = (user.full_name || '').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');

                            html += `
                                <div class="contact-item">
                                    <div class="contact-avatar">
                                        <img src="${profilePic}" alt="${user.username}" loading="lazy" draggable="false">
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${user.full_name}
                                            <span class="status-indicator status-${user.status}"></span>
                                        </div>
                                        <div class="contact-status">@${user.username}</div>
                                    </div>
                                    <button class="btn btn-secondary member-add-btn" data-user-id="${user.user_id}" data-username="${safeUsername}" data-full-name="${safeFullName}">
                                        Add
                                    </button>
                                </div>
                            `;
                        });
                        html += '</div>';
                        resultsContainer.innerHTML = html;
                    } else {
                        resultsContainer.innerHTML = '<p class="text-center">No users found</p>';
                    }
                })
                .catch(error => {
                    console.error('Error searching users:', error);
                    resultsContainer.innerHTML = '<p class="text-center">Error searching users</p>';
                });
        });

        document.getElementById('group-members-results').addEventListener('click', (event) => {
            const button = event.target.closest('.member-add-btn');
            if (!button) {
                return;
            }
            const userId = parseInt(button.dataset.userId, 10);
            const username = button.dataset.username;
            const fullName = button.dataset.fullName;
            addGroupMember({ user_id: userId, username: username, full_name: fullName });
        });

        document.getElementById('channel-members-search').addEventListener('input', function() {
            const searchTerm = this.value.trim();
            const resultsContainer = document.getElementById('channel-members-results');

            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                return;
            }

            window.ApiClient.fetch('search_users', undefined, { term: searchTerm })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.users.length > 0) {
                        let html = '<div class="contact-list">';
                        data.users.forEach(user => {
                            const profilePic = resolveUserAvatar(user);
                            const safeUsername = (user.username || '').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
                            const safeFullName = (user.full_name || '').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');

                            html += `
                                <div class="contact-item">
                                    <div class="contact-avatar">
                                        <img src="${profilePic}" alt="${user.username}" loading="lazy" draggable="false">
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${user.full_name}
                                            <span class="status-indicator status-${user.status}"></span>
                                        </div>
                                        <div class="contact-status">@${user.username}</div>
                                    </div>
                                    <button class="btn btn-secondary member-add-btn" data-user-id="${user.user_id}" data-username="${safeUsername}" data-full-name="${safeFullName}">
                                        Add
                                    </button>
                                </div>
                            `;
                        });
                        html += '</div>';
                        resultsContainer.innerHTML = html;
                    } else {
                        resultsContainer.innerHTML = '<p class="text-center">No users found</p>';
                    }
                })
                .catch(error => {
                    console.error('Error searching users:', error);
                    resultsContainer.innerHTML = '<p class="text-center">Error searching users</p>';
                });
        });

        document.getElementById('channel-members-results').addEventListener('click', (event) => {
            const button = event.target.closest('.member-add-btn');
            if (!button) {
                return;
            }
            const userId = parseInt(button.dataset.userId, 10);
            const username = button.dataset.username;
            const fullName = button.dataset.fullName;
            addChannelMember({ user_id: userId, username: username, full_name: fullName });
        });
        
        // Helper for in-app toasts
        function notifyUser(msg, type = 'info') {
            if (window.chatApp && typeof window.chatApp.showToast === 'function') {
                window.chatApp.showToast(msg, type);
            } else if (window.showInAppToast) {
                window.showInAppToast(msg, type);
            }
        }

        // Create new chat button
        document.getElementById('create-new-chat').addEventListener('click', function() {
            const activeTab = document.querySelector('.modal-body .tab.active').getAttribute('data-tab');
            
            if (activeTab === 'new-direct') {
                // Direct message
                if (!selectedUserId) {
                    notifyUser('Please select a user first', 'warning');
                    return;
                }
                
                // Add to contacts first
                const formData = new FormData();
                formData.append('contact_id', selectedUserId);
                
                window.ApiClient.fetch('add_contact', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .catch(error => {
                    console.error('Error adding contact:', error);
                })
                .finally(() => {
                    // Start a chat with the selected user
                    const chatApp = window.chatApp;
                    if (chatApp) {
                        // Close the modal
                        document.getElementById('new-chat-modal').style.display = 'none';
                        
                        // Open the chat
                        chatApp.openChat(selectedUserId, 'direct', {
                            type: 'direct',
                            user_id: selectedUserId,
                            username: selectedUserName,
                            full_name: selectedUserFullName || selectedUserName,
                            profile_pic: 'default.png',
                            status: 'offline'
                        });
                        
                        // Reset selection
                        selectedUserId = null;
                        selectedUserName = '';
                        selectedUserFullName = '';
                        
                        // Clear search input
                        document.getElementById('user-search').value = '';
                        document.getElementById('user-search-results').innerHTML = '';
                    }
                });
            } else if (activeTab === 'new-group') {
                const groupName = document.getElementById('group-name').value.trim();
                const groupUsername = document.getElementById('group-username').value.trim();
                const joinPolicy = document.querySelector('input[name="group-join-policy"]:checked')?.value || 'invite';
                const memberIds = Array.from(selectedGroupMembers.keys());

                if (!groupName) {
                    notifyUser('Please enter a group name', 'warning');
                    return;
                }

                window.ApiClient.fetch('create_group', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        groupName: groupName,
                        groupDescription: '',
                        groupUsername: groupUsername,
                        joinPolicy: joinPolicy,
                        memberIds: memberIds
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (!data.success) {
                        notifyUser(data.message || 'Failed to create group', 'error');
                        return;
                    }
                    const chatApp = window.chatApp;
                    if (chatApp) {
                        document.getElementById('new-chat-modal').style.display = 'none';
                        chatApp.loadConversations();
                        chatApp.openChat(data.group_id, 'group', {
                            type: 'group',
                            group_id: data.group_id,
                            group_name: groupName,
                            group_username: groupUsername || '',
                            join_policy: joinPolicy
                        });
                    }
                    document.getElementById('group-name').value = '';
                    document.getElementById('group-username').value = '';
                    selectedGroupMembers.clear();
                    renderSelectedMembers();
                    document.getElementById('group-members-search').value = '';
                    document.getElementById('group-members-results').innerHTML = '';
                })
                .catch(error => {
                    console.error('Error creating group:', error);
                    notifyUser('Error creating group', 'error');
                });
            } else if (activeTab === 'new-channel') {
                const channelName = document.getElementById('channel-name').value.trim();
                const channelDescription = document.getElementById('channel-description').value.trim();
                const channelUsername = document.getElementById('channel-username').value.trim();
                const visibility = document.querySelector('input[name="channel-visibility"]:checked')?.value || 'public';
                const memberIds = Array.from(selectedChannelMembers.keys());

                if (!channelName) {
                    notifyUser('Please enter a channel name', 'warning');
                    return;
                }

                window.ApiClient.fetch('create_channel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        channelName: channelName,
                        channelDescription: channelDescription,
                        channelUsername: channelUsername,
                        visibility: visibility,
                        memberIds: memberIds
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (!data.success) {
                        notifyUser(data.message || 'Failed to create channel', 'error');
                        return;
                    }
                    const chatApp = window.chatApp;
                    if (chatApp) {
                        document.getElementById('new-chat-modal').style.display = 'none';
                        chatApp.loadConversations().then(() => {
                            chatApp.openChat(data.channel_id, 'channel', {
                                type: 'channel',
                                channel_id: data.channel_id,
                                channel_name: channelName,
                                channel_username: channelUsername || '',
                                visibility: visibility
                            });
                        });
                    }
                    document.getElementById('channel-name').value = '';
                    document.getElementById('channel-description').value = '';
                    document.getElementById('channel-username').value = '';
                    selectedChannelMembers.clear();
                    renderSelectedChannelMembers();
                    document.getElementById('channel-members-search').value = '';
                    document.getElementById('channel-members-results').innerHTML = '';
                })
                .catch(error => {
                    console.error('Error creating channel:', error);
                    notifyUser('Error creating channel', 'error');
                });
            }
        });

        document.getElementById('join-group-btn').addEventListener('click', function() {
            const groupId = document.getElementById('join-group-id').value.trim();
            if (!groupId) {
                notifyUser('Please enter a group ID', 'warning');
                return;
            }
            window.ApiClient.fetch('join_group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupUsername: groupId })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    notifyUser(data.message || 'Unable to join group', 'error');
                    return;
                }
                const chatApp = window.chatApp;
                if (chatApp) {
                    document.getElementById('new-chat-modal').style.display = 'none';
                    chatApp.loadConversations();
                    chatApp.openChat(data.group_id, 'group', {
                        type: 'group',
                        group_id: data.group_id,
                        group_name: 'Group',
                        group_username: groupId
                    });
                }
                document.getElementById('join-group-id').value = '';
            })
            .catch(error => {
                console.error('Error joining group:', error);
                notifyUser('Error joining group', 'error');
            });
        });

        document.getElementById('join-channel-btn').addEventListener('click', function() {
            const channelId = document.getElementById('join-channel-id').value.trim();
            if (!channelId) {
                notifyUser('Please enter a channel ID', 'warning');
                return;
            }
            window.ApiClient.fetch('join_channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelUsername: channelId })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    notifyUser(data.message || 'Unable to join channel', 'error');
                    return;
                }
                const chatApp = window.chatApp;
                if (chatApp) {
                    document.getElementById('new-chat-modal').style.display = 'none';
                    chatApp.loadConversations().then(() => {
                        const meta = chatApp.getConversation(data.channel_id, 'channel') || {
                            type: 'channel',
                            channel_id: data.channel_id,
                            channel_name: 'Channel',
                            channel_username: channelId
                        };
                        chatApp.openChat(data.channel_id, 'channel', meta);
                    });
                }
                document.getElementById('join-channel-id').value = '';
            })
            .catch(error => {
                console.error('Error joining channel:', error);
                notifyUser('Error joining channel', 'error');
            });
        });
        
        // Make chatApp globally accessible
        window.addEventListener('DOMContentLoaded', () => {
            window.chatApp = new LiquidChat();
            const currentUserAvatar = document.getElementById('current-user-avatar');
            if (currentUserAvatar) {
                currentUserAvatar.addEventListener('error', function() {
                    if (this.dataset.fallback && this.src !== this.dataset.fallback) {
                        this.src = this.dataset.fallback;
                    }
                });
                if (typeof window.chatApp.getAvatarUrl === 'function') {
                    const profilePic = currentUserAvatar.dataset.profilePic || '';
                    const profileName = currentUserAvatar.dataset.profileName || '';
                    currentUserAvatar.src = window.chatApp.getAvatarUrl(profilePic, profileName, {
                        type: 'user',
                        cacheKey: 'current_user'
                    });
                }
            }
        });
    </script>
</body>
</html>

