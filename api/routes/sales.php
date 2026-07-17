<?php

declare(strict_types=1);

function register_sales_routes(Router $router): void
{
    $router->post('sales', 'sales_create');
    $router->get('sales', 'sales_list');
    $router->get('sales/returns', 'sales_returns_list');
    $router->get('sales/returns/:returnId', 'sales_return_get');
    $router->post('sales/returns', 'sales_return_create');
    $router->get('sales/:id/returnable', 'sales_returnable');
    $router->post('sales/:id/emi', 'sales_emi_create');
    $router->post('sales/:id/installments/:installmentId/pay', 'sales_installment_pay');
    $router->get('sales/:id', 'sales_get');
}

function sales_fetch_sale(PDO $pdo, string $id, bool $full = true): ?array
{
    // Prefer tenant-scoped lookup when authenticated
    $ownerId = null;
    try {
        if (Auth::$user !== null || get_bearer_token()) {
            $ownerId = tenant_owner_id();
        }
    } catch (Throwable $e) {
        $ownerId = null;
    }
    if ($ownerId) {
        $st = $pdo->prepare('SELECT * FROM sales WHERE id = ? AND owner_id = ?');
        $st->execute([$id, $ownerId]);
    } else {
        $st = $pdo->prepare('SELECT * FROM sales WHERE id = ?');
        $st->execute([$id]);
    }
    $sale = $st->fetch();
    if (!$sale) {
        return null;
    }
    return sales_hydrate($pdo, $sale, $full);
}

function sales_hydrate(PDO $pdo, array $sale, bool $full = true): array
{
    $id = $sale['id'];
    $cust = null;
    if ($sale['customer_id']) {
        $s = $pdo->prepare('SELECT * FROM customers WHERE id = ? AND owner_id = ?');
        $s->execute([$sale['customer_id'], $sale['owner_id']]);
        $cust = Format::customer($s->fetch() ?: null);
    }
    $cashier = null;
    $s = $pdo->prepare('SELECT id, name, username, role FROM users WHERE id = ?');
    $s->execute([$sale['cashier_id']]);
    $cashier = Format::userLite($s->fetch() ?: null);

    $branch = null;
    $s = $pdo->prepare('SELECT * FROM branches WHERE id = ?');
    $s->execute([$sale['branch_id']]);
    $branch = Format::branch($s->fetch() ?: null);

    $items = [];
    $s = $pdo->prepare(
        'SELECT si.*, p.name AS p_name, p.sku AS p_sku, p.model AS p_model, p.selling_price AS p_selling, p.purchase_price AS p_purchase
         FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?'
    );
    $s->execute([$id]);
    foreach ($s->fetchAll() as $it) {
        $items[] = [
            'id' => $it['id'],
            'saleId' => $it['sale_id'],
            'productId' => $it['product_id'],
            'quantity' => (int) $it['quantity'],
            'unitPrice' => (float) $it['unit_price'],
            'discount' => (float) $it['discount'],
            'tax' => (float) $it['tax'],
            'totalPrice' => (float) $it['total_price'],
            'serialNumber' => $it['serial_number'],
            'imei' => $it['imei'],
            'product' => [
                'id' => $it['product_id'],
                'name' => $it['p_name'],
                'sku' => $it['p_sku'],
                'model' => $it['p_model'],
                'sellingPrice' => $it['p_selling'] !== null ? (float) $it['p_selling'] : null,
                'purchasePrice' => $it['p_purchase'] !== null ? (float) $it['p_purchase'] : null,
            ],
        ];
    }

    $emi = null;
    $s = $pdo->prepare('SELECT * FROM sale_emis WHERE sale_id = ?');
    $s->execute([$id]);
    $emiRow = $s->fetch();
    if ($emiRow) {
        $inst = $pdo->prepare('SELECT * FROM emi_installments WHERE sale_emi_id = ? ORDER BY installment_number ASC');
        $inst->execute([$emiRow['id']]);
        $installments = [];
        foreach ($inst->fetchAll() as $i) {
            $installments[] = [
                'id' => $i['id'],
                'saleEmiId' => $i['sale_emi_id'],
                'installmentNumber' => (int) $i['installment_number'],
                'dueDate' => $i['due_date'],
                'amount' => (float) $i['amount'],
                'amountPaid' => (float) $i['amount_paid'],
                'paidDate' => $i['paid_date'],
                'status' => $i['status'],
                'createdAt' => $i['created_at'],
                'updatedAt' => $i['updated_at'],
            ];
        }
        $emi = [
            'id' => $emiRow['id'],
            'saleId' => $emiRow['sale_id'],
            'guarantorName' => $emiRow['guarantor_name'],
            'guarantorPhone' => $emiRow['guarantor_phone'],
            'guarantorAddress' => $emiRow['guarantor_address'],
            'cnicFrontPath' => $emiRow['cnic_front_path'],
            'cnicBackPath' => $emiRow['cnic_back_path'],
            'chequePath' => $emiRow['cheque_path'],
            'months' => (int) $emiRow['months'],
            'interestRate' => (float) $emiRow['interest_rate'],
            'downPayment' => (float) $emiRow['down_payment'],
            'totalPrincipal' => (float) $emiRow['total_principal'],
            'monthlyPayment' => (float) $emiRow['monthly_payment'],
            'status' => $emiRow['status'],
            'installments' => $installments,
            'createdAt' => $emiRow['created_at'],
            'updatedAt' => $emiRow['updated_at'],
        ];
    }

    $returns = [];
    if ($full) {
        $s = $pdo->prepare('SELECT * FROM sale_returns WHERE sale_id = ? AND status = ? ORDER BY return_date DESC');
        $s->execute([$id, 'COMPLETED']);
        foreach ($s->fetchAll() as $ret) {
            $returns[] = sales_format_return($pdo, $ret, false);
        }
    }

    return [
        'id' => $sale['id'],
        'customerId' => $sale['customer_id'],
        'cashierId' => $sale['cashier_id'],
        'branchId' => $sale['branch_id'],
        'saleDate' => $sale['sale_date'],
        'totalAmount' => (float) $sale['total_amount'],
        'discountAmount' => (float) $sale['discount_amount'],
        'taxAmount' => (float) $sale['tax_amount'],
        'payableAmount' => (float) $sale['payable_amount'],
        'paidAmount' => (float) $sale['paid_amount'],
        'paymentMethod' => $sale['payment_method'],
        'paymentStatus' => $sale['payment_status'],
        'returnStatus' => $sale['return_status'],
        'notes' => $sale['notes'],
        'createdAt' => $sale['created_at'],
        'updatedAt' => $sale['updated_at'],
        'customer' => $cust,
        'cashier' => $cashier,
        'branch' => $branch,
        'items' => $items,
        'emiDetails' => $emi,
        'returns' => $returns,
    ];
}

