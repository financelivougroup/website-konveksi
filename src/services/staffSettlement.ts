import { supabase } from '@/lib/supabase';

export interface SettlementEntry {
  id:string; date:string; inputAt:string; pcs:number; rate:number|null; extra:number;
  cost:number|null; benefit:number|null; provenance:string|null;
  productNote:string|null; product:string|null; warna:string|null;
}
export interface SettlementMonth {
  month:string; target:number|null; actual:number; cost:number|null; benefit:number|null;
  extra:number; salary:number; paid:number; debt:number|null; payable:number|null;
  debtBeforeBenefit:number|null; benefitOffset:number|null; grossRemaining:number|null;
  missing_rate:number; missing_target:boolean; identity_issue:boolean; is_final:boolean;
  salaryMissing:boolean; entries:SettlementEntry[];
}
export interface SettlementPayment {
  id:string; expense_id:number|null; original_expense_id?:number|null; paid_date:string;
  amount:number; cutoff_month:string; reason:string; voided_at:string|null;
  allocations:{month:string;amount:number}[];
}
export interface StaffSettlement {
  staffId:number; nama:string; posisi:string|null; months:SettlementMonth[];
  payments:SettlementPayment[]; cost:number|null; salary:number; benefit:number|null;
  paid:number; debt:number|null; payable:number|null; finalPayable:number;
  debtBeforeBenefit:number|null; benefitOffset:number|null; grossRemaining:number|null;
  cutoff:string|null; complete:boolean; fingerprint:string; enabled:boolean;
}
export function applySettlementMonths<T extends {nama:string;bulan_tahun:string;realisasiCostPosisi:number;extraProduction:number;benefitAmount:number}>(rows:T[],people:StaffSettlement[]):T[] {
  return rows.map(row=>{
    const matches=people.filter(person=>person.nama===row.nama);
    const month=matches.length===1?matches[0].months.find(m=>m.month.slice(0,7)===row.bulan_tahun):undefined;
    return {...row,...(month ? {realisasiMonthly:month.actual} : {}),realisasiCostPosisi:month?.cost??Number.NaN,extraProduction:month?.extra??row.extraProduction,benefitAmount:month?.benefit??Number.NaN};
  });
}
function settlementError(cause:unknown):Error {
  const message=cause&&typeof cause==='object'&&'message' in cause?String(cause.message):'Saldo benefit gagal diproses.';
  if(message.includes('PENDING_VERIFICATION'))return new Error('Pembayaran belum diaktifkan: verifikasi transaksi belum lengkap.');
  if(message.includes('STALE_BALANCE'))return new Error('Saldo berubah. Muat ulang sebelum membayar.');
  if(message.includes('INSUFFICIENT_FINAL_BALANCE'))return new Error('Saldo final tidak mencukupi atau tanggal bayar mendahului akhir periode.');
  if(message.includes('BUSY'))return new Error('Transaksi lain sedang berjalan. Coba lagi setelah memuat ulang.');
  if(message.includes('FORBIDDEN'))return new Error('Hanya Owner dan Finance yang dapat mengakses pembayaran benefit.');
  if(message.includes('USE_SETTLEMENT_ACTION'))return new Error('Gunakan rincian Benefit di Target Jahit untuk koreksi pembayaran ini.');
  return new Error(message);
}
export async function fetchStaffSettlements():Promise<{data:StaffSettlement[];error:Error|null}> {
  try {
    const {data,error}=await supabase.rpc('staff_settlement_read');
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Respons saldo tidak valid.');
    return {data:data as StaffSettlement[],error:null};
  }catch(error){return {data:[],error:settlementError(error)};}
}
export async function payBenefit(input:{staffId:number;amount:number;paidDate:string;reason:string;requestId:string;fingerprint:string}) {
  const {data,error}=await supabase.rpc('staff_benefit_pay',{p_staff:input.staffId,p_amount:input.amount,p_paid_date:input.paidDate,p_reason:input.reason,p_request:input.requestId,p_fingerprint:input.fingerprint});
  if(error)throw settlementError(error);
  return data;
}
export async function voidBenefit(paymentId:string,reason:string) {
  const {error}=await supabase.rpc('staff_benefit_void',{p_payment:paymentId,p_reason:reason});
  if(error)throw settlementError(error);
}
