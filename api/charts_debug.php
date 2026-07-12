<?php
require_once __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = Database::pdo();
    $q = "SELECT COALESCE(c.name,'Uncategorized') AS name, SUM(si.total_price) AS value
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.owner_id = '68b64198-e93d-4fff-9c28-fe67b33e5926'
         GROUP BY name ORDER BY value DESC LIMIT 10";
    $st = $pdo->query($q);
    $r = $st->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'rows' => $r]);
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
