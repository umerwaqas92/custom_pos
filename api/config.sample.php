<?php
/**
 * Copy this file to config.php and fill in InfinityFree (or local) MySQL details.
 * config.php is gitignored and blocked from web access via .htaccess.
 */
return [
    // From InfinityFree MySQL panel — host is NOT localhost
    'db_host' => 'sqlXXX.infinityfree.com',
    'db_name' => 'if0_42388904_pos',
    'db_user' => 'if0_42388904',
    'db_pass' => 'CHANGE_ME',
    'db_port' => 3306,
    'db_charset' => 'utf8mb4',

    // Long random string — change for production
    'jwt_secret' => 'change-this-to-a-long-random-secret',
    'jwt_ttl_seconds' => 86400, // 24h

    'app_env' => 'production', // development | production
    'app_name' => 'MZK POS',

    // Absolute or relative to project root (parent of /api)
    'uploads_dir' => null, // default: ../uploads
    'backups_dir' => null, // default: api/backups
];
