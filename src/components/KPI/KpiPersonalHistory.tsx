import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/Table/DataTable';
import { akhirBulan, awalBulan, fetchRiwayatPribadi } from '@/services/kpiProduksi';
import type { KpiHistoryCursor, KpiHistoryRow } from '@/types/kpi';
import { formatPcs } from './kpiFormat';

export function KpiPersonalHistory({ orangId, bulan, version }: { orangId:number; bulan:string; version:number }) {
  const [cursors,setCursors]=useState<(KpiHistoryCursor|null)[]>([null]);
  const [page,setPage]=useState(0);
  const [retry,setRetry]=useState(0);
  const key=`${orangId}|${bulan}|${page}|${retry}|${version}`;
  const [result,setResult]=useState<{key:string;rows:KpiHistoryRow[];next:KpiHistoryCursor|null;error:Error|null}|null>(null);
  const cursor=cursors[page];
  useEffect(()=>{
    let cancelled=false;
    void fetchRiwayatPribadi(awalBulan(bulan),akhirBulan(bulan),orangId,cursor).then(r=>{if(!cancelled)setResult({key,rows:r.data,next:r.next,error:r.error});}).catch((e:unknown)=>{if(!cancelled)setResult({key,rows:[],next:null,error:e instanceof Error?e:new Error('Gagal membaca riwayat.')});});
    return()=>{cancelled=true;};
  },[bulan,orangId,cursor,key]);
  const current=result?.key===key?result:null;
  return <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Riwayat Entry</CardTitle></CardHeader><CardContent className="space-y-3">
    {!current?<p className="text-sm text-muted-foreground">Memuat riwayat…</p>:current.error?<div role="alert"><p className="text-sm">{current.error.message}</p><Button variant="outline" size="sm" onClick={()=>setRetry(v=>v+1)}>Coba lagi riwayat</Button></div>:current.rows.length===0?<p className="text-sm text-muted-foreground">Belum ada entry pada bulan ini.</p>:<>
      <ul className="space-y-2 md:hidden">{current.rows.map(r=><li key={`${r.divisi}:${r.entryId}`} className="flex justify-between gap-2 rounded-md border p-3 text-sm"><span>{r.tanggal}<span className="block text-xs text-muted-foreground">{r.divisi==='finishing'?'Finishing':'Jahit'}</span></span><strong className="tabular-nums">{formatPcs(r.pcs)} pcs</strong></li>)}</ul>
      <div className="hidden md:block"><DataTable variant="plain" columns={[{key:'tanggal',label:'Tanggal',width:'160px'},{key:'sumber',label:'Sumber',width:'150px'},{key:'jumlah',label:'Jumlah',width:'150px'}]} data={current.rows.map(r=>({...r,id:`${r.divisi}:${r.entryId}`,sumber:r.divisi==='finishing'?'Finishing':'Jahit',jumlah:`${formatPcs(r.pcs)} pcs`}))} /></div>
    </>}
    <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={page===0||!current} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><span className="text-xs text-muted-foreground">Halaman {page+1}</span><Button size="sm" variant="outline" disabled={!current?.next} onClick={()=>{if(current?.next){setCursors(v=>[...v.slice(0,page+1),current.next]);setPage(p=>p+1);}}}>Berikutnya</Button></div>
  </CardContent></Card>;
}
