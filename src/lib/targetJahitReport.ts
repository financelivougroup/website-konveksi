import type { EnrichedTargetRow } from '@/lib/targetCompute';
// Impor runtime memakai jalur relatif ber-ekstensi `.ts` (bukan alias `@/`):
// tes dijalankan langsung oleh `node --test` tanpa bundler, dan Node tidak
// mengenal alias `@`. Ekstensi eksplisit didukung karena proyek ini mengaktifkan
// `allowImportingTsExtensions`, sehingga Vite tetap membangunnya dengan benar.
import { formatMonthYearFromYm } from './monthYear.ts';
import { calculateMonthlyRemainingMoney } from './sewingBacklog.ts';

/**
 * Perhitungan murni untuk Laporan Target Jahit (baca-saja).
 *
 * Modul ini sengaja TIDAK mengimpor supabase: seluruh masukannya adalah
 * `EnrichedTargetRow[]` hasil `enrichTargetRows` di `src/lib/targetCompute.ts`,
 * sehingga bisa diuji tanpa database (pola yang sama dengan `sewingBacklog.ts`).
 *
 * Laporan ini adalah agregasi turunan — tidak pernah menulis apa pun. Halaman
 * yang bisa mengedit tetap `src/pages/TargetJahitPage.tsx`.
 */

export type ReportMetric = 'penjahit' | 'bulan';

export interface ReportKpi {
  /** Jumlah baris target yang ikut dihitung. */
  baris: number;
  penjahitCount: number;
  bulanCount: number;
  totalTarget: number;
  totalRealisasi: number;
  totalKurang: number;
  /** 0..1 — 1 berarti 100%. */
  pencapaian: number;
  /** 0 bila `includeCost` false (tidak pernah dihitung untuk role inventory). */
  sisaUang: number;
}

export interface MonthAggregate {
  bulan: string;
  label: string;
  target: number;
  realisasi: number;
  kurang: number;
  pencapaian: number;
  penjahitCount: number;
  status: string;
  /** Biaya per bulan — dipakai grafik garis Target Cost vs Realisasi Cost. */
  targetCost: number;
  realisasiCost: number;
  /** Kumulatif sampai bulan ini (inklusif), urut menaik. */
  targetAccum: number;
  realisasiAccum: number;
  kurangAccum: number;
  pencapaianAccum: number;
  targetCostAccum: number;
  realisasiCostAccum: number;
}

export interface PenjahitAggregate {
  nama: string;
  posisi: string | null;
  target: number;
  realisasi: number;
  kurang: number;
  pencapaian: number;
  status: string;
  targetCost: number;
  realisasiCost: number;
  sisaUang: number;
}

export interface PenjahitMonthRow {
  bulan: string;
  label: string;
  target: number;
  realisasi: number;
  kurang: number;
  pencapaian: number;
  status: string;
  targetAccum: number;
  realisasiAccum: number;
  kurangAccum: number;
  pencapaianAccum: number;
  /** Selalu 0 di sini — biaya tidak dipecah per bulan pada tab Per Penjahit. */
  targetCost: number;
  realisasiCost: number;
  targetCostAccum: number;
  realisasiCostAccum: number;
}

export interface ReportOption {
  value: string;
  label: string;
}

// ===== Helper =====

/** Selisih target; tidak pernah negatif (realisasi berlebih bukan "kurang"). */
function sisa(target: number, realisasi: number): number {
  return Math.max(0, target - realisasi);
}

/**
 * Rasio realisasi/target. Target 0 → 0, bukan NaN/Infinity: baris tanpa target
 * tidak boleh merusak rata-rata atau membuat grafik melompat ke tak hingga.
 */
