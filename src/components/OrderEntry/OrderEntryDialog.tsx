import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CloudDownload,
  Eye,
  History,
  ImagePlus,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { ClientCombobox } from '@/components/OrderEntry/ClientCombobox';
import { ClientProductionCodePicker } from '@/components/OrderEntry/ClientProductionCodePicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { rowClass, T_HEAD_ROW, T_TABLE, T_TD, T_TH } from '@/lib/tableStyles';
import {
  emptyOrderEntryValues,
  hasDuplicateVariations,
  mergeOrderPriceComponents,
  orderEntryErrorMessage,
  orderEntryValuesFromDetail,
  totalOrderPrice,
  totalOrderQuantity,
  variationCombinationKey,
} from '@/lib/orderEntry';
import { buildVariationId } from '@/lib/workOrderIdentity';
import { productPhotoUrl, uploadProductPhoto } from '@/services/productPhotos';
import * as productionOrderSvc from '@/services/productionOrders';
import { fetchLastPrice } from '@/services/registerHarga';
import type {
  LastPriceMatch,
  OrderEntryDetail,
  OrderEntrySaveInput,
  ProductionOrderVariation,
} from '@/types/pipeline';

/**
 * Variasi = identitas saja (warna + size).
 *
 * `quantity` sengaja TIDAK ada di sini. Permintaan user (verbatim): "pada saat
 * Create New Order di Order Entry, kOlOm quantity harusnya dihapus aja" —
 * karena qty itu kuantitas yang diupload client ke POS-nya, bukan angka yang
 * diketik konveksi. Variasi baru lahir dengan qty 0 di database sampai
 * sinkronisasi Pancake POS mengisinya.
 */
const variationSchema = z.object({
  color: z.string().trim().min(1, 'Warna wajib diisi'),
  size: z.string().trim().min(1, 'Size wajib diisi'),
});

const componentSchema = z.object({
  id: z.string().optional(),
  key: z.enum([
    'potong',
    'jahit',
    'obras',
    'finishing',
    'operational',
    'material_basic',
    'margin',
    'jasa_pasang_kancing',
  ]),
  label: z.string(),
  value: z.number().int('Harga harus bilangan bulat').min(0, 'Harga tidak boleh negatif'),
  sortOrder: z.number().optional(),
});

const orderSchema = z.object({
  productionCode: z.string().trim().min(1, 'Kode produksi wajib diisi'),
  clientProductionCode: z.string().trim().min(1, 'Kode produksi client wajib diisi'),
  productId: z.string().trim().min(1, 'Product ID wajib diisi'),
  product: z.string().trim().min(1, 'Product wajib diisi'),
  brand: z.string().trim().min(1, 'Client wajib diisi'),
  variations: z.array(variationSchema).min(1, 'Minimal satu variasi wajib diisi'),
  components: z.array(componentSchema).length(8, 'Delapan komponen harga wajib tersedia'),
}).superRefine((value, context) => {
  if (hasDuplicateVariations(value.variations)) {
    context.addIssue({
      code: 'custom',
      path: ['variations'],
      message: 'Kombinasi warna dan size tidak boleh duplikat',
    });
  }
  if (totalOrderPrice(value.components) <= 0) {
    context.addIssue({
      code: 'custom',
      path: ['components'],
      message: 'Total harga per potong harus lebih dari Rp0',
    });
  }
});

type OrderFormValues = z.infer<typeof orderSchema>;
export type OrderDialogMode = 'create' | 'view' | 'edit';

interface OrderEntryDialogProps {
  open: boolean;
  mode: OrderDialogMode;
  orderId?: string | null;
  actor: string;
  onOpenChange: (open: boolean) => void;
  /** `photoWarning` terisi bila order tersimpan tetapi unggah fotonya gagal. */
  onSaved: (detail: OrderEntryDetail, photoWarning: string | null) => void;
}

function rupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

/**
 * Salinan objek tanpa satu kunci.
 *
 * Menghindari pola `const { [k]: _unused, ...rest }` yang memicu
 * `no-unused-vars` pada banyak konfigurasi ESLint.
 */
function withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> {
  if (!(key in source)) return source;
  const next = { ...source };
  delete next[key];
  return next;
}

/**
 * Peta "warna::size" → id dan path foto variasi yang sudah tersimpan.
 *
 * Kuncinya kombinasi warna+size — bukan indeks baris dan bukan field.id —
 * karena itu satu-satunya identitas yang sama antara data tersimpan dan
 * baris form setelah reset. SQL menahan id variasi dengan kunci yang sama
 * (lihat order_entry_save), jadi foto tidak pindah baris saat diedit.
 */
