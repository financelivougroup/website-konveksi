import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kpiQuality} from '../src/lib/kpiQuality.ts';
import {tentukanRute} from '../src/lib/kpiRoute.ts';
import type {KpiPeriodeData} from '../src/types/kpi.ts';
function data():KpiPeriodeData{return {entries:[],orang:[{orangId:7,nama:'Fixture',divisi:'penjahit',aktif:true}],targets:[],targetPerOrang:new Map(),targetPerBulan:new Map(),targetPerBulanPerDivisi:new Map(),targetBiaya:new Map(),targetBiayaPerBulan:new Map(),bulanFinal:new Set(),libur:[]};}
test('Quality detects active employee without target and missing costs',()=>{const r=kpiQuality(data(),'2026-10',new Date(2026,9,19));assert.ok(r.some(i=>i.code==='missing-target'));assert.equal(r.find(i=>i.code==='missing-cost')?.count,4);});
test('Quality detects missing rates, unknown people, legacy and entry no target',()=>{const d=data();d.entries=[{tanggal:'2026-10-02',orangId:7,orangNama:'Fixture',divisi:'penjahit',pcs:1,tarif:null},{tanggal:'2026-10-02',orangId:null,orangNama:'Unknown',divisi:'penjahit',pcs:1,tarif:0}];const r=kpiQuality(d,'2026-10',new Date(2026,9,19),1);for(const c of ['missing-rate','unmapped','legacy-rate','entry-no-target'])assert.ok(r.some(i=>i.code===c),c);});
test('Future months do not create missing-entry warnings',()=>{const r=kpiQuality(data(),'2026-12',new Date(2026,9,19));assert.ok(!r.some(i=>i.code==='workday-no-entry'||i.code==='team-zero'));});
test('Zero cost/rate is not treated as missing',()=>{const d=data();d.entries=[{tanggal:'2026-10-02',orangId:7,orangNama:'Fixture',divisi:'penjahit',pcs:1,tarif:0}];d.targetBiayaPerBulan.set('2026-10',new Map([['total',0],['penjahit',0],['leader',0],['finishing',0]]));const r=kpiQuality(d,'2026-10',new Date(2026,9,19));assert.ok(!r.some(i=>i.code==='missing-rate'||i.code==='missing-cost'));});
test('Staff cannot enter settings route',()=>{assert.deepEqual(tentukanRute('/laporan/pengaturan',{orangId:7,bisaTim:false,punyaAkses:true}),{jenis:'alihkan',ke:'/laporan/orang/7'});});
test('Owner and finance settings role uses shared team permission',()=>{assert.deepEqual(tentukanRute('/laporan/pengaturan',{orangId:null,bisaTim:true,punyaAkses:true}),{jenis:'pengaturan'});});
