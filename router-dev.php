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
$start = microtime(true);

// Log every request
error_log(sprintf('[%s] %s %s', date('Y-m-d H:i:s'), $method, $uri));

// Log response status on shutdown (works even when json_response calls exit)
register_shutdown_function(function () use ($method, $uri, $start) {
    $status = http_response_code() ?: 200;
    $elapsed = round((microtime(true) - $start) * 1000, 1);
    error_log(sprintf('[%s] %s %s → %d (%sms)', date('Y-m-d H:i:s'), $method, $uri, $status, $elapsed));
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
