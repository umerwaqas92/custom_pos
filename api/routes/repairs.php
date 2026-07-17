<?php

declare(strict_types=1);

function register_repairs_routes(Router $router): void
{
    $router->post('repairs', 'repairs_create', false, ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN']);
    $router->get('repairs', 'repairs_list');
    $router->get('repairs/warranty-claims', 'repairs_warranty_list');
    $router->post('repairs/warranty-claims', 'repairs_warranty_create');
    $router->put('repairs/warranty-claims/:id', 'repairs_warranty_update', false, ['OWNER', 'MANAGER', 'TECHNICIAN']);
    $router->get('repairs/:id', 'repairs_get');
    $router->put('repairs/:id', 'repairs_update', false, ['OWNER', 'MANAGER', 'TECHNICIAN']);
}

function repairs_format(PDO $pdo, array $j): array
{
    $cust = null;
    if ($j['customer_id']) {
        $st = $pdo->prepare('SELECT * FROM customers WHERE id = ? AND owner_id = ?');
        $st->execute([$j['customer_id'], $j['owner_id']]);
        $cust = Format::customer($st->fetch() ?: null);
    }
    $tech = null;
    if ($j['technician_id']) {
        $st = $pdo->prepare('SELECT id, name, username, role FROM users WHERE id = ?');
        $st->execute([$j['technician_id']]);
        $tech = Format::userLite($st->fetch() ?: null);
    }
    $parts = json_decode($j['parts_used'] ?: '[]', true);
    $photos = json_decode($j['photos'] ?: '[]', true);
    return [
        'id' => $j['id'],
        'deviceName' => $j['device_name'],
        'imei' => $j['imei'],
        'serialNumber' => $j['serial_number'],
        'customerId' => $j['customer_id'],
        'faultDescription' => $j['fault_description'],
        'technicianId' => $j['technician_id'],
        'partsUsed' => is_array($parts) ? $parts : [],
        'repairCost' => (float) $j['repair_cost'],
        'serviceCharge' => (float) $j['service_charge'],
        'status' => $j['status'],
        'estimatedDelivery' => $j['estimated_delivery'],
        'notes' => $j['notes'],
        'photos' => is_array($photos) ? $photos : [],
        'createdAt' => $j['created_at'],
        'updatedAt' => $j['updated_at'],
        'customer' => $cust,
        'technician' => $tech,
    ];
}

function repairs_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['deviceName']) || empty($b['customerId']) || empty($b['faultDescription'])) {
        json_error('Device name, customer profile, and fault description are required.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $ownerId = tenant_owner_id();
    Database::pdo()->prepare(
        'INSERT INTO repair_jobs (id, device_name, imei, serial_number, customer_id, fault_description, technician_id,
         parts_used, repair_cost, service_charge, status, estimated_delivery, notes, photos, owner_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?)'
    )->execute([
        $id, $b['deviceName'], $b['imei'] ?? null, $b['serialNumber'] ?? null, $b['customerId'],
        $b['faultDescription'], $b['technicianId'] ?? null, json_encode([]), 'RECEIVED',
        !empty($b['estimatedDelivery']) ? date('Y-m-d H:i:s', strtotime($b['estimatedDelivery'])) : null,
        $b['notes'] ?? null, json_encode([]), $ownerId, $now, $now,
    ]);
    $st = Database::pdo()->prepare('SELECT * FROM repair_jobs WHERE id = ?');
    $st->execute([$id]);
    json_response(repairs_format(Database::pdo(), $st->fetch()), 201);
}

function repairs_list(array $p): void
{
    $q = query_params();
    $where = ['owner_id = ?'];
    $args = [tenant_owner_id()];
    if (!empty($q['status'])) {
        $where[] = 'status = ?';
        $args[] = $q['status'];
    }
    if (!empty($q['technicianId'])) {
        $where[] = 'technician_id = ?';
        $args[] = $q['technicianId'];
    }
    if (!empty($q['customerId'])) {
        $where[] = 'customer_id = ?';
        $args[] = $q['customerId'];
    }
    $st = Database::pdo()->prepare(
        'SELECT * FROM repair_jobs WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC'
    );
    $st->execute($args);
    $pdo = Database::pdo();
    json_response(array_map(static fn($r) => repairs_format($pdo, $r), $st->fetchAll()));
}

function repairs_get(array $p): void
{
    $st = Database::pdo()->prepare('SELECT * FROM repair_jobs WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], tenant_owner_id()]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Repair ticket not found.', 404);
    }
    json_response(repairs_format(Database::pdo(), $row));
}

