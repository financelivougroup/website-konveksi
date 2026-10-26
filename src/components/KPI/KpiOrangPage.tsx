import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AppSelect } from '@/components/AppSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/reui/badge';
import { DataTable } from '@/components/Table/DataTable';
import { buatKpiOrang, ringkasUpahPribadi } from '@/lib/kpiOrang';
import { formatMonthYearFromYm } from '@/lib/monthYear';
import type { KpiScope } from '@/types/kpi';
import { KpiEmptyState, KpiErrorState, KpiHeader, KpiMonthChips, KpiSkeleton } from './KpiShell';
import { KpiStatCard } from './KpiCards';
import { KpiGauge, KpiTrendChart } from './KpiTeamCharts';
import { KpiPersonalChart } from './KpiPersonalChart';
import { KpiPersonalHistory } from './KpiPersonalHistory';
import { useKpiBulan } from './useKpiBulan';
import { useKpiPersonalData } from './useKpiPersonalData';
import { formatPcs, formatPersen } from './kpiFormat';

const rupiah=(v:number|null)=>v===null?'Tarif belum diisi':`Rp${Math.round(v).toLocaleString('id-ID')}`;
type View='harian'|'bulanan'|'akumulasi';

export function KpiOrangPage({scope,orangId}:{scope:KpiScope;orangId:number}) {
  const navigate=useNavigate();
  const [view,setView]=useState<View>('harian');
  const {bulan,setBulan,tersedia,memuat,error:errorBulan,muatUlang}=useKpiBulan(true);
  const personal=useKpiPersonalData(scope,orangId,bulan,tersedia,!memuat&&!errorBulan);
  const model=useMemo(()=>personal.data?buatKpiOrang(personal.data,orangId,bulan):null,[personal.data,orangId,bulan]);
  const refresh=()=>{muatUlang();personal.refresh();};
  const own=scope.orangId===orangId;
  const nama=model?.orang?.nama??(own?scope.nama:null)??'Karyawan';
  const divisi=model?.orang?.divisi??(own?scope.divisi:null);
  const error=errorBulan??personal.error;
  const mode=view==='akumulasi'?'akumulasi':'bulan';
  const monthWages=personal.wages.filter(r=>r.bulan===bulan);
  const wage=ringkasUpahPribadi(view==='akumulasi'?personal.wages:monthWages);
  return <div className={`min-w-0 px-4 pb-5 pt-4 sm:px-6 ${mode==='bulan'?'kpi-mode-bulan':'kpi-mode-akumulasi'}`}><div className="min-w-0 space-y-3">
    <KpiHeader judul={nama} subjudul={`${divisi==='finishing'?'Finishing':divisi==='leader'?'Leader':'Penjahit'} · ${formatMonthYearFromYm(bulan)}`} mode={mode} onModeChange={m=>setView(m==='akumulasi'?'akumulasi':'harian')} onRefresh={refresh} refreshing={memuat||personal.loading} tampilkanMode={scope.bisaTim} tampilan="navy" onKembali={scope.bisaTim?()=>navigate('/laporan/team'):undefined} aksi={scope.bisaTim?<Button asChild size="sm" variant="outline"><Link to="/laporan/pengaturan">Pengaturan</Link></Button>:undefined} />
    {scope.bisaTim&&personal.data&&<AppSelect label="Pilih orang" className="max-w-sm" value={String(orangId)} options={personal.data.orang.map(o=>({value:String(o.orangId),label:`${o.nama} · ${o.divisi}`}))} onValueChange={id=>navigate(`/laporan/orang/${id}`)} />}
    <KpiMonthChips bulan={bulan} onBulanChange={setBulan} tersedia={tersedia} tersembunyi={mode==='akumulasi'} />
    {error&&<KpiErrorState pesan={error.message} onRetry={refresh} sedangMencoba={memuat||personal.loading} />}
    {!error&&(personal.loading||memuat)&&<KpiSkeleton />}
    {!error&&model&&!model.orang&&<KpiEmptyState judul="Karyawan tidak ditemukan" deskripsi="ID karyawan ini tidak tersedia untuk akun Anda." />}
    {!error&&model?.orang&&<Tabs value={view} onValueChange={v=>setView(v as View)} className="min-w-0"><TabsList aria-label="Tampilan kinerja pribadi" className="w-full sm:w-auto"><TabsTrigger value="harian">Harian</TabsTrigger><TabsTrigger value="bulanan">Bulanan</TabsTrigger><TabsTrigger value="akumulasi">Akumulasi</TabsTrigger></TabsList>
      <TabsContent value="harian" className="space-y-3">
        <Card className="shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">{model.today.berlaku?'Hari ini':'Konteks bulan terpilih'}</CardTitle></CardHeader><CardContent>
          {model.today.berlaku?<><p className="text-3xl font-semibold tabular-nums">{formatPcs(model.today.pcs)} <span className="text-sm font-normal">pcs sudah disetor</span></p><p className="mt-2 text-sm">{model.ringkas.goal<=0?'Target belum ditetapkan':model.today.libur?'Hari ini libur · tidak ada target harian':`Target hari ini ${formatPcs(model.today.target)} pcs · sisa ${formatPcs(model.today.sisa)} pcs`}</p></>:<p className="text-sm text-muted-foreground">Bulan {formatMonthYearFromYm(bulan)} bukan bulan hari ini. Angka berikut adalah kinerja bulan terpilih, bukan setoran hari ini.</p>}
        </CardContent></Card>
        <KpiGauge title={`Progress ${model.sumber==='finishing'?'Finishing':'Produksi Jahit'}`} current={model.ringkas.current} goal={model.ringkas.goal} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><KpiStatCard label="Sisa Target Produksi" value={`${formatPcs(model.ringkas.sisaTarget)} pcs`} /><KpiStatCard label="Target Normal / Hari" value={`${formatPcs(model.ringkas.targetNormalPerHari)} pcs`} /><KpiStatCard label="Target Ngebut / Hari" value={`${formatPcs(model.ringkas.ngebut.perHari)} pcs`} hint={model.ringkas.ngebut.habis?'Hari kerja habis':`${model.ringkas.sisaHariKerja} hari kerja tersisa`} /></div>
        <p className="rounded-md bg-muted p-3 text-sm">{model.ringkas.goal<=0?'Target bulan ini belum ditetapkan.':model.ringkas.sisaTarget===0?'Target tercapai. Setoran berikutnya menjadi surplus.':model.ringkas.ngebut.habis?`Masih ${formatPcs(model.ringkas.sisaTarget)} pcs · Hari kerja habis.`:`Tinggal ${formatPcs(model.ringkas.sisaTarget)} pcs lagi, sekitar ${Math.ceil(model.ringkas.ngebut.perHari)} pcs/hari kerja sampai akhir bulan.`}</p>
        <KpiPersonalChart key={`${orangId}:${bulan}`} rows={model.harian} finishing={model.sumber==='finishing'} />
        <KpiPersonalHistory key={`${orangId}:${bulan}:${personal.version}`} orangId={orangId} bulan={bulan} version={personal.version} />
      </TabsContent>
      <TabsContent value="bulanan" className="space-y-3">
        <Card className="shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Progress Setoran per Bulan</CardTitle></CardHeader><CardContent className="space-y-4">{model.bulanan.length===0?<p className="text-sm text-muted-foreground">Belum ada target atau setoran bulanan.</p>:model.bulanan.map(r=><div key={r.bulan} className="space-y-1.5"><div className="flex flex-wrap justify-between gap-2 text-xs"><span>{formatMonthYearFromYm(r.bulan)}</span><span className="tabular-nums">{formatPcs(r.current)} / {formatPcs(r.goal)} pcs · {r.goal>0?formatPersen(r.progress):'Tanpa target'}</span></div><Progress value={Math.min(100,r.progress*100)} aria-label={`Setoran ${r.bulan}`} className="h-2 [&>div]:bg-[hsl(var(--kpi-realisasi))]" /></div>)}</CardContent></Card>
        <KpiTrendChart title={scope.bisaTim?'Biaya Upah (1 pcs) | Target vs Realisasi':'Estimasi Upah Sendiri (1 pcs) | Bulanan'} unit="rupiah" showTarget={scope.bisaTim} data={model.bulanan.map(r=>{const w=personal.wages.find(w=>w.bulan===r.bulan);return {bulan:r.bulan,realisasi:w&&w.estimasi!==null&&w.pcsBertarif>0?w.estimasi/w.pcsBertarif:null,target:scope.bisaTim?model.biayaBulanan.find(p=>p.bulan===r.bulan)?.target??null:null};})} />
        <Card className="min-w-0 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Rincian Kondisi Sisa Target</CardTitle></CardHeader><CardContent>
          <ul className="space-y-2 md:hidden">{model.bulanan.map(r=><li key={r.bulan} className="space-y-2 rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{formatMonthYearFromYm(r.bulan)}</strong><FinalBadge final={r.final} goal={r.goal} current={r.current} /></div><p className="text-xs">Sisa {formatPcs(r.sisaTarget)} pcs · Ngebut {formatPcs(r.ngebut.perHari)} pcs{r.ngebut.habis?' · Hari kerja habis':'/hari'}</p></li>)}</ul>
          <div className="hidden md:block"><DataTable variant="plain" columns={[{key:'label',label:'Bulan Tahun',width:'180px'},{key:'sisa',label:'Sisa Target',width:'150px'},{key:'ngebut',label:'Target Ngebut',width:'200px'},{key:'status',label:'Status Final',width:'200px',render:r=><FinalBadge final={Boolean(r.final)} goal={Number(r.goal)} current={Number(r.current)} />}]} data={model.bulanan.map(r=>({...r,id:r.bulan,label:formatMonthYearFromYm(r.bulan),sisa:`${formatPcs(r.sisaTarget)} pcs`,ngebut:`${formatPcs(r.ngebut.perHari)} pcs${r.ngebut.habis?' · Hari kerja habis':'/hari'}`}))} /></div>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="akumulasi" className="space-y-3"><p className="text-xs text-muted-foreground">{formatMonthYearFromYm(model.akumulasi.dari)} – {formatMonthYearFromYm(model.akumulasi.sampai)}</p><KpiGauge title="Progress Produksi | Akumulasi Pribadi" current={model.akumulasi.current} goal={model.akumulasi.goal} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><KpiStatCard label="Sisa Target Akumulasi" value={`${formatPcs(model.akumulasi.sisa)} pcs`} /><KpiStatCard label="Target Ngebut Akumulasi / Hari" value={`${formatPcs(model.akumulasi.ngebut.perHari)} pcs`} hint={model.akumulasi.ngebut.habis?'Hari kerja habis':'Dibagi sisa hari kerja bulan terpilih'} /></div></TabsContent>
    </Tabs>}
    {model?.orang&&<Card className="shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm">Estimasi Upah {view==='akumulasi'?'Akumulasi':formatMonthYearFromYm(bulan)}</CardTitle></CardHeader><CardContent className="space-y-2">{personal.wageLoading?<p className="text-sm">Memuat estimasi upah…</p>:personal.wageError?<><p role="alert" className="text-sm">{personal.wageError.message}</p><Button size="sm" variant="outline" onClick={personal.refresh}>Coba lagi upah</Button></>:<><p className="text-2xl font-semibold tabular-nums">{rupiah(wage.estimasi)}</p>{wage.entryTanpaTarif>0&&<p className="text-xs text-muted-foreground">Nilai sementara dari pcs bertarif; {formatPcs(wage.pcsTanpaTarif)} pcs dalam {wage.entryTanpaTarif} entry belum memiliki tarif lengkap.</p>}</>}<p className="text-xs text-muted-foreground">Menggunakan versi tarif order sesuai tanggal entry; bukan slip pembayaran. {personal.legacyRate?'Sebagian entry memakai baseline awal: estimasi historis belum terverifikasi.':'Versi tarif bertanggal digunakan bila tersedia.'}</p></CardContent></Card>}
  </div></div>;
}

function FinalBadge({final,goal,current}:{final:boolean;goal:number;current:number}) {
  return <Badge variant={!final||goal<=0?'outline':current>=goal?'success-light':'destructive'}>{!final?'Berjalan':goal<=0?'Tanpa target':current>=goal?'CAPAI TARGET':'TIDAK CAPAI TARGET'}</Badge>;
}
