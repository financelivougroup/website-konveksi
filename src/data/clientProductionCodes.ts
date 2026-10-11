/**
 * Contoh data order dari POS client (Pancake) — **PALSU, bukan data nyata**.
 *
 * ---------------------------------------------------------------------------
 * KENAPA BERKAS INI ADA
 * ---------------------------------------------------------------------------
 * Permintaan user (verbatim): "lalu harus ada tOmbOl buat ambil kde prduksi
 * client yang dari external".
 *
 * Keputusan user saat ditanya: **"UI dulu, API menyusul"** — jadi tombol dan
 * dialognya dibangun sekarang, tetapi panggilan ke Pancake POS belum. Berkas ini
 * yang mengisi dialog itu supaya alurnya bisa dilihat dan dinilai lebih dulu
 * tanpa menunggu kredensial API.
 *
 * ---------------------------------------------------------------------------
 * YANG SUDAH DIVERIFIKASI TENTANG API PANCAKE (riset 2026-09-28)
 * ---------------------------------------------------------------------------
 * - Base URL  : https://pos.pages.fm/api/v1
 * - Auth      : `api_key` sebagai **query param**, BUKAN header Bearer
 *               (header Bearer diabaikan — sudah diuji langsung).
 * - Endpoint  : `GET /shops/{SHOP_ID}/orders`
 *               (param: page_size, page_number, search, filter_status[],
 *                startDateTime, endDateTime, fields[])
 * - Field kode produksi client = **"Product Note"** (jawaban user), yang di
 *   respons API berbentuk field `note` pada order.
 *
 * ⚠️ KARENA `api_key` DIKIRIM SEBAGAI QUERY PARAM, ia TIDAK BOLEH dipanggil dari
 * browser: nilainya akan bocor lewat Network tab, log server, dan Referer.
 * Pemanggilan harus lewat proxy server-side (rencana: pg_net + Supabase Vault).
 * Ini alasan kedua mengapa berkas ini masih fixture — bukan hanya kredensial.
 *
 * ---------------------------------------------------------------------------
 * BENTUK DATA DI SINI SENGAJA MENIRU RESPONS API
 * ---------------------------------------------------------------------------
 * Nama fieldnya mengikuti objek order Pancake (`display_id`, `custom_id`,
 * `note`, `total_quantity`, `inserted_at`) supaya saat API benar-benar
 * disambungkan, yang berubah hanya SUMBER datanya — bentuk objeknya tidak perlu
 * dirombak, dan dialognya tidak perlu ditulis ulang.
 *
 * Kode produksi di bawah ini **disalin dari data nyata proyek** (pola
 * `PDFF_<KODE-CLIENT>-<ARTIKEL>-<NOMOR>_B-<REVISI>_PRDN`) supaya terlihat
 * realistis, tetapi order, tanggal, dan qty-nya karangan.
 */

/** Satu order dari POS client, diproyeksikan ke field yang kita butuhkan. */
export interface ClientOrderFixture {
  /** `id` order di POS client — kunci stabil untuk memilih baris. */
  id: string;
  /** `display_id`: nomor order yang terlihat di layar POS client. */
  displayId: string;
  /** `custom_id`: field bebas di POS; sering kosong. */
  customId: string | null;
  /**
   * `note` = **"Product Note"** di POS client. INILAH kode produksi client
   * yang dicari tombol "Ambil dari POS client".
   */
  productNote: string;
  /** `total_quantity` order di POS. Lihat catatan penyimpanan di bawah. */
  totalQuantity: number;
  /** `inserted_at`: kapan order dibuat di POS. */
  insertedAt: string;
  /** Kode client (kolom `register_client.kode_client`) — untuk ditampilkan saja. */
  clientCode: string;
}

/**
 * Fixture order POS client.
 *
 * Diurutkan dari yang terbaru, meniru urutan bawaan `GET /orders`.
 */
export const CLIENT_ORDER_FIXTURES: readonly ClientOrderFixture[] = [
  {
    id: 'po-csc-10231',
    displayId: 'CSC-10231',
    customId: null,
    productNote: 'PDFF_CSC-TOP-02_B-01_PRDN',
    totalQuantity: 120,
    insertedAt: '2026-09-27',
    clientCode: 'CSC',
  },
  {
    id: 'po-lvu-8842',
    displayId: 'LVU-8842',
    customId: 'LVU-PNT-01',
    productNote: 'PDFF_LVU-PNT-01_B-00_PRDN',
    totalQuantity: 100,
    insertedAt: '2026-09-26',
    clientCode: 'LVU',
  },
  {
    id: 'po-csc-10198',
    displayId: 'CSC-10198',
    customId: null,
    productNote: 'PDFF_CSC-DRS-04_B-02_PRDN',
    totalQuantity: 60,
    insertedAt: '2026-09-24',
    clientCode: 'CSC',
  },
  {
    id: 'po-lvu-8801',
    displayId: 'LVU-8801',
    customId: null,
    productNote: 'PDFF_LVU-TOP-06_B-00_PRDN',
    totalQuantity: 80,
    insertedAt: '2026-09-22',
    clientCode: 'LVU',
  },
  {
    id: 'po-csc-10150',
    displayId: 'CSC-10150',
    customId: 'CSC-JKT-11',
    productNote: 'PDFF_CSC-JKT-11_B-03_PRDN',
    totalQuantity: 45,
    insertedAt: '2026-09-19',
    clientCode: 'CSC',
  },
  {
    id: 'po-lvu-8760',
    displayId: 'LVU-8760',
    customId: null,
    productNote: 'PDFF_LVU-BLU-03_B-01_PRDN',
    totalQuantity: 150,
    insertedAt: '2026-09-15',
    clientCode: 'LVU',
  },
];

/**
 * Cari order client berdasarkan kata kunci.
 *
 * Murni (tanpa IO) supaya bisa diuji dengan `node --test`, dan supaya perilaku
 * pencariannya sudah pasti sama saat datanya berganti dari fixture ke respons
 * API. Pencocokan tidak peka huruf besar/kecil dan mencakup Product Note,
 * nomor order, custom id, dan kode client — sama longgarnya dengan `search`
 * milik API Pancake, yang juga mencari di beberapa field sekaligus.
 *
 * Kata kunci kosong mengembalikan seluruh daftar.
 */
export function searchClientOrders(
  orders: readonly ClientOrderFixture[],
  keyword: string,
): ClientOrderFixture[] {
  const needle = keyword.trim().toLocaleLowerCase('id-ID');
  if (!needle) return [...orders];
  return orders.filter((order) =>
    [order.productNote, order.displayId, order.customId ?? '', order.clientCode]
      .join(' ')
      .toLocaleLowerCase('id-ID')
      .includes(needle),
  );
}
