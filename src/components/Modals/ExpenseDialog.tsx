import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppSelect } from '@/components/AppSelect';
import { PayeeCombobox, type Payee } from '@/components/Expense/PayeeCombobox';
import { toOptions } from '@/components/selectOptions';
import { ComplainDatePicker } from '@/components/ComplainDatePicker';
import { ExpenseCategoryCascade } from '@/components/ExpenseCategoryCascade';
import { FileUploadField } from '@/components/FileUploadField';
import {
  EMPTY_SELECTION,
  type CategorySelection,
} from '@/lib/expenseCategorySelection';
import { entryFromSelection, parseAmount, type ExpenseEntry } from '@/lib/expenseEntries';
import {
  computeTotal,
  computeTotalPayment,
  parseCount,
  parseOptionalAmount,
  validateAmounts,
} from '@/lib/expenseTotals';
import { pathOf, type ExpenseCategory } from '@/lib/expenseCategories';
import { formatCurrency } from '@/lib/utils';
import type { VendorRow } from '@/services/vendors';
import * as expenseSvc from '@/services/expenseEntries';

interface ExpenseDialogProps {
  open: boolean;
  /** Seluruh kategori; dipakai dropdown bertingkat dan penyalinan nama. */
  categories: readonly ExpenseCategory[];
  /** Vendor aktif; dipakai dropdown dan penyalinan nama vendor. */
  vendors: readonly VendorRow[];
  /**
   * Nama karyawan aktif, untuk dropdown PIC.
   *
   * Dikirim halaman, bukan diambil sendiri oleh dialog, supaya Register
   * Karyawan dibaca sekali per halaman dan bukan sekali per pembukaan dialog.
   */
  staffNames: readonly string[];
  /**
   * Karyawan aktif BESERTA id-nya, untuk pilihan pihak yang dibayar.
   *
   * Berbeda dari `staffNames` yang hanya berisi nama: memilih karyawan sebagai
   * penerima gaji perlu id-nya, karena itulah yang tersimpan di `staff_id`.
   */
  staffs: readonly { id: number; nama: string }[];
  /** Baris yang diedit. Bila diisi, dialog jadi mode edit. */
  initial?: ExpenseEntry | null;
  /**
   * Mode baca saja — dipakai aksi "View" pada menu baris.
   *
   * Memakai dialog yang sama, bukan dialog kedua, supaya cara menampilkan isi
   * tidak bisa berbeda antara melihat dan mengubah.
   */
  readOnly?: boolean;
  /** Nama penanggung jawab yang dicatat di baris. */
  actor: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sumber dana — daftar dari user, apa adanya.
 *
 * `REIMBURSEMENT` bukan sekadar salah satu pilihan: memilihnya memunculkan
 * kolom **Proof Payment** (foto bukti bayar dari PIC), karena hanya pengajuan
 * reimburse yang memerlukan bukti serah-terima uang.
 */
const FLOW_TRANSACTION_OPTIONS = [
  'LIVOU TRANSFER',
  'REIMBURSEMENT',
  'SALDO SHOPEE',
  'SALDO LALAMOVE',
  'DEPOSIT CASH',
];

/** Sumber dana yang menuntut bukti pembayaran. */
const FLOW_REQUIRING_PROOF = 'REIMBURSEMENT';

/** Terjemahkan pelanggaran database ke kalimat yang bisa ditindaklanjuti. */
function friendlyError(error: Error): string {
  const message = error.message;
  if (message.includes('expense_entries_amount_check')) {
    return 'Nominal harus lebih besar dari nol.';
  }
  if (message.includes('foreign_key') || message.includes('23503')) {
    // Kategori maupun vendor bisa jadi penyebabnya — keduanya FK di tabel ini.
    return 'Kategori atau vendor yang dipilih tidak ditemukan. Muat ulang halaman lalu coba lagi.';
  }
  if (message.includes('23514')) {
    return 'Nilai yang dikirim ditolak aturan database. Periksa nominal dan tanggalnya.';
  }
  return message;
}

/**
 * Form catat/ubah biaya.
 *
 * Kategori memakai `ExpenseCategoryCascade` — komponen yang sudah ada dan sudah
 * diuji, sehingga aturan "pilihan mengikuti tingkat di atasnya" tidak ditulis
 * ulang di sini.
 *
 * Nominal memakai `<Input type="number">` biasa, BUKAN `NumberField`: komponen
 * itu punya tombol ± dan default `min=1` yang dirancang untuk qty produksi,
 * bukan nominal Rupiah. Preseden untuk input uang ada di PaymentModal.
 */
export function ExpenseDialog({
  open,
  categories,
  vendors,
  staffNames,
  staffs,
  initial = null,
  readOnly = false,
  actor,
  onOpenChange,
  onSaved,
}: ExpenseDialogProps) {
  // Baris dengan id 0 adalah hasil "Duplicate" — belum ada di database, jadi
  // dialog memperlakukannya sebagai pembuatan baru, bukan pengubahan.
  const isEdit = initial !== null && initial.id !== 0;

  const [selection, setSelection] = useState<CategorySelection>(() =>
    initial
      ? {
        typeId: typeIdOf(categories, initial),
        mainId: mainIdOf(categories, initial),
        subId: initial.categoryId,
        itemId: initial.itemId,
      }
      : EMPTY_SELECTION,
  );
  const [date, setDate] = useState(() => initial?.entryDate ?? today());
  const [quantity, setQuantity] = useState(() => (initial ? String(initial.quantity) : ''));
  const [unitPrice, setUnitPrice] = useState(() => (initial ? String(initial.unitPrice) : ''));
  const [shippingAdmin, setShippingAdmin] = useState(() =>
    initial && initial.shippingAdmin ? String(initial.shippingAdmin) : '',
  );
  const [discountCashback, setDiscountCashback] = useState(() =>
    initial && initial.discountCashback ? String(initial.discountCashback) : '',
  );
  const [flowTransaction, setFlowTransaction] = useState(() => initial?.flowTransaction ?? '');
  const [namaBarang, setNamaBarang] = useState(() => initial?.namaBarang ?? '');
  const [pic, setPic] = useState(() => initial?.pic ?? actor ?? '');
  // Satu state untuk dua kemungkinan pihak yang dibayar. Saat memuat baris yang
  // sudah ada, `staffId` yang menang bila terisi — baris gaji tidak punya vendor.
  const [payee, setPayee] = useState<Payee | null>(() => {
    if (initial?.staffId != null) return { kind: 'staff', id: initial.staffId };
    if (initial?.vendorId != null) return { kind: 'vendor', id: initial.vendorId };
    return null;
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPaymentFile, setProofPaymentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Angka yang sedang diketik, untuk menampilkan Total dan Total Payment
  // SEKETIKA — sebelum apa pun disimpan. Nilai yang benar-benar tersimpan tetap
  // dihitung database.
  const parsedQty = parseCount(quantity);
  const parsedPrice = parseAmount(unitPrice);
  const parsedShipping = parseOptionalAmount(shippingAdmin);
  const parsedDiscount = parseOptionalAmount(discountCashback);

  const amounts = {
    quantity: parsedQty ?? 0,
    unitPrice: parsedPrice ?? 0,
    shippingAdmin: parsedShipping ?? 0,
    discountCashback: parsedDiscount ?? 0,
  };
  const previewTotal = parsedQty !== null && parsedPrice !== null
    ? computeTotal(parsedQty, parsedPrice)
    : null;
  // Peringatan dihitung hanya bila komponennya sudah sah, supaya tidak
  // menampilkan keluhan saat user baru mengetik sebagian.
  const amountWarning = parsedQty !== null && parsedPrice !== null
    && parsedShipping !== null && parsedDiscount !== null
    ? validateAmounts(amounts)
    : null;

  const assembled = entryFromSelection(categories, selection, {
    date,
    quantity,
    unitPrice,
    shippingAdmin,
    discountCashback,
    flowTransaction,
    namaBarang,
    pic,
    note: initial?.note ?? '',
    // Pihak yang dibayar dipecah kembali: vendor ATAU karyawan. Aturan "tepat
    // satu" ditegakkan `entryFromSelection`, jadi dialog ini tidak perlu
    // memutuskan sendiri mana yang sah.
    vendorId: payee?.kind === 'vendor' ? payee.id : null,
    vendors,
    staffId: payee?.kind === 'staff' ? payee.id : null,
    staffs,
    proofPaymentPath: initial?.proofPaymentPath ?? null,
    proofPaymentUrl: initial?.proofPaymentUrl ?? null,
    proofPath: initial?.proofPath ?? null,
    proofUrl: initial?.proofUrl ?? null,
    inputBy: initial?.inputBy ?? actor,
  });

  const isValid = assembled !== null;

  async function handleSave() {
    if (!assembled || saving) return;
    setSaving(true);
    setError(null);

    // Sengaja memakai hasil rakitan dari helper murni, bukan menyusun ulang di
    // sini — supaya nama kategori yang tersimpan persis sama dengan yang diuji.
    let saved: ExpenseEntry | null = null;

    if (isEdit) {
      const { data, error: updateError } = await expenseSvc.update(initial.id, assembled);
      if (updateError || !data) {
        setSaving(false);
        setError(friendlyError(updateError ?? new Error('Catatan gagal disimpan.')));
        return;
      }
      saved = data;
    } else {
      const { data, error: createError } = await expenseSvc.create(assembled);
      if (createError || !data) {
        setSaving(false);
        setError(friendlyError(createError ?? new Error('Catatan gagal disimpan.')));
        return;
      }
      saved = data;
    }

    // Lampiran diunggah SETELAH baris tersimpan, karena path-nya memuat id
    // catatan. Kalau unggahan gagal, catatannya sudah tersimpan — itu
    // dilaporkan apa adanya, bukan ditutupi, karena user perlu tahu bahwa
    // notanya belum terlampir dan bisa dilampirkan lewat Edit.
    if (proofFile) {
      const uploaded = await expenseSvc.uploadProof(saved.id, proofFile);
      if (uploaded.error || !uploaded.path || !uploaded.url) {
        setSaving(false);
        setError(
          `Catatan tersimpan, tetapi nota gagal diunggah: ${uploaded.error?.message ?? 'sebab tidak diketahui'}. `
          + 'Buka Edit untuk melampirkan ulang.',
        );
        onSaved(`Catatan ${formatCurrency(saved.totalPayment)} tersimpan tanpa nota.`);
        return;
      }

      const { data: withProof, error: proofError } = await expenseSvc.update(saved.id, {
        ...assembled,
        proofPath: uploaded.path,
        proofUrl: uploaded.url,
      });
      if (proofError) {
        setSaving(false);
        setError(`Nota terunggah, tetapi catatan gagal diperbarui: ${proofError.message}`);
        return;
      }
      // Foto lama dibersihkan setelah yang baru tersimpan; kegagalannya tidak
      // menggagalkan penyimpanan (hanya menyisakan berkas yatim).
      if (isEdit && initial.proofPath) {
        await expenseSvc.removeProofObject(initial.proofPath);
      }
      saved = withProof ?? saved;
    }

    setSaving(false);
    onSaved(
      isEdit
        ? `Catatan ${formatCurrency(saved.totalPayment)} diperbarui.`
        : `Catatan ${formatCurrency(saved.totalPayment)} tersimpan.`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {readOnly ? 'Lihat Catatan Biaya' : isEdit ? 'Edit Catatan Biaya' : 'Catat Biaya Baru'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Form catatan biaya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          {readOnly && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Mode lihat — tidak ada yang bisa diubah di sini.
            </p>
          )}

          <ExpenseCategoryCascade
            rows={categories}
            value={selection}
            onChange={setSelection}
            disabled={saving || readOnly}
            idPrefix="expense"
          />

          {selection.subId !== null && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Jalur kategori</Label>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                {pathOf(categories, selection.itemId ?? selection.subId)}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="expense-payee" className="text-[12px]">
              Vendor / Karyawan
            </Label>
            <PayeeCombobox
              id="expense-payee"
              value={payee}
              onChange={setPayee}
              vendors={vendors}
              staffs={staffs}
              disabled={saving || readOnly}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-nama-barang" className="text-[12px]">
              Nama Barang
            </Label>
            <Input
              id="expense-nama-barang"
              value={namaBarang}
              onChange={(event) => setNamaBarang(event.target.value)}
              placeholder="mis. Benang jahit hitam 40/2"
              className="h-9 text-[13px]"
              disabled={saving || readOnly}
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-date" className="text-[12px]">
                Date Invoice
              </Label>
              <ComplainDatePicker id="expense-date" value={date} onChange={setDate} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-quantity" className="text-[12px]">
                Jumlah
              </Label>
              <Input
                id="expense-quantity"
                type="number"
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="mis. 5"
                className="h-9 text-right text-[13px] tabular-nums"
                disabled={saving || readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-unit-price" className="text-[12px]">
                Harga/Item
              </Label>
              <Input
                id="expense-unit-price"
                type="number"
                min={1}
                inputMode="numeric"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="mis. 150000"
                className="h-9 text-right text-[13px] tabular-nums"
                disabled={saving || readOnly}
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="expense-shipping" className="text-[12px]">Ongkir + Admin</Label>
              <Input
                id="expense-shipping"
                type="number"
                min={0}
                inputMode="numeric"
                value={shippingAdmin}
                onChange={(event) => setShippingAdmin(event.target.value)}
                placeholder="0"
                className="h-9 text-right text-[13px] tabular-nums"
                disabled={saving || readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-discount" className="text-[12px]">Discount/Cashback</Label>
              <Input
                id="expense-discount"
                type="number"
                min={0}
                inputMode="numeric"
                value={discountCashback}
                onChange={(event) => setDiscountCashback(event.target.value)}
                placeholder="0"
                className="h-9 text-right text-[13px] tabular-nums"
                disabled={saving || readOnly}
              />
            </div>

            {/* Total dan Total Payment adalah HASIL HITUNGAN — ditampilkan
                sebagai teks, bukan input, supaya tidak bisa diketik dan tidak
                pernah berbeda dari komponennya. */}
            <div className="space-y-1.5">
              <Label className="text-[12px]">Total</Label>
              <p className="flex h-9 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-3 text-[13px] tabular-nums text-slate-700">
                {previewTotal === null ? '—' : formatCurrency(previewTotal)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Total Payment</Label>
            <p className="flex h-9 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold tabular-nums text-slate-900">
              {previewTotal === null || parsedShipping === null || parsedDiscount === null
                ? '—'
                : formatCurrency(computeTotalPayment(amounts))}
            </p>
          </div>

          {(amountWarning || (parsedQty === null && quantity.trim() !== '') || (parsedPrice === null && unitPrice.trim() !== '')) && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {amountWarning
                ?? 'Jumlah dan Harga/Item harus angka bulat: Jumlah lebih dari nol, Harga/Item lebih dari nol (tanpa titik atau koma).'}
            </p>
          )}

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-flow" className="text-[12px]">
                Flow Transaction
              </Label>
              <AppSelect
                id="expense-flow"
                value={flowTransaction}
                onValueChange={setFlowTransaction}
                options={toOptions(FLOW_TRANSACTION_OPTIONS)}
                placeholder="Pilih sumber dana…"
                disabled={saving || readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-pic" className="text-[12px]">
                PIC
              </Label>
              <AppSelect
                id="expense-pic"
                value={pic}
                onValueChange={setPic}
                options={toOptions(staffNames)}
                placeholder="Pilih PIC…"
                disabled={saving || readOnly}
                emptyMessage="Belum ada karyawan aktif — daftarkan di menu Contact → tab Karyawan."
              />
            </div>
          </div>

          {/* Proof Payment hanya relevan untuk reimburse: hanya pengajuan
              reimburse yang memerlukan bukti serah-terima uang dari PIC. */}
          {flowTransaction === FLOW_REQUIRING_PROOF && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">
                Proof Payment from PIC
              </Label>
              {initial?.proofPaymentUrl && !proofPaymentFile && (
                <div className="mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
                  <img src={initial.proofPaymentUrl} alt="Bukti pembayaran tersimpan" className="h-12 w-12 rounded-md object-cover" />
                  <span className="text-[11px] text-slate-500">
                    {readOnly ? 'Bukti pembayaran terlampir.' : 'Bukti tersimpan. Pilih foto baru untuk menggantinya.'}
                  </span>
                </div>
              )}
              {!readOnly && (
                <FileUploadField id="expense-proof-payment" onChange={setProofPaymentFile} disabled={saving} />
              )}
            </div>
          )}

          {/* "Foto nota" dinamai **Invoice** (permintaan user): yang diunggah
              di sini adalah berkas invoice dari vendor, bukan foto nota
              pembelian. Kolomnya tetap `proof_path` supaya data lama utuh. */}
          <div className="space-y-1.5">
            <Label className="text-[12px]">Invoice</Label>
            {initial?.proofUrl && !proofFile && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
                <img src={initial.proofUrl} alt="Invoice tersimpan" className="h-12 w-12 rounded-md object-cover" />
                <span className="text-[11px] text-slate-500">
                  {readOnly ? 'Invoice terlampir.' : 'Invoice tersimpan. Pilih berkas baru untuk menggantinya.'}
                </span>
              </div>
            )}
            {!readOnly && (
              <FileUploadField id="expense-proof" onChange={setProofFile} disabled={saving} />
            )}
          </div>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {readOnly ? (
            <Button
              type="button"
              className="h-8 text-[12px]"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-[12px]"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="h-8 text-[12px]"
                onClick={() => void handleSave()}
                disabled={!isValid || saving}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tingkat Type dan Main dari sebuah baris tersimpan.
 *
 * Yang tersimpan hanya `category_id` (Sub Category) dan `item_id`, jadi kedua
 * tingkat di atasnya ditelusuri dari pohon kategori lewat namanya — bukan
 * disimpan, karena namanya justru yang disalin.
 */
function typeIdOf(rows: readonly ExpenseCategory[], entry: ExpenseEntry): number | null {
  const sub = rows.find((row) => row.id === entry.categoryId);
  const main = sub?.parentId === null || sub?.parentId === undefined
    ? undefined
    : rows.find((row) => row.id === sub.parentId);
  return main?.parentId ?? null;
}

function mainIdOf(rows: readonly ExpenseCategory[], entry: ExpenseEntry): number | null {
  const sub = rows.find((row) => row.id === entry.categoryId);
  return sub?.parentId ?? null;
}
