<?php

declare(strict_types=1);

function register_inventory_routes(Router $router): void
{
    $router->post('inventory/adjust', 'inventory_adjust', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);
    $router->post('inventory/transfer', 'inventory_transfer', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);
    $router->get('inventory/movements', 'inventory_movements');
    $router->get('inventory/alerts', 'inventory_alerts');
}

function inventory_adjust(array $params): void
{
    $b = read_json_body();
    if (empty($b['productId']) || empty($b['branchId']) || !isset($b['quantity'])) {
        json_error('Product ID, Branch ID, and quantity adjustment value are required.', 400);
    }
    $change = (int) $b['quantity'];
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        $st = $pdo->prepare('SELECT id FROM products WHERE id = ? AND owner_id = ?');
        $st->execute([$b['productId'], $ownerId]);
        if (!$st->fetch()) {
            throw new RuntimeException('Product not found.');
        }
        $st = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ?');
        $st->execute([$b['branchId'], $ownerId]);
        if (!$st->fetch()) {
            throw new RuntimeException('Branch not found.');
        }
        $st = $pdo->prepare('SELECT quantity FROM branch_stocks WHERE branch_id = ? AND product_id = ? FOR UPDATE');
        $st->execute([$b['branchId'], $b['productId']]);
        $bs = $st->fetch();
        $current = $bs ? (int) $bs['quantity'] : 0;
        $newQty = $current + $change;
        if ($newQty < 0) {
            throw new RuntimeException('Adjusted quantity cannot lead to negative stock.');
        }
        $now = now_sql();
        if ($bs) {
            $pdo->prepare('UPDATE branch_stocks SET quantity = ? WHERE branch_id = ? AND product_id = ?')
                ->execute([$newQty, $b['branchId'], $b['productId']]);
        } else {
            $pdo->prepare('INSERT INTO branch_stocks (id, branch_id, product_id, quantity) VALUES (?,?,?,?)')
                ->execute([uuid_v4(), $b['branchId'], $b['productId'], $newQty]);
        }
        $pdo->prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?')
            ->execute([$change, $now, $b['productId']]);
        $mid = uuid_v4();
        $pdo->prepare(
            'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, notes, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
        )->execute([
            $mid, $b['productId'], $change, $change > 0 ? 'ADJUSTMENT' : 'DAMAGE',
            $b['branchId'], $b['reason'] ?? 'Manual adjustment', $ownerId, $now,
        ]);
        Database::commit();
        json_response([
            'id' => $mid,
            'productId' => $b['productId'],
            'quantity' => $change,
            'type' => $change > 0 ? 'ADJUSTMENT' : 'DAMAGE',
            'branchId' => $b['branchId'],
            'notes' => $b['reason'] ?? 'Manual adjustment',
            'createdAt' => $now,
        ]);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to adjust stock.', 400);
    }
}

function inventory_transfer(array $params): void
{
    $b = read_json_body();
    if (empty($b['productId']) || empty($b['fromBranchId']) || empty($b['toBranchId']) || empty($b['quantity'])) {
        json_error('Product ID, Source Branch, Destination Branch, and Quantity are required.', 400);
    }
    $qty = (int) $b['quantity'];
    if ($qty <= 0) {
        json_error('Quantity must be greater than zero.', 400);
    }
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        
        // Assert ownership of product
        $st = $pdo->prepare('SELECT id FROM products WHERE id = ? AND owner_id = ? LIMIT 1');
        $st->execute([$b['productId'], $ownerId]);
        if (!$st->fetch()) {
            throw new RuntimeException('Product not found.');
        }

        // Assert ownership of branches
        $st = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
        $st->execute([$b['fromBranchId'], $ownerId]);
        if (!$st->fetch()) {
            throw new RuntimeException('Source branch not found.');
        }
        $st->execute([$b['toBranchId'], $ownerId]);
        if (!$st->fetch()) {
            throw new RuntimeException('Destination branch not found.');
        }

        $st = $pdo->prepare('SELECT quantity FROM branch_stocks WHERE branch_id = ? AND product_id = ? FOR UPDATE');
        $st->execute([$b['fromBranchId'], $b['productId']]);
        $from = $st->fetch();
        if (!$from || (int) $from['quantity'] < $qty) {
            throw new RuntimeException('Insufficient stock at the source branch.');
        }
        $pdo->prepare('UPDATE branch_stocks SET quantity = quantity - ? WHERE branch_id = ? AND product_id = ?')
            ->execute([$qty, $b['fromBranchId'], $b['productId']]);
        $st = $pdo->prepare('SELECT id FROM branch_stocks WHERE branch_id = ? AND product_id = ?');
        $st->execute([$b['toBranchId'], $b['productId']]);
        if ($st->fetch()) {
            $pdo->prepare('UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id = ? AND product_id = ?')
                ->execute([$qty, $b['toBranchId'], $b['productId']]);
        } else {
            $pdo->prepare('INSERT INTO branch_stocks (id, branch_id, product_id, quantity) VALUES (?,?,?,?)')
                ->execute([uuid_v4(), $b['toBranchId'], $b['productId'], $qty]);
        }
        $now = now_sql();
        $notes = $b['notes'] ?? '';
        $pdo->prepare(
            'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, notes, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
        )->execute([uuid_v4(), $b['productId'], -$qty, 'TRANSFER', $b['fromBranchId'], "Transferred to branch: {$b['toBranchId']}. {$notes}", $ownerId, $now]);
        $pdo->prepare(
            'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, notes, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?)'
        )->execute([uuid_v4(), $b['productId'], $qty, 'TRANSFER', $b['toBranchId'], "Transferred from branch: {$b['fromBranchId']}. {$notes}", $ownerId, $now]);
        Database::commit();
        json_response(['success' => true, 'transferred' => $qty]);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Transfer failed.', 400);
    }
}

