-- Add benefit_per_pcs column to target_jahit table
-- This field stores the benefit rate per extra piece produced above monthly target
-- Default NULL means no benefit set until owner/finance configures it

ALTER TABLE public.target_jahit
ADD COLUMN benefit_per_pcs DECIMAL(10,2) DEFAULT NULL;

-- No backfill needed - existing rows will have NULL (no benefit by default)
