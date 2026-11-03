<?php
require_once __DIR__ . '/includes/security_headers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$raw = file_get_contents('php://input');
if (!$raw) {
    http_response_code(204);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(204);
    exit;
}

$report = null;
if (isset($payload['csp-report']) && is_array($payload['csp-report'])) {
    $report = $payload['csp-report'];
} elseif (isset($payload['body']) && is_array($payload['body'])) {
    $report = $payload['body'];
} else {
    $report = $payload;
}

if (!is_array($report)) {
    http_response_code(204);
    exit;
}

$entry = [
    'time' => gmdate('c'),
    'document-uri' => $report['document-uri'] ?? '',
    'blocked-uri' => $report['blocked-uri'] ?? '',
    'violated-directive' => $report['violated-directive'] ?? ($report['effective-directive'] ?? ''),
    'user-agent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
];

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$rateKey = hash('sha256', $ip . 'lc_csp');
$rateFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lc_csp_' . $rateKey . '.json';
$windowSeconds = 600;
$limit = 30;
$now = time();
$bucket = ['start' => $now, 'count' => 0];

if (is_file($rateFile)) {
    $rawRate = file_get_contents($rateFile);
    $decoded = json_decode($rawRate, true);
    if (is_array($decoded) && isset($decoded['start'], $decoded['count'])) {
        $bucket['start'] = (int) $decoded['start'];
        $bucket['count'] = (int) $decoded['count'];
    }
}

if (($now - $bucket['start']) > $windowSeconds) {
    $bucket = ['start' => $now, 'count' => 0];
}

if ($bucket['count'] >= $limit) {
    http_response_code(429);
    exit;
}

$bucket['count'] += 1;
file_put_contents($rateFile, json_encode($bucket), LOCK_EX);

$logDir = __DIR__ . DIRECTORY_SEPARATOR . 'logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$logFile = $logDir . DIRECTORY_SEPARATOR . 'csp-reports.log';
@file_put_contents($logFile, json_encode($entry) . PHP_EOL, FILE_APPEND | LOCK_EX);

http_response_code(204);
