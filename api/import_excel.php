<?php
/**
 * CLI import script — reads MZK_SALES.json and imports into POS database.
 * Usage: php api/import_excel.php
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$ownerId = 'd5c385de-1abe-42c4-8af8-ac4cb1579e91';
$branchId = 'cb05546e-daff-481c-bdd5-5edb6377263b';
$cashierId = $ownerId;

$jsonPath = '/Users/themacstore/Downloads/MZK_SALES.json';
if (!is_file($jsonPath)) {
    die("JSON file not found at {$jsonPath}\n");
}
$sheets = json_decode(file_get_contents($jsonPath), true);
if (!$sheets) die("Failed to parse JSON.\n");

$pdo = Database::pdo();
$now = now_sql();
$imported = ['brands' => 0, 'categories' => 0, 'products' => 0, 'customers' => 0, 'sales' => 0];

echo "=== MZK POS Full Data Import ===\n\n";

/* ----------------------------------------------------------------
 * 1. Bank Account
 * ---------------------------------------------------------------- */
$st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type='CASH' AND is_active=1 AND owner_id=? LIMIT 1");
$st->execute([$ownerId]);
$cashAcc = $st->fetch();
if (!$cashAcc) {
    $aid = uuid_v4();
    $pdo->prepare("INSERT INTO bank_accounts (id,name,type,balance,is_active,owner_id,created_at,updated_at) VALUES (?,?,?,0,1,?,?,?)")
        ->execute([$aid, 'Cash Drawer', 'CASH', $ownerId, $now, $now]);
    $cashAcc = ['id' => $aid];
    echo "[OK] Created Cash bank account\n";
}

/* ----------------------------------------------------------------
 * 2. Brands
 * ---------------------------------------------------------------- */
$brandMap = [];
foreach (['Skyair', 'Aeris'] as $name) {
    $st = $pdo->prepare("SELECT id FROM brands WHERE name=? AND owner_id=? LIMIT 1");
    $st->execute([$name, $ownerId]);
    $b = $st->fetch();
    if (!$b) {
        $id = uuid_v4();
        $pdo->prepare("INSERT INTO brands (id,name,owner_id,created_at,updated_at) VALUES (?,?,?,?,?)")
            ->execute([$id, $name, $ownerId, $now, $now]);
        $brandMap[strtolower($name)] = $id;
        $imported['brands']++;
    } else {
        $brandMap[strtolower($name)] = $b['id'];
    }
}
echo "[OK] Brands: Skyair, Aeris\n";

/* ----------------------------------------------------------------
 * 3. Categories
 * ---------------------------------------------------------------- */
$catMap = [];
foreach (['Wall Mounted Type Unit', 'Floor Standing Type Unit'] as $name) {
    $st = $pdo->prepare("SELECT id FROM categories WHERE name=? AND owner_id=? LIMIT 1");
    $st->execute([$name, $ownerId]);
    $c = $st->fetch();
    if (!$c) {
        $id = uuid_v4();
        $pdo->prepare("INSERT INTO categories (id,name,owner_id,created_at,updated_at) VALUES (?,?,?,?,?)")
            ->execute([$id, $name, $ownerId, $now, $now]);
        $catMap[$name] = $id;
        $imported['categories']++;
    } else {
        $catMap[$name] = $c['id'];
    }
}
echo "[OK] Categories: Wall Mounted, Floor Standing\n";

/* ----------------------------------------------------------------
 * 4. Products — create all variants with correct models
 * ---------------------------------------------------------------- */
$productCache = []; // key => id

