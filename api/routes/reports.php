<?php

declare(strict_types=1);

function register_reports_routes(Router $router): void
{
    $router->get('reports/dashboard-stats', 'reports_dashboard_stats', false, ['OWNER', 'MANAGER']);
    $router->get('reports/charts', 'reports_charts', false, ['OWNER', 'MANAGER']);
    $router->get('reports/top-selling', 'reports_top_selling', false, ['OWNER', 'MANAGER']);
    $router->get('reports/query/:type', 'reports_query', false, ['OWNER', 'MANAGER']);
    $router->get('reports/export/:type/:format', 'reports_export', false, ['OWNER', 'MANAGER']);
}

function reports_date_bounds(?string $startDate, ?string $endDate): array
{
    $start = $startDate ? date('Y-m-d 00:00:00', strtotime($startDate)) : null;
    $end = $endDate ? reports_day_after(date('Y-m-d 23:59:59', strtotime($endDate))) : null;
    return [$start, $end];
}

function reports_day_after(string $dateTime): string
{
    return date('Y-m-d H:i:s', strtotime('+1 day', strtotime($dateTime)));
}

function reports_month_bounds(int $year, ?int $month = null): array
{
    if ($month !== null) {
        $start = sprintf('%04d-%02d-01 00:00:00', $year, $month);
        $end = date('Y-m-d H:i:s', strtotime($start . ' +1 month'));
        return [$start, $end];
    }

    $start = sprintf('%04d-01-01 00:00:00', $year);
    $end = sprintf('%04d-01-01 00:00:00', $year + 1);
    return [$start, $end];
}

/**
 * Core report engine — parity with Node compileReportData().
 * @return list<array<string,mixed>>
 */
