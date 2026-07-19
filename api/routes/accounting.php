<?php

declare(strict_types=1);

function register_accounting_routes(Router $router): void
{
    $router->get('accounting/customers', 'acct_customers_list');
    $router->get('accounting/customers/:id/statement', 'acct_customer_statement');
    $router->post('accounting/customers', 'acct_customers_create');
    $router->put('accounting/customers/:id', 'acct_customers_update');
    $router->post('accounting/customers/:id/repay', 'acct_customer_repay');
    $router->delete('accounting/customers/:id', 'acct_customers_delete', false, ['OWNER']);
    $router->post('accounting/customers/bulk-delete', 'acct_customers_bulk_delete', false, ['OWNER']);

    $router->get('accounting/suppliers', 'acct_suppliers_list');
    $router->post('accounting/suppliers', 'acct_suppliers_create', false, ['OWNER', 'MANAGER']);
    $router->put('accounting/suppliers/:id', 'acct_suppliers_update', false, ['OWNER', 'MANAGER']);
    $router->delete('accounting/suppliers/:id', 'acct_suppliers_delete', false, ['OWNER']);
    $router->post('accounting/suppliers/bulk-delete', 'acct_suppliers_bulk_delete', false, ['OWNER']);

    $router->get('accounting/purchases', 'acct_purchases_list');
    $router->post('accounting/purchases', 'acct_purchases_create', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);
    $router->put('accounting/purchases/:id/status', 'acct_purchases_status', false, ['OWNER', 'MANAGER', 'WAREHOUSE']);

    $router->get('accounting/expenses', 'acct_expenses_list', false, ['OWNER', 'MANAGER']);
    $router->post('accounting/expenses', 'acct_expenses_create', false, ['OWNER', 'MANAGER']);

    $router->get('accounting/bank-accounts', 'acct_banks_list', false, ['OWNER', 'MANAGER']);
    $router->post('accounting/bank-accounts', 'acct_banks_create', false, ['OWNER', 'MANAGER']);
    $router->put('accounting/bank-accounts/:id', 'acct_banks_update', false, ['OWNER', 'MANAGER']);

    $router->get('accounting/transactions', 'acct_tx_list', false, ['OWNER', 'MANAGER']);
    $router->post('accounting/transactions', 'acct_tx_create', false, ['OWNER', 'MANAGER']);
    $router->post('accounting/transactions/transfer', 'acct_tx_transfer', false, ['OWNER', 'MANAGER']);

    $router->get('accounting/profit-loss', 'acct_profit_loss', false, ['OWNER', 'MANAGER']);
    $router->get('accounting/daily-closings/preview', 'acct_closing_preview', false, ['OWNER', 'MANAGER']);
    $router->get('accounting/daily-closings', 'acct_closings_list', false, ['OWNER', 'MANAGER']);
    $router->post('accounting/daily-closings', 'acct_closing_create', false, ['OWNER', 'MANAGER']);
}

function acct_customers_list(array $p): void
{
    $st = Database::pdo();
    $branchId = branch_id();
    if ($branchId) {
        $s = $st->prepare('SELECT * FROM customers WHERE owner_id = ? AND branch_id = ? ORDER BY name ASC');
        $s->execute([tenant_owner_id(), $branchId]);
    } else {
        $s = $st->prepare('SELECT * FROM customers WHERE owner_id = ? ORDER BY name ASC');
        $s->execute([tenant_owner_id()]);
    }
    json_response(array_map([Format::class, 'customer'], $s->fetchAll()));
}

function acct_customer_statement(array $p): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $custSql = 'SELECT * FROM customers WHERE id = ? AND owner_id = ?';
    $custArgs = [$p['id'], $ownerId];
    if ($branchId) {
        $custSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $custArgs[] = $branchId;
    }
    $st = $pdo->prepare($custSql);
    $st->execute($custArgs);
    $customer = $st->fetch();
    if (!$customer) {
        json_error('Customer not found.', 404);
    }
    $st = $pdo->prepare('SELECT * FROM sales WHERE customer_id = ? AND owner_id = ? ORDER BY sale_date DESC');
    $st->execute([$p['id'], $ownerId]);
    $sales = [];
    $totalSales = $totalPayable = $totalPaid = $outstanding = 0.0;
    foreach ($st->fetchAll() as $row) {
        // lightweight hydrate via sales helper if available
        if (function_exists('sales_hydrate')) {
            $s = sales_hydrate($pdo, $row, true);
        } else {
            $s = keys_to_camel($row);
        }
        $sales[] = $s;
        $totalSales += (float) $row['total_amount'];
        $totalPayable += (float) $row['payable_amount'];
        $totalPaid += (float) $row['paid_amount'];
        $outstanding += max(0, (float) $row['payable_amount'] - (float) $row['paid_amount']);
    }
    $st = $pdo->prepare('SELECT * FROM customer_credit_payments WHERE customer_id = ? ORDER BY payment_date DESC');
    $st->execute([$p['id']]);
    $payments = [];
    $totalRepay = 0.0;
    foreach ($st->fetchAll() as $r) {
        $totalRepay += (float) $r['amount'];
        $payments[] = [
            'id' => $r['id'],
            'customerId' => $r['customer_id'],
            'amount' => (float) $r['amount'],
            'paymentDate' => $r['payment_date'],
            'paymentMethod' => $r['payment_method'],
            'notes' => $r['notes'],
        ];
    }
    json_response([
        'customer' => Format::customer($customer),
        'sales' => $sales,
        'creditPayments' => $payments,
        'summary' => [
            'saleCount' => count($sales),
            'totalSales' => $totalSales,
            'totalPayable' => $totalPayable,
            'totalPaidOnInvoices' => $totalPaid,
            'totalCreditRepayments' => $totalRepay,
            'outstandingOnInvoices' => $outstanding,
            'creditBalance' => (float) $customer['credit_balance'],
        ],
    ]);
}

