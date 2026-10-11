import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDesignBenefits,
  effectiveDetailRate,
  productionCodePriceKey,
  type DesignBenefitInput,
  type PriceMap,
} from '../src/lib/targetBenefit.ts';
import type { EnrichedTargetRow } from '../src/lib/targetCompute.ts';

// Permintaan user (verbatim):
//   "benefit rate / pcs nominalnya diambil dari register harga (harga jahit+obras)
//    x extra production. tapi ini gabisa ditampilin di depan sih/tablenya lgsg,
//    soalnya per kode produksi kan bisa aja benefit rate nya beda2, kalo dia ada
//    extra production 4 variasi, gamungkin 4 harga yg berbeda muncul di sini.
//    better benefit rate / pcs itu muncul di dalem pop upnya yg lebih detail lagi."
//
// Keputusan user (via AskUserQuestion):
//   1. Extra dipecah PER DESAIN: max(0, realisasi desain − target desain) × tarif
//      desain itu. Bukan selisih total penjahit yang dibagi proporsional.
//   2. Kolom `benefit_per_pcs` berhenti dipakai (kolom DB dibiarkan).
//   3. Ditampilkan sebagai kolom tambahan di grid "Rincian Realisasi per Desain"
//      di dalam popup detail.
//
// Konsekuensi penting dari keputusan (1): satu desain bisa melebihi targetnya
// walau total bulanan penjahit masih di bawah target. Baris seperti itu TETAP
// mendapat benefit, karena kelebihannya nyata pada desain tersebut.

function detail(over: Partial<DesignBenefitInput> = {}): DesignBenefitInput {
  return {
    productNote: 'PO/001-LVU/09/2026/002',
    qtyTarget: 40,
    hargaJahit: 5000,
    hargaObras: 5000,
    ...over,
  };
}

const prices: PriceMap = {
  'po/001-lvu/09/2026/002': { jahit: 5000, obras: 5000 },
  'po/001-lvu/09/2026/001': { jahit: 8000, obras: 0 },
  'po/002-csc/09/2026/005': { jahit: 6000, obras: 6000 },
};

// ===== productionCodePriceKey =====

test('kunci tarif menormalkan huruf besar/kecil dan spasi tepi', () => {
  assert.equal(productionCodePriceKey('  PO/001-LVU/09/2026/002 '), 'po/001-lvu/09/2026/002');
  assert.equal(productionCodePriceKey(null), '');
  assert.equal(productionCodePriceKey(undefined), '');
});

// ===== effectiveDetailRate =====

test('tarif diambil dari harga tersimpan di baris detail', () => {
  assert.equal(effectiveDetailRate(detail({ hargaJahit: 5000, hargaObras: 5000 }), prices), 10_000);
});

test('tarif jatuh ke Register Harga bila baris detail belum punya harga', () => {
  const rate = effectiveDetailRate(
    detail({ hargaJahit: 0, hargaObras: 0, productNote: 'PO/001-LVU/09/2026/001' }),
    prices,
  );
  assert.equal(rate, 8_000);
});

test('tarif 0 bila tidak ada harga tersimpan maupun di Register Harga', () => {
  const rate = effectiveDetailRate(
    detail({ hargaJahit: 0, hargaObras: 0, productNote: 'PO/TIDAK/ADA' }),
    prices,
  );
  assert.equal(rate, 0);
});

test('harga tersimpan menang atas Register Harga (tarif terkunci saat generate)', () => {
  // Baris detail menyimpan tarif Rp 9.000, Register Harga sekarang Rp 10.000.
  // Yang dipakai adalah yang tersimpan, supaya nilai lama tidak berubah diam-diam.
  const rate = effectiveDetailRate(detail({ hargaJahit: 4000, hargaObras: 5000 }), prices);
  assert.equal(rate, 9_000);
});

test('tarif hanya obras tetap dihitung', () => {
  const rate = effectiveDetailRate(detail({ hargaJahit: 0, hargaObras: 7000 }), prices);
  assert.equal(rate, 7_000);
});

// ===== calculateDesignBenefits =====

test('benefit = extra desain × tarif desain itu', () => {
  const benefits = calculateDesignBenefits(
    [detail({ qtyTarget: 40, hargaJahit: 5000, hargaObras: 5000 })],
    [60],
    prices,
  );
  assert.deepEqual(benefits, [{ extraProduction: 20, benefitRate: 10_000, benefitAmount: 200_000 }]);
});

test('tarif berbeda per kode produksi dipakai masing-masing', () => {
  const benefits = calculateDesignBenefits(
    [
      detail({ productNote: 'PO/001-LVU/09/2026/002', qtyTarget: 10, hargaJahit: 5000, hargaObras: 5000 }),
      detail({ productNote: 'PO/002-CSC/09/2026/005', qtyTarget: 10, hargaJahit: 6000, hargaObras: 6000 }),
    ],
    [15, 12], // extra 5 × 10.000 = 50.000 ; extra 2 × 12.000 = 24.000
    prices,
  );
  assert.equal(benefits[0].benefitAmount, 50_000);
  assert.equal(benefits[1].benefitAmount, 24_000);
});

