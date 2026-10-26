import type {
  FinishingRecord,
  KancingRecord,
  SewingRecord,
  WorkOrder,
} from '@/types/pipeline';
import type { KanbanGroup } from './kanban.ts';
import { buildLaporanRows, applyLaporanFilters } from './laporanCompute.ts';
import { hariKerjaRentang, tanggalHariIni } from './kpi.ts';
import type { LaporanFilters } from './laporanCompute.ts';
import type { LaporanKind, LaporanRow } from './laporanCompute.ts';

// ===== Panel dashboard log (Sewing / Kancing / Finishing) =====
// Helper murni: tidak fetch, tidak mengimpor Supabase, tidak menulis data —
// sama seperti src/lib/laporanCompute.ts dan src/lib/kanban.ts, supaya aturan
// di sini bisa diuji tanpa merender halaman.

/** Tab log yang punya panel dashboard dua-kolom. */
export type LogTab = 'sewing' | 'kancing' | 'finishing';

export interface LogTarget { id:number; nama:string; bulan_tahun:string; target_monthly:number }
export interface LogCardMetrics {
  target:number|null; percent:number|null; remaining:number|null; extra:number|null;
  average:number|null; workdays:number; from:string|null; to:string|null;
  excludedDates:number; missingPeople:number; cumulative:boolean;
}
function validLogDate(value:string):boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split('-').map(Number);
  const date=new Date(y,m-1,d);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}
/** Targets are full person/month goals; product/code only narrow actual output. */
export function logCardMetrics(scopedRows:LaporanRow[],filters:LaporanFilters,targets:readonly LogTarget[],holidays:readonly string[],today:Date):LogCardMetrics {
  const now=tanggalHariIni(today);
  const rows=applyLaporanFilters(scopedRows,filters);
  const actual=rows.reduce((sum,row)=>sum+(Number(row.qty)||0),0);
  const targetRows=targets.filter(t=>(!filters.pic||t.nama===filters.pic)&&(/^\d{4}-(0[1-9]|1[0-2])$/.test(t.bulan_tahun))&&(filters.bulan?t.bulan_tahun===filters.bulan:t.bulan_tahun<=now.slice(0,7)));
  const unique=new Map(targetRows.map(t=>[t.id,t]));
  const values=[...unique.values()];
  const target=values.length&&values.every(t=>t.target_monthly!=null&&Number.isFinite(Number(t.target_monthly))&&Number(t.target_monthly)>=0)
    ?values.reduce((sum,t)=>sum+Number(t.target_monthly),0):null;
  const scopePeople=new Set(rows.map(row=>row.pic).filter(Boolean));
  const missingPeople=[...scopePeople].filter(name=>!targetRows.some(t=>t.nama===name)).length;
  let from:string|null=null;let to:string|null=null;
  if (filters.bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(filters.bulan) && filters.bulan<=now.slice(0,7)) {
    from=filters.bulan+'-01';
    const [y,m]=filters.bulan.split('-').map(Number);
    to=filters.bulan===now.slice(0,7)?now:filters.bulan+'-'+new Date(y,m,0).getDate();
  } else if (!filters.bulan) {
    const scopedForAverage=applyLaporanFilters(scopedRows,{...filters,bulan:''});
    from=scopedForAverage.map(r=>r.tanggal).filter(d=>validLogDate(d)&&d<=now).sort()[0]??null;
    to=from?now:null;
  }
  const dated=rows.filter(row=>validLogDate(row.tanggal)&&from&&to&&row.tanggal>=from&&row.tanggal<=to);
  const workdays=from&&to?hariKerjaRentang(from,to,holidays):0;
  return {target,percent:target!==null&&target>0?actual/target*100:null,remaining:target===null?null:Math.max(0,target-actual),extra:target===null?null:Math.max(0,actual-target),average:workdays>0?dated.reduce((s,r)=>s+(Number(r.qty)||0),0)/workdays:null,workdays,from,to,excludedDates:rows.length-dated.length,missingPeople,cumulative:!filters.bulan};
}

/**
 * Peta tab → jenis laporan.
 *
 * Sengaja eksplisit, bukan pencocokan nama: union `LaporanKind` memakai
 * `'jahit'` sedangkan tab-nya bernama `'sewing'`, jadi mencocokkan keduanya
 * secara langsung akan gagal untuk tab sewing tanpa error tipe.
 */
