<?php

declare(strict_types=1);

function register_auth_routes(Router $router): void
{
    // POST /api/auth/login
    $router->post('auth/login', 'auth_login', true);

    // GET /api/auth/me
    $router->get('auth/me', 'auth_me');

    // Users
    $router->get('auth/users', 'auth_users_list', false, ['OWNER', 'MANAGER']);
    $router->post('auth/users', 'auth_users_create', false, ['OWNER']);
    $router->put('auth/users/:id', 'auth_users_update', false, ['OWNER']);
    $router->delete('auth/users/:id', 'auth_users_toggle', false, ['OWNER']);

    // Branches
    $router->get('auth/branches', 'auth_branches_list');
    $router->post('auth/branches', 'auth_branches_create', false, ['OWNER']);
    $router->put('auth/branches/:id', 'auth_branches_update', false, ['OWNER']);
    $router->delete('auth/branches/:id', 'auth_branches_delete', false, ['OWNER']);

    // Reset transactional data
    $router->post('auth/reset-transactions', 'auth_reset_transactions', false, ['OWNER']);

    // Backup stubs (full SQL backup in later phase — endpoints registered so UI doesn't 404 hard)
    $router->get('auth/backup/list', 'auth_backup_list', false, ['OWNER', 'MANAGER']);
    $router->post('auth/backup/create', 'auth_backup_create', false, ['OWNER', 'MANAGER']);
    $router->get('auth/backup/download/:filename', 'auth_backup_download', false, ['OWNER', 'MANAGER']);
    $router->post('auth/backup/restore/:filename', 'auth_backup_not_ready', false, ['OWNER']);
    $router->delete('auth/backup/delete/:filename', 'auth_backup_delete', false, ['OWNER', 'MANAGER']);
    $router->get('auth/backup/export', 'auth_backup_export', false, ['OWNER', 'MANAGER']);
    $router->post('auth/backup/import', 'auth_backup_not_ready', false, ['OWNER']);
}

function auth_user_select_sql(): string
{
    return 'SELECT u.id, u.name, u.username, u.password_hash, u.role, u.email, u.phone,
                   u.is_active, u.branch_id, u.created_at, u.updated_at,
                   b.id AS b_id, b.name AS b_name, b.address AS b_address, b.phone AS b_phone,
                   b.created_at AS b_created_at, b.updated_at AS b_updated_at
            FROM users u
            LEFT JOIN branches b ON b.id = u.branch_id';
}

function auth_format_user(array $row, bool $includePassword = false): array
{
    $user = [
        'id' => $row['id'],
        'name' => $row['name'],
        'username' => $row['username'],
        'role' => $row['role'],
        'email' => $row['email'],
        'phone' => $row['phone'],
        'isActive' => (bool) (int) $row['is_active'],
        'branchId' => $row['branch_id'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'branch' => null,
    ];

    if ($includePassword) {
        $user['passwordHash'] = $row['password_hash'];
    }

    if (!empty($row['b_id'])) {
        $user['branch'] = [
            'id' => $row['b_id'],
            'name' => $row['b_name'],
            'address' => $row['b_address'],
            'phone' => $row['b_phone'],
            'createdAt' => $row['b_created_at'],
            'updatedAt' => $row['b_updated_at'],
        ];
    }

    return $user;
}

function auth_login(array $params): void
{
    $body = read_json_body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($username === '' || $password === '') {
        json_error('Username and password are required.', 400);
    }

    $pdo = Database::pdo();
    $stmt = $pdo->prepare(auth_user_select_sql() . ' WHERE u.username = ? LIMIT 1');
    $stmt->execute([$username]);
    $row = $stmt->fetch();

    if (!$row || !(int) $row['is_active']) {
        json_error('Invalid username or password.', 401);
    }

    if (!password_verify($password, $row['password_hash'])) {
        json_error('Invalid username or password.', 401);
    }

    $token = Auth::issueToken([
        'id' => $row['id'],
        'username' => $row['username'],
        'role' => $row['role'],
        'branchId' => $row['branch_id'],
    ]);

    $user = auth_format_user($row);
    // Login response historically omits passwordHash / isActive noise — keep lean like Node
    json_response([
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'role' => $user['role'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'branch' => $user['branch'],
        ],
    ]);
}

function auth_me(array $params): void
{
    $auth = Auth::requireUser();
    $pdo = Database::pdo();
    $stmt = $pdo->prepare(auth_user_select_sql() . ' WHERE u.id = ? LIMIT 1');
    $stmt->execute([$auth['id']]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('User not found.', 404);
    }
    // Node returns full user including passwordHash — strip hash for safety
    json_response(auth_format_user($row));
}

function auth_users_list(array $params): void
{
    $pdo = Database::pdo();
    $stmt = $pdo->query(auth_user_select_sql() . ' ORDER BY u.created_at DESC');
    $rows = $stmt->fetchAll();
    $users = array_map(static fn($r) => auth_format_user($r), $rows);
    json_response($users);
}

function auth_users_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    $role = trim((string) ($body['role'] ?? ''));
    $email = $body['email'] ?? null;
    $phone = $body['phone'] ?? null;
    $branchId = $body['branchId'] ?? null;

    if ($name === '' || $username === '' || $password === '' || $role === '') {
        json_error('Name, username, password, and role are required.', 400);
    }

    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $check->execute([$username]);
    if ($check->fetch()) {
        json_error('Username already exists.', 400);
    }

    $id = uuid_v4();
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $now = now_sql();

    $stmt = $pdo->prepare(
        'INSERT INTO users (id, name, username, password_hash, role, email, phone, is_active, branch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
    );
    $stmt->execute([
        $id,
        $name,
        $username,
        $hash,
        $role,
        $email ?: null,
        $phone ?: null,
        $branchId ?: null,
        $now,
        $now,
    ]);

    $fetch = $pdo->prepare(auth_user_select_sql() . ' WHERE u.id = ? LIMIT 1');
    $fetch->execute([$id]);
    json_response(auth_format_user($fetch->fetch()), 201);
}

