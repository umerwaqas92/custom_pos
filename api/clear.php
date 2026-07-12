<?php
declare(strict_types=1);
$key = $_GET['key'] ?? '';
if ($key !== 'mzk-install-once') {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden. Use ?key=mzk-install-once']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Missing config.php']);
    exit;
}
$cfg = require $configFile;

try {
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $cfg['db_host'],
        (int)($cfg['db_port'] ?? 3306),
        $cfg['db_name'],
        $cfg['db_charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Connection failed', 'message' => $e->getMessage()]);
    exit;
}

// All tables in dependency-safe order (children first, parents last)
$tables = [
    'emi_installments',
    'sale_emis',
    'sale_return_items',
    'sale_returns',
    'warranty_claims',
    'sale_items',
    'sales',
    'purchase_items',
    'purchase_orders',
    'supplier_payments',
    'customer_credit_payments',
    'stock_movements',
    'branch_stocks',
    'repair_jobs',
    'expenses',
    'transactions',
    'daily_closings',
    'activity_logs',
    'system_settings',
    'bank_accounts',
    'products',
    'customers',
    'suppliers',
    'brands',
    'categories',
    'users',
    'branches',
];

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$cleared = [];
foreach ($tables as $table) {
    try {
        $pdo->exec("TRUNCATE TABLE `{$table}`");
        $cleared[] = $table;
    } catch (Throwable $e) {
        $cleared[] = "{$table} (error: " . $e->getMessage() . ')';
    }
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

echo json_encode([
    'status' => 'cleared',
    'tables_cleared' => count($cleared),
    'tables' => $cleared,
    'next' => 'Sign up at /api/auth/signup to create a new admin account, or DELETE this file.',
], JSON_PRETTY_PRINT);