function reports_compile(string $type, ?string $startDate, ?string $endDate, ?string $branchId): array
{
    $pdo = Database::pdo();
    [$start, $end] = reports_date_bounds($startDate, $endDate);
    $LOW = 3;
    $ownerId = tenant_owner_id();

    $saleDateSql = ' AND s.owner_id = ?';
    $saleArgs = [$ownerId];
    if ($start) {
        $saleDateSql .= ' AND s.sale_date >= ?';
        $saleArgs[] = $start;
    }
    if ($end) {
        $saleDateSql .= ' AND s.sale_date < ?';
        $saleArgs[] = $end;
    }
    if ($branchId) {
        $saleDateSql .= ' AND s.branch_id = ?';
        $saleArgs[] = $branchId;
    }

    switch ($type) {
        case 'sales-daily': {
            $sql = "SELECT s.*, c.name AS customer_name, b.name AS branch_name, u.name AS cashier_name
                    FROM sales s
                    LEFT JOIN customers c ON c.id = s.customer_id
                    LEFT JOIN branches b ON b.id = s.branch_id
                    LEFT JOIN users u ON u.id = s.cashier_id
                    WHERE 1=1 {$saleDateSql}
                    ORDER BY s.sale_date DESC LIMIT 2000";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $out = [];
            foreach ($st->fetchAll() as $s) {
                $out[] = [
                    'invoiceRef' => substr($s['id'], 0, 8),
                    'date' => substr((string) $s['sale_date'], 0, 10),
                    'customer' => $s['customer_name'] ?: 'Walk-in Customer',
                    'branch' => $s['branch_name'] ?: 'Main',
                    'method' => $s['payment_method'],
                    'subtotal' => (float) $s['total_amount'],
                    'discount' => (float) $s['discount_amount'],
                    'tax' => (float) $s['tax_amount'],
                    'grandTotal' => (float) $s['payable_amount'],
                ];
            }
            return $out;
        }

        case 'sales-monthly': {
            $sql = "SELECT s.sale_date, s.payable_amount, s.total_amount, s.discount_amount, s.tax_amount
                    FROM sales s WHERE 1=1 {$saleDateSql}";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $map = [];
            foreach ($st->fetchAll() as $s) {
                $key = substr((string) $s['sale_date'], 0, 7);
                if (!isset($map[$key])) {
                    $map[$key] = ['month' => $key, 'salesCount' => 0, 'subtotal' => 0.0, 'discount' => 0.0, 'tax' => 0.0, 'revenue' => 0.0];
                }
                $map[$key]['salesCount']++;
                $map[$key]['subtotal'] += (float) $s['total_amount'];
                $map[$key]['discount'] += (float) $s['discount_amount'];
                $map[$key]['tax'] += (float) $s['tax_amount'];
                $map[$key]['revenue'] += (float) $s['payable_amount'];
            }
            $out = array_values($map);
            usort($out, static fn($a, $b) => strcmp($b['month'], $a['month']));
            return $out;
        }

        case 'sales-annual': {
            $sql = "SELECT s.sale_date, s.payable_amount, s.total_amount, s.discount_amount, s.tax_amount
                    FROM sales s WHERE 1=1 {$saleDateSql}";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $map = [];
            foreach ($st->fetchAll() as $s) {
                $key = substr((string) $s['sale_date'], 0, 4);
                if (!isset($map[$key])) {
                    $map[$key] = ['year' => $key, 'salesCount' => 0, 'subtotal' => 0.0, 'discount' => 0.0, 'tax' => 0.0, 'revenue' => 0.0];
                }
                $map[$key]['salesCount']++;
                $map[$key]['subtotal'] += (float) $s['total_amount'];
                $map[$key]['discount'] += (float) $s['discount_amount'];
                $map[$key]['tax'] += (float) $s['tax_amount'];
                $map[$key]['revenue'] += (float) $s['payable_amount'];
            }
            $out = array_values($map);
            usort($out, static fn($a, $b) => strcmp($b['year'], $a['year']));
            return $out;
        }

        case 'profit-loss': {
            $sql = "SELECT COUNT(*) AS cnt, COALESCE(SUM(payable_amount),0) AS rev FROM sales s WHERE 1=1 {$saleDateSql}";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $sales = $st->fetch();
            $expSql = 'SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM expenses WHERE owner_id = ?';
            $expArgs = [$ownerId];
            if ($start) {
                $expSql .= ' AND date >= ?';
                $expArgs[] = $start;
            }
            if ($end) {
                $expSql .= ' AND date < ?';
                $expArgs[] = $end;
            }
            $st = $pdo->prepare($expSql);
            $st->execute($expArgs);
            $exp = $st->fetch();
            $revenue = (float) $sales['rev'];
            $totalExp = (float) $exp['total'];
            return [
                ['reportItem' => 'Revenue (POS Sales)', 'transactionCount' => (int) $sales['cnt'], 'amount' => $revenue],
                ['reportItem' => 'Expenses (Wages/Rent/Other)', 'transactionCount' => (int) $exp['cnt'], 'amount' => $totalExp],
                ['reportItem' => 'Net Profit / Loss Summary', 'transactionCount' => '-', 'amount' => $revenue - $totalExp],
            ];
        }

        case 'inventory-value': {
            $sql = 'SELECT bs.quantity, p.sku, p.name, p.wholesale_price, p.selling_price, p.purchase_price,
                           c.name AS cat_name, br.name AS brand_name, b.name AS branch_name
                    FROM branch_stocks bs
                    JOIN products p ON p.id = bs.product_id AND p.owner_id = ?
                    LEFT JOIN categories c ON c.id = p.category_id
                    LEFT JOIN brands br ON br.id = p.brand_id
                    LEFT JOIN branches b ON b.id = bs.branch_id
                    WHERE 1=1';
            $args = [$ownerId];
            if ($branchId) {
                $sql .= ' AND bs.branch_id = ?';
                $args[] = $branchId;
            }
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $out = [];
            foreach ($st->fetchAll() as $stRow) {
                $qty = (int) $stRow['quantity'];
                $cost = (float) ($stRow['wholesale_price'] ?? $stRow['purchase_price'] ?? 0);
                $sell = (float) $stRow['selling_price'];
                $out[] = [
                    'sku' => $stRow['sku'],
                    'productName' => $stRow['name'],
                    'category' => $stRow['cat_name'] ?: 'Uncategorized',
                    'brand' => $stRow['brand_name'] ?: 'Generic',
                    'location' => $stRow['branch_name'] ?: 'Main',
                    'stockQty' => $qty,
                    'unitCost' => $cost,
                    'unitRetail' => $sell,
                    'totalCostValue' => $qty * $cost,
                    'totalRetailValue' => $qty * $sell,
                    'projectedProfit' => ($qty * $sell) - ($qty * $cost),
                ];
            }
            return $out;
        }

        case 'low-stock': {
            if ($branchId) {
                $st = $pdo->prepare(
                    'SELECT COALESCE(bs.quantity, 0) AS quantity, p.sku, p.name, c.name AS cat_name, br.name AS brand_name, b.name AS branch_name
                     FROM products p
                     LEFT JOIN branch_stocks bs ON bs.product_id = p.id AND bs.branch_id = ?
                     LEFT JOIN categories c ON c.id = p.category_id
                     LEFT JOIN brands br ON br.id = p.brand_id
                     LEFT JOIN branches b ON b.id = bs.branch_id
                     WHERE p.owner_id = ? AND COALESCE(bs.quantity, 0) <= ?'
                );
                $st->execute([$branchId, $ownerId, $LOW]);
                $out = [];
                foreach ($st->fetchAll() as $r) {
                    $out[] = [
                        'sku' => $r['sku'],
                        'productName' => $r['name'],
                        'category' => $r['cat_name'] ?: 'N/A',
                        'brand' => $r['brand_name'] ?: 'N/A',
                        'location' => $r['branch_name'] ?: 'Main',
                        'stockLimit' => $LOW,
                        'currentStock' => (int) $r['quantity'],
                    ];
                }
                return $out;
            }
            $st = $pdo->prepare(
                'SELECT p.sku, p.name, p.stock_quantity, c.name AS cat_name, br.name AS brand_name
                 FROM products p
                 LEFT JOIN categories c ON c.id = p.category_id
                 LEFT JOIN brands br ON br.id = p.brand_id
                 WHERE p.owner_id = ? AND p.stock_quantity <= ?'
            );
            $st->execute([$ownerId, $LOW]);
            $out = [];
            foreach ($st->fetchAll() as $r) {
                $out[] = [
                    'sku' => $r['sku'],
                    'productName' => $r['name'],
                    'category' => $r['cat_name'] ?: 'N/A',
                    'brand' => $r['brand_name'] ?: 'N/A',
                    'stockLimit' => $LOW,
                    'currentStock' => (int) $r['stock_quantity'],
                ];
            }
            return $out;
        }

        case 'best-selling': {
            $sql = "SELECT si.product_id, p.sku, p.name, c.name AS cat_name, br.name AS brand_name,
                           SUM(si.quantity) AS qty, SUM(si.total_price) AS rev
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    JOIN products p ON p.id = si.product_id AND p.owner_id = ?
                    LEFT JOIN categories c ON c.id = p.category_id
                    LEFT JOIN brands br ON br.id = p.brand_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY si.product_id, p.sku, p.name, c.name, br.name
                    ORDER BY qty DESC
                    LIMIT 15";
            $st = $pdo->prepare($sql);
            $st->execute(array_merge([$ownerId], $saleArgs));
            $rows = $st->fetchAll();
            $out = [];
            foreach ($rows as $row) {
                $out[] = [
                    'sku' => $row['sku'] ?? '',
                    'productName' => $row['name'] ?? 'Unknown',
                    'category' => $row['cat_name'] ?? 'N/A',
                    'brand' => $row['brand_name'] ?? 'N/A',
                    'itemsSold' => (int) $row['qty'],
                    'revenueGenerated' => (float) $row['rev'],
                ];
            }
            return $out;
        }

        case 'slow-moving': {
            $sql = "SELECT si.product_id, SUM(si.quantity) AS qty
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY si.product_id";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $soldMap = [];
            foreach ($st->fetchAll() as $r) {
                $soldMap[$r['product_id']] = (int) $r['qty'];
            }
            $st = $pdo->prepare(
                'SELECT p.id, p.sku, p.name, p.stock_quantity, c.name AS cat_name, br.name AS brand_name
                 FROM products p
                 LEFT JOIN categories c ON c.id = p.category_id
                 LEFT JOIN brands br ON br.id = p.brand_id
                 WHERE p.owner_id = ?'
            );
            $st->execute([$ownerId]);
            $products = $st->fetchAll();
            $out = [];
            foreach ($products as $p) {
                $out[] = [
                    'sku' => $p['sku'],
                    'productName' => $p['name'],
                    'category' => $p['cat_name'] ?: 'N/A',
                    'brand' => $p['brand_name'] ?: 'N/A',
                    'currentStock' => (int) $p['stock_quantity'],
                    'totalSold' => $soldMap[$p['id']] ?? 0,
                ];
            }
            usort($out, static fn($a, $b) => $a['totalSold'] <=> $b['totalSold']);
            return array_slice($out, 0, 20);
        }

        case 'brand-share': {
            $sql = "SELECT COALESCE(br.name, 'Generic') AS brand, SUM(si.quantity) AS qty, SUM(si.total_price) AS rev
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    JOIN products p ON p.id = si.product_id AND p.owner_id = ?
                    LEFT JOIN brands br ON br.id = p.brand_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY brand
                    ORDER BY rev DESC";
            $st = $pdo->prepare($sql);
            $st->execute(array_merge([$ownerId], $saleArgs));
            $out = [];
            foreach ($st->fetchAll() as $r) {
                $out[] = [
                    'brand' => $r['brand'],
                    'quantitySold' => (int) $r['qty'],
                    'totalSalesValue' => (float) $r['rev'],
                ];
            }
            return $out;
        }

        case 'category-share': {
            $sql = "SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(si.quantity) AS qty, SUM(si.total_price) AS rev
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    JOIN products p ON p.id = si.product_id AND p.owner_id = ?
                    LEFT JOIN categories c ON c.id = p.category_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY category
                    ORDER BY rev DESC";
            $st = $pdo->prepare($sql);
            $st->execute(array_merge([$ownerId], $saleArgs));
            $out = [];
            foreach ($st->fetchAll() as $r) {
                $out[] = [
                    'category' => $r['category'],
                    'quantitySold' => (int) $r['qty'],
                    'totalSalesValue' => (float) $r['rev'],
                ];
            }
            return $out;
        }

        case 'supplier-summary': {
            $sql = 'SELECT s.id, s.company, s.contact_person, s.phone,
                           COUNT(po.id) AS orders_count,
                           COALESCE(SUM(po.total_amount),0) AS total_purchased
                    FROM suppliers s
                    LEFT JOIN purchase_orders po ON po.supplier_id = s.id AND po.owner_id = s.owner_id';
            $args = [];
            if ($start) {
                $sql .= ' AND po.order_date >= ?';
                $args[] = $start;
            }
            if ($end) {
                $sql .= ' AND po.order_date < ?';
                $args[] = $end;
            }
            $sql .= ' WHERE s.owner_id = ?';
            $args[] = $ownerId;
            $sql .= ' GROUP BY s.id, s.company, s.contact_person, s.phone ORDER BY total_purchased DESC';
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $out = [];
            foreach ($st->fetchAll() as $r) {
                $out[] = [
                    'supplier' => $r['company'],
                    'contactPerson' => $r['contact_person'] ?: 'N/A',
                    'phone' => $r['phone'] ?: 'N/A',
                    'ordersCount' => (int) $r['orders_count'],
                    'totalPurchasedValue' => (float) $r['total_purchased'],
                ];
            }
            return $out;
        }

        case 'customer-summary': {
            $sql = 'SELECT c.id, c.name, c.phone, c.reward_points, c.credit_balance,
                           COUNT(s.id) AS sales_count,
                           COALESCE(SUM(s.payable_amount),0) AS volume
                    FROM customers c
                    LEFT JOIN sales s ON s.customer_id = c.id AND s.owner_id = c.owner_id';
            $args = [];
            if ($start) {
                $sql .= ' AND s.sale_date >= ?';
                $args[] = $start;
            }
            if ($end) {
                $sql .= ' AND s.sale_date < ?';
                $args[] = $end;
            }
            if ($branchId) {
                $sql .= ' AND s.branch_id = ?';
                $args[] = $branchId;
            }
            $sql .= ' WHERE c.owner_id = ?';
            $args[] = $ownerId;
            $sql .= ' GROUP BY c.id, c.name, c.phone, c.reward_points, c.credit_balance ORDER BY volume DESC';
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $out = [];
            foreach ($st->fetchAll() as $r) {
                $out[] = [
                    'customerName' => $r['name'],
                    'phone' => $r['phone'],
                    'loyaltyPoints' => (int) $r['reward_points'],
                    'salesCount' => (int) $r['sales_count'],
                    'totalPurchaseVolume' => (float) $r['volume'],
                    'outstandingBalance' => (float) $r['credit_balance'],
                ];
            }
            return $out;
        }

        case 'technician-performance': {
            $sql = "SELECT u.id, u.name, u.username,
                           COALESCE(SUM(CASE WHEN r.id IS NOT NULL AND r.status IN ('DELIVERED', 'READY') THEN 1 ELSE 0 END),0) AS completed_count,
                           COALESCE(SUM(CASE WHEN r.id IS NOT NULL AND r.status NOT IN ('DELIVERED', 'READY') THEN 1 ELSE 0 END),0) AS pending_count,
                           COALESCE(SUM(CASE WHEN r.id IS NOT NULL AND r.status IN ('DELIVERED', 'READY') THEN r.repair_cost + r.service_charge ELSE 0 END),0) AS revenue_generated
                    FROM users u
                    LEFT JOIN repair_jobs r ON r.technician_id = u.id AND r.owner_id = u.owner_id";
            $args = [];
            if ($start) {
                $sql .= ' AND r.created_at >= ?';
                $args[] = $start;
            }
            if ($end) {
                $sql .= ' AND r.created_at < ?';
                $args[] = $end;
            }
            $sql .= " WHERE u.role = 'TECHNICIAN' AND u.owner_id = ?
                      GROUP BY u.id, u.name, u.username
                      ORDER BY revenue_generated DESC";
            $args[] = $ownerId;
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $out = [];
            foreach ($st->fetchAll() as $u) {
                $out[] = [
                    'technician' => $u['name'],
                    'username' => $u['username'],
                    'completedCount' => (int) $u['completed_count'],
                    'pendingCount' => (int) $u['pending_count'],
                    'revenueGenerated' => (float) $u['revenue_generated'],
                ];
            }
            usort($out, static fn($a, $b) => $b['revenueGenerated'] <=> $a['revenueGenerated']);
            return $out;
        }

        case 'warranty-summary': {
            $sql = 'SELECT w.*, c.name AS customer_name, p.name AS product_name, p.sku AS product_sku
                    FROM warranty_claims w
                    LEFT JOIN sales s ON s.id = w.sale_id AND s.owner_id = w.owner_id
                    LEFT JOIN customers c ON c.id = s.customer_id AND c.owner_id = w.owner_id
                    LEFT JOIN products p ON p.id = w.product_id AND p.owner_id = w.owner_id
                    WHERE w.owner_id = ?';
            $args = [$ownerId];
            if ($start) {
                $sql .= ' AND w.created_at >= ?';
                $args[] = $start;
            }
            if ($end) {
                $sql .= ' AND w.created_at < ?';
                $args[] = $end;
            }
            $sql .= ' ORDER BY w.created_at DESC';
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $out = [];
            foreach ($st->fetchAll() as $c) {
                $out[] = [
                    'claimId' => substr($c['id'], 0, 8),
                    'customerName' => $c['customer_name'] ?: 'Walk-in Customer',
                    'productName' => $c['product_name'] ?: 'Unknown Product',
                    'sku' => $c['product_sku'] ?: 'N/A',
                    'notes' => $c['notes'] ?: 'No details set',
                    'claimStatus' => $c['status'],
                    'createdDate' => substr((string) $c['created_at'], 0, 10),
                ];
            }
            return $out;
        }

        default:
            throw new InvalidArgumentException("Invalid report type: {$type}");
    }
}

