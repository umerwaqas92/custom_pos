-- ============================================================
-- MIGRATION: Add branch_id to purchase_orders and expenses
-- Run this entire file in phpMyAdmin (SQL tab) or via MySQL CLI
-- ============================================================

ALTER TABLE purchase_orders ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE expenses       ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;

-- Backfill existing records: set branch_id from the owner's first branch
-- (adjust if you need a different default)
UPDATE purchase_orders po SET po.branch_id = (
  SELECT b.id FROM branches b WHERE b.owner_id = po.owner_id ORDER BY b.created_at ASC LIMIT 1
) WHERE po.branch_id IS NULL;
UPDATE expenses e SET e.branch_id = (
  SELECT b.id FROM branches b WHERE b.owner_id = e.owner_id ORDER BY b.created_at ASC LIMIT 1
) WHERE e.branch_id IS NULL;
