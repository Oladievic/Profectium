/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// Passenger and ordinary Node entry point for the public Beget installation.
/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads this CommonJS startup file. */
const path = require("node:path");
const http = require("node:http");

process.chdir(__dirname);
process.env.NODE_ENV = "production";
process.env.PROFECTIUM_DATA_DIR ||= path.join(__dirname, "data");

if (process.env.PUBLIC_DEMO_AUTH !== "true")
  throw new Error("PUBLIC_DEMO_AUTH=true is required for this public server. Use npm run offline for a local demonstration.");

const next = require("next");
const publicUrl = process.env.PROFECTIUM_PUBLIC_URL ? new URL(process.env.PROFECTIUM_PUBLIC_URL) : null;
if (publicUrl && (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password))
  throw new Error("PROFECTIUM_PUBLIC_URL must be the public HTTP(S) site URL.");
const listenPort = Number(process.env.PORT) || 3000;
const app = next({
  dev: false,
  dir: __dirname,
  hostname: publicUrl?.hostname || "localhost",
  port: publicUrl ? Number(publicUrl.port) || (publicUrl.protocol === "https:" ? 443 : 80) : listenPort,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    // Next constructs route URLs from hostname/port plus this protocol. A fixed
    // public URL preserves same-origin checks and HTTPS cookies behind Passenger.
    if (publicUrl) request.headers["x-forwarded-proto"] = publicUrl.protocol.slice(0, -1);
    handle(request, response).catch((error) => {
      console.error("Request failed:", error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Internal server error");
    });
  });
  // Passenger intercepts listen; elsewhere PORT controls the HTTP port.
  server.listen(listenPort, "0.0.0.0", () => {
    console.log("Profectium is ready.");
  });
}).catch((error) => {
  console.error("Profectium failed to start:", error);
  process.exitCode = 1;
});
