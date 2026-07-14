-- ============================================================
-- Website Konveksi — Complete Supabase Schema
-- Copy & paste ke Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ihmhxacmvvsqtnylnwrs/sql/new
-- ============================================================

-- 1. production_orders (Order entry sebelum masuk pipeline)
CREATE TABLE IF NOT EXISTS production_orders (
  id TEXT PRIMARY KEY,
  work_code TEXT NOT NULL,
  product_note TEXT,
  product TEXT NOT NULL,
  information_variation TEXT,
  warna TEXT,
  size TEXT,
  brand TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PLANNING',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pulled_at TIMESTAMPTZ,
  pulled_by TEXT
);

-- 2. work_orders (Work order di dalam pipeline)
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  work_code TEXT NOT NULL,
  source_order_id TEXT REFERENCES production_orders(id),
  product_note TEXT,
  product_note_full TEXT,
  product TEXT NOT NULL,
  product_id TEXT,
  variation_id TEXT,
  information_variation TEXT,
  warna TEXT,
  size TEXT,
  brand TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  prod_status TEXT NOT NULL DEFAULT 'CUTTING_PENDING',
  invoice_status TEXT NOT NULL DEFAULT 'NONE',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pulled_at TIMESTAMPTZ
);

-- 3. cutting_records (Single-shot per WO, locked)
CREATE TABLE IF NOT EXISTS cutting_records (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  total_cutting INTEGER NOT NULL,
  sisa_cutting INTEGER DEFAULT 0,
  input_by TEXT,
  input_at TIMESTAMPTZ DEFAULT NOW(),
  locked BOOLEAN DEFAULT TRUE
);

-- 4. sewing_records (Unlimited log per WO)
CREATE TABLE IF NOT EXISTS sewing_records (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  work_code TEXT,
  pic_penjahit TEXT NOT NULL,
  qty_selesai INTEGER NOT NULL,
  tgl_laporan DATE NOT NULL,
  input_by TEXT,
  input_at TIMESTAMPTZ DEFAULT NOW(),
  image_url TEXT,
  image_name TEXT
);

-- 5. finishing_records (Unlimited log per WO)
CREATE TABLE IF NOT EXISTS finishing_records (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  qty_finishing INTEGER NOT NULL,
  tgl_import DATE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'manual',
  sync_status TEXT DEFAULT 'OK'
);

-- 6. invoices (Invoice per WO)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  work_code TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'WAITING_INVOICE',
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

-- 7. payments (Payment installments per invoice)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount NUMERIC NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  received_by TEXT,
  method TEXT,
  note TEXT
);

-- 8. audit_logs (Admin override history)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  phase TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT
);

-- 9. master_products
CREATE TABLE IF NOT EXISTS master_products (
  id SERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product TEXT NOT NULL,
  category TEXT,
  status_product TEXT DEFAULT 'Aktif',
  warning_stock TEXT
);

-- 10. raw_product_monitoring
CREATE TABLE IF NOT EXISTS raw_product_monitoring (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product TEXT NOT NULL,
  warna TEXT,
  size TEXT,
  available_quantity INTEGER DEFAULT 0,
  status_stock_final TEXT,
  sisa_cutting INTEGER DEFAULT 0,
  prioritas_dalam_proses TEXT,
  prioritas_tunggu_prdn TEXT,
  prioritas_tunggu_whlb TEXT,
  brand TEXT,
  source TEXT
);

-- 11. master_imports
CREATE TABLE IF NOT EXISTS master_imports (
  id SERIAL PRIMARY KEY,
  supplier TEXT NOT NULL,
  note TEXT,
  source_product TEXT,
  product_id TEXT,
  kode_produksi TEXT,
  status TEXT DEFAULT 'Diterima',
  received_at DATE
);

-- 12. target_jahit
CREATE TABLE IF NOT EXISTS target_jahit (
  id SERIAL PRIMARY KEY,
  bulan_tahun TEXT NOT NULL,
  nama TEXT NOT NULL,
  posisi TEXT,
  salary NUMERIC DEFAULT 0,
  total_hari_kerja INTEGER DEFAULT 0,
  hari_kerja_hari_ini INTEGER DEFAULT 0,
  sisa_hari INTEGER DEFAULT 0,
  target_daily NUMERIC DEFAULT 0,
  target_ngebut_hari NUMERIC DEFAULT 0,
  target_monthly NUMERIC DEFAULT 0,
  realisasi_monthly NUMERIC DEFAULT 0,
  sisa_target_monthly NUMERIC DEFAULT 0,
  progress_monthly NUMERIC DEFAULT 0,
  status_final TEXT,
  target_cost_posisi NUMERIC DEFAULT 0,
  realisasi_cost_posisi NUMERIC DEFAULT 0,
  target_accum NUMERIC DEFAULT 0,
  realisasi_accum NUMERIC DEFAULT 0,
  selisih_accum NUMERIC DEFAULT 0,
  target_ngebut_hari_akumulasi NUMERIC DEFAULT 0,
  progress_accum NUMERIC DEFAULT 0,
  status_final_akumulasi TEXT
);