function rasio(realisasi: number, target: number): number {
  if (!(target > 0)) return 0;
  return realisasi / target;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Status mengikuti hasil enrichment (`statusFinal` / `statusFinalAkumulasi`) agar
 * konsisten dengan halaman Target Jahit — TIDAK dihitung ulang di sini. Ambang
 * 'Berjalan' vs 'Tercapai' bergantung pada bulan berjalan, dan itu sudah diputuskan
 * di `targetCompute.ts`; menduplikasinya di sini akan menghasilkan dua definisi
 * yang bisa berbeda diam-diam.
 */
function statusUntuk(rows: EnrichedTargetRow[]): string {
  // Prioritaskan status bulanan: ambil yang pertama berisi.
  const bulanan = rows.map((r) => String(r.statusFinal ?? '').trim()).find(Boolean);
  if (bulanan) return bulanan;
  const akumulasi = rows.map((r) => String(r.statusFinalAkumulasi ?? '').trim()).find(Boolean);
  return akumulasi ?? 'Berjalan';
}

function urutBulan<T extends { bulan: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.bulan.localeCompare(b.bulan));
}

// ===== Agregasi =====

/** Ringkasan KPI untuk himpunan baris yang sedang ditampilkan. */
export function summarizeReport(rows: EnrichedTargetRow[], includeCost: boolean): ReportKpi {
  let totalTarget = 0;
  let totalRealisasi = 0;
  let sisaUang = 0;
  const penjahit = new Set<string>();
  const bulan = new Set<string>();

  for (const r of rows) {
    const t = num(r.target_monthly);
    const real = num(r.realisasiMonthly);
    totalTarget += t;
    totalRealisasi += real;
    if (r.nama) penjahit.add(r.nama);
    if (r.bulan_tahun) bulan.add(String(r.bulan_tahun));
    if (includeCost) {
      sisaUang += calculateMonthlyRemainingMoney(
        num(r.target_cost_posisi),
        num(r.realisasiCostPosisi),
      );
    }
  }

  return {
    baris: rows.length,
    penjahitCount: penjahit.size,
    bulanCount: bulan.size,
    totalTarget,
    totalRealisasi,
    totalKurang: sisa(totalTarget, totalRealisasi),
    pencapaian: rasio(totalRealisasi, totalTarget),
    sisaUang,
  };
}

/**
 * Satu baris per bulan (lintas penjahit), urut menaik.
 *
 * `includeCost` menahan perhitungan biaya untuk role yang tidak boleh melihatnya
 * (inventory) — bukan sekadar menyembunyikan kolom di UI.
 */
export function buildMonthAggregates(
  rows: EnrichedTargetRow[],
  includeCost = false,
): MonthAggregate[] {
  const map = new Map<string, EnrichedTargetRow[]>();
  for (const r of rows) {
    const bulan = String(r.bulan_tahun ?? '');
    if (!bulan) continue;
    const list = map.get(bulan);
    if (list) list.push(r);
    else map.set(bulan, [r]);
  }

  const out: MonthAggregate[] = [];
  // Kumulatif dijalankan pada urutan bulan menaik — kalau tidak, "akumulasi
  // sampai bulan ini" akan bergantung pada urutan Map, bukan urutan waktu.
  let accumTarget = 0;
  let accumRealisasi = 0;
  let accumTargetCost = 0;
  let accumRealisasiCost = 0;

  for (const { bulan, list } of urutBulan(
    [...map.entries()].map(([bulan, list]) => ({ bulan, list })),
  )) {
    const target = list.reduce((a, r) => a + num(r.target_monthly), 0);
    const realisasi = list.reduce((a, r) => a + num(r.realisasiMonthly), 0);
    const targetCost = includeCost ? list.reduce((a, r) => a + num(r.target_cost_posisi), 0) : 0;
    const realisasiCost = includeCost
      ? list.reduce((a, r) => a + num(r.realisasiCostPosisi), 0)
      : 0;

    accumTarget += target;
    accumRealisasi += realisasi;
    accumTargetCost += targetCost;
    accumRealisasiCost += realisasiCost;

    out.push({
      bulan,
      label: formatMonthYearFromYm(bulan),
      target,
      realisasi,
      kurang: sisa(target, realisasi),
      pencapaian: rasio(realisasi, target),
      penjahitCount: new Set(list.map((r) => r.nama).filter(Boolean)).size,
      status: statusUntuk(list),
      targetCost,
      realisasiCost,
      targetAccum: accumTarget,
      realisasiAccum: accumRealisasi,
      kurangAccum: sisa(accumTarget, accumRealisasi),
      pencapaianAccum: rasio(accumRealisasi, accumTarget),
      targetCostAccum: accumTargetCost,
      realisasiCostAccum: accumRealisasiCost,
    });
  }
  return out;
}

