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
function run_sql_file(PDO $pdo, string $path): array {
    if (!is_file($path)) {
        return ['ok' => false, 'error' => "File missing: $path"];
    }
    $sql = file_get_contents($path);
    $statements = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
    $ran = 0;
    $errors = [];
    foreach ($statements as $stmt) {
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            $lines = array_filter(explode("\n", $stmt), fn($l) => trim($l) !== '' && !str_starts_with(trim($l), '--'));
            if (!$lines) continue;
            $stmt = implode("\n", $lines);
            if ($stmt === '') continue;
        }
        try {
            $pdo->exec($stmt);
            $ran++;
        } catch (Throwable $e) {
            $errors[] = substr($stmt, 0, 80) . '... => ' . $e->getMessage();
        }
    }
    return ['ok' => count($errors) === 0, 'statements' => $ran, 'errors' => $errors];
}
$schema = run_sql_file($pdo, __DIR__ . '/sql/schema.sql');
$seed = run_sql_file($pdo, __DIR__ . '/sql/seed.sql');
$tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$userCount = 0;
try {
    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
} catch (Throwable $e) {}
echo json_encode([
    'status' => ($schema['ok'] && $userCount > 0) ? 'success' : 'partial',
    'connection' => ['host' => $cfg['db_host'], 'database' => $cfg['db_name'], 'user' => $cfg['db_user']],
    'schema' => $schema,
    'seed' => $seed,
    'tables' => count($tables),
    'users' => $userCount,
    'login' => ['username' => 'admin', 'password' => 'admin123'],
    'next' => 'DELETE api/install.php now for security.',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
