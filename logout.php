<?php
require_once 'includes/config.php';
require_once 'includes/auth.php';

// Log out user
Auth::logout($conn);

// Redirect to login page
header('Location: login');
exit();
?> 
