import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import SewingEntryForm from '@/pages/SewingEntryForm';
import KancingEntryForm from '@/pages/KancingEntryForm';
import FinishingEntryForm from '@/pages/FinishingEntryForm';
import type { WorkOrder, CuttingRecord, SewingRecord, KancingRecord, FinishingRecord } from '@/types/pipeline';

const orders = [
  { id: 'ivory', workCode: 'WORK-IVORY', product: 'Odette', productNote: 'PO/SAME', warna: 'Ivory', size: 'M', quantity: 80, productionStatus: 'PROGRESS' },
  { id: 'champagne', workCode: 'WORK-CHAMPAGNE', product: 'Odette', productNote: 'PO/SAME', warna: 'Champagne', size: 'M', quantity: 32, productionStatus: 'NEW' },
  { id: 'partial', workCode: 'WORK-PARTIAL', product: 'Partial', quantity: 100, productionStatus: 'FINISHED' },
  { id: 'zero', workCode: 'WORK-ZERO', product: 'Zero order qty', quantity: 0, productionStatus: 'INVOICED' },
  { id: 'unstarted', workCode: 'WORK-UNSTARTED', product: 'Unstarted', quantity: 100, productionStatus: 'PROGRESS' },
] as WorkOrder[];
const cutting = [
  { workOrderId: 'ivory', totalCutting: 80 }, { workOrderId: 'champagne', totalCutting: 32 },
  { workOrderId: 'partial', totalCutting: 10 }, { workOrderId: 'partial', totalCutting: 100 },
  { workOrderId: 'zero', totalCutting: 40 },
] as CuttingRecord[];
const sewing = [
  { workOrderId: 'ivory', qtySelesai: 30 }, { workOrderId: 'ivory', qtySelesai: 50 },
  { workOrderId: 'partial', qtySelesai: 10 },
] as SewingRecord[];
const kancing = [
  { workOrderId: 'ivory', qtyKancing: 20 }, { workOrderId: 'ivory', qtyKancing: 30 },
  { workOrderId: 'partial', qtyKancing: 4 },
] as KancingRecord[];
const finishing = [{ workOrderId: 'partial', qtyFinishing: 4 }] as FinishingRecord[];

function assertCards(html: string, expected: string[]) {
  assert.deepEqual([...html.matchAll(/WO: (WORK-[A-Z]+)/g)].map((match) => match[1]), expected);
}

test('actual Sewing page shows only cutting balance per variation, including order qty zero', () => {
  const html = renderToStaticMarkup(<SewingEntryForm workOrders={orders} existingCuttingRecords={cutting} existingSewingRecords={sewing} />);
  assertCards(html, ['WORK-CHAMPAGNE', 'WORK-ZERO']);
  assert.ok(!html.includes('>Partial</button>'), 'ineligible product is not a recommendation');
});

test('actual Kancing page allows fully sewn and first partial sewing results', () => {
  const html = renderToStaticMarkup(<KancingEntryForm workOrders={orders} existingSewingRecords={sewing} existingKancingRecords={kancing} />);
  assertCards(html, ['WORK-IVORY', 'WORK-PARTIAL']);
});

test('actual Finishing page allows partial kancing but excludes equal finishing balance', () => {
  const html = renderToStaticMarkup(<FinishingEntryForm workOrders={orders} existingKancingRecords={kancing} existingFinishingRecords={finishing} />);
  assertCards(html, ['WORK-IVORY']);
});

test('explicit empty upstream is authoritative even with nonempty injected orders', () => {
  const html = renderToStaticMarkup(<SewingEntryForm workOrders={orders} existingCuttingRecords={[]} existingSewingRecords={[]} />);
  assertCards(html, []);
  assert.ok(html.includes('Tidak ada WO yang tersedia'));
  assert.ok(!html.includes('Memuat work order'));
});

test('explicit empty orders remains empty despite positive upstream records', () => {
  const html = renderToStaticMarkup(<KancingEntryForm workOrders={[]} existingSewingRecords={sewing} existingKancingRecords={[]} />);
  assertCards(html, []);
  assert.ok(html.includes('Tidak ada WO yang tersedia'));
});

test('missing upstream or own collections hides choices instead of assuming zero', () => {
  for (const page of [
    <SewingEntryForm workOrders={orders} existingSewingRecords={[]} />,
    <KancingEntryForm workOrders={orders} existingSewingRecords={sewing} />,
    <FinishingEntryForm workOrders={orders} existingFinishingRecords={[]} />,
  ]) {
    const html = renderToStaticMarkup(page);
    assertCards(html, []);
    assert.ok(html.includes('Memuat work order'));
    assert.ok(!html.includes('Tidak ada WO yang tersedia'));
  }
});
