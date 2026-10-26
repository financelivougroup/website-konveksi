import { supabase } from '@/lib/supabase';
import { getNationalHolidaysInMonth } from '@/data/nationalHolidays';
import { gabungLibur, type Divisi, type DivisiEntry, type KpiEntry, type KpiOrang } from '@/lib/kpi';
import type {
  KpiOrangRow,
  KpiPeriodeData,
  KpiProduksiRow,
  KpiScope,
  KpiTargetRow,
  KpiUpahPribadi,
  KpiHistoryCursor,
  KpiHistoryRow,
} from '@/types/kpi';

/**
 * Lapisan IO dashboard "Monitor Kinerja Produksi".
 *
 * Dua aturan yang membentuk seluruh modul ini:
 *
 * 1. **Realisasi dibaca lewat RPC scoped (`kpi_produksi_orang`/`kpi_tarif_entries`)**, bukan langsung ke
 *    `sewing_records`/`finishing_records`. Fungsi itu yang menegakkan pembatasan
 *    per-orang di database; membaca tabelnya langsung akan melewati pembatasan
 *    itu karena policy baca tabel tersebut masih terbuka.
 *
 * 2. **Data sensitif tidak pernah diminta untuk role terbatas.** `target_biaya`
 *    dan tarif per pcs hanya di-query ketika sesi berhak melihat tim. RLS sudah
 *    menolaknya, tetapi tidak meminta lebih baik daripada meminta lalu
 *    membuang — tidak ada yang perlu disaring di browser.
 *
 * Modul ini tidak pernah menulis apa pun: dashboard ini READ-ONLY terhadap data
 * produksi.
 */

const PRODUKSI_RPC = 'kpi_produksi_harian';
const TARGET_RPC = 'kpi_target_bulanan';
const ORANG_RPC = 'kpi_orang_list';
const SCOPE_RPC = 'kpi_orang_scope';
const BULAN_RPC = 'kpi_bulan_tersedia';
const LIBUR_RPC = 'kpi_hari_libur';

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

// RPC produksi tidak mengekspos entry_id; gunakan paging berurutan dari RPC
// yang sudah mengurutkan hasilnya. Kegagalan halaman mana pun menggagalkan laporan.
async function readRpcRows(name: string, args?: Record<string, unknown>) {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const result = await supabase.rpc(name, args).range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    const page = (result.data ?? []) as Record<string, unknown>[];
    if (page.length === 0) return { data: rows, error: null };
    rows.push(...page);
    offset += page.length;
  }
}

// ===========================================================================
// Identitas sesi
// ===========================================================================

/**
 * Siapa yang sedang login menurut DATABASE.
 *
 * Halaman per orang memakai ini, bukan parameter URL: untuk penjahit/finishing,
 * id di alamat halaman diabaikan sepenuhnya (brief bagian 2). Akun tanpa
 * `orang_id` mendapat `punyaAkses: false` sehingga UI bisa menampilkan pesan
 * yang jujur alih-alih halaman kosong yang membingungkan.
 */
export async function fetchScope(): Promise<{ data: KpiScope | null; error: Error | null }> {
  const { data, error } = await supabase.rpc(SCOPE_RPC);
  if (error) return { data: null, error: toError(error, 'Gagal membaca identitas sesi.') };

  const rows = (data ?? []) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) {
    // Fungsi selalu mengembalikan satu baris; tidak ada baris berarti sesi tidak
    // dikenali. Jangan menebak sebagai owner.
    return {
      data: { orangId: null, nama: null, divisi: null, bisaTim: false, punyaAkses: false },
      error: null,
    };
  }

  return {
    data: {
      orangId: row.orang_id == null ? null : Number(row.orang_id),
      nama: (row.nama as string | null) ?? null,
      divisi: ((row.divisi as string | null) ?? null) as Divisi | null,
      bisaTim: row.bisa_tim === true,
      punyaAkses: row.punya_akses === true,
    },
    error: null,
  };
}

// ===========================================================================
// Bulan & daftar orang
// ===========================================================================

/** Bulan (`YYYY-MM`) yang punya data untuk sesi ini, terbaru dulu. */
export async function fetchBulanTersedia(): Promise<{ data: string[]; error: Error | null }> {
  const { data, error } = await supabase.rpc(BULAN_RPC);
  if (error) return { data: [], error: toError(error, 'Gagal membaca daftar bulan.') };
  const rows = (data ?? []) as Array<{ bulan?: unknown }>;
  return {
    data: rows
      .map((r) => String(r.bulan ?? ''))
      .filter((b) => /^\d{4}-\d{2}$/.test(b)),
    error: null,
  };
}

