<?php
if (!file_exists(__DIR__ . '/includes/config.php') || (!file_exists(__DIR__ . '/installed.lock') && !file_exists(__DIR__ . '/storage/installed.lock'))) {
    if (file_exists(__DIR__ . '/install.php')) {
        header('Location: install.php');
        exit;
    }
}
require_once __DIR__ . '/includes/config.php';
require_once 'includes/functions.php';
require_once 'includes/auth.php';

// Check if user is logged in
if (!Auth::isLoggedIn()) {
    redirect('login');
}

// Get current user data
$currentUser = Auth::getCurrentUser();
$userId = $currentUser['user_id'];

// Get complete user data from database
$userData = getUser($userId, $conn);

$error = '';
$success = '';

// Process profile update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_profile'])) {
    $fullName = sanitize($_POST['full_name']);
    $bioRaw = isset($_POST['bio']) ? trim($_POST['bio']) : '';
    $bio = sanitize($bioRaw);
    $wantsJson = isAjax() || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false);
    
    // Process username change if submitted
    if (isset($_POST['username'])) {
        $uRes = Auth::updateUsername($userId, $_POST['username'], $conn);
        if (!$uRes['success'] && ($uRes['status'] ?? 0) !== 200) {
            $error = $uRes['message'];
            if ($wantsJson) {
                jsonResponse(['error' => $uRes['message'], 'message' => $uRes['message']], $uRes['status'] ?? 400);
            }
        }
    }

    if (empty($error)) {
        $updateData = [
            'full_name' => $fullName,
            'bio' => $bio,
            'bio_raw' => $bioRaw
        ];
        
        $result = Auth::updateProfile($userId, $updateData, $conn);
        
        if ($result['success']) {
            $success = 'Profile updated successfully';
            // Update the user data
            $userData = getUser($userId, $conn);
            if ($wantsJson) {
                jsonResponse(['success' => true, 'message' => $success, 'user' => $userData]);
            }
        } else {
            $statusCode = isset($result['status']) ? (int) $result['status'] : 400;
            if ($wantsJson) {
                jsonResponse(['error' => $result['message'], 'message' => $result['message']], $statusCode);
            }
            $error = $result['message'];
        }
    }
}

// Process profile picture update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_picture'])) {
    $maxBytes = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);
    if (lc_upload_request_too_large($maxBytes)) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif (!isset($_FILES['profile_pic'])) {
        $error = 'No image selected or upload error';
    } elseif (lc_is_upload_error_too_large($_FILES['profile_pic']['error'])) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif ($_FILES['profile_pic']['error'] !== UPLOAD_ERR_OK) {
        $error = 'No image selected or upload error';
    } else {
        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        $filename = $_FILES['profile_pic']['name'];
        $ext = pathinfo($filename, PATHINFO_EXTENSION);

        if (in_array(strtolower($ext), $allowed, true)) {
            if ($_FILES['profile_pic']['size'] <= $maxBytes) {
                $newFilename = time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
                $uploadPath = IMAGE_UPLOAD_DIR . $newFilename;

                if (move_uploaded_file($_FILES['profile_pic']['tmp_name'], $uploadPath)) {
                    $result = Auth::updateProfilePic($userId, $newFilename, $conn);

                    if ($result['success']) {
                        $success = 'Profile picture updated successfully';
                        $userData = getUser($userId, $conn);
                        if (isAjax() || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)) {
                            jsonResponse([
                                'success' => true,
                                'message' => $success,
                                'profile_pic' => $newFilename,
                                'image_url' => 'uploads/images/' . $newFilename
                            ]);
                        }
                    } else {
                        $error = $result['message'];
                        if (isAjax() || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)) {
                            jsonResponse(['error' => $error, 'message' => $error], 500);
                        }
                    }
                } else {
                    $error = 'Failed to upload image';
                }
            } else {
                $error = lc_get_upload_limit_error($maxBytes);
            }
        } else {
            $error = 'Invalid image format. Allowed formats: JPG, PNG, GIF';
        }
    }
}