function sales_format_return(PDO $pdo, array $ret, bool $withSale = true): array
{
    $items = [];
    $s = $pdo->prepare(
        'SELECT ri.*, p.name AS p_name, p.sku AS p_sku FROM sale_return_items ri
         LEFT JOIN products p ON p.id = ri.product_id WHERE ri.sale_return_id = ?'
    );
    $s->execute([$ret['id']]);
    foreach ($s->fetchAll() as $ri) {
        $items[] = [
            'id' => $ri['id'],
            'saleReturnId' => $ri['sale_return_id'],
            'saleItemId' => $ri['sale_item_id'],
            'productId' => $ri['product_id'],
            'quantity' => (int) $ri['quantity'],
            'unitRefund' => (float) $ri['unit_refund'],
            'totalRefund' => (float) $ri['total_refund'],
            'reason' => $ri['reason'],
            'product' => ['id' => $ri['product_id'], 'name' => $ri['p_name'], 'sku' => $ri['p_sku']],
        ];
    }
    $processed = null;
    $s = $pdo->prepare('SELECT id, name, username FROM users WHERE id = ?');
    $s->execute([$ret['processed_by_id']]);
    $processed = Format::userLite($s->fetch() ?: null);

    $out = [
        'id' => $ret['id'],
        'saleId' => $ret['sale_id'],
        'processedById' => $ret['processed_by_id'],
        'returnDate' => $ret['return_date'],
        'refundAmount' => (float) $ret['refund_amount'],
        'refundMethod' => $ret['refund_method'],
        'reason' => $ret['reason'],
        'notes' => $ret['notes'],
        'status' => $ret['status'],
        'createdAt' => $ret['created_at'],
        'updatedAt' => $ret['updated_at'],
        'items' => $items,
        'processedBy' => $processed,
    ];
    if ($withSale) {
        $out['sale'] = sales_fetch_sale($pdo, $ret['sale_id'], false);
    }
    return $out;
}

