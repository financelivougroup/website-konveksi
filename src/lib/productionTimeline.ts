import type {
  CuttingRecord,
  FinishingRecord,
  KancingRecord,
  SewingRecord,
  WorkOrder,
} from '@/types/pipeline';
// Impor NILAI (bukan type) harus relatif ber-ekstensi: `node --test` tidak bisa
// meresolusi alias `@/`, sedangkan impor type di atas aman karena Node
// menghapusnya saat runtime. Pola yang sama dipakai src/lib/kanban.ts.
import { toDateOnly } from './laporanCompute.ts';

// ===== Garis waktu produksi satu Kode Produksi Konveksi =====
// Helper murni: tidak fetch, tidak mengimpor Supabase, tidak menulis data —
// sama seperti src/lib/laporanCompute.ts dan src/lib/kanban.ts, supaya aturannya
// bisa diuji tanpa merender halaman.
//
// Kenapa ada berkas terpisah: dialog kartu Kanban menampilkan SATU grafik
// harian yang mencampur keempat tahap (cutting/jahit/kancing/finishing) dan satu
// tabel riwayat gabungan. `LaporanKind` di laporanCompute sengaja TIDAK diperluas
// dengan `'cutting'` — memperluasnya akan memecah `PIC_LABEL[kind]` dan
// `ACCENT[kind]` di tiga tempat, dan diam-diam salah rute beberapa percabangan.
// Jadi tahap di sini punya tipe sendiri, dan pemetaan field-nya mengikuti
// `toDraft` (laporanCompute) + `FINISHING_FIELDS` (logDashboard) supaya tidak ada
// dua aturan tanggal/qty yang bisa berbeda.

export type StageKey = 'cutting' | 'sewing' | 'kancing' | 'finishing';

/** Urutan lini produksi — dipakai grafik, tabel, dan badge. */
export const STAGES: StageKey[] = ['cutting', 'sewing', 'kancing', 'finishing'];

export interface StageMeta {
  label: string;
  /** Header kolom PIC untuk tahap ini. */
  picLabel: string;
  /** Tone badge di `softBadgeClass` (tableStyles). */
  tone: 'slate' | 'blue' | 'violet' | 'emerald';
}

export const STAGE_META: Record<StageKey, StageMeta> = {
  cutting: { label: 'Cutting', picLabel: 'PIC', tone: 'slate' },
  sewing: { label: 'Sewing', picLabel: 'Penjahit', tone: 'blue' },
  kancing: { label: 'Kancing', picLabel: 'Pemasang', tone: 'violet' },
  finishing: { label: 'Finishing', picLabel: 'Finisher', tone: 'emerald' },
};

export interface StageRow {
  id: string;
  stage: StageKey;
  /** 'YYYY-MM-DD', atau '' bila sumber tanggalnya kosong. */
  tanggal: string;
  /** Nama produk/warna/size — lookup dari work order (sumber yang sama dipakai
   *  tabel laporan lain), bukan dari recordnya. */
  warna: string;
  size: string;
  qty: number;
  /** Nama orang yang mengerjakan (PIC / Penjahit / Pemasang / Finisher). */
  pic: string;
  /** Nama berkas bukti; '' bila tidak ada. */
  bukti: string;
}

/** Satu titik grafik: qty per tahap pada satu tanggal. */
export interface DayPoint {
  tanggal: string;
  /** Label sumbu X: 'DD/MM'. */
  label: string;
  cutting: number;
  sewing: number;
  kancing: number;
  finishing: number;
}

