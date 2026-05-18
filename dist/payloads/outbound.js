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
import { deriveCustomerName } from "./kyc.js";
/**
 * Build the YC `/payments` POST body.
 *
 * The returned object is ready to pass as `body` to
 * `ycFetch(cfg, { path: "/payments", method: "POST", body: <here> })`.
 */
export function buildOutboundPaymentPayload(opts) {
    const { sequenceId, beneficiary, destinationCurrency, destinationCountry, localAmount, business, customer, } = opts;
    const firstName = (customer.firstName ?? "").trim();
    const lastName = (customer.lastName ?? "").trim();
    const phone = (customer.phone ?? "").trim();
    const dob = (customer.dateOfBirth ?? "").trim();
    const email = customer.email ?? "";
    const customerName = deriveCustomerName(customer);
    // YC's network resolution: if a phoneNumber is supplied but no
    // accountNumber, the destination is a mobile-money wallet; otherwise
    // it's a bank account. Wrong type → YC 400 "channel/account mismatch".
    const accountType = beneficiary.phoneNumber && !beneficiary.accountNumber ? "momo" : "bank";
    return {
        sequenceId,
        channelId: beneficiary.channelId,
        networkId: beneficiary.networkId,
        currency: destinationCurrency,
        country: destinationCountry,
        localAmount,
        reason: "other",
        customerType: "institution",
        sender: {
            businessName: business.businessName,
            businessId: business.businessId,
            name: customerName,
            firstName,
            lastName,
            phone,
            phoneNumber: phone,
            email,
            ...(dob ? { dateOfBirth: dob } : {}),
        },
        customer: {
            name: customerName,
            firstName,
            lastName,
            phone,
            email,
            ...(dob ? { dateOfBirth: dob } : {}),
        },
        destination: {
            accountName: beneficiary.accountName,
            accountNumber: beneficiary.accountNumber || beneficiary.phoneNumber || "",
            accountType,
            networkId: beneficiary.networkId,
            accountBank: beneficiary.bankCode ?? "",
            phoneNumber: beneficiary.phoneNumber ?? "",
            email: beneficiary.recipientEmail ?? "",
        },
        forceAccept: true,
    };
}
//# sourceMappingURL=outbound.js.map