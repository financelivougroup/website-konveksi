import { X, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { penjahitList, bulanList, viewConfig } from '@/data/mockData';
import type { ModuleId, ColumnDef } from '@/types';

interface DetailPanelProps {
  open: boolean;
  moduleId: ModuleId;
  row: Record<string, unknown> | null;
  isAddingNew: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}

export function DetailPanel({ open, moduleId, row, isAddingNew, onClose, onSave, onDelete, onRefresh }: DetailPanelProps) {
  const config = getModuleConfig(moduleId);
  const editable = config.editable;
  const title = isAddingNew
    ? `Add New ${cleanTitle(config.title)}`
    : `${cleanTitle(config.title)} \u2014 ${row?.workCode || row?.bulanTahun || row?.nama || row?.tanggal || `#${row?.id}` || 'Detail'}`;

  const handleSave = () => {
    const formData = collectFormData(moduleId);
    if (row && !isAddingNew) {
      onSave({ ...row, ...formData });
    } else {
      onSave({ id: Date.now(), ...formData });
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-slate-900/25 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed top-0 right-0 w-[440px] h-screen bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.08)] z-50 flex flex-col overflow-hidden transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <PanelForm moduleId={moduleId} row={row} isAddingNew={isAddingNew} readOnly={!editable} />
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {editable ? (
            <>
              {(!isAddingNew && row) && (
                <button
                  onClick={() => row?.id && onDelete(row.id as number)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-rose-400 hover:bg-rose-500 rounded-lg transition-colors"
                >
                  Delete
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200"
              >
                {isAddingNew ? 'Save' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-gray-200"
              >
                Close
              </button>
              <button
                onClick={onRefresh}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-400 hover:bg-sky-500 rounded-lg transition-colors shadow-sm shadow-sky-200"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Sync
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function cleanTitle(title: string): string {
  return title.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*/u, '').trim();
}

function PanelForm({ moduleId, row, isAddingNew, readOnly }: { moduleId: ModuleId; row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  switch (moduleId) {
    case 'selesai-jahit':
      return <SelesaiJahitForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
    case 'target-jahit':
      return <TargetJahitForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
    case 'register-jahit':
      return <RegisterJahitForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
    case 'daftar-libur':
      return <DaftarLiburForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
    case 'register-penjahit':
      return <RegisterPenjahitForm row={row} isAddingNew={isAddingNew} readOnly={readOnly} />;
    default:
      return <ReadOnlyForm row={row} moduleId={moduleId} />;
  }
}

// ===== Selesai Jahit Form =====
function SelesaiJahitForm({ row, readOnly }: { row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  // Work codes loaded from Supabase parent component (passed via DetailPanel or fetched)
  const activeWorkCodes: Array<{ workCode: string; product: string; warna: string; size: string; brand: string }> = [];

  return (
    <div className="space-y-5">
      <Section title="Work Code">
        <FormField label="Work Code" required>
          <select id="form-workCode" className="form-input" defaultValue={row?.workCode as string || ''} disabled={readOnly}>
            <option value="">Pilih Work Code...</option>
            {activeWorkCodes.map((wc) => (
              <option key={wc.workCode} value={wc.workCode}>
                {wc.workCode} | {wc.product} | {wc.warna} | {wc.size}
              </option>
            ))}
          </select>
          <Hint>Filtered from Selesai Finishing: STATUS STOCK = DALAM PROSES PRODUKSI</Hint>
        </FormField>
      </Section>
      <Section title="Auto-Populate">
        <FormField label="Product"><input type="text" id="form-product" className="form-input readonly" defaultValue={row?.product as string || ''} readOnly /></FormField>
        <FormField label="Warna"><input type="text" id="form-warna" className="form-input readonly" defaultValue={row?.warna as string || ''} readOnly /></FormField>
        <FormField label="Size"><input type="text" id="form-size" className="form-input readonly" defaultValue={row?.size as string || ''} readOnly /></FormField>
        <FormField label="Brand"><input type="text" id="form-brand" className="form-input readonly" defaultValue={row?.brand as string || ''} readOnly /></FormField>
      </Section>
      <Section title="Input Manual">
        <FormField label="Total Selesai Jahit" required>
          <input type="number" id="form-totalSelesaiJahit" className="form-input" defaultValue={row?.totalSelesaiJahit as number || ''} readOnly={readOnly} />
        </FormField>
        <FormField label="PIC Penjahit" required>
          <select id="form-picPenjahit" className="form-input" defaultValue={row?.picPenjahit as string || ''} disabled={readOnly}>
            <option value="">Pilih Penjahit...</option>
            {penjahitList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Tanggal Laporan" required>
          <input type="date" id="form-tanggalLaporan" className="form-input" defaultValue={row?.tanggalLaporan as string || ''} readOnly={readOnly} />
        </FormField>
      </Section>
      <Section title="Auto-Calculate">
        <FormField label="Bulan Tahun"><input type="text" id="form-bulanTahun" className="form-input readonly" defaultValue={row?.bulanTahun as string || ''} readOnly /></FormField>
        <FormField label="Tanggal"><input type="text" id="form-tanggal" className="form-input readonly" defaultValue={row?.tanggal as string || ''} readOnly /></FormField>
        <FormField label="Bukti Barang">
          <input type="file" id="form-buktiBarang" className="form-input" accept="image/*" disabled={readOnly} />
        </FormField>
      </Section>
    </div>
  );
}

// ===== Target Jahit Form =====
function TargetJahitForm({ row, readOnly }: { row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  return (
    <div className="space-y-5">
      <Section title="Input Manual">
        <FormField label="Bulan Tahun" required>
          <select id="form-bulanTahun" className="form-input" defaultValue={row?.bulanTahun as string || ''} disabled={readOnly}>
            <option value="">Pilih Bulan...</option>
            {bulanList.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </FormField>
        <FormField label="Nama" required>
          <select id="form-nama" className="form-input" defaultValue={row?.nama as string || ''} disabled={readOnly}>
            <option value="">Pilih Penjahit...</option>
            {penjahitList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Posisi" required>
          <select id="form-posisi" className="form-input" defaultValue={row?.posisi as string || ''} disabled={readOnly}>
            <option value="">Pilih Posisi...</option>
            <option value="Leader">Leader</option>
            <option value="Penjahit">Penjahit</option>
            <option value="Finishing">Finishing</option>
          </select>
        </FormField>
        <FormField label="Salary" required>
          <input type="number" id="form-salary" className="form-input" defaultValue={row?.salary as number || ''} placeholder="Gaji bulanan" readOnly={readOnly} />
        </FormField>
      </Section>

      <Section title="General (Auto-calculate)">
        <FormField label="Total Hari Kerja Efektif"><input type="text" className="form-input readonly" defaultValue={row?.totalHariKerja as number || ''} readOnly /></FormField>
        <FormField label="Hari Kerja Per Hari Ini"><input type="text" className="form-input readonly" defaultValue={row?.hariKerjaHariIni as number || ''} readOnly /></FormField>
        <FormField label="Sisa Hari"><input type="text" className="form-input readonly" defaultValue={row?.sisaHari as number || ''} readOnly /></FormField>
      </Section>

      <Section title="Daily (Auto-calculate)">
        <FormField label="Target Daily"><input type="text" className="form-input readonly" defaultValue={row?.targetDaily as number || ''} readOnly /></FormField>
        <FormField label="Target Ngebut Per Hari"><input type="text" className="form-input readonly" defaultValue={row?.targetNgebutHari as number || ''} readOnly /></FormField>
      </Section>

      <Section title="Monthly (Auto-calculate)">
        <FormField label="Target Monthly"><input type="text" className="form-input readonly" defaultValue={row?.targetMonthly as number || ''} readOnly /></FormField>
        <FormField label="Realisasi Monthly"><input type="text" className="form-input readonly" defaultValue={row?.realisasiMonthly as number || ''} readOnly /></FormField>
        <FormField label="Sisa Target Monthly"><input type="text" className="form-input readonly" defaultValue={row?.sisaTargetMonthly as number || ''} readOnly /></FormField>
        <FormField label="Progress Monthly"><input type="text" className="form-input readonly" defaultValue={row?.progressMonthly ? `${row.progressMonthly}%` : ''} readOnly /></FormField>
        <FormField label="Status Final"><input type="text" className="form-input readonly" defaultValue={row?.statusFinal as string || ''} readOnly /></FormField>
      </Section>

      <Section title="Accumulation (Year-to-Date)">
        <FormField label="Target Accumulation"><input type="text" className="form-input readonly" defaultValue={row?.targetAccum as number || ''} readOnly /></FormField>
        <FormField label="Realisasi Accumulation"><input type="text" className="form-input readonly" defaultValue={row?.realisasiAccum as number || ''} readOnly /></FormField>
        <FormField label="Selisih Accumulation"><input type="text" className="form-input readonly" defaultValue={row?.selisihAccum as number || ''} readOnly /></FormField>
        <FormField label="Progress Accumulation"><input type="text" className="form-input readonly" defaultValue={row?.progressAccum ? `${row.progressAccum}%` : ''} readOnly /></FormField>
      </Section>
    </div>
  );
}

// ===== Register Jahit Form =====
function RegisterJahitForm({ row, readOnly }: { row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  return (
    <div className="space-y-5">
      <Section title="Input Manual">
        <FormField label="Bulan Tahun" required>
          <input type="text" id="form-bulanTahun" className="form-input" defaultValue={row?.bulanTahun as string || ''} placeholder="Contoh: Juni 2026" readOnly={readOnly} />
        </FormField>
        <FormField label="Hari Kerja Efektif" required>
          <input type="number" id="form-hariKerjaEfektif" className="form-input" defaultValue={row?.hariKerjaEfektif as number || ''} readOnly={readOnly} />
        </FormField>
        <FormField label="Target Total Produksi" required>
          <input type="number" id="form-targetTotalProduksi" className="form-input" defaultValue={row?.targetTotalProduksi as number || ''} readOnly={readOnly} />
        </FormField>
      </Section>
      <Section title="Cost Target (Rp/pcs) \u2014 Auto">
        <FormField label="Cost Leader Target"><input type="text" className="form-input readonly" defaultValue={formatCurrency(row?.costLeaderTarget)} readOnly /></FormField>
        <FormField label="Cost Penjahit Target"><input type="text" className="form-input readonly" defaultValue={formatCurrency(row?.costPenjahitTarget)} readOnly /></FormField>
        <FormField label="Cost Finishing Target"><input type="text" className="form-input readonly" defaultValue={formatCurrency(row?.costFinishingTarget)} readOnly /></FormField>
        <FormField label="Total Cost Target"><input type="text" className="form-input readonly" defaultValue={formatCurrency(row?.totalCostTarget)} readOnly /></FormField>
      </Section>
      <Section title="Cost Realisasi \u2014 Auto">
        <FormField label="Realisasi Total Produksi"><input type="text" className="form-input readonly" defaultValue={row?.realisasiTotalProduksi as number || ''} readOnly /></FormField>
        <FormField label="Total Cost Realisasi"><input type="text" className="form-input readonly" defaultValue={formatCurrency(row?.totalCostRealisasi)} readOnly /></FormField>
      </Section>
    </div>
  );
}

// ===== Daftar Libur Form =====
function DaftarLiburForm({ row, readOnly }: { row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  return (
    <div className="space-y-5">
      <Section title="Input Manual">
        <FormField label="Tanggal" required>
          <input type="date" id="form-tanggal" className="form-input" defaultValue={row?.tanggal as string || ''} readOnly={readOnly} />
        </FormField>
        <FormField label="Hari">
          <input type="text" id="form-hari" className="form-input readonly" defaultValue={row?.hari as string || ''} readOnly />
          <Hint>Auto: DAYNAME(tanggal)</Hint>
        </FormField>
        <FormField label="Keterangan" required>
          <input type="text" id="form-keterangan" className="form-input" defaultValue={row?.keterangan as string || ''} placeholder="Contoh: Hari Libur Nasional" readOnly={readOnly} />
        </FormField>
      </Section>
    </div>
  );
}

// ===== Register Penjahit Form =====
function RegisterPenjahitForm({ row, readOnly }: { row: Record<string, unknown> | null; isAddingNew: boolean; readOnly: boolean }) {
  return (
    <div className="space-y-5">
      <Section title="Input Manual">
        <FormField label="PIC Penjahit" required>
          <input type="text" id="form-picPenjahit" className="form-input" defaultValue={row?.picPenjahit as string || ''} placeholder="Nama untuk dropdown di Selesai Jahit" readOnly={readOnly} />
        </FormField>
        <FormField label="Konveksi Team">
          <input type="text" id="form-konveksiTeam" className="form-input" defaultValue={row?.konveksiTeam as string || ''} placeholder="Nama untuk dropdown di Target Jahit" readOnly={readOnly} />
        </FormField>
        <FormField label="Status">
          <select id="form-status" className="form-input" defaultValue={row?.status as string || 'Aktif'} disabled={readOnly}>
            <option value="Aktif">Aktif</option>
            <option value="Non-Aktif">Non-Aktif</option>
          </select>
        </FormField>
      </Section>
    </div>
  );
}

// ===== Read Only Form =====
function ReadOnlyForm({ row, moduleId }: { row: Record<string, unknown> | null; moduleId: ModuleId }) {
  if (!row) return null;
  const columns: ColumnDef[] = viewConfig[moduleId]?.columns || [];

  return (
    <div className="space-y-5">
      <Section title="Read-Only \u2014 Sync dari Supabase">
        {columns.map((col) => {
          let value = row[col.key] || '-';
          if (col.format === 'currency' && typeof row[col.key] === 'number') {
            value = formatCurrency(row[col.key]);
          }
          return (
            <FormField key={col.key} label={col.label}>
              <input type="text" className="form-input readonly" value={String(value)} readOnly />
            </FormField>
          );
        })}
      </Section>
    </div>
  );
}

// ===== Helper Components =====
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{title}</span>
        <span className="flex-1 h-px bg-gray-100" />
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="mt-1 text-[11px] text-slate-400 leading-relaxed whitespace-pre-line">{children}</p>;
}

function getModuleConfig(moduleId: ModuleId) {
  return viewConfig[moduleId] || { title: moduleId, editable: true, sync: false };
}

function collectFormData(_moduleId: ModuleId): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const inputs = document.querySelectorAll('[id^="form-"]');
  inputs.forEach((el) => {
    const id = el.id.replace('form-', '');
    if (el instanceof HTMLInputElement) {
      if (el.type === 'number') {
        data[id] = el.value ? parseFloat(el.value) : '';
      } else if (el.type === 'file') {
        data[id] = el.files?.[0]?.name || '';
      } else {
        data[id] = el.value;
      }
    } else if (el instanceof HTMLSelectElement) {
      data[id] = el.value;
    }
  });
  return data;
}
