# Changelog

All notable changes to `@kwiikpay/yellowcard-adapter`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
