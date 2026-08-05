import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModalShell } from './ModalShell';
import { fetchEligibleWorkOrders } from '@/services/eligibleWorkOrders';
import {
  createInvoiceAuto,
  fetchMaxSequenceNumber,
  updateWorkOrderInvoiceStatus,
} from '@/services/invoices';
import { fetchRegisterPoByProductionOrderId } from '@/services/registerPo';
import {
  billingTypeCode,
  buildInvoiceCode,
  clientCodeFromBrand,
} from '@/lib/invoiceCode';
import { computeInvoiceFinancials } from '@/lib/invoiceCompute';
import { deriveBillingType } from '@/lib/autoInvoice';
import { formatMonthYear } from '@/lib/monthYear';
import type { WorkOrder } from '@/types/pipeline';

interface InvoiceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type BillingType = 'mass_production' | 'sample_production';

export function InvoiceFormModal({
  open,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: InvoiceFormModalProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loadingWO, setLoadingWO] = useState(false);
  const [loadingRegisterPo, setLoadingRegisterPo] = useState(false);

  const [workOrderId, setWorkOrderId] = useState('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [rateManpower, setRateManpower] = useState<string>('30000');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const selectedWO = useMemo(
    () => workOrders.find((w) => w.id === workOrderId) || null,
    [workOrders, workOrderId],
  );

  const woQuantity = Number(selectedWO?.quantity) || 0;
  const billingType: BillingType = deriveBillingType(woQuantity);
  const unitPriceNum = Number(unitPrice) || 0;
  const rateManpowerNum = Number(rateManpower) || 0;

  const financials = useMemo(
    () => computeInvoiceFinancials({ pcsLinked: woQuantity, unitPrice: unitPriceNum, rateManpower: rateManpowerNum }),
    [woQuantity, unitPriceNum, rateManpowerNum],
  );

  const monthYear = useMemo(() => formatMonthYear(invoiceDate), [invoiceDate]);

  // Load the registered unit price when the Work Order changes.
  const loadRegisterPo = useCallback(async (wo: WorkOrder) => {
    setLoadingRegisterPo(true);
    const po = await fetchRegisterPoByProductionOrderId(wo.sourceOrderId);
    if (po) {
      setUnitPrice(String(po.totalPerPcs));
    }
    setLoadingRegisterPo(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoadingWO(true);
    fetchEligibleWorkOrders()
      .then(({ data, error }) => {
        if (error) {
          onError(`Gagal load work orders: ${error.message}`);
          return;
        }
        setWorkOrders(data ?? []);
      })
      .finally(() => setLoadingWO(false));
    setWorkOrderId('');
    setUnitPrice('');
    setRateManpower('30000');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setSubmitting(false);
  }, [open, onError]);

  useEffect(() => {
    if (selectedWO) {
      loadRegisterPo(selectedWO);
    }
  }, [selectedWO, loadRegisterPo]);

  const isValid =
    selectedWO !== null &&
    woQuantity > 0 &&
    unitPriceNum > 0 &&
    invoiceDate !== '' &&
    rateManpowerNum >= 0;

  const showNegativeOpWarning = unitPriceNum > 0 && rateManpowerNum > 0 && unitPriceNum < rateManpowerNum;

  async function handleSave() {
    if (!selectedWO) {
      onError('Pilih Work Order dulu.');
      return;
    }
    if (unitPriceNum <= 0) {
      onError('Nominal/PCS harus lebih dari 0.');
      return;
    }
    if (!invoiceDate) {
      onError('Tanggal invoice wajib diisi.');
      return;
    }
    if (rateManpowerNum < 0) {
      onError('Rate manpower tidak boleh negatif.');
      return;
    }

    setSubmitting(true);

    let clientCode: string;
    try {
      clientCode = clientCodeFromBrand(selectedWO.brand);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown brand');
      setSubmitting(false);
      return;
    }

    const { sequence, error: seqError } = await fetchMaxSequenceNumber();
    if (seqError) {
      onError(`Gagal ambil sequence: ${seqError.message}`);
      setSubmitting(false);
      return;
    }
    const invoiceCode = buildInvoiceCode({
      billingTypeCodeValue: billingTypeCode(billingType),
      clientCode,
      invoiceDate,
      sequence: sequence + 1,
    });

    // Fetch register_po_id for this WO's production order
    let registerPoId: string | undefined;
    const po = await fetchRegisterPoByProductionOrderId(selectedWO.sourceOrderId);
    if (po) {
      registerPoId = po.id;
    }

    const financeValidation: 'Need Register Invoice' | 'Collect Payment' | 'Partial Paid' | 'Paid' = 'Collect Payment';

    const { data: created, error: createError } = await createInvoiceAuto({
      workOrderId: selectedWO.id,
      registerPoId,
      autoCreated: false,
      workCode: selectedWO.workCode,
      invoiceCode,
      invoiceDate,
      monthYear,
      clientName: selectedWO.brand,
      clientCode,
      billingType,
      billingTypeCodeValue: billingTypeCode(billingType),
      pcsLinked: woQuantity,
      unitPrice: unitPriceNum,
      totalAmount: financials.totalAmount,
      rateOperational: financials.rateOperational,
      totalIncomeManpower: financials.totalIncomeManpower,
      totalIncomeOperational: financials.totalIncomeOperational,
      financeValidation,
    });
    if (createError || !created) {
      onError(`Gagal simpan invoice: ${createError?.message ?? 'unknown'}`);
      setSubmitting(false);
      return;
    }

    const { error: woError } = await updateWorkOrderInvoiceStatus(selectedWO.id, 'INVOICED');
    if (woError) {
      onError(`Invoice tersimpan, tapi gagal update status WO: ${woError.message}`);
    }

    onSuccess(`Invoice ${invoiceCode} berhasil dibuat`);
    setSubmitting(false);
    onSaved();
  }

  return (
    <ModalShell
      open={open}
      title="Create Invoice"
      onClose={onClose}
      width="640px"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 rounded-lg"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || submitting || loadingRegisterPo}
            className="px-3 py-1.5 text-[12px] text-white bg-sky-400 hover:bg-sky-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save Invoice'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-[12px]">
        <Field label="Work Order *">
          <select
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white"
            disabled={loadingWO}
          >
            <option value="">— Pilih Work Order —</option>
            {workOrders.map((w) => (
              <option key={w.id} value={w.id}>
                {w.workCode} ({w.brand} · {w.quantity} pcs · Finished)
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama Client">
            <input
              type="text"
              value={selectedWO?.brand ?? ''}
              readOnly
              className="w-full h-8 px-2 border border-gray-200 rounded bg-slate-50 text-slate-600"
            />
          </Field>
          <Field label="Kode Client">
            <input
              type="text"
              value={selectedWO ? (() => { try { return clientCodeFromBrand(selectedWO.brand); } catch { return ''; } })() : ''}
              readOnly
              className="w-full h-8 px-2 border border-gray-200 rounded bg-slate-50 text-slate-600"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis Tagihan">
            <input
              type="text"
              value={billingType === 'mass_production' ? 'Mass Production' : 'Sample Production'}
              readOnly
              className="w-full h-8 px-2 border border-gray-200 rounded bg-slate-50 text-slate-600"
            />
          </Field>
          <Field label="Tgl Invoice *">
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="PCS Linked (Qty WO)">
            <input
              type="number"
              value={woQuantity}
              readOnly
              className="w-full h-8 px-2 border border-gray-200 rounded bg-slate-50 text-slate-600 text-right"
            />
          </Field>
          <Field label="Nominal/PCS *">
            <input
              type="number"
              min={1}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white text-right"
            />
          </Field>
          <Field label="Bulan Tahun">
            <input
              type="text"
              value={monthYear}
              readOnly
              className="w-full h-8 px-2 border border-gray-200 rounded bg-slate-50 text-slate-600"
            />
          </Field>
        </div>

        <Field label="Rate Manpower">
          <input
            type="number"
            min={0}
            value={rateManpower}
            onChange={(e) => setRateManpower(e.target.value)}
            className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white text-right"
          />
        </Field>

        {showNegativeOpWarning && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Peringatan: nominal/PCS lebih kecil dari rate manpower. Rate operational akan bernilai negatif.
          </div>
        )}

        <div className="border-t border-gray-100 pt-3 mt-2 grid grid-cols-2 gap-3">
          <Computed label="Total Tagihan" value={financials.totalAmount} currency />
          <Computed label="Rate Operational" value={financials.rateOperational} currency />
          <Computed label="Total Income Manpower" value={financials.totalIncomeManpower} currency />
          <Computed label="Total Income Operational" value={financials.totalIncomeOperational} currency />
        </div>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</span>
      {children}
    </label>
  );
}

function Computed({ label, value, currency }: { label: string; value: number; currency?: boolean }) {
  const display = currency ? `Rp ${value.toLocaleString('id-ID')}` : String(value);
  return (
    <div className="flex items-center justify-between text-[12px] border border-gray-100 rounded px-3 py-2 bg-slate-50">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{display}</span>
    </div>
  );
}