<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$path = api_path();
$method = request_method();

// Fast paths before loading full router + all modules
if ($path === 'health') {
    json_response([
        'status' => 'healthy',
        'timestamp' => date('c'),
        'backend' => 'php',
    ], 200);
}

if ($path === '' || $path === 'index.php') {
    json_response([
        'name' => 'MZK POS API',
        'backend' => 'php',
        'health' => '/api/health',
    ]);
}

// Lazy-load only the route module needed for this request (less parse time)
$segment = strtolower(explode('/', $path, 2)[0] ?? '');
$moduleMap = [
    'auth' => 'auth',
    'products' => 'products',
    'inventory' => 'inventory',
    'sales' => 'sales',
    'repairs' => 'repairs',
    'accounting' => 'accounting',
    'reports' => 'reports',
    'settings' => 'settings',
];

$router = new Router();

// Always need auth helpers when path is under a protected module — load only that file
if (isset($moduleMap[$segment])) {
    $file = __DIR__ . '/routes/' . $moduleMap[$segment] . '.php';
    require_once $file;
    $register = 'register_' . $moduleMap[$segment] . '_routes';
    if (function_exists($register)) {
        $register($router);
    }
} else {
    // Unknown prefix: load all so we still 404 cleanly
    foreach ($moduleMap as $mod) {
        require_once __DIR__ . '/routes/' . $mod . '.php';
        $register = 'register_' . $mod . '_routes';
        if (function_exists($register)) {
            $register($router);
        }
    }
}

// Sales EMI / accounting cross-calls may need sales_hydrate from sales.php — already loaded if sales/*
// repairs warranty may call sales_fetch_sale — load sales helpers if needed
if ($segment === 'repairs' && !function_exists('sales_fetch_sale')) {
    require_once __DIR__ . '/routes/sales.php';
}

$router->dispatch($method, $path);
