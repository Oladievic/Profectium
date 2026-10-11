/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from "node:assert/strict";
import { localWorker } from "../scripts/offline-worker.mjs";
import { mkdtemp, mkdir, writeFile, rm, utimes, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsOfflineBuild, sourceFingerprint, recordOfflineBuild, offlineIdentity, sameOfflineIdentity } from "../scripts/offline-build.mjs";
import { offlineSecrets, offlineConfigurationId } from "../scripts/offline-config.mjs";
let received;
const worker = localWorker({
  fetch(request) {
    received = request;
    return new Response("ok");
  },
});
const req = (url, headers = {}) => new Request(url, { headers });
assert.equal(
  (await worker.fetch(req("http://127.0.0.1:5173/"), {}, {})).status,
  200,
);
assert.equal(received.headers.get("x-profectium-user-id"), "local_seedy");
assert.equal(
  (await worker.fetch(req("http://evil.test:5173/"), {}, {})).status,
  403,
);
assert.equal(
  (
    await worker.fetch(
      req("http://127.0.0.1:5173/", { host: "evil.test:5173" }),
      {},
      {},
    )
  ).status,
  403,
);
assert.equal(
  (
    await worker.fetch(
      req("http://127.0.0.1:5173/", { origin: "https://evil.test" }),
      {},
      {},
    )
  ).status,
  403,
);
assert.equal(
  (
    await worker.fetch(
      req("http://127.0.0.1:5173/", { "sec-fetch-site": "cross-site" }),
      {},
      {},
    )
  ).status,
  403,
);
await worker.fetch(
  req("http://127.0.0.1:5173/", {
    "x-profectium-user-id": "other-owner",
    "x-profectium-user-unknown": "injected",
  }),
  {},
  {},
);
assert.equal(received.headers.get("x-profectium-user-id"), "local_seedy");
assert.equal(received.headers.get("x-profectium-user-unknown"), null);
assert.equal(
  (
    await worker.fetch(
      req("http://127.0.0.1:5173/signin-local?return_to=//evil.test"),
      {},
      {},
    )
  ).headers.get("location"),
  "http://127.0.0.1:5173/",
);
assert.equal(
  (
    await worker.fetch(
      req("http://127.0.0.1:5173/callback?return_to=/abc"),
      {},
      {},
    )
  ).headers.get("location"),
  "http://127.0.0.1:5173/abc",
);
console.log(
  "PASS offline runner: loopback, Host, Origin, cross-site, fixed owner, header stripping, safe redirects (10 assertions)",
);

const identity = { application: "profectium-local", projectId: "test-folder", buildId: "test-build" };
const identified = localWorker({ fetch() { throw new Error("Health check must not access the database"); } }, identity);
const status = await identified.fetch(req("http://127.0.0.1:5181/__profectium/health"), {}, {});
assert.deepEqual(await status.json(), identity);
assert.equal(status.headers.get("cache-control"), "no-store");
assert.equal((await identified.fetch(req("http://127.0.0.1:5181/__profectium/health", { origin: "https://evil.test" }), {}, {})).status, 403);
assert.equal((await identified.fetch(new Request("http://127.0.0.1:5181/__profectium/health", { method: "POST" }), {}, {})).status, 404);
assert.equal((await worker.fetch(req("http://127.0.0.1:5181/__profectium/health"), {}, {})).status, 404);
assert.equal(sameOfflineIdentity({ ...identity }, identity), true);
assert.equal(sameOfflineIdentity({ ...identity, projectId: "another-folder" }, identity), false);
assert.equal(sameOfflineIdentity({ ...identity, buildId: "older-build" }, identity), false);
assert.equal(sameOfflineIdentity({ ...identity, application: "other-app" }, identity), false);
assert.equal(sameOfflineIdentity(null, identity), false);

