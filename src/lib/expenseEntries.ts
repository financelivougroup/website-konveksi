// Impor memakai jalur RELATIF ber-ekstensi `.ts`, bukan alias `@/`, karena
// modul ini diimpor langsung oleh `node --test` yang tidak punya bundler —
// aturan yang sama sudah berlaku di src/lib/logDashboard.ts dan sejenisnya.
import { pathOf, type ExpenseCategory } from './expenseCategories.ts';
import type { CategorySelection } from './expenseCategorySelection.ts';
import { computeTotal, computeTotalPayment, parseOptionalAmount, validateAmounts } from './expenseTotals.ts';

/**
 * Jumlah barang dari string input — bilangan bulat > 0.
 *
 * Didefinisikan di `expenseTotals.ts` dan diekspor ulang lewat re-export di
 * bawah supaya pemanggil tidak perlu tahu modul mana yang memiliki aturannya.
 */
import { parseCount } from './expenseTotals.ts';

// ===== Expense: logika murni =====
// Tidak fetch, tidak mengimpor Supabase, tidak menulis data — sama seperti
// src/lib/laporanCompute.ts dan src/lib/targetJahitReport.ts, supaya aturan
// perhitungan bisa dikunci tes tanpa merender halaman.
//
// Aturan yang paling mudah salah dan karena itu diuji di sini: SALINAN NAMA
// KATEGORI. Baris expense menyimpan nama tiap tingkat apa adanya saat dicatat
// (keputusan user — catatan biaya adalah dokumen historis), jadi salah salin
// berarti laporan lama menampilkan kategori yang keliru.

/** Satu baris expense seperti yang dibaca UI. */
export interface ExpenseEntry {
  id: number;
  /** `YYYY-MM-DD` — tanggal murni, tanpa jam. Ditampilkan sebagai "Date Invoice". */
  entryDate: string;
  /** Sub Category yang dipilih (tingkat terdalam yang selalu ada). */
  categoryId: number | null;
  /** Item yang dipilih; null karena Item memang opsional. */
  itemId: number | null;
  /**
   * Vendor tempat biaya dikeluarkan. `null` untuk baris GAJI, yang dibayarkan
   * ke seorang karyawan (`staffId`) dan bukan ke vendor.
   *
   * Tepat satu dari `vendorId` / `staffId` yang terisi — dijaga CHECK
   * `expense_entries_payee_check` di database dan `entryFromSelection` di klien.
   */
  vendorId: number | null;
  /**
   * Karyawan penerima gaji. `null` untuk pembelian biasa.
   *
   * Hanya terisi untuk baris gaji (MANPOWER › SALARY) — lihat
   * `src/lib/staffSalary.ts`.
   */
  staffId: number | null;
  /**
   * Nama pihak yang dibayar, DISALIN saat dicatat. Untuk baris gaji berisi
   * **nama karyawan**, bukan nama vendor — alasannya sama dengan nama kategori:
   * catatan biaya adalah dokumen historis.
   */
  vendorName: string;
  /** Jumlah barang. Wajib, harus > 0 — membeli 0 barang bukan pembelian. */
  quantity: number;
  /** Harga satu barang. Wajib, harus > 0. */
  unitPrice: number;
  /** `quantity × unitPrice`, dihitung database (kolom generated). */
  total: number;
  /** Ongkir + biaya admin. Opsional; kosong berarti 0. */
  shippingAdmin: number;
  /** Diskon / cashback. Opsional; kosong berarti 0. */
  discountCashback: number;
  /**
   * `total + shippingAdmin − discountCashback`, dihitung database.
   *
   * Selalu > 0 — dijaga CHECK di database dan `validateAmounts` di klien.
   */
  totalPayment: number;
  /** Sumber dana: Cash, Bank Transfer, Debit Card, dsb. Wajib. */
  flowTransaction: string;
  /**
   * Nomor invoice dari vendor. **Tidak lagi diminta user** — kolomnya masih
   * dibaca untuk data lama, tapi tidak lagi ditampilkan, dicari, atau diwajibkan.
   */
  invoiceNumber: string;
  /** Nama barang yang dibeli. Berbeda dari `itemName` (tingkat kategori). */
  namaBarang: string;
  /** Penanggung jawab catatan ini. Wajib. */
  pic: string;
  /** Foto bukti pembayaran — khusus keperluan reimburse. Opsional. */
  proofPaymentPath: string | null;
  proofPaymentUrl: string | null;
  typeName: string;
  mainCategoryName: string;
  subCategoryName: string;
  itemName: string;
  /** Jalur lengkap saat dicatat, mis. `PURCHASE › PRODUCTION › SEWING › Benang`. */
  categoryPath: string;
  note: string;
  proofPath: string | null;
  proofUrl: string | null;
  inputBy: string | null;
  createdAt: string;
}