function acct_customers_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['name']) || empty($b['phone'])) {
        json_error('Name and phone number are required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $st = $pdo->prepare('SELECT id FROM customers WHERE phone = ? AND owner_id = ?');
    $st->execute([$b['phone'], $ownerId]);
    if ($st->fetch()) {
        json_error('Customer with this phone number already exists.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $branchId = branch_id();
    $pdo->prepare(
        'INSERT INTO customers (id, name, phone, email, address, reward_points, credit_balance, credit_limit, notes, owner_id, branch_id, created_at, updated_at)
         VALUES (?,?,?,?,?,0,0,?,?,?,?,?,?)'
    )->execute([
        $id, $b['name'], $b['phone'], $b['email'] ?? null, $b['address'] ?? null,
        isset($b['creditLimit']) ? (float) $b['creditLimit'] : 0, $b['notes'] ?? null, $ownerId, $branchId, $now, $now,
    ]);
    $st = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $st->execute([$id]);
    json_response(Format::customer($st->fetch()), 201);
}

function acct_customers_update(array $p): void
{
    $b = read_json_body();
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = ?, address = ?,
         credit_limit = COALESCE(?, credit_limit), notes = ?, updated_at = ? WHERE id = ? AND owner_id = ?';
    $args = [
        $b['name'] ?? null, $b['phone'] ?? null, $b['email'] ?? null, $b['address'] ?? null,
        isset($b['creditLimit']) ? (float) $b['creditLimit'] : null, $b['notes'] ?? null, now_sql(), $p['id'], $ownerId,
    ];
    if ($branchId) {
        $sql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $args[] = $branchId;
    }
    $pdo->prepare($sql)->execute($args);
    $st = $pdo->prepare('SELECT * FROM customers WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], $ownerId]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Customer not found.', 404);
    }
    json_response(Format::customer($row));
}

function acct_customer_repay(array $p): void
{
    $b = read_json_body();
    $amount = (float) ($b['amount'] ?? 0);
    $method = $b['paymentMethod'] ?? null;
    if ($amount <= 0 || !$method) {
        json_error('Repayment amount and payment method are required.', 400);
    }
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        $branchId = branch_id();
        $custSql = 'SELECT * FROM customers WHERE id = ? AND owner_id = ?';
        $custArgs = [$p['id'], $ownerId];
        if ($branchId) {
            $custSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
            $custArgs[] = $branchId;
        }
        $st = $pdo->prepare($custSql . ' FOR UPDATE');
        $st->execute($custArgs);
        $c = $st->fetch();
        if (!$c) {
            throw new RuntimeException('Customer not found.');
        }
        $newBal = max(0, (float) $c['credit_balance'] - $amount);
        $id = uuid_v4();
        $now = now_sql();
        $pdo->prepare(
            'INSERT INTO customer_credit_payments (id, customer_id, amount, payment_date, payment_method, notes) VALUES (?,?,?,?,?,?)'
        )->execute([$id, $p['id'], $amount, $now, $method, $b['notes'] ?? null]);
        $pdo->prepare('UPDATE customers SET credit_balance = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$newBal, $now, $p['id'], $ownerId]);

        $map = ['CASH' => 'CASH', 'CARD' => 'BANK', 'MOBILE' => 'MOBILE_WALLET'];
        $type = $map[strtoupper((string) $method)] ?? 'CASH';
        $st = $pdo->prepare('SELECT id FROM bank_accounts WHERE type = ? AND is_active = 1 AND owner_id = ? LIMIT 1');
        $st->execute([$type, $ownerId]);
        $acc = $st->fetch();
        if (!$acc) {
            $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type='CASH' AND is_active=1 AND owner_id = ? LIMIT 1");
            $st->execute([$ownerId]);
            $acc = $st->fetch();
        }
        if ($acc) {
            $pdo->prepare(
                'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, owner_id, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?)'
            )->execute([uuid_v4(), $acc['id'], 'INCOME', 'CREDIT_PAYMENT', $amount, 'CREDIT_PAYMENT', $id, 'Customer credit repayment', $ownerId, $now]);
            $pdo->prepare('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                ->execute([$amount, $now, $acc['id'], $ownerId]);
        }
        Database::commit();
        json_response([
            'paymentResult' => [
                'id' => $id, 'customerId' => $p['id'], 'amount' => $amount,
                'paymentDate' => $now, 'paymentMethod' => $method, 'notes' => $b['notes'] ?? null,
            ],
            'newBalance' => $newBal,
        ]);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to process credit payment.', 500);
    }
}

function acct_customers_delete(array $p): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    // Verify customer belongs to current owner before deleting related records
    $chkSql = 'SELECT id FROM customers WHERE id = ? AND owner_id = ?';
    $chkArgs = [$p['id'], $ownerId];
    if ($branchId) {
        $chkSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $chkArgs[] = $branchId;
    }
    $st = $pdo->prepare($chkSql);
    $st->execute($chkArgs);
    if (!$st->fetch()) {
        json_error('Customer not found.', 404);
    }
    $pdo->prepare('DELETE FROM customer_credit_payments WHERE customer_id = ?')->execute([$p['id']]);
    $pdo->prepare('DELETE FROM customers WHERE id = ? AND owner_id = ?')->execute([$p['id'], $ownerId]);
    json_response(['message' => 'Customer deleted successfully.']);
}

function acct_customers_bulk_delete(array $p): void
{
    $ids = read_json_body()['ids'] ?? null;
    if (!is_array($ids) || !$ids) {
        json_error('No customer IDs provided.', 400);
    }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    // Verify all customers belong to current owner before deleting related records
    $chkSql = "SELECT id FROM customers WHERE id IN ($ph) AND owner_id = ?";
    $chkArgs = array_merge($ids, [$ownerId]);
    if ($branchId) {
        $chkSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $chkArgs[] = $branchId;
    }
    $st = $pdo->prepare($chkSql);
    $st->execute($chkArgs);
    $ownedIds = array_column($st->fetchAll(), 'id');
    if (!$ownedIds) {
        json_error('No matching customers found.', 404);
    }
    $ownedPh = implode(',', array_fill(0, count($ownedIds), '?'));
    $pdo->prepare("DELETE FROM customer_credit_payments WHERE customer_id IN ($ownedPh)")->execute($ownedIds);
    $pdo->prepare("DELETE FROM customers WHERE id IN ($ownedPh) AND owner_id = ?")->execute(array_merge($ownedIds, [$ownerId]));
    json_response(['message' => count($ownedIds) . ' customers deleted successfully.']);
}

function acct_suppliers_list(array $p): void
{
    $pdo = Database::pdo();
    $branchId = branch_id();
    if ($branchId) {
        $st = $pdo->prepare('SELECT * FROM suppliers WHERE owner_id = ? AND branch_id = ? ORDER BY company ASC');
        $st->execute([tenant_owner_id(), $branchId]);
    } else {
        $st = $pdo->prepare('SELECT * FROM suppliers WHERE owner_id = ? ORDER BY company ASC');
        $st->execute([tenant_owner_id()]);
    }
    json_response(array_map([Format::class, 'supplier'], $st->fetchAll()));
}

function acct_suppliers_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['company'])) {
        json_error('Company name is required.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    Database::pdo()->prepare(
        'INSERT INTO suppliers (id, company, contact_person, phone, email, address, owner_id, branch_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    )->execute([$id, $b['company'], $b['contactPerson'] ?? null, $b['phone'] ?? null, $b['email'] ?? null, $b['address'] ?? null, $ownerId, $branchId, $now, $now]);
    $st = Database::pdo()->prepare('SELECT * FROM suppliers WHERE id = ?');
    $st->execute([$id]);
    json_response(Format::supplier($st->fetch()), 201);
}

function acct_suppliers_update(array $p): void
{
    $b = read_json_body();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'UPDATE suppliers SET company = COALESCE(?, company), contact_person = ?, phone = ?, email = ?, address = ?, updated_at = ? WHERE id = ? AND owner_id = ?';
    $args = [$b['company'] ?? null, $b['contactPerson'] ?? null, $b['phone'] ?? null, $b['email'] ?? null, $b['address'] ?? null, now_sql(), $p['id'], $ownerId];
    if ($branchId) {
        $sql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $args[] = $branchId;
    }
    Database::pdo()->prepare($sql)->execute($args);
    $st = Database::pdo()->prepare('SELECT * FROM suppliers WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], $ownerId]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Supplier not found.', 404);
    }
    json_response(Format::supplier($row));
}

