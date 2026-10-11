import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STATUS_ORDER,
  deriveStatus,
  deriveVariasiStatuses,
  needsUpPos,
  variasiStatusText,
  validateStatusTransition,
} from '../src/lib/productionStatus.ts';
import {
  productionStatusColor,
  productionStatusLabel,
  variasiStatusLabel,
} from '../src/types/pipeline.ts';
import type { VariasiStatus } from '../src/types/pipeline.ts';

// ===== deriveStatus =====
// Revisi user: TIDAK ada status CUTTING. Begitu cutting terisi, WO langsung
// masuk PROGRESS — bukan lagi "cutting selesai, belum jahit" sebagai tahap
// tersendiri.

test('cutting belum diisi sama sekali → NEW', () => {
  assert.equal(deriveStatus(0, 0, 100), 'NEW');
});

test('cutting terisi, jahit belum mulai → PROGRESS (bukan CUTTING lagi)', () => {
  // Ini inti revisinya: dulu mengembalikan 'CUTTING'.
  assert.equal(deriveStatus(100, 0, 100), 'PROGRESS');
});

test('cutting terisi sebagian dan belum ada jahit → tetap PROGRESS', () => {
  assert.equal(deriveStatus(30, 0, 100), 'PROGRESS');
});

test('jahit sebagian, belum penuh → PROGRESS', () => {
  assert.equal(deriveStatus(100, 40, 100), 'PROGRESS');
});

test('jahit mencapai qty order → FINISHED', () => {
  assert.equal(deriveStatus(100, 100, 100), 'FINISHED');
});

test('jahit melebihi qty order (over-jahit) → tetap FINISHED', () => {
  assert.equal(deriveStatus(100, 120, 100), 'FINISHED');
});

test('Qty 0 (belum diterima dari POS) → PROGRESS, bukan FINISHED', () => {
  // Penjaga `orderQty > 0`. Tanpa ini `sewingTotal >= 0` selalu benar,
  // sehingga WO yang baru dijahit 1 pcs langsung FINISHED — padahal targetnya
  // belum diketahui, dan FINISHED membuka jalan ke invoice 0 pcs.
  assert.equal(deriveStatus(100, 1, 0), 'PROGRESS');
  assert.equal(deriveStatus(100, 500, 0), 'PROGRESS');
});

test('cutting melebihi qty order tidak mengubah hasil PROGRESS', () => {
  assert.equal(deriveStatus(150, 10, 100), 'PROGRESS');
});

test('jahit penuh tanpa cutting tetap NEW — cutting adalah gerbangnya', () => {
  // cuttingTotal 0 → NEW walau sewingTotal >= qty; menjaga agar WO yang
  // cuttingnya dihapus tidak diam-diam tampil FINISHED.
  assert.equal(deriveStatus(0, 100, 100), 'NEW');
});

test('deriveStatus tidak pernah mengembalikan CUTTING', () => {
  const combos = [
    [0, 0, 100],
    [1, 0, 100],
    [50, 0, 100],
    [50, 25, 100],
    [100, 100, 100],
    [100, 0, 0],
  ] as const;
  for (const [cutting, sewing, qty] of combos) {
    assert.notEqual(deriveStatus(cutting, sewing, qty), 'CUTTING');
  }
});

// ===== deriveStatus: FINISHED menunggu kancing & finishing (revisi 2026-09-28) =====
//
// Permintaan user: "kalau cutting dan jahit sudah sama angkanya, tapi finishing,
// kancing masih 0 ya artinya masih progress". Saat ditanya, user memilih
// **"Ya, tunggu kancing & finishing"** — FINISHED baru saat KEEMPAT tahap
// mencapai qty.
//
// Ini perubahan yang menyangkut uang: FINISHED-lah yang memicu auto-invoice
// (`ensureInvoiceForProductionOrder`), jadi auto-invoice kini sengaja tertunda
// sampai kancing & finishing penuh.

test('cutting & jahit penuh tapi kancing 0 → PROGRESS, bukan FINISHED', () => {
  // Inti revisi. Sebelumnya baris ini FINISHED, dan invoicenya bisa terbit
  // untuk pekerjaan yang belum selesai.
  assert.equal(deriveStatus(100, 100, 100, 0, 0), 'PROGRESS');
});

test('cutting, jahit, kancing penuh tapi finishing 0 → PROGRESS', () => {
  assert.equal(deriveStatus(100, 100, 100, 100, 0), 'PROGRESS');
});

