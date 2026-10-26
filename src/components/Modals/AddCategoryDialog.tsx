import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExpenseCategoryCascade } from '@/components/ExpenseCategoryCascade';
import { EMPTY_SELECTION, type CategorySelection } from '@/lib/expenseCategorySelection';
import {
  findDuplicateName,
  levelLabel,
  pathOf,
  validatePlacement,
  type CategoryLevel,
  type ExpenseCategory,
} from '@/lib/expenseCategories';
import { create, rename } from '@/services/expenseCategories';

interface AddCategoryDialogProps {
  open: boolean;
  /** Seluruh kategori; dipakai untuk menyaring opsi dan memeriksa nama kembar. */
  rows: readonly ExpenseCategory[];
  /** Tingkat kategori yang sedang dibuat. */
  level: CategoryLevel;
  /**
   * Baris yang sedang diganti namanya. Bila diisi, dialog jadi mode edit:
   * letaknya dikunci (memindah kategori memang tidak didukung) dan tombol
   * simpan memanggil `rename()`.
   */
  initial?: ExpenseCategory | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (category: ExpenseCategory) => void;
}

/** Id kategori dari pilihan bertingkat, sesuai tingkat induk yang dibutuhkan. */
function parentIdFor(level: CategoryLevel, selection: CategorySelection): number | null {
  switch (level) {
    case 'type': return null;
    case 'main': return selection.typeId;
    case 'sub': return selection.mainId;
    case 'item': return selection.subId;
  }
}

/** Tingkat yang perlu dipilih user = tingkat induk dari kategori yang dibuat. */
function parentLevelOf(level: CategoryLevel): CategoryLevel | null {
  switch (level) {
    case 'type': return null;
    case 'main': return 'type';
    case 'sub': return 'main';
    case 'item': return 'sub';
  }
}

/**
 * Terjemahkan pelanggaran aturan database menjadi kalimat yang bisa ditindaklanjuti.
 *
 * Pesan trigger sengaja berupa kode (`EXPENSE_CATEGORY_LEVEL_MISMATCH`) supaya
 * bisa dicocokkan dengan andal; di sini kode itu menjadi bahasa manusia.
 * `23505` = unique_violation dari indeks nama-per-induk.
 */
function friendlyError(error: Error): string {
  const message = error.message;

  if (message.includes('23505') || message.includes('duplicate key')) {
    return 'Nama ini sudah dipakai di kategori induk yang sama.';
  }
  if (message.includes('EXPENSE_CATEGORY_LEVEL_MISMATCH')) {
    return 'Induk yang dipilih tidak sesuai dengan tingkat kategori ini.';
  }
  if (message.includes('EXPENSE_CATEGORY_MISSING_PARENT')) {
    return 'Kategori ini harus punya induk.';
  }
  if (message.includes('EXPENSE_CATEGORY_TYPE_WITH_PARENT')) {
    return 'Type tidak boleh punya induk.';
  }
  if (message.includes('EXPENSE_CATEGORY_PARENT_NOT_FOUND')) {
    return 'Kategori induk tidak ditemukan. Muat ulang halaman lalu coba lagi.';
  }
  return message;
}

export function AddCategoryDialog({
  open,
  rows,
  level,
  initial = null,
  onOpenChange,
  onSaved,
}: AddCategoryDialogProps) {
  const isEdit = initial !== null;
  const parentLevel = parentLevelOf(level);

  const [selection, setSelection] = useState<CategorySelection>(EMPTY_SELECTION);
  const [name, setName] = useState(() => initial?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentId = isEdit ? initial.parentId : parentIdFor(level, selection);
  const trimmedName = name.trim();

  // Pemeriksaan di klien mencegah user menekan Simpan pada kombinasi yang pasti
  // ditolak database. Aturan sebenarnya tetap milik database (trigger + indeks).
  const placementError = isEdit
    ? null
    : validatePlacement(rows, { level, parentId });
  const duplicate = trimmedName
    ? findDuplicateName(rows, {
      name: trimmedName,
      parentId,
      excludeId: initial?.id,
    })
    : null;

  const isValid = trimmedName !== '' && !placementError && !duplicate;

  // Pratinjau jalur lengkap: mengingatkan user di mana kategori ini akan berada.
  const previewParent = parentId === null ? null : rows.find((row) => row.id === parentId);
  const previewPath = previewParent
    ? `${previewParent.name} › ${trimmedName || '…'}`
    : trimmedName || '…';

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    const result = isEdit
      ? await rename(initial.id, trimmedName)
      : await create({ level, parentId, name: trimmedName });

    setSaving(false);

    if (result.error || !result.data) {
      setError(friendlyError(result.error ?? new Error('Kategori gagal disimpan.')));
      return;
    }

    onSaved(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {isEdit ? `Ganti Nama ${levelLabel(level)}` : `Tambah ${levelLabel(level)}`}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {isEdit
              ? 'Hanya namanya yang bisa diubah. Letak kategori tidak dapat dipindah — bila salah tempat, buat kategori baru lalu nonaktifkan yang lama.'
              : 'Pilih letak kategori di dalam hierarki. Pilihan di bawah otomatis menyesuaikan dengan pilihan di atasnya.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          {/* Mode edit: letak dikunci, ditampilkan sebagai teks supaya jelas
              bahwa ia tidak bisa diubah dari sini. */}
          {isEdit ? (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Letak</Label>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                {pathOf(rows, initial.id)}
              </p>
            </div>
          ) : (
            parentLevel && (
              <ExpenseCategoryCascade
                rows={rows}
                value={selection}
                onChange={setSelection}
                disabled={saving}
                idPrefix="add-category"
                // Tingkat induk saja yang perlu dipilih; tingkat kategori yang
                // sedang dibuat tidak boleh ikut dipilih di sini.
                hiddenLevels={levelsToHide(level)}
              />
            )
          )}

          <div className="space-y-1.5">
            <Label htmlFor="add-category-nama" className="text-[12px]">
              Nama {levelLabel(level)}
            </Label>
            <Input
              id="add-category-nama"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Benang"
              className="h-9 text-[13px]"
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Akan tersimpan di</Label>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                {previewPath}
              </p>
            </div>
          )}

          {duplicate && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Nama <strong>{duplicate.name}</strong> sudah ada di induk yang sama. Nama sama
              boleh dipakai di induk yang berbeda.
            </p>
          )}

          {placementError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {placementError}
            </p>
          )}

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-8 text-[12px]"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="h-8 text-[12px]"
            onClick={() => void handleSave()}
            disabled={!isValid || saving}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tingkat mana saja yang harus disembunyikan di dropdown, agar user hanya
 * memilih tingkat INDUK dari kategori yang sedang dibuat.
 *
 * Mis. membuat 'sub' berarti memilih Type + Main Category saja; 'sub' dan 'item'
 * disembunyikan karena keduanya berada di titik itu atau di bawahnya.
 */
function levelsToHide(level: CategoryLevel): CategoryLevel[] {
  const order: CategoryLevel[] = ['type', 'main', 'sub', 'item'];
  return order.slice(order.indexOf(level));
}
