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
import { deriveCustomerName } from "./kyc.js";
/**
 * Build the YC `/collections` POST body.
 *
 * Pass the result as `body` to:
 *   `ycFetch(cfg, { path: "/collections", method: "POST", body: ... })`
 */
export function buildInboundCollectionPayload(opts) {
    const { sequenceId, channelId, networkId, sourceCurrency, sourceCountry, localAmount, business, customer, fallbackSender = {}, redirectUrl, } = opts;
    const metaFirstName = (customer.firstName ?? "").trim();
    const metaLastName = (customer.lastName ?? "").trim();
    const metaPhone = (customer.phone ?? "").trim();
    const metaDob = (customer.dateOfBirth ?? "").trim();
    const metaEmail = customer.email ?? "";
    // KYC-over-form-input preference (commit fc50ad8). Form values only
    // used when KYC is empty.
    const kycName = deriveCustomerName(customer, "");
    const senderName = kycName || fallbackSender.name || metaEmail || "Kwiikpay Customer";
    const senderPhone = metaPhone || fallbackSender.phone || "";
    const senderEmail = metaEmail || fallbackSender.email || "";
    const senderFirstName = metaFirstName || senderName.split(" ")[0] || "";
    const senderLastName = metaLastName || senderName.split(" ").slice(1).join(" ") || "";
    return {
        sequenceId,
        channelId,
        networkId: networkId || undefined,
        currency: sourceCurrency,
        country: sourceCountry,
        localAmount,
        reason: "other",
        recipient: {
            businessName: business.businessName,
            businessId: business.businessId,
            email: metaEmail,
        },
        source: {
            accountName: senderName,
            accountNumber: "",
            phoneNumber: senderPhone,
            email: senderEmail,
            firstName: senderFirstName,
            lastName: senderLastName,
            ...(metaDob ? { dateOfBirth: metaDob } : {}),
        },
        sender: {
            name: senderName,
            firstName: senderFirstName,
            lastName: senderLastName,
            phone: senderPhone,
            email: senderEmail,
            country: sourceCountry,
            ...(metaDob ? { dateOfBirth: metaDob } : {}),
        },
        customer: {
            name: senderName,
            firstName: senderFirstName,
            lastName: senderLastName,
            phone: senderPhone,
            email: senderEmail,
            country: sourceCountry,
            ...(metaDob ? { dateOfBirth: metaDob } : {}),
        },
        forceAccept: true,
        customerType: "institution",
        ...(redirectUrl ? { redirectUrl } : {}),
    };
}
//# sourceMappingURL=inbound.js.map