test('kancing penuh tapi finishing kurang → PROGRESS', () => {
  assert.equal(deriveStatus(100, 100, 100, 100, 60), 'PROGRESS');
});

test('keempat tahap mencapai qty → FINISHED', () => {
  assert.equal(deriveStatus(100, 100, 100, 100, 100), 'FINISHED');
});

test('keempat tahap melebihi qty → tetap FINISHED (syarat >=)', () => {
  assert.equal(deriveStatus(120, 120, 100, 120, 120), 'FINISHED');
});

test('kancing & finishing penuh tapi jahit kurang → PROGRESS', () => {
  // Dua tahap akhir tidak boleh mendahului tahap sebelumnya.
  assert.equal(deriveStatus(100, 40, 100, 100, 100), 'PROGRESS');
});

test('tanpa angka kancing/finishing, perilaku lama dipertahankan (FINISHED)', () => {
  // `kancingTotal`/`finishingTotal` opsional supaya pemanggil lama yang hanya
  // punya cutting & jahit tidak tertahan selamanya. Tahap akhir tidak bisa
  // dinilai dari data yang tidak diberikan — jadi FINISHED seperti sebelumnya.
  assert.equal(deriveStatus(100, 100, 100), 'FINISHED');
  assert.equal(deriveStatus(100, 100, 100, undefined, undefined), 'FINISHED');
});

test('hanya salah satu angka akhir diberikan → tetap diperiksa', () => {
  // Menyebut salah satu saja sudah cukup untuk menilai tahap akhir; yang tidak
  // disebut dihitung 0. Ini mencegah "kasih kancing saja" jadi celah lolos.
  assert.equal(deriveStatus(100, 100, 100, 100), 'PROGRESS'); // finishing dianggap 0
  assert.equal(deriveStatus(100, 100, 100, undefined, 100), 'PROGRESS'); // kancing dianggap 0
  assert.equal(deriveStatus(100, 100, 100, 100, undefined), 'PROGRESS');
});

test('qty belum diterima dari POS tetap menahan FINISHED walau tahap akhir penuh', () => {
  // Penjaga `orderQty > 0` diperiksa lebih dulu, sebelum tahap akhir.
  assert.equal(deriveStatus(100, 100, 0, 100, 100), 'PROGRESS');
});

// ===== STATUS_ORDER =====

test('STATUS_ORDER berisi empat status tanpa CUTTING dan urut maju', () => {
  assert.deepEqual(STATUS_ORDER, ['NEW', 'PROGRESS', 'FINISHED', 'INVOICED']);
  assert.ok(!STATUS_ORDER.includes('CUTTING' as never));
});

// ===== Label & warna =====
// ProductionMonitoring memetakan label/warna lewat Record<ProductionStatus, _>,
// jadi kunci yang hilang menghasilkan badge kosong — bukan error tipe saat
// runtime. Tes ini mengunci kelengkapannya.

test('setiap status di STATUS_ORDER punya label dan warna', () => {
  for (const status of STATUS_ORDER) {
    assert.equal(typeof productionStatusLabel[status], 'string');
    assert.equal(typeof productionStatusColor[status], 'string');
    assert.ok(productionStatusLabel[status].length > 0, `label kosong untuk ${status}`);
  }
});

test('peta label & warna tidak lagi memuat CUTTING', () => {
  assert.ok(!('CUTTING' in productionStatusLabel));
  assert.ok(!('CUTTING' in productionStatusColor));
});

// ===== validateStatusTransition =====
// Maju satu langkah per transisi; tiap langkah punya syarat datanya sendiri.

test('NEW → PROGRESS boleh bila cutting sudah terisi', () => {
  assert.equal(validateStatusTransition('NEW', 'PROGRESS', 0, 100, 100), null);
});

test('NEW → PROGRESS ditolak bila cutting masih kosong', () => {
  assert.equal(
    validateStatusTransition('NEW', 'PROGRESS', 0, 0, 100),
    'Cutting harus sudah terisi untuk lanjut Progress',
  );
});

test('PROGRESS → FINISHED ditolak bila jahit belum penuh', () => {
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 40, 100, 100),
    'Cutting dan jahit harus sampai qty order untuk finish',
  );
});

test('PROGRESS → FINISHED ditolak bila cutting kosong', () => {
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 0, 100),
    'Cutting dan jahit harus sampai qty order untuk finish',
  );
});

