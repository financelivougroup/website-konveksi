/**
 * Bundles the DataTable SSR smoke test with esbuild and runs it under node.
 *
 * React must be external (the bundle would otherwise carry a second copy and
 * break hooks); everything else is inlined. The alias map mirrors the project's
 * vite/tsconfig `@/` path so the component's own imports resolve.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'smoke');
mkdirSync(outdir, { recursive: true });
const outfile = path.join(outdir, 'datatable.mjs');

await build({
  entryPoints: [path.join(root, 'scripts', 'smoke-datatable.test.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  jsx: 'automatic',
  // React stays external: bundling it would ship a second copy and break hooks.
  // The banner restores a real `require` so the CJS React build can load from
  // the ESM output.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      'const require = __cr(import.meta.url);',
    ].join('\n'),
  },
  alias: {
    // The real client throws without VITE_SUPABASE_* env vars; the table under
    // test never queries, so a stub keeps the bundle importable.
    '@/lib/supabase': path.join(root, 'scripts', 'stubs', 'supabase.ts'),
    '@': path.join(root, 'src'),
  },
  // Vite-only globals that some transitive modules read at import time.
  define: { 'import.meta.env': JSON.stringify({}) },
  logLevel: 'error',
});

await import(pathToFileURL(outfile).href);
