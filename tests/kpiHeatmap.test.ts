import {test} from 'node:test';
import assert from 'node:assert/strict';
import {heatmapDays} from '../src/lib/kpiHeatmap.ts';
import type {KpiEntry} from '../src/lib/kpi.ts';
const now=new Date(2026,9,19);
const entries:KpiEntry[]=[
 {tanggal:'2026-09-30',orangId:7,orangNama:'Pekerja',divisi:'penjahit',pcs:20,tarif:100},
 {tanggal:'2026-10-01',orangId:7,orangNama:'Pekerja',divisi:'penjahit',pcs:10,tarif:0},
 {tanggal:'2026-10-01',orangId:8,orangNama:'Finisher',divisi:'finishing',pcs:99,tarif:500},
];
test('Heatmap keeps sources separate and excludes comparison month',()=>{
 const j=heatmapDays(entries,'2026-10','2026-10','penjahit',['2026-10-01'],now);
 const f=heatmapDays(entries,'2026-10','2026-10','finishing',['2026-10-01'],now);
 assert.equal(j.length,31);assert.equal(j.reduce((n,r)=>n+r.pcs,0),10);
 assert.equal(f.reduce((n,r)=>n+r.pcs,0),99);assert.equal(j[0].libur,true);assert.equal(j[19].future,true);
});
test('Heatmap fixed bands do not recolor with metric maximum',()=>{
 assert.equal(heatmapDays(entries,'2026-10','2026-10','penjahit',[],now)[0].level,1);
 assert.equal(heatmapDays(entries,'2026-10','2026-10','finishing',[],now)[0].level,4);
});
test('Heatmap calendar supports leap year and invalid range rejection',()=>{
 assert.equal(heatmapDays([],'2028-02','2028-02','penjahit',[],new Date(2028,2,1)).length,29);
 assert.throws(()=>heatmapDays([],'2026-13','2026-12','penjahit',[],now),/valid/);
});
