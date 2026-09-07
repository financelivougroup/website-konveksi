import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Plus, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  createPayment,
  fetchPaymentsByInvoiceId,
  removePayment,
  updatePayment,
} from '@/services/invoicePayments';
import {
  createPaymentFileRecord,
  fetchFilesByPaymentIds,
  removePaymentFile,
  removePaymentProofObject,
  removePaymentProofObjects,
  uploadPaymentProof,
} from '@/services/invoicePaymentFiles';
import { updateInvoice, updateWorkOrderInvoiceStatus } from '@/services/invoices';
import { computeFinanceValidation, computeOutstanding } from '@/lib/invoiceCompute';
import type { InvoicePaymentFileRow, InvoiceRow } from '@/types/pipeline';

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
  paymentId: string | null;
  paymentDate: string;
  amount: string;
  existingProofs: InvoicePaymentFileRow[];
  removedProofIds: string[];
  newProofs: File[];
}

const newDraftRow = (): DraftRow => ({
  localId: crypto.randomUUID(),
  paymentId: null,
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: '',
  existingProofs: [],
  removedProofIds: [],
  newProofs: [],
});

const formatCurrency = (n: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
}).format(n);

function keptProofs(row: DraftRow): InvoicePaymentFileRow[] {
  return row.existingProofs.filter((f) => !row.removedProofIds.includes(f.id));
}

function proofCount(row: DraftRow): number {
  return keptProofs(row).length + row.newProofs.length;
}

