import { describe, it, expect } from "vitest";
import {
  parseYcWebhookPayload,
  classifyKindFromSequenceId,
} from "../../src/webhook/parse.js";

describe("parseYcWebhookPayload", () => {
  it("extracts id from data.id (outbound payment shape)", () => {
    const event = parseYcWebhookPayload({
      event: "payment.completed",
      data: {
        id: "pmt_abc123",
        sequenceId: "kpb-some-uuid",
        status: "completed",
      },
    });
    expect(event.ycOrderId).toBe("pmt_abc123");
    expect(event.sequenceId).toBe("kpb-some-uuid");
    expect(event.ycStatus).toBe("completed");
    expect(event.event).toBe("payment.completed");
  });

  it("extracts id from data.collectionId (inbound collection shape)", () => {
    const event = parseYcWebhookPayload({
      type: "collection.received",
      data: {
        collectionId: "col_xyz789",
        sequenceId: "kpb-in-some-uuid",
        status: "received",
      },
    });
    expect(event.ycOrderId).toBe("col_xyz789");
    expect(event.event).toBe("collection.received");
  });

  it("extracts id from data.paymentId (alternative shape)", () => {
    const event = parseYcWebhookPayload({
      eventType: "payment.failed",
      data: { paymentId: "pay_123", sequenceId: "kp-foo", status: "failed" },
    });
    expect(event.ycOrderId).toBe("pay_123");
  });

  it("falls back to top-level data when 'data' key absent", () => {
    const event = parseYcWebhookPayload({
      id: "top_level_id",
      sequenceId: "kpb-bar",
      status: "settled",
    });
    expect(event.ycOrderId).toBe("top_level_id");
    expect(event.sequenceId).toBe("kpb-bar");
  });

  it("derives kind='inbound' from -in- in sequenceId", () => {
    const event = parseYcWebhookPayload({
      data: { sequenceId: "kpb-in-abc", id: "x" },
    });
    expect(event.kind).toBe("inbound");
  });

  it("derives kind='outbound' from prefix without -in-", () => {
    const event = parseYcWebhookPayload({
      data: { sequenceId: "kpb-abc", id: "x" },
    });
    expect(event.kind).toBe("outbound");
  });

  it("derives kind='unknown' from missing sequenceId", () => {
    const event = parseYcWebhookPayload({ data: { id: "x" } });
    expect(event.kind).toBe("unknown");
  });

  it("works with both kp- (retail) and kpb- (business) prefixes", () => {
    expect(
      parseYcWebhookPayload({ data: { sequenceId: "kp-abc", id: "x" } }).kind,
    ).toBe("outbound");
    expect(
      parseYcWebhookPayload({ data: { sequenceId: "kp-in-abc", id: "x" } }).kind,
    ).toBe("inbound");
    expect(
      parseYcWebhookPayload({ data: { sequenceId: "kpb-abc", id: "x" } }).kind,
    ).toBe("outbound");
    expect(
      parseYcWebhookPayload({ data: { sequenceId: "kpb-in-abc", id: "x" } }).kind,
    ).toBe("inbound");
  });

  it("preserves rawPayload", () => {
    const raw = { data: { id: "x", sequenceId: "kpb-y", status: "completed" } };
    const event = parseYcWebhookPayload(raw);
    expect(event.rawPayload).toBe(raw);
  });

  it("tolerates null/undefined payload", () => {
    const event = parseYcWebhookPayload(null);
    expect(event.ycOrderId).toBe("");
    expect(event.sequenceId).toBe("");
    expect(event.kind).toBe("unknown");
  });
});

describe("classifyKindFromSequenceId", () => {
  it("returns inbound for -in- prefixed IDs", () => {
    expect(classifyKindFromSequenceId("kp-in-uuid")).toBe("inbound");
    expect(classifyKindFromSequenceId("kpb-in-uuid")).toBe("inbound");
    expect(classifyKindFromSequenceId("xyz-in-uuid")).toBe("inbound");
  });

  it("returns outbound for prefix without -in-", () => {
    expect(classifyKindFromSequenceId("kp-uuid")).toBe("outbound");
    expect(classifyKindFromSequenceId("kpb-uuid")).toBe("outbound");
  });

  it("returns unknown for malformed IDs", () => {
    expect(classifyKindFromSequenceId("")).toBe("unknown");
    expect(classifyKindFromSequenceId("noprefix")).toBe("unknown");
  });
});
