# Deployment runbook

The operator-facing guide: set up once, then deploy by merging to `main`.

---

## Prerequisites

- A Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- `roles/owner` or equivalent on the project for the one-time setup
- Admin access to the GitHub repository (to set secrets and variables)

---

## One-time setup

### The fast path

```bash
./scripts/gcp-bootstrap.sh \
  --project my-gcp-project \
  --region asia-southeast1 \
  --repo thesandx/my-app \
  --service my-app
```

The script enables APIs, creates the Artifact Registry repository, sets up Workload Identity Federation, creates the deployer and runtime service accounts with least-privilege roles, and prints the exact GitHub secrets and variables to configure. Re-running it is safe — every step is idempotent.

Then set what it printed:

```bash
gh secret set WIF_PROVIDER        --body "projects/123456789/locations/global/workloadIdentityPools/github/providers/github"
gh secret set WIF_SERVICE_ACCOUNT --body "github-deployer@my-gcp-project.iam.gserviceaccount.com"

gh variable set GCP_PROJECT_ID      --body "my-gcp-project"
gh variable set GCP_REGION          --body "asia-southeast1"
gh variable set ARTIFACT_REPOSITORY --body "containers"
gh variable set CLOUD_RUN_SERVICE   --body "my-app"
```

Skip to [Deploying](#deploying).

### The manual path

Useful when you need to understand or audit what the script does, or when org policy requires each step to be reviewed.

```bash
export PROJECT_ID="my-gcp-project"
export REGION="asia-southeast1"
export REPO="thesandx/my-app"          # GitHub owner/name
export SERVICE="my-app"
export AR_REPO="containers"

gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
```

**1. Enable APIs**

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  secretmanager.googleapis.com
```

**2. Create the Artifact Registry repository**

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Container images for $SERVICE"
```

**3. Create the deployer service account** — the identity GitHub Actions impersonates.

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions deployer"

export DEPLOYER="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# Push images
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/artifactregistry.writer"

# Manage Cloud Run services
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/run.admin"
```

**4. Create the runtime service account** — the identity the _application_ runs as. Separate from the deployer on purpose: the pipeline should not inherit the app's data access, and the app should not be able to deploy itself.

```bash
gcloud iam service-accounts create "${SERVICE}-runtime" \
  --display-name="Runtime identity for $SERVICE"

export RUNTIME="${SERVICE}-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

# The deployer must be allowed to assign this identity to a revision.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser"
```

Grant the runtime account only what the application needs (Secret Manager accessor, Cloud SQL client, ...). It starts with nothing.

**5. Create the Workload Identity Pool and provider**

```bash
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${REPO}'"
```

> **The `--attribute-condition` is the security control.** Without it, _any_ GitHub repository in the world can exchange a token for access to your project. It is not optional, and Google refuses to create the provider without one.

**6. Let the pool impersonate the deployer**

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"
```

**7. Collect the provider resource name**

```bash
gcloud iam workload-identity-pools providers describe github \
  --location=global \
  --workload-identity-pool=github \
  --format='value(name)'
```

Set that as the `WIF_PROVIDER` secret, and `$DEPLOYER` as `WIF_SERVICE_ACCOUNT`.

---

## GitHub configuration

**Secrets** — Settings → Secrets and variables → Actions → Secrets

| Secret                | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `WIF_PROVIDER`        | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github` |
| `WIF_SERVICE_ACCOUNT` | `github-deployer@<project>.iam.gserviceaccount.com`                                |

Neither is a credential — both are resource identifiers, useless without a valid OIDC token from this repository. They are stored as secrets to avoid publishing your project structure, not because disclosure would be catastrophic.

**Variables** — same page, Variables tab

| Variable              | Required | Default                | Purpose                              |
| --------------------- | -------- | ---------------------- | ------------------------------------ |
| `GCP_PROJECT_ID`      | **yes**  | —                      | Target project                       |
| `GCP_REGION`          | no       | `asia-southeast1`      | Cloud Run + Artifact Registry region |
| `ARTIFACT_REPOSITORY` | no       | `containers`           | Artifact Registry repository name    |
| `CLOUD_RUN_SERVICE`   | no       | repository name        | Cloud Run service name               |
| `APP_URL`             | no       | —                      | Public URL, inlined at build time    |
| `APP_NAME`            | no       | `Next.js on Cloud Run` | Display name                         |
| `LOG_LEVEL`           | no       | `info`                 | Runtime log verbosity                |
| `MIN_INSTANCES`       | no       | `0`                    | `1` removes cold starts, at a cost   |
| `MAX_INSTANCES`       | no       | `10`                   | Scaling and bill ceiling             |

**Environment** — Settings → Environments → New environment → `production`

Optional but recommended: add required reviewers so a deploy pauses for human approval, and restrict the environment to the `main` branch.

---

## Deploying

Merge to `main`. That is the whole procedure.

```
merge PR ──▶ deploy.yml ──▶ build ──▶ push ──▶ deploy ──▶ health check ──▶ ✅
```

Manual redeploy of current `main`:

```bash
gh workflow run deploy.yml -f reason="Redeploy after config change"
gh run watch
```

### First deploy

The first deploy has one extra step: you cannot know `APP_URL` until the service exists, because Cloud Run generates the URL.

1. Deploy once with `APP_URL` unset.
2. Read the URL from the workflow summary, or:
   ```bash
   gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
   ```
3. `gh variable set APP_URL --body "https://..."`
4. Redeploy so the value is inlined into the client bundle.

---

## Verifying a deploy

```bash
# What the pipeline already checked
curl -s https://<service-url>/api/health | jq

# Which revision is serving, and from which image
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.latestReadyRevisionName, spec.template.spec.containers[0].image)'