function reports_query(array $params): void
{
    $type = $params['type'] ?? '';
    $q = query_params();
    try {
        $data = reports_compile(
            $type,
            isset($q['startDate']) ? (string) $q['startDate'] : null,
            isset($q['endDate']) ? (string) $q['endDate'] : null,
            isset($q['branchId']) && $q['branchId'] !== '' ? (string) $q['branchId'] : null
        );
        json_response($data);
    } catch (InvalidArgumentException $e) {
        json_error($e->getMessage(), 400);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to load report data.', 500);
    }
}

function reports_to_csv(array $data): string
{
    if (!$data) {
        return '';
    }
    $headers = array_keys($data[0]);
    $lines = [implode(',', array_map(static fn($h) => '"' . str_replace('"', '""', (string) $h) . '"', $headers))];
    foreach ($data as $row) {
        $vals = [];
        foreach ($headers as $h) {
            $v = $row[$h] ?? '';
            $vals[] = '"' . str_replace('"', '""', (string) $v) . '"';
        }
        $lines[] = implode(',', $vals);
    }
    return implode("\n", $lines);
}

/** Excel-friendly SpreadsheetML (.xls) without external libs */
function reports_to_excel_xml(array $data, string $title = 'Report'): string
{
    $title = htmlspecialchars(substr($title, 0, 31), ENT_XML1);
    $xml = '<?xml version="1.0"?>' . "\n";
    $xml .= '<?mso-application progid="Excel.Sheet"?>' . "\n";
    $xml .= '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
        . ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
        . "<Worksheet ss:Name=\"{$title}\"><Table>";
    if ($data) {
        $headers = array_keys($data[0]);
        $xml .= '<Row>';
        foreach ($headers as $h) {
            $xml .= '<Cell><Data ss:Type="String">' . htmlspecialchars((string) $h, ENT_XML1) . '</Data></Cell>';
        }
        $xml .= '</Row>';
        foreach ($data as $row) {
            $xml .= '<Row>';
            foreach ($headers as $h) {
                $v = $row[$h] ?? '';
                $type = is_numeric($v) ? 'Number' : 'String';
                $xml .= '<Cell><Data ss:Type="' . $type . '">' . htmlspecialchars((string) $v, ENT_XML1) . '</Data></Cell>';
            }
            $xml .= '</Row>';
        }
    }
    $xml .= '</Table></Worksheet></Workbook>';
    return $xml;
}

