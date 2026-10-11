/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// Server-side, Node >=22. Never embed keys in a browser bundle.
const base = process.env.PROFECTIUM_URL,
  key = process.env.PROFECTIUM_API_KEY;
if (!base || !key) throw new Error("Set PROFECTIUM_URL and PROFECTIUM_API_KEY");
const target = new URL(base);
if (
  target.protocol !== "https:" &&
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
)
  throw new Error("HTTPS required outside localhost");
const headers = { Authorization: `Bearer ${key}` };
let offset = 0,
  total = 0;
do {
  const url = new URL("/api/connect/v1/candidates", target);
  url.searchParams.set("limit", "25");
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `API returned ${response.status}; request not retried automatically`,
    );
  const data = await response.json();
  total += data.items.length;
  offset = data.nextOffset;
  console.log(`Read ${total} of ${data.total} profiles (${data.mode})`);
} while (offset !== null);
