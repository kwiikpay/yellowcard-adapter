/**
 * Parse a raw Yellowcard webhook payload into a normalised event.
 *
 * YC's webhook payloads are inconsistent across event types:
 *   - The order ID lives in `data.id` OR `data.collectionId` OR `data.paymentId`
 *   - The event name lives in `event` OR `type` OR `eventType`
 *   - `data` may be nested under `data:` or live at the top level
 *   - `sequenceId` is the only field reliably present across both flows
 *
 * This function probes the known field locations and returns a single
 * normalised shape (`YcWebhookEvent`) that consumers can switch on.
 *
 * The flow direction (`inbound` vs `outbound`) is derived from the
 * `sequenceId` prefix — `<prefix>-in-<uuid>` is inbound, anything else
 * with a hyphen prefix is outbound. Sequence prefix is opaque to the
 * package: `kp-`, `kpb-`, or any other consumer-chosen prefix works.
 */

import type { YcWebhookEvent } from "../types.js";

/**
 * Parse a raw YC webhook body into a typed event.
 *
 * Tolerant of:
 *   - missing fields (returns empty strings for each)
 *   - nested vs top-level `data`
 *   - alternative event-name fields (`event` / `type` / `eventType`)
 *   - alternative order-id fields (`id` / `collectionId` / `paymentId`)
 *
 * @param raw The decoded webhook body (object from `JSON.parse`).
 *            Pass `unknown` — this function defensively coerces.
 */
export function parseYcWebhookPayload(raw: unknown): YcWebhookEvent {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const event = String(payload.event ?? payload.type ?? payload.eventType ?? "");
  const dataObj = (payload.data ?? payload) as Record<string, unknown>;
  const ycOrderId = String(
    dataObj.id ?? dataObj.collectionId ?? dataObj.paymentId ?? "",
  );
  const sequenceId = String(dataObj.sequenceId ?? "");
  const ycStatus = String(dataObj.status ?? "");

  const kind = classifyKindFromSequenceId(sequenceId);

  return { event, ycOrderId, sequenceId, ycStatus, kind, rawPayload: raw };
}

/**
 * Derive `inbound` / `outbound` / `unknown` from a sequenceId prefix.
 *
 * Conventions (any consumer-chosen prefix is supported):
 *   - `<prefix>-in-<uuid>`  → inbound  (e.g., `kp-in-abc123`, `kpb-in-abc123`)
 *   - `<prefix>-<uuid>`     → outbound (e.g., `kp-abc123`, `kpb-abc123`)
 *   - anything else         → unknown
 *
 * Exported so consumers can apply the same rule when reading rows from
 * their own tables (e.g., when reconciling local order state).
 */
export function classifyKindFromSequenceId(
  sequenceId: string,
): "inbound" | "outbound" | "unknown" {
  if (!sequenceId) return "unknown";
  if (/^[a-z0-9]+-in-/i.test(sequenceId)) return "inbound";
  if (/^[a-z0-9]+-/i.test(sequenceId)) return "outbound";
  return "unknown";
}
