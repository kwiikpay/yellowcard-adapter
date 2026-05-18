/**
 * Yellowcard webhook signature verification.
 *
 * v0.2.0: real implementation, ported from
 * `kwiikpay-dashboard/supabase/functions/_shared/yellowcard-helpers.ts`
 * (translated from `node:crypto` to `crypto.subtle` for portability).
 *
 * YC's webhook deliveries carry the same YcHmacV1 scheme as outbound
 * requests:
 *
 *   Headers:
 *     X-YC-Timestamp:  <ISO8601 timestamp>
 *     Authorization:   YcHmacV1 <apiKey>:<base64(HMAC-SHA256(canonical, webhookSecret))>
 *
 *   Canonical (no separators):
 *     <timestamp><path><METHOD><base64(sha256(rawBody))>
 *
 * Replay protection: reject if the timestamp drifts more than the
 * configured window (default 5 minutes) from now.
 *
 * NOTE: YC's webhook signing scheme isn't 100% documented; this is the
 * outbound scheme applied to inbound. If YC support eventually
 * confirms a different canonical, swap the implementation here — the
 * public signature stays identical.
 */
import { buildMessage, hmacSign, maybeStripBusinessPrefix } from "../client.js";
const AUTH_HEADER_RE = /^YcHmacV1\s+([^:]+):(.+)$/;
/**
 * Verify a YC webhook signature.
 *
 * Returns `{ ok: true }` on successful verification, or
 * `{ ok: false, reason, detail? }` with a structured reason for
 * operational logging. Never throws on a verification miss — only
 * throws on truly unexpected runtime errors.
 *
 * @example
 *   const result = await verifyYcWebhookSignature({
 *     rawBody: await req.text(),
 *     authorizationHeader: req.headers.get("Authorization") ?? "",
 *     timestamp: req.headers.get("X-YC-Timestamp") ?? "",
 *     webhookSecret: Deno.env.get("YELLOWCARD_WEBHOOK_SECRET")!,
 *     path: "/business/webhook",
 *   });
 *   if (!result.ok) {
 *     console.warn("[yc-webhook] signature_ok=false", result);
 *     // Apply compensating controls (idempotency, structure validation)
 *   }
 */
export async function verifyYcWebhookSignature(opts) {
    if (!opts.authorizationHeader || !opts.timestamp) {
        return {
            ok: false,
            reason: "missing_headers",
            detail: {
                hasAuth: Boolean(opts.authorizationHeader),
                hasTimestamp: Boolean(opts.timestamp),
            },
        };
    }
    const match = AUTH_HEADER_RE.exec(opts.authorizationHeader.trim());
    if (!match) {
        return {
            ok: false,
            reason: "malformed_authorization",
            detail: { authHeader: opts.authorizationHeader.slice(0, 60) },
        };
    }
    const [, apiKey, signature] = match;
    // Replay window check
    const skewSec = opts.allowSkewSec ?? 300;
    const tsMs = Date.parse(opts.timestamp);
    if (!Number.isFinite(tsMs)) {
        return {
            ok: false,
            reason: "malformed_timestamp",
            detail: { timestamp: opts.timestamp },
        };
    }
    const driftMs = Math.abs(Date.now() - tsMs);
    if (driftMs > skewSec * 1000) {
        return {
            ok: false,
            reason: "timestamp_drift",
            detail: { driftMs, allowSec: skewSec },
        };
    }
    // Recompute canonical
    const path = opts.path ?? "/webhook";
    const method = opts.method ?? "POST";
    const canonicalPath = maybeStripBusinessPrefix(path, opts.stripBusinessPrefix ?? false);
    const canonical = await buildMessage(opts.timestamp, canonicalPath, method, opts.rawBody);
    const expected = await hmacSign(opts.webhookSecret, canonical);
    // Constant-time compare via byte-array equality
    const expBytes = new TextEncoder().encode(expected);
    const sigBytes = new TextEncoder().encode(signature);
    if (expBytes.length !== sigBytes.length) {
        return {
            ok: false,
            reason: "signature_length_mismatch",
            detail: { apiKey: apiKey.slice(0, 6) + "…" },
        };
    }
    if (!timingSafeBytesEqual(expBytes, sigBytes)) {
        return {
            ok: false,
            reason: "signature_mismatch",
            detail: { apiKey: apiKey.slice(0, 6) + "…" },
        };
    }
    return { ok: true };
}
/**
 * Constant-time byte-array comparison.
 *
 * Iterates the full length even after the first mismatch to prevent
 * timing attacks against signature comparison. Mirrors Node's
 * `crypto.timingSafeEqual` but works without the Node dep so the
 * package stays portable.
 */
function timingSafeBytesEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}
//# sourceMappingURL=verify.js.map