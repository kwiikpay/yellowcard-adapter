/**
 * Tests for the v0.4.0 webhook verifier.
 *
 * YC's webhook signing scheme per docs at
 * https://docs.yellowcard.engineering/docs/webhooks:
 *
 *   X-YC-Signature: base64(HMAC-SHA256(rawBody, apiSecret))
 *
 * No timestamp, no path, no method — just body bytes signed with the
 * api secret. These tests cover the happy path plus every rejection
 * reason the verifier emits.
 */

import { describe, it, expect } from "vitest";
import { verifyYcWebhookSignature } from "../../src/webhook/verify.js";
import { hmacSign } from "../../src/client.js";

// Helper: produce a valid X-YC-Signature value for a given body + secret
async function signWebhook(rawBody: string, secret: string): Promise<string> {
  return hmacSign(secret, rawBody);
}

describe("verifyYcWebhookSignature (v0.4.0 scheme: X-YC-Signature = base64(HMAC-SHA256(body, secret)))", () => {
  const SECRET = "test-api-secret-abc123";
  const BODY = JSON.stringify({
    id: "00e97bc4-1429-4ce7-acb5-841f9d9ed059",
    sequenceId: "1a051f68-5c55-44c8-b4a0-366800daaf19",
    status: "complete",
    apiKey: "513fc4c3aaeb2a8f292a740ea178d830",
    event: "COLLECTION.COMPLETE",
    sessionId: "a4cf97cd-8f1a-4e38-842b-e9597affb199",
    executedAt: "2026-05-18T20:00:00.000Z",
  });

  it("accepts a correctly-signed webhook", async () => {
    const signature = await signWebhook(BODY, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a webhook for COLLECTION.FAILED event with errorCode", async () => {
    const failedBody = JSON.stringify({
      id: "failed-id",
      status: "failed",
      apiKey: "apikey",
      event: "COLLECTION.FAILED",
      errorCode: "REFUSED",
      executedAt: "2026-05-18T20:00:00.000Z",
    });
    const signature = await signWebhook(failedBody, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: failedBody,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a webhook for PAYMENT.COMPLETE event (send-side)", async () => {
    const sendBody = JSON.stringify({
      id: "send-id",
      status: "complete",
      apiKey: "apikey",
      event: "PAYMENT.COMPLETE",
      executedAt: "2026-05-18T20:00:00.000Z",
    });
    const signature = await signWebhook(sendBody, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: sendBody,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts an empty body if signature matches (degenerate case)", async () => {
    const signature = await signWebhook("", SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: "",
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing signature header", async () => {
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: "",
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_header");
  });

  it("rejects missing webhook secret", async () => {
    const signature = await signWebhook(BODY, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      webhookSecret: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_secret");
  });

  it("rejects wrong secret (signature mismatch)", async () => {
    const signature = await signWebhook(BODY, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      webhookSecret: "wrong-secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("signature_mismatch");
      expect(result.detail?.receivedPrefix).toBeDefined();
    }
  });

  it("rejects modified body (signature won't match)", async () => {
    const signature = await signWebhook(BODY, SECRET);
    const tamperedBody = BODY.replace('"complete"', '"failed"');
    const result = await verifyYcWebhookSignature({
      rawBody: tamperedBody,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects signature with different length (truncated, etc.)", async () => {
    // Truncate the signature — should fast-path to signature_length_mismatch
    const signature = (await signWebhook(BODY, SECRET)).slice(0, 20);
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_length_mismatch");
  });

  it("trims whitespace around signature header value", async () => {
    // Some HTTP frameworks/proxies pad header values with whitespace;
    // the verifier should tolerate that without failing length check.
    const signature = await signWebhook(BODY, SECRET);
    const result = await verifyYcWebhookSignature({
      rawBody: BODY,
      signatureHeader: `  ${signature}  `,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("is byte-exact on rawBody — JSON.parse + re-stringify breaks verify (as expected)", async () => {
    // This is a safety check: callers MUST pass the raw body bytes,
    // not a re-serialised JSON. Whitespace and key-order differences
    // change the signature. Test that we correctly reject the
    // re-serialised version.
    const signature = await signWebhook(BODY, SECRET);
    const reSerialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(reSerialised).not.toBe(BODY); // whitespace differs
    const result = await verifyYcWebhookSignature({
      rawBody: reSerialised,
      signatureHeader: signature,
      webhookSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });
});
