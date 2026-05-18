/**
 * Yellowcard webhook signature verification.
 *
 * Per YC docs at https://docs.yellowcard.engineering/docs/webhooks:
 *
 *   Header:
 *     X-YC-Signature: <base64(HMAC-SHA256(rawRequestBody, secretKey))>
 *
 *   Canonical signed input: the raw request body bytes.
 *   No timestamp, no path, no method in the canonical.
 *
 *   Secret: "the secretkey of the apiKey the initial request was made
 *   with" — i.e. the same `apiSecret` used for outbound signing, NOT a
 *   separate dedicated webhook secret. The apiKey is included in the
 *   webhook payload for multi-tenant routing.
 *
 * v0.4.0 (2026-05-18): completely rewritten.
 *   Previous v0.2.x / v0.3.0 verifier applied the OUTBOUND YcHmacV1
 *   scheme (Authorization header + X-YC-Timestamp + canonical with
 *   path/method) to webhooks. That was assumption-based; YC's actual
 *   webhook scheme is much simpler. The old scheme would have rejected
 *   every real YC webhook with `signature_mismatch`.
 *
 * Defence-in-depth: YC says webhooks come from a static IP in prod.
 * Caller should also IP-allowlist at the edge. Signature verify is
 * the cryptographic gate; IP allowlist is the network gate.
 */
import { hmacSign } from "../client.js";
/**
 * Verify a YC webhook signature.
 *
 * Returns `{ ok: true }` on successful verification, or
 * `{ ok: false, reason, detail? }` with a structured reason for
 * operational logging. Never throws on a verification miss — only
 * throws on truly unexpected runtime errors.
 *
 * @example
 *   const sig = req.headers.get("X-YC-Signature") ?? "";
 *   const rawBody = await req.text();
 *   const result = await verifyYcWebhookSignature({
 *     rawBody,
 *     signatureHeader: sig,
 *     webhookSecret: Deno.env.get("YELLOWCARD_API_SECRET")!,
 *   });
 *   if (!result.ok) {
 *     console.warn("[yc-webhook] signature_ok=false", result);
 *     // Apply compensating controls (idempotency, structure validation,
 *     // optionally ALLOW_UNSIGNED env var while debugging)
 *   }
 */
export async function verifyYcWebhookSignature(opts) {
    if (!opts.signatureHeader) {
        return { ok: false, reason: "missing_header" };
    }
    if (!opts.webhookSecret) {
        return { ok: false, reason: "missing_secret" };
    }
    if (opts.rawBody === undefined || opts.rawBody === null) {
        return { ok: false, reason: "missing_body" };
    }
    // Canonical signed input: the raw body, exactly as YC sent it.
    // Re-serialising via JSON.stringify(JSON.parse(rawBody)) would change
    // whitespace / key order and break verification. Use the bytes you got.
    const expected = await hmacSign(opts.webhookSecret, opts.rawBody);
    const expBytes = new TextEncoder().encode(expected);
    const sigBytes = new TextEncoder().encode(opts.signatureHeader.trim());
    if (expBytes.length !== sigBytes.length) {
        return {
            ok: false,
            reason: "signature_length_mismatch",
            detail: {
                expectedLen: expBytes.length,
                receivedLen: sigBytes.length,
            },
        };
    }
    if (!timingSafeBytesEqual(expBytes, sigBytes)) {
        return {
            ok: false,
            reason: "signature_mismatch",
            detail: {
                // expose first 8 chars of received sig for forensic log without
                // leaking the full signature — keeps logs grep-friendly
                receivedPrefix: opts.signatureHeader.slice(0, 8) + "…",
            },
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
 * package stays portable across Deno / Node 18+ / browsers.
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