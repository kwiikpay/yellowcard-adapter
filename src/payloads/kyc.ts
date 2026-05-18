/**
 * KYC field normalisation.
 *
 * Bridges the gap between how consuming projects store user identity
 * (typically Supabase `auth.users.user_metadata`, snake_case) and the
 * shape YC expects in payloads (camelCase, normalised whitespace).
 *
 * The 10 Tim-bug-fix commits in kwiikpay/website-kp established that
 * YC's dashboard pulls sender identity from these specific fields, and
 * that missing/blank values cause "Sender Name: blank" entries that
 * confuse compliance review.
 */

import type { YcKycFields } from "../types.js";

/**
 * Normalise YcKycFields from a Supabase `auth.users.user_metadata` blob.
 *
 * Tolerant of:
 *   - `null` / `undefined` metadata (returns `{ email }` only)
 *   - missing or non-string fields (omits them)
 *   - whitespace padding (trimmed)
 *
 * @param meta The user_metadata blob from Supabase auth.users
 * @param email The user's email (always required)
 *
 * @example
 *   const user = await supabase.auth.admin.getUserById(userId);
 *   const kyc = normalizeKycFromUserMetadata(user.data.user.user_metadata, user.data.user.email);
 *   const payload = buildOutboundPaymentPayload({ ..., customer: kyc });
 */
export function normalizeKycFromUserMetadata(
  meta: Record<string, unknown> | null | undefined,
  email: string,
): YcKycFields {
  if (!meta) return { email };
  const pick = (k: string): string | undefined => {
    const v = meta[k];
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  return {
    email,
    firstName: pick("first_name"),
    lastName: pick("last_name"),
    fullName: pick("full_name"),
    phone: pick("phone"),
    dateOfBirth: pick("date_of_birth"),
  };
}

/**
 * Derive a best-effort display name from KYC fields.
 *
 * Preference order:
 *   1. fullName (if set)
 *   2. firstName + lastName
 *   3. email
 *   4. fallback string (default: "Kwiikpay Customer")
 *
 * Used internally by the payload builders to populate `sender.name` /
 * `customer.name` / `source.accountName`. Exported for consumers that
 * want the same fallback logic elsewhere (e.g., admin UIs).
 */
export function deriveCustomerName(
  kyc: YcKycFields,
  fallback = "Kwiikpay Customer",
): string {
  const full = (kyc.fullName ?? "").trim();
  if (full.length > 0) return full;
  const composed = `${(kyc.firstName ?? "").trim()} ${(kyc.lastName ?? "").trim()}`.trim();
  if (composed.length > 0) return composed;
  if (kyc.email && kyc.email.trim().length > 0) return kyc.email.trim();
  return fallback;
}