function auth_users_update(array $params): void
{
    $id = $params['id'];
    $body = read_json_body();
    $pdo = Database::pdo();

    $exists = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
    $exists->execute([$id]);
    if (!$exists->fetch()) {
        json_error('User not found.', 404);
    }

    $fields = [];
    $values = [];

    foreach (['name' => 'name', 'role' => 'role', 'email' => 'email', 'phone' => 'phone'] as $json => $col) {
        if (array_key_exists($json, $body)) {
            $fields[] = "{$col} = ?";
            $values[] = $body[$json];
        }
    }
    if (array_key_exists('branchId', $body)) {
        $fields[] = 'branch_id = ?';
        $values[] = $body['branchId'] ?: null;
    }
    if (array_key_exists('isActive', $body)) {
        $fields[] = 'is_active = ?';
        $values[] = $body['isActive'] ? 1 : 0;
    }
    if (!empty($body['password'])) {
        $fields[] = 'password_hash = ?';
        $values[] = password_hash((string) $body['password'], PASSWORD_BCRYPT);
    }

    if ($fields) {
        $fields[] = 'updated_at = ?';
        $values[] = now_sql();
        $values[] = $id;
        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $pdo->prepare($sql)->execute($values);
    }

    $fetch = $pdo->prepare(auth_user_select_sql() . ' WHERE u.id = ? LIMIT 1');
    $fetch->execute([$id]);
    json_response(auth_format_user($fetch->fetch()));
}

function auth_users_toggle(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    $stmt = $pdo->prepare('SELECT is_active FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) {
        json_error('User not found.', 404);
    }
    $new = (int) $user['is_active'] ? 0 : 1;
    $pdo->prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
        ->execute([$new, now_sql(), $id]);
    json_response([
        'message' => 'User status set to ' . ($new ? 'Active' : 'Inactive') . '.',
    ]);
}

function auth_format_branch(array $row): array
{
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'address' => $row['address'],
        'phone' => $row['phone'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function auth_branches_list(array $params): void
{
    $pdo = Database::pdo();
    $rows = $pdo->query('SELECT * FROM branches ORDER BY name ASC')->fetchAll();
    json_response(array_map('auth_format_branch', $rows));
}

function auth_branches_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Branch name is required.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $pdo = Database::pdo();
    $pdo->prepare(
        'INSERT INTO branches (id, name, address, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $name,
        $body['address'] ?? null,
        $body['phone'] ?? null,
        $now,
        $now,
    ]);
    $row = $pdo->prepare('SELECT * FROM branches WHERE id = ?');
    $row->execute([$id]);
    json_response(auth_format_branch($row->fetch()), 201);
}

function auth_branches_update(array $params): void
{
    $id = $params['id'];
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Branch name is required.', 400);
    }
    $pdo = Database::pdo();
    $pdo->prepare(
        'UPDATE branches SET name = ?, address = ?, phone = ?, updated_at = ? WHERE id = ?'
    )->execute([
        $name,
        $body['address'] ?? null,
        $body['phone'] ?? null,
        now_sql(),
        $id,
    ]);
    $row = $pdo->prepare('SELECT * FROM branches WHERE id = ?');
    $row->execute([$id]);
    $b = $row->fetch();
    if (!$b) {
        json_error('Failed to update branch.', 500);
    }
    json_response(auth_format_branch($b));
}

