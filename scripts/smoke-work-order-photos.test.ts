import assert from 'node:assert/strict';
import test from 'node:test';
import * as workOrders from '@/services/workOrders';
import { buildKanbanGroups } from '@/lib/kanban';
import { fixture } from './stubs/work-order-photos';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KodeProduksiList } from '@/components/Production/KodeProduksiList';

function reset() {
  fixture.errors = {};
  fixture.tables = {
    work_orders: [{
      id: 'WO-parent', source_order_id: 'PO-parent', source_variation_id: 'variation-parent',
      product_note: 'PARENT', product: 'Parent-only product', quantity: 10, prod_status: 'NEW',
    }],
    production_orders: [{ id: 'PO-parent', product_photo_path: 'PO-parent/original.png' }],
    production_order_variations: [{ id: 'variation-parent', photo_path: null }],
  };
}

function groups(rows: NonNullable<Awaited<ReturnType<typeof workOrders.fetchAll>>['data']>) {
  return buildKanbanGroups(rows.map((row) => ({ ...row, derivedStatus: 'NEW' as const })));
}

test('parent-only production photo reaches the Kanban through the real work-order service', async () => {
  reset();
  const result = await workOrders.fetchAll();
  assert.equal(result.error, null);
  assert.ok(result.data);
  assert.equal(result.data[0].variationPhotoPath, null);
  assert.equal(result.data[0].variationPhotoUrl, null);
  assert.equal(groups(result.data)[0].photoUrl, 'https://attachments.example.test/product-photos/PO-parent/original.png');
});

test('a later variation photo beats an earlier parent fallback in the same production code', async () => {
  reset();
  fixture.tables.work_orders.push({
    ...fixture.tables.work_orders[0], id: 'WO-variation', source_variation_id: 'variation-photo',
  });
  fixture.tables.production_order_variations.push({ id: 'variation-photo', photo_path: 'PO-parent/variation.png' });
  const { data } = await workOrders.fetchAll();
  assert.ok(data);
  assert.equal(data[1].variationPhotoPath, 'PO-parent/variation.png');
  assert.equal(groups(data)[0].photoUrl, 'https://attachments.example.test/product-photos/PO-parent/variation.png');
});

test('missing or unrelated photo references remain empty without borrowing another product image', async () => {
  reset();
  fixture.tables.production_orders = [{ id: 'PO-unrelated', product_photo_path: 'PO-unrelated/photo.png' }];
  fixture.tables.production_order_variations = [{ id: 'variation-unrelated', photo_path: 'PO-unrelated/variation.png' }];
  const { data } = await workOrders.fetchAll();
  assert.ok(data);
  assert.equal(data[0].productPhotoPath, null);
  assert.equal(data[0].variationPhotoPath, null);
  assert.equal(groups(data)[0].photoUrl, null);
});

test('single and bulk work-order readers preserve the same parent photo fallback', async () => {
  reset();
  const single = await workOrders.fetchById('WO-parent');
  assert.equal(single.error, null);
  assert.equal(single.data?.productPhotoUrl, 'https://attachments.example.test/product-photos/PO-parent/original.png');
  const bulk = await workOrders.fetchByIds(['WO-parent', 'WO-parent']);
  assert.equal(bulk.error, null);
  assert.equal(bulk.data?.length, 1);
  assert.equal(bulk.data?.[0].productPhotoUrl, single.data?.productPhotoUrl);
});

test('real production list renders the photo src enriched by the service', async () => {
  reset();
  const { data } = await workOrders.fetchAll();
  assert.ok(data);
  const group = groups(data)[0];
  const markup = renderToStaticMarkup(createElement(KodeProduksiList, {
    entries: [{ group, rowCount: 1, rowQty: 10 }],
    selected: null, onSelect: () => {}, totalRows: 1, totalQty: 10,
  }));
  assert.match(markup, /<img[^>]+src="https:\/\/attachments\.example\.test\/product-photos\/PO-parent\/original\.png"/);
  assert.doesNotMatch(markup, /title="Belum ada foto"/);
});

test('failed parent lookup retains a usable variation photo and emits a safe warning', async () => {
  reset();
  fixture.tables.production_order_variations[0].photo_path = 'PO-parent/variation.png';
  fixture.errors.production_orders = { code: '42501', message: 'do not expose this message' };
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  try {
    const { data, error } = await workOrders.fetchAll();
    assert.equal(error, null);
    assert.ok(data);
    assert.equal(groups(data)[0].photoUrl, 'https://attachments.example.test/product-photos/PO-parent/variation.png');
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(JSON.stringify(warnings), /do not expose/);
  } finally {
    console.warn = original;
  }
});

test('failed variation lookup is observable without hiding a usable parent photo', async () => {
  reset();
  fixture.errors.production_order_variations = { code: '42501', message: 'sensitive diagnostic should not be logged' };
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  try {
    const { data, error } = await workOrders.fetchAll();
    assert.equal(error, null);
    assert.ok(data);
    assert.equal(groups(data)[0].photoUrl, 'https://attachments.example.test/product-photos/PO-parent/original.png');
    assert.equal(warnings.length, 1);
    assert.match(JSON.stringify(warnings), /production_order_variations/);
    assert.match(JSON.stringify(warnings), /42501/);
    assert.doesNotMatch(JSON.stringify(warnings), /sensitive diagnostic/);
  } finally {
    console.warn = original;
  }
});
