// Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic.
// Full local redesign + API. This runner never reads the production Cloudflare target.
import { readFile, writeFile, mkdir, open, unlink, access, readdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { needsOfflineBuild, sourceFingerprint, offlineIdentity } from './offline-build.mjs';
import { prepareRedesign } from './prepare-redesign.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const design = path.resolve(root, '../design');
const runtime = path.join(root, '.runtime');
const args = process.argv.slice(2);
let port = 5190, noBrowser = false, offline = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') port = Number(args[++i]);
  else if (args[i] === '--no-browser') noBrowser = true;
  else if (args[i] === '--offline') offline = true;
  else throw new Error('Unknown option: ' + args[i]);
}
const origin = 'http://127.0.0.1:' + port;
const lockPath = path.join(runtime, 'redesign-' + port + '.lock');
const configPath = path.join(runtime, 'redesign-' + port + '.json');
const entryPath = path.join(runtime, 'redesign-' + port + '.mjs');
const envFile = path.join(runtime, 'redesign-' + port + '.env');
const dataPath = path.join(root, '.wrangler/redesign-state');
const nonce = randomUUID();
let ownsLock = false;

async function designFingerprint() {
  const hash = createHash('sha256');
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) hash.update(path.relative(design, filename)).update('\0').update(await readFile(filename)).update('\0');
    }
  }
  await visit(design);
  return hash.digest('hex');
}

async function identity() {
  const built = await offlineIdentity(root, 'public-demo-auth-local-v1');
  return { ...built, application: 'profectium-redesign-local', protocol: 1,
    sourceHash: await sourceFingerprint(root), designHash: await designFingerprint() };
}
const sameIdentity = (a, b) => a && b && ['application', 'protocol', 'projectId', 'buildId', 'configurationId', 'sourceHash', 'designHash'].every(k => a[k] === b[k]);

async function health() {
  try {
    const response = await fetch(origin + '/__profectium/redesign', { signal: AbortSignal.timeout(1500), redirect: 'error' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
async function applicationReady() {
  try {
    const [page, session] = await Promise.all([
      fetch(origin + '/%D0%9B%D0%B5%D0%BD%D0%B4%D0%B8%D0%BD%D0%B3.dc.html', { signal: AbortSignal.timeout(4000) }),
      fetch(origin + '/api/auth/session', { signal: AbortSignal.timeout(4000) }),
    ]);
    return page.ok && (await page.text()).includes('name="profectium-ui" content="redesign"') && session.ok && (await session.json()).emailVerificationRequired === false;
  } catch { return false; }
}

async function openBrowser() {
  if (noBrowser) return;
  const url = origin + '/';
  console.log('Opening the site in your default browser: ' + url);
  const command = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Start-Process -FilePath '" + url + "' -ErrorAction Stop"]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  await new Promise(resolve => {
    const child = spawn(command[0], command[1], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let settled = false, detail = '';
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); console.log(error ? 'Browser did not open: ' + error + '\nOpen manually: ' + url : 'Browser launch accepted. Site address: ' + url); resolve(); };
    const timer = setTimeout(() => finish('the browser launcher timed out'), 15000);
    child.stderr.on('data', chunk => { detail = (detail + chunk).slice(-1000); });
    child.once('error', error => finish(error.message));
    child.once('close', code => finish(code === 0 ? null : detail.trim() || 'exit code ' + code));
  });
}

async function reuseExisting() {
  const running = await health();
  if (!running) return false;
  if (running.application !== 'profectium-redesign-local') return false;
  if (await needsOfflineBuild(root) || !sameIdentity(running, await identity()))
    throw new Error('A different or older Profectium build is running on port ' + port + '. Close its server window and reopen Start-Profectium.cmd, or use -Port 5198. No running process was stopped.');
  if (!running.databaseReady || !await applicationReady()) return false;
  console.log('PROFECTIUM ALREADY RUNNING: ' + origin + '/\nReusing this project, build, API and local database.');
  await openBrowser();
  return true;
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
async function releaseLock() {
  if (!ownsLock) return;
  try { const lock = JSON.parse(await readFile(lockPath, 'utf8')); if (lock.nonce === nonce) await unlink(lockPath); }
  catch (error) { if (error.code !== 'ENOENT') console.error('Could not release launcher lock: ' + error.message); }
  ownsLock = false;
}
async function acquireLock() {
  let announced = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    try {
      const file = await open(lockPath, 'wx');
      await file.writeFile(JSON.stringify({ pid: process.pid, nonce })); await file.close(); ownsLock = true; return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await reuseExisting()) return false;
      try { const lock = JSON.parse(await readFile(lockPath, 'utf8')); if (!alive(lock.pid)) { await unlink(lockPath); continue; } }
      catch (readError) { if (readError.code === 'ENOENT') continue; if (!(readError instanceof SyntaxError)) throw readError; }
      if (!announced) { console.log('Another Profectium launcher is starting. Waiting for it...'); announced = true; }
      await delay(1000);
    }
  }
  throw new Error('The other launcher did not become ready. Check its window before trying again. Local data was retained.');
}
async function requireFreePort() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Port ' + port + ' is occupied by another server. Choose another -Port or close that server yourself. No running process was stopped.')));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false',
  WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: path.join(runtime, 'wrangler/logs'),
  WRANGLER_REGISTRY_PATH: path.join(runtime, 'wrangler/dev-registry'), MINIFLARE_REGISTRY_PATH: path.join(runtime, 'wrangler/registry'),
  BROWSER: 'none', NO_UPDATE_NOTIFIER: '1', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' };