function inventory_movements(array $params): void
{
    $pdo = Database::pdo();
    $limit = min(200, max(1, (int) (query_params()['limit'] ?? 100)));
    $st = $pdo->prepare(
        "SELECT sm.*, p.name AS p_name, p.sku AS p_sku, p.brand_id, p.category_id,
                b.name AS brand_name, c.name AS cat_name
         FROM stock_movements sm
         LEFT JOIN products p ON p.id = sm.product_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE sm.owner_id = ?
         ORDER BY sm.created_at DESC LIMIT {$limit}"
    );
    $st->execute([tenant_owner_id()]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $out[] = [
            'id' => $r['id'],
            'productId' => $r['product_id'],
            'quantity' => (int) $r['quantity'],
            'type' => $r['type'],
            'branchId' => $r['branch_id'],
            'referenceId' => $r['reference_id'],
            'notes' => $r['notes'],
            'createdAt' => $r['created_at'],
            'product' => [
                'id' => $r['product_id'],
                'name' => $r['p_name'],
                'sku' => $r['p_sku'],
                'brand' => $r['brand_id'] ? ['id' => $r['brand_id'], 'name' => $r['brand_name']] : null,
                'category' => $r['category_id'] ? ['id' => $r['category_id'], 'name' => $r['cat_name']] : null,
            ],
        ];
    }
    json_response($out);
}

function inventory_alerts(array $params): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = query_params()['branchId'] ?? branch_id() ?? '';
    $threshold = 3;
    if ($branchId !== '') {
        $st = $pdo->prepare(
            'SELECT p.id, p.name, p.sku, p.min_stock,
                    p.brand_id, p.category_id,
                    COALESCE(bs.quantity, 0) AS qty,
                    b.name AS brand_name, c.name AS cat_name
             FROM products p
             LEFT JOIN branch_stocks bs ON bs.product_id = p.id AND bs.branch_id = ?
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.owner_id = ? AND p.branch_id = ?
             ORDER BY qty ASC'
        );
        $st->execute([$branchId, $ownerId, $branchId]);
    } else {
        $st = $pdo->prepare(
            'SELECT p.id, p.name, p.sku, p.stock_quantity AS qty, p.min_stock,
                    p.brand_id, p.category_id,
                    b.name AS brand_name, c.name AS cat_name
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.owner_id = ?
             ORDER BY p.stock_quantity ASC'
        );
        $st->execute([$ownerId]);
    }
    $products = $st->fetchAll();
    $out = [];
    foreach ($products as $p) {
        $qty = (int) $p['qty'];
        $min = (int) $p['min_stock'];
        $level = 'OK';
        if ($qty <= 0) {
            $level = 'OUT';
        } elseif ($qty <= $min) {
            $level = 'LOW';
        } elseif ($qty <= $min + $threshold) {
            $level = 'WATCH';
        }
        if ($level === 'OK') {
            continue;
        }
        $out[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'sku' => $p['sku'],
            'stockQuantity' => $qty,
            'minStock' => $min,
            'level' => $level,
            'brand' => $p['brand_id'] ? ['id' => $p['brand_id'], 'name' => $p['brand_name']] : null,
            'category' => $p['category_id'] ? ['id' => $p['category_id'], 'name' => $p['cat_name']] : null,
        ];
    }
    json_response($out);
}
