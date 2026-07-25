-- ===== Clean slate for invoicing module =====
-- Run this BEFORE the main migration if you previously applied a partial version
-- and the tables exist without the expected columns.

drop table if exists public.invoice_payment_files cascade;
drop table if exists public.invoice_payments cascade;
drop table if exists public.invoices cascade;

delete from storage.buckets where id = 'invoice-payment-proofs';