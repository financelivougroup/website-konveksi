// ===== Kategori Biaya: logika murni =====
// Tidak fetch, tidak mengimpor Supabase, tidak menulis apa pun — sama seperti
// src/lib/kanban.ts dan src/lib/invoiceGrouping.ts, supaya aturan hierarki bisa
// dikunci tes tanpa merender halaman.
//
// ATURAN (permintaan user): pilihan tiap tingkat harus bergantung pada tingkat
// di atasnya —
//   Type -> Main Category -> Sub Category -> Item
// dan pilihan yang tidak berhubungan dengan tingkat sebelumnya TIDAK BOLEH
// muncul. Aturan itu ditegakkan di database lewat trigger; di sini ia ditegakkan
// saat MENYUSUN opsi dropdown, sehingga pilihan salah tidak pernah bisa dipilih.

export type CategoryLevel = 'type' | 'main' | 'sub' | 'item';

/**
 * Urutan tingkat dari atas ke bawah.
 *
 * Dipakai untuk menurunkan tingkat anak dan untuk memangkas pilihan di bawah
 * satu titik. Disimpan sebagai satu sumber urutan supaya tidak ada daftar
 * terpisah yang bisa lupa disinkronkan saat tingkat berubah.
 */
export const LEVEL_ORDER: CategoryLevel[] = ['type', 'main', 'sub', 'item'];

export interface ExpenseCategory {
  id: number;
  level: CategoryLevel;
  parentId: number | null;
  name: string;
  /** Urutan tampil sesuai keinginan user; diambil dari kolom `sort_order`. */
  sortOrder: number;
  isActive: boolean;
}

/** Tingkat anak langsung dari sebuah tingkat; `null` bila tidak punya anak. */
export function childLevel(level: CategoryLevel): CategoryLevel | null {
  const index = LEVEL_ORDER.indexOf(level);
  return index >= 0 && index < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[index + 1] : null;
}

export interface ChildrenOptions {
  /**
   * Ikutkan kategori non-aktif.
   *
   * Default `false` karena dropdown untuk MEMILIH kategori baru hanya boleh
   * berisi yang aktif — kategori non-aktif sengaja disembunyikan agar tidak
   * terpilih lagi. Halaman pengelola menampilkan semuanya lewat `true`.
   */
  includeInactive?: boolean;
}

/**
 * Anak langsung dari sebuah induk — inti ketentuan "jangan tampilkan pilihan
 * yang tidak berhubungan".
 *
 * Hanya anak LANGSUNG (bukan cucu), dan hanya yang tingkatnya tepat satu di
 * bawah induk. Jadi memilih Main Category 'MOBILITY' tidak akan pernah
 * memunculkan item 'Benang' yang berada di bawah SEWING.
 */
export function childrenOf(
  rows: readonly ExpenseCategory[],
  parentId: number | null,
  options: ChildrenOptions = {},
): ExpenseCategory[] {
  const includeInactive = options.includeInactive ?? false;

  return rows
    .filter((row) => {
      if (row.parentId !== parentId) return false;
      if (!includeInactive && !row.isActive) return false;
      // Induk NULL hanya untuk tingkat teratas.
      if (parentId === null) return row.level === 'type';
      return true;
    })
    .sort(compareCategories);
}

/** Penyusun pohon, dipakai halaman pengelola untuk menampilkan hierarki. */
export interface CategoryNode extends ExpenseCategory {
  children: CategoryNode[];
}

export function buildCategoryTree(
  rows: readonly ExpenseCategory[],
  options: ChildrenOptions = {},
): CategoryNode[] {
  const build = (parentId: number | null): CategoryNode[] =>
    childrenOf(rows, parentId, options).map((row) => ({
      ...row,
      children: build(row.id),
    }));

  return build(null);
}

/**
 * Jalur lengkap sebuah kategori, mis. `EXPENSE › MOBILITY › DELIVERY › Delivery
 * Equipment`.
 *
 * Ini identitas SEBENARNYA sebuah kategori. Nama Item tidak unik — 'Visit
 * Offline Purchase' ada di TRANSPORTATION dan MEALS sekaligus, 'Support Tools'
 * dan 'Mesin' ada di SEWING dan CUTTING — jadi nama saja tidak cukup untuk
 * menyebut satu kategori. Mengembalikan string kosong bila id tidak ditemukan.
 */
export function pathOf(
  rows: readonly ExpenseCategory[],
  id: number,
  separator = ' › ',
): string {
  const parts: string[] = [];
  const seen = new Set<number>();

  let current = rows.find((row) => row.id === id);
  while (current) {
    // Penjaga lingkaran: data yang salah tidak boleh membuat ini menggantung.
    if (seen.has(current.id)) break;
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parentId === null
      ? undefined
      : rows.find((row) => row.id === current!.parentId);
  }

  return parts.join(separator);
}

/**
 * Apakah kombinasi tingkat + induk sah.
 *
 * Mengembalikan pesan alasan (siap tampil) bila tidak sah, atau `null` bila
 * sah. Cerminan trigger database, tetapi dipakai UI untuk mencegah user
 * menekan Simpan pada kombinasi yang pasti akan ditolak.
 */
export function validatePlacement(
  rows: readonly ExpenseCategory[],
  input: { level: CategoryLevel; parentId: number | null },
): string | null {
  if (input.level === 'type') {
    return input.parentId === null
      ? null
      : 'Type tidak boleh punya Main Category induk.';
  }

  if (input.parentId === null) {
    return 'Main Category harus punya Type induk.';
  }

  const parent = rows.find((row) => row.id === input.parentId);
  if (!parent) return 'Kategori induk tidak ditemukan.';

  const expected = LEVEL_ORDER[LEVEL_ORDER.indexOf(input.level) - 1];
  if (parent.level !== expected) {
    return `Induk yang dipilih bukan tingkat ${levelLabel(expected)}.`;
  }

  return null;
}

/**
 * Apakah nama baru bentrok dengan kategori lain DI DALAM INDUK YANG SAMA.
 *
 * Sengaja hanya sebatas induk yang sama: nama yang sama di induk berbeda itu
 * SAH dan memang dipakai user ('Visit Offline Purchase' di TRANSPORTATION dan
 * MEALS, 'Mesin' di SEWING dan CUTTING). Pemeriksaan ini tidak peka huruf besar
 * dan mengabaikan spasi di pinggir, sama seperti indeks unik di database.
 *
 * `excludeId` dipakai saat mengganti nama, supaya baris itu tidak dianggap
 * bentrok dengan dirinya sendiri.
 */
export function findDuplicateName(
  rows: readonly ExpenseCategory[],
  input: { name: string; parentId: number | null; excludeId?: number },
): ExpenseCategory | null {
  const target = normalizeName(input.name);
  if (!target) return null;

  return (
    rows.find(
      (row) =>
        row.id !== input.excludeId &&
        row.parentId === input.parentId &&
        normalizeName(row.name) === target,
    ) ?? null
  );
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Kategori diurutkan menurut `sort_order` dari database — inilah urutan yang
 * ditentukan user saat seed (mis. SEWING sebelum CUTTING sebelum FINISHING,
 * dan item SEWING berurutan Mesin, Lampu, Sepatu Jahit, …). Nama dipakai
 * sebagai tie-break agar urutannya stabil saat `sort_order` sama.
 */
function compareCategories(a: ExpenseCategory, b: ExpenseCategory): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

export function levelLabel(level: CategoryLevel): string {
  switch (level) {
    case 'type': return 'Type';
    case 'main': return 'Main Category';
    case 'sub': return 'Sub Category';
    case 'item': return 'Item';
  }
}
