/**
 * Classify a Yellowcard webhook status string into a lifecycle bucket.
 *
 * YC sends many status strings ("completed", "complete", "success",
 * "settled", etc.) that map to the same semantic outcome. This function
 * collapses them into 5 buckets that consumers can act on:
 *
 *   - completed: terminal success — credit/debit the ledger, mark order done
 *   - failed:    terminal failure — refund (if applicable), mark order failed
 *   - received:  INBOUND ONLY — YC has the customer's payment but USDT not yet credited
 *   - sent:      OUTBOUND ONLY — YC has dispatched the local-currency payout
 *   - tick:      anything else — log it but don't act
 *
 * Status sets are pulled directly from the existing
 * yellowcard-webhook EF (kwiikpay/website-kp:thor) to preserve
 * behavioural compatibility.
 */

import type { YcFlow, YcStatusClass } from "../types.js";

const COMPLETED_INBOUND = new Set([
  "completed",
  "complete",
  "success",
  "processed",
  "settled",
]);

const COMPLETED_OUTBOUND = new Set([
  "completed",
  "complete",
  "success",
  "processed",
  "settled",
  "paid",
]);

const FAILED = new Set(["failed", "rejected", "cancelled", "expired"]);

const RECEIVED_INBOUND = new Set([
  "received",
  "paid",
  "collected",
  "processing",
]);

const SENT_OUTBOUND = new Set(["sent", "processing", "submitted"]);

/**
 * Classify a YC status string for the given flow direction.
 *
 * @param ycStatus The `status` field from YC's webhook payload (case-insensitive).
 * @param flow `"inbound"` (customer pays via local rail) or `"outbound"` (KwP pays out via local rail).
 *
 * @returns The lifecycle bucket. Always returns a value (defaults to `"tick"` for unknown statuses).
 */
export function classifyYcStatus(ycStatus: string, flow: YcFlow): YcStatusClass {
  const s = String(ycStatus ?? "").toLowerCase();
  if (flow === "inbound") {
    if (COMPLETED_INBOUND.has(s)) return "completed";
    if (FAILED.has(s)) return "failed";
    if (RECEIVED_INBOUND.has(s)) return "received";
    return "tick";
  }
  // outbound
  if (COMPLETED_OUTBOUND.has(s)) return "completed";
  if (FAILED.has(s)) return "failed";
  if (SENT_OUTBOUND.has(s)) return "sent";
  return "tick";
}