function acct_suppliers_delete(array $p): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    // Verify supplier belongs to current owner before deleting related records
    $chkSql = 'SELECT id FROM suppliers WHERE id = ? AND owner_id = ?';
    $chkArgs = [$p['id'], $ownerId];
    if ($branchId) {
        $chkSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $chkArgs[] = $branchId;
    }
    $st = $pdo->prepare($chkSql);
    $st->execute($chkArgs);
    if (!$st->fetch()) {
        json_error('Supplier not found.', 404);
    }
    $pdo->prepare('DELETE FROM supplier_payments WHERE supplier_id = ?')->execute([$p['id']]);
    $pdo->prepare('DELETE FROM suppliers WHERE id = ? AND owner_id = ?')->execute([$p['id'], $ownerId]);
    json_response(['message' => 'Supplier deleted successfully.']);
}

function acct_suppliers_bulk_delete(array $p): void
{
    $ids = read_json_body()['ids'] ?? null;
    if (!is_array($ids) || !$ids) {
        json_error('No supplier IDs provided.', 400);
    }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    // Verify all suppliers belong to current owner before deleting related records
    $chkSql = "SELECT id FROM suppliers WHERE id IN ($ph) AND owner_id = ?";
    $chkArgs = array_merge($ids, [$ownerId]);
    if ($branchId) {
        $chkSql .= ' AND (branch_id = ? OR branch_id IS NULL)';
        $chkArgs[] = $branchId;
    }
    $st = $pdo->prepare($chkSql);
    $st->execute($chkArgs);
    $ownedIds = array_column($st->fetchAll(), 'id');
    if (!$ownedIds) {
        json_error('No matching suppliers found.', 404);
    }
    $ownedPh = implode(',', array_fill(0, count($ownedIds), '?'));
    $pdo->prepare("DELETE FROM supplier_payments WHERE supplier_id IN ($ownedPh)")->execute($ownedIds);
    $pdo->prepare("DELETE FROM suppliers WHERE id IN ($ownedPh) AND owner_id = ?")->execute(array_merge($ownedIds, [$ownerId]));
    json_response(['message' => count($ownedIds) . ' suppliers deleted successfully.']);
}

