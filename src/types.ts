/**
 * Public type surface for @kwiikpay/yellowcard-adapter.
 *
 * Everything exported from here is part of the package's stable API.
 * Anything used internally (e.g., normalised intermediate shapes) should
 * stay un-exported in its module.
 *
 * Naming convention: camelCase throughout. The package speaks
 * Yellowcard's camelCase dialect. Consumers that store data in
 * snake_case (e.g., Supabase tables with `channel_id`, `account_number`)
 * are responsible for mapping at the boundary.
 */

// ─────────────────────────────────────────────────────────────────────
// KYC + customer identity
// ─────────────────────────────────────────────────────────────────────

/**
 * Customer KYC fields used in YC payloads.
 *
 * Sourced from Supabase `auth.users.user_metadata` in consuming projects.
 * Tim's bug-fix history (commits c49369e, fc50ad8, 733838b) established
 * that YC's dashboard requires `firstName`/`lastName`/`fullName`/`phone`/
 * `dateOfBirth` to display the sender's identity correctly.
 *
 * `email` is the only required field — everything else is optional but
 * strongly recommended for KYC matching at YC's end.
 */
export interface YcKycFields {
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  /** ISO 8601 date (YYYY-MM-DD). YC accepts this format. */
  dateOfBirth?: string;
}

/**
 * Identity of the KwiikPay business entity sending/receiving via YC.
 *
 * Stored in the consuming project's `yellowcard_config` (single-row
 * table, id=1). Distinct per consuming project — e.g., website-kp uses
 * a retail business identity, kwiikpay-dashboard uses a B2B identity.
 *
 * Both projects share the same YC merchant account but distinguish
 * transactions via sequenceId prefix (see CUSTOMIZE.md in the original
 * handoff at kwiikpay/website-kp:thor/handoff/02-yellowcard/).
 */
export interface YcBusinessIdentity {
  businessName: string;
  businessId: string;
}

// ─────────────────────────────────────────────────────────────────────
// Outbound (Send: USDT → African local currency)
// ─────────────────────────────────────────────────────────────────────

/**
 * Beneficiary (payment recipient) for an outbound YC payment.
 *
 * In a consuming project this typically lives in the
 * `yellowcard_beneficiaries` table; map the columns to this shape at
 * the EF boundary.
 */
export interface YcBeneficiary {
  /** YC channel ID (from `yellowcard_channels`). Determines bank/MoMo rail. */
  channelId: string;
  /** YC network ID (from `yellowcard_networks`). Specific bank/MoMo provider. */
  networkId: string;
  accountName: string;
  /** Bank account number. Required for bank channels; empty for MoMo. */
  accountNumber?: string;
  /** Bank routing/sort code where applicable. */
  bankCode?: string;
  /** Phone number for MoMo recipients (incl. country code). */
  phoneNumber?: string;
  /** Recipient's email (used for some YC notification flows). */
  recipientEmail?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Webhook events
// ─────────────────────────────────────────────────────────────────────

/** Which side of the YC flow a webhook event relates to. */
export type YcFlow = "inbound" | "outbound";

/**
 * Lifecycle classification of a YC webhook event.
 *
 * - `completed` — terminal success (payment settled / collection done)
 * - `failed` — terminal failure (rejected / cancelled / expired)
 * - `received` — INBOUND ONLY: YC has received the customer's bank payment but USDT not yet credited
 * - `sent` — OUTBOUND ONLY: YC has dispatched the payout to the recipient bank but not yet confirmed received
 * - `tick` — non-terminal status update we don't act on
 */
export type YcStatusClass = "completed" | "failed" | "received" | "sent" | "tick";

/**
 * Parsed YC webhook event. Produced by `parseYcWebhookPayload(raw)`.
 *
 * `kind` is derived from the sequenceId prefix:
 *   - `kp-in-...` or `kpb-in-...` → `inbound`
 *   - `kp-...` or `kpb-...` (no `in-` segment) → `outbound`
 *   - anything else → `unknown`
 *
 * The `kp-` vs `kpb-` distinction (retail vs business) is opaque to the
 * package — consumers may use any prefix as long as the `-in-` segment
 * marks inbound events.
 */
export interface YcWebhookEvent {
  event: string;
  ycOrderId: string;
  sequenceId: string;
  ycStatus: string;
  kind: "inbound" | "outbound" | "unknown";
  rawPayload: unknown;
}

// ─────────────────────────────────────────────────────────────────────
// Client (HMAC + fetch)
// ─────────────────────────────────────────────────────────────────────

export interface YcClientConfig {
  /** YC API base URL. Use YC_SANDBOX_URL or YC_PRODUCTION_URL from constants. */
  baseUrl: string;
  apiKey: string;
  secretKey: string;
}

export interface YcRequestOptions {
  /** Path under baseUrl, e.g. `/payments`, `/collections`, `/rates`. */
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /**
   * Request body. Will be JSON.stringified for the on-wire payload AND
   * for the HMAC signature input. Pass `undefined` for GET requests.
   */
  body?: unknown;
}

export interface YcResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}
