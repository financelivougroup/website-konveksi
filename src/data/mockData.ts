import type { ViewConfig, ModuleId } from '@/types';

export const viewConfig: Record<ModuleId, ViewConfig> = {
  'production-monitoring': { title: 'Production Monitoring', editable: false, sync: false, columns: [] },
  'sewing-entry': { title: 'Sewing Entry', editable: false, sync: false, columns: [] },
  'invoicing': {
    title: 'Invoicing',
    editable: true,
    sync: false,
    columns: [
      { key: 'monthYear', label: 'Bulan Tahun', width: '120px', icon: 'CalendarDays' },
      { key: 'clientName', label: 'Nama Client', width: '110px', icon: 'User' },
      { key: 'billingType', label: 'Jenis Tagihan', width: '130px', icon: 'Tag' },
      { key: 'pcsManual', label: 'PCS Manual', width: '100px', align: 'right', icon: 'Hash' },
      { key: 'pcsLinked', label: 'PCS Linked', width: '100px', align: 'right', icon: 'Link' },
      { key: 'pcsBalanceStatus', label: 'PCS Balance', width: '110px', badge: true, icon: 'CheckCircle' },
      { key: 'unitPrice', label: 'Nominal/PCS', width: '120px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'invoiceCode', label: 'Kode Invoice', width: '180px', icon: 'FileText' },
      { key: 'invoiceDate', label: 'Tgl Invoice', width: '110px', icon: 'Calendar' },
      { key: 'totalAmount', label: 'Total Tagihan', width: '130px', align: 'right', format: 'currency', icon: 'CircleDollarSign' },
      { key: 'rateManpower', label: 'Rate Manpower', width: '120px', align: 'right', format: 'currency', icon: 'Users' },
      { key: 'rateOperational', label: 'Rate Operational', width: '120px', align: 'right', format: 'currency', icon: 'Wrench' },
      { key: 'totalIncomeManpower', label: 'Total Income Manpower', width: '150px', align: 'right', format: 'currency', icon: 'TrendingUp' },
      { key: 'totalIncomeOperational', label: 'Total Income Operational', width: '160px', align: 'right', format: 'currency', icon: 'TrendingUp' },
      { key: 'financeValidation', label: 'Finance Validation', width: '150px', badge: true, icon: 'ShieldCheck' },
    ],
  },
  'register-po': {
    title: 'Register PO',
    editable: false,
    sync: false,
    columns: [],
  },
  'selesai-finishing': {
    title: 'Selesai Finishing',
    editable: true,
    sync: false,
    columns: [
      { key: 'productNote', label: 'Product Note', width: '100px', icon: 'FileText' },
      { key: 'product', label: 'Product', width: '130px', icon: 'Box' },
      { key: 'informationVariation', label: 'Information Variation', width: '180px', icon: 'Info' },
      { key: 'warna', label: 'Warna', width: '80px', icon: 'Palette' },
      { key: 'size', label: 'Size', width: '60px', icon: 'Ruler' },
      { key: 'workCode', label: 'Work Code', width: '220px', icon: 'RefreshCw' },
      { key: 'brand', label: 'Brand', width: '80px', icon: 'Tag' },
      { key: 'quantity', label: 'Quantity', width: '80px', align: 'right', icon: 'Hash' },
      { key: 'totalCutting', label: 'Total Cutting', width: '100px', align: 'right', icon: 'Scissors' },
      { key: 'sisaCutting', label: 'Sisa Cutting', width: '100px', align: 'right', icon: 'Flame' },
      { key: 'totalSelesaiJahit', label: 'Total Selesai Jahit', width: '130px', align: 'right', icon: 'CheckCircle' },
      { key: 'cutVsUpload', label: 'Cut vs Upload', width: '120px', badge: true, icon: 'GitCompare' },
      { key: 'jahitVsFinish', label: 'Jahit vs Finish', width: '120px', badge: true, icon: 'GitCompare' },
      { key: 'statusStock', label: 'STATUS STOCK', width: '150px', badge: true, icon: 'ClipboardList' },
    ],
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
      { key: 'salary', label: 'Salary', width: '100px', align: 'right', format: 'currency', icon: 'Banknote' },
      { key: 'totalHariKerja', label: 'Hari Kerja Efektif', width: '110px', align: 'right', icon: 'CalendarCheck' },
      { key: 'hariKerjaHariIni', label: 'Hari Kerja Hari Ini', width: '110px', align: 'right', icon: 'CalendarCheck' },
      { key: 'sisaHari', label: 'Sisa Hari', width: '80px', align: 'right', icon: 'Hourglass' },
      { key: 'targetDaily', label: 'Target Daily', width: '90px', align: 'right', icon: 'Target' },
      { key: 'targetNgebutHari', label: 'Target Ngebut/Hari', width: '120px', align: 'right', icon: 'Zap' },
      { key: 'targetMonthly', label: 'Target Monthly', width: '110px', align: 'right', icon: 'TrendingUp' },
      { key: 'realisasiMonthly', label: 'Realisasi Monthly', width: '120px', align: 'right', icon: 'CheckCircle' },
      { key: 'sisaTargetMonthly', label: 'Sisa Target', width: '90px', align: 'right', icon: 'MinusCircle' },
      { key: 'progressMonthly', label: 'Progress', width: '80px', align: 'right', format: 'percent', icon: 'Percent' },
      { key: 'statusFinal', label: 'Status Final', width: '130px', badge: true, icon: 'Award' },
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
    title: 'Register Penjahit',
    editable: true,
    sync: false,
    columns: [
      { key: 'picPenjahit', label: 'PIC Penjahit', width: '180px', icon: 'User' },
      { key: 'konveksiTeam', label: 'Konveksi Team', width: '150px', icon: 'Users' },
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

// ===== Supabase-powered: data now fetched from Supabase via services. =====
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