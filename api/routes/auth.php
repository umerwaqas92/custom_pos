<?php

declare(strict_types=1);

function register_auth_routes(Router $router): void
{
    // POST /api/auth/login
    $router->post('auth/login', 'auth_login', true);
    // Public admin (OWNER) registration
    $router->post('auth/signup', 'auth_signup', true);

    // GET /api/auth/me
    $router->get('auth/me', 'auth_me');

    // Users / staff (OWNER creates cashiers & techs)
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
    $router->post('auth/backup/restore/:filename', 'auth_backup_restore', false, ['OWNER']);
    $router->delete('auth/backup/delete/:filename', 'auth_backup_delete', false, ['OWNER', 'MANAGER']);
    $router->get('auth/backup/export', 'auth_backup_export', false, ['OWNER', 'MANAGER']);
    $router->post('auth/backup/import', 'auth_backup_import', false, ['OWNER']);
    // External cron can hit this (no JWT) with ?key=... — replaces Node weekly scheduler
    $router->get('auth/backup/auto', 'auth_backup_auto', true);
    $router->post('auth/backup/auto', 'auth_backup_auto', true);
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

function auth_token_user_response(array $row): array
{
    $user = auth_format_user($row);
    $token = Auth::issueToken([
        'id' => $row['id'],
        'username' => $row['username'],
        'role' => $row['role'],
        'branchId' => $row['branch_id'],
    ]);
    return [
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'role' => $user['role'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'branch' => $user['branch'],
            'branchId' => $user['branchId'],
        ],
    ];
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

    json_response(auth_token_user_response($row));
}

/**
 * Public admin signup — creates OWNER + optional shop branch, returns JWT like login.
 */
function auth_signup(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    $shopName = trim((string) ($body['shopName'] ?? $body['shop_name'] ?? ''));
    $phone = trim((string) ($body['phone'] ?? ''));
    $email = trim((string) ($body['email'] ?? ''));

    if ($name === '' || $username === '' || $password === '') {
        json_error('Name, username, and password are required.', 400);
    }
    if (strlen($username) < 3) {
        json_error('Username must be at least 3 characters.', 400);
    }
    if (strlen($password) < 6) {
        json_error('Password must be at least 6 characters.', 400);
    }
    if (!preg_match('/^[a-zA-Z0-9._-]+$/', $username)) {
        json_error('Username may only contain letters, numbers, dots, dashes, and underscores.', 400);
    }

    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $check->execute([$username]);
    if ($check->fetch()) {
        json_error('Username already taken. Choose another or sign in.', 400);
    }

    try {
        Database::begin();
        $now = now_sql();
        $branchId = null;

        // Prefer first existing branch; otherwise create shop branch
        $existingBranch = $pdo->query('SELECT id FROM branches ORDER BY created_at ASC LIMIT 1')->fetch();
        if ($existingBranch) {
            $branchId = $existingBranch['id'];
        } else {
            $branchId = uuid_v4();
            $pdo->prepare(
                'INSERT INTO branches (id, name, address, phone, created_at, updated_at) VALUES (?,?,?,?,?,?)'
            )->execute([
                $branchId,
                $shopName !== '' ? $shopName : 'Main Showroom',
                null,
                $phone !== '' ? $phone : null,
                $now,
                $now,
            ]);
        }

        // If shop name given and we reused a branch with default name, optionally leave as-is
        if ($shopName !== '' && $existingBranch) {
            // create additional branch only if user provided distinct shop name and no branches named that
            $st = $pdo->prepare('SELECT id FROM branches WHERE name = ? LIMIT 1');
            $st->execute([$shopName]);
            $named = $st->fetch();
            if ($named) {
                $branchId = $named['id'];
            }
        }

        $userId = uuid_v4();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $pdo->prepare(
            'INSERT INTO users (id, name, username, password_hash, role, email, phone, is_active, branch_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,1,?,?,?)'
        )->execute([
            $userId,
            $name,
            $username,
            $hash,
            'OWNER',
            $email !== '' ? $email : null,
            $phone !== '' ? $phone : null,
            $branchId,
            $now,
            $now,
        ]);

        // Ensure default bank accounts exist
        $cnt = (int) $pdo->query('SELECT COUNT(*) FROM bank_accounts')->fetchColumn();
        if ($cnt === 0) {
            $pdo->prepare(
                'INSERT INTO bank_accounts (id, name, type, balance, is_active, created_at, updated_at) VALUES (?,?,?,0,1,?,?)'
            )->execute([uuid_v4(), 'Cash Drawer', 'CASH', $now, $now]);
            $pdo->prepare(
                'INSERT INTO bank_accounts (id, name, type, balance, is_active, created_at, updated_at) VALUES (?,?,?,0,1,?,?)'
            )->execute([uuid_v4(), 'Main Bank', 'BANK', $now, $now]);
        }

        Database::commit();

        $fetch = $pdo->prepare(auth_user_select_sql() . ' WHERE u.id = ? LIMIT 1');
        $fetch->execute([$userId]);
        $row = $fetch->fetch();
        json_response(auth_token_user_response($row), 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Signup failed.', 500);
    }
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
    $role = strtoupper(trim((string) ($body['role'] ?? '')));
    $email = $body['email'] ?? null;
    $phone = $body['phone'] ?? null;
    $branchId = $body['branchId'] ?? null;

    if ($name === '' || $username === '' || $password === '' || $role === '') {
        json_error('Name, username, password, and role are required.', 400);
    }
    if (strlen($password) < 4) {
        json_error('Password must be at least 4 characters.', 400);
    }

    // Staff roles admin can create (not another OWNER via this endpoint)
    $allowedStaff = ['CASHIER', 'TECHNICIAN', 'MANAGER', 'WAREHOUSE'];
    // Accept friendly aliases from UI
    if ($role === 'TECH' || $role === 'TECHNICIAN') {
        $role = 'TECHNICIAN';
    }
    if ($role === 'CASHIER' || $role === 'STAFF') {
        $role = $role === 'STAFF' ? 'CASHIER' : 'CASHIER';
    }
    if (!in_array($role, $allowedStaff, true)) {
        json_error('Invalid staff role. Use CASHIER or TECHNICIAN (or MANAGER / WAREHOUSE).', 400);
    }

    $actor = Auth::requireUser();
    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $check->execute([$username]);
    if ($check->fetch()) {
        json_error('Username already exists.', 400);
    }

    if (!$branchId) {
        $branchId = $actor['branchId'] ?? null;
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

/* ---- Backups: SQL dump (+ optional ZIP with uploads) ---- */

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
    try {
        $meta = auth_write_backup_to_disk('manual-backup');
        json_response([
            'message' => 'Backup created successfully.',
            'filename' => $meta['filename'],
            'size' => $meta['size'],
            'createdAt' => $meta['createdAt'],
        ], 201);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to create backup.', 500);
    }
}

/**
 * @return array{filename:string,size:int,createdAt:string,path:string}
 */
function auth_write_backup_to_disk(string $prefix = 'manual-backup'): array
{
    ensure_dir(backups_path());
    $sql = auth_export_sql_dump();
    $stamp = date('Y-m-d-His');

    if (class_exists('ZipArchive')) {
        $filename = "{$prefix}-{$stamp}.zip";
        $path = backups_path() . DIRECTORY_SEPARATOR . $filename;
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Could not create backup ZIP.');
        }
        $zip->addFromString('dump.sql', $sql);
        $zip->addFromString('README.txt', "MZK POS MySQL backup\nRestore via Settings → Backup, or import dump.sql in phpMyAdmin.\n");
        $uploads = uploads_path();
        if (is_dir($uploads)) {
            foreach (scandir($uploads) ?: [] as $f) {
                if ($f === '.' || $f === '..' || str_starts_with($f, '.')) {
                    continue;
                }
                $full = $uploads . DIRECTORY_SEPARATOR . $f;
                if (is_file($full)) {
                    $zip->addFile($full, 'uploads/' . $f);
                }
            }
        }
        $zip->close();
    } else {
        $filename = "{$prefix}-{$stamp}.sql";
        $path = backups_path() . DIRECTORY_SEPARATOR . $filename;
        file_put_contents($path, $sql);
    }

    return [
        'filename' => $filename,
        'path' => $path,
        'size' => (int) filesize($path),
        'createdAt' => date('c'),
    ];
}

function auth_export_sql_dump(): string
{
    $pdo = Database::pdo();
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $out = "-- MZK POS SQL backup " . date('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";

    foreach ($tables as $table) {
        $table = (string) $table;
        // Skip backup system tables if any
        $create = $pdo->query('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`')->fetch(PDO::FETCH_ASSOC);
        if (!$create) {
            continue;
        }
        $createSql = $create['Create Table'] ?? $create['Create Table'] ?? null;
        // MySQL returns key "Create Table"
        foreach ($create as $k => $v) {
            if (stripos((string) $k, 'Create') !== false) {
                $createSql = $v;
                break;
            }
        }
        $out .= 'DROP TABLE IF EXISTS `' . str_replace('`', '``', $table) . "`;\n";
        $out .= $createSql . ";\n\n";

        $rows = $pdo->query('SELECT * FROM `' . str_replace('`', '``', $table) . '`')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $cols = array_map(static fn($c) => '`' . str_replace('`', '``', (string) $c) . '`', array_keys($row));
            $vals = array_map(static function ($v) use ($pdo) {
                if ($v === null) {
                    return 'NULL';
                }
                return $pdo->quote((string) $v);
            }, array_values($row));
            $out .= 'INSERT INTO `' . str_replace('`', '``', $table) . '` (' . implode(',', $cols) . ') VALUES (' . implode(',', $vals) . ");\n";
        }
        $out .= "\n";
    }
    $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
    return $out;
}

/**
 * Execute a full SQL dump (DROP/CREATE/INSERT) safely.
 */
function auth_import_sql_string(string $sql): void
{
    $sql = trim($sql);
    if ($sql === '') {
        throw new RuntimeException('Backup SQL is empty.');
    }
    // Reject obvious SQLite / Node zip payloads
    if (str_contains($sql, 'prisma/dev.db') || preg_match('/^\x50\x4b/', $sql)) {
        throw new RuntimeException('This looks like an old SQLite/desktop backup. Export a new backup from this web POS (MySQL SQL/ZIP).');
    }

    $pdo = Database::pdo();
    // Prefer multi-query when available
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $pdo->exec('SET NAMES utf8mb4');

    // Split on ";\n" while keeping it simple for our dumps
    $parts = preg_split('/;\s*[\r\n]+/', $sql) ?: [];
    $ran = 0;
    $errors = [];
    foreach ($parts as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            $lines = array_values(array_filter(
                explode("\n", $stmt),
                static fn($l) => trim($l) !== '' && !str_starts_with(trim($l), '--')
            ));
            if (!$lines) {
                continue;
            }
            $stmt = implode("\n", $lines);
            if (trim($stmt) === '') {
                continue;
            }
        }
        // Strip leading SET we already applied (harmless if re-run)
        try {
            $pdo->exec($stmt);
            $ran++;
        } catch (Throwable $e) {
            // Ignore "table doesn't exist" on DROP if race; collect real errors
            $msg = $e->getMessage();
            if (stripos($msg, 'Unknown table') !== false) {
                continue;
            }
            $errors[] = $msg . ' @ ' . substr($stmt, 0, 80);
            if (count($errors) > 15) {
                break;
            }
        }
    }
    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    } catch (Throwable $e) {
        // ignore
    }

    if ($ran < 1) {
        throw new RuntimeException('No SQL statements executed. Invalid backup file.');
    }
    // If almost everything failed, surface errors
    if (count($errors) > 0 && $ran < 3) {
        throw new RuntimeException('Restore failed: ' . $errors[0]);
    }
}

