const CLIENT_CODE_MAP: Record<string, string> = {
  Livou: 'LVU',
  Cassca: 'CSC',
};

export function clientCodeFromBrand(brand: string): string {
  const code = CLIENT_CODE_MAP[brand];
  if (!code) throw new Error(`Unknown client brand: ${brand}. Add it to CLIENT_CODE_MAP.`);
  return code;
}

export type BillingType = 'mass_production' | 'sample_production';

export function billingTypeCode(billingType: BillingType): 'MP' | 'SP' {
  if (billingType === 'mass_production') return 'MP';
  if (billingType === 'sample_production') return 'SP';
  throw new Error(`Invalid billing type: ${billingType}`);
}

export function formatInvoiceDateSegment(dateStr: string): string {
  if (!dateStr) throw new Error('invoice date is required');
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) throw new Error(`invalid invoice date: ${dateStr}`);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

export interface BuildInvoiceCodeParams {
  billingTypeCodeValue: 'MP' | 'SP';
  clientCode: string;
  invoiceDate: string;
  sequence: number;
}

export function buildInvoiceCode(params: BuildInvoiceCodeParams): string {
  const seq = String(params.sequence).padStart(3, '0');
  return `INV/${params.billingTypeCodeValue}/${params.clientCode}/${formatInvoiceDateSegment(params.invoiceDate)}/${seq}`;
}

export function sanitizeInvoiceCodeForFile(invoiceCode: string): string {
  return invoiceCode.replace(/\//g, '_');
}