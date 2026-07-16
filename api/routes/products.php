<?php

declare(strict_types=1);

function register_products_routes(Router $router): void
{
    // Specific paths before :id
    $router->get('products/suggest', 'products_suggest');
    $router->get('products/categories', 'products_categories_list');
    $router->post('products/categories', 'products_categories_create', false, ['OWNER', 'MANAGER']);
    $router->put('products/categories/:id', 'products_categories_update', false, ['OWNER', 'MANAGER']);
    $router->delete('products/categories/:id', 'products_categories_delete', false, ['OWNER', 'MANAGER']);
    $router->post('products/categories/bulk-delete', 'products_categories_bulk_delete', false, ['OWNER', 'MANAGER']);

    $router->get('products/brands', 'products_brands_list');
    $router->post('products/brands', 'products_brands_create', false, ['OWNER', 'MANAGER']);
    $router->put('products/brands/:id', 'products_brands_update', false, ['OWNER', 'MANAGER']);
    $router->delete('products/brands/:id', 'products_brands_delete', false, ['OWNER', 'MANAGER']);
    $router->post('products/brands/bulk-delete', 'products_brands_bulk_delete', false, ['OWNER', 'MANAGER']);

    $router->post('products/bulk-delete', 'products_bulk_delete', false, ['OWNER']);
    $router->get('products', 'products_list');
    $router->get('products/:id', 'products_get');
    $router->post('products', 'products_create', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);
    $router->put('products/:id', 'products_update', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);
    $router->delete('products/:id', 'products_delete', false, ['OWNER']);
}

function products_format_category(array $r): array
{
    return [
        'id' => $r['id'],
        'name' => $r['name'],
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
    ];
}

function products_format_brand(array $r): array
{
    return products_format_category($r);
}

function products_format_product(array $r, array $extras = []): array
{
    $images = $r['images'] ?? '[]';
    if (is_string($images)) {
        $decoded = json_decode($images, true);
        $images = is_array($decoded) ? $decoded : [];
    }

    $out = [
        'id' => $r['id'],
        'name' => $r['name'],
        'sku' => $r['sku'],
        'barcode' => $r['barcode'],
        'qrCode' => $r['qr_code'] ?? null,
        'categoryId' => $r['category_id'] ?? null,
        'brandId' => $r['brand_id'] ?? null,
        'model' => $r['model'] ?? null,
        'serialNumber' => $r['serial_number'] ?? null,
        'imei' => $r['imei'] ?? null,
        'color' => $r['color'] ?? null,
        'storage' => $r['storage'] ?? null,
        'ram' => $r['ram'] ?? null,
        'processor' => $r['processor'] ?? null,
        'warrantyMonths' => isset($r['warranty_months']) ? (int) $r['warranty_months'] : 0,
        'supplierId' => $r['supplier_id'] ?? null,
        'purchasePrice' => isset($r['purchase_price']) ? (float) $r['purchase_price'] : 0.0,
        'sellingPrice' => isset($r['selling_price']) ? (float) $r['selling_price'] : 0.0,
        'wholesalePrice' => isset($r['wholesale_price']) && $r['wholesale_price'] !== null
            ? (float) $r['wholesale_price'] : null,
        'taxRate' => isset($r['tax_rate']) ? (float) $r['tax_rate'] : 0.0,
        'discountRate' => isset($r['discount_rate']) ? (float) $r['discount_rate'] : 0.0,
        'images' => $images,
        'description' => $r['description'] ?? null,
        'weight' => isset($r['weight']) && $r['weight'] !== null ? (float) $r['weight'] : null,
        'stockQuantity' => isset($r['stock_quantity']) ? (int) $r['stock_quantity'] : 0,
        'minStock' => isset($r['min_stock']) ? (int) $r['min_stock'] : 5,
        'type' => $r['type'] ?? 'SINGLE',
        'createdAt' => $r['created_at'] ?? null,
        'updatedAt' => $r['updated_at'] ?? null,
    ];

    return array_merge($out, $extras);
}

