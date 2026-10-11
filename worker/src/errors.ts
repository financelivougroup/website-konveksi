/** Kesalahan HTTP dengan status dan kode yang jelas, dikembalikan sebagai JSON. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Balasan JSON dengan header CORS.
 *
 * Header CORS selalu ikut supaya galat pun terbaca browser (tanpa itu, kegagalan
 * hanya tampak sebagai "CORS error" tanpa isi).
 */
export function json(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/** Bentuk galat yang seragam: `{ error: { message, code } }`. */
export function errorBody(error: HttpError): { error: { message: string; code: string } } {
  return { error: { message: error.message, code: error.code } };
}
