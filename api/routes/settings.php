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
    $ownerId = tenant_owner_id();
    $st = $pdo->prepare('SELECT `key`, value FROM system_settings WHERE owner_id = ?');
    $st->execute([$ownerId]);
    $rows = $st->fetchAll();
    $map = [];
    foreach ($rows as $r) {
        $map[$r['key']] = $r['value'];
    }
    json_response($map);
}

function settings_put(array $params): void
{
    $body = read_json_body();
    if (!is_array($body) || !$body) {
        json_error('No settings provided.', 400);
    }

    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $now = now_sql();
    $sel = $pdo->prepare('SELECT id FROM system_settings WHERE `key` = ? AND owner_id = ? LIMIT 1');
    $ins = $pdo->prepare(
        'INSERT INTO system_settings (id, `key`, value, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $upd = $pdo->prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE `key` = ? AND owner_id = ?');

    foreach ($body as $key => $value) {
        if (!is_string($key)) {
            continue;
        }
        $strVal = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
        $sel->execute([$key, $ownerId]);
        if ($sel->fetch()) {
            $upd->execute([$strVal, $now, $key, $ownerId]);
        } else {
            $ins->execute([uuid_v4(), $key, $strVal, $ownerId, $now, $now]);
        }
    }

    settings_get([]);
}
