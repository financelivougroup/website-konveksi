import { useRef, useState } from 'react';
import type { ComponentProps, FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/Table/DataTable';
import { useAuth } from '@/contexts/AuthContext';
import { payBenefit, voidBenefit } from '@/services/staffSettlement';
import type { StaffSettlement } from '@/services/staffSettlement';

type Props = { person: StaffSettlement | null; onClose: () => void; onChanged: () => Promise<void> };
type Columns = ComponentProps<typeof DataTable>['columns'];
const money = (value: unknown) => value == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));
const column = (key: string, label: string, currency = false): Columns[number] => ({
  key, label, width: currency ? '155px' : '140px',
  render: row => currency ? money(row[key]) : String(row[key] ?? '—'),
});
const monthColumns: Columns = [column('month', 'Bulan'), column('target', 'Target'), column('actual', 'Aktual'),
  column('extra', 'Extra (pcs)'), column('cost', 'Cost', true), column('salary', 'Gaji', true),
  column('benefit', 'Benefit bruto', true), column('debtBeforeBenefit', 'Utang sebelum benefit', true),
  column('benefitOffset', 'Benefit potong utang', true), column('paid', 'Tunai dibayar kumulatif', true),
  column('debt', 'Sisa utang', true), column('payable', 'Dapat dibayar', true),
  { key: 'is_final', label: 'Periode', width: '120px', render: row => row.is_final ? 'Final' : 'Provisional' }];
const entryColumns: Columns = [column('date', 'Tanggal kerja'), column('inputAt', 'Waktu input'),
  column('productNote', 'Product Note'), column('product', 'Produk'), column('warna', 'Warna'),
  column('pcs', 'Pcs'), column('rate', 'Tarif/pcs', true), column('extra', 'Extra (pcs)'),
  column('cost', 'Cost', true), column('benefit', 'Benefit', true), column('provenance', 'Sumber tarif')];
const paymentColumns: Columns = [column('paid_date', 'Tanggal bayar'), column('amount', 'Jumlah', true),
  column('cutoff_month', 'Cutoff'), column('expense_id', 'Expense ID'), column('original_expense_id', 'Expense asal'),
  column('reason', 'Alasan'), column('voided_at', 'Dibatalkan pada')];
function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function StaffSettlementDialog({ person, onClose, onChanged }: Props) {
  return <Dialog open={person !== null} onOpenChange={open => { if (!open) onClose(); }}>
    {person && <SettlementContent key={person.staffId} person={person} onClose={onClose} onChanged={onChanged} />}
  </Dialog>;
}

