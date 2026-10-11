import { poCodeFromWorkCode } from './poJump.ts';

/**
 * Satu kombinasi produksi yang bisa dipilih di form Complain.
 *
 * Dibentuk dari `work_orders`, bukan dari tabel lain: hanya work order yang
 * benar-benar ada yang boleh muncul sebagai pilihan, dan di sanalah kedua kode
 * (konveksi + client) tersedia berdampingan.
 *
 * **Size sengaja tidak ikut.** Satu Kode Produksi Client menaungi beberapa size
 * (diverifikasi lewat MCP: `PDFF_LVU-PNT-01_B-00_PRDN` punya Black/M, Black/XL,
 * Ivory/M, Ivory/XL), sedangkan kolom Complain & Penalti tidak menyimpan size.
 * Yang membuat pilihan tetap tidak ambigu adalah langkah **Warna**: dalam satu
 * produk, satu warna hanya menunjuk ke satu kode client. Opsi di sini karena
 * itu diruntuhkan per `(product, warna, clientCode)` — bukan per work order —
 * supaya empat work order Gena Pants menjadi dua pilihan, bukan empat.
 */
export interface ComplainProductionOption {
  product: string;
  warna: string;
  clientCode: string;
  /** Kode Produksi Konveksi — `product_note`. Terisi otomatis, tidak diketik user. */
  productionCode: string;
  sourceOrderId: string | null;
}

/** Bentuk baris mentah `work_orders` yang dibutuhkan pembentuk opsi. */
export interface ComplainOptionRow {
  product?: string | null;
  warna?: string | null;
  /** Dipakai pembentuk **varian** (Planning); diabaikan `buildComplainOptions`. */
  size?: string | null;
  client_production_code?: string | null;
  product_note?: string | null;
  source_order_id?: string | null;
}

/** Satu pilihan Kode Produksi Client untuk dropdown. */
export interface ClientCodeChoice {
  value: string;
  label: string;
  /** Kode Produksi Konveksi pasangannya — hanya untuk ditampilkan. */
  productionCode: string;
}

/**
 * Bentuk daftar opsi dari baris `work_orders`.
 *
 * Baris yang salah satu kodenya kosong **dibuang**, bukan ditampilkan dengan
 * nilai kosong: form ini wajib menyimpan kedua kode, jadi opsi yang tidak bisa
 * mengisi keduanya hanya akan menghasilkan complain yang tidak bisa disimpan.
 */
export function buildComplainOptions(rows: ComplainOptionRow[]): ComplainProductionOption[] {
  const seen = new Set<string>();
  const options: ComplainProductionOption[] = [];

  for (const row of rows) {
    const product = (row.product ?? '').trim();
    const warna = (row.warna ?? '').trim();
    const clientCode = (row.client_production_code ?? '').trim();
    const productionCode = (row.product_note ?? '').trim();

    if (!product || !clientCode || !productionCode) continue;

    const key = `${product}|${warna}|${clientCode}`;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      product,
      warna,
      clientCode,
      productionCode,
      sourceOrderId: row.source_order_id ?? null,
    });
  }

  return options;
}

/** Daftar produk unik, dalam urutan kemunculannya. */
export function productOptionsOf(options: ComplainProductionOption[]): string[] {
  const seen = new Set<string>();
  for (const o of options) {
    if (o.product) seen.add(o.product);
  }
  return Array.from(seen);
}

/** Warna yang tersedia untuk satu produk. */
export function warnaOptionsOf(
  options: ComplainProductionOption[],
  product: string,
): string[] {
  const seen = new Set<string>();
  for (const o of options) {
    if (o.product === product && o.warna) seen.add(o.warna);
  }
  return Array.from(seen);
}

/**
 * Kode Produksi Client yang tersedia untuk satu produk + warna.
 *
 * Umumnya berisi tepat satu nilai — itulah yang membuat form bisa mengisi kode
 * konveksi otomatis tanpa menanyakan apa pun lagi ke user.
 */
export function clientCodeOptionsOf(
  options: ComplainProductionOption[],
  product: string,
  warna: string,
): string[] {
  const seen = new Set<string>();
  for (const o of options) {
    if (o.product === product && o.warna === warna && o.clientCode) seen.add(o.clientCode);
  }
  return Array.from(seen);
}

