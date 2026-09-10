# Cloud infrastructure

Everything about running this application on Google Cloud Platform: the architecture, the deployment pipeline, the registry, the configuration model, and where Terraform will go.

## Contents

| Document                                               | What it covers                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                   | Target architecture, diagrams, service boundaries, scaling and cost model |
| [deployment.md](./deployment.md)                       | The operator runbook: one-time setup, deploying, verifying, rolling back  |
| [artifact-registry.md](./artifact-registry.md)         | Container registry: layout, tagging, retention, vulnerability scanning    |
| [github-actions.md](./github-actions.md)               | Workload Identity Federation in depth, IAM roles, troubleshooting auth    |
| [environment-variables.md](./environment-variables.md) | Build-time vs runtime config, Secret Manager, adding a variable           |
| [terraform.md](./terraform.md)                         | Planned IaC layout for when manual setup no longer scales                 |

## The stack in one paragraph

GitHub Actions builds the Next.js application into a small, non-root container image. It pushes the image to Artifact Registry and deploys it to Cloud Run as a new immutable revision tagged with the commit SHA. GitHub authenticates to Google Cloud with a short-lived OIDC token from Workload Identity Federation. No service account keys exist anywhere in the system. Cloud Run autoscales from zero, terminates TLS, and streams structured logs to Cloud Logging.

## Google Cloud services used

| Service                                | Role                                           | Why this one                                                                                    |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Cloud Run**                          | Runs the container, autoscales, terminates TLS | Serverless containers: no cluster to operate, scale-to-zero, per-request billing                |
| **Artifact Registry**                  | Stores container images                        | Regional, IAM-integrated, vulnerability scanning; the supported successor to Container Registry |
| **IAM + Workload Identity Federation** | Keyless CI authentication                      | Removes long-lived key material from the threat model entirely                                  |
| **Cloud Logging**                      | Log aggregation and search                     | Automatic — Cloud Run forwards stdout/stderr with no agent                                      |
| **Secret Manager**                     | Secret storage (when needed)                   | Versioned, IAM-controlled, audit-logged; mounted into Cloud Run as env vars                     |
| **Cloud Monitoring**                   | Metrics, uptime checks, alerts                 | Built-in Cloud Run metrics with no instrumentation                                              |

## Required APIs

Enabled for you by `scripts/gcp-bootstrap.sh`:

```
run.googleapis.com                    Cloud Run
artifactregistry.googleapis.com       Artifact Registry
iamcredentials.googleapis.com         Service account impersonation (WIF)
sts.googleapis.com                    Security Token Service (WIF)
cloudresourcemanager.googleapis.com   Project-level IAM
secretmanager.googleapis.com          Secrets (optional but usually needed)
```

## Cost model

Cloud Run bills per 100ms of request processing, plus a small per-request fee. With `--min-instances=0` an idle service costs nothing.

Indicative for a low-traffic service (1 vCPU, 512 MiB, scale to zero):

| Traffic                                        | Approximate monthly cost                   |
| ---------------------------------------------- | ------------------------------------------ |
| Under the free tier (2M requests, 360k vCPU-s) | $0                                         |
| ~100k requests/month, 100ms each               | Cents                                      |
| `--min-instances=1` (no cold starts)           | ~$10–15/month for the always-warm instance |

Artifact Registry charges for storage — a few cents per GB per month. The retention policy in [artifact-registry.md](./artifact-registry.md) keeps that from growing without bound.

Set a budget alert before the first deploy. `scripts/gcp-bootstrap.sh` prints the command.

## Where to start

- Deploying for the first time? → [deployment.md](./deployment.md)
- Authentication failing in CI? → [github-actions.md](./github-actions.md#troubleshooting)
- Need to add a secret? → [environment-variables.md](./environment-variables.md#secrets)
- Container will not start? → [../docs/troubleshooting.md](../docs/troubleshooting.md)
