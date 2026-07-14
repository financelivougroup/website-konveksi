export interface InvoiceFinancialInput {
  pcsLinked: number;
  unitPrice: number;
  rateManpower: number;
}

export interface InvoiceFinancials {
  totalAmount: number;
  rateOperational: number;
  totalIncomeManpower: number;
  totalIncomeOperational: number;
}

export function computeInvoiceFinancials(input: InvoiceFinancialInput): InvoiceFinancials {
  const totalAmount = input.pcsLinked * input.unitPrice;
  const rateOperational = input.unitPrice - input.rateManpower;
  const totalIncomeManpower = input.pcsLinked * input.rateManpower;
  const totalIncomeOperational = input.pcsLinked * rateOperational;
  return { totalAmount, rateOperational, totalIncomeManpower, totalIncomeOperational };
}

export interface FinanceValidationInput {
  hasAllRequiredInvoiceFields: boolean;
  hasCompletePaymentDetail: boolean;
  outstanding: number;
}

export type FinanceValidationStatus =
  | 'Need Register Invoice'
  | 'Collect Payment'
  | 'Partial Paid'
  | 'Paid';

export function computeFinanceValidation(input: FinanceValidationInput): FinanceValidationStatus {
  if (!input.hasAllRequiredInvoiceFields) return 'Need Register Invoice';
  if (!input.hasCompletePaymentDetail) return 'Collect Payment';
  if (input.outstanding > 0) return 'Partial Paid';
  return 'Paid';
}

export function computeOutstanding(totalAmount: number, paymentTotal: number): number {
  const raw = totalAmount - paymentTotal;
  return raw < 0 ? 0 : raw;
}