# Recent logs
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 50
```

The `version` field in the health payload is the commit SHA. If it does not match what you merged, the deploy did not land.

---

## Rolling back

The previous revision still exists and the previous image is still in Artifact Registry, so rollback is a traffic shift — seconds, not a rebuild.

```bash
# 1. Find a known-good revision
gcloud run revisions list --service "$SERVICE" --region "$REGION" --limit 10

# 2. Send all traffic to it
gcloud run services update-traffic "$SERVICE" --region "$REGION" \
  --to-revisions "${SERVICE}-<good-sha>=100"

# 3. Confirm
curl -s https://<service-url>/api/health | jq .version
```

Then fix forward with a normal PR. You can also revert the commit and let CI redeploy, but that is slower while the site is broken.

### Gradual rollout

For a riskier change, split traffic instead of switching it:

```bash
gcloud run services update-traffic "$SERVICE" --region "$REGION" \
  --to-revisions "${SERVICE}-<new>=10,${SERVICE}-<old>=90"
```

Watch error rates in Cloud Monitoring, then move to 100%.

---

## Custom domain

```bash
gcloud beta run domain-mappings create \
  --service "$SERVICE" \
  --domain www.example.com \
  --region "$REGION"
```

Add the DNS records it prints. The managed certificate takes up to ~15 minutes to provision. Afterwards, update `APP_URL` and redeploy so canonical URLs and metadata use the real domain.

For anything more involved — CDN, WAF, multi-region — put a Cloud Load Balancer in front of Cloud Run instead of using domain mappings.

---

## Making the service private

Remove `--allow-unauthenticated` from the `flags:` in `.github/workflows/deploy.yml`, then grant invoker access explicitly:

```bash
gcloud run services remove-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="allUsers" --role="roles/run.invoker"

gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:caller@project.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Monitoring

```bash
# Uptime check against the health endpoint
gcloud monitoring uptime create "$SERVICE-health" \
  --resource-type=uptime-url \
  --resource-labels=host=<service-host>,project_id="$PROJECT_ID" \
  --path=/api/health \
  --period=5
```

Worth alerting on, in priority order: 5xx rate, p95 latency, instance count pinned at `--max-instances` (you are being throttled), and monthly spend against a budget.

---

## Cleanup

```bash
gcloud run services delete "$SERVICE" --region "$REGION"
gcloud artifacts repositories delete "$AR_REPO" --location "$REGION"
gcloud iam workload-identity-pools delete github --location=global
gcloud iam service-accounts delete "$DEPLOYER"
gcloud iam service-accounts delete "$RUNTIME"
```

Google soft-deletes Workload Identity Pools for 30 days, and the name stays reserved. If you recreate one with the same id before then, it fails — undelete it instead:

```bash
gcloud iam workload-identity-pools undelete github --location=global
```
