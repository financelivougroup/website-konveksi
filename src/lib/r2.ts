/**
 * Logika murni penyimpanan lampiran di Cloudflare R2.
 *
 * Kenapa R2: teks tetap di Supabase (PostgreSQL), tetapi berkas/foto pindah ke R2
 * karena tidak ada biaya egress. R2 tidak punya RLS, jadi penulisan dan
 * penghapusan lewat Cloudflare Worker (lihat `worker/`) — modul ini hanya
 * merangkai kunci dan URL, tanpa IO, supaya bisa diuji `node --test` sekaligus
 * dipakai ulang oleh Worker (yang mengimpor berkas ini apa adanya).
 *
 * SATU bucket R2 dipakai untuk semua jenis lampiran; jenisnya dibedakan oleh
 * awalan `R2LogicalBucket`. Kolom `file_path` di database TIDAK berubah (tetap
 * tanpa awalan) — awalan ditambahkan di sini, jadi seluruh call site tetap utuh.
 */

export const R2_LOGICAL_BUCKETS = [
  'product-photos',
  'complain-proofs',
  'expense-proofs',
  'invoice-payment-proofs',
] as const;

export type R2LogicalBucket = (typeof R2_LOGICAL_BUCKETS)[number];

/** True bila `value` adalah salah satu jenis lampiran yang dikenal. */
export function isR2LogicalBucket(value: unknown): value is R2LogicalBucket {
  return typeof value === 'string' && (R2_LOGICAL_BUCKETS as readonly string[]).includes(value);
}

/**
 * Kunci objek di bucket R2: `<jenis>/<path>`.
 *
 * Path relatif dari database dibiarkan apa adanya kecuali garis miring di depan
 * dibuang, supaya kunci tidak pernah berawalan `//` (yang terbaca seperti path
 * absolut oleh sebagian server).
 */
export function r2Key(logicalBucket: R2LogicalBucket, path: string): string {
  return `${logicalBucket}/${path.replace(/^\/+/, '')}`;
}

/**
 * URL publik objek.
 *
 * `baseUrl` disuntikkan (bukan dibaca dari env) supaya fungsi ini tetap murni dan
 * bisa diuji; lapisan service yang mengisi `import.meta.env.VITE_R2_PUBLIC_BASE`.
 *
 * Mengembalikan null bila `path` kosong atau basis belum dikonfigurasi, sehingga
 * pemanggil cukup mengecek truthy sebelum merender `<img>` — sama seperti
 * `productPhotoUrl` sebelum migrasi.
 */
export function r2PublicUrl(
  baseUrl: string | undefined,
  logicalBucket: R2LogicalBucket,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  if (!baseUrl) return null;
  const base = baseUrl.replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/${r2Key(logicalBucket, path)}`;
}

/**
 * Awalan rute baca lampiran di Worker (`GET /media/<jenis>/<path>`).
 *
 * Kenapa lewat Worker, bukan `r2.dev`: domain `*.r2.dev` diblokir DNS oleh
 * beberapa ISP Indonesia ("Internet Positif"), sehingga `<img>` tidak pernah
 * sampai ke Cloudflare. `*.workers.dev` tidak ikut diblokir, jadi Worker dipakai
 * sebagai pintu baca sekaligus pintu tulis.
 */
export const MEDIA_PATH_PREFIX = '/media/';

/** Batas panjang kunci objek (karakter); jauh di bawah batas 1024 milik S3/R2. */
export const MAX_R2_KEY_LENGTH = 512;

/**
 * Pecah `pathname` rute media menjadi jenis lampiran dan path relatif.
 *
 * Mengembalikan null bila bukan rute media, jenis lampiran tidak dikenal, atau
 * path-nya tidak aman — pemanggil (Worker) lalu menjawab 404/403. Fungsi ini
 * murni supaya bisa diuji tanpa Worker.
 */
export function parseMediaObjectPath(
  pathname: string,
): { logicalBucket: R2LogicalBucket; path: string } | null {
  if (!pathname.startsWith(MEDIA_PATH_PREFIX)) return null;
  const rest = pathname.slice(MEDIA_PATH_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const logicalBucket = rest.slice(0, slash);
  if (!isR2LogicalBucket(logicalBucket)) return null;
  const path = rest.slice(slash + 1);
  if (!isSafeObjectPath(path)) return null;
  // Path datang dari URL, jadi karakter sintaks URL sudah tidak boleh tersisa.
  if (/[?#%\\]/.test(path)) return null;
  return { logicalBucket, path };
}

/**
 * Validasi path relatif sebelum dijadikan kunci objek.
 *
 * Dipakai Worker — satu-satunya penjaga pintu, karena R2 tidak punya RLS.
 * Yang ditolak: path kosong, kepanjangan, berawalan garis miring, mengandung
 * garis miring balik, segmen kosong (`//`), dan segmen `.` atau `..` (traversal).
 */
export function isSafeObjectPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.length > MAX_R2_KEY_LENGTH) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

/** Ukuran unggahan maksimum (byte) yang boleh ditandatangani Worker. */
export const MAX_R2_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Tipe MIME yang boleh diunggah.
 *
 * Dua awalan pertama sama dengan atribut `accept` pada input berkas di UI
 * (`image/*` di Order Entry, Detail Panel, dan Complain; `image/*,application/pdf`
 * di Payment Modal) supaya aturan klien dan Worker tidak bisa berbeda.
 *
 * `application/octet-stream` ikut diizinkan sebagai cadangan ketika browser tidak
 * memberi label tipe pada berkas — perilaku Supabase Storage sebelumnya pun
 * permisif. Tipe ini aman: berkas diunduh, tidak dirender browser, jadi tidak
 * membuka celah XSS lewat lampiran HTML.
 */
export const ALLOWED_R2_CONTENT_TYPES = ['image/', 'application/pdf', 'application/octet-stream'] as const;

/**
 * Tipe yang ditolak meski cocok dengan allow-list di atas.
 *
 * `image/svg+xml` lolos awalan `image/`, padahal SVG bisa memuat skrip dan
 * dieksekusi browser saat dibuka langsung dari domain publik R2 — vektor XSS
 * tersimpan. Foto produk/nota/bukti nyatanya JPEG/PNG, jadi SVG tidak diperlukan.
 * Tipe markup lain ditolak dengan alasan yang sama.
 */
export const DENIED_R2_CONTENT_TYPES = [
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
] as const;

/** True bila `contentType` termasuk yang diizinkan dan bukan tipe berbahaya. */
export function isAllowedR2ContentType(contentType: unknown): boolean {
  if (typeof contentType !== 'string' || contentType.length === 0) return false;
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if ((DENIED_R2_CONTENT_TYPES as readonly string[]).includes(normalized)) return false;
  return ALLOWED_R2_CONTENT_TYPES.some((allowed) =>
    allowed.endsWith('/') ? normalized.startsWith(allowed) : normalized === allowed,
  );
}