/** Satu baris per penjahit (lintas bulan). */
export function buildPenjahitAggregates(
  rows: EnrichedTargetRow[],
  includeCost: boolean,
): PenjahitAggregate[] {
  const map = new Map<string, EnrichedTargetRow[]>();
  for (const r of rows) {
    const nama = String(r.nama ?? '');
    if (!nama) continue;
    const list = map.get(nama);
    if (list) list.push(r);
    else map.set(nama, [r]);
  }

  const out: PenjahitAggregate[] = [];
  for (const [nama, list] of map) {
    const target = list.reduce((a, r) => a + num(r.target_monthly), 0);
    const realisasi = list.reduce((a, r) => a + num(r.realisasiMonthly), 0);
    const posisi = list.map((r) => r.posisi).find((p) => p != null && p !== '') ?? null;

    let targetCost = 0;
    let realisasiCost = 0;
    if (includeCost) {
      targetCost = list.reduce((a, r) => a + num(r.target_cost_posisi), 0);
      realisasiCost = list.reduce((a, r) => a + num(r.realisasiCostPosisi), 0);
    }

    out.push({
      nama,
      posisi,
      target,
      realisasi,
      kurang: sisa(target, realisasi),
      pencapaian: rasio(realisasi, target),
      status: statusUntuk(list),
      targetCost,
      realisasiCost,
      sisaUang: includeCost ? calculateMonthlyRemainingMoney(targetCost, realisasiCost) : 0,
    });
  }

  return out.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Rincian bulanan untuk SATU penjahit. Baris tanpa nama yang diminta tidak ikut,
 * jadi penjahit yang tidak punya target di suatu bulan tidak menghasilkan baris 0
 * palsu — bulan itu memang tidak ada barisnya, bukan bernilai nol.
 */
export function buildPenjahitMonthRows(
  rows: EnrichedTargetRow[],
  nama: string,
): PenjahitMonthRow[] {
  const milik = rows.filter((r) => String(r.nama ?? '') === nama);
  const map = new Map<string, EnrichedTargetRow[]>();
  for (const r of milik) {
    const bulan = String(r.bulan_tahun ?? '');
    if (!bulan) continue;
    const list = map.get(bulan);
    if (list) list.push(r);
    else map.set(bulan, [r]);
  }

  const out: PenjahitMonthRow[] = [];
  let accumTarget = 0;
  let accumRealisasi = 0;

  for (const { bulan, list } of urutBulan(
    [...map.entries()].map(([bulan, list]) => ({ bulan, list })),
  )) {
    const target = list.reduce((a, r) => a + num(r.target_monthly), 0);
    const realisasi = list.reduce((a, r) => a + num(r.realisasiMonthly), 0);

    accumTarget += target;
    accumRealisasi += realisasi;

    out.push({
      bulan,
      label: formatMonthYearFromYm(bulan),
      target,
      realisasi,
      kurang: sisa(target, realisasi),
      pencapaian: rasio(realisasi, target),
      status: statusUntuk(list),
      targetAccum: accumTarget,
      realisasiAccum: accumRealisasi,
      kurangAccum: sisa(accumTarget, accumRealisasi),
      pencapaianAccum: rasio(accumRealisasi, accumTarget),
      // Penjahit tidak memakai kolom biaya di sini; diisi 0 agar bentuknya tetap
      // memenuhi `MonthAggregateLike` dan bisa memakai template grafik yang sama.
      targetCost: 0,
      realisasiCost: 0,
      targetCostAccum: 0,
      realisasiCostAccum: 0,
    });
  }
  return out;
}

// ===== Opsi slicer =====
// Selalu dibangun dari SELURUH baris, bukan hasil filter — kalau tidak, memilih
// satu bulan akan mengosongkan opsi bulan lain dan slicer-nya terjebak
// (pola yang sama dengan `bulanOptions` di `laporanCompute.ts`).

export function bulanReportOptions(rows: EnrichedTargetRow[]): ReportOption[] {
  const set = new Set<string>();
  for (const r of rows) {
    const bulan = String(r.bulan_tahun ?? '');
    if (bulan) set.add(bulan);
  }
  return [...set]
    .sort((a, b) => b.localeCompare(a)) // terbaru dulu
    .map((bulan) => ({ value: bulan, label: formatMonthYearFromYm(bulan) }));
}

export function penjahitReportOptions(rows: EnrichedTargetRow[]): ReportOption[] {
  const map = new Map<string, string | null>();
  for (const r of rows) {
    const nama = String(r.nama ?? '');
    if (!nama || map.has(nama)) continue;
    map.set(nama, r.posisi ?? null);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nama, posisi]) => ({
      value: nama,
      label: posisi ? `${nama} · ${posisi}` : nama,
    }));
}

