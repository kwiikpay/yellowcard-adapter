/**
 * Yellowcard HTTP client.
 *
 * Implements YC's YcHmacV1 HMAC-SHA256 authentication scheme:
 *
 *   Headers:
 *     X-YC-Timestamp: <ISO8601 timestamp, ms precision>
 *     Authorization:  YcHmacV1 <apiKey>:<base64(HMAC-SHA256(canonical, secret))>
 *
 *   Canonical string (concatenation, NO separators):
 *     <ISO8601_timestamp><path><METHOD><base64(sha256(body))>
 *
 *   For GET requests / empty bodies, body hash is base64(sha256("")).
 *
 * Uses Web Crypto API (`crypto.subtle`) — portable across Deno,
 * Node 18+, and browsers without external dependencies.
 *
 * v0.2.0: ported from kwiikpay-dashboard's yellowcard-helpers.ts:
 *   - `stripBusinessPrefix` toggle for the canonical path
 *   - Optional Fly.io egress relay header injection
 *   - Per-deploy `YELLOWCARD_BASE_URL` override (via env.ts)
 */

import type {
  YcClientConfig,
  YcRequestOptions,
  YcResponse,
} from "./types.js";

// ─── HMAC primitives (exported for tests) ────────────────────────────

/**
 * Compute base64(sha256(input)).
 *
 * Used both as a building block for the canonical message (body hash)
 * and for testing.
 */
export async function sha256Base64(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return uint8ArrayToBase64(new Uint8Array(hash));
}

/**
 * HMAC-SHA256 sign `message` with `secretKey`.
 * Returns base64-encoded signature.
 */
export async function hmacSign(
  secretKey: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return uint8ArrayToBase64(new Uint8Array(sig));
}

/**
 * Build the canonical message string that gets HMAC-signed.
 *
 * Format: `<ISO8601-timestamp><path><METHOD><base64-sha256(body)>`
 *
 * Empty body still contributes `base64(sha256(""))` (= "47DEQpj8…")
 * to match YC's expected canonical form for GETs.
 */
export async function buildMessage(
  date: string,
  path: string,
  method: string,
  body: string,
): Promise<string> {
  const bodyHash = await sha256Base64(body ?? "");
  return `${date}${path}${method.toUpperCase()}${bodyHash}`;
}

// ─── Path canonicalisation ───────────────────────────────────────────

/**
 * Optionally strip a leading `/business` from the path used in the
 * HMAC canonical. YC's docs example
 * (`2022-01-11T15:48:37.424Z/paymentPOST…`) suggests the canonical
 * uses the route AFTER the `/business` prefix, but the docs aren't
 * fully explicit. The `yellowcard-test` EF in kwiikpay-dashboard
 * toggles this flag to confirm the working form per deploy.
 */
export function maybeStripBusinessPrefix(
  path: string,
  stripBusinessPrefix: boolean,
): string {
  if (!stripBusinessPrefix) return path;
  return path.startsWith("/business") ? path.slice("/business".length) : path;
}

// ─── Main fetch wrapper ──────────────────────────────────────────────

/**
 * Call a Yellowcard API endpoint with HMAC auth, parse JSON response.
 *
 * Body, if present, is JSON.stringified once and used for both the
 * HTTP payload AND the signature input (must be byte-identical).
 *
 * Returns `{ ok, status, data }`. `data` is the parsed JSON, or
 * `{ raw: <text> }` if the response wasn't valid JSON.
 */
export async function ycFetch<T = unknown>(
  cfg: YcClientConfig,
  opts: YcRequestOptions,
): Promise<YcResponse<T>> {
  const fullUrl = `${cfg.baseUrl}${opts.path}`;
  const rawPath = new URL(fullUrl).pathname;
  const method = opts.method ?? "GET";
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : "";
  const date = new Date().toISOString();

  const canonicalPath = maybeStripBusinessPrefix(
    rawPath,
    cfg.stripBusinessPrefix ?? false,
  );
  const message = await buildMessage(date, canonicalPath, method, bodyStr);
  const signature = await hmacSign(cfg.secretKey, message);

  const headers: Record<string, string> = {
    "X-YC-Timestamp": date,
    "Authorization": `YcHmacV1 ${cfg.apiKey}:${signature}`,
  };
  if (bodyStr.length > 0) {
    headers["Content-Type"] = "application/json";
  }
  if (cfg.relaySecret) {
    headers["X-Relay-Auth"] = cfg.relaySecret;
  }

  const res = await fetch(fullUrl, {
    method,
    headers,
    ...(bodyStr.length > 0 ? { body: bodyStr } : {}),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: parsed as T };
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Base64-encode a Uint8Array using btoa (portable across Deno + Node 18+
 * + browsers; modern Node has btoa globally available since v18).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
