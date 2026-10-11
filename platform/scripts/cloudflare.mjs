// Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic.
// Direct Cloudflare Workers deployment.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prepareRedesign } from "./prepare-redesign.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = path.join(root, ".cloudflare");
const targetPath = path.join(runtime, "target.json");
const configPath = path.join(runtime, "wrangler.json");
const placeholder = "00000000-0000-4000-8000-000000000000";
const [action = "prepare", ...args] = process.argv.slice(2);
if (!["prepare", "check", "preview", "migrate-local", "migrate", "deploy"].includes(action)) {
  throw new Error("Expected prepare, check, preview, migrate-local, migrate or deploy.");
}
const options = Object.fromEntries(args.map((arg) => {
  const match = /^--(account-id|database-id|name)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown option: ${arg}`);
  return [match[1], match[2]];
}));
let target = {};
try { target = JSON.parse(await readFile(targetPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (options["account-id"]) target.account_id = options["account-id"];
if (options["database-id"]) target.database_id = options["database-id"];
if (options.name) target.name = options.name;
target.name ||= "profectium";
if (!/^[a-z][a-z0-9-]{0,62}$/.test(target.name)) throw new Error("Invalid Worker name.");
if (target.account_id && !/^[a-f0-9]{32}$/.test(target.account_id)) throw new Error("Invalid Cloudflare account ID.");
if (target.database_id && !/^[a-f0-9-]{36}$/.test(target.database_id)) throw new Error("Invalid D1 database ID.");
if (["migrate", "deploy"].includes(action) && (!target.account_id || !target.database_id || target.database_id === placeholder)) {
  throw new Error("Configure the real Cloudflare account and D1 database with prepare --account-id=... --database-id=... first.");
}
const built = JSON.parse(await readFile(path.join(root, "dist/server/wrangler.json"), "utf8"));
await prepareRedesign();
const config = {
  name: target.name,
  ...(target.account_id ? { account_id: target.account_id } : {}),
  main: "../dist/server/index.js",
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  no_bundle: true,
  find_additional_modules: true,
  rules: built.rules,
  workers_dev: true,
  preview_urls: false,
  assets: { directory: "../dist/client", html_handling: "none", run_worker_first: ["/api/*", "/signin", "/signout"] },
  vars: { PUBLIC_DEMO_AUTH: "true" },
  d1_databases: [{
    binding: "DB",
    database_name: target.name,
    database_id: target.database_id || placeholder,
    migrations_dir: "../drizzle",
  }],
  observability: { enabled: true, head_sampling_rate: 0.1 },
};
await mkdir(runtime, { recursive: true });
await writeFile(targetPath, JSON.stringify(target, null, 2) + "\n");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
if (action === "prepare") {
  console.log(`Direct Cloudflare configuration prepared for ${target.name}.`);
  process.exit(0);
}
const command = {
  check: ["deploy", "--dry-run"],
  preview: ["dev", "--local", "--ip", "127.0.0.1", "--port", "5191", "--inspector-port", "0", "--persist-to", ".cloudflare/state"],
  "migrate-local": ["d1", "migrations", "apply", "DB", "--local", "--persist-to", ".cloudflare/state"],
  migrate: ["d1", "migrations", "apply", "DB", "--remote"],
  deploy: ["deploy"],
}[action];
const result = spawnSync(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"), ...command,
  "--config", configPath,
], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
