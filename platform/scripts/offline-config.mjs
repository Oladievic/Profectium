/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import path from "node:path";

export const offlineSecretNames = ["RESEND_API_KEY", "EMAIL_FROM", "OTP_SECRET", "FSP_API_BASE_URL", "FSP_API_ALLOWED_HOST", "FSP_API_TOKEN"];

export async function offlineSecrets(root, environment = process.env) {
  const selected = {};
  const select = (values) => {
    for (const name of offlineSecretNames)
      if (typeof values[name] === "string") {
        if (values[name].includes("\0")) throw new Error("Invalid NUL character in server setting " + name);
        selected[name] = values[name];
      }
  };
  select(environment);
  for (const filename of [path.join(root, ".dev.vars"), path.resolve(root, "../tools/secrets.env")]) {
    try {
      if ((await stat(filename)).size > 65536) throw new Error("Server settings file exceeds 64 KiB: " + filename);
      select(parseEnv(await readFile(filename, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return selected;
}

export function offlineConfigurationId(secrets) {
  return createHash("sha256").update(JSON.stringify(offlineSecretNames.map((name) => [name, secrets[name] ?? null]))).digest("hex");
}
