// Available example in T00; the receiving endpoint is implemented by T07.
// Set private environment variables outside shell history. Reuse the same
// IDEMPOTENCY_KEY when retrying an uncertain response.
import { readFileSync } from "node:fs";

const { GATEWAY_URL, FEED_TOKEN, IDEMPOTENCY_KEY } = process.env;
if (!GATEWAY_URL || !FEED_TOKEN || !IDEMPOTENCY_KEY || !process.argv[2]) {
  throw new Error("Set GATEWAY_URL, FEED_TOKEN, IDEMPOTENCY_KEY and supply an update JSON path.");
}
const url = new URL("/api/v1/feeds", GATEWAY_URL);
if (url.protocol !== "https:" && url.hostname !== "127.0.0.1") {
  throw new Error("Use HTTPS or an explicitly local test server.");
}
const update = JSON.parse(readFileSync(process.argv[2], "utf8"));
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${FEED_TOKEN}`,
    "Idempotency-Key": IDEMPOTENCY_KEY,
  },
  body: JSON.stringify(update),
  signal: AbortSignal.timeout(15000),
  redirect: "error",
});
const result = await response.json();
if (!response.ok || result.error) {
  throw new Error(`Feed update failed: HTTP ${response.status}; code ${result.error?.code ?? "UNKNOWN"}`);
}
console.log(JSON.stringify({ version: result.data.version, trace_id: result.trace_id }));
