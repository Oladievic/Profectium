/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import "./runtime-env.mjs";
import { readFile, writeFile, access, mkdir, open, unlink } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { projectRoot } from "./runtime-env.mjs";
import { needsOfflineBuild, offlineIdentity, sameOfflineIdentity } from "./offline-build.mjs";
import { offlineSecrets, offlineConfigurationId } from "./offline-config.mjs";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex < 0 ? 5173 : Number(args[portIndex + 1]);
const origin = "http://127.0.0.1:" + port;
const url = origin + "/?view=catalog";
const runtime = path.join(projectRoot, ".runtime");
const lockPath = path.join(runtime, "offline-" + port + ".lock");
const entryName = "offline-entry-" + port + ".mjs";
const configName = "offline-wrangler-" + port + ".json";
const nonce = randomUUID();
let ownsLock = false;

async function openBrowser() {
  if (process.platform !== "win32" || args.includes("--no-browser")) return;
  console.log("Opening the site in your default browser: " + url);
  // Keep the launcher alive until Windows accepts the URL, including on reuse.
  await new Promise((resolve) => {
    const browser = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; Start-Process -FilePath '" + url + "' -ErrorAction Stop"], {
      stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
    });
    let detail = "", settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) console.error("Browser did not open: " + error + "\nOpen this address manually: " + url);
      else console.log("Browser launch accepted. Site address: " + url);
      resolve();
    };
    const timer = setTimeout(() => { browser.kill(); finish("the Windows browser launcher timed out"); }, 15000);
    browser.stderr.on("data", (chunk) => { detail = (detail + chunk).slice(-1500); });
    browser.once("error", (error) => finish(error.message));
    browser.once("close", (code) => finish(code === 0 ? null : (detail.trim() || "exit code " + code)));
  });
}

