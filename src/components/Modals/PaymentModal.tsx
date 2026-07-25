import { useEffect, useState } from 'react';
import { ModalShell } from './ModalShell';
import {
  createPayment,
  fetchPaymentsByInvoiceId,
  removePaymentsByInvoiceId,
} from '@/services/invoicePayments';
import {
  createPaymentFileRecord,
  uploadPaymentProof,
} from '@/services/invoicePaymentFiles';
import { updateInvoice, updateWorkOrderInvoiceStatus } from '@/services/invoices';
import { computeFinanceValidation, computeOutstanding } from '@/lib/invoiceCompute';
import type { InvoicePaymentRow, InvoiceRow } from '@/types/pipeline';

interface PaymentModalProps {
  open: boolean;
  invoice: InvoiceRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type PaymentType = 'cash' | 'termin';

interface DraftRow {
  localId: string;
  paymentDate: string;
  amount: string;
  files: File[];
}

const newDraftRow = (): DraftRow => ({
  localId: crypto.randomUUID(),
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: '',
  files: [],
});

export function PaymentModal({ open, invoice, onClose, onSaved, onError, onSuccess }: PaymentModalProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [rows, setRows] = useState<DraftRow[]>([newDraftRow()]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingPayments, setExistingPayments] = useState<InvoicePaymentRow[]>([]);

  useEffect(() => {
    if (!open || !invoice) return;
    setLoading(true);
    setPaymentType('cash');
    setRows([newDraftRow()]);
    fetchPaymentsByInvoiceId(invoice.id)
      .then(({ data, error }) => {
        if (error) {
          onError(`Gagal load payment: ${error.message}`);
          return;
        }
        setExistingPayments(data ?? []);
      })
      .finally(() => setLoading(false));
  }, [open, invoice, onError]);

  if (!invoice) return null;

  const paymentTotal = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const outstanding = computeOutstanding(invoice.totalAmount, paymentTotal);
  const hasCompletePaymentDetail = rows.length > 0 && rows.every(
    (r) => r.paymentDate !== '' && Number(r.amount) > 0,
  );
  const hasAllRequiredInvoiceFields = true;
  const financeValidation = computeFinanceValidation({
    hasAllRequiredInvoiceFields,
    hasCompletePaymentDetail,
    outstanding,
  });
  const isOverpayment = paymentTotal > invoice.totalAmount;

  function handleTypeChange(next: PaymentType) {
    setPaymentType(next);
    if (next === 'cash') {
      setRows([newDraftRow()]);
    } else if (rows.length === 0) {
      setRows([newDraftRow()]);
    }
  }

  function updateRow(localId: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function addTerminRow() {
    setRows((prev) => [...prev, newDraftRow()]);
  }

  function removeRow(localId: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== localId)));
  }

  async function handleSave() {
    if (!invoice) {
      onError('Invoice tidak ditemukan.');
      return;
    }
    if (rows.length === 0) {
      onError('Minimal 1 payment row.');
      return;
    }
    for (const r of rows) {
      if (!r.paymentDate) {
        onError('Setiap payment row butuh tanggal.');
        return;
      }
      if (Number(r.amount) <= 0) {
        onError('Nominal payment harus lebih dari 0.');
        return;
      }
    }

    setSubmitting(true);

    const { error: removeError } = await removePaymentsByInvoiceId(invoice.id);
    if (removeError) {
      onError(`Gagal clear payment lama: ${removeError.message}`);
      setSubmitting(false);
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const { data: payment, error: payError } = await createPayment({
        invoiceId: invoice.id,
        paymentType,
        terminNo: paymentType === 'cash' ? null : i + 1,
        paymentDate: r.paymentDate,
        amount: Number(r.amount),
      });
      if (payError || !payment) {
        onError(`Gagal simpan payment #${i + 1}: ${payError?.message ?? 'unknown'}`);
        setSubmitting(false);
        return;
      }

      for (const file of r.files) {
        const upload = await uploadPaymentProof({ invoiceId: invoice.id, paymentId: payment.id, file });
        if (upload.error) {
          onError(`Upload gagal (${file.name}): ${upload.error.message}`);
          setSubmitting(false);
          return;
        }
        const { error: recordError } = await createPaymentFileRecord({
          paymentId: payment.id,
          fileName: upload.fileName,
          filePath: upload.filePath,
          fileUrl: upload.fileUrl,
        });
        if (recordError) {
          onError(`Gagal catat file (${file.name}): ${recordError.message}`);
          setSubmitting(false);
          return;
        }
      }
    }

    const newOutstanding = computeOutstanding(invoice.totalAmount, paymentTotal);
    const newValidation = computeFinanceValidation({
      hasAllRequiredInvoiceFields: true,
      hasCompletePaymentDetail: true,
      outstanding: newOutstanding,
    });

    const { error: updateError } = await updateInvoice(invoice.id, { financeValidation: newValidation });
    if (updateError) {
      onError(`Payment tersimpan, tapi gagal update invoice: ${updateError.message}`);
    }

    const woStatus: 'INVOICED' | 'PARTIAL_PAID' | 'PAID' =
      newOutstanding === 0 ? 'PAID' : 'PARTIAL_PAID';
    const { error: woError } = await updateWorkOrderInvoiceStatus(invoice.workOrderId, woStatus);
    if (woError) {
      onError(`Payment tersimpan, tapi gagal update WO status: ${woError.message}`);
    }

    onSuccess(`Payment tersimpan. Status: ${newValidation}`);
    setSubmitting(false);
    onSaved();
  }

  return (
    <ModalShell
      open={open}
      title={`Payment — ${invoice.invoiceCode}`}
      onClose={onClose}
      width="640px"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting || loading}
            className="px-3 py-1.5 text-[12px] text-white bg-sky-400 hover:bg-sky-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save Payment'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-[12px]">
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={paymentType === 'cash'}
                  onChange={() => handleTypeChange('cash')}
                />
                Cash
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={paymentType === 'termin'}
                  onChange={() => handleTypeChange('termin')}
                />
                Termin
              </label>
            </div>

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div key={row.localId} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {paymentType === 'cash' ? 'Cash' : `Termin ${idx + 1}`}
                    </span>
                    {paymentType === 'termin' && rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.localId)}
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tanggal Pembayaran</span>
                      <input
                        type="date"
                        value={row.paymentDate}
                        onChange={(e) => updateRow(row.localId, { paymentDate: e.target.value })}
                        className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nominal</span>
                      <input
                        type="number"
                        min={1}
                        value={row.amount}
                        onChange={(e) => updateRow(row.localId, { amount: e.target.value })}
                        className="w-full h-8 px-2 border border-gray-200 rounded outline-none bg-white text-right"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bukti Payment (boleh lebih dari 1)</span>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => updateRow(row.localId, { files: Array.from(e.target.files ?? []) })}
                      className="w-full text-[11px]"
                    />
                    {row.files.length > 0 && (
                      <ul className="text-[10px] text-slate-500 mt-1 list-disc list-inside">
                        {row.files.map((f, i) => (
                          <li key={i}>{f.name}</li>
                        ))}
                      </ul>
                    )}
                  </label>
                </div>
              ))}
            </div>

            {paymentType === 'termin' && (
              <button
                onClick={addTerminRow}
                className="text-[11px] text-sky-600 hover:underline"
              >
                + Tambah Termin
              </button>
            )}

            {existingPayments.length > 0 && (
              <div className="text-[10px] text-slate-500 border-t border-gray-100 pt-2">
                {existingPayments.length} payment lama akan diganti saat save.
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-3 text-[11px]">
              <Stat label="Total Payment" value={`Rp ${paymentTotal.toLocaleString('id-ID')}`} />
              <Stat label="Outstanding" value={`Rp ${outstanding.toLocaleString('id-ID')}`} />
              <Stat label="Finance Validation" value={financeValidation} />
            </div>

            {isOverpayment && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Peringatan: total payment melebihi total tagihan (overpayment).
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded px-3 py-2 bg-slate-50">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="font-semibold text-slate-700">{value}</div>
    </div>
  );
}