test('desain yang tidak melebihi targetnya tidak dapat benefit', () => {
  const benefits = calculateDesignBenefits([detail({ qtyTarget: 40 })], [40], prices);
  assert.deepEqual(benefits, [{ extraProduction: 0, benefitRate: 10_000, benefitAmount: 0 }]);
});

test('realisasi di bawah target tidak menghasilkan extra negatif', () => {
  const benefits = calculateDesignBenefits([detail({ qtyTarget: 40 })], [5], prices);
  assert.equal(benefits[0].extraProduction, 0);
  assert.equal(benefits[0].benefitAmount, 0);
});

test('desain melebihi target tetap dapat benefit walau total bulanan di bawah target', () => {
  // Inilah konsekuensi keputusan "per desain": desain A lebih 20, desain B kurang 20.
  // Total bulanan: realisasi 60+0 = 60 vs target 40+20 = 60 → selisih total 0.
  // Cara lama (selisih total) memberi Rp0; cara per desain memberi 20 × Rp10.000.
  const benefits = calculateDesignBenefits(
    [
      detail({ qtyTarget: 40, hargaJahit: 5000, hargaObras: 5000 }),
      detail({ productNote: 'PO/001-LVU/09/2026/001', qtyTarget: 20, hargaJahit: 8000, hargaObras: 0 }),
    ],
    [60, 0],
    prices,
  );
  assert.equal(benefits[0].extraProduction, 20);
  assert.equal(benefits[1].extraProduction, 0);
  const total = benefits.reduce((sum, b) => sum + b.benefitAmount, 0);
  assert.equal(total, 200_000);
});

test('tarif tidak diketahui menghasilkan benefit Rp0, extra tetap terhitung', () => {
  const benefits = calculateDesignBenefits(
    [detail({ productNote: 'PO/TIDAK/ADA', hargaJahit: 0, hargaObras: 0, qtyTarget: 10 })],
    [25],
    prices,
  );
  assert.equal(benefits[0].extraProduction, 15);
  assert.equal(benefits[0].benefitRate, 0);
  assert.equal(benefits[0].benefitAmount, 0);
});

test('daftar kosong menghasilkan daftar kosong', () => {
  assert.deepEqual(calculateDesignBenefits([], [], prices), []);
});

test('qty target 0 membuat seluruh realisasi menjadi extra', () => {
  const benefits = calculateDesignBenefits([detail({ qtyTarget: 0 })], [12], prices);
  assert.equal(benefits[0].extraProduction, 12);
  assert.equal(benefits[0].benefitAmount, 120_000);
});

test('qty tidak valid tidak menghasilkan NaN', () => {
  const benefits = calculateDesignBenefits(
    [detail({ qtyTarget: Number.NaN })],
    [Number.NaN],
    prices,
  );
  assert.equal(benefits[0].extraProduction, 0);
  assert.equal(benefits[0].benefitAmount, 0);
  assert.equal(Number.isNaN(benefits[0].benefitAmount), false);
});

test('realisasi yang hilang dianggap 0', () => {
  const benefits = calculateDesignBenefits([detail({ qtyTarget: 10 })], [], prices);
  assert.equal(benefits[0].extraProduction, 0);
});

// ===== Bentuk baris enriched =====

test('EnrichedTargetRow tidak lagi membawa benefitRate per baris', () => {
  // `benefitRate` per baris target sudah tidak ada: tarifnya milik DESAIN, bukan
  // milik penjahit+bulan. Yang tersisa hanya agregat extra & amount.
  const row: EnrichedTargetRow = {
    id: 1,
    bulan_tahun: '2026-09',
    nama: 'Suwati',
    posisi: 'Penjahit',
    total_hari_kerja: 26,
    hari_kerja_hari_ini: 10,
    sisa_hari: 16,
    target_daily: 5,
    target_ngebut_hari: 3,
    target_monthly: 120,
    realisasi_monthly: 140,
    sisa_target_monthly: 0,
    progress_monthly: 1.1,
    status_final: 'Berjalan',
    target_cost_posisi: 1_200_000,
    realisasi_cost_posisi: 1_400_000,
    target_accum: 120,
    realisasi_accum: 140,
    selisih_accum: 20,
    target_ngebut_hari_akumulasi: 0,
    progress_accum: 1.1,
    status_final_akumulasi: 'Berjalan',
    benefit_per_pcs: null,
    extraProduction: 20,
    benefitAmount: 200_000,
  };
  assert.ok(!('benefitRate' in row), 'benefitRate per baris sudah dihapus');
  assert.equal(row.benefitAmount, 200_000);
});
