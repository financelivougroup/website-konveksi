import type {
  ProductionOrder,
  WorkOrder,
  CuttingRecord,
  SewingRecord,
  AppUser,
} from '@/types/pipeline';

// ===== Mock Users =====
export const mockUsers: AppUser[] = [
  { id: 'user-1', username: 'owner', displayName: 'Pemilik', role: 'owner', avatar: 'PO' },
  { id: 'user-2', username: 'admin', displayName: 'Admin', role: 'admin', avatar: 'AD' },
  { id: 'user-3', username: 'inventory', displayName: 'Budi (Gudang)', role: 'inventory', avatar: 'BG' },
  { id: 'user-4', username: 'spv', displayName: 'Ani (Spv)', role: 'spv_konveksi', avatar: 'AS' },
  { id: 'user-5', username: 'finance', displayName: 'Dewi (Finance)', role: 'finance', avatar: 'DF' },
];

export const penjahitList = [
  'Budi Santoso',
  'Ani Wulandari',
  'Caca',
  'Dedi Kurniawan',
  'Eka Prasetya',
  'Fitri Handayani',
];

// ===== Production Order =====
export const mockProductionOrders: ProductionOrder[] = [
  { id: 'PO-001', workCode: 'Produksi - Awal | Rue Top | Black | M', productNote: 'B-00', product: 'Rue Top', informationVariation: 'Colour: Black Size: M', warna: 'Black', size: 'M', brand: 'Cassca', quantity: 120, status: 'PULLED', createdBy: 'inventory', createdAt: '2026-06-01', pulledAt: '2026-06-02', pulledBy: 'inventory' },
  { id: 'PO-002', workCode: 'Restock-01 | Rhea Top | White | L', productNote: 'B-01', product: 'Rhea Top', informationVariation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 50, status: 'PULLED', createdBy: 'inventory', createdAt: '2026-06-03', pulledAt: '2026-06-04', pulledBy: 'inventory' },
  { id: 'PO-003', workCode: 'Restock-02 | Rue Top | Navy | XL', productNote: 'B-02', product: 'Rue Top', informationVariation: 'Colour: Navy Size: XL', warna: 'Navy', size: 'XL', brand: 'Cassca', quantity: 80, status: 'PULLED', createdBy: 'inventory', createdAt: '2026-06-05', pulledAt: '2026-06-06', pulledBy: 'inventory' },
  { id: 'PO-004', workCode: 'Restock-03 | Aera Dress | Red | S', productNote: 'B-03', product: 'Aera Dress', informationVariation: 'Colour: Red Size: S', warna: 'Red', size: 'S', brand: 'Livou', quantity: 60, status: 'PLANNING', createdBy: 'inventory', createdAt: '2026-06-10' },
  { id: 'PO-005', workCode: 'Produksi - Awal | Miles Jacket | Grey | M', productNote: 'B-00', product: 'Miles Jacket', informationVariation: 'Colour: Grey Size: M', warna: 'Grey', size: 'M', brand: 'Cassca', quantity: 200, status: 'PULLED', createdBy: 'inventory', createdAt: '2026-06-08', pulledAt: '2026-06-09', pulledBy: 'inventory' },
  { id: 'PO-006', workCode: 'Restock-04 | Siena Blouse | Beige | L', productNote: 'B-04', product: 'Siena Blouse', informationVariation: 'Colour: Beige Size: L', warna: 'Beige', size: 'L', brand: 'Cassca', quantity: 30, status: 'PLANNING', createdBy: 'inventory', createdAt: '2026-06-12' },
  { id: 'PO-007', workCode: 'Produksi - Awal | Celana Chino | Navy | 32', productNote: 'B-00', product: 'Celana Chino', informationVariation: 'Colour: Navy Size: 32', warna: 'Navy', size: '32', brand: 'Cassca', quantity: 100, status: 'PULLED', createdBy: 'inventory', createdAt: '2026-06-07', pulledAt: '2026-06-08', pulledBy: 'inventory' },
  { id: 'PO-008', workCode: 'Restock-05 | Kaos Polos | White | L', productNote: 'B-05', product: 'Kaos Polos', informationVariation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 150, status: 'PLANNING', createdBy: 'inventory', createdAt: '2026-06-15' },
];

