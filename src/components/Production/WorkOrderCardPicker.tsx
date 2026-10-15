import { useEffect, useMemo, useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { entryProductSuggestions, searchEntryWorkOrders } from '@/lib/productionEntryOptions';
import { cn } from '@/lib/utils';
import type { WorkOrder } from '@/types/pipeline';

export interface WorkOrderCardPickerProps {
  orders: WorkOrder[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  id: string;
}

function WorkOrderPhoto({ order }: { order: WorkOrder }) {
  const source = order.variationPhotoUrl ?? order.productPhotoUrl;
  const [failedSource, setFailedSource] = useState<string | null>(null);

  return (
    <span className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-t-xl bg-muted">
      {source && failedSource !== source ? (
        <img
          src={source}
          alt={`Foto ${order.product}, ${order.warna}, ${order.size}`}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="text-xs">Foto belum tersedia</span>
        </span>
      )}
    </span>
  );
}

function PickerNavigation({ api, disabled, count }: { api: CarouselApi; disabled: boolean; count: number }) {
  const [position, setPosition] = useState(1);
  const [snapCount, setSnapCount] = useState(1);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      setPosition(api.selectedScrollSnap() + 1);
      setSnapCount(api.scrollSnapList().length);
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    update();
    api.on('select', update);
    api.on('reInit', update);
    return () => {
      api.off('select', update);
      api.off('reInit', update);
    };
  }, [api]);

  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <p className="min-w-0 text-xs text-muted-foreground" role="status" aria-live="polite">
        {count} WO · Posisi {position} dari {snapCount}
      </p>
      <div className="flex shrink-0 gap-2">
        <CarouselPrevious
          type="button"
          className="static translate-y-0"
          aria-label="Lihat work order sebelumnya"
          disabled={disabled || !canPrev}
        />
        <CarouselNext
          type="button"
          className="static translate-y-0"
          aria-label="Lihat work order berikutnya"
          disabled={disabled || !canNext}
        />
      </div>
    </div>
  );
}