test('PROGRESS → FINISHED ditolak bila qty belum diterima dari POS', () => {
  // `sewingTotal < quantity` selalu salah saat quantity 0 — tanpa cabang
  // khusus ini transisi lolos tanpa target yang jelas.
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 0),
    'Qty dari POS client belum diterima, status belum bisa Finish',
  );
});

test('PROGRESS → FINISHED boleh bila cutting & jahit sudah mencapai qty', () => {
  assert.equal(validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100), null);
});

// Revisi 2026-09-28: FINISHED juga menunggu kancing & finishing. Dua parameter
// terakhir OPSIONAL — pemanggil lama yang tidak punya datanya tidak ikut
// tertahan (lihat tes terakhir di blok ini).

test('PROGRESS → FINISHED ditolak bila kancing belum mencapai qty', () => {
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100, 40, 100),
    'Kancing dan finishing harus sampai qty order untuk finish',
  );
});

test('PROGRESS → FINISHED ditolak bila finishing belum mencapai qty', () => {
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100, 100, 0),
    'Kancing dan finishing harus sampai qty order untuk finish',
  );
});

test('PROGRESS → FINISHED boleh bila keempat tahap sudah mencapai qty', () => {
  assert.equal(validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100, 100, 100), null);
});

test('tanpa angka kancing/finishing, aturan lama dipertahankan (boleh finish)', () => {
  // Pemanggil lama (mis. drag-and-drop yang belum memuat kedua angka itu)
  // tidak boleh tiba-tiba tertahan.
  assert.equal(validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100), null);
});

test('menyebut salah satu angka akhir saja tetap memicu pemeriksaan', () => {
  // Yang tidak disebut dihitung 0, jadi tidak ada celah "kasih kancing saja".
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100, 100),
    'Kancing dan finishing harus sampai qty order untuk finish',
  );
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 100, undefined, 100),
    'Kancing dan finishing harus sampai qty order untuk finish',
  );
});

test('penjaga qty POS diperiksa lebih dulu daripada tahap akhir', () => {
  // Qty 0 = belum diterima dari POS; pesannya harus soal POS, bukan soal
  // kancing/finishing — supaya user tahu apa yang harus dibereskan.
  assert.equal(
    validateStatusTransition('PROGRESS', 'FINISHED', 100, 100, 0, 0, 0),
    'Qty dari POS client belum diterima, status belum bisa Finish',
  );
});

test('status yang sama tidak dianggap transisi', () => {
  assert.equal(validateStatusTransition('NEW', 'NEW', 0, 0, 100), null);
});

test('mundur status ditolak', () => {
  assert.equal(validateStatusTransition('PROGRESS', 'NEW', 0, 100, 100), 'Gak bisa mundur status');
});

test('lompat status ditolak — harus maju satu per satu', () => {
  assert.equal(
    validateStatusTransition('NEW', 'FINISHED', 100, 100, 100),
    'Gak bisa lompat status — maju satu per satu',
  );
  assert.equal(
    validateStatusTransition('NEW', 'INVOICED', 100, 100, 100),
    'Gak bisa lompat status — maju satu per satu',
  );
});

test('NEW → PROGRESS adalah tepat satu langkah di urutan baru', () => {
  // Kalau CUTTING masih ada di STATUS_ORDER, ini akan jadi lompatan dan
  // ditolak — tes ini menjaga penghapusannya tidak diam-diam kembali.
  assert.equal(STATUS_ORDER.indexOf('PROGRESS'), STATUS_ORDER.indexOf('NEW') + 1);
});

// ===== Status level-1 (per variasi) =====
//
// Permintaan user (verbatim): "saya mau status di Production order itu ada 2
// level. level pertama untuk status variasinya. kalau belum isi cutting /
// cutting udah keisi tapi belum ada laporan jahit berarti statusnya Cutting,
// kalau udah ada laporan jahitnya berarti Sewing, kalau udah ada laporan
// kancingnya Kancing (tapi misal sewingnya juga masih ada berarti multiple
// status Sewing dan Kancing), berlaku juga untuk finishing."
//
// Keputusan user saat ditanya: **Cutting tampil sampai ada laporan jahit** —
// jadi baris yang sudah dipotong tapi belum dijahit menampilkan
// [Cutting] [Kancing] [Finishing] sekaligus.

