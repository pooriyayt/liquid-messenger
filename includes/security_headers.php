<?php
if (!isset($GLOBALS['cspNonce'])) {
    ini_set('expose_php', '0');
    if (function_exists('header_remove')) {
        header_remove('X-Powered-By');
    } else {
        header('X-Powered-By:');
    }

    $cspNonce = base64_encode(random_bytes(16));
    $GLOBALS['cspNonce'] = $cspNonce;

    if (!headers_sent()) {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: geolocation=(), payment=(), usb=(), interest-cohort=(), microphone=(self), camera=(self)');
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Cross-Origin-Embedder-Policy: unsafe-none');

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
        if ($isHttps) {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        }

        $cspDirectives = [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "form-action 'self'",
            "upgrade-insecure-requests",
            "block-all-mixed-content",
            "script-src 'self' 'nonce-{$cspNonce}' 'unsafe-inline'",
            "script-src-attr 'self' 'unsafe-inline' 'unsafe-hashes'",
            "style-src 'self' 'nonce-{$cspNonce}' 'unsafe-inline'",
            "style-src-attr 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "connect-src 'self'",
            "font-src 'self' data:",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
            "report-uri /csp-report.php"
        ];
        $csp = implode('; ', $cspDirectives);

        if (!defined('CSP_REPORT_ONLY')) {
            define('CSP_REPORT_ONLY', true);
        }

        if (CSP_REPORT_ONLY) {
            header("Content-Security-Policy-Report-Only: {$csp}");
        } else {
            header("Content-Security-Policy: {$csp}");
        }
    }
}