function SettlementContent({ person, onClose, onChanged }: Omit<Props, 'person'> & { person: StaffSettlement }) {
  const { profile } = useAuth();
  const canPay = profile.role === 'owner' || profile.role === 'finance';
  const [month, setMonth] = useState(person.months.at(-1)?.month ?? '');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(localToday);
  const [reason, setReason] = useState('');
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [error, setError] = useState('');
  const guard = useRef(false);
  const requests = useRef(new Map<string, string>());
  const chosen = person.months.find(item => item.month === month);
  const today = localToday();
  const cutoffMonth = person.cutoff?.slice(0, 7);
  const cutoffDate = cutoffMonth && /^\d{4}-\d{2}$/.test(cutoffMonth)
    ? `${cutoffMonth}-${new Date(Number(cutoffMonth.slice(0, 4)), Number(cutoffMonth.slice(5, 7)), 0).getDate()}` : '';
  const eligible = canPay && person.enabled && person.complete && person.finalPayable > 0;
  const valid = eligible && Number.isSafeInteger(Number(amount)) && Number(amount) > 0 && Number(amount) <= person.finalPayable
    && /^\d{4}-\d{2}-\d{2}$/.test(paidDate) && !!cutoffDate && paidDate >= cutoffDate && paidDate <= today && reason.trim().length >= 3;
  async function reload() {
    await onChanged();
    requests.current.clear();
    setReloadNeeded(false);
    setAmount('');
    setReason('');
    setVoidId(null);
    setVoidReason('');
  }
  async function run(action?: () => Promise<unknown>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    let mutated = false;
    try {
      if (action) { await action(); mutated = true; setReloadNeeded(true); }
      await reload();
    } catch (cause) {
      setError(`${mutated || reloadNeeded ? 'Transaksi sudah tersimpan. Muat ulang; jangan ulangi transaksi. ' : ''}${cause instanceof Error ? cause.message : 'Permintaan gagal.'}`);
    } finally { guard.current = false; setBusy(false); }
  }
  function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy || reloadNeeded || guard.current) return;
    const payload = { staffId: person.staffId, amount: Number(amount), paidDate, reason: reason.trim(), fingerprint: person.fingerprint };
    const key = JSON.stringify(payload);
    const requestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, requestId);
    void run(() => payBenefit({ ...payload, requestId }));
  }
  const locked = busy || reloadNeeded;
  return <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] min-w-0 max-w-6xl overflow-y-auto sm:max-w-6xl [&>*]:min-w-0" showCloseButton={!busy}
    onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>Rincian benefit — {person.nama}</DialogTitle>
      <DialogDescription>{person.posisi ?? 'Staf'} · Cutoff final: {person.cutoff ?? 'Belum tersedia'} · Saldo final: {money(person.finalPayable)}</DialogDescription></DialogHeader>
    {!person.enabled && <p role="status" className="text-sm text-destructive">Pembayaran dinonaktifkan sampai verifikasi baseline dan transaksi lengkap.</p>}
    {!person.complete && <p role="status" className="text-sm text-destructive">Data belum lengkap; saldo belum dapat digunakan untuk pembayaran.</p>}
    <p className="text-sm">Utang sebelum benefit: {money(person.debtBeforeBenefit)} · Benefit potong utang: {money(person.benefitOffset)} · Sisa utang: {money(person.debt)}.</p>
    <p className="text-xs text-muted-foreground">Potongan utang otomatis, bukan pembayaran tunai/Expense. Hanya sisa benefit setelah potongan yang dapat dibayar dari bulan final.</p>
    <DataTable variant="plain" columns={monthColumns} data={person.months.map(item => ({ ...item, id: item.month }))} />
    <section className="min-w-0 space-y-3" aria-label="Rincian bulan">
      <h3 className="text-sm font-semibold">Rincian entry per bulan</h3>
      <div className="flex flex-wrap gap-2">{person.months.map(item => <Button key={item.month} size="sm" variant={month === item.month ? 'default' : 'outline'} aria-pressed={month === item.month} onClick={() => setMonth(item.month)}>{item.month}</Button>)}</div>
      {chosen && <>
        {chosen.entries.some(entry => entry.provenance === 'baseline_unverified') && <p className="text-xs text-muted-foreground">Tarif baseline: estimasi historis belum terverifikasi.</p>}
        {(chosen.missing_rate > 0 || chosen.missing_target || chosen.identity_issue || chosen.salaryMissing) && <p role="status" className="text-sm text-destructive">
          {chosen.missing_rate > 0 && `Tarif hilang: ${chosen.missing_rate}. `}{chosen.missing_target && 'Target belum tersedia. '}
          {chosen.identity_issue && 'Identitas entry perlu diperiksa. '}{chosen.salaryMissing && 'Gaji belum tersedia.'}
        </p>}
        <DataTable variant="plain" columns={entryColumns} data={chosen.entries.map(entry => ({ ...entry }))} />
      </>}
    </section>
    <section className="min-w-0 space-y-3" aria-label="Riwayat pembayaran">
      <h3 className="text-sm font-semibold">Riwayat pembayaran benefit</h3>
      <DataTable variant="plain" columns={paymentColumns} data={person.payments.map(payment => ({ ...payment }))}
        rowActions={canPay ? row => !row.voided_at && <Button size="sm" variant="outline" disabled={locked} onClick={() => { setVoidId(String(row.id)); setVoidReason(''); }}>Batalkan</Button> : undefined} />
      {canPay && voidId && <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        if (!locked && voidReason.trim().length >= 3) void run(() => voidBenefit(voidId, voidReason.trim()));
      }}>
        <div className="flex-1 space-y-2"><Label htmlFor="settlement-void-reason">Alasan pembatalan pembayaran {voidId}</Label><Input id="settlement-void-reason" required minLength={3} value={voidReason} disabled={locked} onChange={event => setVoidReason(event.target.value)} /></div>
        <Button type="submit" variant="destructive" disabled={locked || voidReason.trim().length < 3}>Konfirmasi pembatalan</Button>
        <Button type="button" variant="outline" disabled={locked} onClick={() => setVoidId(null)}>Batal</Button>
      </form>}
    </section>
    {canPay && <form onSubmit={pay} className="space-y-3">
      <h3 className="text-sm font-semibold">Bayar benefit (saldo final {money(person.finalPayable)})</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2"><Label htmlFor="settlement-amount">Jumlah rupiah (boleh sebagian)</Label><Input id="settlement-amount" type="number" min={1} max={person.finalPayable} step={1} required value={amount} disabled={locked || !eligible} onChange={event => setAmount(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="settlement-date">Tanggal bayar</Label><Input id="settlement-date" type="date" min={cutoffDate || undefined} max={today} required value={paidDate} disabled={locked || !eligible} onChange={event => setPaidDate(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="settlement-reason">Alasan (minimal 3 karakter)</Label><Input id="settlement-reason" required minLength={3} value={reason} disabled={locked || !eligible} onChange={event => setReason(event.target.value)} /></div>
      </div>
      <Button type="submit" disabled={locked || !valid}>{busy ? 'Memproses…' : 'Bayar benefit'}</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => void run()}>Muat ulang{reloadNeeded ? ' setelah transaksi' : ''}</Button><Button variant="outline" disabled={busy} onClick={onClose}>Tutup</Button></div>
  </DialogContent>;
}