for (const key of Object.keys(env)) if (/^(CLOUDFLARE_(API|ACCOUNT)|CF_(API|ACCOUNT))/.test(key)) delete env[key];
function runLocal(command, failure) {
  const result = spawnSync(process.execPath, command, { cwd: root, stdio: 'inherit', env, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(failure + ' Local data was retained.');
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 16)) throw new Error('Node.js 22.16 or newer is required; use Node.js 24 LTS.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535.');
  for (const item of ['node_modules/wrangler/bin/wrangler.js', 'node_modules/vinext/dist/cli.js']) {
    try { await access(path.join(root, item)); }
    catch { throw new Error('Dependencies are missing. Run Setup-Profectium.cmd first (internet may be needed once), then Start-Profectium.cmd. Nothing was downloaded.'); }
  }
  for (const item of ['Лендинг.dc.html', 'backend.js', 'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'vendor/babel.min.js', 'vendor/fonts-4c5d80bb8671.css']) {
    try { await access(path.join(design, item)); }
    catch { throw new Error('The repository is incomplete: design/' + item + '. Unpack the complete project again.'); }
  }
  await mkdir(runtime, { recursive: true });
  if (!await acquireLock()) return;
  if (await reuseExisting()) { await releaseLock(); return; }
  await requireFreePort();
  if (await needsOfflineBuild(root)) {
    console.log('Building the current Profectium API using installed dependencies. No cloud login or downloads are needed.');
    runLocal(['scripts/run-framework.mjs', 'build'], 'The local build failed. Read the error above.');
    if (await needsOfflineBuild(root)) throw new Error('Sources changed during the build. Start again after editing has finished.');
  }
  await prepareRedesign();
  const current = await identity();
  const built = JSON.parse(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'));
  await writeFile(entryPath, `import application from '../dist/server/index.js';
const identity = ${JSON.stringify(current)};
export default { async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return new Response('Local access only', {status:403});
  if (url.pathname === '/__profectium/redesign') {
    try {
      const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('public_users','public_sessions','companies')").all();
      const databaseReady = tables.results.length === 3;
      return Response.json({...identity, databaseReady}, {status:databaseReady ? 200 : 503, headers:{'Cache-Control':'no-store'}});
    } catch { return Response.json({...identity, databaseReady:false}, {status:503}); }
  }
  if (url.pathname === '/' || url.pathname === '/signin') { url.pathname = '/Лендинг.dc.html'; return Response.redirect(url, 302); }
  return application.fetch(request, env, ctx);
}};\n`);
  await writeFile(configPath, JSON.stringify({
    name: 'profectium-redesign-local', main: './' + path.basename(entryPath),
    compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags,
    // Bundle only the wrapper's import graph. Scanning the runtime directory
    // would accidentally attach unrelated local test modules.
    no_bundle: false,
    workers_dev: false, preview_urls: false,
    assets: { directory: '../dist/client', html_handling: 'none', run_worker_first: ['/', '/__profectium/*', '/api/*', '/signin', '/signout'] },
    vars: { PUBLIC_DEMO_AUTH: 'true' },
    d1_databases: [{ binding: 'DB', database_name: 'profectium-redesign-local', database_id: '00000000-0000-4000-8000-000000000000', migrations_dir: '../drizzle' }],
    observability: { enabled: false },
  }, null, 2));
  await writeFile(envFile, '# No external secrets are required for this local application.\n');
  runLocal(['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', dataPath, '--config', configPath], 'Local database migration failed.');
  const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', configPath,
    '--local', '--persist-to', dataPath, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--env-file', envFile],
  { cwd: root, stdio: 'inherit', env, windowsHide: true });
  let exited = false, ready = false;
  child.once('error', error => { exited = true; process.exitCode = 1; console.error(error.message); void releaseLock(); });
  child.once('exit', code => { exited = true; process.exitCode = ready ? (code ?? 0) : 1; void releaseLock(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!exited) child.kill(signal); });
  for (let attempt = 0; attempt < 90 && !exited; attempt++) {
    await delay(1000);
    const status = await health();
    if (!sameIdentity(status, current) || !status.databaseReady || !await applicationReady()) continue;
    ready = true;
    console.log('\nPROFECTIUM READY: ' + origin + '/\nRedesign + API + persistent local database. Registration and guest access are available.\n' +
      (offline ? 'Offline mode: all application resources are local.\n' : '') + 'Data: ' + dataPath + '\nKeep this window open. Ctrl+C stops only this launched server.');
    await openBrowser();
    break;
  }
  if (!ready && !exited) { console.error('The local application did not become ready. Read the runtime output above.'); child.kill(); process.exitCode = 1; }
}
try { await main(); }
catch (error) { console.error('\nPROFECTIUM START ERROR: ' + error.message); await releaseLock(); process.exitCode = 1; }
