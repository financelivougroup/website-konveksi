import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { EMPTY_ENTRY_SELECTION, isEntryQuantityValid, selectEntryWorkOrder, entryQuantitiesByWorkOrder, eligibleEntryWorkOrders } from '@/lib/productionEntryOptions';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { WorkOrderCardPicker } from '@/components/Production/WorkOrderCardPicker';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppSelect } from '@/components/AppSelect';
import { DatePickerField } from '@/components/DatePickerField';
import { NumberField } from '@/components/NumberField';
import { FileUploadField } from '@/components/FileUploadField';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { toOptions } from '@/components/selectOptions';
import { useAuth } from '@/contexts/AuthContext';
import * as sewingRecordSvc from '@/services/sewingRecords';
import * as upstreamRecordSvc from '@/services/cuttingRecords';
import * as workOrderSvc from '@/services/workOrders';
import { fetchAll as fetchAllKaryawan, activePenjahitNames } from '@/services/registerPenjahit';
import { syncWorkOrderStatus } from '@/services/autoInvoice';
import type { WorkOrder, SewingRecord, CuttingRecord } from '@/types/pipeline';

interface SewingEntryFormProps {
  onBack?: () => void;
  workOrders?: WorkOrder[];
  existingSewingRecords?: SewingRecord[];
  existingCuttingRecords?: CuttingRecord[];
}