/** Minimal multi-line text PDF */
function reports_to_pdf(array $data, string $title): string
{
    $lines = [$title, str_repeat('=', min(80, strlen($title) + 5)), ''];
    if ($data) {
        $headers = array_keys($data[0]);
        $lines[] = implode(' | ', $headers);
        $lines[] = str_repeat('-', 80);
        foreach (array_slice($data, 0, 200) as $row) {
            $parts = [];
            foreach ($headers as $h) {
                $parts[] = (string) ($row[$h] ?? '');
            }
            $lines[] = implode(' | ', $parts);
        }
    } else {
        $lines[] = '(no rows)';
    }
    $text = implode("\n", $lines);
    // Escape for PDF literal string (basic)
    $content = "BT /F1 9 Tf 40 780 Td 12 TL\n";
    foreach (explode("\n", $text) as $line) {
        $safe = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], substr($line, 0, 110));
        $content .= "({$safe}) '\n";
    }
    $content .= "ET";
    $len = strlen($content);
    $pdf = "%PDF-1.4\n";
    $pdf .= "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n";
    $pdf .= "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n";
    $pdf .= "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n";
    $pdf .= "4 0 obj<< /Length {$len} >>stream\n{$content}\nendstream endobj\n";
    $pdf .= "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n";
    $xrefPos = strlen($pdf);
    $pdf .= "xref\n0 6\n0000000000 65535 f \n";
    // Simple trailer without precise offsets (many readers still open); use linear free-form for max compatibility
    $pdf = "%PDF-1.4\n";
    $objs = [];
    $objs[] = "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n";
    $objs[] = "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n";
    $objs[] = "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n";
    $objs[] = "4 0 obj<< /Length {$len} >>stream\n{$content}\nendstream\nendobj\n";
    $objs[] = "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n";
    $offsets = [0];
    $body = "";
    foreach ($objs as $i => $obj) {
        $offsets[] = strlen($pdf) + strlen($body);
        $body .= $obj;
    }
    $pdf .= $body;
    $xref = strlen($pdf);
    $pdf .= "xref\n0 6\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= 5; $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }
    $pdf .= "trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}

