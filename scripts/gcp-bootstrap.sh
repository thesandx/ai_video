#!/usr/bin/env bash
#
# One-time Google Cloud setup for this template.
#
# Creates everything the deploy pipeline needs:
#   - required APIs
#   - an Artifact Registry repository
#   - a deployer service account (impersonated by GitHub Actions)
#   - a runtime service account (the identity the app runs as)
#   - a Workload Identity Pool + provider pinned to your repository
#   - the IAM bindings that tie them together
#
# Every step is idempotent: re-running after a partial failure is safe.
#
# There are NO service account keys anywhere in this script, by design.
# See cloud/github-actions.md for why.
#
# Usage:
#   ./scripts/gcp-bootstrap.sh \
#     --project my-gcp-project \
#     --region asia-southeast1 \
#     --repo owner/repository \
#     --service my-app
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

step()  { printf '\n%s==> %s%s\n' "${BLUE}${BOLD}" "$*" "${RESET}"; }
ok()    { printf '    %s✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
skip()  { printf '    %s·%s %s\n' "${YELLOW}" "${RESET}" "$*"; }
warn()  { printf '%s[warn]%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()   { printf '%s[error]%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

usage() {
  sed -n '3,25p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
PROJECT_ID=""
REGION="asia-southeast1"
GITHUB_REPO=""
SERVICE_NAME=""
AR_REPOSITORY="containers"
POOL_ID="github"
PROVIDER_ID="github"
RESTRICT_TO_MAIN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)    PROJECT_ID="${2:-}"; shift 2 ;;
    --region)     REGION="${2:-}"; shift 2 ;;
    --repo)       GITHUB_REPO="${2:-}"; shift 2 ;;
    --service)    SERVICE_NAME="${2:-}"; shift 2 ;;
    --ar-repo)    AR_REPOSITORY="${2:-}"; shift 2 ;;
    --main-only)  RESTRICT_TO_MAIN="true"; shift ;;
    -h|--help)    usage 0 ;;
    *)            die "Unknown argument: $1 (try --help)" ;;
  esac
done

