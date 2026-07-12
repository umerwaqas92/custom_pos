<?php

declare(strict_types=1);

/**
 * Multi-tenant isolation: every shop (OWNER) has an owner_id.
 * Staff inherit their OWNER's id. All business rows are scoped by owner_id.
 */
final class Tenant
{
    private static bool $migrated = false;

    /** Tables that store owner_id for isolation. */
    public const OWNED_TABLES = [
        'users',
        'branches',
        'categories',
        'brands',
        'products',
        'suppliers',
        'customers',
        'sales',
        'expenses',
        'bank_accounts',
        'repair_jobs',
        'purchase_orders',
        'stock_movements',
        'daily_closings',
        'system_settings',
        'transactions',
        'warranty_claims',
    ];

    /**
     * Ensure owner_id columns exist and backfill once per PHP process.
     */
    public static function ensureMigrated(): void
    {
        if (self::$migrated) {
            return;
        }
        self::$migrated = true;

        try {
            $pdo = Database::pdoRaw();
            if (!$pdo) {
                return;
            }
            self::runMigration($pdo);
        } catch (Throwable $e) {
            error_log('[MZK POS Tenant migrate] ' . $e->getMessage());
        }
    }

    public static function runMigration(PDO $pdo): void
    {
        // Marker: if users.owner_id exists and at least one OWNER has owner_id set, still re-check other tables
        foreach (self::OWNED_TABLES as $table) {
            if (!self::tableExists($pdo, $table)) {
                continue;
            }
            if (!self::columnExists($pdo, $table, 'owner_id')) {
                try {
                    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `owner_id` CHAR(36) NULL DEFAULT NULL");
                } catch (Throwable $e) {
                    // race / already added
                }
                try {
                    $pdo->exec("ALTER TABLE `{$table}` ADD KEY `idx_{$table}_owner` (`owner_id`)");
                } catch (Throwable $e) {
                    // index may exist
                }
            }
        }

        // Per-owner uniqueness (drop global uniques that break multi-shop)
        self::relaxUniques($pdo);

        // Backfill users: each OWNER owns themselves
        try {
            $pdo->exec("UPDATE users SET owner_id = id WHERE role = 'OWNER' AND (owner_id IS NULL OR owner_id = '')");
        } catch (Throwable $e) {
        }

        // Primary owner = earliest OWNER (legacy shared data goes here)
        $primaryOwnerId = null;
        try {
            $primaryOwnerId = $pdo->query(
                "SELECT id FROM users WHERE role = 'OWNER' ORDER BY created_at ASC LIMIT 1"
            )->fetchColumn() ?: null;
        } catch (Throwable $e) {
        }
        if (!$primaryOwnerId) {
            try {
                $primaryOwnerId = $pdo->query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')->fetchColumn() ?: null;
            } catch (Throwable $e) {
            }
        }
        if (!$primaryOwnerId) {
            return;
        }

        // Staff without owner_id: attach to primary owner (or branch owner's owner)
        try {
            $pdo->exec(
                "UPDATE users SET owner_id = " . $pdo->quote($primaryOwnerId) .
                " WHERE (owner_id IS NULL OR owner_id = '') AND role <> 'OWNER'"
            );
        } catch (Throwable $e) {
        }

        // Backfill all business tables
        foreach (self::OWNED_TABLES as $table) {
            if ($table === 'users') {
                continue;
            }
            if (!self::tableExists($pdo, $table) || !self::columnExists($pdo, $table, 'owner_id')) {
                continue;
            }
            try {
                $pdo->exec(
                    "UPDATE `{$table}` SET owner_id = " . $pdo->quote($primaryOwnerId) .
                    " WHERE owner_id IS NULL OR owner_id = ''"
                );
            } catch (Throwable $e) {
            }
        }
    }