function reports_export(array $params): void
{
    $type = $params['type'] ?? '';
    $format = strtolower($params['format'] ?? 'csv');
    $q = query_params();
    try {
        $data = reports_compile(
            $type,
            isset($q['startDate']) ? (string) $q['startDate'] : null,
            isset($q['endDate']) ? (string) $q['endDate'] : null,
            isset($q['branchId']) && $q['branchId'] !== '' ? (string) $q['branchId'] : null
        );

        if ($format === 'csv') {
            $csv = reports_to_csv($data);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $type . '-report.csv"');
            echo $csv;
            exit;
        }

        if ($format === 'excel' || $format === 'xlsx' || $format === 'xls') {
            $xml = reports_to_excel_xml($data, $type);
            header('Content-Type: application/vnd.ms-excel');
            header('Content-Disposition: attachment; filename="' . $type . '-report.xls"');
            echo $xml;
            exit;
        }

        if ($format === 'pdf') {
            $pdf = reports_to_pdf($data, strtoupper($type) . ' REPORT');
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $type . '-report.pdf"');
            echo $pdf;
            exit;
        }

        json_error('Unsupported export format. Use csv, excel, or pdf.', 400);
    } catch (InvalidArgumentException $e) {
        json_error($e->getMessage(), 400);
    } catch (Throwable $e) {
        json_error($e->getMessage() ?: 'Failed to export report.', 500);
    }
}

/* ---------- Dashboard endpoints (date filters: startDate/endDate/month/year) ---------- */

/**
 * Build SQL fragments for sales filters used by dashboard.
 * @return array{0:string,1:list<mixed>,2:string} [saleWhere, saleArgs, periodLabel]
 */
