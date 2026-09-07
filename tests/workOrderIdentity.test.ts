import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProductId,
  buildVariationId,
  getColorAbbreviation,
} from '../src/lib/workOrderIdentity.ts';

test('membuat product ID dari tiga huruf brand dan lima karakter product', () => {
  assert.equal(buildProductId('Livou', 'Sheen Pants'), 'LIV-SHEEN');
});

test('menggunakan singkatan warna baku untuk White', () => {
  assert.equal(getColorAbbreviation('White'), 'WHT');
  assert.equal(buildVariationId('LIV-SHEEN', 'White', 'S'), 'LIV-SHEEN-WHT-S');
});

test('menggunakan fallback tanpa vokal untuk warna yang belum terdaftar', () => {
  assert.equal(getColorAbbreviation('Taupe'), 'TP');
  assert.equal(buildVariationId('LIV-SHEEN', 'Taupe', 'M'), 'LIV-SHEEN-TP-M');
});

test('mengembalikan variation ID kosong ketika komponennya belum lengkap', () => {
  assert.equal(buildVariationId('LIV-SHEEN', '', 'S'), '');
});
