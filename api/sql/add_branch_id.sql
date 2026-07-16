-- ============================================================
-- MIGRATION: Add branch_id to shared tables for branch-scoped data
-- Run this entire file in phpMyAdmin (SQL tab) or via MySQL CLI
-- ============================================================

-- 1. Add branch_id column to tables that were shared across stores
ALTER TABLE categories ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE brands    ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE customers ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE suppliers ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE products  ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;

-- 2. Backfill existing records to your default store
--    Replace 'YOUR_DEFAULT_BRANCH_ID' with your first store's ID
--    You can find it by running: SELECT id, name FROM branches;
UPDATE categories SET branch_id = 'YOUR_DEFAULT_BRANCH_ID' WHERE branch_id IS NULL;
UPDATE brands    SET branch_id = 'YOUR_DEFAULT_BRANCH_ID' WHERE branch_id IS NULL;
UPDATE customers SET branch_id = 'YOUR_DEFAULT_BRANCH_ID' WHERE branch_id IS NULL;
UPDATE suppliers SET branch_id = 'YOUR_DEFAULT_BRANCH_ID' WHERE branch_id IS NULL;
UPDATE products  SET branch_id = 'YOUR_DEFAULT_BRANCH_ID' WHERE branch_id IS NULL;
