<?php
declare(strict_types=1);
$key = $_GET['key'] ?? '';
if ($key !== 'mzk-install-once') {
    http_response_code(403);
    echo 'Forbidden';
    exit;
}
header('Content-Type: application/json; charset=utf-8');

$cfg = require __DIR__ . '/config.php';
$dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $cfg['db_host'], (int)($cfg['db_port'] ?? 3306), $cfg['db_name'], $cfg['db_charset'] ?? 'utf8mb4');
$pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$ownerId = $_GET['owner'] ?? '';
if ($ownerId === '') {
    echo json_encode(['error' => 'Missing ?owner=YOUR_OWNER_ID']);
    exit;
}

function fixDate($val): string {
    if ($val === null || $val === '0000-00-00 00:00:00' || $val === '') {
        return date('Y-m-d H:i:s');
    }
    // Check if it's a Unix millisecond timestamp (13+ digits)
    if (is_numeric($val) && strlen((string)(int)$val) >= 13) {
        return date('Y-m-d H:i:s', (int)((int)$val / 1000));
    }
    // Check if it's a Unix second timestamp (10 digits)
    if (is_numeric($val) && strlen((string)(int)$val) >= 10 && (int)$val > 1000000000) {
        return date('Y-m-d H:i:s', (int)$val);
    }
    return $val;
}

$dateColumns = [
    'sales' => ['sale_date', 'created_at', 'updated_at'],
    'sale_items' => [],
    'products' => ['created_at', 'updated_at'],
    'customers' => ['created_at', 'updated_at'],
    'suppliers' => ['created_at', 'updated_at'],
    'categories' => ['created_at', 'updated_at'],
    'brands' => ['created_at', 'updated_at'],
    'purchase_orders' => ['order_date', 'created_at', 'updated_at'],
    'purchase_items' => [],
    'repair_jobs' => ['created_at', 'updated_at', 'estimated_delivery'],
    'warranty_claims' => ['claim_date', 'created_at', 'updated_at'],
    'stock_movements' => ['created_at'],
    'expenses' => ['date', 'created_at'],
    'bank_accounts' => ['created_at', 'updated_at'],
    'transactions' => ['created_at'],
    'daily_closings' => ['closing_date', 'created_at', 'updated_at'],
    'sale_emis' => ['created_at', 'updated_at'],
    'emi_installments' => ['due_date', 'paid_date', 'created_at', 'updated_at'],
    'sale_returns' => ['return_date', 'created_at', 'updated_at'],
    'sale_return_items' => [],
    'customer_credit_payments' => ['payment_date'],
    'supplier_payments' => ['payment_date'],
    'activity_logs' => ['created_at'],
    'system_settings' => ['created_at', 'updated_at'],
    'users' => ['created_at', 'updated_at'],
    'branches' => ['created_at', 'updated_at'],
];

$fixed = 0;
$errors = [];
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

foreach ($dateColumns as $table => $cols) {
    if (empty($cols)) continue;
    try {
        $st = $pdo->query("SELECT * FROM `{$table}` WHERE owner_id = '{$ownerId}' LIMIT 1000");
        while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
            $sets = [];
            $vals = [];
            foreach ($cols as $col) {
                if (isset($row[$col])) {
                    $fixedVal = fixDate($row[$col]);
                    if ($fixedVal !== $row[$col]) {
                        $sets[] = "`{$col}` = ?";
                        $vals[] = $fixedVal;
                    }
                }
            }
            if (!empty($sets)) {
                $vals[] = $row['id'];
                $upd = $pdo->prepare("UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE id = ?");
                $upd->execute($vals);
                $fixed++;
            }
        }
    } catch (Throwable $e) {
        $errors[] = $table . ': ' . $e->getMessage();
    }
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=1');

echo json_encode([
    'status' => 'ok',
    'rows_fixed' => $fixed,
    'errors' => $errors,
]);
