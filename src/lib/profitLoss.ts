// ===== Profit & Loss: logika murni =====
// Tidak fetch, tidak mengimpor Supabase, tidak menulis data — sama seperti
// src/lib/expenseEntries.ts dan src/lib/targetJahitReport.ts, supaya aturan
// hitungan bisa dikunci tes tanpa merender halaman.
//
// TIGA KEPUTUSAN YANG MENENTUKAN SELURUH ANGKA DI HALAMAN INI:
//
// 1. INCOME = `totalAmount` SELURUH invoice, tanpa memandang status pembayaran
//    (basis akrual). Dipilih pemilik produk: P&L di sini mengukur kinerja
//    produksi — berapa nilai yang berhasil ditagih pada periode itu —
//    sedangkan status pembayaran sudah punya layarnya sendiri di Invoicing.
//
//    Kolom `total_income_manpower` dan `total_income_operational` SENGAJA
//    TIDAK dipakai. Keduanya adalah PEMBAGIAN INTERNAL dari `total_amount`,
//    bukan tambahan di atasnya: `computeInvoiceFinancials` di
//    src/lib/invoiceCompute.ts menjamin
//      manpower = pcs × rateManpower
//      operational = pcs × (unitPrice − rateManpower)
//      totalAmount = pcs × unitPrice = manpower + operational
//    Jadi menjumlahkan ketiganya akan MELIPATGANDAKAN pendapatan. Yang
//    dilaporkan sebagai income hanyalah `totalAmount`.
//
// 2. EXPENSE = `totalPayment`, bukan `total`. Ini uang yang benar-benar keluar:
//    sudah termasuk ongkir dan setelah dipotong diskon. Sama persis dengan yang
//    dipakai `summarizeExpenses` dan `buildMonthlyTrend` di
//    src/lib/expenseEntries.ts — dengan begitu angka halaman P&L dan angka
//    halaman Expense tidak akan pernah berbeda, dan tidak ada dua definisi
//    "biaya" yang beredar di aplikasi ini.
//
// 3. PROFIT = income − expense. Nilai negatif SAH dan **tidak dijepit ke 0**.
//    Berbeda dengan `computeOutstanding` yang menjepit di 0 karena "kelebihan
//    bayar" bukan piutang, di sini negatif berarti RUGI — dan itu justru
//    informasi yang dicari dari sebuah laporan laba/rugi.

/**
 * Bentuk input yang dibutuhkan modul ini — SENGAJA struktural, bukan impor
 * `ExpenseEntry`/`InvoiceRow`.
 *
 * Alasannya sama dengan modul murni lain di repo ini: `node --test` tidak punya
 * bundler, jadi modul ini tidak boleh menarik tipe dari berkas yang mengimpor
 * Supabase. Tipe struktural juga membuat tes bisa menyusun baris seperlunya
 * tanpa memalsukan puluhan kolom yang tidak relevan.
 */
export interface ProfitLossExpenseInput {
  /** `YYYY-MM-DD`. */
  entryDate: string;
  /** Uang yang benar-benar keluar (termasuk ongkir, setelah diskon). */
  totalPayment: number;
  /** Salinan nama saat dicatat — dokumen historis, bukan relasi kategori. */
  mainCategoryName: string;
  subCategoryName: string;
}

export interface ProfitLossInvoiceInput {
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  /** Nilai yang ditagih ke client. */
  totalAmount: number;
}

/** Label untuk nama kategori yang kosong — bukan string kosong yang tak terlihat. */
export const TANPA_KATEGORI = '(tanpa kategori)';

