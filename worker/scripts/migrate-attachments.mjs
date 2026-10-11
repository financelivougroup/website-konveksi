/**
 * Salin 11 objek lampiran dari Supabase Storage ke Cloudflare R2.
 *
 * Sumbernya bucket publik, jadi tidak perlu kunci Supabase sama sekali — cukup
 * unduh lewat URL publik, lalu PUT ke R2 dengan SigV4. `Content-Type` asli
 * dipertahankan (diambil dari manifest) karena R2 tidak menebak tipe dari ekstensi.
 *
 * Jalankan dari folder `worker/` (butuh dependensi di sana):
 *   cd worker
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *     node scripts/migrate-attachments.mjs
 *
 * Tambahkan `--dry-run` untuk sekadar melihat rencananya.
 *
 * Skrip ini IDEMPOTEN: menjalankannya ulang hanya menimpa objek yang sama.
 * Ia TIDAK menghapus apa pun di Supabase — bucket lama tetap utuh sebagai jalur balik.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://ihmhxacmvvsqtnylnwrs.supabase.co';
const R2_BUCKET = process.env.R2_BUCKET ?? 'konveksi-attachments';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!dryRun && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)) {
  console.error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, dan R2_SECRET_ACCESS_KEY wajib diisi.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, 'attachments-manifest.json'), 'utf8'));

// Impor dinamis supaya `--dry-run` tetap jalan tanpa `npm install` di worker/.
const aws = dryRun
  ? null
  : new (await import('aws4fetch')).AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

/** Kunci di R2: `<jenis>/<path>` — sama dengan `r2Key` di src/lib/r2.ts. */
function r2Key(bucket, path) {
  return `${bucket}/${path}`;
}

function r2Url(key) {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
}

let ok = 0;
let failed = 0;

for (const item of manifest) {
  const key = r2Key(item.bucket, item.path);
  const sourceUrl = `${SUPABASE_URL}/storage/v1/object/public/${item.bucket}/${item.path}`;

  if (dryRun) {
    console.log(`[dry-run] ${sourceUrl}\n       -> ${R2_BUCKET}/${key} (${item.mimetype}, ${item.size} B)`);
    continue;
  }

  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`unduh gagal (HTTP ${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength !== item.size) {
      throw new Error(`ukuran tidak cocok: ${bytes.byteLength} != ${item.size}`);
    }

    const put = await aws.fetch(r2Url(key), {
      method: 'PUT',
      headers: { 'Content-Type': item.mimetype },
      body: bytes,
    });
    if (!put.ok) throw new Error(`unggah gagal (HTTP ${put.status})`);

    ok += 1;
    console.log(`OK  ${R2_BUCKET}/${key} (${bytes.byteLength} B, ${item.mimetype})`);
  } catch (error) {
    failed += 1;
    console.error(`GAGAL  ${key}: ${error instanceof Error ? error.message : error}`);
  }
}

if (!dryRun) {
  console.log(`\nSelesai: ${ok} berhasil, ${failed} gagal dari ${manifest.length} objek.`);
  process.exit(failed === 0 ? 0 : 1);
}