    private static function relaxUniques(PDO $pdo): void
    {
        $drops = [
            ['categories', 'uq_categories_name'],
            ['brands', 'uq_brands_name'],
            ['products', 'uq_products_sku'],
            ['products', 'uq_products_barcode'],
            ['products', 'uq_products_qr'],
            ['customers', 'uq_customers_phone'],
            ['system_settings', 'uq_settings_key'],
            ['system_settings', 'key'],
        ];
        foreach ($drops as [$table, $index]) {
            if (!self::tableExists($pdo, $table)) {
                continue;
            }
            try {
                $pdo->exec("ALTER TABLE `{$table}` DROP INDEX `{$index}`");
            } catch (Throwable $e) {
            }
        }

        $adds = [
            ['categories', 'uq_cat_owner_name', '(owner_id, name)'],
            ['brands', 'uq_brand_owner_name', '(owner_id, name)'],
            ['products', 'uq_prod_owner_sku', '(owner_id, sku)'],
            ['customers', 'uq_cust_owner_phone', '(owner_id, phone)'],
            ['system_settings', 'uq_settings_owner_key', '(owner_id, `key`)'],
        ];
        foreach ($adds as [$table, $index, $cols]) {
            if (!self::tableExists($pdo, $table)) {
                continue;
            }
            try {
                $pdo->exec("ALTER TABLE `{$table}` ADD UNIQUE KEY `{$index}` {$cols}");
            } catch (Throwable $e) {
            }
        }
    }

    private static function tableExists(PDO $pdo, string $table): bool
    {
        try {
            $st = $pdo->prepare(
                'SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1'
            );
            $st->execute([$table]);
            return (bool) $st->fetchColumn();
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function columnExists(PDO $pdo, string $table, string $column): bool
    {
        try {
            $st = $pdo->prepare(
                'SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1'
            );
            $st->execute([$table, $column]);
            return (bool) $st->fetchColumn();
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Current shop owner id (OWNER's user id). Requires authenticated user.
     */
    public static function ownerId(): string
    {
        $user = Auth::requireUser();
        $oid = $user['ownerId'] ?? null;
        if (is_string($oid) && $oid !== '') {
            return $oid;
        }
        // Fallback: OWNER is self
        if (($user['role'] ?? '') === 'OWNER') {
            return (string) $user['id'];
        }
        // Staff without ownerId in token — load once
        $pdo = Database::pdo();
        $st = $pdo->prepare('SELECT owner_id, role FROM users WHERE id = ? LIMIT 1');
        $st->execute([$user['id']]);
        $row = $st->fetch();
        if ($row && !empty($row['owner_id'])) {
            Auth::$user['ownerId'] = (string) $row['owner_id'];
            return (string) $row['owner_id'];
        }
        if ($row && ($row['role'] ?? '') === 'OWNER') {
            Auth::$user['ownerId'] = (string) $user['id'];
            return (string) $user['id'];
        }
        json_error('Account is not linked to a shop. Contact support.', 403);
        return ''; // unreachable
    }

    /** SQL fragment + bind value for owner filter. */
    public static function where(string $column = 'owner_id'): array
    {
        return ["{$column} = ?", [self::ownerId()]];
    }

    /** Assert a row belongs to current tenant; 404 if not. */
    public static function assertOwned(?array $row, string $notFound = 'Not found.'): array
    {
        if (!$row) {
            json_error($notFound, 404);
        }
        $oid = self::ownerId();
        if (isset($row['owner_id']) && (string) $row['owner_id'] !== '' && (string) $row['owner_id'] !== $oid) {
            json_error($notFound, 404);
        }
        return $row;
    }

    /** Fetch one owned row or 404. */
    public static function fetchOwned(PDO $pdo, string $table, string $id, string $notFound = 'Not found.'): array
    {
        $st = $pdo->prepare("SELECT * FROM `{$table}` WHERE id = ? AND owner_id = ? LIMIT 1");
        $st->execute([$id, self::ownerId()]);
        $row = $st->fetch();
        if (!$row) {
            json_error($notFound, 404);
        }
        return $row;
    }
}

/** Shortcut used in route files. */
function tenant_owner_id(): string
{
    return Tenant::ownerId();
}
