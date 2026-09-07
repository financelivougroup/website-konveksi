import type { ViewConfig, ModuleId } from '@/types';

export const viewConfig: Record<ModuleId, ViewConfig> = {
  'production-monitoring': { title: 'Production Monitoring', editable: false, sync: false, columns: [] },
  'sewing-entry': { title: 'Sewing Entry', editable: false, sync: false, columns: [] },
  'finishing-entry': { title: 'Finishing Entry', editable: false, sync: false, columns: [] },
  'kancing-entry': { title: 'Pasang Kancing Entry', editable: false, sync: false, columns: [] },
  'invoicing': {
    title: 'Invoicing',
    editable: true,
    sync: false,
    columns: [
      { key: 'monthYear', label: 'Bulan Tahun', width: '120px', icon: 'CalendarDays' },
      { key: 'clientName', label: 'Nama Client', width: '110px', icon: 'User' },
      { key: 'billingType', label: 'Jenis Tagihan', width: '130px', icon: 'Tag' },
      { key: 'pcsLinked', label: 'PCS Linked', width: '100px', align: 'right', icon: 'Link' },
      { key: 'unitPrice', label: 'Nominal/PCS', width: '120px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'invoiceCode', label: 'Kode Invoice', width: '180px', icon: 'FileText' },
      { key: 'invoiceDate', label: 'Tgl Invoice', width: '110px', icon: 'Calendar' },
      { key: 'totalAmount', label: 'Total Tagihan', width: '130px', align: 'right', format: 'currency', icon: 'CircleDollarSign' },
      { key: 'rateOperational', label: 'Rate Operational', width: '120px', align: 'right', format: 'currency', icon: 'Wrench' },
      { key: 'totalIncomeManpower', label: 'Total Income Manpower', width: '150px', align: 'right', format: 'currency', icon: 'TrendingUp' },
      { key: 'totalIncomeOperational', label: 'Total Income Operational', width: '160px', align: 'right', format: 'currency', icon: 'TrendingUp' },
      { key: 'financeValidation', label: 'Finance Validation', width: '150px', badge: true, icon: 'ShieldCheck' },
    ],
  },
  'register-po': {
    title: 'Register PO',
    editable: true,
    sync: false,
    columns: [
      { key: 'productionOrderId', label: 'PO ID', width: '220px', icon: 'FileText' },
      { key: 'totalPerPcs', label: 'Total/PCS', width: '130px', align: 'right', format: 'currency', icon: 'CircleDollarSign' },
      { key: 'createdAt', label: 'Created', width: '130px', icon: 'Calendar' },
    ],
  },
  'order-entry': {
    title: 'Order Entry',
    editable: false,
    sync: false,
    columns: [],
  },
  'selesai-jahit': {
    title: 'Selesai Jahit',
    editable: true,
    sync: false,
    columns: [
      { key: 'workCode', label: 'Work Code', width: '150px', icon: 'RefreshCw' },
      { key: 'product', label: 'Product', width: '120px', icon: 'Box' },
      { key: 'warna', label: 'Warna', width: '80px', icon: 'Palette' },
      { key: 'size', label: 'Size', width: '60px', icon: 'Ruler' },
      { key: 'brand', label: 'Brand', width: '80px', icon: 'Tag' },
      { key: 'totalSelesaiJahit', label: 'Total Selesai Jahit', width: '130px', align: 'right', icon: 'CheckCircle' },
      { key: 'picPenjahit', label: 'PIC Penjahit', width: '130px', icon: 'User' },
      { key: 'tanggalLaporan', label: 'Tanggal Laporan', width: '120px', icon: 'Calendar' },
      { key: 'bulanTahun', label: 'Bulan Tahun', width: '110px', icon: 'CalendarDays' },
      { key: 'tanggal', label: 'Tanggal', width: '80px', icon: 'Calendar' },
      { key: 'buktiBarang', label: 'Bukti Barang', width: '100px', icon: 'Camera' },
    ],
  },
  'target-jahit': {
    title: 'Target Jahit',
    editable: true,
    sync: false,
    columns: [
      { key: 'bulanTahun', label: 'Bulan Tahun', width: '110px', icon: 'CalendarDays' },
      { key: 'nama', label: 'Nama', width: '130px', icon: 'User' },
      { key: 'posisi', label: 'Posisi', width: '90px', badge: true, icon: 'Briefcase' },
      { key: 'sisaHari', label: 'Sisa Hari', width: '80px', align: 'right', icon: 'Hourglass' },
      { key: 'targetDaily', label: 'Target | Daily', width: '90px', align: 'right', icon: 'Target' },
      { key: 'targetNgebutHari', label: 'Target Ngebut | Daily', width: '130px', align: 'right', icon: 'Zap' },
      { key: 'targetMonthly', label: 'Target | Monthly', width: '110px', align: 'right', icon: 'TrendingUp' },
      { key: 'realisasiMonthly', label: 'Realisasi | Monthly', width: '130px', align: 'right', icon: 'CheckCircle' },
      { key: 'sisaTargetMonthly', label: 'Sisa Target | Monthly', width: '140px', align: 'right', icon: 'MinusCircle' },
      { key: 'progressMonthly', label: 'Progress | Monthly', width: '120px', align: 'right', format: 'percent', icon: 'Percent' },
      { key: 'statusFinal', label: 'Status Final | Monthly', width: '140px', badge: true, icon: 'Award' },
      { key: 'targetCostPosisi', label: 'Target Cost / Posisi', width: '130px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'realisasiCostPosisi', label: 'Realisasi Cost / Posisi', width: '150px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'sisaUangMonthly', label: 'Sisa Uang | Monthly', width: '120px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'targetCostAccum', label: 'Target Cost Akumulasi', width: '140px', align: 'right', format: 'currency', icon: 'TrendingUp' },
      { key: 'realisasiCostAccum', label: 'Realisasi Cost Akumulasi', width: '160px', align: 'right', format: 'currency', icon: 'CheckCircle' },
      { key: 'selisihCostAccum', label: 'Selisih Cost Akumulasi', width: '140px', align: 'right', format: 'currency', icon: 'MinusCircle' },
      { key: 'sisaUangAccum', label: 'Sisa Uang | Akumulasi', width: '140px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'progressCostAccum', label: 'Progress Biaya Akumulasi', width: '150px', align: 'right', format: 'percent', icon: 'Percent' },
      { key: 'statusFinalCostAccum', label: 'Status Biaya | Akumulasi', width: '160px', badge: true, icon: 'Award' },
      { key: 'benefitRate', label: 'Benefit Rate /Pcs', width: '110px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'extraProduction', label: 'Extra Production', width: '90px', align: 'right', icon: 'TrendingUp' },
      { key: 'benefitAmount', label: 'Benefit Amount', width: '120px', align: 'right', format: 'currency', icon: 'TrendingUp' },
    ],
  },
  'planning-produksi': {
    title: 'Planning Produksi',
    editable: true,
    sync: false,
    columns: [
      { key: 'namaPenjahit', label: 'Nama Penjahit', width: '150px', icon: 'User' },
      { key: 'product', label: 'Product', width: '120px', icon: 'Box' },
      { key: 'warna', label: 'Warna', width: '80px', icon: 'Palette' },
      { key: 'size', label: 'Size', width: '60px', icon: 'Ruler' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right', icon: 'TrendingUp' },
      { key: 'bulanTarget', label: 'Bulan Target', width: '110px', icon: 'Calendar' },
      { key: 'status', label: 'Status', width: '100px', badge: true, icon: 'Tag' },
    ],
  },
  'complain-penalti': {
    title: 'Complain & Penalti',
    editable: true,
    sync: false,
    columns: [
      { key: 'tanggal', label: 'Tanggal', width: '100px', icon: 'Calendar' },
      { key: 'workCode', label: 'Work Code', width: '200px', icon: 'FileText' },
      { key: 'product', label: 'Produk', width: '120px', icon: 'Box' },
      { key: 'posisi', label: 'Posisi', width: '90px', badge: true, icon: 'Briefcase' },
      { key: 'pic', label: 'PIC', width: '120px', icon: 'User' },
      { key: 'poin', label: 'Poin', width: '60px', align: 'right', icon: 'AlertTriangle' },
      { key: 'potonganPerPcs', label: 'Potongan/PCS', width: '110px', align: 'right', format: 'currency', icon: 'Scissors' },
      { key: 'tingkat', label: 'Tingkat', width: '90px', badge: true, icon: 'ShieldAlert' },
      { key: 'status', label: 'Status', width: '100px', badge: true, icon: 'Activity' },
      { key: 'inputBy', label: 'Input By', width: '100px', icon: 'UserCheck' },
    ],
  },
  'register-jahit': {
    title: 'Register Jahit',
    editable: true,
    sync: false,
    columns: [
      { key: 'bulanTahun', label: 'Bulan Tahun', width: '110px', icon: 'CalendarDays' },
      { key: 'hariKerjaEfektif', label: 'Hari Kerja Efektif', width: '120px', align: 'right', icon: 'CalendarCheck' },
      { key: 'targetTotalProduksi', label: 'Target Total Produksi', width: '140px', align: 'right', icon: 'TrendingUp' },
      { key: 'costLeaderTarget', label: 'Cost Leader Target', width: '130px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'costPenjahitTarget', label: 'Cost Penjahit Target', width: '140px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'costFinishingTarget', label: 'Cost Finishing Target', width: '140px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'totalCostTarget', label: 'Total Cost Target', width: '130px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'realisasiTotalProduksi', label: 'Realisasi Total', width: '110px', align: 'right', icon: 'CheckCircle' },
      { key: 'totalCostRealisasi', label: 'Total Cost Realisasi', width: '140px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'aTotalCostTarget', label: 'A. Total Cost Target', width: '140px', align: 'right', format: 'currency', icon: 'BarChart' },
      { key: 'aTotalCostRealisasi', label: 'A. Total Cost Realisasi', width: '150px', align: 'right', format: 'currency', icon: 'BarChart' },
    ],
  },
  'daftar-libur': {
    title: 'Daftar Libur',
    editable: true,
    sync: false,
    columns: [
      { key: 'tanggal', label: 'Tanggal', width: '110px', icon: 'Calendar' },
      { key: 'hari', label: 'Hari', width: '100px', icon: 'CalendarDays' },
      { key: 'keterangan', label: 'Keterangan', width: '250px', icon: 'FileText' },
    ],
  },
  'register-penjahit': {
    title: 'Register Karyawan Tim Jahit',
    editable: true,
    sync: false,
    columns: [
      { key: 'picPenjahit', label: 'Nama Karyawan', width: '180px', icon: 'User' },
      { key: 'posisi', label: 'Posisi', width: '120px', badge: true, icon: 'Briefcase' },
      { key: 'status', label: 'Status', width: '100px', badge: true, icon: 'Activity' },
    ],
  },
  'master-product': {
    title: 'Master Data Product',
    editable: false,
    sync: true,
    columns: [
      { key: 'id', label: 'ID', width: '50px', align: 'right', icon: 'Hash' },
      { key: 'brand', label: 'Brand', width: '80px', icon: 'Tag' },
      { key: 'productId', label: 'Product ID', width: '100px', icon: 'Fingerprint' },
      { key: 'product', label: 'Product', width: '150px', icon: 'Box' },
      { key: 'category', label: 'Category', width: '100px', badge: true, icon: 'Folder' },
      { key: 'statusProduct', label: 'Status Product', width: '120px', badge: true, icon: 'Power' },
      { key: 'warningStock', label: 'Warning Stock', width: '120px', badge: true, icon: 'AlertTriangle' },
    ],
  },
  'raw-monitoring': {
    title: 'Raw Product Monitoring',
    editable: false,
    sync: true,
    columns: [
      { key: 'productId', label: 'Product ID', width: '100px', icon: 'Fingerprint' },
      { key: 'product', label: 'Product', width: '120px', icon: 'Box' },
      { key: 'warna', label: 'Warna', width: '80px', icon: 'Palette' },
      { key: 'size', label: 'Size', width: '60px', icon: 'Ruler' },
      { key: 'availableQuantity', label: 'Available Qty', width: '100px', align: 'right', icon: 'Hash' },
      { key: 'statusStockFinal', label: 'Status Stock Final', width: '150px', badge: true, icon: 'BarChart' },
      { key: 'sisaCutting', label: 'Sisa Cutting', width: '100px', align: 'right', icon: 'Flame' },
      { key: 'prioritasDalamProses', label: 'Prioritas Proses', width: '110px', align: 'right', icon: 'BarChart' },
      { key: 'prioritasTungguPRDN', label: 'Prioritas PRDN', width: '100px', align: 'right', icon: 'Clock' },
      { key: 'prioritasTungguWHLB', label: 'Prioritas WHLB', width: '100px', align: 'right', icon: 'Clock' },
      { key: 'brand', label: 'Brand', width: '80px', icon: 'Tag' },
      { key: 'source', label: 'Source', width: '80px', badge: true, icon: 'MapPin' },
    ],
  },
  'master-import': {
    title: 'Master Data Import',
    editable: false,
    sync: true,
    columns: [
      { key: 'supplier', label: 'Supplier', width: '140px', icon: 'Building' },
      { key: 'note', label: 'Note', width: '200px', icon: 'FileText' },
      { key: 'sourceProduct', label: 'Source', width: '80px', badge: true, icon: 'MapPin' },
      { key: 'productId', label: 'Product ID', width: '100px', icon: 'Fingerprint' },
      { key: 'kodeProduksi', label: 'Kode Produksi', width: '120px', icon: 'Hash' },
      { key: 'status', label: 'Status', width: '120px', badge: true, icon: 'Activity' },
      { key: 'receivedAt', label: 'Received At', width: '110px', icon: 'Calendar' },
    ],
  },
  // Combined view: the actual columns/data shown come from the active sub-tab
  // (register-jahit / daftar-libur / register-penjahit) selected in App.tsx.
  // This entry mirrors 'register-jahit' (the default sub-tab) so it stays valid
  // if anything reads it directly before App.tsx resolves the effective module.
  'production-data': {
    title: 'Production Data',
    editable: true,
    sync: false,
    columns: [
      { key: 'bulanTahun', label: 'Bulan Tahun', width: '110px', icon: 'CalendarDays' },
      { key: 'hariKerjaEfektif', label: 'Hari Kerja Efektif', width: '120px', align: 'right', icon: 'CalendarCheck' },
      { key: 'targetTotalProduksi', label: 'Target Total Produksi', width: '140px', align: 'right', icon: 'TrendingUp' },
      { key: 'totalCostTarget', label: 'Total Cost Target', width: '130px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'realisasiTotalProduksi', label: 'Realisasi Total', width: '110px', align: 'right', icon: 'CheckCircle' },
      { key: 'totalCostRealisasi', label: 'Total Cost Realisasi', width: '140px', align: 'right', format: 'currency', icon: 'Banknote' },
    ],
  },
};

export const mockData: Record<ModuleId, Record<string, unknown>[]> = {
  'selesai-jahit': [
    { id: 1, workCode: 'CSC-001-Black-M', product: 'Kaos Polos', warna: 'Black', size: 'M', brand: 'Cassca', totalSelesaiJahit: 25, picPenjahit: 'Budi Santoso', tanggalLaporan: '2026-06-05', bulanTahun: 'Juni 2026', tanggal: '05 Jun', buktiBarang: 'img1.jpg' },
    { id: 2, workCode: 'LVU-002-White-L', product: 'Kemeja', warna: 'White', size: 'L', brand: 'Livou', totalSelesaiJahit: 15, picPenjahit: 'Ani Wulandari', tanggalLaporan: '2026-06-05', bulanTahun: 'Juni 2026', tanggal: '05 Jun', buktiBarang: 'img2.jpg' },
    { id: 3, workCode: 'CSC-001-Black-M', product: 'Kaos Polos', warna: 'Black', size: 'M', brand: 'Cassca', totalSelesaiJahit: 30, picPenjahit: 'Caca', tanggalLaporan: '2026-06-04', bulanTahun: 'Juni 2026', tanggal: '04 Jun', buktiBarang: 'img3.jpg' },
    { id: 4, workCode: 'CSC-003-Navy-XL', product: 'Celana', warna: 'Navy', size: 'XL', brand: 'Cassca', totalSelesaiJahit: 40, picPenjahit: 'Budi Santoso', tanggalLaporan: '2026-06-05', bulanTahun: 'Juni 2026', tanggal: '05 Jun', buktiBarang: 'img4.jpg' },
  ],
  'target-jahit': [
    { id: 1, bulanTahun: 'Juni 2026', nama: 'Budi Santoso', posisi: 'Penjahit', sisaHari: 17, targetDaily: 45, targetNgebutHari: 52, targetMonthly: 1000, realisasiMonthly: 850, sisaTargetMonthly: 150, progressMonthly: 85, statusFinal: 'SEDANG MENGEJAR', targetCostPosisi: 4000000, realisasiCostPosisi: 3400000, sisaUangMonthly: 600000, targetCostAccum: 4000000, realisasiCostAccum: 3400000, selisihCostAccum: -600000, sisaUangAccum: 600000, progressCostAccum: 0.85, statusFinalCostAccum: 'SEDANG MENGEJAR' },
    { id: 2, bulanTahun: 'Juni 2026', nama: 'Ani Wulandari', posisi: 'Leader', sisaHari: 17, targetDaily: 90, targetNgebutHari: 105, targetMonthly: 2000, realisasiMonthly: 1800, sisaTargetMonthly: 200, progressMonthly: 90, statusFinal: 'SEDANG MENGEJAR', targetCostPosisi: 8000000, realisasiCostPosisi: 7200000, sisaUangMonthly: 800000, targetCostAccum: 8000000, realisasiCostAccum: 7200000, selisihCostAccum: -800000, sisaUangAccum: 800000, progressCostAccum: 0.9, statusFinalCostAccum: 'SEDANG MENGEJAR' },
    { id: 3, bulanTahun: 'Juni 2026', nama: 'Caca', posisi: 'Finishing', sisaHari: 17, targetDaily: 39, targetNgebutHari: 46, targetMonthly: 875, realisasiMonthly: 700, sisaTargetMonthly: 175, progressMonthly: 80, statusFinal: 'SEDANG MENGEJAR', targetCostPosisi: 3500000, realisasiCostPosisi: 2800000, sisaUangMonthly: 700000, targetCostAccum: 3500000, realisasiCostAccum: 2800000, selisihCostAccum: -700000, sisaUangAccum: 700000, progressCostAccum: 0.8, statusFinalCostAccum: 'SEDANG MENGEJAR' },
  ],
  'register-jahit': [
    { id: 1, bulanTahun: 'Juni 2026', hariKerjaEfektif: 22, targetTotalProduksi: 10000, costLeaderTarget: 800, costPenjahitTarget: 400, costFinishingTarget: 200, totalCostTarget: 1400, realisasiTotalProduksi: 8500, totalCostRealisasi: 1647, aTotalCostTarget: 1500, aTotalCostRealisasi: 1800 },
    { id: 2, bulanTahun: 'Mei 2026', hariKerjaEfektif: 21, targetTotalProduksi: 9500, costLeaderTarget: 842, costPenjahitTarget: 421, costFinishingTarget: 210, totalCostTarget: 1473, realisasiTotalProduksi: 9000, totalCostRealisasi: 1555, aTotalCostTarget: 1600, aTotalCostRealisasi: 1700 },
  ],
  'daftar-libur': [
    { id: 1, tanggal: '2026-06-01', hari: 'Senin', keterangan: 'Hari Libur Nasional' },
    { id: 2, tanggal: '2026-06-17', hari: 'Rabu', keterangan: 'Idul Fitri' },
    { id: 3, tanggal: '2026-06-18', hari: 'Kamis', keterangan: 'Idul Fitri' },
  ],
  'register-penjahit': [
    { id: 1, picPenjahit: 'Budi Santoso', posisi: 'Penjahit', status: 'Aktif' },
    { id: 2, picPenjahit: 'Ani Wulandari', posisi: 'Leader', status: 'Aktif' },
    { id: 3, picPenjahit: 'Caca', posisi: 'Penjahit', status: 'Aktif' },
    { id: 4, picPenjahit: 'Dedi Kurniawan', posisi: 'Finishing', status: 'Non-Aktif' },
  ],
  'master-product': [
    { id: 1, brand: 'Cassca', productId: 'CSC-001', product: 'Kaos Polos', category: 'Atasan', statusProduct: 'Aktif', warningStock: '-' },
    { id: 2, brand: 'Livou', productId: 'LVU-002', product: 'Kemeja', category: 'Atasan', statusProduct: 'Aktif', warningStock: 'Stok Menipis' },
    { id: 3, brand: 'Cassca', productId: 'CSC-003', product: 'Celana', category: 'Bawahan', statusProduct: 'Aktif', warningStock: '-' },
    { id: 4, brand: 'Livou', productId: 'LVU-004', product: 'Dress', category: 'Atasan', statusProduct: 'Non-Aktif', warningStock: '-' },
    { id: 5, brand: 'Cassca', productId: 'CSC-005', product: 'Jaket', category: 'Outer', statusProduct: 'Aktif', warningStock: '-' },
  ],
  'raw-monitoring': [
    { id: 1, productId: 'CSC-001', product: 'Kaos Polos', warna: 'Black', size: 'M', availableQuantity: 5, statusStockFinal: 'DALAM PROSES PRODUKSI', sisaCutting: 20, prioritasDalamProses: 1, prioritasTungguPRDN: '-', prioritasTungguWHLB: '-', brand: 'Cassca', source: 'PRDN' },
    { id: 2, productId: 'LVU-002', product: 'Kemeja', warna: 'White', size: 'L', availableQuantity: 2, statusStockFinal: 'MENUNGGU KEPUTUSAN', sisaCutting: 0, prioritasDalamProses: '-', prioritasTungguPRDN: 1, prioritasTungguWHLB: '-', brand: 'Livou', source: 'WHLB' },
    { id: 3, productId: 'CSC-003', product: 'Celana', warna: 'Navy', size: 'XL', availableQuantity: 15, statusStockFinal: 'DALAM PROSES PRODUKSI', sisaCutting: 5, prioritasDalamProses: 2, prioritasTungguPRDN: '-', prioritasTungguWHLB: '-', brand: 'Cassca', source: 'PRDN' },
    { id: 4, productId: 'LVU-004', product: 'Dress', warna: 'Red', size: 'S', availableQuantity: 8, statusStockFinal: 'MENUNGGU KEPUTUSAN', sisaCutting: 0, prioritasDalamProses: '-', prioritasTungguPRDN: 2, prioritasTungguWHLB: '-', brand: 'Livou', source: 'WHLB' },
  ],
  'master-import': [
    { id: 1, supplier: 'PT Kain Jaya', note: '`ABC123` CSC-001-Black', sourceProduct: 'CSC', productId: 'CSC-001', kodeProduksi: 'ABC123', status: 'Diterima', receivedAt: '2026-05-20' },
    { id: 2, supplier: 'CV Benang', note: '`XYZ789` LVU-002-White', sourceProduct: 'LVU', productId: 'LVU-002', kodeProduksi: 'XYZ789', status: 'Diterima', receivedAt: '2026-05-22' },
    { id: 3, supplier: 'PT Kain Jaya', note: '`DEF456` CSC-003-Navy', sourceProduct: 'CSC', productId: 'CSC-003', kodeProduksi: 'DEF456', status: 'Dalam Perjalanan', receivedAt: '-' },
  ],
  // Combined view: actual rows come from the active sub-tab resolved in App.tsx.
  // This empty fallback keeps the Record<ModuleId, ...> type valid.
  'production-data': [],
  'planning-produksi': [],
  'complain-penalti': [],
  'production-monitoring': [],
  'sewing-entry': [],
  'finishing-entry': [],
  'kancing-entry': [],
  'invoicing': [],
  'register-po': [],
  'order-entry': [],
};

export const supabaseWorkCodes = [
  { value: 'Produksi - Awal | Rue Top | Black | M', productNote: 'B-00', product: 'Rue Top', informationVariation: 'Colour: Black Size: M', warna: 'Black', size: 'M', brand: 'Cassca', quantity: 100 },
  { value: 'Restock-01 | Rhea Top | White | L', productNote: 'B-01', product: 'Rhea Top', informationVariation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 50 },
  { value: 'Restock-02 | Rue Top | Navy | XL', productNote: 'B-02', product: 'Rue Top', informationVariation: 'Colour: Navy Size: XL', warna: 'Navy', size: 'XL', brand: 'Cassca', quantity: 80 },
  { value: 'Restock-03 | Aera Dress | Red | S', productNote: 'B-03', product: 'Aera Dress', informationVariation: 'Colour: Red Size: S', warna: 'Red', size: 'S', brand: 'Livou', quantity: 60 },
  { value: 'Produksi - Awal | Miles Jacket | Grey | M', productNote: 'B-00', product: 'Miles Jacket', informationVariation: 'Colour: Grey Size: M', warna: 'Grey', size: 'M', brand: 'Cassca', quantity: 45 },
  { value: 'Restock-04 | Siena Blouse | Beige | L', productNote: 'B-04', product: 'Siena Blouse', informationVariation: 'Colour: Beige Size: L', warna: 'Beige', size: 'L', brand: 'Cassca', quantity: 30 },
];

// Helper: Parse warna and size from Information Variation string
export function parseInformationVariation(iv: string): { warna: string; size: string } {
  const colourMatch = iv.match(/Colour:\s*([^]+?)\s*Size:/i);
  const sizeMatch = iv.match(/Size:\s*(\S+)/i);
  return {
    warna: colourMatch ? colourMatch[1].trim() : '',
    size: sizeMatch ? sizeMatch[1].trim() : '',
  };
}

// Helper: Generate Work Code from the AppSheet formula:
//   IF(ISBLANK([Product note]), "",
//     CONCATENATE(
//       IF([Product note].CONTAINTEXT("B-00"), "Produksi - Awal",
//         "Restock-" & IF(FIND("B-",[Product note])=-1, "",
//           MID([Product note], FIND("B-",[Product note])+2, 2))),
//       " | ", [Product], " | ", [Warna], " | ", [Size]))
// NOTE: AppSheet MID(str, start, length) is 1-indexed; FIND returns 1-indexed position.
// JS indexOf is 0-indexed, so the +2 offset maps correctly (B- at idx 0 -> start at char 3 in 1-indexed = idx 2).
export function generateWorkCode(productNote: string, product: string, warna: string, size: string): string {
  if (!productNote) return '';
  let prefix: string;
  if (productNote.includes('B-00')) {
    prefix = 'Produksi - Awal';
  } else {
    const bIndex = productNote.indexOf('B-');
    if (bIndex === -1) {
      prefix = 'Restock-';
    } else {
      // MID(note, FIND+2, 2) in 1-indexed -> JS substring(bIndex+2, bIndex+4)
      prefix = `Restock-${productNote.substring(bIndex + 2, bIndex + 4)}`;
    }
  }
  return `${prefix} | ${product} | ${warna} | ${size}`;
}

export const penjahitList = ['Budi Santoso', 'Ani Wulandari', 'Caca', 'Dedi Kurniawan'];
export const bulanList = ['Januari 2026', 'Februari 2026', 'Maret 2026', 'April 2026', 'Mei 2026', 'Juni 2026'];

export const navGroups = [
  {
    label: '',
    items: [
      { id: 'production-monitoring' as const, label: 'Production Monitoring', icon: 'Layers', dot: '#2563EB' },
      { id: 'order-entry' as const, label: 'Order Entry', icon: 'ClipboardList' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { id: 'master-product' as const, label: 'Master Data Product', icon: 'Package', locked: true },
      { id: 'raw-monitoring' as const, label: 'Raw Product Monitoring', icon: 'Package', locked: true },
      { id: 'master-import' as const, label: 'Master Data Import', icon: 'Package', locked: true },
      { id: 'register-po' as const, label: 'Register PO', icon: 'ClipboardList' },
      { id: 'target-jahit' as const, label: 'Target Jahit', icon: 'Target' },
      { id: 'planning-produksi' as const, label: 'Planning Produksi', icon: 'Target' },
      { id: 'register-penjahit' as const, label: 'Register Karyawan', icon: 'Users' },
      { id: 'complain-penalti' as const, label: 'Complain & Penalti', icon: 'AlertTriangle' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'invoicing' as const, label: 'Invoicing', icon: 'BarChart3' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'reports' as const, label: 'Reports', icon: 'BarChart3' },
      { id: 'settings' as const, label: 'Settings', icon: 'Settings' },
    ],
  },
];

// ===== Supabase-powered: data now fetched from Supabase via services. =====