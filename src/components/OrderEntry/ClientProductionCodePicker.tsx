import { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { findClientByBrand } from '@/lib/clientCode';
import { T_CODE } from '@/lib/tableStyles';
import { cn } from '@/lib/utils';
import {
  CLIENT_ORDER_FIXTURES,
  searchClientOrders,
  type ClientOrderFixture,
} from '@/data/clientProductionCodes';
import * as registerClientSvc from '@/services/registerClient';
import type { RegisterClientRow } from '@/services/registerClient';

interface ClientProductionCodePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Nama client yang sedang dipilih di form. Dipakai untuk mencari kode
   * clientnya lewat Register Client, lalu mengurutkan order milik client itu ke
   * atas. Bukan penyaring keras: user tetap boleh memilih order client lain.
   */
  clientName?: string | null;
  /** Dipanggil dengan Product Note order yang dipilih. */
  onSelect: (productNote: string, order: ClientOrderFixture) => void;
}

/**
 * Dialog "Ambil kode produksi client dari POS client".
 *
 * ---------------------------------------------------------------------------
 * KENAPA DIBANGUN DULU TANPA MEMANGGIL API
 * ---------------------------------------------------------------------------
 * Permintaan user (verbatim): "lalu harus ada tOmbOl buat ambil kde prduksi
 * client yang dari external". Keputusan user saat ditanya: **"UI dulu, API
 * menyusul"** — jadi alur memilih order dibangun sekarang dan datanya masih
 * fixture (`src/data/clientProductionCodes.ts`), sehingga bentuk layarnya bisa
 * dinilai sebelum kredensial API ada.
 *
 * Dua alasan mengapa pemanggilan API memang belum bisa dilakukan, keduanya
 * sudah diverifikasi dan dicatat di `project.md`:
 *   1. Kredensial (api_key + Shop ID) belum ada.
 *   2. `api_key` Pancake dikirim sebagai **query param**, bukan header — kalau
 *      dipanggil dari browser, kuncinya bocor lewat Network tab, log server,
 *      dan Referer. Jadi ia WAJIB lewat proxy server-side (rencana: pg_net +
 *      Supabase Vault), dan proxy itu belum dibangun.
 *
 * ---------------------------------------------------------------------------
 * KENAPA DIALOG, BUKAN COMBOBOX
 * ---------------------------------------------------------------------------
 * `ClientCombobox` sudah memakai Popover + Command untuk daftar pendek yang
 * diketik. Di sini isinya adalah daftar order milik client di sistem lain,
 * dengan kolom qty dan tanggal yang perlu dibandingkan sebelum memilih — jadi
 * bentuknya tabel di dalam dialog (mengikuti `AddClientDialog`), bukan dropdown.
 * Tidak ada komponen registry baru yang dibutuhkan: semuanya disusun dari
 * primitif shadcn yang sudah terpasang (Dialog, Input, Button, Badge,
 * ScrollArea).
 *
 * Tombol "Muat ulang" sengaja **disabled** dan diberi keterangan, bukan
 * disembunyikan: ia menandai dengan jelas di mana pemanggilan API nanti
 * dipasang, tanpa berpura-pura sudah berfungsi.
 */
export function ClientProductionCodePicker({
  open,
  onOpenChange,
  clientName,
  onSelect,
}: ClientProductionCodePickerProps) {
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clients, setClients] = useState<RegisterClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  // Register Client dimuat saat dialog dibuka, bukan saat dipasang — Order Entry
  // tidak perlu memuat master client hanya untuk menampilkan satu tombol.
  //
  // Dipicu dari handler pembukaan, bukan dari efek: perubahan state di dalam
  // efek memicu render cascading. Pola yang sama dipakai `ClientCombobox`.
  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setKeyword('');
      setSelectedId(null);
      if (clients.length === 0 && !loadingClients) void loadClients();
    }
  }

  async function loadClients() {
    setLoadingClients(true);
    const { data } = await registerClientSvc.fetchAll();
    setLoadingClients(false);
    setClients(data ?? []);
  }

  // Nama client di form -> kode clientnya, memakai helper yang sudah ada
  // (`findClientByBrand`) supaya pencocokan nama tidak ditulis dua kali.
  const clientCode = useMemo(
    () => findClientByBrand(clientName ?? '', clients)?.kodeClient?.toUpperCase() ?? null,
    [clientName, clients],
  );

  // Penyaringan murni: pencocokan kata kunci sudah diuji terpisah di
  // `searchClientOrders`, jadi dialog ini tidak menyimpan logika pencariannya
  // sendiri. Saat data berganti dari fixture ke respons API, fungsinya sama.
  const results = useMemo(() => {
    const matched = searchClientOrders(CLIENT_ORDER_FIXTURES, keyword);
    // Order milik client yang sedang dipilih diurutkan ke atas — bukan
    // disembunyikan, karena user tetap boleh memilih kode client lain.
    if (!clientCode) return matched;
    return [...matched].sort((a, b) => {
      const aOwn = a.clientCode === clientCode ? 0 : 1;
      const bOwn = b.clientCode === clientCode ? 0 : 1;
      return aOwn - bOwn;
    });
  }, [keyword, clientCode]);

  const selected = results.find((order) => order.id === selectedId) ?? null;

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected.productNote, selected);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Ambil kode produksi client</DialogTitle>
          <DialogDescription className="text-[12px]">
            Pilih order dari POS client, lalu kode produksinya (Product Note)
            diisikan ke form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Cari kode produksi, nomor order, atau kode client…"
                className={`h-9 pl-8 text-[13px] ${T_CODE}`}
              />
            </div>
            {/* Tempat pemanggilan API nanti. Disabled dengan alasan tertulis
                supaya tidak ada yang mengira tombolnya rusak. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Menyusul setelah kredensial API Pancake POS tersedia"
              className="h-9 shrink-0 text-[12px]"
            >
              {loadingClients ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Muat ulang
            </Button>
          </div>

          {clientCode && (
            <p className="text-[11px] text-slate-500">
              Order milik client <span className="font-semibold">{clientName}</span> ({clientCode})
              ditampilkan lebih dulu.
            </p>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Data di bawah masih <strong>contoh</strong> — sinkronisasi Pancake POS
            belum dibangun, jadi daftar ini belum berasal dari POS client Anda.
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <ScrollArea className="h-[320px]">
              {results.length === 0 ? (
                <div className="flex h-[120px] items-center justify-center text-[12px] text-slate-500">
                  Tidak ada order yang cocok.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {results.map((order) => {
                    const isSelected = order.id === selectedId;
                    return (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(order.id)}
                          onDoubleClick={() => onSelect(order.productNote, order)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                            isSelected ? 'bg-blue-50' : 'hover:bg-slate-50',
                          )}
                        >
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 shrink-0 text-blue-700',
                              isSelected ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] text-slate-800 ${T_CODE}`}>
                              {order.productNote}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {order.displayId}
                              {order.customId ? ` · ${order.customId}` : ''} · {order.insertedAt}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-slate-200 text-[10px] font-normal text-slate-600"
                          >
                            {order.clientCode}
                          </Badge>
                          <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-slate-600">
                            {order.totalQuantity} pcs
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          <p className="text-[11px] text-slate-400">
            Kolom qty berasal dari POS dan belum disimpan ke sistem ini — sinkronisasi
            qty otomatis menyusul, jadi angka itu baru sebagai pembanding saat memilih.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-8 text-[12px]"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="h-8 text-[12px]"
            disabled={!selected}
            onClick={handleConfirm}
          >
            Pakai kode ini
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
