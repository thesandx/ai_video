# GitHub workflows

Rules for anything under `.github/workflows/`. A broken workflow blocks every contributor at once. A careless one leaks credentials. Treat these files with more care than application code, not less.

---

## What exists

| Workflow            | Trigger                            | Purpose                                                                                                            |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pr-validation.yml` | PR to `main`, push to `main`       | Format, lint, build, typecheck, test, plus a real Docker build and container smoke test. **No cloud credentials.** |
| `deploy.yml`        | Push to `main`, manual             | Build → push to Artifact Registry → deploy to Cloud Run → verify health. **Keyless via OIDC.**                     |
| `codeql.yml`        | PR, push to `main`, weekly, manual | Static security analysis into the Security tab.                                                                    |

> **CodeQL needs code scanning enabled, and that is not free on private repositories.** The analysis runs fine, then the upload step fails with `Code scanning is not enabled for this repository`. Code scanning is included for **public** repos. Private repos need GitHub Advanced Security.
>
> If you generate a private project from this template, either purchase GHAS, or delete `codeql.yml` rather than leaving a permanently red check — a check everyone learns to ignore is worse than no check.

---

## Authentication: OIDC only

**There must never be a JSON service account key in this repository, in a secret, or in a workflow.**

A downloaded key is a permanent credential. It sits in a secret store forever. It works from anywhere on the internet. Nothing revokes it when someone leaves the team. Workload Identity Federation replaces it with a token that lives for minutes and is cryptographically bound to _this repository_.

How it works:

```
GitHub Actions job
   │ mints a signed OIDC JWT describing the run
   │ (repository, ref, workflow, actor)
   ▼
Workload Identity Pool provider
   │ validates issuer + audience
   │ enforces attribute-condition: assertion.repository == 'owner/repo'
   ▼
Federated token
   │ impersonates the deployer service account
   ▼
gcloud / docker push / gcloud run deploy
```

Requirements in every job that authenticates:

```yaml
permissions:
  contents: read
  id-token: write # without this, no OIDC token is minted and auth fails
```

```yaml
- uses: google-github-actions/auth@v3
  with:
    project_id: ${{ env.GCP_PROJECT_ID }}
    workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
    service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
```

If you are about to write `credentials_json:`, stop. That is the pattern this template exists to replace.

---

## Permissions

Start from nothing and add only what a job proves it needs.

```yaml
permissions:
  contents: read # the default for everything here
```

| Need                  | Permission               |
| --------------------- | ------------------------ |
| Checkout code         | `contents: read`         |
| OIDC to Google Cloud  | `id-token: write`        |
| Upload CodeQL results | `security-events: write` |
| Comment on a PR       | `pull-requests: write`   |

Never `permissions: write-all`. Never leave the repository default in place — declare it explicitly at the workflow level, and narrow further per job.

---

## Secrets and variables

| Kind         | Use for                              | Example                                         |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| **Secret**   | Anything whose disclosure is harmful | `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`           |
| **Variable** | Non-sensitive configuration          | `GCP_PROJECT_ID`, `GCP_REGION`, `MAX_INSTANCES` |

Rules:

- Never `echo` a secret, and never interpolate one into a shell command where it could reach a log. GitHub masks known secret values but not derived ones (a base64 of a secret is not masked).
- Never expose a secret to a step that does not need it.
- `pull_request_target` and `workflow_run` run with write permissions and repository secrets against **untrusted** code. This repository does not use them. If you believe you need one, ask a human first.
- Fork PRs cannot read secrets. That is why `pr-validation.yml` needs none — keep it that way, otherwise external contributions break.

---

## Writing a workflow step

```yaml
- name: Something a stranger would understand
  run: |
    set -euo pipefail     # ALWAYS. Without -e a failing line is ignored.
    ...
```

- **`set -euo pipefail` in every multi-line `run`.** Bash's default is to continue after an error, which turns a broken step into a passing one.
- **Pin actions to a major version** (`actions/checkout@v7`). For a security-critical third-party action, pin the full commit SHA.
- **`timeout-minutes` on every job.** A hung job burns runner minutes until GitHub's 6-hour ceiling.
- **`persist-credentials: false` on checkout** unless the job actually pushes. It stops a leaked `GITHUB_TOKEN` from sitting in `.git/config` for later steps.
- **Cache what is expensive and deterministic:** the pnpm store (`cache: pnpm`), Docker layers (`type=gha`). Never cache build output that must be reproduced.
- **Fail with `::error::` and an actionable message.** "Secret WIF_PROVIDER is not set. Run scripts/gcp-bootstrap.sh." is better than a 403 from an API three minutes later.

## Concurrency

```yaml
# PR checks: cancel superseded runs
concurrency:
  group: pr-validation-${{ github.ref }}
  cancel-in-progress: true

# Deploys: queue, never cancel — a half-applied deploy is worse than a slow one
concurrency:
  group: deploy-cloud-run
  cancel-in-progress: false
```

---

## An ordering constraint to watch for

In `pr-validation.yml`, **build runs before typecheck**. This looks wrong and is not:

`next build` generates `next-env.d.ts` and `.next/types/**`, which `tsc --noEmit` needs to resolve JSX and typed routes. Both are gitignored, so on a clean CI checkout they do not exist yet. Reverse the order and typecheck fails on a fresh clone with errors that reproduce nowhere locally.

---

## Changing a workflow

1. Change it on a branch, open a PR — `pr-validation.yml` validates itself.
2. `deploy.yml` cannot be tested by a PR (it only runs on `main`). Use `workflow_dispatch` on a branch, or accept that the first real run is the test — and watch it.
3. Never disable a check to make a PR green. Fix the code, or change the check deliberately and say why.
4. Update this file and the README when you add, remove or rename a workflow.

## Checklist

- [ ] `permissions:` declared explicitly and minimally
- [ ] `timeout-minutes` set on every job
- [ ] `set -euo pipefail` in every multi-line `run`
- [ ] Actions pinned to a version
- [ ] No secret reachable by a step that does not need it
- [ ] No `credentials_json`, no key file, anywhere
- [ ] `concurrency` set appropriately for the workflow's kind
- [ ] Failure messages tell the reader what to do next
