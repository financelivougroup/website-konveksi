import { deretHarian,tanggalHariIni } from './kpi.ts';
import { geserBulan } from './kpiTeam.ts';
import type { KpiEntry } from './kpi.ts';
export function heatmapDays(entries:readonly KpiEntry[],fromMonth:string,toMonth:string,division:'penjahit'|'finishing',holidays:readonly string[],today:Date=new Date()) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(toMonth)||fromMonth>toMonth)throw new Error('Rentang heatmap tidak valid.');
  const result:{tanggal:string;pcs:number;libur:boolean;future:boolean;level:number}[]=[];
  const now=tanggalHariIni(today);const filtered=entries.filter(e=>e.divisi===division);
  let month=fromMonth;
  for(let n=0;month<=toMonth;n++) {
    if(n>=1200)throw new Error('Rentang heatmap terlalu panjang.');
    for(const day of deretHarian(filtered,month,holidays))result.push({...day,future:day.tanggal>now,level:day.pcs<=0?0:day.pcs<=10?1:day.pcs<=30?2:day.pcs<=60?3:4});
    month=geserBulan(month,1);
  }
  return result;
}