function products_suggest(array $params): void
{
    $q = trim((string) (query_params()['q'] ?? ''));
    if ($q === '') {
        json_response(['suggestions' => []]);
    }
    if (strlen($q) > 80) {
        json_error('Query too long.', 400);
    }

    // Best-effort Google suggest; fail soft on free hosts that block outbound HTTP
    $url = 'https://suggestqueries.google.com/complete/search?output=toolbar&hl=en&q=' . rawurlencode($q);
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 4,
            'header' => "User-Agent: Mozilla/5.0\r\nAccept: application/xml\r\n",
        ],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
    ]);
    $xml = @file_get_contents($url, false, $ctx);
    if ($xml === false) {
        json_response(['suggestions' => [], 'error' => 'Suggest service unavailable.']);
    }

    $suggestions = [];
    if (preg_match_all('/<suggestion\s+data="([^"]*)"/i', $xml, $m)) {
        foreach ($m[1] as $raw) {
            $decoded = html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $decoded = trim($decoded);
            if ($decoded !== '' && !in_array($decoded, $suggestions, true)) {
                $suggestions[] = $decoded;
            }
        }
    }
    json_response(['suggestions' => array_slice($suggestions, 0, 10)]);
}

/* ---------- Categories ---------- */

function products_categories_list(array $params): void
{
    $pdo = Database::pdo();
    $branchId = branch_id();
    if ($branchId) {
        $st = $pdo->prepare('SELECT * FROM categories WHERE owner_id = ? AND branch_id = ? ORDER BY name ASC');
        $st->execute([tenant_owner_id(), $branchId]);
    } else {
        $st = $pdo->prepare('SELECT * FROM categories WHERE owner_id = ? ORDER BY name ASC');
        $st->execute([tenant_owner_id()]);
    }
    json_response(array_map('products_format_category', $st->fetchAll()));
}

