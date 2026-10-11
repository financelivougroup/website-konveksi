import type { ProductionStatus, VariasiStatus } from '@/types/pipeline';
// Impor NILAI (bukan type) harus relatif ber-ekstensi: `node --test` tidak bisa
// meresolusi alias `@/`, sedangkan impor type di atas aman karena Node
// menghapusnya saat runtime. Pola yang sama dipakai src/lib/kanban.ts.
import { variasiStatusLabel } from '../types/pipeline.ts';

export const STATUS_ORDER: ProductionStatus[] = [
  'NEW',
  'PROGRESS',
  'FINISHED',
  'INVOICED',
];

/**
 * Derive production status from actual cutting/sewing totals vs order qty.
 * Invoiced is NOT derived here — it is driven by invoiceStatus != 'NONE'
 * (callers that track invoicing check that separately).
 *
 * Tidak ada status 'CUTTING': begitu cutting terisi (cuttingTotal > 0) WO
 * langsung masuk PROGRESS. Sebelumnya ada status CUTTING untuk "sudah potong,
 * belum jahit", tapi user meminta tahap itu dilebur ke PROGRESS supaya alurnya
 * cuma New → Progress.
 *
 * Ini status LEVEL-2 (satu nilai per Kode Produksi Konveksi). Yang per variasi
 * ada di `deriveVariasiStatuses` di bawah.
 *
 * **`orderQty` 0 berarti "qty belum diterima dari POS client"**, bukan "qty nol".
 * Sejak input qty manual dihapus dari Order Entry, setiap order baru lahir
 * dengan qty 0 sampai sinkronisasi Pancake POS mengisinya. Tanpa penjaga
 * `orderQty > 0` di bawah, `sewingTotal >= 0` akan selalu benar — sehingga
 * Work Order yang baru dijahit 1 pcs langsung berstatus FINISHED, padahal
 * targetnya belum diketahui sama sekali. Karena itu FINISHED MUSTAHIL saat
 * qty belum ada; WO-nya berhenti di PROGRESS (aman: lebih baik tertahan
 * daripada salah dianggap selesai dan terlanjur diinvoice 0 pcs).
 *
 * ---------------------------------------------------------------------------
 * FINISHED MENUNGGU KANCING & FINISHING (revisi user 2026-09-28)
 * ---------------------------------------------------------------------------
 * Dulu FINISHED cukup dengan cutting & jahit mencapai qty. Akibatnya WO yang
 * jahitnya penuh tapi kancing/finishingnya belum jalan sudah FINISHED — dan
 * karena FINISHED yang memicu auto-invoice, invoice bisa terbit untuk pekerjaan
 * yang belum selesai. Data nyata memuat kasusnya: Odette Shirt Ivory S
 * (cutting 80, jahit 80, kancing 50, finishing 0, qty 80) sudah FINISHED.
 *
 * User memilih **"Ya, tunggu kancing & finishing"**: FINISHED baru saat
 * KEEMPAT tahap mencapai qty. **Konsekuensi yang disengaja: auto-invoice ikut
 * tertunda** sampai kancing & finishing penuh — itu memang yang diminta, tetapi
 * perlu diketahui karena ia mengubah kapan uang boleh ditagih.
 *
 * `kancingTotal`/`finishingTotal` dibuat OPSIONAL supaya pemanggil lama yang
 * hanya punya cutting & jahit tidak langsung dianggap "kancing kosong" lalu
 * tertahan selamanya. Pemanggil yang peduli tahap akhir wajib mengisinya —
 * lihat `deriveVariasiStatuses` yang memang selalu punya keempatnya.
 */
