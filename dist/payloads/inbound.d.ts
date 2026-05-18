/**
 * Build the YC `/collections` (inbound, receive-money) request payload.
 *
 * Inbound flow: customer enters local-currency amount → YC issues a
 * deposit link / bank instructions → customer pays off-platform →
 * YC webhook fires → consumer credits user's USDT ledger.
 *
 * Same bug-fix lineage as outbound (commits c49369e, fc50ad8, 733838b,
 * d15a807) for the sender/customer identity. Plus inbound-specific:
 *
 *   1. `recipient` block names KwiikPay as the receiving party
 *   2. `source` block describes the customer paying
 *   3. `customer` + `sender` blocks (both) for dashboard "Sender Name"
 *   4. Optional `redirectUrl` — required for some channels (notably
 *      South Africa EFT via Ozow); YC sends user back to this URL after
 *      they complete the bank payment
 *   5. KYC-from-metadata preference over form-input (same as outbound,
 *      to keep YC's KYC database aligned with KwiikPay's)
 */
import type { YcBusinessIdentity, YcKycFields } from "../types.js";
export interface BuildInboundCollectionPayloadOptions {
    /**
     * Unique sequence ID. Inbound convention: `<prefix>-in-<uuid>`.
     *   - website-kp uses `kp-in-{uuid}`
     *   - kwiikpay-dashboard uses `kpb-in-{uuid}`
     * The `-in-` segment is how the webhook parser distinguishes
     * inbound from outbound events.
     */
    sequenceId: string;
    /** YC channel ID (which African rail). */
    channelId: string;
    /** YC network ID. Optional — some channels resolve network from country alone. */
    networkId?: string;
    /** ISO-4217 source currency, e.g. "KES", "ZAR". */
    sourceCurrency: string;
    /** ISO-3166-alpha-2 source country, e.g. "KE", "ZA". */
    sourceCountry: string;
    /** Amount in source currency. */
    localAmount: number;
    /** KwiikPay business identity receiving the collection. */
    business: YcBusinessIdentity;
    /** End-customer KYC fields (from `user.user_metadata`). */
    customer: YcKycFields;
    /**
     * Form-input fallback values. Used ONLY when the corresponding KYC
     * field is missing — never overrides verified KYC data. (See commit
     * fc50ad8: "prioritize KYC user_metadata over form input".)
     */
    fallbackSender?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    /**
     * URL to redirect the user back to after completing the bank payment.
     *
     * REQUIRED for some channels (South Africa EFT especially) — YC
     * returns 400 `"redirectUrl param is required for this channel"` if
     * omitted. Frontend typically passes
     * `${window.location.origin}/africa/send` (or equivalent).
     *
     * @see kwiikpay/website-kp:thor/handoff/99-troubleshooting.md
     *      (search for "redirectUrl")
     */
    redirectUrl?: string;
}
/**
 * Build the YC `/collections` POST body.
 *
 * Pass the result as `body` to:
 *   `ycFetch(cfg, { path: "/collections", method: "POST", body: ... })`
 */
export declare function buildInboundCollectionPayload(opts: BuildInboundCollectionPayloadOptions): Record<string, unknown>;
//# sourceMappingURL=inbound.d.ts.map