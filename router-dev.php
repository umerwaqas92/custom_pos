<?php
/**
 * PHP built-in server router for local development.
 *
 *   php -S localhost:8080 router-dev.php
 *
 * Serves:
 *   /api/*     → api/index.php
 *   /uploads/* → uploads/
 *   /*         → frontend/dist (if built) or 404 for API-only testing
 */

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$method = $_SERVER['REQUEST_METHOD'];
$query = $_SERVER['QUERY_STRING'] ?? '';
$start = microtime(true);
$debug_log = [];

// Debug: collect request details
$debug_log['ip'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$debug_log['query'] = $query ?: '-';
$debug_log['ua'] = substr($_SERVER['HTTP_USER_AGENT'] ?? '-', 0, 120);

// Log incoming request with IP, query, user-agent
error_log(sprintf('[%s] → %s %s | qs=%s | ip=%s | ua=%s',
    date('Y-m-d H:i:s'), $method, $uri, $debug_log['query'], $debug_log['ip'], $debug_log['ua']));

// Log POST form fields (doesn't consume php://input)
if (!empty($_POST)) {
    $post_safe = [];
    foreach ($_POST as $k => $v) {
        $post_safe[$k] = strlen($v) > 500 ? substr($v, 0, 500) . '...' : $v;
    }
    error_log(sprintf('[%s] POST: %s', date('Y-m-d H:i:s'), json_encode($post_safe, JSON_UNESCAPED_UNICODE)));
}
unset($post_safe);

// Custom error handler to capture PHP notices/warnings/errors with stack traces
set_error_handler(function (int $severity, string $msg, string $file, int $line) {
    $level = match ($severity) {
        E_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR => 'FATAL',
        E_WARNING, E_USER_WARNING => 'WARN',
        E_NOTICE, E_USER_NOTICE, E_DEPRECATED, E_USER_DEPRECATED => 'NOTICE',
        default => "ERR($severity)",
    };
    error_log(sprintf('[%s] PHP %s: %s in %s:%d', date('Y-m-d H:i:s'), $level, $msg, $file, $line));
});

// Log uncaught exceptions on shutdown (works even when json_response calls exit)
register_shutdown_function(function () use ($method, $uri, $start) {
    $err = error_get_last();
    if ($err !== null && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        error_log(sprintf('[%s] PHP FATAL: %s in %s:%d', date('Y-m-d H:i:s'), $err['message'], $err['file'], $err['line']));
    }
    $status = http_response_code() ?: 200;
    $elapsed = round((microtime(true) - $start) * 1000, 1);
    $mem = round(memory_get_peak_usage(true) / 1024 / 1024, 2);
    error_log(sprintf('[%s] ← %s %s → %d (%sms | %sMB)',
        date('Y-m-d H:i:s'), $method, $uri, $status, $elapsed, $mem));
});

// API
if (str_starts_with($uri, '/api')) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Uploads
if (str_starts_with($uri, '/uploads/')) {
    $file = __DIR__ . $uri;
    if (is_file($file)) {
        return false; // let built-in server serve the file
    }
    http_response_code(404);
    echo 'Not found';
    return true;
}

// Static SPA (frontend/dist)
$dist = __DIR__ . '/frontend/dist';
$path = $dist . ($uri === '/' ? '/index.html' : $uri);
if (is_file($path)) {
    return false;
}
if (is_file($dist . '/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($dist . '/index.html');
    return true;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found. Build frontend or call /api/*']);
return true;