function auth_camel_to_snake(string $s): string
{
    return strtolower((string) preg_replace('/([a-z])([A-Z])/', '$1_$2', $s));
}

/**
 * Convert desktop Prisma SQLite DB file into MySQL dump SQL matching web schema.
 */
function auth_sqlite_file_to_mysql_sql(string $sqlitePath): string
{
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('Server cannot read SQLite backups (pdo_sqlite missing). Convert offline or contact host.');
    }
    $src = new PDO('sqlite:' . $sqlitePath);
    $src->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    try {
        $src->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (Throwable $e) {
        // ignore
    }

    $tableMap = [
        'User' => 'users',
        'Branch' => 'branches',
        'Product' => 'products',
        'BranchStock' => 'branch_stocks',
        'Category' => 'categories',
        'Brand' => 'brands',
        'Supplier' => 'suppliers',
        'Customer' => 'customers',
        'PurchaseOrder' => 'purchase_orders',
        'PurchaseItem' => 'purchase_items',
        'Sale' => 'sales',
        'SaleItem' => 'sale_items',
        'RepairJob' => 'repair_jobs',
        'WarrantyClaim' => 'warranty_claims',
        'StockMovement' => 'stock_movements',
        'Expense' => 'expenses',
        'CustomerCreditPayment' => 'customer_credit_payments',
        'SupplierPayment' => 'supplier_payments',
        'ActivityLog' => 'activity_logs',
        'BankAccount' => 'bank_accounts',
        'Transaction' => 'transactions',
        'DailyClosing' => 'daily_closings',
        'SaleEmi' => 'sale_emis',
        'EmiInstallment' => 'emi_installments',
        'SystemSetting' => 'system_settings',
        'SaleReturn' => 'sale_returns',
        'SaleReturnItem' => 'sale_return_items',
    ];
    $order = [
        'Branch', 'User', 'Category', 'Brand', 'Supplier', 'Customer', 'BankAccount', 'SystemSetting',
        'Product', 'BranchStock', 'PurchaseOrder', 'PurchaseItem', 'Sale', 'SaleItem', 'SaleEmi', 'EmiInstallment',
        'SaleReturn', 'SaleReturnItem', 'RepairJob', 'WarrantyClaim', 'StockMovement', 'Expense',
        'CustomerCreditPayment', 'SupplierPayment', 'ActivityLog', 'Transaction', 'DailyClosing',
    ];

    $normalize = static function (string $col, $v) {
        if ($v === null) {
            return null;
        }
        if ($col === 'is_active') {
            return (int) ((bool) $v || $v === 1 || $v === '1');
        }
        if (preg_match('/(_at|_date|date|paid_date|due_date|estimated_delivery|claim_date|order_date|sale_date|return_date|payment_date|closing_date)$/', $col)
            || $col === 'date') {
            $s = str_replace('T', ' ', (string) $v);
            $s = (string) preg_replace('/\.\d{3}Z?$/', '', $s);
            $s = rtrim($s, 'Z');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
                $s .= ' 00:00:00';
            }
            return $s;
        }
        return $v;
    };

    $lines = [
        '-- Converted from desktop SQLite backup ' . date('c'),
        'SET NAMES utf8mb4;',
        'SET FOREIGN_KEY_CHECKS=0;',
        '',
    ];
    foreach (array_reverse($order) as $prismaTable) {
        if (!isset($tableMap[$prismaTable])) {
            continue;
        }
        $lines[] = 'DELETE FROM `' . $tableMap[$prismaTable] . '`;';
    }
    $lines[] = '';

    foreach ($order as $prismaTable) {
        if (!isset($tableMap[$prismaTable])) {
            continue;
        }
        $mysqlTable = $tableMap[$prismaTable];
        try {
            $colsInfo = $src->query('PRAGMA table_info(`' . str_replace('`', '``', $prismaTable) . '`)')->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            continue;
        }
        if (!$colsInfo) {
            continue;
        }
        $sqliteCols = array_column($colsInfo, 'name');
        $mapped = [];
        foreach ($sqliteCols as $c) {
            $mapped[$c] = auth_camel_to_snake($c);
        }
        $rows = $src->query('SELECT * FROM `' . str_replace('`', '``', $prismaTable) . '`')->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) {
            continue;
        }
        $colSql = implode(',', array_map(static fn($c) => '`' . str_replace('`', '``', $c) . '`', array_values($mapped)));
        foreach ($rows as $row) {
            $vals = [];
            foreach ($sqliteCols as $sc) {
                $mc = $mapped[$sc];
                $v = $normalize($mc, $row[$sc] ?? null);
                if ($v === null) {
                    $vals[] = 'NULL';
                } else {
                    $vals[] = $src->quote((string) $v);
                }
            }
            $lines[] = 'INSERT INTO `' . $mysqlTable . '` (' . $colSql . ') VALUES (' . implode(',', $vals) . ');';
        }
        $lines[] = '';
    }

    $lines[] = 'SET FOREIGN_KEY_CHECKS=1;';
    $lines[] = "INSERT INTO bank_accounts (id, name, type, balance, is_active, created_at, updated_at)