/** Data mentah dari form, sebelum disalin ke baris. */
export interface ExpenseFormInput {
  date: string;
  /** Jumlah barang, string mentah dari `<input>`. */
  quantity: string;
  /** Harga per barang, string mentah dari `<input>`. */
  unitPrice: string;
  /** Ongkir + admin, string mentah. Kosong berarti 0. */
  shippingAdmin: string;
  /** Diskon / cashback, string mentah. Kosong berarti 0. */
  discountCashback: string;
  note: string;
  /**
   * Vendor terpilih. `null`/`undefined` hanya sah bila `staffId` terisi —
   * lihat aturan "tepat satu pihak" di `entryFromSelection`.
   */
  vendorId?: number | null;
  /** Daftar vendor untuk mencari namanya; disalin ke baris. */
  vendors?: readonly { id: number; nama: string }[];
  /**
   * Karyawan penerima gaji. `null`/`undefined` hanya sah bila `vendorId`
   * terisi. Hanya diisi saat membayar gaji (MANPOWER › SALARY).
   */
  staffId?: number | null;
  /** Daftar karyawan untuk mencari namanya; disalin ke baris. */
  staffs?: readonly { id: number; nama: string }[];
  /** Sumber dana; wajib diisi. */
  flowTransaction: string;
  /** Nomor invoice; sudah tidak dipakai form, dipertahankan untuk data lama. */
  invoiceNumber?: string;
  /** Nama barang; wajib diisi. */
  namaBarang: string;
  /** Penanggung jawab; wajib diisi. */
  pic: string;
  proofPaymentPath?: string | null;
  proofPaymentUrl?: string | null;
  proofPath?: string | null;
  proofUrl?: string | null;
  inputBy?: string | null;
}

/**
 * Nominal Rupiah dari string input.
 *
 * Mengembalikan `null` untuk semua yang bukan bilangan bulat positif: kosong,
 * desimal, nol, negatif, `NaN`, dan `Infinity`. Sengaja TIDAK membulatkan —
 * "1500.5" adalah ketikan yang salah, bukan angka yang boleh dibulatkan diam-diam
 * menjadi 1501. Ini mengikuti `parseAmount` di PaymentModal.
 *
 * Angka ditulis tanpa pemisah ribuan; "1.500.000" akan ditolak, dan itu benar,
 * karena titiknya terbaca sebagai desimal oleh `Number()`.
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Susun baris expense dari pilihan kategori bertingkat.
 *
 * Inilah satu-satunya tempat nama kategori disalin, sehingga tidak ada dua jalur
 * yang bisa berbeda pendapat tentang isinya. Keempat nama diambil dari baris
 * kategori yang SESUNGGUHNYA (bukan dari label dropdown), dan `categoryPath`
 * memakai `pathOf()` yang sama dengan halaman Kategori Biaya — jadi tampilannya
 * konsisten di kedua halaman.
 *
 * Mengembalikan `null` bila pilihan belum lengkap atau nominalnya tidak sah;
 * pemanggil tidak boleh menebak nilai pengganti.
 */