function reports_dashboard_period_filter(): array
{
    $q = query_params();
    $branchId = isset($q['branchId']) && $q['branchId'] !== '' ? (string) $q['branchId'] : null;
    $startDate = isset($q['startDate']) && $q['startDate'] !== '' ? (string) $q['startDate'] : null;
    $endDate = isset($q['endDate']) && $q['endDate'] !== '' ? (string) $q['endDate'] : null;
    $month = isset($q['month']) && $q['month'] !== '' && $q['month'] !== 'ALL' ? (string) $q['month'] : null;
    $year = isset($q['year']) && $q['year'] !== '' && $q['year'] !== 'ALL' ? (string) $q['year'] : null;
    $range = isset($q['range']) ? strtoupper((string) $q['range']) : 'ALL';

    $where = 'owner_id = ?';
    $args = [tenant_owner_id()];
    $label = 'All time';

    if ($branchId) {
        $where .= ' AND branch_id = ?';
        $args[] = $branchId;
    }

    // Explicit range wins when provided
    if ($startDate || $endDate) {
        if ($startDate) {
            $where .= ' AND sale_date >= ?';
            $args[] = date('Y-m-d 00:00:00', strtotime($startDate));
        }
        if ($endDate) {
            $where .= ' AND sale_date < ?';
            $args[] = reports_day_after(date('Y-m-d 23:59:59', strtotime($endDate)));
        }
        $label = ($startDate ?: '…') . ' → ' . ($endDate ?: '…');
        return [$where, $args, $label];
    }

    // Month / year chips (same semantics as Sales History)
    if ($month !== null || $year !== null) {
        if ($year !== null) {
            [$start, $end] = reports_month_bounds((int) $year, $month !== null ? (int) $month : null);
            $where .= ' AND sale_date >= ? AND sale_date < ?';
            $args[] = $start;
            $args[] = $end;
        } elseif ($month !== null) {
            // Month without year is ambiguous; keep the old behavior narrow by using the current year.
            [$start, $end] = reports_month_bounds((int) date('Y'), (int) $month);
            $where .= ' AND sale_date >= ? AND sale_date < ?';
            $args[] = $start;
            $args[] = $end;
        }
        $months = [1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr', 5 => 'May', 6 => 'Jun', 7 => 'Jul', 8 => 'Aug', 9 => 'Sep', 10 => 'Oct', 11 => 'Nov', 12 => 'Dec'];
        $mLabel = $month !== null ? ($months[(int) $month] ?? $month) : 'All months';
        $yLabel = $year !== null ? $year : (string) date('Y');
        $label = "{$mLabel} · {$yLabel}";
        return [$where, $args, $label];
    }

    // Quick ranges
    if ($range === 'TODAY') {
        $where .= ' AND sale_date >= ? AND sale_date < ?';
        $args[] = date('Y-m-d 00:00:00');
        $args[] = reports_day_after(date('Y-m-d 23:59:59'));
        $label = 'Today';
    } elseif ($range === '7_DAYS') {
        $where .= ' AND sale_date >= ?';
        $args[] = date('Y-m-d 00:00:00', strtotime('-7 days'));
        $label = 'Last 7 days';
    } elseif ($range === '30_DAYS') {
        $where .= ' AND sale_date >= ?';
        $args[] = date('Y-m-d 00:00:00', strtotime('-30 days'));
        $label = 'Last 30 days';
    }

    return [$where, $args, $label];
}

/** Expense filter parallel to sales period (uses `date` column, no branch). */
function reports_expense_period_filter(): array
{
    $q = query_params();
    $startDate = isset($q['startDate']) && $q['startDate'] !== '' ? (string) $q['startDate'] : null;
    $endDate = isset($q['endDate']) && $q['endDate'] !== '' ? (string) $q['endDate'] : null;
    $month = isset($q['month']) && $q['month'] !== '' && $q['month'] !== 'ALL' ? (string) $q['month'] : null;
    $year = isset($q['year']) && $q['year'] !== '' && $q['year'] !== 'ALL' ? (string) $q['year'] : null;
    $range = isset($q['range']) ? strtoupper((string) $q['range']) : 'ALL';

    $where = 'owner_id = ?';
    $args = [tenant_owner_id()];
    if ($startDate || $endDate) {
        if ($startDate) {
            $where .= ' AND date >= ?';
            $args[] = date('Y-m-d 00:00:00', strtotime($startDate));
        }
        if ($endDate) {
            $where .= ' AND date < ?';
            $args[] = reports_day_after(date('Y-m-d 23:59:59', strtotime($endDate)));
        }
        return [$where, $args];
    }
    if ($month !== null || $year !== null) {
        if ($year !== null) {
            [$start, $end] = reports_month_bounds((int) $year, $month !== null ? (int) $month : null);
            $where .= ' AND date >= ? AND date < ?';
            $args[] = $start;
            $args[] = $end;
        } elseif ($month !== null) {
            [$start, $end] = reports_month_bounds((int) date('Y'), (int) $month);
            $where .= ' AND date >= ? AND date < ?';
            $args[] = $start;
            $args[] = $end;
        }
        return [$where, $args];
    }
    if ($range === 'TODAY') {
        $where .= ' AND date >= ? AND date < ?';
        $args[] = date('Y-m-d 00:00:00');
        $args[] = reports_day_after(date('Y-m-d 23:59:59'));
    } elseif ($range === '7_DAYS') {
        $where .= ' AND date >= ?';
        $args[] = date('Y-m-d 00:00:00', strtotime('-7 days'));
    } elseif ($range === '30_DAYS') {
        $where .= ' AND date >= ?';
        $args[] = date('Y-m-d 00:00:00', strtotime('-30 days'));
    }
    return [$where, $args];
}

function reports_dashboard_stats(array $params): void
{
    $pdo = Database::pdo();
    [$saleWhere, $saleArgs, $periodLabel] = reports_dashboard_period_filter();
    [$expWhere, $expArgs] = reports_expense_period_filter();

    $todayStart = date('Y-m-d 00:00:00');
    $monthStart = date('Y-m-01 00:00:00');
    $branchId = query_params()['branchId'] ?? null;
    $branchOnly = '';
    $branchArgs = [];
    if ($branchId) {
        $branchOnly = ' AND branch_id = ?';
        $branchArgs[] = $branchId;
    }

    $q = static function (PDO $pdo, string $sql, array $args = []) {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return $st->fetch();
    };

    // Always keep "today" snapshot (branch only)
    $ownerId = tenant_owner_id();
    $today = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE owner_id = ? AND sale_date >= ?{$branchOnly}",
        array_merge([$ownerId, $todayStart], $branchArgs)
    );

    // Period sales (filtered)
    $period = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE {$saleWhere}",
        $saleArgs
    );

    // Calendar month MTD (branch) for comparison card
    $month = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE owner_id = ? AND sale_date >= ?{$branchOnly}",
        array_merge([$ownerId, $monthStart], $branchArgs)
    );

    $expensesPeriod = $q($pdo, "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE {$expWhere}", $expArgs);
    $ownerId = tenant_owner_id();
    $expensesMonth = $q($pdo, "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE owner_id = ? AND date >= ?", [$ownerId, $monthStart]);
    $expensesAll = $q($pdo, "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE owner_id = ?", [$ownerId]);

    $products = $q(
        $pdo,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(stock_quantity),0) AS units,
                SUM(CASE WHEN stock_quantity <= min_stock AND stock_quantity > 0 THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END) AS outq
         FROM products WHERE owner_id = ?",
        [$ownerId]
    );
    $customers = $q($pdo, "SELECT COUNT(*) AS cnt FROM customers WHERE owner_id = ?", [$ownerId]);
    $bst = $pdo->prepare(
        "SELECT type, COALESCE(SUM(balance),0) AS bal FROM bank_accounts WHERE is_active = 1 AND owner_id = ? GROUP BY type"
    );
    $bst->execute([$ownerId]);
    $balances = $bst->fetchAll();
    $cash = $bank = $wallet = 0.0;
    foreach ($balances as $b) {
        $t = strtoupper((string) $b['type']);
        $bal = (float) $b['bal'];
        if ($t === 'CASH') {
            $cash = $bal;
        } elseif ($t === 'BANK') {
            $bank = $bal;
        } elseif ($t === 'MOBILE_WALLET' || $t === 'WALLET') {
            $wallet = $bal;
        }
    }

    $periodSales = (float) ($period['total'] ?? 0);
    $periodCount = (int) ($period['cnt'] ?? 0);
    $periodExpenses = (float) ($expensesPeriod['total'] ?? 0);
    $monthlySales = (float) ($month['total'] ?? 0);
    $monthlyExpenses = (float) ($expensesMonth['total'] ?? 0);
    $totalExpenses = (float) ($expensesAll['total'] ?? 0);

    // Qualify columns so owner_id is not ambiguous with customers.owner_id
    $saleWhereRecent = preg_replace('/\bowner_id\b/', 's.owner_id', $saleWhere);
    $saleWhereRecent = preg_replace('/\bbranch_id\b/', 's.branch_id', $saleWhereRecent);
    $saleWhereRecent = preg_replace('/\bsale_date\b/', 's.sale_date', $saleWhereRecent);
    $recentSql = "SELECT s.id, s.payable_amount, s.sale_date, s.payment_method, c.name AS customer_name
                  FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                  WHERE {$saleWhereRecent} ORDER BY s.sale_date DESC LIMIT 8";
    $st = $pdo->prepare($recentSql);
    $st->execute($saleArgs);
    $recentSales = [];
    foreach ($st->fetchAll() as $row) {
        $recentSales[] = [
            'id' => $row['id'],
            'payableAmount' => (float) $row['payable_amount'],
            'saleDate' => $row['sale_date'],
            'paymentMethod' => $row['payment_method'],
            'customer' => $row['customer_name'] ? ['name' => $row['customer_name']] : null,
        ];
    }

    $st = $pdo->prepare("SELECT id, name, phone, created_at FROM customers WHERE owner_id = ? ORDER BY created_at DESC LIMIT 8");
    $st->execute([$ownerId]);
    $recentCustomers = [];
    foreach ($st->fetchAll() as $row) {
        $recentCustomers[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'phone' => $row['phone'],
            'createdAt' => $row['created_at'],
        ];
    }

    // Years/months that have sales (for UI chips)
    $yst = $pdo->prepare(
        "SELECT YEAR(sale_date) AS y, COUNT(*) AS c FROM sales
         WHERE owner_id = ? AND YEAR(sale_date) <= YEAR(CURDATE())+1
         GROUP BY y ORDER BY c DESC, y DESC"
    );
    $yst->execute([$ownerId]);
    $yearRows = $yst->fetchAll();
    $years = array_map(static fn($r) => (int) $r['y'], $yearRows);
    $mst = $pdo->prepare(
        'SELECT MONTH(sale_date) AS m, COUNT(*) AS c FROM sales WHERE owner_id = ? GROUP BY m'
    );
    $mst->execute([$ownerId]);
    $monthRows = $mst->fetchAll();
    $monthsWithSales = [];
    foreach ($monthRows as $r) {
        $key = str_pad((string) $r['m'], 2, '0', STR_PAD_LEFT);
        $monthsWithSales[$key] = (int) $r['c'];
    }

    json_response([
        'periodLabel' => $periodLabel,
        'todaySales' => (float) ($today['total'] ?? 0),
        'todaySalesCount' => (int) ($today['cnt'] ?? 0),
        // Period-aware fields (primary KPI for filtered view)
        'periodSales' => $periodSales,
        'periodSalesCount' => $periodCount,
        'periodExpenses' => $periodExpenses,
        'periodProfit' => $periodSales - $periodExpenses,
        // Calendar month (always MTD) for secondary cards
        'monthlySales' => $monthlySales,
        'monthlySalesCount' => (int) ($month['cnt'] ?? 0),
        'monthlyExpenses' => $monthlyExpenses,
        'monthlyProfit' => $monthlySales - $monthlyExpenses,
        'totalProducts' => (int) ($products['cnt'] ?? 0),
        'totalUnitsInStock' => (int) ($products['units'] ?? 0),
        'lowStockCount' => (int) ($products['low'] ?? 0),
        'outOfStockCount' => (int) ($products['outq'] ?? 0),
        'totalSalesCount' => $periodCount,
        'totalRevenue' => $periodSales,
        'totalExpenses' => $periodExpenses > 0 ? $periodExpenses : $totalExpenses,
        'netProfit' => $periodSales - $periodExpenses,
        'totalCustomers' => (int) ($customers['cnt'] ?? 0),
        'cashBalance' => $cash,
        'bankBalance' => $bank,
        'walletBalance' => $wallet,
        'totalBalance' => $cash + $bank + $wallet,
        'recentSales' => $recentSales,
        'recentCustomers' => $recentCustomers,
        'availableYears' => $years,
        'monthsWithSales' => $monthsWithSales,
    ]);
}

