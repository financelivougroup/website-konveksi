import { isR2LogicalBucket, isSafeObjectPath, type R2LogicalBucket } from '../../src/lib/r2';
import type { Env } from './env';
import { HttpError } from './errors';
import { deleteObject } from './sign';

export const MAX_CLEANUP_JOBS = 50;
export const MAX_DELETE_PATHS = 50;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CleanupFile = { bucket: R2LogicalBucket; path: string; backend: 'r2' | 'supabase' };
type CleanupJob = { id: string; leaseToken: string; files: CleanupFile[] };
type CleanupResult = {
  completed: string[];
  pending: string[];
  errors: Array<{ id: string; message: string }>;
};

export function requireLogicalBucket(value: unknown): R2LogicalBucket {
  if (!isR2LogicalBucket(value)) {
    throw new HttpError(403, 'BUCKET_NOT_ALLOWED', 'Jenis lampiran tidak dikenal.');
  }
  return value;
}

export function requirePath(value: unknown): string {
  if (!isSafeObjectPath(value) || /[?#%]/.test(value) || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    // Reject URL syntax / encoded traversal too: R2's existing signer uses a URL.
    throw new HttpError(403, 'INVALID_PATH', 'Path lampiran tidak valid.');
  }
  return value;
}

function serverConfig(env: Env): { base: string; key: string } {
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new HttpError(503, 'DELETE_NOT_CONFIGURED', 'Konfigurasi server SUPABASE_SERVICE_ROLE_KEY belum tersedia.');
  }
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid URL');
    }
  } catch {
    throw new HttpError(503, 'DELETE_NOT_CONFIGURED', 'Konfigurasi server SUPABASE_URL tidak valid.');
  }
  return { base: url.toString().replace(/\/+$/, ''), key: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** Only fixed RPC names on the configured Supabase instance; never relay upstream bodies. */
async function rpc(env: Env, name: string, body: Record<string, unknown>): Promise<unknown> {
  const { base, key } = serverConfig(env);
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      redirect: 'error',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, 'CLEANUP_DATABASE_FAILED', 'Layanan otorisasi/pencatatan penghapusan tidak tersedia.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(403, 'DELETE_FORBIDDEN', 'Penghapusan tidak diizinkan.');
    }
    throw new HttpError(502, 'CLEANUP_DATABASE_FAILED', 'Layanan otorisasi/pencatatan penghapusan gagal.');
  }
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'CLEANUP_DATABASE_FAILED', 'Respons pencatatan penghapusan tidak valid.');
  }
}

export async function authorizeMediaDelete(env: Env, userId: string, bucket: R2LogicalBucket, paths: string[]): Promise<void> {
  const allowed = await rpc(env, 'permanent_delete_authorize_media', {
    p_user_id: userId, p_bucket: bucket, p_paths: paths,
  });
  if (allowed !== true) {
    throw new HttpError(403, 'DELETE_FORBIDDEN', 'Lampiran masih digunakan atau penghapusan tidak diizinkan.');
  }
}

export function requireJobIds(body: Record<string, unknown>): string[] {
  // No caller-supplied manifest, role, user id, backend, or storage URLs accepted.
  if (Object.keys(body).length !== 1 || !Array.isArray(body.jobIds) || body.jobIds.length === 0 || body.jobIds.length > MAX_CLEANUP_JOBS) {
    throw new HttpError(400, 'INVALID_CLEANUP_JOBS', `Kirim 1–${MAX_CLEANUP_JOBS} jobIds saja.`);
  }
  if (!body.jobIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) {
    throw new HttpError(400, 'INVALID_CLEANUP_JOBS', 'jobIds harus berupa UUID yang valid.');
  }
  return [...new Set((body.jobIds as string[]).map((id) => id.toLowerCase()))];
}

function claimManifest(value: unknown, ids: string[]): CleanupJob[] {
  const invalid = () => new HttpError(502, 'INVALID_CLEANUP_MANIFEST', 'Manifest penghapusan server tidak valid.');
  if (!Array.isArray(value) || value.length > ids.length) throw invalid();
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw invalid();
    const job = raw as Record<string, unknown>;
    if (typeof job.id !== 'string' || !ids.includes(job.id.toLowerCase()) || seen.has(job.id.toLowerCase()) ||
        typeof job.leaseToken !== 'string' || !UUID_PATTERN.test(job.leaseToken) || !Array.isArray(job.files)) throw invalid();
    const id = job.id.toLowerCase();
    seen.add(id);
    const files: CleanupFile[] = job.files.map((rawFile: unknown) => {
      if (!rawFile || typeof rawFile !== 'object') throw invalid();
      const file = rawFile as Record<string, unknown>;
      if (file.backend !== 'r2' && file.backend !== 'supabase') throw invalid();
      try {
        return { bucket: requireLogicalBucket(file.bucket), path: requirePath(file.path), backend: file.backend };
      } catch {
        throw invalid();
      }
    });
    return { id, leaseToken: job.leaseToken, files };
  });
}

async function deleteLegacyObject(env: Env, file: CleanupFile): Promise<void> {
  const { base, key } = serverConfig(env);
  // Storage remove API accepts prefixes in JSON, not a caller-controlled fetch URL.
  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(file.bucket)}`, {
    method: 'DELETE', redirect: 'error',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [file.path] }),
  });
  if (!response.ok && response.status !== 404) throw new Error('Storage deletion failed');
}

/**
 * Server-written manifests only. At most 50 object deletes in flight, including
 * jobs >100 files. Ack once per job so its lease stays held across every chunk.
 * A crash before ack is safe: retries delete already-missing objects successfully.
 */
export async function cleanupJobs(env: Env, userId: string, ids: string[]): Promise<CleanupResult> {
  const jobs = claimManifest(await rpc(env, 'permanent_delete_claim_cleanup', {
    p_job_ids: ids, p_user_id: userId,
  }), ids);
  const result: CleanupResult = { completed: [], pending: [...ids], errors: [] };
  for (const job of jobs) {
    const deleted: CleanupFile[] = [];
    let failed = false;
    for (let start = 0; start < job.files.length; start += MAX_DELETE_PATHS) {
      const chunk = job.files.slice(start, start + MAX_DELETE_PATHS);
      const outcomes = await Promise.allSettled(chunk.map(async (file) => {
        if (file.backend === 'r2') await deleteObject(env, file.bucket, file.path);
        else await deleteLegacyObject(env, file);
        return file;
      }));
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') deleted.push(outcome.value);
        else failed = true;
      }
    }
    const message = failed ? 'Sebagian lampiran gagal dihapus; ulangi cleanup.' : null;
    try {
      const accepted = await rpc(env, 'permanent_delete_ack_cleanup', {
        p_job_id: job.id, p_lease_token: job.leaseToken, p_deleted_files: deleted, p_error: message,
      });
      if (accepted !== true) throw new Error('Lease rejected');
      if (!failed) {
        result.completed.push(job.id);
        result.pending = result.pending.filter((id) => id !== job.id);
      } else {
        result.errors.push({ id: job.id, message: message! });
      }
    } catch {
      // Object success is NOT job success if durable acknowledgement failed.
      result.errors.push({ id: job.id, message: 'Pencatatan cleanup gagal atau lease kedaluwarsa; ulangi cleanup.' });
    }
  }
  return result;
}