export const LAPORAN_KIND_BY_TAB: Record<LogTab, LaporanKind> = {
  sewing: 'jahit',
  kancing: 'kancing',
  finishing: 'finishing',
};

/**
 * Kontrak minimal yang dibutuhkan kedua helper di bawah: baris apa pun yang
 * tahu work order miliknya dan berapa qty-nya.
 *
 * Sengaja struktural, bukan `LaporanRow`: halaman punya DUA bentuk baris yang
 * berbeda — `LaporanRow` (`laporanCompute.ts`) untuk tabel laporan, dan
 * `LogRow` untuk tabel log — dan keduanya sah dipakai untuk menghitung qty per
 * kode. Mengunci ke salah satunya memaksa halaman mengonversi bolak-balik
 * hanya demi tipe.
 */
export interface WorkOrderQtyRow {
  workOrderId: string;
  qty: number;
}

/**
 * Saring baris laporan ke satu Kode Produksi Konveksi.
 *
 * `null` berarti tidak ada kode yang dipilih → kembalikan SELURUH baris
 * (dashboard keseluruhan). Kalau ada grup, baris disaring lewat himpunan id
 * work order milik grup itu — cara yang sama dipakai `FullScreenReports` di
 * Production Monitoring, bukan lewat nama produk: dua kode produksi bisa
 * memuat produk yang sama, jadi mencocokkan nama produk akan membocorkan
 * baris kode lain.
 */
export function rowsForGroup<T extends WorkOrderQtyRow>(
  rows: T[],
  group: KanbanGroup | null,
): T[] {
  if (!group) return rows;
  const woIds = new Set(group.workOrders.map((w) => w.id));
  return rows.filter((row) => woIds.has(row.workOrderId));
}

export interface KodeListEntry {
  group: KanbanGroup;
  /** Jumlah qty baris log yang dimiliki kode ini (bukan qty order). */
  rowQty: number;
  /** Jumlah baris log yang dimiliki kode ini. */
  rowCount: number;
}

/**
 * Daftar kode produksi untuk panel kiri — hanya kode yang **punya baris di log
 * ini**, urut menurun berdasarkan qty.
 *
 * Kode yang punya work order tapi belum punya catatan jahit/kancing/finishing
 * sengaja tidak dimunculkan: di dashboard log ia tidak punya apa pun untuk
 * ditampilkan, jadi menampilkannya hanya menambah baris yang selalu kosong.
 * Urut menurun (bukan alfabet) karena pertanyaan yang dibaca di panel ini
 * adalah "kode mana yang paling banyak dikerjakan", bukan "kode mana yang
 * namanya paling awal".
 */
export function buildKodeList(
  groups: KanbanGroup[],
  rows: WorkOrderQtyRow[],
): KodeListEntry[] {
  const qtyByWoId = new Map<string, number>();
  const countByWoId = new Map<string, number>();
  for (const row of rows) {
    qtyByWoId.set(row.workOrderId, (qtyByWoId.get(row.workOrderId) ?? 0) + row.qty);
    countByWoId.set(row.workOrderId, (countByWoId.get(row.workOrderId) ?? 0) + 1);
  }

  const entries: KodeListEntry[] = [];
  for (const group of groups) {
    let rowQty = 0;
    let rowCount = 0;
    for (const wo of group.workOrders) {
      rowQty += qtyByWoId.get(wo.id) ?? 0;
      rowCount += countByWoId.get(wo.id) ?? 0;
    }
    if (rowCount > 0) entries.push({ group, rowQty, rowCount });
  }

  // Urut menurun berdasarkan qty; seri dipecah alfabet pada kode produksi
  // supaya urutannya tidak bergantung urutan Map (stabil antar render).
  return entries.sort(
    (a, b) =>
      b.rowQty - a.rowQty || a.group.productNote.localeCompare(b.group.productNote),
  );
}

// ===== Baris tabel log =====
// Ketiga tabel log di Production Monitoring dulu ditulis tiga kali dengan
// kolom yang sama tapi field sumber berbeda. Dinormalkan di sini supaya
// `LogTable` menjadi komponen bodoh: satu bentuk baris, tanpa percabangan
// per jenis log.

/**
 * Baris tabel log. `tanggal`/`qty`/`pic` sudah berupa teks tampil (tanggal
 * sudah diformat, qty sudah dikonversi ke angka) sehingga tabel tidak perlu
 * tahu field mana yang dibaca untuk tiap jenis log.
 */