function ensureProduct(PDO $pdo, string $brandId, string $brandName, string $capacity, string $type, string $model, string $catId, float $purchasePrice, float $sellingPrice, string $ownerId, string $branchId, string &$now): array
{
    global $productCache, $imported;
    $key = strtolower("{$brandName}|{$capacity}|{$type}");

    // Check existing
    $st = $pdo->prepare("SELECT id,name FROM products WHERE brand_id=? AND model LIKE ? AND category_id=? AND owner_id=? LIMIT 1");
    $st->execute([$brandId, "%{$model}%", $catId, $ownerId]);
    $p = $st->fetch();
    if ($p) {
        $productCache[$key] = $p['id'];
        return $p;
    }

    $capKey = str_replace([' ', '.'], '', strtolower($capacity));
    $sku = strtoupper(substr($brandName, 0, 4) . '-' . $capKey . '-' . substr(uuid_v4(), 0, 6));
    $name = "{$brandName} {$type} {$capacity}";
    $id = uuid_v4();

    $pdo->prepare("INSERT INTO products (id,name,sku,category_id,brand_id,model,purchase_price,selling_price,stock_quantity,min_stock,type,images,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,5,'SINGLE','[]',?,?,?)")
        ->execute([$id, $name, $sku, $catId, $brandId, $model, $purchasePrice, $sellingPrice, $ownerId, $now, $now]);

    // Branch stock row
    $st = $pdo->prepare("SELECT id FROM branch_stocks WHERE branch_id=? AND product_id=?");
    $st->execute([$branchId, $id]);
    if (!$st->fetch()) {
        $pdo->prepare("INSERT INTO branch_stocks (id,branch_id,product_id,quantity) VALUES (?,?,?,0)")
            ->execute([uuid_v4(), $branchId, $id]);
    }

    $productCache[$key] = $id;
    $imported['products']++;
    echo "  [PRODUCT] {$name}\n";
    return ['id' => $id, 'name' => $name];
}

// Wall Mounted products
$wallCat = $catMap['Wall Mounted Type Unit'];
$floorCat = $catMap['Floor Standing Type Unit'];

// Aeris wall models
ensureProduct($pdo, $brandMap['aeris'], 'Aeris', '1 ton', 'Wall Mounted', 'AEW12', $wallCat, 110000, 110000, $ownerId, $branchId, $now);
ensureProduct($pdo, $brandMap['aeris'], 'Aeris', '1.5 ton', 'Wall Mounted', 'AEW18', $wallCat, 125000, 145000, $ownerId, $branchId, $now);
ensureProduct($pdo, $brandMap['aeris'], 'Aeris', '2 ton', 'Wall Mounted', 'AEW24', $wallCat, 125000, 200000, $ownerId, $branchId, $now);
// Skyair wall models
ensureProduct($pdo, $brandMap['skyair'], 'Skyair', '1 ton', 'Wall Mounted', 'SKY-12', $wallCat, 110000, 110000, $ownerId, $branchId, $now);
ensureProduct($pdo, $brandMap['skyair'], 'Skyair', '1.5 ton', 'Wall Mounted', 'SKY-18', $wallCat, 125000, 145000, $ownerId, $branchId, $now);
ensureProduct($pdo, $brandMap['skyair'], 'Skyair', '2 ton', 'Wall Mounted', 'SKY-24', $wallCat, 125000, 200000, $ownerId, $branchId, $now);
// Aeris floor standing
ensureProduct($pdo, $brandMap['aeris'], 'Aeris', '2 ton', 'Floor Standing', 'AEFS', $floorCat, 150000, 200000, $ownerId, $branchId, $now);

echo "[OK] Products created\n";

/* ----------------------------------------------------------------
 * 5. Helper: find product by brand+capacity+type
 * ---------------------------------------------------------------- */
function findProduct(string $brand, string $capacity, string $type = 'Wall Mounted'): ?string
{
    global $productCache;
    $brand = strtolower(trim($brand));
    $cap = strtolower(trim($capacity));
    $type = strtolower(trim($type));

    // Normalize capacity
    if ($cap === '2') $cap = '2 ton';
    if ($cap === '1') $cap = '1 ton';
    if ($cap === '1.5' || $cap === '1.5 ton') $cap = '1.5 ton';

    $key = "{$brand}|{$cap}|{$type}";
    if (isset($productCache[$key])) return $productCache[$key];

    // Try alternative keys
    $altKey = "{$brand}|{$cap}|wall mounted";
    if ($type === 'Wall Mounted' && isset($productCache[$altKey])) return $productCache[$altKey];

    return null;
}

/* ----------------------------------------------------------------
 * 6. Customers
 * ---------------------------------------------------------------- */
