# @kwiikpay/yellowcard-adapter

Shared Yellowcard API adapter for KwiikPay's two product surfaces:

- **B2C retail** — [`kwiikpay/website-kp`](https://github.com/kwiikpay/website-kp)
- **B2B business** — [`kwiikpay/kwiikpay-dashboard`](https://github.com/kwiikpay/kwiikpay-dashboard)

Both products share one Yellowcard merchant account but maintain
separate customer bases, ledgers, KYC pipelines, and deploys. This
package owns the YC API contract (HMAC signing, payload shapes,
webhook parsing) so that bug fixes propagate via `npm update` instead
of being copy-pasted between repos.

---

## Why this exists

Yellowcard's API has several non-obvious quirks that took 10+ commits
to discover and stabilise (sender-name fields, KYC-over-form preference,
`localAmount` vs `amount`, SA-EFT `redirectUrl`, etc.). Those fixes were
all made in the retail project's source. Without a shared package, every
fix would need to be manually re-applied to the business project — and
Bolt's AI has shown a pattern of silently reverting fixes when it
"tidies" adjacent code (see `kwiikpay/website-kp:thor/handoff/99-troubleshooting.md`).

By moving the YC payload-construction and webhook-parsing logic into
this package, the source lives in `node_modules` where Bolt cannot reach
it, and a new YC fix is a single `npm publish` away from both products.

---

## Install

The package is published to GitHub Packages (private registry under
the `@kwiikpay` scope).

### 1. Configure your project's `.npmrc`

Create or extend `.npmrc` in the consuming project's root:

```ini
@kwiikpay:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 2. Provide a token

`GITHUB_TOKEN` must have the `read:packages` scope. Options:

- **Local dev**: export a personal access token (`gh auth token` works if
  the token has `read:packages`)
- **CI**: GitHub Actions auto-injects `GITHUB_TOKEN` with `read:packages`
- **Supabase Edge Functions**: set `GITHUB_TOKEN` as a Supabase secret;
  Deno reads it from env at module-resolve time via the `.npmrc` mechanism

### 3. Install

```bash
npm install @kwiikpay/yellowcard-adapter
```

---

## Quick start

### From a Node / Deno consumer

```ts
import {
  ycFetch,
  buildOutboundPaymentPayload,
  normalizeKycFromUserMetadata,
  YC_SANDBOX_URL,
} from "@kwiikpay/yellowcard-adapter";

// 1. Normalise KYC from your Supabase user metadata
const kyc = normalizeKycFromUserMetadata(user.user_metadata, user.email);

// 2. Build the YC payload (this is where all the bug fixes live)
const payload = buildOutboundPaymentPayload({
  sequenceId: `kpb-${orderId}`, // or `kp-${orderId}` for retail
  beneficiary: {
    channelId: beneficiaryRow.channel_id,
    networkId: beneficiaryRow.network_id,
    accountName: beneficiaryRow.account_name,
    accountNumber: beneficiaryRow.account_number,
    bankCode: beneficiaryRow.bank_code,
    phoneNumber: beneficiaryRow.phone_number,
    recipientEmail: beneficiaryRow.recipient_email,
  },
  destinationCurrency: quote.destination_currency,
  destinationCountry: quote.destination_country,
  localAmount: quote.destination_amount,
  business: { businessName: config.business_name, businessId: config.business_id },
  customer: kyc,
});

// 3. Call YC
const result = await ycFetch(
  {
    baseUrl: config.base_url ?? YC_SANDBOX_URL,
    apiKey: Deno.env.get("YELLOWCARD_API_KEY2")!,
    secretKey: Deno.env.get("YELLOWCARD_SECRET_KEY2")!,
  },
  { path: "/payments", method: "POST", body: payload },
);

if (!result.ok) {
  // Handle failure — refund the ledger debit, etc.
}
```

A complete Supabase Edge Function reference is in
[`examples/deno-edge-function.ts`](./examples/deno-edge-function.ts).

---

## API surface

### Client

```ts
ycFetch(cfg: YcClientConfig, opts: YcRequestOptions): Promise<YcResponse>
hmacSign(secretKey: string, message: string): Promise<string>           // exported for tests
buildMessage(date, path, method, body?): Promise<string>                 // exported for tests
```

### Payload builders (the bug-fix surface)

```ts
buildOutboundPaymentPayload(opts: BuildOutboundPaymentPayloadOptions): Record<string, unknown>
buildInboundCollectionPayload(opts: BuildInboundCollectionPayloadOptions): Record<string, unknown>
```

### KYC helpers

```ts
normalizeKycFromUserMetadata(meta, email): YcKycFields
deriveCustomerName(kyc, fallback?): string
```

### Webhook helpers

```ts
parseYcWebhookPayload(raw: unknown): YcWebhookEvent
classifyYcStatus(ycStatus: string, flow: YcFlow): YcStatusClass
classifyKindFromSequenceId(sequenceId: string): "inbound" | "outbound" | "unknown"
verifyYcWebhookSignature(opts: VerifyYcWebhookSignatureOptions): Promise<boolean>  // PLACEHOLDER in v0.1.x
```

### Constants

```ts
YC_PRODUCTION_URL = "https://api.yellowcard.io/business"
YC_SANDBOX_URL    = "https://sandbox.api.yellowcard.io/business"
```

### Types

`YcKycFields`, `YcBeneficiary`, `YcBusinessIdentity`, `YcWebhookEvent`,
`YcStatusClass`, `YcFlow`, `YcClientConfig`, `YcRequestOptions`,
`YcResponse`. All exported from the package root.

---

## Sequence-ID prefixes

The package is agnostic to which prefix a consuming project uses, but
the conventions are:

| Project | Outbound | Inbound |
|---|---|---|
| `website-kp` (retail) | `kp-{uuid}` | `kp-in-{uuid}` |
| `kwiikpay-dashboard` (business) | `kpb-{uuid}` | `kpb-in-{uuid}` |

The `-in-` segment is what `parseYcWebhookPayload` uses to derive
`kind: "inbound" | "outbound"`. Use any prefix you like; preserve the
`-in-` convention for inbound flows.

---

## Webhook signature verification

`verifyYcWebhookSignature` is a **placeholder** in v0.1.x. YC's
canonical message-format for HMAC signing is not yet documented; Tim has
an open question with YC support to confirm the exact scheme.

Until that's resolved, consumers should adopt the compensating-controls
posture documented in `kwiikpay-dashboard`'s `CLAUDE.md` under
*"Known security gap: Hercle webhook signature verification"*:

1. **Idempotency** — unique constraint on `yellowcard_webhook_events.yc_event_id`
   so duplicate / replayed deliveries are no-ops
2. **Defensive handler structure** — structure-validate every webhook
   field before any DB write or downstream EF dispatch
3. **Always log `signature_ok: false`** — operational visibility into
   the verification gap
4. **Capture `raw_body_text`** — exact-bytes audit trail for any
   future signature investigation

When YC documents the scheme, the implementation will be replaced
behind the same `verifyYcWebhookSignature` signature. Consumers see no
API break.

---

## Cutting a release

Releases are tag-driven via GitHub Actions:

```bash
# 1. Bump version
npm version patch    # or minor / major
# (npm version commits the bump and creates a v<version> tag)

# 2. Push commit + tag
git push origin main --follow-tags
```

The `Publish to GitHub Packages` workflow then:

1. Installs deps (`npm ci`)
2. Typechecks (`tsc --noEmit`)
3. Runs tests (`vitest run`)
4. Builds (`tsc`)
5. Verifies the tag matches `package.json` version
6. Publishes to GitHub Packages

Consumers then `npm update @kwiikpay/yellowcard-adapter` to pull the
new version.

---

## Migration guide (for existing YC EF code)

Projects with inline YC payload-construction code (currently:
`website-kp`, soon: any new project) can adopt the package by:

1. `npm install @kwiikpay/yellowcard-adapter` + configure `.npmrc`
2. Delete the inline `hmacSign` / `buildMessage` / `ycFetch` block
   (~80 lines per EF)
3. Replace the inline `paymentPayload` / `collectionPayload`
   object-literal with a call to `buildOutboundPaymentPayload(...)` /
   `buildInboundCollectionPayload(...)`
4. Replace the webhook EF's inline status-classification logic with
   `classifyYcStatus(ycStatus, flow)`
5. Replace the webhook payload-extraction with `parseYcWebhookPayload(raw)`

A reference EF using the package (showing the resulting ~80-line shape
for `yellowcard-outbound-create`) is in
[`examples/deno-edge-function.ts`](./examples/deno-edge-function.ts).

---

## Development

```bash
npm install
npm test          # vitest run
npm run lint      # tsc --noEmit
npm run build     # tsc → dist/
```

Tests live in `test/`. The build emits ESM to `dist/` with `.d.ts`
type declarations and source maps.

---

## License

Internal proprietary code for KwiikPay. Not licensed for external use.
