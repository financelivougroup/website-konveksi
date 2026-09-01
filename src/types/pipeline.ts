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

export type ProductionOrderLifecycle = 'PLANNING' | 'PULLED' | 'CANCELLED';

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

export interface OrderEntryOverview {
  id: string;
  productionCode: string;
  productId: string;
  product: string;
  brand: string;
  status: ProductionOrderLifecycle;
  createdBy: string;
  createdAt: string;
  pulledAt?: string | null;
  pulledBy?: string | null;
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
  productId: string;
  product: string;
  brand: string;
  status: ProductionOrderLifecycle;
  createdBy: string;
  createdAt: string;
  pulledAt?: string | null;
  pulledBy?: string | null;
  canEdit: boolean;
  structureLocked: boolean;
  editBlockReason?: string | null;
  variations: ProductionOrderVariation[];
  pricing: OrderPricing;
}

export interface OrderEntrySaveInput {
  id?: string;
  productionCode: string;
  productId: string;
  product: string;
  brand: string;
  variations: Array<Pick<ProductionOrderVariation, 'color' | 'size' | 'quantity'>>;
  components: Array<Pick<OrderPriceComponent, 'key' | 'value'>>;
  actor: string;
}

export interface WorkOrder {
  id: string;
  workCode: string;
  sourceOrderId: string;
  sourceVariationId?: string;
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
  workOrderId: string;
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