function auth_branches_delete(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    try {
        Database::begin();
        $pdo->prepare('DELETE FROM branch_stocks WHERE branch_id = ?')->execute([$id]);
        $pdo->prepare('UPDATE users SET branch_id = NULL WHERE branch_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM daily_closings WHERE branch_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM branches WHERE id = ?')->execute([$id]);
        Database::commit();
        json_response(['message' => 'Branch deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to delete branch.', 500);
    }
}

function auth_reset_transactions(array $params): void
{
    $pdo = Database::pdo();
    try {
        Database::begin();
        $tables = [
            'activity_logs',
            'emi_installments',
            'sale_emis',
            'sale_return_items',
            'sale_returns',
            'warranty_claims',
            'sale_items',
            'sales',
            'repair_jobs',
            'purchase_items',
            'purchase_orders',
            'supplier_payments',
            'customer_credit_payments',
            'expenses',
            'stock_movements',
            'daily_closings',
            'transactions',
        ];
        foreach ($tables as $t) {
            $pdo->exec("DELETE FROM {$t}");
        }
        $pdo->exec('UPDATE customers SET credit_balance = 0, reward_points = 0');
        $pdo->exec('UPDATE bank_accounts SET balance = 0');
        Database::commit();
        json_response([
            'message' => 'All transactions and sales history have been cleared successfully. Products, categories, and contacts have been preserved.',
        ]);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to clear transaction records.', 500);
    }
}

/* ---- Backup placeholders (Phase 5 will complete SQL dump/zip) ---- */

function auth_backup_list(array $params): void
{
    ensure_dir(backups_path());
    $files = [];
    foreach (glob(backups_path() . '/*.{sql,zip}', GLOB_BRACE) ?: [] as $full) {
        $files[] = [
            'filename' => basename($full),
            'size' => filesize($full),
            'createdAt' => date('c', filemtime($full) ?: time()),
        ];
    }
    usort($files, static fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    json_response($files);
}

function auth_backup_create(array $params): void
{
    ensure_dir(backups_path());
    $filename = 'manual-backup-' . date('Y-m-d-His') . '.sql';
    $path = backups_path() . DIRECTORY_SEPARATOR . $filename;

    try {
        $sql = auth_export_sql_dump();
        file_put_contents($path, $sql);
        json_response([
            'message' => 'Backup created successfully.',
            'filename' => $filename,
            'size' => filesize($path),
            'createdAt' => date('c'),
        ], 201);
    } catch (Throwable $e) {
        json_error('Failed to create backup.', 500);
    }
}

function auth_export_sql_dump(): string
{
    $pdo = Database::pdo();
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $out = "-- MZK POS SQL backup " . date('c') . "\nSET FOREIGN_KEY_CHECKS=0;\n\n";

    foreach ($tables as $table) {
        $create = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch();
        $out .= "DROP TABLE IF EXISTS `{$table}`;\n";
        $out .= $create['Create Table'] . ";\n\n";

        $rows = $pdo->query("SELECT * FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $cols = array_map(static fn($c) => '`' . str_replace('`', '``', $c) . '`', array_keys($row));
            $vals = array_map(static function ($v) use ($pdo) {
                if ($v === null) {
                    return 'NULL';
                }
                return $pdo->quote((string) $v);
            }, array_values($row));
            $out .= 'INSERT INTO `' . $table . '` (' . implode(',', $cols) . ') VALUES (' . implode(',', $vals) . ");\n";
        }
        $out .= "\n";
    }
    $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
    return $out;
}

function auth_backup_download(array $params): void
{
    $filename = basename($params['filename']);
    $full = backups_path() . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($full) || str_contains($filename, '..')) {
        json_error('Backup not found.', 404);
    }
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($full));
    readfile($full);
    exit;
}

function auth_backup_delete(array $params): void
{
    $filename = basename($params['filename']);
    $full = backups_path() . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($full) || str_contains($filename, '..')) {
        json_error('Backup not found.', 400);
    }
    unlink($full);
    json_response(['message' => 'Backup deleted.']);
}

function auth_backup_export(array $params): void
{
    $sql = auth_export_sql_dump();
    $name = 'pos-backup-' . date('Y-m-d') . '.sql';
    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . strlen($sql));
    echo $sql;
    exit;
}

function auth_backup_not_ready(array $params): void
{
    json_error('Backup restore/import via SQL file will be enabled in a later update. Use phpMyAdmin import for now.', 501);
}
