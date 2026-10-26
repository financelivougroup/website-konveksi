import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AppSelect } from '@/components/AppSelect';
import { DatePickerField } from '@/components/DatePickerField';
import { NumberField } from '@/components/NumberField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toOptions } from '@/components/selectOptions';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as kancingRecordSvc from '@/services/kancingRecords';
import * as finishingRecordSvc from '@/services/finishingRecords';
import type { LaporanKind, LaporanRow } from '@/lib/laporanCompute';

/**
 * Dialog ubah satu baris log produksi (Sewing / Kancing / Finishing).
 *
 * Kenapa komponen baru, bukan salah satu dialog yang sudah ada: isi formulirnya
 * bergantung pada jenis log (label PIC berbeda — Penjahit / Pemasang /
 * Finisher — dan kolom qty-nya `qty_selesai` / `qty_kancing` / `qty_finishing`),
 * sedangkan `AddClientDialog`, `AddVendorDialog`, dan `ExpenseDialog` semuanya
 * terikat pada tabelnya masing-masing. Yang dipakai ulang adalah seluruh
 * primitifnya: `Dialog` + `Label`/`Field` shadcn, dan komponen field rumah
 * (`AppSelect`, `NumberField`, `DatePickerField`) — persis kontrol yang dipakai
 * form entry-nya, jadi tanggal dan qty tidak bisa berbeda perilaku antara
 * "input di awal" dan "mengubah".
 *
 * Siapa yang boleh membuka dialog ini ditentukan di luar: halaman hanya
 * memasang aksinya bila `canEditProductionLog(profile.role)` benar
 * (`src/lib/permissions.ts`), dan policy RLS di database menegakkan aturan yang
 * sama. Dialog ini sendiri tidak memeriksa role — ia tidak pernah dirender
 * untuk yang tidak berhak.
 *
 * Kolom yang bisa diubah sengaja terbatas pada jumlah, tanggal, dan PIC. Kode
 * produksi (work order) tidak bisa dipindah dari sini; lihat komentar
 * `SewingRecordUpdate` di `src/services/sewingRecords.ts`.
 */

interface LogEntryDialogProps {
  open: boolean;
  /** Jenis log — menentukan label PIC dan service yang dipanggil. */
  kind: LaporanKind;
  /** Baris yang sedang diubah. `null` menutup dialog. */
  row: LaporanRow | null;
  /** Pilihan nama PIC untuk dropdown. */
  picOptions: string[];
  /** Header kolom PIC: Penjahit / Pemasang / Finisher. */
  picLabel: string;
  onOpenChange: (open: boolean) => void;
  /**
   * Dipanggil setelah database benar-benar berubah. Halaman memakainya untuk
   * memuat ulang catatan log — dialog tidak menyentuh state halaman sendiri,
   * supaya satu perubahan tidak ditulis dua kali dengan cara berbeda.
   */
  onSaved?: () => void;
}

/** Nilai awal formulir — dipisah agar `useState` bisa memakainya sebagai initializer. */
function formFromRow(row: LaporanRow) {
  return { pic: row.pic, qty: String(row.qty), tanggal: row.tanggal };
}

export function LogEntryDialog({
  open,
  kind,
  row,
  picOptions,
  picLabel,
  onOpenChange,
  onSaved,
}: LogEntryDialogProps) {
  const [form, setForm] = useState(() =>
    row ? formFromRow(row) : { pic: '', qty: '', tanggal: '' },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericQty = Number(form.qty);
  const isQtyValid =
    form.qty.trim() !== '' &&
    Number.isFinite(numericQty) &&
    Number.isInteger(numericQty) &&
    numericQty > 0;
  const isFormValid = Boolean(form.pic.trim() && isQtyValid && form.tanggal);

  async function handleSave() {
    if (!row || !isFormValid || saving) return;
    setSaving(true);
    setError(null);

    const qty = Number(form.qty);
    // Service per jenis log, dipanggil dengan kolom yang sama artinya.
    const result =
      kind === 'jahit'
        ? await sewingRecordSvc.update(row.id, {
            picPenjahit: form.pic,
            qtySelesai: qty,
            tanggalLaporan: form.tanggal,
          })
        : kind === 'kancing'
          ? await kancingRecordSvc.update(row.id, {
              picKancing: form.pic,
              qtyKancing: qty,
              tanggalLaporan: form.tanggal,
            })
          : await finishingRecordSvc.update(row.id, {
              picFinishing: form.pic,
              qtyFinishing: qty,
              tanggalImport: form.tanggal,
            });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    onSaved?.();
    onOpenChange(false);
  }

  const title =
    kind === 'jahit' ? 'Sewing' : kind === 'kancing' ? 'Pasang Kancing' : 'Finishing';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Ubah Catatan {title}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Kode produksi tidak ikut berubah — hanya jumlah, tanggal, dan nama
            PIC yang bisa diperbaiki di sini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          {/* Konteks baris, read-only: user perlu tahu baris mana yang diubah
              tanpa harus menutup dialog untuk melihatnya di tabel. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
            <div className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1">
              <span className="text-slate-500">Produk:</span>
              <span className="font-medium text-slate-700">{row?.produk || '—'}</span>
              <span className="text-slate-500">Warna / Size:</span>
              <span className="text-slate-700">
                {row?.warna || '—'} / {row?.size || '—'}
              </span>
            </div>
          </div>

          <Field className="gap-1.5">
            <FieldLabel
              htmlFor="log-entry-pic-trigger"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {picLabel}
            </FieldLabel>
            <AppSelect
              bare
              id="log-entry-pic"
              required
              triggerClassName="h-9 text-[12px]"
              value={form.pic}
              onValueChange={(value) => setForm((f) => ({ ...f, pic: value }))}
              placeholder={`— Pilih ${picLabel} —`}
              options={toOptions(picOptions)}
            />
          </Field>

          <Field className="gap-1.5" data-invalid={form.qty !== '' && !isQtyValid}>
            <FieldLabel
              htmlFor="log-entry-qty"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              Jumlah (pcs)
            </FieldLabel>
            <NumberField
              id="log-entry-qty"
              value={form.qty}
              onChange={(value) => setForm((f) => ({ ...f, qty: value }))}
              min={1}
              placeholder="Contoh: 30"
            />
            {form.qty !== '' && !isQtyValid && (
              <FieldDescription className="text-[10px] text-destructive">
                Jumlah harus berupa bilangan bulat positif.
              </FieldDescription>
            )}
          </Field>

          <Field className="gap-1.5">
            <FieldLabel
              htmlFor="log-entry-tanggal"
              className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              Tanggal Laporan
            </FieldLabel>
            <DatePickerField
              id="log-entry-tanggal"
              value={form.tanggal}
              onChange={(value) => setForm((f) => ({ ...f, tanggal: value }))}
              maxDate={new Date()}
            />
          </Field>

          {row?.bukti && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Bukti Barang
              </span>
              <Input value={row.bukti} readOnly className="h-9 bg-slate-50 text-[12px]" />
              <p className="text-[10px] text-slate-400">
                Berkas bukti tidak bisa diganti dari sini.
              </p>
            </div>
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
            disabled={!isFormValid || saving}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