[[ -n "$PROJECT_ID"   ]] || die "--project is required"
[[ -n "$GITHUB_REPO"  ]] || die "--repo is required (format: owner/repository)"
[[ "$GITHUB_REPO" == */* ]] || die "--repo must be in owner/repository format"
[[ -n "$SERVICE_NAME" ]] || die "--service is required"

command -v gcloud >/dev/null 2>&1 || die "gcloud is not installed: https://cloud.google.com/sdk/docs/install"

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  die "No active gcloud account. Run: gcloud auth login"
fi

DEPLOYER_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="${SERVICE_NAME}-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------
cat <<EOF

${BOLD}Google Cloud bootstrap${RESET}

  Project             ${PROJECT_ID}
  Region              ${REGION}
  GitHub repository   ${GITHUB_REPO}
  Cloud Run service   ${SERVICE_NAME}
  Artifact Registry   ${AR_REPOSITORY}
  Deployer SA         ${DEPLOYER_SA}
  Runtime SA          ${RUNTIME_SA}
  Restrict to main    ${RESTRICT_TO_MAIN}

EOF

read -r -p "Proceed? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

gcloud config set project "$PROJECT_ID" --quiet >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')" \
  || die "Cannot read project ${PROJECT_ID}. Does it exist and do you have access?"
ok "Project number: ${PROJECT_NUMBER}"

# ---------------------------------------------------------------------------
step "Enabling required APIs (this can take a couple of minutes)"
# ---------------------------------------------------------------------------
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  secretmanager.googleapis.com \
  --quiet
ok "APIs enabled"

# ---------------------------------------------------------------------------
step "Artifact Registry repository"
# ---------------------------------------------------------------------------
if gcloud artifacts repositories describe "$AR_REPOSITORY" --location="$REGION" >/dev/null 2>&1; then
  skip "Repository ${AR_REPOSITORY} already exists"
else
  gcloud artifacts repositories create "$AR_REPOSITORY" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Container images for ${SERVICE_NAME}" \
    --quiet
  ok "Created ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}"
fi

# ---------------------------------------------------------------------------
step "Service accounts"
# ---------------------------------------------------------------------------
create_sa() {
  local account_id="$1" display_name="$2" email="$3"
  if gcloud iam service-accounts describe "$email" >/dev/null 2>&1; then
    skip "${email} already exists"
  else
    gcloud iam service-accounts create "$account_id" \
      --display-name="$display_name" --quiet
    ok "Created ${email}"
  fi
}

create_sa "github-deployer" "GitHub Actions deployer" "$DEPLOYER_SA"
create_sa "${SERVICE_NAME}-runtime" "Runtime identity for ${SERVICE_NAME}" "$RUNTIME_SA"

# Service account creation is eventually consistent; IAM bindings that
# reference a brand-new account can fail if issued immediately.
sleep 5

# ---------------------------------------------------------------------------
step "IAM roles for the deployer"
# ---------------------------------------------------------------------------

# Push images — scoped to the one repository, not the whole project.
gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet >/dev/null
ok "artifactregistry.writer on ${AR_REPOSITORY}"

# Manage Cloud Run services. Narrow this to run.developer or a custom role
# once the pipeline is proven — see cloud/github-actions.md.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/run.admin" \
  --condition=None \
  --quiet >/dev/null
ok "run.admin on ${PROJECT_ID}"

# Assign the runtime identity to a revision. Without this, deploys fail with a
# confusing 'iam.serviceaccounts.actAs denied' naming an unexpected account.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null
ok "iam.serviceAccountUser on ${RUNTIME_SA}"

# ---------------------------------------------------------------------------
step "Workload Identity Pool"
# ---------------------------------------------------------------------------
if gcloud iam workload-identity-pools describe "$POOL_ID" --location=global >/dev/null 2>&1; then
  POOL_STATE="$(gcloud iam workload-identity-pools describe "$POOL_ID" \
    --location=global --format='value(state)')"
  if [[ "$POOL_STATE" == "DELETED" ]]; then
    warn "Pool ${POOL_ID} is soft-deleted; undeleting"
    gcloud iam workload-identity-pools undelete "$POOL_ID" --location=global --quiet
    ok "Undeleted ${POOL_ID}"
  else
    skip "Pool ${POOL_ID} already exists"
  fi
else
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location=global \
    --display-name="GitHub Actions" \
    --description="Keyless authentication for GitHub Actions workflows" \
    --quiet
  ok "Created pool ${POOL_ID}"
fi

# ---------------------------------------------------------------------------
step "Workload Identity provider"
# ---------------------------------------------------------------------------

# THE SECURITY CONTROL. Without an attribute condition, any repository on
# GitHub could exchange a token for access to this project.
ATTRIBUTE_CONDITION="assertion.repository == '${GITHUB_REPO}'"
if [[ "$RESTRICT_TO_MAIN" == "true" ]]; then
  ATTRIBUTE_CONDITION+=" && assertion.ref == 'refs/heads/main'"
fi

ATTRIBUTE_MAPPING="google.subject=assertion.sub"
ATTRIBUTE_MAPPING+=",attribute.repository=assertion.repository"
ATTRIBUTE_MAPPING+=",attribute.repository_owner=assertion.repository_owner"
ATTRIBUTE_MAPPING+=",attribute.ref=assertion.ref"

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
     --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION" \
    --quiet
  ok "Updated provider ${PROVIDER_ID}"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION" \
    --quiet
  ok "Created provider ${PROVIDER_ID}"
fi
ok "Condition: ${ATTRIBUTE_CONDITION}"

# ---------------------------------------------------------------------------
step "Allowing the repository to impersonate the deployer"
# ---------------------------------------------------------------------------
PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL" \
  --quiet >/dev/null
ok "workloadIdentityUser granted to ${GITHUB_REPO}"

WIF_PROVIDER="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
cat <<EOF

${GREEN}${BOLD}Bootstrap complete.${RESET}

${BOLD}1. Set the GitHub secrets and variables${RESET}

   gh secret set WIF_PROVIDER        --body "${WIF_PROVIDER}"
   gh secret set WIF_SERVICE_ACCOUNT --body "${DEPLOYER_SA}"

   gh variable set GCP_PROJECT_ID      --body "${PROJECT_ID}"
   gh variable set GCP_REGION          --body "${REGION}"
   gh variable set ARTIFACT_REPOSITORY --body "${AR_REPOSITORY}"
   gh variable set CLOUD_RUN_SERVICE   --body "${SERVICE_NAME}"

   (Or paste them in Settings > Secrets and variables > Actions.)

${BOLD}2. Deploy${RESET}

   Merge to main, or:  gh workflow run deploy.yml

${BOLD}3. After the first deploy, pin the public URL${RESET}

   URL=\$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)')
   gh variable set APP_URL --body "\$URL"
   gh workflow run deploy.yml   # rebuild so the URL is inlined into the bundle

${BOLD}Recommended: set a budget alert before you forget${RESET}

   gcloud billing budgets create \\
     --billing-account="\$(gcloud billing projects describe ${PROJECT_ID} --format='value(billingAccountName)' | cut -d/ -f2)" \\
     --display-name="${SERVICE_NAME} budget" \\
     --budget-amount=50 \\
     --threshold-rule=percent=0.5 \\
     --threshold-rule=percent=0.9 \\
     --filter-projects="projects/${PROJECT_ID}"

   (No currency suffix: the amount is in your billing account's own currency.
    A mismatched currency such as 50USD on a non-USD account is rejected.
    Adjust the number to taste; alerts fire at 50% and 90% of it.)

${BOLD}Notes${RESET}

  - No service account key was created. There is no key to leak or rotate.
  - The runtime service account ${RUNTIME_SA}
    has no permissions yet. Grant only what the application needs.
  - Re-running this script is safe.

EOF
