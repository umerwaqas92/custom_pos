<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$router = new Router();

// Health (public) — /api/health and /health via rewrite
$router->get('health', static function (): void {
    json_response([
        'status' => 'healthy',
        'timestamp' => date('c'),
        'backend' => 'php',
    ], 200);
}, true);

// Register route modules
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/products.php';
require __DIR__ . '/routes/inventory.php';
require __DIR__ . '/routes/sales.php';
require __DIR__ . '/routes/repairs.php';
require __DIR__ . '/routes/accounting.php';
require __DIR__ . '/routes/reports.php';
require __DIR__ . '/routes/settings.php';

register_auth_routes($router);
register_products_routes($router);
register_inventory_routes($router);
register_sales_routes($router);
register_repairs_routes($router);
register_accounting_routes($router);
register_reports_routes($router);
register_settings_routes($router);

$path = api_path();
// Empty path → small API info
if ($path === '' || $path === 'index.php') {
    json_response([
        'name' => 'MZK POS API',
        'backend' => 'php',
        'health' => '/api/health',
    ]);
}

$router->dispatch(request_method(), $path);
