# Terraform (planned)

The template deliberately ships **without** Terraform. This document explains why, when that changes, and the layout to adopt when it does. The goal is a known migration path, not an improvisation.

---

## Why not yet

The one-time setup is a handful of `gcloud` commands, automated and made idempotent in [`scripts/gcp-bootstrap.sh`](../scripts/gcp-bootstrap.sh). For a single service in a single project, Terraform would add state management, a backend bucket, provider version pinning and a plan/apply pipeline in exchange for very little.

The script is the right tool at this scale. Terraform becomes the right tool at the next one.

## When to adopt it

Any one of these is sufficient:

- **More than one environment.** When staging and production must match, drift becomes a real problem.
- **More than a handful of resources.** Cloud SQL, VPC connectors, load balancers, DNS, monitoring policies — manual console setup does not scale to this.
- **More than one person changing infrastructure.** Terraform's plan output is a review artefact; a console change is invisible.
- **A compliance requirement** for infrastructure change history.
- **Disaster recovery** that must be provably reproducible, not "I think I remember the steps".

If none of these are true, keep using the script. Early IaC is a real cost with no benefit yet.

---

## Planned layout

```
cloud/terraform/
├── README.md
├── versions.tf              # required_version, provider constraints, backend
├── main.tf                  # module composition
├── variables.tf
├── outputs.tf
│
├── environments/
│   ├── production.tfvars
│   └── staging.tfvars
│
└── modules/
    ├── artifact-registry/   # repository + cleanup policy + IAM
    ├── cloud-run/           # service, revision settings, IAM, domain mapping
    ├── workload-identity/   # pool, provider, attribute condition, bindings
    └── service-accounts/    # deployer and runtime SAs with their roles
```

One module per concern, composed per environment. The module boundaries mirror the sections of [deployment.md](./deployment.md), so the migration is mostly transcription.

## Backend

State goes in Cloud Storage, in its own bucket, with versioning on:

```hcl
terraform {
  required_version = ">= 1.9"

  backend "gcs" {
    bucket = "my-project-tf-state"
    prefix = "nextjs-cloudrun-template"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
```

Create the bucket before the first `init`:

```bash
gcloud storage buckets create gs://my-project-tf-state \
  --location=asia-southeast1 \
  --uniform-bucket-level-access

gcloud storage buckets update gs://my-project-tf-state --versioning
```

Versioning matters: it is the only recovery path from a corrupted or accidentally deleted state file.

## What Terraform should own — and what it should not

| Resource                                        | Terraform | Why                                                        |
| ----------------------------------------------- | --------- | ---------------------------------------------------------- |
| Artifact Registry repository + cleanup policy   | ✅        | Stable, rarely changes                                     |
| Workload Identity pool, provider, IAM bindings  | ✅        | Security-critical; changes need review                     |
| Service accounts and their roles                | ✅        | Same                                                       |
| Cloud Run **service** (existence, scaling, IAM) | ✅        | The shape of the service                                   |
| Cloud Run **image tag**                         | ❌        | Changes on every deploy                                    |
| Secret Manager secrets (the container)          | ✅        | Existence and IAM                                          |
| Secret **values**                               | ❌        | Never in state — state is not encrypted at the field level |
| Monitoring, alerting, uptime checks             | ✅        | Should not be click-ops                                    |
| DNS records                                     | ✅        |                                                            |

**The image tag split is the important one.** If Terraform owns the deployed image, every application deploy becomes a Terraform apply — slow, and it couples the app pipeline to the infrastructure pipeline. Instead, let Terraform create the service and ignore subsequent image changes:

```hcl
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    containers {
      image = var.initial_image # a placeholder; CI owns it afterwards
    }
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    service_account = google_service_account.runtime.email
  }

  lifecycle {
    # gcloud run deploy in the CI pipeline owns the image from here on.
    ignore_changes = [template[0].containers[0].image]
  }
}
```

## Migration path

Nothing has to be rebuilt. Existing resources are imported:

```bash
cd cloud/terraform
terraform init

terraform import google_artifact_registry_repository.containers \
  projects/my-project/locations/asia-southeast1/repositories/containers

terraform import google_cloud_run_v2_service.app \
  projects/my-project/locations/asia-southeast1/services/my-app

terraform import google_service_account.deployer \
  projects/my-project/serviceAccounts/github-deployer@my-project.iam.gserviceaccount.com

terraform plan   # must show NO changes before you trust it
```

> `terraform plan` showing an empty diff after import is the acceptance test. If it wants to destroy and recreate something, the configuration does not yet match reality — fix the configuration, not the infrastructure.

## CI integration

A separate workflow from application deploys, using the same Workload Identity Federation (the deployer SA will need broader roles for infrastructure — consider a second, more privileged SA gated behind a protected environment).

```
pull request  →  terraform fmt -check
                 terraform validate
                 terraform plan          → posted as a PR comment
merge to main →  terraform apply         → gated by required reviewers
```

Never `terraform apply` from a laptop against production once this exists. The plan-in-PR flow is the entire value.

## Conventions to adopt on day one

- **Pin the provider** with `~>`. A minor provider bump can change resource defaults.
- **`terraform fmt` in CI**, same reasoning as Prettier.
- **No hardcoded project ids.** Everything comes from a `.tfvars` file per environment.
- **Tag/label everything** with owner, environment and cost centre. Retrofitting labels later is painful.
- **One state file per environment.** Shared state means a staging mistake can destroy production.
- **Treat state as sensitive.** It contains resource metadata and, despite best efforts, sometimes values you would rather it did not.

## Alternatives worth knowing about

| Tool                     | Consider when                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| **Terraform / OpenTofu** | The default. Largest provider ecosystem, most hiring familiarity.               |
| **Pulumi**               | The team would rather write TypeScript than HCL, and shares types with the app. |
| **Config Connector**     | You are already on GKE and want Kubernetes to reconcile GCP resources.          |
| **`gcloud` scripts**     | Where this template is today: few resources, one environment, one operator.     |

---

**Until Terraform lands, [`scripts/gcp-bootstrap.sh`](../scripts/gcp-bootstrap.sh) is the source of truth for infrastructure.** Keep it idempotent, and keep it in step with [deployment.md](./deployment.md).
