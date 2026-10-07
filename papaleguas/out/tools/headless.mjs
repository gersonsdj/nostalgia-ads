// Headless Chrome runner for agents (Node >= 22, no deps: global WebSocket + fetch).
// Each call gets its own throwaway Chrome, so parallel agents never share a browser.
//
//   node out/tools/headless.mjs "<url>" [--wait "<expr>"] [--eval "<expr>"] [--timeout 300]
//
//   url      page on the local server, e.g. http://localhost:5181/snap.html?v=visuals_a.js&dir=snaps_a
//   --wait   JS expression polled until truthy (default: window.__done, set by the harnesses)
//   --eval   optional JS expression evaluated after --wait (promises awaited), e.g.
//            "app.exportMp4()" on index.html with --wait "window.app && app.ready"
//   --timeout seconds before giving up (default 300)
//
// Prints the JSON result (the --eval value, else the --wait value) plus any page
// errors/console errors. Exit 0 if the result has no `ok: false`, else 1.
// Chrome path: $CHROME, else the default Windows install.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const url = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!url) { console.error('usage: node headless.mjs <url> [--wait expr] [--eval expr] [--timeout s]'); process.exit(2); }
const WAIT = opt('--wait', 'window.__done');
const EVAL = opt('--eval', null);
const TIMEOUT = Number(opt('--timeout', 300)) * 1000;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const profile = mkdtempSync(join(tmpdir(), 'nostalgia-hl-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--window-size=1200,2000', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
let exitCode = 1;
const deadline = Date.now() + TIMEOUT;

async function cleanup() {
  try { chrome.kill(); } catch (e) { /* gone */ }
  for (let i = 0; i < 20; i++) {
    try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(150); }
  }
}

try {
  // DevToolsActivePort: line 1 = port
  const portFile = join(profile, 'DevToolsActivePort');
  while (!existsSync(portFile)) { if (Date.now() > deadline) throw new Error('Chrome não abriu a porta de depuração'); await sleep(100); }
  let port = '';
  while (!port) { port = readFileSync(portFile, 'utf8').split('\n')[0].trim(); if (!port) await sleep(50); }
  const base = `http://127.0.0.1:${port}`;
  let targets = [];
  while (!targets.length) {
    targets = (await (await fetch(`${base}/json/list`)).json()).filter((t) => t.type === 'page');
    if (!targets.length) await sleep(100);
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('websocket CDP falhou')); });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[exception] ${(d.exception && d.exception.description) || d.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      logs.push(`[log] ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  let result;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`timeout esperando: ${WAIT}`);
    try {
      const v = await evaluate(`(async () => { const v = (${WAIT}); return v && typeof v.then === 'function' ? await v : v; })()`, true);
      if (v) { result = v; break; }
    } catch (e) { /* page still loading */ }
    await sleep(300);
  }
  if (EVAL) {
    const remaining = Math.max(1000, deadline - Date.now());
    result = await Promise.race([
      evaluate(`(async () => (${EVAL}))()`, true),
      sleep(remaining).then(() => { throw new Error(`timeout no --eval: ${EVAL}`); }),
    ]);
  }
  console.log(JSON.stringify(result, null, 2));
  if (logs.length) console.log('--- page log ---\n' + logs.slice(0, 40).join('\n'));
  exitCode = result && typeof result === 'object' && result.ok === false ? 1 : 0;
  try { ws.close(); } catch (e) { /* closed */ }
} catch (e) {
  console.error('ERRO: ' + (e && e.message || e));
  if (logs.length) console.error('--- page log ---\n' + logs.slice(0, 40).join('\n'));
  exitCode = 1;
}
await cleanup();
process.exit(exitCode);
