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

    // PUT /api/auth/change-password (any authenticated user)
    $router->put('auth/change-password', 'auth_change_password');

    // Users / staff (OWNER creates cashiers & techs)
    $router->get('auth/users', 'auth_users_list', false, ['OWNER', 'MANAGER', 'SUPER_ADMIN']);
    $router->post('auth/users', 'auth_users_create', false, ['OWNER']);
    $router->put('auth/users/:id', 'auth_users_update', false, ['OWNER', 'SUPER_ADMIN']);
    $router->delete('auth/users/:id', 'auth_users_toggle', false, ['OWNER', 'SUPER_ADMIN']);

    // Branches
    $router->get('auth/branches', 'auth_branches_list');
    $router->post('auth/branches', 'auth_branches_create', false, ['OWNER']);
    $router->put('auth/branches/:id', 'auth_branches_update', false, ['OWNER']);
    $router->delete('auth/branches/:id', 'auth_branches_delete', false, ['OWNER']);

    // Reset transactional data
    $router->post('auth/reset-transactions', 'auth_reset_transactions', false, ['OWNER']);
    $router->get('auth/data-counts', 'auth_data_counts', false, ['OWNER']);

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
                   u.is_active, u.branch_id, u.owner_id, u.created_at, u.updated_at,
                   b.id AS b_id, b.name AS b_name, b.address AS b_address, b.phone AS b_phone,
                   b.created_at AS b_created_at, b.updated_at AS b_updated_at
            FROM users u
            LEFT JOIN branches b ON b.id = u.branch_id';
}

/** Resolve shop owner id from a users row. */
function auth_row_owner_id(array $row): string
{
    if (!empty($row['owner_id'])) {
        return (string) $row['owner_id'];
    }
    if (($row['role'] ?? '') === 'OWNER') {
        return (string) $row['id'];
    }
    return (string) ($row['id'] ?? '');
}

