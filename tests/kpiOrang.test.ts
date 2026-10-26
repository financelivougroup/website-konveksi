import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatKpiOrang, ringkasUpahPribadi } from '../src/lib/kpiOrang.ts';
import type { KpiPeriodeData } from '../src/types/kpi.ts';
const today=new Date(2026,9,19);
function fixture():KpiPeriodeData {return {
  orang:[{orangId:7,nama:'Jahit',divisi:'penjahit',aktif:true},{orangId:8,nama:'Finisher',divisi:'finishing',aktif:true}],
  entries:[{tanggal:'2026-10-19',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:10,tarif:null},{tanggal:'2026-10-18',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:5,tarif:null},{tanggal:'2026-09-02',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:20,tarif:null},{tanggal:'2026-10-19',orangId:7,orangNama:'Jahit',divisi:'finishing',pcs:999,tarif:null},{tanggal:'2026-10-19',orangId:8,orangNama:'Finisher',divisi:'finishing',pcs:30,tarif:null}],
  targets:[{targetId:1,bulan:'2026-10',orangId:7,nama:'Jahit',divisi:'penjahit',targetPcs:100,statusFinal:null},{targetId:2,bulan:'2026-09',orangId:7,nama:'Jahit',divisi:'penjahit',targetPcs:80,statusFinal:null},{targetId:3,bulan:'2026-10',orangId:8,nama:'Finisher',divisi:'finishing',targetPcs:60,statusFinal:null}],
  targetPerOrang:new Map(),targetPerBulan:new Map(),targetPerBulanPerDivisi:new Map(),targetBiaya:new Map(),targetBiayaPerBulan:new Map(),bulanFinal:new Set(),libur:[],
};}
test('Personal excludes other people and same-person foreign-source entries',()=>{const m=buatKpiOrang(fixture(),7,'2026-10',today);assert.equal(m.ringkas.current,15);assert.equal(m.ringkas.goal,100);assert.equal(m.today.pcs,10);});
test('Finisher personal reads finishing only',()=>{const m=buatKpiOrang(fixture(),8,'2026-10',today);assert.equal(m.ringkas.current,30);assert.equal(m.sumber,'finishing');});
test('Daily target based on remaining before today, not double-subtracting today',()=>{const m=buatKpiOrang(fixture(),7,'2026-10',today);assert.equal(m.today.target,95/m.ringkas.sisaHariKerja);assert.equal(m.today.sisa,Math.max(0,m.today.target-10));});
test('Historical month never claims historical setoran as today',()=>{const m=buatKpiOrang(fixture(),7,'2026-09',today);assert.equal(m.today.berlaku,false);assert.equal(m.today.pcs,0);assert.equal(m.ringkas.current,20);});
test('Future days are unobserved, calendar remains complete',()=>{const m=buatKpiOrang(fixture(),7,'2026-10',today);assert.equal(m.harian.length,31);assert.equal(m.harian.find(d=>d.tanggal==='2026-10-20')?.observed,false);});
test('Holiday target zero with clear holiday flag',()=>{const d=fixture();d.libur=['2026-10-19'];const m=buatKpiOrang(d,7,'2026-10',today);assert.equal(m.today.libur,true);assert.equal(m.today.target,0);});
test('Monthly history and cumulative goal use own target rows',()=>{const m=buatKpiOrang(fixture(),7,'2026-10',today);assert.equal(m.bulanan.length,2);assert.equal(m.akumulasi.current,35);assert.equal(m.akumulasi.goal,180);assert.equal(m.akumulasi.ngebut.perHari,145/m.ringkas.sisaHariKerja);});
test('Past month not final unless explicitly locked',()=>{const d=fixture();let m=buatKpiOrang(d,7,'2026-09',today);assert.equal(m.bulanan[0].final,false);d.bulanFinal.add('2026-09');m=buatKpiOrang(d,7,'2026-09',today);assert.equal(m.bulanan[0].status,'Tidak capai target');});
test('Goal zero remains finite',()=>{const d=fixture();d.targets=[];const m=buatKpiOrang(d,7,'2026-10',today);assert.equal(m.ringkas.progress,0);assert.equal(m.today.target,0);assert.equal(m.akumulasi.ngebut.perHari,0);});
test('Cumulative surplus remains >100 percent without negative remaining target',()=>{const d=fixture();d.targets.forEach(t=>{t.targetPcs=1;});const m=buatKpiOrang(d,7,'2026-10',today);assert.ok(m.akumulasi.progress>1);assert.equal(m.akumulasi.sisa,0);});
test('Own zero wages distinct from entirely unknown and partial estimates',()=>{assert.equal(ringkasUpahPribadi([]).estimasi,null);assert.equal(ringkasUpahPribadi([{bulan:'2026-10',estimasi:0,pcsTotal:5,pcsBertarif:5,entryTanpaTarif:0,pcsTanpaTarif:0}]).estimasi,0);const r=ringkasUpahPribadi([{bulan:'2026-09',estimasi:100,pcsTotal:5,pcsBertarif:3,entryTanpaTarif:1,pcsTanpaTarif:2},{bulan:'2026-10',estimasi:null,pcsTotal:10,pcsBertarif:0,entryTanpaTarif:2,pcsTanpaTarif:10}]);assert.equal(r.estimasi,100);assert.equal(r.pcsTanpaTarif,12);});
test('Future-dated entries do not inflate current or accumulated production',()=>{const d=fixture();d.entries.push({tanggal:'2026-10-25',orangId:7,orangNama:'Jahit',divisi:'penjahit',pcs:999,tarif:null});const m=buatKpiOrang(d,7,'2026-10',today);assert.equal(m.ringkas.current,15);assert.equal(m.akumulasi.current,35);});
test('Target-only months remain in personal history',()=>{const d=fixture();d.entries=[];const m=buatKpiOrang(d,7,'2026-10',today);assert.equal(m.bulanan.length,2);assert.equal(m.bulanan[1].current,0);});
