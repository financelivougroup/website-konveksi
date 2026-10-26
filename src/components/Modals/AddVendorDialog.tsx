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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  STATUS_OPTIONS,
  create as createVendor,
  update as updateVendor,
  type VendorRow,
} from '@/services/vendors';

interface AddVendorDialogProps {
  open: boolean;
  /** Baris yang diedit. Bila diisi, dialog jadi mode edit. */
  initial?: VendorRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (vendor: VendorRow) => void;
}

interface FormState {
  nama: string;
  kontak: string;
  catatan: string;
  status: string;
}

const EMPTY_FORM: FormState = { nama: '', kontak: '', catatan: '', status: 'Aktif' };

function formFromVendor(vendor: VendorRow): FormState {
  return {
    nama: vendor.nama,
    kontak: vendor.kontak ?? '',
    catatan: vendor.catatan ?? '',
    status: vendor.status ?? 'Aktif',
  };
}

/**
 * Terjemahkan pelanggaran aturan database menjadi kalimat yang bisa ditindaklanjuti.
 *
 * `23505` = unique_violation dari indeks nama vendor (case-insensitive setelah
 * trim), jadi "Office Depot" dan "office depot" memang ditolak sebagai duplikat.
 */
function friendlyError(error: Error): string {
  if (error.message.includes('23505') || error.message.includes('duplicate key')) {
    return 'Nama vendor ini sudah terdaftar (huruf besar/kecil diabaikan).';
  }
  return error.message;
}

export function AddVendorDialog({
  open,
  initial = null,
  onOpenChange,
  onSaved,
}: AddVendorDialogProps) {
  const isEdit = initial !== null;

  // Form dikosongkan setiap kali dialog dibuka — pemanggil me-remount lewat
  // `key`, jadi nilai awalnya terhitung ulang tanpa render cascading.
  const [form, setForm] = useState<FormState>(() =>
    initial ? formFromVendor(initial) : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = form.nama.trim() !== '';

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    const payload = {
      nama: form.nama.trim(),
      kontak: form.kontak.trim() || null,
      catatan: form.catatan.trim() || null,
      status: form.status,
    };

    const result = isEdit
      ? await updateVendor(initial.id, payload)
      : await createVendor(payload);

    setSaving(false);

    if (result.error || !result.data) {
      setError(friendlyError(result.error ?? new Error('Vendor gagal disimpan.')));
      return;
    }

    onSaved(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {isEdit ? 'Edit Vendor' : 'Tambah Vendor Baru'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Form data vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="add-vendor-nama" className="text-[12px]">
              Nama vendor
            </Label>
            <Input
              id="add-vendor-nama"
              value={form.nama}
              onChange={(event) => setField('nama', event.target.value)}
              placeholder="e.g. Office Depot"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-vendor-kontak" className="text-[12px]">Kontak</Label>
            <Input
              id="add-vendor-kontak"
              value={form.kontak}
              onChange={(event) => setField('kontak', event.target.value)}
              placeholder="e.g. 0812… atau email"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-vendor-catatan" className="text-[12px]">Catatan</Label>
            <Input
              id="add-vendor-catatan"
              value={form.catatan}
              onChange={(event) => setField('catatan', event.target.value)}
              placeholder="e.g. supplier kain"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-vendor-status" className="text-[12px]">Status</Label>
            <Select value={form.status} onValueChange={(value) => setField('status', value)}>
              <SelectTrigger id="add-vendor-status" className="h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option} className="text-[13px]">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
