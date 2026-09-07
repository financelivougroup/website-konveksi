// Resolve the `@/*` path alias (defined in tsconfig.json) for the Node test
// runner, which does not read tsconfig paths, and add the `.ts` extension the
// source files omit. Keeps tests dependency-free.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', ''];

function withExtension(candidate) {
  for (const ext of EXTENSIONS) {
    if (existsSync(`${candidate}${ext}`)) return `${candidate}${ext}`;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(path.join(ROOT, 'src', specifier.slice(2)));
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}
