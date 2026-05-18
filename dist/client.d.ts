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
import type { YcClientConfig, YcRequestOptions, YcResponse } from "./types.js";
/**
 * Compute base64(sha256(input)).
 *
 * Used both as a building block for the canonical message (body hash)
 * and for testing.
 */
export declare function sha256Base64(input: string): Promise<string>;
/**
 * HMAC-SHA256 sign `message` with `secretKey`.
 * Returns base64-encoded signature.
 */
export declare function hmacSign(secretKey: string, message: string): Promise<string>;
/**
 * Build the canonical message string that gets HMAC-signed.
 *
 * Format: `<ISO8601-timestamp><path><METHOD><base64-sha256(body)>`
 *
 * Empty body still contributes `base64(sha256(""))` (= "47DEQpj8…")
 * to match YC's expected canonical form for GETs.
 */
export declare function buildMessage(date: string, path: string, method: string, body: string): Promise<string>;
/**
 * Optionally strip a leading `/business` from the path used in the
 * HMAC canonical. YC's docs example
 * (`2022-01-11T15:48:37.424Z/paymentPOST…`) suggests the canonical
 * uses the route AFTER the `/business` prefix, but the docs aren't
 * fully explicit. The `yellowcard-test` EF in kwiikpay-dashboard
 * toggles this flag to confirm the working form per deploy.
 */
export declare function maybeStripBusinessPrefix(path: string, stripBusinessPrefix: boolean): string;
/**
 * Call a Yellowcard API endpoint with HMAC auth, parse JSON response.
 *
 * Body, if present, is JSON.stringified once and used for both the
 * HTTP payload AND the signature input (must be byte-identical).
 *
 * Returns `{ ok, status, data }`. `data` is the parsed JSON, or
 * `{ raw: <text> }` if the response wasn't valid JSON.
 */
export declare function ycFetch<T = unknown>(cfg: YcClientConfig, opts: YcRequestOptions): Promise<YcResponse<T>>;
//# sourceMappingURL=client.d.ts.map