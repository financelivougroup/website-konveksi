// ===== Pipeline Production Types =====

export type ProductionStatus =
  | 'CUTTING_PENDING'
  | 'CUTTING_COMPLETE'
  | 'SEWING_IN_PROGRESS'
  | 'SEWING_COMPLETE'
  | 'FINISHING_IN_PROGRESS'
  | 'FINISHING_COMPLETE';

export type InvoiceStatus =
  | 'NONE'
  | 'WAITING_INVOICE'
  | 'INVOICED'
  | 'PARTIAL_PAID'
  | 'PAID';

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
  status: 'PLANNING' | 'PULLED' | 'CANCELLED';
  createdBy: string;
  createdAt: string;
  pulledAt?: string;
  pulledBy?: string;
}

export interface WorkOrder {
  id: string;
  workCode: string;
  sourceOrderId: string;
  productNote: string;
  productNoteFull: string;
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

export type AppRole = 'owner' | 'admin' | 'inventory' | 'spv_konveksi' | 'finance';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  avatar: string;
}

// Status display helpers
export const productionStatusLabel: Record<ProductionStatus, string> = {
  CUTTING_PENDING: 'Cutting Pending',
  CUTTING_COMPLETE: 'Cutting Complete',
  SEWING_IN_PROGRESS: 'Sewing In Progress',
  SEWING_COMPLETE: 'Sewing Complete',
  FINISHING_IN_PROGRESS: 'Finishing In Progress',
  FINISHING_COMPLETE: 'Finished',
};

export const productionStatusColor: Record<ProductionStatus, string> = {
  CUTTING_PENDING: 'bg-blue-100 text-blue-700',
  CUTTING_COMPLETE: 'bg-cyan-100 text-cyan-700',
  SEWING_IN_PROGRESS: 'bg-amber-100 text-amber-700',
  SEWING_COMPLETE: 'bg-orange-100 text-orange-700',
  FINISHING_IN_PROGRESS: 'bg-pink-100 text-pink-700',
  FINISHING_COMPLETE: 'bg-green-100 text-green-700',
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
