/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// Local runner only. This module is never imported by the hosted Worker.
// The runner binds to 127.0.0.1 and supplies one local Windows-owner identity.
export function localWorker(application, identity) {
  return {
    async fetch(request, env, context) {
      const url = new URL(request.url);
      const host = request.headers.get("host");
      const origin = request.headers.get("origin");
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        (host && host !== url.host) ||
        (origin && origin !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return new Response("Local access only", { status: 403 });
      }
      if (url.pathname === "/__profectium/health") {
        if (request.method !== "GET" || !identity)
          return new Response("Not found", { status: 404 });
        return Response.json(identity, { headers: { "Cache-Control": "no-store" } });
      }
      if (
        ["/signin-local", "/callback", "/signout-local"].includes(
          url.pathname,
        )
      ) {
        const value = url.searchParams.get("return_to") || "/";
        const target = new URL(value, url.origin);
        return Response.redirect(
          target.origin === url.origin &&
            value.startsWith("/") &&
            !value.startsWith("//")
            ? target
            : new URL("/", url),
          303,
        );
      }
      const headers = new Headers(request.headers);
      for (const key of [...headers.keys()])
        if (key.startsWith("x-profectium-user-")) headers.delete(key);
      // This opaque principal owns existing records in the persistent local database.
      headers.set("x-profectium-user-id", "local_seedy");
      headers.set("x-profectium-user-email", "owner@profectium.local");
      headers.set(
        "x-profectium-user-full-name",
        encodeURIComponent("Владелец Profectium"),
      );
      headers.set(
        "x-profectium-user-full-name-encoding",
        "percent-encoded-utf-8",
      );
      return application.fetch(new Request(request, { headers }), env, context);
    },
  };
}
