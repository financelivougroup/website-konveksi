// Modul murni: TANPA import apa pun, supaya bisa diuji `node --test` tanpa
// database dan tanpa alias `@/`. Ini pola yang sama dengan `targetGeneration.ts`,
// `targetDetailIdentity.ts`, dan `staffDebtEligibility.ts`.
//
// Permintaan user (verbatim):
//   "benefit rate / pcs nominalnya diambil dari register harga (harga jahit+obras)
//    x extra production. tapi ini gabisa ditampilin di depan sih/tablenya lgsg,
//    soalnya per kode produksi kan bisa aja benefit rate nya beda2, kalo dia ada
//    extra production 4 variasi, gamungkin 4 harga yg berbeda muncul di sini.
//    better benefit rate / pcs itu muncul di dalem pop upnya yg lebih detail lagi."
//
// Keputusan user:
//   1. Extra dipecah PER DESAIN, bukan dari selisih total bulanan.
//   2. Kolom `benefit_per_pcs` berhenti dipakai (kolom DB dibiarkan).
//   3. Ditampilkan di grid "Rincian Realisasi per Desain" dalam popup detail.

export interface PriceMapValue {
  jahit: number;
  obras: number;
}

/** Tarif per kode produksi, di-key oleh `productionCodePriceKey`. */
export type PriceMap = Record<string, PriceMapValue>;

/**
 * Kunci tarif dari Product Note. Product Note adalah kode produksi unik, jadi
 * dua produksi berbeda tidak pernah saling meminjam harga jahit/obras.
 *
 * Fungsi ini hidup di sini (bukan di `src/services/staffDebt.ts`) karena modul
 * ini tidak boleh mengimpor Supabase. `staffDebt.ts` meng-export ulang fungsi
 * yang sama supaya tetap hanya ada SATU implementasi.
 */
export function productionCodePriceKey(productNote: string | null | undefined): string {
  return productNote?.trim().toLocaleLowerCase('id-ID') ?? '';
}

/** Bagian baris detail yang dibutuhkan untuk menentukan tarif. */
export interface DetailRateInput {
  productNote: string | null;
  hargaJahit: number;
  hargaObras: number;
}

/** Bagian baris detail yang dibutuhkan untuk menghitung benefit. */
export interface DesignBenefitInput extends DetailRateInput {
  qtyTarget: number;
}

/** Benefit satu desain. */
export interface DesignBenefit {
  /** max(0, realisasi desain − target desain) — per desain, bukan selisih total. */
  extraProduction: number;
  /** Tarif per pcs desain ini (harga jahit + obras). */
  benefitRate: number;
  /** extraProduction × benefitRate. */
  benefitAmount: number;
}

/**
 * Tarif efektif satu baris detail: harga yang tersimpan di baris itu (diambil
 * dari Register Harga saat Generate Target), dengan fallback ke Register Harga
 * terkini bila barisnya belum punya harga.
 *
 * Harga tersimpan menang supaya nilai lama tidak berubah diam-diam ketika
 * Register Harga diperbarui. Dua pemakai — biaya realisasi dan benefit — harus
 * memakai tarif yang sama, kalau tidak angka desain yang sama bisa berbeda.
 */
export function effectiveDetailRate(detail: DetailRateInput, prices: PriceMap): number {
  const stored = (Number(detail.hargaJahit) || 0) + (Number(detail.hargaObras) || 0);
  if (stored > 0) return stored;
  const fallback = prices[productionCodePriceKey(detail.productNote)];
  return fallback ? fallback.jahit + fallback.obras : 0;
}

/**
 * Benefit dihitung PER DESAIN, bukan dari selisih total bulanan.
 *
 * Alasannya: tarif per pcs berbeda-beda antar kode produksi (diambil dari
 * Register Harga), jadi kelebihan satu desain harus dikalikan tarif desain itu
 * sendiri. Konsekuensinya, satu desain bisa melebihi targetnya walau total
 * bulanan penjahit masih di bawah target — baris seperti itu tetap mendapat
 * benefit, karena kelebihannya nyata pada desain tersebut.
 *
 * `realizedQty` sejajar indeksnya dengan `details` (hasil `calculateDetailRealizations`).
 */
export function calculateDesignBenefits(
  details: DesignBenefitInput[],
  realizedQty: number[],
  prices: PriceMap,
): DesignBenefit[] {
  return details.map((detail, index) => {
    const realisasi = Number(realizedQty[index]) || 0;
    const qtyTarget = Number(detail.qtyTarget) || 0;
    const extraProduction = Math.max(0, realisasi - qtyTarget);
    const benefitRate = effectiveDetailRate(detail, prices);
    return { extraProduction, benefitRate, benefitAmount: extraProduction * benefitRate };
  });
}
