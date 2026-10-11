import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

import { AddClientDialog } from '@/components/Modals/AddClientDialog';
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
import * as registerClientSvc from '@/services/registerClient';
import type { RegisterClientRow } from '@/services/registerClient';

interface ClientComboboxProps {
  /** Nama client yang sedang dipilih — itulah nilai yang dikirim ke RPC. */
  value: string;
  onChange: (namaClient: string) => void;
  /** Kunci disabled: field ini tidak boleh diubah (mode view atau struktur terkunci). */
  disabled?: boolean;
  id?: string;
}

/**
 * Dropdown client yang bisa diketik, diambil dari Master Data Register Client.
 *
 * Disusun dari Popover + Command — pola combobox baku shadcn, memakai
 * komponen yang sudah terpasang di src/components/ui/ sehingga tidak ada
 * dependensi baru dan tidak ada komponen yang ditulis dari nol.
 */
export function ClientCombobox({ value, onChange, disabled, id }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [clients, setClients] = useState<RegisterClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Daftar dimuat saat popover pertama kali dibuka, bukan saat komponen
  // dipasang — halaman Order Entry tidak perlu memuat master client sebelum
  // user benar-benar membuka dropdown ini.
  //
  // Pemuatan dipicu dari handler pembukaan, bukan dari efek: perubahan state
  // di dalam efek memicu render cascading, sedangkan penutupan Popover sudah
  // memberi titik panggil yang jelas.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      if (clients.length === 0 && !loading) void loadClients();
    }
  }

  async function loadClients() {
    setLoading(true);
    const { data, error } = await registerClientSvc.fetchAll();
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setClients(data ?? []);
  }

  const activeClients = useMemo(
    () => clients.filter((client) => client.status !== 'Non-Aktif'),
    [clients],
  );

  function handleCreated(client: RegisterClientRow) {
    setClients((current) => [...current, client]);
    setAddOpen(false);
    setOpen(false);
    setQuery('');
    onChange(client.namaClient);
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
              !value && 'text-slate-400',
            )}
          >
            <span className="truncate">{value || 'Pilih client…'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Cari client…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat client…
                </div>
              )}

              {!loading && loadError && (
                <div className="px-3 py-6 text-center text-[12px] text-rose-600">
                  {loadError}
                </div>
              )}

              {!loading && !loadError && activeClients.length === 0 && (
                <CommandEmpty>Belum ada client terdaftar.</CommandEmpty>
              )}

              {!loading && activeClients.length > 0 && (
                <CommandGroup>
                  {activeClients.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.namaClient}
                      onSelect={() => {
                        onChange(client.namaClient);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5',
                          value === client.namaClient ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="text-[13px]">{client.namaClient}</span>
                      <span className="ml-auto text-[11px] text-slate-400">
                        {client.kodeClient}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!loading && !loadError && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__add_new_client__"
                      onSelect={() => setAddOpen(true)}
                      className="text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="text-[13px]">Tambah client baru</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* key=addOpen: dialog di-remount tiap dibuka, jadi formnya selalu
          kosong dan tidak perlu direset lewat efek. */}
      <AddClientDialog
        key={String(addOpen)}
        open={addOpen}
        initialName={query}
        onOpenChange={setAddOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
