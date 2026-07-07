import { useState, useEffect } from 'react';
import { ModalShell } from './ModalShell';
import { Calendar } from 'lucide-react';
import type { ColumnDef } from '@/types';

interface DateRangeModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  dateField: string;
  dateFrom: string;
  dateTo: string;
  onUpdate: (dateField: string, dateFrom: string, dateTo: string) => void;
  onApply: () => void;
}

export function DateRangeModal({ open, onClose, columns, dateField, dateFrom, dateTo, onUpdate, onApply }: DateRangeModalProps) {
  const [localField, setLocalField] = useState(dateField);
  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo] = useState(dateTo);

  // Reset local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalField(dateField);
      setLocalFrom(dateFrom);
      setLocalTo(dateTo);
    }
  }, [open, dateField, dateFrom, dateTo]);

  const dateColumns = columns.filter((c) =>
    c.key.toLowerCase().includes('tanggal') ||
    c.key.toLowerCase().includes('date') ||
    c.key.toLowerCase().includes('bulan') ||
    c.key.toLowerCase().includes('laporan') ||
    c.key.toLowerCase().includes('received') ||
    c.key.toLowerCase().includes('created')
  );

  const hasActiveRange = !!(localFrom || localTo);

  const handleClear = () => {
    setLocalField(dateColumns[0]?.key || '');
    setLocalFrom('');
    setLocalTo('');
    onUpdate(dateColumns[0]?.key || '', '', '');
  };

  const handleApply = () => {
    onUpdate(localField, localFrom, localTo);
    onApply();
  };

  return (
    <ModalShell
      open={open}
      title="Filter by Date Range"
      onClose={onClose}
      width="420px"
      footer={
        <>
          {hasActiveRange && (
            <button onClick={handleClear} className="px-4 py-2 text-[13px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
              Clear
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleApply} className="px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200">
            Apply
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Date Field Selection */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Date Field
          </label>
          {dateColumns.length > 0 ? (
            <select
              value={localField}
              onChange={(e) => setLocalField(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100 bg-white"
            >
              {dateColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          ) : (
            <div className="w-full h-9 px-3 flex items-center text-[13px] text-slate-400 bg-slate-50 border border-gray-200 rounded-lg">
              No date fields available
            </div>
          )}
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              From
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              To
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>
        </div>

        {/* Active Range Display */}
        {hasActiveRange && (
          <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <span className="text-[12px] text-sky-700 font-medium">
              {localFrom && localTo
                ? `${formatDate(localFrom)} \u2014 ${formatDate(localTo)}`
                : localFrom
                ? `From ${formatDate(localFrom)}`
                : `Until ${formatDate(localTo)}`}
            </span>
          </div>
        )}

        {!hasActiveRange && (
          <p className="text-[11px] text-slate-400">Select a date range to filter the data.</p>
        )}
      </div>
    </ModalShell>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
