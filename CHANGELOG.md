# Changelog

All notable changes to `@kwiikpay/yellowcard-adapter`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-18

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
