<?php

declare(strict_types=1);

// CORS / preflight (same-origin in production; allow local Vite dev)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
    'http://localhost:3333',
    'http://127.0.0.1:3333',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
if ($origin && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Access-Token, X-Authorization');
header('Access-Control-Max-Age: 86400');

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Missing api/config.php. Copy config.sample.php to config.php and set MySQL credentials.',
    ]);
    exit;
}

/** @var array $APP_CONFIG */
$APP_CONFIG = require $configFile;

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/Database.php';
require_once __DIR__ . '/lib/Auth.php';
require_once __DIR__ . '/lib/Tenant.php';
require_once __DIR__ . '/lib/Router.php';
require_once __DIR__ . '/lib/Format.php';

// PHP 7 polyfill for array_is_list if needed
if (!function_exists('array_is_list')) {
    function array_is_list(array $array): bool
    {
        $i = 0;
        foreach ($array as $k => $_) {
            if ($k !== $i++) {
                return false;
            }
        }
        return true;
    }
}

// Do NOT mkdir on every request — only when upload/backup handlers need it.

// Optional gzip for large JSON responses (shared hosts usually support zlib)
if (!headers_sent() && extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    $accept = $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '';
    if (str_contains($accept, 'gzip')) {
        ob_start('ob_gzhandler');
    }
}

set_exception_handler(static function (Throwable $e): void {
    global $APP_CONFIG;
    $env = $APP_CONFIG['app_env'] ?? 'production';
    if ($env === 'development') {
        json_error($e->getMessage(), 500);
    }
    error_log('[MZK POS] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    json_error('Something went wrong on the server!', 500);
});
