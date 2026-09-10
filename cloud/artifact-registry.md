# Artifact Registry

Where container images live between CI and Cloud Run.

## Why Artifact Registry

Container Registry (`gcr.io`) is deprecated and no longer receives features. Artifact Registry is its supported successor. It is better in the ways that matter here:

- Repositories are regional, so Cloud Run pulls from the same region it runs in — faster cold starts, no cross-region egress.
- IAM is per-repository, not tied to a Cloud Storage bucket.
- Vulnerability scanning is built in.

## Layout

```
<region>-docker.pkg.dev/<project-id>/<repository>/<image>:<tag>
└──────┬──────┘         └─────┬────┘ └────┬─────┘ └──┬──┘ └─┬─┘
   registry host          project    repository   image   tag
```

Concretely:

```
asia-southeast1-docker.pkg.dev/my-project/containers/my-app:a1b2c3d4...
asia-southeast1-docker.pkg.dev/my-project/containers/my-app:latest
```

One repository (`containers`) holds every service in the project, with one image name per service. A split by team or trust boundary helps only when different groups need different IAM. At that point, separate projects are usually the better choice.

**The registry region must match the Cloud Run region.** A mismatch means every cold start pulls the image across regions: slower, and billed as egress.

## Creating a repository

```bash
gcloud artifacts repositories create containers \
  --repository-format=docker \
  --location=asia-southeast1 \
  --description="Container images"
```

`scripts/gcp-bootstrap.sh` does this for you.

## Tagging strategy

Every build pushes two tags:

| Tag            | Mutable | Purpose                                                                           |
| -------------- | ------- | --------------------------------------------------------------------------------- |
| `<commit-sha>` | No      | **What actually gets deployed.** Traceable to an exact commit.                    |
| `latest`       | Yes     | Convenience pointer for humans and `docker pull`. Never referenced by a revision. |

**Never deploy `:latest`.** A revision pinned to a moving tag cannot answer "what code is running?". A rollback then becomes a rebuild instead of a traffic shift. The deploy workflow uses the SHA tag deliberately — do not "simplify" it.

Consider adding a semver tag on release if the project cuts versioned releases:

```bash
docker tag "$BASE:$SHA" "$BASE:v1.4.0"
docker push "$BASE:v1.4.0"
```

## Authentication

### From GitHub Actions

Handled by Workload Identity Federation. After `google-github-actions/auth`, one command wires Docker up:

```yaml
- run: gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet
```

No key file, no `docker login` with a password.

### From a workstation

```bash
gcloud auth login
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
docker pull asia-southeast1-docker.pkg.dev/my-project/containers/my-app:latest
```

## IAM

| Role                            | Grant to                            | Allows                                           |
| ------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `roles/artifactregistry.writer` | The deployer service account        | Push and pull                                    |
| `roles/artifactregistry.reader` | The Cloud Run service agent         | Pull (granted automatically in the same project) |
| `roles/artifactregistry.admin`  | Humans doing repository maintenance | Manage repositories, delete images               |

Grant at the repository level, not the project level:

```bash
gcloud artifacts repositories add-iam-policy-binding containers \
  --location=asia-southeast1 \
  --member="serviceAccount:github-deployer@my-project.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

Note that `writer` includes delete on some resources. If your threat model needs push-without-delete, use a custom role with `artifactregistry.repositories.uploadArtifacts` only.

## Storage and cleanup

Storage is billed per GB per month. Each build pushes a new image, so without a policy the repository grows forever — a few dollars a month becomes a few hundred over a couple of years.

A sensible policy: keep the 10 most recent, delete untagged images older than 30 days.

```bash
cat > /tmp/cleanup-policy.json <<'EOF'
[
  {
    "name": "keep-recent-releases",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 10 }
  },
  {
    "name": "delete-old-untagged",
    "action": { "type": "Delete" },
    "condition": {
      "tagState": "untagged",
      "olderThan": "30d"
    }
  }
]
EOF

gcloud artifacts repositories set-cleanup-policies containers \
  --location=asia-southeast1 \
  --policy=/tmp/cleanup-policy.json
```

Dry-run it first — cleanup policies delete permanently:

```bash
gcloud artifacts repositories set-cleanup-policies containers \
  --location=asia-southeast1 \
  --policy=/tmp/cleanup-policy.json \
  --dry-run
```

> Keep more versions than you expect to need. Rollback depends on the old image still existing. A policy that keeps only 3 versions can turn an incident into a rebuild.

## Vulnerability scanning

Enable once per project:

```bash
gcloud services enable containerscanning.googleapis.com
```

Images are then scanned on push, with results in the console under Artifact Registry → the image → Vulnerabilities, or:

```bash
gcloud artifacts docker images list \
  asia-southeast1-docker.pkg.dev/my-project/containers \
  --show-occurrences \
  --format="table(IMAGE,DIGEST,vulnerability_counts)"
```

Most findings come from the base image. That is why Dependabot watches the `Dockerfile`, and why an ARG pins the base version. An upgrade is then a one-line, reviewable change.

For a stricter posture, add Binary Authorization to block unsigned or unscanned images from deploying.

## Common operations

```bash
# List images
gcloud artifacts docker images list \
  asia-southeast1-docker.pkg.dev/my-project/containers

# List tags of one image
gcloud artifacts docker tags list \
  asia-southeast1-docker.pkg.dev/my-project/containers/my-app

# Inspect a specific image
gcloud artifacts docker images describe \
  asia-southeast1-docker.pkg.dev/my-project/containers/my-app:latest

# Delete a specific version (rollback becomes impossible for that build)
gcloud artifacts docker images delete \
  asia-southeast1-docker.pkg.dev/my-project/containers/my-app@sha256:... \
  --delete-tags

# Repository size
gcloud artifacts repositories describe containers \
  --location=asia-southeast1 --format='value(sizeBytes)'
```

## Troubleshooting

| Symptom                                                                     | Cause                                                                  | Fix                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `denied: Permission "artifactregistry.repositories.uploadArtifacts" denied` | Deployer SA lacks `writer` on the repository                           | Add the binding shown above                            |
| `name unknown: Repository "containers" not found`                           | Repository missing, or wrong region in the image path                  | Create it, or fix `GCP_REGION`                         |
| `unauthorized: authentication failed`                                       | Docker not configured for this registry host                           | `gcloud auth configure-docker <region>-docker.pkg.dev` |
| Cloud Run: `Image not found`                                                | Deployed a tag that was never pushed, or the wrong project in the path | Check the exact image URI in the workflow log          |
| Slow cold starts                                                            | Registry region differs from Cloud Run region                          | Recreate the repository in the Cloud Run region        |