// Process password change
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['change_password'])) {
    $currentPassword = $_POST['current_password'];
    $newPassword = $_POST['new_password'];
    $confirmPassword = $_POST['confirm_password'];
    
    // Verify current password
    if (password_verify($currentPassword, $userData['password'])) {
        if ($newPassword === $confirmPassword) {
            if (strlen($newPassword) >= 8) {
                // Hash the new password
                $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
                
                // Update password in database
                $stmt = $conn->prepare("UPDATE users SET password = ? WHERE user_id = ?");
                $stmt->bind_param("si", $hashedPassword, $userId);
                
                if ($stmt->execute()) {
                    $success = 'Password updated successfully';
                } else {
                    $error = 'Failed to update password: ' . $conn->error;
                }
            } else {
                $error = 'New password must be at least 8 characters';
            }
        } else {
            $error = 'New passwords do not match';
        }
    } else {
        $error = 'Current password is incorrect';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Profile - Liquid Chat</title>
    <script src="js/theme.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="page-surface profile-page" data-app-shell="1">
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
                        <img src="uploads/images/<?php echo $userData['profile_pic'] ?? 'default.png'; ?>?v=<?php echo time(); ?>" alt="<?php echo $userData['username']; ?>" draggable="false">
                        <span><?php echo $userData['username']; ?></span>
                        <svg class="icon" aria-hidden="true"><use href="#icon-chevron-down"></use></svg>
                    </div>
                    <div class="user-menu-dropdown">
                        <a href="chat" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-comments"></use></svg> Chat
                        </a>
                        <a href="settings" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-settings"></use></svg> Settings
                        </a>
                        <a href="logout" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-logout"></use></svg> Logout
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="container" style="margin-top: 80px;">
        <div class="glass-card profile-section">
            <?php if ($error): ?>
                <div class="form-error mb-20">
                    <?php echo $error; ?>
                </div>
            <?php endif; ?>
            
            <?php if ($success): ?>
                <div class="form-success mb-20">
                    <?php echo $success; ?>
                </div>
            <?php endif; ?>
            
            <div class="profile-header">
                <div class="profile-avatar">
                    <img src="uploads/images/<?php echo $userData['profile_pic'] ?? 'default.png'; ?>?v=<?php echo time(); ?>" alt="<?php echo $userData['username']; ?>" draggable="false">
                    <label for="profile-pic-input" class="avatar-edit">
                        <svg class="icon" aria-hidden="true"><use href="#icon-camera"></use></svg>
                    </label>
                    <form method="POST" enctype="multipart/form-data" id="profile-pic-form" style="display: none;">
                        <input type="file" id="profile-pic-input" name="profile_pic" accept="image/*">
                        <input type="hidden" name="update_picture" value="1">
                    </form>
                </div>
                <div class="profile-info">
                    <h1><?php echo $userData['full_name']; ?></h1>
                    <div class="profile-username">@<?php echo $userData['username']; ?></div>
                    <div class="profile-status">
                        <span class="status-indicator status-<?php echo $userData['status']; ?>"></span>
                        <?php echo ucfirst($userData['status']); ?>
                    </div>
                </div>
            </div>
            
            <div class="tabs">
                <div class="tab active" data-tab="profile">Profile Info</div>
                <div class="tab" data-tab="security">Security</div>
            </div>
            
            <div class="tab-content active" id="profile-tab">
                <form method="POST" action="">
                    <div class="form-group">
                        <label for="username" class="form-label">Username</label>
                        <div style="position: relative; display: flex; align-items: center;">
                            <span style="position: absolute; left: 14px; color: var(--text-secondary, #707579); font-weight: 500;">@</span>
                            <input type="text" id="username" name="username" class="form-control" style="padding-left: 32px;" value="<?php echo htmlspecialchars($userData['username'] ?? ''); ?>" required pattern="[a-zA-Z0-9_]{3,32}" title="3 to 32 characters, letters, numbers, and underscores only">
                        </div>
                        <small class="form-text text-muted">You can choose a unique username on Liquid Chat (3-32 characters, letters, numbers, underscore).</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="email" class="form-label">Email</label>
                        <input type="email" id="email" class="form-control" value="<?php echo $userData['email']; ?>" disabled>
                    </div>
                    
                    <div class="form-group">
                        <label for="full_name" class="form-label">Full Name</label>
                        <input type="text" id="full_name" name="full_name" class="form-control" value="<?php echo $userData['full_name']; ?>" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="bio" class="form-label">Bio</label>
                        <textarea id="bio" name="bio" class="form-control" rows="4" maxlength="140" aria-describedby="bio-counter bio-error"><?php echo $userData['bio']; ?></textarea>
                        <div class="bio-meta">
                            <div class="bio-counter" id="bio-counter">0 / 140</div>
                            <div class="bio-error" id="bio-error" aria-live="polite"></div>
                        </div>
                    </div>
                    
                    <input type="hidden" name="update_profile" value="1">
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </form>
            </div>
            
            <div class="tab-content" id="security-tab">
                <form method="POST" action="">
                    <div class="form-group">
                        <label for="current_password" class="form-label">Current Password</label>
                        <input type="password" id="current_password" name="current_password" class="form-control" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="new_password" class="form-label">New Password</label>
                        <input type="password" id="new_password" name="new_password" class="form-control" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="confirm_password" class="form-label">Confirm New Password</label>
                        <input type="password" id="confirm_password" name="confirm_password" class="form-control" required>
                    </div>
                    
                    <input type="hidden" name="change_password" value="1">
                    <button type="submit" class="btn btn-primary">Change Password</button>
                </form>
            </div>
        </div>
    </div>
    
    <script nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        // Toggle user menu dropdown
        document.getElementById('user-menu-toggle').addEventListener('click', () => {
            document.querySelector('.user-menu-dropdown').classList.toggle('active');
        });
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                // Get the parent element
                const parent = this.closest('.tabs').parentElement;
                
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

        const maxBioLength = 140;
        const bioInput = document.getElementById('bio');
        const bioCounter = document.getElementById('bio-counter');
        const bioError = document.getElementById('bio-error');
        let bioIsComposing = false;

        const getBioLength = (value) => Array.from(value || '').length;

        const trimBioValue = (value) => {
            const chars = Array.from(value || '');
            if (chars.length <= maxBioLength) {
                return { value: value || '', length: chars.length, trimmed: false };
            }
            return { value: chars.slice(0, maxBioLength).join(''), length: maxBioLength, trimmed: true };
        };

        const setBioError = (message) => {
            if (!bioError) {
                return;
            }
            if (message) {
                bioError.textContent = message;
                bioError.style.display = 'block';
                return;
            }
            bioError.textContent = '';
            bioError.style.display = 'none';
        };

        const updateBioCounter = () => {
            if (!bioInput || !bioCounter) {
                return;
            }
            const length = getBioLength(bioInput.value);
            bioCounter.textContent = `${length} / ${maxBioLength}`;
        };

        const enforceBioLimit = (showError) => {
            if (!bioInput) {
                return;
            }
            const trimmed = trimBioValue(bioInput.value);
            if (trimmed.trimmed) {
                bioInput.value = trimmed.value;
                updateBioCounter();
                if (showError) {
                    setBioError('Bio must be 140 characters or less.');
                }
                return;
            }
            updateBioCounter();
            if (showError) {
                setBioError('');
            }
        };

        if (bioInput) {
            updateBioCounter();
            bioInput.addEventListener('compositionstart', () => {
                bioIsComposing = true;
            });
            bioInput.addEventListener('compositionend', () => {
                bioIsComposing = false;
                enforceBioLimit(true);
            });
            bioInput.addEventListener('input', () => {
                if (bioIsComposing) {
                    updateBioCounter();
                    return;
                }
                enforceBioLimit(true);
            });
        }

        const profileForm = document.querySelector('#profile-tab form');
        if (profileForm && bioInput) {
            profileForm.addEventListener('submit', (event) => {
                const length = getBioLength(bioInput.value);
                if (length > maxBioLength) {
                    event.preventDefault();
                    enforceBioLimit(true);
                    bioInput.focus();
                }
            });
        }
        
        const maxUploadBytes = <?php echo (int) (defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024)); ?>;
        const maxUploadLabel = `Max upload size is ${Math.round(maxUploadBytes / (1024 * 1024))} MB`;

        const showInlineError = (message) => {
            let errorBox = document.querySelector('.form-error');
            if (!errorBox) {
                errorBox = document.createElement('div');
                errorBox.className = 'form-error mb-20';
                const section = document.querySelector('.profile-section');
                if (section) {
                    section.insertBefore(errorBox, section.firstChild);
                }
            }
            if (errorBox) {
                errorBox.textContent = message;
            }
        };

        // Auto-submit profile pic form when file is selected
        document.getElementById('profile-pic-input').addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file && file.size > maxUploadBytes) {
                showInlineError(maxUploadLabel);
                event.target.value = '';
                return;
            }
            document.getElementById('profile-pic-form').submit();
        });
    </script>
</body>
</html>

