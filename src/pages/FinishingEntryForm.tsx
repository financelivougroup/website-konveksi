import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { EMPTY_ENTRY_SELECTION, changeEntryVariant, entryVariantOptions, filterEntryWorkOrders, selectEntryWorkOrder } from '@/lib/productionEntryOptions';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppSelect } from '@/components/AppSelect';
import { DatePickerField } from '@/components/DatePickerField';
import { NumberField } from '@/components/NumberField';
import { FileUploadField } from '@/components/FileUploadField';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toOptions } from '@/components/selectOptions';
import { useAuth } from '@/contexts/AuthContext';
import * as finishingRecordSvc from '@/services/finishingRecords';
import { syncWorkOrderStatus } from '@/services/autoInvoice';
import * as workOrderSvc from '@/services/workOrders';
import type { WorkOrder, FinishingRecord } from '@/types/pipeline';

interface FinishingEntryFormProps {
  onBack?: () => void;
  workOrders?: WorkOrder[];
  existingFinishingRecords?: FinishingRecord[];
}

const penjahitList = ['Budi Santoso', 'Ani Wulandari', 'Caca', 'Dedi Kurniawan', 'Eka Prasetya', 'Fitri Handayani'];

export default function FinishingEntryForm({ onBack, workOrders: externalWorkOrders, existingFinishingRecords: externalFinishingRecords }: FinishingEntryFormProps) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(externalWorkOrders ?? []);
  const [existingFinishingRecords, setExistingFinishingRecords] = useState<FinishingRecord[]>(externalFinishingRecords ?? []);
  const [selection, setSelection] = useState(EMPTY_ENTRY_SELECTION);
  const { woId, colour, size } = selection;
  const [pic, setPic] = useState('');
  const [qty, setQty] = useState('');
  const [tanggal, setTanggal] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (externalWorkOrders && externalWorkOrders.length > 0) return;
    workOrderSvc.fetchAll().then(({ data }) => {
      if (data) setWorkOrders(data);
    });
    finishingRecordSvc.fetchAll().then(({ data }) => {
      if (data) setExistingFinishingRecords(data);
    });
  }, [externalWorkOrders]);

  // Entry finishing hanya untuk WO yang sudah dijahit (PROGRESS/FINISHED).
  const availableWO = workOrders.filter(
    (w) => w.productionStatus === 'PROGRESS' || w.productionStatus === 'FINISHED',
  );
  const filteredWO = filterEntryWorkOrders(availableWO, colour, size);
  const selectedWO = filteredWO.find((w) => w.id === woId);
  const handleVariantChange = (field: 'colour' | 'size', value: string) => {
    const next = changeEntryVariant(availableWO, selection, field, value);
    setSelection(next);
    if (next.woId !== woId) { setPic(''); setQty(''); }
  };
  const sudahFinishing = selectedWO
    ? existingFinishingRecords.filter((r) => r.workOrderId === selectedWO.id).reduce((sum, r) => sum + (Number(r.qtyFinishing) || 0), 0)
    : 0;
  const sisaFinishing = selectedWO ? selectedWO.quantity - sudahFinishing : 0;
  const numericQty = Number(qty);
  const isQtyValid = qty.trim() !== '' && Number.isFinite(numericQty) && Number.isInteger(numericQty) && numericQty > 0;
  const isFormValid = Boolean(selectedWO && pic && isQtyValid && tanggal);

  const handleSubmit = async () => {
    if (!isFormValid || !selectedWO) return;
    setIsSubmitting(true);

    const { error } = await finishingRecordSvc.create({
      workOrderId: woId,
      qtyFinishing: Number(qty),
      tanggalImport: tanggal,
      syncedAt: new Date().toISOString(),
      source: 'manual',
      syncStatus: 'OK',
      inputBy: currentDisplayName,
      picFinishing: pic,
      imageName: imageFile?.name || '',
    });

    if (error) {
      setIsSubmitting(false);
      return;
    }

    // Status diturunkan dari seluruh laporan lewat `syncWorkOrderStatus`.
    // Form ini adalah tahap terakhir, jadi di sinilah WO paling sering mencapai
    // FINISHED — dan FINISHED itulah yang memicu invoice. Lihat catatan di
    // `KancingEntryForm`/`autoInvoice.ts`: pemicunya sengaja dipindah ke sini
    // setelah revisi user 2026-09-28 (FINISHED menunggu kancing & finishing).
    try {
      await syncWorkOrderStatus(woId);
    } catch (e) {
      console.warn('Sync status failed (will be backfilled):', e);
    }

    setIsSubmitting(false);
    setSuccess(true);
    setTimeout(() => onBack?.(), 1500);
  };


  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-auto">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-5">
          <div>
            <Button type="button" variant="link" onClick={() => onBack?.()} className="h-auto p-0 text-[11px] text-slate-500 hover:text-slate-700 gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Kembali ke Production Order</Button>
            <h1 className="text-lg font-bold text-slate-900">Entry Finishing Baru</h1>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">👤 {currentDisplayName}</div>
        </div>

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-[13px] text-green-700"><CheckCircle className="w-4 h-4 text-green-500" />Entry berhasil disimpan! Mengalihkan...</div>
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="min-w-0 space-y-4">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-wo-trigger" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Kode Produksi Konveksi <span className="text-red-500">*</span></FieldLabel>
                <AppSelect
                  bare
                  id="finishing-wo"
                  required
                  triggerClassName="h-9 text-[12px]"
                  value={woId}
                  onValueChange={(next) => { setSelection(selectEntryWorkOrder(availableWO, next)); setPic(''); setQty(''); }}
                  allowUnlistedValue={false}
                  placeholder="— Pilih Work Order —"
                  emptyMessage="Work orders tidak ditemukan"
                  options={filteredWO.map((wo) => ({
                    value: wo.id,
                    label: `${wo.workCode} (Sisa: ${wo.quantity - existingFinishingRecords.filter(r => r.workOrderId === wo.id).reduce((sum, r) => sum + (Number(r.qtyFinishing) || 0), 0)} pcs)`,
                  }))}
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-client-code" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Kode Produksi Client</FieldLabel>
                <Input id="finishing-client-code" value={selectedWO?.clientProductionCode ?? ''} readOnly className="h-9 bg-slate-50 text-[12px]" />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-colour-trigger">Colour</FieldLabel>
                <AppSelect bare id="finishing-colour" value={colour} onValueChange={(value) => handleVariantChange('colour', value)} options={entryVariantOptions(availableWO, 'warna')} placeholder="Semua colour" allowUnlistedValue={false} triggerClassName="h-9 text-[12px]" />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-size-trigger">Size</FieldLabel>
                <AppSelect bare id="finishing-size" value={size} onValueChange={(value) => handleVariantChange('size', value)} options={entryVariantOptions(filterEntryWorkOrders(availableWO, colour, ''), 'size')} placeholder="Semua size" allowUnlistedValue={false} triggerClassName="h-9 text-[12px]" />
              </Field>
              {selectedWO && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">📄 Order Info</div>
                  <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-slate-500">Product:</span><span className="font-medium">{selectedWO.product}</span>
                    <span className="text-slate-500">Brand:</span><span>{selectedWO.brand} / {selectedWO.warna} / {selectedWO.size}</span>
                    <span className="text-slate-500">Qty Order:</span>
                    {/* Qty 0 = belum diterima dari POS client (input qty manual
                        sudah dihapus dari Order Entry), bukan order kosong. */}
                    <span className={cn('font-semibold', selectedWO.quantity <= 0 && 'text-amber-600')}>
                      {selectedWO.quantity > 0 ? `${selectedWO.quantity} pcs` : 'Belum dari POS'}
                    </span>
                    <span className="text-slate-500">Terfinishing:</span><span className={cn(sudahFinishing > 0 ? 'text-emerald-600 font-medium' : 'text-slate-500')}>{sudahFinishing} pcs</span>
                    <span className="text-slate-500 font-medium">Sisa Finishing:</span>
                    <span className={cn('font-semibold', selectedWO.quantity <= 0 ? 'text-slate-400' : sisaFinishing > 0 ? 'text-amber-600' : 'text-green-600')}>
                      {selectedWO.quantity > 0 ? `${sisaFinishing} pcs` : '—'}
                    </span>
                  </div>
                </div>
              )}
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-pic-trigger" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Finisher <span className="text-red-500">*</span></FieldLabel>
                <AppSelect
                  bare
                  id="finishing-pic"
                  required
                  triggerClassName="h-9 text-[12px]"
                  value={pic}
                  onValueChange={setPic}
                  placeholder="— Pilih Finisher —"
                  options={toOptions(penjahitList)}
                />
              </Field>
            </div>
            <div className="min-w-0 space-y-4">
              <Field className="gap-1.5" data-invalid={qty !== '' && !isQtyValid}>
                <FieldLabel htmlFor="finishing-qty" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Jumlah Finishing (pcs) <span className="text-red-500">*</span></FieldLabel>
                <NumberField id="finishing-qty" value={qty} onChange={setQty} min={1} placeholder="Contoh: 30" />
                {qty !== '' && !isQtyValid && <FieldDescription className="text-[10px] text-destructive">Jumlah harus berupa bilangan bulat positif.</FieldDescription>}
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-image-upload" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Upload Bukti Barang (foto)</FieldLabel>
                <FileUploadField id="finishing-image-upload" onChange={setImageFile} disabled={isSubmitting || success} />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="finishing-tanggal" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Tanggal Laporan</FieldLabel>
                <DatePickerField id="finishing-tanggal" value={tanggal} onChange={setTanggal} maxDate={new Date()} />
              </Field>
            </div>
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-gray-200 flex flex-wrap items-center justify-end gap-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onBack?.()} className="h-8 text-[11px]">Batal</Button>
              <Button type="button" size="sm" onClick={handleSubmit} disabled={!isFormValid || isSubmitting || success} className="h-8 bg-emerald-500 text-[11px] text-white hover:bg-emerald-600">{isSubmitting ? 'Menyimpan...' : 'Simpan Entry'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
