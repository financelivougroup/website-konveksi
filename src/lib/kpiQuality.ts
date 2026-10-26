import { deretHarian, tanggalHariIni } from './kpi.ts';
import type { KpiPeriodeData } from '../types/kpi.ts';
export interface KpiQualityIssue { code:string; count:number; message:string; tab:'target'|'tarif'|'biaya'|'libur'|'orang' }
export function kpiQuality(data:KpiPeriodeData,month:string,now:Date=new Date(),legacyCount=0):KpiQualityIssue[] {
  const entries=data.entries.filter(e=>e.tanggal.startsWith(month));
  const targets=data.targets.filter(t=>t.bulan===month);
  const result:KpiQualityIssue[]=[];
  const add=(code:string,count:number,message:string,tab:KpiQualityIssue['tab'])=>{if(count>0)result.push({code,count,message,tab});};
  add('missing-target',data.orang.filter(o=>o.aktif&&!targets.some(t=>t.orangId===o.orangId)).length,'Orang aktif belum memiliki target bulan ini.','target');
  add('missing-rate',entries.filter(e=>e.tarif===null).length,'Entry belum memiliki tarif lengkap.','tarif');
  add('legacy-rate',legacyCount,'Entry memakai baseline estimasi historis yang belum terverifikasi.','tarif');
  add('unmapped',entries.filter(e=>e.orangId===null).length,'Entry belum terhubung ke karyawan.','orang');
  add('entry-no-target',new Set(entries.filter(e=>e.orangId!==null&&!targets.some(t=>t.orangId===e.orangId)).map(e=>e.orangId)).size,'Penyetor belum memiliki target.','target');
  const today=tanggalHariIni(now);
  const days=deretHarian(entries,month,data.libur).filter(d=>!d.libur&&d.tanggal<today);
  add('workday-no-entry',days.filter(d=>d.pcs===0).length,'Hari kerja yang sudah lewat tidak memiliki setoran.','libur');
  add('team-zero',days.length>3&&entries.filter(e=>e.divisi==='penjahit').reduce((n,e)=>n+e.pcs,0)===0?1:0,'Produksi jahit masih nol setelah lebih dari tiga hari kerja.','target');
  const costs=data.targetBiayaPerBulan.get(month);
  add('missing-cost',(['penjahit','leader','finishing','total'] as const).filter(d=>!costs?.has(d)).length,'Target biaya/HPP belum lengkap.','biaya');
  return result;
}
