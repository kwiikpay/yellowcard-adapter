/**
 * Canonical-string + signing tests for client.ts.
 *
 * These tests are the regression gate against the v0.2.x signing bugs:
 *
 *   Bug A: `buildMessage` always appended `base64(sha256(body))` — even
 *          for GET requests. Per YC docs, the bodyHash component is
 *          ONLY for POST/PUT. Including it for GET caused 401
 *          AuthenticationError on every sandbox call.
 *
 *   Bug B: Confusion about whether the canonical path should include
 *          the `/business/` prefix. Sandbox verification on
 *          2026-05-18 confirmed: YES, path includes /business/.
 *
 * Asserts the exact canonical strings the YC server expects to see,
 * documented at https://docs.yellowcard.engineering/docs/authentication.
 */

import { describe, it, expect } from "vitest";
import { buildMessage, sha256Base64, maybeStripBusinessPrefix } from "../src/client.js";

describe("buildMessage — canonical string format (YC docs-correct)", () => {
  const TS = "2026-05-18T20:00:00.000Z";
  const PATH = "/business/channels";

  it("GET: canonical is <timestamp><path>GET — no bodyHash component", async () => {
    const msg = await buildMessage(TS, PATH, "GET", "");
    expect(msg).toBe(`${TS}${PATH}GET`);
  });

  it("DELETE: canonical is <timestamp><path>DELETE — no bodyHash component", async () => {
    const msg = await buildMessage(TS, PATH, "DELETE", "");
    expect(msg).toBe(`${TS}${PATH}DELETE`);
  });

  it("HEAD: canonical is <timestamp><path>HEAD — no bodyHash component", async () => {
    const msg = await buildMessage(TS, "/business/healthz", "HEAD", "");
    expect(msg).toBe(`${TS}/business/healthzHEAD`);
  });

  it("POST: canonical is <timestamp><path>POST<base64(sha256(body))>", async () => {
    const body = '{"amount":"100"}';
    const expectedHash = await sha256Base64(body);
    const msg = await buildMessage(TS, "/business/payments/accept", "POST", body);
    expect(msg).toBe(`${TS}/business/payments/acceptPOST${expectedHash}`);
  });

  it("PUT: canonical is <timestamp><path>PUT<base64(sha256(body))>", async () => {
    const body = '{"id":"abc"}';
    const expectedHash = await sha256Base64(body);
    const msg = await buildMessage(TS, "/business/payments/abc", "PUT", body);
    expect(msg).toBe(`${TS}/business/payments/abcPUT${expectedHash}`);
  });

  it("POST with empty body: bodyHash is base64(sha256(\"\"))", async () => {
    // YC's spec allows POST with empty body. bodyHash is still computed,
    // so it equals the constant `47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`.
    const EMPTY_SHA256_B64 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    const msg = await buildMessage(TS, "/business/foo", "POST", "");
    expect(msg).toBe(`${TS}/business/fooPOST${EMPTY_SHA256_B64}`);
  });

  it("method is uppercased before insertion", async () => {
    const msg1 = await buildMessage(TS, PATH, "get", "");
    const msg2 = await buildMessage(TS, PATH, "GET", "");
    expect(msg1).toBe(msg2);
  });

  it("matches YC's docs example shape (POST with body)", async () => {
    // From YC docs:
    //   "Example message to sign, 2022-01-11T15:48:37.424Z/paymentPOSTuisbibf/sadf+=="
    // We can't reproduce that exact hash without the original body, but
    // we CAN assert our format matches the structure (timestamp + path
    // + METHOD + bodyHash for POST).
    const msg = await buildMessage(
      "2022-01-11T15:48:37.424Z",
      "/payment",
      "POST",
      "somebody",
    );
    // Pattern check: <timestamp>/paymentPOST<base64-ish>
    expect(msg).toMatch(/^2022-01-11T15:48:37\.424Z\/paymentPOST[A-Za-z0-9+/=]+$/);
  });
});

describe("maybeStripBusinessPrefix — default behavior", () => {
  it("default (false) keeps /business/ prefix intact", () => {
    expect(maybeStripBusinessPrefix("/business/channels", false))
      .toBe("/business/channels");
  });

  it("explicit true strips the /business prefix", () => {
    expect(maybeStripBusinessPrefix("/business/channels", true))
      .toBe("/channels");
  });

  it("path without /business prefix is unaffected by toggle=true", () => {
    expect(maybeStripBusinessPrefix("/channels", true)).toBe("/channels");
  });

  it("nested paths under /business are stripped to leaf", () => {
    expect(maybeStripBusinessPrefix("/business/payments/accept", true))
      .toBe("/payments/accept");
  });
});

describe("sha256Base64 — known-value sanity check", () => {
  it("hash of empty string matches standard constant", async () => {
    // base64(sha256("")) is one of the most-cited cryptographic constants
    const h = await sha256Base64("");
    expect(h).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });

  it("returns a 44-character base64 string for any input", async () => {
    // SHA-256 produces 32 bytes, which base64-encodes to 44 chars (with padding).
    // This is a shape sanity check, not a known-value gate.
    const h = await sha256Base64("any input here");
    expect(h).toHaveLength(44);
    expect(h).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