export function deriveStatus(
  cuttingTotal: number,
  sewingTotal: number,
  orderQty: number,
  kancingTotal?: number,
  finishingTotal?: number,
): ProductionStatus {
  if (cuttingTotal <= 0) return 'NEW';
  if (orderQty <= 0 || sewingTotal <= 0) return 'PROGRESS';
  if (sewingTotal < orderQty) return 'PROGRESS';
  // Sampai sini cutting, jahit, dan qty sudah tercapai. Kalau pemanggil tidak
  // memberi angka kancing/finishing, perilakunya sama seperti sebelumnya
  // (FINISHED) — tahap akhir tidak bisa dinilai dari data yang tidak ada.
  if (kancingTotal === undefined && finishingTotal === undefined) return 'FINISHED';
  const kancing = Number(kancingTotal) || 0;
  const finishing = Number(finishingTotal) || 0;
  return kancing >= orderQty && finishing >= orderQty ? 'FINISHED' : 'PROGRESS';
}

// ===== Status level-1 (per variasi) =====
//
// Permintaan user (verbatim): "saya mau status di Production order itu ada 2
// level. level pertama untuk status variasinya. kalau belum isi cutting /
// cutting udah keisi tapi belum ada laporan jahit berarti statusnya Cutting,
// kalau udah ada laporan jahitnya berarti Sewing, kalau udah ada laporan
// kancingnya Kancing (tapi misal sewingnya juga masih ada berarti multiple
// status Sewing dan Kancing), berlaku juga untuk finishing."
//
// Perhatikan: level-1 TIDAK menggantikan level-2. Keduanya hidup berdampingan —
// kolom "Status" lama tetap New/Progress/Finished, dan kolom "Status Variasi"
// menampilkan himpunan di bawah. Dua aturan itu memang berbeda dan itu disengaja
// (dikonfirmasi user): `deriveStatus` masih dipakai Kanban & drag-and-drop,
// sedangkan status variasi hanya untuk keterbacaan per baris.

/**
 * Angka-angka produksi satu Work Order. Nama fieldnya sengaja sama dengan
 * `decoratedWO` di ProductionMonitoring supaya bisa disebar langsung.
 */
export interface VariasiStatusInput {
  cuttingTotal: number;
  sewingTotal: number;
  finishingTotal: number;
  kancingTotal: number;
  /**
   * Qty order (POS). Dipakai HANYA oleh aturan Completed di bawah; empat angka
   * sebelumnya tidak membutuhkannya. Boleh tidak diisi — dianggap 0, sehingga
   * Completed tidak akan pernah muncul.
   */
  orderQty?: number;
}