function acct_format_purchase(PDO $pdo, array $po): array
{
    $st = $pdo->prepare('SELECT * FROM suppliers WHERE id = ? AND owner_id = ?');
    $st->execute([$po['supplier_id'], $po['owner_id']]);
    $supplier = Format::supplier($st->fetch() ?: null);
    $st = $pdo->prepare(
        'SELECT pi.*, p.name AS p_name, p.sku AS p_sku FROM purchase_items pi
         LEFT JOIN products p ON p.id = pi.product_id WHERE pi.purchase_order_id = ?'
    );
    $st->execute([$po['id']]);
    $items = [];
    foreach ($st->fetchAll() as $it) {
        $items[] = [
            'id' => $it['id'],
            'purchaseOrderId' => $it['purchase_order_id'],
            'productId' => $it['product_id'],
            'quantity' => (int) $it['quantity'],
            'costPrice' => (float) $it['cost_price'],
            'product' => ['id' => $it['product_id'], 'name' => $it['p_name'], 'sku' => $it['p_sku']],
        ];
    }
    return [
        'id' => $po['id'],
        'supplierId' => $po['supplier_id'],
        'orderDate' => $po['order_date'],
        'status' => $po['status'],
        'totalAmount' => (float) $po['total_amount'],
        'notes' => $po['notes'],
        'attachmentPath' => $po['attachment_path'],
        'createdAt' => $po['created_at'],
        'updatedAt' => $po['updated_at'],
        'supplier' => $supplier,
        'items' => $items,
    ];
}

function acct_purchases_list(array $p): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'SELECT * FROM purchase_orders WHERE owner_id = ?'
        . ($branchId ? ' AND branch_id = ?' : '')
        . ' ORDER BY order_date DESC';
    $args = $branchId ? [$ownerId, $branchId] : [$ownerId];
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    json_response(array_map(static fn($r) => acct_format_purchase($pdo, $r), $rows));
}

function acct_purchases_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['supplierId']) || empty($b['items']) || !is_array($b['items'])) {
        json_error('Supplier ID and restock items are required.', 400);
    }
    $total = 0.0;
    foreach ($b['items'] as $it) {
        $total += (float) $it['costPrice'] * (int) $it['quantity'];
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    // Verify supplier belongs to current owner
    $st = $pdo->prepare('SELECT id FROM suppliers WHERE id = ? AND owner_id = ?');
    $st->execute([$b['supplierId'], $ownerId]);
    if (!$st->fetch()) {
        json_error('Supplier not found.', 404);
    }
    $id = uuid_v4();
    $now = now_sql();
    $pdo->prepare(
        'INSERT INTO purchase_orders (id, supplier_id, order_date, status, total_amount, notes, owner_id, branch_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)'
    )->execute([$id, $b['supplierId'], $now, 'PENDING', $total, $b['notes'] ?? null, $ownerId, $branchId, $now, $now]);
    $ins = $pdo->prepare(
        'INSERT INTO purchase_items (id, purchase_order_id, product_id, quantity, cost_price) VALUES (?,?,?,?,?)'
    );
    foreach ($b['items'] as $it) {
        $ins->execute([uuid_v4(), $id, $it['productId'], (int) $it['quantity'], (float) $it['costPrice']]);
    }
    $st = $pdo->prepare('SELECT * FROM purchase_orders WHERE id = ?');
    $st->execute([$id]);
    json_response(acct_format_purchase($pdo, $st->fetch()), 201);
}

