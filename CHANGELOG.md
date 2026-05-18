# Changelog

All notable changes to `@kwiikpay/yellowcard-adapter`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-05-18

### Fixed — HMAC canonical signing brought into compliance with YC docs

This release fixes two latent signing bugs in the canonical-string
builder that produced wrong signatures for every GET/DELETE request.
v0.2.x callers hitting YC sandbox would have received
`401 AuthenticationError: invalid apiKey signature combination`
on every read; the bug only escaped notice because we were also
running against IP-allowlisted production where YC checks IP BEFORE
signature, so all errors collapsed to `IPMismatchError` regardless of
whether the signature was valid.

#### Bug A: bodyHash appended for GET/DELETE (should be POST/PUT only)

YC's docs are explicit: "For POST and PUT requests a base64 encoded
sha256 hash of the request body" goes into the canonical. For GET,
DELETE, HEAD, OPTIONS — no bodyHash component.

v0.2.x always appended `base64(sha256(body ?? ""))` regardless of
method, producing a 4-segment canonical when YC expected 3 segments
for body-less methods.

**v0.3.0 behavior**:
```
GET    /business/channels  →  <timestamp>/business/channelsGET
POST   /business/payments  →  <timestamp>/business/paymentsPOST<base64(sha256(body))>
PUT    /business/orders/x  →  <timestamp>/business/orders/xPUT<base64(sha256(body))>
DELETE /business/orders/x  →  <timestamp>/business/orders/xDELETE
```

#### Bug B: ambiguity over whether canonical path includes `/business/`

v0.2.x exposed `stripBusinessPrefix` as a config toggle with no
documented default behavior — the comment in `client.ts` said the
docs "aren't fully explicit." Sandbox verification on 2026-05-18
confirmed: YC's canonical path **includes** the `/business/` prefix
(matches their docs example `/business/payments/accept`).

**v0.3.0 behavior**: default `stripBusinessPrefix: false` is now
documented as canonical. Toggle retained for forward-compat
diagnostics, but production deploys should never flip it.

### Verified

- New `test/client.test.ts` asserts the exact canonical strings YC
  expects for GET / DELETE / HEAD / POST / PUT
- Tested end-to-end against YC sandbox `https://sandbox.api.yellowcard.io/business/channels`:
  - v0.2.x scheme: `401 AuthenticationError: invalid apiKey signature combination`
  - v0.3.0 scheme: `200 OK` with full channel list

### Migration

Consumers bump their import URL from `v0.2.1/dist/index.js` to
`v0.3.0/dist/index.js`. No API surface changes — only the canonical
string emitted internally. Webhook verification benefits automatically
(it calls the same `buildMessage`).

## [0.2.1] — 2026-05-18

### Fixed

- **Deno deploy bundler compatibility.** Supabase's EF deploy bundler
  doesn't resolve `.js` import extensions against `.ts` source files
  the way Deno's runtime does. Source files use `import "./types.js"`
  (TypeScript NodeNext convention) which fails at deploy time when
  bundling raw `src/*.ts` from GitHub. The Supabase deployer follows
  the literal URL `https://raw.../v0.2.0/src/types.js` and 404s.
- **Fix**: commit `dist/` (compiled `.js` output) to the repo so
  consumers import from `dist/index.js` where the `.js` files exist
  alongside their `.d.ts` declarations.
- **Migration**: change consumer import URLs from
  `.../v0.2.0/src/index.ts` to `.../v0.2.1/dist/index.js`. No code
  changes in consumers beyond the URL bump.

### Changed

- `.gitignore` updated: `dist/` is now tracked (was ignored).
  Comments inline explain why.

## [0.2.0] — 2026-05-18

### Added — transport feature parity with `kwiikpay-dashboard/_shared/yellowcard-helpers.ts`

The kwiikpay-dashboard project independently built a richer YC helpers
module than what website-kp had. v0.2.0 ports that surface into the
package so both projects can consume one canonical implementation:

