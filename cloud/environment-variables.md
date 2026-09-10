# Environment variables and secrets

The configuration model, end to end. The canonical list of variables is [`.env.example`](../.env.example); this document explains the _system_ around it.

---

## The mental model

```
                       BUILD TIME                          RUNTIME
                  (GitHub Actions, docker build)      (Cloud Run instance)
                            │                                 │
  NEXT_PUBLIC_* ────────────┤                                 │
  (docker build-arg)        │                                 │
                            ▼                                 │
                    inlined into the                          │
                    JavaScript bundle                         │
                    ★ public forever ★                        │
                                                              │
  Cloud Run env vars ─────────────────────────────────────────┤
  (--set-env-vars)                                            │
                                                              │
  Secret Manager ─────────────────────────────────────────────┤
  (--set-secrets)                                             │
                                                              │
  Platform (PORT, K_SERVICE, K_REVISION) ─────────────────────┤
                                                              ▼
                                                        process.env
                                                              │
                                                              ▼
                                                        lib/env.ts
                                                    (validate once, at
                                                     module load, then
                                                     export a typed object)
```

Two rules follow from this diagram, and almost every configuration bug is a violation of one of them:

1. **`NEXT_PUBLIC_*` is baked in at build time.** Changing it on the Cloud Run service does nothing — the value is already inside the JavaScript your users downloaded. You must rebuild.
2. **`NEXT_PUBLIC_*` is public.** It is in a file served to browsers. Never put a credential behind that prefix, no matter how convenient.

---

## `lib/env.ts` — the single entry point

Nothing else in the codebase reads `process.env`.

```ts
import { env } from '@/lib/env';

if (env.isProduction) {
  logger.info('Serving', { version: env.appVersion, region: env.gcpRegion });
}
```

**Why centralise:** `process.env.FOO` is `string | undefined` at every call site. A typo or an unset variable then becomes an `undefined` in business logic. Validation at module load instead makes the container refuse to start. Cloud Run reports this as a failed revision and rolls back, rather than serving broken responses for hours.

**Why it must throw, not warn:** a warning in a log nobody reads is not a control. A failed revision is.

---

## Adding a variable

All four steps, in the same PR. Skipping any one of them breaks somebody.

**1. Document it in `.env.example`**

```bash
# Purpose of the variable, one or two lines.
# Values: a | b | c
# Default: a
# Required in production: yes/no
MY_VARIABLE=a
```

**2. Declare and validate it in `lib/env.ts`**

```ts
export const env = {
  // ...
  myVariable: oneOf('MY_VARIABLE', process.env.MY_VARIABLE, ['a', 'b', 'c'], 'a'),
} as const;
```

**3. Wire it into delivery**, in `.github/workflows/deploy.yml`

Public (build-time):

```yaml
build-args: |
  NEXT_PUBLIC_MY_VARIABLE=${{ vars.MY_VARIABLE }}
```

...and add a matching `ARG`/`ENV` pair in the `builder` stage of the `Dockerfile`.

Server-side (runtime):

```yaml
env_vars: |-
  MY_VARIABLE=${{ vars.MY_VARIABLE }}
```

**4. Note it in this document's table below** if it needs operator context.

---

## Local development

```bash
cp .env.example .env.local
```

`.env.local` is gitignored and takes precedence over `.env`. Next.js loads it automatically — no `dotenv` dependency needed.

Load order, highest precedence first: `.env.local` → `.env.$NODE_ENV` → `.env`. Real shell environment variables override all of them.

To test against the production image locally:

```bash
docker compose up --build   # reads .env.local if present, via env_file
```

---

## Secrets

Never in `.env` (committed), never in a build arg (build args are visible in `docker history`), never in a Cloud Run env var literal (visible to anyone with `run.services.get`).

### Creating

```bash
gcloud services enable secretmanager.googleapis.com

gcloud secrets create DATABASE_URL --replication-policy=automatic

# Pipe the value — never pass it as an argument, where it lands in shell history
printf '%s' 'postgresql://user:pass@host:5432/db' \
  | gcloud secrets versions add DATABASE_URL --data-file=-
```