/** Singkatan agar tiap kasus terbaca sebagai satu baris. */
function vs(cutting: number, sewing: number, kancing: number, finishing: number) {
  return deriveVariasiStatuses({
    cuttingTotal: cutting,
    sewingTotal: sewing,
    kancingTotal: kancing,
    finishingTotal: finishing,
  });
}

/** Sama seperti `vs`, tetapi dengan Qty — untuk kasus Completed. */
function vsQty(
  cutting: number,
  sewing: number,
  kancing: number,
  finishing: number,
  qty: number,
) {
  return deriveVariasiStatuses({
    cuttingTotal: cutting,
    sewingTotal: sewing,
    kancingTotal: kancing,
    finishingTotal: finishing,
    orderQty: qty,
  });
}

test('belum isi cutting sama sekali → Cutting', () => {
  // Kalimat user: "kalau belum isi cutting … berarti statusnya Cutting".
  assert.deepEqual(vs(0, 0, 0, 0), ['CUTTING']);
});

test('cutting sudah keisi tapi belum ada laporan jahit → Cutting', () => {
  // Kalimat user: "cutting udah keisi tapi belum ada laporan jahit berarti
  // statusnya Cutting".
  assert.deepEqual(vs(100, 0, 0, 0), ['CUTTING']);
});

test('cutting sebagian, belum ada jahit → tetap Cutting', () => {
  assert.deepEqual(vs(30, 0, 0, 0), ['CUTTING']);
});

test('sudah ada laporan jahit → Sewing, dan Cutting hilang', () => {
  assert.deepEqual(vs(100, 40, 0, 0), ['SEWING']);
});

test('jahit sudah sama dengan cutting, kancing belum ada → tetap Sewing', () => {
  // Revisi user: "kalau cutting dan jahit sudah sama angkanya, tapi finishing,
  // kancing masih 0 ya artinya masih progress". Saat ditanya badge apa yang
  // tampil untuk keadaan itu, user memilih **Sewing** ("tidak ada perubahan
  // dari aturan lama") — selama kancing belum dilaporkan, jahit belum dianggap
  // tuntas.
  assert.deepEqual(vs(100, 100, 0, 0), ['SEWING']);
});

test('jahit belum sama dengan cutting → Sewing, walau kancing sudah jalan', () => {
  // Revisi user: "bleh Sewing Kancing kalau si sewing ini angkanya blum sama
  // kaya cutting".
  assert.deepEqual(vs(100, 50, 50, 0), ['SEWING', 'KANCING']);
});

test('jahit sudah sama dengan cutting dan kancing mulai → cukup Kancing', () => {
  // Revisi user: "kalau kancing udah mulai ada angkana, statusnya cukup
  // Kancing". Perhatikan: hasilnya HANYA Kancing — Sewing sudah hilang karena
  // jahitnya sudah mencapai cutting, bukan lagi "Sewing Kancing".
  assert.deepEqual(vs(100, 100, 40, 0), ['KANCING']);
});

test('kancing sudah penuh tapi finishing belum → Finishing', () => {
  // Kancing mencapai cutting berarti tahap kancing selesai; yang tersisa
  // Finishing.
  assert.deepEqual(vs(100, 100, 100, 0), ['FINISHING']);
});

test('jahit dan kancing berjalan bersamaan → Sewing + Kancing (kasus yang user sebut)', () => {
  // Kalimat user: "misal sewingnya juga masih ada berarti multiple status
  // Sewing dan Kancing".
  assert.deepEqual(vs(100, 40, 40, 0), ['SEWING', 'KANCING']);
});

test('jahit, kancing, dan finishing semuanya ada → tiga badge', () => {
  assert.deepEqual(vs(100, 40, 40, 40), ['SEWING', 'KANCING', 'FINISHING']);
});

test('kancing & finishing sudah ada padahal jahit masih 0 → tetap ikut tampil', () => {
  // Kasus ANOMALI (kancing/finishing dilaporkan sebelum jahit — mustahil secara
  // alur, tapi mungkin salah input). Badge-nya sengaja dibiarkan tampil semua:
  // inilah satu-satunya tanda bahwa urutan di lantai produksi salah, dan
  // menyembunyikannya justru menghapus sinyal itu.
  //
  // CATATAN JUJUR: bentuk data ini TIDAK ADA di database saat revisi ini
  // ditulis. Sempat ditulis di sini bahwa WO-67128379 (Gena Pants Ivory XL)
  // berbentuk cutting 100 / jahit 0 / kancing 100 / finishing 100 — itu SALAH.
  // Diperiksa lewat Supabase MCP: baris itu sebenarnya 100/100/100/100
  // (FINISHED). Jadi ini murni kasus pertahanan, bukan data nyata.
  assert.deepEqual(vs(100, 0, 100, 100), ['CUTTING', 'KANCING', 'FINISHING']);
});

