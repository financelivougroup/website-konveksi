// ===== Pipeline Production Types =====

// Tidak ada status 'CUTTING': cut pertama langsung memindahkan WO dari NEW
// ke PROGRESS (lihat deriveStatus di src/lib/productionStatus.ts).
//
// Ini adalah status LEVEL-2: satu nilai per Kode Produksi Konveksi (kartu
// Kanban). Status LEVEL-1 ada di `VariasiStatus` di bawah.
export type ProductionStatus =
  | 'NEW'
  | 'PROGRESS'
  | 'FINISHED'
  | 'INVOICED';

/**
 * Status level-1: status PER VARIASI (satu baris = satu Work Order).
 *
 * Permintaan user: "saya mau status di Production order itu ada 2 level.
 * level pertama untuk status variasinya."
 *
 * Beda mendasar dari `ProductionStatus` (level-2): status variasi bisa berisi
 * LEBIH DARI SATU sekaligus — mis. Sewing dan Kancing berjalan bersamaan, atau
 * Kancing/Finishing sudah dilaporkan padahal jahitnya belum. Karena itu
 * bentuknya himpunan, bukan nilai tunggal.
 *
 * Huruf besar semua (CUTTING/SEWING/…) sengaja sama gayanya dengan
 * `ProductionStatus`, dan TIDAK bentrok dengan status produksi lama karena
 * keduanya tinggal di kolom tabel yang berbeda.
 *
 * Aturan turunannya ada di `deriveVariasiStatuses` (src/lib/productionStatus.ts).
 */
export type VariasiStatus = 'CUTTING' | 'SEWING' | 'KANCING' | 'FINISHING' | 'COMPLETED';

export type InvoiceStatus =
  | 'NONE'
  | 'WAITING_INVOICE'
  | 'INVOICED'
  | 'PARTIAL_PAID'
  | 'PAID';

export type ProductionOrderLifecycle = 'DRAFT' | 'PULLED' | 'CANCELLED';

export interface ProductionOrder {
  id: string;
  workCode: string;
  productNote: string;
  product: string;
  informationVariation: string;
  warna: string;
  size: string;
  brand: string;
  quantity: number;
  status: ProductionOrderLifecycle;
  createdBy: string;
  createdAt: string;
  pulledAt?: string;
  pulledBy?: string;
}

export const ORDER_PRICE_COMPONENTS = [
  { key: 'potong', label: 'Potong' },
  { key: 'jahit', label: 'Jahit' },
  { key: 'obras', label: 'Obras' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'operational', label: 'Operational' },
  { key: 'material_basic', label: 'Material Basic' },
  { key: 'margin', label: 'Margin' },
  { key: 'jasa_pasang_kancing', label: 'Jasa Pasang Kancing' },
] as const;

export type OrderPriceComponentKey = typeof ORDER_PRICE_COMPONENTS[number]['key'];

export interface ProductionOrderVariation {
  id?: string;
  color: string;
  size: string;
  quantity: number;
  variationId?: string;
  workCode?: string;
  sortOrder?: number;
  legacyNeedsReview?: boolean;
  /** Path objek foto variasi di bucket `product-photos`. Null bila belum ada foto. */
  photoPath?: string | null;
  /** URL publik turunan dari `photoPath`, diisi service saat memetakan hasil RPC. */
  photoUrl?: string | null;
}

export interface OrderPriceComponent {
  id?: string;
  key: OrderPriceComponentKey;
  label: string;
  value: number;
  sortOrder?: number;
}

export interface OrderPricing {
  id?: string;
  totalPerPiece: number;
  complete: boolean;
  components: OrderPriceComponent[];
}

/**
 * Satu baris Register Harga: snapshot harga sebuah order pada satu waktu.
 *
 * Append-only — baris baru ditulis oleh `order_entry_save` hanya bila total
 * atau salah satu komponennya berubah dari baris terakhir. Menyimpan ulang
 * order dengan harga yang sama memperbarui `savedAt`, tidak menambah baris.
 */
export interface RegisterHargaRow {
  id: number;
  productionOrderId: string;
  productionCode: string | null;
  clientProductionCode: string | null;
  productId: string | null;
  product: string | null;
  brand: string | null;
  totalPerPiece: number;
  /** Delapan komponen harga, selalu lengkap berkat `mergeOrderPriceComponents`. */
  components: OrderPriceComponent[];
  actor: string | null;
  savedAt: string;
}

/**
 * Hasil pencarian "harga produksi terakhir" untuk auto-fill di Order Entry.
 *
 * `matchedBy` memberi tahu UI apakah harga ini didapat dari Product ID yang
 * sama persis atau dari fallback Client + Nama Produk — penting karena
 * fallback bisa cocok ke artikel yang berbeda ejaan, sehingga user perlu bisa
 * memverifikasi asalnya sebelum memakainya.
 */
