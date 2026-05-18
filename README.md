# @kwiikpay/yellowcard-adapter

Shared Yellowcard API adapter for KwiikPay's two product surfaces:

- **B2C retail** — [`kwiikpay/website-kp`](https://github.com/kwiikpay/website-kp)
- **B2B business** — [`kwiikpay/kwiikpay-dashboard`](https://github.com/kwiikpay/kwiikpay-dashboard)

Both products share one Yellowcard merchant account but maintain
separate customer bases, ledgers, KYC pipelines, and deploys. This
repo owns the YC API contract (HMAC signing, payload shapes, webhook
parsing) so that bug fixes propagate via a single tag bump instead of
copy-paste between repos.

**Distributed via direct GitHub raw URL imports — no npm registry,
no GitHub Packages, no per-install cost.**

---

## Quick start (Deno / Supabase Edge Functions)

Import directly from a tagged release in `raw.githubusercontent.com`:

```ts
// supabase/functions/yellowcard-execute-send/index.ts
import {
  ycFetch,
  parseYcWebhookPayload,
  classifyYcStatus,
  verifyYcWebhookSignature,
  buildOutboundPaymentPayload,
  normalizeKycFromUserMetadata,
  YC_SANDBOX_URL,
} from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.1.1/src/index.ts";
```

**Why direct URL imports?**
- Zero registry cost
- Tag-pinned: each import points at an immutable commit
- Native to Deno (the runtime for both projects' Edge Functions)
- No `.npmrc`, no auth tokens to maintain in `node_modules`-land

**Authenticating private-repo reads.** Because this repo is private,
Deno needs a GitHub token to fetch raw URLs. Set it as a Supabase
secret:

```bash
./supabase.exe secrets set --project-ref <ref> GITHUB_TOKEN=ghp_xxxxx
```

The token needs `repo` scope (or `read:packages` if the repo is ever
flipped to use a registry). Deno automatically reads `GITHUB_TOKEN`
from env for `https://raw.githubusercontent.com/...` fetches.

### Upgrading versions

Change the version in the URL:

```ts
// Was:
import { ycFetch } from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.1.1/src/index.ts";

// Becomes:
import { ycFetch } from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.2.0/src/index.ts";
```

Each consuming EF picks its own version. Roll forward gradually,
test in sandbox, deploy. No `npm update` step.

---

## Quick start (Node tooling, if you have any)

For Node-based consumers (admin scripts, recon CLIs, etc.), install
from git directly — no registry:

```bash
npm install git+https://github.com/kwiikpay/yellowcard-adapter.git#v0.1.1
```

Then import normally:

```ts
import { ycFetch } from "@kwiikpay/yellowcard-adapter";
```

`npm` clones the tag, builds locally via `npm run build`, and drops
the compiled output in `node_modules`. No registry round-trip.

---

## API surface

### Client

```ts
ycFetch(cfg: YcClientConfig, opts: YcRequestOptions): Promise<YcResponse>
hmacSign(secretKey: string, message: string): Promise<string>           // exported for tests
buildMessage(date, path, method, body?): Promise<string>                 // exported for tests
```

### Payload builders (Tim's 10 bug fixes embedded)

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
`YcResponse`.

---

## Sequence-ID prefixes

The package is agnostic to which prefix a consuming project uses:

| Project | Outbound | Inbound |
|---|---|---|
| `website-kp` (retail) | `kp-{uuid}` | `kp-in-{uuid}` |
| `kwiikpay-dashboard` (business) | `kpb-{uuid}` | `kpb-in-{uuid}` |

The `-in-` segment is what `parseYcWebhookPayload` uses to derive
`kind: "inbound" | "outbound"`.

---

## Webhook signature verification

`verifyYcWebhookSignature` is a **placeholder** in v0.1.x. The
`kwiikpay-dashboard` project has a working implementation in
`supabase/functions/_shared/yellowcard-helpers.ts`
(HMAC-SHA256, 5-min replay window, timing-safe compare) that should
be ported into this package in v0.2.0.

Until then, consumers using `verifyYcWebhookSignature` directly from
this package should adopt the compensating-controls posture
documented in `kwiikpay-dashboard`'s `CLAUDE.md` under *"Known
security gap: Hercle webhook signature verification"*:

1. **Idempotency** — unique constraint on `yellowcard_webhook_events.yc_event_id`
2. **Defensive handler structure** — structure-validate every field
   before any DB write
3. **Always log `signature_ok: false`** — operational visibility
4. **Capture `raw_body_text`** — exact-bytes audit trail

When v0.2.0 ports the dashboard's real implementation in, consumers
just bump the URL version and the function starts returning real
verifications.

---

## Cutting a release

1. Make the changes on `main`
2. Bump `version` in `package.json` + add a section to `CHANGELOG.md`
3. Commit
4. Tag the release: `git tag -a v0.2.0 -m "v0.2.0 — <what>"`
5. Push: `git push origin main v0.2.0`

That's it. There's no registry to publish to. CI runs typecheck +
tests on every push to confirm the tagged commit is sound; consumers
then bump their import URLs from `v0.1.1` to `v0.2.0`.

---

## Development

```bash
npm install
npm test          # vitest run
npm run lint      # tsc --noEmit
npm run build     # tsc → dist/ (sanity check; consumers don't need this)
```

Tests live in `test/`. The `dist/` folder is not committed — Deno
consumers import `.ts` source directly via raw URL.

---

## License

Internal proprietary code for KwiikPay. Not licensed for external use.