- **`src/env.ts`** — runtime-agnostic env-var resolution (Deno + Node):
  - `readEnvVar(name)` — portable replacement for `Deno.env.get` / `process.env`
  - `pickEnvCandidate(candidates)` — first-non-empty resolution from a candidate list
  - `getYellowcardCredentials({ apiKeyCandidates?, apiSecretCandidates? })`
    — returns `{ apiKey, apiSecret, apiKeyEnvVar, apiSecretEnvVar }` so
    diagnostics can show *which* env var was hit without leaking values
  - `getYellowcardWebhookSecret(candidates?)` — separate webhook-secret resolver
  - `getYellowcardBaseUrl(env)` — environment-aware base URL with optional
    `YELLOWCARD_BASE_URL` override (for Fly.io egress relay routing)
  - `getYellowcardRelaySecret()` — reads `YELLOWCARD_RELAY_SECRET`
  - Exported constants: `DEFAULT_API_KEY_CANDIDATES`,
    `DEFAULT_API_SECRET_CANDIDATES`, `DEFAULT_WEBHOOK_SECRET_CANDIDATES`

- **`YcClientConfig.stripBusinessPrefix`** — toggle the `/business` prefix
  stripping in the HMAC canonical path. YC's docs example suggests this
  is required but isn't fully explicit; the dashboard's `yellowcard-test`
  EF toggles this to confirm per deploy. Default `false`.

- **`YcClientConfig.relaySecret`** — when set, `ycFetch` attaches
  `X-Relay-Auth: <value>` to every request for Fly.io egress-relay routing.

- **`maybeStripBusinessPrefix(path, strip)`** — exported helper used by
  both `client.ts` and `webhook/verify.ts` so request signing and
  webhook verification share canonical-path logic.

- **`sha256Base64(input)`** — exported building block (was internal in v0.1.x).

### Changed — real webhook signature verification

- **`verifyYcWebhookSignature(opts)`** — full HMAC-SHA256 implementation
  ported from `kwiikpay-dashboard/_shared/yellowcard-helpers.ts`
  (translated from `node:crypto` to `crypto.subtle` for portability):
  - Parses `YcHmacV1 <apiKey>:<signature>` form of `Authorization` header
  - 5-minute default replay window (configurable via `allowSkewSec`)
  - Constant-time signature comparison (no timing leak)
  - Returns structured `{ ok: true } | { ok: false, reason, detail? }`
    with reasons `"missing_headers" | "malformed_authorization" |
    "malformed_timestamp" | "timestamp_drift" |
    "signature_length_mismatch" | "signature_mismatch"`
  - Accepts `path`, `method`, `stripBusinessPrefix` options to match
    however the consuming EF was deployed

- **API options renamed** for clarity:
  - `signature: string` → `authorizationHeader: string` (now expects the
    full `YcHmacV1 ...` form, not just the signature)
  - `secretKey` → `webhookSecret` (emphasises this is the *webhook*
    secret, distinct from the request-signing API secret)

  **Breaking** if you called `verifyYcWebhookSignature` directly in v0.1.x
  — but in v0.1.x it was a no-op placeholder, so no consumer should
  have a real integration to break.

### Tests

- **+28 new tests** (104 total, up from 76):
  - `env.test.ts` — 18 tests for candidate resolution, base URL override,
    relay secret, edge cases (empty strings, missing vars)
  - `webhook/verify.test.ts` — 10 tests covering the happy path + every
    failure-mode reason + custom skew window + stripBusinessPrefix
    + body tampering rejection

### Consumer impact

After bumping to v0.2.0, `kwiikpay-dashboard` can delete most of
`supabase/functions/_shared/yellowcard-helpers.ts` (~300 lines) and
import the same surface from
`https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.2.0/src/index.ts`.

The dashboard's `yellowcard-test` EF's `stripBusinessPrefix` toggle
still works — the option is now on `YcClientConfig` instead of inline.

## [0.1.2] — 2026-05-18

### Changed

- **Distribution model: removed GitHub Packages publish.** Both
  consumers are Deno (Supabase Edge Functions); Deno can import
  directly from `https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/<tag>/src/index.ts`
  with a `GITHUB_TOKEN` for private-repo auth. No registry, no
  per-package cost. Consumers pin to a tag in the import URL.
- **Deleted `.github/workflows/publish.yml`** — no longer needed.
- **Deleted repo `.npmrc`** (already done in v0.1.1; this just
  finalises the no-registry posture).
- **README rewritten** to show the Deno raw-URL import pattern as the
  canonical consumption method; `npm install git+...` retained as a
  fallback for any Node tooling.
