/**
 * Yellowcard webhook signature verification.
 *
 * ─────────────────────────────────────────────────────────────────────
 * v0.1.x PLACEHOLDER
 * ─────────────────────────────────────────────────────────────────────
 *
 * YC sends `X-YC-Signature` and `X-YC-Timestamp` headers on every
 * webhook delivery, but YC's published documentation does not specify
 * the exact canonical message format used for the HMAC. Tim Pearson
 * has an open question with YC support to confirm the scheme.
 *
 * Until the canonical format lands, this function returns `false` by
 * default (no-op verification) so consumers can choose their own
 * compensating-controls posture:
 *
 *   - kwiikpay-dashboard's pattern (see CLAUDE.md "Known security gap:
 *     Hercle webhook signature verification") — allow unsigned but
 *     defend with: idempotency on event-ID UNIQUE constraint, defensive
 *     handler structure (structure-validate before any DB write),
 *     log every signature_ok=false to monitoring, ALLOW_UNSIGNED env
 *     flag for fast-flip when verification starts succeeding.
 *
 *   - strict mode — throw immediately so a consumer can wire a
 *     "deployment refused until verification works" CI gate.
 *
 * When YC documents the scheme, the implementation below this stub
 * should be replaced. Public signature stays identical — consumers
 * see no API break across the version bump.
 *
 * ─────────────────────────────────────────────────────────────────────
 */

export interface VerifyYcWebhookSignatureOptions {
  /** The exact raw request body as a string (NOT re-serialized JSON). */
  rawBody: string;
  /** Value of the `X-YC-Signature` request header. */
  signature: string;
  /** Value of the `X-YC-Timestamp` request header (ISO-8601). */
  timestamp: string;
  /** YC webhook secret key (typically a separate env var from the API secret). */
  secretKey: string;
  /**
   * Behaviour when verification cannot be performed (current v0.1.x state):
   *   - `false` (default): return `false` so caller can apply
   *     compensating controls per their security policy.
   *   - `true`: throw an Error — fail-closed posture.
   */
  strict?: boolean;
}

const NOT_IMPLEMENTED_MESSAGE =
  "verifyYcWebhookSignature: YC's canonical webhook-signing message format " +
  "is not yet documented (Tim has an open question with YC support). Until " +
  "this is resolved, this function returns false (with strict:false) or " +
  "throws (with strict:true). See kwiikpay-dashboard CLAUDE.md " +
  "'Known security gap: Hercle webhook signature verification' for the " +
  "analogous compensating-controls posture KwP uses for unverified " +
  "partner webhooks.";

/**
 * Verify a YC webhook signature.
 *
 * **v0.1.x status: placeholder.** Always returns `false` (strict:false)
 * or throws (strict:true). When YC's scheme is documented, the
 * implementation will be swapped behind this same signature.
 *
 * @returns `true` if signature verified; `false` if not verified OR
 *          verification not yet implemented in this package version.
 */
export async function verifyYcWebhookSignature(
  opts: VerifyYcWebhookSignatureOptions,
): Promise<boolean> {
  // Reference args so they're not flagged as unused. When the real
  // implementation lands these become the inputs to the HMAC.
  void opts.rawBody;
  void opts.signature;
  void opts.timestamp;
  void opts.secretKey;

  if (opts.strict) {
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
  return false;
}
