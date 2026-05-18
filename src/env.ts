/**
 * Environment variable resolution + base URL helpers.
 *
 * Ported from `kwiikpay-dashboard/supabase/functions/_shared/yellowcard-helpers.ts`
 * to give all consumers the same credential-discovery surface.
 *
 * Why multi-candidate resolution: at KwiikPay, secrets get renamed
 * over time as we rotate between sandbox + prod and consolidate
 * naming conventions. Hardcoding a single name (e.g.,
 * `YELLOWCARD_API_KEY2` like website-kp does) means a rename breaks
 * every consumer simultaneously. The candidate-list pattern lets
 * different deploys/environments pick whichever name they have set
 * without a code change.
 *
 * Portability: this module reads env vars via globalThis to work in
 * both Deno (Supabase EFs) and Node (admin scripts / recon CLIs).
 * No runtime detection branches required at the API boundary.
 */

// ─── Default candidate lists ─────────────────────────────────────────

/**
 * Default env var names checked, in order, for the YC API key.
 * First non-empty value wins.
 */
export const DEFAULT_API_KEY_CANDIDATES = [
  "YELLOWCARD_API_KEY",
  "YELLOWCARD_API_KEY_SBX",
  "YELLOWCARD_API_KEY_PROD",
  "YC_API_KEY",
] as const;

/**
 * Default env var names checked, in order, for the YC API secret.
 */
export const DEFAULT_API_SECRET_CANDIDATES = [
  "YELLOWCARD_API_SECRET",
  "YELLOWCARD_API_SECRET_SBX",
  "YELLOWCARD_API_SECRET_PROD",
  "YC_API_SECRET",
] as const;

/**
 * Default env var names checked, in order, for the YC webhook secret.
 *
 * v0.4.0 correction: per YC docs at
 * https://docs.yellowcard.engineering/docs/webhooks, the webhook
 * signature uses "the secretkey of the apiKey the initial request was
 * made with" — i.e. the SAME apiSecret as outbound signing, NOT a
 * separate dedicated webhook secret.
 *
 * These dedicated `YELLOWCARD_WEBHOOK_SECRET*` candidates remain for
 * forward-compatibility in case YC's dashboard exposes a separate
 * webhook signing key per app, but `getYellowcardWebhookSecret()` now
 * falls back to the apiSecret when no dedicated webhook secret is set.
 * This matches YC's documented contract for the common single-key case.
 */
export const DEFAULT_WEBHOOK_SECRET_CANDIDATES = [
  "YELLOWCARD_WEBHOOK_SECRET",
  "YELLOWCARD_WEBHOOK_SECRET_SBX",
  "YELLOWCARD_WEBHOOK_SECRET_PROD",
  "YC_WEBHOOK_SECRET",
] as const;

// ─── Portable env reader ─────────────────────────────────────────────

/**
 * Read an environment variable in a runtime-agnostic way.
 *
 * Works in Deno (via `Deno.env.get`) and Node (via `process.env`).
 * Returns `undefined` if the variable is unset or empty.
 *
 * Exported so consumers in unusual runtimes can override the env
 * source if needed (e.g., reading from a Vault-fetched secret bag).
 */
export function readEnvVar(name: string): string | undefined {
  // Deno path
  const denoGlobal = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  if (denoGlobal?.env?.get) {
    const v = denoGlobal.env.get(name);
    if (v) return v;
  }
  // Node path
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env) {
    const v = proc.env[name];
    if (v) return v;
  }
  return undefined;
}

// ─── Candidate-list resolution ───────────────────────────────────────

/**
 * Pick the first non-empty environment variable from a list of names.
 *
 * @param candidates Ordered list of env var names to check
 * @returns `{ value, envVar }` of the winning name, or `{ value: null, envVar: null }` if all empty
 */
export function pickEnvCandidate(
  candidates: readonly string[],
): { value: string | null; envVar: string | null } {
  for (const name of candidates) {
    const v = readEnvVar(name);
    if (v) return { value: v, envVar: name };
  }
  return { value: null, envVar: null };
}