export interface StageSources {
  workOrders: WorkOrder[];
  cutting: CuttingRecord[];
  sewing: SewingRecord[];
  kancing: KancingRecord[];
  finishing: FinishingRecord[];
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const STAGE_INDEX: Record<StageKey, number> = {
  cutting: 0,
  sewing: 1,
  kancing: 2,
  finishing: 3,
};

/** Terbaru di atas; tanggal kosong selalu di bawah; seri dipecah urutan lini lalu id. */
function compareDesc(a: StageRow, b: StageRow): number {
  if (!a.tanggal !== !b.tanggal) return a.tanggal ? -1 : 1;
  if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
  if (a.stage !== b.stage) return STAGE_INDEX[a.stage] - STAGE_INDEX[b.stage];
  return a.id < b.id ? -1 : 1;
}

/**
 * Satukan keempat sumber catatan menjadi satu deret baris, **hanya untuk work
 * order yang diberikan**.
 *
 * Penyaringan lewat peta id work order (bukan pencocokan nama produk): dua kode
 * produksi bisa memuat produk yang sama, jadi mencocokkan nama akan membocorkan
 * baris kode lain. Ini cara yang sama dipakai `rowsForGroup` (logDashboard.ts).
 */
export function buildStageRows({
  workOrders,
  cutting,
  sewing,
  kancing,
  finishing,
}: StageSources): StageRow[] {
  const woById = new Map(workOrders.map((wo) => [wo.id, wo]));
  const rows: StageRow[] = [];

  const push = (
    stage: StageKey,
    id: string,
    workOrderId: string,
    tanggal: string,
    qty: unknown,
    pic: string,
    bukti: string,
  ) => {
    const wo = woById.get(workOrderId);
    if (!wo) return; // catatan milik work order lain → tidak ikut
    rows.push({
      id,
      stage,
      tanggal,
      warna: toText(wo.warna),
      size: toText(wo.size),
      qty: toNumber(qty),
      pic,
      bukti,
    });
  };

  for (const r of cutting) {
    push('cutting', r.id, r.workOrderId, toDateOnly(r.inputAt), r.totalCutting, toText(r.inputBy), '');
  }
  for (const r of sewing) {
    push('sewing', r.id, r.workOrderId, toDateOnly(r.tanggalLaporan), r.qtySelesai, toText(r.picPenjahit), toText(r.imageName));
  }
  for (const r of kancing) {
    push('kancing', r.id, r.workOrderId, toDateOnly(r.tanggalLaporan), r.qtyKancing, toText(r.picKancing), toText(r.imageName));
  }
  for (const r of finishing) {
    // finishing_records tidak selalu punya `tanggalImport`/`picFinishing`:
    // tanggal jatuh ke `syncedAt`, PIC jatuh ke `inputBy` — sama seperti
    // FINISHING_FIELDS di logDashboard.ts.
    push(
      'finishing',
      r.id,
      r.workOrderId,
      toDateOnly(r.tanggalImport) || toDateOnly(r.syncedAt),
      r.qtyFinishing,
      toText(r.picFinishing) || toText(r.inputBy),
      toText(r.imageName),
    );
  }

  return rows.sort(compareDesc);
}

function formatDayLabel(tanggal: string): string {
  const [, m, d] = tanggal.split('-');
  return `${d}/${m}`;
}

/**
 * Jumlahkan qty per tanggal per tahap, urut menaik (kiri = paling lama) supaya
 * grafik terbaca sebagai pergerakan waktu. Baris tanpa tanggal diabaikan —
 * tidak ada tempat menggantungkannya di sumbu X.
 */
export function buildDayPoints(rows: StageRow[]): DayPoint[] {
  const byDate = new Map<string, DayPoint>();

  for (const row of rows) {
    if (!row.tanggal) continue;
    let point = byDate.get(row.tanggal);
    if (!point) {
      point = {
        tanggal: row.tanggal,
        label: formatDayLabel(row.tanggal),
        cutting: 0,
        sewing: 0,
        kancing: 0,
        finishing: 0,
      };
      byDate.set(row.tanggal, point);
    }
    point[row.stage] += row.qty;
  }

  return [...byDate.values()].sort((a, b) => (a.tanggal < b.tanggal ? -1 : 1));
}

/**
 * Saring baris ke satu tahap (atau semua), urut menurun untuk tabel riwayat.
 *
 * Diurutkan ulang di sini — bukan hanya mengandalkan urutan masukan — supaya
 * hasilnya tetap benar apa pun asal barisnya.
 */
export function filterStageRows(rows: StageRow[], stage: StageKey | 'all'): StageRow[] {
  const filtered = stage === 'all' ? rows : rows.filter((row) => row.stage === stage);
  return [...filtered].sort(compareDesc);
}
