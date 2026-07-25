-- ===== Seed 1 FINISHING_COMPLETE Work Order for invoice testing =====
-- Run this AFTER the main migration has been applied.
-- This creates a parent production_order and a pulled work_order
-- so the invoice form has at least one eligible Work Order to pick.

insert into public.production_orders (
  id, product_note, product, information_variation,
  warna, size, brand, quantity, status,
  created_by, created_at
) values (
  'PO-TEST-001',
  'B-00',
  'Rue Top',
  'Colour: Black Size: M',
  'Black', 'M', 'Livou',
  100,
  'PULLED',
  'inventory',
  '2026-07-01'
) on conflict (id) do nothing;

insert into public.work_orders (
  id, work_code, source_order_id, product_note, product_note_full,
  product, product_id, variation_id, information_variation,
  warna, size, brand, quantity,
  prod_status, invoice_status,
  created_by, created_at, pulled_at
) values (
  'WO-TEST-001',
  'Produksi - Awal | Rue Top | Black | M',
  'PO-TEST-001',
  'B-00',
  'PDFF_CSC-TOP-01_B-00_PRDN',
  'Rue Top',
  'CSC-TOP-01',
  'CSC-TOP-01-BLK-M',
  'Colour: Black Size: M',
  'Black', 'M', 'Livou',
  100,
  'FINISHING_COMPLETE',
  'NONE',
  'inventory',
  '2026-07-01',
  '2026-07-01'
) on conflict (id) do nothing;