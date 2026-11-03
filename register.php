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

// Check if user is already logged in
if (Auth::isLoggedIn()) {
    redirect('chat');
}

$error = '';
$success = '';

// Process registration form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fullName = sanitize($_POST['full_name'] ?? '');
    $username = sanitize($_POST['username'] ?? '');
    $email = sanitize($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirmPassword = $_POST['confirm_password'] ?? '';
    
    // Validate password match
    if ($password !== $confirmPassword) {
        $error = 'Passwords do not match';
    } else {
        // Attempt registration
        $result = Auth::register($email, $username, $password, $fullName, $conn);
        
        if ($result['success']) {
            $success = 'Registration successful! You can now login.';
            header('refresh:2;url=login');
        } else {
            $error = $result['message'];
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Register - Liquid Chat</title>
    <script src="js/theme.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/telegram-z.css">
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="favicon.ico">
    <?php include 'includes/pwa_head.php'; ?>
</head>
<body class="auth-page">
    <div class="auth-page-wrapper">
        <!-- Floating Ambient 60fps Mesh Orbs -->
        <div class="auth-ambient-blobs" aria-hidden="true">
            <div class="auth-blob auth-blob-1"></div>
            <div class="auth-blob auth-blob-2"></div>
            <div class="auth-blob auth-blob-3"></div>
        </div>

        <!-- Top Right Theme Switcher -->
        <div class="auth-top-actions">
            <button type="button" class="auth-theme-btn" id="auth-theme-toggle" title="Toggle Theme">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                <span id="auth-theme-label">Theme</span>
            </button>
        </div>

        <!-- Glass Auth Card (Wide Responsive 2-Column Grid) -->
        <div class="auth-card-modern auth-card-wide">
            <div class="auth-header-modern" style="margin-bottom: 18px;">
                <div class="auth-logo-badge">
                    <img src="assets/logo.svg" alt="Liquid Chat Logo">
                </div>
                <h1 class="auth-title-modern">Create Account</h1>
                <p class="auth-sub-modern">Join Liquid Chat in seconds</p>
            </div>
            
            <?php if ($error): ?>
                <div class="form-error">
                    <?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?>
                </div>
            <?php endif; ?>
            
            <?php if ($success): ?>
                <div class="form-success">
                    <?php echo htmlspecialchars($success, ENT_QUOTES, 'UTF-8'); ?>
                </div>
            <?php endif; ?>
            
            <form method="POST" action="" id="register-form">
                <div class="auth-grid-2col">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label for="full_name" class="form-label" style="font-size: 13px;">Full Name</label>
                        <div class="input-icon-wrap">
                            <svg class="input-icon-left" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <input type="text" id="full_name" name="full_name" class="form-control" placeholder="John Doe" required autocomplete="name" autofocus>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label for="username" class="form-label" style="font-size: 13px;">Username</label>
                        <div class="input-icon-wrap">
                            <svg class="input-icon-left" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
                            <input type="text" id="username" name="username" class="form-control" placeholder="johndoe" required autocomplete="username">
                        </div>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: 12px;">
                    <label for="email" class="form-label" style="font-size: 13px;">Email Address</label>
                    <div class="input-icon-wrap">
                        <svg class="input-icon-left" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <input type="email" id="email" name="email" class="form-control" placeholder="you@example.com" required autocomplete="email">
                    </div>
                </div>
                
                <div class="auth-grid-2col">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label for="password" class="form-label" style="font-size: 13px;">Password</label>
                        <div class="input-icon-wrap has-action">
                            <svg class="input-icon-left" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            <input type="password" id="password" name="password" class="form-control" placeholder="Min 8 chars" pattern=".{8,}" title="At least 8 characters" required autocomplete="new-password">
                            <button type="button" class="btn-toggle-password" data-target="password" title="Show/Hide Password" tabindex="-1">
                                <svg class="eye-open" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <svg class="eye-closed" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" style="display: none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label for="confirm_password" class="form-label" style="font-size: 13px;">Confirm Password</label>
                        <div class="input-icon-wrap has-action">
                            <svg class="input-icon-left" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            <input type="password" id="confirm_password" name="confirm_password" class="form-control" placeholder="Re-enter password" required autocomplete="new-password">
                            <button type="button" class="btn-toggle-password" data-target="confirm_password" title="Show/Hide Password" tabindex="-1">
                                <svg class="eye-open" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <svg class="eye-closed" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" style="display: none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="form-group" style="font-size: 13px; margin: 10px 0 18px;">
                    <label style="cursor: pointer; display: inline-flex; align-items: flex-start; gap: 8px;">
                        <input type="checkbox" name="terms" required style="accent-color: var(--primary-color); width: 16px; height: 16px; margin-top: 2px;">
                        <span>I agree to the <a href="terms" style="color: var(--primary-color); text-decoration: none;">Terms of Service</a> and <a href="privacy" style="color: var(--primary-color); text-decoration: none;">Privacy Policy</a></span>
                    </label>
                </div>
                
                <button type="submit" class="btn btn-primary w-100" style="padding: 12px; font-size: 15px; font-weight: 600; border-radius: 12px;">Create Account</button>
            </form>
            
            <div class="form-footer" style="text-align: center; margin-top: 18px; font-size: 14px; color: var(--text-muted);">
                Already have an account? <a href="login" style="color: var(--primary-color); font-weight: 600; text-decoration: none; margin-left: 4px;">Sign In</a>
            </div>
        </div>
    </div>

    <script>
    // Password reveal toggler
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const inputId = btn.dataset.target;
            const input = document.getElementById(inputId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('.eye-open').style.display = isPassword ? 'none' : 'block';
            btn.querySelector('.eye-closed').style.display = isPassword ? 'block' : 'none';
        });
    });

    // Theme switcher
    const themeBtn = document.getElementById('auth-theme-toggle');
    const themeLabel = document.getElementById('auth-theme-label');
    const themes = ['telegram-z', 'dark', 'light'];
    function updateThemeBtn() {
        const cur = localStorage.getItem('lc_theme') || 'telegram-z';
        if (themeLabel) themeLabel.textContent = cur.toUpperCase();
    }
    if (themeBtn) {
        updateThemeBtn();
        themeBtn.addEventListener('click', () => {
            const cur = localStorage.getItem('lc_theme') || 'telegram-z';
            const nextIdx = (themes.indexOf(cur) + 1) % themes.length;
            const next = themes[nextIdx];
            if (window.LiquidTheme && typeof window.LiquidTheme.set === 'function') {
                window.LiquidTheme.set(next);
            } else {
                localStorage.setItem('lc_theme', next);
                document.body.className = 'auth-page theme-' + next;
            }
            updateThemeBtn();
        });
    }
    </script>
</body>
</html>