// ===== Work Orders =====
export const mockWorkOrders: WorkOrder[] = [
  { id: 'WO-001', workCode: 'Produksi - Awal | Rue Top | Black | M', sourceOrderId: 'PO-001', productNote: 'B-00', productNoteFull: 'PDFF_CSC-TOP-01_B-00_PRDN', product: 'Rue Top', productId: 'CSC-TOP-01', variationId: 'CSC-TOP-01-BLK-M', informationVariation: 'Colour: Black Size: M', warna: 'Black', size: 'M', brand: 'Cassca', quantity: 120, productionStatus: 'FINISHING_COMPLETE', invoiceStatus: 'WAITING_INVOICE', createdBy: 'inventory', createdAt: '2026-06-02', pulledAt: '2026-06-02' },
  { id: 'WO-002', workCode: 'Restock-01 | Rhea Top | White | L', sourceOrderId: 'PO-002', productNote: 'B-01', productNoteFull: 'PDFF_LVU-TOP-06_B-01_PRDN', product: 'Rhea Top', productId: 'LVU-TOP-06', variationId: 'LVU-TOP-06-WHT-L', informationVariation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 50, productionStatus: 'SEWING_IN_PROGRESS', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-04', pulledAt: '2026-06-04' },
  { id: 'WO-003', workCode: 'Restock-02 | Rue Top | Navy | XL', sourceOrderId: 'PO-003', productNote: 'B-02', productNoteFull: 'PDFF_CSC-TOP-01_B-02_PRDN', product: 'Rue Top', productId: 'CSC-TOP-01', variationId: 'CSC-TOP-01-NVY-XL', informationVariation: 'Colour: Navy Size: XL', warna: 'Navy', size: 'XL', brand: 'Cassca', quantity: 80, productionStatus: 'CUTTING_COMPLETE', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-06', pulledAt: '2026-06-06' },
  { id: 'WO-005', workCode: 'Produksi - Awal | Miles Jacket | Grey | M', sourceOrderId: 'PO-005', productNote: 'B-00', productNoteFull: 'PDFF_CSC-JKT-05_B-00_PRDN', product: 'Miles Jacket', productId: 'CSC-JKT-05', variationId: 'CSC-JKT-05-GRY-M', informationVariation: 'Colour: Grey Size: M', warna: 'Grey', size: 'M', brand: 'Cassca', quantity: 200, productionStatus: 'SEWING_IN_PROGRESS', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-09', pulledAt: '2026-06-09' },
  { id: 'WO-007', workCode: 'Produksi - Awal | Celana Chino | Navy | 32', sourceOrderId: 'PO-007', productNote: 'B-00', productNoteFull: 'PDFF_CSC-PNT-07_B-00_PRDN', product: 'Celana Chino', productId: 'CSC-PNT-07', variationId: 'CSC-PNT-07-NVY-32', informationVariation: 'Colour: Navy Size: 32', warna: 'Navy', size: '32', brand: 'Cassca', quantity: 100, productionStatus: 'FINISHING_COMPLETE', invoiceStatus: 'PAID', createdBy: 'inventory', createdAt: '2026-06-08', pulledAt: '2026-06-08' },
  { id: 'WO-008', workCode: 'Restock-03 | Aera Dress | Red | S', sourceOrderId: 'PO-004', productNote: 'B-03', productNoteFull: 'PDFF_LVU-DRS-04_B-03_PRDN', product: 'Aera Dress', productId: 'LVU-DRS-04', variationId: 'LVU-DRS-04-RED-S', informationVariation: 'Colour: Red Size: S', warna: 'Red', size: 'S', brand: 'Livou', quantity: 60, productionStatus: 'CUTTING_PENDING', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-16' },
  { id: 'WO-009', workCode: 'Restock-04 | Siena Blouse | Beige | L', sourceOrderId: 'PO-006', productNote: 'B-04', productNoteFull: 'PDFF_CSC-BLS-06_B-04_PRDN', product: 'Siena Blouse', productId: 'CSC-BLS-06', variationId: 'CSC-BLS-06-BGE-L', informationVariation: 'Colour: Beige Size: L', warna: 'Beige', size: 'L', brand: 'Cassca', quantity: 30, productionStatus: 'CUTTING_PENDING', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-16' },
  { id: 'WO-010', workCode: 'Restock-05 | Kaos Polos | White | L', sourceOrderId: 'PO-008', productNote: 'B-05', productNoteFull: 'PDFF_LVU-TSH-08_B-05_PRDN', product: 'Kaos Polos', productId: 'LVU-TSH-08', variationId: 'LVU-TSH-08-WHT-L', informationVariation: 'Colour: White Size: L', warna: 'White', size: 'L', brand: 'Livou', quantity: 150, productionStatus: 'CUTTING_PENDING', invoiceStatus: 'NONE', createdBy: 'inventory', createdAt: '2026-06-16' },
];

// ===== Cutting Records =====
export const mockCuttingRecords: CuttingRecord[] = [
  { id: 'CR-001', workOrderId: 'WO-001', totalCutting: 120, inputBy: 'Budi (Gudang)', inputAt: '2026-06-03', locked: true, sisaCutting: 0 },
  { id: 'CR-002', workOrderId: 'WO-002', totalCutting: 50, inputBy: 'Budi (Gudang)', inputAt: '2026-06-05', locked: true, sisaCutting: 0 },
  { id: 'CR-003', workOrderId: 'WO-003', totalCutting: 85, inputBy: 'Budi (Gudang)', inputAt: '2026-06-07', locked: true, sisaCutting: 5 },
  { id: 'CR-004', workOrderId: 'WO-005', totalCutting: 220, inputBy: 'Budi (Gudang)', inputAt: '2026-06-10', locked: true, sisaCutting: 20 },
  { id: 'CR-005', workOrderId: 'WO-007', totalCutting: 100, inputBy: 'Budi (Gudang)', inputAt: '2026-06-09', locked: true, sisaCutting: 0 },
];

// ===== Sewing Records =====
export const mockSewingRecords: SewingRecord[] = [
  { id: 'SR-001', workOrderId: 'WO-001', workCode: 'Produksi - Awal | Rue Top | Black | M', picPenjahit: 'Budi Santoso', qtySelesai: 40, tanggalLaporan: '2026-06-10', inputBy: 'Spv. Ani', inputAt: '2026-06-10', imageUrl: '', imageName: 'rue-top-budi-10jun.jpg' },
  { id: 'SR-002', workOrderId: 'WO-001', workCode: 'Produksi - Awal | Rue Top | Black | M', picPenjahit: 'Ani Wulandari', qtySelesai: 35, tanggalLaporan: '2026-06-11', inputBy: 'Spv. Ani', inputAt: '2026-06-11', imageUrl: '', imageName: 'rue-top-ani-11jun.jpg' },
  { id: 'SR-003', workOrderId: 'WO-001', workCode: 'Produksi - Awal | Rue Top | Black | M', picPenjahit: 'Budi Santoso', qtySelesai: 45, tanggalLaporan: '2026-06-12', inputBy: 'Spv. Ani', inputAt: '2026-06-12', imageUrl: '', imageName: 'rue-top-budi-12jun.jpg' },
  { id: 'SR-004', workOrderId: 'WO-002', workCode: 'Restock-01 | Rhea Top | White | L', picPenjahit: 'Caca', qtySelesai: 20, tanggalLaporan: '2026-06-15', inputBy: 'Spv. Rudi', inputAt: '2026-06-15', imageUrl: '', imageName: 'rhea-caca-15jun.jpg' },
  { id: 'SR-005', workOrderId: 'WO-002', workCode: 'Restock-01 | Rhea Top | White | L', picPenjahit: 'Caca', qtySelesai: 15, tanggalLaporan: '2026-06-17', inputBy: 'Spv. Rudi', inputAt: '2026-06-17', imageUrl: '', imageName: 'rhea-caca-17jun.jpg' },
  { id: 'SR-006', workOrderId: 'WO-005', workCode: 'Produksi - Awal | Miles Jacket | Grey | M', picPenjahit: 'Budi Santoso', qtySelesai: 25, tanggalLaporan: '2026-06-12', inputBy: 'Spv. Rudi', inputAt: '2026-06-12', imageUrl: '', imageName: 'miles-budi-12jun.jpg' },
  { id: 'SR-007', workOrderId: 'WO-005', workCode: 'Produksi - Awal | Miles Jacket | Grey | M', picPenjahit: 'Caca', qtySelesai: 30, tanggalLaporan: '2026-06-14', inputBy: 'Spv. Rudi', inputAt: '2026-06-14', imageUrl: '', imageName: 'miles-caca-14jun.jpg' },
  { id: 'SR-008', workOrderId: 'WO-005', workCode: 'Produksi - Awal | Miles Jacket | Grey | M', picPenjahit: 'Budi Santoso', qtySelesai: 30, tanggalLaporan: '2026-06-16', inputBy: 'Spv. Rudi', inputAt: '2026-06-16', imageUrl: '', imageName: 'miles-budi-16jun.jpg' },
  { id: 'SR-009', workOrderId: 'WO-007', workCode: 'Produksi - Awal | Celana Chino | Navy | 32', picPenjahit: 'Budi Santoso', qtySelesai: 60, tanggalLaporan: '2026-06-10', inputBy: 'Spv. Ani', inputAt: '2026-06-10', imageUrl: '', imageName: 'chino-budi-10jun.jpg' },
  { id: 'SR-010', workOrderId: 'WO-007', workCode: 'Produksi - Awal | Celana Chino | Navy | 32', picPenjahit: 'Ani Wulandari', qtySelesai: 40, tanggalLaporan: '2026-06-12', inputBy: 'Spv. Ani', inputAt: '2026-06-12', imageUrl: '', imageName: 'chino-ani-12jun.jpg' },
];

// ===== Helper functions =====

/** Get cutting total for a work order */
export function getCuttingForWO(woId: string): CuttingRecord | undefined {
  return mockCuttingRecords.find((c) => c.workOrderId === woId);
}

/** Get sewing total for a work order */
export function getSewingForWO(woId: string): SewingRecord[] {
  return mockSewingRecords.filter((s) => s.workOrderId === woId);
}

/** Get sewing total qty for a work order */
export function getSewingTotal(woId: string): number {
  return mockSewingRecords
    .filter((s) => s.workOrderId === woId)
    .reduce((sum, r) => sum + r.qtySelesai, 0);
}

/** Get work orders viewable by a role */
export function getViewableWO(role: string): WorkOrder[] {
  return mockWorkOrders; // admin/owner sees all
}

/** Generate a new sewing record ID */
export function nextSewingId(): string {
  const maxId = mockSewingRecords.reduce((max, r) => {
    const num = parseInt(r.id.replace('SR-', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `SR-${String(maxId + 1).padStart(3, '0')}`;
}

/** Generate a new work order ID */
export function nextWOId(): string {
  const maxId = mockWorkOrders.reduce((max, w) => {
    const num = parseInt(w.id.replace('WO-', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `WO-${String(maxId + 1).padStart(3, '0')}`;
}

// Generate work code (mirror from mockData.ts)
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
      prefix = `Restock-${productNote.substring(bIndex + 2, bIndex + 4)}`;
    }
  }
  return `${prefix} | ${product} | ${warna} | ${size}`;
}

/** Format date for display */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