export interface LogRow {
  id: string;
  /** Teks tanggal siap tampil; '' berarti tidak ada tanggal. */
  tanggal: string;
  workOrderId: string;
  qty: number;
  pic: string;
  imageName: string;
}

/** Kunci field per jenis log — ikut aturan yang sudah dipakai laporan
 *  (`toDraft` di laporanCompute.ts), termasuk fallback-nya. */
const SEWING_FIELDS = { tanggal: 'tanggalLaporan', qty: 'qtySelesai', pic: 'picPenjahit' } as const;
const KANCING_FIELDS = { tanggal: 'tanggalLaporan', qty: 'qtyKancing', pic: 'picKancing' } as const;
// finishing_records tidak punya `picFinishing` yang selalu terisi: PIC jatuh
// ke `inputBy`, dan tanggal jatuh dari `tanggalImport` ke `syncedAt`.
const FINISHING_FIELDS = { tanggal: 'tanggalImport', qty: 'qtyFinishing', pic: 'picFinishing' } as const;

type AnyRecord = SewingRecord | KancingRecord | FinishingRecord;

function str(record: AnyRecord, key: string): string {
  const value = (record as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Normalkan catatan log menjadi baris tabel, dan saring dengan kata kunci.
 *
 * Pencarian meniru perilaku tab log yang sekarang: selain field milik
 * catatannya sendiri (PIC, nama berkas bukti), ia juga mencari lewat work
 * order terkait — kode konveksi, kode client, produk, warna, size. Tanpa itu,
 * mencari kode produksi yang terlihat di tabel tidak akan menemukan apa pun.
 */
export function buildLogRows(
  tab: LogTab,
  records: AnyRecord[],
  workOrders: WorkOrder[],
  searchQuery: string,
): LogRow[] {
  const fields =
    tab === 'finishing' ? FINISHING_FIELDS : tab === 'kancing' ? KANCING_FIELDS : SEWING_FIELDS;
  const woById = new Map(workOrders.map((w) => [w.id, w]));
  const q = searchQuery.trim().toLowerCase();

  const rows: LogRow[] = [];
  for (const record of records) {
    const wo = woById.get(record.workOrderId);
    const pic = str(record, fields.pic) || (tab === 'finishing' ? str(record, 'inputBy') : '');
    const rawTanggal = str(record, fields.tanggal) || (tab === 'finishing' ? str(record, 'syncedAt') : '');

    if (q) {
      const haystack = [
        str(record, fields.pic),
        str(record, 'inputBy'),
        str(record, 'imageName'),
        wo?.workCode,
        wo?.productNote,
        wo?.clientProductionCode,
        wo?.product,
        wo?.warna,
        wo?.size,
      ];
      if (!haystack.some((value) => value?.toLowerCase().includes(q))) continue;
    }

    // `qty` bisa kosong di data nyata → 0 supaya penjumlahan tidak NaN.
    const qtyValue = (record as unknown as Record<string, unknown>)[fields.qty];
    const qty = Number(qtyValue);

    rows.push({
      id: String((record as unknown as { id: string }).id),
      tanggal: rawTanggal,
      workOrderId: record.workOrderId,
      qty: Number.isFinite(qty) ? qty : 0,
      pic,
      imageName: str(record, 'imageName'),
    });
  }

  // Terbaru di atas. Urutan dihitung di sini (bukan di tabel) supaya
  // pengurutan tetap satu tempat dengan penormalan field tanggalnya.
  return rows.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/** Jumlah seluruh qty baris log — untuk sub-label baris "Semua" di panel kiri. */
export function sumLogQty(rows: LogRow[]): number {
  return rows.reduce((total, row) => total + row.qty, 0);
}

/**
 * Baris laporan untuk satu lingkup kode produksi, SEBELUM slicer dipasang.
 *
 * Satu tempat untuk rantai "bentuk baris → saring ke kode terpilih", supaya
 * panel dashboard (KPI + slicer) dan tabel di bawahnya tidak menghitungnya
 * dengan cara berbeda. Kalau keduanya menyusun rantai sendiri-sendiri, filter
 * bisa mengenai KPI saja dan tidak tabelnya — persis bug yang pernah terjadi.
 */
export function scopedLaporanRows(
  kind: LaporanKind,
  records: AnyRecord[],
  workOrders: WorkOrder[],
  group: KanbanGroup | null,
): LaporanRow[] {
  return rowsForGroup(buildLaporanRows(kind, records, workOrders), group);
}
