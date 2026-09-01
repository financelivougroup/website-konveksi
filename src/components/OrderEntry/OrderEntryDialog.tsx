import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Eye,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  emptyOrderEntryValues,
  hasDuplicateVariations,
  orderEntryErrorMessage,
  orderEntryValuesFromDetail,
  totalOrderPrice,
  totalOrderQuantity,
} from '@/lib/orderEntry';
import { buildVariationId } from '@/lib/workOrderIdentity';
import * as productionOrderSvc from '@/services/productionOrders';
import type { OrderEntryDetail, OrderEntrySaveInput } from '@/types/pipeline';

const variationSchema = z.object({
  color: z.string().trim().min(1, 'Warna wajib diisi'),
  size: z.string().trim().min(1, 'Size wajib diisi'),
  quantity: z.number().int('Qty harus bilangan bulat').positive('Qty harus lebih dari 0'),
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
  productId: z.string().trim().min(1, 'Product ID wajib diisi'),
  product: z.string().trim().min(1, 'Product wajib diisi'),
  brand: z.string().trim().min(1, 'Customer wajib diisi'),
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
  onSaved: (detail: OrderEntryDetail) => void;
}

function rupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
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
  const watchedProduct = form.watch('product');
  const totalQuantity = useMemo(() => totalOrderQuantity(watchedVariations), [watchedVariations]);
  const totalPerPiece = useMemo(() => totalOrderPrice(watchedComponents), [watchedComponents]);
  const readOnly = effectiveMode === 'view' || !detail?.canEdit && effectiveMode === 'edit';
  const structureLocked = detail?.structureLocked ?? false;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setDetail(null);
    setEffectiveMode(mode);

    if (mode === 'create' || !orderId) {
      form.reset(emptyOrderEntryValues());
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
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [form, mode, open, orderId]);

  async function refreshAsView(message: string) {
    if (!orderId) return;
    const { data } = await productionOrderSvc.fetchById(orderId);
    if (data) {
      setDetail(data);
      setEffectiveMode('view');
      form.reset(orderEntryValuesFromDetail(data));
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
      productId: values.productId.trim(),
      product: values.product.trim(),
      brand: values.brand.trim(),
      variations: values.variations.map((variation) => ({
        color: variation.color.trim(),
        size: variation.size.trim(),
        quantity: variation.quantity,
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

    setSaving(false);
    onSaved(data);
  }

  const modeTitle = effectiveMode === 'create'
    ? 'Create New Order'
    : effectiveMode === 'edit'
      ? 'Edit Order'
      : 'Order Detail';

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
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
                      description="Product Note menjadi kode produksi unik untuk seluruh variasi di order ini."
                    >
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field label="Kode produksi / Product Note" required>
                          <FormField control={form.control} name="productionCode" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl><Input {...field} disabled={readOnly} placeholder="Contoh: B-02" className="h-8 text-[13px]" /></FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Customer" required>
                          <FormField control={form.control} name="brand" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl><Input {...field} disabled={readOnly} placeholder="Contoh: Livou" className="h-8 text-[13px]" /></FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )} />
                        </Field>
                        <Field label="Product ID / article code" required>
                          <FormField control={form.control} name="productId" render={({ field }) => (
                            <FormItem className="gap-1">
                              <FormControl><Input {...field} disabled={readOnly} placeholder="Contoh: LVU-TOP-06" className="h-8 text-[13px]" /></FormControl>
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
                    </Section>

                    <Section
                      title="Variasi warna, size, dan quantity"
                      description="Setiap baris akan menjadi satu Work Order saat order di-Pull."
                      action={!readOnly && !structureLocked ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-[11px]"
                          onClick={() => variationFields.append({ color: '', size: '', quantity: 1 })}
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
                            Order sudah di-Pull. Identitas dan harga masih dapat diedit selama belum ada progres, tetapi warna, size, dan qty tidak dapat diubah.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="overflow-hidden rounded-md border border-gray-200">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-gray-200">
                              <TableHead className="h-8 w-10 px-2 text-center text-[12px] font-semibold text-slate-500">#</TableHead>
                              <TableHead className="h-8 px-3 text-[12px] font-semibold text-slate-500">Warna</TableHead>
                              <TableHead className="h-8 px-3 text-[12px] font-semibold text-slate-500">Size</TableHead>
                              <TableHead className="h-8 w-32 px-3 text-[12px] font-semibold text-slate-500">Quantity</TableHead>
                              <TableHead className="hidden h-8 px-3 text-[12px] font-semibold text-slate-500 md:table-cell">Variation ID</TableHead>
                              <TableHead className="h-8 w-10 px-2" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {variationFields.fields.map((field, index) => {
                              const variation = watchedVariations[index];
                              return (
                                <TableRow key={field.id} className="border-b border-gray-200 last:border-0">
                                  <TableCell className="px-2 py-1.5 text-center text-[12px] text-slate-400">{index + 1}</TableCell>
                                  <TableCell className="px-3 py-1.5">
                                    <FormField control={form.control} name={`variations.${index}.color`} render={({ field: input }) => (
                                      <FormItem className="gap-1">
                                        <FormControl><Input {...input} disabled={readOnly || structureLocked} placeholder="Black" className="h-8 text-[13px]" /></FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )} />
                                  </TableCell>
                                  <TableCell className="px-3 py-1.5">
                                    <FormField control={form.control} name={`variations.${index}.size`} render={({ field: input }) => (
                                      <FormItem className="gap-1">
                                        <FormControl><Input {...input} disabled={readOnly || structureLocked} placeholder="M" className="h-8 text-[13px]" /></FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )} />
                                  </TableCell>
                                  <TableCell className="px-3 py-1.5">
                                    <FormField control={form.control} name={`variations.${index}.quantity`} render={({ field: input }) => (
                                      <FormItem className="gap-1">
                                        <FormControl>
                                          <Input
                                            {...input}
                                            type="number"
                                            min={1}
                                            value={Number.isNaN(input.value) ? '' : input.value}
                                            onChange={(event) => input.onChange(event.target.valueAsNumber)}
                                            disabled={readOnly || structureLocked}
                                            className="h-8 text-right text-[13px] tabular-nums"
                                          />
                                        </FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )} />
                                  </TableCell>
                                  <TableCell className="hidden max-w-[240px] truncate px-3 py-1.5 text-[12px] text-slate-500 md:table-cell">
                                    {buildVariationId(watchedProductId, variation?.color ?? '', variation?.size ?? '') || '—'}
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5">
                                    {!readOnly && !structureLocked && variationFields.fields.length > 1 && (
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => variationFields.remove(index)} aria-label={`Hapus variasi ${index + 1}`}>
                                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      {form.formState.errors.variations?.root?.message && (
                        <p className="mt-2 text-[12px] text-red-600">{form.formState.errors.variations.root.message}</p>
                      )}
                    </Section>

                    <Section
                      title="Komponen harga per potong"
                      description="Satu set harga berlaku untuk seluruh variasi dalam kode produksi ini."
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
                  <SummaryItem label="Article" value={watchedProduct || '—'} />
                  <SummaryItem label="Variasi" value={`${watchedVariations.length} kombinasi`} />
                  <SummaryItem label="Total qty" value={`${totalQuantity.toLocaleString('id-ID')} pcs`} />
                  <SummaryItem label="Harga / pcs" value={rupiah(totalPerPiece)} />
                  <SummaryItem label="Nilai order" value={rupiah(totalQuantity * totalPerPiece)} />
                </dl>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" className="h-8 px-4 text-[13px]" onClick={() => onOpenChange(false)} disabled={saving}>
                    {readOnly ? 'Tutup' : 'Batal'}
                  </Button>
                  {!readOnly && (
                    <Button type="submit" className="h-8 px-4 text-[13px]" disabled={saving || loading}>
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
