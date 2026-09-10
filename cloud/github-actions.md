# GitHub Actions and Workload Identity Federation

How CI authenticates to Google Cloud without a single stored credential, and what to do when it breaks.

---

## Why not service account keys

The obvious approach is `gcloud iam service-accounts keys create key.json`, then paste it into a GitHub secret. It works, and it is the wrong answer.

| Service account key                                        | Workload Identity Federation                         |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| Never expires — valid until someone remembers to revoke it | Token lives ~1 hour, scoped to one workflow run      |
| Works from anywhere on the internet                        | Only a token from _this repository_ can be exchanged |
| Sits in GitHub, in someone's downloads, in a Slack thread  | No key material exists to leak                       |
| Rotation is a manual chore nobody does                     | Rotation is automatic and invisible                  |
| A leak is silent                                           | Every exchange is in Cloud Audit Logs                |

Google's own guidance is to avoid downloading keys, and many organisations disable key creation by org policy (`constraints/iam.disableServiceAccountKeyCreation`). **This repository must never contain one.**

---

## How the exchange works

```
┌──────────────────────────────────────────────────────────────┐
│ 1. The job requests an OIDC token from GitHub                │
│    Requires: permissions: id-token: write                    │
│                                                              │
│    The JWT asserts, signed by GitHub:                        │
│      iss: https://token.actions.githubusercontent.com        │
│      sub: repo:thesandx/my-app:ref:refs/heads/main           │
│      repository: thesandx/my-app                             │
│      repository_owner: thesandx                              │
│      ref: refs/heads/main                                    │
│      workflow, actor, run_id, ...                            │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. google-github-actions/auth posts it to Google STS          │
│    The Workload Identity Pool provider checks:               │
│      - issuer matches the configured issuer-uri              │
│      - signature verifies against GitHub's public keys       │
│      - attribute-condition passes:                           │
│          assertion.repository == 'thesandx/my-app'           │
│                                                              │
│    ★ Without the attribute-condition, ANY repository on      │
│      GitHub could complete this exchange.                    │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. STS returns a federated token for the principal:          │
│      principalSet://.../attribute.repository/thesandx/my-app │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. That principal holds roles/iam.workloadIdentityUser on     │
│    the deployer SA, so it can impersonate it and receive a   │
│    short-lived access token.                                 │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. gcloud, docker push and deploy-cloudrun use that token.    │
│    It expires when the job ends.                             │
└──────────────────────────────────────────────────────────────┘
```

---

## The workflow side

```yaml
permissions:
  contents: read
  id-token: write # ← without this, step 1 silently produces no token

jobs:
  deploy:
    steps:
      - uses: google-github-actions/auth@v3
        with:
          project_id: ${{ vars.GCP_PROJECT_ID }}
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
          token_format: access_token
```

`WIF_PROVIDER` is the full resource name:

```
projects/123456789/locations/global/workloadIdentityPools/github/providers/github
```

Note it uses the **project number**, not the project id. The id is the most common setup mistake.

---

## IAM model

Two service accounts, deliberately separate:

```
github-deployer@<project>.iam.gserviceaccount.com    ← CI impersonates this
├── roles/artifactregistry.writer   (on the repository)  push images
├── roles/run.admin                 (on the project)     deploy services
└── roles/iam.serviceAccountUser    (on the runtime SA)  assign it to a revision

<service>-runtime@<project>.iam.gserviceaccount.com   ← the app runs as this
└── (nothing by default; grant only what the app needs)
```

**Why separate:** the pipeline can deploy but has no access to application data. The application can read its own secrets but cannot deploy itself or modify IAM. If an attacker compromises either account, the damage stays contained.

`roles/iam.serviceAccountUser` on the runtime account is the one people forget. Without it the deploy fails with a permission error naming an account you did not expect.

### Tightening further

`roles/run.admin` is broad — it can delete services and modify IAM. For a hardened setup, use `roles/run.developer` plus explicit bindings, or a custom role limited to:

