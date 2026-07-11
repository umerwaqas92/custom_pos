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
    $end = $endDate ? date('Y-m-d 23:59:59', strtotime($endDate)) : null;
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

    $saleDateSql = '';
    $saleArgs = [];
    if ($start) {
        $saleDateSql .= ' AND s.sale_date >= ?';
        $saleArgs[] = $start;
    }
    if ($end) {
        $saleDateSql .= ' AND s.sale_date <= ?';
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
            $expSql = 'SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM expenses WHERE 1=1';
            $expArgs = [];
            if ($start) {
                $expSql .= ' AND date >= ?';
                $expArgs[] = $start;
            }
            if ($end) {
                $expSql .= ' AND date <= ?';
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
                    JOIN products p ON p.id = bs.product_id
                    LEFT JOIN categories c ON c.id = p.category_id
                    LEFT JOIN brands br ON br.id = p.brand_id
                    LEFT JOIN branches b ON b.id = bs.branch_id
                    WHERE 1=1';
            $args = [];
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
                    'SELECT bs.quantity, p.sku, p.name, c.name AS cat_name, br.name AS brand_name, b.name AS branch_name
                     FROM branch_stocks bs
                     JOIN products p ON p.id = bs.product_id
                     LEFT JOIN categories c ON c.id = p.category_id
                     LEFT JOIN brands br ON br.id = p.brand_id
                     LEFT JOIN branches b ON b.id = bs.branch_id
                     WHERE bs.branch_id = ? AND bs.quantity <= ?'
                );
                $st->execute([$branchId, $LOW]);
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
                 WHERE p.stock_quantity <= ?'
            );
            $st->execute([$LOW]);
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
            $sql = "SELECT si.product_id, SUM(si.quantity) AS qty, SUM(si.total_price) AS rev
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY si.product_id
                    ORDER BY qty DESC
                    LIMIT 15";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
            $rows = $st->fetchAll();
            $out = [];
            foreach ($rows as $row) {
                $p = $pdo->prepare(
                    'SELECT p.sku, p.name, c.name AS cat_name, br.name AS brand_name
                     FROM products p
                     LEFT JOIN categories c ON c.id = p.category_id
                     LEFT JOIN brands br ON br.id = p.brand_id
                     WHERE p.id = ?'
                );
                $p->execute([$row['product_id']]);
                $prod = $p->fetch() ?: [];
                $out[] = [
                    'sku' => $prod['sku'] ?? '',
                    'productName' => $prod['name'] ?? 'Unknown',
                    'category' => $prod['cat_name'] ?? 'N/A',
                    'brand' => $prod['brand_name'] ?? 'N/A',
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
            $products = $pdo->query(
                'SELECT p.id, p.sku, p.name, p.stock_quantity, c.name AS cat_name, br.name AS brand_name
                 FROM products p
                 LEFT JOIN categories c ON c.id = p.category_id
                 LEFT JOIN brands br ON br.id = p.brand_id'
            )->fetchAll();
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
                    JOIN products p ON p.id = si.product_id
                    LEFT JOIN brands br ON br.id = p.brand_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY brand
                    ORDER BY rev DESC";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
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
                    JOIN products p ON p.id = si.product_id
                    LEFT JOIN categories c ON c.id = p.category_id
                    WHERE 1=1 {$saleDateSql}
                    GROUP BY category
                    ORDER BY rev DESC";
            $st = $pdo->prepare($sql);
            $st->execute($saleArgs);
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
                    LEFT JOIN purchase_orders po ON po.supplier_id = s.id';
            $args = [];
            $conds = [];
            if ($start) {
                $conds[] = 'po.order_date >= ?';
                $args[] = $start;
            }
            if ($end) {
                $conds[] = 'po.order_date <= ?';
                $args[] = $end;
            }
            // Only constrain purchase join dates when provided
            if ($conds) {
                $sql .= ' AND (' . implode(' AND ', $conds) . ' OR po.id IS NULL)';
            }
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
                    LEFT JOIN sales s ON s.customer_id = c.id';
            $args = [];
            if ($start || $end || $branchId) {
                $parts = [];
                if ($start) {
                    $parts[] = 's.sale_date >= ?';
                    $args[] = $start;
                }
                if ($end) {
                    $parts[] = 's.sale_date <= ?';
                    $args[] = $end;
                }
                if ($branchId) {
                    $parts[] = 's.branch_id = ?';
                    $args[] = $branchId;
                }
                $sql .= ' AND (s.id IS NULL OR (' . implode(' AND ', $parts) . '))';
            }
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
            $sql = "SELECT u.id, u.name, u.username FROM users u WHERE u.role = 'TECHNICIAN'";
            $techs = $pdo->query($sql)->fetchAll();
            $out = [];
            foreach ($techs as $u) {
                $jSql = 'SELECT status, repair_cost, service_charge FROM repair_jobs WHERE technician_id = ?';
                $jArgs = [$u['id']];
                if ($start) {
                    $jSql .= ' AND created_at >= ?';
                    $jArgs[] = $start;
                }
                if ($end) {
                    $jSql .= ' AND created_at <= ?';
                    $jArgs[] = $end;
                }
                $st = $pdo->prepare($jSql);
                $st->execute($jArgs);
                $completed = 0;
                $pending = 0;
                $rev = 0.0;
                foreach ($st->fetchAll() as $j) {
                    if ($j['status'] === 'DELIVERED' || $j['status'] === 'READY') {
                        $completed++;
                        $rev += (float) $j['repair_cost'] + (float) $j['service_charge'];
                    } else {
                        $pending++;
                    }
                }
                $out[] = [
                    'technician' => $u['name'],
                    'username' => $u['username'],
                    'completedCount' => $completed,
                    'pendingCount' => $pending,
                    'revenueGenerated' => $rev,
                ];
            }
            usort($out, static fn($a, $b) => $b['revenueGenerated'] <=> $a['revenueGenerated']);
            return $out;
        }

        case 'warranty-summary': {
            $sql = 'SELECT w.*, c.name AS customer_name, p.name AS product_name, p.sku AS product_sku
                    FROM warranty_claims w
                    LEFT JOIN sales s ON s.id = w.sale_id
                    LEFT JOIN customers c ON c.id = s.customer_id
                    LEFT JOIN products p ON p.id = w.product_id
                    WHERE 1=1';
            $args = [];
            if ($start) {
                $sql .= ' AND w.created_at >= ?';
                $args[] = $start;
            }
            if ($end) {
                $sql .= ' AND w.created_at <= ?';
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

/* ---------- Existing dashboard endpoints (enhanced charts) ---------- */

function reports_dashboard_stats(array $params): void
{
    $pdo = Database::pdo();
    $branchId = query_params()['branchId'] ?? null;

    $todayStart = date('Y-m-d 00:00:00');
    $monthStart = date('Y-m-01 00:00:00');

    $saleFilter = '';
    $saleArgs = [];
    if ($branchId) {
        $saleFilter = ' AND branch_id = ?';
        $saleArgs[] = $branchId;
    }

    $q = static function (PDO $pdo, string $sql, array $args = []) {
        $st = $pdo->prepare($sql);
        $st->execute($args);
        return $st->fetch();
    };

    $today = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE sale_date >= ?{$saleFilter}",
        array_merge([$todayStart], $saleArgs)
    );
    $month = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE sale_date >= ?{$saleFilter}",
        array_merge([$monthStart], $saleArgs)
    );
    $all = $q(
        $pdo,
        "SELECT COALESCE(SUM(payable_amount),0) AS total, COUNT(*) AS cnt FROM sales WHERE 1=1{$saleFilter}",
        $saleArgs
    );
    $expensesMonth = $q($pdo, "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE date >= ?", [$monthStart]);
    $expensesAll = $q($pdo, "SELECT COALESCE(SUM(amount),0) AS total FROM expenses");
    $products = $q(
        $pdo,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(stock_quantity),0) AS units,
                SUM(CASE WHEN stock_quantity <= min_stock AND stock_quantity > 0 THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END) AS outq
         FROM products"
    );
    $customers = $q($pdo, "SELECT COUNT(*) AS cnt FROM customers");
    $balances = $pdo->query(
        "SELECT type, COALESCE(SUM(balance),0) AS bal FROM bank_accounts WHERE is_active = 1 GROUP BY type"
    )->fetchAll();
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

    $monthlySales = (float) ($month['total'] ?? 0);
    $monthlyExpenses = (float) ($expensesMonth['total'] ?? 0);
    $totalRevenue = (float) ($all['total'] ?? 0);
    $totalExpenses = (float) ($expensesAll['total'] ?? 0);

    $recentSql = "SELECT s.id, s.payable_amount, s.sale_date, s.payment_method, c.name AS customer_name
                  FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                  WHERE 1=1{$saleFilter} ORDER BY s.sale_date DESC LIMIT 8";
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

    $st = $pdo->query("SELECT id, name, phone, created_at FROM customers ORDER BY created_at DESC LIMIT 8");
    $recentCustomers = [];
    foreach ($st->fetchAll() as $row) {
        $recentCustomers[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'phone' => $row['phone'],
            'createdAt' => $row['created_at'],
        ];
    }

    json_response([
        'todaySales' => (float) ($today['total'] ?? 0),
        'todaySalesCount' => (int) ($today['cnt'] ?? 0),
        'monthlySales' => $monthlySales,
        'monthlySalesCount' => (int) ($month['cnt'] ?? 0),
        'monthlyExpenses' => $monthlyExpenses,
        'monthlyProfit' => $monthlySales - $monthlyExpenses,
        'totalProducts' => (int) ($products['cnt'] ?? 0),
        'totalUnitsInStock' => (int) ($products['units'] ?? 0),
        'lowStockCount' => (int) ($products['low'] ?? 0),
        'outOfStockCount' => (int) ($products['outq'] ?? 0),
        'totalSalesCount' => (int) ($all['cnt'] ?? 0),
        'totalRevenue' => $totalRevenue,
        'totalExpenses' => $totalExpenses,
        'netProfit' => $totalRevenue - $totalExpenses,
        'totalCustomers' => (int) ($customers['cnt'] ?? 0),
        'cashBalance' => $cash,
        'bankBalance' => $bank,
        'walletBalance' => $wallet,
        'totalBalance' => $cash + $bank + $wallet,
        'recentSales' => $recentSales,
        'recentCustomers' => $recentCustomers,
    ]);
}

