# Architecture

How this application is put together, and the reasoning behind each choice. Read this before adding a layer, a dependency, or changing how data moves.

---

## System view

```
Browser
   │  HTTPS
   ▼
Google Cloud Run  (managed, autoscaling, scale-to-zero)
   │
   ├── Next.js standalone server (node server.js, non-root, port 8080)
   │      ├── Server Components  ── render HTML on the server
   │      ├── Route Handlers     ── /api/*
   │      └── Static assets      ── /_next/static, /public
   │
   └── stdout / stderr ──▶ Cloud Logging (structured JSON)
```

There is no database, cache or queue in the template. That is deliberate — see "What is not here" below.

---

## Layers

Data flows **down**; dependencies point **inward**. A layer may import from the layers below it, never above.

```
┌──────────────────────────────────────────────────────────┐
│  app/            routes, layouts, route handlers          │  ← composition
├──────────────────────────────────────────────────────────┤
│  components/     presentation                             │
│  hooks/          client-side interaction                  │
├──────────────────────────────────────────────────────────┤
│  services/       external I/O (network, DB, cloud SDKs)   │  ← side effects
├──────────────────────────────────────────────────────────┤
│  lib/            pure utilities, config, logging          │  ← no side effects
│  types/          shared contracts                         │
└──────────────────────────────────────────────────────────┘
```

**Allowed:** `app/` → `components/` → `lib/`. `app/` → `services/` → `lib/`.
**Forbidden:** `lib/` → `services/`. `components/ui/` → `services/`. Anything → `app/`.

Why it matters: `lib/` stays easy to test because it has no I/O to mock. You can also replace `services/` completely (REST → gRPC, one vendor → another) without changing a single component.

---

## Rendering strategy

Next.js App Router with React Server Components.

| Concern        | Where it runs                                           |
| -------------- | ------------------------------------------------------- |
| Data fetching  | Server Components (`async` functions) or Route Handlers |
| HTML rendering | Server, by default                                      |
| Interactivity  | Client Components — small, leaf-shaped islands          |
| Mutations      | Server Actions or Route Handlers                        |

**Why Server Components by default:**

- The client bundle carries code only for the interactive parts.
- Secrets and API keys never cross the network boundary.
- Data fetching happens with in-datacentre latency, not a round trip from the user's device.

**The cost:** the boundary is real. A Client Component cannot import a Server Component (it can only receive one through `children`), and props that cross the boundary must be serialisable. Design the tree around this limit instead of working against it.

---

## Configuration

Single entry point: `lib/env.ts`. Nothing else in the codebase reads `process.env`.

```
Cloud Run env vars ──┐
Secret Manager ──────┼──▶ process.env ──▶ lib/env.ts ──▶ typed `env` object
Docker build args ───┘                    (validated at
                                           module load)
```

**Why:** an unset variable makes the container refuse to start. Cloud Run reports this as a failed revision and rolls back. The alternative is an `undefined` value that reaches production and corrupts data hours later.

Two timing rules that people often miss:

- `NEXT_PUBLIC_*` is **inlined at build time**. Changing it in Cloud Run does nothing; you must rebuild the image.
- Everything else is read **at runtime**, so a Cloud Run env var update plus a new revision is enough.

---

## Observability

Logs are structured JSON on stdout, using the field names Cloud Logging parses natively (`severity`, `message`). No agent, no sidecar, no dependency.

```ts
logger.info('Order created', { orderId, userId, amountCents });
```

becomes a queryable LogEntry in Cloud Logging with `jsonPayload.orderId` as a filterable field.

`/api/health` reports the running version (commit SHA), region and uptime — enough to answer "which build is serving traffic?" without opening the console.

**Deliberately not included:** distributed tracing, metrics export, error tracking. Add OpenTelemetry or Cloud Error Reporting when there is a system complex enough to need them.

---

## Security posture

| Layer    | Control                                                                    |
| -------- | -------------------------------------------------------------------------- |
| Pipeline | Workload Identity Federation — no long-lived service account keys exist    |
| Pipeline | Least-privilege job permissions; `contents: read` unless more is needed    |
| Image    | Non-root user (uid 1001), Alpine base, standalone output (small surface)   |
| Image    | Read-only root filesystem in Compose; `no-new-privileges`                  |
| Runtime  | Secrets from Secret Manager, mounted as env vars — never baked into layers |
| Runtime  | Security headers set in `next.config.ts`; `X-Powered-By` removed           |
| Code     | CodeQL on every PR and weekly; Dependabot on npm, Actions and Docker       |

---

## Deployment topology

```
git push main
   ↓
GitHub Actions  ── OIDC token ──▶  Workload Identity Pool
   ↓                                        │ impersonates
   │                                        ▼
   │                              Deployer service account
   ├── docker build (Buildx, GHA layer cache)
   ├── docker push ──▶ Artifact Registry  <region>-docker.pkg.dev
   └── gcloud run deploy ──▶ Cloud Run
                                 ↓
                        new revision, 100% traffic
                                 ↓
                        health probe verifies it serves
```

The pipeline tags each image with the commit SHA and deploys it by that immutable tag — never `:latest`. A rollback is therefore a one-line `gcloud run services update-traffic` to a previous revision, with no rebuild.

---

## Key decisions and their trade-offs

| Decision                         | Why                                                                                  | What it costs                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Cloud Run over GKE**           | No cluster to operate, scale-to-zero, per-request billing, native OIDC               | Less control over networking; 300s request ceiling; cold starts         |
| **Cloud Run over Vercel**        | Same cloud as the rest of the stack, no vendor pricing cliff, full container control | You own the Dockerfile and the pipeline                                 |
| **`output: 'standalone'`**       | Runtime image drops from ~1.2 GB to ~65 MB; faster cold starts and pulls             | Static assets must be copied explicitly in the Dockerfile               |
| **pnpm**                         | Content-addressed store, fast CI installs, strict about phantom dependencies         | Contributors need corepack enabled                                      |
| **Workload Identity Federation** | No key material exists to leak or rotate                                             | ~10 minutes of one-time setup (automated in `scripts/gcp-bootstrap.sh`) |
| **Vitest over Jest**             | Reuses the tsconfig path aliases, no separate transform, fast enough for every PR    | Smaller ecosystem than Jest                                             |
| **Hand-rolled logger**           | Zero dependencies, exactly the fields Cloud Logging wants                            | No sampling, redaction or transports — swap in `pino` if needed         |
| **Tailwind CSS**                 | No naming debate, dead CSS is impossible, tokens live in one file                    | Verbose `className` strings                                             |

---

## What is not here, and when to add it

The template stops at the point where choices become project-specific.

| Not included    | Add it when                          | Suggested approach                                                      |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Database        | There is persistent state            | Cloud SQL + a connector in `services/`, or Firestore                    |
| Authentication  | There are user accounts              | Identity Platform, or Auth.js behind `services/`                        |
| Caching         | Measurements show a hot path         | Next's own `revalidate` first; Memorystore only if that is insufficient |
| Background jobs | Work outlives a request              | Cloud Tasks or Pub/Sub → a second Cloud Run service                     |
| Terraform       | More than one environment            | See `cloud/terraform.md` for the planned layout                         |
| CDN             | Global audience with latency SLOs    | Cloud Load Balancer + Cloud CDN in front of Cloud Run                   |
| Tracing         | Multiple services calling each other | OpenTelemetry → Cloud Trace                                             |

Adding any of these changes the architecture. Update this file, `cloud/architecture.md` and the README diagram in the same PR, and record the decision in `docs/adr/`.
