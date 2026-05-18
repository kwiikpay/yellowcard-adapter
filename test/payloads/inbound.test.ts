/**
 * Fixture tests for `buildInboundCollectionPayload`.
 *
 * Pins down the inbound-specific bug fixes:
 *   - commit fc50ad8: prioritize KYC user_metadata over form input
 *   - SA EFT redirectUrl handling (per 99-troubleshooting.md)
 *   - top-level customer + sender + source blocks (Sender Name)
 */

import { describe, it, expect } from "vitest";
import { buildInboundCollectionPayload } from "../../src/payloads/inbound.js";
import type { YcBusinessIdentity, YcKycFields } from "../../src/types.js";

const baseBusiness: YcBusinessIdentity = {
  businessName: "Test Biz",
  businessId: "test-biz-id",
};

const fullKyc: YcKycFields = {
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Wonderland",
  fullName: "Alice Wonderland",
  phone: "+254711111111",
  dateOfBirth: "1990-05-15",
};

describe("buildInboundCollectionPayload", () => {
  it("uses localAmount NOT amount", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-1",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 50000,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload.localAmount).toBe(50000);
    expect(payload).not.toHaveProperty("amount");
  });

  it("sets customerType='institution'", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-2",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload.customerType).toBe("institution");
  });

  it("includes recipient block with businessName + businessId + email", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-3",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const recipient = payload.recipient as Record<string, unknown>;
    expect(recipient.businessName).toBe("Test Biz");
    expect(recipient.businessId).toBe("test-biz-id");
    expect(recipient.email).toBe("alice@example.com");
  });

  it("includes redirectUrl when provided (SA EFT requirement)", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-4",
      channelId: "ch_za_eft",
      sourceCurrency: "ZAR",
      sourceCountry: "ZA",
      localAmount: 500,
      business: baseBusiness,
      customer: fullKyc,
      redirectUrl: "https://business.kwiikpay.io/africa/send",
    });
    expect(payload.redirectUrl).toBe(
      "https://business.kwiikpay.io/africa/send",
    );
  });

  it("omits redirectUrl when not provided", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-5",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload).not.toHaveProperty("redirectUrl");
  });

  it("prefers KYC values over fallbackSender (commit fc50ad8)", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-6",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
      fallbackSender: {
        name: "Different Form Name",
        phone: "+999999",
        email: "form@example.com",
      },
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.name).toBe("Alice Wonderland");
    expect(sender.phone).toBe("+254711111111");
    expect(sender.email).toBe("alice@example.com");
  });

  it("uses fallbackSender only when KYC fields are empty", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-7",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: { email: "" },
      fallbackSender: {
        name: "Fallback Name",
        phone: "+1234567890",
        email: "fallback@example.com",
      },
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.name).toBe("Fallback Name");
    expect(sender.phone).toBe("+1234567890");
    expect(sender.email).toBe("fallback@example.com");
  });

  it("emits both sender + customer + source blocks (Sender Name fix)", () => {
    const payload = buildInboundCollectionPayload({
      sequenceId: "kpb-in-test-8",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload).toHaveProperty("sender");
    expect(payload).toHaveProperty("customer");
    expect(payload).toHaveProperty("source");
  });

  it("propagates sequenceId verbatim (consumer chooses prefix)", () => {
    const inbound = buildInboundCollectionPayload({
      sequenceId: "kpb-in-some-uuid",
      channelId: "ch_ke_bank",
      sourceCurrency: "KES",
      sourceCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(inbound.sequenceId).toBe("kpb-in-some-uuid");
  });
});
