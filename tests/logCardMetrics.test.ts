import{test}from'node:test';import assert from'node:assert/strict';
import{logCardMetrics}from'../src/lib/logDashboard.ts';import{hariKerjaRentang}from'../src/lib/kpi.ts';
import type{LaporanRow}from'../src/lib/laporanCompute.ts';
const today=new Date(2026,9,21);const f={bulan:'2026-10',produk:'',pic:''};
const rows:LaporanRow[]=[{tanggal:'2026-10-01',produk:'A',warna:'',size:'',qty:90,pic:'Arief',bukti:''}];
const targets=[{id:1,nama:'Arief',bulan_tahun:'2026-10',target_monthly:50},{id:2,nama:'Other',bulan_tahun:'2026-10',target_monthly:150},{id:3,nama:'Arief',bulan_tahun:'2026-09',target_monthly:100},{id:4,nama:'Arief',bulan_tahun:'2026-11',target_monthly:500}];
test('all target people count even without reports; PIC filters full target',()=>{
 const a=logCardMetrics(rows,f,targets,[],today);assert.equal(a.target,200);assert.equal(a.percent,45);assert.equal(a.remaining,110);
 const b=logCardMetrics(rows,{...f,pic:'Arief'},targets,[],today);assert.equal(b.percent,180);assert.equal(b.remaining,0);
});
test('accumulation includes prior targets but excludes future, code/product do not prorate',()=>{
 const a=logCardMetrics(rows,{...f,bulan:'',produk:'A'},targets,[],today);assert.equal(a.target,300);assert.equal(a.percent,30);
 assert.equal(logCardMetrics([...rows,...rows],f,targets,[],today).target,200);
 assert.equal(logCardMetrics(rows,{...f,produk:'Missing'},targets,[],today).target,200);
});
test('missing and zero target distinct with no division by zero',()=>{
 assert.equal(logCardMetrics(rows,{...f,pic:'Finisher'},targets,[],today).target,null);
 const a=logCardMetrics(rows,f,[{...targets[0],target_monthly:0}],[],today);assert.equal(a.target,0);assert.equal(a.percent,null);
 assert.equal(logCardMetrics(rows,f,[{...targets[0],target_monthly:NaN}],[],today).target,null);
 assert.equal(logCardMetrics(rows,f,[{...targets[0],target_monthly:-1}],[],today).target,null);
});
test('average counts elapsed workdays including gaps; weekends/duplicate holidays handled once',()=>{
 assert.equal(hariKerjaRentang('2026-10-01','2026-10-07',['2026-10-02','2026-10-02']),5);
 const a=logCardMetrics(rows,f,targets,['2026-10-02'],new Date(2026,9,7));assert.equal(a.workdays,5);assert.equal(a.average,18);
});
test('past month uses full month, all months first actual through today, future unavailable',()=>{
 const old=[{...rows[0],tanggal:'2026-09-15'}];const a=logCardMetrics(old,{...f,bulan:'2026-09'},targets,[],today);assert.equal(a.to,'2026-09-30');assert.equal(a.workdays,26);
 const b=logCardMetrics([...old,...rows],{...f,bulan:'',pic:'Arief',produk:'A'},targets,[],today);assert.equal(b.from,'2026-09-15');assert.equal(b.to,'2026-10-21');
 const picScoped=logCardMetrics([...old,...rows],{...f,bulan:'',pic:'Arief'},targets,[],today);
 assert.equal(picScoped.average,180/(hariKerjaRentang('2026-09-15','2026-10-21',[])));
 assert.equal(logCardMetrics(rows,{...f,bulan:'2026-11'},targets,[],today).average,null);
});
test('invalid undated and future actuals never inflate average; all holidays unavailable',()=>{
 const bad=[...rows,{...rows[0],tanggal:'',qty:999},{...rows[0],tanggal:'2026-02-30',qty:999},{...rows[0],tanggal:'2026-10-29',qty:999}];
 const a=logCardMetrics(bad,{...f,bulan:''},targets,[],today);assert.equal(a.excludedDates,3);assert.equal(a.average,90/a.workdays);
 assert.equal(logCardMetrics(rows,f,targets,['2026-10-01'],new Date(2026,9,1)).average,null);
});