/**
 * Status level-1 satu variasi — bisa berisi lebih dari satu nilai.
 *
 * Urutan hasilnya SELALU Cutting → Sewing → Kancing → Finishing (urutan lini
 * produksi), karena badge dirender mengikuti urutan array ini. Urutan kolom
 * tabel di Production Monitoring sudah disamakan dengan urutan ini (Kancing
 * sebelum Finishing) supaya mata tidak melompat.
 *
 * ---------------------------------------------------------------------------
 * ATURAN (revisi user 2026-09-28, mengalahkan aturan lama)
 * ---------------------------------------------------------------------------
 * Permintaan user (verbatim): *"kalau cutting dan jahit sudah sama angkanya,
 * tapi finishing, kancing masih 0 ya artinya masih progress. kalau kancing udah
 * mulai ada angkana, statusnya cukup Kancing. bleh Sewing Kancing kalau si
 * sewing ini angkanya blum sama kaya cutting."*
 *
 * Inti perubahannya: **status mengikuti TAHAP YANG SEDANG BERJALAN**, bukan
 * lagi menumpuk semua tahap yang pernah dilaporkan. Sebelumnya Sewing tetap
 * menempel sampai kapan pun begitu ada laporan jahit, sehingga baris yang
 * jahitnya sudah penuh masih berbunyi "Sewing".
 *
 * Urutan pemeriksaannya:
 *
 * 1. **CUTTING** — selama BELUM ada laporan jahit (`sewing <= 0`). Cutting
 *    adalah gerbang JAHIT, bukan angka cuttingnya sendiri: WO yang belum
 *    dipotong maupun yang sudah dipotong tapi belum dilaporkan jahit
 *    sama-sama berstatus Cutting. Kancing/Finishing yang sudah dilaporkan
 *    tetap menyertai di sini (kasus anomali — lihat komentar di badan fungsi).
 * 2. **SEWING** — jahit sudah ada tapi angkanya **BELUM sama dengan cutting**.
 *    Di sini Kancing/Finishing boleh menyertai bila laporannya sudah ada
 *    ("bleh Sewing Kancing kalau si sewing ini angkanya blum sama kaya
 *    cutting") — dua tahap berjalan bersamaan memang mungkin. Cabang yang sama
 *    juga menangani cutting=jahit TETAPI kancing masih 0: user memilih
 *    badge-nya **tetap Sewing** ("tidak ada perubahan dari aturan lama"),
 *    karena selama kancing belum dilaporkan jahit belum dianggap tuntas.
 * 3. **KANCING** — jahit sudah mencapai cutting, dan kancing sudah mulai tapi
 *    belum penuh ("kalau kancing udah mulai ada angkana, statusnya cukup
 *    Kancing"). Finishing menyertai bila sudah ada.
 * 4. **FINISHING** — jahit dan kancing sudah sama-sama mencapai cutting. Di
 *    titik ini kancing selesai dan finishing yang berjalan, baik finishingnya
 *    sudah ada angkanya maupun masih 0.
 *
 * **Completed MENGGANTIKAN seluruh badge lain**, bukan ditambahkan di ujungnya.
 * Permintaan user: "kalau kolom cutting, sewing, kancing, finishing dan QTY nya
 * udah sama, status variasnya berarti Completed". Kalau ditambahkan, barisnya
 * akan berbunyi "Kancing · Finishing · Completed" — jelas bukan yang dimaksud.
 * Karena itu aturan ini diperiksa LEBIH DULU dan langsung mengembalikan satu
 * nilai.
 *
 * Syaratnya `>=` Qty, bukan `=`, mengikuti konvensi halaman ini yang sudah
 * memakai `>=` untuk "sudah tercapai" (lihat warna emerald pada sel Cutting/
 * Jahit/Finishing/Kancing dan `deriveStatus`). Jadi produksi yang melebihi Qty
 * tetap Completed, tidak jatuh kembali ke daftar tahap.
 *
 * `orderQty` yang 0 atau tidak diisi membuat Completed MUSTAHIL muncul —
 * tanpa itu, WO dengan cutting/jahit/kancing/finishing semuanya 0 akan
 * "Completed" hanya karena 0 = 0. Ini juga alasan mengapa order yang qty-nya
 * belum datang dari POS client berhenti di tahap, bukan selesai.
 *
 * **Penjaga `cutting > 0` pada perbandingan jahit-vs-cutting wajib.** Tanpa itu
 * baris yang cuttingnya terhapus (0) dengan jahit 10 akan dianggap "sudah sama"
 * karena `10 >= 0`, lalu salah pindah ke tahap Kancing/Finishing. Data seperti
 * itu ada di database, jadi kasusnya bukan teoretis.
 *
 * Hasilnya TIDAK PERNAH kosong: jahit ≤ 0 selalu menghasilkan CUTTING, dan
 * ketiga cabang lainnya masing-masing mengembalikan minimal satu status — jadi
 * setiap Work Order punya minimal satu status, termasuk WO yang belum digarap
 * sama sekali (cutting 0), yang memang berstatus Cutting.
 */
