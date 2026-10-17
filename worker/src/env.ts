/** Binding lingkungan Worker. Rahasia dipasang lewat `wrangler secret put`. */
export interface Env {
  /** Id akun Cloudflare — rahasia. */
  R2_ACCOUNT_ID: string;
  /** Access key id token API R2 (S3) — rahasia. */
  R2_ACCESS_KEY_ID: string;
  /** Secret access key token API R2 (S3) — rahasia. */
  R2_SECRET_ACCESS_KEY: string;
  /** Nama bucket R2, mis. `konveksi-attachments`. */
  R2_BUCKET: string;
  /** Masa berlaku URL bertanda tangan (detik), sebagai string dari `[vars]`. */
  SIGN_EXPIRY_SECONDS: string;
  /** Basis project Supabase, dipakai untuk mengambil JWKS. */
  SUPABASE_URL: string;
  /**
   * Server-only secret, required for /cleanup and /sign/delete.
   * Setup: wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   * Local development: set this name in ignored worker/.dev.vars.
   * Never put the value in wrangler.toml, VITE_* variables, responses, or logs.
   * The database RPCs must be installed before enabling these delete routes.
   */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Daftar origin yang diizinkan, dipisah koma. */
  ALLOWED_ORIGINS: string;
}

/** Masa berlaku tanda tangan dalam detik; default 15 menit. */
export function signExpirySeconds(env: Env): number {
  const parsed = Number.parseInt(env.SIGN_EXPIRY_SECONDS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 900;
}

/** Daftar origin yang diizinkan memanggil Worker. */
export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
