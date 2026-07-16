-- Run these in phpMyAdmin to add branch_id to shared tables
ALTER TABLE categories ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE brands ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE customers ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE suppliers ADD COLUMN branch_id CHAR(36) NULL AFTER owner_id;