function acct_purchases_status(array $p): void
{
    $b = read_json_body();
    $status = $b['status'] ?? null;
    $branchId = $b['branchId'] ?? null;
    if (!$status) {
        json_error('Status is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    try {
        Database::begin();
        $st = $pdo->prepare('SELECT * FROM purchase_orders WHERE id = ? AND owner_id = ? FOR UPDATE');
        $st->execute([$p['id'], $ownerId]);
        $po = $st->fetch();
        if (!$po) {
            throw new RuntimeException('Purchase order not found.');
        }
        if ($po['status'] === 'RECEIVED') {
            throw new RuntimeException('Purchase order items have already been received.');
        }
        $now = now_sql();
        $pdo->prepare('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$status, $now, $p['id'], $ownerId]);
        if ($status === 'RECEIVED') {
            if (!$branchId) {
                throw new RuntimeException('A destination branch must be provided to receive items into stock.');
            }
            $bst = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ? LIMIT 1');
            $bst->execute([$branchId, $ownerId]);
            if (!$bst->fetch()) {
                throw new RuntimeException('Branch not found for your shop.');
            }
            $st = $pdo->prepare('SELECT * FROM purchase_items WHERE purchase_order_id = ?');
            $st->execute([$p['id']]);
            foreach ($st->fetchAll() as $item) {
                $chk = $pdo->prepare('SELECT id FROM branch_stocks WHERE branch_id = ? AND product_id = ?');
                $chk->execute([$branchId, $item['product_id']]);
                if ($chk->fetch()) {
                    $pdo->prepare('UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id = ? AND product_id = ?')
                        ->execute([(int) $item['quantity'], $branchId, $item['product_id']]);
                } else {
                    $pdo->prepare('INSERT INTO branch_stocks (id, branch_id, product_id, quantity) VALUES (?,?,?,?)')
                        ->execute([uuid_v4(), $branchId, $item['product_id'], (int) $item['quantity']]);
                }
                $pdo->prepare('UPDATE products SET stock_quantity = stock_quantity + ?, purchase_price = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                    ->execute([(int) $item['quantity'], (float) $item['cost_price'], $now, $item['product_id'], $ownerId]);
                $pdo->prepare(
                    'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, reference_id, notes, owner_id, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?)'
                )->execute([
                    uuid_v4(), $item['product_id'], (int) $item['quantity'], 'IN', $branchId, $p['id'],
                    'Items received from Purchase Order ' . $p['id'], $ownerId, $now,
                ]);
            }
        }
        Database::commit();
        $st = $pdo->prepare('SELECT * FROM purchase_orders WHERE id = ? AND owner_id = ?');
        $st->execute([$p['id'], $ownerId]);
        json_response(acct_format_purchase($pdo, $st->fetch()));
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to update purchase status.', 400);
    }
}

function acct_expenses_list(array $p): void
{
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $sql = 'SELECT * FROM expenses WHERE owner_id = ?'
        . ($branchId ? ' AND branch_id = ?' : '')
        . ' ORDER BY date DESC';
    $args = $branchId ? [$ownerId, $branchId] : [$ownerId];
    $st = Database::pdo()->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => $r['id'], 'category' => $r['category'], 'amount' => (float) $r['amount'],
            'date' => $r['date'], 'description' => $r['description'], 'paymentMethod' => $r['payment_method'],
            'attachment' => $r['attachment'], 'createdAt' => $r['created_at'],
        ];
    }
    json_response($out);
}

function acct_expenses_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['category']) || !isset($b['amount']) || empty($b['paymentMethod'])) {
        json_error('Category, amount, and payment method are required.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    $amount = (float) $b['amount'];
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $branchId = branch_id();
    $pdo->prepare(
        'INSERT INTO expenses (id, category, amount, date, description, payment_method, owner_id, branch_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    )->execute([$id, $b['category'], $amount, $now, $b['description'] ?? null, $b['paymentMethod'], $ownerId, $branchId, $now]);

    $map = ['CASH' => 'CASH', 'CARD' => 'BANK', 'MOBILE' => 'MOBILE_WALLET'];
    $type = $map[strtoupper((string) $b['paymentMethod'])] ?? 'CASH';
    $st = $pdo->prepare('SELECT id FROM bank_accounts WHERE type = ? AND is_active = 1 AND owner_id = ? LIMIT 1');
    $st->execute([$type, $ownerId]);
    $acc = $st->fetch();
    if (!$acc) {
        $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type='CASH' AND is_active=1 AND owner_id = ? LIMIT 1");
        $st->execute([$ownerId]);
        $acc = $st->fetch();
    }
    if ($acc) {
        $pdo->prepare(
            'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, owner_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        )->execute([uuid_v4(), $acc['id'], 'EXPENSE', 'EXPENSE', $amount, 'EXPENSE', $id, $b['category'], $ownerId, $now]);
        $pdo->prepare('UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$amount, $now, $acc['id'], $ownerId]);
    }
    json_response([
        'id' => $id, 'category' => $b['category'], 'amount' => $amount, 'date' => $now,
        'description' => $b['description'] ?? null, 'paymentMethod' => $b['paymentMethod'], 'createdAt' => $now,
    ], 201);
}

function acct_banks_list(array $p): void
{
    $pdo = Database::pdo();
    $st = $pdo->prepare('SELECT * FROM bank_accounts WHERE owner_id = ? ORDER BY created_at ASC');
    $st->execute([tenant_owner_id()]);
    $rows = $st->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $acc = Format::bankAccount($r);
        $st = $pdo->prepare('SELECT * FROM transactions WHERE bank_account_id = ? ORDER BY created_at DESC LIMIT 1');
        $st->execute([$r['id']]);
        $tx = $st->fetch();
        $acc['transactions'] = $tx ? [[
            'id' => $tx['id'], 'type' => $tx['type'], 'amount' => (float) $tx['amount'],
            'createdAt' => $tx['created_at'], 'description' => $tx['description'],
        ]] : [];
        $out[] = $acc;
    }
    json_response($out);
}

function acct_banks_create(array $p): void
{
    $b = read_json_body();
    if (empty($b['name']) || empty($b['type'])) {
        json_error('Name and type are required.', 400);
    }
    $id = uuid_v4();
    $now = now_sql();
    Database::pdo()->prepare(
        'INSERT INTO bank_accounts (id, name, type, account_number, bank_name, balance, is_active, notes, owner_id, created_at, updated_at)
         VALUES (?,?,?,?,?,0,1,?,?,?,?)'
    )->execute([$id, $b['name'], $b['type'], $b['accountNumber'] ?? null, $b['bankName'] ?? null, $b['notes'] ?? null, tenant_owner_id(), $now, $now]);
    $st = Database::pdo()->prepare('SELECT * FROM bank_accounts WHERE id = ?');
    $st->execute([$id]);
    json_response(Format::bankAccount($st->fetch()), 201);
}

function acct_banks_update(array $p): void
{
    $b = read_json_body();
    $ownerId = tenant_owner_id();
    Database::pdo()->prepare(
        'UPDATE bank_accounts SET name = COALESCE(?, name), type = COALESCE(?, type), account_number = ?, bank_name = ?,
         notes = ?, is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ? AND owner_id = ?'
    )->execute([
        $b['name'] ?? null, $b['type'] ?? null, $b['accountNumber'] ?? null, $b['bankName'] ?? null,
        $b['notes'] ?? null, isset($b['isActive']) ? ($b['isActive'] ? 1 : 0) : null, now_sql(), $p['id'], $ownerId,
    ]);
    $st = Database::pdo()->prepare('SELECT * FROM bank_accounts WHERE id = ? AND owner_id = ?');
    $st->execute([$p['id'], $ownerId]);
    json_response(Format::bankAccount($st->fetch()));
}

function acct_tx_list(array $p): void
{
    $q = query_params();
    $where = ['(t.owner_id = ? OR b.owner_id = ?)'];
    $oid = tenant_owner_id();
    $args = [$oid, $oid];
    $branchId = isset($q['branchId']) && $q['branchId'] !== '' ? (string) $q['branchId'] : branch_id();
    if ($branchId) {
        $where[] = 't.branch_id = ?';
        $args[] = $branchId;
    }
    if (!empty($q['bankAccountId'])) {
        $where[] = 't.bank_account_id = ?';
        $args[] = $q['bankAccountId'];
    }
    if (!empty($q['type'])) {
        $where[] = 't.type = ?';
        $args[] = $q['type'];
    }
    if (!empty($q['category'])) {
        $where[] = 't.category = ?';
        $args[] = $q['category'];
    }
    if (!empty($q['startDate'])) {
        $where[] = 't.created_at >= ?';
        $args[] = $q['startDate'] . ' 00:00:00';
    }
    if (!empty($q['endDate'])) {
        $where[] = 't.created_at <= ?';
        $args[] = $q['endDate'] . ' 23:59:59';
    }
    $sql = 'SELECT t.*, b.name AS b_name, b.type AS b_type FROM transactions t
            LEFT JOIN bank_accounts b ON b.id = t.bank_account_id
            WHERE ' . implode(' AND ', $where) . ' ORDER BY t.created_at DESC LIMIT 200';
    $st = Database::pdo()->prepare($sql);
    $st->execute($args);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $out[] = [
            'id' => $r['id'], 'bankAccountId' => $r['bank_account_id'], 'type' => $r['type'],
            'category' => $r['category'], 'amount' => (float) $r['amount'],
            'referenceType' => $r['reference_type'], 'referenceId' => $r['reference_id'],
            'description' => $r['description'], 'branchId' => $r['branch_id'],
            'createdBy' => $r['created_by'], 'createdAt' => $r['created_at'],
            'bankAccount' => ['id' => $r['bank_account_id'], 'name' => $r['b_name'], 'type' => $r['b_type']],
        ];
    }
    json_response($out);
}

function acct_tx_create(array $p): void
{
    $b = read_json_body();
    $user = Auth::requireUser();
    if (empty($b['bankAccountId']) || empty($b['type']) || !isset($b['amount'])) {
        json_error('Bank account, type, and amount are required.', 400);
    }
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        $st = $pdo->prepare('SELECT * FROM bank_accounts WHERE id = ? AND owner_id = ? FOR UPDATE');
        $st->execute([$b['bankAccountId'], $ownerId]);
        $acc = $st->fetch();
        if (!$acc) {
            throw new RuntimeException('Bank account not found.');
        }
        $amt = (float) $b['amount'];
        $newBal = $b['type'] === 'INCOME' ? (float) $acc['balance'] + $amt : (float) $acc['balance'] - $amt;
        $pdo->prepare('UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$newBal, now_sql(), $b['bankAccountId'], $ownerId]);
        $id = uuid_v4();
        $now = now_sql();
        $pdo->prepare(
            'INSERT INTO transactions (id, bank_account_id, type, category, amount, description, branch_id, created_by, owner_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $id, $b['bankAccountId'], $b['type'], $b['category'] ?? 'ADJUSTMENT', $amt,
            $b['description'] ?? null, $b['branchId'] ?? null, $user['id'], $ownerId, $now,
        ]);
        Database::commit();
        json_response([
            'id' => $id, 'bankAccountId' => $b['bankAccountId'], 'type' => $b['type'],
            'category' => $b['category'] ?? 'ADJUSTMENT', 'amount' => $amt,
            'description' => $b['description'] ?? null, 'createdAt' => $now,
        ], 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to record transaction.', 400);
    }
}

function acct_tx_transfer(array $p): void
{
    $b = read_json_body();
    $user = Auth::requireUser();
    if (empty($b['fromAccountId']) || empty($b['toAccountId']) || !isset($b['amount'])) {
        json_error('Source, destination, and amount are required.', 400);
    }
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        $st = $pdo->prepare('SELECT * FROM bank_accounts WHERE id = ? AND owner_id = ? FOR UPDATE');
        $st->execute([$b['fromAccountId'], $ownerId]);
        $from = $st->fetch();
        $st->execute([$b['toAccountId'], $ownerId]);
        $to = $st->fetch();
        if (!$from || !$to) {
            throw new RuntimeException('One or both accounts not found.');
        }
        $amt = (float) $b['amount'];
        if ((float) $from['balance'] < $amt) {
            throw new RuntimeException('Insufficient balance in source account.');
        }
        $now = now_sql();
        $pdo->prepare('UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$amt, $now, $b['fromAccountId'], $ownerId]);
        $pdo->prepare('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$amt, $now, $b['toAccountId'], $ownerId]);
        $desc = $b['description'] ?? ("Transfer from {$from['name']} to {$to['name']}");
        $outId = uuid_v4();
        $inId = uuid_v4();
        $ins = $pdo->prepare(
            'INSERT INTO transactions (id, bank_account_id, type, category, amount, description, created_by, owner_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $ins->execute([$outId, $b['fromAccountId'], 'TRANSFER', 'TRANSFER', $amt, $desc, $user['id'], $ownerId, $now]);
        $ins->execute([$inId, $b['toAccountId'], 'TRANSFER', 'TRANSFER', $amt, $desc, $user['id'], $ownerId, $now]);
        Database::commit();
        json_response(['outTx' => ['id' => $outId], 'inTx' => ['id' => $inId]], 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to transfer funds.', 400);
    }
}

function acct_profit_loss(array $p): void
{
    $q = query_params();
    $start = !empty($q['startDate']) ? $q['startDate'] . ' 00:00:00' : date('Y-m-01 00:00:00');
    $end = !empty($q['endDate']) ? $q['endDate'] . ' 23:59:59' : date('Y-m-d 23:59:59');
    $branch = $q['branchId'] ?? branch_id();
    $pdo = Database::pdo();

    $ownerId = tenant_owner_id();
    $saleSql = 'SELECT COUNT(*) AS cnt, COALESCE(SUM(payable_amount),0) AS rev, COALESCE(SUM(tax_amount),0) AS tax, COALESCE(SUM(discount_amount),0) AS disc
                FROM sales WHERE owner_id = ? AND sale_date BETWEEN ? AND ?';
    $args = [$ownerId, $start, $end];
    if ($branch) {
        $saleSql .= ' AND branch_id = ?';
        $args[] = $branch;
    }
    $st = $pdo->prepare($saleSql);
    $st->execute($args);
    $sales = $st->fetch();

    $cogsSql = 'SELECT COALESCE(SUM(p.purchase_price * si.quantity),0) AS cogs FROM sale_items si
                JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
                WHERE s.owner_id = ? AND s.sale_date BETWEEN ? AND ?';
    $cargs = [$ownerId, $start, $end];
    if ($branch) {
        $cogsSql .= ' AND s.branch_id = ?';
        $cargs[] = $branch;
    }
    $st = $pdo->prepare($cogsSql);
    $st->execute($cargs);
    $cogs = (float) $st->fetchColumn();

    $st = $pdo->prepare('SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses WHERE owner_id = ? AND date BETWEEN ? AND ?'
        . ($branch ? ' AND branch_id = ?' : '') . ' GROUP BY category');
    $args_exp = [$ownerId, $start, $end];
    if ($branch) $args_exp[] = $branch;
    $st->execute($args_exp);
    $byCat = [];
    $totalExp = 0.0;
    foreach ($st->fetchAll() as $r) {
        $byCat[$r['category']] = (float) $r['total'];
        $totalExp += (float) $r['total'];
    }
    $rev = (float) $sales['rev'];
    $gross = $rev - $cogs;
    $net = $gross - $totalExp;
    json_response([
        'period' => ['startDate' => $start, 'endDate' => $end],
        'revenue' => [
            'totalSales' => (int) $sales['cnt'],
            'grossRevenue' => $rev,
            'taxCollected' => (float) $sales['tax'],
            'discountsGiven' => (float) $sales['disc'],
        ],
        'cogs' => [
            'totalCOGS' => $cogs,
            'grossProfit' => $gross,
            'grossMargin' => $rev ? round(($gross / $rev) * 100, 2) : 0,
        ],
        'expenses' => ['byCategory' => $byCat, 'totalExpenses' => $totalExp],
        'netProfit' => $net,
        'netMargin' => $rev ? round(($net / $rev) * 100, 2) : 0,
    ]);
}

function acct_closings_list(array $p): void
{
    $branchId = branch_id();
    $sql = 'SELECT * FROM daily_closings WHERE owner_id = ?';
    $args = [tenant_owner_id()];
    if ($branchId) {
        $sql .= ' AND branch_id = ?';
        $args[] = $branchId;
    }
    $sql .= ' ORDER BY closing_date DESC LIMIT 30';
    $st = Database::pdo()->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[] = keys_to_camel($r);
    }
    json_response($out);
}

function acct_day_bounds(?string $date): array
{
    $d = $date ? strtotime($date) : time();
    $start = date('Y-m-d 00:00:00', $d);
    $end = date('Y-m-d 23:59:59', $d);
    return [$start, $end];
}

function acct_closing_preview(array $p): void
{
    $q = query_params();
    $ownerId = tenant_owner_id();
    [$start, $end] = acct_day_bounds($q['date'] ?? null);
    $branch = $q['branchId'] ?? branch_id();
    $pdo = Database::pdo();
    $saleSql = "SELECT COALESCE(SUM(paid_amount),0) AS paid, COUNT(*) AS cnt FROM sales
                WHERE sale_date BETWEEN ? AND ? AND payment_status <> 'UNPAID' AND owner_id = ?";
    $args = [$start, $end, $ownerId];
    if ($branch) {
        $saleSql .= ' AND branch_id = ?';
        $args[] = $branch;
    }
    $st = $pdo->prepare($saleSql);
    $st->execute($args);
    $sales = $st->fetch();
    $expSql = 'SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ? AND owner_id = ?'
        . ($branch ? ' AND branch_id = ?' : '');
    $expArgs = $branch ? [$start, $end, $ownerId, $branch] : [$start, $end, $ownerId];
    $st = $pdo->prepare($expSql);
    $st->execute($expArgs);
    $exp = (float) $st->fetchColumn();
    $retSql = "SELECT COALESCE(SUM(refund_amount),0) FROM sale_returns r JOIN sales s ON s.id = r.sale_id
               WHERE r.status='COMPLETED' AND r.return_date BETWEEN ? AND ? AND s.owner_id = ?";
    $rargs = [$start, $end, $ownerId];
    if ($branch) {
        $retSql .= ' AND s.branch_id = ?';
        $rargs[] = $branch;
    }
    $st = $pdo->prepare($retSql);
    $st->execute($rargs);
    $ret = (float) $st->fetchColumn();
    json_response([
        'date' => substr($start, 0, 10),
        'totalSales' => (float) $sales['paid'],
        'salesCount' => (int) $sales['cnt'],
        'totalExpenses' => $exp,
        'totalReturns' => $ret,
    ]);
}

function acct_closing_create(array $p): void
{
    $b = read_json_body();
    $user = Auth::requireUser();
    if (!isset($b['actualBalance'])) {
        json_error('Actual balance is required.', 400);
    }
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    [$start, $end] = acct_day_bounds($b['closingDate'] ?? null);
    $branchId = $b['branchId'] ?? null;

    $st = $pdo->prepare('SELECT id FROM daily_closings WHERE closing_date BETWEEN ? AND ? AND owner_id = ? LIMIT 1');
    $st->execute([$start, $end, $ownerId]);
    if ($st->fetch()) {
        json_error('Daily closing already exists for this date.', 400);
    }

    $saleSql = "SELECT COALESCE(SUM(paid_amount),0) FROM sales WHERE sale_date BETWEEN ? AND ? AND payment_status <> 'UNPAID' AND owner_id = ?";
    $args = [$start, $end, $ownerId];
    if ($branchId) {
        $saleSql .= ' AND branch_id = ?';
        $args[] = $branchId;
    }
    $st = $pdo->prepare($saleSql);
    $st->execute($args);
    $totalSales = (float) $st->fetchColumn();
    $expSql = 'SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ? AND owner_id = ?'
        . ($branchId ? ' AND branch_id = ?' : '');
    $expArgs = $branchId ? [$start, $end, $ownerId, $branchId] : [$start, $end, $ownerId];
    $st = $pdo->prepare($expSql);
    $st->execute($expArgs);
    $totalExpenses = (float) $st->fetchColumn();
    $retSql = "SELECT COALESCE(SUM(r.refund_amount),0) FROM sale_returns r JOIN sales s ON s.id=r.sale_id
               WHERE r.status='COMPLETED' AND r.return_date BETWEEN ? AND ? AND s.owner_id = ?";
    $rargs = [$start, $end, $ownerId];
    if ($branchId) {
        $retSql .= ' AND s.branch_id = ?';
        $rargs[] = $branchId;
    }
    $st = $pdo->prepare($retSql);
    $st->execute($rargs);
    $totalReturns = (float) $st->fetchColumn();

    $ob = (float) ($b['openingBalance'] ?? 0);
    $ci = (float) ($b['cashIn'] ?? 0);
    $co = (float) ($b['cashOut'] ?? 0);
    $actual = (float) $b['actualBalance'];
    $expected = $ob + $totalSales + $ci - $totalExpenses - $co - $totalReturns;
    $variance = $actual - $expected;
    $id = uuid_v4();
    $now = now_sql();
    $pdo->prepare(
        'INSERT INTO daily_closings (id, closing_date, branch_id, opening_balance, total_sales, total_expenses, total_returns,
         cash_in, cash_out, expected_balance, actual_balance, variance, status, notes, closed_by, owner_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $id, $start, $branchId, $ob, $totalSales, $totalExpenses, $totalReturns, $ci, $co,
        $expected, $actual, $variance, 'CLOSED', $b['notes'] ?? null, $user['id'], $ownerId, $now, $now,
    ]);
    $st = $pdo->prepare('SELECT * FROM daily_closings WHERE id = ?');
    $st->execute([$id]);
    json_response(keys_to_camel($st->fetch()), 201);
}
