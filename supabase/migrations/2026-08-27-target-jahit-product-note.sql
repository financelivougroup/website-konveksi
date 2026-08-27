-- Product Note identifies which production/restock a planning and target detail belongs to.
-- Nullable preserves legacy rows that cannot be backfilled reliably.

ALTER TABLE public.planning_produksi
  ADD COLUMN IF NOT EXISTS product_note TEXT;

ALTER TABLE public.target_jahit_detail
  ADD COLUMN IF NOT EXISTS product_note TEXT;
