# Cloud architecture

## Target architecture

```
                              ┌──────────────┐
                              │   Developer  │
                              └──────┬───────┘
                                     │ git push / pull request
                                     ▼
                          ┌─────────────────────┐
                          │       GitHub        │
                          │   (source of truth) │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   GitHub Actions    │
                          │  ┌───────────────┐  │
                          │  │ PR validation │  │  no cloud access
                          │  └───────────────┘  │
                          │  ┌───────────────┐  │
                          │  │    Deploy     │  │  OIDC token
                          │  └───────┬───────┘  │
                          └──────────┼──────────┘
                                     │ ① mint OIDC JWT
                                     ▼
                    ┌────────────────────────────────┐
                    │  Workload Identity Pool        │
                    │  provider: github              │
                    │  condition:                    │
                    │    assertion.repository ==     │
                    │      'owner/repo'              │
                    └────────────────┬───────────────┘
                                     │ ② federated token
                                     ▼
                    ┌────────────────────────────────┐
                    │  Deployer service account      │
                    │  roles/artifactregistry.writer │
                    │  roles/run.admin               │
                    │  roles/iam.serviceAccountUser  │
                    └────────┬───────────────┬───────┘
                             │ ③ push        │ ④ deploy
                             ▼               ▼
            ┌──────────────────────┐   ┌──────────────────────────┐
            │  Artifact Registry   │   │       Cloud Run          │
            │  <region>-docker     │──▶│  service: <name>         │
            │    .pkg.dev          │   │  revision: <sha>         │
            │  repo: containers    │   │  100% traffic            │
            │  image:<sha>,:latest │   │  min=0  max=10           │
            └──────────────────────┘   │  concurrency=80          │
                                       │  runtime SA (minimal)    │
                                       └────────┬─────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
          ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
          │   End users      │      │  Cloud Logging   │      │  Secret Manager  │
          │  HTTPS, managed  │      │  structured JSON │      │  (when needed)   │
          │  TLS certificate │      │  from stdout     │      │  mounted as env  │
          └──────────────────┘      └──────────────────┘      └──────────────────┘
```

## Request path

```
User ──HTTPS──▶ Google Front End ──▶ Cloud Run ingress
                (TLS termination,     (routing, autoscaling)
                 global anycast)              │
                                              ▼
                                    Container instance :8080
                                              │
                                    Next.js standalone server
                                       ├─ Server Component render
                                       ├─ Route handler (/api/*)
                                       └─ Static asset (/_next/static)
                                              │
                                              ▼
                                    HTML / JSON response
```

The container never sees TLS. Google terminates it at the edge and forwards the original scheme in `X-Forwarded-Proto`.

## Deployment sequence

```
① push to main
② GitHub Actions: verify required config exists (fail fast, actionable message)
③ Mint OIDC token → exchange via Workload Identity Pool → impersonate deployer SA
④ docker build (Buildx, GHA layer cache, NEXT_PUBLIC_* inlined as build args)
⑤ docker push  → <region>-docker.pkg.dev/<project>/containers/<service>:<sha>
                                                                        :latest
⑥ gcloud run deploy --image ...:<sha>   ← immutable tag, never :latest
⑦ Cloud Run creates revision <service>-<sha>, shifts 100% traffic
⑧ Workflow probes <url>/api/health until 200, or fails the deploy
⑨ Job summary records service, region, image, URL, commit
```

Step ⑧ is what makes a green result meaningful. Without it, "deployed" only means "Cloud Run accepted the API call".

## Scaling behaviour

| Dimension         | Setting                | Effect                                                                                                                |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Minimum instances | `0`                    | Scales fully to zero. No idle cost; first request after idle pays a cold start (~1–3s here, helped by `--cpu-boost`). |
| Maximum instances | `10`                   | Hard ceiling. Bounds both a traffic spike's blast radius and the monthly bill.                                        |
| Concurrency       | `80` requests/instance | Node is single-threaded but I/O-bound work overlaps well. Lower it if CPU-bound rendering causes queueing.            |
| CPU allocation    | Request-based          | CPU is throttled between requests, which is why background timers are unreliable — use Cloud Tasks.                   |
| Scaling signal    | Concurrency and CPU    | Cloud Run adds instances when existing ones approach the concurrency limit.                                           |

**Capacity, roughly:** 10 instances × 80 concurrent requests = 800 in-flight requests. At 100ms each that is ~8,000 req/s — far beyond what most applications need before other bottlenecks appear.

## Environments

The template ships one environment. To add staging, prefer **separate GCP projects** over separate services in one project:

```
my-app-prod     project ── Cloud Run: my-app     ── AR: containers
my-app-staging  project ── Cloud Run: my-app     ── AR: containers
```

Why separate projects: IAM, quotas, budgets and audit logs are all project-scoped. A staging misconfiguration cannot reach production data, and cost attribution is free.

Implementation: a GitHub Environment per target, each with its own `GCP_PROJECT_ID` variable and `WIF_*` secrets, and required reviewers on production.

## Reliability

| Concern           | How it is handled                                                                  |
| ----------------- | ---------------------------------------------------------------------------------- |
| Bad deploy        | Revisions are immutable; roll back with a traffic shift, no rebuild                |
| Zone failure      | Cloud Run is regional and spreads instances across zones automatically             |
| Region failure    | Not handled. Needs multi-region services behind a global load balancer.            |
| Traffic spike     | Autoscaling up to `--max-instances`; requests beyond that queue then 429           |
| Slow dependency   | Every outbound call has a timeout, so a slow dependency cannot block an instance   |
| Graceful shutdown | `dumb-init` forwards SIGTERM; Next.js drains in-flight requests                    |
| Health            | `/api/health` is dependency-free, so a downstream blip cannot cause a restart loop |

## Security boundaries

```
┌─ GitHub ──────────────────────────────────────────────┐
│  No long-lived Google credentials exist here.         │
│  Secrets: WIF_PROVIDER, WIF_SERVICE_ACCOUNT           │
│  (both are resource identifiers, not credentials)     │
└───────────────────────────────────────────────────────┘
                        │ OIDC, minutes-long, repo-scoped
┌─ Google Cloud ────────┼───────────────────────────────┐
│  Deployer SA          ▼   push images, deploy services│
│  Runtime SA               only what the app needs     │
│    ── separate identities, deliberately               │
│  Secret Manager           IAM-gated, versioned        │
└───────────────────────────────────────────────────────┘
                        │ HTTPS only
┌─ Container ───────────┼───────────────────────────────┐
│  Non-root uid 1001, no shell tools, no package manager│
│  Read-only root filesystem (enforced in Compose)      │
│  Security headers set by next.config.ts               │
└───────────────────────────────────────────────────────┘
```

The deployer and runtime service accounts are deliberately different identities. The pipeline can deploy but cannot read your database; the running service can read its secrets but cannot deploy itself.

## Evolution path

```
Today
  GitHub → Actions → Artifact Registry → Cloud Run

+ persistence
  Cloud Run → Cloud SQL (private IP + connector) or Firestore

+ multiple environments
  Terraform per project (see terraform.md); GitHub Environments with reviewers

+ global audience
  Cloud Load Balancer + Cloud CDN → Cloud Run in several regions

+ async work
  Cloud Run → Pub/Sub or Cloud Tasks → a second Cloud Run service

+ deep observability
  OpenTelemetry → Cloud Trace; Cloud Error Reporting; SLO-based alerting
```

Each of these changes the diagram at the top of this file. Update it in the same PR — see rule 9 in `.github/instructions/coding-rules.md`.
