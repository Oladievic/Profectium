/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const inputDirectories = ["app", "components", "hooks", "lib", "public", "drizzle", "scripts", "build"];
const inputFiles = [
  "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
  "next.config.ts", "postcss.config.mjs", "wrangler.json", "wrangler.jsonc",
  "hosting.json",
];

async function filesIn(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

async function fingerprint(root, files) {
  const hash = createHash("sha256");
  for (const filename of files.sort()) {
    hash.update(path.relative(root, filename).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(await readFile(filename));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function sourceFingerprint(root) {
  const files = [];
  for (const directory of inputDirectories) files.push(...await filesIn(path.join(root, directory)));
  for (const filename of inputFiles) {
    try { await access(path.join(root, filename)); files.push(path.join(root, filename)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return fingerprint(root, files);
}

export async function recordOfflineBuild(root, sourceHash) {
  await writeFile(path.join(root, "dist/offline-build.json"), JSON.stringify({
    version: 1, sourceHash, builtAt: new Date().toISOString(),
  }, null, 2));
}

export async function needsOfflineBuild(root) {
  try {
    for (const filename of ["dist/server/index.js", "dist/server/wrangler.json", "dist/client"])
      await access(path.join(root, filename));
    const recorded = JSON.parse(await readFile(path.join(root, "dist/offline-build.json"), "utf8"));
    return recorded.version !== 1 || recorded.sourceHash !== await sourceFingerprint(root);
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return true;
    throw error;
  }
}

export async function offlineIdentity(root, configurationId = "") {
  const files = [
    ...await filesIn(path.join(root, "dist/server")),
    ...await filesIn(path.join(root, "dist/client")),
    path.join(root, "scripts/offline-worker.mjs"),
  ];
  return {
    application: "profectium-local",
    projectId: createHash("sha256").update(process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root)).digest("hex"),
    buildId: await fingerprint(root, files),
    configurationId,
  };
}

export function sameOfflineIdentity(actual, expected) {
  return actual?.application === expected.application &&
    actual?.projectId === expected.projectId && actual?.buildId === expected.buildId &&
    actual?.configurationId === expected.configurationId;
}
