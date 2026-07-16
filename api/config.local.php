<?php
return [
    'db_host' => '127.0.0.1',
    'db_name' => 'mzk_pos',
    'db_user' => 'root',
    'db_pass' => '',
    'db_port' => 3306,
    'db_charset' => 'utf8mb4',

    'jwt_secret' => 'local-dev-secret-change-in-production',
    'jwt_ttl_seconds' => 86400,

    'app_env' => 'development',
    'app_name' => 'MZK POS',

    'uploads_dir' => null,
    'backups_dir' => null,
];
