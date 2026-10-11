/**
 * Bundles the log-panel SSR smoke test with esbuild and runs it under node.
 * Mirrors scripts/smoke-datatable.mjs.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'smoke');
mkdirSync(outdir, { recursive: true });
const outfile = path.join(outdir, 'logpanel.mjs');

await build({
  entryPoints: [path.join(root, 'scripts', 'smoke-logpanel.test.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      'const require = __cr(import.meta.url);',
    ].join('\n'),
  },
  alias: {
    '@/lib/supabase': path.join(root, 'scripts', 'stubs', 'supabase.ts'),
    '@': path.join(root, 'src'),
  },
  define: { 'import.meta.env': JSON.stringify({}) },
  logLevel: 'error',
});

await import(pathToFileURL(outfile).href);
