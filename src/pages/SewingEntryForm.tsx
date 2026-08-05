import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import * as cuttingRecordSvc from '@/services/cuttingRecords';
import { transitionToFinishingComplete } from '@/services/autoInvoice';
import type { WorkOrder, SewingRecord } from '@/types/pipeline';

interface SewingEntryFormProps {
  onBack?: () => void;
  workOrders?: WorkOrder[];
  existingSewingRecords?: SewingRecord[];
}

const penjahitList = ['Budi Santoso', 'Ani Wulandari', 'Caca', 'Dedi Kurniawan', 'Eka Prasetya', 'Fitri Handayani'];

export default function SewingEntryForm({ onBack, workOrders: externalWorkOrders, existingSewingRecords: externalSewingRecords }: SewingEntryFormProps) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(externalWorkOrders ?? []);
  const [existingSewingRecords, setExistingSewingRecords] = useState<SewingRecord[]>(externalSewingRecords ?? []);
  const [woId, setWoId] = useState('');
  const [pic, setPic] = useState('');
  const [qty, setQty] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [imageFile, setImageFile] = useState<{ name: string; size: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (externalWorkOrders && externalWorkOrders.length > 0) return;
    workOrderSvc.fetchAll().then(({ data }) => {
      if (data) setWorkOrders(data);
    });
    sewingRecordSvc.fetchAll().then(({ data }) => {
      if (data) setExistingSewingRecords(data);
    });
  }, [externalWorkOrders]);

  const availableWO = workOrders.filter(
    (w) => w.productionStatus === 'CUTTING_COMPLETE' || w.productionStatus === 'SEWING_IN_PROGRESS',
  );
  const selectedWO = workOrders.find((w) => w.id === woId);
  const sudahTerjahit = selectedWO
    ? existingSewingRecords.filter((s) => s.workOrderId === selectedWO.id).reduce((sum, r) => sum + r.qtySelesai, 0)
    : 0;
  const sisaJahit = selectedWO ? selectedWO.quantity - sudahTerjahit : 0;
  const isFormValid = woId && pic && qty && Number(qty) > 0 && tanggal;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeKB = Math.round(file.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      setImageFile({ name: file.name, size: sizeStr });
    }
  };

  const handleRemoveImage = () => setImageFile(null);

  const handleSubmit = async () => {
    if (!isFormValid || !selectedWO) return;
    setIsSubmitting(true);

    const { error } = await sewingRecordSvc.create({
      workOrderId: woId,
      workCode: selectedWO.workCode,
      picPenjahit: pic,
      qtySelesai: Number(qty),
      tanggalLaporan: tanggal,
      inputBy: currentDisplayName,
      inputAt: new Date().toISOString().split('T')[0],
      imageName: imageFile?.name || '',
      imageUrl: '',
    });

    if (error) {
      setIsSubmitting(false);
      return;
    }

    // Auto-update WO status:
    // - First sewing entry while cutting not yet equal: SEWING_IN_PROGRESS
    // - Sewing reaches cutting total and cutting > qty order: FINISHING_IN_PROGRESS
    // - Sewing equals cutting equals qty order: FINISHING_COMPLETE
    const newTotal = sudahTerjahit + Number(qty);
    const orderQty = Number(selectedWO.quantity) || 0;
    if (newTotal > 0) {
      const { data: cr } = await cuttingRecordSvc.fetchByWorkOrder(woId);
      const cuttingTotal = cr?.totalCutting ?? orderQty;
      if (newTotal === cuttingTotal && cuttingTotal <= orderQty) {
        // transitionToFinishingComplete handles both: update prod_status + auto-invoice generation
        try {
          await transitionToFinishingComplete(woId);
        } catch (e) {
          console.warn('Auto-invoice failed (will be backfilled):', e);
        }
      } else if (newTotal === cuttingTotal && cuttingTotal > orderQty) {
        await workOrderSvc.updateProdStatus(woId, 'FINISHING_IN_PROGRESS');
      } else {
        await workOrderSvc.updateProdStatus(woId, 'SEWING_IN_PROGRESS');
      }
    }

    setIsSubmitting(false);
    setSuccess(true);
    setTimeout(() => onBack?.(), 1500);
  };

  const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-5">
          <div>
            <button onClick={() => onBack?.()} className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Kembali ke Production Monitoring</button>
            <h1 className="text-lg font-bold text-slate-900">Entry Jahitan Baru</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">Input hasil jahitan yang sudah <strong>LULUS QC</strong> oleh supervisor</p>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">👤 Owner</div>
        </div>

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-[13px] text-green-700"><CheckCircle className="w-4 h-4 text-green-500" />Entry berhasil disimpan! Mengalihkan...</div>
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="px-5 py-3 bg-slate-50 border-b border-gray-200">
            <h2 className="text-[13px] font-semibold text-slate-700">📋 Form Data Jahitan</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Semua entry di sini sudah LULUS QC</p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Work Order <span className="text-red-500">*</span></label>
                <select value={woId} onChange={(e) => { setWoId(e.target.value); setPic(''); setQty(''); }} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 bg-white" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' }}>
                  <option value="">— Pilih Work Order —</option>
                  {availableWO.map((wo) => (
                    <option key={wo.id} value={wo.id}>{wo.workCode} (Sisa: {wo.quantity - existingSewingRecords.filter(s => s.workOrderId === wo.id).reduce((sum, r) => sum + r.qtySelesai, 0)} pcs)</option>
                  ))}
                  {availableWO.length === 0 && <option disabled>Work orders tidak ditemukan</option>}
                </select>
              </div>
              {selectedWO && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">📄 Order Info</div>
                  <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-slate-500">Product:</span><span className="font-medium">{selectedWO.product}</span>
                    <span className="text-slate-500">Brand:</span><span>{selectedWO.brand} / {selectedWO.warna} / {selectedWO.size}</span>
                    <span className="text-slate-500">Qty Order:</span><span className="font-semibold">{selectedWO.quantity} pcs</span>
                    <span className="text-slate-500">Terjahit:</span><span className={cn(sudahTerjahit > 0 ? 'text-amber-600 font-medium' : 'text-slate-500')}>{sudahTerjahit} pcs</span>
                    <span className="text-slate-500 font-medium">Sisa Jahit:</span><span className={cn('font-semibold', sisaJahit > 0 ? 'text-amber-600' : 'text-green-600')}>{sisaJahit} pcs</span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">PIC Penjahit <span className="text-red-500">*</span></label>
                <select value={pic} onChange={(e) => setPic(e.target.value)} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 bg-white" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' }}>
                  <option value="">— Pilih Penjahit —</option>
                  {penjahitList.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Jumlah Selesai Jahit (pcs) <span className="text-red-500">*</span></label>
                <input type="number" placeholder="Contoh: 30" value={qty} onChange={(e) => setQty(e.target.value)} min={1} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Upload Bukti Barang (foto)</label>
                {!imageFile ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer" onClick={() => document.getElementById('image-upload')?.click()}>
                    <div className="text-2xl mb-1">📷</div>
                    <div className="text-[12px] font-medium text-slate-700">Klik untuk upload foto</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Format: JPG, PNG, WEBP. Maks 5 MB.</div>
                    <input id="image-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-md flex items-center justify-center text-lg">🖼️</div>
                    <div className="flex-1 min-w-0"><div className="text-[11px] font-medium text-green-800 truncate">{imageFile.name}</div><div className="text-[10px] text-green-600">{imageFile.size}</div></div>
                    <button onClick={handleRemoveImage} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Tanggal Laporan</label>
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                <p className="text-[10px] text-slate-400 mt-1">Default: hari ini ({todayStr}). Bisa backdate untuk missed entry.</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-[10px] text-slate-400"><strong>Info:</strong> Setelah disimpan, data masuk ke Sewing Log. Progress bar otomatis terupdate.</div>
            <div className="flex gap-2">
              <button onClick={() => onBack?.()} className="px-4 py-1.5 text-[11px] text-slate-600 border border-gray-200 rounded-lg hover:bg-white transition-colors">Batal</button>
              <button onClick={handleSubmit} disabled={!isFormValid || isSubmitting || success} className={cn('px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1.5', isFormValid && !isSubmitting && !success ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed')}>{isSubmitting ? 'Menyimpan...' : '✅ Simpan Entry'}</button>
            </div>
          </div>
        </div>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">📡 <strong>SIP:</strong> Setelah disimpan, data langsung masuk ke <strong>Sewing Log</strong> (read-only).</div>
      </div>
    </div>
  );
}
