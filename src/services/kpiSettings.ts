import { supabase } from '@/lib/supabase';
import { akhirBulan } from '@/services/kpiProduksi';
export interface PriceComponent { key: string; value: number; label?: string }
export interface KpiPriceVersion { id: string; order_id: string; effective_from: string; components: PriceComponent[]; reason: string; revision: number; recorded_at: string }
export interface KpiBaseline { order_id: string; components: PriceComponent[]; observed_at: string }
export interface MonthStatus { bulan: string; status: 'terbuka' | 'final'; ditutup_pada: string | null; dibuka_pada: string | null }
export interface KpiAuditRow { id: number; table_name: string; record_id: string; action: string; actor: string; changed_at: string; reason: string; before_data: unknown; after_data: unknown }
export function kpiError(error: unknown): Error {
  const message=error instanceof Error?error.message:error&&typeof error==='object'&&'message' in error?String(error.message):'Pengaturan gagal diproses.';
  if(message.includes('KPI_FINALIZATION_PENDING_VERIFICATION'))return new Error('Finalisasi belum diaktifkan: pengujian transaksi bersamaan dan cascade belum lengkap.');
  if(message.includes('KPI_MONTH_FINAL'))return new Error('Bulan sudah final. Owner harus membuka kunci sebelum mengubah data.');
  if(message.includes('KPI_WRITE_BUSY')||message.includes('KPI_ISOLATION'))return new Error('Transaksi KPI lain sedang berjalan. Muat ulang lalu coba lagi.');
  if(message.includes('KPI_STALE_REVISION'))return new Error('Versi harga sudah berubah. Muat ulang sebelum menyimpan.');
  if(message.includes('KPI_FORBIDDEN'))return new Error('Akun ini tidak berhak melakukan perubahan tersebut.');
  return new Error(message);
}
export async function fetchKpiSettings(month:string) {
  const [baselines,versions,months,holidays,costs,audit,targets]=await Promise.all([
    supabase.from('kpi_price_baselines').select('*').order('order_id'),
    supabase.from('kpi_price_versions').select('*').order('effective_from',{ascending:false}),
    supabase.from('bulan_status').select('*').order('bulan',{ascending:false}),
    supabase.from('daftar_libur').select('*').gte('tanggal',`${month}-01`).lte('tanggal',akhirBulan(month)).order('tanggal'),
    supabase.from('target_biaya').select('*').eq('bulan',`${month}-01`),
    supabase.from('kpi_audit').select('*').order('id',{ascending:false}).limit(30),
    supabase.from('target_jahit').select('id,nama,posisi,target_monthly').eq('bulanTahun',month).order('nama'),
  ]);
  const error=[baselines,versions,months,holidays,costs,audit,targets].find(r=>r.error)?.error;
  if(error)throw kpiError(error);
  return {baselines:(baselines.data??[]) as KpiBaseline[],versions:(versions.data??[]) as KpiPriceVersion[],months:(months.data??[]) as MonthStatus[],holidays:holidays.data??[],costs:costs.data??[],audit:(audit.data??[]) as KpiAuditRow[],targets:targets.data??[]};
}
export async function saveKpiSetting(kind:'target'|'cost'|'holiday',data:Record<string,unknown>,reason:string) {
  const r=await supabase.rpc('kpi_save_setting',{p_kind:kind,p_data:data,p_reason:reason});if(r.error)throw kpiError(r.error);
}
export async function saveKpiPrice(input:{order:string;from:string;components:PriceComponent[];reason:string;id?:string;revision?:number}) {
  const r=await supabase.rpc('kpi_save_price_version',{p_order:input.order,p_from:input.from,p_components:input.components,p_reason:input.reason,p_id:input.id??null,p_revision:input.revision??null});if(r.error)throw kpiError(r.error);
}
export async function setKpiMonth(month:string,final:boolean,reason:string) {
  const r=await supabase.rpc('kpi_set_month',{p_bulan:`${month}-01`,p_final:final,p_reason:reason});if(r.error)throw kpiError(r.error);
}
export async function fetchKpiAudit(before:number|null) {
  let query=supabase.from('kpi_audit').select('*').order('id',{ascending:false}).limit(31);
  if(before!==null)query=query.lt('id',before);
  const r=await query;if(r.error)throw kpiError(r.error);
  return {rows:(r.data??[]).slice(0,30) as KpiAuditRow[],more:(r.data?.length??0)>30};
}
