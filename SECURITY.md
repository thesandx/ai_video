# Security policy

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private reporting: **Security** tab → **Report a vulnerability**. If that is unavailable, contact the repository owner directly.

Include what you found, how to reproduce it, and what an attacker can do with it. You get an acknowledgement within a few days, and an assessment soon after.

## Supported versions

This is a template. Security fixes land on `main`; there are no maintained release branches. Each project generated from it owns its dependency updates. Dependabot is preconfigured to help.

## Security model

### No long-lived credentials

The deployment pipeline authenticates through Workload Identity Federation. **No JSON service account key is created, stored or committed.** A key is a permanent bearer credential. An OIDC token lives for minutes, and an attribute condition binds it to this repository.

If you see `credentials_json:` or a `*.json` key anywhere in a project built from this template, that is a finding — report it.

See [ADR-0002](./docs/adr/0002-use-workload-identity-federation.md) and [`cloud/github-actions.md`](./cloud/github-actions.md).

### Identity separation

Two service accounts, deliberately distinct:

- **Deployer** — impersonated by CI. Can push images and deploy revisions. Cannot read application data.
- **Runtime** — the identity the application runs as. Can read its own secrets. Cannot deploy or modify IAM.

If an attacker compromises either account, the damage stays contained.

### Container hardening

| Control                                                                         | Where                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| Non-root user (uid 1001)                                                        | `Dockerfile`                                  |
| Minimal surface — no source, no dev deps, no package manager in the final image | `Dockerfile` (standalone output)              |
| Pinned base image versions                                                      | `Dockerfile` build args                       |
| Read-only root filesystem, `no-new-privileges`                                  | `docker-compose.yml`, `scripts/docker-run.sh` |
| Correct signal handling (`dumb-init`)                                           | `Dockerfile`                                  |

### Pipeline hardening

| Control                                                    | Where                      |
| ---------------------------------------------------------- | -------------------------- |
| Least-privilege `permissions:` per workflow and job        | `.github/workflows/*`      |
| `persist-credentials: false` on checkout                   | all workflows              |
| PR validation requires no cloud credentials                | `pr-validation.yml`        |
| Provider pinned to this repository by attribute condition  | Workload Identity provider |
| CodeQL on PRs and weekly (needs code scanning — see below) | `codeql.yml`               |
| Dependabot on npm, Actions and Docker                      | `dependabot.yml`           |

### Application

- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) set in `next.config.ts`; `X-Powered-By` removed.
- The app validates environment configuration at startup. A missing required variable fails the revision instead of serving broken responses.
- Secrets come from Secret Manager at runtime, never from build args (visible in `docker history`) and never from `NEXT_PUBLIC_*` (shipped to every browser).

## Hardening checklist for a real deployment

The template is a safe default, not a finished security posture. Before production:

- [ ] Narrow the deployer's `roles/run.admin` to `run.developer` or a custom role
- [ ] Restrict the Workload Identity attribute condition to `refs/heads/main`
- [ ] Add required reviewers to the `production` GitHub Environment
- [ ] Enable branch protection on `main`: required checks, required review, no force push
- [ ] Enable Artifact Registry vulnerability scanning
- [ ] Confirm CodeQL can upload results — code scanning is free on **public** repositories only. On a private repo without GitHub Advanced Security, the analysis runs and then fails at the upload step. Buy GHAS or delete `codeql.yml`. Do not leave a check permanently red.
- [ ] Set a billing budget with alerts — cost is a security control against runaway abuse
- [ ] Decide whether `--allow-unauthenticated` is correct; remove it for internal services
- [ ] Add rate limiting if any endpoint is expensive or writes data
- [ ] Grant the runtime service account only the roles the application uses
- [ ] Add a Content-Security-Policy once you know which origins the app legitimately loads from

## What is out of scope

Findings in dependencies belong upstream — though we want to know if this repository pins a version with a known advisory. Vulnerabilities in Google Cloud itself go to [Google's VRP](https://bughunters.google.com/).