### Granting access

To the **runtime** service account (the identity the app runs as), not the deployer:

```bash
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:my-app-runtime@my-project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Mounting into Cloud Run

Add to the `flags:` in `deploy.yml`:

```yaml
--set-secrets=DATABASE_URL=DATABASE_URL:latest
```

The secret arrives as an ordinary environment variable, so `lib/env.ts` reads it like any other value.

`:latest` resolves at instance start. A new secret version does not affect running instances. Deploy a new revision to use it. Pin to a specific version (`:3`) when you need change control.

### Rotating

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add DATABASE_URL --data-file=-
gcloud run services update my-app --region asia-southeast1  # new revision
gcloud secrets versions disable 1 --secret=DATABASE_URL     # after verifying
```

Disable before destroying — disabling is reversible, destroying is not.

---

## GitHub Actions configuration

| Kind         | Use for                            | Visible in logs | Set with               |
| ------------ | ---------------------------------- | --------------- | ---------------------- |
| **Secret**   | Values whose disclosure is harmful | Masked          | `gh secret set NAME`   |
| **Variable** | Non-sensitive configuration        | Plain text      | `gh variable set NAME` |

Current inventory:

| Name                  | Kind     | Required | Purpose                                                             |
| --------------------- | -------- | -------- | ------------------------------------------------------------------- |
| `WIF_PROVIDER`        | secret   | yes      | Workload Identity provider resource name                            |
| `WIF_SERVICE_ACCOUNT` | secret   | yes      | Deployer service account email                                      |
| `GCP_PROJECT_ID`      | variable | yes      | Target GCP project                                                  |
| `GCP_REGION`          | variable | no       | Deployment region (default `asia-southeast1`)                       |
| `ARTIFACT_REPOSITORY` | variable | no       | Artifact Registry repository (default `containers`)                 |
| `CLOUD_RUN_SERVICE`   | variable | no       | Service name (defaults to the repository name)                      |
| `APP_URL`             | variable | no       | Public URL — **inlined at build time**                              |
| `APP_NAME`            | variable | no       | Display name                                                        |
| `LOG_LEVEL`           | variable | no       | Runtime verbosity (default `info`)                                  |
| `MIN_INSTANCES`       | variable | no       | `1` removes cold starts, at a cost                                  |
| `MAX_INSTANCES`       | variable | no       | Scaling and bill ceiling (default `10`)                             |
| `DEPLOYED_AT`         | computed | no       | UTC deploy time the workflow injects; `/api/health` shows it in IST |

`WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` are resource identifiers rather than credentials — useless without a valid OIDC token from this repository. They are stored as secrets to avoid publishing your project layout, not because a leak would grant access.

---

## Platform-injected variables

Cloud Run sets these; do not define them yourself.

| Variable          | Value              | Note                               |
| ----------------- | ------------------ | ---------------------------------- |
| `PORT`            | `8080`             | **Must** be honoured by the server |
| `K_SERVICE`       | Service name       | Useful in logs                     |
| `K_REVISION`      | Revision name      | Identifies the exact deployment    |
| `K_CONFIGURATION` | Configuration name | Rarely needed                      |

---

## Anti-patterns

| Don't                                   | Why                                | Do instead                                |
| --------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_API_SECRET`                | Shipped to every browser           | Server-side variable, read in `services/` |
| `process.env.FOO` in a component        | Untyped, unvalidated, easy to typo | `import { env } from '@/lib/env'`         |
| Committing `.env.local`                 | Secrets in git history, forever    | `.gitignore` already covers it            |
| `--build-arg DATABASE_URL=...`          | Visible in `docker history`        | Secret Manager at runtime                 |
| Changing `NEXT_PUBLIC_*` on the service | Silently has no effect             | Rebuild the image                         |
| A secret with no owner or rotation plan | Nobody dares to change it later    | Document owner and rotation in the PR     |
