import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, PackageSearch, RefreshCw } from 'lucide-react';
import { AppSelect } from '@/components/AppSelect';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildLowStock, filterLowStockRows, lowStockClients, stockLevel } from '@/lib/lowStock';
import { clampPage, paginate, totalPages } from '@/lib/pagination';
import { rowClass, T_SUB_LABEL, T_TABLE, T_TD, T_TH } from '@/lib/tableStyles';
import { fetchLowStock } from '@/services/lowStock';
import type { LowStockFilters, LowStockRow, LowStockSnapshot, StockSummary } from '@/types/lowStock';

const EMPTY_FILTERS: LowStockFilters = { search: '', client: '' };
const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Tingkat stok ditampilkan sebagai badge berlabel teks, bukan warna saja —
 * supaya tetap terbaca tanpa persepsi warna. `Out` (habis) dibedakan dari
 * `Low` (masih ada tapi di bawah batas), dan `Belum ada data` tidak pernah
 * ditampilkan sebagai nol.
 */
function StockBadge({ row }: { row: LowStockRow }) {
  const level = stockLevel(row);
  if (level === 'unknown') {
    return <span className="text-muted-foreground">Belum ada data</span>;
  }
  const label = level === 'out' ? 'Out' : level === 'low' ? 'Low' : null;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
      {number(row.availableQuantity!)}
      {label && (
        <Badge variant={level === 'out' ? 'destructive' : 'outline'} className="whitespace-nowrap">
          {label}
        </Badge>
      )}
    </span>
  );
}

/** Satu angka ringkas; label selalu ikut supaya tidak bergantung warna saja. */
function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="min-w-0 shadow-none">
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{number(value)}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function StatTiles({ summary }: { summary: StockSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile label="Total SKU" value={summary.totalSku} hint="variasi stok unik" />
      <StatTile label="Stok Habis" value={summary.out} hint="qty ≤ 0" />
      <StatTile label="Stok Rendah" value={summary.low} hint="qty 1–49" />
      <StatTile label="Dalam Produksi" value={summary.inProduction} hint="variasi aktif" />
      <StatTile label="Belum Ada Data" value={summary.unknown} hint="qty belum terisi" />
    </div>
  );
}