export function entryFromSelection(
  rows: readonly ExpenseCategory[],
  selection: CategorySelection,
  form: ExpenseFormInput,
): Omit<ExpenseEntry, 'id' | 'createdAt'> | null {
  if (!form.date) return null;

  // Jumlah dan Harga/Item wajib, dan keduanya harus bilangan bulat > 0.
  const quantity = parseCount(form.quantity);
  const unitPrice = parseAmount(form.unitPrice);
  if (quantity === null || unitPrice === null) return null;

  // Ongkir/Discount opsional — kosong berarti 0, bukan error.
  const shippingAdmin = parseOptionalAmount(form.shippingAdmin);
  const discountCashback = parseOptionalAmount(form.discountCashback);
  if (shippingAdmin === null || discountCashback === null) return null;

  // Teks wajib: sumber dana, nama barang, PIC. (Nomor invoice tidak lagi
  // diminta user, jadi tidak ikut diwajibkan.)
  const flowTransaction = form.flowTransaction.trim();
  const namaBarang = form.namaBarang.trim();
  const pic = form.pic.trim();
  if (!flowTransaction || !namaBarang || !pic) return null;

  // Tingkat terdalam yang dipilih menentukan apa yang dicatat. Item opsional,
  // jadi Sub Category adalah fallback-nya.
  const deepestId = selection.itemId ?? selection.subId;
  if (deepestId === null) return null;

  const type = findById(rows, selection.typeId);
  const main = findById(rows, selection.mainId);
  const sub = findById(rows, selection.subId);
  const item = findById(rows, selection.itemId);

  // Basic integrity: kategori terpilih harus benar-benar ada di data.
  if (!type || !main || !sub) return null;

  // Nama pihak yang dibayar disalin dari daftar yang diberikan, BUKAN dari label
  // dropdown — supaya yang tersimpan persis sama dengan yang diuji, dan pihak
  // yang tidak ada di daftar tidak diam-diam tersimpan sebagai id tanpa nama.
  //
  // TEPAT SATU PIHAK: vendor ATAU karyawan — tidak keduanya, tidak kosong.
  // Baris gaji dibayarkan ke karyawan (dan tidak punya vendor); pembelian biasa
  // dibayarkan ke vendor. Ini cerminan CHECK `expense_entries_payee_check` di
  // database: menolak di sini memberi pesan yang bisa ditindaklanjuti, bukan
  // error constraint dari Postgres.
  const vendor = form.vendorId === null || form.vendorId === undefined
    ? null
    : (form.vendors ?? []).find((row) => row.id === form.vendorId) ?? null;
  const staff = form.staffId === null || form.staffId === undefined
    ? null
    : (form.staffs ?? []).find((row) => row.id === form.staffId) ?? null;
  if ((vendor === null) === (staff === null)) return null;

  // Hasil hitungan harus masuk akal sebagai pembelian. Ini cerminan CHECK
  // `expense_entries_total_payment_positive` di database.
  const amounts = { quantity, unitPrice, shippingAdmin, discountCashback };
  if (validateAmounts(amounts) !== null) return null;

  return {
    entryDate: form.date,
    categoryId: sub.id,
    itemId: item?.id ?? null,
    vendorId: vendor?.id ?? null,
    staffId: staff?.id ?? null,
    // Untuk baris gaji, kolom ini berisi NAMA KARYAWAN: kolomnya NOT NULL dan
    // sudah tampil di tabel maupun CSV sebagai dokumen historis.
    vendorName: vendor?.nama ?? staff?.nama ?? '',
    quantity,
    unitPrice,
    // Dihitung dengan rumus yang sama seperti kolom generated di database.
    // Nilai ini dipakai untuk tampilan; saat menyimpan, database menghitung
    // ulang dan hasilnya yang tersimpan.
    total: computeTotal(quantity, unitPrice),
    shippingAdmin,
    discountCashback,
    totalPayment: computeTotalPayment(amounts),
    flowTransaction,
    invoiceNumber: form.invoiceNumber?.trim() ?? '',
    namaBarang,
    pic,
    proofPaymentPath: form.proofPaymentPath ?? null,
    proofPaymentUrl: form.proofPaymentUrl ?? null,
    typeName: type.name,
    mainCategoryName: main.name,
    subCategoryName: sub.name,
    // Kosong (bukan `undefined`) saat Item tidak dipakai — supaya kolomnya
    // tidak pernah terisi teks 'undefined' di layar maupun di database.
    itemName: item?.name ?? '',
    categoryPath: pathOf(rows, deepestId),
    note: form.note.trim(),
    proofPath: form.proofPath ?? null,
    proofUrl: form.proofUrl ?? null,
    inputBy: form.inputBy ?? null,
  };
}

