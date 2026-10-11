import { useState } from 'react';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FileUploadField } from '@/components/FileUploadField';
import { formatCurrency } from '@/lib/utils';
import type { ExpenseEntry } from '@/lib/expenseEntries';
import * as expenseSvc from '@/services/expenseEntries';

interface AttachReceiptDialogProps {
  open: boolean;
  /** Baris yang notanya diubah; `null` berarti dialog tertutup. */
  entry: ExpenseEntry | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * Unggah / ganti / hapus nota untuk satu catatan biaya — tanpa membuka form
 * penuh, karena mengubah lampiran tidak seharusnya mengharuskan user memeriksa
 * ulang nominal dan kategorinya.
 *
 * Urutannya mengikuti aturan yang sudah ditetapkan repo: **objek Storage
 * dihapus setelah yang baru tersimpan**, dan kegagalan pembersihan tidak
 * menggagalkan penyimpanan — hanya menyisakan berkas yatim, yang jauh lebih
 * ringan daripada kehilangan perubahan user.
 */
export function AttachReceiptDialog({
  open,
  entry,
  onOpenChange,
  onDone,
  onError,
}: AttachReceiptDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  async function handleSave() {
    if (!entry || !file || saving) return;
    setSaving(true);
    setError(null);

    const uploaded = await expenseSvc.uploadProof(entry.id, file);
    if (uploaded.error || !uploaded.path || !uploaded.url) {
      setSaving(false);
      setError(`Nota gagal diunggah: ${uploaded.error?.message ?? 'sebab tidak diketahui'}`);
      return;
    }

    const { error: updateError } = await expenseSvc.update(entry.id, {
      ...entry,
      proofPath: uploaded.path,
      proofUrl: uploaded.url,
    });
    if (updateError) {
      setSaving(false);
      setError(`Nota terunggah, tetapi catatan gagal diperbarui: ${updateError.message}`);
      return;
    }

    // Foto lama dibersihkan setelah yang baru tersimpan.
    if (entry.proofPath) {
      await expenseSvc.removeProofObject(entry.proofPath);
    }

    setSaving(false);
    onDone(`Nota untuk ${formatCurrency(entry.totalPayment)} tersimpan.`);
  }

  async function handleRemove() {
    if (!entry || saving) return;
    if (!entry.proofPath) {
      onError('Catatan ini belum punya nota.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: updateError } = await expenseSvc.update(entry.id, {
      ...entry,
      proofPath: null,
      proofUrl: null,
    });
    if (updateError) {
      setSaving(false);
      setError(`Nota gagal dihapus: ${updateError.message}`);
      return;
    }

    // Baris sudah bersih; kegagalan menghapus berkas tidak boleh menggagalkan
    // operasi — dilaporkan sebagai catatan, bukan error yang membatalkan.
    const removed = await expenseSvc.removeProofObject(entry.proofPath);
    setSaving(false);
    if (removed.error) {
      onDone('Nota dilepas dari catatan, tetapi berkasnya gagal dihapus dari penyimpanan.');
      return;
    }
    onDone(`Nota dilepas dari catatan ${formatCurrency(entry.totalPayment)}.`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Nota — {formatCurrency(entry.totalPayment)}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {entry.categoryPath}
            {entry.vendorName ? ` · ${entry.vendorName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          {entry.proofUrl && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Nota tersimpan</Label>
              <div className="flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
                <img src={entry.proofUrl} alt="Nota tersimpan" className="h-14 w-14 rounded-md object-cover" />
                <a
                  href={entry.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka di tab baru
                </a>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[12px]">
              {entry.proofUrl ? 'Ganti dengan foto baru' : 'Unggah foto nota'}
            </Label>
            <FileUploadField id="attach-receipt-file" onChange={setFile} disabled={saving} />
          </div>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {entry.proofUrl && (
              <Button
                type="button"
                variant="outline"
                className="h-8 text-[12px] text-rose-600 hover:text-rose-700"
                onClick={() => void handleRemove()}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5" /> Lepas nota
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Tutup
            </Button>
            <Button
              type="button"
              className="h-8 text-[12px]"
              onClick={() => void handleSave()}
              disabled={!file || saving}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan nota
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
