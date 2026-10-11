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
import { isValidClientCode } from '@/lib/clientCode';
import {
  STATUS_OPTIONS,
  create as createClient,
  update as updateClient,
} from '@/services/registerClient';
import type { RegisterClientRow } from '@/services/registerClient';

interface AddClientDialogProps {
  open: boolean;
  /** Nama yang sudah diketik di combobox, dipakai sebagai nilai awal. */
  initialName?: string;
  /**
   * Baris yang diedit. Bila diisi, dialog berubah jadi mode edit: field
   * terisi dari baris ini dan tombol simpan memanggil `update()`.
   *
   * Opsional supaya pemanggil lama (ClientCombobox di Order Entry) yang
   * hanya membuat client baru tidak perlu diubah.
   */
  initial?: RegisterClientRow | null;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah client tersimpan, dengan baris hasil simpan. */
  onCreated?: (client: RegisterClientRow) => void;
  /** Sama seperti `onCreated`, tetapi netral terhadap tambah dan edit. */
  onSaved?: (client: RegisterClientRow) => void;
}

interface FormState {
  namaClient: string;
  kodeClient: string;
  status: string;
  noHp: string;
  alamat: string;
}

const EMPTY_FORM: FormState = {
  namaClient: '',
  kodeClient: '',
  status: 'Aktif',
  noHp: '',
  alamat: '',
};

function formFromClient(client: RegisterClientRow): FormState {
  return {
    namaClient: client.namaClient,
    kodeClient: client.kodeClient,
    status: client.status ?? 'Aktif',
    noHp: client.noHp ?? '',
    alamat: client.alamat ?? '',
  };
}

/** Kode 23505 = unique_violation, dari index unik nama_client maupun kode_client. */
function friendlyError(error: Error): string {
  if (error.message.includes('23505') || error.message.includes('duplicate key')) {
    const lower = error.message.toLowerCase();
    if (lower.includes('nama_client')) return 'Nama client sudah terdaftar.';
    if (lower.includes('kode_client')) return 'Kode client sudah dipakai client lain.';
    return 'Client ini sudah terdaftar.';
  }
  return error.message;
}

export function AddClientDialog({
  open,
  initialName = '',
  initial = null,
  onOpenChange,
  onCreated,
  onSaved,
}: AddClientDialogProps) {
  // Form dikosongkan setiap kali dialog dibuka supaya tidak membawa sisa
  // percobaan sebelumnya; nama awal diambil dari apa yang sudah diketik user.
  // Dipasang sebagai nilai awal state, bukan efek: `key={addOpen}` di
  // ClientCombobox me-remount komponen ini tiap dialog dibuka, jadi nilai
  // awalnya terhitung ulang tanpa render cascading setelahnya.
  //
  // Mode edit mengisi dari `initial` dengan cara yang sama — pemanggil
  // (RegisterClientPage) juga me-remount lewat `key`.
  const [form, setForm] = useState<FormState>(() =>
    initial ? formFromClient(initial) : { ...EMPTY_FORM, namaClient: initialName },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = initial !== null;
  const normalizedCode = form.kodeClient.trim().toUpperCase();
  const isValid = form.namaClient.trim() !== '' && isValidClientCode(normalizedCode);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    // String kosong disimpan sebagai NULL, bukan ''. Service sudah melakukan
    // hal yang sama, tetapi dilakukan di sini juga supaya nilai yang
    // dikirimkan sudah bersih sejak awal.
    const payload = {
      namaClient: form.namaClient.trim(),
      kodeClient: normalizedCode,
      status: form.status,
      noHp: form.noHp.trim() || null,
      alamat: form.alamat.trim() || null,
    };

    const result = isEdit
      ? await (async () => {
        const { error: updateError } = await updateClient(initial.id, payload);
        if (updateError) return { data: null, error: updateError };
        // update() tidak mengembalikan barisnya, jadi baris dirakit sendiri
        // agar pemanggil bisa menyegarkan tabel tanpa memuat ulang semuanya.
        return { data: { ...initial, ...payload }, error: null };
      })()
      : await createClient(payload);

    setSaving(false);

    if (result.error || !result.data) {
      setError(friendlyError(result.error ?? new Error('Client gagal disimpan.')));
      return;
    }

    onCreated?.(result.data);
    onSaved?.(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {isEdit ? 'Edit Client' : 'Tambah Client Baru'}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Client akan langsung tersimpan di Contact → tab Client dan
            bisa dipakai untuk kode invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="add-client-nama" className="text-[12px]">
              Nama client <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="add-client-nama"
              value={form.namaClient}
              onChange={(event) => setField('namaClient', event.target.value)}
              placeholder="e.g. Livou"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-client-kode" className="text-[12px]">
              Kode client <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="add-client-kode"
              value={form.kodeClient}
              onChange={(event) => setField('kodeClient', event.target.value)}
              placeholder="e.g. LVU"
              maxLength={10}
              className="h-9 text-[13px] uppercase"
            />
            <p className="text-[11px] text-slate-400">
              Huruf/angka saja, otomatis huruf besar. Dipakai pada kode invoice
              (INV/MP/LVU/…).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-client-hp" className="text-[12px]">No HP</Label>
            <Input
              id="add-client-hp"
              value={form.noHp}
              onChange={(event) => setField('noHp', event.target.value)}
              placeholder="e.g. 0812…"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-client-alamat" className="text-[12px]">Alamat</Label>
            <Input
              id="add-client-alamat"
              value={form.alamat}
              onChange={(event) => setField('alamat', event.target.value)}
              placeholder="e.g. Jl. …"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-client-status" className="text-[12px]">Status</Label>
            <Select value={form.status} onValueChange={(value) => setField('status', value)}>
              <SelectTrigger id="add-client-status" className="h-9 text-[13px]">
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