function StockSection({ title, description, rows, production, emptyText, page, onPageChange }: {
  title: string;
  description: string;
  rows: LowStockRow[];
  production?: boolean;
  emptyText: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const currentPage = clampPage(page, rows.length);
  const pages = totalPages(rows.length);
  return (
    <Card className="min-w-0 overflow-hidden shadow-none">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary">{number(rows.length)} variasi</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground" role="status">
            <PackageSearch className="size-7" aria-hidden="true" />
            <p>{emptyText}</p>
          </div>
        ) : (
          <>
            <div className="max-w-full overflow-x-auto rounded-lg border">
              <Table className={T_TABLE} aria-label={title}>
                <TableHeader>
                  <TableRow>
                    {['Client', 'Produk', 'Warna', 'Size', 'Stok Available', ...(production ? ['Tahap', 'Jumlah Order', 'Qty Order Aktif', 'Sisa Finishing'] : [])].map((label) => (
                      <TableHead key={label} className={T_TH}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(rows, currentPage).map((row, index) => (
                    <TableRow key={row.key} className={rowClass(index)}>
                      <TableCell className={T_TD}>{row.brand || '—'}</TableCell>
                      <TableCell className={T_TD}>
                        <div className="min-w-32 font-medium">{row.product || '—'}</div>
                        <div className={T_SUB_LABEL}>{row.productId || 'ID belum tersedia'}</div>
                      </TableCell>
                      <TableCell className={T_TD}>{row.color || '—'}</TableCell>
                      <TableCell className={T_TD}>{row.size || '—'}</TableCell>
                      <TableCell className={T_TD}>
                        {row.stockState === 'ambiguous'
                          ? <span className="text-muted-foreground">Data stok ganda</span>
                          : <StockBadge row={row} />}
                      </TableCell>
                      {production && <>
                        <TableCell className={T_TD}><div className="flex flex-wrap gap-1">{row.stages.map((stage) => <Badge key={stage} variant="secondary" className="whitespace-nowrap">{stage}</Badge>)}</div></TableCell>
                        <TableCell className={`${T_TD} text-right tabular-nums`}>{number(row.orderCount)}</TableCell>
                        <TableCell className={`${T_TD} text-right tabular-nums`}>{number(row.orderQuantity)}</TableCell>
                        <TableCell className={`${T_TD} text-right tabular-nums`}>{number(row.remainingFinishing)}</TableCell>
                      </>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Halaman {currentPage} dari {pages} · {number(rows.length)} variasi</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label={`Halaman sebelumnya ${title}`}><ChevronLeft className="size-4" />Sebelumnya</Button>
                <Button variant="outline" size="sm" disabled={currentPage >= pages} onClick={() => onPageChange(currentPage + 1)} aria-label={`Halaman berikutnya ${title}`}>Berikutnya<ChevronRight className="size-4" /></Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function StockMonitoringPage() {
  const [snapshot, setSnapshot] = useState<LowStockSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [productionPage, setProductionPage] = useState(1);
  const [waitingPage, setWaitingPage] = useState(1);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchLowStock();
      if (request !== generation.current) return;
      setSnapshot(next);
      setUpdatedAt(new Date());
      setProductionPage(1);
      setWaitingPage(1);
    } catch (err) {
      if (request === generation.current) setError(err instanceof Error ? err.message : 'Gagal memuat monitoring stok.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Nilai ref disalin ke variabel LOKAL sebelum dipakai di cleanup.
    // Membaca `generation.current` langsung di dalam cleanup ditandai ESLint
    // (`react-hooks/exhaustive-deps`) karena isinya bisa sudah berubah saat
    // cleanup berjalan — dan memang itu tujuannya di sini, jadi polanya
    // ditulis eksplisit alih-alih menekan peringatannya.
    const gen = generation;
    return () => { gen.current++; };
  }, [load]);

  const result = useMemo(() => snapshot ? buildLowStock(snapshot) : null, [snapshot]);
  const clients = useMemo(() => lowStockClients([...(result?.inProduction ?? []), ...(result?.waitingProduction ?? [])]), [result]);
  const productionRows = useMemo(() => filterLowStockRows(result?.inProduction ?? [], filters), [result, filters]);
  const waitingRows = useMemo(() => filterLowStockRows(result?.waitingProduction ?? [], filters), [result, filters]);
  const changeFilters = (next: LowStockFilters) => {
    setFilters(next);
    setProductionPage(1);
    setWaitingPage(1);
  };
  const filtered = Boolean(filters.search || filters.client);

  return (
    <div className="min-w-0 space-y-5 px-4 pb-6 pt-3 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">Stock Monitoring</h1>
          {updatedAt && <p className="mt-1 text-xs text-muted-foreground">Pembaruan terakhir {updatedAt.toLocaleTimeString('id-ID')}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="stock-monitoring-search" className="mb-2 block text-sm font-medium">Cari produk / variasi</label>
          <Input id="stock-monitoring-search" placeholder="Produk, Product ID, warna, size…" value={filters.search} onChange={(event) => changeFilters({ ...filters, search: event.target.value })} />
        </div>
        <AppSelect id="stock-monitoring-client" label="Client" className="w-full sm:w-52" value={filters.client} onValueChange={(client) => changeFilters({ ...filters, client })} options={clients} placeholder="Semua client" />
        {filtered && <Button variant="ghost" onClick={() => changeFilters(EMPTY_FILTERS)}>Reset filter</Button>}
      </div>
      {loading ? <div className="space-y-4" role="status" aria-label="Memuat monitoring stok"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>
        : error ? <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>Data belum dapat dimuat</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Coba lagi</Button></AlertDescription></Alert>
          : result && <>
            <StatTiles summary={result.summary} />
            {snapshot?.stocks.length === 0 && <Alert><PackageSearch className="size-4" /><AlertTitle>Data stok belum tersedia</AlertTitle><AlertDescription>Data stok belum tersedia di Raw Product Monitoring. Stok belum diketahui, bukan berarti stok nol atau semua stok aman.</AlertDescription></Alert>}
            {result.issues.length > 0 && <Alert><AlertTriangle className="size-4" /><AlertTitle>{result.issues.length} catatan kualitas data</AlertTitle><AlertDescription><p>Sebagian data belum dapat diklasifikasikan dengan pasti. Daftar belum produksi berdasarkan identitas produksi yang dapat dicocokkan.</p><ul className="mt-2 list-inside list-disc">{result.issues.slice(0, 5).map((issue, i) => <li key={i}>{issue}</li>)}</ul>{result.issues.length > 5 && <p>Dan {result.issues.length - 5} catatan lainnya.</p>}</AlertDescription></Alert>}
            <StockSection title="Dalam Produksi" description="Semua variasi sejak Draft sampai finishing selesai, tanpa batas stok. Qty dalam pcs; jumlah order menghitung order unik, termasuk pekerjaan mandiri tanpa parent." production rows={productionRows} page={productionPage} onPageChange={setProductionPage} emptyText={filtered ? 'Tidak ada produksi yang cocok dengan filter.' : 'Belum ada variasi dalam produksi.'} />
            <StockSection title="Stok <50 — Belum Produksi" description="Stok available kurang dari 50 pcs yang belum memiliki produksi aktif untuk client, Product ID, warna, dan size yang sama." rows={waitingRows} page={waitingPage} onPageChange={setWaitingPage} emptyText={snapshot?.stocks.length === 0 ? 'Isi data stok di sumber Raw Product Monitoring terlebih dahulu.' : filtered ? 'Tidak ada stok low yang cocok dengan filter.' : 'Tidak ada variasi yang dapat dipastikan stoknya <50 dan belum produksi.'} />
            <p className="text-xs text-muted-foreground">Sumber stok: Raw Product Monitoring. Qty produksi dan hasil finishing tidak otomatis menambah stok available. Status jahitan maupun pembayaran tidak menentukan selesainya produksi pada halaman ini. Stat tile dihitung dari seluruh data, tidak mengikuti filter.</p>
          </>}
    </div>
  );
}
