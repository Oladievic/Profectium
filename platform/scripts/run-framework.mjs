/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sourceFingerprint, recordOfflineBuild } from "./offline-build.mjs";
const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const cli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
if (command === "build") {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const sourceHash = await sourceFingerprint(root);
  const result = spawnSync(process.execPath, [fileURLToPath(cli), command, ...args], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status === 0) await recordOfflineBuild(root, sourceHash);
  process.exit(result.status ?? 1);
}
process.argv = [process.execPath, fileURLToPath(cli), command, "--port", "5173", ...args];
await import(cli.href);
