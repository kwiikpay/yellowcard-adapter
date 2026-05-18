import { describe, it, expect } from "vitest";
import { verifyYcWebhookSignature } from "../../src/webhook/verify.js";
import { buildMessage, hmacSign } from "../../src/client.js";

// Helper: produce a valid signed webhook for a given canonical
// timestamp/path/method/body/secret so we can test the happy path
// and then mutate inputs to test rejection paths.
async function sign(opts: {
  timestamp: string;
  path: string;
  method: string;
  body: string;
  secret: string;
  apiKey?: string;
}) {
  const canonical = await buildMessage(
    opts.timestamp,
    opts.path,
    opts.method,
    opts.body,
  );
  const signature = await hmacSign(opts.secret, canonical);
  return {
    authorizationHeader: `YcHmacV1 ${opts.apiKey ?? "test-key"}:${signature}`,
    timestamp: opts.timestamp,
  };
}

describe("verifyYcWebhookSignature", () => {
  it("accepts a correctly-signed webhook", async () => {
    const now = new Date().toISOString();
    const { authorizationHeader, timestamp } = await sign({
      timestamp: now,
      path: "/webhook",
      method: "POST",
      body: '{"event":"payment.completed","data":{"id":"x"}}',
      secret: "secret-1",
    });
    const result = await verifyYcWebhookSignature({
      rawBody: '{"event":"payment.completed","data":{"id":"x"}}',
      authorizationHeader,
      timestamp,
      webhookSecret: "secret-1",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing headers", async () => {
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader: "",
      timestamp: "",
      webhookSecret: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_headers");
  });

  it("rejects malformed Authorization header", async () => {
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader: "Bearer not-the-right-scheme",
      timestamp: new Date().toISOString(),
      webhookSecret: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_authorization");
  });

  it("rejects malformed timestamp", async () => {
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader: "YcHmacV1 key:sig",
      timestamp: "not-a-date",
      webhookSecret: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_timestamp");
  });

  it("rejects stale timestamp beyond skew window", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { authorizationHeader } = await sign({
      timestamp: tenMinAgo,
      path: "/webhook",
      method: "POST",
      body: "{}",
      secret: "secret",
    });
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader,
      timestamp: tenMinAgo,
      webhookSecret: "secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timestamp_drift");
  });

  it("respects custom allowSkewSec", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { authorizationHeader } = await sign({
      timestamp: tenMinAgo,
      path: "/webhook",
      method: "POST",
      body: "{}",
      secret: "secret",
    });
    // With 15-min window, the 10-min-old timestamp is accepted
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader,
      timestamp: tenMinAgo,
      webhookSecret: "secret",
      allowSkewSec: 15 * 60,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects wrong secret (signature mismatch)", async () => {
    const now = new Date().toISOString();
    const { authorizationHeader } = await sign({
      timestamp: now,
      path: "/webhook",
      method: "POST",
      body: "{}",
      secret: "correct-secret",
    });
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader,
      timestamp: now,
      webhookSecret: "wrong-secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects modified body (canonical mismatch)", async () => {
    const now = new Date().toISOString();
    const { authorizationHeader } = await sign({
      timestamp: now,
      path: "/webhook",
      method: "POST",
      body: '{"original":true}',
      secret: "secret",
    });
    const result = await verifyYcWebhookSignature({
      rawBody: '{"tampered":true}',
      authorizationHeader,
      timestamp: now,
      webhookSecret: "secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("uses custom path when supplied", async () => {
    const now = new Date().toISOString();
    const { authorizationHeader } = await sign({
      timestamp: now,
      path: "/business/webhook",
      method: "POST",
      body: "{}",
      secret: "secret",
    });
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader,
      timestamp: now,
      webhookSecret: "secret",
      path: "/business/webhook",
    });
    expect(result.ok).toBe(true);
  });

  it("respects stripBusinessPrefix toggle", async () => {
    const now = new Date().toISOString();
    // Sign with stripped path (e.g., /webhook) since that's the canonical
    const { authorizationHeader } = await sign({
      timestamp: now,
      path: "/webhook",
      method: "POST",
      body: "{}",
      secret: "secret",
    });
    // Verify by passing the full path + telling it to strip
    const result = await verifyYcWebhookSignature({
      rawBody: "{}",
      authorizationHeader,
      timestamp: now,
      webhookSecret: "secret",
      path: "/business/webhook",
      stripBusinessPrefix: true,
    });
    expect(result.ok).toBe(true);
  });
});
