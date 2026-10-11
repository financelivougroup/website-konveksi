import { useMemo } from 'react';
import { AppSelect } from '@/components/AppSelect';
import type { SelectOption } from '@/components/selectOptions';
import {
  childrenOf,
  levelLabel,
  type CategoryLevel,
  type ExpenseCategory,
} from '@/lib/expenseCategories';
import type { CategorySelection } from '@/lib/expenseCategorySelection';

interface ExpenseCategoryCascadeProps {
  /** Seluruh baris kategori; komponen ini hanya menyaring, tidak memuat data. */
  rows: readonly ExpenseCategory[];
  value: CategorySelection;
  onChange: (next: CategorySelection) => void;
  /** Nonaktifkan seluruh dropdown (mis. saat menyimpan). */
  disabled?: boolean;
  /** Awalan id elemen, supaya beberapa cascade di satu halaman tidak bentrok. */
  idPrefix?: string;
  /**
   * Sembunyikan dropdown Item.
   *
   * Dipakai halaman pengelola saat menambah kategori baru: user memilih LETAK
   * kategori baru, jadi tingkat yang sedang dibuat tidak boleh ikut dipilih.
   */
  hiddenLevels?: CategoryLevel[];
  className?: string;
}

/**
 * Dropdown bertingkat Type → Main Category → Sub Category → Item.
 *
 * Ketentuan user "jangan tampilkan pilihan yang tidak memiliki hubungan dengan
 * kategori sebelumnya" dipenuhi SECARA STRUKTURAL: opsi setiap tingkat selalu
 * diambil dari `childrenOf(rows, indukTerpilih)`, jadi pilihan tak berhubungan
 * tidak pernah bisa muncul — bukan disaring setelah tampil, melainkan memang
 * tidak pernah dibangun.
 *
 * Mengubah tingkat atas MENGOSONGKAN seluruh tingkat di bawahnya (cascade
 * reset), mengikuti pola yang sudah dipakai ComplainPenaltiPage. Tanpa ini,
 * pilihan lama bisa tertinggal dan menunjuk kategori yang tidak lagi berada di
 * bawah induk yang baru.
 *
 * Komponen ini memakai `AppSelect` yang sudah ada, bukan dropdown baru.
 */
export function ExpenseCategoryCascade({
  rows,
  value,
  onChange,
  disabled = false,
  idPrefix = 'kategori',
  hiddenLevels = [],
  className,
}: ExpenseCategoryCascadeProps) {
  const hide = (level: CategoryLevel) => hiddenLevels.includes(level);

  // Opsi tiap tingkat diturunkan dari induk yang sedang terpilih. Semuanya
  // lewat `childrenOf`, jadi aturan ketergantungan hanya ditulis SEKALI — di
  // modul murni yang sudah diuji — bukan diulang empat kali di sini.
  const typeOptions = useMemo(() => toSelectOptions(childrenOf(rows, null)), [rows]);
  const mainOptions = useMemo(
    () => (value.typeId === null ? [] : toSelectOptions(childrenOf(rows, value.typeId))),
    [rows, value.typeId],
  );
  const subOptions = useMemo(
    () => (value.mainId === null ? [] : toSelectOptions(childrenOf(rows, value.mainId))),
    [rows, value.mainId],
  );
  const itemOptions = useMemo(
    () => (value.subId === null ? [] : toSelectOptions(childrenOf(rows, value.subId))),
    [rows, value.subId],
  );

  // Tingkat yang induknya belum dipilih dinonaktifkan, bukan disembunyikan:
  // tata letaknya tetap sehingga tidak melompat-lompat saat user memilih.
  const mainDisabled = disabled || value.typeId === null;
  const subDisabled = disabled || value.mainId === null;
  const itemDisabled = disabled || value.subId === null;

  const handleType = (raw: string) => {
    const typeId = toId(raw);
    if (typeId === value.typeId) return;
    onChange({ typeId, mainId: null, subId: null, itemId: null });
  };

  const handleMain = (raw: string) => {
    const mainId = toId(raw);
    if (mainId === value.mainId) return;
    onChange({ ...value, mainId, subId: null, itemId: null });
  };

  const handleSub = (raw: string) => {
    const subId = toId(raw);
    if (subId === value.subId) return;
    onChange({ ...value, subId, itemId: null });
  };

  const handleItem = (raw: string) => {
    onChange({ ...value, itemId: toId(raw) });
  };

  return (
    <div className={className ?? 'grid gap-3 sm:grid-cols-2'}>
      {!hide('type') && (
        <AppSelect
          id={`${idPrefix}-type`}
          label={levelLabel('type')}
          value={value.typeId === null ? '' : String(value.typeId)}
          onValueChange={handleType}
          options={typeOptions}
          placeholder="Pilih Type…"
          disabled={disabled}
          required
        />
      )}

      {!hide('main') && (
        <AppSelect
          id={`${idPrefix}-main`}
          label={levelLabel('main')}
          value={value.mainId === null ? '' : String(value.mainId)}
          onValueChange={handleMain}
          options={mainOptions}
          placeholder={mainDisabled ? 'Pilih Type dulu' : 'Pilih Main Category…'}
          disabled={mainDisabled}
          emptyMessage="Type ini belum punya Main Category."
          required
        />
      )}

      {!hide('sub') && (
        <AppSelect
          id={`${idPrefix}-sub`}
          label={levelLabel('sub')}
          value={value.subId === null ? '' : String(value.subId)}
          onValueChange={handleSub}
          options={subOptions}
          placeholder={subDisabled ? 'Pilih Main Category dulu' : 'Pilih Sub Category…'}
          disabled={subDisabled}
          emptyMessage="Main Category ini belum punya Sub Category."
          required
        />
      )}

      {!hide('item') && (
        <AppSelect
          id={`${idPrefix}-item`}
          label={levelLabel('item')}
          value={value.itemId === null ? '' : String(value.itemId)}
          onValueChange={handleItem}
          options={itemOptions}
          // Item opsional: Sub Category seperti SALARY memang tidak punya item.
          placeholder={itemDisabled ? 'Pilih Sub Category dulu' : 'Pilih Item (opsional)…'}
          disabled={itemDisabled}
          emptyMessage="Sub Category ini tidak punya Item."
        />
      )}
    </div>
  );
}

function toSelectOptions(rows: readonly ExpenseCategory[]): SelectOption[] {
  return rows.map((row) => ({ value: String(row.id), label: row.name }));
}

/** `''` (placeholder dikosongkan) dipetakan kembali ke `null`. */
function toId(raw: string): number | null {
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