/**
 * Kode Produksi Konveksi pasangan sebuah Kode Produksi Client.
 *
 * Relasinya 1:1 (diverifikasi lewat MCP: `client_production_code` →
 * `product_note` tepat satu). Tetap dikembalikan `null` bila tidak ketemu,
 * supaya pemanggil bisa membedakan "belum dipilih" dari "tidak ada pasangan" —
 * dan kolomnya tampil "—", bukan string kosong.
 */
export function konveksiCodeFor(
  options: ComplainProductionOption[],
  clientCode: string | null | undefined,
): string | null {
  if (!clientCode) return null;
  return options.find((o) => o.clientCode === clientCode)?.productionCode ?? null;
}

/**
 * Satu **varian** produksi: pasangan warna + size yang benar-benar ada di work
 * order, beserta kode client pemiliknya.
 *
 * Berbeda dari `ComplainProductionOption` yang sengaja membuang size, bentuk ini
 * **mempertahankan** warna **dan** size apa adanya — karena Planning Produksi
 * menyimpan keduanya. Dipakai untuk menyusun dropdown Warna/Size yang mengikuti
 * Kode Produksi Client, sehingga user tidak perlu mengetiknya manual.
 *
 * `size` boleh kosong: work order yang tidak mengisi size tetap sah, dan
 * `planning_produksi.size` memang nullable.
 */
export interface ClientVariant {
  clientCode: string;
  product: string;
  warna: string;
  size: string;
}

/**
 * Bentuk varian dari baris `work_orders`.
 *
 * Baris tanpa **kedua** kode dibuang dengan alasan yang sama seperti
 * `buildComplainOptions`: form wajib menyimpan keduanya. Tetapi baris tanpa
 * warna/size **tidak** dibuang — kalau dibuang, kode client yang work order-nya
 * belum mengisi warna akan hilang dari dropdown padahal kodenya ada.
 *
 * **Tidak diruntuhkan (tidak di-dedup).** Dua baris identik tetap menjadi dua
 * varian; `warnaChoicesFor`/`sizeChoicesFor` yang menyaring duplikatnya saat
 * membentuk pilihan. Sengaja begitu supaya satu bentuk mentah bisa melayani
 * ketiga dropdown (warna, size, kombinasi) tanpa kehilangan baris.
 */
export function buildClientVariants(rows: ComplainOptionRow[]): ClientVariant[] {
  const variants: ClientVariant[] = [];

  for (const row of rows) {
    const clientCode = (row.client_production_code ?? '').trim();
    const productionCode = (row.product_note ?? '').trim();
    if (!clientCode || !productionCode) continue;

    variants.push({
      clientCode,
      product: (row.product ?? '').trim(),
      warna: (row.warna ?? '').trim(),
      size: (row.size ?? '').trim(),
    });
  }

  return variants;
}

/**
 * Warna yang tersedia untuk satu Kode Produksi Client.
 *
 * Inilah yang membuat field Warna tidak perlu diketik manual: daftarnya berasal
 * dari varian work order milik kode itu. Warna kosong disaring — dropdown warna
 * tidak boleh menawarkan pilihan kosong yang tak bisa diklik.
 */
export function warnaChoicesFor(
  variants: ClientVariant[],
  clientCode: string | null | undefined,
): string[] {
  if (!clientCode) return [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.clientCode === clientCode && v.warna) seen.add(v.warna);
  }
  return Array.from(seen);
}

/**
 * Size yang tersedia untuk satu Kode Produksi Client — dipersempit lagi oleh
 * warna bila warna sudah dipilih.
 *
 * Penyempitan per warna itu **bukan hiasan**: pada data live
 * `PDFF_CSC-TOP-02_B-01_PRDN` punya Champagne/M dan Ivory/S, jadi size tanpa
 * warna akan menawarkan M dan S sekaligus padahal pasangannya masing-masing
 * hanya satu. Warna kosong berarti belum dipilih → seluruh size kode itu
 * ditawarkan.
 */
export function sizeChoicesFor(
  variants: ClientVariant[],
  clientCode: string | null | undefined,
  warna?: string | null,
): string[] {
  if (!clientCode) return [];
  const filterWarna = (warna ?? '').trim();
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.clientCode !== clientCode) continue;
    if (filterWarna && v.warna !== filterWarna) continue;
    if (v.size) seen.add(v.size);
  }
  return Array.from(seen);
}

