import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import SewingEntryForm from '@/pages/SewingEntryForm';
import KancingEntryForm from '@/pages/KancingEntryForm';
import FinishingEntryForm from '@/pages/FinishingEntryForm';
import { calls, syncCalls, fetchCalls, setFailNext, defaultUpstreamRecords, eligibilityFixture } from './stubs/production-entry';
import type { WorkOrder } from '@/types/pipeline';

const params = new URLSearchParams(location.search);
const stage = params.get('stage') || 'sewing';
const mode = params.get('mode');
const orders = Array.from({ length: 7 }, (_, i) => ({
  id: `wo-${i}`, workCode: `WORK-${i}`, sourceOrderId: 'po-fixture',
  productNote: `PO/00${i + 1}-TEST/10/2026/001`, clientProductionCode: `CLIENT-${i}`,
  product: i < 2 ? 'Aluna Top' : `Produk ${i}`, productId: `product-${i}`, variationId: `variant-${i}`,
  informationVariation: '', warna: i % 2 ? 'Ivory' : 'Black', size: i % 2 ? 'XL' : 'M',
  brand: 'Fixture', quantity: i === 0 ? 0 : 100, productionStatus: 'PROGRESS', invoiceStatus: 'NONE',
  createdBy: 'Fixture', createdAt: '2026-10-14T00:00:00Z',
})) as WorkOrder[];
Object.assign(window, { entryFixture: { calls, syncCalls, fetchCalls, setFailNext,
  // Browser checks map the cards' displayed WO codes back to ids without adding UI/test-only markup.
  orders: mode === 'eligibility' || mode === 'failed-upstream' ? eligibilityFixture.orders : orders } });
if (mode === 'long') {
  orders[0].product = 'Produk'.repeat(40);
  orders[0].productNote = 'KODE'.repeat(40);
  orders[0].clientProductionCode = 'CLIENT'.repeat(30);
}
const ownEmpty = stage === 'sewing' ? { existingSewingRecords: [] }
  : stage === 'kancing' ? { existingKancingRecords: [] } : { existingFinishingRecords: [] };
const eligibilityRecords = stage === 'sewing'
  ? { existingCuttingRecords: eligibilityFixture.cuttingRecords, existingSewingRecords: eligibilityFixture.sewingRecords }
  : stage === 'kancing'
    ? { existingSewingRecords: eligibilityFixture.sewingRecords, existingKancingRecords: eligibilityFixture.kancingRecords }
    : { existingKancingRecords: eligibilityFixture.kancingRecords, existingFinishingRecords: eligibilityFixture.finishingRecords };
// Undefined record props exercise real fetch/loading/retry. [] is an authoritative collection,
// including the empty upstream case with otherwise usable WOs. No eligibility helper is stubbed.
const props = mode === 'eligibility' ? { workOrders: eligibilityFixture.orders, ...eligibilityRecords }
  : mode === 'failed-upstream' ? { workOrders: eligibilityFixture.orders }
  : mode === 'error' || mode === 'loading' ? { workOrders: orders }
  : mode === 'empty' ? { workOrders: orders, ...ownEmpty,
      ...(stage === 'sewing' ? { existingCuttingRecords: [] }
        : stage === 'kancing' ? { existingSewingRecords: [] } : { existingKancingRecords: [] }) }
  : { workOrders: orders, ...defaultUpstreamRecords(orders, stage) };
const root = createRoot(document.getElementById('root')!);
if (stage === 'finishing') root.render(createElement(FinishingEntryForm, props));
else if (stage === 'kancing') root.render(createElement(KancingEntryForm, props));
else root.render(createElement(SewingEntryForm, props));
