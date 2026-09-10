# ADR-0001: Use Cloud Run for hosting

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** Platform engineering

## Context

This template is the starting point for a number of production Next.js applications. Small teams without dedicated infrastructure operators build them, and they must be deployable immediately and affordable at low traffic.

The constraints:

- The rest of the organisation's infrastructure is on Google Cloud. Splitting the stack across providers means two IAM models, two billing accounts and two audit trails.
- Most of these applications will have modest, bursty traffic. Paying for idle capacity 24/7 is wasteful.
- Nobody wants to operate a Kubernetes cluster for a web frontend.
- Server-side rendering means real compute, not just static hosting.

## Decision

We will deploy to **Google Cloud Run**, as a container built by GitHub Actions and stored in Artifact Registry.

## Alternatives considered

### Option A — Cloud Run (chosen)

Fully managed containers. Scales to zero, bills per 100ms of request time, terminates TLS, and integrates natively with GitHub OIDC, Cloud Logging and Secret Manager.

The container abstraction is the deciding factor: what runs in CI, in a local `docker compose`, and in production is byte-identical. That eliminates an entire class of "works locally" failure.

### Option B — Vercel

The path of least resistance for Next.js: zero configuration, best-in-class DX, and features (ISR, edge middleware, image optimisation) that are first-party rather than approximated.

Rejected because it splits the stack. Application logs live in one vendor and everything else the applications talk to lives in Google Cloud, so correlating an incident means two consoles. Pricing also scales with function invocations and bandwidth in a way that becomes hard to predict. The platform owns the deployment pipeline, which means less control exactly when something goes wrong.

Worth revisiting for a project that is purely a marketing site with no Google Cloud dependencies.

### Option C — Google Kubernetes Engine

Maximum control, and the right answer for a system of many services with complex networking.

Rejected as disproportionate. A cluster is a thing that must be upgraded, secured, monitored and paid for even when nothing is running. For a single stateless web frontend, that is operational cost with no corresponding benefit.

### Option D — App Engine

Also serverless, also Google Cloud. Rejected because it is effectively in maintenance mode for new workloads: Cloud Run is where the platform investment goes, the container model is more portable, and the local-development story is better.

### Option E — A VM on Compute Engine

Cheapest at steady high load, and completely under our control.

Rejected because it means owning OS patching, process supervision, TLS certificate renewal, log shipping and a load balancer — all of which Cloud Run provides. It also does not scale to zero, so idle cost is constant.

## Consequences

**Good**

- No infrastructure to operate. No cluster, no VMs, no patching.
- Scale-to-zero: an idle service costs nothing.
- Autoscaling with a hard, configurable ceiling that bounds both load and spend.
- Managed TLS and a URL on the first deploy.
- Container parity between local, CI and production.
- Native Workload Identity Federation, so the pipeline needs no stored credentials (see [ADR-0002](./0002-use-workload-identity-federation.md)).
- Rollback is a traffic shift to an existing revision — seconds, no rebuild.

**Bad**

- Cold starts. Mitigated with `--cpu-boost` and, where latency matters, `--min-instances=1` at roughly $10–15/month.
- We own the Dockerfile and the pipeline. That is more initial work than `git push` to Vercel.
- Next.js features that assume Vercel's infrastructure — edge middleware, ISR at the CDN layer — need adaptation or do not apply.
- 300s maximum request duration. Long-running work must move to Cloud Tasks.
- No built-in CDN. A global audience needs Cloud Load Balancer plus Cloud CDN in front.

**Neutral**

- Deployment is GitHub Actions rather than a platform integration: more YAML, more control.
- Regional, not global. Multi-region is possible but explicit.

## Revisit when

- The application needs sub-100ms responses worldwide, and a load balancer plus CDN is not enough.
- Cold starts become user-visible even with `--min-instances`.
- The system grows into many interdependent services with service-mesh requirements — at which point GKE earns its operational cost.
- A project has no other Google Cloud dependencies, making Vercel's DX advantage free of the split-stack penalty.

## References

- [Cloud Run documentation](https://cloud.google.com/run/docs)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/getting-started/deploying)
- [`cloud/architecture.md`](../../cloud/architecture.md)
