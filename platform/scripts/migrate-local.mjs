/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
// The generated config is copied; the build output is not modified.
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
await mkdir(".runtime", { recursive: true });
const migrationConfig = {
  name: "fsp-local-migrations",
  compatibility_date: config.compatibility_date,
  d1_databases: config.d1_databases.map((d) => ({
    ...d,
    migrations_dir: "../drizzle",
  })),
};
await writeFile(
  ".runtime/migrations.json",
  JSON.stringify(migrationConfig),
);
const args = [
  "--import",
  "./scripts/runtime-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  ".runtime/migrations.json",
  "--persist-to",
  ".wrangler/state",
];
const p = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});
process.exitCode = p.status ?? 1;