/** `YYYY-MM-DD` -> `YYYY-MM`. String kosong bila tanggalnya tidak terbaca. */
export function monthOf(date: string): string {
  const month = String(date ?? '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : '';
}

export interface ProfitLossMonth {
  /** `YYYY-MM` — kunci pengurutan yang tidak terpengaruh nama bulan. */
  month: string;
  income: number;
  expense: number;
  /** income − expense. Negatif berarti rugi. */
  profit: number;
  /** Jumlah invoice pada bulan ini. */
  invoiceCount: number;
  /** Jumlah catatan biaya pada bulan ini. */
  expenseCount: number;
}

/** Angka aman: NaN/undefined/Infinity dianggap 0, bukan merusak seluruh total. */
function safeAmount(value: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface MonthBucket {
  income: number;
  expense: number;
  invoiceCount: number;
  expenseCount: number;
}

/**
 * Gabungan income dan expense per bulan, terurut KRONOLOGIS.
 *
 * Bulan yang hanya punya invoice ATAU hanya punya biaya tetap muncul — kalau
 * hanya bulan yang punya keduanya yang ditampilkan, satu bulan yang belum ada
 * pengeluarannya akan hilang dari laporan padahal pendapatannya ada.
 *
 * Pengurutan lewat kunci `YYYY-MM`, bukan urutan `Map` (yang mengikuti urutan
 * kemunculan data) dan bukan nama bulan (yang mengurutkan menurut abjad, dan
 * akan menaruh "Agu 2026" sebelum "Jan 2026"). Pelajaran yang sama sudah
 * tercatat di src/lib/targetJahitReport.ts.
 */
export function buildProfitLossMonths(
  expenses: readonly ProfitLossExpenseInput[],
  invoices: readonly ProfitLossInvoiceInput[],
): ProfitLossMonth[] {
  const perMonth = new Map<string, MonthBucket>();

  const bucketOf = (month: string): MonthBucket => {
    const existing = perMonth.get(month);
    if (existing) return existing;
    const fresh: MonthBucket = { income: 0, expense: 0, invoiceCount: 0, expenseCount: 0 };
    perMonth.set(month, fresh);
    return fresh;
  };

  for (const invoice of invoices) {
    const month = monthOf(invoice.invoiceDate);
    if (!month) continue;
    const bucket = bucketOf(month);
    bucket.income += safeAmount(invoice.totalAmount);
    bucket.invoiceCount += 1;
  }

  for (const expense of expenses) {
    const month = monthOf(expense.entryDate);
    if (!month) continue;
    const bucket = bucketOf(month);
    bucket.expense += safeAmount(expense.totalPayment);
    bucket.expenseCount += 1;
  }

  return [...perMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      income: value.income,
      expense: value.expense,
      profit: value.income - value.expense,
      invoiceCount: value.invoiceCount,
      expenseCount: value.expenseCount,
    }));
}

/** Bulan yang tersedia untuk dipilih, TERBARU DULU — yang dicari adalah bulan terkini. */
export function monthOptions(months: readonly ProfitLossMonth[]): Array<{ value: string; label: string }> {
  return [...months]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((point) => ({ value: point.month, label: point.month }));
}

export interface SubCategoryRow {
  name: string;
  total: number;
  count: number;
}

export interface MainCategoryRow {
  name: string;
  total: number;
  count: number;
  /** Sub kategori di bawahnya, terbesar dulu. */
  subs: SubCategoryRow[];
}

/**
 * Rincian biaya bertingkat: Main Category → Sub Category, masing-masing
 * terbesar dulu.
 *
 * Dikelompokkan dari SALINAN NAMA yang tersimpan di baris expense
 * (`main_category_name` / `sub_category_name`), **bukan** dari pohon kategori
 * saat ini. Itu memang keputusan pemilik produk: catatan biaya adalah dokumen
 * historis, jadi mengganti nama kategori hari ini tidak boleh mengubah laporan
 * bulan lalu. Konsekuensinya kategori non-aktif tetap muncul di sini — dan itu
 * benar, karena biayanya memang terjadi.
 *
 * Satu kali lintas + satu pengurutan per tingkat, bukan `filter` per kategori
 * yang akan berulang kali melintasi array yang sama.
 */
export function buildCategoryBreakdown(
  expenses: readonly ProfitLossExpenseInput[],
): MainCategoryRow[] {
  const perMain = new Map<string, { total: number; count: number; subs: Map<string, SubCategoryRow> }>();

  for (const expense of expenses) {
    const amount = safeAmount(expense.totalPayment);
    const mainName = expense.mainCategoryName?.trim() || TANPA_KATEGORI;
    const subName = expense.subCategoryName?.trim() || TANPA_KATEGORI;

    let main = perMain.get(mainName);
    if (!main) {
      main = { total: 0, count: 0, subs: new Map() };
      perMain.set(mainName, main);
    }
    main.total += amount;
    main.count += 1;
    main.subs.set(subName, {
      name: subName,
      total: (main.subs.get(subName)?.total ?? 0) + amount,
      count: (main.subs.get(subName)?.count ?? 0) + 1,
    });
  }

  return [...perMain.entries()]
    .map(([name, value]) => ({
      name,
      total: value.total,
      count: value.count,
      subs: [...value.subs.values()].sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name),
      ),
    }))
    // Terbesar dulu; nama sebagai tie-break agar urutannya stabil antar render.
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/**
 * Margin profit dalam persen, dibulatkan ke satu desimal.
 *
 * Mengembalikan `null` bila income 0 — bukan 0% dan bukan 100%. Pembagian
 * dengan nol tidak punya arti di sini, dan menampilkan "0%" pada bulan yang
 * belum ada pendapatannya akan menyesatkan; halaman menampilkannya sebagai "—".
 */
