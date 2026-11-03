<?php
require_once 'includes/config.php';
require_once 'includes/functions.php';
require_once 'includes/auth.php';
require_once 'includes/chat_functions.php';

// Check if user is logged in
if (!Auth::isLoggedIn()) {
    redirect('login');
}

// Get current user data
$currentUser = Auth::getCurrentUser();
$userId = $currentUser['user_id'];

// Check if group ID is provided
if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    redirect('chat');
}

$groupId = (int) $_GET['id'];

// Get group details
$stmt = $conn->prepare("
    SELECT g.*, u.username as creator_name 
    FROM groups g
    JOIN users u ON g.created_by = u.user_id
    WHERE g.group_id = ?
");
$stmt->bind_param("i", $groupId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    redirect('chat');
}

$group = $result->fetch_assoc();

// Check if user is member of this group
$memberStmt = $conn->prepare("
    SELECT role FROM group_members 
    WHERE group_id = ? AND user_id = ?
");
$memberStmt->bind_param("ii", $groupId, $userId);
$memberStmt->execute();
$memberResult = $memberStmt->get_result();

if ($memberResult->num_rows === 0) {
    redirect('chat');
}

$membership = $memberResult->fetch_assoc();
$role = $membership['role'] ?? 'member';
$isOwner = ($role === 'owner');
$isAdmin = ($role === 'admin' || $isOwner);

$permissions = [
    'can_send_messages' => 1,
    'can_send_media' => 1,
    'can_pin_messages' => $isAdmin ? 1 : 0,
    'can_add_users' => $isAdmin ? 1 : 0,
    'can_remove_users' => $isAdmin ? 1 : 0,
    'can_change_info' => $isAdmin ? 1 : 0
];
if ($isOwner) {
    $permissions = [
        'can_send_messages' => 1,
        'can_send_media' => 1,
        'can_pin_messages' => 1,
        'can_add_users' => 1,
        'can_remove_users' => 1,
        'can_change_info' => 1
    ];
} elseif ($role === 'admin') {
    $permStmt = $conn->prepare(
        "SELECT can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info
         FROM group_admin_permissions WHERE group_id = ? AND user_id = ?"
    );
    $permStmt->bind_param("ii", $groupId, $userId);
    $permStmt->execute();
    $permResult = $permStmt->get_result();
    if ($permRow = $permResult->fetch_assoc()) {
        $permissions = [
            'can_send_messages' => (int) $permRow['can_send_messages'],
            'can_send_media' => (int) $permRow['can_send_media'],
            'can_pin_messages' => (int) $permRow['can_pin_messages'],
            'can_add_users' => (int) $permRow['can_add_users'],
            'can_remove_users' => (int) $permRow['can_remove_users'],
            'can_change_info' => (int) $permRow['can_change_info']
        ];
    }
}

// Get all members
$membersStmt = $conn->prepare("
    SELECT gm.*, u.username, u.full_name, u.profile_pic, u.status
    FROM group_members gm
    JOIN users u ON gm.user_id = u.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.role = 'admin' DESC, u.full_name ASC
");
$membersStmt->bind_param("i", $groupId);
$membersStmt->execute();
$membersResult = $membersStmt->get_result();
$members = [];

while ($member = $membersResult->fetch_assoc()) {
    $members[] = $member;
}

$error = '';
$success = '';

// Process add member form
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_member']) && !empty($permissions['can_add_users'])) {
    $newMemberId = (int) $_POST['user_id'];
    $role = sanitize($_POST['role']);
    
    if (!in_array($role, ['admin', 'member'])) {
        $role = 'member';
    }
    
    $result = Chat::addGroupMember($groupId, $newMemberId, $role, $userId, $conn);
    
    if ($result['success']) {
        $success = 'Member added successfully';
        
        // Refresh members list
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

// Process remove member form
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['remove_member']) && !empty($permissions['can_remove_users'])) {
    $removeMemberId = (int) $_POST['member_id'];
    
    // Check if trying to remove group creator
    $creatorCheck = $conn->prepare("SELECT created_by FROM groups WHERE group_id = ?");
    $creatorCheck->bind_param("i", $groupId);
    $creatorCheck->execute();
    $creatorResult = $creatorCheck->get_result();
    $creator = $creatorResult->fetch_assoc();
    
    if ($removeMemberId == $creator['created_by']) {
        $error = 'You cannot remove the group owner';
    } else {
        $stmt = $conn->prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?");
        $stmt->bind_param("ii", $groupId, $removeMemberId);
        
        if ($stmt->execute()) {
            $success = 'Member removed successfully';
            
            // Refresh members list
            $membersStmt->execute();
            $membersResult = $membersStmt->get_result();
            $members = [];
            
            while ($member = $membersResult->fetch_assoc()) {
                $members[] = $member;
            }
        } else {
            $error = 'Failed to remove member: ' . $conn->error;
        }
    }
}

// Process role updates
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_member_role']) && !empty($permissions['can_change_info'])) {
    $memberId = (int) $_POST['member_id'];
    $newRole = sanitize($_POST['new_role']);
    if (!in_array($newRole, ['admin', 'member'], true)) {
        $newRole = 'member';
    }
    if ($memberId === (int) $group['created_by']) {
        $error = 'You cannot change the owner role';
    } else {
        $stmt = $conn->prepare("UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?");
        $stmt->bind_param("sii", $newRole, $groupId, $memberId);
        if ($stmt->execute()) {
            if ($newRole === 'admin') {
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
                $permStmt->bind_param("ii", $groupId, $memberId);
                $permStmt->execute();
            } else {
                $permStmt = $conn->prepare("DELETE FROM group_admin_permissions WHERE group_id = ? AND user_id = ?");
                $permStmt->bind_param("ii", $groupId, $memberId);
                $permStmt->execute();
            }
            $success = 'Member role updated successfully';
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

// Process admin permission updates
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_admin_permissions']) && !empty($permissions['can_change_info'])) {
    $adminId = (int) $_POST['admin_id'];
    if ($adminId === (int) $group['created_by']) {
        $error = 'Owner permissions cannot be changed';
    } else {
        $permSendMessages = isset($_POST['perm_send_messages']) ? 1 : 0;
        $permSendMedia = isset($_POST['perm_send_media']) ? 1 : 0;
        $permPin = isset($_POST['perm_pin_messages']) ? 1 : 0;
        $permAdd = isset($_POST['perm_add_users']) ? 1 : 0;
        $permRemove = isset($_POST['perm_remove_users']) ? 1 : 0;
        $permChange = isset($_POST['perm_change_info']) ? 1 : 0;

        $permStmt = $conn->prepare(
            "INSERT INTO group_admin_permissions
                (group_id, user_id, can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                can_send_messages = VALUES(can_send_messages),
                can_send_media = VALUES(can_send_media),
                can_pin_messages = VALUES(can_pin_messages),
                can_add_users = VALUES(can_add_users),
                can_remove_users = VALUES(can_remove_users),
                can_change_info = VALUES(can_change_info)"
        );
        $permStmt->bind_param(
            "iiiiiiii",
            $groupId,
            $adminId,
            $permSendMessages,
            $permSendMedia,
            $permPin,
            $permAdd,
            $permRemove,
            $permChange
        );
        if ($permStmt->execute()) {
            $success = 'Admin permissions updated';
        } else {
            $error = 'Failed to update permissions';
        }
    }
}

// Process update group info
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_group']) && !empty($permissions['can_change_info'])) {
    $groupName = sanitize($_POST['group_name']);
    $groupDescription = sanitize($_POST['group_description']);
    $groupUsername = sanitize($_POST['group_username']);
    $joinPolicy = sanitize($_POST['join_policy']);
    $contentProtection = isset($_POST['content_protection']) ? 1 : 0;
    $slowModeSeconds = isset($_POST['slow_mode_seconds']) ? (int) $_POST['slow_mode_seconds'] : 0;
    $slowModeAdminExempt = isset($_POST['slow_mode_admin_exempt']) ? 1 : 0;
    $allowedSlowModes = [0, 10, 30, 60, 300, 900];
    if (!in_array($slowModeSeconds, $allowedSlowModes, true)) {
        $slowModeSeconds = 0;
    }
    
    if (empty($groupName)) {
        $error = 'Group name cannot be empty';
    } else {
        $groupUsername = trim($groupUsername);
        if (!empty($groupUsername) && !preg_match('/^[a-zA-Z0-9_]{4,32}$/', $groupUsername)) {
            $error = 'Invalid group ID format';
        } else {
            $joinPolicy = in_array($joinPolicy, ['invite', 'public'], true) ? $joinPolicy : 'invite';
            if (!empty($groupUsername)) {
                $checkStmt = $conn->prepare("SELECT group_id FROM groups WHERE group_username = ? AND group_id != ?");
                $checkStmt->bind_param("si", $groupUsername, $groupId);
                $checkStmt->execute();
                $checkResult = $checkStmt->get_result();
                if ($checkResult->num_rows > 0) {
                    $error = 'Group ID is already taken';
                }
            }
        }
    }
    
    if (empty($error)) {
        $stmt = $conn->prepare("UPDATE groups SET group_name = ?, group_description = ?, group_username = ?, join_policy = ?, content_protection = ?, slow_mode_seconds = ?, slow_mode_admin_exempt = ? WHERE group_id = ?");
        $stmt->bind_param("ssssiiii", $groupName, $groupDescription, $groupUsername, $joinPolicy, $contentProtection, $slowModeSeconds, $slowModeAdminExempt, $groupId);
        
        if ($stmt->execute()) {
            $success = 'Group information updated successfully';
            
            // Refresh group data
            $stmt = $conn->prepare("
                SELECT g.*, u.username as creator_name 
                FROM groups g
                JOIN users u ON g.created_by = u.user_id
                WHERE g.group_id = ?
            ");
            $stmt->bind_param("i", $groupId);
            $stmt->execute();
            $group = $stmt->get_result()->fetch_assoc();
        } else {
            $error = 'Failed to update group: ' . $conn->error;
        }
    }
}

// Process group image update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_image']) && !empty($permissions['can_change_info'])) {
    $maxBytes = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);
    if (lc_upload_request_too_large($maxBytes)) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif (!isset($_FILES['group_pic'])) {
        $error = 'No image selected or upload error';
    } elseif (lc_is_upload_error_too_large($_FILES['group_pic']['error'])) {
        $error = lc_get_upload_limit_error($maxBytes);
    } elseif ($_FILES['group_pic']['error'] !== UPLOAD_ERR_OK) {
        $error = 'No image selected or upload error';
    } else {
        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        $filename = $_FILES['group_pic']['name'];
        $ext = pathinfo($filename, PATHINFO_EXTENSION);

        if (in_array(strtolower($ext), $allowed, true)) {
            if ($_FILES['group_pic']['size'] <= $maxBytes) {
                $newFilename = 'group_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
                $uploadPath = IMAGE_UPLOAD_DIR . $newFilename;

                if (move_uploaded_file($_FILES['group_pic']['tmp_name'], $uploadPath)) {
                    $stmt = $conn->prepare("UPDATE groups SET group_pic = ? WHERE group_id = ?");
                    $stmt->bind_param("si", $newFilename, $groupId);

                    if ($stmt->execute()) {
                        $success = 'Group picture updated successfully';

                        $stmt = $conn->prepare("
                            SELECT g.*, u.username as creator_name
                            FROM groups g
                            JOIN users u ON g.created_by = u.user_id
                            WHERE g.group_id = ?
                        ");
                        $stmt->bind_param("i", $groupId);
                        $stmt->execute();
                        $group = $stmt->get_result()->fetch_assoc();
                    } else {
                        $error = 'Failed to update group picture: ' . $conn->error;
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

// Process member messaging permissions
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_member_permissions']) && !empty($permissions['can_change_info'])) {
    $memberId = (int) $_POST['member_id'];
    if ($memberId === (int) $group['created_by']) {
        $error = 'Owner permissions cannot be changed';
    } else {
        $targetRole = null;
        foreach ($members as $member) {
            if ((int) $member['user_id'] === $memberId) {
                $targetRole = $member['role'];
                break;
            }
        }
        if ($targetRole !== 'member') {
            $error = 'Only member permissions can be updated';
        } else {
            $permSendMessages = isset($_POST['perm_send_messages']) ? 1 : 0;
            $permSendMedia = isset($_POST['perm_send_media']) ? 1 : 0;
            $permStmt = $conn->prepare(
                "INSERT INTO group_admin_permissions
                    (group_id, user_id, can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info)
                 VALUES (?, ?, ?, ?, 0, 0, 0, 0)
                 ON DUPLICATE KEY UPDATE
                    can_send_messages = VALUES(can_send_messages),
                    can_send_media = VALUES(can_send_media)"
            );
            $permStmt->bind_param("iiii", $groupId, $memberId, $permSendMessages, $permSendMedia);
            if ($permStmt->execute()) {
                $success = 'Member permissions updated';
            } else {
                $error = 'Failed to update member permissions';
            }
        }
    }
}

// Process delete group
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_group']) && $isOwner) {
    $stmt = $conn->prepare("DELETE FROM groups WHERE group_id = ? AND created_by = ?");
    $stmt->bind_param("ii", $groupId, $userId);
    if ($stmt->execute()) {
        redirect('chat');
    } else {
        $error = 'Failed to delete group';
    }
}

$adminPermissionsMap = [];
$permLookup = $conn->prepare(
    "SELECT user_id, can_send_messages, can_send_media, can_pin_messages, can_add_users, can_remove_users, can_change_info
     FROM group_admin_permissions WHERE group_id = ?"
);
$permLookup->bind_param("i", $groupId);
$permLookup->execute();
$permResult = $permLookup->get_result();
while ($row = $permResult->fetch_assoc()) {
    $adminPermissionsMap[(int) $row['user_id']] = $row;
}

// Process leave group
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['leave_group'])) {
    // Check if trying to leave as creator
    if ($userId == $group['created_by']) {
        $error = 'As the creator, you cannot leave the group. Transfer ownership first.';
    } else {
        $stmt = $conn->prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?");
        $stmt->bind_param("ii", $groupId, $userId);
        
        if ($stmt->execute()) {
            $success = 'You have left the group';
            header('refresh:2;url=chat');
        } else {
            $error = 'Failed to leave group: ' . $conn->error;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?php echo $group['group_name']; ?> - Liquid Chat</title>
    <script src="js/theme.js"></script>
    <script src="js/api-client.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="page-surface group-page" data-app-shell="1">
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
                    <img src="uploads/images/<?php echo $group['group_pic'] ?? 'default_group.png'; ?>" alt="<?php echo $group['group_name']; ?>" draggable="false">
                    <?php if ($isAdmin): ?>
                        <label for="group-pic-input" class="avatar-edit">
                            <svg class="icon" aria-hidden="true"><use href="#icon-camera"></use></svg>
                        </label>
                        <form method="POST" enctype="multipart/form-data" id="group-pic-form" style="display: none;">
                            <input type="file" id="group-pic-input" name="group_pic" accept="image/*">
                            <input type="hidden" name="update_image" value="1">
                        </form>
                    <?php endif; ?>
                </div>
                <div class="profile-info">
                    <h1><?php echo $group['group_name']; ?></h1>
                    <div class="profile-username">
                        Created by @<?php echo $group['creator_name']; ?>
                        on <?php echo date('M j, Y', strtotime($group['created_at'])); ?>
                    </div>
                    <div class="profile-username">
                        Group ID: <?php echo !empty($group['group_username']) ? '@' . $group['group_username'] : 'Invite only'; ?>
                        &nbsp;|&nbsp;
                        Join: <?php echo ucfirst($group['join_policy'] ?? 'invite'); ?>
                    </div>
                    <div class="mt-10">
                        <?php echo count($members); ?> members
                        <?php if ($isOwner): ?>
                            <span class="badge badge-primary">Owner</span>
                        <?php elseif ($isAdmin): ?>
                            <span class="badge badge-primary">Admin</span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            
            <div class="tabs">
                <div class="tab active" data-tab="info">Group Info</div>
                <div class="tab" data-tab="members">Members</div>
                <?php if ($isAdmin): ?>
                <div class="tab" data-tab="manage">Manage</div>
                <?php endif; ?>
            </div>
            
            <div class="tab-content active" id="info-tab">
                <div class="mt-20">
                    <h3>Description</h3>
                    <p class="mt-10"><?php echo nl2br($group['group_description'] ?? 'No description available.'); ?></p>
                </div>
                
                <div class="mt-20">
                    <form method="POST" action="" class="mt-20">
                        <input type="hidden" name="leave_group" value="1">
                        <button type="submit" class="btn btn-secondary" data-confirm="Are you sure you want to leave this group?">
                            <svg class="icon" aria-hidden="true"><use href="#icon-logout"></use></svg> Leave Group
                        </button>
                    </form>
                </div>
            </div>
            
            <div class="tab-content" id="members-tab">
                <div class="mt-10">
                    <h3>Group Members (<?php echo count($members); ?>)</h3>
                    
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
                                            <span class="badge badge-secondary">Member</span>
                                        <?php endif; ?>
                                    </div>
                                    <div class="contact-status">@<?php echo $member['username']; ?></div>
                                </div>
                                <?php if ($permissions['can_change_info'] && $member['user_id'] != $userId && $member['role'] !== 'owner'): ?>
                                    <div class="d-flex align-center gap-10">
                                        <form method="POST" action="">
                                            <input type="hidden" name="member_id" value="<?php echo $member['user_id']; ?>">
                                            <input type="hidden" name="update_member_role" value="1">
                                            <?php if ($member['role'] === 'admin'): ?>
                                                <input type="hidden" name="new_role" value="member">
                                                <button type="submit" class="btn btn-secondary">Demote</button>
                                            <?php else: ?>
                                                <input type="hidden" name="new_role" value="admin">
                                                <button type="submit" class="btn btn-secondary">Promote</button>
                                            <?php endif; ?>
                                        </form>
                                        <?php if ($permissions['can_remove_users']): ?>
                                            <form method="POST" action="">
                                                <input type="hidden" name="member_id" value="<?php echo $member['user_id']; ?>">
                                                <input type="hidden" name="remove_member" value="1">
                                                <button type="submit" class="btn btn-icon" title="Remove from group" data-confirm="Are you sure you want to remove this member?">
                                                    <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
                                                </button>
                                            </form>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
            
            <?php if ($isAdmin): ?>
            <div class="tab-content" id="manage-tab">
                <div class="mt-20">
                    <h3>Group Settings</h3>
                    
                    <form method="POST" action="" class="mt-20">
                        <div class="form-group">
                            <label for="group_name" class="form-label">Group Name</label>
                            <input type="text" id="group_name" name="group_name" class="form-control" value="<?php echo $group['group_name']; ?>" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="group_description" class="form-label">Group Description</label>
                            <textarea id="group_description" name="group_description" class="form-control" rows="4"><?php echo $group['group_description']; ?></textarea>
                        </div>

                        <div class="form-group">
                            <label for="group_username" class="form-label">Group ID</label>
                            <input type="text" id="group_username" name="group_username" class="form-control" value="<?php echo $group['group_username']; ?>">
                            <small>Use letters, numbers, and underscores (4-32 chars).</small>
                        </div>

                        <div class="form-group">
                            <label for="join_policy" class="form-label">Join Policy</label>
                            <select id="join_policy" name="join_policy" class="form-control">
                                <option value="invite" <?php echo ($group['join_policy'] ?? 'invite') === 'invite' ? 'selected' : ''; ?>>Invite Only</option>
                                <option value="public" <?php echo ($group['join_policy'] ?? 'invite') === 'public' ? 'selected' : ''; ?>>Public by ID</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Content Protection</label>
                            <label class="pill-option">
                                <input type="checkbox" name="content_protection" <?php echo !empty($group['content_protection']) ? 'checked' : ''; ?>>
                                <span>Disable forwarding, saving, and copying</span>
                            </label>
                        </div>

                        <div class="form-group">
                            <label for="slow_mode_seconds" class="form-label">Slow Mode</label>
                            <select id="slow_mode_seconds" name="slow_mode_seconds" class="form-control">
                                <?php
                                    $slowOptions = [0 => 'Off', 10 => '10 seconds', 30 => '30 seconds', 60 => '1 minute', 300 => '5 minutes', 900 => '15 minutes'];
                                    $currentSlow = (int) ($group['slow_mode_seconds'] ?? 0);
                                    foreach ($slowOptions as $value => $label):
                                ?>
                                    <option value="<?php echo $value; ?>" <?php echo $currentSlow === $value ? 'selected' : ''; ?>><?php echo $label; ?></option>
                                <?php endforeach; ?>
                            </select>
                            <small>Limits how often members can send messages.</small>
                        </div>

                        <div class="form-group">
                            <label class="pill-option">
                                <input type="checkbox" name="slow_mode_admin_exempt" <?php echo !empty($group['slow_mode_admin_exempt']) ? 'checked' : ''; ?>>
                                <span>Admins are exempt from slow mode</span>
                            </label>
                        </div>
                        
                        <input type="hidden" name="update_group" value="1">
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </form>
                    
                    <div class="mt-40">
                        <h3>Add Members</h3>
                        
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
                                        <option value="member">Member</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                
                                <input type="hidden" id="user_id" name="user_id" value="">
                                <input type="hidden" name="add_member" value="1">
                                <button type="submit" class="btn btn-primary">Add to Group</button>
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
                                            'can_send_messages' => 1,
                                            'can_send_media' => 1,
                                            'can_pin_messages' => 1,
                                            'can_add_users' => 1,
                                            'can_remove_users' => 1,
                                            'can_change_info' => 1
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
                                        <?php if ($permissions['can_change_info'] && $member['role'] !== 'owner'): ?>
                                            <form method="POST" action="" class="glass-card" style="padding: 12px; min-width: 240px;">
                                                <input type="hidden" name="admin_id" value="<?php echo $member['user_id']; ?>">
                                                <input type="hidden" name="update_admin_permissions" value="1">
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_send_messages" <?php echo !empty($permRow['can_send_messages']) ? 'checked' : ''; ?>>
                                                    <span>Send messages</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_send_media" <?php echo !empty($permRow['can_send_media']) ? 'checked' : ''; ?>>
                                                    <span>Send media</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_pin_messages" <?php echo !empty($permRow['can_pin_messages']) ? 'checked' : ''; ?>>
                                                    <span>Pin messages</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_add_users" <?php echo !empty($permRow['can_add_users']) ? 'checked' : ''; ?>>
                                                    <span>Add users</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_remove_users" <?php echo !empty($permRow['can_remove_users']) ? 'checked' : ''; ?>>
                                                    <span>Remove users</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_change_info" <?php echo !empty($permRow['can_change_info']) ? 'checked' : ''; ?>>
                                                    <span>Change group info</span>
                                                </label>
                                                <button type="submit" class="btn btn-secondary" style="margin-top: 8px;">Save</button>
                                            </form>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </div>
                    </div>

                    <div class="mt-40">
                        <h3>Member Permissions</h3>
                        <p class="mt-10">Choose what members can send.</p>
                        <div class="contact-list mt-20">
                            <?php foreach ($members as $member): ?>
                                <?php if ($member['role'] === 'member'): ?>
                                    <?php
                                        $permRow = $adminPermissionsMap[(int) $member['user_id']] ?? [
                                            'can_send_messages' => 1,
                                            'can_send_media' => 1
                                        ];
                                    ?>
                                    <div class="contact-item">
                                        <div class="contact-avatar">
                                            <img src="uploads/images/<?php echo $member['profile_pic'] ?? 'default.png'; ?>" alt="<?php echo $member['username']; ?>" draggable="false">
                                        </div>
                                        <div class="contact-info">
                                            <div class="contact-name">
                                                <?php echo $member['full_name']; ?>
                                                <span class="badge badge-secondary">Member</span>
                                            </div>
                                            <div class="contact-status">@<?php echo $member['username']; ?></div>
                                        </div>
                                        <?php if ($permissions['can_change_info']): ?>
                                            <form method="POST" action="" class="glass-card" style="padding: 12px; min-width: 220px;">
                                                <input type="hidden" name="member_id" value="<?php echo $member['user_id']; ?>">
                                                <input type="hidden" name="update_member_permissions" value="1">
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_send_messages" <?php echo !empty($permRow['can_send_messages']) ? 'checked' : ''; ?>>
                                                    <span>Send messages</span>
                                                </label>
                                                <label class="pill-option" style="margin-bottom: 8px;">
                                                    <input type="checkbox" name="perm_send_media" <?php echo !empty($permRow['can_send_media']) ? 'checked' : ''; ?>>
                                                    <span>Send media</span>
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
                        <h3>Delete Group</h3>
                        <p class="mt-10">This permanently removes the group and all messages.</p>
                        <form method="POST" action="" class="mt-20">
                            <input type="hidden" name="delete_group" value="1">
                            <button type="submit" class="btn btn-secondary" data-confirm="Delete this group permanently?">
                                <svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg> Delete Group
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
        // Toggle user menu dropdown
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
        
        <?php if ($isAdmin): ?>
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

        // Auto-submit group pic form when file is selected
        document.getElementById('group-pic-input').addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file && file.size > maxUploadBytes) {
                showInlineError(maxUploadLabel);
                event.target.value = '';
                return;
            }
            document.getElementById('group-pic-form').submit();
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
        
        // User search for adding members
        document.getElementById('user_search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                document.getElementById('selected-user').style.display = 'none';
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
                            const isMember = memberIds.includes(user.user_id);
                            searchUserCache.set(user.user_id, user);
                            
                            html += `
                                <div class="contact-item ${isMember ? 'opacity-50' : ''}" data-user-id="${user.user_id}" data-disabled="${isMember ? '1' : '0'}">
                                    <div class="contact-avatar">
                                        <img src="uploads/images/${user.profile_pic || 'default.png'}" draggable="false" 
                                             alt="${user.username}">
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${user.full_name}
                                            <span class="status-indicator status-${user.status}"></span>
                                        </div>
                                        <div class="contact-status">@${user.username}</div>
                                    </div>
                                    ${isMember ? '<span class="badge badge-secondary">Already member</span>' : ''}
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
        
        // Select user to add
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

