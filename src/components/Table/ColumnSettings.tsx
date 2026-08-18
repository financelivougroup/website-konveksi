import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, T_TOOLBAR_BTN_ACTIVE } from '@/lib/tableStyles';

// ===== Pengaturan kolom: hide/show kolom, berlaku untuk semua tabel =====
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

export function ColumnSettingsButton({ fields, hidden, onToggle }: { fields: ColumnOption[]; hidden: Set<string>; onToggle: (key: string) => void }) {
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
  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen(o => !o)} className={`${T_TOOLBAR_BTN} ${hiddenCount > 0 ? T_TOOLBAR_BTN_ACTIVE : T_TOOLBAR_BTN_IDLE}`} title="Atur kolom yang tampil">
        <Columns3 className="w-3 h-3" /> Kolom{hiddenCount > 0 ? ` (${fields.length - hiddenCount}/${fields.length})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-[70] w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-slate-600">Tampilkan kolom</p>
            {hiddenCount > 0 && (
              <button onClick={() => { for (const f of fields) { if (hidden.has(f.key)) onToggle(f.key); } }} className="text-[10px] font-medium text-slate-400 hover:text-blue-600">Tampilkan semua</button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!hidden.has(f.key)} onChange={() => onToggle(f.key)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-[12px] text-slate-700">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
