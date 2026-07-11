<?php

declare(strict_types=1);

/** Shared row → camelCase formatters for API responses */
final class Format
{
    public static function customer(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'phone' => $r['phone'],
            'email' => $r['email'] ?? null,
            'address' => $r['address'] ?? null,
            'rewardPoints' => (int) ($r['reward_points'] ?? 0),
            'creditBalance' => (float) ($r['credit_balance'] ?? 0),
            'creditLimit' => (float) ($r['credit_limit'] ?? 0),
            'notes' => $r['notes'] ?? null,
            'createdAt' => $r['created_at'] ?? null,
            'updatedAt' => $r['updated_at'] ?? null,
        ];
    }

    public static function userLite(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'username' => $r['username'] ?? null,
            'role' => $r['role'] ?? null,
        ];
    }

    public static function branch(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'address' => $r['address'] ?? null,
            'phone' => $r['phone'] ?? null,
        ];
    }

    public static function productLite(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'sku' => $r['sku'] ?? null,
            'model' => $r['model'] ?? null,
            'sellingPrice' => isset($r['selling_price']) ? (float) $r['selling_price'] : null,
            'purchasePrice' => isset($r['purchase_price']) ? (float) $r['purchase_price'] : null,
        ];
    }

    public static function supplier(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'company' => $r['company'],
            'contactPerson' => $r['contact_person'] ?? null,
            'phone' => $r['phone'] ?? null,
            'email' => $r['email'] ?? null,
            'address' => $r['address'] ?? null,
            'createdAt' => $r['created_at'] ?? null,
            'updatedAt' => $r['updated_at'] ?? null,
        ];
    }

    public static function bankAccount(?array $r): ?array
    {
        if (!$r) {
            return null;
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'type' => $r['type'],
            'accountNumber' => $r['account_number'] ?? null,
            'bankName' => $r['bank_name'] ?? null,
            'balance' => (float) ($r['balance'] ?? 0),
            'isActive' => (bool) (int) ($r['is_active'] ?? 1),
            'notes' => $r['notes'] ?? null,
            'createdAt' => $r['created_at'] ?? null,
            'updatedAt' => $r['updated_at'] ?? null,
        ];
    }
}
