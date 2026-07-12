<?php

declare(strict_types=1);

final class Database
{
    private static ?PDO $pdo = null;
    private static bool $tenantReady = false;

    public static function pdo(): PDO
    {
        if (!(self::$pdo instanceof PDO)) {
            global $APP_CONFIG;
            $host = $APP_CONFIG['db_host'] ?? 'localhost';
            $name = $APP_CONFIG['db_name'] ?? '';
            $user = $APP_CONFIG['db_user'] ?? '';
            $pass = $APP_CONFIG['db_pass'] ?? '';
            $port = (int) ($APP_CONFIG['db_port'] ?? 3306);
            $charset = $APP_CONFIG['db_charset'] ?? 'utf8mb4';

            $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";

            try {
                self::$pdo = new TenantPDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => true,
                    PDO::MYSQL_ATTR_FOUND_ROWS => true,
                    PDO::ATTR_TIMEOUT => 8,
                    PDO::ATTR_PERSISTENT => false,
                ]);
            } catch (PDOException $e) {
                $env = $APP_CONFIG['app_env'] ?? 'development';
                $msg = $env === 'development'
                    ? 'Database connection failed: ' . $e->getMessage()
                    : 'Database connection failed.';
                json_error($msg, 500);
            }
        }

        if (!self::$tenantReady && class_exists('Tenant')) {
            self::$tenantReady = true;
            Tenant::ensureMigrated();
        }

        return self::$pdo;
    }

    /** Connected PDO without side effects (used by Tenant migration). */
    public static function pdoRaw(): ?PDO
    {
        return self::$pdo;
    }

    public static function begin(): void
    {
        self::pdo()->beginTransaction();
    }

    public static function commit(): void
    {
        if (self::pdo()->inTransaction()) {
            self::pdo()->commit();
        }
    }

    public static function rollBack(): void
    {
        if (self::pdo()->inTransaction()) {
            self::pdo()->rollBack();
        }
    }
}

class TenantPDO extends PDO
{
    #[\ReturnTypeWillChange]
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $query = $this->rewriteSql($query);
        return parent::prepare($query, $options);
    }

    #[\ReturnTypeWillChange]
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $query = $this->rewriteSql($query);
        // Signature handling for different PDO::query signatures
        if ($fetchMode === null) {
            return parent::query($query);
        }
        return parent::query($query, $fetchMode, ...$fetchModeArgs);
    }

    #[\ReturnTypeWillChange]
    public function exec(string $statement): int|false
    {
        $statement = $this->rewriteSql($statement);
        return parent::exec($statement);
    }

    private function rewriteSql(string $sql): string
    {
        if (class_exists('Auth') && Auth::$user !== null && (Auth::$user['role'] ?? '') === 'SUPER_ADMIN') {
            // Rewrite u.owner_id = ? or owner_id = ? to (1=1 OR owner_id = ?)
            $sql = preg_replace('/\b(([a-zA-Z0-9_]+\.)?owner_id\s*=\s*\?)/i', '(1=1 OR $1)', $sql);
        }
        return $sql;
    }
}

