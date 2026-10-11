/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { DatabaseSync, backup } from "node:sqlite";
import { access, readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
let state = path.join(root, ".wrangler/redesign-state");
try { await access(state); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  state = path.join(root, ".wrangler/state");
}
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(file)));
    else if (entry.isFile() && entry.name.endsWith(".sqlite"))
      result.push(file);
  }
  return result;
}
const files = await walk(state).catch((error) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
if (!files.length)
  throw new Error(
    "No local databases yet. Start Profectium and open the demo first.",
  );
const destination = path.resolve(
  root,
  "../backups",
  new Date().toISOString().replace(/[:.]/g, "-") +
    "-" +
    randomUUID().slice(0, 8),
);
await mkdir(destination, { recursive: true });
const manifest = [];
for (const source of files) {
  const relative = path.relative(state, source),
    target = path.join(destination, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, target);
  } finally {
    db.close();
  }
  const copied = new DatabaseSync(target, { readOnly: true });
  try {
    if (copied.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw new Error("Backup integrity check failed");
  } finally {
    copied.close();
  }
  const bytes = await readFile(target);
  manifest.push({
    path: relative,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      source: state,
      sqliteBackup: true,
      databases: manifest,
    },
    null,
    2,
  ),
);
console.log("Consistent local database backup saved: " + destination);
console.log(
  "Databases verified: " +
    manifest.length +
    ". Keep this folder private; it contains your local records.",
);
