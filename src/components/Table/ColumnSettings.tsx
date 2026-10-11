import { useEffect, useRef, useState } from 'react';
import { Columns3, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, T_TOOLBAR_BTN_ACTIVE } from '@/lib/tableStyles';

// ===== Pengaturan kolom: hide/show + freeze, berlaku untuk semua tabel =====
// Hook `useColumnSettings` ada di '@/lib/columnSettings'; file ini hanya
// berisi komponen supaya fast-refresh tetap bekerja.

export interface ColumnOption { key: string; label: string }

// Menyembunyikan kolom pada tabel tangan lewat <colgroup> — pasang sebagai
// anak pertama <table>, urutannya harus sama persis dengan kolom tabel
// (termasuk kolom checkbox). Kolom dengan key di `hidden` jadi display:none.
export function HiddenColgroup({ hidden, cols }: { hidden: Set<string>; cols: string[] }) {
  return (
    <colgroup>
      {cols.map((c, i) => (
        <col key={c + i} style={hidden.has(c) ? { display: 'none' } : undefined} />
      ))}
    </colgroup>
  );
}

export function ColumnSettingsButton({
  fields, hidden, onToggle,
  frozen, onToggleFreeze, onToggleFreezeAll, headerFrozen, onToggleHeaderFrozen,
}: {
  fields: ColumnOption[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  /**
   * Kolom yang dibekukan (menempel di kiri saat digeser horizontal).
   *
   * Seluruh props freeze bersifat OPSIONAL supaya tombol ini tetap bisa dipakai
   * tabel yang belum punya fitur freeze: tanpa handler-nya, baris pin tidak
   * dirender sama sekali — lebih baik tidak ada tombol daripada tombol mati.
   */
  frozen?: Set<string>;
  onToggleFreeze?: (key: string) => void;
  onToggleFreezeAll?: () => void;
  /** Header menempel saat scroll vertikal. Default grid: aktif. */
  headerFrozen?: boolean;
  onToggleHeaderFrozen?: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const hiddenCount = fields.filter((f) => hidden.has(f.key)).length;
  const freezeOn = frozen !== undefined && onToggleFreeze !== undefined;
  const frozenCount = freezeOn ? fields.filter((f) => frozen.has(f.key)).length : 0;
  const visibleCount = fields.length - hiddenCount;
  const allFrozen = freezeOn && visibleCount > 0 && frozenCount === visibleCount;

  // Satu-satunya tempat aturan "beku harus berurutan dari kiri" terlihat oleh
  // user. Tanpa kalimat ini, mencentang kolom ke-5 lalu melihat kolom 1-4 ikut
  // tercentang terbaca seperti bug, padahal itu justru yang menjaga urutan
  // kolom tidak berubah di layar (lihat src/lib/columnFreeze.ts).
  const showOrderHint = freezeOn && frozenCount > 0 && frozenCount < visibleCount;

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen(o => !o)} className={`${T_TOOLBAR_BTN} ${hiddenCount > 0 || frozenCount > 0 ? T_TOOLBAR_BTN_ACTIVE : T_TOOLBAR_BTN_IDLE}`} title="Atur kolom yang tampil & yang dibekukan">
        <Columns3 className="w-3 h-3" /> Kolom{hiddenCount > 0 ? ` (${fields.length - hiddenCount}/${fields.length})` : ''}{frozenCount > 0 ? ` · ${frozenCount} beku` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-[70] w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-slate-600">Tampilkan kolom</p>
            {hiddenCount > 0 && (
              <button onClick={() => { for (const f of fields) { if (hidden.has(f.key)) onToggle(f.key); } }} className="text-[10px] font-medium text-slate-400 hover:text-blue-600">Tampilkan semua</button>
            )}
          </div>

          {/* Header beku: menempel di atas saat tabel digeser vertikal. Sudah
              aktif sejak dulu (grid mengirim `headerSticky: true` tanpa syarat),
              jadi kotaknya dibuka dalam keadaan tercentang. */}
          {onToggleHeaderFrozen && (
            <label className="flex items-center gap-2 px-1.5 py-1.5 mt-1 rounded hover:bg-gray-50 cursor-pointer border-b border-gray-100">
              <input
                type="checkbox"
                checked={headerFrozen ?? true}
                onChange={(e) => onToggleHeaderFrozen(e.target.checked)}
                className="w-3.5 h-3.5 rounded align-middle border-input text-primary focus:ring-2 focus:ring-ring/40"
              />
              <span className="text-[12px] text-slate-700">Bekukan header</span>
            </label>
          )}

          <div className="max-h-[300px] overflow-y-auto py-1">
            {fields.map((f) => {
              const isHidden = hidden.has(f.key);
              const isFrozen = freezeOn && frozen.has(f.key);
              return (
                <div key={f.key} className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-gray-50">
                  <label className="flex items-center gap-2 grow min-w-0 cursor-pointer">
                    <input type="checkbox" checked={!isHidden} onChange={() => onToggle(f.key)} className={cn('w-3.5 h-3.5 rounded align-middle border-input text-primary focus:ring-2 focus:ring-ring/40')} />
                    <span className={cn('text-[12px] truncate', isHidden ? 'text-slate-400' : 'text-slate-700')}>{f.label}</span>
                  </label>
                  {freezeOn && (
                    <button
                      onClick={() => onToggleFreeze(f.key)}
                      // Kolom tersembunyi tidak dirender, jadi membekukannya tidak
                      // ada artinya — dan kalau dibiarkan, kolom di sebelahnya
                      // memakai offset yang terlalu kecil lalu saling menutupi.
                      disabled={isHidden}
                      className={cn(
                        'shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors',
                        isHidden
                          ? 'text-slate-200 cursor-not-allowed'
                          : isFrozen
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100',
                      )}
                      title={
                        isHidden
                          ? `${f.label} sedang disembunyikan — tampilkan dulu untuk membekukannya`
                          : isFrozen
                            ? `Lepas beku ${f.label}`
                            : `Bekukan ${f.label} (kolom di kirinya ikut beku)`
                      }
                    >
                      {isFrozen ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {freezeOn && (
            <div className="px-1.5 pt-1.5 border-t border-gray-100">
              {showOrderHint && (
                <p className="text-[10px] text-slate-400 leading-snug mb-1">
                  Kolom beku selalu berurutan dari kiri, supaya urutan kolom tidak berubah.
                </p>
              )}
              <button
                onClick={onToggleFreezeAll}
                disabled={visibleCount === 0}
                className={cn(
                  'text-[10px] font-medium',
                  visibleCount === 0
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-400 hover:text-blue-600',
                )}
              >
                {allFrozen ? 'Lepas semua beku' : 'Bekukan semua kolom'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
