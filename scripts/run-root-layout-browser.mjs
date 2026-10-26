// Owns only its disposable fixture server and Chrome process; always tears them down.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = process.env.ROOT_LAYOUT_CDP_PORT || '9247';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('.scratch/root-layout-preview', { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'konveksi-root-layout-'));
const processes = [];
const exited = new Map();
function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  processes.push(child);
  child.on('exit', code => exited.set(child, code));
  return child;
}
async function waitHttp(url, child) {
  for (let i = 0; i < 80; i++) {
    if (exited.has(child)) throw new Error(`Process exited before ready (${exited.get(child)})`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* wait until ready */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Readiness timeout: ${url}`);
}
try {
  const server = start(process.execPath, ['--max-old-space-size=128', 'scripts/smoke-root-layout.mjs', '--serve-only']);
  await waitHttp('http://127.0.0.1:4197/', server);
  const chrome = start(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--disable-gpu', '--renderer-process-limit=1', 'about:blank']);
  await waitHttp(`http://127.0.0.1:${port}/json`, chrome);
  const check = start(process.execPath, ['--max-old-space-size=128', 'scripts/check-root-layout-browser.mjs'], { env: { ...process.env, ROOT_LAYOUT_CDP_PORT: port } });
  const code = await new Promise((resolve, reject) => { check.once('exit', resolve); check.once('error', reject); });
  process.exitCode = code ?? 1;
} finally {
  for (const child of processes.reverse()) {
    if (exited.has(child)) continue;
    if (process.platform === 'win32') {
      await new Promise(resolve => { const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); stop.once('exit', resolve); stop.once('error', resolve); });
    } else child.kill('SIGTERM');
  }
  console.log(`Closed owned fixture/browser processes. Disposable profile retained at ${profile}`);
}
