import type { ProductionStatus } from '@/types/pipeline.ts';

// ===== Invoice per Kode Produksi Konveksi =====
// Helper murni: tidak fetch, tidak mengimpor Supabase, tidak menulis data —
// sama seperti src/lib/logDashboard.ts, supaya aturan invoicing bisa diuji
// tanpa database.
//
// ATURAN (permintaan user): satu invoice dibuat untuk satu **Kode Produksi
// Konveksi** (`product_note`), dan hanya ketika **SEMUA** variasi kode itu
// sudah selesai. Sebelumnya invoice dibuat per work order (satu variasi) dan
// dipicu begitu variasi pertama selesai — akibatnya kode produksi dengan 4
// variasi menerbitkan invoice 100 pcs padahal totalnya 400 pcs, dan varasi
// yang masih dikerjakan tidak tertagih.

/**
 * Status satu variasi (work order) yang dianggap "sudah selesai" untuk
 * keperluan invoicing.
 *
 * `INVOICED` ikut dihitung selesai karena halaman Invoicing menurunkan status
 * ini saat kode produksinya diinvoice; kalau tidak dihitung, kode yang sudah
 * diinvoice akan dianggap belum selesai dan invoice-nya dibuat ulang.
 */
const DONE_STATUSES: ReadonlySet<ProductionStatus> = new Set<ProductionStatus>(['FINISHED', 'INVOICED']);

export interface ProductionCodeVariation {
  /** Status produksi variasi ini. */
  status: ProductionStatus;
  /** Qty variasi; nilai tak valid dihitung 0 supaya penjumlahan tidak NaN. */
  quantity: number;
}

export interface GroupInvoiceReadiness {
  /** true hanya bila ada minimal satu variasi DAN semuanya selesai DAN ber-qty. */
  ready: boolean;
  /** Jumlah seluruh variasi (bukan hanya yang selesai). */
  totalPcs: number;
  variationCount: number;
  /** Variasi yang belum selesai — dipakai menjelaskan kenapa belum siap. */
  pendingCount: number;
  /** Variasi yang qty-nya belum diterima dari POS client (qty <= 0). */
  missingQtyCount: number;
}

/**
 * Apakah satu Kode Produksi Konveksi sudah layak diinvoice, dan berapa pcs-nya.
 *
 * **Kode produksi tanpa variasi TIDAK siap** — bukan "siap dengan 0 pcs".
 * Ini penting: keputusan user adalah menghapus invoice lama lalu membiarkan
 * yang baru dibuat otomatis, jadi `ready` harus berarti "invoice bisa dibuat",
 * bukan sekadar "tidak ada yang belum selesai". Tanpa gerbang ini, kode
 * produksi kosong akan lolos dan menghasilkan invoice 0 pcs.
 *
 * **Setiap variasi harus ber-qty > 0** — gerbang kedua dengan alasan yang sama,
 * ditambahkan setelah input qty manual dihapus dari Order Entry: setiap order
 * baru ber-qty 0 sampai POS client mengisinya, dan invoice bernilai 0 pcs
 * adalah dokumen tagihan yang salah.
 *
 * Gerbangnya adalah **setiap** variasi, bukan "total pcs > 0". Bentuk yang
 * salah itu pernah ditulis di sini dan berbahaya: grup 2 variasi yang satu
 * ber-qty 100 dan satu ber-qty 0 akan lolos dengan `totalPcs = 100`, lalu
 * `ensureInvoiceForProductionOrder` menerbitkan invoice **100 pcs untuk kode
 * produksi 200 pcs** — persis regresi tagihan-sebagian yang membuat aturan
 * "invoice per kode produksi" ini dibuat. Lebih buruk lagi, variasi dihitung
 * `INVOICED` sehingga invoice yang kurang itu tidak akan pernah dibuat ulang.
 * Satu variasi tanpa qty menahan seluruh grup.
 *
 * Ini jaring pengaman terakhir — status FINISHED sendiri sudah mustahil
 * dicapai saat qty 0 (lihat penjaga `orderQty > 0` di `deriveStatus` dan
 * `validateStatusTransition`), tetapi invoice adalah jalur uang, jadi ia
 * diperiksa ulang di sini alih-alih dipercayakan pada satu penjaga di hulu.
 */
export function checkGroupInvoiceReadiness(
  variations: ProductionCodeVariation[],
): GroupInvoiceReadiness {
  let totalPcs = 0;
  let pendingCount = 0;
  let missingQtyCount = 0;

  for (const variation of variations) {
    const qty = Number(variation.quantity);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    totalPcs += safeQty;
    if (safeQty <= 0) missingQtyCount += 1;
    if (!DONE_STATUSES.has(variation.status)) pendingCount += 1;
  }

  return {
    ready: variations.length > 0 && pendingCount === 0 && missingQtyCount === 0,
    totalPcs,
    variationCount: variations.length,
    pendingCount,
    missingQtyCount,
  };
}

/**
 * Kenapa invoice satu kode produksi belum bisa dibuat — kalimat siap tampil.
 *
 * Dipakai agar halaman Invoicing bisa menjelaskan keadaan, bukan sekadar
 * menyembunyikan baris yang belum siap.
 */
export function invoiceBlockedReason(readiness: GroupInvoiceReadiness): string | null {
  if (readiness.ready) return null;
  if (readiness.variationCount === 0) {
    return 'Kode produksi ini belum punya variasi, jadi tidak ada yang bisa ditagih.';
  }
  // Qty yang belum masuk dari POS client diperiksa lebih dulu: itu penyebab
  // yang paling sering menahan (setiap order baru ber-qty 0), dan pesan
  // "Masih ada 0 dari 4 variasi yang belum selesai" akan membingungkan.
  if (readiness.missingQtyCount > 0) {
    return readiness.missingQtyCount === readiness.variationCount
      ? 'Qty order belum diterima dari POS client, jadi belum ada yang bisa ditagih.'
      : `Qty ${readiness.missingQtyCount} dari ${readiness.variationCount} variasi belum diterima dari POS client, jadi total tagihan belum utuh.`;
  }
  return `Masih ada ${readiness.pendingCount} dari ${readiness.variationCount} variasi yang belum selesai.`;
}

/**
 * Jenis tagihan untuk satu kode produksi, dihitung dari **total pcs seluruh
 * variasi** — bukan per variasi.
 *
 * Sebelumnya perhitungan memakai qty satu work order, sehingga kode produksi
 * 400 pcs yang variasi pertamanya hanya 10 pcs bisa salah diklasifikasi
 * sebagai Sample Production.
 */
export function deriveBillingTypeForGroup(
  totalPcs: number,
  sampleThreshold: number,
): 'sample_production' | 'mass_production' {
  return totalPcs <= sampleThreshold ? 'sample_production' : 'mass_production';
}