-- 13. register_penjahit
CREATE TABLE IF NOT EXISTS register_penjahit (
  id SERIAL PRIMARY KEY,
  pic_penjahit TEXT NOT NULL,
  konveksi_team TEXT,
  status TEXT DEFAULT 'Aktif'
);

-- 14. daftar_libur
CREATE TABLE IF NOT EXISTS daftar_libur (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  hari TEXT,
  keterangan TEXT
);

-- 15. selesai_jahit
CREATE TABLE IF NOT EXISTS selesai_jahit (
  id SERIAL PRIMARY KEY,
  work_code TEXT NOT NULL,
  product TEXT NOT NULL,
  warna TEXT,
  size TEXT,
  brand TEXT,
  total_selesai_jahit INTEGER DEFAULT 0,
  pic_penjahit TEXT,
  tanggal_laporan DATE,
  bulan_tahun TEXT,
  tanggal TEXT,
  bukti_barang TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_work_orders_prod_status ON work_orders(prod_status);
CREATE INDEX IF NOT EXISTS idx_work_orders_source ON work_orders(source_order_id);
CREATE INDEX IF NOT EXISTS idx_cutting_records_wo ON cutting_records(work_order_id);
CREATE INDEX IF NOT EXISTS idx_sewing_records_wo ON sewing_records(work_order_id);
CREATE INDEX IF NOT EXISTS idx_finishing_records_wo ON finishing_records(work_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_wo ON invoices(work_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_inv ON payments(invoice_id);

-- ============================================================
-- Migration: 2026-07-13-register-po-and-auto-invoice.sql
-- ============================================================

-- 1) Register PO master
CREATE TABLE IF NOT EXISTS register_po (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL UNIQUE
    REFERENCES production_orders(id) ON DELETE CASCADE,
  rate_manpower INTEGER NOT NULL DEFAULT 30000
    CHECK (rate_manpower >= 0),
  total_per_pcs INTEGER NOT NULL DEFAULT 30000
    CHECK (total_per_pcs >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Register PO components (flexible, no migration to add)
CREATE TABLE IF NOT EXISTS register_po_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_po_id UUID NOT NULL
    REFERENCES register_po(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
    CHECK (value >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (register_po_id, key)
);

CREATE INDEX IF NOT EXISTS idx_rpo_components_register_po_id
  ON register_po_components(register_po_id);

-- 3) Trigger: keep total_per_pcs in sync
CREATE OR REPLACE FUNCTION recompute_register_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE register_po
  SET total_per_pcs = (
    SELECT COALESCE(SUM(value), 0) + register_po.rate_manpower
    FROM register_po_components
    WHERE register_po_id = COALESCE(NEW.register_po_id, OLD.register_po_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.register_po_id, OLD.register_po_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_register_po_total ON register_po_components;
CREATE TRIGGER trg_recompute_register_po_total
AFTER INSERT OR UPDATE OR DELETE ON register_po_components
FOR EACH ROW EXECUTE FUNCTION recompute_register_po_total();

-- Also recompute when rate_manpower changes
DROP TRIGGER IF EXISTS trg_recompute_register_po_total_rate ON register_po;
CREATE TRIGGER trg_recompute_register_po_total_rate
AFTER UPDATE OF rate_manpower ON register_po
FOR EACH ROW EXECUTE FUNCTION recompute_register_po_total();

-- 4) Modify invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS register_po_id UUID
    REFERENCES register_po(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE invoices
  DROP COLUMN IF EXISTS pcs_manual,
  DROP COLUMN IF EXISTS pcs_balance_status,
  DROP COLUMN IF EXISTS pcs_difference,
  DROP COLUMN IF EXISTS rate_manpower;

-- Ensure billing_type has CHECK constraint (allow existing rows; default 'mass_production')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices' AND constraint_name = 'invoices_billing_type_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_billing_type_check
      CHECK (billing_type IN ('mass_production', 'sample_production'));
  END IF;
END$$;

-- 5) work_orders.production_order_id link
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS production_order_id UUID
    REFERENCES production_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_production_order_id
  ON work_orders(production_order_id);

