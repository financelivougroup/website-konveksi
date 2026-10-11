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
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as workOrderSvc from '@/services/workOrders';
import { fetchAll as fetchAllKaryawan, activePenjahitNames } from '@/services/registerPenjahit';
import { syncWorkOrderStatus } from '@/services/autoInvoice';
import type { WorkOrder, SewingRecord } from '@/types/pipeline';

interface SewingEntryFormProps {
  onBack?: () => void;
  workOrders?: WorkOrder[];
  existingSewingRecords?: SewingRecord[];
}

export default function SewingEntryForm({ onBack, workOrders: externalWorkOrders, existingSewingRecords: externalSewingRecords }: SewingEntryFormProps) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(externalWorkOrders ?? []);
  const [existingSewingRecords, setExistingSewingRecords] = useState<SewingRecord[]>(externalSewingRecords ?? []);
  const [selection, setSelection] = useState(EMPTY_ENTRY_SELECTION);
  const { woId, colour, size } = selection;
  const [pic, setPic] = useState('');
  const [qty, setQty] = useState('');
  const [tanggal, setTanggal] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  /**
   * Daftar penjahit untuk dropdown PIC — dari Register Karyawan (Contact →
   * Karyawan), bukan daftar nama tetap di kode.
   *
   * Sebelumnya di sini ada `const penjahitList = ['Budi Santoso', ...]` berisi
   * nama dummy, sehingga form menawarkan orang yang tidak ada di Register
   * Karyawan. Sekarang sumbernya satu: baris `register_penjahit` yang **Aktif**
   * dan berposisi **Penjahit**, lewat `activePenjahitNames` — helper yang sama
   * dipakai Planning Produksi, jadi kedua halaman tidak bisa berbeda.
   *
   * Karyawan Non-Aktif sengaja tidak ditawarkan; entri lama yang memakai
   * namanya tetap tampil karena barisnya sudah tersimpan.
   */
  const [penjahitOptions, setPenjahitOptions] = useState<string[]>([]);

  useEffect(() => {
    fetchAllKaryawan().then(({ data }) => {
      setPenjahitOptions(activePenjahitNames(data ?? []));
    });
  }, []);

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
    (w) => w.productionStatus === 'PROGRESS' || w.productionStatus === 'FINISHED',
  );
  const filteredWO = filterEntryWorkOrders(availableWO, colour, size);
  const selectedWO = filteredWO.find((w) => w.id === woId);
  const handleVariantChange = (field: 'colour' | 'size', value: string) => {
    const next = changeEntryVariant(availableWO, selection, field, value);
    setSelection(next);
    if (next.woId !== woId) { setPic(''); setQty(''); }
  };
  const sudahTerjahit = selectedWO
    ? existingSewingRecords.filter((s) => s.workOrderId === selectedWO.id).reduce((sum, r) => sum + r.qtySelesai, 0)
    : 0;
  const sisaJahit = selectedWO ? selectedWO.quantity - sudahTerjahit : 0;
  const numericQty = Number(qty);
  const isQtyValid = qty.trim() !== '' && Number.isFinite(numericQty) && Number.isInteger(numericQty) && numericQty > 0;
  const isFormValid = Boolean(selectedWO && pic && isQtyValid && tanggal);

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

    // Status diturunkan dari SELURUH laporan (cutting/jahit/kancing/finishing)
    // oleh `syncWorkOrderStatus`, bukan dihitung di sini.
    //
    // Sebelumnya form ini memanggil `transitionToFinishingComplete` yang
    // menghardcode FINISHED begitu jahit mencapai qty. Setelah revisi user
    // 2026-09-28, FINISHED juga menunggu kancing & finishing, jadi keputusan itu
    // tidak boleh lagi diambil dari sini — kalau tetap, WO akan FINISHED padahal
    // kancing/finishing belum jalan. `syncWorkOrderStatus` yang memutuskan, dan
    // ia juga yang menerbitkan invoice saat WO benar-benar FINISHED.
    //
    // Aman dipanggil walau qty order masih 0: statusnya berhenti di PROGRESS.
    const newTotal = sudahTerjahit + Number(qty);
    if (newTotal > 0) {
      try {
        await syncWorkOrderStatus(woId);
      } catch (e) {
        // Harga order belum lengkap / gagal lain: WO dibiarkan pada statusnya
        // sekarang, dan backfill akan menyusulkannya. Perilaku lama.
        console.warn('Sync status failed (will be backfilled):', e);
      }
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
            <h1 className="text-lg font-bold text-slate-900">Entry Jahitan Baru</h1>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">👤 Owner</div>
        </div>

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-[13px] text-green-700"><CheckCircle className="w-4 h-4 text-green-500" />Entry berhasil disimpan! Mengalihkan...</div>
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="min-w-0 space-y-4">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-wo-trigger" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Kode Produksi Konveksi <span className="text-red-500">*</span></FieldLabel>
                <AppSelect
                  bare
                  id="sewing-wo"
                  required
                  triggerClassName="h-9 text-[12px]"
                  value={woId}
                  onValueChange={(next) => { setSelection(selectEntryWorkOrder(availableWO, next)); setPic(''); setQty(''); }}
                  allowUnlistedValue={false}
                  placeholder="— Pilih Work Order —"
                  emptyMessage="Work orders tidak ditemukan"
                  options={filteredWO.map((wo) => ({
                    value: wo.id,
                    label: `${wo.workCode} (Sisa: ${wo.quantity - existingSewingRecords.filter(s => s.workOrderId === wo.id).reduce((sum, r) => sum + r.qtySelesai, 0)} pcs)`,
                  }))}
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-client-code" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Kode Produksi Client</FieldLabel>
                <Input id="sewing-client-code" value={selectedWO?.clientProductionCode ?? ''} readOnly className="h-9 bg-slate-50 text-[12px]" />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-colour-trigger">Colour</FieldLabel>
                <AppSelect bare id="sewing-colour" value={colour} onValueChange={(value) => handleVariantChange('colour', value)} options={entryVariantOptions(availableWO, 'warna')} placeholder="Semua colour" allowUnlistedValue={false} triggerClassName="h-9 text-[12px]" />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-size-trigger">Size</FieldLabel>
                <AppSelect bare id="sewing-size" value={size} onValueChange={(value) => handleVariantChange('size', value)} options={entryVariantOptions(filterEntryWorkOrders(availableWO, colour, ''), 'size')} placeholder="Semua size" allowUnlistedValue={false} triggerClassName="h-9 text-[12px]" />
              </Field>
              {selectedWO && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">📄 Order Info</div>
                  <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-slate-500">Product:</span><span className="font-medium">{selectedWO.product}</span>
                    <span className="text-slate-500">Brand:</span><span>{selectedWO.brand} / {selectedWO.warna} / {selectedWO.size}</span>
                    <span className="text-slate-500">Qty Order:</span>
                    {/* Qty 0 = belum diterima dari POS client. Menulis "0 pcs"
                        akan terbaca seolah ordernya kosong, jadi ditandai apa
                        adanya supaya user tahu kenapa "Sisa Jahit" tidak bisa
                        dihitung. */}
                    <span className={cn('font-semibold', selectedWO.quantity <= 0 && 'text-amber-600')}>
                      {selectedWO.quantity > 0 ? `${selectedWO.quantity} pcs` : 'Belum dari POS'}
                    </span>
                    <span className="text-slate-500">Terjahit:</span><span className={cn(sudahTerjahit > 0 ? 'text-amber-600 font-medium' : 'text-slate-500')}>{sudahTerjahit} pcs</span>
                    <span className="text-slate-500 font-medium">Sisa Jahit:</span>
                    <span className={cn('font-semibold', selectedWO.quantity <= 0 ? 'text-slate-400' : sisaJahit > 0 ? 'text-amber-600' : 'text-green-600')}>
                      {selectedWO.quantity > 0 ? `${sisaJahit} pcs` : '—'}
                    </span>
                  </div>
                </div>
              )}
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-pic-trigger" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Penjahit <span className="text-red-500">*</span></FieldLabel>
                <AppSelect
                  bare
                  id="sewing-pic"
                  required
                  triggerClassName="h-9 text-[12px]"
                  value={pic}
                  onValueChange={setPic}
                  placeholder="— Pilih Penjahit —"
                  emptyMessage="Belum ada karyawan Aktif berposisi Penjahit — daftarkan di menu Contact → tab Karyawan."
                  options={toOptions(penjahitOptions)}
                />
                {penjahitOptions.length === 0 && (
                  <FieldDescription className="text-[10px] text-slate-400">
                    Belum ada karyawan Aktif berposisi Penjahit — daftarkan di menu Contact → tab Karyawan.
                  </FieldDescription>
                )}
              </Field>
            </div>
            <div className="min-w-0 space-y-4">
              <Field className="gap-1.5" data-invalid={qty !== '' && !isQtyValid}>
                <FieldLabel htmlFor="sewing-qty" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Jumlah Selesai Jahit (pcs) <span className="text-red-500">*</span></FieldLabel>
                <NumberField id="sewing-qty" value={qty} onChange={setQty} min={1} placeholder="Contoh: 30" />
                {qty !== '' && !isQtyValid && <FieldDescription className="text-[10px] text-destructive">Jumlah harus berupa bilangan bulat positif.</FieldDescription>}
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-image-upload" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Upload Bukti Barang (foto)</FieldLabel>
                <FileUploadField id="sewing-image-upload" onChange={setImageFile} disabled={isSubmitting || success} />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="sewing-tanggal" className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Tanggal Laporan</FieldLabel>
                <DatePickerField id="sewing-tanggal" value={tanggal} onChange={setTanggal} maxDate={new Date()} />
              </Field>
            </div>
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-gray-200 flex flex-wrap items-center justify-end gap-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onBack?.()} className="h-8 text-[11px]">Batal</Button>
              <Button type="button" size="sm" onClick={handleSubmit} disabled={!isFormValid || isSubmitting || success} className="h-8 bg-primary text-[11px] text-white hover:bg-primary/90">{isSubmitting ? 'Menyimpan...' : 'Simpan Entry'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
