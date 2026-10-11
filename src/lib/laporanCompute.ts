import type {
  FinishingRecord,
  KancingRecord,
  SewingRecord,
  WorkOrder,
} from '@/types/pipeline';

// ===== Laporan Jahit / Pasang Kancing / Finishing =====
// Helper murni: tidak melakukan fetch, tidak mengimpor Supabase, dan tidak
// menulis data. Seluruh aritmetika laporan berada di sini agar dapat diuji
// tanpa database (mengikuti pola src/lib/sewingBacklog.ts).

export type LaporanKind = 'jahit' | 'kancing' | 'finishing';

export interface LaporanRow {
  id: string;
  workOrderId: string;
  /** 'YYYY-MM-DD', atau '' bila sumber tanggalnya kosong. */
  tanggal: string;
  /** Nama produk — lookup dari work order, seperti tab Sewing Log. */
  produk: string;
  warna: string;
  size: string;
  qty: number;
  /** Nama orang yang mengerjakan (Penjahit / Pemasang / Finisher). */
  pic: string;
  /** Nama berkas bukti; '' bila tidak ada. */
  bukti: string;
}

export const EM_DASH = '—';

export const PIC_LABEL = {
  jahit: 'Penjahit',
  kancing: 'Pemasang',
  finishing: 'Finisher',
} as const;

// ===== Swatch warna =====
// Warna produk di data nyata cuma nama teks ("Black", "Ivory", "Chocolate").
// Supaya barisnya terbaca seperti dashboard, tiap nama dipetakan ke warna
// swatch yang nyata; nama yang belum dikenal diberi warna turunan stabil dari
// hash namanya, jadi warna yang sama selalu tampil sama (tidak berubah acak
// setiap render).

const WARNA_SWATCH: Record<string, string> = {
  black: '#111827',
  white: '#F8FAFC',
  ivory: '#F5EFE1',
  cream: '#F3E9D2',
  beige: '#D9C8A9',
  chocolate: '#4B2E22',
  brown: '#6B4423',
  mocha: '#6F4E37',
  grey: '#9CA3AF',
  gray: '#9CA3AF',
  navy: '#1E3A8A',
  blue: '#2563EB',
  sky: '#38BDF8',
  green: '#16A34A',
  olive: '#6B7A36',
  khaki: '#B5A642',
  yellow: '#EAB308',
  gold: '#C9A227',
  orange: '#F97316',
  red: '#DC2626',
  maroon: '#7F1D1D',
  pink: '#EC4899',
  rose: '#F43F5E',
  purple: '#7C3AED',
  lilac: '#A78BFA',
  teal: '#0D9488',
  turquoise: '#2DD4BF',
  mint: '#6EE7B7',
  silver: '#C0C4CC',
  charcoal: '#374151',
  taupe: '#8B7D6B',
  terracotta: '#C1643B',
  mustard: '#D4A017',
  denim: '#3B5A7A',
};

/**
 * Warna swatch untuk sebuah nama warna.
 * Nama tidak dikenal → warna HSL stabil dari hash nama (hue 0-359).
 */
