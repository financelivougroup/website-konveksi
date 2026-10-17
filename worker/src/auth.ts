import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';
import { HttpError } from './errors';

/**
 * Verifikasi sesi Supabase memakai kunci PUBLIK (JWKS, ES256).
 *
 * Project ini sudah memakai penandatanganan asimetris, jadi Worker cukup
 * mengambil kunci publik dari JWKS — TIDAK perlu menyimpan JWT secret bersama.
 * Itu jauh lebih aman: membocorkan kunci publik tidak berguna bagi penyerang,
 * sementara membocorkan secret HS256 berarti siapa pun bisa membuat token admin.
 *
 * JWKS diambil sekali per isolate lalu di-cache oleh `jose`.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(supabaseUrl);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  jwksCache.set(supabaseUrl, jwks);
  return jwks;
}

/**
 * Pastikan permintaan membawa token sesi yang sah, lalu kembalikan id pengguna.
 *
 * Identitas HANYA diambil dari `payload.sub` yang sudah terverifikasi — tidak
 * pernah dari nilai yang dikirim klien.
 */
export async function requireUser(request: Request, env: Env): Promise<{ userId: string }> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new HttpError(401, 'MISSING_TOKEN', 'Token sesi tidak ditemukan.');
  }
  try {
    const { payload } = await jwtVerify(token, jwksFor(env.SUPABASE_URL), {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    if (typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) {
      throw new Error('Token tidak memuat subjek pengguna yang valid.');
    }
    return { userId: payload.sub.toLowerCase() };
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Sesi tidak valid atau sudah kedaluwarsa.');
  }
}
