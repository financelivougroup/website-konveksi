// Ukuran lembar template invoice (px). Dipakai bersama oleh komponen template
// dan proses ekspor PNG, dan keduanya WAJIB selalu sama: `html-to-image`
// memakai angka ini sebagai ukuran kanvas, bukan hasil pengukuran DOM
// (mengukur node off-screen bisa menghasilkan 0 => canvas 0x0 => PNG kosong).
export const INVOICE_PAGE_WIDTH = 800;

// Tinggi disetel mengikuti isi dokumen yang tersisa (satu item tagihan, tanpa
// riwayat pembayaran) agar lembar tidak menyisakan blok kosong yang terlalu
// besar di tengah halaman.
export const INVOICE_PAGE_HEIGHT = 880;
