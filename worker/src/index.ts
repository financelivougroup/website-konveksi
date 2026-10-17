import {
  isAllowedR2ContentType,
  isSafeObjectPath,
  MAX_R2_UPLOAD_BYTES,
} from '../../src/lib/r2';
import { requireUser } from './auth';
import { authorizeMediaDelete, cleanupJobs, MAX_DELETE_PATHS, requireJobIds, requireLogicalBucket, requirePath } from './cleanup';
import { allowedOrigins, signExpirySeconds, type Env } from './env';
import { errorBody, HttpError, json } from './errors';
import { deleteObject, presignPut } from './sign';

/**
 * Cloudflare Worker penanda tangan R2 — satu-satunya penjaga pintu penyimpanan
 * lampiran. Alur: verifikasi sesi Supabase → validasi permintaan → tandatangani
 * operasi R2. Tidak ada lapisan otorisasi lain di belakangnya (R2 tidak punya RLS),
 * jadi setiap pemeriksaan di bawah ini memang menjadi pertahanan utama.
 */

/** Cleanup accepts IDs only; paths and permission decisions come from the server. */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);
    const url = new URL(request.url);

    // Preflight CORS.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true }, 200, origin);
      }
      if (request.method === 'POST' && url.pathname === '/sign/upload') {
        return await handleUpload(request, env, origin);
      }
      if (request.method === 'POST' && url.pathname === '/sign/delete') {
        return await handleDelete(request, env, origin);
      }
      if (request.method === 'POST' && url.pathname === '/cleanup') {
        const { userId } = await requireUser(request, env);
        const ids = requireJobIds(await readJson(request));
        return json(await cleanupJobs(env, userId, ids), 200, origin);
      }
      throw new HttpError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
    } catch (error) {
      if (error instanceof HttpError) {
        return json(errorBody(error), error.status, origin);
      }
      return json(
        errorBody(new HttpError(500, 'INTERNAL', 'Terjadi kesalahan di server.')),
        500,
        origin,
      );
    }
  },
};

/** Origin yang boleh memakai Worker, atau null bila tidak ada yang cocok. */
function resolveOrigin(request: Request, env: Env): string | null {
  const requestOrigin = request.headers.get('Origin');
  if (!requestOrigin) return null;
  return allowedOrigins(env).includes(requestOrigin) ? requestOrigin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '3600',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    // Bound streamed bodies too; Content-Length alone is caller controlled.
    if (!request.body) throw new Error('Empty body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('bukan objek');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_BODY', 'Isi permintaan bukan JSON yang valid.');
  }
}

async function handleUpload(request: Request, env: Env, origin: string | null): Promise<Response> {
  await requireUser(request, env);
  const body = await readJson(request);

  const logicalBucket = requireLogicalBucket(body.logicalBucket);
  // Preserve upload validation; cleanup/delete use stricter URL-safe paths.
  if (!isSafeObjectPath(body.path)) {
    throw new HttpError(403, 'INVALID_PATH', 'Path lampiran tidak valid.');
  }
  const path = body.path;

  const contentType = body.contentType;
  if (!isAllowedR2ContentType(contentType)) {
    throw new HttpError(415, 'CONTENT_TYPE_NOT_ALLOWED', 'Tipe berkas tidak diizinkan.');
  }
  if (typeof body.size === 'number' && body.size > MAX_R2_UPLOAD_BYTES) {
    throw new HttpError(413, 'FILE_TOO_LARGE', 'Ukuran berkas melebihi batas 10 MB.');
  }

  const expiresIn = signExpirySeconds(env);
  const { uploadUrl, key } = await presignPut(
    env,
    logicalBucket,
    path,
    contentType as string,
    expiresIn,
  );
  return json({ uploadUrl, key, expiresIn }, 200, origin);
}

async function handleDelete(request: Request, env: Env, origin: string | null): Promise<Response> {
  const { userId } = await requireUser(request, env);
  const body = await readJson(request);

  const logicalBucket = requireLogicalBucket(body.logicalBucket);
  const rawPaths = body.paths;
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new HttpError(400, 'INVALID_BODY', 'Daftar path kosong.');
  }
  if (rawPaths.length > MAX_DELETE_PATHS) {
    throw new HttpError(400, 'TOO_MANY_PATHS', `Maksimal ${MAX_DELETE_PATHS} path per permintaan.`);
  }
  const paths = rawPaths.map(requirePath);
  await authorizeMediaDelete(env, userId, logicalBucket, paths);

  // Best-effort, seperti `storage.remove`: sebagian boleh gagal tanpa
  // menggagalkan keseluruhan, dan kegagalannya dilaporkan per path.
  const results = await Promise.allSettled(
    paths.map((path) => deleteObject(env, logicalBucket, path)),
  );

  const errors: Array<{ path: string; message: string }> = [];
  let deleted = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      deleted += 1;
    } else {
      errors.push({ path: paths[index], message: 'Gagal menghapus lampiran.' });
    }
  });

  return json({ deleted, errors }, 200, origin);
}
