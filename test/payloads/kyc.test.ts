import { describe, it, expect } from "vitest";
import {
  normalizeKycFromUserMetadata,
  deriveCustomerName,
} from "../../src/payloads/kyc.js";

describe("normalizeKycFromUserMetadata", () => {
  it("returns email-only for null metadata", () => {
    const kyc = normalizeKycFromUserMetadata(null, "alice@example.com");
    expect(kyc).toEqual({ email: "alice@example.com" });
  });

  it("returns email-only for undefined metadata", () => {
    const kyc = normalizeKycFromUserMetadata(undefined, "alice@example.com");
    expect(kyc).toEqual({ email: "alice@example.com" });
  });

  it("maps Supabase snake_case → camelCase", () => {
    const kyc = normalizeKycFromUserMetadata(
      {
        first_name: "Alice",
        last_name: "Wonderland",
        full_name: "Alice Wonderland",
        phone: "+254711111111",
        date_of_birth: "1990-05-15",
      },
      "alice@example.com",
    );
    expect(kyc).toEqual({
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Wonderland",
      fullName: "Alice Wonderland",
      phone: "+254711111111",
      dateOfBirth: "1990-05-15",
    });
  });

  it("trims whitespace from values", () => {
    const kyc = normalizeKycFromUserMetadata(
      { first_name: "  Alice  ", last_name: "\tWonderland\n" },
      "x@x.com",
    );
    expect(kyc.firstName).toBe("Alice");
    expect(kyc.lastName).toBe("Wonderland");
  });

  it("omits empty strings (after trim)", () => {
    const kyc = normalizeKycFromUserMetadata(
      { first_name: "   ", last_name: "", phone: "+254700000000" },
      "x@x.com",
    );
    expect(kyc.firstName).toBeUndefined();
    expect(kyc.lastName).toBeUndefined();
    expect(kyc.phone).toBe("+254700000000");
  });

  it("ignores non-string values", () => {
    const kyc = normalizeKycFromUserMetadata(
      { first_name: 42, phone: { not: "a string" }, last_name: null },
      "x@x.com",
    );
    expect(kyc.firstName).toBeUndefined();
    expect(kyc.lastName).toBeUndefined();
    expect(kyc.phone).toBeUndefined();
  });
});

describe("deriveCustomerName", () => {
  it("prefers fullName over firstName+lastName", () => {
    expect(
      deriveCustomerName({
        email: "x@x.com",
        fullName: "Full Name",
        firstName: "First",
        lastName: "Last",
      }),
    ).toBe("Full Name");
  });

  it("falls back to firstName+lastName when no fullName", () => {
    expect(
      deriveCustomerName({
        email: "x@x.com",
        firstName: "Alice",
        lastName: "Wonderland",
      }),
    ).toBe("Alice Wonderland");
  });

  it("falls back to email when no name fields", () => {
    expect(deriveCustomerName({ email: "alice@example.com" })).toBe(
      "alice@example.com",
    );
  });

  it("uses fallback string when email also empty", () => {
    expect(deriveCustomerName({ email: "" })).toBe("Kwiikpay Customer");
  });

  it("accepts custom fallback string", () => {
    expect(deriveCustomerName({ email: "" }, "Anonymous")).toBe("Anonymous");
  });

  it("handles only firstName (no lastName)", () => {
    expect(
      deriveCustomerName({ email: "x@x.com", firstName: "Alice" }),
    ).toBe("Alice");
  });
});