function auth_format_user(array $row, bool $includePassword = false): array
{
    $ownerId = auth_row_owner_id($row);
    $user = [
        'id' => $row['id'],
        'name' => $row['name'],
        'username' => $row['username'],
        'role' => $row['role'],
        'email' => $row['email'],
        'phone' => $row['phone'],
        'isActive' => (bool) (int) $row['is_active'],
        'branchId' => $row['branch_id'],
        'ownerId' => $ownerId,
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
    $ownerId = auth_row_owner_id($row);
    $token = Auth::issueToken([
        'id' => $row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'role' => $row['role'],
        'branchId' => $row['branch_id'],
        'ownerId' => $ownerId,
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
            'ownerId' => $ownerId,
        ],
    ];
}

function auth_login(array $params): void
{
    $body = read_json_body();
    $identifier = trim((string) ($body['username'] ?? $body['email'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($identifier === '' || $password === '') {
        json_error('Username or email and password are required.', 400);
    }

    $pdo = Database::pdo();
    $stmt = $pdo->prepare(auth_user_select_sql() . ' WHERE u.username = ? OR u.email = ? LIMIT 1');
    $stmt->execute([$identifier, $identifier]);
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
    $password = (string) ($body['password'] ?? '');
    $shopName = trim((string) ($body['shopName'] ?? $body['shop_name'] ?? ''));
    $phone = trim((string) ($body['phone'] ?? ''));
    $email = trim((string) ($body['email'] ?? ''));

    if ($name === '' || $email === '' || $password === '') {
        json_error('Name, email, and password are required.', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Please enter a valid email address.', 400);
    }
    if (strlen($password) < 6) {
        json_error('Password must be at least 6 characters.', 400);
    }

    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $check->execute([$email]);
    if ($check->fetch()) {
        json_error('Email already registered. Please sign in instead.', 400);
    }

    try {
        Database::begin();
        $now = now_sql();
        $userId = uuid_v4();
        // New shop = new owner_id (self). Never attach to another admin's data.
        $ownerId = $userId;

        $branchId = uuid_v4();
        $pdo->prepare(
            'INSERT INTO branches (id, name, address, phone, owner_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?)'
        )->execute([
            $branchId,
            $shopName !== '' ? $shopName : 'Default Store',
            null,
            $phone !== '' ? $phone : null,
            $ownerId,
            $now,
            $now,
        ]);

        // Use email prefix as display username for backward compatibility
        $generatedUsername = explode('@', $email, 2)[0];
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $pdo->prepare(
            'INSERT INTO users (id, name, username, password_hash, role, email, phone, is_active, branch_id, owner_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,1,?,?,?,?)'
        )->execute([
            $userId,
            $name,
            $generatedUsername,
            $hash,
            'OWNER',
            $email,
            $phone !== '' ? $phone : null,
            $branchId,
            $ownerId,
            $now,
            $now,
        ]);

        // Default bank accounts for THIS shop only
        $pdo->prepare(
            'INSERT INTO bank_accounts (id, name, type, balance, is_active, owner_id, created_at, updated_at)
             VALUES (?,?,?,0,1,?,?,?)'
        )->execute([uuid_v4(), 'Cash Drawer', 'CASH', $ownerId, $now, $now]);
        $pdo->prepare(
            'INSERT INTO bank_accounts (id, name, type, balance, is_active, owner_id, created_at, updated_at)
             VALUES (?,?,?,0,1,?,?,?)'
        )->execute([uuid_v4(), 'Main Bank', 'BANK', $ownerId, $now, $now]);

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

function auth_change_password(array $params): void
{
    $auth = Auth::requireUser();
    $body = read_json_body();
    $currentPassword = (string) ($body['currentPassword'] ?? '');
    $newPassword = (string) ($body['newPassword'] ?? '');

    if ($currentPassword === '' || $newPassword === '') {
        json_error('Current password and new password are required.', 400);
    }
    if (strlen($newPassword) < 6) {
        json_error('New password must be at least 6 characters.', 400);
    }

    $pdo = Database::pdo();
    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$auth['id']]);
    $row = $stmt->fetch();

    if (!$row) {
        json_error('User not found.', 404);
    }
    if (!password_verify($currentPassword, $row['password_hash'])) {
        json_error('Current password is incorrect.', 400);
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);
    $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        ->execute([$hash, now_sql(), $auth['id']]);

    json_response(['message' => 'Password changed successfully.']);
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
    $user = Auth::requireUser();
    if ($user['role'] === 'SUPER_ADMIN') {
        $stmt = $pdo->query(auth_user_select_sql() . ' ORDER BY u.created_at DESC');
        $rows = $stmt->fetchAll();
    } else {
        $ownerId = tenant_owner_id();
        $stmt = $pdo->prepare(auth_user_select_sql() . ' WHERE u.owner_id = ? ORDER BY u.created_at DESC');
        $stmt->execute([$ownerId]);
        $rows = $stmt->fetchAll();
    }
    $users = array_map(static fn($r) => auth_format_user($r), $rows);
    json_response($users);
}

function auth_users_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    $role = strtoupper(trim((string) ($body['role'] ?? '')));
    $email = trim((string) ($body['email'] ?? ''));
    $phone = $body['phone'] ?? null;
    $branchId = $body['branchId'] ?? null;

    if ($name === '' || $email === '' || $password === '' || $role === '') {
        json_error('Name, email, password, and role are required.', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Please enter a valid email address.', 400);
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
    $ownerId = tenant_owner_id();
    $pdo = Database::pdo();
    $check = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $check->execute([$email]);
    if ($check->fetch()) {
        json_error('Email already exists.', 400);
    }

    if ($branchId) {
        // Branch must belong to this shop
        $bst = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
        $bst->execute([$branchId, $ownerId]);
        if (!$bst->fetch()) {
            json_error('Branch not found for your shop.', 400);
        }
    } else {
        $branchId = $actor['branchId'] ?? null;
        if ($branchId) {
            $bst = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
            $bst->execute([$branchId, $ownerId]);
            if (!$bst->fetch()) {
                $branchId = null;
            }
        }
        if (!$branchId) {
            $bst = $pdo->prepare('SELECT id FROM branches WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1');
            $bst->execute([$ownerId]);
            $branchId = $bst->fetchColumn() ?: null;
        }
    }

    $id = uuid_v4();
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $now = now_sql();
    $generatedUsername = explode('@', $email, 2)[0];

    $stmt = $pdo->prepare(
        'INSERT INTO users (id, name, username, password_hash, role, email, phone, is_active, branch_id, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $id,
        $name,
        $generatedUsername,
        $hash,
        $role,
        $email,
        $phone ?: null,
        $branchId ?: null,
        $ownerId,
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
    $authUser = Auth::requireUser();

    if ($authUser['role'] === 'SUPER_ADMIN') {
        $exists = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $exists->execute([$id]);
    } else {
        $ownerId = tenant_owner_id();
        $exists = $pdo->prepare('SELECT id FROM users WHERE id = ? AND owner_id = ? LIMIT 1');
        $exists->execute([$id, $ownerId]);
    }
    if (!$exists->fetch()) {
        json_error('User not found.', 404);
    }

    $fields = [];
    $values = [];

    foreach (['name' => 'name', 'role' => 'role', 'email' => 'email', 'phone' => 'phone'] as $json => $col) {
        if (array_key_exists($json, $body)) {
            // Check email uniqueness when changing email
            if ($col === 'email') {
                $newEmail = trim((string) $body[$json]);
                if ($newEmail !== '') {
                    $chk = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1');
                    $chk->execute([$newEmail, $id]);
                    if ($chk->fetch()) {
                        json_error('Email is already in use by another user.', 400);
                    }
                }
            }
            $fields[] = "{$col} = ?";
            $values[] = $body[$json];
        }
    }
    if (array_key_exists('branchId', $body)) {
        $bid = $body['branchId'] ?: null;
        if ($bid) {
            if ($authUser['role'] === 'SUPER_ADMIN') {
                $bst = $pdo->prepare('SELECT id FROM branches WHERE id = ? LIMIT 1');
                $bst->execute([$bid]);
            } else {
                $ownerId = tenant_owner_id();
                $bst = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
                $bst->execute([$bid, $ownerId]);
            }
            if (!$bst->fetch()) {
                json_error('Branch not found.', 400);
            }
        }
        $fields[] = 'branch_id = ?';
        $values[] = $bid;
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
        if ($authUser['role'] === 'SUPER_ADMIN') {
            $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
        } else {
            $ownerId = tenant_owner_id();
            $values[] = $ownerId;
            $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ? AND owner_id = ?';
        }
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
    $authUser = Auth::requireUser();
    if ($authUser['role'] === 'SUPER_ADMIN') {
        $stmt = $pdo->prepare('SELECT is_active FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
    } else {
        $ownerId = tenant_owner_id();
        $stmt = $pdo->prepare('SELECT is_active FROM users WHERE id = ? AND owner_id = ? LIMIT 1');
        $stmt->execute([$id, $ownerId]);
    }
    $user = $stmt->fetch();
    if (!$user) {
        json_error('User not found.', 404);
    }
    if ($authUser['role'] !== 'SUPER_ADMIN') {
        $ownerId = tenant_owner_id();
        if ($id === $ownerId) {
            json_error('Cannot deactivate the shop owner account.', 400);
        }
    }
    $new = (int) $user['is_active'] ? 0 : 1;
    if ($authUser['role'] === 'SUPER_ADMIN') {
        $pdo->prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
            ->execute([$new, now_sql(), $id]);
    } else {
        $ownerId = tenant_owner_id();
        $pdo->prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$new, now_sql(), $id, $ownerId]);
    }
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
    $st = $pdo->prepare('SELECT * FROM branches WHERE owner_id = ? ORDER BY name ASC');
    $st->execute([tenant_owner_id()]);
    json_response(array_map('auth_format_branch', $st->fetchAll()));
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
    $ownerId = tenant_owner_id();
    $pdo = Database::pdo();
    $pdo->prepare(
        'INSERT INTO branches (id, name, address, phone, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $name,
        $body['address'] ?? null,
        $body['phone'] ?? null,
        $ownerId,
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
    $ownerId = tenant_owner_id();
    $pdo->prepare(
        'UPDATE branches SET name = ?, address = ?, phone = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?'
    )->execute([
        $name,
        $body['address'] ?? null,
        $body['phone'] ?? null,
        now_sql(),
        $id,
        $ownerId,
    ]);
    $row = $pdo->prepare('SELECT * FROM branches WHERE id = ? AND owner_id = ?');
    $row->execute([$id, $ownerId]);
    $b = $row->fetch();
    if (!$b) {
        json_error('Branch not found.', 404);
    }
    json_response(auth_format_branch($b));
}

function auth_branches_delete(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $chk = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
    $chk->execute([$id, $ownerId]);
    if (!$chk->fetch()) {
        json_error('Branch not found.', 404);
    }
    try {
        Database::begin();
        $pdo->prepare('DELETE FROM branch_stocks WHERE branch_id = ?')->execute([$id]);
        $pdo->prepare('UPDATE users SET branch_id = NULL WHERE branch_id = ? AND owner_id = ?')
            ->execute([$id, $ownerId]);
        $pdo->prepare('DELETE FROM daily_closings WHERE branch_id = ? AND owner_id = ?')
            ->execute([$id, $ownerId]);
        $pdo->prepare('DELETE FROM branches WHERE id = ? AND owner_id = ?')->execute([$id, $ownerId]);
        Database::commit();
        json_response(['message' => 'Branch deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to delete branch.', 500);
    }
}

function auth_data_counts(array $params): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();

    $q = static function (string $sql, array $args = []) use ($pdo) {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return (int) $st->fetchColumn();
    };

    $counts = [
        'sales_records' => $q('SELECT COUNT(*) FROM sales WHERE owner_id = ?', [$ownerId]),
        'invoices' => $q('SELECT COUNT(*) FROM transactions WHERE owner_id = ? OR bank_account_id IN (SELECT id FROM bank_accounts WHERE owner_id = ?)', [$ownerId, $ownerId]),
        'installments' => $q('SELECT COUNT(*) FROM sale_emis WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)', [$ownerId]),
        'expenses' => $q('SELECT COUNT(*) FROM expenses WHERE owner_id = ?', [$ownerId]),
        'warranty_claims' => $q('SELECT COUNT(*) FROM warranty_claims WHERE owner_id = ?', [$ownerId]),
        'purchase_orders' => $q('SELECT COUNT(*) FROM purchase_orders WHERE owner_id = ?', [$ownerId]),
        'products' => $q('SELECT COUNT(*) FROM products WHERE owner_id = ?', [$ownerId]),
        'categories' => $q('SELECT COUNT(*) FROM categories WHERE owner_id = ?', [$ownerId]),
        'brands' => $q('SELECT COUNT(*) FROM brands WHERE owner_id = ?', [$ownerId]),
        'customers' => $q('SELECT COUNT(*) FROM customers WHERE owner_id = ?', [$ownerId]),
        'suppliers' => $q('SELECT COUNT(*) FROM suppliers WHERE owner_id = ?', [$ownerId]),
        'staff' => $q("SELECT COUNT(*) FROM users WHERE owner_id = ? AND role != 'OWNER'", [$ownerId]),
        'branches' => $q('SELECT COUNT(*) FROM branches WHERE owner_id = ?', [$ownerId]),
    ];

    json_response($counts);
}

function auth_reset_transactions(array $params): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $body = read_json_body();
    $types = (array) ($body['types'] ?? []);

    $allowed = ['sales_records', 'invoices', 'installments', 'expenses', 'warranty_claims', 'purchase_orders', 'products', 'categories', 'brands', 'customers', 'suppliers', 'staff', 'branches'];
    $types = array_intersect($types, $allowed);

    if (empty($types)) {
        json_error('No valid data types selected. Choose at least one type to clear.', 400);
    }

    try {
        Database::begin();

        // Build a lookup for quick checks
        $t = array_flip($types);

        if (isset($t['installments'])) {
            $pdo->prepare(
                'DELETE FROM emi_installments WHERE sale_emi_id IN (
                    SELECT se.id FROM sale_emis se
                    INNER JOIN sales s ON s.id = se.sale_id WHERE s.owner_id = ?
                )'
            )->execute([$ownerId]);
            $pdo->prepare(
                'DELETE FROM sale_emis WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)'
            )->execute([$ownerId]);
        }

        if (isset($t['sales_records'])) {
            $pdo->prepare(
                'DELETE FROM sale_return_items WHERE sale_return_id IN (
                    SELECT sr.id FROM sale_returns sr
                    INNER JOIN sales s ON s.id = sr.sale_id WHERE s.owner_id = ?
                )'
            )->execute([$ownerId]);
            $pdo->prepare(
                'DELETE FROM sale_returns WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)'
            )->execute([$ownerId]);
            $pdo->prepare(
                'DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)'
            )->execute([$ownerId]);
            $pdo->prepare('DELETE FROM sales WHERE owner_id = ?')->execute([$ownerId]);
            $pdo->prepare(
                'DELETE FROM customer_credit_payments WHERE customer_id IN (
                    SELECT id FROM customers WHERE owner_id = ?
                )'
            )->execute([$ownerId]);
            $pdo->prepare('UPDATE customers SET credit_balance = 0, reward_points = 0 WHERE owner_id = ?')
                ->execute([$ownerId]);
            $pdo->prepare('UPDATE bank_accounts SET balance = 0 WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['warranty_claims'])) {
            $pdo->prepare('DELETE FROM warranty_claims WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['purchase_orders'])) {
            $pdo->prepare(
                'DELETE FROM purchase_items WHERE purchase_order_id IN (
                    SELECT id FROM purchase_orders WHERE owner_id = ?
                )'
            )->execute([$ownerId]);
            $pdo->prepare(
                'DELETE FROM supplier_payments WHERE supplier_id IN (
                    SELECT id FROM suppliers WHERE owner_id = ?
                )'
            )->execute([$ownerId]);
            $pdo->prepare('DELETE FROM purchase_orders WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['expenses'])) {
            $pdo->prepare('DELETE FROM expenses WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['invoices'])) {
            $pdo->prepare(
                'DELETE FROM transactions WHERE bank_account_id IN (
                    SELECT id FROM bank_accounts WHERE owner_id = ?
                ) OR owner_id = ?'
            )->execute([$ownerId, $ownerId]);
            $pdo->prepare('DELETE FROM daily_closings WHERE owner_id = ?')->execute([$ownerId]);
        }

        // ── Master Records (normally preserved) ──────────────────────────
        if (isset($t['branches'])) {
            $pdo->prepare('DELETE FROM branch_stocks WHERE branch_id IN (SELECT id FROM branches WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('UPDATE users SET branch_id = NULL WHERE owner_id = ? AND role != ?')
                ->execute([$ownerId, 'OWNER']);
            $pdo->prepare('DELETE FROM daily_closings WHERE owner_id = ?')->execute([$ownerId]);
            $pdo->prepare('DELETE FROM branches WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['staff'])) {
            $pdo->prepare('DELETE FROM users WHERE owner_id = ? AND role != ?')->execute([$ownerId, 'OWNER']);
        }

        if (isset($t['customers'])) {
            $pdo->prepare('DELETE FROM customer_credit_payments WHERE customer_id IN (SELECT id FROM customers WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM customers WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['suppliers'])) {
            $pdo->prepare('DELETE FROM supplier_payments WHERE supplier_id IN (SELECT id FROM suppliers WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM suppliers WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['categories'])) {
            $pdo->prepare('UPDATE products SET category_id = NULL WHERE category_id IN (SELECT id FROM categories WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM categories WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['brands'])) {
            $pdo->prepare('UPDATE products SET brand_id = NULL WHERE brand_id IN (SELECT id FROM brands WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM brands WHERE owner_id = ?')->execute([$ownerId]);
        }

        if (isset($t['products'])) {
            $pdo->prepare('DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM branch_stocks WHERE product_id IN (SELECT id FROM products WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM sale_items WHERE product_id IN (SELECT id FROM products WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM purchase_items WHERE product_id IN (SELECT id FROM products WHERE owner_id = ?)')
                ->execute([$ownerId]);
            $pdo->prepare('DELETE FROM products WHERE owner_id = ?')->execute([$ownerId]);
        }

        // Always clean up audit/log data
        $pdo->prepare('DELETE FROM stock_movements WHERE owner_id = ?')->execute([$ownerId]);
        $pdo->prepare(
            'DELETE FROM activity_logs WHERE user_id IN (SELECT id FROM users WHERE owner_id = ?)'
        )->execute([$ownerId]);

        // Always clean repair jobs (tied to warranty/sales context)
        $pdo->prepare('DELETE FROM repair_jobs WHERE owner_id = ?')->execute([$ownerId]);

        Database::commit();

        $labels = array_map(function ($t) {
            return [
                'sales_records' => 'Sales Records',
                'invoices' => 'Invoices',
                'installments' => 'Installments',
                'expenses' => 'Expenses',
                'warranty_claims' => 'Warranty Claims',
                'purchase_orders' => 'Purchase Orders',
                'products' => 'Products',
                'categories' => 'Categories',
                'brands' => 'Brands',
                'customers' => 'Customers',
                'suppliers' => 'Suppliers',
                'staff' => 'Staff',
                'branches' => 'Shop Branches',
            ][$t] ?? $t;
        }, $types);

        json_response([
            'message' => 'Cleared: ' . implode(', ', $labels) . '.',
        ]);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to clear transaction records: ' . $e->getMessage(), 500);
    }
}

/* ---- Backups: SQL dump (+ optional ZIP with uploads) ---- */

/** Get owner_id prefix for backup filenames. */
function backup_owner_prefix(): string
{
    $ownerId = tenant_owner_id();
    return substr($ownerId, 0, 8);
}

function backup_owner_pattern(): string
{
    return backup_owner_prefix() . '-*';
}

/** Format backup filename with owner prefix and store name so backups are tenant-isolated and identifiable. */
function backup_filename(string $prefix): string
{
    $store = 'all-stores';
    $branchId = branch_id();
    if ($branchId) {
        $pdo = Database::pdo();
        $st = $pdo->prepare('SELECT name FROM branches WHERE id = ?');
        $st->execute([$branchId]);
        $name = $st->fetchColumn();
        if ($name) {
            $store = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string) $name);
        }
    }
    return backup_owner_prefix() . '-' . $store . '-' . $prefix . '-' . date('Y-m-d-His');
}

/** Check if a backup filename belongs to the current owner. */
function backup_is_owned(string $filename): bool
{
    return str_starts_with($filename, backup_owner_prefix() . '-');
}

function auth_backup_list(array $params): void
{
    ensure_dir(backups_path());
    $files = [];
    $ownerPrefix = backup_owner_prefix() . '-';
    foreach (glob(backups_path() . '/*.{sql,zip}', GLOB_BRACE) ?: [] as $full) {
        $base = basename($full);
        // Only show files belonging to this owner
        if (!str_starts_with($base, $ownerPrefix)) {
            continue;
        }
        $files[] = [
            'filename' => $base,
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

    // Prefix filename with owner_id for tenant isolation
    $ownerPrefix = backup_owner_prefix();
    $safePrefix = "{$ownerPrefix}-{$prefix}";

    if (class_exists('ZipArchive')) {
        $filename = "{$safePrefix}-{$stamp}.zip";
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
        $filename = "{$safePrefix}-{$stamp}.sql";
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
    $ownerId = tenant_owner_id();
    $ownedTables = Tenant::OWNED_TABLES;

    // Build a lookup for which tables have owner_id
    $hasOwnerId = [];
    foreach ($ownedTables as $t) {
        $hasOwnerId[$t] = true;
    }

    $out = "-- MZK POS SQL backup " . date('c') . "\n";
    $out .= "-- Owner-scoped (owner_id: {$ownerId})\n";
    $out .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";

    foreach ($tables as $table) {
        $table = (string) $table;

        // Skip users table — never export user records to prevent login issues on restore
        if ($table === 'users') {
            continue;
        }
        $create = $pdo->query('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`')->fetch(PDO::FETCH_ASSOC);
        if (!$create) {
            continue;
        }
        $createSql = $create['Create Table'] ?? null;
        foreach ($create as $k => $v) {
            if (stripos((string) $k, 'Create') !== false) {
                $createSql = $v;
                break;
            }
        }
        $out .= 'DROP TABLE IF EXISTS `' . str_replace('`', '``', $table) . "`;\n";
        $out .= $createSql . ";\n\n";

        // Export data — owner-scoped for owned tables, full for shared tables
        $isOwned = isset($hasOwnerId[$table]);
        // Tables that also have branch_id for store-scoped backups
        $branchTables = ['categories', 'brands', 'customers', 'suppliers', 'products', 'sales', 'stock_movements', 'transactions', 'daily_closings'];
        $hasBranchId = in_array($table, $branchTables, true);
        $branchId = branch_id();
        if ($table === 'system_settings') {
            // Export ALL system_settings (they may belong to any owner) and rewrite owner_id to current user
            $rows = $pdo->query('SELECT * FROM `' . str_replace('`', '``', $table) . '`')->fetchAll(PDO::FETCH_ASSOC);
        } elseif ($isOwned) {
            $sql = 'SELECT * FROM `' . str_replace('`', '``', $table) . '` WHERE owner_id = ?';
            $args = [$ownerId];
            if ($hasBranchId && $branchId) {
                $sql .= ' AND branch_id = ?';
                $args[] = $branchId;
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($args);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'branch_stocks') {
            $sql = 'SELECT bs.* FROM branch_stocks bs JOIN branches b ON b.id = bs.branch_id WHERE b.owner_id = ?';
            $args = [$ownerId];
            if ($branchId) {
                $sql .= ' AND bs.branch_id = ?';
                $args[] = $branchId;
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($args);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'purchase_items') {
            $stmt = $pdo->prepare('SELECT pi.* FROM purchase_items pi JOIN purchase_orders po ON po.id = pi.purchase_order_id WHERE po.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'sale_items') {
            $stmt = $pdo->prepare('SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'sale_returns') {
            $stmt = $pdo->prepare('SELECT sr.* FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'sale_return_items') {
            $stmt = $pdo->prepare('SELECT sri.* FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.sale_return_id JOIN sales s ON s.id = sr.sale_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'sale_emis') {
            $stmt = $pdo->prepare('SELECT se.* FROM sale_emis se JOIN sales s ON s.id = se.sale_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'emi_installments') {
            $stmt = $pdo->prepare('SELECT ei.* FROM emi_installments ei JOIN sale_emis se ON se.id = ei.sale_emi_id JOIN sales s ON s.id = se.sale_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'customer_credit_payments') {
            $stmt = $pdo->prepare('SELECT ccp.* FROM customer_credit_payments ccp JOIN customers c ON c.id = ccp.customer_id WHERE c.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'supplier_payments') {
            $stmt = $pdo->prepare('SELECT sp.* FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id WHERE s.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } elseif ($table === 'activity_logs') {
            $stmt = $pdo->prepare('SELECT al.* FROM activity_logs al JOIN users u ON u.id = al.user_id WHERE u.owner_id = ?');
            $stmt->execute([$ownerId]);
            $rows = $stmt->fetchAll();
        } else {
            $rows = $pdo->query('SELECT * FROM `' . str_replace('`', '``', $table) . '`')->fetchAll(PDO::FETCH_ASSOC);
        }
        foreach ($rows as $row) {
            // Rewrite owner_id to current user for system_settings
            if ($table === 'system_settings' && array_key_exists('owner_id', $row)) {
                $row['owner_id'] = $ownerId;
            }
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
/**
 * Import backup SQL, preserving other owners' data.
 * - DROP TABLE statements are skipped (would destroy other shops)
 * - Before INSERTing into an owner-scoped table, existing rows for this owner are removed
 * - Schema-only statements (CREATE TABLE) still run
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
    $ownerId = tenant_owner_id();
    $ownedTables = Tenant::OWNED_TABLES;
    $ownedLookup = [];
    foreach ($ownedTables as $t) {
        $ownedLookup[$t] = true;
    }

    // Parse backup owner_id from header comment for cross-store owner_id rewriting
    $backupOwnerId = null;
    if (preg_match('/^--\s+Owner-scoped\s+\(owner_id:\s*(\S+)\)/m', $sql, $m)) {
        $backupOwnerId = $m[1];
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    // ---- Clean junction / shared tables that don't have owner_id ----
    // Without cleanup, INSERTs from the backup would fail on duplicate PKs.
    $junctionCleanup = [
        "DELETE FROM app_meta",
        "DELETE FROM branch_stocks WHERE branch_id IN (SELECT id FROM branches WHERE owner_id = ?)",
        "DELETE FROM sale_return_items WHERE sale_return_id IN (SELECT id FROM sale_returns WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?))",
        "DELETE FROM sale_returns WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)",
        "DELETE FROM sale_emis WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)",
        "DELETE FROM emi_installments WHERE sale_emi_id IN (SELECT id FROM sale_emis WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?))",
        "DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE owner_id = ?)",
        "DELETE FROM purchase_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE owner_id = ?)",
        "DELETE FROM customer_credit_payments WHERE customer_id IN (SELECT id FROM customers WHERE owner_id = ?)",
        "DELETE FROM supplier_payments WHERE supplier_id IN (SELECT id FROM suppliers WHERE owner_id = ?)",
    ];
    foreach ($junctionCleanup as $cleanupSql) {
        try {
            if (str_contains($cleanupSql, '?')) {
                $pdo->prepare($cleanupSql)->execute([$ownerId]);
            } else {
                $pdo->exec($cleanupSql);
            }
        } catch (Throwable $e) {
            // table may not exist or column may be missing — ignore
        }
    }
    $pdo->exec('SET NAMES utf8mb4');

    $parts = preg_split('/;\s*[\r\n]+/', $sql) ?: [];
    $ran = 0;
    $errors = [];
    $createdTables = [];
    $insertBuffers = [];

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

        // Skip DROP TABLE (would destroy other shops' data)
        if (preg_match('/^DROP\s+TABLE/i', $stmt)) {
            continue;
        }

        // Track CREATE TABLE so we can delete old owner data before inserts
        if (preg_match('/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i', $stmt, $m)) {
            $tableName = $m[1];
            $createdTables[$tableName] = true;
            try {
                $pdo->exec($stmt);
                $ran++;
            } catch (Throwable $e) {
                $errors[] = 'CREATE: ' . substr($e->getMessage(), 0, 80);
            }
            continue;
        }

        // Before first INSERT into an owned table, delete this owner's existing data
        // Skip users table — we never overwrite user records to prevent login issues
        if (preg_match('/^INSERT\s+INTO\s+`?(\w+)`?/i', $stmt, $m)) {
            $tableName = $m[1];
            if ($tableName === 'users') {
                continue; // skip user inserts to preserve current logins
            }
            if (isset($ownedLookup[$tableName]) && !isset($insertBuffers[$tableName])) {
                $insertBuffers[$tableName] = true;
                try {
                    $pdo->prepare("DELETE FROM `{$tableName}` WHERE owner_id = ?")->execute([$ownerId]);
                } catch (Throwable $e) {
                    // table may not have owner_id column yet
                }
            }
        }

        try {
            $pdo->exec($stmt);
            $ran++;

            // Cross-store import: rewrite owner_id from backup owner to current owner
            if ($backupOwnerId !== null && $backupOwnerId !== $ownerId
                && preg_match('/^INSERT\s+INTO\s+`?(\w+)`?/i', $stmt, $ins)) {
                $insTable = $ins[1];
                if ($insTable !== 'users' && isset($ownedLookup[$insTable])) {
                    try {
                        $pdo->prepare("UPDATE `{$insTable}` SET owner_id = ? WHERE owner_id = ?")
                            ->execute([$ownerId, $backupOwnerId]);
                    } catch (Throwable $e) {
                        // table may not have owner_id column — ignore
                    }
                }
            }
        } catch (Throwable $e) {
            // MySQL error code 23000 / 1062 is for Duplicate Entry
            if (str_contains($e->getMessage(), '1062') || str_contains($e->getMessage(), 'Duplicate entry')) {
                continue;
            }
            $errors[] = substr($e->getMessage(), 0, 80) . ' @ ' . substr($stmt, 0, 60);
            if (count($errors) > 100) {
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
    if (!is_file($full) || str_contains($filename, '..') || !backup_is_owned($filename)) {
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
    if (!is_file($full) || str_contains($filename, '..') || !backup_is_owned($filename)) {
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
    if ($filename === '' || str_contains($filename, '..') || !is_file($full) || !backup_is_owned($filename)) {
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
    $ownerPrefix = backup_owner_prefix();
    $autoPattern = $ownerPrefix . '-auto-backup-*';

    // Skip if an auto-backup newer than 6 days exists for THIS owner
    $autos = glob(backups_path() . '/' . $autoPattern . '.{sql,zip}', GLOB_BRACE) ?: [];
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
        // Keep last 5 auto backups for THIS owner
        $all = glob(backups_path() . '/' . $autoPattern . '.{sql,zip}', GLOB_BRACE) ?: [];
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
