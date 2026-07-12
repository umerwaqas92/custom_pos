-- Fresh-start seed for MZK POS
-- Default login: admin / admin123  (change immediately after first login)

SET NAMES utf8mb4;

-- Fixed UUIDs so re-import is predictable
SET @branch_id = 'a1000000-0000-4000-8000-000000000001';
SET @user_id   = 'a2000000-0000-4000-8000-000000000001';
SET @cash_id   = 'a3000000-0000-4000-8000-000000000001';
SET @bank_id   = 'a3000000-0000-4000-8000-000000000002';

INSERT INTO branches (id, name, address, phone)
VALUES (
  @branch_id,
  'Default Store',
  'Main Street',
  NULL
) ON DUPLICATE KEY UPDATE name = VALUES(name);

-- password: admin123  (bcrypt)
INSERT INTO users (id, name, username, password_hash, role, email, phone, is_active, branch_id)
VALUES (
  @user_id,
  'Owner',
  'admin',
  '$2y$12$1q7g9f6SMCJ8uiYjEMN4/.qTSPXxk0wziywN1f5xsxbcYkKVOE/5y',
  'OWNER',
  NULL,
  NULL,
  1,
  @branch_id
) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1;

INSERT INTO bank_accounts (id, name, type, account_number, bank_name, balance, is_active, notes)
VALUES
  (@cash_id, 'Cash Drawer', 'CASH', NULL, NULL, 0.00, 1, 'Default cash account'),
  (@bank_id, 'Main Bank', 'BANK', NULL, NULL, 0.00, 1, 'Default bank account')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO system_settings (id, `key`, value)
VALUES
  (UUID(), 'shopName', 'MZK POS'),
  (UUID(), 'currency', 'PKR'),
  (UUID(), 'gstEnabled', 'false'),
  (UUID(), 'gstRate', '0'),
  (UUID(), 'receiptFooter', 'Thank you for your business!')
ON DUPLICATE KEY UPDATE value = VALUES(value);
