import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'

interface SeedStatus {
  table: string
  status: 'pending' | 'running' | 'ok' | 'error'
  message: string
}

const SEED_TABLES = [
  // Master data first (serial IDs)
  'master_products',
  'raw_product_monitoring',
  'master_imports',
  'register_penjahit',
  'daftar_libur',
  'target_jahit',
  // Pipeline tables (manual prefix IDs)
  'production_orders',
  'work_orders',
  'cutting_records',
  'sewing_records',
]

// Current mock data values, formatted for Supabase (snake_case columns)
const SEED_DATA: Record<string, Record<string, unknown>[]> = {
  master_products: [
    { brand: 'Cassca', product_id: 'CSC-001', product: 'Kaos Polos', category: 'Atasan', status_product: 'Aktif', warning_stock: '-' },
    { brand: 'Livou', product_id: 'LVU-002', product: 'Kemeja', category: 'Atasan', status_product: 'Aktif', warning_stock: 'Stok Menipis' },
    { brand: 'Cassca', product_id: 'CSC-003', product: 'Celana', category: 'Bawahan', status_product: 'Aktif', warning_stock: '-' },
    { brand: 'Livou', product_id: 'LVU-004', product: 'Dress', category: 'Atasan', status_product: 'Non-Aktif', warning_stock: '-' },
    { brand: 'Cassca', product_id: 'CSC-005', product: 'Jaket', category: 'Outer', status_product: 'Aktif', warning_stock: '-' },
  ],
  raw_product_monitoring: [
    { product_id: 'CSC-001', product: 'Kaos Polos', warna: 'Black', size: 'M', available_quantity: 5, status_stock_final: 'DALAM PROSES PRODUKSI', sisa_cutting: 20, prioritas_dalam_proses: '1', prioritas_tunggu_prdn: '-', prioritas_tunggu_whlb: '-', brand: 'Cassca', source: 'PRDN' },
    { product_id: 'LVU-002', product: 'Kemeja', warna: 'White', size: 'L', available_quantity: 2, status_stock_final: 'MENUNGGU KEPUTUSAN', sisa_cutting: 0, prioritas_dalam_proses: '-', prioritas_tunggu_prdn: '1', prioritas_tunggu_whlb: '-', brand: 'Livou', source: 'WHLB' },
    { product_id: 'CSC-003', product: 'Celana', warna: 'Navy', size: 'XL', available_quantity: 15, status_stock_final: 'DALAM PROSES PRODUKSI', sisa_cutting: 5, prioritas_dalam_proses: '2', prioritas_tunggu_prdn: '-', prioritas_tunggu_whlb: '-', brand: 'Cassca', source: 'PRDN' },
    { product_id: 'LVU-004', product: 'Dress', warna: 'Red', size: 'S', available_quantity: 8, status_stock_final: 'MENUNGGU KEPUTUSAN', sisa_cutting: 0, prioritas_dalam_proses: '-', prioritas_tunggu_prdn: '2', prioritas_tunggu_whlb: '-', brand: 'Livou', source: 'WHLB' },
  ],
  master_imports: [
    { supplier: 'PT Kain Jaya', note: 'ABC123 CSC-001-Black', source_product: 'CSC', product_id: 'CSC-001', kode_produksi: 'ABC123', status: 'Diterima', received_at: '2026-05-20' },
    { supplier: 'CV Benang', note: 'XYZ789 LVU-002-White', source_product: 'LVU', product_id: 'LVU-002', kode_produksi: 'XYZ789', status: 'Diterima', received_at: '2026-05-22' },
    { supplier: 'PT Kain Jaya', note: 'DEF456 CSC-003-Navy', source_product: 'CSC', product_id: 'CSC-003', kode_produksi: 'DEF456', status: 'Dalam Perjalanan', received_at: '-' },
  ],
  register_penjahit: [
    { pic_penjahit: 'Budi Santoso', konveksi_team: 'Budi', status: 'Aktif' },
    { pic_penjahit: 'Ani Wulandari', konveksi_team: 'Ani', status: 'Aktif' },
    { pic_penjahit: 'Caca', konveksi_team: 'Caca', status: 'Aktif' },
    { pic_penjahit: 'Dedi Kurniawan', konveksi_team: 'Dedi', status: 'Non-Aktif' },
  ],
  daftar_libur: [
    { tanggal: '2026-06-01', hari: 'Senin', keterangan: 'Hari Libur Nasional' },
    { tanggal: '2026-06-17', hari: 'Rabu', keterangan: 'Idul Fitri' },
    { tanggal: '2026-06-18', hari: 'Kamis', keterangan: 'Idul Fitri' },
  ],
  target_jahit: [
    { bulan_tahun: 'Juni 2026', nama: 'Budi Santoso', posisi: 'Penjahit', salary: 4000000, total_hari_kerja: 22, hari_kerja_hari_ini: 5, sisa_hari: 17, target_daily: 45, target_ngebut_hari: 52, target_monthly: 1000, realisasi_monthly: 850, sisa_target_monthly: 150, progress_monthly: 85, status_final: 'SEDANG MENGEJAR', target_cost_posisi: 4000, realisasi_cost_posisi: 4705, target_accum: 5000, realisasi_accum: 4500, selisih_accum: 500, target_ngebut_hari_akumulasi: 50, progress_accum: 90, status_final_akumulasi: 'SEDANG MENGEJAR' },
    { bulan_tahun: 'Juni 2026', nama: 'Ani Wulandari', posisi: 'Leader', salary: 8000000, total_hari_kerja: 22, hari_kerja_hari_ini: 5, sisa_hari: 17, target_daily: 90, target_ngebut_hari: 105, target_monthly: 2000, realisasi_monthly: 1800, sisa_target_monthly: 200, progress_monthly: 90, status_final: 'SEDANG MENGEJAR', target_cost_posisi: 4000, realisasi_cost_posisi: 4444, target_accum: 12000, realisasi_accum: 10800, selisih_accum: 1200, target_ngebut_hari_akumulasi: 75, progress_accum: 90, status_final_akumulasi: 'SEDANG MENGEJAR' },
    { bulan_tahun: 'Juni 2026', nama: 'Caca', posisi: 'Finishing', salary: 3500000, total_hari_kerja: 22, hari_kerja_hari_ini: 5, sisa_hari: 17, target_daily: 39, target_ngebut_hari: 46, target_monthly: 875, realisasi_monthly: 700, sisa_target_monthly: 175, progress_monthly: 80, status_final: 'SEDANG MENGEJAR', target_cost_posisi: 4000, realisasi_cost_posisi: 5000, target_accum: 3500, realisasi_accum: 2800, selisih_accum: 700, target_ngebut_hari_akumulasi: 58, progress_accum: 80, status_final_akumulasi: 'SEDANG MENGEJAR' },
  ],
}

