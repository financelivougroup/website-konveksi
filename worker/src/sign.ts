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
 * Buat URL PUT bertanda tangan (presigned) untuk satu objek.
 *
 * `contentType` IKUT ditandatangani: pemanggil wajib mengirim header
 * `Content-Type` yang persis sama saat PUT, kalau tidak R2 menolak dengan
 * SignatureDoesNotMatch. Dengan begitu tipe berkas asli tidak bisa dipalsukan
 * setelah URL keluar dari Worker.
 */
export async function presignPut(
  env: Env,
  logicalBucket: R2LogicalBucket,
  path: string,
  contentType: string,
  expiresIn: number,
): Promise<{ uploadUrl: string; key: string }> {
  const key = r2Key(logicalBucket, path);
  const url = new URL(objectUrl(env, key));
  url.searchParams.set('X-Amz-Expires', String(expiresIn));

  const signed = await client(env).sign(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    aws: { signQuery: true },
  });

  return { uploadUrl: signed.url, key };
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
  const res = await client(env).fetch(objectUrl(env, key), { method: 'DELETE' });
  // 404 dianggap sukses: objeknya memang sudah tidak ada.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 menolak penghapusan (HTTP ${res.status}).`);
  }
}