SELECT 'a3000000-0000-4000-8000-000000000001', 'Cash Drawer', 'CASH', 0, 1, NOW(), NOW() FROM DUAL
WHERE (SELECT COUNT(*) FROM bank_accounts) = 0;";
    $lines[] = "INSERT INTO bank_accounts (id, name, type, balance, is_active, created_at, updated_at)
SELECT 'a3000000-0000-4000-8000-000000000002', 'Main Bank', 'BANK', 0, 1, NOW(), NOW() FROM DUAL
WHERE (SELECT COUNT(*) FROM bank_accounts) < 2;";

    return implode("\n", $lines);
}

/**
 * Extract SQL (or convert SQLite desktop zip) and restore upload files.
 * Returns SQL string for auth_import_sql_string().
 */
function auth_extract_sql_from_upload(string $tmpPath, string $originalName): string
{
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($ext === 'sql' || $ext === 'txt') {
        $sql = file_get_contents($tmpPath);
        if ($sql === false) {
            throw new RuntimeException('Could not read uploaded SQL file.');
        }
        return $sql;
    }

    if ($ext === 'zip') {
        if (!class_exists('ZipArchive')) {
            throw new RuntimeException('ZIP support is not available on this host. Upload a .sql dump instead.');
        }
        $zip = new ZipArchive();
        if ($zip->open($tmpPath) !== true) {
            throw new RuntimeException('Could not open ZIP backup.');
        }
        $sql = null;
        $sqliteIndex = null;
        $sqliteName = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = str_replace('\\', '/', (string) $zip->getNameIndex($i));
            $base = strtolower(basename($name));
            if ($base === 'dev.db' || str_ends_with(strtolower($name), 'prisma/dev.db') || $base === 'dev.db-wal') {
                if ($base === 'dev.db' || str_ends_with(strtolower($name), '/dev.db') || $base === 'dev.db') {
                    $sqliteIndex = $i;
                    $sqliteName = $name;
                }
            }
            if ($base === 'dump.sql' || $base === 'backup.sql' || str_ends_with($base, '.sql')) {
                $chunk = $zip->getFromIndex($i);
                if ($chunk !== false && trim((string) $chunk) !== '') {
                    $sql = $chunk;
                    break;
                }
            }
        }

        // Restore uploads (web + desktop paths)
        ensure_dir(uploads_path());
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = str_replace('\\', '/', (string) $zip->getNameIndex($i));
            if (str_contains($name, '..')) {
                continue;
            }
            if (preg_match('#(?:^|/)(?:public/)?uploads/([^/]+)$#i', $name, $m)) {
                $dest = uploads_path() . DIRECTORY_SEPARATOR . $m[1];
                $data = $zip->getFromIndex($i);
                if ($data !== false) {
                    file_put_contents($dest, $data);
                }
            }
        }

        if ($sql !== null && trim((string) $sql) !== '') {
            $zip->close();
            return (string) $sql;
        }

        // Desktop SQLite backup → convert on the fly
        if ($sqliteIndex !== null) {
            $tmpDir = sys_get_temp_dir() . '/pos_sqlite_' . bin2hex(random_bytes(4));
            @mkdir($tmpDir, 0755, true);
            $dbPath = $tmpDir . '/dev.db';
            $dbData = $zip->getFromIndex($sqliteIndex);
            if ($dbData === false) {
                $zip->close();
                throw new RuntimeException('Could not read prisma/dev.db from ZIP.');
            }
            file_put_contents($dbPath, $dbData);
            // Also extract WAL/SHM if present for checkpoint
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = str_replace('\\', '/', (string) $zip->getNameIndex($i));
                $base = basename($name);
                if ($base === 'dev.db-wal' || $base === 'dev.db-shm') {
                    $blob = $zip->getFromIndex($i);
                    if ($blob !== false) {
                        file_put_contents($tmpDir . '/' . $base, $blob);
                    }
                }
            }
            $zip->close();
            try {
                $converted = auth_sqlite_file_to_mysql_sql($dbPath);
            } finally {
                foreach (glob($tmpDir . '/*') ?: [] as $f) {
                    @unlink($f);
                }
                @rmdir($tmpDir);
            }
            return $converted;
        }

        $zip->close();
        throw new RuntimeException('No dump.sql or prisma/dev.db found inside the ZIP.');
    }

    throw new RuntimeException('Unsupported backup type. Upload a .sql or .zip backup file.');
}

