<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';
require_once 'includes/auth.php';

if (!Auth::isLoggedIn()) {
    redirect('login');
}

$currentUser = Auth::getCurrentUser();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Liquid Chat - Settings</title>
    <meta name="user-id" content="<?php echo $currentUser['user_id']; ?>">
    <script src="js/theme.js"></script>
    <script src="js/api-client.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="settings-page page-surface" data-app-shell="1">
    <?php include 'includes/icons.php'; ?>
    <div class="app-header glass-nav">
        <div class="container">
            <div class="app-nav">
                <div class="app-logo">
                    <a href="chat">
                        <img src="assets/logo.svg" alt="Liquid Chat">
                        <span>Liquid Chat</span>
                    </a>
                </div>

                <div class="user-menu">
                    <div class="user-menu-toggle" id="user-menu-toggle">
                        <img src="uploads/images/<?php echo $currentUser['profile_pic'] ?? 'default.png'; ?>?v=<?php echo time(); ?>" alt="<?php echo htmlspecialchars($currentUser['username'] ?? '', ENT_QUOTES); ?>" draggable="false">
                        <span><?php echo htmlspecialchars($currentUser['username'] ?? '', ENT_QUOTES); ?></span>
                        <svg class="icon" aria-hidden="true"><use href="#icon-chevron-down"></use></svg>
                    </div>
                    <div class="user-menu-dropdown">
                        <a href="chat" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-comments"></use></svg> Chat
                        </a>
                        <a href="profile" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Profile
                        </a>
                        <button class="dropdown-item pwa-install-trigger" type="button">
                            <svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg> Install App
                        </button>
                        <a href="logout" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-logout"></use></svg> Logout
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="settings-shell">
            <div class="glass-card settings-panel">
                <div class="settings-header-main">
                    <h2>Settings</h2>
                    <p>Manage your account, privacy, and device preferences.</p>
                </div>

                <div class="settings-categories">
                    <button class="settings-card" type="button" data-modal="settings-account-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Account</span>
                            <span class="settings-card-subtitle">Profile details and account info</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-privacy-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-lock"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Privacy &amp; Security</span>
                            <span class="settings-card-subtitle">Encryption, keys, and security status</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-notifications-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-bell"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Notifications</span>
                            <span class="settings-card-subtitle">Message previews and alerts</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-storage-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-database"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Data &amp; Storage</span>
                            <span class="settings-card-subtitle">Auto-download and cache controls</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-storage-usage-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-saved"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Storage</span>
                            <span class="settings-card-subtitle">Cached media usage by chat</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-appearance-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-palette"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Appearance</span>
                            <span class="settings-card-subtitle">Theme and display style</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-reactions-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-smile"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Reactions</span>
                            <span class="settings-card-subtitle">Fast reaction and preferences</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-sessions-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-devices"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Sessions</span>
                            <span class="settings-card-subtitle">Active sessions and device access</span>
                        </span>
                    </button>
                    <button class="settings-card pwa-install-trigger" type="button">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Install App (PWA)</span>
                            <span class="settings-card-subtitle">Install as standalone app on mobile or desktop</span>
                        </span>
                    </button>
                    <button class="settings-card" type="button" data-modal="settings-onboarding-modal">
                        <span class="settings-card-icon"><svg class="icon" aria-hidden="true"><use href="#icon-info"></use></svg></span>
                        <span class="settings-card-text">
                            <span class="settings-card-title">Onboarding</span>
                            <span class="settings-card-subtitle">Replay the first-run tour</span>
                        </span>
                    </button>
                </div>

                <div class="settings-footer">
                    <a href="chat" class="btn btn-secondary">Back to Chat</a>
                </div>
            </div>
        </div>
    </div>
    <div class="modal" id="settings-account-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Account</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Profile</h3>
                        <p>Basic account information on this device.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Username</h4>
                            <p>Your public username.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value"><?php echo htmlspecialchars($currentUser['username'] ?? '', ENT_QUOTES); ?></span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Full name</h4>
                            <p>Displayed to your contacts.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value"><?php echo htmlspecialchars($currentUser['full_name'] ?? '', ENT_QUOTES); ?></span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Email</h4>
                            <p>Used for login and recovery.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value"><?php echo htmlspecialchars($currentUser['email'] ?? '', ENT_QUOTES); ?></span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Edit profile</h4>
                            <p>Update your profile photo, bio, and details.</p>
                        </div>
                        <div class="setting-action">
                            <a href="profile" class="btn btn-secondary">Open Profile</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-privacy-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Privacy &amp; Security</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Cloud Encryption</h3>
                        <p>Protect your chats and media with Telegram-style server-side encryption (AES-256-GCM / CTR).</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Encryption status</h4>
                            <p id="encryption-status">Loading encryption status...</p>
                        </div>
                        <div class="setting-action">
                            <button class="btn btn-primary" id="run-e2ee-test">Verify Encryption</button>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Architecture</h4>
                            <p>Messages and files are encrypted before storage and securely decrypted on-demand without device key syncing.</p>
                        </div>
                        <div class="setting-action">
                            <span class="badge" style="padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background: rgba(51, 144, 236, 0.15); color: #3390ec; border: 1px solid rgba(51, 144, 236, 0.3);">Cloud AES-256</span>
                        </div>
                    </div>
                    <div id="encryption-test-result" class="mt-10" style="display: none;"></div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Last Seen</h3>
                        <p>Control who can see your last activity.</p>
                    </div>
                    <div class="setting-item setting-item-column">
                        <div class="setting-label">
                            <h4>Visibility</h4>
                            <p>Choose who can see your last seen time.</p>
                        </div>
                        <div class="setting-action full-width">
                            <div class="privacy-options">
                                <label class="privacy-option">
                                    <input type="radio" name="last-seen-privacy" value="everyone">
                                    <span>Everyone</span>
                                </label>
                                <label class="privacy-option">
                                    <input type="radio" name="last-seen-privacy" value="nobody">
                                    <span>Nobody</span>
                                </label>
                                <label class="privacy-option">
                                    <input type="radio" name="last-seen-privacy" value="contacts">
                                    <span>My contacts</span>
                                </label>
                                <label class="privacy-option">
                                    <input type="radio" name="last-seen-privacy" value="selected">
                                    <span>Selected users</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="setting-item setting-item-column" id="last-seen-selected-wrapper" style="display: none;">
                        <div class="setting-label">
                            <h4>Selected users</h4>
                            <p>Only these users can see your last seen time.</p>
                        </div>
                        <div class="setting-action full-width">
                            <input type="text" id="last-seen-search" class="form-control" placeholder="Search users...">
                            <div id="last-seen-search-results" class="privacy-search-results"></div>
                            <div id="last-seen-selected" class="privacy-selected"></div>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Mentions</h3>
                        <p>Highlight and notify when someone mentions you.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Mention alerts</h4>
                            <p>Mentions are highlighted in chat and in notifications.</p>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>App Lock</h3>
                        <p>Protect this device with a local PIN.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Enable App Lock</h4>
                            <p>Require a PIN to open the app on this device.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="app-lock-enabled">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>PIN</h4>
                            <p>Set or change your 4-8 digit PIN.</p>
                        </div>
                        <div class="setting-action">
                            <button class="btn btn-secondary" id="app-lock-set-pin">Set PIN</button>
                        </div>
                    </div>
                    <div class="setting-item setting-item-column">
                        <div class="setting-label">
                            <h4>PIN details</h4>
                            <p>Use digits only; this PIN never leaves your device.</p>
                        </div>
                        <div class="setting-action full-width">
                            <div class="app-lock-form" id="app-lock-form">
                                <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="app-lock-current-pin" class="form-control" placeholder="Current PIN (if set)">
                                <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="app-lock-new-pin" class="form-control" placeholder="New PIN">
                                <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="app-lock-confirm-pin" class="form-control" placeholder="Confirm PIN">
                                <button class="btn btn-primary" id="app-lock-save-pin" type="button">Save PIN</button>
                            </div>
                            <div class="app-lock-status" id="app-lock-status"></div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-lock after</h4>
                            <p>Lock the app when you are away.</p>
                        </div>
                        <div class="setting-action">
                            <select id="app-lock-timeout" class="form-control">
                                <option value="0">Never</option>
                                <option value="1">1 minute</option>
                                <option value="5">5 minutes</option>
                                <option value="15">15 minutes</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Lock on blur</h4>
                            <p>Lock when the tab loses focus.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="app-lock-on-blur">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Lock now</h4>
                            <p>Immediately lock this session.</p>
                        </div>
                        <div class="setting-action">
                            <button class="btn btn-secondary" id="app-lock-now" type="button">Lock</button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Disappearing Messages</h3>
                        <p>Set timers per chat to automatically delete new messages.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Per chat timers</h4>
                            <p>Open any chat and use the chat settings button to set timers.</p>
                        </div>
                        <div class="setting-action">
                            <a href="chat" class="btn btn-secondary">Open Chat</a>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Slow Mode</h3>
                        <p>Admins can rate-limit messages in group chats.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Manage slow mode</h4>
                            <p>Configure slow mode in the group settings screen.</p>
                        </div>
                        <div class="setting-action">
                            <a href="groups" class="btn btn-secondary">Manage Groups</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-notifications-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Notifications</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Message alerts</h3>
                        <p>Choose what appears in notifications.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Message notifications</h4>
                            <p>Get notified when you receive new messages.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="message-notifications">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item setting-item-column">
                        <div class="setting-label">
                            <h4>Notification style</h4>
                            <p>Pick how often you get alerts from a chat.</p>
                        </div>
                        <div class="setting-action full-width">
                            <div class="privacy-options">
                                <label class="privacy-option">
                                    <input type="radio" name="notify-mode" value="all">
                                    <span>Every message</span>
                                </label>
                                <label class="privacy-option">
                                    <input type="radio" name="notify-mode" value="latest">
                                    <span>Latest message only</span>
                                </label>
                            </div>
                            <div class="direct-message-hint">Latest message only keeps one alert updated in busy chats.</div>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Show sender name</h4>
                            <p>Display sender name in notifications.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="notify-show-sender">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Show message preview</h4>
                            <p>Display message preview in notifications.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="notify-show-preview">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-storage-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Data &amp; Storage</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Storage usage</h3>
                        <p>Local storage and cache usage on this device.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Downloaded media storage</h4>
                            <p>Downloads stay on this device only.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value" id="downloads-size">0 MB</span>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Current cache size</h4>
                            <p>Preview cache stored in this browser.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value" id="cache-size">0 MB</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Media Prefetch</h3>
                        <p>Auto-download media when it is near your viewport.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download images on Wi-Fi</h4>
                            <p>Download images automatically when on Wi-Fi.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-images-wifi">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download images on mobile data</h4>
                            <p>Download images automatically on cellular connections.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-images-mobile">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download videos on Wi-Fi</h4>
                            <p>Download videos automatically when on Wi-Fi.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-videos-wifi">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download videos on mobile data</h4>
                            <p>Download videos automatically on cellular connections.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-videos-mobile">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Maximum auto-download video size</h4>
                            <p>Videos larger than this size require manual download.</p>
                        </div>
                        <div class="setting-action">
                            <select id="auto-video-limit" class="form-control">
                                <option value="0">Disabled</option>
                                <option value="5">5 MB</option>
                                <option value="10">10 MB</option>
                                <option value="50">50 MB</option>
                                <option value="100">100 MB</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download audio on Wi-Fi</h4>
                            <p>Download audio and voice messages on Wi-Fi.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-audio-wifi">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download audio on mobile data</h4>
                            <p>Download audio and voice messages on cellular data.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-audio-mobile">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download files on Wi-Fi</h4>
                            <p>Download documents automatically on Wi-Fi.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-docs-wifi">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Auto-download files on mobile data</h4>
                            <p>Download documents automatically on cellular data.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="auto-docs-mobile">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Maximum auto-download file size</h4>
                            <p>Files larger than this size require manual download.</p>
                        </div>
                        <div class="setting-action">
                            <select id="auto-doc-limit" class="form-control">
                                <option value="0">Disabled</option>
                                <option value="5">5 MB</option>
                                <option value="10">10 MB</option>
                                <option value="25">25 MB</option>
                                <option value="50">50 MB</option>
                                <option value="100">100 MB</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Cache Management</h3>
                        <p>Manage cached previews and thumbnails.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Cache size limit</h4>
                            <p>Automatically evict old previews when the limit is reached.</p>
                        </div>
                        <div class="setting-action">
                            <select id="cache-limit" class="form-control">
                                <option value="256">256 MB</option>
                                <option value="512">512 MB</option>
                                <option value="1024">1 GB</option>
                                <option value="-1">Unlimited</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Cache thumbnails only</h4>
                            <p>Store small previews instead of full media in cache.</p>
                        </div>
                        <div class="setting-action">
                            <label class="switch">
                                <input type="checkbox" id="cache-thumbnails-only">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Clear cache</h4>
                            <p>Remove cached previews without deleting downloads.</p>
                        </div>
                        <div class="setting-action">
                            <button class="btn btn-secondary" id="clear-cache-btn">Clear Cache</button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Drafts</h3>
                        <p>Drafts are saved per chat on this device.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Draft storage</h4>
                            <p>Drafts stay on this device and clear after sending.</p>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Folders</h3>
                        <p>Organize chats into custom folders.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Manage folders</h4>
                            <p>Create, rename, and assign folders in the chat list.</p>
                        </div>
                        <div class="setting-action">
                            <a href="chat" class="btn btn-secondary">Open Chat</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-storage-usage-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Storage</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Cached media totals</h3>
                        <p>Storage usage for downloaded media and previews.</p>
                    </div>
                    <div class="storage-usage-summary">
                        <div class="storage-usage-card">
                            <h4>Total cached media</h4>
                            <div class="storage-usage-value" id="storage-total-size">0 MB</div>
                        </div>
                        <div class="storage-usage-card">
                            <h4>Preview cache</h4>
                            <div class="storage-usage-value" id="storage-thumb-size">0 MB</div>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Usage by chat</h3>
                        <p>Clear cached media per conversation.</p>
                    </div>
                    <div class="storage-usage-list" id="storage-usage-list"></div>
                </div>
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Clear cache</h3>
                        <p>Remove all cached media on this device.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Clear cached media</h4>
                            <p>Messages remain; media will re-download when opened.</p>
                        </div>
                        <div class="setting-action">
                            <button class="btn btn-secondary" id="storage-clear-all">Clear all cache</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-appearance-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Appearance</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Theme</h3>
                        <p id="current-theme-description">Choose the look and feel for the app.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Current theme</h4>
                            <p id="current-theme-subtitle">Default theme.</p>
                        </div>
                        <div class="setting-action">
                            <span class="setting-value" id="current-theme-label">Default</span>
                        </div>
                    </div>
                    <div class="setting-item setting-item-column">
                        <div class="setting-label">
                            <h4>Choose theme</h4>
                            <p>Switch themes instantly without reloading.</p>
                        </div>
                        <div class="setting-action full-width">
                            <div class="theme-options" id="theme-options">
                                <button class="theme-option" type="button" data-theme-option="telegram-z">
                                    <span class="theme-swatch theme-swatch-telegram-z"></span>
                                    <span>Telegram Z</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="dark">
                                    <span class="theme-swatch theme-swatch-dark"></span>
                                    <span>Dark</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="midnight">
                                    <span class="theme-swatch theme-swatch-midnight"></span>
                                    <span>Midnight</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="graphite">
                                    <span class="theme-swatch theme-swatch-graphite"></span>
                                    <span>Graphite</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="forest-night">
                                    <span class="theme-swatch theme-swatch-forest-night"></span>
                                    <span>Forest Night</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="cinder">
                                    <span class="theme-swatch theme-swatch-cinder"></span>
                                    <span>Cinder</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="light-clean">
                                    <span class="theme-swatch theme-swatch-light-clean"></span>
                                    <span>Light Clean</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="ivory">
                                    <span class="theme-swatch theme-swatch-ivory"></span>
                                    <span>Ivory</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="ocean-blue">
                                    <span class="theme-swatch theme-swatch-ocean-blue"></span>
                                    <span>Ocean Blue</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="emerald-green">
                                    <span class="theme-swatch theme-swatch-emerald-green"></span>
                                    <span>Emerald Green</span>
                                </button>
                                <button class="theme-option" type="button" data-theme-option="warm-sunset">
                                    <span class="theme-swatch theme-swatch-warm-sunset"></span>
                                    <span>Warm Sunset</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-reactions-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Reactions</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Fast reaction</h3>
                        <p>Choose the emoji used for double-click reactions.</p>
                    </div>
                    <div class="setting-item setting-item-column">
                        <div class="setting-label">
                            <h4>Fast reaction emoji</h4>
                            <p>Tap a reaction or type an emoji.</p>
                        </div>
                        <div class="setting-action full-width">
                            <div class="fast-reaction-options" id="fast-reaction-options">
                                <button class="fast-reaction-option" type="button">&#128077;</button>
                                <button class="fast-reaction-option" type="button">&#10084;&#65039;</button>
                                <button class="fast-reaction-option" type="button">&#128514;</button>
                                <button class="fast-reaction-option" type="button">&#128558;</button>
                                <button class="fast-reaction-option" type="button">&#128546;</button>
                                <button class="fast-reaction-option" type="button">&#128545;</button>
                                <button class="fast-reaction-option" type="button">&#128078;</button>
                                <button class="fast-reaction-option" type="button">&#127881;</button>
                                <button class="fast-reaction-option" type="button">&#128293;</button>
                                <button class="fast-reaction-option" type="button">&#129327;</button>
                                <button class="fast-reaction-option" type="button">&#128079;</button>
                                <button class="fast-reaction-option" type="button">&#128526;</button>
                                <button class="fast-reaction-option" type="button">&#128148;</button>
                                <button class="fast-reaction-option" type="button">&#128564;</button>
                                <button class="fast-reaction-option" type="button">&#128591;</button>
                                <button class="fast-reaction-option" type="button">&#129300;</button>
                                <button class="fast-reaction-option" type="button">&#128525;</button>
                                <button class="fast-reaction-option" type="button">&#128588;</button>
                                <button class="fast-reaction-option" type="button">&#9989;</button>
                                <button class="fast-reaction-option" type="button">&#128557;</button>
                            </div>
                            <input class="form-control" id="fast-reaction-input" maxlength="8" placeholder="Custom emoji">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-sessions-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Sessions</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>Active sessions</h3>
                        <p>Manage devices connected to your account.</p>
                    </div>
                    <div class="devices-toolbar">
                        <button class="btn btn-secondary" id="refresh-sessions-btn">Refresh</button>
                        <button class="btn btn-secondary" id="revoke-other-sessions">Log out others</button>
                    </div>
                    <div class="devices-list" id="sessions-list"></div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal" id="settings-onboarding-modal" data-settings-modal>
        <div class="modal-content glass-card settings-modal">
            <div class="modal-header">
                <h3>Onboarding</h3>
                <button class="btn btn-icon" type="button" data-modal-close><svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg></button>
            </div>
            <div class="modal-body">
                <div class="settings-section">
                    <div class="settings-header">
                        <h3>First-run tour</h3>
                        <p>Replay the onboarding flow on this device.</p>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <h4>Launch onboarding</h4>
                            <p>Shows the quick start tour in chat.</p>
                        </div>
                        <div class="setting-action">
                            <a class="btn btn-secondary" href="chat?onboarding=1">Start tour</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="js/encryption.js"></script>
    <script src="js/media_cache.js"></script>
    <script src="js/app_lock.js"></script>
    <script nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        const menuToggle = document.getElementById('user-menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                document.querySelector('.user-menu-dropdown')?.classList.toggle('active');
            });
        }

        const resultElement = document.getElementById('encryption-test-result');
        const statusElement = document.getElementById('encryption-status');
        const cryptoManager = new CryptoManager();
        const mediaStore = window.MediaStore ? new MediaStore() : null;
        const userId = parseInt(document.querySelector('meta[name="user-id"]')?.content || '0', 10);
        let conversationMap = new Map();
        let conversationMapLoaded = false;
        const syncToggle = document.getElementById('sync-keys-toggle');
        const lastSeenOptions = Array.from(document.querySelectorAll('input[name="last-seen-privacy"]'));
        const lastSeenWrapper = document.getElementById('last-seen-selected-wrapper');
        const lastSeenSearch = document.getElementById('last-seen-search');
        const lastSeenSearchResults = document.getElementById('last-seen-search-results');
        const lastSeenSelected = document.getElementById('last-seen-selected');
        let lastSeenPrivacy = 'everyone';
        const lastSeenSelectedMap = new Map();
        let lastSeenSearchTimer = null;
        let lastSeenSearchCache = new Map();
        const notifyStorageKey = userId ? `lc_notify_settings_${userId}` : 'lc_notify_settings';
        const notifyChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lc_notify_settings') : null;
        let notifyWorkerReady = false;

        const modals = Array.from(document.querySelectorAll('[data-settings-modal]'));
        let activeModal = null;

        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) {
                return;
            }
            modal.style.display = 'flex';
            activeModal = modal;
        }

        function closeModal(modal) {
            if (!modal) {
                return;
            }
            modal.style.display = 'none';
            if (activeModal === modal) {
                activeModal = null;
            }
        }

        function openModalFromQuery() {
            if (typeof window === 'undefined') {
                return;
            }
            const params = new URLSearchParams(window.location.search);
            const target = params.get('open');
            if (!target) {
                return;
            }
            const map = {
                storage: 'settings-storage-usage-modal',
                sessions: 'settings-sessions-modal',
                onboarding: 'settings-onboarding-modal'
            };
            const modalId = map[target];
            if (modalId) {
                openModal(modalId);
            }
            params.delete('open');
            const next = params.toString();
            const nextUrl = `${window.location.pathname}${next ? '?' + next : ''}`;
            window.history.replaceState(null, '', nextUrl);
        }

        document.querySelectorAll('[data-modal]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-modal');
                if (target) {
                    openModal(target);
                }
            });
        });

        document.querySelectorAll('[data-modal-close]').forEach((btn) => {
            btn.addEventListener('click', () => {
                closeModal(btn.closest('.modal'));
            });
        });

        modals.forEach((modal) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeModal(modal);
                }
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeModal) {
                closeModal(activeModal);
            }
        });

        function showResult(html, type) {
            if (!resultElement) {
                return;
            }
            resultElement.style.display = 'block';
            resultElement.innerHTML = `<div class="form-${type}">${html}</div>`;
        }

        function formatBytes(bytes) {
            if (!bytes) {
                return '0 MB';
            }
            const mb = bytes / (1024 * 1024);
            if (mb < 1024) {
                return mb.toFixed(1) + ' MB';
            }
            return (mb / 1024).toFixed(2) + ' GB';
        }

        function formatDateTime(value) {
            if (!value) {
                return '';
            }
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return value;
            }
            const pad = (num) => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function getConversationKey(conversation) {
            if (!conversation) {
                return null;
            }
            if (conversation.type === 'group') {
                return conversation.group_id ? `group:${conversation.group_id}` : null;
            }
            if (conversation.type === 'channel') {
                return conversation.channel_id ? `channel:${conversation.channel_id}` : null;
            }
            if (conversation.type === 'saved') {
                return userId ? `saved:${userId}` : null;
            }
            return conversation.user_id ? `direct:${conversation.user_id}` : null;
        }

        function getConversationLabel(conversation) {
            if (!conversation) {
                return 'Chat';
            }
            if (conversation.type === 'group') {
                return conversation.group_name || 'Group';
            }
            if (conversation.type === 'channel') {
                return conversation.channel_name || 'Channel';
            }
            if (conversation.type === 'saved') {
                return 'Saved Messages';
            }
            return conversation.full_name || conversation.username || 'Chat';
        }

        function getConversationAvatar(conversation) {
            if (!conversation || !conversation.type) {
                return 'uploads/images/default.png';
            }
            let pic = '';
            let fallback = 'default.png';
            if (conversation.type === 'group') {
                pic = conversation.group_pic || '';
                fallback = 'default_group.png';
            } else if (conversation.type === 'channel') {
                pic = conversation.channel_pic || '';
                fallback = 'default_channel.png';
            } else if (conversation.type === 'direct') {
                pic = conversation.profile_pic || '';
                fallback = 'default.png';
            } else {
                pic = '';
                fallback = 'default.png';
            }
            const safePic = (pic || '').trim() || fallback;
            return `uploads/images/${safePic}`;
        }

        async function ensureConversationMap() {
            if (conversationMapLoaded) {
                return conversationMap;
            }
            conversationMapLoaded = true;
            conversationMap = new Map();
            try {
                const response = await window.ApiClient.fetch('conversations');
                const data = await response.json();
                if (data && data.success && Array.isArray(data.conversations)) {
                    data.conversations.forEach((conversation) => {
                        const key = getConversationKey(conversation);
                        if (key) {
                            conversationMap.set(key, {
                                label: getConversationLabel(conversation),
                                avatar: getConversationAvatar(conversation),
                                type: conversation.type
                            });
                        }
                    });
                }
            } catch (err) {
            }
            return conversationMap;
        }

        function buildStoragePill(label, bytes) {
            const pill = document.createElement('span');
            pill.className = 'storage-usage-pill';
            pill.textContent = `${label} ${formatBytes(bytes)}`;
            return pill;
        }

        async function updateStorageUsage(cacheSize, downloadSize) {
            const totalEl = document.getElementById('storage-total-size');
            const thumbEl = document.getElementById('storage-thumb-size');
            if (totalEl) {
                totalEl.textContent = formatBytes((downloadSize || 0) + (cacheSize || 0));
            }
            if (thumbEl) {
                thumbEl.textContent = formatBytes(cacheSize || 0);
            }
            const usageList = document.getElementById('storage-usage-list');
            if (!mediaStore || !usageList) {
                return;
            }
            usageList.innerHTML = '<div class="settings-empty">Loading usage...</div>';
            await mediaStore.init();
            await ensureConversationMap();
            let usage = [];
            try {
                usage = await mediaStore.getMediaUsageByChat(userId);
            } catch (err) {
                usage = [];
            }
            const sorted = (usage || []).sort((a, b) => (b.total || 0) - (a.total || 0));
            if (!sorted.length) {
                usageList.innerHTML = '<div class="settings-empty">No cached media yet.</div>';
                return;
            }
            usageList.innerHTML = '';
            sorted.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'storage-usage-row';
                const meta = document.createElement('div');
                meta.className = 'storage-usage-meta';
                const info = conversationMap.get(entry.chat_id);
                const titleText = info && info.label ? info.label : (entry.chat_id ? String(entry.chat_id).replace(':', ' ') : 'Unknown chat');
                const avatar = document.createElement('div');
                avatar.className = 'storage-usage-avatar';
                const avatarImg = document.createElement('img');
                avatarImg.src = (info && info.avatar) ? info.avatar : 'uploads/images/default.png';
                avatarImg.alt = titleText;
                avatar.appendChild(avatarImg);
                const infoWrap = document.createElement('div');
                infoWrap.className = 'storage-usage-info';
                const title = document.createElement('div');
                title.className = 'storage-usage-title';
                title.textContent = titleText;
                const detail = document.createElement('div');
                detail.className = 'storage-usage-detail';
                const buckets = [
                    { label: 'Images', value: entry.images },
                    { label: 'Video', value: entry.video },
                    { label: 'Audio', value: entry.audio },
                    { label: 'Docs', value: entry.docs }
                ];
                buckets.forEach((bucket) => {
                    if (bucket.value && bucket.value > 0) {
                        detail.appendChild(buildStoragePill(bucket.label, bucket.value));
                    }
                });
                if (!detail.childNodes.length) {
                    detail.textContent = 'No media cached';
                }
                infoWrap.appendChild(title);
                infoWrap.appendChild(detail);
                meta.appendChild(avatar);
                meta.appendChild(infoWrap);
                const actions = document.createElement('div');
                actions.className = 'storage-usage-actions';
                const size = document.createElement('div');
                size.textContent = formatBytes(entry.total || 0);
                const clearBtn = document.createElement('button');
                clearBtn.className = 'btn btn-secondary';
                clearBtn.type = 'button';
                clearBtn.textContent = 'Clear';
                clearBtn.addEventListener('click', async () => {
                    await mediaStore.clearChatMedia(entry.chat_id);
                    await updateStorageStats();
                });
                actions.appendChild(size);
                actions.appendChild(clearBtn);
                row.appendChild(meta);
                row.appendChild(actions);
                usageList.appendChild(row);
            });
        }

        async function updateStorageStats() {
            if (!mediaStore) {
                return;
            }
            await mediaStore.init();
            const cacheSize = await mediaStore.getCacheSize();
            const downloadSize = await mediaStore.getDownloadSize();
            const cacheEl = document.getElementById('cache-size');
            const downloadsEl = document.getElementById('downloads-size');
            if (cacheEl) {
                cacheEl.textContent = formatBytes(cacheSize);
            }
            if (downloadsEl) {
                downloadsEl.textContent = formatBytes(downloadSize);
            }
            await updateStorageUsage(cacheSize, downloadSize);
        }

        async function updateStatus() {
            try {
                const res = await window.ApiClient.fetch('test_encryption');
                const data = await res.json();
                if (data.success && data.keys_ready) {
                    statusElement.textContent = 'Active (AES-256-GCM / CTR). Messages & files are protected with Telegram-style cloud encryption.';
                } else {
                    statusElement.textContent = 'Server encryption ready.';
                }
            } catch (err) {
                statusElement.textContent = 'Cloud encryption initialized.';
            }
        }

        function renderLastSeenSelected() {
            if (!lastSeenSelected) {
                return;
            }
            lastSeenSelected.innerHTML = '';
            if (!lastSeenSelectedMap.size) {
                lastSeenSelected.innerHTML = '<div class="settings-empty">No users selected.</div>';
                return;
            }
            lastSeenSelectedMap.forEach((user) => {
                const chip = document.createElement('div');
                chip.className = 'privacy-chip';
                const label = user.full_name || user.username || 'User';
                chip.innerHTML = `
                    <span>${label}</span>
                    <button class="btn btn-icon" type="button" data-user-id="${user.user_id}">
                        <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                    </button>
                `;
                lastSeenSelected.appendChild(chip);
            });
        }

        function renderLastSeenSearchResults(users) {
            if (!lastSeenSearchResults) {
                return;
            }
            lastSeenSearchCache = new Map();
            if (!users || !users.length) {
                lastSeenSearchResults.innerHTML = '<div class="settings-empty">No users found.</div>';
                return;
            }
            lastSeenSearchResults.innerHTML = '';
            users.forEach((user) => {
                const id = parseInt(user.user_id, 10);
                if (!id || id === userId) {
                    return;
                }
                lastSeenSearchCache.set(id, user);
                const row = document.createElement('div');
                row.className = 'privacy-search-item';
                const label = user.full_name || user.username || 'User';
                const username = user.username ? '@' + user.username : '';
                const isSelected = lastSeenSelectedMap.has(id);
                row.innerHTML = `
                    <div class="privacy-user">
                        <strong>${label}</strong>
                        <span>${username}</span>
                    </div>
                    <button class="btn btn-secondary" type="button" data-user-id="${id}" ${isSelected ? 'disabled' : ''}>
                        ${isSelected ? 'Added' : 'Add'}
                    </button>
                `;
                lastSeenSearchResults.appendChild(row);
            });
        }

        function updateLastSeenPrivacy(value, skipSave) {
            lastSeenPrivacy = value || 'everyone';
            if (lastSeenWrapper) {
                lastSeenWrapper.style.display = lastSeenPrivacy === 'selected' ? 'block' : 'none';
            }
            if (!skipSave) {
                saveSettings({
                    last_seen_privacy: lastSeenPrivacy,
                    last_seen_selected: Array.from(lastSeenSelectedMap.keys())
                });
            }
        }

        async function loadLastSeenSelected(ids) {
            lastSeenSelectedMap.clear();
            if (!ids || !ids.length) {
                renderLastSeenSelected();
                return;
            }
            const uniqueIds = Array.from(new Set(ids.map((id) => parseInt(id, 10)).filter((id) => id > 0)));
            await Promise.all(uniqueIds.map(async (id) => {
                try {
                    const res = await window.ApiClient.fetch('user', undefined, { user_id: id });
                    const data = await res.json();
                    if (data.success && data.user) {
                        lastSeenSelectedMap.set(id, data.user);
                    }
                } catch (err) {
                }
            }));
            renderLastSeenSelected();
        }

        function getNotifyMode() {
            const selected = document.querySelector('input[name="notify-mode"]:checked');
            return selected ? selected.value : 'all';
        }

        async function ensureSettingsWorker() {
            if (notifyWorkerReady || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
                return;
            }
            try {
                await navigator.serviceWorker.register('/service-worker.js');
                notifyWorkerReady = true;
            } catch (err) {
            }
        }

        function publishNotificationSettings(payload) {
            if (!payload) {
                return;
            }
            const snapshot = {
                notify_enabled: payload.notify_enabled ? 1 : 0,
                notify_show_sender: payload.notify_show_sender ? 1 : 0,
                notify_show_preview: payload.notify_show_preview ? 1 : 0,
                notify_mode: payload.notify_mode || 'all',
                updated_at: Date.now()
            };
            try {
                localStorage.setItem(notifyStorageKey, JSON.stringify(snapshot));
            } catch (err) {
            }
            if (notifyChannel) {
                notifyChannel.postMessage(snapshot);
            }
            if (navigator.serviceWorker) {
                const message = {
                    type: 'notify-sync',
                    userId: userId,
                    settings: snapshot
                };
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage(message);
                } else if (navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then((reg) => {
                        if (reg.active) {
                            reg.active.postMessage(message);
                        }
                    }).catch(() => {});
                }
            }
        }

        async function saveSettings(overrides = {}) {
            const fastReactionInput = document.getElementById('fast-reaction-input');
            const payload = Object.assign({
                notify_enabled: document.getElementById('message-notifications').checked,
                notify_show_sender: document.getElementById('notify-show-sender').checked,
                notify_show_preview: document.getElementById('notify-show-preview').checked,
                notify_mode: getNotifyMode(),
                auto_download_images_wifi: document.getElementById('auto-images-wifi').checked,
                auto_download_images_mobile: document.getElementById('auto-images-mobile').checked,
                auto_download_videos_wifi: document.getElementById('auto-videos-wifi').checked,
                auto_download_videos_mobile: document.getElementById('auto-videos-mobile').checked,
                auto_download_video_limit: parseInt(document.getElementById('auto-video-limit').value || '0', 10),
                cache_limit_mb: parseInt(document.getElementById('cache-limit').value || '0', 10),
                cache_thumbnails_only: document.getElementById('cache-thumbnails-only').checked,
                key_sync_enabled: syncToggle ? syncToggle.checked : false,
                fast_reaction: fastReactionInput ? (fastReactionInput.value.trim() || '\u{1F44D}') : '\u{1F44D}',
                last_seen_privacy: lastSeenPrivacy,
                last_seen_selected: Array.from(lastSeenSelectedMap.keys())
            }, overrides);
            await window.ApiClient.fetch('settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            publishNotificationSettings(payload);
        }

        function getMediaPrefsKey() {
            return userId ? `lc_media_prefs_${userId}` : 'lc_media_prefs';
        }

        function loadLocalMediaPrefs() {
            try {
                const raw = localStorage.getItem(getMediaPrefsKey());
                if (!raw) {
                    return {};
                }
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') {
                    return {};
                }
                return {
                    auto_download_audio_wifi: !!parsed.auto_download_audio_wifi,
                    auto_download_audio_mobile: !!parsed.auto_download_audio_mobile,
                    auto_download_docs_wifi: !!parsed.auto_download_docs_wifi,
                    auto_download_docs_mobile: !!parsed.auto_download_docs_mobile,
                    auto_download_doc_limit: parseInt(parsed.auto_download_doc_limit || 10, 10) || 10
                };
            } catch (err) {
                return {};
            }
        }

        function saveLocalMediaPrefs() {
            const payload = {
                auto_download_audio_wifi: document.getElementById('auto-audio-wifi')?.checked ? 1 : 0,
                auto_download_audio_mobile: document.getElementById('auto-audio-mobile')?.checked ? 1 : 0,
                auto_download_docs_wifi: document.getElementById('auto-docs-wifi')?.checked ? 1 : 0,
                auto_download_docs_mobile: document.getElementById('auto-docs-mobile')?.checked ? 1 : 0,
                auto_download_doc_limit: parseInt(document.getElementById('auto-doc-limit')?.value || '10', 10) || 10
            };
            try {
                localStorage.setItem(getMediaPrefsKey(), JSON.stringify(payload));
            } catch (err) {
            }
        }

        function setFastReaction(value, skipSave) {
            const fastReactionInput = document.getElementById('fast-reaction-input');
            if (!fastReactionInput) {
                return;
            }
            const trimmed = (value || '').trim();
            if (!trimmed) {
                return;
            }
            fastReactionInput.value = trimmed;
            document.querySelectorAll('.fast-reaction-option').forEach((btn) => {
                const emoji = btn.textContent.trim();
                btn.classList.toggle('active', emoji === trimmed);
            });
            if (!skipSave) {
                saveSettings({ fast_reaction: trimmed });
            }
        }

        const themeMeta = {
            'telegram-z': {
                label: 'Telegram Web Z',
                subtitle: 'Authentic Telegram Web Z interface.',
                description: 'Telegram Web Z aesthetic with authentic bubbles, blue accents, and optimized performance.'
            },
            dark: {
                label: 'Dark',
                subtitle: 'Liquid glass dark UI.',
                description: 'Deep glass theme with vivid accents.'
            },
            midnight: {
                label: 'Midnight',
                subtitle: 'Cool blue night UI.',
                description: 'Deep navy surfaces with electric blue highlights.'
            },
            graphite: {
                label: 'Graphite',
                subtitle: 'Neutral charcoal UI.',
                description: 'Graphite tones with soft teal accents.'
            },
            'forest-night': {
                label: 'Forest Night',
                subtitle: 'Moody green UI.',
                description: 'Dark forest greens with warm amber glow.'
            },
            cinder: {
                label: 'Cinder',
                subtitle: 'Warm ember UI.',
                description: 'Smoky charcoal with amber highlights.'
            },
            'light-clean': {
                label: 'Light Clean',
                subtitle: 'Bright and clear UI.',
                description: 'Clean light surfaces with crisp contrast.'
            },
            ivory: {
                label: 'Ivory',
                subtitle: 'Soft warm light UI.',
                description: 'Warm ivory tones with balanced blue accents.'
            },
            'ocean-blue': {
                label: 'Ocean Blue',
                subtitle: 'Cool, modern blue UI.',
                description: 'Oceanic blues with soft aqua highlights.'
            },
            'emerald-green': {
                label: 'Emerald Green',
                subtitle: 'Fresh green UI.',
                description: 'Balanced greens with subtle gold warmth.'
            },
            'warm-sunset': {
                label: 'Warm Sunset',
                subtitle: 'Warm, cozy UI.',
                description: 'Sunset tones with gentle amber accents.'
            }
        };
        const themeAliases = {
            telegram: 'telegram-z',
            'telegram-web-z': 'telegram-z',
            webz: 'telegram-z',
            light: 'light-clean',
            soft: 'warm-sunset'
        };

        function normalizeTheme(value) {
            if (themeMeta[value]) {
                return value;
            }
            if (themeAliases[value]) {
                return themeAliases[value];
            }
            return 'dark';
        }

        function applyThemeSelection(value, persist) {
            const normalized = normalizeTheme(value);
            if (persist) {
                if (window.LiquidTheme && typeof window.LiquidTheme.apply === 'function') {
                    window.LiquidTheme.apply(normalized);
                } else {
                    document.documentElement.dataset.theme = normalized;
                    try {
                        localStorage.setItem('lc_theme', normalized);
                    } catch (err) {
                    }
                }
            }
            const label = document.getElementById('current-theme-label');
            const subtitle = document.getElementById('current-theme-subtitle');
            const description = document.getElementById('current-theme-description');
            if (label) {
                label.textContent = themeMeta[normalized].label;
            }
            if (subtitle) {
                subtitle.textContent = themeMeta[normalized].subtitle;
            }
            if (description) {
                description.textContent = themeMeta[normalized].description;
            }
            document.querySelectorAll('[data-theme-option]').forEach((btn) => {
                const isActive = btn.dataset.themeOption === normalized;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        async function loadSettings() {
            const response = await window.ApiClient.fetch('settings');
            const data = await response.json();
            if (!data.success) {
                return;
            }
            document.getElementById('message-notifications').checked = parseInt(data.settings.notify_enabled || 0, 10) === 1;
            document.getElementById('notify-show-sender').checked = parseInt(data.settings.notify_show_sender || 0, 10) === 1;
            document.getElementById('notify-show-preview').checked = parseInt(data.settings.notify_show_preview || 0, 10) === 1;
            const notifyMode = data.settings.notify_mode || 'all';
            document.querySelectorAll('input[name="notify-mode"]').forEach((option) => {
                option.checked = option.value === notifyMode;
            });
            document.getElementById('auto-images-wifi').checked = parseInt(data.settings.auto_download_images_wifi || 0, 10) === 1;
            document.getElementById('auto-images-mobile').checked = parseInt(data.settings.auto_download_images_mobile || 0, 10) === 1;
            document.getElementById('auto-videos-wifi').checked = parseInt(data.settings.auto_download_videos_wifi || 0, 10) === 1;
            document.getElementById('auto-videos-mobile').checked = parseInt(data.settings.auto_download_videos_mobile || 0, 10) === 1;
            if (typeof data.settings.auto_download_video_limit !== 'undefined') {
                document.getElementById('auto-video-limit').value = String(data.settings.auto_download_video_limit);
            }
            if (typeof data.settings.cache_limit_mb !== 'undefined') {
                document.getElementById('cache-limit').value = String(data.settings.cache_limit_mb);
            }
            document.getElementById('cache-thumbnails-only').checked = parseInt(data.settings.cache_thumbnails_only || 0, 10) === 1;
            const localMedia = loadLocalMediaPrefs();
            document.getElementById('auto-audio-wifi').checked = !!localMedia.auto_download_audio_wifi;
            document.getElementById('auto-audio-mobile').checked = !!localMedia.auto_download_audio_mobile;
            document.getElementById('auto-docs-wifi').checked = !!localMedia.auto_download_docs_wifi;
            document.getElementById('auto-docs-mobile').checked = !!localMedia.auto_download_docs_mobile;
            document.getElementById('auto-doc-limit').value = String(localMedia.auto_download_doc_limit || 10);
            if (syncToggle) {
                syncToggle.checked = parseInt(data.settings.key_sync_enabled || 0, 10) === 1;
            }
            const fastReaction = data.settings.fast_reaction || '\u{1F44D}';
            setFastReaction(fastReaction, true);
            const privacyValue = data.settings.last_seen_privacy || 'everyone';
            lastSeenOptions.forEach((option) => {
                option.checked = option.value === privacyValue;
            });
            updateLastSeenPrivacy(privacyValue, true);
            let selectedIds = [];
            const rawSelected = data.settings.last_seen_selected || '[]';
            if (Array.isArray(rawSelected)) {
                selectedIds = rawSelected;
            } else {
                try {
                    const parsed = JSON.parse(rawSelected);
                    if (Array.isArray(parsed)) {
                        selectedIds = parsed;
                    }
                } catch (err) {
                }
            }
            await loadLastSeenSelected(selectedIds);
            publishNotificationSettings({
                notify_enabled: document.getElementById('message-notifications').checked,
                notify_show_sender: document.getElementById('notify-show-sender').checked,
                notify_show_preview: document.getElementById('notify-show-preview').checked,
                notify_mode: notifyMode
            });
        }

        async function loadSessions() {
            const list = document.getElementById('sessions-list');
            if (!list) {
                return;
            }
            list.innerHTML = '<div class="settings-empty">Loading sessions...</div>';
            try {
                const response = await window.ApiClient.fetch('sessions');
                const data = await response.json();
                if (!data.success) {
                    list.innerHTML = '<div class="settings-empty">Unable to load sessions.</div>';
                    return;
                }
                list.innerHTML = '';
                if (!data.sessions || !data.sessions.length) {
                    list.innerHTML = '<div class="settings-empty">No active sessions found.</div>';
                    return;
                }
                data.sessions.forEach((session) => {
                    const row = document.createElement('div');
                    row.className = 'device-row';
                    const meta = document.createElement('div');
                    meta.className = 'device-meta';
                    const name = document.createElement('div');
                    name.className = 'device-name';
                    name.textContent = session.device_name || 'Session';
                    const detail = document.createElement('div');
                    detail.className = 'device-detail';
                    const ua = session.user_agent || '';
                    const ip = session.ip_address ? `IP: ${session.ip_address}` : '';
                    detail.textContent = [ua, ip].filter(Boolean).join(' | ');
                    const times = document.createElement('div');
                    times.className = 'device-times';
                    const login = formatDateTime(session.created_at);
                    const active = formatDateTime(session.last_active);
                    times.textContent = `Logged in: ${login || 'Unknown'} | Last active: ${active || 'Unknown'}`;
                    meta.appendChild(name);
                    if (detail.textContent) {
                        meta.appendChild(detail);
                    }
                    meta.appendChild(times);

                    const actions = document.createElement('div');
                    actions.className = 'device-actions';
                    if (session.is_current) {
                        const current = document.createElement('span');
                        current.className = 'device-current';
                        current.textContent = 'This device';
                        actions.appendChild(current);
                    } else {
                        const revoke = document.createElement('button');
                        revoke.className = 'btn btn-secondary';
                        revoke.type = 'button';
                        revoke.textContent = 'Revoke';
                        revoke.addEventListener('click', async () => {
                            await window.ApiClient.fetch('sessions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'revoke', session_id: session.id })
                            });
                            loadSessions();
                        });
                        actions.appendChild(revoke);
                    }
                    row.appendChild(meta);
                    row.appendChild(actions);
                    list.appendChild(row);
                });
            } catch (err) {
                list.innerHTML = '<div class="settings-empty">Unable to load sessions.</div>';
            }
        }

        document.getElementById('run-e2ee-test')?.addEventListener('click', async () => {
            resultElement.style.display = 'block';
            resultElement.innerHTML = '<div class="spinner"></div>';
            try {
                await cryptoManager.init(userId);
                const test = await cryptoManager.selfTest();
                if (test) {
                    showResult('<strong>Local encryption test successful.</strong>', 'success');
                } else {
                    showResult('<strong>Encryption test failed.</strong>', 'error');
                }
            } catch (err) {
                showResult('<strong>Encryption test failed.</strong>', 'error');
                console.error(err);
            }
        });

        document.getElementById('generate-keys-btn')?.addEventListener('click', async () => {
            const confirmed = window.showInAppConfirm
                ? await window.showInAppConfirm('Regenerate keys? You will lose access to older messages on this device.', 'Regenerate Keys', 'Regenerate', 'Cancel')
                : true;
            if (!confirmed) {
                return;
            }
            await cryptoManager.generateAndStoreKeys(userId, false);
            showResult('<strong>New keys generated on this device.</strong>', 'success');
            updateStatus();
        });

        syncToggle?.addEventListener('change', async () => {
            if (syncToggle.checked) {
                const passphrase = prompt('Enter a passphrase to encrypt your private key (required to restore on other devices):');
                if (!passphrase) {
                    syncToggle.checked = false;
                    return;
                }
                try {
                    await cryptoManager.enableKeySync(userId, passphrase);
                    await saveSettings({ key_sync_enabled: 1 });
                    showResult('<strong>Key sync enabled.</strong>', 'success');
                    updateStatus();
                } catch (err) {
                    syncToggle.checked = false;
                    showResult('<strong>Failed to enable key sync.</strong>', 'error');
                }
            } else {
                await saveSettings({ key_sync_enabled: 0 });
                showResult('<strong>Key sync disabled.</strong>', 'success');
            }
        });

        document.getElementById('restore-keys-btn')?.addEventListener('click', async () => {
            const passphrase = prompt('Enter your key sync passphrase:');
            if (!passphrase) {
                return;
            }
            const restored = await cryptoManager.restoreFromSync(userId, passphrase);
            if (restored) {
                showResult('<strong>Keys restored on this device.</strong>', 'success');
                updateStatus();
            } else {
                showResult('<strong>Failed to restore keys.</strong>', 'error');
            }
        });

        ['message-notifications', 'notify-show-sender', 'notify-show-preview'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', saveSettings);
        });
        document.querySelectorAll('input[name="notify-mode"]').forEach((option) => {
            option.addEventListener('change', saveSettings);
        });

        ['auto-images-wifi', 'auto-images-mobile', 'auto-videos-wifi', 'auto-videos-mobile',
            'auto-video-limit', 'auto-audio-wifi', 'auto-audio-mobile', 'auto-docs-wifi', 'auto-docs-mobile',
            'auto-doc-limit', 'cache-limit', 'cache-thumbnails-only'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', async () => {
                await saveSettings();
                saveLocalMediaPrefs();
                await updateStorageStats();
                if (mediaStore) {
                    const limit = parseInt(document.getElementById('cache-limit').value || '0', 10);
                    const bytes = limit < 0 ? -1 : limit * 1024 * 1024;
                    await mediaStore.enforceCacheLimit(bytes);
                }
            });
        });

        document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
            if (!mediaStore) {
                return;
            }
            await mediaStore.clearCache();
            await updateStorageStats();
        });

        document.getElementById('storage-clear-all')?.addEventListener('click', async () => {
            if (!mediaStore) {
                return;
            }
            await mediaStore.clearCache();
            await updateStorageStats();
        });

        document.getElementById('refresh-sessions-btn')?.addEventListener('click', () => {
            loadSessions();
        });

        document.getElementById('revoke-other-sessions')?.addEventListener('click', async () => {
            const confirmed = window.showInAppConfirm
                ? await window.showInAppConfirm('Are you sure you want to log out all other active sessions?', 'Log Out Sessions', 'Log Out Others', 'Cancel')
                : true;
            if (!confirmed) {
                return;
            }
            await window.ApiClient.fetch('sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revoke_others' })
            });
            loadSessions();
        });

        document.querySelectorAll('.fast-reaction-option').forEach((btn) => {
            btn.addEventListener('click', () => {
                const emoji = btn.textContent.trim();
                if (emoji) {
                    setFastReaction(emoji);
                }
            });
        });

        document.getElementById('fast-reaction-input')?.addEventListener('change', (event) => {
            const value = event.target.value.trim();
            if (value) {
                setFastReaction(value);
            }
        });

        lastSeenOptions.forEach((option) => {
            option.addEventListener('change', () => {
                if (option.checked) {
                    updateLastSeenPrivacy(option.value);
                }
            });
        });

        lastSeenSearch?.addEventListener('input', (event) => {
            const term = event.target.value.trim();
            if (lastSeenSearchTimer) {
                clearTimeout(lastSeenSearchTimer);
            }
            if (!term || term.length < 2) {
                if (lastSeenSearchResults) {
                    lastSeenSearchResults.innerHTML = '<div class="settings-empty">Type at least 2 characters.</div>';
                }
                lastSeenSearchCache.clear();
                return;
            }
            lastSeenSearchTimer = setTimeout(async () => {
                try {
                    const response = await window.ApiClient.fetch('search_users', undefined, { term: term });
                    const data = await response.json();
                    if (data.success) {
                        renderLastSeenSearchResults(data.users || []);
                    } else if (lastSeenSearchResults) {
                        lastSeenSearchResults.innerHTML = '<div class="settings-empty">Unable to search users.</div>';
                    }
                } catch (err) {
                    if (lastSeenSearchResults) {
                        lastSeenSearchResults.innerHTML = '<div class="settings-empty">Unable to search users.</div>';
                    }
                }
            }, 300);
        });

        lastSeenSearchResults?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-user-id]');
            if (!button || button.disabled) {
                return;
            }
            const id = parseInt(button.dataset.userId || '0', 10);
            if (!id || lastSeenSelectedMap.has(id)) {
                return;
            }
            const user = lastSeenSearchCache.get(id);
            if (!user) {
                return;
            }
            lastSeenSelectedMap.set(id, user);
            renderLastSeenSelected();
            renderLastSeenSearchResults(Array.from(lastSeenSearchCache.values()));
            saveSettings({ last_seen_selected: Array.from(lastSeenSelectedMap.keys()) });
        });

        lastSeenSelected?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-user-id]');
            if (!button) {
                return;
            }
            const id = parseInt(button.dataset.userId || '0', 10);
            if (!id || !lastSeenSelectedMap.has(id)) {
                return;
            }
            lastSeenSelectedMap.delete(id);
            renderLastSeenSelected();
            if (lastSeenSearchCache.size) {
                renderLastSeenSearchResults(Array.from(lastSeenSearchCache.values()));
            }
            saveSettings({ last_seen_selected: Array.from(lastSeenSelectedMap.keys()) });
        });

        document.querySelectorAll('[data-theme-option]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const nextTheme = btn.dataset.themeOption;
                applyThemeSelection(nextTheme, true);
                try {
                    await window.ApiClient.fetch('settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ theme: nextTheme })
                    });
                } catch (e) {}
                if (window.showInAppToast) {
                    window.showInAppToast('Theme updated. Redirecting to chat...', 'success');
                }
                setTimeout(() => {
                    window.location.href = 'chat';
                }, 350);
            });
        });
        const initialTheme = window.LiquidTheme && typeof window.LiquidTheme.get === 'function'
            ? window.LiquidTheme.get()
            : (localStorage.getItem('lc_theme') || 'dark');
        applyThemeSelection(initialTheme, false);

        ensureSettingsWorker();
        loadSettings();
        updateStatus();
        updateStorageStats();
        loadSessions();
        openModalFromQuery();
    </script>

</body>
</html>

