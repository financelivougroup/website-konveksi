import type { ProductionStatus, WorkOrder } from '@/types/pipeline';
import { STATUS_ORDER, deriveStatus } from './productionStatus.ts';

/**
 * Satu Work Order yang sudah diperkaya angka produksinya (cutting/jahit/
 * finishing/kancing) dan status turunannya oleh Production Monitoring.
 */
export interface KanbanWorkOrder extends WorkOrder {
  derivedStatus: ProductionStatus;
  cuttingTotal?: number;
  sewingTotal?: number;
  finishingTotal?: number;
  kancingTotal?: number;
}

/**
 * Satu kartu Kanban = satu **Kode Produksi Konveksi** (`product_note`).
 * Beberapa variasi warna/size dari kode yang sama menjadi satu kartu.
 */
export interface KanbanGroup {
  productNote: string;
  /** Kode produksi milik client, ditampilkan di dalam kartu — bukan judulnya. */
  clientProductionCode: string | null;
  product: string;
  brand: string;
  totalQty: number;
  status: ProductionStatus;
  workOrders: KanbanWorkOrder[];
  /**
   * URL foto untuk kartu/kode ini — foto variasi PERTAMA yang punya foto.
   *
   * Satu kode produksi bisa memuat beberapa variasi dengan foto berbeda, jadi
   * tidak ada satu foto yang mewakili semuanya. Variasi pertama dipilih karena
   * itulah yang paling mewakili kode ini secara tampilan. Bila seluruh variasi
   * tidak berfoto, gunakan foto produk induk; `null` bila keduanya tidak ada.
   * Sengaja URL, bukan path: pemanggil hanya perlu merender.
   */
  photoUrl: string | null;
}

function rank(status: ProductionStatus): number {
  // Satu sumber urutan dengan STATUS_ORDER — dulu ada peta STATUS_RANK
  // terpisah yang harus dijaga sinkron dengan daftar ini, dan itu justru
  // sumber drift saat status berubah.
  return STATUS_ORDER.indexOf(status);
}

/**
 * Kelompokkan Work Order menjadi kartu Kanban per Kode Produksi Konveksi.
 *
 * **Aturan status kartu** (permintaan user): kalau satu kode produksi konveksi
 * punya lebih dari satu variasi dan masih ada satu saja yang belum selesai
 * (NEW/PROGRESS), kartu **tetap di kolom mundur** — bukan naik ke FINISHED
 * hanya karena ada variasi yang sudah selesai.
 *
 * Jadi status kartu = status **terendah** di antara variasinya. Contoh nyata:
 * 3 variasi PROGRESS + 1 FINISHED → kartu tetap di kolom PROGRESS. Sebelumnya
 * aturannya kebalikan (tertinggi), sehingga pekerjaan yang masih berjalan
 * tersembunyi di kolom FINISHED.
 *
 * `totalQty` tetap menjumlah **seluruh** qty variasi, termasuk yang sudah
 * selesai — kartu menunjukkan besaran kode produksinya, bukan sisa pekerjaan.
 *
 * Work Order tanpa `productNote` dilewati (tidak bisa diidentifikasi).
 */
export function buildKanbanGroups(workOrders: KanbanWorkOrder[]): KanbanGroup[] {
  const map = new Map<string, KanbanGroup>();
  for (const wo of workOrders) {
    const note = wo.productNote?.trim();
    if (!note) continue;
    const qty = Number(wo.quantity) || 0;
    const existing = map.get(note);
    if (existing) {
      existing.totalQty += qty;
      if (rank(wo.derivedStatus) < rank(existing.status)) existing.status = wo.derivedStatus;
      // Foto: pakai yang pertama ditemukan, jangan menimpa yang sudah ada.
      // Kalau ditimpa, variasi terakhir yang diproses akan menang dan fotonya
      // berubah mengikuti urutan data, bukan pilihan yang stabil.
      if (!existing.photoUrl) existing.photoUrl = wo.variationPhotoUrl ?? null;
      existing.workOrders.push(wo);
    } else {
      map.set(note, {
        productNote: note,
        clientProductionCode: wo.clientProductionCode ?? null,
        product: wo.product,
        brand: wo.brand,
        totalQty: qty,
        status: wo.derivedStatus,
        workOrders: [wo],
        photoUrl: wo.variationPhotoUrl ?? null,
      });
    }
  }
  return Array.from(map.values()).map((group) => ({
    ...group,
    photoUrl: group.photoUrl ?? group.workOrders.find((wo) => wo.productPhotoUrl)?.productPhotoUrl ?? null,
  }));
}

/**
 * Status turunan untuk sekumpulan Work Order pada satu kode produksi —
 * dipakai jalur yang tidak perlu membentuk kartu penuh.
 */
export function groupStatus(workOrders: KanbanWorkOrder[]): ProductionStatus | null {
  if (workOrders.length === 0) return null;
  let lowest = workOrders[0].derivedStatus;
  for (const wo of workOrders) {
    if (rank(wo.derivedStatus) < rank(lowest)) lowest = wo.derivedStatus;
  }
  return lowest;
}

/** Status turunan satu Work Order — re-export agar konsumen Kanban satu pintu. */
export { deriveStatus };
