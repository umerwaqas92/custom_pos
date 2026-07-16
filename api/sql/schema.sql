-- MZK POS — MySQL schema (InfinityFree / shared hosting)
-- Import via phpMyAdmin. Charset: utf8mb4
-- Tables use snake_case; PHP API maps to camelCase JSON for the React frontend.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS sale_return_items;
DROP TABLE IF EXISTS sale_returns;
DROP TABLE IF EXISTS emi_installments;
DROP TABLE IF EXISTS sale_emis;
DROP TABLE IF EXISTS warranty_claims;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS repair_jobs;
DROP TABLE IF EXISTS purchase_items;
DROP TABLE IF EXISTS supplier_payments;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS branch_stocks;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS customer_credit_payments;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS bank_accounts;
DROP TABLE IF EXISTS daily_closings;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE branches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  phone VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  branch_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_branch (branch_id),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE brands (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_brands_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  owner_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  owner_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  reward_points INT NOT NULL DEFAULT 0,
  credit_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100) NULL,
  qr_code VARCHAR(100) NULL,
  category_id CHAR(36) NULL,
  brand_id CHAR(36) NULL,
  model VARCHAR(255) NULL,
  serial_number VARCHAR(255) NULL,
  imei VARCHAR(64) NULL,
  color VARCHAR(64) NULL,
  storage VARCHAR(64) NULL,
  ram VARCHAR(64) NULL,
  processor VARCHAR(128) NULL,
  warranty_months INT NOT NULL DEFAULT 0,
  supplier_id CHAR(36) NULL,
  owner_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  purchase_price DECIMAL(14,2) NOT NULL,
  selling_price DECIMAL(14,2) NOT NULL,
  wholesale_price DECIMAL(14,2) NULL,
  tax_rate DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  discount_rate DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
  images TEXT NOT NULL,
  description TEXT NULL,
  weight DOUBLE NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 5,
  type VARCHAR(32) NOT NULL DEFAULT 'SINGLE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_sku (sku),
  UNIQUE KEY uq_products_barcode (barcode),
  UNIQUE KEY uq_products_qr (qr_code),
  KEY idx_products_category (category_id),
  KEY idx_products_brand (brand_id),
  KEY idx_products_supplier (supplier_id),
  KEY idx_products_name (name),
  KEY idx_products_stock (stock_quantity),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE branch_stocks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  branch_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_branch_product (branch_id, product_id),
  KEY idx_bs_branch (branch_id),
  KEY idx_bs_product (product_id),
  CONSTRAINT fk_bs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  supplier_id CHAR(36) NOT NULL,
  order_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(14,2) NOT NULL,
  notes TEXT NULL,
  attachment_path VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_supplier (supplier_id),
  KEY idx_po_status (status),
  KEY idx_po_date (order_date),
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  purchase_order_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL,
  cost_price DECIMAL(14,2) NOT NULL,
  KEY idx_pi_po (purchase_order_id),
  KEY idx_pi_product (product_id),
  CONSTRAINT fk_pi_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NULL,
  cashier_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  sale_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(14,2) NOT NULL,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payable_amount DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  payment_status VARCHAR(32) NOT NULL,
  return_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sales_customer (customer_id),
  KEY idx_sales_cashier (cashier_id),
  KEY idx_sales_branch (branch_id),
  KEY idx_sales_date (sale_date),
  KEY idx_sales_return (return_status),
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_cashier FOREIGN KEY (cashier_id) REFERENCES users(id),
  CONSTRAINT fk_sales_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(14,2) NOT NULL,
  serial_number VARCHAR(255) NULL,
  imei VARCHAR(64) NULL,
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (product_id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE repair_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  device_name VARCHAR(255) NOT NULL,
  imei VARCHAR(64) NULL,
  serial_number VARCHAR(255) NULL,
  customer_id CHAR(36) NOT NULL,
  fault_description TEXT NOT NULL,
  technician_id CHAR(36) NULL,
  parts_used TEXT NULL,
  repair_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  service_charge DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  estimated_delivery DATETIME NULL,
  notes TEXT NULL,
  photos TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rj_customer (customer_id),
  KEY idx_rj_tech (technician_id),
  KEY idx_rj_status (status),
  KEY idx_rj_created (created_at),
  CONSTRAINT fk_rj_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_rj_tech FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE warranty_claims (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  claim_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  resolution_details TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_wc_sale (sale_id),
  KEY idx_wc_product (product_id),
  KEY idx_wc_status (status),
  KEY idx_wc_date (claim_date),
  CONSTRAINT fk_wc_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_wc_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_movements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  branch_id CHAR(36) NULL,
  reference_id CHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sm_product (product_id),
  KEY idx_sm_branch (branch_id),
  KEY idx_sm_created (created_at),
  CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category VARCHAR(128) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT NULL,
  payment_method VARCHAR(32) NOT NULL,
  attachment VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exp_date (date),
  KEY idx_exp_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_credit_payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(32) NOT NULL,
  notes TEXT NULL,
  KEY idx_ccp_customer (customer_id),
  KEY idx_ccp_date (payment_date),
  CONSTRAINT fk_ccp_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  supplier_id CHAR(36) NOT NULL,
  purchase_order_id CHAR(36) NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(32) NOT NULL,
  notes TEXT NULL,
  KEY idx_sp_supplier (supplier_id),
  KEY idx_sp_po (purchase_order_id),
  KEY idx_sp_date (payment_date),
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_sp_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_al_user (user_id),
  KEY idx_al_created (created_at),
  CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bank_accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL,
  account_number VARCHAR(128) NULL,
  bank_name VARCHAR(255) NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  bank_account_id CHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL,
  category VARCHAR(64) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reference_type VARCHAR(64) NULL,
  reference_id CHAR(36) NULL,
  description TEXT NULL,
  branch_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tx_account (bank_account_id),
  KEY idx_tx_branch (branch_id),
  KEY idx_tx_created (created_at),
  CONSTRAINT fk_tx_account FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  closing_date DATETIME NOT NULL,
  branch_id CHAR(36) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_sales DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_expenses DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_returns DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cash_in DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cash_out DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  expected_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  actual_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  variance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  notes TEXT NULL,
  closed_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_closing_date (closing_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_emis (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_id CHAR(36) NOT NULL,
  guarantor_name VARCHAR(255) NOT NULL,
  guarantor_phone VARCHAR(64) NOT NULL,
  guarantor_address TEXT NOT NULL,
  cnic_front_path VARCHAR(512) NOT NULL,
  cnic_back_path VARCHAR(512) NOT NULL,
  cheque_path VARCHAR(512) NOT NULL,
  months INT NOT NULL,
  interest_rate DECIMAL(8,4) NOT NULL,
  down_payment DECIMAL(14,2) NOT NULL,
  total_principal DECIMAL(14,2) NOT NULL,
  monthly_payment DECIMAL(14,2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sale_emi_sale (sale_id),
  CONSTRAINT fk_sale_emi_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE emi_installments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_emi_id CHAR(36) NOT NULL,
  installment_number INT NOT NULL,
  due_date DATETIME NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_date DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_emi_inst_sale (sale_emi_id),
  CONSTRAINT fk_emi_inst FOREIGN KEY (sale_emi_id) REFERENCES sale_emis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  `key` VARCHAR(128) NOT NULL,
  value TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_settings_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_returns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_id CHAR(36) NOT NULL,
  processed_by_id CHAR(36) NOT NULL,
  return_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refund_amount DECIMAL(14,2) NOT NULL,
  refund_method VARCHAR(32) NOT NULL,
  reason TEXT NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sr_sale (sale_id),
  KEY idx_sr_user (processed_by_id),
  KEY idx_sr_date (return_date),
  KEY idx_sr_status (status),
  CONSTRAINT fk_sr_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_sr_user FOREIGN KEY (processed_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_return_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sale_return_id CHAR(36) NOT NULL,
  sale_item_id CHAR(36) NULL,
  product_id CHAR(36) NOT NULL,
  quantity INT NOT NULL,
  unit_refund DECIMAL(14,2) NOT NULL,
  total_refund DECIMAL(14,2) NOT NULL,
  reason TEXT NULL,
  KEY idx_sri_return (sale_return_id),
  KEY idx_sri_product (product_id),
  KEY idx_sri_item (sale_item_id),
  CONSTRAINT fk_sri_return FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sri_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