/**
 * Resolved YC credentials with provenance.
 *
 * `envVar` fields name which environment variable was actually used —
 * useful for diagnostics ("which key are we hitting YC with?") without
 * leaking the secret itself into logs.
 */
export interface ResolvedYellowcardCredentials {
  apiKey: string | null;
  apiSecret: string | null;
  apiKeyEnvVar: string | null;
  apiSecretEnvVar: string | null;
}

/**
 * Resolve YC API credentials from the environment.
 *
 * @param options Override candidate lists if your deploy uses different names.
 *                Pass undefined to use {@link DEFAULT_API_KEY_CANDIDATES} /
 *                {@link DEFAULT_API_SECRET_CANDIDATES}.
 */
export function getYellowcardCredentials(options?: {
  apiKeyCandidates?: readonly string[];
  apiSecretCandidates?: readonly string[];
}): ResolvedYellowcardCredentials {
  const key = pickEnvCandidate(
    options?.apiKeyCandidates ?? DEFAULT_API_KEY_CANDIDATES,
  );
  const secret = pickEnvCandidate(
    options?.apiSecretCandidates ?? DEFAULT_API_SECRET_CANDIDATES,
  );
  return {
    apiKey: key.value,
    apiSecret: secret.value,
    apiKeyEnvVar: key.envVar,
    apiSecretEnvVar: secret.envVar,
  };
}

/**
 * Resolve the YC webhook signing secret from the environment.
 *
 * Per YC docs, the webhook signature uses the SAME apiSecret as
 * outbound signing. v0.4.0 behavior:
 *   1. Check the dedicated `YELLOWCARD_WEBHOOK_SECRET*` candidates first
 *      (forward-compat — in case YC ever issues a separate webhook key)
 *   2. Fall back to the apiSecret from {@link getYellowcardCredentials}
 *      if no dedicated webhook secret is set
 *
 * Returns `null` only if BOTH the webhook-secret candidates AND the
 * apiSecret candidates are unset.
 */
export function getYellowcardWebhookSecret(
  candidates: readonly string[] = DEFAULT_WEBHOOK_SECRET_CANDIDATES,
): string | null {
  const dedicated = pickEnvCandidate(candidates).value;
  if (dedicated) return dedicated;
  // Fall back to apiSecret per YC docs
  const creds = getYellowcardCredentials();
  return creds.apiSecret;
}

// ─── Base URL ────────────────────────────────────────────────────────

import { YC_PRODUCTION_URL, YC_SANDBOX_URL } from "./constants.js";

/**
 * Resolve the YC base URL for the given environment.
 *
 * Order of preference:
 *   1. `YELLOWCARD_BASE_URL` env var — when set, used verbatim (with
 *      trailing slash stripped). Lets a deploy route through a
 *      private proxy or egress relay (e.g., Fly.io IP-allowlisted
 *      hop for prod traffic).
 *   2. Production constant for `env: "production"`
 *   3. Sandbox constant otherwise
 *
 * @example
 *   const baseUrl = getYellowcardBaseUrl("sandbox");
 *   // → "https://sandbox.api.yellowcard.io/business"
 *
 *   // With YELLOWCARD_BASE_URL=https://yc-egress.fly.dev set:
 *   const baseUrl = getYellowcardBaseUrl("production");
 *   // → "https://yc-egress.fly.dev"
 */
export function getYellowcardBaseUrl(env: "sandbox" | "production"): string {
  const override = readEnvVar("YELLOWCARD_BASE_URL");
  if (override) return override.replace(/\/$/, "");
  return env === "production" ? YC_PRODUCTION_URL : YC_SANDBOX_URL;
}

/**
 * Read the optional Fly.io egress-relay shared secret.
 *
 * When set, the YC client attaches `X-Relay-Auth: <value>` to every
 * request. The relay gates inbound on this header. Sandbox calls go
 * direct to YC and don't need (or accept) the header — only set this
 * for production deploys routing through the relay.
 */
export function getYellowcardRelaySecret(): string | null {
  return readEnvVar("YELLOWCARD_RELAY_SECRET") ?? null;
}
