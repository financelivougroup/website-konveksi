import { useState } from 'react';
import { Filter, ArrowUpDown, X, Plus, Download } from 'lucide-react';
import { FILTER_OPERATORS, type FieldOption, type FilterRule, type SortRule } from '@/lib/tableQuery';
import { T_TOOLBAR_BTN, T_TOOLBAR_BTN_IDLE, T_TOOLBAR_BTN_ACTIVE } from '@/lib/tableStyles';
import { AppSelect } from '@/components/AppSelect';

// ===== Shared Filter & Sort controls for design-system tables =====
// Each page owns its filter/sort state and applies the helpers from
// '@/lib/tableQuery' (applyFilters / applySorts) to its rows.
// Filter rules combine with AND; sort rules apply in list order (first wins).

const INPUT_CLS = 'h-7 px-2 text-[11px] border border-gray-200 rounded-md outline-none bg-white focus:border-slate-400';

function PanelShell({ title, count, onReset, onClose, children }: { title: string; count: number; onReset: () => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1.5 z-[70] w-[360px] bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-semibold text-slate-700">{title}{count > 0 && <span className="ml-1.5 text-[10px] font-bold text-blue-600 bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5">{count}</span>}</p>
          <div className="flex items-center gap-1">
            {count > 0 && <button onClick={onReset} className="text-[10px] font-medium text-slate-400 hover:text-red-500 px-1.5 py-0.5">Reset</button>}
            <button onClick={onClose} className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-3 h-3" /></button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * Tombol Export.
 *
 * `count` opsional: bila diisi (dan > 0), tombol menampilkan jumlah baris yang
 * akan diekspor — dipakai tabel ber-checkbox supaya jelas bahwa yang diekspor
 * hanya baris terpilih. Tabel tanpa seleksi cukup memanggil tanpa `count`.
 */
export function ExportButton({ onClick, count }: { onClick: () => void; count?: number }) {
  return (
    <button onClick={onClick} className={`${T_TOOLBAR_BTN} ${T_TOOLBAR_BTN_IDLE}`}>
      <Download className="w-3 h-3" /> Export{count ? ` (${count})` : ''}
    </button>
  );
}

export function FilterButton({ fields, value, onChange }: { fields: FieldOption[]; value: FilterRule[]; onChange: (v: FilterRule[]) => void }) {
  const [open, setOpen] = useState(false);
  const active = value.length;
  const set = (i: number, patch: Partial<FilterRule>) => onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className={`${T_TOOLBAR_BTN} ${active > 0 ? T_TOOLBAR_BTN_ACTIVE : T_TOOLBAR_BTN_IDLE}`}>
        <Filter className="w-3 h-3" /> Filter{active > 0 ? ` (${active})` : ''}
      </button>
      {open && (
        <PanelShell title="Filter" count={active} onReset={() => onChange([])} onClose={() => setOpen(false)}>
          {value.length === 0 && <p className="text-[11px] text-slate-400 mb-2">Belum ada aturan filter.</p>}
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
            {value.map((r, i) => (
              <div key={i} className="flex items-center gap-1">
                <AppSelect
                  bare
                  value={r.field}
                  onValueChange={(next) => set(i, { field: next })}
                  triggerClassName="w-[104px] flex-shrink-0"
                  options={fields.map((f) => ({ value: f.key, label: f.label }))}
                />
                <AppSelect
                  bare
                  value={r.op}
                  onValueChange={(next) => set(i, { op: next })}
                  triggerClassName="w-[110px] flex-shrink-0"
                  options={FILTER_OPERATORS.map((o) => ({ value: o.key, label: o.label }))}
                />
                {(r.op === 'contains' || r.op === 'not_contains' || r.op === 'equals' || r.op === 'not_equals' || r.op === 'gt' || r.op === 'lt') && (
                  <input type="text" value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Nilai…" className={`${INPUT_CLS} flex-1 min-w-0`} />
                )}
                {(r.op === 'is_empty' || r.op === 'is_not_empty') && <span className="flex-1" />}
                <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onChange([...value, { field: fields[0].key, op: 'contains', value: '' }])} className="mt-2 w-full h-7 text-[11px] font-medium text-blue-600 border border-dashed border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1">
            <Plus className="w-3 h-3" /> Tambah aturan
          </button>
        </PanelShell>
      )}
    </div>
  );
}

export function SortButton({ fields, value, onChange }: { fields: FieldOption[]; value: SortRule[]; onChange: (v: SortRule[]) => void }) {
  const [open, setOpen] = useState(false);
  const active = value.length;
  const set = (i: number, patch: Partial<SortRule>) => onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className={`${T_TOOLBAR_BTN} ${active > 0 ? T_TOOLBAR_BTN_ACTIVE : T_TOOLBAR_BTN_IDLE}`}>
        <ArrowUpDown className="w-3 h-3" /> Sort{active > 0 ? ` (${active})` : ''}
      </button>
      {open && (
        <PanelShell title="Urutkan" count={active} onReset={() => onChange([])} onClose={() => setOpen(false)}>
          {value.length === 0 && <p className="text-[11px] text-slate-400 mb-2">Belum ada aturan sort (default tabel dipakai).</p>}
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
            {value.map((r, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-300 w-4 flex-shrink-0">{i + 1}</span>
                <AppSelect
                  bare
                  value={r.field}
                  onValueChange={(next) => set(i, { field: next })}
                  triggerClassName="flex-1 min-w-0"
                  options={fields.map((f) => ({ value: f.key, label: f.label }))}
                />
                <AppSelect
                  bare
                  value={r.dir}
                  onValueChange={(next) => set(i, { dir: next as 'asc' | 'desc' })}
                  triggerClassName="w-[110px] flex-shrink-0"
                  options={[
                    { value: 'asc', label: 'Naik (A→Z / 0→9)' },
                    { value: 'desc', label: 'Turun (Z→A / 9→0)' },
                  ]}
                />
                <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onChange([...value, { field: fields[0].key, dir: 'asc' }])} className="mt-2 w-full h-7 text-[11px] font-medium text-blue-600 border border-dashed border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1">
            <Plus className="w-3 h-3" /> Tambah sort
          </button>
        </PanelShell>
      )}
    </div>
  );
}
