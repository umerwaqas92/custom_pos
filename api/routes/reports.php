<?php

declare(strict_types=1);

function register_reports_routes(Router $router): void
{
    $router->get('reports/dashboard-stats', 'reports_dashboard_stats', false, ['OWNER', 'MANAGER']);
    $router->get('reports/charts', 'reports_charts', false, ['OWNER', 'MANAGER']);
    $router->get('reports/top-selling', 'reports_top_selling', false, ['OWNER', 'MANAGER']);
    $router->get('reports/query/:type', 'reports_query_stub', false, ['OWNER', 'MANAGER']);
    $router->get('reports/export/:type/:format', 'reports_export_stub', false, ['OWNER', 'MANAGER']);
}

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
    $expensesMonth = $q(
        $pdo,
        "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE date >= ?",
        [$monthStart]
    );
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

    // Recent sales
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

    json_response([
        'salesTrend' => $salesTrend,
        'dailyRevenue' => $dailyRevenue,
        'profitTrend' => $profitTrend,
        'categoryChartData' => [],
        'brandChartData' => [],
    ]);
}

function reports_top_selling(array $params): void
{
    $pdo = Database::pdo();
    $sql = "SELECT p.id, p.name, p.sku, SUM(si.quantity) AS qty, SUM(si.total_price) AS revenue
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            GROUP BY p.id, p.name, p.sku
            ORDER BY qty DESC
            LIMIT 10";
    $rows = $pdo->query($sql)->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => $r['id'],
            'name' => $r['name'],
            'sku' => $r['sku'],
            'quantity' => (int) $r['qty'],
            'revenue' => (float) $r['revenue'],
        ];
    }
    json_response($out);
}

function reports_query_stub(array $params): void
{
    json_response([]);
}

function reports_export_stub(array $params): void
{
    json_error('Export not available yet on shared hosting.', 501);
}