function mapSavedVariations(variations: readonly ProductionOrderVariation[]) {
  const byCombination = new Map<string, { id: string; photoPath: string | null }>();
  for (const variation of variations) {
    if (!variation.id) continue;
    byCombination.set(variationCombinationKey(variation), {
      id: variation.id,
      photoPath: variation.photoPath ?? null,
    });
  }
  return byCombination;
}

export function OrderEntryDialog({
  open,
  mode,
  orderId,
  actor,
  onOpenChange,
  onSaved,
}: OrderEntryDialogProps) {
  const [detail, setDetail] = useState<OrderEntryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effectiveMode, setEffectiveMode] = useState<OrderDialogMode>(mode);
  /**
   * Dialog "Ambil kode produksi client" dari POS client.
   *
   * Datanya masih fixture — keputusan user: **"UI dulu, API menyusul"**. Lihat
   * `ClientProductionCodePicker` untuk alasan lengkapnya (kredensial belum ada,
   * dan `api_key` Pancake dikirim sebagai query param sehingga wajib lewat
   * proxy server-side).
   */
  const [pickerOpen, setPickerOpen] = useState(false);

  // ===== Foto produk =====
  // Sengaja BUKAN field form Zod: order baru belum punya id saat submit
  // (id dibuat server-side di dalam order_entry_save), sedangkan path
  // unggahan butuh id. Jadi foto diunggah setelah save berhasil — pola
  // yang sama dengan uploadPendingFiles di ComplainPenaltiPage.
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [removedExisting, setRemovedExisting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Menyimpan URL object yang sedang aktif. Pembersihan di cleanup efek
  // berjalan pada closure lama, jadi membaca state di sana bisa basi —
  // ref ini selalu menunjukkan nilai terakhir.
  const previewUrlRef = useRef<string | null>(null);

  // ===== Foto per variasi =====
  // Alur dan alasannya sama dengan foto per order: butuh id, jadi diunggah
  // setelah save.
  //
  // Kuncinya "warna::size", bukan indeks baris dan bukan field.id. Indeks
  // bergeser saat baris dihapus, sedangkan field.id tidak ada padanannya di
  // data tersimpan — kombinasi warna+size adalah satu-satunya identitas yang
  // sama di kedua sisi, dan itulah kunci yang dipakai SQL untuk menahan id
  // variasi.
  const [variationPhotos, setVariationPhotos] = useState<
    Record<string, { file: File; previewUrl: string }>
  >({});
  const [removedVariationPhotos, setRemovedVariationPhotos] = useState<Record<string, true>>({});
  const variationPreviewRef = useRef<Record<string, string>>({});
  /** Id dan path foto variasi yang sudah tersimpan, terindeks warna::size. */
  const [savedVariationIds, setSavedVariationIds] = useState<
    Map<string, { id: string; photoPath: string | null }>
  >(new Map());
  /** Sedang menyusun kode produksi — dipakai untuk placeholder pada field kode. */
  const [composingCode, setComposingCode] = useState(false);
  /** Sedang mencari harga produksi terakhir untuk Product ID yang diketik. */
  const [lookingUpPrice, setLookingUpPrice] = useState(false);
  /** Asal harga hasil auto-fill, untuk keterangan di bawah grid komponen. */
  const [priceSource, setPriceSource] = useState<LastPriceMatch | null>(null);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: emptyOrderEntryValues(),
    mode: 'onTouched',
  });

  const variationFields = useFieldArray({
    control: form.control,
    name: 'variations',
  });

  const watchedVariations = form.watch('variations');
  const watchedComponents = form.watch('components');
  const watchedBrand = form.watch('brand');
  const watchedProductId = form.watch('productId');
  const watchedProductionCode = form.watch('productionCode');
  const watchedClientProductionCode = form.watch('clientProductionCode');
  const watchedProduct = form.watch('product');
  /**
   * Total qty dibaca dari DATA TERSIMPAN, bukan dari form.
   *
   * Form tidak lagi punya field qty (dihapus atas permintaan user), jadi angka
   * ini datang dari `detail.variations` — qty hasil sinkronisasi POS client.
   * Order baru selalu 0 di sini, dan itu memang benar: client belum
   * menguploadnya. Karena itu ringkasan di bawah menampilkan tanda pisah, bukan
   * "0 pcs", supaya tidak terbaca sebagai "order kosong".
   */
  const totalQuantity = useMemo(
    () => totalOrderQuantity(detail?.variations ?? []),
    [detail?.variations],
  );
  const totalPerPiece = useMemo(() => totalOrderPrice(watchedComponents), [watchedComponents]);
  const readOnly = effectiveMode === 'view' || !detail?.canEdit && effectiveMode === 'edit';
  const structureLocked = detail?.structureLocked ?? false;
  /** Kode produksi hanya disusun untuk order baru; order lama mempertahankan kodenya. */
  const isNewOrder = effectiveMode === 'create' && !detail;

  /**
   * Susun kode produksi dari client yang dipilih.
   *
   * Dipanggil dari handler perubahan client, bukan dari efek: memanggil RPC di
   * dalam efek memicu render cascading dan dilarang aturan
   * `react-hooks/set-state-in-effect`. Nomor di sini hanya pratinjau — kode
   * yang berlaku ditentukan server saat menyimpan.
   */
  async function refreshProductionCode(brand: string) {
    if (!isNewOrder) return;
    setComposingCode(true);
    const preview = await productionOrderSvc.previewProductionCode(brand);
    setComposingCode(false);
    form.setValue('productionCode', preview ?? '', { shouldValidate: true });
  }

  /**
   * Isi komponen harga dari produksi terakhir yang Product ID-nya sama.
   *
   * Dipanggil dari `onBlur` field Product ID dan dari tombol "Isi dari
   * produksi terakhir", bukan dari efek — alasannya sama dengan
   * `refreshProductionCode` di atas: memanggil RPC di dalam efek memicu render
   * cascading dan dilarang aturan `react-hooks/set-state-in-effect`.
   *
   * `force = false` (pemicu onBlur) hanya mengisi bila seluruh komponen masih
   * 0, supaya angka yang sudah diketik user tidak pernah tertimpa saat ia
   * mengganti Product ID. `force = true` (tombol) selalu mengisi.
   */
  async function fillPriceFromLastProduction(force: boolean) {
    if (readOnly) return;

    const values = form.getValues();
    const productId = values.productId.trim();
    const brand = values.brand.trim();
    const product = values.product.trim();
    if (!productId && !product) return;

    // Penjaga: jangan timpa harga yang sudah diisi, kecuali diminta lewat tombol.
    if (!force && totalOrderPrice(form.getValues('components')) !== 0) return;

    setLookingUpPrice(true);
    const { data } = await fetchLastPrice({
      productId,
      brand,
      product,
      excludeOrderId: effectiveMode === 'edit' ? orderId : null,
    });
    setLookingUpPrice(false);

    if (!data) {
      if (force) setPriceSource(null);
      return;
    }

    form.setValue('components', mergeOrderPriceComponents(data.components), {
      shouldValidate: true,
    });
    setPriceSource(data);
  }

  /** Ganti URL preview: revoke yang lama, simpan yang baru di state dan ref. */
  const setPreviewUrl = useCallback((next: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPendingPreviewUrl(next);
  }, []);

  const resetPhotoState = useCallback(() => {
    setPreviewUrl(null);
    setExistingPhotoPath(null);
    setPendingFile(null);
    setRemovedExisting(false);
    setUploadingPhoto(false);

    // Bebaskan semua object URL variasi agar tidak bocor memori.
    for (const url of Object.values(variationPreviewRef.current)) URL.revokeObjectURL(url);
    variationPreviewRef.current = {};
    setVariationPhotos({});
    setRemovedVariationPhotos({});
    setSavedVariationIds(new Map());
  }, [setPreviewUrl]);

  /** Pasang foto ke satu baris variasi. */
  function handleVariationPhotoSelected(key: string, event: ChangeEvent<HTMLInputElement>) {
    const file = Array.from(event.target.files ?? []).find((f) => f.type.startsWith('image/'));
    event.target.value = '';
    if (!file) return;

    if (variationPreviewRef.current[key]) {
      URL.revokeObjectURL(variationPreviewRef.current[key]);
    }
    const previewUrl = URL.createObjectURL(file);
    variationPreviewRef.current[key] = previewUrl;

    setVariationPhotos((current) => ({ ...current, [key]: { file, previewUrl } }));
    // Memilih foto baru membatalkan penandaan hapus foto lama di baris ini.
    setRemovedVariationPhotos((current) => withoutKey(current, key));
  }

  function clearPendingVariationPhoto(key: string) {
    if (variationPreviewRef.current[key]) {
      URL.revokeObjectURL(variationPreviewRef.current[key]);
    }
    variationPreviewRef.current = withoutKey(variationPreviewRef.current, key);

    setVariationPhotos((current) => withoutKey(current, key));
  }

  function markVariationPhotoRemoved(key: string) {
    clearPendingVariationPhoto(key);
    setRemovedVariationPhotos((current) => ({ ...current, [key]: true }));
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setDetail(null);
    setEffectiveMode(mode);
    resetPhotoState();

    if (mode === 'create' || !orderId) {
      form.reset(emptyOrderEntryValues());
      setPriceSource(null);
      return;
    }

    setLoading(true);
    productionOrderSvc.fetchById(orderId)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError || !data) {
          setError(fetchError?.message ?? 'Order tidak ditemukan');
          return;
        }
        setDetail(data);
        setEffectiveMode(mode === 'edit' && !data.canEdit ? 'view' : mode);
        form.reset(orderEntryValuesFromDetail(data));
        setPriceSource(null);
        setExistingPhotoPath(data.productPhotoPath ?? null);

        setSavedVariationIds(mapSavedVariations(data.variations));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      resetPhotoState();
    };
  }, [form, mode, open, orderId, resetPhotoState]);

  function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = Array.from(event.target.files ?? []).find((f) => f.type.startsWith('image/'));
    event.target.value = '';
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    // Memilih foto baru membatalkan penandaan hapus foto lama.
    setRemovedExisting(false);
  }

  function removePendingPhoto() {
    setPendingFile(null);
    setPreviewUrl(null);
  }

  function removeExistingPhoto() {
    setRemovedExisting(true);
  }

  /** URL yang ditampilkan: preview pending menang atas foto yang sudah tersimpan. */
  const displayedPhotoUrl = pendingPreviewUrl
    ?? (!removedExisting ? productPhotoUrl(existingPhotoPath) : null);

  /**
   * Unggah foto setelah order tersimpan. Kegagalan di sini TIDAK
   * membatalkan penyimpanan order — order sudah tersimpan sah, dan
   * pemanggil yang menampilkan peringatannya.
   */
  async function persistPhoto(orderIdToUse: string): Promise<boolean> {
    const shouldRemove = removedExisting && Boolean(existingPhotoPath);
    if (!pendingFile && !shouldRemove) return true;

    let ok = true;

    if (shouldRemove) {
      const { error: clearError } = await productionOrderSvc.clearProductPhoto(
        orderIdToUse,
        existingPhotoPath,
      );
      if (clearError) ok = false;
    }

    if (pendingFile) {
      const { filePath, error: uploadError } = await uploadProductPhoto({
        orderId: orderIdToUse,
        file: pendingFile,
      });
      if (uploadError) {
        ok = false;
      } else {
        const { error: saveError } = await productionOrderSvc.setProductPhoto(orderIdToUse, filePath);
        if (saveError) ok = false;
      }
    }

    return ok;
  }

  /**
   * Unggah foto per variasi setelah order tersimpan.
   *
   * Sama seperti persistPhoto: kegagalan di sini TIDAK membatalkan
   * penyimpanan order. Pasangan file → id variasi dilacak lewat kombinasi
   * warna::size, karena itulah kunci yang dipakai SQL untuk menahan id
   * variasi lintas penyimpanan.
   */
  async function persistVariationPhotos(
    orderIdToUse: string,
    savedVariations: readonly ProductionOrderVariation[],
  ): Promise<boolean> {
    const pendingKeys = Object.keys(variationPhotos);
    const removedKeys = Object.keys(removedVariationPhotos);
    if (pendingKeys.length === 0 && removedKeys.length === 0) return true;

    // Peta terbaru diambil dari hasil simpan, bukan dari state lama —
    // state bisa tertinggal satu render dari apa yang dikembalikan RPC.
    const byCombination = mapSavedVariations(savedVariations);
    let ok = true;

    for (const key of removedKeys) {
      const saved = byCombination.get(key);
      if (!saved?.photoPath) continue;
      const { error: clearError } = await productionOrderSvc.clearVariationPhoto(
        saved.id,
        saved.photoPath,
      );
      if (clearError) ok = false;
    }

    for (const key of pendingKeys) {
      const pending = variationPhotos[key];
      const saved = byCombination.get(key);
      if (!pending || !saved) {
        // Variasi ini tidak ada di hasil simpan — barisnya mungkin baru saja
        // dihapus user. Lewati tanpa menggagalkan seluruh penyimpanan.
        ok = false;
        continue;
      }
      const { error: setError } = await productionOrderSvc.setVariationPhoto(
        saved.id,
        orderIdToUse,
        pending.file,
      );
      if (setError) ok = false;
    }

    return ok;
  }

  async function refreshAsView(message: string) {
    if (!orderId) return;
    const { data } = await productionOrderSvc.fetchById(orderId);
    if (data) {
      setDetail(data);
      setEffectiveMode('view');
      form.reset(orderEntryValuesFromDetail(data));
      setPriceSource(null);
    }
    setError(message);
  }

  async function submit(values: OrderFormValues) {
    if (readOnly) return;
    setSaving(true);
    setError(null);

    const input: OrderEntrySaveInput = {
      id: effectiveMode === 'edit' ? orderId ?? undefined : undefined,
      productionCode: values.productionCode.trim(),
      clientProductionCode: values.clientProductionCode.trim(),
      productId: values.productId.trim(),
      product: values.product.trim(),
      brand: values.brand.trim(),
      variations: values.variations.map((variation) => ({
        color: variation.color.trim(),
        size: variation.size.trim(),
      })),
      components: values.components.map((component) => ({
        key: component.key,
        value: component.value,
      })),
      actor,
    };

    const { data, error: saveError } = await productionOrderSvc.save(input);
    if (saveError || !data) {
      const message = orderEntryErrorMessage(saveError ?? new Error('Order tidak dikembalikan'));
      if (
        saveError?.message.includes('ORDER_EDIT_BLOCKED_BY_PROGRESS') ||
        saveError?.message.includes('ORDER_VARIATIONS_LOCKED_AFTER_PULL')
      ) {
        await refreshAsView(message);
      } else {
        setError(message);
      }
      setSaving(false);
      return;
    }

    setUploadingPhoto(true);
    const [photoOk, variationPhotoOk] = await Promise.all([
      persistPhoto(data.id),
      persistVariationPhotos(data.id, data.variations ?? []),
    ]);
    setUploadingPhoto(false);
    setSaving(false);

    const warnings: string[] = [];
    if (!photoOk) warnings.push('foto produk');
    if (!variationPhotoOk) warnings.push('foto variasi');

    onSaved(
      data,
      warnings.length > 0
        ? `Order tersimpan, tetapi ${warnings.join(' dan ')} gagal diunggah.`
        : null,
    );
  }

  const modeTitle = effectiveMode === 'create'
    ? 'Create New Order'
    : effectiveMode === 'edit'
      ? 'Edit Order'
      : 'Order Detail';

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !uploadingPhoto && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!saving}
        className="flex h-[100dvh] w-screen max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-gray-200 bg-white px-5 py-3.5 pr-14 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <DialogTitle className="text-[15px] text-slate-800">{modeTitle}</DialogTitle>
            {effectiveMode === 'view' && (
              <Badge variant="secondary" className="h-5 gap-1 px-2 text-[11px]">
                <Eye className="h-3 w-3" /> View only
              </Badge>
            )}
            {structureLocked && (
              <Badge variant="outline" className="h-5 gap-1 px-2 text-[11px]">
                <LockKeyhole className="h-3 w-3" /> Variasi dikunci
              </Badge>
            )}
          </div>
          <DialogDescription className="mt-0.5 text-[12px] text-slate-500">
            Satu kode produksi dapat memiliki beberapa kombinasi warna dan size dengan satu harga bersama.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col bg-slate-50/60">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="mx-auto w-full max-w-5xl">
                {error && (
                  <Alert variant="destructive" className="mb-4 bg-red-50 py-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-[13px]">Order belum dapat diproses</AlertTitle>
                    <AlertDescription className="text-[12px]">{error}</AlertDescription>
                  </Alert>
                )}

                {loading ? (
                  <div className="flex min-h-[320px] items-center justify-center text-[13px] text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat detail order…
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Section
                      title="Identitas kode produksi"
                      description="Kode produksi disusun otomatis dari client dan bulan berjalan. Kode produksi client diisi manual sesuai kode yang dikirim client."
                    >
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field label="Kode produksi" required>
                          <FormField control={form.control} name="productionCode" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl>
                                {/* Read-only: nilainya ditentukan server, bukan diketik. */}
                                <Input
                                  {...field}
                                  readOnly
                                  disabled={readOnly}
                                  placeholder={
                                    composingCode
                                      ? 'Menyusun kode…'
                                      : field.value
                                        ? ''
                                        : 'Pilih client terlebih dahulu'
                                  }
                                  className="h-8 bg-slate-50 font-mono text-[13px] text-slate-700"
                                />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Kode produksi client" required>
                          <FormField control={form.control} name="clientProductionCode" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl>
                                {/* Masih bisa diketik manual — kode ini milik
                                    client, dan tidak semua client memakai POS
                                    yang sama. Tombol di sebelah kanan adalah
                                    jalan pintas untuk mengambilnya dari POS
                                    client (permintaan user: "harus ada tOmbOl
                                    buat ambil kde prduksi client yang dari
                                    external"). */}
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    {...field}
                                    disabled={readOnly}
                                    placeholder="Contoh: PDFF_LVU-PNT-02_B-00_PRDN"
                                    className="h-8 flex-1 font-mono text-[13px]"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={readOnly}
                                    onClick={() => setPickerOpen(true)}
                                    title="Ambil kode produksi dari POS client"
                                    className="h-8 shrink-0 px-2.5 text-[12px]"
                                  >
                                    <CloudDownload className="h-3.5 w-3.5" />
                                    Ambil
                                  </Button>
                                </div>
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Client" required>
                          <FormField control={form.control} name="brand" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl>
                                <ClientCombobox
                                  id="order-entry-client"
                                  value={field.value}
                                  onChange={(namaClient) => {
                                    field.onChange(namaClient);
                                    void refreshProductionCode(namaClient);
                                  }}
                                  disabled={readOnly}
                                />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Product ID" required>
                          <FormField control={form.control} name="productId" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl>
                                <Input
                                  {...field}
                                  disabled={readOnly}
                                  placeholder="Contoh: LVU-TOP-06"
                                  className="h-8 text-[13px]"
                                  // Auto-fill saat fokus lepas, bukan saat
                                  // mengetik: mengetik akan memicu RPC per
                                  // karakter sebelum Product ID selesai.
                                  onBlur={() => {
                                    field.onBlur();
                                    void fillPriceFromLastProduction(false);
                                  }}
                                />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Product" required>
                          <FormField control={form.control} name="product" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl><Input {...field} disabled={readOnly} placeholder="Contoh: Mina Top" className="h-8 text-[13px]" /></FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                      </div>

                      {/* Foto produk — satu foto per kode produksi */}
                      <div className="mt-4 border-t border-gray-100 pt-3.5">
                        <p className="mb-1.5 text-[12px] text-slate-500">Foto produk</p>
                        <div className="flex items-center gap-3">
                          {displayedPhotoUrl ? (
                            <div className="relative h-16 w-16 shrink-0">
                              <img
                                src={displayedPhotoUrl}
                                alt="Foto produk"
                                className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                              />
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={pendingPreviewUrl ? removePendingPhoto : removeExistingPhoto}
                                  title="Hapus foto"
                                  aria-label="Hapus foto produk"
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm transition-colors hover:bg-rose-700"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-slate-300">
                              <ImagePlus className="h-5 w-5" />
                            </div>
                          )}

                          {!readOnly && (
                            <div className="min-w-0">
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-600 transition-colors hover:border-slate-400 hover:text-blue-700">
                                {displayedPhotoUrl ? 'Ganti foto' : 'Unggah foto'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handlePhotoSelected}
                                />
                              </label>
                              <p className="mt-1 text-[11px] text-slate-400">
                                Satu foto per kode produksi. Disimpan saat order disimpan.
                              </p>
                            </div>
                          )}
                        </div>
                        {uploadingPhoto && (
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Mengunggah foto…
                          </p>
                        )}
                      </div>
                    </Section>

                    <Section
                      title="Variasi warna dan size"
                      description="Setiap baris akan menjadi satu Work Order saat order di-Pull. Qty diisi otomatis dari POS client, bukan diketik di sini."
                      action={!readOnly && !structureLocked ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-[11px]"
                          onClick={() => variationFields.append({ color: '', size: '' })}
                        >
                          <Plus className="h-3.5 w-3.5" /> Tambah variasi
                        </Button>
                      ) : null}
                    >
                      {structureLocked && (
                        <Alert className="mb-3.5 border-amber-200 bg-amber-50 py-3 text-amber-900">
                          <LockKeyhole className="h-4 w-4" />
                          <AlertTitle className="text-[13px]">Struktur variasi dikunci</AlertTitle>
                          <AlertDescription className="text-[12px]">
                            Order sudah di-Pull. Identitas dan harga masih dapat diedit selama belum ada progres, tetapi warna dan size tidak dapat diubah.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Tabel variasi memakai sistem tabel bersama
                          (src/lib/tableStyles.ts) supaya seragam dengan tabel
                          di seluruh aplikasi, bukan gaya sendiri. Ukuran
                          dirapatkan karena ini tabel di dalam dialog. */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <table className={cn(T_TABLE, 'w-full')}>
                          <thead><tr className={T_HEAD_ROW}>
                            <th className={cn(T_TH, 'w-10 px-2 text-center')}>#</th>
                            <th className={cn(T_TH, 'w-16 px-2 text-center')}>Foto</th>
                            <th className={cn(T_TH, 'text-left')}>Warna</th>
                            <th className={cn(T_TH, 'text-left')}>Size</th>
                            {/* Kolom "Quantity" dihapus dari sini — permintaan
                                user (verbatim): "pada saat Create New Order di
                                Order Entry, kOlOm quantity harusnya dihapus
                                aja". Qty datang dari POS client, bukan diketik
                                konveksi, jadi tidak ada input-nya di form ini.
                                Angka yang sudah tersimpan tetap tampil di
                                kolom "Qty Diterima Client" pada Production
                                Monitoring. */}
                            <th className={cn(T_TH, 'hidden text-left md:table-cell')}>Variation ID</th>
                            <th className={cn(T_TH, 'w-10 px-2')} />
                          </tr></thead>
                          <tbody>
                            {variationFields.fields.map((field, index) => {
                              const variation = watchedVariations[index];
                              // Kunci baris = warna::size, identitas yang sama
                              // dengan yang dipakai SQL untuk menahan id.
                              // Konsekuensinya: mengganti warna/size sebuah
                              // baris melepaskan foto yang menempel di baris
                              // itu — sama seperti SQL yang memperlakukannya
                              // sebagai variasi baru.
                              const photoKey = variationCombinationKey({
                                color: variation?.color ?? '',
                                size: variation?.size ?? '',
                              });
                              const pendingPhoto = variationPhotos[photoKey];
                              const savedPhoto = savedVariationIds.get(photoKey);
                              const photoRemoved = Boolean(removedVariationPhotos[photoKey]);
                              const savedPhotoUrl = photoRemoved
                                ? null
                                : productPhotoUrl(savedPhoto?.photoPath);
                              const thumbUrl = pendingPhoto?.previewUrl ?? savedPhotoUrl;
                              const canEditPhoto = !readOnly;

                              return (
                                <tr key={field.id} className={rowClass(index)}>
                                  <td className={cn(T_TD, 'px-2 text-center text-[12px] text-slate-400')}>{index + 1}</td>
                                  <td className={cn(T_TD, 'px-2')}>
                                    <div className="flex justify-center">
                                      {thumbUrl ? (
                                        <div className="relative h-10 w-10 shrink-0">
                                          <img
                                            src={thumbUrl}
                                            alt={`Foto variasi ${index + 1}`}
                                            className="h-10 w-10 rounded-md border border-gray-200 object-cover"
                                          />
                                          {canEditPhoto && (
                                            <button
                                              type="button"
                                              onClick={() => markVariationPhotoRemoved(photoKey)}
                                              title="Hapus foto variasi"
                                              aria-label={`Hapus foto variasi ${index + 1}`}
                                              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm transition-colors hover:bg-rose-700"
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                        </div>
                                      ) : canEditPhoto ? (
                                        <label
                                          title="Unggah foto variasi"
                                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 bg-slate-50 text-slate-300 transition-colors hover:border-slate-400 hover:text-blue-600"
                                        >
                                          <ImagePlus className="h-4 w-4" />
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(event) => handleVariationPhotoSelected(photoKey, event)}
                                          />
                                        </label>
                                      ) : (
                                        <span className="text-[12px] text-gray-300">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <FormField control={form.control} name={`variations.${index}.color`} render={({ field: input }) => (
                                      <FormItem className="gap-1">
                                        <FormControl><Input {...input} disabled={readOnly || structureLocked} placeholder="Black" className="h-8 text-[13px]" /></FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )} />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <FormField control={form.control} name={`variations.${index}.size`} render={({ field: input }) => (
                                      <FormItem className="gap-1">
                                        <FormControl><Input {...input} disabled={readOnly || structureLocked} placeholder="M" className="h-8 text-[13px]" /></FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )} />
                                  </td>
                                  {/* Sel input Quantity dihapus — lihat catatan
                                      pada <th> di atas. */}
                                  <td className="hidden max-w-[240px] truncate px-3 py-1.5 text-[12px] text-slate-500 md:table-cell">
                                    {buildVariationId(watchedProductId, variation?.color ?? '', variation?.size ?? '') || '—'}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {!readOnly && !structureLocked && variationFields.fields.length > 1 && (
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => variationFields.remove(index)} aria-label={`Hapus variasi ${index + 1}`}>
                                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {form.formState.errors.variations?.root?.message && (
                        <p className="mt-2 text-[12px] text-red-600">{form.formState.errors.variations.root.message}</p>
                      )}
                    </Section>

                    <Section
                      title="Komponen harga per potong"
                      description="Satu set harga berlaku untuk seluruh variasi dalam kode produksi ini."
                      action={
                        !readOnly && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[12px]"
                            disabled={lookingUpPrice}
                            onClick={() => void fillPriceFromLastProduction(true)}
                          >
                            {lookingUpPrice ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <History className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Isi dari produksi terakhir
                          </Button>
                        )
                      }
                    >
                      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                        {watchedComponents.map((component, index) => (
                          <Field key={component.key} label={component.label}>
                            <FormField control={form.control} name={`components.${index}.value`} render={({ field }) => (
                              <FormItem className="gap-1">
                                <FormControl>
                                  <div className="relative">
                                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">Rp</span>
                                    <Input
                                      {...field}
                                      type="number"
                                      min={0}
                                      value={Number.isNaN(field.value) ? '' : field.value}
                                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                                      disabled={readOnly}
                                      className="h-8 pl-8 text-right text-[13px] tabular-nums"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage className="text-[11px]" />
                              </FormItem>
                            )} />
                          </Field>
                        ))}
                      </div>
                      {typeof form.formState.errors.components?.message === 'string' && (
                        <p className="mt-2 text-[12px] text-red-600">{form.formState.errors.components.message}</p>
                      )}
                      {priceSource && (
                        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-blue-800">
                          Harga diisi otomatis dari produksi terakhir —{' '}
                          <span className="font-medium">{priceSource.productionCode ?? priceSource.productionOrderId}</span>
                          {priceSource.productId ? ` (${priceSource.productId})` : ''}
                          {priceSource.savedAt
                            ? ` per ${new Date(priceSource.savedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`
                            : ''}
                          {priceSource.matchedBy === 'product' && (
                            <span className="text-blue-700">
                              {' '}
                              — Product ID belum pernah ada, cocok lewat produk{' '}
                              {priceSource.product ?? ''} milik {priceSource.brand ?? ''}. Periksa
                              sebelum dipakai.
                            </span>
                          )}
                          <br />
                          <span className="text-blue-700">Semua angka tetap bisa diedit.</span>
                        </p>
                      )}
                    </Section>

                    {detail?.editBlockReason && (
                      <Alert className="border-slate-200 bg-slate-50 py-3">
                        <LockKeyhole className="h-4 w-4" />
                        <AlertTitle className="text-[13px]">View only</AlertTitle>
                        <AlertDescription className="text-[12px]">{detail.editBlockReason}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            </div>

            <footer className="shrink-0 border-t border-gray-200 bg-white px-5 py-3 sm:px-6">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:flex sm:items-center sm:gap-6">
                  <SummaryItem label="Buyer" value={watchedBrand || '—'} />
                  <SummaryItem label="Kode produksi" value={watchedProductionCode || '—'} />
                  <SummaryItem label="Kode client" value={watchedClientProductionCode || '—'} />
                  <SummaryItem label="Article" value={watchedProduct || '—'} />
                  <SummaryItem label="Variasi" value={`${watchedVariations.length} kombinasi`} />
                  {/*
                    Qty 0 = "belum diterima dari POS client", bukan "nol pcs".
                    Menampilkan "0 pcs" di sini akan terbaca seolah ordernya
                    kosong, jadi ditampilkan tanda pisah sampai POS mengirim
                    angkanya. Nilai order ikut disembunyikan karena
                    `0 × harga` selalu Rp 0 dan itu menyesatkan.
                  */}
                  <SummaryItem
                    label="Total qty"
                    value={totalQuantity > 0 ? `${totalQuantity.toLocaleString('id-ID')} pcs` : '—'}
                  />
                  <SummaryItem label="Harga / pcs" value={rupiah(totalPerPiece)} />
                  <SummaryItem
                    label="Nilai order"
                    value={totalQuantity > 0 ? rupiah(totalQuantity * totalPerPiece) : '—'}
                  />
                </dl>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" className="h-8 px-4 text-[13px]" onClick={() => onOpenChange(false)} disabled={saving || uploadingPhoto}>
                    {readOnly ? 'Tutup' : 'Batal'}
                  </Button>
                  {!readOnly && (
                    <Button type="submit" className="h-8 px-4 text-[13px]" disabled={saving || uploadingPhoto || loading}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {saving ? 'Menyimpan…' : effectiveMode === 'create' ? 'Simpan order' : 'Simpan perubahan'}
                    </Button>
                  )}
                </div>
              </div>
            </footer>
          </form>
        </Form>
      </DialogContent>

      {/* Dialog pemilih kode produksi client dari POS client.
          Diletakkan di luar <Form> karena ia bukan bagian dari form: ia hanya
          menulis satu nilai ke field `clientProductionCode` saat user menekan
          "Pakai kode ini". Bentuknya dialog (bukan combobox di dalam form)
          supaya tidak menambah field Zod dan tidak ikut tervalidasi. */}
      <ClientProductionCodePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientName={watchedBrand}
        onSelect={(productNote) => {
          form.setValue('clientProductionCode', productNote, {
            shouldValidate: true,
            shouldDirty: true,
          });
          setPickerOpen(false);
        }}
      />
    </Dialog>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-700">{title}</h3>
          {description && <p className="mt-0.5 text-[12px] text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <FormLabelStatic required={required}>{label}</FormLabelStatic>
      {children}
    </div>
  );
}

function FormLabelStatic({ required, children }: { required?: boolean; children: ReactNode }) {
  return (
    <p className="mb-1 text-[12px] text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </p>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-[13px] text-slate-700">{value}</dd>
    </div>
  );
}