function reports_charts(array $params): void
{
    $pdo = Database::pdo();
    $salesTrend = [];
    $dailyRevenue = [];
    $profitTrend = [];

    for ($i = 13; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime("-{$i} days"));
        $start = $day . ' 00:00:00';
        $end = $day . ' 23:59:59';
        $st = $pdo->prepare(
            'SELECT COALESCE(SUM(payable_amount),0) AS rev FROM sales WHERE sale_date BETWEEN ? AND ?'
        );
        $st->execute([$start, $end]);
        $rev = (float) $st->fetchColumn();
        $st = $pdo->prepare(
            'SELECT COALESCE(SUM(amount),0) AS exp FROM expenses WHERE date BETWEEN ? AND ?'
        );
        $st->execute([$start, $end]);
        $exp = (float) $st->fetchColumn();
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

    // Category / brand share (last 90 days)
    $since = date('Y-m-d 00:00:00', strtotime('-90 days'));
    $st = $pdo->prepare(
        "SELECT COALESCE(c.name,'Uncategorized') AS name, SUM(si.total_price) AS value
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.sale_date >= ?
         GROUP BY name ORDER BY value DESC LIMIT 10"
    );
    $st->execute([$since]);
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
         WHERE s.sale_date >= ?
         GROUP BY brand ORDER BY revenue DESC LIMIT 10"
    );
    $st->execute([$since]);
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
    $sql = "SELECT p.id, p.name, p.sku, br.name AS brand_name, SUM(si.quantity) AS qty, SUM(si.total_price) AS revenue
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            LEFT JOIN brands br ON br.id = p.brand_id
            GROUP BY p.id, p.name, p.sku, br.name
            ORDER BY qty DESC
            LIMIT 5";
    $rows = $pdo->query($sql)->fetchAll();
    $out = [];
    foreach ($rows as $r) {
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