async function health() {
  try {
    const response = await fetch(origin + "/__profectium/health", { signal: AbortSignal.timeout(1200) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function applicationReady() {
  try {
    const response = await fetch(origin + "/api/v1/state", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const body = await response.json();
    return Array.isArray(body.candidates) && Array.isArray(body.jobs);
  } catch { return false; }
}

async function reuseExisting() {
  const running = await health();
  if (!running) return false;
  const expected = await offlineIdentity(projectRoot, offlineConfigurationId(await offlineSecrets(projectRoot)));
  if (!sameOfflineIdentity(running, expected) || args.includes("--rebuild") || await needsOfflineBuild(projectRoot)) {
    throw new Error("A different or older build/configuration is running on port " + port + ". Close its Profectium server window, then run npm run offline from the platform folder again. Or use npm run offline -- --port 5181 to start separately. No running process was stopped.");
  }
  if (!await applicationReady()) return false;
  console.log("PROFECTIUM ALREADY RUNNING: " + url + "\nReusing the current build from this project folder.");
  await openBrowser();
  return true;
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

async function releaseLock() {
  if (!ownsLock) return;
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (lock.nonce === nonce) await unlink(lockPath);
  } catch (error) { if (error.code !== "ENOENT") console.error("Could not release the launcher lock: " + error.message); }
  ownsLock = false;
}

async function acquireLock() {
  let announced = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const file = await open(lockPath, "wx");
      await file.writeFile(JSON.stringify({ pid: process.pid, nonce }));
      await file.close();
      ownsLock = true;
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await reuseExisting()) return false;
      try {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        if (!alive(lock.pid)) { await unlink(lockPath); continue; }
      } catch (readError) {
        if (readError.code === "ENOENT") continue;
        if (!(readError instanceof SyntaxError)) throw readError;
      }
      if (!announced) { console.log("Another Profectium launcher is starting. Waiting for it..."); announced = true; }
      await delay(1000);
    }
  }
  throw new Error("The other launcher did not become ready. Check its window; close it before trying again. Your local data has not been changed.");
}

async function requireFreePort() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Port " + port + " is occupied by another server. Close that server or run npm run offline -- --port 5181 from the platform folder. No running process was stopped.")));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

async function main() {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be between 1024 and 65535.");
  for (const item of ["node_modules/wrangler/bin/wrangler.js", "node_modules/vinext/dist/cli.js"])
    try { await access(path.join(projectRoot, item)); }
    catch { throw new Error("Missing " + item + ". See docs/LOCAL_START.txt. No packages are downloaded automatically."); }
  if (args.includes("--check")) {
    if (await needsOfflineBuild(projectRoot)) throw new Error("The build is missing or older than the sources. Run npm run offline from the platform folder to rebuild it automatically using local dependencies. Use npm run offline -- --rebuild to force a rebuild.");
    console.log("Offline prerequisites OK: current build, local dependencies. No cloud credentials needed.");
    return;
  }
  await mkdir(runtime, { recursive: true });
  if (!await acquireLock()) return;
  if (await reuseExisting()) { await releaseLock(); return; }
  await requireFreePort();
  const env = {
    ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false",
    BROWSER: "none", NO_UPDATE_NOTIFIER: "1",
  };
  for (const key of Object.keys(env))
    if (/^(CLOUDFLARE_(API|ACCOUNT)|CF_(API|ACCOUNT))/.test(key)) delete env[key];
  if (args.includes("--rebuild") || await needsOfflineBuild(projectRoot)) {
    console.log("Building the current Profectium sources using installed local dependencies...");
    const build = spawnSync(process.execPath, ["scripts/run-framework.mjs", "build"], {
      cwd: projectRoot, stdio: "inherit", env, windowsHide: true,
    });
    if (build.error || build.status !== 0) throw new Error("The local build failed. Read the error above. Existing database data was retained.");
    if (await needsOfflineBuild(projectRoot)) throw new Error("Sources changed during the build. Please start again when editing has finished.");
  }
  const secrets = await offlineSecrets(projectRoot);
  const identity = await offlineIdentity(projectRoot, offlineConfigurationId(secrets));
  const built = JSON.parse(await readFile(path.join(projectRoot, "dist/server/wrangler.json"), "utf8"));
  await writeFile(path.join(runtime, entryName),
    'import application from "../dist/server/index.js";\nimport { localWorker } from "../scripts/offline-worker.mjs";\nexport default localWorker(application, ' + JSON.stringify(identity) + ');\n');
  await writeFile(path.join(runtime, configName), JSON.stringify({
    name: "profectium-offline", main: "./" + entryName, compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags, assets: { directory: "../dist/client" },
    d1_databases: built.d1_databases, dev: { ip: "127.0.0.1", port, local_protocol: "http" },
    secrets: { required: Object.keys(secrets) },
    observability: { enabled: false },
  }, null, 2));
  const migration = spawnSync(process.execPath, ["scripts/migrate-local.mjs"], {
    cwd: projectRoot, stdio: "inherit", env, windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error("Local database migration failed. Existing data was retained.");
  // An explicit empty env file prevents implicit loading of unrelated project secrets.
  // Values travel only in the server process environment; Wrangler binds the allowlist as hidden secrets.
  const envFile = path.join(runtime, "offline-" + port + ".env");
  await writeFile(envFile, "# Server values are supplied through the process environment.\n");
  const serverEnv = { ...env, ...secrets, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true" };
  const child = spawn(process.execPath, [
    "--import", "./scripts/runtime-env.mjs", "node_modules/wrangler/bin/wrangler.js", "dev",
    "--config", ".runtime/" + configName, "--local", "--persist-to", ".wrangler/state",
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0",
    "--env-file", envFile,
  ], { cwd: projectRoot, stdio: "inherit", env: serverEnv, windowsHide: true });
  let exited = false, ready = false;
  child.on("error", (error) => { exited = true; console.error(error.message); process.exitCode = 1; void releaseLock(); });
  child.on("exit", (code) => { exited = true; process.exitCode = ready ? (code ?? 0) : 1; void releaseLock(); });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => { if (!exited) child.kill(signal); });
  for (let attempt = 0; attempt < 90 && !exited; attempt++) {
    await delay(1000);
    if (!sameOfflineIdentity(await health(), identity) || !await applicationReady()) continue;
    ready = true;
    console.log("\nPROFECTIUM READY: " + url + "\nLocal owner only. Keep this window open; Ctrl+C stops the server.\nData: " + path.join(projectRoot, ".wrangler/state"));
    await openBrowser();
    break;
  }
  if (!ready && !exited) {
    console.error("Startup did not become ready. Check the local runtime log above.");
    child.kill(); process.exitCode = 1;
  }
}

try { await main(); }
catch (error) { console.error("\nPROFECTIUM START ERROR: " + error.message); await releaseLock(); process.exitCode = 1; }
