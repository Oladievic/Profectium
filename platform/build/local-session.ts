/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import type { Plugin } from "vite";

/** Development uses a single identity and accepts loopback traffic only. */
export function localSession(): Plugin {
  return {
    name: "profectium-local-session",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const protocol = server.config.server.https ? "https" : "http";
        let address: URL, authority: URL;
        try { authority = new URL(`${protocol}://${request.headers.host}`); address = new URL(request.url || "/", authority); }
        catch { response.statusCode = 400; response.end(); return; }
        const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname);
        const localPeer = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress || "");
        if (!localHost || !localPeer || address.origin !== authority.origin || (request.headers.origin && request.headers.origin !== address.origin) || request.headers["sec-fetch-site"] === "cross-site") {
          response.statusCode = 403; response.end("Local development access only"); return;
        }
        if (["/signin-local", "/signout-local", "/callback"].includes(address.pathname)) {
          const returnTo = address.searchParams.get("return_to") || "/";
          let target: URL;
          try { target = new URL(returnTo, address); } catch { target = new URL("/", address); }
          response.statusCode = 303;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Location", returnTo.startsWith("/") && !returnTo.startsWith("//") && target.origin === address.origin ? target.pathname + target.search : "/");
          response.end(); return;
        }
        const prefix = "x-profectium-user-";
        for (const name of Object.keys(request.headers)) if (name.startsWith(prefix)) delete request.headers[name];
        const raw: string[] = [];
        for (let i = 0; i < request.rawHeaders.length; i += 2) if (!request.rawHeaders[i].toLowerCase().startsWith(prefix)) raw.push(request.rawHeaders[i], request.rawHeaders[i + 1]);
        // Keep the persisted principal stable so existing local records remain visible.
        const identity = { id: "local_seedy", email: "owner@profectium.local", "full-name": encodeURIComponent("Владелец Profectium"), "full-name-encoding": "percent-encoded-utf-8" };
        for (const [field, value] of Object.entries(identity)) { request.headers[prefix + field] = value; raw.push(prefix + field, value); }
        request.rawHeaders = raw;
        next();
      });
    },
  };
}