/**
 * Daftar Kode Produksi Client untuk dropdown datar — tanpa perlu memilih
 * produk/warna lebih dulu.
 *
 * Dipakai Planning Produksi, yang urutan pengisiannya **terbalik** dari
 * Complain: di sana kode client adalah langkah terakhir (setelah produk+warna),
 * di sini justru langkah **pertama**. Product, Warna, dan Size menyusul dari
 * kode ini — Warna/Size lewat `warnaChoicesFor`/`sizeChoicesFor`. Karena itu
 * pilihannya tidak boleh bergantung pada produk/warna; yang tersedia adalah
 * seluruh kode yang pernah ada di `work_orders`.
 *
 * Kode yang sama bisa menaungi beberapa produk+warna (satu kode client =
 * beberapa variasi), jadi di sini di-dedup **per kode** dan produknya
 * dirangkum di label supaya user tahu ini produksi apa. Diurutkan sesuai
 * kemunculan pertama, bukan diacak.
 */
export function clientCodeChoices(
  options: ComplainProductionOption[],
): ClientCodeChoice[] {
  const byCode = new Map<string, string[]>();

  for (const o of options) {
    if (!o.clientCode) continue;
    const products = byCode.get(o.clientCode);
    if (!products) {
      byCode.set(o.clientCode, o.product ? [o.product] : []);
    } else if (o.product && !products.includes(o.product)) {
      products.push(o.product);
    }
  }

  return Array.from(byCode, ([value, products]) => {
    const productionCode = konveksiCodeFor(options, value) ?? '';
    return {
      value,
      label: products.length > 0 ? `${value} — ${products.join(', ')}` : value,
      productionCode,
    };
  });
}

/**
 * Pulihkan Kode Produksi Client dari `work_code` sebuah baris tersimpan.
 *
 * Dipakai saat membuka form edit. Baris **lama** ber-`work_code` gabungan
 * ("PO/001-LVU/09/2026/002 | Gena Pants | Black | M") tidak sama dengan kode
 * client mana pun, jadi pencocokan langsung gagal dan harus ada cadangan.
 * Urutannya dari yang paling pasti ke paling longgar:
 *
 * 1. `work_code` sama persis dengan kode client (baris baru).
 * 2. `work_code` sama persis dengan kode konveksi.
 * 3. Segmen pertama `work_code` sama dengan kode konveksi (baris lama).
 *
 * `null` bila tidak ada yang cocok — mis. baris warisan yang work order-nya
 * sudah tidak ada. Form tetap terbuka; user memilih ulang.
 */
export function resolveLegacyCode(
  workCode: string | null | undefined,
  options: ComplainProductionOption[],
): string | null {
  const value = (workCode ?? '').trim();
  if (!value) return null;

  const exact = options.find((o) => o.clientCode === value);
  if (exact) return exact.clientCode;

  const byKonveksi = options.find((o) => o.productionCode === value);
  if (byKonveksi) return byKonveksi.clientCode;

  // `poCodeFromWorkCode` mengambil segmen pertama sebelum ' | ' — persis yang
  // dibutuhkan di sini. Namanya berasal dari pemakaian pertamanya (lompatan
  // nomor PO di Register Harga); perilakunya netral, jadi dipakai ulang alih-alih
  // menyalin logika yang sama.
  const first = poCodeFromWorkCode(value);
  if (!first) return null;

  return options.find((o) => o.productionCode === first)?.clientCode ?? null;
}

/**
 * Kode konveksi yang bisa ditampilkan untuk baris lama.
 *
 * Baris warisan tidak punya `production_code` di database dan work order-nya
 * mungkin sudah tidak ada, jadi nilainya tidak bisa dipulihkan — yang tersisa
 * hanya segmen pertama `work_code`, yang bentuknya memang kode konveksi
 * ("Produksi - Awal | Sheen Pants | White | S" → "Produksi - Awal").
 *
 * Dipakai HANYA sebagai tampilan cadangan; nilai yang disimpan tetap
 * `production_code` dari kolomnya sendiri.
 */
export function legacyKonveksiCode(workCode: string | null | undefined): string | null {
  return poCodeFromWorkCode(workCode);
}
