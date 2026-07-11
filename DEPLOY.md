# Deploy MZK POS on InfinityFree (PHP + MySQL)

## 1. Security

1. **Change your MySQL password** in the InfinityFree panel (credentials shared in chat are compromised).
2. Never commit `api/config.php`.

## 2. Create database

1. InfinityFree → MySQL Databases → create DB (e.g. `if0_42388904_pos`).
2. Note exact **hostname** (`sqlXXX.infinityfree.com`), **database name**, **username**, **password**.
3. Open **phpMyAdmin** → select database → Import:
   - `api/sql/schema.sql`
   - then `api/sql/seed.sql`

Default login after seed: **`admin` / `admin123`** — change immediately.

## 3. Configure API on server

Create `api/config.php` (FTP or File Manager) from `api/config.sample.php`:

```php
<?php
return [
  'db_host' => 'sqlXXX.infinityfree.com',
  'db_name' => 'if0_42388904_XXXX',
  'db_user' => 'if0_42388904',
  'db_pass' => 'YOUR_ROTATED_PASSWORD',
  'db_port' => 3306,
  'db_charset' => 'utf8mb4',
  'jwt_secret' => 'paste-a-long-random-string-here',
  'jwt_ttl_seconds' => 86400,
  'app_env' => 'production',
  'app_name' => 'MZK POS',
  'uploads_dir' => null,
  'backups_dir' => null,
];
```

## 4. Build frontend

```bash
cd frontend
npm install
# production API is same origin (empty base URL)
npm run build
```

## 5. Upload to `htdocs` / `public_html`

Upload structure:

```
htdocs/
  index.html          ← from frontend/dist/
  assets/             ← from frontend/dist/assets/
  icons/ … favicon…
  .htaccess           ← copy from repo root file public_htaccess
  uploads/            ← empty, writable (include uploads/.htaccess)
  api/                ← entire api/ folder (with config.php)
```

Do **not** upload `node_modules`, `backend/`, or Electron `release/`.

## 6. Smoke test

1. Open `https://YOUR-DOMAIN/api/health` → `{"status":"healthy",...}`
2. Open `https://YOUR-DOMAIN/` → login screen
3. Login `admin` / `admin123`
4. Change password via Settings / Users

## 7. Local PHP testing (optional)

```bash
# With local MySQL matching config.php
cp api/config.sample.php api/config.php
# edit credentials → import schema + seed

php -S localhost:8080 router-dev.php
```

Point frontend:

```bash
cd frontend
VITE_API_URL=http://localhost:8080 npm run dev
```

## Current API status

| Module | Status |
|--------|--------|
| Health, Auth (login/me/users/branches), Settings, SQL backup list/create/download | **Ready (Phase 1)** |
| Products, inventory | Phase 2 (stubs return 501) |
| Sales / EMI / returns | Phase 3 |
| Accounting | Phase 4 |
| Reports / repairs | Phase 5 |
