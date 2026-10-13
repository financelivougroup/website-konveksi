import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'smoke');
mkdirSync(outdir, { recursive: true });
const outfile = path.join(outdir, 'work-order-photos.mjs');

await build({
  entryPoints: [path.join(root, 'scripts', 'smoke-work-order-photos.test.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  alias: {
    '@/lib/supabase': path.join(root, 'scripts', 'stubs', 'work-order-photos.ts'),
    '@': path.join(root, 'src'),
  },
  define: {
    'import.meta.env': JSON.stringify({ VITE_R2_PUBLIC_BASE: 'https://attachments.example.test' }),
  },
  logLevel: 'error',
});

await import(pathToFileURL(outfile).href);
