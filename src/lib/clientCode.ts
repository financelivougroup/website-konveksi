/**
 * Pencocokan brand Work Order ke master Register Client.
 *
 * Sengaja murni (tanpa impor apa pun) supaya bisa diuji langsung oleh
 * `tests/clientCode.test.ts` tanpa Supabase dan tanpa alias path.
 */

export interface ClientCodeCandidate {
  namaClient: string;
  kodeClient: string;
}

export interface ResolvedClient {
  namaClient: string;
  kodeClient: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Cari client berdasarkan nama brand Work Order.
 *
 * Pencocokan case-insensitive dan mengabaikan spasi di pinggir, sama dengan
 * unique index `lower(btrim(nama_client))` di database, sehingga hasilnya
 * konsisten dengan apa yang ditolak saat menyimpan data kembar.
 *
 * Bila (secara defensif) lebih dari satu baris cocok, baris pertama yang
 * dikembalikan — pemanggil sudah mengurutkan berdasarkan id.
 *
 * @returns client yang cocok, atau `null` bila tidak terdaftar.
 */
export function findClientByBrand(
  brand: string,
  clients: readonly ClientCodeCandidate[],
): ResolvedClient | null {
  const target = normalize(brand);
  if (!target) return null;

  for (const client of clients) {
    if (normalize(client.namaClient) === target) {
      return { namaClient: client.namaClient, kodeClient: client.kodeClient };
    }
  }
  return null;
}

/** Seberapa banyak sebuah client sudah dipakai, untuk peringatan sebelum hapus. */
export interface ClientUsage {
  namaClient: string;
  /** Work Order dengan brand ini yang belum memiliki invoice. */
  activeWorkOrders: number;
  /** Invoice lama yang menyimpan nama client ini sebagai snapshot. */
  invoices: number;
}

/**
 * Hitung pemakaian tiap client.
 *
 * Work Order dianggap aktif untuk kebutuhan ini bila belum memiliki invoice;
 * hanya WO tersebut yang masih membutuhkan Register Client saat invoice dibuat.
 * Memakai pencocokan nama yang sama dengan `findClientByBrand`, sehingga angka
 * peringatan konsisten dengan client yang benar-benar ter-resolve.
 */
export function tallyClientUsage(
  clients: readonly { namaClient: string }[],
  workOrders: readonly { id: string; brand?: string | null }[],
  invoices: readonly { workOrderId: string; clientName?: string | null }[],
): ClientUsage[] {
  const invoicedWorkOrderIds = new Set(invoices.map((invoice) => invoice.workOrderId));

  return clients.map((client) => {
    const target = normalize(client.namaClient);
    let activeWorkOrders = 0;
    let invoicesCount = 0;

    if (target) {
      for (const wo of workOrders) {
        if (!invoicedWorkOrderIds.has(wo.id) && normalize(wo.brand ?? '') === target) {
          activeWorkOrders++;
        }
      }
      for (const inv of invoices) {
        if (normalize(inv.clientName ?? '') === target) invoicesCount++;
      }
    }

    return { namaClient: client.namaClient, activeWorkOrders, invoices: invoicesCount };
  });
}
