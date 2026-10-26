import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatKpiTeam, geserBulan, targetHpp } from '../src/lib/kpiTeam.ts';
import type { KpiPeriodeData, KpiTargetRow } from '../src/types/kpi.ts';
import type { Divisi, KpiEntry } from '../src/lib/kpi.ts';
const today = new Date(2026, 9, 19);
function fixture(): KpiPeriodeData {
  const targets: KpiTargetRow[] = [];
  for (const ym of ['2026-09', '2026-10']) for (const [id, nama, divisi, qty] of [[7,'Jahit','penjahit',164],[2,'Leader','leader',50],[8,'Finisher','finishing',100]] as const) targets.push({ targetId: targets.length + 1, bulan: ym, orangId:id, nama, divisi, targetPcs:qty, statusFinal:null });
  const entry = (month: string, orangId: number, divisi: KpiEntry['divisi'], pcs: number, tarif: number | null): KpiEntry => ({ tanggal: month + '-02', orangId, orangNama: '', divisi, pcs, tarif });
  return {
    entries: [entry('2026-09',7,'penjahit',100,10000),entry('2026-10',7,'penjahit',115,13000),entry('2026-10',2,'penjahit',40,3000),entry('2026-10',8,'finishing',25,2000)],
    orang:[{orangId:7,nama:'Jahit',divisi:'penjahit',aktif:true},{orangId:2,nama:'Leader',divisi:'leader',aktif:true},{orangId:8,nama:'Finisher',divisi:'finishing',aktif:true}],
    targets, targetPerOrang:new Map([[7,328],[2,100],[8,200]]),targetPerBulan:new Map([['2026-09',214],['2026-10',214]]),
    targetPerBulanPerDivisi:new Map(['2026-09','2026-10'].map((ym) => [ym,new Map<Divisi,number>([['penjahit',164],['leader',50],['finishing',100]])])),
    targetBiaya:new Map(),targetBiayaPerBulan:new Map(['2026-09','2026-10'].map((ym) => [ym,new Map<Divisi|'total',number>([['penjahit',ym==='2026-09'?10000:12000],['leader',3000],['finishing',2000],['total',ym==='2026-09'?15000:17000]])])),
    bulanFinal:new Set(['2026-09']),libur:[],
  };
}
test('Team monthly excludes previous month and finishing from sewing gauge', () => {
  const r=buatKpiTeam(fixture(),'2026-10','bulan',today);
  assert.equal(r.jahit.current,155); assert.equal(r.jahit.goal,214);
  assert.equal(r.finishing.current,25); assert.equal(r.finishing.goal,100);
  assert.equal(r.jahitPerOrang.find((p)=>p.orangId===7)?.current,115);
  assert.equal(r.jahitPerOrang.find((p)=>p.orangId===7)?.goal,164);
});
test('HPP includes leader and finishing but uses sewing pcs as divisor', () => {
  const r=buatKpiTeam(fixture(),'2026-10','bulan',today);
  assert.equal(r.hpp.totalUpah,115*13000+40*3000+25*2000);
  assert.equal(r.hpp.pcsSewing,155); assert.equal(r.hpp.perPcs,r.hpp.totalUpah/155);
});
test('Current-month costs are shown, not hidden until month closes', () => {
  const r=buatKpiTeam(fixture(),'2026-10','akumulasi',today);
  assert.ok(r.bulananHpp.find((p)=>p.bulan==='2026-10')?.realisasi);
  assert.equal(r.bulananUpah.find((p)=>p.bulan==='2026-10'&&p.divisi==='finishing')?.realisasi,2000);
});
test('Accumulation includes all months without mixing finishing targets', () => {
  const r=buatKpiTeam(fixture(),'2026-10','akumulasi',today);
  assert.equal(r.jahit.current,255); assert.equal(r.jahit.goal,428);
  assert.equal(r.finishing.current,25); assert.equal(r.finishing.goal,200);
  assert.equal(r.hppTarget,16000);
  assert.equal(r.jahitPerOrang.find((p)=>p.orangId===7)?.goal,328);
});
test('Target cost missing in a weighted month remains unknown',()=>{
  const d=fixture(); d.targetBiayaPerBulan.delete('2026-09');
  assert.equal(buatKpiTeam(d,'2026-10','akumulasi',today).hppTarget,null);
});
test('Cost zero is distinct from missing',()=>{
  assert.equal(targetHpp(new Map([['total',0]])),0);
  assert.equal(targetHpp(new Map([['penjahit',0],['leader',0],['finishing',0]])),0);
  assert.equal(targetHpp(new Map([['penjahit',0]])),null);
});
test('Unknown rates retain a missing indicator without fabricating a full cost',()=>{
  const d=fixture(); d.entries.find((e)=>e.orangId===8)!.tarif=null;
  const r=buatKpiTeam(d,'2026-10','bulan',today);
  assert.equal(r.hpp.tarifKosong,1); assert.equal(r.finishingPerOrang[0].upahPerPcs,null);
});
test('Targets without linked employees still count in Team goal',()=>{
  const d=fixture(); d.targets.push({targetId:100,bulan:'2026-10',orangId:null,nama:'Legacy',divisi:'penjahit',targetPcs:30,statusFinal:null});
  assert.equal(buatKpiTeam(d,'2026-10','bulan',today).jahit.goal,244);
});
test('Attention ignores met targets and preserves ascending attainment',()=>{
  const d=fixture(); d.targets.find((t)=>t.bulan==='2026-10'&&t.orangId===2)!.targetPcs=10;
  const r=buatKpiTeam(d,'2026-10','bulan',today);
  assert.ok(!r.perhatian.some((p)=>p.orangId===2));
  assert.equal(r.perhatian[0]?.orangId,8);
});
test('Empty or zero-target data stays finite',()=>{
  const d=fixture();d.entries=[];d.targets=[];d.targetPerBulanPerDivisi.clear();
  const r=buatKpiTeam(d,'2026-10','bulan',today);
  assert.equal(r.jahit.current,0);assert.equal(r.jahit.goal,0);assert.equal(r.hpp.perPcs,null);assert.equal(r.jahit.ngebut.perHari,0);
});
test('Finishing-only period still appears independently',()=>{
  const d=fixture();d.entries=d.entries.filter((e)=>e.divisi==='finishing');
  const r=buatKpiTeam(d,'2026-10','bulan',today);
  assert.equal(r.jahit.current,0);assert.equal(r.finishing.current,25);assert.equal(r.hpp.perPcs,null);
});
test('Previous month has separate targets and comparable workday date',()=>{
  const r=buatKpiTeam(fixture(),'2026-10','bulan',today);
  assert.equal(r.perbandingan?.sebelumnya.current,100);assert.equal(r.perbandingan?.sebelumnya.goal,214);
  assert.equal(r.perbandingan?.sparkline.length,19);
});
test('Zero tariffs yield a real zero HPP rather than missing',()=>{
  const d=fixture(); d.entries.forEach(e=>{e.tarif=0;});
  assert.equal(buatKpiTeam(d,'2026-10','bulan',today).hpp.perPcs,0);
});
test('Final status uses actual attainment',()=>{
  const d=fixture(); d.bulanFinal.add('2026-10');
  assert.equal(buatKpiTeam(d,'2026-10','bulan',today).jahit.status,'Tidak capai target');
});
test('Future-dated entry does not inflate Team production HPP or accumulation',()=>{
  const d=fixture();d.entries.push({tanggal:'2026-10-25',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:999,tarif:99999});
  const m=buatKpiTeam(d,'2026-10','bulan',today);
  const a=buatKpiTeam(d,'2026-10','akumulasi',today);
  assert.equal(m.jahit.current,155);assert.equal(m.hpp.pcsSewing,155);assert.equal(a.jahit.current,255);
});
test('Historical Team does not borrow current-month pace or truncate comparison month',()=>{
  const d=fixture();d.entries.push({tanggal:'2026-08-25',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:50,tarif:10000});
  const r=buatKpiTeam(d,'2026-09','bulan',today);
  assert.equal(r.jahit.rataRataHariKerja,0);
  assert.equal(r.perbandingan?.sebelumnya.current,50);
  assert.equal(r.perbandingan?.sebelumnya.sisaHariKerja,0);
});
test('Month shifting handles year boundary',()=>{
  assert.equal(geserBulan('2026-01',-1),'2025-12'); assert.equal(geserBulan('2026-12',1),'2027-01');
});