test('finishing saja tanpa kancing → Sewing + Finishing', () => {
  assert.deepEqual(vs(100, 50, 0, 50), ['SEWING', 'FINISHING']);
});

test('kancing sudah melebihi cutting → kancing selesai, tinggal Finishing', () => {
  // Sebelum revisi ini hasilnya ['SEWING','KANCING'] karena Sewing menempel
  // terus. Sekarang jahit (100) sudah mencapai cutting (100), jadi Sewing tidak
  // lagi ditampilkan; kancing 150 ≥ 100 berarti tahap kancing juga lewat.
  assert.deepEqual(vs(100, 100, 150, 0), ['FINISHING']);
});

test('cutting 0 tapi sudah ada jahit → Sewing, bukan Cutting', () => {
  // Cutting adalah gerbang JAHIT, bukan angka cuttingnya sendiri. WO yang
  // laporan jahitnya ada tapi baris cuttingnya terhapus tetap Sewing.
  assert.deepEqual(vs(0, 10, 0, 0), ['SEWING']);
});

test('urutan hasil selalu mengikuti alur produksi, bukan urutan input', () => {
  // Badge dirender mengikuti urutan array, jadi urutannya harus stabil.
  assert.deepEqual(vs(100, 10, 10, 10), ['SEWING', 'KANCING', 'FINISHING']);
  assert.deepEqual(vs(0, 0, 10, 10), ['CUTTING', 'KANCING', 'FINISHING']);
});

test('hasilnya tidak pernah kosong — setiap WO punya minimal satu status', () => {
  const combos = [
    [0, 0, 0, 0],
    [100, 0, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 100, 0],
    [0, 0, 0, 100],
    [100, 100, 100, 100],
  ] as const;
  for (const [cutting, sewing, kancing, finishing] of combos) {
    assert.ok(
      vs(cutting, sewing, kancing, finishing).length > 0,
      `kosong untuk cutting=${cutting} jahit=${sewing} kancing=${kancing} finishing=${finishing}`,
    );
  }
});

test('angka tidak valid diperlakukan 0, tidak menghasilkan status palsu', () => {
  // Bentuk data yang mungkin datang dari service: string kosong / null / NaN.
  const hasil = deriveVariasiStatuses({
    cuttingTotal: Number.NaN,
    sewingTotal: Number.NaN,
    kancingTotal: Number.NaN,
    finishingTotal: Number.NaN,
  });
  assert.deepEqual(hasil, ['CUTTING']);
});

test('Status Variasi TIDAK menggantikan status level-2 — dua-duanya hidup', () => {
  // Ini yang membedakan permintaan ini dari revisi lama (yang melebur CUTTING
  // ke PROGRESS). Sekarang level-2 tetap New/Progress/Finished, dan level-1
  // punya istilahnya sendiri.
  const cutting = 100, sewing = 0, qty = 100;
  assert.equal(deriveStatus(cutting, sewing, qty), 'PROGRESS');
  assert.deepEqual(vs(cutting, sewing, 0, 0), ['CUTTING']);
});

// ===== variasiStatusText (nilai kolom untuk Filter/Sort & CSV) =====

test('satu status menjadi teks tunggal', () => {
  assert.equal(variasiStatusText(['SEWING']), 'Sewing');
});

test('beberapa status digabung dengan titik tengah', () => {
  assert.equal(
    variasiStatusText(['CUTTING', 'KANCING', 'FINISHING']),
    'Cutting · Kancing · Finishing',
  );
});

test('daftar kosong menjadi teks kosong', () => {
  assert.equal(variasiStatusText([]), '');
});