export interface LastPriceMatch {
  productionOrderId: string;
  productionCode: string | null;
  productId: string | null;
  product: string | null;
  brand: string | null;
  totalPerPiece: number;
  savedAt: string;
  matchedBy: 'product_id' | 'product';
  components: OrderPriceComponent[];
}

export interface OrderEntryOverview {
  id: string;
  productionCode: string;
  /** Kode produksi milik client (mis. `PDFF_…`), diketik manual saat order dibuat. */
  clientProductionCode: string | null;
  productId: string;
  product: string;
  brand: string;
  status: ProductionOrderLifecycle;
  createdBy: string;
  createdAt: string;
  pulledAt?: string | null;
  pulledBy?: string | null;
  /** Path objek di bucket storage `product-photos`. Null bila order belum punya foto. */
  productPhotoPath?: string | null;
  /** URL publik turunan dari `productPhotoPath`, diisi service saat memetakan hasil RPC. */
  productPhotoUrl?: string | null;
  /** Path foto variasi pertama, untuk kolom "Foto variasi" di tabel. */
  variationPhotoPath?: string | null;
  /** URL publik turunan dari `variationPhotoPath`, diisi service saat memetakan hasil RPC. */
  variationPhotoUrl?: string | null;
  totalQuantity: number;
  variationCount: number;
  totalPerPiece: number;
  priceComplete: boolean;
  legacyNeedsReview: boolean;
  productionStatus: string;
  canEdit: boolean;
  structureLocked: boolean;
  editBlockReason?: string | null;
}

export interface OrderEntryDetail {
  id: string;
  productionCode: string;
  /** Kode produksi milik client (mis. `PDFF_…`), diketik manual saat order dibuat. */
  clientProductionCode: string | null;
  productId: string;
  product: string;
  brand: string;
  status: ProductionOrderLifecycle;
  createdBy: string;
  createdAt: string;
  pulledAt?: string | null;
  pulledBy?: string | null;
  /** Path objek di bucket storage `product-photos`. Null bila order belum punya foto. */
  productPhotoPath?: string | null;
  /** URL publik turunan dari `productPhotoPath`, diisi service saat memetakan hasil RPC. */
  productPhotoUrl?: string | null;
  canEdit: boolean;
  structureLocked: boolean;
  editBlockReason?: string | null;
  variations: ProductionOrderVariation[];
  pricing: OrderPricing;
}

export interface OrderEntrySaveInput {
  id?: string;
  productionCode: string;
  clientProductionCode: string;
  productId: string;
  product: string;
  brand: string;
  /**
   * Identitas variasi saja — **tanpa quantity**.
   *
   * Permintaan user (verbatim): "pada saat Create New Order di Order Entry,
   * kOlOm quantity harusnya dihapus aja". Qty bukan angka yang diketik konveksi;
   * ia kuantitas yang diupload client ke POS-nya (Pancake), jadi variasi baru
   * lahir dengan `quantity = 0` di database sampai sinkronisasi POS mengisinya.
   * `order_entry_save` memang hanya membaca color + size dari payload ini.
   */
  variations: Array<Pick<ProductionOrderVariation, 'color' | 'size'>>;
  components: Array<Pick<OrderPriceComponent, 'key' | 'value'>>;
  actor: string;
}

export interface WorkOrder {
  id: string;
  workCode: string;
  sourceOrderId: string;
  sourceVariationId?: string;
  productNote: string;
  /** Kode produksi milik client, disalin dari order asal saat Pull. */
  clientProductionCode: string | null;
  product: string;
  productId: string;
  variationId: string;
  informationVariation: string;
  warna: string;
  size: string;
  brand: string;
  quantity: number;
  productionStatus: ProductionStatus;
  invoiceStatus: InvoiceStatus;
  createdBy: string;
  createdAt: string;
  pulledAt?: string;
  /** Path foto variasi asal, dibaca lewat join balik `sourceVariationId`. */
  variationPhotoPath?: string | null;
  /** URL publik turunan dari `variationPhotoPath`, diisi service saat memetakan hasil query. */
  variationPhotoUrl?: string | null;
  /** Foto produk induk, sebagai cadangan tampilan bila tidak ada foto variasi. */
  productPhotoPath?: string | null;
  productPhotoUrl?: string | null;
}

export interface CuttingRecord {
  id: string;
  workOrderId: string;
  totalCutting: number;
  inputBy: string;
  inputAt: string;
  locked: boolean;
  sisaCutting: number;
}

export interface SewingRecord {
  id: string;
  workOrderId: string;
  workCode: string;
  picPenjahit: string;
  qtySelesai: number;
  tanggalLaporan: string;
  inputBy: string;
  inputAt: string;
  imageUrl?: string;
  imageName?: string;
}

