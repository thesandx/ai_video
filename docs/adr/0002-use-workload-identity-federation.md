# ADR-0002: Use Workload Identity Federation instead of service account keys

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** Platform engineering

## Context

GitHub Actions needs to push container images to Artifact Registry and deploy revisions to Cloud Run. Both require Google Cloud credentials.

The conventional approach — and the one most tutorials, including our own earlier projects, use — is:

```bash
gcloud iam service-accounts keys create key.json --iam-account=...
gh secret set GCP_SA_KEY < key.json
```

```yaml
- uses: google-github-actions/auth@v3
  with:
    credentials_json: ${{ secrets.GCP_SA_KEY }}
```

It works immediately, which is exactly why it is so widespread.

The problem is what that key _is_: a permanent, bearer credential. It does not expire. It grants its permissions to anyone holding the bytes, from anywhere on the internet. Once created it exists in more places than anyone tracks — a GitHub secret, the laptop it was downloaded to, a password manager, possibly a Slack thread. Nothing revokes it when a person leaves the team. And a leak is silent: the first sign is usually the bill or the breach.

Many organisations now block key creation entirely with the `constraints/iam.disableServiceAccountKeyCreation` org policy. That makes this approach not just unwise but unavailable.

## Decision

We will authenticate GitHub Actions to Google Cloud using **Workload Identity Federation with GitHub's OIDC provider**. No service account key will be created, stored, or committed for any project built from this template.

The Workload Identity provider will carry an attribute condition pinning it to a specific repository:

```
assertion.repository == 'owner/repository'
```

## Alternatives considered

### Option A — Workload Identity Federation (chosen)

GitHub mints a short-lived, signed OIDC token describing the workflow run. Google's Security Token Service validates it against the configured provider, checks the attribute condition, and returns a federated token that impersonates the deployer service account. The credential lives for the duration of the job.

No key material exists at any point. A stolen token is useless within the hour and only ever came from one repository.

### Option B — Service account key in a GitHub secret

Rejected. Every property that makes it convenient — permanence, portability, no setup — is the same property that makes it dangerous. The setup cost it saves is roughly ten minutes, one time, and is automated in `scripts/gcp-bootstrap.sh` anyway.

### Option C — A self-hosted runner on Compute Engine

A runner on a VM with an attached service account gets credentials from the metadata server automatically — also keyless.

Rejected because it trades one operational burden for a larger one: a VM to patch, a runner to keep updated, and a machine with deploy permissions sitting on the network permanently. It also does not scale to zero. Reasonable for organisations that already run self-hosted runners for other reasons; not worth introducing for this.

### Option D — Deploy from Cloud Build instead of GitHub Actions

Cloud Build runs inside Google Cloud and needs no federation at all.

Rejected because CI would then be split across two systems: PR validation on GitHub (where the code review happens) and deployment on Cloud Build. Contributors would need Google Cloud console access to see why a deploy failed. The template stays compatible with Cloud Build for teams that prefer it — see `cloud/README.md` — but GitHub Actions is the default.

## Consequences

**Good**

- No long-lived credential exists. There is nothing to leak, and nothing to rotate.
- Access is bound to one repository by the attribute condition, and can be narrowed further to a specific branch.
- Every credential exchange appears in Cloud Audit Logs with the repository and ref that requested it.
- Compatible with the `disableServiceAccountKeyCreation` org policy.
- Removes an entire recurring class of security review finding.

**Bad**

- Roughly ten minutes of one-time setup: a pool, a provider, attribute mappings, and IAM bindings. Automated in `scripts/gcp-bootstrap.sh`, but still a thing that can be misconfigured.
- The failure mode is opaque. `Unable to acquire impersonated credentials` covers at least four distinct causes, which is why `cloud/github-actions.md` has a dedicated troubleshooting section.
- It requires understanding OIDC to debug confidently. A key either works or does not.
- Deleted Workload Identity Pools are soft-deleted for 30 days and their names stay reserved, which surprises people who tear down and rebuild.

**Neutral**

- Two GitHub secrets (`WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`) are still needed, but neither is a credential — both are resource identifiers, useless without a valid token from this repository.

## Revisit when

Nothing foreseeable makes stored keys the better choice again. If Google ships a more direct GitHub integration, or GitHub ships native GCP OIDC support that removes the pool and provider setup, adopt it — the principle (no long-lived credentials) stays, only the mechanism changes.

## References

- [Google Cloud: Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [GitHub: OIDC hardening](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [`cloud/github-actions.md`](../../cloud/github-actions.md)
