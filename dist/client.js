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
// ─── HMAC primitives (exported for tests) ────────────────────────────
/**
 * Compute base64(sha256(input)).
 *
 * Used both as a building block for the canonical message (body hash)
 * and for testing.
 */
export async function sha256Base64(input) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
    return uint8ArrayToBase64(new Uint8Array(hash));
}
/**
 * HMAC-SHA256 sign `message` with `secretKey`.
 * Returns base64-encoded signature.
 */
export async function hmacSign(secretKey, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return uint8ArrayToBase64(new Uint8Array(sig));
}
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
export async function buildMessage(date, path, method, body) {
    const upper = method.toUpperCase();
    if (upper === "POST" || upper === "PUT") {
        const bodyHash = await sha256Base64(body ?? "");
        return `${date}${path}${upper}${bodyHash}`;
    }
    // GET / DELETE / HEAD / OPTIONS — no bodyHash component
    return `${date}${path}${upper}`;
}
// ─── Path canonicalisation ───────────────────────────────────────────
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
export function maybeStripBusinessPrefix(path, stripBusinessPrefix) {
    if (!stripBusinessPrefix)
        return path;
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
export async function ycFetch(cfg, opts) {
    const fullUrl = `${cfg.baseUrl}${opts.path}`;
    const rawPath = new URL(fullUrl).pathname;
    const method = opts.method ?? "GET";
    const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : "";
    const date = new Date().toISOString();
    const canonicalPath = maybeStripBusinessPrefix(rawPath, cfg.stripBusinessPrefix ?? false);
    const message = await buildMessage(date, canonicalPath, method, bodyStr);
    const signature = await hmacSign(cfg.secretKey, message);
    const headers = {
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
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        parsed = { raw: text };
    }
    return { ok: res.ok, status: res.status, data: parsed };
}
// ─── Internal helpers ────────────────────────────────────────────────
/**
 * Base64-encode a Uint8Array using btoa (portable across Deno + Node 18+
 * + browsers; modern Node has btoa globally available since v18).
 */
function uint8ArrayToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
}
//# sourceMappingURL=client.js.map