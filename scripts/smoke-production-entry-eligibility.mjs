import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'smoke');
mkdirSync(outdir, { recursive: true });
const outfile = path.join(outdir, 'production-entry-eligibility.mjs');
const stub = path.join(root, 'scripts/stubs/production-entry.ts');
await build({
  entryPoints: [path.join(root, 'scripts/smoke-production-entry-eligibility.test.tsx')],
  bundle: true, format: 'esm', platform: 'node', target: 'node20', outfile, jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  alias: Object.fromEntries([
    ['@', path.join(root, 'src')], ['@/lib/supabase', path.join(root, 'scripts/stubs/supabase.ts')],
    ...['@/contexts/AuthContext', '@/services/workOrders', '@/services/cuttingRecords', '@/services/sewingRecords',
      '@/services/kancingRecords', '@/services/finishingRecords', '@/services/autoInvoice', '@/services/registerPenjahit'].map((name) => [name, stub]),
  ]),
  define: { 'import.meta.env': '{}' }, logLevel: 'error',
});
await import(pathToFileURL(outfile).href);