// ===== Completed (status terminal) =====
//
// Permintaan user (verbatim): "kalau kolom cutting, sewing, kancing, finishing
// dan QTY nya udah sama, status variasnya berarti Completed".
//
// Dua keputusan yang diambil di sini dan perlu diketahui:
// 1. Completed MENGGANTIKAN badge lain, bukan ditambahkan di ujungnya — kalau
//    ditambahkan, barisnya jadi "Sewing · Kancing · Finishing · Completed".
// 2. Syaratnya `>=` Qty, bukan `=` — mengikuti konvensi halaman ini yang sudah
//    memakai `>=` untuk "sudah tercapai".

test('cutting, jahit, kancing, finishing semuanya = Qty → Completed', () => {
  assert.deepEqual(vsQty(100, 100, 100, 100, 100), ['COMPLETED']);
});

test('Completed MENGGANTIKAN badge lain — hasilnya satu badge, bukan empat', () => {
  // Ini inti keputusannya: tanpa cabang terminal, hasilnya akan berbunyi
  // ['SEWING','KANCING','FINISHING'] — tidak ada 'Cutting' karena jahit > 0.
  const hasil = vsQty(100, 100, 100, 100, 100);
  assert.equal(hasil.length, 1);
  assert.ok(!hasil.includes('SEWING' as never));
  assert.ok(!hasil.includes('KANCING' as never));
  assert.ok(!hasil.includes('FINISHING' as never));
  assert.ok(!hasil.includes('CUTTING' as never));
});

test('melebihi Qty tetap Completed (syarat >=, bukan =)', () => {
  assert.deepEqual(vsQty(120, 120, 120, 120, 100), ['COMPLETED']);
});

test('SATU kolom saja kurang dari Qty → bukan Completed', () => {
  // Empat kasus, masing-masing menggagalkan satu kolom. Isi badge-nya kini
  // berbeda-beda karena aturan barunya "status mengikuti tahap yang berjalan",
  // tetapi yang diuji di sini hanya satu hal: TIDAK ADA yang jadi Completed.
  //
  // Perhatikan kasus cutting: cutting 80 < Qty 100, tapi jahit 100 sudah
  // MELEBIHI cutting. Karena aturan user membandingkan jahit terhadap CUTTING
  // ("kalau si sewing ini angkanya blum sama kaya cutting"), baris ini terbaca
  // sebagai tahap Finishing — bukan sebagai "cutting kurang". Cutting yang
  // kurang dari Qty TIDAK memunculkan badge tersendiri; itu konsisten dengan
  // kalimat user, dan dicatat di sini supaya bukan kejutan.
  const kasus = [
    ['cutting kurang', vsQty(80, 100, 100, 100, 100), ['FINISHING']],
    ['jahit kurang', vsQty(100, 80, 100, 100, 100), ['SEWING', 'KANCING', 'FINISHING']],
    ['kancing kurang', vsQty(100, 100, 80, 100, 100), ['KANCING', 'FINISHING']],
    ['finishing kurang', vsQty(100, 100, 100, 80, 100), ['FINISHING']],
  ] as const;
  for (const [nama, hasil, harapan] of kasus) {
    assert.deepEqual(hasil, harapan, `badge salah untuk ${nama}`);
    assert.ok(!hasil.includes('COMPLETED' as never), `${nama} tidak boleh Completed`);
  }
});

test('kancing & finishing sudah penuh tapi jahit belum → BUKAN Completed', () => {
  // Bentuk anomali (kancing/finishing sebelum jahit). Sama seperti tes di atas,
  // ini BUKAN data nyata — diperiksa lewat Supabase MCP, tidak ada baris seperti
  // ini di database saat revisi ditulis.
  assert.deepEqual(vsQty(100, 0, 100, 100, 100), ['CUTTING', 'KANCING', 'FINISHING']);
});

test('keempatnya 0 dan Qty 0 → BUKAN Completed (penjaga qty > 0)', () => {
  // Tanpa penjaga `qty > 0`, baris kosong akan "Completed" hanya karena 0 = 0.
  assert.deepEqual(vsQty(0, 0, 0, 0, 0), ['CUTTING']);
});

test('keempatnya 0 tapi Qty 100 → Cutting, bukan Completed', () => {
  assert.deepEqual(vsQty(0, 0, 0, 0, 100), ['CUTTING']);
});

test('tanpa orderQty, Completed tidak pernah muncul', () => {
  // `orderQty` opsional; pemanggil lama yang belum mengisinya tidak boleh
  // tiba-tiba menghasilkan Completed. Keempat tahap sudah penuh, jadi badge-nya
  // jatuh ke tahap terakhir yang berjalan: Finishing.
  assert.deepEqual(vs(100, 100, 100, 100), ['FINISHING']);
});