function parseAmount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function PaymentModal({ open, invoice, onClose, onSaved, onError, onSuccess }: PaymentModalProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [rows, setRows] = useState<DraftRow[]>([newDraftRow()]);
  // Baris termin yang disembunyikan saat mode cash — dipulihkan bila user kembali ke termin.
  const [stashedRows, setStashedRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmCash, setConfirmCash] = useState(false);
  const [loadedPaymentIds, setLoadedPaymentIds] = useState<string[]>([]);
  const [proofsByPayment, setProofsByPayment] = useState<Record<string, InvoicePaymentFileRow[]>>({});
  const loadRequestRef = useRef(0);

  const reload = useCallback(async (target: InvoiceRow) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    const { data: payments, error } = await fetchPaymentsByInvoiceId(target.id);
    if (requestId !== loadRequestRef.current) return;
    if (error) {
      setLoadError(`Gagal load payment: ${error.message}`);
      setLoading(false);
      return;
    }
    const list = payments ?? [];
    const { data: files, error: filesError } = await fetchFilesByPaymentIds(list.map((p) => p.id));
    if (requestId !== loadRequestRef.current) return;
    if (filesError) {
      setLoadError(`Gagal load bukti pembayaran: ${filesError.message}`);
      setLoading(false);
      return;
    }

    const byPayment: Record<string, InvoicePaymentFileRow[]> = {};
    for (const f of files ?? []) {
      (byPayment[f.paymentId] ??= []).push(f);
    }
    setProofsByPayment(byPayment);
    setLoadedPaymentIds(list.map((p) => p.id));

    const cashOnly = list.filter((p) => p.paymentType === 'cash');
    const terminOnly = list.filter((p) => p.paymentType === 'termin');
    if (list.length > 0 && (cashOnly.length > 1 || (cashOnly.length > 0 && terminOnly.length > 0))) {
      setLoadError('Data payment tidak konsisten. Pembayaran cash harus satu baris dan tidak boleh bercampur dengan termin.');
      setPaymentType('cash');
      setRows([]);
      setStashedRows([]);
      setLoading(false);
      return;
    }

    const type: PaymentType = list.length === 0 || cashOnly.length > 0 ? 'cash' : 'termin';
    setPaymentType(type);
    setRows(
      list.length === 0
        ? [newDraftRow()]
        : list.map((p) => ({
            localId: crypto.randomUUID(),
            paymentId: p.id,
            paymentDate: p.paymentDate,
            amount: String(p.amount),
            existingProofs: byPayment[p.id] ?? [],
            removedProofIds: [],
            newProofs: [],
          })),
    );
    setStashedRows([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open || !invoice) {
      loadRequestRef.current += 1;
      setRows([newDraftRow()]);
      setStashedRows([]);
      setLoadedPaymentIds([]);
      setProofsByPayment({});
      return;
    }
    setPaymentType('cash');
    setRows([newDraftRow()]);
    setStashedRows([]);
    setLoadedPaymentIds([]);
    setProofsByPayment({});
    setLoadError(null);
    void reload(invoice);
  }, [open, invoice, reload]);

  const paymentTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (parseAmount(r.amount) ?? 0), 0),
    [rows],
  );

  const validation = useMemo(() => {
    const rowMessages: Record<string, string[]> = {};
    const blockers: string[] = [];
    if (paymentType === 'cash' && rows.length !== 1) {
      blockers.push('Pembayaran cash harus tepat 1 baris.');
    }
    if (paymentType === 'termin' && rows.length === 0) {
      blockers.push('Minimal 1 termin.');
    }
    for (const r of rows) {
      const msgs: string[] = [];
      if (!r.paymentDate) msgs.push('Tanggal pembayaran wajib diisi.');
      if (parseAmount(r.amount) === null) msgs.push('Nominal harus angka bulat lebih dari 0.');
      if (proofCount(r) === 0) msgs.push('Minimal 1 bukti pembayaran.');
      if (msgs.length > 0) rowMessages[r.localId] = msgs;
    }
    if (Object.keys(rowMessages).length > 0) {
      blockers.push('Lengkapi semua baris pembayaran.');
    }
    return { rowMessages, blockers };
  }, [paymentType, rows]);

  if (!invoice) return null;

  const outstanding = computeOutstanding(invoice.totalAmount, paymentTotal);
  const isOverpayment = paymentTotal > invoice.totalAmount;
  const canSave = !loading && !submitting && !loadError && validation.blockers.length === 0;

  function updateRow(localId: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function addTerminRow() {
    setRows((prev) => [...prev, newDraftRow()]);
  }

  function removeRow(localId: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== localId)));
  }

  function requestTypeChange(next: PaymentType) {
    if (next === paymentType) return;
    if (next === 'cash') {
      if (rows.length > 1) {
        setConfirmCash(true);
        return;
      }
      setPaymentType('cash');
      return;
    }
    // cash -> termin: baris pertama dipertahankan (ikut identitas & buktinya).
    setPaymentType('termin');
    if (stashedRows.length > 0) {
      setRows((prev) => [...prev, ...stashedRows]);
      setStashedRows([]);
    }
  }

  function applyCashSwitch() {
    setConfirmCash(false);
    setStashedRows(rows.slice(1));
    setRows(rows.slice(0, 1));
    setPaymentType('cash');
  }

  async function handleSave() {
    if (!invoice) {
      onError('Invoice tidak ditemukan.');
      return;
    }
    if (validation.blockers.length > 0) {
      onError(validation.blockers[0]);
      return;
    }
    const targetInvoice: InvoiceRow = invoice;

    const snapshot = rows.map((r) => ({ ...r }));
    const invoiceId = targetInvoice.id;
    setSubmitting(true);

    const createdPaymentIds: string[] = [];
    const createdArtifacts: { fileId: string; filePath: string }[] = [];
    const plannedIds: string[] = [];

    async function abortSave(message: string, rollback: boolean) {
      if (rollback) {
        for (const artifact of [...createdArtifacts].reverse()) {
          const { error } = await removePaymentFile(artifact.fileId);
          if (error) await removePaymentProofObject(artifact.filePath);
        }
        for (const paymentId of [...createdPaymentIds].reverse()) {
          await removePayment(paymentId, invoiceId);
        }
      }
      onError(message);
      await reload(targetInvoice);
      setSubmitting(false);
    }

    try {
      // ===== Fase 1: create row baru. Gagal di sini tidak perlu rollback. =====
      for (let i = 0; i < snapshot.length; i++) {
        const r = snapshot[i];
        if (r.paymentId) {
          plannedIds.push(r.paymentId);
          continue;
        }
        const { data: created, error } = await createPayment({
          invoiceId,
          paymentType,
          terminNo: paymentType === 'cash' ? null : i + 1,
          paymentDate: r.paymentDate,
          amount: parseAmount(r.amount) ?? 0,
        });
        if (error || !created) {
          await abortSave(`Gagal simpan payment #${i + 1}: ${error?.message ?? 'unknown'}`, true);
          return;
        }
        r.paymentId = created.id;
        createdPaymentIds.push(created.id);
        plannedIds.push(created.id);
      }

      // ===== Fase 2: upload bukti baru. Upload gagal menghapus row baru, bukan row lama. =====
      for (const r of snapshot) {
        const paymentId = r.paymentId as string;
        for (const file of r.newProofs) {
          const upload = await uploadPaymentProof({ invoiceId, paymentId, file });
          if (upload.error) {
            await abortSave(`Upload gagal (${file.name}): ${upload.error.message}`, true);
            return;
          }
          const { data: createdFile, error: recordError } = await createPaymentFileRecord({
            paymentId,
            fileName: upload.fileName,
            filePath: upload.filePath,
            fileUrl: upload.fileUrl,
          });
          if (recordError || !createdFile) {
            const cleanup = await removePaymentProofObject(upload.filePath);
            await abortSave(
              `Gagal catat bukti (${file.name}): ${recordError?.message ?? 'unknown'}${
                cleanup.error ? ` · file Storage gagal dibersihkan: ${cleanup.error.message}` : ''
              }`,
              true,
            );
            return;
          }
          createdArtifacts.push({ fileId: createdFile.id, filePath: createdFile.filePath });
          setProofsByPayment((previous) => ({
            ...previous,
            [paymentId]: [...(previous[paymentId] ?? []), createdFile],
          }));
          setRows((previous) => previous.map((candidate) => (
            candidate.localId === r.localId
              ? {
                  ...candidate,
                  existingProofs: [...candidate.existingProofs, createdFile],
                  newProofs: candidate.newProofs.filter((candidateFile) => candidateFile !== file),
                }
              : candidate
          )));
        }
      }

      // ===== Fase 3: update row existing. Bukti baru sudah tersimpan duluan. =====
      for (let i = 0; i < snapshot.length; i++) {
        const r = snapshot[i];
        // Row baru sudah berisi nilai akhir saat dibuat; hanya row existing yang di-update.
        if (!r.paymentId || createdPaymentIds.includes(r.paymentId)) continue;
        const { error } = await updatePayment(r.paymentId, invoiceId, {
          paymentDate: r.paymentDate,
          amount: parseAmount(r.amount) ?? 0,
          paymentType,
          terminNo: paymentType === 'cash' ? null : i + 1,
        });
        if (error) {
          await abortSave(`Gagal update payment #${i + 1}: ${error.message}`, true);
          return;
        }
      }

      // ===== Fase 4: operasi destruktif terakhir. =====
      for (const r of snapshot) {
        for (const fileId of r.removedProofIds) {
          const { error, cleanupError } = await removePaymentFile(fileId);
          if (error) {
            await abortSave(`Payment tersimpan, tapi gagal hapus bukti: ${error.message}`, false);
            return;
          }
          if (cleanupError) {
            await abortSave(
              `Bukti belum dihapus karena file Storage gagal dibersihkan: ${cleanupError.message}`,
              false,
            );
            return;
          }
        }
      }

      const removedIds = loadedPaymentIds.filter((id) => !plannedIds.includes(id));
      const orphanPaths: string[] = [];
      for (const id of removedIds) {
        const paths = (proofsByPayment[id] ?? []).map((f) => f.filePath);
        const { error } = await removePayment(id, invoiceId);
        if (error) {
          await abortSave(`Payment tersimpan, tapi gagal hapus payment lama: ${error.message}`, false);
          return;
        }
        orphanPaths.push(...paths);
      }
      if (orphanPaths.length > 0) {
        const { error } = await removePaymentProofObjects(orphanPaths);
        if (error) {
          await abortSave(`Payment lama dihapus, tapi file Storage gagal dibersihkan: ${error.message}`, false);
          return;
        }
      }

      // ===== Fase 5: refetch canonical lalu sinkronkan status. =====
      const { data: freshPayments, error: refetchError } = await fetchPaymentsByInvoiceId(invoiceId);
      if (refetchError || !freshPayments) {
        await abortSave(
          `Payment tersimpan, tapi status belum disinkronkan karena gagal load ulang: ${refetchError?.message ?? 'unknown'}`,
          false,
        );
        return;
      }
      const totalPaid = freshPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const newOutstanding = computeOutstanding(targetInvoice.totalAmount, totalPaid);
      const newValidation = computeFinanceValidation({
        hasAllRequiredInvoiceFields: true,
        hasCompletePaymentDetail: totalPaid > 0,
        outstanding: newOutstanding,
      });

      const { error: updateError } = await updateInvoice(invoiceId, { financeValidation: newValidation });
      if (updateError) {
        await abortSave(`Payment tersimpan, tapi gagal update invoice: ${updateError.message}`, false);
        return;
      }

      const woStatus: 'INVOICED' | 'PARTIAL_PAID' | 'PAID' = totalPaid === 0
        ? 'INVOICED'
        : newOutstanding === 0 ? 'PAID' : 'PARTIAL_PAID';
      const { error: woError } = await updateWorkOrderInvoiceStatus(targetInvoice.workOrderId, woStatus);
      if (woError) {
        await abortSave(`Payment tersimpan, tapi gagal update status WO: ${woError.message}`, false);
        return;
      }

      setRows((previous) => previous.map((candidate) => ({ ...candidate, newProofs: [] })));
      onSuccess(`Pembayaran tersimpan. Total dibayar ${formatCurrency(totalPaid)}.`);
      onSaved();
    } catch (error) {
      await abortSave(
        `Gagal menyimpan pembayaran: ${error instanceof Error ? error.message : 'unknown'}`,
        true,
      );
      return;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !submitting) onClose();
        }}
      >
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Payment — {invoice.invoiceCode}</DialogTitle>
            <DialogDescription className="text-[12px]">
              Total tagihan {formatCurrency(invoice.totalAmount)}
              {paymentType === 'termin'
                ? ' · Termin bisa ditambah berkali-kali; yang tampil di tabel adalah total pelunasan.'
                : ' · Pembayaran tunai terdiri dari 1 baris.'}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-[12px] text-slate-500">Memuat data pembayaran…</p>
          ) : (
            <div className="space-y-3">
              {loadError && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>Data pembayaran belum bisa disimpan</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-6">
                <RadioGroup
                  value={paymentType}
                  onValueChange={(v) => requestTypeChange(v as PaymentType)}
                  className="flex items-center gap-6"
                  disabled={submitting}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="cash" id="pay-type-cash" />
                    <Label htmlFor="pay-type-cash">Cash</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="termin" id="pay-type-termin" />
                    <Label htmlFor="pay-type-termin">Termin</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                {rows.map((row, idx) => {
                  const kept = keptProofs(row);
                  const msgs = validation.rowMessages[row.localId] ?? [];
                  return (
                    <div key={row.localId} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-slate-700">
                          {paymentType === 'cash' ? 'Cash' : `Termin ${idx + 1}`}
                        </span>
                        {paymentType === 'termin' && rows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-red-600 hover:bg-red-50"
                            onClick={() => removeRow(row.localId)}
                            disabled={submitting}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Hapus termin
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor={`date-${row.localId}`} className="text-[11px]">Tanggal Pembayaran</Label>
                          <Input
                            id={`date-${row.localId}`}
                            type="date"
                            value={row.paymentDate}
                            onChange={(e) => updateRow(row.localId, { paymentDate: e.target.value })}
                            className="h-8 text-[12px]"
                            disabled={submitting}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`amount-${row.localId}`} className="text-[11px]">Nominal</Label>
                          <Input
                            id={`amount-${row.localId}`}
                            type="number"
                            min={1}
                            value={row.amount}
                            onChange={(e) => updateRow(row.localId, { amount: e.target.value })}
                            className="h-8 text-[12px] text-right"
                            disabled={submitting}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor={`proof-${row.localId}`} className="text-[11px]">
                          Bukti Pembayaran (minimal 1, boleh lebih)
                        </Label>
                        <Input
                          id={`proof-${row.localId}`}
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files ?? []);
                            e.target.value = '';
                            if (picked.length > 0) {
                              updateRow(row.localId, { newProofs: [...row.newProofs, ...picked] });
                            }
                          }}
                          className="h-8 text-[11px] py-1"
                          disabled={submitting}
                        />

                        {(kept.length > 0 || row.newProofs.length > 0) && (
                          <ul className="mt-1.5 space-y-1">
                            {kept.map((f) => (
                              <li key={f.id} className="flex items-center gap-2 text-[11px]">
                                <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                                <a
                                  href={f.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline truncate"
                                >
                                  {f.fileName}
                                </a>
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  onClick={() =>
                                    updateRow(row.localId, {
                                      removedProofIds: [...row.removedProofIds, f.id],
                                    })
                                  }
                                  className="h-auto p-0 text-[11px] text-red-500 shrink-0"
                                  disabled={submitting}
                                >
                                  Hapus
                                </Button>
                              </li>
                            ))}
                            {row.removedProofIds.length > 0 && (
                              <li>
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  onClick={() => updateRow(row.localId, { removedProofIds: [] })}
                                  className="h-auto p-0 gap-1 text-[11px] text-slate-500"
                                  disabled={submitting}
                                >
                                  <Undo2 className="w-3 h-3" /> Batalkan {row.removedProofIds.length} penghapusan bukti
                                </Button>
                              </li>
                            )}
                            {row.newProofs.map((f, i) => (
                              <li key={`new-${i}`} className="flex items-center gap-2 text-[11px]">
                                <Paperclip className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="text-slate-700 truncate">{f.name}</span>
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  onClick={() =>
                                    updateRow(row.localId, {
                                      newProofs: row.newProofs.filter((_, idx2) => idx2 !== i),
                                    })
                                  }
                                  className="h-auto p-0 text-[11px] text-red-500 shrink-0"
                                  disabled={submitting}
                                >
                                  Batal
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {msgs.length > 0 && (
                          <p className="mt-1 text-[11px] text-red-600">{msgs.join(' ')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {paymentType === 'termin' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={addTerminRow}
                  disabled={submitting}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Termin
                </Button>
              )}

              {isOverpayment && (
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>Total pembayaran melebihi tagihan</AlertTitle>
                  <AlertDescription>
                    Kelebihan {formatCurrency(paymentTotal - invoice.totalAmount)}. Pembayaran tetap bisa disimpan
                    dan sisa ditampilkan Rp 0.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                <Stat label="Total Dibayar" value={formatCurrency(paymentTotal)} />
                <Stat label="Sisa" value={formatCurrency(outstanding)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canSave}>
              {submitting ? 'Saving…' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCash} onOpenChange={setConfirmCash}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ubah ke pembayaran cash?</AlertDialogTitle>
            <AlertDialogDescription>
              Hanya termin pertama yang dipertahankan. {rows.length - 1} termin lainnya akan dihapus permanen
              setelah Anda menyimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={applyCashSwitch}>Ubah ke Cash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-slate-50">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-[13px] font-semibold text-slate-700">{value}</div>
    </div>
  );
}