export function deriveVariasiStatuses(input: VariasiStatusInput): VariasiStatus[] {
  const cutting = Number(input.cuttingTotal) || 0;
  const sewing = Number(input.sewingTotal) || 0;
  const kancing = Number(input.kancingTotal) || 0;
  const finishing = Number(input.finishingTotal) || 0;
  const qty = Number(input.orderQty) || 0;

  // Terminal: keempat tahap sudah mencapai Qty. Diperiksa paling awal karena ia
  // menggantikan badge lain, bukan menambah.
  if (qty > 0 && cutting >= qty && sewing >= qty && kancing >= qty && finishing >= qty) {
    return ['COMPLETED'];
  }

  // 1. Belum ada laporan jahit sama sekali → Cutting adalah tahap yang berjalan.
  //
  //    Kancing/Finishing yang sudah dilaporkan **tetap ikut tampil** di sini,
  //    walau secara alur mustahil (memasang kancing sebelum menjahit). Ini
  //    disengaja dan sudah ada sebelum revisi: data nyata di database memuat
  //    baris seperti itu, dan justru itulah yang membuat kolom ini berguna —
  //    ia menyorot jahit yang tertinggal. Menyembunyikannya akan menghapus
  //    satu-satunya tanda bahwa ada yang salah urutan di lantai produksi.
  if (sewing <= 0) {
    const statuses: VariasiStatus[] = ['CUTTING'];
    if (kancing > 0) statuses.push('KANCING');
    if (finishing > 0) statuses.push('FINISHING');
    return statuses;
  }

  // 2. Tahap SEWING masih yang berjalan. Dua sebab, hasilnya sama:
  //    a) jahit belum mencapai cutting — "bleh Sewing Kancing kalau si sewing
  //       ini angkanya blum sama kaya cutting";
  //    b) jahit sudah mencapai cutting TAPI kancing belum ada angkanya —
  //       pilihan eksplisit user: badge-nya tetap Sewing, bukan Finishing
  //       ("tidak ada perubahan dari aturan lama"). Selama kancing belum
  //       dilaporkan, pekerjaan jahit belum dianggap tuntas.
  //    Kancing/Finishing yang sudah dilaporkan ikut tampil (dua tahap
  //    berjalan bersamaan memang mungkin).
  if (sewing < cutting || kancing <= 0) {
    const statuses: VariasiStatus[] = ['SEWING'];
    if (kancing > 0) statuses.push('KANCING');
    if (finishing > 0) statuses.push('FINISHING');
    return statuses;
  }

  // 3. Jahit sudah mencapai cutting DAN kancing sudah mulai, tapi belum penuh →
  //    cukup Kancing. Sewing TIDAK ikut: "kalau kancing udah mulai ada angkana,
  //    statusnya cukup Kancing".
  if (kancing < cutting) {
    const statuses: VariasiStatus[] = ['KANCING'];
    if (finishing > 0) statuses.push('FINISHING');
    return statuses;
  }

  // 4. Kancing sudah mencapai cutting → tahap kancing selesai, tinggal Finishing.
  return ['FINISHING'];
}

/**
 * Label gabungan untuk kolom teks (CSV ekspor, nilai filter/sort).
 *
 * "Cutting" untuk satu status, "Sewing · Kancing" untuk beberapa. Memakai titik
 * tengah, sama seperti pemisah yang sudah dipakai tabel-tabel lain di proyek.
 */
export function variasiStatusText(statuses: readonly VariasiStatus[]): string {
  return statuses.map((s) => variasiStatusLabel[s]).join(' · ');
}

/**
 * Teks kolom alert "Need Up POS" saat alertnya menyala, dan `''` saat tidak.
 *
 * Dipakai dua tempat yang harus selalu sama bunyinya: nilai kolom untuk mesin
 * Filter/Sort (di `flatRows`) dan isi badge di sel tabel. Disimpan di sini
 * supaya tidak ada dua literal yang bisa berbeda.
 */
export const NEED_UP_POS_LABEL = 'Need Up POS';