export function WorkOrderCardPicker({
  orders,
  selectedId,
  onSelect,
  disabled = false,
  loading = false,
  error = null,
  onRetry,
  id,
}: WorkOrderCardPickerProps) {
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [api, setApi] = useState<CarouselApi>();
  const busy = disabled || loading;
  const suggestions = useMemo(() => entryProductSuggestions(orders), [orders]);
  const filteredOrders = useMemo(
    () => searchEntryWorkOrders(orders, query).filter(
      (order) => selectedProduct === null || order.product === selectedProduct,
    ),
    [orders, query, selectedProduct],
  );
  const selectedOrder = orders.find((order) => order.id === selectedId);
  const hasFilters = query.length > 0 || selectedProduct !== null;

  const clearFilters = () => {
    setQuery('');
    setSelectedProduct(null);
  };

  return (
    <div id={id} className="min-w-0 w-full space-y-4" aria-busy={loading}>
      <Field className="min-w-0 gap-2">
        <FieldLabel htmlFor={`${id}-search`}>Pilih Work Order</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={busy}
          placeholder="Cari produk, kode produksi, warna, atau ukuran"
          aria-describedby={`${id}-description`}
        />
        <FieldDescription id={`${id}-description`} className="text-xs">
          Pilih satu WO sesuai kode produksi, warna, dan ukuran. Menggeser kartu tidak mengubah pilihan.
        </FieldDescription>
      </Field>

      {suggestions.length > 0 && (
        <div className="min-w-0 space-y-2">
          <p id={`${id}-products-label`} className="text-xs font-medium">Rekomendasi produk</p>
          <div
            className="flex w-full max-w-full gap-2 overflow-x-auto pb-2"
            role="group"
            aria-labelledby={`${id}-products-label`}
          >
            {suggestions.map((product) => (
              <Button
                key={product}
                type="button"
                size="sm"
                variant={selectedProduct === product ? 'secondary' : 'outline'}
                className="shrink-0"
                aria-pressed={selectedProduct === product}
                disabled={busy}
                onClick={() => setSelectedProduct((current) => current === product ? null : product)}
              >
                {product}
              </Button>
            ))}
          </div>
        </div>
      )}

      {hasFilters && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {selectedProduct !== null && (
            <p className="min-w-0 break-words text-xs text-muted-foreground">
              Produk: {selectedProduct}
            </p>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearFilters}>
            Hapus filter
          </Button>
        </div>
      )}

      {selectedOrder ? (
        <div className="min-w-0 rounded-lg border bg-muted/50 p-3 text-sm" role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-medium">
            <Check className="size-4 shrink-0" aria-hidden="true" /> WO terpilih
          </p>
          <p className="mt-1 break-words font-medium">{selectedOrder.product}</p>
          <p className="break-words text-xs text-muted-foreground">
            {selectedOrder.productNote || 'Kode produksi belum tersedia'} · {selectedOrder.workCode}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            Warna: {selectedOrder.warna || '—'} · Ukuran: {selectedOrder.size || '—'}
          </p>
          {selectedOrder.clientProductionCode && (
            <p className="break-words text-xs text-muted-foreground">Kode client: {selectedOrder.clientProductionCode}</p>
          )}
        </div>
      ) : selectedId ? (
        <p className="text-xs text-muted-foreground" role="status">
          WO terpilih tidak tersedia dalam daftar saat ini. Pilihan tidak diubah otomatis.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Belum ada WO dipilih.</p>
      )}

      {loading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Memuat work order…</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <Card key={index} className={cn('overflow-hidden', index > 0 && 'hidden sm:block', index > 1 && 'sm:hidden lg:block')}>
                <Skeleton className="aspect-[4/3] rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Work order gagal dimuat</AlertTitle>
          <AlertDescription>
            <p className="break-words">{error}</p>
            {onRetry && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRetry}>Coba lagi</Button>}
          </AlertDescription>
        </Alert>
      ) : orders.length === 0 ? (
        <Alert role="status">
          <AlertTitle>Tidak ada WO yang tersedia</AlertTitle>
          <AlertDescription>Belum ada work order yang memenuhi syarat untuk entry ini.</AlertDescription>
        </Alert>
      ) : filteredOrders.length === 0 ? (
        <Alert role="status">
          <AlertTitle>Tidak ada hasil pencarian</AlertTitle>
          <AlertDescription>Ubah kata pencarian atau hapus filter untuk melihat work order lainnya.</AlertDescription>
        </Alert>
      ) : (
        <Carousel
          opts={{ align: 'start', watchDrag: !busy }}
          setApi={setApi}
          className="w-full min-w-0 max-w-3xl"
          aria-label="Daftar work order yang dapat dipilih"
        >
          <CarouselContent>
            {filteredOrders.map((order) => (
              <CarouselItem key={order.id} className="basis-[85%] sm:basis-1/2 lg:basis-1/3">
                <div className="h-full p-1">
                  <Card className={cn('h-full overflow-hidden', selectedId === order.id && 'border-primary')}>
                    <button
                      type="button"
                      className="flex h-full w-full flex-col rounded-xl text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      aria-pressed={selectedId === order.id}
                      disabled={busy}
                      onClick={() => onSelect(order.id)}
                    >
                      <WorkOrderPhoto order={order} />
                      <span className="flex w-full min-w-0 flex-1 flex-col gap-2 p-3">
                        <span className="break-words text-sm font-semibold">{order.product}</span>
                        <span className="break-words text-xs text-muted-foreground">
                          Kode produksi: {order.productNote || '—'}
                        </span>
                        <span className="break-words text-xs text-muted-foreground">WO: {order.workCode}</span>
                        {order.clientProductionCode && (
                          <span className="break-words text-xs text-muted-foreground">Kode client: {order.clientProductionCode}</span>
                        )}
                        <span className="break-words text-xs">Warna: {order.warna || '—'} · Ukuran: {order.size || '—'}</span>
                        <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-medium">
                          {selectedId === order.id && <Check className="size-3 shrink-0" aria-hidden="true" />}
                          {selectedId === order.id ? 'Terpilih' : 'Pilih WO ini'}
                        </span>
                      </span>
                    </button>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <PickerNavigation api={api} disabled={busy} count={filteredOrders.length} />
        </Carousel>
      )}
    </div>
  );
}
