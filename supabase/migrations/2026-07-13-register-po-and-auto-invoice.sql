-- supabase/migrations/2026-07-13-register-po-and-auto-invoice.sql

-- ============================================================
-- 1) Register PO master
-- ============================================================
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

-- ============================================================
-- 2) Register PO components (flexible, no migration to add)
-- ============================================================
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

-- ============================================================
-- 3) Trigger: keep total_per_pcs in sync
-- ============================================================
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

-- ============================================================
-- 4) Modify invoices table
-- ============================================================
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

-- ============================================================
-- 5) work_orders.production_order_id link
-- ============================================================
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS production_order_id UUID
    REFERENCES production_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_production_order_id
  ON work_orders(production_order_id);