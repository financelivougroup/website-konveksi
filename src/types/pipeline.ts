// ===== Pipeline Production Types =====

export type ProductionStatus =
  | 'NEW'
  | 'CUTTING'
  | 'PROGRESS'
  | 'FINISHED'
  | 'INVOICED';

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

export type BillingType = 'mass_production' | 'sample_production';

export interface InvoiceRow {
  id: string;
  workOrderId: string;
  registerPoId?: string;
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

export interface RegisterPoRow {
  id: string;
  productionOrderId: string;
  totalPerPcs: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPoComponentRow {
  id: string;
  registerPoId: string;
  key: string;
  label: string;
  value: number;
  sortOrder: number;
}

// Sejalan dengan batasan CHECK pada kolom public.profiles.role.
export type AppRole = 'owner' | 'finance' | 'inventory';

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
  CUTTING: 'Cutting',
  PROGRESS: 'Progress',
  FINISHED: 'Finished',
  INVOICED: 'Invoiced',
};

export const productionStatusColor: Record<ProductionStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CUTTING: 'bg-blue-100 text-blue-700',
  PROGRESS: 'bg-amber-100 text-amber-700',
  FINISHED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-purple-100 text-purple-700',
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
