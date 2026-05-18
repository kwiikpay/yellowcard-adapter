/**
 * Yellowcard HTTP client.
 *
 * Implements YC's HMAC-SHA256 authentication scheme:
 *   1. Build a message: timestamp + path + method + base64(sha256(body))
 *   2. Sign with HMAC-SHA256 using the secret key
 *   3. Send with `Authorization: YcHmacV1 <apiKey>:<base64Signature>` +
 *      `X-YC-Timestamp: <timestamp>` headers
 *
 * Uses Web Crypto API (`crypto.subtle`) which is native to Deno, Node 18+,
 * and browsers — no external crypto dependencies.
 *
 * Source: extracted identically from yellowcard-outbound-create,
 * yellowcard-inbound-create, and yellowcard-rates EFs in
 * kwiikpay/website-kp:thor (where the same ~80 lines was duplicated).
 */

import type { YcClientConfig, YcRequestOptions, YcResponse } from "./types.js";

// ─── HMAC primitives (exported for tests) ────────────────────────────

/**
 * HMAC-SHA256 sign a message with the YC secret key.
 * Returns base64-encoded signature.
 */
export async function hmacSign(secretKey: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Build the canonical message string that gets HMAC-signed.
 *
 * Format: `<ISO8601-timestamp><path><method><base64-sha256(body)>`
 *
 * For GET requests or empty bodies, the trailing body-hash is omitted.
 */
export async function buildMessage(
  date: string,
  path: string,
  method: string,
  body?: string,
): Promise<string> {
  let message = date + path + method;
  if (body && body.length > 0) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(body));
    message += btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
  return message;
}

// ─── Main fetch wrapper ──────────────────────────────────────────────

/**
 * Call a Yellowcard API endpoint with HMAC auth, parse JSON response.
 *
 * Body, if present, is JSON.stringified once and used for both the HTTP
 * payload AND the signature input — they MUST be byte-identical.
 *
 * Returns `{ ok, status, data }`. `data` is the parsed JSON, or
 * `{ raw: <text> }` if the response wasn't valid JSON.
 */
export async function ycFetch<T = unknown>(
  cfg: YcClientConfig,
  opts: YcRequestOptions,
): Promise<YcResponse<T>> {
  const fullUrl = `${cfg.baseUrl}${opts.path}`;
  const signPath = new URL(fullUrl).pathname;
  const method = opts.method ?? "GET";
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const date = new Date().toISOString();

  const message = await buildMessage(date, signPath, method, bodyStr);
  const signature = await hmacSign(cfg.secretKey, message);

  const res = await fetch(fullUrl, {
    method,
    headers: {
      "X-YC-Timestamp": date,
      "Authorization": `YcHmacV1 ${cfg.apiKey}:${signature}`,
      "Content-Type": "application/json",
    },
    ...(bodyStr !== undefined ? { body: bodyStr } : {}),
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