function products_categories_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Name is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $exists = $pdo->prepare('SELECT id FROM categories WHERE name = ? AND owner_id = ? LIMIT 1');
    $exists->execute([$name, $ownerId]);
    if ($exists->fetch()) {
        json_error('Category already exists.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $branchId = branch_id();
    $pdo->prepare('INSERT INTO categories (id, name, owner_id, branch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id, $name, $ownerId, $branchId, $now, $now]);
    $st = $pdo->prepare('SELECT * FROM categories WHERE id = ?');
    $st->execute([$id]);
    json_response(products_format_category($st->fetch()), 201);
}

function products_categories_update(array $params): void
{
    $id = $params['id'];
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Name is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'UPDATE categories SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?';
    $args = [$name, now_sql(), $id, $ownerId];
    if ($branchId) {
        $sql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $args[] = $branchId;
    }
    $pdo->prepare($sql)->execute($args);
    $st = $pdo->prepare('SELECT * FROM categories WHERE id = ? AND owner_id = ?');
    $st->execute([$id, $ownerId]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Category not found.', 404);
    }
    json_response(products_format_category($row));
}

function products_categories_delete(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    try {
        Database::begin();
        $pdo->prepare('UPDATE products SET category_id = NULL WHERE category_id = ? AND owner_id = ?')
            ->execute([$id, $ownerId]);
        $delSql = 'DELETE FROM categories WHERE id = ? AND owner_id = ?';
        $delArgs = [$id, $ownerId];
        if ($branchId) {
            $delSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $delArgs[] = $branchId;
        }
        $pdo->prepare($delSql)->execute($delArgs);
        Database::commit();
        json_response(['message' => 'Category deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to delete category.', 500);
    }
}

function products_categories_bulk_delete(array $params): void
{
    $body = read_json_body();
    $ids = $body['ids'] ?? null;
    if (!is_array($ids) || count($ids) === 0) {
        json_error('No category IDs provided.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    try {
        Database::begin();
        $pdo->prepare("UPDATE products SET category_id = NULL WHERE category_id IN ($placeholders) AND owner_id = ?")
            ->execute(array_merge($ids, [$ownerId]));
        $delSql = "DELETE FROM categories WHERE id IN ($placeholders) AND owner_id = ?";
        $delArgs = array_merge($ids, [$ownerId]);
        if ($branchId) {
            $delSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $delArgs[] = $branchId;
        }
        $pdo->prepare($delSql)->execute($delArgs);
        Database::commit();
        json_response(['message' => count($ids) . ' categories deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to bulk delete categories.', 500);
    }
}

/* ---------- Brands ---------- */

function products_brands_list(array $params): void
{
    $pdo = Database::pdo();
    $branchId = branch_id();
    if ($branchId) {
        $st = $pdo->prepare('SELECT * FROM brands WHERE owner_id = ? AND branch_id = ? ORDER BY name ASC');
        $st->execute([tenant_owner_id(), $branchId]);
    } else {
        $st = $pdo->prepare('SELECT * FROM brands WHERE owner_id = ? ORDER BY name ASC');
        $st->execute([tenant_owner_id()]);
    }
    json_response(array_map('products_format_brand', $st->fetchAll()));
}

function products_brands_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Name is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $exists = $pdo->prepare('SELECT id FROM brands WHERE name = ? AND owner_id = ? AND (branch_id = ? OR branch_id IS NULL) LIMIT 1');
    $exists->execute([$name, $ownerId, $branchId]);
    if ($exists->fetch()) {
        json_error('Brand already exists.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $pdo->prepare('INSERT INTO brands (id, name, owner_id, branch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id, $name, $ownerId, $branchId, $now, $now]);
    $st = $pdo->prepare('SELECT * FROM brands WHERE id = ?');
    $st->execute([$id]);
    json_response(products_format_brand($st->fetch()), 201);
}

function products_brands_update(array $params): void
{
    $id = $params['id'];
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        json_error('Name is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'UPDATE brands SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?';
    $args = [$name, now_sql(), $id, $ownerId];
    if ($branchId) {
        $sql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $args[] = $branchId;
    }
    $pdo->prepare($sql)->execute($args);
    $st = $pdo->prepare('SELECT * FROM brands WHERE id = ? AND owner_id = ?');
    $st->execute([$id, $ownerId]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Brand not found.', 404);
    }
    json_response(products_format_brand($row));
}

function products_brands_delete(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    try {
        Database::begin();
        $pdo->prepare('UPDATE products SET brand_id = NULL WHERE brand_id = ? AND owner_id = ?')
            ->execute([$id, $ownerId]);
        $delSql = 'DELETE FROM brands WHERE id = ? AND owner_id = ?';
        $delArgs = [$id, $ownerId];
        if ($branchId) {
            $delSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $delArgs[] = $branchId;
        }
        $pdo->prepare($delSql)->execute($delArgs);
        Database::commit();
        json_response(['message' => 'Brand deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to delete brand.', 500);
    }
}

function products_brands_bulk_delete(array $params): void
{
    $body = read_json_body();
    $ids = $body['ids'] ?? null;
    if (!is_array($ids) || count($ids) === 0) {
        json_error('No brand IDs provided.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    try {
        Database::begin();
        $pdo->prepare("UPDATE products SET brand_id = NULL WHERE brand_id IN ($placeholders) AND owner_id = ?")
            ->execute(array_merge($ids, [$ownerId]));
        $delSql = "DELETE FROM brands WHERE id IN ($placeholders) AND owner_id = ?";
        $delArgs = array_merge($ids, [$ownerId]);
        if ($branchId) {
            $delSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $delArgs[] = $branchId;
        }
        $pdo->prepare($delSql)->execute($delArgs);
        Database::commit();
        json_response(['message' => count($ids) . ' brands deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to bulk delete brands.', 500);
    }
}

/* ---------- Products ---------- */

function products_generate_sku(PDO $pdo, string $ownerId, string $name, ?string $brandId, ?string $model): string
{
    $brandPrefix = '';
    if ($brandId) {
        $st = $pdo->prepare('SELECT name FROM brands WHERE id = ? AND owner_id = ? LIMIT 1');
        $st->execute([$brandId, $ownerId]);
        $b = $st->fetch();
        if ($b) {
            $brandPrefix = strtoupper(preg_replace('/[^A-Z0-9]+/i', '', $b['name']) ?? '');
            $brandPrefix = substr($brandPrefix, 0, 6);
        }
    }
    $modelPart = strtoupper(preg_replace('/[^A-Z0-9]+/i', '', (string) $model) ?? '');
    $modelPart = substr($modelPart, 0, 8);
    $namePart = strtoupper(preg_replace('/[^A-Z0-9]+/i', '', $name) ?? '');
    $namePart = substr($namePart, 0, 8);
    $base = ($brandPrefix !== '' ? $brandPrefix : ($namePart !== '' ? $namePart : 'PRD'));
    if ($modelPart !== '') {
        $base .= '-' . $modelPart;
    }

    for ($attempt = 0; $attempt < 8; $attempt++) {
        $suffix = strtoupper(base_convert((string) (int) (microtime(true) * 1000), 10, 36));
        $suffix = substr($suffix, -4) . strtoupper(substr(bin2hex(random_bytes(2)), 0, 2));
        $sku = substr($base . '-' . $suffix, 0, 40);
        $check = $pdo->prepare('SELECT id FROM products WHERE sku = ? AND owner_id = ? LIMIT 1');
        $check->execute([$sku, $ownerId]);
        if (!$check->fetch()) {
            return $sku;
        }
    }
    return 'PRD-' . strtoupper(base_convert((string) time(), 10, 36));
}

function products_attach_relations(PDO $pdo, array $productRow, ?string $branchFilter = null, bool $lite = false): array
{
    $ownerId = $productRow['owner_id'] ?? tenant_owner_id();
    $extras = [];
    if (!empty($productRow['category_id'])) {
        $st = $pdo->prepare('SELECT id, name FROM categories WHERE id = ? AND owner_id = ? LIMIT 1');
        $st->execute([$productRow['category_id'], $ownerId]);
        $c = $st->fetch();
        $extras['category'] = $c ? ['id' => $c['id'], 'name' => $c['name']] : null;
    } else {
        $extras['category'] = null;
    }
    if (!empty($productRow['brand_id'])) {
        $st = $pdo->prepare('SELECT id, name FROM brands WHERE id = ? AND owner_id = ? LIMIT 1');
        $st->execute([$productRow['brand_id'], $ownerId]);
        $b = $st->fetch();
        $extras['brand'] = $b ? ['id' => $b['id'], 'name' => $b['name']] : null;
    } else {
        $extras['brand'] = null;
    }

    if (!$lite) {
        if (!empty($productRow['supplier_id'])) {
            $st = $pdo->prepare('SELECT * FROM suppliers WHERE id = ? AND owner_id = ? LIMIT 1');
            $st->execute([$productRow['supplier_id'], $ownerId]);
            $s = $st->fetch();
            if ($s) {
                $extras['supplier'] = [
                    'id' => $s['id'],
                    'company' => $s['company'],
                    'contactPerson' => $s['contact_person'],
                    'phone' => $s['phone'],
                    'email' => $s['email'],
                    'address' => $s['address'],
                ];
            } else {
                $extras['supplier'] = null;
            }
        } else {
            $extras['supplier'] = null;
        }
    }

    if ($branchFilter) {
        $st = $pdo->prepare(
            'SELECT bs.branch_id, bs.quantity, b.name AS branch_name
             FROM branch_stocks bs
             LEFT JOIN branches b ON b.id = bs.branch_id
             WHERE bs.product_id = ? AND bs.branch_id = ? AND b.owner_id = ?'
        );
        $st->execute([$productRow['id'], $branchFilter, $ownerId]);
        $stocks = [];
        foreach ($st->fetchAll() as $bs) {
            $stocks[] = [
                'branchId' => $bs['branch_id'],
                'quantity' => (int) $bs['quantity'],
                'branch' => $lite ? null : ['id' => $bs['branch_id'], 'name' => $bs['branch_name']],
            ];
        }
        $extras['branchStocks'] = $stocks;
    } elseif (!$lite) {
        $st = $pdo->prepare(
            'SELECT bs.branch_id, bs.quantity, b.id AS b_id, b.name AS b_name
             FROM branch_stocks bs
             LEFT JOIN branches b ON b.id = bs.branch_id
             WHERE bs.product_id = ? AND b.owner_id = ?'
        );
        $st->execute([$productRow['id'], $ownerId]);
        $stocks = [];
        foreach ($st->fetchAll() as $bs) {
            $stocks[] = [
                'branchId' => $bs['branch_id'],
                'quantity' => (int) $bs['quantity'],
                'branch' => $bs['b_id'] ? ['id' => $bs['b_id'], 'name' => $bs['b_name']] : null,
            ];
        }
        $extras['branchStocks'] = $stocks;
    }

    return products_format_product($productRow, $extras);
}

function products_list(array $params): void
{
    $q = query_params();
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $isLite = isset($q['lite']) && ($q['lite'] === '1' || $q['lite'] === 'true');
    $branchFilter = isset($q['branchId']) && $q['branchId'] !== '' ? (string) $q['branchId'] : branch_id();

    $where = ['p.owner_id = ?'];
    $args = [$ownerId];
    if ($branchFilter) {
        $where[] = 'p.branch_id = ?';
        $args[] = $branchFilter;
    }
    if (!empty($q['sku'])) {
        $where[] = 'p.sku = ?';
        $args[] = (string) $q['sku'];
    }
    if (!empty($q['barcode'])) {
        $where[] = 'p.barcode = ?';
        $args[] = (string) $q['barcode'];
    }
    if (!empty($q['category'])) {
        $where[] = 'p.category_id = ?';
        $args[] = (string) $q['category'];
    }
    if (!empty($q['brand'])) {
        $where[] = 'p.brand_id = ?';
        $args[] = (string) $q['brand'];
    }
    if (!empty($q['search'])) {
        $s = '%' . (string) $q['search'] . '%';
        $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.model LIKE ? OR p.serial_number LIKE ? OR p.imei LIKE ?)';
        array_push($args, $s, $s, $s, $s, $s, $s);
    }

    // Single query with category/brand joins (avoids 2 queries per product)
    $sql = 'SELECT p.*,
                   c.id AS cat_id, c.name AS cat_name,
                   b.id AS brand_join_id, b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id AND c.owner_id = p.owner_id
            LEFT JOIN brands b ON b.id = p.brand_id AND b.owner_id = p.owner_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY p.name ASC
            LIMIT 1000';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    if (!$rows) {
        json_response([]);
    }

    $productIds = array_column($rows, 'id');
    $placeholders = implode(',', array_fill(0, count($productIds), '?'));

    // Batch branch stocks
    $stocksByProduct = array_fill_keys($productIds, []);
    if ($branchFilter) {
        $st = $pdo->prepare(
            "SELECT bs.product_id, bs.branch_id, bs.quantity, br.name AS branch_name
             FROM branch_stocks bs
             LEFT JOIN branches br ON br.id = bs.branch_id
             WHERE bs.branch_id = ? AND bs.product_id IN ($placeholders)"
        );
        $st->execute(array_merge([$branchFilter], $productIds));
    } elseif (!$isLite) {
        $st = $pdo->prepare(
            "SELECT bs.product_id, bs.branch_id, bs.quantity, br.name AS branch_name
             FROM branch_stocks bs
             LEFT JOIN branches br ON br.id = bs.branch_id
             WHERE bs.product_id IN ($placeholders)"
        );
        $st->execute($productIds);
    } else {
        $st = null;
    }
    if ($st) {
        foreach ($st->fetchAll() as $bs) {
            $stocksByProduct[$bs['product_id']][] = [
                'branchId' => $bs['branch_id'],
                'quantity' => (int) $bs['quantity'],
                'branch' => $isLite ? null : ['id' => $bs['branch_id'], 'name' => $bs['branch_name']],
            ];
        }
    }

    // Optional suppliers batch (full mode only)
    $suppliers = [];
    if (!$isLite) {
        $supplierIds = array_values(array_unique(array_filter(array_column($rows, 'supplier_id'))));
        if ($supplierIds) {
            $ph = implode(',', array_fill(0, count($supplierIds), '?'));
            $st = $pdo->prepare("SELECT * FROM suppliers WHERE id IN ($ph)");
            $st->execute($supplierIds);
            foreach ($st->fetchAll() as $s) {
                $suppliers[$s['id']] = [
                    'id' => $s['id'],
                    'company' => $s['company'],
                    'contactPerson' => $s['contact_person'],
                    'phone' => $s['phone'],
                    'email' => $s['email'],
                    'address' => $s['address'],
                ];
            }
        }
    }

    $out = [];
    foreach ($rows as $row) {
        $extras = [
            'category' => !empty($row['cat_id'])
                ? ['id' => $row['cat_id'], 'name' => $row['cat_name']]
                : null,
            'brand' => !empty($row['brand_join_id'])
                ? ['id' => $row['brand_join_id'], 'name' => $row['brand_name']]
                : null,
            'branchStocks' => $stocksByProduct[$row['id']] ?? [],
        ];
        if (!$isLite) {
            $extras['supplier'] = !empty($row['supplier_id'])
                ? ($suppliers[$row['supplier_id']] ?? null)
                : null;
        }
        // Prefer branch stock quantity when branch filtered + lite (POS stock display)
        if ($branchFilter) {
            $row['stock_quantity'] = !empty($extras['branchStocks'][0]) ? $extras['branchStocks'][0]['quantity'] : 0;
        }
        $out[] = products_format_product($row, $extras);
    }
    json_response($out);
}

function products_get(array $params): void
{
    $pdo = Database::pdo();
    $st = $pdo->prepare('SELECT * FROM products WHERE id = ? AND owner_id = ? LIMIT 1');
    $st->execute([$params['id'], tenant_owner_id()]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Product not found.', 404);
    }
    json_response(products_attach_relations($pdo, $row, null, false));
}

function products_create(array $params): void
{
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    $purchasePrice = $body['purchasePrice'] ?? null;
    $sellingPrice = $body['sellingPrice'] ?? null;

    if ($name === '' || $purchasePrice === null || $purchasePrice === '' || $sellingPrice === null || $sellingPrice === '') {
        json_error('Name, purchase price, and selling price are required.', 400);
    }

    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $brandId = $body['brandId'] ?? null;
    $model = $body['model'] ?? null;
    $finalSku = isset($body['sku']) && is_string($body['sku']) ? trim($body['sku']) : '';
    if ($finalSku === '') {
        $finalSku = products_generate_sku($pdo, $ownerId, $name, $brandId ?: null, $model ? (string) $model : null);
    }

    $chk = $pdo->prepare('SELECT id FROM products WHERE sku = ? AND owner_id = ? LIMIT 1');
    $chk->execute([$finalSku, $ownerId]);
    if ($chk->fetch()) {
        json_error('SKU already exists.', 400);
    }

    $barcode = $body['barcode'] ?? null;
    if ($barcode) {
        $chk = $pdo->prepare('SELECT id FROM products WHERE barcode = ? AND owner_id = ? LIMIT 1');
        $chk->execute([$barcode, $ownerId]);
        if ($chk->fetch()) {
            json_error('Barcode already exists.', 400);
        }
    }

    $id = uuid_v4();
    $now = now_sql();
    $branchId = branch_id();
    $pdo->prepare(
        'INSERT INTO products (
            id, name, sku, barcode, qr_code, category_id, brand_id, model, serial_number, imei,
            color, storage, ram, processor, warranty_months, supplier_id, branch_id, purchase_price, selling_price,
            wholesale_price, tax_rate, discount_rate, images, description, weight, stock_quantity,
            min_stock, type, owner_id, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $id,
        $name,
        $finalSku,
        $barcode ?: null,
        $body['qrCode'] ?? null,
        $body['categoryId'] ?? null,
        $brandId ?: null,
        $model ?: null,
        $body['serialNumber'] ?? null,
        $body['imei'] ?? null,
        $body['color'] ?? null,
        $body['storage'] ?? null,
        $body['ram'] ?? null,
        $body['processor'] ?? null,
        (int) ($body['warrantyMonths'] ?? 0),
        $body['supplierId'] ?? null,
        $branchId,
        (float) $purchasePrice,
        (float) $sellingPrice,
        isset($body['wholesalePrice']) && $body['wholesalePrice'] !== '' && $body['wholesalePrice'] !== null
            ? (float) $body['wholesalePrice'] : null,
        isset($body['taxRate']) ? (float) $body['taxRate'] : 0.0,
        isset($body['discountRate']) ? (float) $body['discountRate'] : 0.0,
        json_encode([]),
        $body['description'] ?? null,
        isset($body['weight']) && $body['weight'] !== '' && $body['weight'] !== null
            ? (float) $body['weight'] : null,
        0,
        isset($body['minStock']) ? (int) $body['minStock'] : 5,
        $body['type'] ?? 'SINGLE',
        $ownerId,
        $now,
        $now,
    ]);

    // Init branch stock at 0 for the product's branch only
    $targetBranch = $branchId;
    if (!$targetBranch) {
        $bst = $pdo->prepare('SELECT id FROM branches WHERE owner_id = ? LIMIT 1');
        $bst->execute([$ownerId]);
        $targetBranch = $bst->fetchColumn();
    }
    if ($targetBranch) {
        $pdo->prepare(
            'INSERT INTO branch_stocks (id, branch_id, product_id, quantity) VALUES (?, ?, ?, 0)'
        )->execute([uuid_v4(), $targetBranch, $id]);
    }

    $st = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $st->execute([$id]);
    json_response(products_attach_relations($pdo, $st->fetch(), null, false), 201);
}

function products_update(array $params): void
{
    $id = $params['id'];
    $body = read_json_body();
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();

    $prodWhere = 'id = ? AND owner_id = ?';
    $prodArgs = [$id, $ownerId];
    if ($branchId) {
        $prodWhere .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $prodArgs[] = $branchId;
    }
    $st = $pdo->prepare("SELECT id FROM products WHERE $prodWhere");
    $st->execute($prodArgs);
    if (!$st->fetch()) {
        json_error('Product not found.', 404);
    }

    if (!empty($body['sku'])) {
        $chk = $pdo->prepare('SELECT id FROM products WHERE sku = ? AND id <> ? AND owner_id = ? LIMIT 1');
        $chk->execute([$body['sku'], $id, $ownerId]);
        if ($chk->fetch()) {
            json_error('SKU is already in use by another product.', 400);
        }
    }

    $fields = [
        'name' => 'name',
        'sku' => 'sku',
        'barcode' => 'barcode',
        'qrCode' => 'qr_code',
        'categoryId' => 'category_id',
        'brandId' => 'brand_id',
        'model' => 'model',
        'serialNumber' => 'serial_number',
        'imei' => 'imei',
        'color' => 'color',
        'storage' => 'storage',
        'ram' => 'ram',
        'processor' => 'processor',
        'supplierId' => 'supplier_id',
        'description' => 'description',
        'type' => 'type',
    ];
    $sets = [];
    $vals = [];
    foreach ($fields as $json => $col) {
        if (array_key_exists($json, $body)) {
            $sets[] = "{$col} = ?";
            $val = $body[$json];
            $vals[] = ($val === '' ? null : $val);
        }
    }
    if (array_key_exists('warrantyMonths', $body)) {
        $sets[] = 'warranty_months = ?';
        $vals[] = (int) $body['warrantyMonths'];
    }
    if (array_key_exists('purchasePrice', $body)) {
        $sets[] = 'purchase_price = ?';
        $vals[] = (float) $body['purchasePrice'];
    }
    if (array_key_exists('sellingPrice', $body)) {
        $sets[] = 'selling_price = ?';
        $vals[] = (float) $body['sellingPrice'];
    }
    if (array_key_exists('wholesalePrice', $body)) {
        $sets[] = 'wholesale_price = ?';
        $vals[] = ($body['wholesalePrice'] === '' || $body['wholesalePrice'] === null)
            ? null : (float) $body['wholesalePrice'];
    }
    if (array_key_exists('taxRate', $body)) {
        $sets[] = 'tax_rate = ?';
        $vals[] = (float) $body['taxRate'];
    }
    if (array_key_exists('discountRate', $body)) {
        $sets[] = 'discount_rate = ?';
        $vals[] = (float) $body['discountRate'];
    }
    if (array_key_exists('weight', $body)) {
        $sets[] = 'weight = ?';
        $vals[] = ($body['weight'] === '' || $body['weight'] === null) ? null : (float) $body['weight'];
    }
    if (array_key_exists('minStock', $body)) {
        $sets[] = 'min_stock = ?';
        $vals[] = (int) $body['minStock'];
    }

    if ($sets) {
        $sets[] = 'updated_at = ?';
        $vals[] = now_sql();
        $vals[] = $id;
        $vals[] = $ownerId;
        $updateSql = 'UPDATE products SET ' . implode(', ', $sets) . ' WHERE id = ? AND owner_id = ?';
        if ($branchId) {
            $updateSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $vals[] = $branchId;
        }
        $pdo->prepare($updateSql)->execute($vals);
    }

    $st = $pdo->prepare('SELECT * FROM products WHERE id = ? AND owner_id = ?');
    $st->execute([$id, $ownerId]);
    json_response(products_attach_relations($pdo, $st->fetch(), null, false));
}

function products_delete(array $params): void
{
    $id = $params['id'];
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();

    $ownSql = 'SELECT id FROM products WHERE id = ? AND owner_id = ?';
    $ownArgs = [$id, $ownerId];
    if ($branchId) {
        $ownSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $ownArgs[] = $branchId;
    }
    $own = $pdo->prepare($ownSql);
    $own->execute($ownArgs);
    if (!$own->fetch()) {
        json_error('Product not found.', 404);
    }

    $refs = [
        $pdo->prepare('SELECT id FROM sale_items WHERE product_id = ? LIMIT 1'),
        $pdo->prepare('SELECT id FROM purchase_items WHERE product_id = ? LIMIT 1'),
        $pdo->prepare('SELECT id FROM warranty_claims WHERE product_id = ? LIMIT 1'),
    ];
    foreach ($refs as $st) {
        $st->execute([$id]);
        if ($st->fetch()) {
            json_error(
                'Cannot delete product because it is referenced in sales history, purchase orders, or warranty claims.',
                400
            );
        }
    }

    try {
        Database::begin();
        $pdo->prepare('DELETE FROM branch_stocks WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM stock_movements WHERE product_id = ? AND owner_id = ?')->execute([$id, $ownerId]);
        $pdo->prepare('DELETE FROM products WHERE id = ? AND owner_id = ?')->execute([$id, $ownerId]);
        Database::commit();
        json_response(['message' => 'Product deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to delete product.', 500);
    }
}

function products_bulk_delete(array $params): void
{
    $body = read_json_body();
    $ids = $body['ids'] ?? null;
    if (!is_array($ids) || count($ids) === 0) {
        json_error('No product IDs provided.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    // Only delete products owned by this shop
    $owned = $pdo->prepare("SELECT id FROM products WHERE id IN ($placeholders) AND owner_id = ?");
    $owned->execute(array_merge($ids, [$ownerId]));
    $ids = array_column($owned->fetchAll(), 'id');
    if (!$ids) {
        json_error('No matching products found for your shop.', 404);
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    foreach (['sale_items', 'purchase_items', 'warranty_claims'] as $table) {
        $st = $pdo->prepare("SELECT id FROM {$table} WHERE product_id IN ($placeholders) LIMIT 1");
        $st->execute($ids);
        if ($st->fetch()) {
            json_error(
                'Cannot delete selected products because one or more are referenced in sales history, purchase orders, or warranty claims.',
                400
            );
        }
    }

    try {
        Database::begin();
        $pdo->prepare("DELETE FROM branch_stocks WHERE product_id IN ($placeholders)")->execute($ids);
        $pdo->prepare("DELETE FROM stock_movements WHERE product_id IN ($placeholders)")->execute($ids);
        $pdo->prepare("DELETE FROM products WHERE id IN ($placeholders)")->execute($ids);
        Database::commit();
        json_response(['message' => count($ids) . ' products deleted successfully.']);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error('Failed to bulk delete products.', 500);
    }
}