export function marginPercent(income: number, profit: number): number | null {
  if (!Number.isFinite(income) || income === 0) return null;
  return Math.round((profit / income) * 1000) / 10;
}

// ===== Jendela periode =====
// Dipakai pemilih periode di header ("03/01/2026 - 03/31/2026") dan baris
// "vs Periode Sebelumnya" di kartu KPI.

/** Rentang tanggal INKLUSIF, keduanya `YYYY-MM-DD`. */
export interface Window {
  start: string;
  end: string;
}

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` -> epoch hari (UTC), atau `null` bila tidak terbaca. */
function toDayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // `Date.UTC` memetakan tahun 0-99 ke 1900-1999, sehingga batas bawah ALL_TIME
  // (`0001-01-01`) akan bergeser seabad dan diam-diam menolak semua tanggal.
  // Karena itu tahunnya dipasang lewat `setUTCFullYear`, bukan lewat Date.UTC.
  const probe = new Date(0);
  probe.setUTCFullYear(y, m - 1, d);
  probe.setUTCHours(0, 0, 0, 0);
  // Tolak tanggal yang "meluber", mis. 2026-02-31 yang dibetulkan Date jadi 3 Mar.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return Math.floor(probe.getTime() / MS_PER_DAY);
}

/** epoch hari -> `YYYY-MM-DD`. */
function fromDayNumber(day: number): string {
  const d = new Date(day * MS_PER_DAY);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Rentang satu bulan kalender penuh — `2026-09` -> 1 Sep s.d. 30 Sep.
 *
 * Akhir bulannya dihitung dari kalender, bukan "tanggal 30", jadi Februari
 * tidak terpotong dan bulan 31 hari tidak kehilangan sehari. Mengembalikan
 * `null` bila kuncinya bukan `YYYY-MM`.
 */
export function monthWindow(month: string): Window | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Bulan kalender SEBELUMNYA dari sebuah bulan — `2026-09` -> Agustus 2026.
 *
 * Sengaja berbasis bulan, bukan "mundur sekian hari". Mundur 30 hari dari
 * 1 September mendarat di 2 Agustus, sehingga pembandingnya kehilangan sehari
 * dan persentase perubahannya jadi salah sedikit tanpa terlihat.
 */
export function previousMonthWindow(month: string): Window | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  // `Date` menormalkan bulan negatif (Januari - 1 = Desember tahun sebelumnya).
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return monthWindow(`${prev.getUTCFullYear()}-${mm}`);
}

/**
 * Rentang dengan PANJANG SAMA yang persis mendahului `window`.
 *
 * Dipakai saat pemilih tanggal bebas diisi user dan tidak ada bulan kalender
 * yang bisa dipakai sebagai pembanding.
 */
export function shiftWindow(window: Window): Window | null {
  const start = toDayNumber(window.start);
  const end = toDayNumber(window.end);
  if (start === null || end === null || end < start) return null;
  const length = end - start + 1;
  const prevEnd = start - 1;
  const prevStart = prevEnd - (length - 1);
  return { start: fromDayNumber(prevStart), end: fromDayNumber(prevEnd) };
}

/** Apakah `date` (`YYYY-MM-DD`) berada di dalam `window`, inklusif di kedua ujung. */
export function inWindow(date: string, window: Window): boolean {
  const day = toDayNumber(date);
  const start = toDayNumber(window.start);
  const end = toDayNumber(window.end);
  if (day === null || start === null || end === null) return false;
  return day >= start && day <= end;
}

/** Jendela "Semua Waktu" — dipakai pemilih periode untuk mode tanpa batas. */
export const ALL_TIME: Window = { start: '0001-01-01', end: '9999-12-31' };

/**
 * Persentase perubahan terhadap periode pembanding, satu desimal.
 *
 * Mengembalikan `null` bila pembandingnya 0 — "naik tak hingga persen" bukan
 * informasi yang berguna, dan menampilkan "100%" atau "0%" di situ akan
 * mengarang angka. Halaman menampilkannya sebagai keterangan tanpa angka.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
