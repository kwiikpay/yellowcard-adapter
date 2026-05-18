import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  pickEnvCandidate,
  getYellowcardCredentials,
  getYellowcardWebhookSecret,
  getYellowcardBaseUrl,
  getYellowcardRelaySecret,
  readEnvVar,
  DEFAULT_API_KEY_CANDIDATES,
  DEFAULT_API_SECRET_CANDIDATES,
  DEFAULT_WEBHOOK_SECRET_CANDIDATES,
} from "../src/env.js";

// ── Test env helpers ────────────────────────────────────────────────
// vitest runs under Node; `process.env` is the live env. We stash and
// restore around each test so we don't pollute the test runner's env.

const TRACKED_VARS = [
  ...DEFAULT_API_KEY_CANDIDATES,
  ...DEFAULT_API_SECRET_CANDIDATES,
  ...DEFAULT_WEBHOOK_SECRET_CANDIDATES,
  "YELLOWCARD_BASE_URL",
  "YELLOWCARD_RELAY_SECRET",
  "CUSTOM_KEY_NAME",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of TRACKED_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of TRACKED_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── readEnvVar ──────────────────────────────────────────────────────

describe("readEnvVar", () => {
  it("returns value when env var is set", () => {
    process.env.CUSTOM_KEY_NAME = "hello";
    expect(readEnvVar("CUSTOM_KEY_NAME")).toBe("hello");
  });

  it("returns undefined when env var is unset", () => {
    expect(readEnvVar("CUSTOM_KEY_NAME")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    process.env.CUSTOM_KEY_NAME = "";
    expect(readEnvVar("CUSTOM_KEY_NAME")).toBeUndefined();
  });
});

// ── pickEnvCandidate ────────────────────────────────────────────────

describe("pickEnvCandidate", () => {
  it("picks the first set candidate", () => {
    process.env.YELLOWCARD_API_KEY_PROD = "from-prod";
    const result = pickEnvCandidate([
      "YELLOWCARD_API_KEY",
      "YELLOWCARD_API_KEY_SBX",
      "YELLOWCARD_API_KEY_PROD",
    ]);
    expect(result.value).toBe("from-prod");
    expect(result.envVar).toBe("YELLOWCARD_API_KEY_PROD");
  });

  it("prefers earlier candidates", () => {
    process.env.YELLOWCARD_API_KEY = "from-canonical";
    process.env.YELLOWCARD_API_KEY_PROD = "from-prod";
    const result = pickEnvCandidate([
      "YELLOWCARD_API_KEY",
      "YELLOWCARD_API_KEY_PROD",
    ]);
    expect(result.value).toBe("from-canonical");
    expect(result.envVar).toBe("YELLOWCARD_API_KEY");
  });

  it("returns null when all candidates are unset", () => {
    const result = pickEnvCandidate([
      "YELLOWCARD_API_KEY",
      "YELLOWCARD_API_KEY_SBX",
    ]);
    expect(result.value).toBeNull();
    expect(result.envVar).toBeNull();
  });
});

// ── getYellowcardCredentials ────────────────────────────────────────

describe("getYellowcardCredentials", () => {
  it("resolves key + secret with provenance", () => {
    process.env.YELLOWCARD_API_KEY = "key-x";
    process.env.YELLOWCARD_API_SECRET_PROD = "secret-y";
    const c = getYellowcardCredentials();
    expect(c.apiKey).toBe("key-x");
    expect(c.apiKeyEnvVar).toBe("YELLOWCARD_API_KEY");
    expect(c.apiSecret).toBe("secret-y");
    expect(c.apiSecretEnvVar).toBe("YELLOWCARD_API_SECRET_PROD");
  });

  it("returns nulls when nothing is set", () => {
    const c = getYellowcardCredentials();
    expect(c.apiKey).toBeNull();
    expect(c.apiSecret).toBeNull();
    expect(c.apiKeyEnvVar).toBeNull();
    expect(c.apiSecretEnvVar).toBeNull();
  });

  it("accepts custom candidate lists", () => {
    process.env.CUSTOM_KEY_NAME = "custom-val";
    const c = getYellowcardCredentials({
      apiKeyCandidates: ["CUSTOM_KEY_NAME"],
      apiSecretCandidates: ["NEVER_SET"],
    });
    expect(c.apiKey).toBe("custom-val");
    expect(c.apiSecret).toBeNull();
  });
});

// ── getYellowcardWebhookSecret ──────────────────────────────────────

describe("getYellowcardWebhookSecret", () => {
  it("resolves from default candidates", () => {
    process.env.YELLOWCARD_WEBHOOK_SECRET = "wh-secret";
    expect(getYellowcardWebhookSecret()).toBe("wh-secret");
  });

  it("returns null when unset", () => {
    expect(getYellowcardWebhookSecret()).toBeNull();
  });

  it("accepts a custom candidate list", () => {
    process.env.CUSTOM_KEY_NAME = "abc";
    expect(getYellowcardWebhookSecret(["CUSTOM_KEY_NAME"])).toBe("abc");
  });
});

// ── getYellowcardBaseUrl ────────────────────────────────────────────

describe("getYellowcardBaseUrl", () => {
  it("returns sandbox URL by default for 'sandbox'", () => {
    expect(getYellowcardBaseUrl("sandbox")).toBe(
      "https://sandbox.api.yellowcard.io/business",
    );
  });

  it("returns production URL for 'production'", () => {
    expect(getYellowcardBaseUrl("production")).toBe(
      "https://api.yellowcard.io/business",
    );
  });

  it("respects YELLOWCARD_BASE_URL override", () => {
    process.env.YELLOWCARD_BASE_URL = "https://yc-egress.fly.dev";
    expect(getYellowcardBaseUrl("production")).toBe("https://yc-egress.fly.dev");
  });

  it("strips trailing slash from override", () => {
    process.env.YELLOWCARD_BASE_URL = "https://yc-egress.fly.dev/";
    expect(getYellowcardBaseUrl("production")).toBe("https://yc-egress.fly.dev");
  });
});

// ── getYellowcardRelaySecret ────────────────────────────────────────

describe("getYellowcardRelaySecret", () => {
  it("returns the relay secret when set", () => {
    process.env.YELLOWCARD_RELAY_SECRET = "relay-xyz";
    expect(getYellowcardRelaySecret()).toBe("relay-xyz");
  });

  it("returns null when unset", () => {
    expect(getYellowcardRelaySecret()).toBeNull();
  });
});