// Pipeline seed data with full work code formula
const PO_DATA = [
  { work_code: 'Produksi - Awal | Rue Top | Black | M', product_note: 'B-00', product: 'Rue Top', information_variation: 'Colour: Black Size: M', warna: 'Black', size: 'M', brand: 'Cassca', quantity: 120, status: 'PULLED', created_by: 'inventory', created_at: '2026-06-01', pulled_at: '2026-06-02', pulled_by: 'inventory' },
  { work_code: 'Restock-01 | Rhea Top | White | L', product_note: 'B-01', product: 'Rhea Top', information_variation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 50, status: 'PULLED', created_by: 'inventory', created_at: '2026-06-03', pulled_at: '2026-06-04', pulled_by: 'inventory' },
  { work_code: 'Restock-02 | Rue Top | Navy | XL', product_note: 'B-02', product: 'Rue Top', information_variation: 'Colour: Navy Size: XL', warna: 'Navy', size: 'XL', brand: 'Cassca', quantity: 80, status: 'PULLED', created_by: 'inventory', created_at: '2026-06-05', pulled_at: '2026-06-06', pulled_by: 'inventory' },
  { work_code: 'Restock-03 | Aera Dress | Red | S', product_note: 'B-03', product: 'Aera Dress', information_variation: 'Colour: Red Size: S', warna: 'Red', size: 'S', brand: 'Livou', quantity: 60, status: 'PLANNING', created_by: 'inventory', created_at: '2026-06-10' },
  { work_code: 'Produksi - Awal | Miles Jacket | Grey | M', product_note: 'B-00', product: 'Miles Jacket', information_variation: 'Colour: Grey Size: M', warna: 'Grey', size: 'M', brand: 'Cassca', quantity: 200, status: 'PULLED', created_by: 'inventory', created_at: '2026-06-08', pulled_at: '2026-06-09', pulled_by: 'inventory' },
  { work_code: 'Restock-04 | Siena Blouse | Beige | L', product_note: 'B-04', product: 'Siena Blouse', information_variation: 'Colour: Beige Size: L', warna: 'Beige', size: 'L', brand: 'Cassca', quantity: 30, status: 'PLANNING', created_by: 'inventory', created_at: '2026-06-12' },
  { work_code: 'Produksi - Awal | Celana Chino | Navy | 32', product_note: 'B-00', product: 'Celana Chino', information_variation: 'Colour: Navy Size: 32', warna: 'Navy', size: '32', brand: 'Cassca', quantity: 100, status: 'PULLED', created_by: 'inventory', created_at: '2026-06-07', pulled_at: '2026-06-08', pulled_by: 'inventory' },
  { work_code: 'Restock-05 | Kaos Polos | White | L', product_note: 'B-05', product: 'Kaos Polos', information_variation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 150, status: 'PLANNING', created_by: 'inventory', created_at: '2026-06-15' },
]

