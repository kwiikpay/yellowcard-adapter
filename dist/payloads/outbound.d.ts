/**
 * Build the YC `/payments` (outbound, send-money) request payload.
 *
 * This is the most bug-fix-heavy surface in the YC integration. Tim's
 * commit history on kwiikpay/website-kp:thor between 2026-04-25 and
 * 2026-05-18 made the following corrections, all of which are encoded
 * here:
 *
 *   1. Use `localAmount` (NOT `amount`) — YC interprets `amount` as USD;
 *      both fields together → 400 error. (commits 2c2390c, f5ff304)
 *   2. Include `email` in `sender` per YC verification feedback
 *      (commit 4cec89c, re-applied d15a807 after Bolt revert a287061)
 *   3. Set `customerType: "institution"` (required by YC for business
 *      merchants)
 *   4. Populate KYC fields (`firstName`, `lastName`, `phone`,
 *      `dateOfBirth`) from `user.user_metadata` so YC dashboard shows
 *      sender details (commit c49369e)
 *   5. Add a top-level `customer` object so YC's dashboard shows
 *      "Sender Name" rather than blank (commit 733838b)
 *   6. Prefer KYC `user_metadata` values over form input so YC dashboard
 *      matches their KYC database (commit fc50ad8)
 *   7. Derive `accountType: "momo"` when only phoneNumber is given,
 *      "bank" otherwise — YC's network resolution depends on this
 *   8. `forceAccept: true` — proceeds even on KYC mismatches
 *
 * Bolt AI has historically reverted some of these fixes when "tidying"
 * adjacent code. Keeping the payload-build logic INSIDE this package
 * (consumed via npm) instead of in EF source means Bolt cannot reach
 * it, eliminating the regression class.
 *
 * @see kwiikpay/website-kp:thor/handoff/99-troubleshooting.md (Bolt revert pattern)
 */
import type { YcBeneficiary, YcBusinessIdentity, YcKycFields } from "../types.js";
export interface BuildOutboundPaymentPayloadOptions {
    /**
     * Unique sequence ID for this transaction. Consuming projects choose
     * their own prefix to distinguish themselves at YC:
     *   - `website-kp` (B2C retail) uses `kp-{uuid}`
     *   - `kwiikpay-dashboard` (B2B) uses `kpb-{uuid}`
     *
     * YC requires sequenceId uniqueness across the merchant account.
     */
    sequenceId: string;
    beneficiary: YcBeneficiary;
    /** ISO-4217 destination currency code, e.g. "KES", "NGN", "ZAR". */
    destinationCurrency: string;
    /** ISO-3166-alpha-2 destination country, e.g. "KE", "NG", "ZA". */
    destinationCountry: string;
    /** Amount in destination currency (NOT USD). YC interprets this as the local-currency payout amount. */
    localAmount: number;
    /** KwiikPay business identity sending the payment. */
    business: YcBusinessIdentity;
    /** End-customer KYC fields (typically from `user.user_metadata`). */
    customer: YcKycFields;
}
/**
 * Build the YC `/payments` POST body.
 *
 * The returned object is ready to pass as `body` to
 * `ycFetch(cfg, { path: "/payments", method: "POST", body: <here> })`.
 */
export declare function buildOutboundPaymentPayload(opts: BuildOutboundPaymentPayloadOptions): Record<string, unknown>;
//# sourceMappingURL=outbound.d.ts.map