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
import * as finishingRecordSvc from '@/services/finishingRecords';
import { syncWorkOrderStatus } from '@/services/autoInvoice';
import * as upstreamRecordSvc from '@/services/kancingRecords';
import * as workOrderSvc from '@/services/workOrders';
import type { WorkOrder, FinishingRecord, KancingRecord } from '@/types/pipeline';

interface FinishingEntryFormProps {
  onBack?: () => void;
  workOrders?: WorkOrder[];
  existingFinishingRecords?: FinishingRecord[];
  existingKancingRecords?: KancingRecord[];
}

const penjahitList = ['Budi Santoso', 'Ani Wulandari', 'Caca', 'Dedi Kurniawan', 'Eka Prasetya', 'Fitri Handayani'];

export default function FinishingEntryForm({ onBack, workOrders: externalWorkOrders, existingFinishingRecords: externalFinishingRecords, existingKancingRecords: externalUpstreamRecords }: FinishingEntryFormProps) {
  const { profile } = useAuth();
  const currentDisplayName = profile.displayName;
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(externalWorkOrders ?? []);
  const [existingFinishingRecords, setExistingFinishingRecords] = useState<FinishingRecord[]>(externalFinishingRecords ?? []);
  const [upstreamRecords, setUpstreamRecords] = useState<KancingRecord[]>(externalUpstreamRecords ?? []);
  const [selection, setSelection] = useState(EMPTY_ENTRY_SELECTION);
  const { woId } = selection;
  const [pic, setPic] = useState('');
  const [qty, setQty] = useState('');
  const [tanggal, setTanggal] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isLoading, setLoading] = useState(externalWorkOrders === undefined || externalFinishingRecords === undefined || externalUpstreamRecords === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSources, setLoadedSources] = useState({ orders: externalWorkOrders, own: externalFinishingRecords, upstream: externalUpstreamRecords, reloadKey: 0 });
  const loading = isLoading || loadedSources.orders !== externalWorkOrders || loadedSources.own !== externalFinishingRecords || loadedSources.upstream !== externalUpstreamRecords || loadedSources.reloadKey !== reloadKey;

  useEffect(() => {
    let active = true;
    Promise.all([
      externalWorkOrders !== undefined ? { data: externalWorkOrders, error: null } : workOrderSvc.fetchAll(),
      externalFinishingRecords !== undefined ? { data: externalFinishingRecords, error: null } : finishingRecordSvc.fetchAll(),
      externalUpstreamRecords !== undefined ? { data: externalUpstreamRecords, error: null } : upstreamRecordSvc.fetchAll(),
    ])
      .then(([orders, records, upstream]) => {
        if (!active) return;
        if (orders.error || records.error || upstream.error || !orders.data || !records.data || !upstream.data) {
          setLoadError('Data produksi belum dapat dimuat. Coba lagi.');
          return;
        }
        setWorkOrders(orders.data);
        setExistingFinishingRecords(records.data);
        setUpstreamRecords(upstream.data);
        setLoadError(null);
      })
      .catch(() => { if (active) setLoadError('Data produksi belum dapat dimuat. Coba lagi.'); })
      .finally(() => {
        if (!active) return;
        setLoadedSources({ orders: externalWorkOrders, own: externalFinishingRecords, upstream: externalUpstreamRecords, reloadKey });
        setLoading(false);
      });
    return () => { active = false; };
  }, [externalWorkOrders, externalFinishingRecords, externalUpstreamRecords, reloadKey]);

  const upstreamTotals = useMemo(
    () => entryQuantitiesByWorkOrder(upstreamRecords, (r) => r.qtyKancing),
    [upstreamRecords],
  );
  const ownTotals = useMemo(
    () => entryQuantitiesByWorkOrder(existingFinishingRecords, (r) => r.qtyFinishing),
    [existingFinishingRecords],
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
  const sudahFinishing = selectedWO
    ? existingFinishingRecords.filter((r) => r.workOrderId === selectedWO.id).reduce((sum, r) => sum + (Number(r.qtyFinishing) || 0), 0)
    : 0;
  const sisaFinishing = selectedWO ? selectedWO.quantity - sudahFinishing : 0;
  const isQtyValid = isEntryQuantityValid(qty);
  const isFormValid = Boolean(selectedWO && pic && isQtyValid && tanggal);

  const showPic = Boolean(selectedWO && isQtyValid);
  const showDetails = Boolean(showPic && pic);
  const busy = isSubmitting || success;

  const handleSubmit = async () => {
    if (!isFormValid || !selectedWO || isSubmitting || success) return;
    setSubmitError(null);
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
      setSubmitError('Entry belum tersimpan. Coba simpan lagi.');
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
    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-6">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Button type="button" variant="link" onClick={() => onBack?.()} className="h-auto justify-start p-0 text-xs text-muted-foreground"><ArrowLeft /> Kembali ke Production Monitoring</Button>
            <h1 className="text-lg font-semibold text-foreground">Entry Finishing Baru</h1>
          </div>
          <span className="max-w-full break-words text-xs text-muted-foreground">{currentDisplayName}</span>
        </header>

        {success && <Alert><CheckCircle /><AlertDescription>Entry berhasil disimpan! Mengalihkan...</AlertDescription></Alert>}
        {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}

        <WorkOrderCardPicker
          id="finishing-orders" orders={availableWO} selectedId={woId} onSelect={handleWorkOrderSelect}
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
                  <div><dt className="text-xs text-muted-foreground">Terfinishing</dt><dd className="font-medium tabular-nums">{sudahFinishing} pcs</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Sisa Finishing (vs Qty Order)</dt><dd className="font-medium tabular-nums">{selectedWO.quantity > 0 ? `${sisaFinishing} pcs` : '—'}</dd></div>
                </dl>
              )}
              <Field data-invalid={qty !== '' && !isQtyValid}>
                <FieldLabel htmlFor="finishing-qty">1. Jumlah Finishing (pcs) *</FieldLabel>
                <NumberField id="finishing-qty" value={qty} onChange={setQty} min={1} placeholder="Contoh: 30" />
                {qty !== '' && !isQtyValid && <FieldDescription className="text-destructive">Jumlah harus berupa bilangan bulat positif.</FieldDescription>}
              </Field>
              <div hidden={!showPic}>
                <Field>
                  <FieldLabel htmlFor="finishing-pic-trigger">2. Finisher *</FieldLabel>
                  <AppSelect key={woId} bare id="finishing-pic" required value={pic} onValueChange={setPic} disabled={busy || !showPic}
                    placeholder="Pilih Finisher" options={toOptions(penjahitList)} />
                </Field>
              </div>
              <div hidden={!showDetails} className={showDetails ? 'flex min-w-0 flex-col gap-5' : 'hidden'}>
                <Field>
                  <FieldLabel htmlFor="finishing-image-upload">3. Attachment (opsional)</FieldLabel>
                  <FileUploadField id="finishing-image-upload" onChange={setImageFile} disabled={busy || !showDetails} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="finishing-tanggal">Tanggal Laporan</FieldLabel>
                  <DatePickerField id="finishing-tanggal" value={tanggal} onChange={setTanggal} maxDate={new Date()} />
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