function auth_backup_download(array $params): void
{
    $filename = basename($params['filename']);
    $full = backups_path() . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($full) || str_contains($filename, '..')) {
        json_error('Backup not found.', 404);
    }
    $mime = str_ends_with(strtolower($filename), '.zip') ? 'application/zip' : 'application/sql';
    header('Content-Type: ' . $mime);
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
    try {
        $sql = auth_export_sql_dump();
        if (class_exists('ZipArchive')) {
            $tmp = tempnam(sys_get_temp_dir(), 'posbk');
            $zipPath = $tmp . '.zip';
            @unlink($tmp);
            $zip = new ZipArchive();
            if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('Could not build export ZIP.');
            }
            $zip->addFromString('dump.sql', $sql);
            $uploads = uploads_path();
            if (is_dir($uploads)) {
                foreach (scandir($uploads) ?: [] as $f) {
                    if ($f === '.' || $f === '..' || str_starts_with($f, '.')) {
                        continue;
                    }
                    $full = $uploads . DIRECTORY_SEPARATOR . $f;
                    if (is_file($full)) {
                        $zip->addFile($full, 'uploads/' . $f);
                    }
                }
            }
            $zip->close();
            $name = 'pos-backup-' . date('Y-m-d') . '.zip';
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="' . $name . '"');
            header('Content-Length: ' . filesize($zipPath));
            readfile($zipPath);
            @unlink($zipPath);
            exit;
        }

        $name = 'pos-backup-' . date('Y-m-d') . '.sql';
        header('Content-Type: application/sql');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . strlen($sql));
        echo $sql;
        exit;
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to export backup.', 500);
    }
}

