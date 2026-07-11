<?php

declare(strict_types=1);

function register_settings_routes(Router $router): void
{
    $router->get('settings', 'settings_get');
    $router->put('settings', 'settings_put', false, ['OWNER', 'MANAGER']);
}

function settings_get(array $params): void
{
    $pdo = Database::pdo();
    $rows = $pdo->query('SELECT `key`, value FROM system_settings')->fetchAll();
    $map = [];
    foreach ($rows as $r) {
        $map[$r['key']] = $r['value'];
    }
    // Frontend often expects object map
    json_response($map);
}

function settings_put(array $params): void
{
    $body = read_json_body();
    if (!is_array($body) || !$body) {
        json_error('No settings provided.', 400);
    }

    $pdo = Database::pdo();
    $now = now_sql();
    $sel = $pdo->prepare('SELECT id FROM system_settings WHERE `key` = ? LIMIT 1');
    $ins = $pdo->prepare(
        'INSERT INTO system_settings (id, `key`, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    $upd = $pdo->prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE `key` = ?');

    foreach ($body as $key => $value) {
        if (!is_string($key)) {
            continue;
        }
        $strVal = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
        $sel->execute([$key]);
        if ($sel->fetch()) {
            $upd->execute([$strVal, $now, $key]);
        } else {
            $ins->execute([uuid_v4(), $key, $strVal, $now, $now]);
        }
    }

    settings_get([]);
}