$customerMap = [];
$customerList = [
    'shoaib dealer', 'torab', 'hafiz umer hayat', 'raza ullah', 'prof. saif urehman',
    'ikram ul haq', 'dhq', 'amairoon', 'sabir', 'amairoon friend', 'furqan mahad czn',
    'sami ullah', 'm,zaman', 'khan daraz', 'dia motors',
];
$phoneIdx = 0;
foreach ($customerList as $name) {
    $phone = sprintf('0000000%02d', $phoneIdx++);
    $st = $pdo->prepare("SELECT id FROM customers WHERE phone=? AND owner_id=? LIMIT 1");
    $st->execute([$phone, $ownerId]);
    $c = $st->fetch();
    if (!$c) {
        $cid = uuid_v4();
        $pdo->prepare("INSERT INTO customers (id,name,phone,credit_limit,owner_id,created_at,updated_at) VALUES (?,?,?,5000000,?,?,?)")
            ->execute([$cid, ucwords($name), $phone, $ownerId, $now, $now]);
        $customerMap[strtolower(trim($name))] = $cid;
        $imported['customers']++;
    } else {
        $customerMap[strtolower(trim($name))] = $c['id'];
    }
}
echo "[OK] Customers created\n";

function getCustomerId(string $name): ?string {
    global $customerMap;
    $key = strtolower(trim(preg_replace('/\s+/', ' ', $name)));
    // Try exact
    if (isset($customerMap[$key])) return $customerMap[$key];
    // Try removing extra spaces
    $clean = preg_replace('/\s+/', ' ', $key);
    if (isset($customerMap[$clean])) return $customerMap[$clean];
    return null;
}

/* ----------------------------------------------------------------
 * 7. Parse date helper
 * ---------------------------------------------------------------- */
function parseDate(string $raw): string {
    $raw = trim($raw);
    if (!$raw) return now_sql();
    // Already Y-m-d
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) return $raw . ' 00:00:00';
    // d/m/Y
    if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $raw, $m)) return "{$m[3]}-{$m[2]}-{$m[1]} 00:00:00";
    // d-m-Y
    if (preg_match('#^(\d{1,2})-(\d{1,2})-(\d{4})$#', $raw, $m)) return "{$m[3]}-{$m[2]}-{$m[1]} 00:00:00";
    return $now;
}

/* ----------------------------------------------------------------
 * 8. Supplier (Master Traders)
 * ---------------------------------------------------------------- */
$supplierId = null;
$st = $pdo->prepare("SELECT id FROM suppliers WHERE company=? AND owner_id=? LIMIT 1");
$st->execute(['Master Traders', $ownerId]);
$s = $st->fetch();
if (!$s) {
    $supplierId = uuid_v4();
    $pdo->prepare("INSERT INTO suppliers (id,company,owner_id,created_at,updated_at) VALUES (?,?,?,?,?)")
        ->execute([$supplierId, 'Master Traders', $ownerId, $now, $now]);
} else {
    $supplierId = $s['id'];
}

/* ----------------------------------------------------------------
 * 9. Import Purchase Orders (Supplies) — from JUNE sheet supplies section
 * ---------------------------------------------------------------- */
$suppliesData = [
    ['brand' => 'AERIS', 'capacity' => '2 ton', 'qty' => 2, 'date' => '2026-05-24'],
    ['brand' => 'AERIS', 'capacity' => '1.5 ton', 'qty' => 12, 'date' => '2026-05-24'],
    ['brand' => 'AERIS', 'capacity' => '1 ton', 'qty' => 6, 'date' => '2026-05-24'],
    ['brand' => 'Skyair', 'capacity' => '2 ton', 'qty' => 2, 'date' => '2026-05-24'],
    ['brand' => 'Skyair', 'capacity' => '1.5 ton', 'qty' => 12, 'date' => '2026-05-24'],
    ['brand' => 'Skyair', 'capacity' => '1 ton', 'qty' => 6, 'date' => '2026-05-24'],
    ['brand' => 'AERIS', 'capacity' => '1.5 ton', 'qty' => 20, 'date' => '2026-06-15'],
    ['brand' => 'AERIS', 'capacity' => '2 ton', 'qty' => 7, 'type' => 'Floor Standing', 'date' => '2026-06-15'],
    ['brand' => 'Skyair', 'capacity' => '1.5 ton', 'qty' => 6, 'date' => '2026-06-15'],
];