function findById(rows: readonly ExpenseCategory[], id: number | null): ExpenseCategory | null {
  if (id === null) return null;
  return rows.find((row) => row.id === id) ?? null;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  /** Total per Main Category, terbesar dulu. */
  byMainCategory: Array<{ name: string; total: number; count: number }>;
}

/**
 * Ringkasan biaya: total, jumlah transaksi, dan rincian per Main Category.
 *
 * Satu kali lintas lalu satu pengurutan — bukan `filter` per kategori, yang
 * akan berulang kali melintasi array yang sama.
 */
export function summarizeExpenses(rows: readonly ExpenseEntry[]): ExpenseSummary {
  let total = 0;
  const perMain = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    // Yang dijumlah adalah **Total Payment** — uang yang benar-benar keluar,
    // termasuk ongkir dan setelah diskon. Memakai `total` akan melebihkan
    // biaya setiap kali ada diskon dan mengurangi setiap kali ada ongkir.
    const amount = Number(row.totalPayment);
    const safe = Number.isFinite(amount) ? amount : 0;
    total += safe;

    const key = row.mainCategoryName || '—';
    const bucket = perMain.get(key) ?? { total: 0, count: 0 };
    bucket.total += safe;
    bucket.count += 1;
    perMain.set(key, bucket);
  }

  const byMainCategory = [...perMain.entries()]
    .map(([name, value]) => ({ name, total: value.total, count: value.count }))
    // Terbesar dulu; nama sebagai tie-break agar urutannya stabil.
    .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));

  return { total, count: rows.length, byMainCategory };
}

export interface MonthlyTrendPoint {
  /** `YYYY-MM` — kunci pengurutan yang tidak terpengaruh nama bulan. */
  month: string;
  /** Label siap tampil, mis. `Sep 2026`. */
  label: string;
  total: number;
  count: number;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Total per bulan, terurut KRONOLOGIS.
 *
 * Sengaja diurutkan lewat kunci `YYYY-MM`, bukan urutan `Map` (yang mengikuti
 * urutan kemunculan data) dan bukan nama bulan (yang akan mengurutkan menurut
 * abjad). Ini mengikuti pelajaran yang sudah tercatat di
 * `src/lib/targetJahitReport.ts` soal akumulasi yang wajib berurutan.
 */
export function buildMonthlyTrend(rows: readonly ExpenseEntry[]): MonthlyTrendPoint[] {
  const perMonth = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const month = String(row.entryDate ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue; // lewati tanggal yang tidak berbentuk YYYY-MM
    // Sama seperti ringkasan: yang dijumlah adalah uang yang benar-benar keluar.
    const amount = Number(row.totalPayment);
    const safe = Number.isFinite(amount) ? amount : 0;
    const bucket = perMonth.get(month) ?? { total: 0, count: 0 };
    bucket.total += safe;
    bucket.count += 1;
    perMonth.set(month, bucket);
  }

  return [...perMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      label: formatMonthShort(month),
      total: value.total,
      count: value.count,
    }));
}

/** `2026-09` -> `Sep 2026`. Mengembalikan input apa adanya bila tidak terbaca. */
export function formatMonthShort(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return month;
  return `${MONTHS_SHORT[index]} ${match[1]}`;
}