function repairs_update(array $p): void
{
    $b = read_json_body();
    $sets = [];
    $vals = [];
    $map = [
        'status' => 'status',
        'faultDescription' => 'fault_description',
        'notes' => 'notes',
    ];
    foreach ($map as $json => $col) {
        if (array_key_exists($json, $b)) {
            $sets[] = "{$col} = ?";
            $vals[] = $b[$json];
        }
    }
    if (array_key_exists('technicianId', $b)) {
        $sets[] = 'technician_id = ?';
        $vals[] = $b['technicianId'] ?: null;
    }
    if (array_key_exists('partsUsed', $b)) {
        $sets[] = 'parts_used = ?';
        $vals[] = json_encode($b['partsUsed']);
    }
    if (array_key_exists('repairCost', $b)) {
        $sets[] = 'repair_cost = ?';
        $vals[] = (float) $b['repairCost'];
    }
    if (array_key_exists('serviceCharge', $b)) {
        $sets[] = 'service_charge = ?';
        $vals[] = (float) $b['serviceCharge'];
    }
    if (!empty($b['estimatedDelivery'])) {
        $sets[] = 'estimated_delivery = ?';
        $vals[] = date('Y-m-d H:i:s', strtotime($b['estimatedDelivery']));
    }
    $ownerId = tenant_owner_id();
    if ($sets) {
        $sets[] = 'updated_at = ?';
        $vals[] = now_sql();
        $vals[] = $p['id'];
        $vals[] = $ownerId;
        Database::pdo()->prepare('UPDATE repair_jobs SET ' . implode(', ', $sets) . ' WHERE id = ? AND owner_id = ?')->execute($vals);
    }
    $st = Database::pdo()->prepare('SELECT * FROM repair_jobs WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], $ownerId]);
    json_response(repairs_format(Database::pdo(), $st->fetch()));
}

function repairs_warranty_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['saleId']) || empty($b['productId'])) {
        json_error('Sale ID and Product ID are required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    
    // Assert ownership of the sale record
    $st = $pdo->prepare('SELECT id FROM sales WHERE id = ? AND owner_id = ? LIMIT 1');
    $st->execute([$b['saleId'], $ownerId]);
    if (!$st->fetch()) {
        json_error('Sale not found.', 404);
    }

    $id = uuid_v4();
    $now = now_sql();
    $pdo->prepare(
        'INSERT INTO warranty_claims (id, sale_id, product_id, claim_date, status, notes, owner_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)'
    )->execute([$id, $b['saleId'], $b['productId'], $now, 'PENDING', $b['notes'] ?? null, $ownerId, $now, $now]);
    json_response([
        'id' => $id, 'saleId' => $b['saleId'], 'productId' => $b['productId'],
        'claimDate' => $now, 'status' => 'PENDING', 'notes' => $b['notes'] ?? null,
    ], 201);
}

function repairs_warranty_list(array $p): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $st = $pdo->prepare('SELECT * FROM warranty_claims WHERE owner_id = ? ORDER BY claim_date DESC');
    $st->execute([$ownerId]);
    $rows = $st->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $sale = null;
        if (function_exists('sales_fetch_sale')) {
            $sale = sales_fetch_sale($pdo, $r['sale_id'], false);
        }
        $out[] = [
            'id' => $r['id'],
            'saleId' => $r['sale_id'],
            'productId' => $r['product_id'],
            'claimDate' => $r['claim_date'],
            'status' => $r['status'],
            'resolutionDetails' => $r['resolution_details'],
            'notes' => $r['notes'],
            'createdAt' => $r['created_at'],
            'updatedAt' => $r['updated_at'],
            'sale' => $sale,
        ];
    }
    json_response($out);
}

function repairs_warranty_update(array $p): void
{
    $b = read_json_body();
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $pdo->prepare(
        'UPDATE warranty_claims SET status = COALESCE(?, status), resolution_details = COALESCE(?, resolution_details),
         notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND owner_id = ?'
    )->execute([$b['status'] ?? null, $b['resolutionDetails'] ?? null, $b['notes'] ?? null, now_sql(), $p['id'], $ownerId]);
    $st = $pdo->prepare('SELECT * FROM warranty_claims WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], $ownerId]);
    $r = $st->fetch();
    if (!$r) {
        json_error('Warranty claim not found.', 404);
    }
    json_response([
        'id' => $r['id'], 'saleId' => $r['sale_id'], 'productId' => $r['product_id'],
        'claimDate' => $r['claim_date'], 'status' => $r['status'],
        'resolutionDetails' => $r['resolution_details'], 'notes' => $r['notes'],
    ]);
}
