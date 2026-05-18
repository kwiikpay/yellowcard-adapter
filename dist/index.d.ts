/**
 * @kwiikpay/yellowcard-adapter
 *
 * Shared adapter for the Yellowcard API. Consumed by:
 *   - kwiikpay/website-kp (B2C retail)
 *   - kwiikpay/kwiikpay-dashboard (B2B)
 *
 * Two projects, two customer bases, one YC merchant account, one
 * codebase for the YC API contract. Bug fixes propagate via
 * `npm update` instead of Slack-DMed diffs.
 *
 * Quick start:
 *
 *   import {
 *     ycFetch,
 *     buildOutboundPaymentPayload,
 *     parseYcWebhookPayload,
 *     classifyYcStatus,
 *     normalizeKycFromUserMetadata,
 *     YC_SANDBOX_URL,
 *   } from "@kwiikpay/yellowcard-adapter";
 *
 * See `examples/deno-edge-function.ts` for a complete Supabase EF
 * reference implementation.
 */
export * from "./types.js";
export * from "./constants.js";
export * from "./env.js";
export * from "./client.js";
export * from "./payloads/index.js";
export * from "./webhook/index.js";
//# sourceMappingURL=index.d.ts.map