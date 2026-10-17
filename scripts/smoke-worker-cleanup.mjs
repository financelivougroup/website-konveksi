import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const outdir = path.join(root, '.scratch', 'smoke');
mkdirSync(outdir, { recursive: true });
const outfile = path.join(outdir, 'worker-cleanup.mjs');
await build({
  entryPoints: [path.join(root, 'scripts', 'smoke-worker-cleanup.test.ts')],
  bundle: true, format: 'esm', platform: 'node', target: 'node24', outfile,
  plugins: [{
    name: 'worker-credential-free-boundaries',
    setup(builder) {
      builder.onResolve({ filter: /^(jose|aws4fetch)$/ }, (args) => ({ path: args.path, namespace: 'worker-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'worker-test' }, (args) => ({
        loader: 'js',
        contents: args.path === 'jose'
          ? `export const createRemoteJWKSet = () => ({});
             export async function jwtVerify(token, keys, options) { return globalThis.workerTestVerify(token, options); }`
          : `export class AwsClient {
               async fetch(url, options) { return globalThis.workerTestR2(url, options); }
               async sign(url, options) { return globalThis.workerTestSign(url, options); }
             }`,
      }));
    },
  }],
  logLevel: 'error',
});
await import(pathToFileURL(outfile).href);