const fixtureRoot = path.resolve(fileURLToPath(new URL("../.runtime/", import.meta.url)));
await mkdir(fixtureRoot, { recursive: true });
const fixture = await mkdtemp(path.join(fixtureRoot, "launcher Unicode ФСП "));
try {
  assert.equal(await needsOfflineBuild(fixture), true);
  for (const directory of ["app", "public", "scripts", "dist/server", "dist/client"])
    await mkdir(path.join(fixture, directory), { recursive: true });
  await writeFile(path.join(fixture, "app/page.tsx"), "export default function Page() { return null; }");
  await writeFile(path.join(fixture, "scripts/offline-worker.mjs"), "export const local = true;");
  await writeFile(path.join(fixture, "public/brand.svg"), "<svg />");
  await writeFile(path.join(fixture, "dist/server/index.js"), "export default {};");
  await writeFile(path.join(fixture, "dist/server/wrangler.json"), "{}");
  await writeFile(path.join(fixture, "dist/client/index.html"), "Profectium");
  await recordOfflineBuild(fixture, await sourceFingerprint(fixture));
  assert.equal(await needsOfflineBuild(fixture), false);
  await utimes(path.join(fixture, "app/page.tsx"), new Date(), new Date());
  assert.equal(await needsOfflineBuild(fixture), false, "a timestamp change alone must not trigger a build");
  await mkdir(path.join(fixture, ".wrangler"));
  await writeFile(path.join(fixture, ".wrangler/data.sqlite"), "private local data");
  assert.equal(await needsOfflineBuild(fixture), false, "local database changes must not trigger a build");
  const before = await offlineIdentity(fixture);
  await writeFile(path.join(fixture, "dist/client/index.html"), "Updated Profectium");
  assert.equal(sameOfflineIdentity(await offlineIdentity(fixture), before), false, "the running build identity includes client assets");
  await writeFile(path.join(fixture, "app/page.tsx"), "export default function Page() { return 'updated'; }");
  assert.equal(await needsOfflineBuild(fixture), true, "changed source triggers a build");
  await recordOfflineBuild(fixture, await sourceFingerprint(fixture));
  await writeFile(path.join(fixture, "public/brand.svg"), "<svg><path /></svg>");
  assert.equal(await needsOfflineBuild(fixture), true, "changed branding triggers a build");
  await recordOfflineBuild(fixture, await sourceFingerprint(fixture));
  await unlink(path.join(fixture, "app/page.tsx"));
  assert.equal(await needsOfflineBuild(fixture), true, "removed source triggers a build");
  await recordOfflineBuild(fixture, await sourceFingerprint(fixture));
  await unlink(path.join(fixture, "dist/server/index.js"));
  assert.equal(await needsOfflineBuild(fixture), true, "missing bundle triggers a build");

  const configRoot = path.join(fixture, "config/platform");
  await mkdir(configRoot, { recursive: true });
  await mkdir(path.join(fixture, "config/tools"));
  assert.deepEqual(await offlineSecrets(configRoot, { UNRELATED_TOKEN: "private" }), {});
  await writeFile(path.join(configRoot, ".dev.vars"), 'FSP_API_BASE_URL=https://model.example/v1\nFSP_API_ALLOWED_HOST=model.example\nEMAIL_FROM=project-model\nFSP_API_TOKEN="project-key"\nUNRELATED_TOKEN=never-bound\n');
  await writeFile(path.join(fixture, "config/tools/secrets.env"), 'EMAIL_FROM=owner-model\nFSP_API_TOKEN="owner-key#with-hash"\nUNKNOWN_SETTING=not-bound\n');
  const selected = await offlineSecrets(configRoot, { EMAIL_FROM: "process-model", UNRELATED_TOKEN: "private" });
  assert.deepEqual(selected, { FSP_API_BASE_URL: "https://model.example/v1", FSP_API_ALLOWED_HOST: "model.example", EMAIL_FROM: "owner-model", FSP_API_TOKEN: "owner-key#with-hash" });
  assert.equal(Object.hasOwn(selected, "UNRELATED_TOKEN"), false);
  const configId = offlineConfigurationId(selected);
  assert.match(configId, /^[0-9a-f]{64}$/);
  assert.notEqual(offlineConfigurationId({ ...selected, FSP_API_TOKEN: "rotated-key" }), configId);
  assert.equal(sameOfflineIdentity({ ...identity, configurationId: "previous" }, { ...identity, configurationId: "current" }), false);
  await writeFile(path.join(fixture, "config/tools/secrets.env"), 'EMAIL_FROM="$(do-not-execute)"\n');
  assert.equal((await offlineSecrets(configRoot, {})).EMAIL_FROM, "$(do-not-execute)", "env contents are data, never executable code");
} finally {
  if (!fixture.startsWith(fixtureRoot + path.sep)) throw new Error("Fixture path escaped runtime directory");
  await rm(fixture, { recursive: true, force: true });
}
console.log("PASS offline launcher: private identity, health methods, source/asset changes, Unicode paths, secret allowlist/precedence, env data isolation, rotated configuration (26 assertions)");
await import("./offline-launcher-integration.mjs");
