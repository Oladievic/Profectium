/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordOfflineBuild, sourceFingerprint } from "../scripts/offline-build.mjs";

const source = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = path.resolve(source, ".runtime");
await mkdir(fixtureRoot, { recursive: true });
const fixture = await mkdtemp(path.join(fixtureRoot, "launch integration ФСП "));
const children = new Set();
let runtimePid;
let foreign;

function launch(port) {
  const child = spawn(process.execPath, ["scripts/start-offline.mjs", "--no-browser", "--port", String(port)], {
    cwd: fixture, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  children.add(child);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => { children.delete(child); resolve({ code, output }); });
  });
  return { child, done, output: () => output };
}

async function until(check, message) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  throw new Error(message);
}

async function stopRuntime(launcher) {
  if (runtimePid) { try { process.kill(runtimePid); } catch {} runtimePid = undefined; }
  const result = await Promise.race([launcher.done, delay(10000, undefined, { ref: false }).then(() => { throw new Error("Launcher failed to exit after its server stopped"); })]);
  return result;
}

try {
  for (const directory of ["app", "scripts", "dist/server", "dist/client", "node_modules/wrangler/bin", "node_modules/vinext/dist", ".runtime"])
    await mkdir(path.join(fixture, directory), { recursive: true });
  for (const filename of ["start-offline.mjs", "offline-build.mjs", "offline-config.mjs", "offline-worker.mjs", "runtime-env.mjs"])
    await copyFile(path.join(source, "scripts", filename), path.join(fixture, "scripts", filename));
  await writeFile(path.join(fixture, "package.json"), '{"type":"module"}');
  await writeFile(path.join(fixture, "app/page.tsx"), "original source");
  await writeFile(path.join(fixture, "dist/server/index.js"), "export default {};");
  await writeFile(path.join(fixture, "dist/client/index.html"), "Profectium");
  await writeFile(path.join(fixture, "dist/server/wrangler.json"), JSON.stringify({ compatibility_date: "2026-10-01", compatibility_flags: [], d1_databases: [] }));
  await writeFile(path.join(fixture, "node_modules/vinext/dist/cli.js"), "");
  await writeFile(path.join(fixture, "scripts/migrate-local.mjs"), "// Integration fixture: no real database is accessed.\n");
  await writeFile(path.join(fixture, "node_modules/wrangler/bin/wrangler.js"), `
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const args = process.argv;
const port = Number(args[args.indexOf("--port") + 1]);
const configPath = args[args.indexOf("--config") + 1];
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const entry = fs.readFileSync(path.join(path.dirname(configPath), config.main), "utf8");
const identity = JSON.parse(entry.match(/localWorker\\(application, (.*)\\);/)[1]);
fs.writeFileSync(".runtime/server.pid", String(process.pid));
http.createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(request.url === "/__profectium/health" ? identity : { candidates: [], jobs: [] }));
}).listen(port, "127.0.0.1");
`);
  await recordOfflineBuild(fixture, await sourceFingerprint(fixture));

  // The OS assigns a private, unused port; no user's active server is touched.
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const first = launch(port);
  const duplicate = launch(port);
  await until(() => first.output().includes("PROFECTIUM READY") || duplicate.output().includes("PROFECTIUM READY"), "Initial launcher did not become ready: " + first.output() + duplicate.output());
  const owner = first.output().includes("PROFECTIUM READY") ? first : duplicate;
  const follower = owner === first ? duplicate : first;
  runtimePid = Number(await readFile(path.join(fixture, ".runtime/server.pid"), "utf8"));
  const followed = await follower.done;
  assert.equal(followed.code, 0, followed.output);
  assert.match(followed.output, /ALREADY RUNNING/);
  const reopened = await launch(port).done;
  assert.equal(reopened.code, 0, reopened.output);
  assert.match(reopened.output, /ALREADY RUNNING/);
  assert.equal(Number(await readFile(path.join(fixture, ".runtime/server.pid"), "utf8")), runtimePid, "repeat launch must not start another runtime");

  await writeFile(path.join(fixture, "app/page.tsx"), "changed source");
  const outdated = await launch(port).done;
  assert.equal(outdated.code, 1);
  assert.match(outdated.output, /older build/);
  assert.equal((await fetch("http://127.0.0.1:" + port + "/api/v1/state")).status, 200, "a stale build must not be killed");
  await writeFile(path.join(fixture, "app/page.tsx"), "original source");
  await stopRuntime(owner);

  await writeFile(path.join(fixture, ".runtime/offline-" + port + ".lock"), JSON.stringify({ pid: owner.child.pid, nonce: "dead-process" }));
  const recovery = launch(port);
  await until(() => recovery.output().includes("PROFECTIUM READY"), "Stale lock recovery failed: " + recovery.output());
  runtimePid = Number(await readFile(path.join(fixture, ".runtime/server.pid"), "utf8"));
  assert.match(recovery.output(), /PROFECTIUM READY/);
  await stopRuntime(recovery);

  foreign = createServer((request, response) => { response.end("Another app"); });
  await new Promise((resolve) => foreign.listen(port, "127.0.0.1", resolve));
  const occupied = await launch(port).done;
  assert.equal(occupied.code, 1);
  assert.match(occupied.output, /occupied by another server/);
  assert.equal(await (await fetch("http://127.0.0.1:" + port)).text(), "Another app");
  const invalid = await launch(80).done;
  assert.equal(invalid.code, 1);
  assert.match(invalid.output, /between 1024 and 65535/);
  console.log("PASS launcher process integration: simultaneous clicks, repeat click reuse, stale source refusal, dead lock recovery, foreign server preservation, invalid port, Unicode/spaces (14 assertions)");
} finally {
  if (runtimePid) { try { process.kill(runtimePid); } catch {} }
  for (const child of children) child.kill();
  if (foreign) await new Promise((resolve) => foreign.close(resolve));
  if (!fixture.startsWith(fixtureRoot + path.sep)) throw new Error("Fixture path escaped runtime directory");
  await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