function sales_create(array $params): void
{
    $body = read_json_body();
    $user = Auth::requireUser();
    $items = $body['items'] ?? null;
    $paymentMethod = $body['paymentMethod'] ?? null;
    $paidAmount = $body['paidAmount'] ?? null;

    if (!$items || !is_array($items) || count($items) === 0 || !$paymentMethod || $paidAmount === null) {
        json_error('Missing checkout parameters.', 400);
    }

    $ownerId = tenant_owner_id();
    $branchId = $body['branchId'] ?? $user['branchId'];
    $cashierId = $user['id'];
    $customerId = $body['customerId'] ?? null;
    $pdo = Database::pdo();

    if ($branchId) {
        $st = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ?');
        $st->execute([$branchId, $ownerId]);
        if (!$st->fetch()) {
            $branchId = $user['branchId'];
        }
    }
    if (!$branchId) {
        $st = $pdo->prepare('SELECT id FROM branches WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1');
        $st->execute([$ownerId]);
        $branchId = $st->fetchColumn() ?: null;
    }
    if (!$branchId) {
        json_error('Cashier session lacks a designated branch location.', 400);
    }
    $st = $pdo->prepare('SELECT id FROM branches WHERE id = ? AND owner_id = ?');
    $st->execute([$branchId, $ownerId]);
    if (!$st->fetch()) {
        json_error('Designated branch location does not exist for your shop.', 400);
    }

    $gstEnabled = false;
    $gstRate = 0.0;
    $st = $pdo->prepare("SELECT `key`, value FROM system_settings WHERE owner_id = ? AND `key` IN ('gstEnabled','gstRate')");
    $st->execute([$ownerId]);
    foreach ($st->fetchAll() as $row) {
        if ($row['key'] === 'gstEnabled') {
            $gstEnabled = $row['value'] === 'true';
        }
        if ($row['key'] === 'gstRate') {
            $gstRate = $gstEnabled ? (float) $row['value'] : 0.0;
        }
    }

    try {
        Database::begin();
        $normalizedPaid = round_money((float) $paidAmount);
        $normalizedDiscount = round_money((float) ($body['discountAmount'] ?? 0));
        $subtotal = 0.0;
        $computedTax = 0.0;
        $itemsToCreate = [];

        foreach ($items as $item) {
            $productId = (string) $item['productId'];
            $qty = (int) $item['quantity'];
            $st = $pdo->prepare('SELECT id, name, selling_price FROM products WHERE id = ? AND owner_id = ? FOR UPDATE');
            $st->execute([$productId, $ownerId]);
            $prod = $st->fetch();
            if (!$prod) {
                throw new RuntimeException("Product not found: {$productId}");
            }
            $st = $pdo->prepare('SELECT quantity FROM branch_stocks WHERE branch_id = ? AND product_id = ? FOR UPDATE');
            $st->execute([$branchId, $productId]);
            $bs = $st->fetch();
            $currentQty = $bs ? (int) $bs['quantity'] : 0;
            if ($currentQty < $qty) {
                throw new RuntimeException("Insufficient stock for product {$prod['name']} at this branch.");
            }

            $unit = (float) $prod['selling_price'];
            $itemDiscount = (float) ($item['discount'] ?? 0);
            $itemTax = $gstRate;
            $baseTotal = $unit * $qty;
            $discValue = $baseTotal * ($itemDiscount / 100);
            $taxValue = round_money(($baseTotal - $discValue) * ($itemTax / 100));
            $lineSub = round_money($baseTotal - $discValue);
            $itemTotal = round_money($lineSub + $taxValue);
            $subtotal += $lineSub;
            $computedTax += $taxValue;

            $itemsToCreate[] = [
                'productId' => $productId,
                'quantity' => $qty,
                'unitPrice' => $unit,
                'discount' => $itemDiscount,
                'tax' => $itemTax,
                'totalPrice' => $itemTotal,
                'serialNumber' => $item['serialNumber'] ?? null,
                'imei' => $item['imei'] ?? null,
            ];

            if ($bs) {
                $pdo->prepare('UPDATE branch_stocks SET quantity = quantity - ? WHERE branch_id = ? AND product_id = ?')
                    ->execute([$qty, $branchId, $productId]);
            } else {
                throw new RuntimeException("No branch stock row for product {$prod['name']}.");
            }
            $pdo->prepare('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?')
                ->execute([$qty, now_sql(), $productId]);
        }

        $subtotal = round_money($subtotal);
        $computedTax = round_money($computedTax);
        $payable = round_money(max(0, $subtotal - $normalizedDiscount + $computedTax));
        $remaining = round_money(max(0, $payable - $normalizedPaid));
        $paymentStatus = 'PAID';
        $debt = 0.0;

        if ($paymentMethod === 'CREDIT') {
            if (!$customerId) {
                throw new RuntimeException('Customer profile is required for credit transactions.');
            }
            $debt = $payable;
            $paymentStatus = 'UNPAID';
        } elseif ($paymentMethod === 'EMI') {
            if (!$customerId) {
                throw new RuntimeException('Customer profile is required for EMI transactions.');
            }
            $debt = $remaining;
            $paymentStatus = $normalizedPaid > 0 ? ($remaining === 0.0 ? 'PAID' : 'PARTIAL') : 'UNPAID';
        } elseif ($remaining > 0) {
            $debt = $remaining;
            $paymentStatus = 'PARTIAL';
        }

        if ($debt > 0 && $customerId) {
            $st = $pdo->prepare('SELECT * FROM customers WHERE id = ? AND owner_id = ? FOR UPDATE');
            $st->execute([$customerId, $ownerId]);
            $customer = $st->fetch();
            if (!$customer) {
                throw new RuntimeException('Customer profile not found.');
            }
            $projected = round_money((float) $customer['credit_balance'] + $debt);
            if ($projected > (float) $customer['credit_limit']) {
                throw new RuntimeException('Transaction exceeds customer\'s credit limit of Rs. ' . $customer['credit_limit'] . '.');
            }
            $pdo->prepare('UPDATE customers SET credit_balance = ?, updated_at = ? WHERE id = ?')
                ->execute([$projected, now_sql(), $customerId]);
        }

        if ($customerId) {
            $points = (int) floor($payable / 10);
            $pdo->prepare('UPDATE customers SET reward_points = reward_points + ?, updated_at = ? WHERE id = ?')
                ->execute([$points, now_sql(), $customerId]);
        }

        $saleId = uuid_v4();
        $now = now_sql();
        $pdo->prepare(
            'INSERT INTO sales (id, customer_id, cashier_id, branch_id, sale_date, total_amount, discount_amount, tax_amount,
             payable_amount, paid_amount, payment_method, payment_status, return_status, notes, owner_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $saleId, $customerId ?: null, $cashierId, $branchId, $now, $subtotal, $normalizedDiscount, $computedTax,
            $payable, $normalizedPaid, $paymentMethod, $paymentStatus, 'NONE', $body['notes'] ?? null, $ownerId, $now, $now,
        ]);

        $insItem = $pdo->prepare(
            'INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, discount, tax, total_price, serial_number, imei)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        );
        $insMv = $pdo->prepare(
            'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, reference_id, notes, owner_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($itemsToCreate as $it) {
            $insItem->execute([
                uuid_v4(), $saleId, $it['productId'], $it['quantity'], $it['unitPrice'], $it['discount'],
                $it['tax'], $it['totalPrice'], $it['serialNumber'], $it['imei'],
            ]);
            $insMv->execute([
                uuid_v4(), $it['productId'], -$it['quantity'], 'OUT', $branchId, $saleId, 'POS sale checkout', $ownerId, $now,
            ]);
        }

        // Record cash income for paid amount (non-credit full tracking)
        if ($normalizedPaid > 0 && $paymentMethod !== 'CREDIT') {
            $typeMap = ['CASH' => 'CASH', 'CARD' => 'BANK', 'MOBILE' => 'MOBILE_WALLET', 'SPLIT' => 'CASH', 'EMI' => 'CASH'];
            $accType = $typeMap[$paymentMethod] ?? 'CASH';
            $st = $pdo->prepare('SELECT id FROM bank_accounts WHERE type = ? AND is_active = 1 AND owner_id = ? LIMIT 1');
            $st->execute([$accType, $ownerId]);
            $acc = $st->fetch();
            if (!$acc) {
                $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type = 'CASH' AND is_active = 1 AND owner_id = ? LIMIT 1");
                $st->execute([$ownerId]);
                $acc = $st->fetch();
            }
            if ($acc) {
                $pdo->prepare(
                    'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, branch_id, created_by, owner_id, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
                )->execute([
                    uuid_v4(), $acc['id'], 'INCOME', 'SALE', $normalizedPaid, 'SALE', $saleId,
                    'Sale payment Invoice #' . substr($saleId, 0, 8), $branchId, $cashierId, $ownerId, $now,
                ]);
                $pdo->prepare('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                    ->execute([$normalizedPaid, $now, $acc['id'], $ownerId]);
            }
        }

        Database::commit();
        $sale = sales_fetch_sale($pdo, $saleId, true);
        json_response($sale, 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to process sale.', 400);
    }
}

/**
 * Batch-hydrate many sales (avoids N+1: was ~5–8 queries per sale).
 * @param list<array<string,mixed>> $sales
 * @return list<array<string,mixed>>
 */
function sales_hydrate_many(PDO $pdo, array $sales, bool $full = true): array
{
    if (!$sales) {
        return [];
    }

    $saleIds = array_column($sales, 'id');
    $customerIds = array_values(array_unique(array_filter(array_column($sales, 'customer_id'))));
    $cashierIds = array_values(array_unique(array_filter(array_column($sales, 'cashier_id'))));
    $branchIds = array_values(array_unique(array_filter(array_column($sales, 'branch_id'))));

    $in = static function (array $ids): string {
        return implode(',', array_fill(0, count($ids), '?'));
    };

    $customers = [];
    if ($customerIds) {
        $st = $pdo->prepare('SELECT * FROM customers WHERE id IN (' . $in($customerIds) . ')');
        $st->execute($customerIds);
        foreach ($st->fetchAll() as $r) {
            $customers[$r['id']] = Format::customer($r);
        }
    }
    $cashiers = [];
    if ($cashierIds) {
        $st = $pdo->prepare('SELECT id, name, username, role FROM users WHERE id IN (' . $in($cashierIds) . ')');
        $st->execute($cashierIds);
        foreach ($st->fetchAll() as $r) {
            $cashiers[$r['id']] = Format::userLite($r);
        }
    }
    $branches = [];
    if ($branchIds) {
        $st = $pdo->prepare('SELECT * FROM branches WHERE id IN (' . $in($branchIds) . ')');
        $st->execute($branchIds);
        foreach ($st->fetchAll() as $r) {
            $branches[$r['id']] = Format::branch($r);
        }
    }

    // Items for all sales in one query
    $itemsBySale = array_fill_keys($saleIds, []);
    $st = $pdo->prepare(
        'SELECT si.*, p.name AS p_name, p.sku AS p_sku, p.model AS p_model,
                p.selling_price AS p_selling, p.purchase_price AS p_purchase
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id IN (' . $in($saleIds) . ')'
    );
    $st->execute($saleIds);
    foreach ($st->fetchAll() as $it) {
        $itemsBySale[$it['sale_id']][] = [
            'id' => $it['id'],
            'saleId' => $it['sale_id'],
            'productId' => $it['product_id'],
            'quantity' => (int) $it['quantity'],
            'unitPrice' => (float) $it['unit_price'],
            'discount' => (float) $it['discount'],
            'tax' => (float) $it['tax'],
            'totalPrice' => (float) $it['total_price'],
            'serialNumber' => $it['serial_number'],
            'imei' => $it['imei'],
            'product' => [
                'id' => $it['product_id'],
                'name' => $it['p_name'],
                'sku' => $it['p_sku'],
                'model' => $it['p_model'],
                'sellingPrice' => $it['p_selling'] !== null ? (float) $it['p_selling'] : null,
                'purchasePrice' => $it['p_purchase'] !== null ? (float) $it['p_purchase'] : null,
            ],
        ];
    }

    // EMI contracts + installments
    $emiBySale = [];
    $emiIds = [];
    $st = $pdo->prepare('SELECT * FROM sale_emis WHERE sale_id IN (' . $in($saleIds) . ')');
    $st->execute($saleIds);
    foreach ($st->fetchAll() as $emiRow) {
        $emiIds[] = $emiRow['id'];
        $emiBySale[$emiRow['sale_id']] = [
            'id' => $emiRow['id'],
            'saleId' => $emiRow['sale_id'],
            'guarantorName' => $emiRow['guarantor_name'],
            'guarantorPhone' => $emiRow['guarantor_phone'],
            'guarantorAddress' => $emiRow['guarantor_address'],
            'cnicFrontPath' => $emiRow['cnic_front_path'],
            'cnicBackPath' => $emiRow['cnic_back_path'],
            'chequePath' => $emiRow['cheque_path'],
            'months' => (int) $emiRow['months'],
            'interestRate' => (float) $emiRow['interest_rate'],
            'downPayment' => (float) $emiRow['down_payment'],
            'totalPrincipal' => (float) $emiRow['total_principal'],
            'monthlyPayment' => (float) $emiRow['monthly_payment'],
            'status' => $emiRow['status'],
            'installments' => [],
            'createdAt' => $emiRow['created_at'],
            'updatedAt' => $emiRow['updated_at'],
        ];
    }
    if ($emiIds) {
        $st = $pdo->prepare(
            'SELECT * FROM emi_installments WHERE sale_emi_id IN (' . $in($emiIds) . ')
             ORDER BY installment_number ASC'
        );
        $st->execute($emiIds);
        $emiIdToSale = [];
        foreach ($emiBySale as $sid => $e) {
            $emiIdToSale[$e['id']] = $sid;
        }
        foreach ($st->fetchAll() as $i) {
            $sid = $emiIdToSale[$i['sale_emi_id']] ?? null;
            if (!$sid) {
                continue;
            }
            $emiBySale[$sid]['installments'][] = [
                'id' => $i['id'],
                'saleEmiId' => $i['sale_emi_id'],
                'installmentNumber' => (int) $i['installment_number'],
                'dueDate' => $i['due_date'],
                'amount' => (float) $i['amount'],
                'amountPaid' => (float) $i['amount_paid'],
                'paidDate' => $i['paid_date'],
                'status' => $i['status'],
                'createdAt' => $i['created_at'],
                'updatedAt' => $i['updated_at'],
            ];
        }
    }

    // Returns (optional for list; full=true includes them)
    $returnsBySale = array_fill_keys($saleIds, []);
    if ($full) {
        $st = $pdo->prepare(
            "SELECT * FROM sale_returns WHERE status = 'COMPLETED' AND sale_id IN (" . $in($saleIds) . ')
             ORDER BY return_date DESC'
        );
        $st->execute($saleIds);
        $returnRows = $st->fetchAll();
        $returnIds = array_column($returnRows, 'id');
        $returnItems = [];
        if ($returnIds) {
            $st = $pdo->prepare(
                'SELECT ri.*, p.name AS p_name, p.sku AS p_sku FROM sale_return_items ri
                 LEFT JOIN products p ON p.id = ri.product_id
                 WHERE ri.sale_return_id IN (' . $in($returnIds) . ')'
            );
            $st->execute($returnIds);
            foreach ($st->fetchAll() as $ri) {
                $returnItems[$ri['sale_return_id']][] = [
                    'id' => $ri['id'],
                    'saleReturnId' => $ri['sale_return_id'],
                    'saleItemId' => $ri['sale_item_id'],
                    'productId' => $ri['product_id'],
                    'quantity' => (int) $ri['quantity'],
                    'unitRefund' => (float) $ri['unit_refund'],
                    'totalRefund' => (float) $ri['total_refund'],
                    'reason' => $ri['reason'],
                    'product' => ['id' => $ri['product_id'], 'name' => $ri['p_name'], 'sku' => $ri['p_sku']],
                ];
            }
        }
        $procIds = array_values(array_unique(array_filter(array_column($returnRows, 'processed_by_id'))));
        $procs = [];
        if ($procIds) {
            $st = $pdo->prepare('SELECT id, name, username FROM users WHERE id IN (' . $in($procIds) . ')');
            $st->execute($procIds);
            foreach ($st->fetchAll() as $r) {
                $procs[$r['id']] = Format::userLite($r);
            }
        }
        foreach ($returnRows as $ret) {
            $returnsBySale[$ret['sale_id']][] = [
                'id' => $ret['id'],
                'saleId' => $ret['sale_id'],
                'processedById' => $ret['processed_by_id'],
                'returnDate' => $ret['return_date'],
                'refundAmount' => (float) $ret['refund_amount'],
                'refundMethod' => $ret['refund_method'],
                'reason' => $ret['reason'],
                'notes' => $ret['notes'],
                'status' => $ret['status'],
                'createdAt' => $ret['created_at'],
                'updatedAt' => $ret['updated_at'],
                'items' => $returnItems[$ret['id']] ?? [],
                'processedBy' => $procs[$ret['processed_by_id']] ?? null,
            ];
        }
    }

    $out = [];
    foreach ($sales as $sale) {
        $id = $sale['id'];
        $out[] = [
            'id' => $sale['id'],
            'customerId' => $sale['customer_id'],
            'cashierId' => $sale['cashier_id'],
            'branchId' => $sale['branch_id'],
            'saleDate' => $sale['sale_date'],
            'totalAmount' => (float) $sale['total_amount'],
            'discountAmount' => (float) $sale['discount_amount'],
            'taxAmount' => (float) $sale['tax_amount'],
            'payableAmount' => (float) $sale['payable_amount'],
            'paidAmount' => (float) $sale['paid_amount'],
            'paymentMethod' => $sale['payment_method'],
            'paymentStatus' => $sale['payment_status'],
            'returnStatus' => $sale['return_status'],
            'notes' => $sale['notes'],
            'createdAt' => $sale['created_at'],
            'updatedAt' => $sale['updated_at'],
            'customer' => $sale['customer_id'] ? ($customers[$sale['customer_id']] ?? null) : null,
            'cashier' => $cashiers[$sale['cashier_id']] ?? null,
            'branch' => $branches[$sale['branch_id']] ?? null,
            'items' => $itemsBySale[$id] ?? [],
            'emiDetails' => $emiBySale[$id] ?? null,
            'returns' => $returnsBySale[$id] ?? [],
        ];
    }
    return $out;
}

function sales_list(array $params): void
{
    $q = query_params();
    $pdo = Database::pdo();
    $where = ['owner_id = ?'];
    $args = [tenant_owner_id()];
    $branchId = $q['branchId'] ?? branch_id();
    if ($branchId) {
        $where[] = 'branch_id = ?';
        $args[] = $branchId;
    }
    if (!empty($q['customerId'])) {
        $where[] = 'customer_id = ?';
        $args[] = $q['customerId'];
    }
    // Cap list size for speed (UI rarely needs >200 at once)
    $limit = min(300, max(1, (int) ($q['limit'] ?? 200)));
    $st = $pdo->prepare(
        'SELECT * FROM sales WHERE ' . implode(' AND ', $where) . ' ORDER BY sale_date DESC LIMIT ' . $limit
    );
    $st->execute($args);
    $rows = $st->fetchAll();
    // List: include items + emi, skip nested returns detail for speed unless ?full=1
    $full = isset($q['full']) && ($q['full'] === '1' || $q['full'] === 'true');
    json_response(sales_hydrate_many($pdo, $rows, $full));
}

function sales_get(array $params): void
{
    $sale = sales_fetch_sale(Database::pdo(), $params['id'], true);
    if (!$sale) {
        json_error('Sale not found.', 404);
    }
    json_response($sale);
}

function sales_returns_list(array $params): void
{
    $q = query_params();
    $pdo = Database::pdo();
    $sql = 'SELECT r.* FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.status = ? AND s.owner_id = ?';
    $args = ['COMPLETED', tenant_owner_id()];
    if (!empty($q['saleId'])) {
        $sql .= ' AND r.sale_id = ?';
        $args[] = $q['saleId'];
    }
    $branchId = $q['branchId'] ?? branch_id();
    if ($branchId) {
        $sql .= ' AND s.branch_id = ?';
        $args[] = $branchId;
    }
    $sql .= ' ORDER BY r.return_date DESC LIMIT 300';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $returnRows = $st->fetchAll();
    if (!$returnRows) {
        json_response([]);
    }

    // Batch hydrate returns (avoid N+1 per return + nested sale)
    $in = static function (array $ids): string {
        return implode(',', array_fill(0, count($ids), '?'));
    };
    $returnIds = array_column($returnRows, 'id');
    $saleIds = array_values(array_unique(array_column($returnRows, 'sale_id')));

    $returnItems = [];
    $st = $pdo->prepare(
        'SELECT ri.*, p.name AS p_name, p.sku AS p_sku FROM sale_return_items ri
         LEFT JOIN products p ON p.id = ri.product_id
         WHERE ri.sale_return_id IN (' . $in($returnIds) . ')'
    );
    $st->execute($returnIds);
    foreach ($st->fetchAll() as $ri) {
        $returnItems[$ri['sale_return_id']][] = [
            'id' => $ri['id'],
            'saleReturnId' => $ri['sale_return_id'],
            'saleItemId' => $ri['sale_item_id'],
            'productId' => $ri['product_id'],
            'quantity' => (int) $ri['quantity'],
            'unitRefund' => (float) $ri['unit_refund'],
            'totalRefund' => (float) $ri['total_refund'],
            'reason' => $ri['reason'],
            'product' => ['id' => $ri['product_id'], 'name' => $ri['p_name'], 'sku' => $ri['p_sku']],
        ];
    }

    $procIds = array_values(array_unique(array_filter(array_column($returnRows, 'processed_by_id'))));
    $procs = [];
    if ($procIds) {
        $st = $pdo->prepare('SELECT id, name, username FROM users WHERE id IN (' . $in($procIds) . ')');
        $st->execute($procIds);
        foreach ($st->fetchAll() as $r) {
            $procs[$r['id']] = Format::userLite($r);
        }
    }

    $saleRows = [];
    if ($saleIds) {
        $st = $pdo->prepare('SELECT * FROM sales WHERE id IN (' . $in($saleIds) . ')');
        $st->execute($saleIds);
        foreach ($st->fetchAll() as $s) {
            $saleRows[] = $s;
        }
    }
    $salesById = [];
    foreach (sales_hydrate_many($pdo, $saleRows, false) as $s) {
        $salesById[$s['id']] = $s;
    }

    $out = [];
    foreach ($returnRows as $ret) {
        $out[] = [
            'id' => $ret['id'],
            'saleId' => $ret['sale_id'],
            'processedById' => $ret['processed_by_id'],
            'returnDate' => $ret['return_date'],
            'refundAmount' => (float) $ret['refund_amount'],
            'refundMethod' => $ret['refund_method'],
            'reason' => $ret['reason'],
            'notes' => $ret['notes'],
            'status' => $ret['status'],
            'createdAt' => $ret['created_at'],
            'updatedAt' => $ret['updated_at'],
            'items' => $returnItems[$ret['id']] ?? [],
            'processedBy' => $procs[$ret['processed_by_id']] ?? null,
            'sale' => $salesById[$ret['sale_id']] ?? null,
        ];
    }
    json_response($out);
}

function sales_return_get(array $params): void
{
    $pdo = Database::pdo();
    $ownerId = tenant_owner_id();
    $st = $pdo->prepare('SELECT r.* FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ? AND s.owner_id = ?');
    $st->execute([$params['returnId'], $ownerId]);
    $row = $st->fetch();
    if (!$row) {
        json_error('Return record not found.', 404);
    }
    json_response(sales_format_return($pdo, $row, true));
}

function sales_returnable(array $params): void
{
    $pdo = Database::pdo();
    $sale = sales_fetch_sale($pdo, $params['id'], true);
    if (!$sale) {
        json_error('Sale not found.', 404);
    }
    $returnedByProduct = [];
    $alreadyRefunded = 0.0;
    foreach ($sale['returns'] as $ret) {
        $alreadyRefunded += (float) $ret['refundAmount'];
        foreach ($ret['items'] as $ri) {
            $pid = $ri['productId'];
            $returnedByProduct[$pid] = ($returnedByProduct[$pid] ?? 0) + (int) $ri['quantity'];
        }
    }
    $itemsSum = array_sum(array_map(static fn($i) => (float) $i['totalPrice'], $sale['items'])) ?: 1;
    $lines = [];
    foreach ($sale['items'] as $item) {
        $already = $returnedByProduct[$item['productId']] ?? 0;
        $remaining = max(0, (int) $item['quantity'] - $already);
        $lineShare = ((float) $item['totalPrice'] / $itemsSum) * (float) $sale['payableAmount'];
        $unitRefund = $item['quantity'] > 0 ? $lineShare / $item['quantity'] : 0;
        $lines[] = [
            'saleItemId' => $item['id'],
            'productId' => $item['productId'],
            'product' => $item['product'],
            'originalQty' => (int) $item['quantity'],
            'alreadyReturned' => $already,
            'remainingQty' => $remaining,
            'unitPrice' => (float) $item['unitPrice'],
            'unitRefund' => round_money($unitRefund),
            'lineTotal' => (float) $item['totalPrice'],
            'serialNumber' => $item['serialNumber'],
            'imei' => $item['imei'],
        ];
    }
    json_response([
        'sale' => [
            'id' => $sale['id'],
            'saleDate' => $sale['saleDate'],
            'payableAmount' => $sale['payableAmount'],
            'paidAmount' => $sale['paidAmount'],
            'paymentMethod' => $sale['paymentMethod'],
            'paymentStatus' => $sale['paymentStatus'],
            'returnStatus' => $sale['returnStatus'],
            'discountAmount' => $sale['discountAmount'],
            'taxAmount' => $sale['taxAmount'],
            'totalAmount' => $sale['totalAmount'],
            'customer' => $sale['customer'],
            'branch' => $sale['branch'],
            'cashier' => $sale['cashier'],
            'emiDetails' => $sale['emiDetails'],
        ],
        'alreadyRefunded' => round_money($alreadyRefunded),
        'maxRefundable' => round_money(max(0, (float) $sale['payableAmount'] - $alreadyRefunded)),
        'lines' => $lines,
    ]);
}

function sales_return_create(array $params): void
{
    $body = read_json_body();
    $user = Auth::requireUser();
    $ownerId = tenant_owner_id();
    $saleId = $body['saleId'] ?? null;
    $items = $body['items'] ?? null;
    if (!$saleId || !is_array($items) || count($items) === 0) {
        json_error('Missing refund parameters (saleId and items required).', 400);
    }
    $method = strtoupper((string) ($body['refundMethod'] ?? 'CASH'));
    if (!in_array($method, ['CASH', 'CARD', 'MOBILE', 'CREDIT_ADJUST'], true)) {
        json_error('Invalid refund method.', 400);
    }
    $pdo = Database::pdo();
    try {
        Database::begin();
        $sale = sales_fetch_sale($pdo, $saleId, true);
        if (!$sale) {
            throw new RuntimeException('Original sale record not found.');
        }
        if ($sale['returnStatus'] === 'FULL') {
            throw new RuntimeException('This invoice has already been fully returned.');
        }

        $returnedByProduct = [];
        $alreadyRefunded = 0.0;
        foreach ($sale['returns'] as $ret) {
            $alreadyRefunded += (float) $ret['refundAmount'];
            foreach ($ret['items'] as $ri) {
                $returnedByProduct[$ri['productId']] = ($returnedByProduct[$ri['productId']] ?? 0) + (int) $ri['quantity'];
            }
        }
        $itemsSum = array_sum(array_map(static fn($i) => (float) $i['totalPrice'], $sale['items'])) ?: 1;
        $returnItems = [];
        $refundValue = 0.0;
        $now = now_sql();

        foreach ($items as $item) {
            $qty = (int) ($item['quantity'] ?? 0);
            $productId = $item['productId'] ?? null;
            if (!$productId || $qty <= 0) {
                throw new RuntimeException('Each return line needs a valid productId and quantity.');
            }
            $original = null;
            foreach ($sale['items'] as $si) {
                if ($si['productId'] === $productId || (!empty($item['saleItemId']) && $si['id'] === $item['saleItemId'])) {
                    $original = $si;
                    break;
                }
            }
            if (!$original) {
                throw new RuntimeException('Product was not part of this sale.');
            }
            $already = $returnedByProduct[$original['productId']] ?? 0;
            $remaining = (int) $original['quantity'] - $already;
            if ($qty > $remaining) {
                $name = $original['product']['name'] ?? $original['productId'];
                throw new RuntimeException("Cannot return {$qty} of {$name}. Only {$remaining} remaining.");
            }
            $lineShare = ((float) $original['totalPrice'] / $itemsSum) * (float) $sale['payableAmount'];
            $unitRefund = $original['quantity'] > 0 ? $lineShare / $original['quantity'] : 0;
            $lineRefund = round_money($unitRefund * $qty);
            $refundValue += $lineRefund;
            $returnedByProduct[$original['productId']] = $already + $qty;
            $returnItems[] = [
                'saleItemId' => $original['id'],
                'productId' => $original['productId'],
                'quantity' => $qty,
                'unitRefund' => round_money($unitRefund),
                'totalRefund' => $lineRefund,
                'reason' => $item['reason'] ?? ($body['reason'] ?? null),
            ];

            // restore stock
            $st = $pdo->prepare('SELECT id FROM branch_stocks WHERE branch_id = ? AND product_id = ?');
            $st->execute([$sale['branchId'], $original['productId']]);
            if ($st->fetch()) {
                $pdo->prepare('UPDATE branch_stocks SET quantity = quantity + ? WHERE branch_id = ? AND product_id = ?')
                    ->execute([$qty, $sale['branchId'], $original['productId']]);
            } else {
                $pdo->prepare('INSERT INTO branch_stocks (id, branch_id, product_id, quantity) VALUES (?,?,?,?)')
                    ->execute([uuid_v4(), $sale['branchId'], $original['productId'], $qty]);
            }
            $pdo->prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                ->execute([$qty, $now, $original['productId'], $ownerId]);
            $pdo->prepare(
                'INSERT INTO stock_movements (id, product_id, quantity, type, branch_id, reference_id, notes, owner_id, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?)'
            )->execute([
                uuid_v4(), $original['productId'], $qty, 'RETURN', $sale['branchId'], $saleId,
                'Customer return: ' . ($item['reason'] ?? $body['reason'] ?? 'No reason'), $ownerId, $now,
            ]);
        }

        $refundValue = round_money($refundValue);
        $maxRefundable = round_money(max(0, (float) $sale['payableAmount'] - $alreadyRefunded));
        if ($refundValue > $maxRefundable + 0.01) {
            throw new RuntimeException("Refund amount exceeds remaining refundable balance (Rs. {$maxRefundable}).");
        }

        $priorDebt = round_money(max(0, (float) $sale['payableAmount'] - (float) $sale['paidAmount']));
        $creditPortion = round_money(min($refundValue, $priorDebt));
        $cashPortion = round_money(max(0, $refundValue - $creditPortion));

        if ($sale['customerId'] && ($creditPortion > 0 || $method === 'CREDIT_ADJUST')) {
            $creditReduce = $method === 'CREDIT_ADJUST' ? $refundValue : $creditPortion;
            if ($creditReduce > 0) {
                $st = $pdo->prepare('SELECT credit_balance FROM customers WHERE id = ? FOR UPDATE');
                $st->execute([$sale['customerId']]);
                $c = $st->fetch();
                if ($c) {
                    $pdo->prepare('UPDATE customers SET credit_balance = ?, updated_at = ? WHERE id = ?')
                        ->execute([max(0, round_money((float) $c['credit_balance'] - $creditReduce)), $now, $sale['customerId']]);
                }
            }
        }

        $cashOut = $method === 'CREDIT_ADJUST' ? 0.0 : $cashPortion;
        if ($cashOut > 0) {
            $map = ['CASH' => 'CASH', 'CARD' => 'BANK', 'MOBILE' => 'MOBILE_WALLET'];
            $accType = $map[$method] ?? 'CASH';
            $st = $pdo->prepare('SELECT id FROM bank_accounts WHERE type = ? AND is_active = 1 AND owner_id = ? LIMIT 1');
            $st->execute([$accType, $ownerId]);
            $acc = $st->fetch();
            if (!$acc && $accType !== 'CASH') {
                $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type = 'CASH' AND is_active = 1 AND owner_id = ? LIMIT 1");
                $st->execute([$ownerId]);
                $acc = $st->fetch();
            }
            if ($acc) {
                $pdo->prepare(
                    'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, branch_id, created_by, owner_id, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
                )->execute([
                    uuid_v4(), $acc['id'], 'EXPENSE', 'SALE', $cashOut, 'SALE', $saleId,
                    'Refund for return on Invoice #' . substr($saleId, 0, 8), $sale['branchId'], $user['id'], $ownerId, $now,
                ]);
                $pdo->prepare('UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                    ->execute([$cashOut, $now, $acc['id'], $ownerId]);
            }
        }

        $returnId = uuid_v4();
        $pdo->prepare(
            'INSERT INTO sale_returns (id, sale_id, processed_by_id, return_date, refund_amount, refund_method, reason, notes, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $returnId, $saleId, $user['id'], $now, $refundValue, $method,
            $body['reason'] ?? null, $body['notes'] ?? null, 'COMPLETED', $now, $now,
        ]);
        $ins = $pdo->prepare(
            'INSERT INTO sale_return_items (id, sale_return_id, sale_item_id, product_id, quantity, unit_refund, total_refund, reason)
             VALUES (?,?,?,?,?,?,?,?)'
        );
        foreach ($returnItems as $ri) {
            $ins->execute([
                uuid_v4(), $returnId, $ri['saleItemId'], $ri['productId'], $ri['quantity'],
                $ri['unitRefund'], $ri['totalRefund'], $ri['reason'],
            ]);
        }

        $allFull = true;
        $any = false;
        foreach ($sale['items'] as $si) {
            $rq = $returnedByProduct[$si['productId']] ?? 0;
            if ($rq > 0) {
                $any = true;
            }
            if ($rq < (int) $si['quantity']) {
                $allFull = false;
            }
        }
        $newReturnStatus = $allFull ? 'FULL' : ($any ? 'PARTIAL' : 'NONE');
        $newPaid = round_money(max(0, (float) $sale['paidAmount'] - $cashOut));
        $newPayStatus = $sale['paymentStatus'];
        if ($newReturnStatus === 'FULL') {
            $newPayStatus = 'PAID';
        } elseif ($newPaid <= 0 && $priorDebt - $creditPortion > 0) {
            $newPayStatus = 'UNPAID';
        }

        $noteAdd = '[Return ' . substr($returnId, 0, 8) . "] Rs.{$refundValue} via {$method}";
        $notes = $sale['notes'] ? ($sale['notes'] . "\n" . $noteAdd) : $noteAdd;
        $pdo->prepare(
            'UPDATE sales SET return_status = ?, paid_amount = ?, payment_status = ?, notes = ?, updated_at = ? WHERE id = ? AND owner_id = ?'
        )->execute([$newReturnStatus, $newPaid, $newPayStatus, $notes, $now, $saleId, $ownerId]);

        if ($newReturnStatus === 'FULL' && $sale['emiDetails']) {
            $pdo->prepare(
                "UPDATE emi_installments SET status = 'PAID', amount_paid = 0, paid_date = ?, updated_at = ?
                 WHERE sale_emi_id = ? AND status <> 'PAID'"
            )->execute([$now, $now, $sale['emiDetails']['id']]);
            $pdo->prepare("UPDATE sale_emis SET status = 'COMPLETED', updated_at = ? WHERE id = ?")
                ->execute([$now, $sale['emiDetails']['id']]);
        }

        $pdo->prepare('INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (?,?,?,?,?)')
            ->execute([uuid_v4(), $user['id'], 'SALE_RETURN', "Processed return Rs.{$refundValue} on sale " . substr($saleId, 0, 8), $now]);

        Database::commit();
        $st = $pdo->prepare('SELECT * FROM sale_returns WHERE id = ?');
        $st->execute([$returnId]);
        $result = sales_format_return($pdo, $st->fetch(), true);
        $result['cashRefunded'] = $cashOut;
        $result['creditAdjusted'] = $method === 'CREDIT_ADJUST' ? $refundValue : $creditPortion;
        json_response($result, 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to process return.', 400);
    }
}

function sales_save_upload(string $field): string
{
    if (empty($_FILES[$field]) || ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Please upload CNIC Front, CNIC Back, and Bank Cheque documents.');
    }
    $file = $_FILES[$field];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'], true)) {
        throw new RuntimeException('Only images (jpeg, jpg, png) and PDF documents are allowed!');
    }
    ensure_dir(uploads_path());
    $name = $field . '-' . time() . '-' . random_int(100000, 999999999) . '.' . $ext;
    $dest = uploads_path() . DIRECTORY_SEPARATOR . $name;
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        throw new RuntimeException('Failed to store uploaded file.');
    }
    return '/uploads/' . $name;
}

function sales_emi_create(array $params): void
{
    $id = $params['id'];
    $guarantorName = $_POST['guarantorName'] ?? null;
    $guarantorPhone = $_POST['guarantorPhone'] ?? null;
    $guarantorAddress = $_POST['guarantorAddress'] ?? null;
    $months = $_POST['months'] ?? null;
    $interestRate = $_POST['interestRate'] ?? '0';
    $downPayment = $_POST['downPayment'] ?? null;

    if (!$guarantorName || !$guarantorPhone || !$guarantorAddress || !$months || $downPayment === null) {
        json_error('Missing guarantor or plan details.', 400);
    }

    try {
        $cnicFront = sales_save_upload('cnicFront');
        $cnicBack = sales_save_upload('cnicBack');
        $cheque = sales_save_upload('cheque');

        $parsedMonths = (int) $months;
        $parsedInterest = (float) $interestRate;
        $parsedDown = round_money((float) $downPayment);
        if (!in_array($parsedMonths, [3, 6, 12], true)) {
            json_error('EMI tenure must be 3, 6, or 12 months.', 400);
        }
        if ($parsedInterest < 0) {
            json_error('Markup rate must be a valid non-negative number.', 400);
        }
        if ($parsedDown < 0) {
            json_error('Down payment must be a valid non-negative amount.', 400);
        }

        $pdo = Database::pdo();
        Database::begin();
        $ownerId = tenant_owner_id();
        $sale = sales_fetch_sale($pdo, $id, true);
        if (!$sale) {
            throw new RuntimeException('Sale transaction not found.');
        }
        if ($sale['paymentMethod'] !== 'EMI') {
            throw new RuntimeException('This sale is not marked for EMI processing.');
        }
        if ($sale['emiDetails']) {
            throw new RuntimeException('An EMI contract already exists for this sale.');
        }

        $markup = round_money((float) $sale['payableAmount'] * ($parsedInterest / 100));
        $totalPrincipal = round_money((float) $sale['payableAmount'] + $markup);
        if ($parsedDown > $totalPrincipal) {
            throw new RuntimeException('Down payment cannot exceed the financed principal.');
        }
        $remaining = round_money($totalPrincipal - $parsedDown);
        $monthly = round_money($remaining / $parsedMonths);
        $updatedPaid = round_money((float) $sale['paidAmount'] + $parsedDown);
        $updatedStatus = $updatedPaid >= $totalPrincipal ? 'PAID' : ($updatedPaid > 0 ? 'PARTIAL' : 'UNPAID');
        $prevOut = round_money(max(0, (float) $sale['payableAmount'] - (float) $sale['paidAmount']));
        $updatedOut = round_money(max(0, $totalPrincipal - $updatedPaid));
        $creditDelta = round_money($updatedOut - $prevOut);
        $now = now_sql();

        $pdo->prepare(
            'UPDATE sales SET payable_amount = ?, paid_amount = ?, payment_status = ?, notes = ?, updated_at = ? WHERE id = ? AND owner_id = ?'
        )->execute([
            $totalPrincipal, $updatedPaid, $updatedStatus,
            ($sale['notes'] ?? '') . "\n[EMI Plan Activated: {$parsedMonths} months at {$parsedInterest}% markup]",
            $now, $id, $ownerId,
        ]);

        if ($sale['customerId'] && $creditDelta != 0.0) {
            $pdo->prepare('UPDATE customers SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?')
                ->execute([$creditDelta, $now, $sale['customerId']]);
        }

        $emiId = uuid_v4();
        $pdo->prepare(
            'INSERT INTO sale_emis (id, sale_id, guarantor_name, guarantor_phone, guarantor_address, cnic_front_path, cnic_back_path, cheque_path,
             months, interest_rate, down_payment, total_principal, monthly_payment, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $emiId, $id, $guarantorName, $guarantorPhone, $guarantorAddress, $cnicFront, $cnicBack, $cheque,
            $parsedMonths, $parsedInterest, $parsedDown, $totalPrincipal, $monthly,
            $updatedOut === 0.0 ? 'COMPLETED' : 'ACTIVE', $now, $now,
        ]);

        $ins = $pdo->prepare(
            'INSERT INTO emi_installments (id, sale_emi_id, installment_number, due_date, amount, amount_paid, status, created_at, updated_at)
             VALUES (?,?,?,?,?,0,?,?,?)'
        );
        for ($i = 1; $i <= $parsedMonths; $i++) {
            $due = date('Y-m-d H:i:s', strtotime('+' . ($i * 30) . ' days'));
            $ins->execute([uuid_v4(), $emiId, $i, $due, $monthly, 'PENDING', $now, $now]);
        }

        if ($parsedDown > 0) {
            $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type = 'CASH' AND is_active = 1 AND owner_id = ? LIMIT 1");
            $st->execute([$ownerId]);
            $acc = $st->fetch();
            if ($acc) {
                $pdo->prepare(
                    'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, branch_id, owner_id, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)'
                )->execute([
                    uuid_v4(), $acc['id'], 'INCOME', 'CREDIT_PAYMENT', $parsedDown, 'SALE', $id,
                    'EMI Down Payment collected for Invoice #' . substr($id, 0, 8), $sale['branchId'], $ownerId, $now,
                ]);
                $pdo->prepare('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                    ->execute([$parsedDown, $now, $acc['id'], $ownerId]);
            }
        }

        Database::commit();
        $sale2 = sales_fetch_sale($pdo, $id, true);
        json_response($sale2['emiDetails'], 201);
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to create monthly installment agreement.', 500);
    }
}

function sales_installment_pay(array $params): void
{
    $saleId = $params['id'];
    $installmentId = $params['installmentId'];
    $body = read_json_body();
    $pdo = Database::pdo();
    try {
        Database::begin();
        $ownerId = tenant_owner_id();
        $st = $pdo->prepare(
            'SELECT i.*, e.sale_id, e.id AS emi_id, e.status AS emi_status
             FROM emi_installments i JOIN sale_emis e ON e.id = i.sale_emi_id
             JOIN sales s ON s.id = e.sale_id
             WHERE i.id = ? AND s.owner_id = ? FOR UPDATE'
        );
        $st->execute([$installmentId, $ownerId]);
        $inst = $st->fetch();
        if (!$inst || $inst['sale_id'] !== $saleId) {
            throw new RuntimeException('Installment record not found.');
        }
        if ($inst['status'] === 'PAID') {
            throw new RuntimeException('Installment already paid.');
        }
        $amount = round_money((float) ($body['amount'] ?? $inst['amount']));
        $now = now_sql();
        $pdo->prepare(
            "UPDATE emi_installments SET amount_paid = ?, paid_date = ?, status = 'PAID', updated_at = ? WHERE id = ?"
        )->execute([$amount, $now, $now, $installmentId]);

        $st = $pdo->prepare('SELECT * FROM sales WHERE id = ? AND owner_id = ? FOR UPDATE');
        $st->execute([$saleId, $ownerId]);
        $sale = $st->fetch();
        $newPaid = round_money((float) $sale['paid_amount'] + $amount);
        $status = $newPaid >= (float) $sale['payable_amount'] ? 'PAID' : 'PARTIAL';
        $pdo->prepare('UPDATE sales SET paid_amount = ?, payment_status = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
            ->execute([$newPaid, $status, $now, $saleId, $ownerId]);

        if ($sale['customer_id']) {
            $pdo->prepare('UPDATE customers SET credit_balance = GREATEST(0, credit_balance - ?), updated_at = ? WHERE id = ? AND owner_id = ?')
                ->execute([$amount, $now, $sale['customer_id'], $ownerId]);
        }

        $st = $pdo->prepare("SELECT id FROM bank_accounts WHERE type = 'CASH' AND is_active = 1 AND owner_id = ? LIMIT 1");
        $st->execute([$ownerId]);
        $acc = $st->fetch();
        if ($acc) {
            $pdo->prepare(
                'INSERT INTO transactions (id, bank_account_id, type, category, amount, reference_type, reference_id, description, branch_id, owner_id, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([
                uuid_v4(), $acc['id'], 'INCOME', 'CREDIT_PAYMENT', $amount, 'SALE', $saleId,
                'EMI installment payment #' . $inst['installment_number'], $sale['branch_id'], $ownerId, $now,
            ]);
            $pdo->prepare('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ? AND owner_id = ?')
                ->execute([$amount, $now, $acc['id'], $ownerId]);
        }

        $st = $pdo->prepare("SELECT COUNT(*) FROM emi_installments WHERE sale_emi_id = ? AND status <> 'PAID'");
        $st->execute([$inst['emi_id']]);
        if ((int) $st->fetchColumn() === 0) {
            $pdo->prepare("UPDATE sale_emis SET status = 'COMPLETED', updated_at = ? WHERE id = ?")
                ->execute([$now, $inst['emi_id']]);
        }

        Database::commit();
        json_response(sales_fetch_sale($pdo, $saleId, true));
    } catch (Throwable $e) {
        Database::rollBack();
        json_error($e->getMessage() ?: 'Failed to collect installment.', 400);
    }
}