$st = $pdo->prepare("SELECT id FROM purchase_orders WHERE owner_id=? AND notes LIKE '%June 2026%' LIMIT 1");
$st->execute([$ownerId]);
if (!$st->fetch()) {
    $poId = uuid_v4();
    $totalAmt = 0;
    $poDate = '2026-05-24 10:00:00';
    $costMap = ['1 ton' => 110000, '1.5 ton' => 125000, '2 ton' => 125000];
    $floorCost = 150000;

    $pdo->prepare("INSERT INTO purchase_orders (id,supplier_id,order_date,status,total_amount,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
        ->execute([$poId, $supplierId, $poDate, 'RECEIVED', 0, 'June 2026 Supply - Initial Stock', $ownerId, $poDate, $now]);

    foreach ($suppliesData as $item) {
        $type = $item['type'] ?? 'Wall Mounted';
        $pid = findProduct($item['brand'], $item['capacity'], $type);
        if (!$pid) {
            echo "  [WARN] Product not found: {$item['brand']} {$item['capacity']} {$type}\n";
            continue;
        }
        $cost = $type === 'Floor Standing' ? $floorCost : ($costMap[$item['capacity']] ?? 125000);
        $lineTotal = $cost * $item['qty'];
        $totalAmt += $lineTotal;

        $pdo->prepare("INSERT INTO purchase_items (id,purchase_order_id,product_id,quantity,cost_price) VALUES (?,?,?,?,?)")
            ->execute([uuid_v4(), $poId, $pid, $item['qty'], $cost]);

        // Add stock to branch
        $st = $pdo->prepare("SELECT quantity FROM branch_stocks WHERE branch_id=? AND product_id=?");
        $st->execute([$branchId, $pid]);
        $bs = $st->fetch();
        if ($bs) {
            $pdo->prepare("UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id=? AND product_id=?")
                ->execute([$item['qty'], $branchId, $pid]);
        } else {
            $pdo->prepare("INSERT INTO branch_stocks (id,branch_id,product_id,quantity) VALUES (?,?,?,?)")
                ->execute([uuid_v4(), $branchId, $pid, $item['qty']]);
        }
        $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity + ?, purchase_price = ?, updated_at = ? WHERE id=?")
            ->execute([$item['qty'], $cost, $now, $pid]);
        $pdo->prepare("INSERT INTO stock_movements (id,product_id,quantity,type,branch_id,reference_id,notes,owner_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
            ->execute([uuid_v4(), $pid, $item['qty'], 'IN', $branchId, $poId, 'June supply', $ownerId, $poDate]);
    }
    $pdo->prepare("UPDATE purchase_orders SET total_amount=? WHERE id=?")->execute([$totalAmt, $poId]);
    echo "[OK] June purchase order created (Rs. " . number_format($totalAmt) . ")\n";
} else {
    echo "[OK] June purchase order already exists\n";
}

// July supplies
$julySupplies = [
    ['brand' => 'AERIS', 'capacity' => '2 ton', 'qty' => 1],
    ['brand' => 'AERIS', 'capacity' => '1.5 ton', 'qty' => 25],
    ['brand' => 'AERIS', 'capacity' => '1 ton', 'qty' => 6],
];
$st = $pdo->prepare("SELECT id FROM purchase_orders WHERE owner_id=? AND notes LIKE '%July 2026%' LIMIT 1");
$st->execute([$ownerId]);
if (!$st->fetch()) {
    $poId = uuid_v4();
    $totalAmt = 0;
    $poDate = '2026-07-01 10:00:00';

    $pdo->prepare("INSERT INTO purchase_orders (id,supplier_id,order_date,status,total_amount,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
        ->execute([$poId, $supplierId, $poDate, 'RECEIVED', 0, 'July 2026 Supply - Additional Stock', $ownerId, $poDate, $now]);

    foreach ($julySupplies as $item) {
        $pid = findProduct($item['brand'], $item['capacity'], 'Wall Mounted');
        if (!$pid) continue;
        $cost = 125000;
        $lineTotal = $cost * $item['qty'];
        $totalAmt += $lineTotal;

        $pdo->prepare("INSERT INTO purchase_items (id,purchase_order_id,product_id,quantity,cost_price) VALUES (?,?,?,?,?)")
            ->execute([uuid_v4(), $poId, $pid, $item['qty'], $cost]);

        $st = $pdo->prepare("SELECT quantity FROM branch_stocks WHERE branch_id=? AND product_id=?");
        $st->execute([$branchId, $pid]);
        $bs = $st->fetch();
        if ($bs) {
            $pdo->prepare("UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id=? AND product_id=?")
                ->execute([$item['qty'], $branchId, $pid]);
        } else {
            $pdo->prepare("INSERT INTO branch_stocks (id,branch_id,product_id,quantity) VALUES (?,?,?,?)")
                ->execute([uuid_v4(), $branchId, $pid, $item['qty']]);
        }
        $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id=?")
            ->execute([$item['qty'], $now, $pid]);
        $pdo->prepare("INSERT INTO stock_movements (id,product_id,quantity,type,branch_id,reference_id,notes,owner_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
            ->execute([uuid_v4(), $pid, $item['qty'], 'IN', $branchId, $poId, 'July supply', $ownerId, $poDate]);
    }
    $pdo->prepare("UPDATE purchase_orders SET total_amount=? WHERE id=?")->execute([$totalAmt, $poId]);
    echo "[OK] July purchase order created (Rs. " . number_format($totalAmt) . ")\n";
} else {
    echo "[OK] July purchase order already exists\n";
}

/* ----------------------------------------------------------------
 * 10. Clear stock to 0 for accurate sale deductions
 * ---------------------------------------------------------------- */
$st = $pdo->prepare("UPDATE branch_stocks SET quantity = 0 WHERE branch_id=?", [$branchId]);
$st->execute([$branchId]);
$st = $pdo->prepare("UPDATE products SET stock_quantity = 0 WHERE owner_id=?", [$ownerId]);
$st->execute([$ownerId]);

// Re-add stock from purchase orders
$st = $pdo->prepare("SELECT pi.product_id, SUM(pi.quantity) AS total_qty FROM purchase_items pi JOIN purchase_orders po ON po.id=pi.purchase_order_id WHERE po.status='RECEIVED' AND po.owner_id=? GROUP BY pi.product_id");
$st->execute([$ownerId]);
foreach ($st->fetchAll() as $row) {
    $pdo->prepare("UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id=? AND product_id=?")->execute([$row['total_qty'], $branchId, $row['product_id']]);
    $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id=?")->execute([$row['total_qty'], $row['product_id']]);
}
echo "[OK] Stock reset and reloaded from purchase orders\n";

/* ----------------------------------------------------------------
 * 11. Import Sales from JSON data
 * ---------------------------------------------------------------- */
function parseSalesRow(array $row): ?array {
    // Row structure: [col0, col1=serial, col2=customer, col3=date, col4=remarks, col5=description, col6=capacity, col7=quantity, col8=brand, col9=sale_price, col10=total_price, col11=received, col12=receivable]
    // JSON index:     [0,    1,             2,             3,       4,         5,              6,         7,        8,      9,           10,             11,        12]
    if (count($row) < 13) return null;
    $customer = $row[2] ?? '';
    $date = $row[3] ?? '';
    $remarks = $row[4] ?? '';
    $capacity = $row[6] ?? '';
    $qty = $row[7] ?? '';
    $brand = $row[8] ?? '';
    $salePrice = $row[9] ?? '';
    $totalPrice = $row[10] ?? '';
    $received = $row[11] ?? '';
    $receivable = $row[12] ?? '';

    // Skip non-data rows
    if ($customer === '' || $customer === null) return null;
    if (in_array(strtolower(trim((string)$customer)), ['s. no.', "customer's name", 'total', 'capacity', '', 's.no. '])) return null;
    if (in_array(strtolower(trim((string)$qty)), ['quantity', ''])) $qty = 0;
    $qty = (int)$qty;
    if ($qty <= 0) return null;

    $brand = trim((string)$brand);
    $capacity = trim((string)$capacity);
    $remarks = trim((string)$remarks);

    return [
        'customer' => trim((string)$customer),
        'date' => (string)$date,
        'remarks' => $remarks,
        'capacity' => $capacity,
        'qty' => $qty,
        'brand' => $brand,
        'salePrice' => (float)($salePrice ?: 0),
        'totalPrice' => (float)($totalPrice ?: 0),
        'received' => (float)($received ?: 0),
        'receivable' => (float)($receivable ?: 0),
    ];
}

function importSale(PDO $pdo, array $saleData, string $ownerId, string $branchId, string $cashierId, string &$now): void
{
    global $imported;

    // Find product
    $brand = $saleData['brand'];
    $capacity = $saleData['capacity'];
    $type = 'Wall Mounted';

    // Check for floor standing in description
    if (stripos($saleData['remarks'] ?? '', 'floor') !== false || stripos($capacity, 'floor') !== false) {
        $type = 'Floor Standing';
    }

    // Normalize capacity
    $cap = strtolower(trim($capacity));
    if ($cap === '2') $cap = '2 ton';
    elseif ($cap === '1') $cap = '1 ton';
    elseif ($cap === '1.5' || $cap === '1.5 ton' || $cap === '1.5 ton') $cap = '1.5 ton';
    elseif ($cap === '2 ton') $cap = '2 ton';

    $pid = findProduct($brand, $cap, $type);

    // Try Wall Mounted if Floor Standing not found
    if (!$pid && $type === 'Floor Standing') {
        $pid = findProduct($brand, $cap, 'Wall Mounted');
    }
    // Try the other brand
    if (!$pid) {
        $altBrand = strtolower($brand) === 'aeris' ? 'skyair' : 'aeris';
        $pid = findProduct($altBrand, $cap, $type);
    }

    if (!$pid) {
        echo "  [WARN] Skipping sale — no product: {$saleData['customer']} {$brand} {$cap}\n";
        return;
    }

    // Get customer
    $customerId = getCustomerId($saleData['customer']);
    if (!$customerId) {
        echo "  [WARN] No customer ID for: {$saleData['customer']}\n";
        return;
    }

    $saleDate = parseDate((string)$saleData['date']);
    $unitPrice = $saleData['salePrice'] > 0 ? $saleData['salePrice'] : 145000;
    $lineTotal = round_money($unitPrice * $saleData['qty']);
    $totalReceived = round_money($saleData['received']);
    $paymentStatus = 'PAID';
    $paymentMethod = 'CASH';
    $payable = $lineTotal;

    if ($totalReceived <= 0) {
        $paymentStatus = 'UNPAID';
    } elseif ($totalReceived < $lineTotal) {
        $paymentStatus = 'PARTIAL';
    }

    // Deduct stock
    $st = $pdo->prepare("SELECT quantity FROM branch_stocks WHERE branch_id=? AND product_id=?");
    $st->execute([$branchId, $pid]);
    $bs = $st->fetch();
    $currentQty = $bs ? (int)$bs['quantity'] : 0;

    // Only deduct if we have stock, otherwise skip stock deduction but still record sale
    if ($currentQty >= $saleData['qty']) {
        $pdo->prepare("UPDATE branch_stocks SET quantity = quantity - ? WHERE branch_id=? AND product_id=?")
            ->execute([$saleData['qty'], $branchId, $pid]);
        $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id=?")
            ->execute([$saleData['qty'], $now, $pid]);
    } else {
        echo "  [WARN] Low stock for sale: {$saleData['customer']} {$brand} {$cap} (need {$saleData['qty']}, have {$currentQty})\n";
        // Allow selling even with low stock
        $deduct = min($currentQty, $saleData['qty']);
        if ($deduct > 0) {
            $pdo->prepare("UPDATE branch_stocks SET quantity = quantity - ? WHERE branch_id=? AND product_id=?")
                ->execute([$deduct, $branchId, $pid]);
            $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id=?")
                ->execute([$deduct, $now, $pid]);
        }
    }

    // Create sale
    $saleId = uuid_v4();
    $pdo->prepare("INSERT INTO sales (id,customer_id,cashier_id,branch_id,sale_date,total_amount,discount_amount,tax_amount,payable_amount,paid_amount,payment_method,payment_status,return_status,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?)")
        ->execute([$saleId, $customerId, $cashierId, $branchId, $saleDate, $lineTotal, $lineTotal, $totalReceived, $paymentMethod, $paymentStatus, 'NONE', "Imported from Excel - {$saleData['remarks']}", $ownerId, $saleDate, $now]);

    // Sale items
    $pdo->prepare("INSERT INTO sale_items (id,sale_id,product_id,quantity,unit_price,discount,tax,total_price) VALUES (?,?,?,?,?,0,0,?)")
        ->execute([uuid_v4(), $saleId, $pid, $saleData['qty'], $unitPrice, $lineTotal]);

    // Stock movement
    $pdo->prepare("INSERT INTO stock_movements (id,product_id,quantity,type,branch_id,reference_id,notes,owner_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        ->execute([uuid_v4(), $pid, -$saleData['qty'], 'OUT', $branchId, $saleId, 'Imported sale', $ownerId, $saleDate]);

    // Update customer credit if unpaid
    if ($paymentStatus !== 'PAID' && $customerId) {
        $debt = $lineTotal - $totalReceived;
        $pdo->prepare("UPDATE customers SET credit_balance = credit_balance + ?, updated_at = ? WHERE id=?")
            ->execute([$debt, $now, $customerId]);
    }

    $imported['sales']++;
}

// Process JUNE sheet: sales data (two sections)
echo "\n--- Importing JUNE Sales ---\n";
$juneRows = $sheets['JUNE'] ?? [];
$inSalesSection = false;
$saleCount = 0;

foreach ($juneRows as $row) {
    // Search all columns for section markers
    $rowStr = implode('|', array_map(function($v) { return is_string($v) ? $v : (string)$v; }, $row));

    // Detect sales header
    if (stripos($rowStr, "customer's name") !== false && stripos($rowStr, 's. no.') !== false) {
        $inSalesSection = true;
        continue;
    }
    // End of sales sections
    if (stripos($rowStr, 'supplies') !== false && stripos($rowStr, 'model') !== false) {
        $inSalesSection = false;
        continue;
    }
    if (stripos($rowStr, 'remaining stock') !== false) {
        $inSalesSection = false;
        continue;
    }
    if (stripos($rowStr, 'grand total') !== false && stripos($rowStr, 'total sold') !== false) {
        $inSalesSection = false;
        continue;
    }
    if (!$inSalesSection) continue;

    // JUNE structure: row[1]=serial, row[2]=customer, row[3]=date, row[4]=remarks, row[5]=desc, row[6]=capacity, row[7]=qty, row[8]=brand, row[9]=sale_price, row[10]=total, row[11]=received, row[12]=receivable
    $customer = $row[2] ?? '';
    $date = $row[3] ?? '';
    $remarks = $row[4] ?? '';
    $capacity = $row[6] ?? '';
    $qty = $row[7] ?? 0;
    $brand = $row[8] ?? '';
    $salePrice = $row[9] ?? 0;
    $totalPrice = $row[10] ?? 0;
    $received = $row[11] ?? 0;
    $receivable = $row[12] ?? 0;

    // Skip non-data rows
    if ($customer === '' || $customer === null) continue;
    $custLower = strtolower(trim((string)$customer));
    if (in_array($custLower, ['s. no.', "customer's name", 'total', 'grand total', '', 'capacity'])) continue;

    $qtyVal = (int)$qty;
    if ($qtyVal <= 0 && (float)$totalPrice <= 0) continue;

    // Skip pending/displayed (not actual sold) — unless they have payment
    $remarksStr = strtolower(trim((string)$remarks));
    if (in_array($remarksStr, ['pending', 'displyed', 'displayed']) && (float)$received <= 0) {
        echo "  [SKIP] {$customer} — {$remarksStr} (not sold)\n";
        continue;
    }

    $parsed = [
        'customer' => trim((string)$customer),
        'date' => (string)$date,
        'remarks' => (string)$remarks,
        'capacity' => trim((string)$capacity),
        'qty' => $qtyVal,
        'brand' => trim((string)$brand),
        'salePrice' => (float)($salePrice ?: 0),
        'totalPrice' => (float)($totalPrice ?: 0),
        'received' => (float)($received ?: 0),
        'receivable' => (float)($receivable ?: 0),
    ];

    importSale($pdo, $parsed, $ownerId, $branchId, $cashierId, $now);
    $saleCount++;
}
echo "--- JUNE: {$saleCount} sales imported ---\n";

// Process JULY sheet
echo "\n--- Importing JULY Sales ---\n";
$julyRows = $sheets['JULY'] ?? [];
$inSalesSection = false;
$saleCount = 0;

foreach ($julyRows as $row) {
    $rowStr = implode('|', array_map(function($v) { return is_string($v) ? $v : (string)$v; }, $row));

    // Detect sales header
    if (stripos($rowStr, "customer's name") !== false && stripos($rowStr, 's. no.') !== false) {
        $inSalesSection = true;
        continue;
    }
    if (stripos($rowStr, 'remaining stock') !== false) {
        $inSalesSection = false;
        continue;
    }
    if (stripos($rowStr, 'grand total') !== false && stripos($rowStr, 'quantity') !== false) {
        $inSalesSection = false;
        continue;
    }
    if (!$inSalesSection) continue;

    // JULY has two layouts:
    // - shoaib dealer section: has "Description" column before "Capacity"
    //   row[2]=serial, row[3]=customer, row[4]=date, row[5]=remarks, row[6]=description, row[7]=capacity, row[8]=qty, row[9]=brand, row[10]=sale_price, row[11]=total, row[12]=received, row[13]=receivable
    // - other customers: no description column
    //   row[2]=serial, row[3]=customer, row[4]=date, row[5]=remarks, row[6]=capacity, row[7]=qty, row[8]=brand, row[9]=sale_price, row[10]=total, row[11]=received, row[12]=receivable
    $customer = trim((string)($row[3] ?? ''));
    $date = $row[4] ?? '';
    $remarks = trim((string)($row[5] ?? ''));
    $col6 = trim((string)($row[6] ?? ''));
    $col7 = trim((string)($row[7] ?? ''));
    $col8 = $row[8] ?? '';

    // Detect if col6 is a description or capacity
    $hasDesc = stripos($col6, 'wall mounted') !== false || stripos($col6, 'floor') !== false;

    if ($hasDesc) {
        // shoaib dealer format: col6=desc, col7=capacity, col8=qty, col9=brand, col10=sale_price, col11=total, col12=received, col13=receivable
        $capacity = $col7;
        $qty = $row[8] ?? 0;
        $brand = $row[9] ?? '';
        $salePrice = $row[10] ?? 0;
        $totalPrice = $row[11] ?? 0;
        $received = $row[12] ?? 0;
        $receivable = $row[13] ?? 0;
    } else {
        // other customers: col6=capacity
        $capacity = $col6;
        $qty = $row[7] ?? 0;
        $brand = $row[8] ?? '';
        $salePrice = $row[9] ?? 0;
        $totalPrice = $row[10] ?? 0;
        $received = $row[11] ?? 0;
        $receivable = $row[12] ?? 0;
    }

    if ($customer === '' || $customer === null) continue;
    $custLower = strtolower($customer);
    if (in_array($custLower, ['s. no.', "customer's name", 'total', 'grand total', '', 'capacity'])) continue;

    // Normalize capacity — some entries have just a number (missing "ton")
    $capacity = trim($capacity);
    if (is_numeric($capacity) && (int)$capacity > 0) {
        // This is actually quantity, capacity must be inferred or in wrong col
        $qty = (int)$capacity;
        $capacity = '';
    }

    $qtyVal = (int)$qty;
    if ($qtyVal <= 0 && (float)$totalPrice <= 0) continue;

    $remarksStr = strtolower(trim((string)$remarks));
    if ($remarksStr === 'pending' && (float)$received <= 0) {
        echo "  [SKIP] {$customer} — pending (no payment)\n";
        continue;
    }

    $parsed = [
        'customer' => trim((string)$customer),
        'date' => (string)$date,
        'remarks' => (string)$remarks,
        'capacity' => $capacity,
        'qty' => $qtyVal,
        'brand' => trim((string)$brand),
        'salePrice' => (float)($salePrice ?: 0),
        'totalPrice' => (float)($totalPrice ?: 0),
        'received' => (float)($received ?: 0),
        'receivable' => (float)($receivable ?: 0),
    ];

    importSale($pdo, $parsed, $ownerId, $branchId, $cashierId, $now);
    $saleCount++;
}
echo "--- JULY: {$saleCount} sales imported ---\n";

/* ----------------------------------------------------------------
 * Summary
 * ---------------------------------------------------------------- */
echo "\n=== IMPORT SUMMARY ===\n";
echo "Brands:     {$imported['brands']}\n";
echo "Categories: {$imported['categories']}\n";
echo "Products:   {$imported['products']}\n";
echo "Customers:  {$imported['customers']}\n";
echo "Sales:      {$imported['sales']}\n";

// Show final stock
echo "\n--- Current Stock ---\n";
$st = $pdo->prepare("
    SELECT p.name, p.model, bs.quantity
    FROM branch_stocks bs
    JOIN products p ON p.id = bs.product_id
    WHERE bs.branch_id = ? AND bs.quantity != 0
    ORDER BY p.name
");
$st->execute([$branchId]);
foreach ($st->fetchAll() as $row) {
    echo "  {$row['name']}: {$row['quantity']} units\n";
}

echo "\nDone!\n";