const WO_DATA = [
  { work_code: 'Produksi - Awal | Rue Top | Black | M', source_order_id: 'PO-001', product_note: 'B-00', product: 'Rue Top', product_id: 'CSC-TOP-01', variation_id: 'CSC-TOP-01-BLK-M', information_variation: 'Colour: Black Size: M', warna: 'Black', size: 'M', brand: 'Cassca', quantity: 120, prod_status: 'FINISHED', invoice_status: 'WAITING_INVOICE', created_by: 'inventory', created_at: '2026-06-02', pulled_at: '2026-06-02' },
  { work_code: 'Restock-01 | Rhea Top | White | L', source_order_id: 'PO-002', product_note: 'B-01', product: 'Rhea Top', product_id: 'LVU-TOP-06', variation_id: 'LVU-TOP-06-WHT-L', information_variation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 50, prod_status: 'PROGRESS', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-04', pulled_at: '2026-06-04' },
  { work_code: 'Restock-02 | Rue Top | Navy | XL', source_order_id: 'PO-003', product_note: 'B-02', product: 'Rue Top', product_id: 'CSC-TOP-01', variation_id: 'CSC-TOP-01-NVY-XL', information_variation: 'Colour: Navy Size: XL', warna: 'Navy', size: 'XL', brand: 'Cassca', quantity: 80, prod_status: 'CUTTING', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-06', pulled_at: '2026-06-06' },
  { work_code: 'Produksi - Awal | Miles Jacket | Grey | M', source_order_id: 'PO-005', product_note: 'B-00', product: 'Miles Jacket', product_id: 'CSC-JKT-05', variation_id: 'CSC-JKT-05-GRY-M', information_variation: 'Colour: Grey Size: M', warna: 'Grey', size: 'M', brand: 'Cassca', quantity: 200, prod_status: 'PROGRESS', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-09', pulled_at: '2026-06-09' },
  { work_code: 'Produksi - Awal | Celana Chino | Navy | 32', source_order_id: 'PO-007', product_note: 'B-00', product: 'Celana Chino', product_id: 'CSC-PNT-07', variation_id: 'CSC-PNT-07-NVY-32', information_variation: 'Colour: Navy Size: 32', warna: 'Navy', size: '32', brand: 'Cassca', quantity: 100, prod_status: 'FINISHED', invoice_status: 'PAID', created_by: 'inventory', created_at: '2026-06-08', pulled_at: '2026-06-08' },
  { work_code: 'Restock-03 | Aera Dress | Red | S', source_order_id: 'PO-004', product_note: 'B-03', product: 'Aera Dress', product_id: 'LVU-DRS-04', variation_id: 'LVU-DRS-04-RED-S', information_variation: 'Colour: Red Size: S', warna: 'Red', size: 'S', brand: 'Livou', quantity: 60, prod_status: 'NEW', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-16' },
  { work_code: 'Restock-04 | Siena Blouse | Beige | L', source_order_id: 'PO-006', product_note: 'B-04', product: 'Siena Blouse', product_id: 'CSC-BLS-06', variation_id: 'CSC-BLS-06-BGE-L', information_variation: 'Colour: Beige Size: L', warna: 'Beige', size: 'L', brand: 'Cassca', quantity: 30, prod_status: 'NEW', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-16' },
  { work_code: 'Restock-05 | Kaos Polos | White | L', source_order_id: 'PO-008', product_note: 'B-05', product: 'Kaos Polos', product_id: 'LVU-TSH-08', variation_id: 'LVU-TSH-08-WHT-L', information_variation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 150, prod_status: 'NEW', invoice_status: 'NONE', created_by: 'inventory', created_at: '2026-06-16' },
]

export default function SeedPage() {
  const [statuses, setStatuses] = useState<SeedStatus[]>(
    SEED_TABLES.map((t) => ({ table: t, status: 'pending', message: 'Waiting...' }))
  )
  const [running, setRunning] = useState(false)

  async function clearAll() {
    const reverse = [...SEED_TABLES].reverse()
    for (const table of reverse) {
      const { error } = await supabase.from(table).delete().neq('id', -1)
      if (error) console.warn(`Clear ${table}:`, error.message)
    }
  }

  async function seed() {
    setRunning(true)
    setStatuses(SEED_TABLES.map((t) => ({ table: t, status: 'pending', message: 'Waiting...' })))

    // 1. Clear existing data
    await clearAll()

    // 2. Seed master data tables (serial IDs)
    for (const table of ['master_products', 'raw_product_monitoring', 'master_imports', 'register_penjahit', 'daftar_libur', 'target_jahit']) {
      const rows = SEED_DATA[table]
      if (!rows || rows.length === 0) {
        updateStatus(table, 'ok', `0 rows (empty)`)
        continue
      }
      updateStatus(table, 'running', `Inserting ${rows.length} rows...`)
      const { error } = await supabase.from(table).insert(rows)
      if (error) {
        updateStatus(table, 'error', error.message)
      } else {
        updateStatus(table, 'ok', `${rows.length} rows inserted`)
      }
    }

    // 3. Seed production_orders with manual IDs
    updateStatus('production_orders', 'running', `Inserting ${PO_DATA.length} rows...`)
    for (let i = 0; i < PO_DATA.length; i++) {
      const id = await generateId('PO', 'production_orders')
      const { error } = await supabase.from('production_orders').insert({ id, ...PO_DATA[i] })
      if (error) {
        updateStatus('production_orders', 'error', `Row ${i + 1}: ${error.message}`)
        break
      }
    }
    if (statuses.find((s) => s.table === 'production_orders')?.status !== 'error') {
      updateStatus('production_orders', 'ok', `${PO_DATA.length} rows inserted`)
    }

    // 4. Seed work_orders with manual IDs
    updateStatus('work_orders', 'running', `Inserting ${WO_DATA.length} rows...`)
    const woMap: Record<number, string> = {} // index -> actual WO ID
    for (let i = 0; i < WO_DATA.length; i++) {
      const id = await generateId('WO', 'work_orders')
      woMap[i] = id
      const { error } = await supabase.from('work_orders').insert({ id, ...WO_DATA[i] })
      if (error) {
        updateStatus('work_orders', 'error', `Row ${i + 1}: ${error.message}`)
        break
      }
    }
    if (statuses.find((s) => s.table === 'work_orders')?.status !== 'error') {
      updateStatus('work_orders', 'ok', `${WO_DATA.length} rows inserted`)
    }

    // 5. Seed cutting_records (for WOs that have been cut)
    updateStatus('cutting_records', 'running', 'Inserting...')
    const crData = [
      { woIdx: 0, total_cutting: 120, sisa_cutting: 0, input_by: 'Budi (Gudang)', input_at: '2026-06-03' },
      { woIdx: 1, total_cutting: 50, sisa_cutting: 0, input_by: 'Budi (Gudang)', input_at: '2026-06-05' },
      { woIdx: 2, total_cutting: 85, sisa_cutting: 5, input_by: 'Budi (Gudang)', input_at: '2026-06-07' },
      { woIdx: 3, total_cutting: 220, sisa_cutting: 20, input_by: 'Budi (Gudang)', input_at: '2026-06-10' },
      { woIdx: 4, total_cutting: 100, sisa_cutting: 0, input_by: 'Budi (Gudang)', input_at: '2026-06-09' },
    ]
    for (const cr of crData) {
      const id = await generateId('CR', 'cutting_records')
      const { error } = await supabase.from('cutting_records').insert({
        id,
        work_order_id: woMap[cr.woIdx],
        total_cutting: cr.total_cutting,
        sisa_cutting: cr.sisa_cutting,
        input_by: cr.input_by,
        input_at: cr.input_at,
        locked: true,
      })
      if (error) {
        updateStatus('cutting_records', 'error', error.message)
        break
      }
    }
    if (statuses.find((s) => s.table === 'cutting_records')?.status !== 'error') {
      updateStatus('cutting_records', 'ok', `${crData.length} rows inserted`)
    }

    // 6. Seed sewing_records
    updateStatus('sewing_records', 'running', 'Inserting...')
    const srData = [
      { woIdx: 0, work_code: 'Produksi - Awal | Rue Top | Black | M', pic_penjahit: 'Budi Santoso', qty_selesai: 40, tgl_laporan: '2026-06-10', input_by: 'Spv. Ani', input_at: '2026-06-10', image_name: 'rue-top-budi-10jun.jpg' },
      { woIdx: 0, work_code: 'Produksi - Awal | Rue Top | Black | M', pic_penjahit: 'Ani Wulandari', qty_selesai: 35, tgl_laporan: '2026-06-11', input_by: 'Spv. Ani', input_at: '2026-06-11', image_name: 'rue-top-ani-11jun.jpg' },
      { woIdx: 0, work_code: 'Produksi - Awal | Rue Top | Black | M', pic_penjahit: 'Budi Santoso', qty_selesai: 45, tgl_laporan: '2026-06-12', input_by: 'Spv. Ani', input_at: '2026-06-12', image_name: 'rue-top-budi-12jun.jpg' },
      { woIdx: 1, work_code: 'Restock-01 | Rhea Top | White | L', pic_penjahit: 'Caca', qty_selesai: 20, tgl_laporan: '2026-06-15', input_by: 'Spv. Rudi', input_at: '2026-06-15', image_name: 'rhea-caca-15jun.jpg' },
      { woIdx: 1, work_code: 'Restock-01 | Rhea Top | White | L', pic_penjahit: 'Caca', qty_selesai: 15, tgl_laporan: '2026-06-17', input_by: 'Spv. Rudi', input_at: '2026-06-17', image_name: 'rhea-caca-17jun.jpg' },
      { woIdx: 3, work_code: 'Produksi - Awal | Miles Jacket | Grey | M', pic_penjahit: 'Budi Santoso', qty_selesai: 25, tgl_laporan: '2026-06-12', input_by: 'Spv. Rudi', input_at: '2026-06-12', image_name: 'miles-budi-12jun.jpg' },
      { woIdx: 3, work_code: 'Produksi - Awal | Miles Jacket | Grey | M', pic_penjahit: 'Caca', qty_selesai: 30, tgl_laporan: '2026-06-14', input_by: 'Spv. Rudi', input_at: '2026-06-14', image_name: 'miles-caca-14jun.jpg' },
      { woIdx: 3, work_code: 'Produksi - Awal | Miles Jacket | Grey | M', pic_penjahit: 'Budi Santoso', qty_selesai: 30, tgl_laporan: '2026-06-16', input_by: 'Spv. Rudi', input_at: '2026-06-16', image_name: 'miles-budi-16jun.jpg' },
      { woIdx: 4, work_code: 'Produksi - Awal | Celana Chino | Navy | 32', pic_penjahit: 'Budi Santoso', qty_selesai: 60, tgl_laporan: '2026-06-10', input_by: 'Spv. Ani', input_at: '2026-06-10', image_name: 'chino-budi-10jun.jpg' },
      { woIdx: 4, work_code: 'Produksi - Awal | Celana Chino | Navy | 32', pic_penjahit: 'Ani Wulandari', qty_selesai: 40, tgl_laporan: '2026-06-12', input_by: 'Spv. Ani', input_at: '2026-06-12', image_name: 'chino-ani-12jun.jpg' },
    ]
    for (const sr of srData) {
      const id = await generateId('SR', 'sewing_records')
      const { error } = await supabase.from('sewing_records').insert({
        id,
        work_order_id: woMap[sr.woIdx],
        work_code: sr.work_code,
        pic_penjahit: sr.pic_penjahit,
        qty_selesai: sr.qty_selesai,
        tgl_laporan: sr.tgl_laporan,
        input_by: sr.input_by,
        input_at: sr.input_at,
        image_name: sr.image_name,
        image_url: '',
      })
      if (error) {
        updateStatus('sewing_records', 'error', error.message)
        break
      }
    }
    if (statuses.find((s) => s.table === 'sewing_records')?.status !== 'error') {
      updateStatus('sewing_records', 'ok', `${srData.length} rows inserted`)
    }

    setRunning(false)
  }

  function updateStatus(table: string, status: SeedStatus['status'], message: string) {
    setStatuses((prev) => prev.map((s) => (s.table === table ? { ...s, status, message } : s)))
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-slate-900 mb-2">🌱 Seed Database</h1>
        <p className="text-sm text-slate-500 mb-6">
          Populates all 15 Supabase tables with initial mock data. Clears existing data first.
        </p>

        <button
          onClick={seed}
          disabled={running}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition-all shadow-md shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'Seeding...' : '🌱 Seed Database'}
        </button>

        <div className="mt-6 space-y-2">
          {statuses.map((s) => (
            <div
              key={s.table}
              className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
                s.status === 'ok'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : s.status === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : s.status === 'running'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
              }`}
            >
              <span className="font-mono text-xs">{s.table}</span>
              <span>
                {s.status === 'running' && '⏳ '}
                {s.status === 'ok' && '✅ '}
                {s.status === 'error' && '❌ '}
                {s.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
