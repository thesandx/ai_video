# CLAUDE.md

**Read this file completely before making any change.** It is the operating manual for AI coding assistants (Claude Code, Copilot, Cursor, ChatGPT) and new human contributors working in this repository.

It exists because several things here look wrong but are correct. Several obvious "improvements" break the build or the deploy. [Traps](#traps--things-that-look-wrong-and-are-not) and [Never do this](#never-do-this) record them. Both sections come from real failures, not speculation.

---

## Table of contents

1. [What this is](#what-this-is)
2. [Verified state](#verified-state)
3. [Documentation map](#documentation-map)
4. [Commands](#commands)
5. [The twelve rules](#the-twelve-rules)
6. [Where files go](#where-files-go)
7. [Architecture in brief](#architecture-in-brief)
8. [Traps — things that look wrong and are not](#traps--things-that-look-wrong-and-are-not)
9. [Never do this](#never-do-this)
10. [Task recipes](#task-recipes)
11. [Verification protocol](#verification-protocol)
12. [Dependency policy](#dependency-policy)
13. [Security invariants](#security-invariants)
14. [Decision log](#decision-log)

---

## What this is

A production Next.js application deployed to Google Cloud Run, generated from a template. If the app still contains only the Hello World page at `app/page.tsx`, it has not been customised yet.

The template's purpose is that **the path to production already works**: a container that runs on Cloud Run, a pipeline that deploys it without storing any credential, and documentation that explains each decision. The application is deliberately trivial. Everything else is the reusable part — do not degrade it.

---

## Verified state

A clean install, a full build, a `--no-cache` Docker build and a running container confirmed the versions below work together. Do not assume a newer version works. See [Dependency policy](#dependency-policy).

|                      | Version    | Note                                     |
| -------------------- | ---------- | ---------------------------------------- |
| Next.js              | `16.2.10`  | App Router, Turbopack                    |
| React / React DOM    | `19.2.7`   |                                          |
| TypeScript           | `^6.0.3`   | Major bump; **do not add `baseUrl`**     |
| ESLint               | `^9.39.5`  | **Pinned to 9 deliberately** — see traps |
| `eslint-config-next` | `16.2.10`  | Must track the Next version              |
| Tailwind CSS         | `^4.3.3`   | v4, CSS-first config                     |
| Vitest               | `^4.1.10`  | jsdom + React Testing Library            |
| Node                 | `>=22.0.0` | `.nvmrc` pins `22.20.0`                  |
| pnpm                 | `11.15.1`  | Via `packageManager` + corepack          |

**Measured facts:**

- The production image is **~64 MB** as stored and transferred (`docker save`, `docker image inspect .Size`) — this is what a registry holds and Cloud Run pulls.
- The container boots and answers `/api/health` in ~2s.
- It responds to `SIGTERM` in ~1s.
- It runs as `uid=1001(nextjs)` on a read-only root filesystem.

> Docker Desktop may display **~278 MB** for the same image. It is not a different image — Desktop's containerd image store reports the _unpacked on-disk_ size, while `docker save` and registries measure the compressed content. Both numbers are real. They measure different things.

---

## Documentation map

This file is the index and the warnings. The detail lives in `.github/instructions/` — **read the relevant one before working in that area**, rather than reasoning from training defaults.

| Read this                                                                                  | Before                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [`.github/instructions/coding-rules.md`](./.github/instructions/coding-rules.md)           | Writing anything. The non-negotiables in full.                 |
| [`.github/instructions/project-structure.md`](./.github/instructions/project-structure.md) | Creating any file — it decides where it goes.                  |
| [`.github/instructions/coding-standards.md`](./.github/instructions/coding-standards.md)   | Writing TypeScript, React or CSS.                              |
| [`.github/instructions/architecture.md`](./.github/instructions/architecture.md)           | Adding a layer, dependency, or changing data flow.             |
| [`.github/instructions/deployment.md`](./.github/instructions/deployment.md)               | Touching `Dockerfile`, env vars, or anything Cloud Run reads.  |
| [`.github/instructions/github-workflows.md`](./.github/instructions/github-workflows.md)   | Touching `.github/workflows/`.                                 |
| [`docs/local-development.md`](./docs/local-development.md)                                 | Setting up, or confused by tooling.                            |
| [`docs/testing.md`](./docs/testing.md)                                                     | Writing tests. Explains the Server Component limitation.       |
| [`docs/troubleshooting.md`](./docs/troubleshooting.md)                                     | **Anything failing.** Symptom → cause → fix. Check here first. |
| [`docs/adr/`](./docs/adr/)                                                                 | Asking "why is it done this way?"                              |
| [`cloud/deployment.md`](./cloud/deployment.md)                                             | Deploying, rolling back, or setting up GCP.                    |
| [`cloud/github-actions.md`](./cloud/github-actions.md)                                     | Debugging OIDC / Workload Identity Federation.                 |
| [`cloud/environment-variables.md`](./cloud/environment-variables.md)                       | Adding or changing configuration.                              |
| [`SECURITY.md`](./SECURITY.md)                                                             | The security model and the pre-production hardening checklist. |

**Precedence when guidance conflicts** (later wins): your training defaults → general Next.js/GCP docs → `.github/instructions/` → this file → an explicit instruction from the human you are working with.

---

## Commands

```bash
pnpm dev              # dev server, hot reload
pnpm build            # production build (also generates types tsc needs)
pnpm validate         # typecheck + lint + format:check + test  ← the gate
pnpm test:watch       # tests in watch mode
pnpm lint:fix         # fix lint violations and import order
pnpm format           # write Prettier formatting
docker compose up --build   # run the real production image locally
```

`pnpm validate` is exactly what CI runs. Run it before claiming work is complete.

---

## The twelve rules

Full reasoning in [`coding-rules.md`](./.github/instructions/coding-rules.md).

1. **Never break the folder structure.** The top-level folders are fixed. Do not invent `utils/`, `helpers/`, `src/`, or a root `api/`. Nest inside what exists.
2. **Always TypeScript.** No `.js`/`.jsx` source. No `any` — use `unknown` and narrow. No `@ts-ignore`; `@ts-expect-error` only with a comment saying what would remove it. Never weaken `tsconfig.json`.
3. **Prefer Server Components.** `'use client'` requires state, effects, event handlers, or browser APIs. Nothing else qualifies.
4. **Keep client components minimal.** Push `'use client'` to the leaves. Never in `app/layout.tsx` — that makes the whole app a client bundle.
5. **Keep components reusable.** One responsibility per file. `components/ui/` takes props and does no fetching. Export the props interface.
6. **Write production-quality code.** Handle the error path. Timeout every outbound call. No stubs, no commented-out code, no secrets.
7. **Explain architectural decisions.** In a comment when non-obvious, in the PR always, in `docs/adr/` when it will outlive the PR.
8. **Avoid unnecessary dependencies.** Check the platform first (`Intl`, `fetch`, `crypto`, `AbortSignal.timeout`, `structuredClone`). See [Dependency policy](#dependency-policy).
9. **Update docs when architecture or behaviour changes** — same PR, not later.
10. **Verify before claiming.** See [Verification protocol](#verification-protocol).
11. **Design mobile-first.** Every UI works on a small screen first, then scales up. Unprefixed Tailwind utilities are the phone layout; add `sm:`/`md:`/`lg:` to enhance for wider screens — never the reverse. No fixed widths that overflow a phone, no horizontal scroll on the body, touch targets ≥44px. Responsiveness is a requirement, not a finishing touch.
12. **Write docs in Simplified Technical English (ASD-STE100).** Every Markdown document — this file, `.github/instructions/`, `docs/`, `cloud/`, ADRs, READMEs — follows the standard. Short sentences (≤20 words for an instruction, ≤25 for a description), one instruction per sentence, active voice, present tense, one topic per paragraph, and one approved term per concept. Write for a non-native reader; choose the plain word over the clever one. Bring a document into compliance when you touch it.

---

## Where files go

| Writing                               | Goes in                   |
| ------------------------------------- | ------------------------- |
| A page at a URL                       | `app/<route>/page.tsx`    |
| An HTTP endpoint                      | `app/api/<name>/route.ts` |
| A generic button/card/input           | `components/ui/`          |
| Header, footer, page shell            | `components/layout/`      |
| A component for one feature           | `components/<feature>/`   |
| A `use...` hook                       | `hooks/use<Thing>.ts`     |
| A pure function, no I/O               | `lib/`                    |
| Anything calling an external system   | `services/`               |
| A type used in 2+ places              | `types/`                  |
| A type used once                      | Next to its consumer      |
| Images, fonts, `robots.txt`           | `public/`                 |
| A global style or design token        | `styles/globals.css`      |
| A script humans run                   | `scripts/`                |
| An explanation of how something works | `docs/`                   |
| An explanation of the cloud setup     | `cloud/`                  |

**Naming:** components `PascalCase.tsx`; hooks `camelCase.ts`; utilities/services `kebab-case.ts`; tests `<subject>.test.ts(x)`; docs `kebab-case.md`.

**Imports are always absolute** via `@/*` — `@/lib/env`, never `../../../lib/env`. `eslint-plugin-simple-import-sort` enforces ordering. Run `pnpm lint:fix` rather than hand-sorting.

---

## Architecture in brief

Dependencies point **inward**. A layer may import from layers below it, never above.

```
app/          routes, layouts, route handlers      ← composition
components/   presentation
hooks/        client-side interaction
services/     external I/O (network, DB, cloud)    ← side effects
lib/          pure utilities, config, logging      ← no side effects
types/        shared contracts
```

**Allowed:** `app/` → `components/` → `lib/`; `app/` → `services/` → `lib/`
**Forbidden:** `lib/` → `services/`; `components/ui/` → `services/`; anything → `app/`

Deployment: `git push main` → GitHub Actions → OIDC → Artifact Registry → Cloud Run. The pipeline tags each image with the commit SHA and deploys it by that immutable tag, so a rollback is a traffic shift, not a rebuild.

---

## Traps — things that look wrong and are not

Every item here caused a real failure. Do not "fix" any of them without reading the reason.

### 1. CI runs `build` _before_ `typecheck`

Looks backwards. It is not. `next build` generates `next-env.d.ts` and `.next/types/**`, which `tsc --noEmit` needs to resolve JSX and typed routes. Both are gitignored, so on a clean checkout they do not exist. Reverse the order and typecheck fails in CI with errors that reproduce nowhere locally.

**Same reason:** on a fresh clone, `pnpm typecheck` fails until you have run `pnpm build` (or `pnpm dev`) once.

### 2. `tsconfig.json` has no `baseUrl`

Deliberately removed. TypeScript 6 raises `TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`. `paths` entries resolve relative to the `tsconfig.json` that declares them, so `baseUrl` was never needed. **Do not add it back**; it will break the build on the current TypeScript.

### 3. ESLint is pinned to 9, not 10

Not neglect. ESLint 10 fails with:

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

`eslint-plugin-react`, pulled in transitively by `eslint-config-next`, still uses the ESLint 9 rule-context API. Nothing in this repo can configure around it. Dependabot will keep proposing 10; it stays closed until `eslint-config-next` ships support.

### 4. `next.config.ts` has no `eslint` key

Next.js 16 removed it along with `next lint`. Adding `eslint: { ignoreDuringBuilds: false }` is a **build-breaking type error**. Linting is its own CI step (`pnpm lint`).

### 5. pnpm `minimumReleaseAge` and Dependabot `cooldown` are coupled

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (24h) — a supply-chain control that refuses freshly published packages. `.github/dependabot.yml` sets `cooldown` to 5–14 days, deliberately **longer**, so bot PRs only propose versions that already clear the gate.

**Change one, change the other.** Otherwise every Dependabot PR fails `pnpm install --frozen-lockfile` through no fault of the change.

Two further hazards:

- The gate applies to **every lockfile entry, including transitive ones you never chose**. Raising `minimumReleaseAge` above the age of the youngest package in `pnpm-lock.yaml` breaks CI and the Docker build. (Setting it to 3 days did exactly this.)
- pnpm **caches** the verification verdict, so a local `pnpm install --frozen-lockfile` can print `verified Nm ago` and pass without re-checking. `docker build --no-cache` is the honest test.

### 6. `output: 'standalone'` is load-bearing

In `next.config.ts`. The Dockerfile's runtime stage copies `.next/standalone`. Remove the option and the image builds but the container dies with `Cannot find module '/app/server.js'`. It is also what keeps the image at ~64 MB instead of ~1.2 GB.

`.next/static` is **not** included in the standalone output — that is why the Dockerfile copies it separately. Delete that line and the site renders unstyled.

### 7. The container must bind `0.0.0.0` and honour `$PORT`

`ENV HOSTNAME=0.0.0.0` and `ENV PORT=8080` in the Dockerfile's runtime stage. A container that binds localhost is unreachable from outside. This produces Cloud Run's least helpful error:

> The user-provided container failed to start and listen on the port defined by the PORT environment variable.

`PORT` is a default, not a constant — Cloud Run overrides it. Never hardcode a port.

### 8. `NEXT_PUBLIC_*` is inlined at build time and is public

Changing it on the Cloud Run service does nothing; the value is already inside the JavaScript users downloaded. **Rebuild the image.** And never put a credential behind that prefix — it ships to every browser.

### 9. pnpm blocks dependency install scripts

By design. `allowBuilds` in `pnpm-workspace.yaml` lists the only packages permitted to run lifecycle scripts (`sharp`, `unrs-resolver`). Adding a package that needs one is a deliberate, explained decision — not a config annoyance to switch off.

### 10. Async Server Components cannot be unit-tested

React Testing Library cannot render them. Test the `services/`/`lib/` helpers they call, and the presentational components they render. **Synchronous** Server Components (like `app/page.tsx`) render fine. See [`docs/testing.md`](./docs/testing.md).

### 11. CodeQL needs code scanning enabled

Free on **public** repositories only. On a private repo without GitHub Advanced Security the analysis runs, scans everything, then fails at upload with `Code scanning is not enabled for this repository`. If you generate a private project from this template: buy GHAS or delete `codeql.yml`. Do not leave a permanently red check — a check everyone ignores is worse than no check.

### 12. `dumb-init` is PID 1

Without it, Node ignores `SIGTERM`. Cloud Run waits 10s, then sends `SIGKILL`, and drops in-flight requests on every deploy. Verified: the container currently stops in ~1s.

---

## Never do this

Violations here are defects, not style disagreements.

| Never                                                                | Why                                                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push or commit directly to `main`                                    | Every change reaches `main` through a reviewed pull request. A push to `main` deploys to production — see [Architecture in brief](#architecture-in-brief). |
| Commit a service account key, or write `credentials_json:`           | The pipeline is keyless by design. A key is a permanent bearer credential. See [ADR-0002](./docs/adr/0002-use-workload-identity-federation.md).            |
| Interpolate `${{ secrets.* }}` into a `run:` block                   | It splices into shell source before execution. Pass via `env:` instead.                                                                                    |
| Deploy the `:latest` tag                                             | A revision pinned to a moving tag cannot be traced to a commit, and rollback becomes a rebuild.                                                            |
| Read `process.env` outside `lib/env.ts`                              | Untyped, unvalidated, and bypasses startup validation.                                                                                                     |
| Use `console.log` for application logging                            | Use `@/lib/logger` — it emits the JSON shape Cloud Logging parses.                                                                                         |
| Add `'use client'` to `app/layout.tsx`                               | Turns the entire application into a client bundle.                                                                                                         |
| Create a new top-level folder                                        | Breaks cross-project consistency. Raise it instead.                                                                                                        |
| Weaken `tsconfig.json` strictness                                    | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are load-bearing.                                                                       |
| Disable a CI check to make a PR green                                | Fix the code, or change the check deliberately and say why.                                                                                                |
| Put a secret in a Docker build arg                                   | Visible in `docker history`. Use Secret Manager at runtime.                                                                                                |
| Push, claim work is done, or open a PR without `pnpm validate` green | Run it locally first — `format:check` included. CI must never fail from your end. See [Verification protocol](#verification-protocol).                     |

---

## Task recipes

### Add an environment variable — four places, one PR

Missing any step breaks somebody:

1. `.env.example` — document purpose, valid values, default, whether required in production
2. `lib/env.ts` — declare and validate it
3. `.github/workflows/deploy.yml` — a build arg (+ `Dockerfile` `ARG`/`ENV`) if `NEXT_PUBLIC_*`, otherwise an `env_vars` entry
4. `cloud/environment-variables.md` — note it if operators need context

### Add a component

1. Decide the folder: `ui/` (generic) vs `layout/` vs `<feature>/`
2. Server Component unless it needs state/effects/handlers/browser APIs
3. Export the props interface; accept `className`
4. Semantic HTML, accessible name, keyboard reachable
5. Tailwind utilities using tokens from `styles/globals.css` — no raw hex
6. Mobile-first: base styles target the phone; layer `sm:`/`md:`/`lg:` for wider screens. Fluid widths (`w-full`, `max-w-*`), no fixed pixel widths that overflow, touch targets ≥44px. Verify at 320px wide and up
7. Colocate `<Name>.test.tsx`

### Change the Dockerfile

1. Read [`.github/instructions/deployment.md`](./.github/instructions/deployment.md) first
2. Keep: `output: 'standalone'`, the separate `.next/static` copy, `USER nextjs`, `dumb-init`, `HOSTNAME=0.0.0.0`
3. **Verify**: `docker compose up --build`, then `curl localhost:8080/api/health`, then `docker compose ps` must say `healthy`

### Add a dependency

Read [rule 8](./.github/instructions/coding-rules.md#8-avoid-unnecessary-dependencies). If still justified: `pnpm add [-D] <pkg>`, commit `pnpm-lock.yaml`, and expect one of pnpm's two safety nets to stop you — see [Dependency policy](#dependency-policy).

### Triage a failing Dependabot PR

**Distinguish our bug from their incompatibility.** Both have happened here:

- `TS5101 baseUrl is deprecated` → **our** config was wrong; fixing it unblocked the upgrade
- `contextOrFilename.getFilename is not a function` → **upstream**; close the PR with the reason

Read the failing step before deciding. Close with a comment that explains _why_, so nobody reopens the question in three months.

---

## Verification protocol

**Never describe unverified work as working.** If a check fails, report the failure with its output.

**Run `pnpm validate` and get it green _before every push_ — never push work that will fail CI from your end.** It is exactly what CI runs, so a green local run is a green CI run. A push that turns CI red on something you could have run locally wastes a CI round and a review cycle.

Minimum, always — before you push:

```bash
pnpm validate     # typecheck + lint + format:check + test
```

- **`format:check` is part of `pnpm validate`, not optional.** The most common self-inflicted CI failure is a Prettier miss — for example, editing a Markdown table re-widens its columns. CI fails it exactly like a type error. Run `pnpm format` (which writes the fix), then re-run `pnpm validate` before you push.
- **If you cannot run `pnpm validate` locally** (dependencies not installed), run `pnpm install` and the gate. If you truly cannot, do not push silently — say so explicitly and treat the work as unverified.
- **After you push, watch the checks.** If CI still fails, fix it and push again; work is not done until CI is green.

If you touched `Dockerfile`, `next.config.ts`, `package.json`, or the env model:

```bash
docker compose up --build
curl localhost:8080/api/health   # must return 200 with the expected version
docker compose ps                # must say "healthy", not just "running"
```

If you touched dependencies or `pnpm-workspace.yaml`:

```bash
rm -rf node_modules .next && pnpm install --frozen-lockfile
docker build --no-cache -t verify .    # the only honest supply-chain check
```

If you touched a workflow: YAML that parses is not a workflow that runs. `pr-validation.yml` validates itself on a PR; `deploy.yml` only runs on `main`.

Merging several dependency PRs? **Verify the merged tree**, not just each PR. CI tested each PR against a different baseline, and they have never run together until now.

---

## Dependency policy

Before adding anything, answer: can the platform do it? Can it be ~50 lines in `lib/`? Is it maintained? What does it cost the client bundle?

**Never add:** a date library where `Intl` suffices; `lodash` for one function; an HTTP wrapper around `fetch`; a state library before there is state.

Two pnpm safety nets will stop you, and both are deliberate:

- **`Ignored build scripts`** → the package wants a lifecycle script. Add to `allowBuilds` in `pnpm-workspace.yaml` and explain why.
- **`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`** → the version is under 24h old. pnpm adds an entry to `minimumReleaseAgeExclude`; commit it, then **prune it** once the version ages past the window. Empty is the healthy steady state.

**Upgrade philosophy:** `latest` on npm is not the same as _supported_. This repo tracks what `create-next-app` scaffolds, because that is what the framework tests. TypeScript 7 and ESLint 10 are both "latest" and both break the toolchain today.

---

## Security invariants

Full model in [`SECURITY.md`](./SECURITY.md).

- **No long-lived credentials exist.** CI authenticates via Workload Identity Federation with a short-lived OIDC token bound to this repository by an attribute condition.
- **Two identities, deliberately separate.** The deployer service account can push images and deploy; it cannot read application data. The runtime service account can read its own secrets; it cannot deploy.
- **The container is hardened:** non-root uid 1001, no source/dev-deps/package manager in the final image, pinned base image, read-only root filesystem, `no-new-privileges`.
- **Workflows are least-privilege:** `contents: read` by default, `id-token: write` only where OIDC is needed, `persist-credentials: false` on checkout. PR validation needs **no** cloud credentials — keep it that way so fork PRs work.
- **Secrets** come from Secret Manager at runtime. Never a build arg, never `NEXT_PUBLIC_*`, never the repository.

---

## Decision log

Recorded in [`docs/adr/`](./docs/adr/). Read before proposing a change to any of them.

| ADR                                                         | Decision                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [0001](./docs/adr/0001-use-cloud-run-for-hosting.md)        | Cloud Run for hosting — over Vercel, GKE, App Engine, a VM   |
| [0002](./docs/adr/0002-use-workload-identity-federation.md) | Workload Identity Federation — no service account keys, ever |

Add an ADR when a decision is expensive to reverse, affects how everyone works, or rejects an obvious alternative. Never edit an accepted ADR to change its decision — write a new one that supersedes it, and link both ways.

---

## If a rule here blocks you

Say so explicitly and propose a change to the rule. Do not silently work around it, and do not disable a check to force a green result. If you change how something works, update the relevant document in the same change. A stale rulebook is worse than none: assistants follow it with confidence and produce confidently wrong code.
