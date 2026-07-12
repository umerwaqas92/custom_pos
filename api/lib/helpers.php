<?php

declare(strict_types=1);

function uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function round_money($amount): float
{
    return round((float) $amount, 2);
}

function now_sql(): string
{
    return date('Y-m-d H:i:s');
}

/**
 * Convert snake_case keys to camelCase (recursive).
 */
function keys_to_camel($data)
{
    if (!is_array($data)) {
        return $data;
    }

    // List (numeric keys)
    if (array_is_list($data)) {
        return array_map('keys_to_camel', $data);
    }

    $out = [];
    foreach ($data as $key => $value) {
        $camel = is_string($key) ? snake_to_camel($key) : $key;
        if (is_array($value)) {
            $value = keys_to_camel($value);
        } elseif (is_string($value) && is_boolish_column($key) && ($value === '0' || $value === '1')) {
            $value = $value === '1';
        }
        // MySQL PDO returns decimals as strings — cast common money-ish? leave as-is numbers when numeric fields
        $out[$camel] = $value;
    }
    return $out;
}

function snake_to_camel(string $key): string
{
    return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $key))));
}

function is_boolish_column(string $key): bool
{
    return in_array($key, ['is_active', 'isActive'], true)
        || str_starts_with($key, 'is_');
}

/**
 * Cast selected numeric fields from PDO string rows.
 */
function cast_row_types(array $row, array $floatFields = [], array $intFields = [], array $boolFields = []): array
{
    foreach ($floatFields as $f) {
        if (array_key_exists($f, $row) && $row[$f] !== null) {
            $row[$f] = (float) $row[$f];
        }
    }
    foreach ($intFields as $f) {
        if (array_key_exists($f, $row) && $row[$f] !== null) {
            $row[$f] = (int) $row[$f];
        }
    }
    foreach ($boolFields as $f) {
        if (array_key_exists($f, $row) && $row[$f] !== null) {
            $row[$f] = (bool) (int) $row[$f];
        }
    }
    return $row;
}

function json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    // Avoid expensive pretty-print; substitute invalid UTF-8 so encode never fails
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    echo json_encode($data, $flags);
    exit;
}

function json_error(string $message, int $status = 400): void
{
    json_response(['error' => $message], $status);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('Invalid JSON body.', 400);
    }
    return $data;
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

/**
 * Path relative to /api, without leading/trailing slashes.
 * e.g. auth/login, products/categories
 */
function api_path(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?: '/';

    // Strip to after /api
    if (preg_match('#/api(?:/index\.php)?(?:/|$)(.*)$#i', $path, $m)) {
        $path = $m[1];
    } else {
        // When rewritten as /api/index.php/auth/login or PATH_INFO
        $pathInfo = $_SERVER['PATH_INFO'] ?? '';
        $path = ltrim($pathInfo, '/');
    }

    $path = rawurldecode($path);
    $path = trim($path, '/');
    return $path;
}

function query_params(): array
{
    return $_GET;
}

function get_bearer_token(): ?string
{
    // InfinityFree / CGI often strips Authorization — check many places + custom header.
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['HTTP_X_ACCESS_TOKEN'] ?? null,
        $_SERVER['HTTP_X_AUTHORIZATION'] ?? null,
        $_GET['access_token'] ?? null,
    ];

    if (function_exists('apache_request_headers')) {
        $apache = apache_request_headers();
        if (is_array($apache)) {
            foreach ($apache as $k => $v) {
                if (strcasecmp((string) $k, 'Authorization') === 0
                    || strcasecmp((string) $k, 'X-Access-Token') === 0
                    || strcasecmp((string) $k, 'X-Authorization') === 0) {
                    $candidates[] = $v;
                }
            }
        }
    }

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                if (strcasecmp((string) $k, 'Authorization') === 0
                    || strcasecmp((string) $k, 'X-Access-Token') === 0
                    || strcasecmp((string) $k, 'X-Authorization') === 0) {
                    $candidates[] = $v;
                }
            }
        }
    }

    foreach ($candidates as $header) {
        if (!$header || !is_string($header)) {
            continue;
        }
        $header = trim($header);
        if ($header === '') {
            continue;
        }
        if (preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
            return $m[1];
        }
        // Raw JWT (custom header without Bearer prefix)
        if (preg_match('/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/', $header)) {
            return $header;
        }
    }

    return null;
}

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/')) ?: '';
}

function project_root(): string
{
    return dirname(__DIR__, 2); // custom_pos/
}

function api_root(): string
{
    return dirname(__DIR__); // custom_pos/api
}

function uploads_path(): string
{
    global $APP_CONFIG;
    $dir = $APP_CONFIG['uploads_dir'] ?? null;
    if ($dir) {
        return $dir;
    }
    return project_root() . DIRECTORY_SEPARATOR . 'uploads';
}

function backups_path(): string
{
    global $APP_CONFIG;
    $dir = $APP_CONFIG['backups_dir'] ?? null;
    if ($dir) {
        return $dir;
    }
    return api_root() . DIRECTORY_SEPARATOR . 'backups';
}

function ensure_dir(string $path): void
{
    if (!is_dir($path)) {
        mkdir($path, 0755, true);
    }
}
