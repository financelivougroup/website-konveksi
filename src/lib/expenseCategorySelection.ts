import { pathOf, type ExpenseCategory } from '@/lib/expenseCategories';

/**
 * Pilihan satu kategori, dari Type sampai Item.
 *
 * Nilainya adalah **id**, bukan nama. Ini bukan pilihan gaya: nama item TIDAK
 * unik — 'Visit Offline Purchase' ada di TRANSPORTATION dan MEALS sekaligus,
 * 'Support Tools' dan 'Mesin' ada di SEWING dan CUTTING. Memakai nama sebagai
 * nilai akan membuat dua kategori berbeda tampak sama.
 *
 * `itemId` boleh null karena Item memang opsional: Sub Category seperti SALARY
 * tidak punya item sama sekali.
 *
 * Dipisah dari `ExpenseCategoryCascade.tsx` mengikuti pola
 * `src/components/selectOptions.ts` — berkas komponen hanya boleh mengekspor
 * komponen agar fast-refresh tetap bekerja
 * (`react-refresh/only-export-components`).
 */
export interface CategorySelection {
  typeId: number | null;
  mainId: number | null;
  subId: number | null;
  itemId: number | null;
}

export const EMPTY_SELECTION: CategorySelection = {
  typeId: null,
  mainId: null,
  subId: null,
  itemId: null,
};

/**
 * Jalur lengkap dari pilihan bertingkat — sedalam apa pun yang sudah dipilih.
 *
 * Berhenti di tingkat terdalam yang terisi, supaya pratinjau tetap berguna saat
 * user baru memilih Type dan belum sampai Sub Category.
 */
export function selectionPath(
  rows: readonly ExpenseCategory[],
  selection: CategorySelection,
): string {
  const deepest = selection.itemId ?? selection.subId ?? selection.mainId ?? selection.typeId;
  return deepest === null ? '' : pathOf(rows, deepest);
}
