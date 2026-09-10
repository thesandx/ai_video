## What changed

<!-- One or two sentences. What does this PR do, in plain language? -->

## Why

<!-- The problem this PR solves, or a link to the issue. Reviewers need the
     intent, not just a diff. -->

Closes #

## How

<!-- Notable implementation decisions, and anything you rejected. If this
     changes architecture, say so — and update the docs (see below). -->

## Checklist

- [ ] `pnpm validate` passes locally (typecheck, lint, format, tests)
- [ ] New code follows the folder conventions in `.github/instructions/project-structure.md`
- [ ] Client Components are justified — anything with `'use client'` genuinely needs it
- [ ] No new dependency, or the PR explains why one was unavoidable
- [ ] New environment variables are added to **both** `.env.example` and `lib/env.ts`
- [ ] Documentation updated if architecture, deployment or workflows changed
- [ ] No secrets, keys or credentials in the diff

## Deployment notes

<!-- Anything that must happen outside this PR: new Cloud Run env vars, a new
     Secret Manager entry, an IAM grant, a migration. Write "None" if none. -->

None