export interface FinishingRecord {
  id: string;
  workOrderId: string;
  qtyFinishing: number;
  tanggalImport: string;
  syncedAt: string;
  source: string;
  syncStatus: 'OK' | 'FAILED';
  inputBy?: string;
  picFinishing?: string;
  imageName?: string;
}

export interface KancingRecord {
  id: string;
  workOrderId: string;
  workCode: string;
  picKancing: string;
  qtyKancing: number;
  tanggalLaporan: string;
  inputBy?: string;
  inputAt: string;
  imageUrl?: string;
  imageName?: string;
}

export interface Invoice {
  id: string;
  workOrderId: string;
  workCode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: InvoiceStatus;
  generatedAt?: string;
  sentAt?: string;
  payments: Payment[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  receivedAt: string;
  receivedBy: string;
  method?: 'bank-transfer' | 'cash' | 'other';
  note?: string;
}

export type BillingType = 'mass_production' | 'sample_production';

export interface InvoiceRow {
  id: string;
  /**
   * Work order wakil dari grup.
   *
   * Invoice kini milik satu **Kode Produksi Konveksi** (lihat
   * `productionOrderId`), bukan satu variasi. Kolom ini dipertahankan karena
   * skema `invoices` masih `NOT NULL` + `UNIQUE` pada `work_order_id`, jadi
   * satu variasi dari grup ditunjuk sebagai wakil.
   */
  workOrderId: string;
  /** Kode produksi (order) yang ditagih invoice ini. Null untuk invoice lama. */
  productionOrderId?: string | null;
  /** Kode Produksi Client — pendamping judul invoice. */
  clientProductionCode?: string | null;
  orderPriceId?: string;
  autoCreated: boolean;
  workCode: string;
  invoiceCode: string;
  invoiceDate: string;
  monthYear: string;
  clientName: string;
  clientCode: string;
  billingType: BillingType;
  billingTypeCodeValue: 'MP' | 'SP';
  pcsLinked: number;
  unitPrice: number;
  totalAmount: number;
  rateOperational: number;
  totalIncomeManpower: number;
  totalIncomeOperational: number;
  financeValidation: 'Need Register Invoice' | 'Collect Payment' | 'Partial Paid' | 'Paid';
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoicePaymentRow {
  id: string;
  invoiceId: string;
  paymentType: 'cash' | 'termin';
  terminNo: number | null;
  paymentDate: string;
  amount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoicePaymentFileRow {
  id: string;
  paymentId: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  uploadedAt?: string;
}

// Sejalan dengan batasan CHECK pada kolom public.profiles.role.
//
// `supervisor` dan `staff` ditambahkan bersama migrasi
// `supabase/migrations/2026-09-25-account-renames-roles-and-staff.sql`. Keduanya
// sengaja TIDAK masuk daftar mana pun di `src/lib/permissions.ts` — dan memang
// tidak perlu: seluruh gerbang izin di aplikasi ini berupa allow-list eksplisit
// (`canEditProductionLog`, `canEditSalary`, dan `role === 'owner' || role === 'finance'`
// di halaman-halaman), sehingga role baru otomatis hanya mendapat baca + input.
// Itu persis yang user minta untuk Supervisor ("sama seperti Inventory").
export type AppRole = 'owner' | 'finance' | 'inventory' | 'supervisor' | 'staff';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  avatar: string;
}

// Status display helpers
export const productionStatusLabel: Record<ProductionStatus, string> = {
  NEW: 'New',
  PROGRESS: 'Progress',
  FINISHED: 'Finished',
  INVOICED: 'Invoiced',
};

export const productionStatusColor: Record<ProductionStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  PROGRESS: 'bg-amber-100 text-amber-700',
  FINISHED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-purple-100 text-purple-700',
};

/** Label tampilan tiap status variasi (level-1). */
export const variasiStatusLabel: Record<VariasiStatus, string> = {
  CUTTING: 'Cutting',
  SEWING: 'Sewing',
  KANCING: 'Kancing',
  FINISHING: 'Finishing',
  COMPLETED: 'Completed',
};

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  NONE: '—',
  WAITING_INVOICE: 'Waiting Invoice',
  INVOICED: 'Invoiced',
  PARTIAL_PAID: 'Partial Paid',
  PAID: 'Paid',
};

export const invoiceStatusColor: Record<InvoiceStatus, string> = {
  NONE: 'text-gray-400',
  WAITING_INVOICE: 'bg-yellow-100 text-yellow-700',
  INVOICED: 'bg-blue-100 text-blue-700',
  PARTIAL_PAID: 'bg-purple-100 text-purple-700',
  PAID: 'bg-green-100 text-green-700',
};