function auth_backup_restore(array $params): void
{
    $filename = basename($params['filename'] ?? '');
    $full = backups_path() . DIRECTORY_SEPARATOR . $filename;
    if ($filename === '' || str_contains($filename, '..') || !is_file($full)) {
        json_error('Backup not found.', 404);
    }

    try {
        $sql = auth_extract_sql_from_upload($full, $filename);
        auth_import_sql_string($sql);
        json_response([
            'message' => 'System data restored from backup. Reloading is recommended.',
        ]);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to restore backup.', 500);
    }
}

/**
 * Cron-friendly auto backup (Node scheduler replacement).
 * GET/POST /api/auth/backup/auto?key=YOUR_SECRET
 * Secret = first 16 chars of jwt_secret from config (or full jwt_secret).
 */
function auth_backup_auto(array $params): void
{
    global $APP_CONFIG;
    $key = (string) (query_params()['key'] ?? ($_POST['key'] ?? ''));
    $secret = (string) ($APP_CONFIG['jwt_secret'] ?? '');
    $ok = $secret !== '' && ($key === $secret || $key === substr($secret, 0, 16));
    if (!$ok) {
        json_error('Forbidden.', 403);
    }

    ensure_dir(backups_path());
    // Skip if an auto-backup newer than 6 days exists
    $autos = glob(backups_path() . '/auto-backup-*.{sql,zip}', GLOB_BRACE) ?: [];
    usort($autos, static fn($a, $b) => filemtime($b) <=> filemtime($a));
    if ($autos && (time() - (int) filemtime($autos[0])) < 6 * 24 * 3600) {
        json_response([
            'message' => 'Auto backup not needed yet.',
            'last' => basename($autos[0]),
            'ageHours' => round((time() - (int) filemtime($autos[0])) / 3600, 1),
        ]);
    }

    try {
        $meta = auth_write_backup_to_disk('auto-backup');
        // Keep last 5 auto backups
        $all = glob(backups_path() . '/auto-backup-*.{sql,zip}', GLOB_BRACE) ?: [];
        usort($all, static fn($a, $b) => filemtime($b) <=> filemtime($a));
        foreach (array_slice($all, 5) as $old) {
            @unlink($old);
        }
        json_response(array_merge(['message' => 'Auto backup created.'], $meta), 201);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Auto backup failed.', 500);
    }
}

function auth_backup_import(array $params): void
{
    if (empty($_FILES['backup']) || ($_FILES['backup']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_error('Please upload a valid backup zip or sql file.', 400);
    }

    $file = $_FILES['backup'];
    $tmp = $file['tmp_name'];
    $name = $file['name'] ?? 'backup.sql';

    try {
        ensure_dir(backups_path());
        $safeName = 'import-' . date('Y-m-d-His') . '-' . preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($name));
        $stored = backups_path() . DIRECTORY_SEPARATOR . $safeName;
        // Keep a server copy; import from the upload temp path first
        $sql = auth_extract_sql_from_upload($tmp, $name);
        @copy($tmp, $stored);
        auth_import_sql_string($sql);

        json_response([
            'message' => 'Data restored successfully from backup. The page will reload.',
        ]);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to restore data from the uploaded backup.', 500);
    }
}
