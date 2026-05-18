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
  getYellowcardCredentials,
  getYellowcardWebhookSecret,
  getYellowcardBaseUrl,
  getYellowcardRelaySecret,
  YC_SANDBOX_URL,
} from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.2.1/dist/index.js";
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
import { ycFetch } from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.2.1/dist/index.js";
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

`verifyYcWebhookSignature` is **fully implemented in v0.2.0+** (ported
from `kwiikpay-dashboard/_shared/yellowcard-helpers.ts`):

- YcHmacV1 HMAC-SHA256 verification
- 5-minute default replay window (configurable via `allowSkewSec`)
- Constant-time signature comparison
- Returns `{ ok: true }` or
  `{ ok: false, reason, detail? }` with one of
  `missing_headers | malformed_authorization | malformed_timestamp |
  timestamp_drift | signature_length_mismatch | signature_mismatch`

Example:

```ts
import { verifyYcWebhookSignature } from "https://raw.githubusercontent.com/kwiikpay/yellowcard-adapter/v0.2.1/dist/index.js";

const rawBody = await req.text();
const result = await verifyYcWebhookSignature({
  rawBody,
  authorizationHeader: req.headers.get("Authorization") ?? "",
  timestamp: req.headers.get("X-YC-Timestamp") ?? "",
  webhookSecret: Deno.env.get("YELLOWCARD_WEBHOOK_SECRET")!,
  path: "/business/webhook",
});

if (!result.ok) {
  console.warn("[yc-webhook] signature_ok=false", result);
  // Apply compensating controls: idempotency on yc_event_id,
  // structure validation before any DB write, etc.
}
```

If YC ever publishes a different canonical message format, swap the
implementation behind `verifyYcWebhookSignature` — the public surface
stays the same.

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