export function warnaSwatch(nama: string): string {
  const key = nama.trim().toLowerCase();
  if (!key) return '#CBD5E1';
  if (WARNA_SWATCH[key]) return WARNA_SWATCH[key];

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 45% 48%)`;
}

/**
 * Nama warna terang (putih, ivory, cream) butuh border supaya swatch-nya
 * tidak menyatu dengan latar kartu tabel.
 */
export function warnaButuhBorder(nama: string): boolean {
  const key = nama.trim().toLowerCase();
  return key === 'white' || key === 'ivory' || key === 'cream' || key === 'silver';
}

/** Ambil 10 karakter pertama ('YYYY-MM-DD') dari timestamp ISO apa pun.
 *  Diekspor karena `productionTimeline.ts` memakai normalisasi yang sama —
 *  menyalinnya ke sana akan membuat dua aturan tanggal yang bisa berbeda. */
export function toDateOnly(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : '';
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Bentuk per-record sebelum di-join ke work order. */
interface Draft {
  id: string;
  workOrderId: string;
  tanggal: string;
  qty: number;
  pic: string;
  bukti: string;
}

function toDraft(kind: LaporanKind, record: SewingRecord | KancingRecord | FinishingRecord): Draft {
  if (kind === 'finishing') {
    const fr = record as FinishingRecord;
    return {
      id: fr.id,
      workOrderId: fr.workOrderId,
      tanggal: toDateOnly(fr.tanggalImport) || toDateOnly(fr.syncedAt),
      qty: toNumber(fr.qtyFinishing),
      pic: toText(fr.picFinishing) || toText(fr.inputBy),
      bukti: toText(fr.imageName),
    };
  }
  if (kind === 'kancing') {
    const kr = record as KancingRecord;
    return {
      id: kr.id,
      workOrderId: kr.workOrderId,
      tanggal: toDateOnly(kr.tanggalLaporan),
      qty: toNumber(kr.qtyKancing),
      pic: toText(kr.picKancing),
      bukti: toText(kr.imageName),
    };
  }
  const sr = record as SewingRecord;
  return {
    id: sr.id,
    workOrderId: sr.workOrderId,
    tanggal: toDateOnly(sr.tanggalLaporan),
    qty: toNumber(sr.qtySelesai),
    pic: toText(sr.picPenjahit),
    bukti: toText(sr.imageName),
  };
}

/**
 * Join ke work order lalu urutkan tanggal menaik. Baris tanpa tanggal
 * ditaruh paling bawah supaya tidak mengganggu pembacaan urutan.
 *
 * Produk / Warna / Size **selalu** dibaca dari work order — sumber yang sama
 * dipakai tab Sewing Log di Production Monitoring
 * (`workOrders.find(w => w.id === sr.workOrderId)?.product`).
 *
 * Kode work order internal sengaja **tidak** dibawa ke baris: kolom Produk
 * hanya berisi nama produknya, bukan `work_code` yang bentuknya seperti
 * "Produksi - Awal | Sheen Pants | White | S".
 */
export function buildLaporanRows(
  kind: LaporanKind,
  records: Array<SewingRecord | KancingRecord | FinishingRecord>,
  workOrders: WorkOrder[],
): LaporanRow[] {
  const byId = new Map(workOrders.map((wo) => [wo.id, wo]));

  const rows = records.map((record) => {
    const draft = toDraft(kind, record);
    const wo = byId.get(draft.workOrderId);
    return {
      id: draft.id,
      workOrderId: draft.workOrderId,
      tanggal: draft.tanggal,
      produk: toText(wo?.product),
      warna: toText(wo?.warna),
      size: toText(wo?.size),
      qty: draft.qty,
      pic: draft.pic,
      bukti: draft.bukti,
    };
  });

  rows.sort((a, b) => {
    if (!a.tanggal !== !b.tanggal) return a.tanggal ? -1 : 1;
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  return rows;
}

export interface LaporanFilters {
  /** 'YYYY-MM' — kosong berarti semua bulan. */
  bulan: string;
  /** Nama produk — kosong berarti semua produk. */
  produk: string;
  /** Nama PIC — kosong berarti semua PIC. */
  pic: string;
}

export const EMPTY_FILTERS: LaporanFilters = { bulan: '', produk: '', pic: '' };

/** Slicer bersifat AND: baris harus lolos semua filter yang aktif. */
export function applyLaporanFilters(rows: LaporanRow[], filters: LaporanFilters): LaporanRow[] {
  const { bulan, produk, pic } = filters;
  if (!bulan && !produk && !pic) return rows;

  return rows.filter((row) => {
    if (bulan && !row.tanggal.startsWith(bulan)) return false;
    if (produk && row.produk !== produk) return false;
    if (pic && row.pic !== pic) return false;
    return true;
  });
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Opsi slicer bulan, diambil dari tanggal baris yang ada. Urut menurun
 *  (bulan terbaru di atas) dan diformat 'Agustus 2026'. */
export function bulanOptions(rows: LaporanRow[]): FilterOption[] {
  const months = new Set<string>();
  for (const row of rows) {
    if (row.tanggal.length >= 7) months.add(row.tanggal.slice(0, 7));
  }
  return [...months]
    .sort()
    .reverse()
    .map((ym) => ({ value: ym, label: formatBulan(ym) }));
}

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** '2026-08' → 'Agustus 2026'. Mengembalikan nilai aslinya bila tidak valid. */
export function formatBulan(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return ym;
  return `${BULAN_ID[month - 1]} ${match[1]}`;
}

/** Opsi unik dari satu field teks, urut alfabet. Nilai kosong dilewati —
 *  namanya kosong, jadi tidak ada yang bisa dipilih secara bermakna. */
function uniqueOptions(rows: LaporanRow[], pick: (row: LaporanRow) => string): FilterOption[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = pick(row);
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => (a < b ? -1 : 1)).map((v) => ({ value: v, label: v }));
}

export function produkOptions(rows: LaporanRow[]): FilterOption[] {
  return uniqueOptions(rows, (row) => row.produk);
}

export function picOptions(rows: LaporanRow[]): FilterOption[] {
  return uniqueOptions(rows, (row) => row.pic);
}

export function warnaOptions(rows: LaporanRow[]): FilterOption[] {
  return uniqueOptions(rows, (row) => row.warna);
}

export function sizeOptions(rows: LaporanRow[]): FilterOption[] {
  return uniqueOptions(rows, (row) => row.size);
}

export interface LaporanSummary {
  /** Σ qty baris yang lolos filter — dipakai baris Total. */
  totalQty: number;
  rowCount: number;
  workOrderCount: number;
  produkCount: number;
  picCount: number;
  /** Jumlah baris yang punya bukti. */
  buktiCount: number;
}

export function summarizeLaporan(rows: LaporanRow[]): LaporanSummary {
  let totalQty = 0;
  let buktiCount = 0;
  const workOrders = new Set<string>();
  const produk = new Set<string>();
  const pics = new Set<string>();

  for (const row of rows) {
    totalQty += row.qty;
    if (row.bukti) buktiCount += 1;
    workOrders.add(row.workOrderId);
    if (row.produk) produk.add(row.produk);
    if (row.pic) pics.add(row.pic);
  }

  return {
    totalQty,
    rowCount: rows.length,
    workOrderCount: workOrders.size,
    produkCount: produk.size,
    picCount: pics.size,
    buktiCount,
  };
}

function esc(value: string | number | null | undefined): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** CSV siap unduh: header, baris, lalu baris Total.
 *  BOM + escaping mengikuti pola ekspor yang sudah ada
 *  (src/pages/ProductionMonitoring.tsx handleExportRaw). */
export function laporanToCsv(
  rows: LaporanRow[],
  summary: LaporanSummary,
  picHeader: string,
): string {
  const header = ['Tanggal', 'Produk', 'Warna', 'Size', 'Qty', 'Bukti Barang', picHeader];

  const lines = rows.map((r) =>
    [
      r.tanggal,
      r.produk || EM_DASH,
      r.warna || EM_DASH,
      r.size || EM_DASH,
      r.qty,
      r.bukti || EM_DASH,
      r.pic || EM_DASH,
    ]
      .map(esc)
      .join(','),
  );

  const totalRow = ['', 'Total', '', '', summary.totalQty, '', ''].map(esc);
  lines.push(totalRow.join(','));

  return '﻿' + [header.map(esc).join(','), ...lines].join('\r\n');
}
