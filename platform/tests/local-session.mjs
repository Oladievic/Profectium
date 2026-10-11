/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["build/local-session.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { localSession } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
let middleware;
localSession().configureServer({ config: { server: {} }, middlewares: { use(callback) { middleware = callback; } } });
function invoke({ url = "/", headers = {}, peer = "127.0.0.1" } = {}) {
  const request = { url, headers: { host: "127.0.0.1:5173", ...headers }, socket: { remoteAddress: peer } };
  request.rawHeaders = Object.entries(request.headers).flat();
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end() {} };
  let next = false;
  middleware(request, response, () => { next = true; });
  return { request, response, next };
}
const good = invoke({ headers: { "x-profectium-user-id": "attacker", "x-profectium-user-extra": "injected" } });
assert.equal(good.next, true);
assert.equal(good.request.headers["x-profectium-user-id"], "local_seedy");
assert.equal(good.request.headers["x-profectium-user-extra"], undefined);
assert.ok(!good.request.rawHeaders.includes("attacker"));
for (const options of [
  { headers: { host: "evil.example" } },
  { url: "http://127.0.0.1:5173/", headers: { host: "evil.example" } },
  { peer: "192.0.2.1" },
  { headers: { origin: "https://evil.example" } },
  { headers: { "sec-fetch-site": "cross-site" } },
]) {
  const denied = invoke(options); assert.equal(denied.response.statusCode, 403); assert.equal(denied.next, false);
}
for (const target of ["//evil.example", "https://evil.example", "http://[", "/\\evil.example"]) {
  const redirect = invoke({ url: "/signin-local?return_to=" + encodeURIComponent(target) });
  assert.equal(redirect.response.statusCode, 303); assert.equal(redirect.response.headers.location, "/");
}
assert.equal(invoke({ url: "/signin-local?return_to=/catalog%3Fx%3D1" }).response.headers.location, "/catalog?x=1");
console.log("Local session: loopback peer/Host/Origin protection, identity-header stripping and safe redirects passed.");
