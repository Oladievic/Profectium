/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
await mkdir(".runtime", { recursive: true });
await build({
  entryPoints: ["lib/profile-pdf.ts"],
  outfile: ".runtime/pdf-export.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { createProfilePdf } = await import("../.runtime/pdf-export.mjs");
const candidates = JSON.parse(
  await readFile("lib/demo-candidates.json", "utf8"),
);
const c = {
  ...candidates[0],
  softSkills: ["Работа в команде", "Обратная связь"],
  qualification: {
    role: "Frontend",
    grade: "Middle",
    score: 92,
    synthetic: true,
  },
};
const target = path.resolve(process.argv[2] ?? "artifacts/sample-profile.pdf");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(
  target,
  await createProfilePdf(
    c,
    new Uint8Array(await readFile("public/fonts/JetBrainsMono-Regular.ttf")),
  ),
);
console.log(target);
