# Deployment

What an assistant must know before touching the `Dockerfile`, environment configuration, or anything Cloud Run reads at runtime. The operator-facing runbook is [`cloud/deployment.md`](../../cloud/deployment.md).

---

## The contract with Cloud Run

Cloud Run runs your container. In exchange it demands exactly four things. Break any of them, and the revision fails to start.

### 1. Listen on `$PORT`

Cloud Run injects `PORT` (8080 by default) and waits for the container to accept connections on it. A hardcoded port is the single most common deployment failure.

```dockerfile
ENV PORT=8080          # a default, not a constant — Cloud Run overrides it
```

The Next.js standalone server reads `process.env.PORT` automatically. Do not add `-p 3000` anywhere.

### 2. Bind to `0.0.0.0`

Next.js defaults to `localhost`. Inside a container, that is unreachable from outside. The symptom is this unhelpful message:

> The user-provided container failed to start and listen on the port defined by the PORT environment variable.

```dockerfile
ENV HOSTNAME=0.0.0.0   # mandatory
```

### 3. Start within the startup deadline

The default is 240s. The standalone server starts in about a second. But a top-level `await` that hangs (a database connection, or a secret fetch without a timeout) uses the whole budget and fails the revision.

Keep module-level work trivial. Do expensive setup lazily, inside the first request that needs it.

### 4. Be stateless

The container filesystem is ephemeral, and Cloud Run creates and destroys instances without warning. Anything you write to disk is lost, and no other instance sees it.

- Session state → a shared store, not memory
- Uploads → Cloud Storage, not `/tmp`
- Caches → correctness must not depend on them
- In-memory rate limiting → wrong, because each instance counts separately

---

## The Dockerfile, stage by stage

| Stage     | Purpose                        | Why it is separate                                                                 |
| --------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `base`    | Pinned Node + Alpine, corepack | One place to bump the runtime; shared by every other stage                         |
| `deps`    | `pnpm install` only            | Copies only the manifests, so editing source does not invalidate the install layer |
| `builder` | `pnpm build`                   | Where `NEXT_PUBLIC_*` build args get inlined                                       |
| `runner`  | The shipped image              | Contains no source, no dev dependencies, no package manager                        |

### Rules for editing it

- **Never remove `output: 'standalone'`** from `next.config.ts` without rewriting the runtime stage. The `COPY .next/standalone` line depends on it.
- **Never run as root.** The `USER nextjs` line is the last thing before `EXPOSE`. Anything needing root must happen before it.
- **Never `COPY . .` into the runner stage.** That reintroduces source, dev dependencies and image bloat.
- **Pin base image versions** via the `NODE_VERSION`/`ALPINE_VERSION` args. An unpinned `node:alpine` means an unreviewed runtime upgrade can land at any time.
- **Order layers by change frequency:** manifests before source, so the expensive install layer caches.
- **Keep `dumb-init` as PID 1.** Without it, Node ignores `SIGTERM`. Cloud Run waits 10s, then sends `SIGKILL`, and drops in-flight requests on every deploy.
- **After any change:** `docker compose up --build` and `curl localhost:8080/api/health`. A Dockerfile that builds is not a Dockerfile that runs.

---

## Environment variables

Three kinds, with three different lifecycles. Confusing them wastes hours.

| Kind              | Set where                              | Read when  | Changing it requires |
| ----------------- | -------------------------------------- | ---------- | -------------------- |
| `NEXT_PUBLIC_*`   | Docker build arg (in `deploy.yml`)     | Build time | **A rebuild**        |
| Server config     | Cloud Run `--set-env-vars`             | Runtime    | A new revision       |
| Secrets           | Secret Manager → `--set-secrets`       | Runtime    | A new revision       |
| Platform-injected | Cloud Run itself (`PORT`, `K_SERVICE`) | Runtime    | Nothing              |

### Adding a variable — all four steps, same PR

1. Document it in `.env.example`, with its purpose, valid values and default.
2. Declare and validate it in `lib/env.ts`.
3. Wire it into delivery: a build arg in `Dockerfile` + `deploy.yml` if `NEXT_PUBLIC_*`; an `env_vars` entry in `deploy.yml` otherwise.
4. Note it in `cloud/environment-variables.md`.

Skipping step 2 means the variable is `string | undefined` at every call site. Skipping step 1 means the next person cannot run the project.

### Secrets

Never in an env var literal, never in a build arg (build args are visible in image history), never in the repository.

```bash
printf '%s' "$VALUE" | gcloud secrets versions add DATABASE_URL --data-file=-
gcloud run services update SERVICE --set-secrets=DATABASE_URL=DATABASE_URL:latest
```

---

## Cloud Run settings and what they cost

Configured via `flags:` in `.github/workflows/deploy.yml`.

| Flag                      | Template default | Trade-off                                                                          |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `--min-instances`         | `0`              | 0 = no idle cost, but cold starts. 1 = ~$X/month for instant response.             |
| `--max-instances`         | `10`             | The blast radius of a traffic spike **and** of a runaway bill. Raise deliberately. |
| `--concurrency`           | `80`             | Requests per instance. Lower if the app is CPU-bound; higher if it is I/O-bound.   |
| `--cpu` / `--memory`      | `1` / `512Mi`    | Next.js SSR is memory-hungry; watch for OOM kills before trimming this.            |
| `--timeout`               | `300`            | Max request duration. Long jobs belong in Cloud Tasks, not here.                   |
| `--cpu-boost`             | on               | Extra CPU during startup. Meaningfully cuts cold-start latency.                    |
| `--execution-environment` | `gen2`           | Full Linux compatibility; slightly slower cold start than gen1.                    |
| `--allow-unauthenticated` | on               | **Public.** Remove it and grant `roles/run.invoker` for an internal service.       |

---

## Deploy flow

```
push to main
   └─▶ verify config  ──▶ OIDC auth ──▶ build ──▶ push to Artifact Registry
                                                      └─▶ gcloud run deploy
                                                             └─▶ health probe
```

The pipeline deploys the **commit SHA tag**, never `:latest`. That makes a revision traceable to a commit. It also makes a rollback a traffic shift, not a rebuild.

## Rollback

No rebuild needed — the previous image is still in Artifact Registry and the previous revision still exists:

```bash
gcloud run revisions list --service SERVICE --region REGION
gcloud run services update-traffic SERVICE --region REGION --to-revisions REVISION=100
```

Then fix forward with a normal PR. You can also revert the commit and let CI redeploy, but that is slower when the site is down.

---

## Before you claim a deployment change works

- [ ] `docker compose up --build` succeeds
- [ ] `curl localhost:8080/api/health` returns 200 with the expected version
- [ ] `docker compose ps` reports `healthy`, not just `running`
- [ ] The container runs as a non-root user (`docker compose exec web id` → uid 1001)
- [ ] New env vars exist in `.env.example`, `lib/env.ts` and `deploy.yml`
- [ ] No secret appears in the image (`docker history` shows build args)
