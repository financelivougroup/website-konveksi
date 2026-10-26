import { AwsClient } from 'aws4fetch';
import { r2Key, type R2LogicalBucket } from '../../src/lib/r2';
import type { Env } from './env';

/**
 * Penandatanganan permintaan ke R2 memakai SigV4 (via `aws4fetch`).
 *
 * R2 berbicara protokol S3, jadi tanda tangannya adalah SigV4 biasa. Endpoint
 * bergaya path: `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`.
 */

function client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

function objectUrl(env: Env, key: string): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
}

/**
 * URL objek dengan setiap segmen di-encode.
 *
 * Dipakai operasi yang membawa kunci apa adanya (hapus, baca). `encodeURIComponent`
 * per segmen menjaga garis miring sebagai pemisah path, sementara spasi/unicode
 * di nama berkas tidak berubah menjadi sintaks URL.
 */
function encodedObjectUrl(env: Env, key: string): string {
  return objectUrl(env, key.split('/').map(encodeURIComponent).join('/'));
}

/**
 * Unggah satu objek atas nama browser.
 *
 * Kenapa di sini, bukan lewat URL presigned: R2 hanya mengizinkan CORS pada
 * bucket yang punya kebijakan CORS, dan token API proyek ini **tidak berhak
 * mengubahnya** (`PUT ?cors` dijawab 403 AccessDenied). Tanpa kebijakan itu,
 * browser memblokir PUT lintas-origin sebelum permintaan terkirim — preflight
 * `OPTIONS` ke `r2.cloudflarestorage.com` dijawab 403 — sehingga unggahan
 * gagal tanpa jejak objek apa pun. Mengalirkan isi berkas lewat Worker
 * menghapus ketergantungan CORS R2 sepenuhnya; browser hanya bicara dengan
 * origin Worker, yang CORS-nya kita kendalikan sendiri.
 *
 * `contentType` tetap ditandatangani sebagai header, jadi tipe berkas tidak
 * bisa dipalsukan setelah validasi Worker.
 */
export async function putObject(
  env: Env,
  logicalBucket: R2LogicalBucket,
  path: string,
  contentType: string,
  body: ArrayBuffer,
): Promise<{ key: string }> {
  const key = r2Key(logicalBucket, path);
  const res = await client(env).fetch(encodedObjectUrl(env, key), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
    redirect: 'manual',
  });
  if (!res.ok) {
    throw new Error(`R2 menolak unggahan (HTTP ${res.status}).`);
  }
  return { key };
}

/**
 * Hapus satu objek. Dipanggil Worker sendiri (bukan dari browser), jadi memakai
 * permintaan bertanda tangan header, bukan URL presigned.
 */
export async function deleteObject(
  env: Env,
  logicalBucket: R2LogicalBucket,
  path: string,
): Promise<void> {
  const key = r2Key(logicalBucket, path);
  // Keep the exact validated key (including spaces/unicode); URL parsing must
  // never turn filename characters into URL syntax or trim trailing whitespace.
  const res = await client(env).fetch(encodedObjectUrl(env, key), { method: 'DELETE', redirect: 'manual' });
  // 404 dianggap sukses: objeknya memang sudah tidak ada.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 menolak penghapusan (HTTP ${res.status}).`);
  }
}

/**
 * Ambil satu objek dari R2 untuk disajikan lewat Worker (`GET /media/...`).
 *
 * Kenapa lewat Worker: domain `*.r2.dev` diblokir DNS oleh sebagian ISP Indonesia,
 * sehingga `<img src="https://pub-....r2.dev/...">` tidak pernah sampai ke
 * Cloudflare. Rute ini membuat browser memakai origin Worker yang tidak diblokir.
 *
 * Objek di bucket ini tidak dibuka publik lewat API S3, jadi pembacaan perlu
 * tanda tangan SigV4 — dilakukan di sini, bukan di browser.
 */
export async function getObject(
  env: Env,
  logicalBucket: R2LogicalBucket,
  path: string,
): Promise<{ body: ReadableStream | null; contentType: string | null; contentLength: string | null } | null> {
  const key = r2Key(logicalBucket, path);
  const res = await client(env).fetch(encodedObjectUrl(env, key), { method: 'GET', redirect: 'manual' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 menolak pembacaan (HTTP ${res.status}).`);
  return {
    body: res.body,
    contentType: res.headers.get('Content-Type'),
    contentLength: res.headers.get('Content-Length'),
  };
}
