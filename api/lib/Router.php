<?php

declare(strict_types=1);

final class Router
{
    /** @var list<array{method:string,pattern:string,handler:callable,public:bool,roles:?list<string>}> */
    private array $routes = [];

    public function add(
        string $method,
        string $pattern,
        callable $handler,
        bool $public = false,
        ?array $roles = null
    ): void {
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => trim($pattern, '/'),
            'handler' => $handler,
            'public' => $public,
            'roles' => $roles,
        ];
    }

    public function get(string $pattern, callable $handler, bool $public = false, ?array $roles = null): void
    {
        $this->add('GET', $pattern, $handler, $public, $roles);
    }

    public function post(string $pattern, callable $handler, bool $public = false, ?array $roles = null): void
    {
        $this->add('POST', $pattern, $handler, $public, $roles);
    }

    public function put(string $pattern, callable $handler, bool $public = false, ?array $roles = null): void
    {
        $this->add('PUT', $pattern, $handler, $public, $roles);
    }

    public function delete(string $pattern, callable $handler, bool $public = false, ?array $roles = null): void
    {
        $this->add('DELETE', $pattern, $handler, $public, $roles);
    }

    public function patch(string $pattern, callable $handler, bool $public = false, ?array $roles = null): void
    {
        $this->add('PATCH', $pattern, $handler, $public, $roles);
    }

    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);
        $path = trim($path, '/');

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            $params = $this->match($route['pattern'], $path);
            if ($params === null) {
                continue;
            }

            if (!$route['public']) {
                Auth::requireUser();
                if ($route['roles'] !== null) {
                    Auth::restrictTo(...$route['roles']);
                }
            }

            ($route['handler'])($params);
            return;
        }

        json_error('Not found.', 404);
    }

    /**
     * @return array<string,string>|null
     */
    private function match(string $pattern, string $path): ?array
    {
        if ($pattern === $path) {
            return [];
        }

        $regex = preg_replace('#:([a-zA-Z_][a-zA-Z0-9_]*)#', '(?P<$1>[^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';

        if (!preg_match($regex, $path, $m)) {
            return null;
        }

        $params = [];
        foreach ($m as $k => $v) {
            if (!is_int($k)) {
                $params[$k] = rawurldecode((string) $v);
            }
        }
        return $params;
    }
}