/** Daftar orang beserta divisi dan status aktifnya. */
export async function fetchOrangList(): Promise<{ data: KpiOrangRow[]; error: Error | null }> {
  const { data, error } = await supabase.rpc(ORANG_RPC);
  if (error) return { data: [], error: toError(error, 'Gagal membaca daftar orang.') };

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    data: rows.map((row) => ({
      orangId: Number(row.orang_id),
      nama: String(row.nama ?? ''),
      divisi: String(row.divisi ?? 'penjahit') as Divisi,
      aktif: row.aktif === true,
      punyaAkun: row.punya_akun === true,
    })),
    error: null,
  };
}

/** Hari libur manual dari `daftar_libur` pada rentang tertentu. */
async function fetchLiburManual(dari: string, sampai: string): Promise<string[]> {
  const { data, error } = await supabase.rpc(LIBUR_RPC, { p_dari: dari, p_sampai: sampai });
  // Libur mengubah pembagi target/proyeksi; kegagalan baca bukan berarti nol libur.
  if (error) throw toError(error, 'Gagal membaca hari libur.');
  const rows = (data ?? []) as Array<{ tanggal?: unknown }>;
  return rows.map((r) => String(r.tanggal ?? '')).filter(Boolean);
}

/** Libur nasional untuk setiap bulan yang tersentuh rentang. */
function liburNasional(dari: string, sampai: string): string[] {
  const awal = dari.slice(0, 7);
  const akhir = sampai.slice(0, 7);
  const hasil: string[] = [];
  let [y, m] = awal.split('-').map(Number);
  const [yAkhir, mAkhir] = akhir.split('-').map(Number);
  if (!y || !m) return hasil;

  // Batas 120 bulan sebagai pengaman agar tidak berputar tanpa henti bila
  // pemanggil memberi rentang yang tidak masuk akal.
  for (let i = 0; i < 120; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    hasil.push(...getNationalHolidaysInMonth(ym));
    if (y === yAkhir && m === mAkhir) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return hasil;
}

// ===========================================================================
// Data periode
// ===========================================================================

export interface PeriodeQuery {
  /** `YYYY-MM-DD`. */
  dari: string;
  /** `YYYY-MM-DD`. */
  sampai: string;
  /**
   * Batasi ke satu orang. Diabaikan server untuk akun non-owner/finance —
   * nilainya tetap dikirim agar owner/finance bisa membuka halaman per orang.
   */
  orangId?: number | null;
  /** False untuk role terbatas: tarif & target biaya tidak diminta sama sekali. */
  bolehLihatBiaya: boolean;
}

/**
 * Seluruh data mentah satu periode, siap diolah `src/lib/kpi.ts`.
 *
 * `entries` sudah membawa tarif per entry sehingga modul rumus tetap murni dan
 * bisa diuji tanpa database.
 */
export async function fetchPeriodeData(
  query: PeriodeQuery,
): Promise<{ data: KpiPeriodeData | null; error: Error | null }> {
  const { dari, sampai, bolehLihatBiaya } = query;

  const [produksiRes, targetRes, orangRes, liburRes, bulanRes, biayaRes] = await Promise.all([
    readRpcRows(bolehLihatBiaya ? 'kpi_tarif_entries' : query.orangId != null ? 'kpi_produksi_orang' : PRODUKSI_RPC, {
      p_dari: dari,
      p_sampai: sampai,
      p_orang_id: query.orangId ?? null,
    }),
    readRpcRows(TARGET_RPC, { p_dari: dari, p_sampai: sampai }),
    supabase.rpc(ORANG_RPC),
    fetchLiburManual(dari, sampai),
    supabase.from('bulan_status').select('bulan, status'),
    bolehLihatBiaya
      ? supabase.from('target_biaya')
          .select('divisi, bulan, target_per_pcs')
          .gte('bulan', `${dari.slice(0, 7)}-01`)
          .lte('bulan', `${sampai.slice(0, 7)}-01`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (produksiRes.error) {
    return { data: null, error: toError(produksiRes.error, 'Gagal memuat realisasi produksi.') };
  }
  if (targetRes.error) {
    return { data: null, error: toError(targetRes.error, 'Gagal memuat target produksi.') };
  }
  if (orangRes.error || bulanRes.error || (bolehLihatBiaya && biayaRes.error)) {
    return {
      data: null,
      error: toError(orangRes.error ?? bulanRes.error ?? biayaRes.error, 'Gagal memuat identitas, status bulan, atau target biaya.'),
    };
  }

  const produksiRows = ((produksiRes.data ?? []) as Record<string, unknown>[]).map(
    (row): KpiProduksiRow => ({
      tanggal: String(row.tanggal ?? '').slice(0, 10),
      divisi: (row.divisi === 'finishing' ? 'finishing' : 'penjahit') as DivisiEntry,
      orangId: row.orang_id == null ? null : Number(row.orang_id),
      orangNama: (row.orang_nama as string | null) ?? null,
      pcs: Number(row.pcs) || 0,
      workOrderId: (row.work_order_id as string | null) ?? null,
      workCode: (row.work_code as string | null) ?? null,
    }),
  );

  const targetRows = ((targetRes.data ?? []) as Record<string, unknown>[]).map(
    (row): KpiTargetRow => ({
      targetId: Number(row.target_id),
      bulan: String(row.bulan ?? '').slice(0, 7),
      orangId: row.orang_id == null ? null : Number(row.orang_id),
      nama: String(row.nama ?? ''),
      divisi: String(row.divisi ?? 'penjahit') as Divisi,
      targetPcs: Number(row.target_pcs) || 0,
      statusFinal: (row.status_final as string | null) ?? null,
    }),
  );

  const orang = ((orangRes.data ?? []) as Record<string, unknown>[]).map(
    (row): KpiOrang => ({
      orangId: Number(row.orang_id),
      nama: String(row.nama ?? ''),
      divisi: String(row.divisi ?? 'penjahit') as Divisi,
      aktif: row.aktif === true,
    }),
  );

  // ---- Tarif ----
  // Hanya diminta bila sesi berhak melihat biaya. Untuk role terbatas, seluruh
  // entry mendapat tarif null sehingga UI menampilkan "Tarif belum diisi" dan
  // tidak ada angka upah yang bocor.
  const resolvedRows = (produksiRes.data ?? []) as Record<string, unknown>[];
  const entries: KpiEntry[] = produksiRows.map((r, index) => ({
    tanggal: r.tanggal,
    orangId: r.orangId,
    orangNama: r.orangNama ?? '',
    divisi: r.divisi,
    pcs: r.pcs,
    tarif: bolehLihatBiaya && resolvedRows[index]?.tarif != null ? Number(resolvedRows[index].tarif) : null,
  }));

  // ---- Target per orang & per bulan ----
  // Beberapa baris `target_jahit` bisa menunjuk orang yang sama (satu baris per
  // bulan). Yang dipakai adalah yang bulannya masuk rentang ini.
  //
  // Saat `orangId` diisi (halaman per orang milik owner/finance), target orang
  // LAIN dibuang di sini. RPC target hanya menyaring menurut role, jadi tanpa
  // penyaringan ini halaman satu orang akan memakai total target seluruh tim
  // sebagai goal-nya.
  const targetPerOrang = new Map<number, number>();
  const targetPerBulan = new Map<string, number>();
  const targetPerBulanPerDivisi = new Map<string, Map<Divisi, number>>();
  for (const t of targetRows) {
    if (query.orangId != null && t.orangId !== query.orangId) continue;
    if (t.orangId !== null) {
      targetPerOrang.set(t.orangId, (targetPerOrang.get(t.orangId) ?? 0) + t.targetPcs);
    }
    const perDivisi = targetPerBulanPerDivisi.get(t.bulan) ?? new Map<Divisi, number>();
    perDivisi.set(t.divisi, (perDivisi.get(t.divisi) ?? 0) + t.targetPcs);
    targetPerBulanPerDivisi.set(t.bulan, perDivisi);
    // Target akumulasi Team memakai produksi jahit; finishing punya gauge terpisah.
    if (query.orangId != null || t.divisi !== 'finishing') {
      targetPerBulan.set(t.bulan, (targetPerBulan.get(t.bulan) ?? 0) + t.targetPcs);
    }
  }

  // ---- Target biaya (HPP) ----
  const targetBiaya = new Map<Divisi | 'total', number>();
  if (bolehLihatBiaya) {
    for (const row of [...(biayaRes.data ?? [])].sort((a, b) => a.bulan.localeCompare(b.bulan)) as Array<{
      bulan: string;
      divisi: string;
      target_per_pcs: number | string;
    }>) {
      const divisi = row.divisi as Divisi | 'total';
      // Peta ringkas memakai target bulan terakhir; tren memakai target per bulan.
      targetBiaya.set(divisi, Number(row.target_per_pcs) || 0);
    }
  }

  // ---- HPP target per bulan ----
  // Dibutuhkan grafik biaya akumulasi. Jangan dijumlahkan sebelum menghitung
  // biaya per divisi: setiap bulan dapat memiliki target unit-cost berbeda.
  const targetBiayaPerBulan = new Map<string, Map<Divisi | 'total', number>>();
  if (bolehLihatBiaya) {
    for (const row of (biayaRes.data ?? []) as Array<{
      bulan: string;
      divisi: string;
      target_per_pcs: number | string;
    }>) {
      const ym = String(row.bulan).slice(0, 7);
      const divisi = row.divisi as Divisi | 'total';
      const perDivisi = targetBiayaPerBulan.get(ym) ?? new Map<Divisi | 'total', number>();
      perDivisi.set(divisi, Number(row.target_per_pcs) || 0);
      targetBiayaPerBulan.set(ym, perDivisi);
    }
  }

  // ---- Bulan final ----
  const bulanFinal = new Set<string>();
  for (const row of (bulanRes.data ?? []) as Array<{ bulan: string; status: string }>) {
    if (row.status === 'final') bulanFinal.add(String(row.bulan).slice(0, 7));
  }

  return {
    data: {
      entries,
      legacyRateCount: bolehLihatBiaya ? resolvedRows.filter(r=>r.provenance==='baseline_unverified').length : undefined,
      orang,
      targets: targetRows.filter((t) => query.orangId == null || t.orangId === query.orangId),
      targetPerOrang,
      targetPerBulan,
      targetPerBulanPerDivisi,
      targetBiaya,
      targetBiayaPerBulan,
      bulanFinal,
      libur: gabungLibur(liburNasional(dari, sampai), liburRes),
    },
    error: null,
  };
}

export async function fetchLegacyPribadi(dari: string, sampai: string, orangId: number) {
  const r = await supabase.rpc('kpi_legacy_pribadi', { p_dari: dari, p_sampai: sampai, p_orang_id: orangId });
  if (r.error) throw toError(r.error, 'Gagal memeriksa asal tarif pribadi.');
  return r.data === true;
}

/** Agregat milik sendiri untuk staff; tidak membaca tabel tarif dari browser. */
export async function fetchUpahPribadi(dari: string, sampai: string, orangId: number): Promise<{ data: KpiUpahPribadi[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('kpi_upah_pribadi', { p_dari: dari, p_sampai: sampai, p_orang_id: orangId });
  if (error) return { data: [], error: toError(error, 'Gagal membaca estimasi upah pribadi.') };
  return { data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    bulan: String(r.bulan), pcsTotal: Number(r.pcs_total), pcsBertarif: Number(r.pcs_bertarif),
    estimasi: r.estimasi == null ? null : Number(r.estimasi), entryTanpaTarif: Number(r.entry_tanpa_tarif), pcsTanpaTarif: Number(r.pcs_tanpa_tarif),
  })), error: null };
}

export async function fetchRiwayatPribadi(dari: string, sampai: string, orangId: number, cursor: KpiHistoryCursor | null, pageSize = 10): Promise<{ data: KpiHistoryRow[]; next: KpiHistoryCursor | null; error: Error | null }> {
  const size = Math.min(100, Math.max(1, pageSize));
  const { data, error } = await supabase.rpc('kpi_riwayat_pribadi', {
    p_dari: dari, p_sampai: sampai, p_orang_id: orangId, p_limit: size + 1,
    p_sebelum_tanggal: cursor?.tanggal ?? null, p_sebelum_divisi: cursor?.divisi ?? null, p_sebelum_id: cursor?.entryId ?? null,
  });
  if (error) return { data: [], next: null, error: toError(error, 'Gagal membaca riwayat setoran.') };
  const rows: KpiHistoryRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ entryId: String(r.entry_id), tanggal: String(r.tanggal), divisi: r.divisi === 'finishing' ? 'finishing' : 'penjahit', pcs: Number(r.pcs) }));
  return { data: rows.slice(0, size), next: rows.length > size ? rows[size - 1] : null, error: null };
}

// ===========================================================================
// Rentang bantu
// ===========================================================================

/** Tanggal pertama bulan dari `YYYY-MM`. */
export function awalBulan(ym: string): string {
  return `${ym}-01`;
}

/** Tanggal terakhir bulan dari `YYYY-MM`. */
export function akhirBulan(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return `${ym}-01`;
  const hari = new Date(y, m, 0).getDate();
  return `${ym}-${String(hari).padStart(2, '0')}`;
}

/** Bulan berjalan sebagai `YYYY-MM` menurut waktu lokal. */
export function bulanBerjalan(hariIni: Date = new Date()): string {
  return `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}`;
}