function reports_charts(array $params): void
{
    $pdo = Database::pdo();
    [$saleWhere, $saleArgs] = reports_dashboard_period_filter();
    // Alias for queries that use s. prefix
    $saleWhereS = str_replace('branch_id', 's.branch_id', str_replace('sale_date', 's.sale_date', str_replace('owner_id', 's.owner_id', $saleWhere)));
    $expWhere = str_replace('sale_date', 'date', explode(' AND branch_id', $saleWhere)[0]);
    // rebuild expense filter cleanly
    [$expWhere, $expArgs] = reports_expense_period_filter();

    $q = query_params();
    $hasCustom = !empty($q['startDate']) || !empty($q['endDate'])
        || (!empty($q['month']) && $q['month'] !== 'ALL')
        || (!empty($q['year']) && $q['year'] !== 'ALL')
        || (!empty($q['range']) && strtoupper((string) $q['range']) !== 'ALL');

    $salesTrend = [];
    $dailyRevenue = [];
    $profitTrend = [];

    if (!$hasCustom) {
        // Default: last 14 days, but still tenant-scoped and grouped in SQL.
        $start = date('Y-m-d 00:00:00', strtotime('-13 days'));
        $end = reports_day_after(date('Y-m-d 23:59:59'));

        $salesSql = "SELECT DATE(s.sale_date) AS d, COALESCE(SUM(s.payable_amount),0) AS rev
                     FROM sales s WHERE {$saleWhereS} AND s.sale_date >= ? AND s.sale_date < ?
                     GROUP BY DATE(s.sale_date) ORDER BY d ASC";
        $st = $pdo->prepare($salesSql);
        $st->execute(array_merge($saleArgs, [$start, $end]));
        $salesByDay = [];
        foreach ($st->fetchAll() as $r) {
            $salesByDay[$r['d']] = (float) $r['rev'];
        }

        $expSql = "SELECT DATE(date) AS d, COALESCE(SUM(amount),0) AS exp
                   FROM expenses WHERE {$expWhere} AND date >= ? AND date < ?
                   GROUP BY DATE(date) ORDER BY d ASC";
        $st = $pdo->prepare($expSql);
        $st->execute(array_merge($expArgs, [$start, $end]));
        $expByDay = [];
        foreach ($st->fetchAll() as $r) {
            $expByDay[$r['d']] = (float) $r['exp'];
        }

        for ($i = 13; $i >= 0; $i--) {
            $day = date('Y-m-d', strtotime("-{$i} days"));
            $rev = $salesByDay[$day] ?? 0.0;
            $exp = $expByDay[$day] ?? 0.0;
            $label = date('M j', strtotime($day));
            $salesTrend[] = ['date' => $label, 'fullDate' => $day, 'revenue' => $rev];
            $dailyRevenue[] = ['date' => $label, 'fullDate' => $day, 'revenue' => $rev];
            $profitTrend[] = [
                'date' => $label,
                'fullDate' => $day,
                'revenue' => $rev,
                'expenses' => $exp,
                'profit' => $rev - $exp,
            ];
        }
    } else {
        // Group filtered period by day (max 62 points)
        $st = $pdo->prepare(
            "SELECT DATE(s.sale_date) AS d, COALESCE(SUM(s.payable_amount),0) AS rev
             FROM sales s WHERE {$saleWhereS}
             GROUP BY DATE(s.sale_date) ORDER BY d ASC LIMIT 62"
        );
        $st->execute($saleArgs);
        $byDay = [];
        foreach ($st->fetchAll() as $r) {
            $byDay[$r['d']] = (float) $r['rev'];
        }
        $st = $pdo->prepare(
            "SELECT DATE(date) AS d, COALESCE(SUM(amount),0) AS exp FROM expenses WHERE {$expWhere}
             GROUP BY DATE(date)"
        );
        $st->execute($expArgs);
        $expByDay = [];
        foreach ($st->fetchAll() as $r) {
            $expByDay[$r['d']] = (float) $r['exp'];
        }
        $days = array_unique(array_merge(array_keys($byDay), array_keys($expByDay)));
        sort($days);
        if (!$days) {
            $days = [date('Y-m-d')];
        }
        foreach ($days as $day) {
            $rev = $byDay[$day] ?? 0.0;
            $exp = $expByDay[$day] ?? 0.0;
            $label = date('M j', strtotime($day));
            $salesTrend[] = ['date' => $label, 'fullDate' => $day, 'revenue' => $rev];
            $dailyRevenue[] = ['date' => $label, 'fullDate' => $day, 'revenue' => $rev];
            $profitTrend[] = [
                'date' => $label,
                'fullDate' => $day,
                'revenue' => $rev,
                'expenses' => $exp,
                'profit' => $rev - $exp,
            ];
        }
    }

    $st = $pdo->prepare(
        "SELECT COALESCE(c.name,'Uncategorized') AS name, SUM(si.total_price) AS value
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE {$saleWhereS}
         GROUP BY name ORDER BY value DESC LIMIT 10"
    );
    $st->execute($saleArgs);
    $categoryChartData = [];
    foreach ($st->fetchAll() as $r) {
        $categoryChartData[] = ['name' => $r['name'], 'value' => (float) $r['value']];
    }

    $st = $pdo->prepare(
        "SELECT COALESCE(br.name,'Generic') AS brand, SUM(si.total_price) AS revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN brands br ON br.id = p.brand_id
         WHERE {$saleWhereS}
         GROUP BY brand ORDER BY revenue DESC LIMIT 10"
    );
    $st->execute($saleArgs);
    $brandChartData = [];
    foreach ($st->fetchAll() as $r) {
        $brandChartData[] = ['brand' => $r['brand'], 'revenue' => (float) $r['revenue']];
    }

    json_response([
        'salesTrend' => $salesTrend,
        'dailyRevenue' => $dailyRevenue,
        'profitTrend' => $profitTrend,
        'categoryChartData' => $categoryChartData,
        'brandChartData' => $brandChartData,
    ]);
}

function reports_top_selling(array $params): void
{
    $pdo = Database::pdo();
    [$saleWhere, $saleArgs] = reports_dashboard_period_filter();
    $saleWhereS = str_replace('branch_id', 's.branch_id', str_replace('sale_date', 's.sale_date', str_replace('owner_id', 's.owner_id', $saleWhere)));
    $sql = "SELECT p.id, p.name, p.sku, br.name AS brand_name, SUM(si.quantity) AS qty, SUM(si.total_price) AS revenue
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            LEFT JOIN brands br ON br.id = p.brand_id
            WHERE {$saleWhereS}
            GROUP BY p.id, p.name, p.sku, br.name
            ORDER BY qty DESC
            LIMIT 5";
    $st = $pdo->prepare($sql);
    $st->execute($saleArgs);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $out[] = [
            'name' => $r['name'],
            'sku' => $r['sku'],
            'brand' => $r['brand_name'] ?: 'Generic',
            'quantity' => (int) $r['qty'],
            'revenue' => (float) $r['revenue'],
        ];
    }
    json_response($out);
}
