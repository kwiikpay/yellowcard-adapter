/**
 * Fixture tests for `buildOutboundPaymentPayload`.
 *
 * Each test pins down one of Tim's 10 bug-fix commits. If any of these
 * fail, a regression has slipped in. Test names reference the commit
 * SHA on kwiikpay/website-kp:thor for traceability.
 */

import { describe, it, expect } from "vitest";
import { buildOutboundPaymentPayload } from "../../src/payloads/outbound.js";
import type {
  YcBeneficiary,
  YcBusinessIdentity,
  YcKycFields,
} from "../../src/types.js";

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

const bankBeneficiary: YcBeneficiary = {
  channelId: "ch_ke_bank",
  networkId: "net_kcb",
  accountName: "Recipient Co",
  accountNumber: "1111111111",
  bankCode: "KCB",
};

const momoBeneficiary: YcBeneficiary = {
  channelId: "ch_ke_momo",
  networkId: "net_mpesa",
  accountName: "Recipient Person",
  phoneNumber: "+254700000000",
};

describe("buildOutboundPaymentPayload", () => {
  it("uses localAmount NOT amount (commit 2c2390c, f5ff304)", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-1",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 10000,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload).toHaveProperty("localAmount", 10000);
    expect(payload).not.toHaveProperty("amount");
  });

  it("includes email in sender (commit 4cec89c / d15a807)", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-2",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.email).toBe("alice@example.com");
  });

  it("sets customerType='institution'", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-3",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload.customerType).toBe("institution");
  });

  it("populates KYC fields in sender from user_metadata (commit c49369e)", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-4",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.firstName).toBe("Alice");
    expect(sender.lastName).toBe("Wonderland");
    expect(sender.phone).toBe("+254711111111");
    expect(sender.phoneNumber).toBe("+254711111111");
    expect(sender.dateOfBirth).toBe("1990-05-15");
  });

  it("adds top-level customer object with KYC fields (commit 733838b)", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-5",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload).toHaveProperty("customer");
    const customer = payload.customer as Record<string, unknown>;
    expect(customer.name).toBe("Alice Wonderland");
    expect(customer.firstName).toBe("Alice");
    expect(customer.lastName).toBe("Wonderland");
    expect(customer.email).toBe("alice@example.com");
  });

  it("derives accountType='momo' for phone-only beneficiary", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-6",
      beneficiary: momoBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const dest = payload.destination as Record<string, unknown>;
    expect(dest.accountType).toBe("momo");
    expect(dest.accountNumber).toBe("+254700000000"); // falls back to phoneNumber
  });

  it("derives accountType='bank' for bank-account beneficiary", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-7",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const dest = payload.destination as Record<string, unknown>;
    expect(dest.accountType).toBe("bank");
    expect(dest.accountNumber).toBe("1111111111");
  });

  it("sets forceAccept: true", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-8",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payload.forceAccept).toBe(true);
  });

  it("falls back to email-as-name when KYC name fields are empty", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-9",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: { email: "bob@example.com" },
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.name).toBe("bob@example.com");
  });

  it("falls back to 'Kwiikpay Customer' when both KYC name and email are empty", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-10",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: { email: "" },
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.name).toBe("Kwiikpay Customer");
  });

  it("omits dateOfBirth field when not provided", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-11",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: { email: "alice@example.com", firstName: "Alice" },
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.dateOfBirth).toBeUndefined();
    expect(sender).not.toHaveProperty("dateOfBirth");
  });

  it("propagates sequenceId verbatim (lets consumer pick kp- vs kpb-)", () => {
    const payloadKp = buildOutboundPaymentPayload({
      sequenceId: "kp-some-uuid",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    const payloadKpb = buildOutboundPaymentPayload({
      sequenceId: "kpb-some-uuid",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: baseBusiness,
      customer: fullKyc,
    });
    expect(payloadKp.sequenceId).toBe("kp-some-uuid");
    expect(payloadKpb.sequenceId).toBe("kpb-some-uuid");
  });

  it("includes businessName + businessId in sender (multi-tenant identity)", () => {
    const payload = buildOutboundPaymentPayload({
      sequenceId: "kpb-test-13",
      beneficiary: bankBeneficiary,
      destinationCurrency: "KES",
      destinationCountry: "KE",
      localAmount: 100,
      business: { businessName: "KwiikPay Business", businessId: "kpb-prod-1" },
      customer: fullKyc,
    });
    const sender = payload.sender as Record<string, unknown>;
    expect(sender.businessName).toBe("KwiikPay Business");
    expect(sender.businessId).toBe("kpb-prod-1");
  });
});