```
run.services.get
run.services.create
run.services.update
run.revisions.get
run.revisions.list
run.operations.get
```

Start with `run.admin`, verify the pipeline works, then narrow. If you narrow first, a five-minute setup becomes a long hunt for missing permissions.

---

## Restricting which refs can deploy

The default attribute condition allows any workflow in the repository — including one on a feature branch — to obtain deploy credentials. To require `main`:

```bash
gcloud iam workload-identity-pools providers update-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --attribute-condition="assertion.repository == 'thesandx/my-app' && assertion.ref == 'refs/heads/main'"
```

Or bind the principal more narrowly instead of widening the condition:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.ref/refs/heads/main"
```

Combine with a GitHub Environment restricted to `main` and required reviewers for defence in depth: GitHub gates who can trigger, Google gates what the token can do.

---

## Verifying the setup

```bash
# The provider exists and its condition is right
gcloud iam workload-identity-pools providers describe github \
  --location=global --workload-identity-pool=github \
  --format="yaml(name, attributeCondition, attributeMapping, oidc.issuerUri)"

# The principal can impersonate the deployer
gcloud iam service-accounts get-iam-policy \
  "github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# What the deployer can do
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --format="value(bindings.role)"
```

---

## Troubleshooting

### `Unable to acquire impersonated credentials`

The exchange failed. Almost always one of:

1. **`id-token: write` missing** from the job's `permissions`. The most common cause by far.
2. **Wrong `WIF_PROVIDER`** — check it uses the project _number_ and the full `projects/.../providers/...` path.
3. **`attribute-condition` does not match.** Compare the exact `owner/repo` string, including case.
4. **Missing `roles/iam.workloadIdentityUser`** binding on the deployer SA for the `principalSet://` member.

Inspect what GitHub actually asserted by adding a temporary debug step:

```yaml
- run: |
    curl -sH "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://iam.googleapis.com/${{ secrets.WIF_PROVIDER }}" \
      | jq -r '.value' | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

This prints the JWT claims (no signature, so it is safe) — compare `repository` and `ref` against your condition. **Remove the step afterwards.**

### `Permission 'iam.serviceAccounts.getAccessToken' denied`

The `principalSet://` member is missing or malformed on the deployer service account. Re-run step 6 of the manual setup in [deployment.md](./deployment.md).

### `Permission 'run.services.get' denied`

The deployer SA lacks `roles/run.admin` on the project.

### `Permission 'iam.serviceaccounts.actAs' denied`

The deployer cannot assign the runtime service account to the revision. Grant `roles/iam.serviceAccountUser` on the _runtime_ SA to the _deployer_ SA.

### `denied: Permission "artifactregistry.repositories.uploadArtifacts" denied`

Missing `roles/artifactregistry.writer` on the repository, or `gcloud auth configure-docker` was not run for that registry host.

### Auth works for one workflow but not another

Check `permissions:` in the failing workflow. Job-level permissions override workflow-level ones — a job that redeclares `permissions:` without `id-token: write` loses it.

---

## Audit

Every impersonation is logged. To see which workflow runs obtained credentials:

```bash
gcloud logging read \
  'protoPayload.serviceName="iamcredentials.googleapis.com"
   AND protoPayload.authenticationInfo.principalSubject:"workloadIdentityPools"' \
  --limit=20 \
  --format='table(timestamp, protoPayload.authenticationInfo.principalSubject)'
```

The `principalSubject` contains the repository and ref, so an unexpected entry is immediately visible.

---

## Checklist

- [ ] No `credentials_json` or key file anywhere in the repository
- [ ] `permissions: id-token: write` on every job that authenticates
- [ ] `attribute-condition` pins the provider to this repository
- [ ] Deployer and runtime service accounts are separate identities
- [ ] `roles/iam.serviceAccountUser` granted on the runtime SA to the deployer
- [ ] Production deploys gated by a GitHub Environment
- [ ] Roles narrowed after the pipeline is proven to work