test('Qty tidak valid diperlakukan 0 → Completed mustahil', () => {
  assert.deepEqual(vsQty(100, 100, 100, 100, Number.NaN), ['FINISHING']);
});

test('status variasi Completed tidak mengubah status level-2', () => {
  // Level-2 tetap dihitung oleh deriveStatus dan tidak tahu soal Completed.
  assert.equal(deriveStatus(100, 100, 100), 'FINISHED');
  assert.deepEqual(vsQty(100, 100, 100, 100, 100), ['COMPLETED']);
});

test('setiap status variasi punya label tampilan', () => {
  const semua: VariasiStatus[] = ['CUTTING', 'SEWING', 'KANCING', 'FINISHING', 'COMPLETED'];
  for (const s of semua) {
    assert.equal(typeof variasiStatusLabel[s], 'string');
    assert.ok(variasiStatusLabel[s].length > 0, `label kosong untuk ${s}`);
  }
});

// ===== needsUpPos (kolom alert "Need Up POS") =====
//
// Permintaan user (verbatim, revisi 2026-09-28):
//   "NEED UP POS harus muncul ketika kolom Qty Diterima Client angkana lebih
//    kecil dibanding finishing"
//
// Ini MENGGANTIKAN aturan lama. Dulu syaratnya `sewing === finishing` (dari
// permintaan awal user: "kalau sewing dan finishing udah sama tapi Qty
// berbeda"). Syarat itu sekarang dibuang — yang menentukan hanya finishing
// terhadap Qty.
//
// Arah tetap: **hanya bila finishing LEBIH BANYAK** dari Qty (arah "produksi
// kurang" diabaikan — itu wajar, sisa pekerjaan).

test('finishing melebihi Qty Diterima Client → Need Up POS', () => {
  assert.equal(needsUpPos(100, 80), true);
});

test('finishing sama dengan Qty → tidak ada alert', () => {
  assert.equal(needsUpPos(100, 100), false);
});

test('finishing KURANG dari Qty → TIDAK ditandai (keputusan user)', () => {
  // Sisa pekerjaan itu normal; yang ditandai hanya POS yang ketinggalan.
  assert.equal(needsUpPos(80, 100), false);
});

test('jahit tidak lagi ikut menentukan — dulu menahannya, sekarang tidak', () => {
  // Inilah perubahan intinya. Dulu `sewing === finishing` wajib, sehingga
  // finishing 100 dengan jahit 90 TIDAK menyala. Sekarang menyala, karena
  // yang dibandingkan hanya finishing vs Qty.
  assert.equal(needsUpPos(100, 80), true);
});

test('belum dikerjakan sama sekali (finishing 0) → tidak ditandai', () => {
  // Penjaga `finishing > 0`. Tanpa ini setiap WO yang belum difinishing akan
  // bertanda hanya karena Qty-nya kebetulan 0 atau lebih kecil.
  assert.equal(needsUpPos(0, 0), false);
  assert.equal(needsUpPos(0, 50), false);
  assert.equal(needsUpPos(0, 100), false);
});

test('Qty belum dari POS (0) → MENYALA bila finishing sudah ada', () => {
  // Keputusan user saat ditanya eksplisit: **"Nyala juga saat qty belum dari
  // POS"** — WO yang sudah difinishing sementara POS belum menunjukkan qty
  // sama sekali memang pasti perlu di-up.
  //
  // Konsekuensinya dicatat: order yang baru mulai produksi akan langsung
  // bertanda, dan kolom ini tidak lagi bisa membedakan "POS ketinggalan" dari
  // "qty belum pernah masuk". Ini pilihan user, bukan kelalaian.
  assert.equal(needsUpPos(16, 0), true);
  assert.equal(needsUpPos(1, 0), true);
});

test('Qty negatif tidak valid → diperlakukan seperti belum ada Qty', () => {
  // Angka negatif tidak mungkin datang dari POS, tapi bila ada, `finishing > 0`
  // tetap yang menentukan — bukan perbandingan yang menyesatkan.
  assert.equal(needsUpPos(50, -10), true);
});

test('angka tidak valid diperlakukan 0', () => {
  assert.equal(needsUpPos(Number.NaN, Number.NaN), false);
  assert.equal(needsUpPos(Number.NaN, 100), false);
});
