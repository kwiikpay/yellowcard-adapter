/**
 * Yellowcard HTTP client.
 *
 * Implements YC's YcHmacV1 HMAC-SHA256 authentication scheme per
 * https://docs.yellowcard.engineering/docs/authentication:
 *
 *   Headers:
 *     X-YC-Timestamp: <ISO8601 timestamp, ms precision>
 *     Authorization:  YcHmacV1 <apiKey>:<base64(HMAC-SHA256(canonical, secret))>
 *
 *   Canonical string (concatenation, NO separators):
 *     - For GET / DELETE:     <timestamp><path><METHOD>
 *     - For POST / PUT:       <timestamp><path><METHOD><base64(sha256(body))>
 *
 *   Path is the full URL path including any `/business/` prefix (NOT
 *   stripped). e.g. `/business/channels`, `/business/payments/accept`.
 *
 * Uses Web Crypto API (`crypto.subtle`) — portable across Deno,
 * Node 18+, and browsers without external dependencies.
 *
 * v0.3.0 (2026-05-18): docs-correct signing.
 *   - bodyHash component now ONLY appended for POST/PUT (v0.2.x appended
 *     for every method, which produced wrong signatures for GET/DELETE
 *     and caused 401 AuthenticationError on sandbox)
 *   - Path is no longer stripped by default — the URL's full pathname
 *     (e.g. `/business/channels`) goes into the canonical
 *   - `maybeStripBusinessPrefix` toggle retained for forward-compat /
 *     emergency diagnostics, but default is false and should stay false
 *   - Verified end-to-end against YC sandbox (200 OK on /channels)
 *
 * v0.2.0: ported from kwiikpay-dashboard's yellowcard-helpers.ts.
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
 * Per YC docs:
 *   - For GET / DELETE:   `<timestamp><path><METHOD>`
 *   - For POST / PUT:     `<timestamp><path><METHOD><base64(sha256(body))>`
 *
 * The bodyHash component is included ONLY for body-bearing methods
 * (POST/PUT). Including it for GET/DELETE produces a canonical YC
 * does not expect, and signature verification fails with 401
 * `AuthenticationError: invalid apiKey signature combination`.
 *
 * v0.3.0: corrected from v0.2.x which always appended the bodyHash.
 */
export declare function buildMessage(date: string, path: string, method: string, body: string): Promise<string>;
/**
 * Optionally strip a leading `/business` from the path used in the
 * HMAC canonical.
 *
 * **Default is false and should stay false.** YC's docs example shows
 * canonical paths INCLUDING the `/business/` prefix (e.g.
 * `/business/payments/accept`), and v0.3.0 sandbox verification
 * confirmed 200 OK only when the prefix is retained.
 *
 * The toggle is retained for two reasons:
 *   1. Forward compat — if YC ever publishes a v2 API that drops the
 *      `/business/` prefix from canonical, we can flip without code change.
 *   2. Emergency diagnostics — if signatures ever start failing
 *      mysteriously, the `yellowcard-test` EF can toggle this to
 *      bisect the cause.
 *
 * Production deploys should never pass `stripBusinessPrefix: true`.
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