import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateMonthlyExtra,settlementBalance} from '../src/lib/staffSettlement.ts';
const entry=(id:string,pcs:number,rate:number|null)=>({id,pcs,rate,date:'2026-10-20',inputAt:'2026-10-20T08:00:00Z'});
test('target 50 actual 90 requires no planning detail to earn cost and 40 extra',()=>{
  const [r]=allocateMonthlyExtra([entry('a',90,6000)],50);
  assert.equal(r.cost,540000);assert.equal(r.extra,40);assert.equal(r.benefit,240000);
});
test('different rates split the crossing entry in stable report/input/id order',()=>{
  const r=allocateMonthlyExtra([entry('b',40,2000),entry('a',30,1000)],50);
  assert.deepEqual(r.map(x=>[x.id,x.extra,x.benefit]),[['a',0,0],['b',20,40000]]);
  assert.equal(r.reduce((s,x)=>s+x.pcs,0),70);
});
test('no target is not automatically extra, missing rate is not zero',()=>{
  assert.equal(allocateMonthlyExtra([entry('a',90,1000)],null)[0].extra,0);
  assert.equal(allocateMonthlyExtra([entry('a',90,null)],50)[0].cost,null);
  assert.equal(allocateMonthlyExtra([entry('a',90,0)],50)[0].benefit,0);
});
test('confirmed Arief policy deducts benefit from 460k debt to 220k',()=>{
  assert.deepEqual(settlementBalance(540000,1000000,240000,0),{debtBeforeBenefit:460000,benefitOffset:240000,debt:220000,grossRemaining:240000,payable:0});
});
test('offset first, cash payment consumes only the remaining benefit',()=>{
  assert.deepEqual(settlementBalance(540000,640000,240000,0),{debtBeforeBenefit:100000,benefitOffset:100000,debt:0,grossRemaining:240000,payable:140000});
  assert.equal(settlementBalance(540000,640000,240000,50000).payable,90000);
  assert.equal(settlementBalance(540000,640000,240000,140000).payable,0);
  assert.equal(settlementBalance(540000,640000,240000,90000).payable,50000);
});
test('cash already transferred cannot also offset debt; corrections can restore debt',()=>{
  assert.equal(settlementBalance(540000,1000000,240000,100000).debt,320000);
  assert.equal(settlementBalance(70000,80000,20000,20000).debt,10000);
  assert.equal(settlementBalance(70000,80000,20000,30000).debt,20000);
});
test('no initial debt pays remaining bonus; zero benefit leaves debt unchanged',()=>{
  assert.equal(settlementBalance(90000,80000,40000,0).payable,40000);
  assert.equal(settlementBalance(90000,80000,40000,10000).payable,30000);
  assert.equal(settlementBalance(90000,100000,0,0).debt,10000);
});
test('month snapshots are recomputed, not summed or offset again on refresh',()=>{
  const values=[[540000,1000000,240000],[1640000,2000000,340000],[1940000,2000000,390000]];
  assert.deepEqual(values.map(([r,s,b])=>settlementBalance(r,s,b,0).debt),[220000,20000,0]);
  const r=settlementBalance(1940000,2000000,390000,0);
  assert.equal(r.payable,330000);
  assert.deepEqual(settlementBalance(1940000,2000000,390000,0),r);
});