- **`examples/deno-edge-function.ts` updated** to use the raw-URL
  import.

### Not changed

- All API surface unchanged. Existing imports still resolve.
- `package.json` retained for `npm test` / `npm run build` /
  `npm run lint` tooling, but the `publishConfig` block is now
  vestigial (no `npm publish` from this repo).

## [0.1.1] — 2026-05-18

### Fixed

- **CI publish auth.** Removed the repo-root `.npmrc` that conflicted
  with `setup-node`'s auto-generated registry config in the
  `Publish to GitHub Packages` workflow. v0.1.0 was tagged but the
  publish step 401'd because the repo `.npmrc` referenced
  `${GITHUB_TOKEN}` while `setup-node` writes `${NODE_AUTH_TOKEN}`,
  causing precedence collisions. Consumers should now configure their
  own `.npmrc` per the updated README — this package no longer ships
  one.

## [0.1.0] — 2026-05-18 (tagged but unpublished due to CI auth bug — see 0.1.1)

### Added

Initial extraction from `kwiikpay/website-kp:thor/supabase/functions/yellowcard-*`.

- **Client** (`ycFetch`, `hmacSign`, `buildMessage`) — HMAC-SHA256 signed
  request transport against YC's `/business` API. Extracted identically
  from the ~80-line block duplicated across `yellowcard-outbound-create`,
  `yellowcard-inbound-create`, and `yellowcard-rates`.
- **Outbound payload builder** (`buildOutboundPaymentPayload`) —
  encapsulates Tim's 10 recent bug fixes (commits between c49369e and
  fc50ad8, 2026-04-25 → 2026-05-18):
  - `localAmount` (not `amount`) — YC defaults `amount` to USD interpretation
  - `email` in `sender` — re-applied after Bolt revert `a287061`
  - `customerType: "institution"` for business merchants
  - KYC fields (`firstName`/`lastName`/`phone`/`dateOfBirth`) from `user.user_metadata`
  - Top-level `customer` block — makes "Sender Name" visible in YC dashboard
  - `accountType` derivation from beneficiary shape (momo vs bank)
- **Inbound payload builder** (`buildInboundCollectionPayload`) —
  including the SA-EFT `redirectUrl` requirement and the
  "KYC-over-form-input" preference (commit fc50ad8).
- **Webhook helpers**:
  - `parseYcWebhookPayload(raw)` — disambiguates `id` / `collectionId` /
    `paymentId`, normalises event-name fields, derives flow direction
    from `sequenceId` prefix.
  - `classifyYcStatus(status, flow)` — maps YC's many status strings
    to the 5-bucket lifecycle (`completed` / `failed` / `received` /
    `sent` / `tick`).
  - `verifyYcWebhookSignature(opts)` — **PLACEHOLDER**. Returns `false`
    (or throws with `strict: true`) until YC documents the canonical
    message format. See `src/webhook/verify.ts` for the
    compensating-controls posture consumers should adopt in the
    meantime.
- **KYC helpers**:
  - `normalizeKycFromUserMetadata(meta, email)` — maps Supabase
    `auth.users.user_metadata` snake_case → package camelCase.
  - `deriveCustomerName(kyc, fallback?)` — extracts display name with
    the fullName → firstName+lastName → email → fallback preference.
- **Constants** — `YC_PRODUCTION_URL`, `YC_SANDBOX_URL`.
- **Types** — `YcKycFields`, `YcBeneficiary`, `YcBusinessIdentity`,
  `YcWebhookEvent`, `YcStatusClass`, `YcFlow`, `YcClientConfig`,
  `YcRequestOptions`, `YcResponse`.

### Tests

- 13 fixture tests for outbound payload (one per bug-fix commit)
- 9 fixture tests for inbound payload (KYC-over-form, redirectUrl, etc.)
- 14 tests for `classifyYcStatus` (all status strings + case insensitivity + flow-dependent mapping)
- 10 tests for `parseYcWebhookPayload` (all ID-field variants, sequence-prefix kind derivation)
- 11 tests for KYC helpers

### Not yet included

- Webhook signature verification (placeholder; pending YC docs)
- Rates / channels / networks sync helpers (kept in EF — they're
  Supabase-DB-coupled and don't carry the same bug-fix risk as payloads)
