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

interface VendorComboboxProps {
  /** Vendor yang sedang dipilih — id-nya yang tersimpan. */
  value: number | null;
  onChange: (vendorId: number | null) => void;
  /** Daftar vendor dari halaman; dipakai sebagai isi awal, lalu disegarkan sendiri. */
  vendors: readonly VendorRow[];
  disabled?: boolean;
  id?: string;
}

/**
 * Dropdown vendor yang bisa diketik, dengan tombol **Tambah vendor baru**.
 *
 * Disusun dari Popover + Command — pola combobox baku shadcn, mengikuti
 * `src/components/OrderEntry/ClientCombobox.tsx` persis. Semua komponennya
 * sudah terpasang, jadi tidak ada dependensi baru dan tidak ada komponen yang
 * ditulis dari nol.
 *
 * Kenapa combobox, bukan `AppSelect` biasa: daftar vendor bisa memanjang, dan
 * menambah vendor dulu di menu Master Data lalu kembali ke form adalah dua
 * perpindahan halaman yang tidak perlu. Di sini vendor baru bisa dibuat tanpa
 * meninggalkan form.
 *
 * Daftarnya dimuat ulang sendiri saat dibuka, bukan hanya memakai prop
 * `vendors`: setelah vendor baru dibuat, halaman belum tentu sudah menyegarkan
 * daftarnya, dan combobox ini harus langsung menampilkannya.
 */
export function VendorCombobox({
  value,
  onChange,
  vendors,
  disabled,
  id,
}: VendorComboboxProps) {
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

  // Pemuatan dipicu dari handler pembukaan, bukan dari efek: perubahan state
  // di dalam efek memicu render cascading (aturan yang sudah berlaku di repo
  // ini), sedangkan pembukaan Popover sudah memberi titik panggil yang jelas.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      if (!loading) void loadVendors();
    }
  }

  // Vendor non-aktif disembunyikan supaya tidak terpilih lagi. Nama yang sudah
  // terpakai di baris lama tetap tampil karena vendor disalin ke baris.
  const active = useMemo(
    () => rows.filter((vendor) => vendor.status !== 'Non-Aktif'),
    [rows],
  );

  const selectedName = rows.find((vendor) => vendor.id === value)?.nama ?? '';

  /** Setelah vendor dibuat, langsung dipilih — itu hampir selalu maksudnya. */
  function handleCreated(vendor: VendorRow) {
    setLocal((current) => {
      const base = current ?? [...vendors];
      return base.some((row) => row.id === vendor.id) ? base : [...base, vendor];
    });
    setAddOpen(false);
    setOpen(false);
    setQuery('');
    onChange(vendor.id);
  }

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
            <span className="truncate">{selectedName || 'Pilih vendor…'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cari vendor…" value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat vendor…
                </div>
              )}

              {!loading && loadError && (
                <div className="px-3 py-6 text-center text-[12px] text-rose-600">{loadError}</div>
              )}

              {!loading && !loadError && active.length === 0 && (
                <CommandEmpty>Belum ada vendor aktif.</CommandEmpty>
              )}

              {!loading && active.length > 0 && (
                <CommandGroup>
                  {active.map((vendor) => (
                    <CommandItem
                      key={vendor.id}
                      value={vendor.nama}
                      onSelect={() => {
                        onChange(vendor.id);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5',
                          value === vendor.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="text-[13px]">{vendor.nama}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
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
