-- Seed verifikasi visual — Monitor Kinerja Produksi.
--
-- BELUM DIJALANKAN. Skrip ini menulis data contoh ke database, jadi jalankan
-- hanya setelah disetujui. Bentuknya mengikuti target di brief:
--   Arief Budiman  115 / 164 pcs  = 70%
--   Tim            443 / 600 pcs  = 74%
--
-- Semua baris ditandai `input_by = 'seed-kpi'` supaya bisa dihapus kembali
-- dengan aman tanpa menyentuh data asli:
--
--   delete from public.sewing_records    where input_by = 'seed-kpi';
--   delete from public.finishing_records where input_by = 'seed-kpi';
--   delete from public.target_jahit      where id in (select id from ... ) -- lihat blok akhir
--   delete from public.work_orders       where id like 'WO-KPI-%';
--   delete from public.production_orders where id like 'PO-KPI-%';

begin;

-- ---------------------------------------------------------------------------
-- Order + harga lengkap (trigger entry mensyaratkan 8 komponen harga)
-- ---------------------------------------------------------------------------
insert into public.production_orders (id, product_note, product, brand, status)
values ('PO-KPI-1', 'KPI-SEED', 'Gamis Aisyah', 'SeedBrand', 'PROGRESS');

insert into public.production_order_prices (id, production_order_id, total_per_piece)
values ('22222222-2222-2222-2222-222222222222', 'PO-KPI-1', 72000);

insert into public.production_order_price_components
  (order_price_id, component_key, label, amount_per_piece, sort_order)
select '22222222-2222-2222-2222-222222222222', k, k, v, i
from unnest(
  array['potong','jahit','obras','finishing','operational','material_basic','margin','jasa_pasang_kancing'],
  array[3000, 10000, 3000, 3000, 10000, 30000, 10000, 3000]
) with ordinality as t(k, v, i);

insert into public.work_orders (id, work_code, product, brand, quantity, source_order_id)
values ('WO-KPI-1', 'WO/KPI/1', 'Gamis Aisyah', 'SeedBrand', 600, 'PO-KPI-1');

-- ---------------------------------------------------------------------------
-- Target bulanan.
--
-- Target tim JAHIT = 600 pcs (sesuai brief 443/600 = 74%):
--   penjahit 550 + leader 50. Target finishing (200+150) sengaja terpisah dan
--   TIDAK ikut gauge tim, karena gauge dihitung dari pcs sewing.
-- ---------------------------------------------------------------------------
insert into public.target_jahit ("bulanTahun", nama, posisi, target_monthly)
values
  ('2026-10', 'Arief Budiman',    'Penjahit', 164),
  ('2026-10', 'Suwati',           'Penjahit', 120),
  ('2026-10', 'Umul Munfaridah',  'Penjahit', 100),
  ('2026-10', 'Asmeriani Bulolo', 'Penjahit',  96),
  ('2026-10', 'Fajar Budiman',    'Penjahit',  70),
  ('2026-10', 'Iman',             'Leader',    50),
  ('2026-10', 'Azrul',            'Finishing', 200),
  ('2026-10', 'Ince',             'Finishing', 150);

-- ---------------------------------------------------------------------------
-- Realisasi penjahit — total 443 pcs
--   Arief 115 (70%), Suwati 90, Umul 78, Asmeriani 70, Fajar 50, Iman 40
-- ---------------------------------------------------------------------------
insert into public.sewing_records (id, work_order_id, work_code, pic_penjahit, qty_selesai, tgl_laporan, input_by)
select
  'SR-KPI-' || row_number() over (),
  'WO-KPI-1', 'WO/KPI/1', nama, qty, tanggal, 'seed-kpi'
from (values
  ('Arief Budiman',    40, '2026-10-02'::date),
  ('Arief Budiman',    35, '2026-10-06'::date),
  ('Arief Budiman',    40, '2026-10-12'::date),
  ('Suwati',           50, '2026-10-03'::date),
  ('Suwati',           40, '2026-10-10'::date),
  ('Umul Munfaridah',  38, '2026-10-05'::date),
  ('Umul Munfaridah',  40, '2026-10-13'::date),
  ('Asmeriani Bulolo', 70, '2026-10-07'::date),
  ('Fajar Budiman',    50, '2026-10-09'::date),
  ('Iman',             40, '2026-10-14'::date)
) as t(nama, qty, tanggal);

-- ---------------------------------------------------------------------------
-- Realisasi finishing — sengaja lebih kecil dari sewing (WIP)
-- ---------------------------------------------------------------------------
insert into public.finishing_records
  (id, work_order_id, qty_finishing, tgl_import, pic_finishing, input_by, sync_status, source)
values
  ('FR-KPI-1', 'WO-KPI-1', 120, '2026-10-08', 'Azrul', 'seed-kpi', 'OK', 'manual'),
  ('FR-KPI-2', 'WO-KPI-1',  90, '2026-10-13', 'Ince',  'seed-kpi', 'OK', 'manual');

-- ---------------------------------------------------------------------------
-- HPP target per pcs (angka contoh; ganti sesuai biaya Anda)
-- ---------------------------------------------------------------------------
insert into public.target_biaya (divisi, bulan, target_per_pcs)
values
  ('penjahit',  '2026-10-01', 10000),
  ('leader',    '2026-10-01',  3000),
  ('finishing', '2026-10-01',  3000),
  ('total',     '2026-10-01', 16000)
on conflict (divisi, bulan) do update set target_per_pcs = excluded.target_per_pcs;

commit;
