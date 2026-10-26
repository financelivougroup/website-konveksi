import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { tentukanRute } from '@/lib/kpiRoute';
import { fetchScope } from '@/services/kpiProduksi';
import type { KpiScope } from '@/types/kpi';
import { KpiErrorState } from './KpiShell';
import { KpiTeamPage } from './KpiTeamPage';
import { KpiOrangPage } from './KpiOrangPage';
import { KpiSettingsPage } from './KpiSettingsPage';

/**
 * Penjaga rute dashboard Kinerja Produksi.
 *
 * Tiga rute (brief bagian 5):
 *   /laporan            → dialihkan menurut peran
 *   /laporan/team       → owner & finance
 *   /laporan/orang/:id  → owner & finance (semua orang); penjahit & finishing
 *                         hanya dirinya sendiri
 *
 * **Parameter `:id` TIDAK dipercaya untuk role terbatas.** Penjahit yang
 * mengetik `/laporan/orang/7` tetap melihat datanya sendiri: id diambil dari
 * `kpi_orang_scope()` yang membacanya dari `profiles.orang_id` di server, dan
 * URL-nya diperbaiki agar tidak menampilkan alamat yang menyesatkan. RLS
 * database sudah menolak id asing itu juga — lapisan ini hanya mencegah user
 * melihat halaman kosong tanpa penjelasan.
 *
 * Keputusan rute TIDAK ditulis ulang di sini: seluruhnya didelegasikan ke
 * `tentukanRute()` di `src/lib/kpiRoute.ts`, yang diuji terpisah dengan
 * `node --test`. Komponen ini hanya menjalankan keputusannya.
 */
export function KpiRouter() {
  const location = useLocation();
  const [hasil, setHasil] = useState<{
    scope: KpiScope | null;
    error: Error | null;
    nonce: number;
  } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let aktif = true;

    // `.then()`, bukan `await` di badan effect: setState yang berjalan sinkron
    // di dalam effect ditolak `react-hooks/set-state-in-effect`.
    void fetchScope().catch((cause: unknown) => ({
      data: null,
      error: cause instanceof Error ? cause : new Error('Gagal membaca identitas sesi.'),
    })).then((res) => {
      if (!aktif) return;
      setHasil({ scope: res.data, error: res.error, nonce });
    });

    return () => {
      aktif = false;
    };
  }, [nonce]);

  // Selama hasil untuk `nonce` terbaru belum tiba, halaman masih memuat.
  const loading = hasil === null || hasil.nonce !== nonce;
  const scope = loading ? null : hasil.scope;
  const error = loading ? null : hasil.error;

  if (loading) {
    return (
      <div className="px-4 pb-5 pt-4 sm:px-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pb-5 pt-4 sm:px-6">
        <KpiErrorState
          pesan={error.message}
          onRetry={() => setNonce((n) => n + 1)}
        />
      </div>
    );
  }

  const keputusan = tentukanRute(
    location.pathname,
    scope ?? { orangId: null, bisaTim: false, punyaAkses: false },
  );

  if (keputusan.jenis === 'tanpa-akses') {
    return (
      <div className="px-4 pb-5 pt-4 sm:px-6">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>Tidak ada akses</EmptyTitle>
            <EmptyDescription>
              Akun ini belum terhubung ke data karyawan, jadi belum ada kinerja
              produksi yang bisa ditampilkan. Hubungi Owner atau Finance untuk
              menautkan akun ke data karyawan.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
              Periksa ulang
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (keputusan.jenis === 'alihkan') {
    return <Navigate to={keputusan.ke} replace />;
  }

  // Setelah dua cabang di atas, scope dijamin ada: `tentukanRute` hanya
  // menghasilkan 'tim'/'orang' bila `punyaAkses` true.
  if (!scope) return null;

  if (keputusan.jenis === 'pengaturan') return <KpiSettingsPage />;
  if (keputusan.jenis === 'tim') {
    return <KpiTeamPage scope={scope} />;
  }

  return <KpiOrangPage key={keputusan.orangId} scope={scope} orangId={keputusan.orangId} />;
}
