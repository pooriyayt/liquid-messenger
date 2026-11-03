<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';
require_once 'includes/auth.php';
require_once 'includes/chat_functions.php';

if (!Auth::isLoggedIn()) {
    redirect('login');
}

$currentUser = Auth::getCurrentUser();
$userId = $currentUser['user_id'];

if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    redirect('chat');
}

$channelId = (int) $_GET['id'];

$stmt = $conn->prepare("
    SELECT c.*, u.username as creator_name
    FROM channels c
    JOIN users u ON c.created_by = u.user_id
    WHERE c.channel_id = ?
");
$stmt->bind_param("i", $channelId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    redirect('chat');
}

$channel = $result->fetch_assoc();

$memberStmt = $conn->prepare("SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?");
$memberStmt->bind_param("ii", $channelId, $userId);
$memberStmt->execute();
$memberResult = $memberStmt->get_result();

if ($memberResult->num_rows === 0) {
    redirect('chat');
}

$membership = $memberResult->fetch_assoc();
$role = $membership['role'] ?? 'subscriber';
$isOwner = ($role === 'owner');
$isAdmin = ($role === 'admin' || $isOwner);

$permissions = Chat::getChannelPermissions($channelId, $userId, $conn);
$canManage = $permissions && !empty($permissions['can_manage']);
if ($isOwner) {
    $canManage = true;
}

$membersStmt = $conn->prepare("
    SELECT cm.*, u.username, u.full_name, u.profile_pic, u.status
    FROM channel_members cm
    JOIN users u ON cm.user_id = u.user_id
    WHERE cm.channel_id = ?
    ORDER BY FIELD(cm.role, 'owner', 'admin', 'subscriber'), u.full_name ASC
");
$membersStmt->bind_param("i", $channelId);
$membersStmt->execute();
$membersResult = $membersStmt->get_result();
$members = [];

while ($member = $membersResult->fetch_assoc()) {
    $members[] = $member;
}

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_member']) && $canManage) {
    $newMemberId = (int) $_POST['user_id'];
    $newRole = sanitize($_POST['role']);
    if (!in_array($newRole, ['admin', 'subscriber'], true)) {
        $newRole = 'subscriber';
    }

    $result = Chat::addChannelMember($channelId, $newMemberId, $newRole, $userId, $conn);

    if ($result['success']) {
        $success = 'Subscriber added successfully';
        $membersStmt->execute();
        $membersResult = $membersStmt->get_result();
        $members = [];
        while ($member = $membersResult->fetch_assoc()) {
            $members[] = $member;
        }
    } else {
        $error = $result['message'];
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['remove_member']) && $canManage) {
    $removeMemberId = (int) $_POST['member_id'];
    if ($removeMemberId == $channel['created_by']) {
        $error = 'You cannot remove the channel owner';
    } else {
        $stmt = $conn->prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $stmt->bind_param("ii", $channelId, $removeMemberId);
        if ($stmt->execute()) {
            $success = 'Subscriber removed successfully';
            $membersStmt->execute();
            $membersResult = $membersStmt->get_result();
            $members = [];
            while ($member = $membersResult->fetch_assoc()) {
                $members[] = $member;
            }
        } else {
            $error = 'Failed to remove subscriber: ' . $conn->error;
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_member_role']) && $canManage) {
    $memberId = (int) $_POST['member_id'];
    $newRole = sanitize($_POST['new_role']);
    if (!in_array($newRole, ['admin', 'subscriber'], true)) {
        $newRole = 'subscriber';
    }
    if ($memberId == $channel['created_by']) {
        $error = 'You cannot change the owner role';
    } else {
        $stmt = $conn->prepare("UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?");
        $stmt->bind_param("sii", $newRole, $channelId, $memberId);
        if ($stmt->execute()) {
            if ($newRole === 'admin') {
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
                $permStmt->bind_param("ii", $channelId, $memberId);
                $permStmt->execute();
            } else {
                $permStmt = $conn->prepare("DELETE FROM channel_admin_permissions WHERE channel_id = ? AND user_id = ?");
                $permStmt->bind_param("ii", $channelId, $memberId);
                $permStmt->execute();
            }
            $success = 'Subscriber role updated successfully';
            $membersStmt->execute();
            $membersResult = $membersStmt->get_result();
            $members = [];
            while ($member = $membersResult->fetch_assoc()) {
                $members[] = $member;
            }
        } else {
            $error = 'Failed to update role';
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_admin_permissions']) && $canManage) {
    $adminId = (int) $_POST['admin_id'];
    if ($adminId == $channel['created_by']) {
        $error = 'Owner permissions cannot be changed';
    } else {
        $permPost = isset($_POST['perm_post']) ? 1 : 0;
        $permEdit = isset($_POST['perm_edit']) ? 1 : 0;
        $permDelete = isset($_POST['perm_delete']) ? 1 : 0;
        $permPin = isset($_POST['perm_pin']) ? 1 : 0;
        $permManage = isset($_POST['perm_manage']) ? 1 : 0;

        $permStmt = $conn->prepare(
            "INSERT INTO channel_admin_permissions
                (channel_id, user_id, can_post, can_edit, can_delete, can_pin, can_manage)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                can_post = VALUES(can_post),
                can_edit = VALUES(can_edit),
                can_delete = VALUES(can_delete),
                can_pin = VALUES(can_pin),
                can_manage = VALUES(can_manage)"
        );
        $permStmt->bind_param(
            "iiiiiii",
            $channelId,
            $adminId,
            $permPost,
            $permEdit,
            $permDelete,
            $permPin,
            $permManage
        );
        if ($permStmt->execute()) {
            $success = 'Admin permissions updated';
        } else {
            $error = 'Failed to update permissions';
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_channel']) && $canManage) {
    $channelName = sanitize($_POST['channel_name']);
    $channelDescription = sanitize($_POST['channel_description']);
    $channelUsername = sanitize($_POST['channel_username']);
    $visibility = sanitize($_POST['visibility']);
    $contentProtection = isset($_POST['content_protection']) ? 1 : 0;

    if (empty($channelName)) {
        $error = 'Channel name cannot be empty';
    } else {
        $channelUsername = trim($channelUsername);
        if (!empty($channelUsername) && !preg_match('/^[a-zA-Z0-9_]{4,32}$/', $channelUsername)) {
            $error = 'Invalid channel ID format';
        } else {
            $visibility = in_array($visibility, ['public', 'private'], true) ? $visibility : 'public';
            if (!empty($channelUsername)) {
                $checkStmt = $conn->prepare("SELECT channel_id FROM channels WHERE channel_username = ? AND channel_id != ?");
                $checkStmt->bind_param("si", $channelUsername, $channelId);
                $checkStmt->execute();
                $checkResult = $checkStmt->get_result();
                if ($checkResult->num_rows > 0) {
                    $error = 'Channel ID is already taken';
                }
            }
        }
    }

    if (empty($error)) {
        $stmt = $conn->prepare(
            "UPDATE channels SET channel_name = ?, channel_description = ?, channel_username = ?, visibility = ?, content_protection = ? WHERE channel_id = ?"
        );
        $stmt->bind_param("ssssii", $channelName, $channelDescription, $channelUsername, $visibility, $contentProtection, $channelId);
        if ($stmt->execute()) {
            $success = 'Channel information updated successfully';
            $stmt = $conn->prepare(
                "SELECT c.*, u.username as creator_name
                 FROM channels c
                 JOIN users u ON c.created_by = u.user_id
                 WHERE c.channel_id = ?"
            );
            $stmt->bind_param("i", $channelId);
            $stmt->execute();
            $channel = $stmt->get_result()->fetch_assoc();
        } else {
            $error = 'Failed to update channel: ' . $conn->error;
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_image']) && $canManage) {
    $maxBytes = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);
    if (lc_upload_request_too_large($maxBytes)) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif (!isset($_FILES['channel_pic'])) {
        $error = 'No image selected or upload error';
    } elseif (lc_is_upload_error_too_large($_FILES['channel_pic']['error'])) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif ($_FILES['channel_pic']['error'] !== UPLOAD_ERR_OK) {
        $error = 'No image selected or upload error';
    } else {
        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        $filename = $_FILES['channel_pic']['name'];
        $ext = pathinfo($filename, PATHINFO_EXTENSION);

        if (in_array(strtolower($ext), $allowed, true)) {
            if ($_FILES['channel_pic']['size'] <= $maxBytes) {
                $newFilename = 'channel_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
                $uploadPath = IMAGE_UPLOAD_DIR . $newFilename;

                if (move_uploaded_file($_FILES['channel_pic']['tmp_name'], $uploadPath)) {
                    $stmt = $conn->prepare("UPDATE channels SET channel_pic = ? WHERE channel_id = ?");
                    $stmt->bind_param("si", $newFilename, $channelId);
                    if ($stmt->execute()) {
                        $success = 'Channel picture updated successfully';
                        $stmt = $conn->prepare(
                            "SELECT c.*, u.username as creator_name
                             FROM channels c
                             JOIN users u ON c.created_by = u.user_id
                             WHERE c.channel_id = ?"
                        );
                        $stmt->bind_param("i", $channelId);
                        $stmt->execute();
                        $channel = $stmt->get_result()->fetch_assoc();
                    } else {
                        $error = 'Failed to update channel picture: ' . $conn->error;
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

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_channel']) && $isOwner) {
    $stmt = $conn->prepare("DELETE FROM channels WHERE channel_id = ? AND created_by = ?");
    $stmt->bind_param("ii", $channelId, $userId);
    if ($stmt->execute()) {
        redirect('chat');
    } else {
        $error = 'Failed to delete channel';
    }
}

$adminPermissionsMap = [];
$permLookup = $conn->prepare(
    "SELECT user_id, can_post, can_edit, can_delete, can_pin, can_manage
     FROM channel_admin_permissions WHERE channel_id = ?"
);
$permLookup->bind_param("i", $channelId);
$permLookup->execute();
$permResult = $permLookup->get_result();
while ($row = $permResult->fetch_assoc()) {
    $adminPermissionsMap[(int) $row['user_id']] = $row;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['leave_channel'])) {
    if ($userId == $channel['created_by']) {
        $error = 'As the owner, you cannot leave the channel.';
    } else {
        $stmt = $conn->prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?");
        $stmt->bind_param("ii", $channelId, $userId);
        if ($stmt->execute()) {
            $success = 'You have left the channel';
            header('refresh:2;url=chat');
        } else {
            $error = 'Failed to leave channel: ' . $conn->error;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?php echo $channel['channel_name']; ?> - Liquid Chat</title>
    <script src="js/theme.js"></script>
    <script src="js/api-client.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="page-surface channel-page" data-app-shell="1">
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
                        <img src="uploads/images/<?php echo $currentUser['profile_pic'] ?? 'default.png'; ?>" alt="<?php echo $currentUser['username']; ?>" draggable="false">
                        <span><?php echo $currentUser['username']; ?></span>
                        <svg class="icon" aria-hidden="true"><use href="#icon-chevron-down"></use></svg>
                    </div>
                    <div class="user-menu-dropdown">
                        <a href="chat" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-comments"></use></svg> Chat
                        </a>
                        <a href="profile" class="dropdown-item">
                            <svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg> Profile
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
        <div class="glass-card">
            <a href="chat" class="btn btn-secondary mb-20">
                <svg class="icon" aria-hidden="true"><use href="#icon-arrow-left"></use></svg> Back to Chat
            </a>

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
                    <img src="uploads/images/<?php echo $channel['channel_pic'] ?? 'default_group.png'; ?>" alt="<?php echo $channel['channel_name']; ?>" draggable="false">
                    <?php if ($canManage): ?>
                        <label for="channel-pic-input" class="avatar-edit">
                            <svg class="icon" aria-hidden="true"><use href="#icon-camera"></use></svg>
                        </label>
                        <form method="POST" enctype="multipart/form-data" id="channel-pic-form" style="display: none;">
                            <input type="file" id="channel-pic-input" name="channel_pic" accept="image/*">
                            <input type="hidden" name="update_image" value="1">
                        </form>
                    <?php endif; ?>
                </div>
                <div class="profile-info">
                    <h1><?php echo $channel['channel_name']; ?></h1>
                    <div class="profile-username">
                        @<?php echo $channel['channel_username'] ?: 'private'; ?>
                    </div>
                    <div class="profile-username">
                        <?php echo ucfirst($channel['visibility']); ?> channel
                    </div>
                    <div class="mt-10">
                        <?php if ($isOwner): ?>
                            <span class="badge badge-primary">Owner</span>
                        <?php elseif ($isAdmin): ?>
                            <span class="badge badge-primary">Admin</span>
                        <?php else: ?>
                            <span class="badge badge-secondary">Subscriber</span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="tabs">
                <div class="tab active" data-tab="about">About</div>
                <div class="tab" data-tab="members">Members</div>
                <?php if ($canManage): ?>
                    <div class="tab" data-tab="manage">Manage</div>
                <?php endif; ?>
            </div>

            <div class="tab-content active" id="about-tab">
                <div class="mt-10">
                    <h3>Channel Info</h3>
                    <p class="mt-10">Created by @<?php echo $channel['creator_name']; ?> on <?php echo date('M j, Y', strtotime($channel['created_at'])); ?></p>
                    <p class="mt-10">Subscribers: <?php echo count($members); ?></p>
                    <p class="mt-10">Content protection: <?php echo !empty($channel['content_protection']) ? 'Enabled' : 'Disabled'; ?></p>
                    <p class="mt-20"><?php echo nl2br($channel['channel_description'] ?? 'No description available.'); ?></p>
                </div>

                <?php if (!$isOwner): ?>
                    <div class="mt-20">
                        <form method="POST" action="" class="mt-20">
                            <input type="hidden" name="leave_channel" value="1">
                            <button type="submit" class="btn btn-secondary" data-confirm="Are you sure you want to leave this channel?">
                                <svg class="icon" aria-hidden="true"><use href="#icon-logout"></use></svg> Leave Channel
                            </button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>

            <div class="tab-content" id="members-tab">
                <div class="mt-10">
                    <h3>Subscribers (<?php echo count($members); ?>)</h3>
                    <div class="contact-list mt-20">
                        <?php foreach ($members as $member): ?>
                            <div class="contact-item">
                                <div class="contact-avatar">
                                    <img src="uploads/images/<?php echo $member['profile_pic'] ?? 'default.png'; ?>" alt="<?php echo $member['username']; ?>" draggable="false">
                                </div>
                                <div class="contact-info">
                                    <div class="contact-name">
                                        <?php echo $member['full_name']; ?>
                                        <span class="status-indicator status-<?php echo $member['status']; ?>"></span>
                                        <?php if ($member['role'] === 'owner'): ?>
                                            <span class="badge badge-primary">Owner</span>
                                        <?php elseif ($member['role'] === 'admin'): ?>
                                            <span class="badge badge-primary">Admin</span>
                                        <?php else: ?>
                                            <span class="badge badge-secondary">Subscriber</span>
                                        <?php endif; ?>
                                    </div>
                                    <div class="contact-status">@<?php echo $member['username']; ?></div>
                                </div>
                                <?php if ($canManage && $member['user_id'] != $userId && $member['role'] !== 'owner'): ?>
                                    <div class="d-flex align-center gap-10">
                                        <form method="POST" action="">
                                            <input type="hidden" name="member_id" value="<?php echo $member['user_id']; ?>">
                                            <input type="hidden" name="update_member_role" value="1">
                                            <?php if ($member['role'] === 'admin'): ?>
                                                <input type="hidden" name="new_role" value="subscriber">
                                                <button type="submit" class="btn btn-secondary">Demote</button>
                                            <?php else: ?>
                                                <input type="hidden" name="new_role" value="admin">
                                                <button type="submit" class="btn btn-secondary">Promote</button>
                                            <?php endif; ?>
                                        </form>
                                        <form method="POST" action="">
                                            <input type="hidden" name="member_id" value="<?php echo $member['user_id']; ?>">
                                            <input type="hidden" name="remove_member" value="1">
                                            <button type="submit" class="btn btn-icon" title="Remove subscriber" data-confirm="Are you sure you want to remove this subscriber?">
                                                <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                                            </button>
                                        </form>
                                    </div>
                                <?php endif; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <?php if ($canManage): ?>
            <div class="tab-content" id="manage-tab">
                <div class="mt-20">
                    <h3>Channel Settings</h3>

                    <form method="POST" action="" class="mt-20">
                        <div class="form-group">
                            <label for="channel_name" class="form-label">Channel Name</label>
                            <input type="text" id="channel_name" name="channel_name" class="form-control" value="<?php echo $channel['channel_name']; ?>" required>
                        </div>

                        <div class="form-group">
                            <label for="channel_description" class="form-label">Channel Description</label>
                            <textarea id="channel_description" name="channel_description" class="form-control" rows="4"><?php echo $channel['channel_description']; ?></textarea>
                        </div>

                        <div class="form-group">
                            <label for="channel_username" class="form-label">Channel ID</label>
                            <input type="text" id="channel_username" name="channel_username" class="form-control" value="<?php echo $channel['channel_username']; ?>">
                            <small>Use letters, numbers, and underscores (4-32 chars).</small>
                        </div>

                        <div class="form-group">
                            <label for="visibility" class="form-label">Visibility</label>
                            <select id="visibility" name="visibility" class="form-control">
                                <option value="public" <?php echo ($channel['visibility'] ?? 'public') === 'public' ? 'selected' : ''; ?>>Public</option>
                                <option value="private" <?php echo ($channel['visibility'] ?? 'public') === 'private' ? 'selected' : ''; ?>>Private</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Content Protection</label>
                            <label class="pill-option">
                                <input type="checkbox" name="content_protection" <?php echo !empty($channel['content_protection']) ? 'checked' : ''; ?>>
                                <span>Disable forwarding, saving, and copying</span>
                            </label>
                        </div>

                        <input type="hidden" name="update_channel" value="1">
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </form>

                    <div class="mt-40">
                        <h3>Add Subscribers</h3>

                        <form method="POST" action="" class="mt-20">
                            <div class="form-group">
                                <label for="user_search" class="form-label">Search for users:</label>
                                <input type="text" id="user_search" class="form-control" placeholder="Type username or email...">
                            </div>

                            <div id="user-search-results" class="mt-10">
                                <!-- User search results will be displayed here -->
                            </div>

                            <div id="selected-user" class="mt-10" style="display: none;">
                                <div class="form-group">
                                    <label for="role" class="form-label">Role:</label>
                                    <select id="role" name="role" class="form-control">
                                        <option value="subscriber">Subscriber</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>

                                <input type="hidden" id="user_id" name="user_id" value="">
                                <input type="hidden" name="add_member" value="1">
                                <button type="submit" class="btn btn-primary">Add to Channel</button>
                            </div>
                        </form>
                    </div>

                    <div class="mt-40">
                        <h3>Admin Permissions</h3>
                        <p class="mt-10">Control what each admin can do.</p>
                        <div class="contact-list mt-20">
                            <?php foreach ($members as $member): ?>
                                <?php if ($member['role'] === 'admin' || $member['role'] === 'owner'): ?>
                                    <?php
                                        $permRow = $adminPermissionsMap[(int) $member['user_id']] ?? [
                                            'can_post' => 1,
                                            'can_edit' => 1,
                                            'can_delete' => 1,
                                            'can_pin' => 1,
                                            'can_manage' => 1
                                        ];
                                    ?>
                                    <div class="contact-item">
                                        <div class="contact-avatar">
                                            <img src="uploads/images/<?php echo $member['profile_pic'] ?? 'default.png'; ?>" alt="<?php echo $member['username']; ?>" draggable="false">
                                        </div>
                                        <div class="contact-info">
                                            <div class="contact-name">
                                                <?php echo $member['full_name']; ?>
                                                <?php if ($member['role'] === 'owner'): ?>
                                                    <span class="badge badge-primary">Owner</span>
                                                <?php else: ?>
                                                    <span class="badge badge-primary">Admin</span>
                                                <?php endif; ?>
                                            </div>
                                            <div class="contact-status">@<?php echo $member['username']; ?></div>
                                        </div>
                                        <?php if ($member['role'] !== 'owner'): ?>
                                            <form method="POST" action="" class="glass-card" style="padding: 12px; min-width: 240px;">
                                                <input type="hidden" name="admin_id" value="<?php echo $member['user_id']; ?>">
                                                <input type="hidden" name="update_admin_permissions" value="1">
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_post" <?php echo !empty($permRow['can_post']) ? 'checked' : ''; ?>>
                                                    <span>Post messages</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_edit" <?php echo !empty($permRow['can_edit']) ? 'checked' : ''; ?>>
                                                    <span>Edit posts</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_delete" <?php echo !empty($permRow['can_delete']) ? 'checked' : ''; ?>>
                                                    <span>Delete posts</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_pin" <?php echo !empty($permRow['can_pin']) ? 'checked' : ''; ?>>
                                                    <span>Pin posts</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_manage" <?php echo !empty($permRow['can_manage']) ? 'checked' : ''; ?>>
                                                    <span>Manage channel</span>
                                                </label>
                                                <button type="submit" class="btn btn-secondary" style="margin-top: 8px;">Save</button>
                                            </form>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </div>
                    </div>

                    <?php if ($isOwner): ?>
                    <div class="mt-40">
                        <h3>Delete Channel</h3>
                        <p class="mt-10">This permanently removes the channel and all posts.</p>
                        <form method="POST" action="" class="mt-20">
                            <input type="hidden" name="delete_channel" value="1">
                            <button type="submit" class="btn btn-secondary" data-confirm="Delete this channel permanently?">
                                <svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg> Delete Channel
                            </button>
                        </form>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <script nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES); ?>">
        document.getElementById('user-menu-toggle').addEventListener('click', () => {
            document.querySelector('.user-menu-dropdown').classList.toggle('active');
        });

        document.querySelectorAll('[data-confirm]').forEach((button) => {
            button.addEventListener('click', async (event) => {
                const message = button.dataset.confirm;
                if (message && !button.dataset.confirmed) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const confirmed = window.showInAppConfirm
                        ? await window.showInAppConfirm(message, 'Confirm Action', 'Confirm', 'Cancel')
                        : true;
                    if (confirmed) {
                        button.dataset.confirmed = '1';
                        button.click();
                        setTimeout(() => delete button.dataset.confirmed, 500);
                    }
                }
            });
        });

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const parent = this.closest('.tabs').parentElement;
                parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabId = this.getAttribute('data-tab');
                parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                parent.querySelector(`#${tabId}-tab`).classList.add('active');
            });
        });

        <?php if ($canManage): ?>
        const maxUploadBytes = <?php echo (int) (defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024)); ?>;
        const maxUploadLabel = `Max upload size is ${Math.round(maxUploadBytes / (1024 * 1024))} MB`;
        const memberIds = <?php echo json_encode(array_map(function($m) { return $m['user_id']; }, $members)); ?>;
        const searchUserCache = new Map();
        const resultsContainer = document.getElementById('user-search-results');

        const showInlineError = (message) => {
            let errorBox = document.querySelector('.form-error');
            if (!errorBox) {
                errorBox = document.createElement('div');
                errorBox.className = 'form-error mb-20';
                const card = document.querySelector('.glass-card');
                if (card) {
                    card.insertBefore(errorBox, card.firstChild);
                }
            }
            if (errorBox) {
                errorBox.textContent = message;
            }
        };

        document.getElementById('channel-pic-input').addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file && file.size > maxUploadBytes) {
                showInlineError(maxUploadLabel);
                event.target.value = '';
                return;
            }
            document.getElementById('channel-pic-form').submit();
        });

        resultsContainer.addEventListener('click', (event) => {
            const item = event.target.closest('.contact-item[data-user-id]');
            if (!item || item.dataset.disabled === '1') {
                return;
            }
            const userId = parseInt(item.dataset.userId, 10);
            const user = searchUserCache.get(userId);
            if (!user) {
                return;
            }
            selectUser(userId, user.username || '');
        });

        document.getElementById('user_search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();

            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                document.getElementById('selected-user').style.display = 'none';
                searchUserCache.clear();
                return;
            }

            window.ApiClient.fetch('search_users', undefined, { term: searchTerm })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.users.length > 0) {
                        let html = '<div class="contact-list">';
                        searchUserCache.clear();

                        data.users.forEach(user => {
                            const isMember = memberIds.includes(user.user_id);
                            searchUserCache.set(user.user_id, user);

                            html += `
                                <div class="contact-item ${isMember ? 'opacity-50' : ''}" data-user-id="${user.user_id}" data-disabled="${isMember ? '1' : '0'}">
                                    <div class="contact-avatar">
                                        <img src="uploads/images/${user.profile_pic || 'default.png'}" alt="${user.username}" draggable="false">
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${user.full_name}
                                            <span class="status-indicator status-${user.status}"></span>
                                        </div>
                                        <div class="contact-status">@${user.username}</div>
                                    </div>
                                    ${isMember ? '<span class="badge badge-secondary">Already subscriber</span>' : ''}
                                </div>
                            `;
                        });

                        html += '</div>';
                        resultsContainer.innerHTML = html;
                    } else {
                        resultsContainer.innerHTML = '<p>No users found</p>';
                        searchUserCache.clear();
                    }
                })
                .catch(error => {
                    resultsContainer.innerHTML = '<p>Error searching users</p>';
                    searchUserCache.clear();
                });
        });

        function selectUser(userId, username) {
            document.getElementById('user_id').value = userId;
            document.getElementById('selected-user').style.display = 'block';
            document.getElementById('user-search-results').innerHTML =
                `<p>Selected user: <strong>${username}</strong></p>`;
        }
        <?php endif; ?>
    </script>
</body>
</html>

