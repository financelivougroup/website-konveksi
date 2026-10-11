import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

import { AddVendorDialog } from '@/components/Modals/AddVendorDialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import * as vendorSvc from '@/services/vendors';
import type { VendorRow } from '@/services/vendors';

/**
 * Pihak yang dibayar: vendor untuk pembelian biasa, karyawan untuk gaji.
 *
 * Dibedakan lewat `kind` karena id keduanya berasal dari tabel berbeda dan
 * bisa saja angkanya sama — tanpa penanda ini, vendor id 3 dan karyawan id 3
 * akan tampak sebagai pilihan yang sama.
 */
export interface Payee {
  kind: 'vendor' | 'staff';
  id: number;
}

interface PayeeComboboxProps {
  /** Pihak yang sedang dipilih — `kind` + `id`-nya yang tersimpan. */
  value: Payee | null;
  onChange: (payee: Payee | null) => void;
  /** Daftar vendor dari halaman; dipakai sebagai isi awal, lalu disegarkan sendiri. */
  vendors: readonly VendorRow[];
  /** Karyawan aktif dari Register Karyawan (sudah termasuk id). */
  staffs: readonly { id: number; nama: string }[];
  disabled?: boolean;
  id?: string;
}

/**
 * Dropdown SATU kolom untuk DUA sumber pihak yang dibayar: **Vendor** dan
 * **Karyawan**, dipisah garis.
 *
 * Kenapa komponen baru, bukan memakai yang sudah ada:
 * `VendorCombobox` dan `ClientCombobox` hanya menampilkan SATU entitas plus aksi
 * "Tambah baru". Registry shadcn/ReUI yang terpasang tidak punya combobox
 * dua-entitas (`cascader` adalah drill-down bertingkat — konsep yang berbeda,
 * bukan dua sumber sejajar). Karena itu komponen ini disusun dari primitif
 * shadcn yang SUDAH terpasang — `Popover` + `Command` + `CommandGroup` +
 * `CommandSeparator` — mengikuti `VendorCombobox.tsx` persis. Tidak ada
 * dependensi baru dan tidak ada yang ditulis dari nol.
 *
 * Permintaan user (verbatim):
 *   "saya pengen vendor ini bisa ambil 2 sumber (dari bagian vendor dan karyawan)"
 *
 * Daftar vendor dimuat ulang sendiri saat dibuka (bukan hanya memakai prop
 * `vendors`), mengikuti alasan yang sama dengan `VendorCombobox`: setelah vendor
 * baru dibuat, halaman belum tentu sudah menyegarkan daftarnya.
 */
export function PayeeCombobox({
  value,
  onChange,
  vendors,
  staffs,
  disabled,
  id,
}: PayeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** Salinan lokal — supaya vendor yang baru dibuat langsung muncul. */
  const [local, setLocal] = useState<VendorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const rows = local ?? vendors;

  async function loadVendors() {
    setLoading(true);
    const { data, error } = await vendorSvc.fetchAll();
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setLocal(data ?? []);
  }

  // Pemuatan dipicu dari handler pembukaan, bukan dari efek: perubahan state di
  // dalam efek memicu render cascading (aturan yang sudah berlaku di repo ini),
  // sedangkan pembukaan Popover sudah memberi titik panggil yang jelas.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      if (!loading) void loadVendors();
    }
  }

  // Vendor non-aktif disembunyikan supaya tidak terpilih lagi. Nama yang sudah
  // terpakai di baris lama tetap tampil karena nama pihak disalin ke baris.
  const activeVendors = useMemo(
    () => rows.filter((vendor) => vendor.status !== 'Non-Aktif'),
    [rows],
  );

  const selectedName = useMemo(() => {
    if (!value) return '';
    if (value.kind === 'vendor') {
      return rows.find((vendor) => vendor.id === value.id)?.nama ?? '';
    }
    return staffs.find((staff) => staff.id === value.id)?.nama ?? '';
  }, [value, rows, staffs]);

  /** Setelah vendor dibuat, langsung dipilih — itu hampir selalu maksudnya. */
  function handleCreated(vendor: VendorRow) {
    setLocal((current) => {
      const base = current ?? [...vendors];
      return base.some((row) => row.id === vendor.id) ? base : [...base, vendor];
    });
    setAddOpen(false);
    setOpen(false);
    setQuery('');
    onChange({ kind: 'vendor', id: vendor.id });
  }

  function select(next: Payee) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  const isSelected = (kind: Payee['kind'], payeeId: number) =>
    value?.kind === kind && value.id === payeeId;

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-9 w-full justify-between text-[13px] font-normal',
              !selectedName && 'text-slate-400',
            )}
          >
            <span className="truncate">{selectedName || 'Pilih vendor atau karyawan…'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Cari vendor atau karyawan…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat vendor…
                </div>
              )}

              {!loading && loadError && (
                <div className="px-3 py-6 text-center text-[12px] text-rose-600">{loadError}</div>
              )}

              {!loading && !loadError && activeVendors.length === 0 && staffs.length === 0 && (
                <CommandEmpty>Belum ada vendor aktif atau karyawan.</CommandEmpty>
              )}

              {!loading && activeVendors.length > 0 && (
                <CommandGroup heading="Vendor">
                  {activeVendors.map((vendor) => (
                    <CommandItem
                      key={`vendor-${vendor.id}`}
                      // Nilai pencarian diberi awalan supaya id vendor dan id
                      // karyawan yang angkanya sama tidak dianggap satu item.
                      value={`vendor ${vendor.nama}`}
                      onSelect={() => select({ kind: 'vendor', id: vendor.id })}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5',
                          isSelected('vendor', vendor.id) ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="text-[13px]">{vendor.nama}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!loading && !loadError && staffs.length > 0 && (
                <>
                  {activeVendors.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Karyawan">
                    {staffs.map((staff) => (
                      <CommandItem
                        key={`staff-${staff.id}`}
                        value={`karyawan ${staff.nama}`}
                        onSelect={() => select({ kind: 'staff', id: staff.id })}
                      >
                        <Check
                          className={cn(
                            'h-3.5 w-3.5',
                            isSelected('staff', staff.id) ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="text-[13px]">{staff.nama}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {!loading && !loadError && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__add_new_vendor__"
                      onSelect={() => setAddOpen(true)}
                      className="text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="text-[13px]">Tambah vendor baru</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AddVendorDialog
        key={`add-vendor-${addOpen}`}
        open={addOpen}
        initial={null}
        onOpenChange={setAddOpen}
        onSaved={handleCreated}
      />
    </>
  );
}
