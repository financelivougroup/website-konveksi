import { supabase } from '@/lib/supabase';
import { fetchOrderPriceByProductionOrderId } from '@/services/orderPricing';
import {
  billingTypeCode,
  buildInvoiceCode,
} from '@/lib/invoiceCode';
import { resolveClientByBrand } from '@/services/registerClient';
import { formatMonthYear } from '@/lib/monthYear';
import { computeInvoiceFinancials } from '@/lib/invoiceCompute';
import { SAMPLE_PRODUCTION_QTY_THRESHOLD } from '@/lib/autoInvoice';
import {
  checkGroupInvoiceReadiness,
  deriveBillingTypeForGroup,
  type ProductionCodeVariation,
} from '@/lib/invoiceGrouping';
import {
  fetchInvoiceByProductionOrderId,
  fetchMaxSequenceNumber,
  createInvoiceAuto,
} from '@/services/invoices';
import { deriveStatus } from '@/lib/productionStatus';
import type { WorkOrder, InvoiceRow } from '@/types/pipeline';

export interface TransitionResult {
  workOrder: WorkOrder;
  invoiceCreated: boolean;
  invoice?: InvoiceRow;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Muat seluruh variasi (work order) satu order produksi, beserta status & qty.
 *
 * Dipakai untuk memutuskan kelayakan invoice: invoice baru dibuat hanya ketika
 * SEMUA variasi kode produksi itu selesai. Sebelumnya keputusan ini diambil
 * dari satu work order saja, sehingga variasi pertama yang selesai langsung
 * menerbitkan invoice sebagian.
 */
async function loadGroupVariations(productionOrderId: string): Promise<ProductionCodeVariation[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('prod_status, quantity')
    .eq('source_order_id', productionOrderId);
  if (error) throw error;
  return ((data ?? []) as Array<{ prod_status: string; quantity: number }>).map((row) => ({
    status: row.prod_status as ProductionCodeVariation['status'],
    quantity: row.quantity,
  }));
}

/**
 * Total keempat tahap satu Work Order, dihitung dari tabel recordnya
 * masing-masing. Angka hilang/tidak valid dihitung 0.
 *
 * Dibuat sebagai satu tempat supaya aturan status tidak perlu tahu bentuk
 * tabelnya, dan supaya pemanggil tidak mengirim angka yang salah tahap.
 */
export interface WorkOrderTotals {
  cutting: number;
  sewing: number;
  kancing: number;
  finishing: number;
}

export async function loadWorkOrderTotals(workOrderId: string): Promise<WorkOrderTotals> {
  const [cuttingRes, sewingRes, kancingRes, finishingRes] = await Promise.all([
    supabase.from('cutting_records').select('total_cutting').eq('work_order_id', workOrderId),
    supabase.from('sewing_records').select('qty_selesai').eq('work_order_id', workOrderId),
    supabase.from('kancing_records').select('qty_kancing').eq('work_order_id', workOrderId),
    supabase.from('finishing_records').select('qty_finishing').eq('work_order_id', workOrderId),
  ]);
  const firstError = cuttingRes.error ?? sewingRes.error ?? kancingRes.error ?? finishingRes.error;
  if (firstError) throw firstError;

  const sum = (rows: unknown, key: string): number =>
    ((rows ?? []) as Array<Record<string, unknown>>).reduce(
      (total, row) => total + (Number(row[key]) || 0),
      0,
    );

  return {
    cutting: sum(cuttingRes.data, 'total_cutting'),
    sewing: sum(sewingRes.data, 'qty_selesai'),
    kancing: sum(kancingRes.data, 'qty_kancing'),
    finishing: sum(finishingRes.data, 'qty_finishing'),
  };
}

/**
 * Hitung ulang status produksi satu Work Order dari **SELURUH laporannya**
 * (cutting, jahit, kancing, finishing), tulis bila berubah, lalu terbitkan
 * invoice bila WO menjadi FINISHED.
 *
 * ---------------------------------------------------------------------------
 * KENAPA FUNGSI INI ADA (dan menggantikan `transitionToFinishingComplete`)
 * ---------------------------------------------------------------------------
 * Dulu fungsi yang ada di sini bernama `transitionToFinishingComplete` dan
 * **menghardcode** `prod_status = 'FINISHED'`, lalu dipanggil dari
 * `SewingEntryForm` begitu laporan jahit mencapai qty order. Itu benar selama
 * FINISHED hanya butuh cutting + jahit.
 *
 * Setelah revisi user 2026-09-28, **FINISHED menunggu kancing & finishing juga**.
 * Kalau pemicunya tetap di form jahit, rantainya putus: jahit mencapai qty →
 * status tidak boleh FINISHED → dan karena `KancingEntryForm` maupun
 * `FinishingEntryForm` **tidak pernah menyentuh status** (diverifikasi: tidak ada
 * `updateProdStatus` di keduanya), tidak ada lagi yang menaikkan WO ke FINISHED.
 * Akibatnya tidak ada invoice yang pernah terbit — kerusakan diam-diam pada
 * jalur uang.
 *
 * Karena itu pemicunya dipindah ke sini dan dipanggil dari **ketiga** form entri
 * produksi (jahit, kancing, finishing). Satu fungsi memiliki aturan "status
 * diturunkan dari laporan", jadi tidak ada dua tempat yang bisa berbeda.
 *
 * Perilaku lama yang SENGAJA dipertahankan: status baru ditulis setelah harga
 * order dipastikan lengkap. Kalau harga belum lengkap, WO tidak dinaikkan ke
 * FINISHED (tetap PROGRESS) dan errornya dilempar — supaya tidak ada WO yang
 * "selesai" tetapi tidak bisa ditagih.
 */
export async function syncWorkOrderStatus(workOrderId: string): Promise<TransitionResult> {
  // 1. Fetch current WO
  const { data: currentWo, error: woErr } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', workOrderId)
    .single();
  if (woErr || !currentWo) throw woErr ?? new Error('WO not found');

  const wo = currentWo as Record<string, unknown>;
  const poId = (wo.source_order_id as string | null) ?? null;

  // 2. Idempotency — already at FINISHED or INVOICED
  if (wo.prod_status === 'FINISHED' || wo.prod_status === 'INVOICED') {
    return {
      workOrder: wo as unknown as WorkOrder,
      invoiceCreated: false,
    };
  }

  // 3. Status diturunkan dari SELURUH laporan, bukan dari tahap yang baru saja
  //    diisi. Inilah yang membuat form jahit tidak bisa lagi "menyelesaikan"
  //    order yang kancing/finishingnya belum jalan.
  const totals = await loadWorkOrderTotals(workOrderId);
  const qty = Number(wo.quantity) || 0;
  const nextStatus = deriveStatus(
    totals.cutting,
    totals.sewing,
    qty,
    totals.kancing,
    totals.finishing,
  );

  if (nextStatus !== 'FINISHED') {
    if (nextStatus !== wo.prod_status) {
      const { data: updated, error: updErr } = await supabase
        .from('work_orders')
        .update({ prod_status: nextStatus })
        .eq('id', workOrderId)
        .select()
        .single();
      if (updErr || !updated) throw updErr ?? new Error('update failed');
      return { workOrder: updated as unknown as WorkOrder, invoiceCreated: false };
    }
    return { workOrder: wo as unknown as WorkOrder, invoiceCreated: false };
  }

  // 4. FINISHED → harga harus lengkap dulu (perilaku lama, lihat catatan di atas).
  if (!poId) {
    throw new Error('Work Order tidak memiliki sumber Order Entry');
  }
  const orderPrice = await fetchOrderPriceByProductionOrderId(poId);
  if (!orderPrice?.complete || !orderPrice.id || orderPrice.totalPerPiece <= 0) {
    throw new Error('Harga Order Entry belum lengkap');
  }

  // 5. Update prod_status only after pricing is known to be valid.
  const { data: updatedWo, error: updErr } = await supabase
    .from('work_orders')
    .update({ prod_status: 'FINISHED' })
    .eq('id', workOrderId)
    .select()
    .single();
  if (updErr || !updatedWo) throw updErr ?? new Error('update failed');

  const updated = updatedWo as unknown as WorkOrder;

  // 6. Invoice hanya bila SELURUH variasi kode produksi sudah selesai.
  const created = await ensureInvoiceForProductionOrder(poId, updated);
  return {
    workOrder: updated,
    invoiceCreated: created !== null,
    invoice: created ?? undefined,
  };
}

/**
 * Terbitkan invoice untuk satu Kode Produksi Konveksi bila semua variasi
 * selesai dan belum ada invoice-nya. Mengembalikan invoice yang SUDAH ada
 * (bukan null) saat invoice-nya memang sudah terbit — supaya pemanggil tidak
 * salah mengira perlu membuat lagi.
 *
 * Satu invoice mencakup seluruh kode produksi: pcs = jumlah SEMUA variasi,
 * harga satuan = harga per pcs order, jadi totalnya = total kode produksi.
 */
export async function ensureInvoiceForProductionOrder(
  productionOrderId: string,
  fallbackWo?: WorkOrder,
): Promise<InvoiceRow | null> {
  // Sudah ada invoice untuk kode produksi ini? Jangan buat kedua.
  const { data: existing } = await fetchInvoiceByProductionOrderId(productionOrderId);
  if (existing) return existing;

  const variations = await loadGroupVariations(productionOrderId);
  const readiness = checkGroupInvoiceReadiness(variations);
  // Belum siap = belum semua selesai. Ini BUKAN error: pemanggilnya bisa saja
  // baru menyelesaikan satu variasi dari empat.
  if (!readiness.ready) return null;

  const orderPrice = await fetchOrderPriceByProductionOrderId(productionOrderId);
  if (!orderPrice?.complete || !orderPrice.id || orderPrice.totalPerPiece <= 0) return null;

  // Identitas kode produksi + client diambil dari work order mana pun dalam
  // grup: product_note dan client_production_code sama untuk semua variasi.
  let brand: string | null = null;
  let productNote: string | null = null;
  let clientProductionCode: string | null = null;
  let fallbackWorkOrderId: string | null = null;

  if (fallbackWo) {
    brand = fallbackWo.brand;
    productNote = fallbackWo.productNote;
    clientProductionCode = fallbackWo.clientProductionCode;
    fallbackWorkOrderId = fallbackWo.id;
  }

  if (!brand || !productNote || !fallbackWorkOrderId) {
    const { data: rows, error } = await supabase
      .from('work_orders')
      .select('id, brand, product_note, client_production_code')
      .eq('source_order_id', productionOrderId)
      .limit(1);
    if (error) throw error;
    const row = (rows ?? [])[0] as
      | { id: string; brand: string; product_note: string; client_production_code: string | null }
      | undefined;
    if (!row) return null;
    brand = brand ?? row.brand;
    productNote = productNote ?? row.product_note;
    clientProductionCode = clientProductionCode ?? row.client_production_code;
    fallbackWorkOrderId = fallbackWorkOrderId ?? row.id;
  }

  const { data: client, error: clientErr } = await resolveClientByBrand(brand);
  if (clientErr) throw clientErr;
  if (!client) {
    // Gagal cepat: pengguna sedang menunggu invoice, jadi brand yang belum
    // terdaftar harus terlihat, bukan dilewati diam-diam.
    throw new Error(
      `Brand "${brand}" belum terdaftar di Register Client. Tambahkan dulu di menu Contact → tab Client.`,
    );
  }

  const totalPcs = readiness.totalPcs;
  const billingType = deriveBillingTypeForGroup(totalPcs, SAMPLE_PRODUCTION_QTY_THRESHOLD);
  const billingTypeCodeValue = billingTypeCode(billingType);
  const invoiceDate = todayIso();
  const monthYear = formatMonthYear(invoiceDate);

  const { sequence: maxSeq, error: sequenceError } = await fetchMaxSequenceNumber();
  if (sequenceError) throw sequenceError;
  const invoiceCode = buildInvoiceCode({
    billingTypeCodeValue,
    clientCode: client.kodeClient,
    invoiceDate,
    sequence: maxSeq + 1,
  });

  const fin = computeInvoiceFinancials({
    pcsLinked: totalPcs,
    unitPrice: orderPrice.totalPerPiece,
    rateManpower: 0,
  });

  const invoiceInput: Omit<InvoiceRow, 'id' | 'createdAt' | 'updatedAt'> = {
    // `work_order_id` masih NOT NULL + UNIQUE di skema, jadi satu WO dari grup
    // ditunjuk sebagai wakil — bukan karena invoicenya milik WO itu, melainkan
    // karena kolomnya belum bisa dikosongkan tanpa memutus rilisan lama.
    workOrderId: fallbackWorkOrderId,
    productionOrderId,
    orderPriceId: orderPrice.id,
    autoCreated: true,
    // Judul invoice: Kode Produksi Konveksi, dengan kode client sebagai
    // pendamping. Kolom `work_code` dipakai apa adanya (tanpa kolom baru)
    // supaya rilisan lama dan template yang sudah ada tetap bekerja.
    workCode: productNote,
    clientProductionCode,
    invoiceCode,
    invoiceDate,
    monthYear,
    clientName: client.namaClient,
    clientCode: client.kodeClient,
    billingType,
    billingTypeCodeValue,
    pcsLinked: totalPcs,
    unitPrice: orderPrice.totalPerPiece,
    totalAmount: fin.totalAmount,
    rateOperational: fin.rateOperational,
    totalIncomeManpower: fin.totalIncomeManpower,
    totalIncomeOperational: fin.totalIncomeOperational,
    financeValidation: 'Collect Payment',
  };

  const { data: createdInvoice, error: invErr } = await createInvoiceAuto(invoiceInput);
  if (invErr) throw invErr;
  return createdInvoice ?? null;
}

/**
 * Backfill: terbitkan invoice untuk kode produksi yang SEMUA variasinya sudah
 * selesai tetapi belum punya invoice.
 *
 * Bekerja per **order produksi**, bukan per work order: mengulang per work
 * order akan memanggil `ensureInvoice…` berkali-kali untuk kode yang sama.
 */
export async function backfillMissingInvoices(): Promise<number> {
  const { data: finishedRows, error } = await supabase
    .from('work_orders')
    .select('source_order_id')
    .in('prod_status', ['FINISHED', 'INVOICED'])
    .not('source_order_id', 'is', null);
  if (error || !finishedRows) return 0;

  const candidateIds = [
    ...new Set((finishedRows as Array<{ source_order_id: string }>).map((r) => r.source_order_id)),
  ];

  let created = 0;
  for (const poId of candidateIds) {
    try {
      const { data: existing } = await fetchInvoiceByProductionOrderId(poId);
      if (existing) continue;
      const invoice = await ensureInvoiceForProductionOrder(poId);
      if (invoice) created += 1;
    } catch (err) {
      // Satu kode produksi bermasalah tidak boleh menghentikan sisanya.
      console.error('[backfill] gagal untuk', poId, err);
    }
  }
  return created;
}
