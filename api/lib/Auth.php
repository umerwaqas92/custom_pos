<?php

declare(strict_types=1);

/**
 * Minimal HS256 JWT + role checks (parity with Node middleware).
 * JWT includes ownerId so each shop's data stays isolated.
 */
final class Auth
{
    /** @var array{id:string,username:string,role:string,branchId:?string,ownerId:?string}|null */
    public static ?array $user = null;

    public static function issueToken(array $payload): string
    {
        global $APP_CONFIG;
        $secret = $APP_CONFIG['jwt_secret'] ?? 'super-secret-key-change-in-prod';
        $ttl = (int) ($APP_CONFIG['jwt_ttl_seconds'] ?? 86400);

        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $now = time();
        $body = array_merge($payload, [
            'iat' => $now,
            'exp' => $now + $ttl,
        ]);

        $segments = [
            base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES)),
            base64url_encode(json_encode($body, JSON_UNESCAPED_SLASHES)),
        ];
        $signingInput = implode('.', $segments);
        $signature = hash_hmac('sha256', $signingInput, $secret, true);
        $segments[] = base64url_encode($signature);

        return implode('.', $segments);
    }

    public static function verifyToken(string $token): array
    {
        global $APP_CONFIG;
        $secret = $APP_CONFIG['jwt_secret'] ?? 'super-secret-key-change-in-prod';

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid token.');
        }

        [$h64, $p64, $s64] = $parts;
        $signingInput = $h64 . '.' . $p64;
        $expected = base64url_encode(hash_hmac('sha256', $signingInput, $secret, true));

        if (!hash_equals($expected, $s64)) {
            throw new RuntimeException('Invalid token.');
        }

        $payload = json_decode(base64url_decode($p64), true);
        if (!is_array($payload)) {
            throw new RuntimeException('Invalid token.');
        }

        if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
            throw new RuntimeException('Token expired.');
        }

        return $payload;
    }

    /**
     * Require valid Bearer JWT and active user.
     * @return array{id:string,username:string,role:string,branchId:?string,ownerId:?string}
     */
    public static function requireUser(): array
    {
        if (self::$user !== null) {
            return self::$user;
        }

        $token = get_bearer_token();
        if (!$token) {
            json_error('Access denied. No token provided.', 401);
        }

        try {
            $decoded = self::verifyToken($token);
        } catch (Throwable $e) {
            json_error('Invalid token.', 401);
        }

        $id = $decoded['id'] ?? null;
        if (!$id) {
            json_error('Invalid token.', 401);
        }

        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $needsDbCheck = !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);

        $ownerId = isset($decoded['ownerId']) && $decoded['ownerId'] !== ''
            ? (string) $decoded['ownerId']
            : null;
        $role = (string) ($decoded['role'] ?? '');

        if ($needsDbCheck) {
            $pdo = Database::pdo();
            $stmt = $pdo->prepare('SELECT id, is_active, owner_id, role FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $dbUser = $stmt->fetch();

            if (!$dbUser || !(int) $dbUser['is_active']) {
                json_error('Your session user has been deleted. Please login again.', 401);
            }
            if (!$ownerId) {
                $ownerId = !empty($dbUser['owner_id'])
                    ? (string) $dbUser['owner_id']
                    : (($dbUser['role'] ?? '') === 'OWNER' ? (string) $id : null);
            }
            $role = (string) ($dbUser['role'] ?? $role);
        } elseif (!$ownerId) {
            // Old tokens without ownerId: OWNER is self; staff need DB
            if ($role === 'OWNER') {
                $ownerId = (string) $id;
            } else {
                $pdo = Database::pdo();
                $stmt = $pdo->prepare('SELECT owner_id, role FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$id]);
                $dbUser = $stmt->fetch();
                if ($dbUser && !empty($dbUser['owner_id'])) {
                    $ownerId = (string) $dbUser['owner_id'];
                } elseif ($dbUser && ($dbUser['role'] ?? '') === 'OWNER') {
                    $ownerId = (string) $id;
                }
            }
        }

        if (!$ownerId && $role === 'OWNER') {
            $ownerId = (string) $id;
        }

        self::$user = [
            'id' => (string) $decoded['id'],
            'username' => (string) ($decoded['username'] ?? ''),
            'role' => $role,
            'branchId' => isset($decoded['branchId']) && $decoded['branchId'] !== ''
                ? (string) $decoded['branchId']
                : null,
            'ownerId' => $ownerId,
        ];

        return self::$user;
    }

    public static function restrictTo(string ...$roles): void
    {
        $user = self::requireUser();
        if (!in_array($user['role'], $roles, true)) {
            json_error('You do not have permission to perform this action.', 403);
        }
    }

    public static function ownerId(): string
    {
        return Tenant::ownerId();
    }
}