/**
 * Apakah perlu "naik POS": **finishing sudah melebihi Qty Diterima Client.**
 *
 * Permintaan user (verbatim, revisi 2026-09-28):
 *   "NEED UP POS harus muncul ketika kolom Qty Diterima Client angkana lebih
 *    kecil dibanding finishing"
 *
 * ---------------------------------------------------------------------------
 * ATURAN LAMA vs ATURAN SEKARANG
 * ---------------------------------------------------------------------------
 * Dulu: `sewing === finishing && finishing > orderQty && orderQty > 0`.
 * Syarat `sewing === finishing` itu berasal dari permintaan awal user ("kalau
 * sewing dan finishing udah sama tapi Qty berbeda"). Revisi ini **membuangnya**:
 * yang menentukan kini hanya perbandingan finishing terhadap Qty, jadi WO yang
 * finishingnya sudah jalan sementara jahitnya masih tertinggal tetap ditandai.
 *
 * Arahnya tetap sama dan tetap disengaja: **hanya bila finishing LEBIH BANYAK**
 * dari Qty — artinya angka di POS ketinggalan dan perlu dinaikkan. Produksi yang
 * KURANG dari Qty tidak ditandai (itu wajar: sisa pekerjaan).
 *
 * ---------------------------------------------------------------------------
 * `orderQty > 0` SENGAJA DILEPAS (keputusan user, ditanya eksplisit)
 * ---------------------------------------------------------------------------
 * Sejak input qty manual dihapus dari Order Entry, order baru lahir dengan
 * qty 0 = "belum diterima dari POS client". Dulu ada penjaga `qty > 0` supaya
 * baris ber-qty 0 tidak ikut menyala.
 *
 * User memilih **"Nyala juga saat qty belum dari POS"**: WO yang sudah
 * difinishing sementara POS belum menunjukkan qty sama sekali memang pasti
 * perlu di-up. Jadi sekarang `finishing > 0` saja sudah cukup untuk menyala
 * saat qty 0.
 *
 * **Konsekuensi yang perlu diketahui:** order yang baru mulai produksi (qty 0,
 * finishing > 0) akan langsung bertanda "Need Up POS". Itu memang yang diminta,
 * tetapi berarti kolom ini kehilangan kemampuan membedakan "POS ketinggalan"
 * dari "qty belum pernah masuk" — keduanya kini tampil sama. Bila nanti terasa
 * mengganggu, penjaga `qty > 0` tinggal dikembalikan.
 *
 * Penjaga yang tersisa hanya `finishing > 0`: ia menahan baris yang belum
 * dikerjakan sama sekali (finishing 0) agar tidak menyala hanya karena Qty-nya
 * kebetulan kecil, dan sekaligus melindungi dari Qty negatif yang tidak valid.
 */
export function needsUpPos(finishingTotal: number, orderQty: number): boolean {
  const finishing = Number(finishingTotal) || 0;
  const qty = Number(orderQty) || 0;
  return finishing > 0 && finishing > qty;
}

export function validateStatusTransition(
  from: string,
  to: string,
  sewingTotal: number,
  cuttingTotal: number,
  quantity: number,
  kancingTotal?: number,
  finishingTotal?: number,
): string | null {
  if (from === to) return null;
  const fromIdx = STATUS_ORDER.indexOf(from as ProductionStatus);
  const toIdx = STATUS_ORDER.indexOf(to as ProductionStatus);
  if (toIdx < 0 || fromIdx < 0) return null;
  if (toIdx < fromIdx) return 'Gak bisa mundur status';
  if (toIdx > fromIdx + 1) return 'Gak bisa lompat status — maju satu per satu';
  if (from === 'NEW' && to === 'PROGRESS' && cuttingTotal <= 0) {
    return 'Cutting harus sudah terisi untuk lanjut Progress';
  }
  // `quantity <= 0` = qty belum diterima dari POS. Tanpa penjaga ini,
  // `sewingTotal < quantity` selalu salah saat quantity 0, sehingga transisi
  // ke FINISHED lolos tanpa target yang jelas — lihat catatan di deriveStatus.
  if (from === 'PROGRESS' && to === 'FINISHED') {
    if (quantity <= 0) return 'Qty dari POS client belum diterima, status belum bisa Finish';
    if (sewingTotal < quantity || cuttingTotal <= 0) {
      return 'Cutting dan jahit harus sampai qty order untuk finish';
    }
    // Revisi user 2026-09-28: FINISHED juga menunggu kancing & finishing.
    // Dua tahap ini hanya diperiksa bila angkanya diberikan; pemanggil lama
    // yang tidak punya datanya tidak ikut tertahan (sama seperti deriveStatus).
    if (kancingTotal !== undefined || finishingTotal !== undefined) {
      const kancing = Number(kancingTotal) || 0;
      const finishing = Number(finishingTotal) || 0;
      if (kancing < quantity || finishing < quantity) {
        return 'Kancing dan finishing harus sampai qty order untuk finish';
      }
    }
  }
  return null;
}