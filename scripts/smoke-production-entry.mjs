import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'production-entry-preview');
mkdirSync(outdir, { recursive: true });
const stub = path.join(root, 'scripts/stubs/production-entry.ts');
const services = ['workOrders', 'cuttingRecords', 'sewingRecords', 'kancingRecords', 'finishingRecords', 'registerPenjahit'];
await build({
  entryPoints: [path.join(root, 'scripts/production-entry-preview.tsx')], bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(outdir, 'app.js'), jsx: 'automatic',
  alias: Object.fromEntries([
    ['@', path.join(root, 'src')], ['@/lib/supabase', path.join(root, 'scripts/stubs/supabase.ts')],
    ...['@/contexts/AuthContext', '@/services/autoInvoice'].map((name) => [name, stub]),
    ...services.map((name) => [`@/services/${name}`, stub]),
  ]),
  plugins: [{
    name: 'production-entry-service-stubs',
    setup(build) {
      build.onResolve({ filter: /^@\/services\// }, ({ path: name }) => {
        const service = name.slice('@/services/'.length);
        return services.includes(service) ? { path: service, namespace: 'production-entry-fixture' } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'production-entry-fixture' }, ({ path: service }) => ({
        // Override only services, not the real adjacent-stage eligibility/search logic.
        contents: `export * from ${JSON.stringify(stub)};\nimport { fetchAllForService } from ${JSON.stringify(stub)};\nexport const fetchAll = () => fetchAllForService(${JSON.stringify(service)});`,
        loader: 'ts', resolveDir: root,
      }));
    },
  }],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, logLevel: 'error',
});
writeFileSync(path.join(outdir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Entry test fixture</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
if (process.argv.includes('--build-only')) {
  console.log(`Production entry fixture built at ${outdir}; no server started.`);
} else {
  const server = http.createServer((req, res) => {
    const name = req.url?.split('?')[0];
    const file = name === '/app.js' ? 'app.js' : name === '/style.css' ? 'style.css' : 'index.html';
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    try { res.end(readFileSync(path.join(outdir, file))); } catch { res.statusCode = 404; res.end('Not found'); }
  });
  server.listen(4179, '127.0.0.1', () => console.log('Production entry fixture ready at http://127.0.0.1:4179; services stubbed, no database writes.'));
}
