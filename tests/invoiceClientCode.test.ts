import assert from 'node:assert/strict';
import test from 'node:test';
import { findClientByBrand } from '../src/lib/clientCode.ts';
import { buildInvoiceCode, sanitizeInvoiceCodeForFile } from '../src/lib/invoiceCode.ts';

test('kode invoice mempertahankan kode client lengkap dari master', () => {
  for (const [namaClient, kodeClient] of [['Livou', '001-LVU'], ['Cassca', '002-CSC']]) {
    const client = findClientByBrand(namaClient, [{ namaClient, kodeClient }]);
    assert.ok(client);
    const code = buildInvoiceCode({
      billingTypeCodeValue: 'MP',
      clientCode: client.kodeClient,
      invoiceDate: '2026-10-16',
      sequence: 7,
    });
    assert.equal(code, `INV/MP/${kodeClient}/161026/007`);
    assert.equal(sanitizeInvoiceCodeForFile(code), `INV_MP_${kodeClient}_161026_007`);
  }
});