export default function SewingEntryForm({ onBack, workOrders: externalWorkOrders, existingSewingRecords: externalSewingRecords, existingCuttingRecords: externalUpstreamRecords }: SewingEntryFormProps) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(externalWorkOrders ?? []);
  const [existingSewingRecords, setExistingSewingRecords] = useState<SewingRecord[]>(externalSewingRecords ?? []);
  const [upstreamRecords, setUpstreamRecords] = useState<CuttingRecord[]>(externalUpstreamRecords ?? []);
  const [selection, setSelection] = useState(EMPTY_ENTRY_SELECTION);
  const { woId } = selection;
  const [pic, setPic] = useState('');
  const [qty, setQty] = useState('');
  const [tanggal, setTanggal] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoading, setLoading] = useState(externalWorkOrders === undefined || externalSewingRecords === undefined || externalUpstreamRecords === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSources, setLoadedSources] = useState({ orders: externalWorkOrders, own: externalSewingRecords, upstream: externalUpstreamRecords, reloadKey: 0 });
  const loading = isLoading || loadedSources.orders !== externalWorkOrders || loadedSources.own !== externalSewingRecords || loadedSources.upstream !== externalUpstreamRecords || loadedSources.reloadKey !== reloadKey;

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
    let active = true;
    Promise.all([
      externalWorkOrders !== undefined ? { data: externalWorkOrders, error: null } : workOrderSvc.fetchAll(),
      externalSewingRecords !== undefined ? { data: externalSewingRecords, error: null } : sewingRecordSvc.fetchAll(),
      externalUpstreamRecords !== undefined ? { data: externalUpstreamRecords, error: null } : upstreamRecordSvc.fetchAll(),
    ])
      .then(([orders, records, upstream]) => {
        if (!active) return;
        if (orders.error || records.error || upstream.error || !orders.data || !records.data || !upstream.data) {
          setLoadError('Data produksi belum dapat dimuat. Coba lagi.');
          return;
        }
        setWorkOrders(orders.data);
        setExistingSewingRecords(records.data);
        setUpstreamRecords(upstream.data);
        setLoadError(null);
      })
      .catch(() => { if (active) setLoadError('Data produksi belum dapat dimuat. Coba lagi.'); })
      .finally(() => {
        if (!active) return;
        setLoadedSources({ orders: externalWorkOrders, own: externalSewingRecords, upstream: externalUpstreamRecords, reloadKey });
        setLoading(false);
      });
    return () => { active = false; };
  }, [externalWorkOrders, externalSewingRecords, externalUpstreamRecords, reloadKey]);

  const upstreamTotals = useMemo(
    () => entryQuantitiesByWorkOrder(upstreamRecords, (r) => r.totalCutting, 'first'),
    [upstreamRecords],
  );
  const ownTotals = useMemo(
    () => entryQuantitiesByWorkOrder(existingSewingRecords, (r) => r.qtySelesai),
    [existingSewingRecords],
  );
  const availableWO = loading || loadError ? [] : eligibleEntryWorkOrders(workOrders, upstreamTotals, ownTotals);
  const selectedWO = availableWO.find((w) => w.id === woId);
  const handleWorkOrderSelect = (nextId: string) => {
    if (isSubmitting || success || nextId === woId) return;
    setSelection(selectEntryWorkOrder(availableWO, nextId));
    setPic('');
    setQty('');
    setSubmitError(null);
  };
  const sudahTerjahit = selectedWO
    ? existingSewingRecords.filter((s) => s.workOrderId === selectedWO.id).reduce((sum, r) => sum + r.qtySelesai, 0)
    : 0;
  const sisaJahit = selectedWO ? selectedWO.quantity - sudahTerjahit : 0;
  const isQtyValid = isEntryQuantityValid(qty);
  const isFormValid = Boolean(selectedWO && pic && isQtyValid && tanggal);

  const showPic = Boolean(selectedWO && isQtyValid);
  const showDetails = Boolean(showPic && pic);
  const busy = isSubmitting || success;

  const handleSubmit = async () => {
    if (!isFormValid || !selectedWO || isSubmitting || success) return;
    setSubmitError(null);
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
      setSubmitError('Entry belum tersimpan. Coba simpan lagi.');
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
    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-6">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Button type="button" variant="link" onClick={() => onBack?.()} className="h-auto justify-start p-0 text-xs text-muted-foreground"><ArrowLeft /> Kembali ke Production Monitoring</Button>
            <h1 className="text-lg font-semibold text-foreground">Entry Jahitan Baru</h1>
          </div>
          <span className="max-w-full break-words text-xs text-muted-foreground">{currentDisplayName}</span>
        </header>

        {success && <Alert><CheckCircle /><AlertDescription>Entry berhasil disimpan! Mengalihkan...</AlertDescription></Alert>}
        {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}

        <WorkOrderCardPicker
          id="sewing-orders" orders={availableWO} selectedId={woId} onSelect={handleWorkOrderSelect}
          disabled={busy} loading={loading} error={loadError}
          onRetry={() => { setLoadError(null); setLoading(true); setReloadKey((key) => key + 1); }}
        />

        <Card hidden={!selectedWO}>
          <CardHeader><CardTitle>Catat hasil produksi</CardTitle></CardHeader>
          <CardContent>
            <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
              {selectedWO && (
                <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Qty Order</dt><dd className="font-medium tabular-nums">{selectedWO.quantity > 0 ? `${selectedWO.quantity} pcs` : 'Belum dari POS'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Terjahit</dt><dd className="font-medium tabular-nums">{sudahTerjahit} pcs</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Sisa Jahit (vs Qty Order)</dt><dd className="font-medium tabular-nums">{selectedWO.quantity > 0 ? `${sisaJahit} pcs` : '—'}</dd></div>
                </dl>
              )}
              <Field data-invalid={qty !== '' && !isQtyValid}>
                <FieldLabel htmlFor="sewing-qty">1. Jumlah Selesai Jahit (pcs) *</FieldLabel>
                <NumberField id="sewing-qty" value={qty} onChange={setQty} min={1} placeholder="Contoh: 30" />
                {qty !== '' && !isQtyValid && <FieldDescription className="text-destructive">Jumlah harus berupa bilangan bulat positif.</FieldDescription>}
              </Field>
              <div hidden={!showPic}>
                <Field>
                  <FieldLabel htmlFor="sewing-pic-trigger">2. Penjahit *</FieldLabel>
                  <AppSelect key={woId} bare id="sewing-pic" required value={pic} onValueChange={setPic} disabled={busy || !showPic}
                    placeholder="Pilih Penjahit" options={toOptions(penjahitOptions)} />
                  {penjahitOptions.length === 0 && <FieldDescription>Belum ada karyawan Aktif berposisi Penjahit — daftarkan di menu Contact → tab Karyawan.</FieldDescription>}
                </Field>
              </div>
              <div hidden={!showDetails} className={showDetails ? 'flex min-w-0 flex-col gap-5' : 'hidden'}>
                <Field>
                  <FieldLabel htmlFor="sewing-image-upload">3. Attachment (opsional)</FieldLabel>
                  <FileUploadField id="sewing-image-upload" onChange={setImageFile} disabled={busy || !showDetails} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sewing-tanggal">Tanggal Laporan</FieldLabel>
                  <DatePickerField id="sewing-tanggal" value={tanggal} onChange={setTanggal} maxDate={new Date()} />
                </Field>
              </div>
            </fieldset>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onBack?.()} disabled={isSubmitting}>Batal</Button>
            <Button className={!showDetails ? 'hidden' : undefined} type="button" onClick={handleSubmit} disabled={!isFormValid || busy}>{isSubmitting ? 'Menyimpan...' : 'Simpan Entry'}</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