// ===== Format angka =====

/**
 * Rupiah ringkas untuk label aksis grafik: "26 jt", "1,5 jt", "750 rb".
 *
 * `formatCurrency` menghasilkan "Rp 26.000.000" — terlalu panjang untuk tick
 * sumbu Y dan akan saling tumpang tindih. Nilai penuh tetap dipakai di tooltip,
 * tabel, dan CSV, jadi tidak ada angka yang hilang.
 */
export function formatRupiahRingkas(value: number): string {
  const v = Math.abs(value);
  const tulis = (n: number, satuan: string) => {
    // Bulatkan dulu ke 1 desimal, baru periksa apakah bulat. Memeriksa `n % 1`
    // sebelum pembulatan membuat 1.999999 tampil "2,0 jt" alih-alih "2 jt".
    const r = Math.round(n * 10) / 10;
    const teks = Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
    return `${teks} ${satuan}`;
  };
  if (v >= 1_000_000_000) return tulis(value / 1_000_000_000, 'm');
  if (v >= 1_000_000) return tulis(value / 1_000_000, 'jt');
  if (v >= 1_000) return tulis(value / 1_000, 'rb');
  return String(Math.round(value));
}

// ===== CSV =====

function esc(v: string | number | null | undefined): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * CSV mengikuti tab yang sedang dibuka: `metric: 'penjahit'` untuk Keseluruhan,
 * `'bulan'` untuk Per Penjahit. Kolom biaya hanya muncul bila `includeCost`.
 * BOM ditambahkan agar Excel membaca UTF-8 dengan benar.
 */
export function targetJahitReportToCsv(
  rows: EnrichedTargetRow[],
  metric: ReportMetric,
  includeCost: boolean,
): string {
  const lines: string[] = [];

  if (metric === 'penjahit') {
    const header = ['Penjahit', 'Target', 'Realisasi', 'Kurang', 'Pencapaian', 'Status'];
    if (includeCost) header.push('Target Cost', 'Realisasi Cost', 'Sisa Uang');
    lines.push(header.map(esc).join(','));

    const agg = buildPenjahitAggregates(rows, includeCost);
    for (const a of agg) {
      const kolom: (string | number | null)[] = [
        a.nama, a.target, a.realisasi, a.kurang, pct(a.pencapaian), a.status,
      ];
      if (includeCost) kolom.push(a.targetCost, a.realisasiCost, a.sisaUang);
      lines.push(kolom.map(esc).join(','));
    }

    const kpi = summarizeReport(rows, includeCost);
    const total: (string | number)[] = [
      'TOTAL', kpi.totalTarget, kpi.totalRealisasi, kpi.totalKurang, pct(kpi.pencapaian), '',
    ];
    if (includeCost) total.push('', '', kpi.sisaUang);
    lines.push(total.map(esc).join(','));
  } else {
    const header = ['Bulan', 'Target', 'Realisasi', 'Kurang', 'Pencapaian', 'Status'];
    lines.push(header.map(esc).join(','));

    const agg = buildMonthAggregates(rows, includeCost);
    for (const m of agg) {
      lines.push(
        [m.label, m.target, m.realisasi, m.kurang, pct(m.pencapaian), m.status].map(esc).join(','),
      );
    }

    const kpi = summarizeReport(rows, includeCost);
    lines.push(
      ['TOTAL', kpi.totalTarget, kpi.totalRealisasi, kpi.totalKurang, pct(kpi.pencapaian), '']
        .map(esc)
        .join(','),
    );
  }

  return '﻿' + lines.join('\r\n');
}