export interface ExpenseFilters {
  /** `YYYY-MM`; slicer bulan memakai awalan tanggal, bukan fungsi tanggal. */
  month?: string;
  type?: string;
  mainCategory?: string;
  /**
   * Pencarian bebas atas vendor, keterangan, kategori, dan nama input.
   *
   * Mengikuti referensi yang menulis "Search by vendor, description, or amount".
   * Nominal ikut dicari sebagai teks supaya mengetik "50000" menemukan
   * transaksinya.
   */
  query?: string;
}

/**
 * Saring baris expense. Slicer bersifat AND, dan filter kosong mengembalikan
 * array yang SAMA (bukan salinan) supaya identitasnya stabil untuk memo.
 */
export function filterExpenses(
  rows: readonly ExpenseEntry[],
  filters: ExpenseFilters,
): readonly ExpenseEntry[] {
  const { month, type, mainCategory } = filters;
  // Di-trim lebih dulu: kueri berisi spasi saja secara makna sama dengan tanpa
  // kueri, jadi ia harus ikut jalur "tidak menyaring" dan mengembalikan array
  // yang sama — bukan salinan baru.
  const needle = filters.query?.trim().toLocaleLowerCase('id-ID') ?? '';
  if (!month && !type && !mainCategory && !needle) return rows;

  return rows.filter((row) => {
    if (month && !String(row.entryDate ?? '').startsWith(month)) return false;
    if (type && row.typeName !== type) return false;
    if (mainCategory && row.mainCategoryName !== mainCategory) return false;
    if (needle) {
      const haystack = [
        row.vendorName,
        row.note,
        row.categoryPath,
        row.itemName,
        row.namaBarang,
        row.pic,
        row.flowTransaction,
        row.inputBy,
        String(row.totalPayment),
      ].map((value) => String(value ?? '').toLocaleLowerCase('id-ID'));
      if (!haystack.some((value) => value.includes(needle))) return false;
    }
    return true;
  });
}

/** Opsi slicer diturunkan dari data yang ada, bukan daftar tetap. */
export function valueOptions(rows: readonly ExpenseEntry[], key: 'type' | 'mainCategory'): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key === 'type' ? row.typeName : row.mainCategoryName;
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Opsi bulan, terbaru dulu — kebalikan dari tren yang kronologis, karena di
 * slicer yang dicari adalah bulan terkini, bukan yang paling lama.
 */
export function monthFilterOptions(rows: readonly ExpenseEntry[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  for (const row of rows) {
    const month = String(row.entryDate ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) seen.add(month);
  }
  return [...seen]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ value: month, label: formatMonthShort(month) }));
}

/** Escape satu sel CSV mengikuti halaman lain di repo. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function expensesToCsv(rows: readonly ExpenseEntry[]): string {
  // "Vendor / Karyawan": satu kolom memuat dua kemungkinan pihak yang dibayar.
  // Baris gaji mengisi kolom ini dengan NAMA KARYAWAN (lihat `vendorName`),
  // jadi menamainya hanya "Vendor" akan menyesatkan pembaca CSV.
  const header = [
    'Date Invoice', 'Main Category', 'Sub Category', 'Item', 'Nama Barang', 'Vendor / Karyawan',
    'Jumlah', 'Harga/Item', 'Total', 'Ongkir + Admin', 'Discount/Cashback', 'Total Payment',
    'Flow Transaction', 'PIC', 'Keterangan', 'Input By',
  ];
  // Nominal tidak valid ditulis 0, tidak dibiarkan menjadi teks 'NaN' di berkas
  // yang dibuka user di Excel.
  const money = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const lines = rows.map((row) => [
    row.entryDate,
    row.mainCategoryName,
    row.subCategoryName,
    row.itemName,
    row.namaBarang,
    row.vendorName,
    money(row.quantity),
    money(row.unitPrice),
    money(row.total),
    money(row.shippingAdmin),
    money(row.discountCashback),
    money(row.totalPayment),
    row.flowTransaction,
    row.pic,
    row.note,
    row.inputBy ?? '',
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n');
}
