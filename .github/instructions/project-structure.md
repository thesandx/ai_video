# Project structure

Where every file goes, and why. **This layout is fixed** — see rule 1 in [coding-rules.md](./coding-rules.md).

## The tree

```
.
├── app/                    # Next.js App Router: routes, layouts, route handlers
│   ├── api/                #   Route handlers (server-side HTTP endpoints)
│   │   └── health/         #     GET /api/health — liveness probe
│   ├── error.tsx           #   Route-segment error boundary (Client Component)
│   ├── layout.tsx          #   Root layout — must stay a Server Component
│   ├── not-found.tsx       #   404 page
│   └── page.tsx            #   GET / — the Hello World page
│
├── components/             # Reusable React components
│   ├── ui/                 #   Presentational primitives: Button, Card, Input
│   └── layout/             #   Structural chrome: Header, Footer, Sidebar
│
├── hooks/                  # Reusable React hooks (client-side by definition)
├── lib/                    # Pure utilities, config, cross-cutting concerns
│   ├── env.ts              #   Validated environment variables — the ONLY
│   │                       #   place process.env is read
│   ├── logger.ts           #   Structured logging for Cloud Logging
│   └── utils.ts            #   Small generic helpers
│
├── services/               # External I/O: APIs, databases, cloud SDKs
├── types/                  # Shared TypeScript types
│   └── index.ts
│
├── public/                 # Static assets served verbatim from the web root
├── styles/                 # Global CSS and design tokens
│   └── globals.css
│
├── tests/                  # Test setup and cross-cutting test helpers
│
├── docs/                   # Documentation for humans working on the app
│   ├── adr/                #   Architecture Decision Records
│   ├── local-development.md
│   ├── testing.md
│   └── troubleshooting.md
│
├── cloud/                  # Google Cloud infrastructure documentation
│   ├── README.md
│   ├── architecture.md
│   ├── deployment.md
│   ├── artifact-registry.md
│   ├── environment-variables.md
│   ├── github-actions.md
│   └── terraform.md
│
├── scripts/                # Executable operational scripts
│   ├── gcp-bootstrap.sh    #   One-time GCP + Workload Identity setup
│   ├── docker-build.sh
│   ├── docker-run.sh
│   └── rename-project.sh
│
├── .github/
│   ├── workflows/          #   CI/CD pipelines
│   ├── instructions/       #   Rules for AI assistants (this folder)
│   ├── ISSUE_TEMPLATE/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   └── pull_request_template.md
│
├── CLAUDE.md               # Entry point for AI assistants
├── Dockerfile              # Multi-stage production image
├── docker-compose.yml      # Run the production image locally
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
└── package.json
```

## Decision table — "where does this file go?"

| I am writing...                           | It goes in                |
| ----------------------------------------- | ------------------------- |
| A page at a URL                           | `app/<route>/page.tsx`    |
| A shared shell around routes              | `app/<route>/layout.tsx`  |
| An HTTP endpoint                          | `app/api/<name>/route.ts` |
| A loading skeleton                        | `app/<route>/loading.tsx` |
| A button, card, modal — no business logic | `components/ui/`          |
| A header, footer, page shell              | `components/layout/`      |
| A component used by one feature only      | `components/<feature>/`   |
| A `use...` React hook                     | `hooks/use<Thing>.ts`     |
| A pure function with no I/O               | `lib/`                    |
| Anything that calls an external system    | `services/`               |
| A type used in more than one place        | `types/`                  |
| A type used in exactly one place          | Next to its consumer      |
| An image, font, favicon, `robots.txt`     | `public/`                 |
| A CSS custom property or global style     | `styles/globals.css`      |
| A shell script humans run                 | `scripts/`                |
| An explanation of how something works     | `docs/`                   |
| An explanation of the cloud setup         | `cloud/`                  |
| A rule for future assistants              | `.github/instructions/`   |

## The distinctions people get wrong

### `lib/` vs `services/`

|                                        | `lib/`                           | `services/`                   |
| -------------------------------------- | -------------------------------- | ----------------------------- |
| Side effects                           | None                             | Network, database, cloud APIs |
| Testable without mocks                 | Yes                              | No                            |
| May read secrets                       | Only `env.ts`                    | Yes                           |
| Safe to import from a Client Component | Yes (except `env` server fields) | **No**                        |

`formatCurrency()` is `lib/`. `fetchExchangeRates()` is `services/`.

### `components/ui/` vs `components/<feature>/`

`components/ui/` knows nothing about the domain. A `Button` that mentions "invoice" is not a UI primitive — it belongs in `components/invoices/`.

### `types/` vs colocated types

If two modules import it, it goes in `types/`. If one does, keep it next to that module. Premature centralisation makes types hard to find. Late centralisation is a two-minute refactor.

## File naming

| Kind              | Convention             | Example                     |
| ----------------- | ---------------------- | --------------------------- |
| React component   | `PascalCase.tsx`       | `components/ui/Button.tsx`  |
| Hook              | `camelCase.ts`         | `hooks/useMediaQuery.ts`    |
| Utility / service | `kebab-case.ts`        | `lib/format-currency.ts`    |
| Service module    | `<domain>.service.ts`  | `services/user.service.ts`  |
| Test              | `<subject>.test.ts(x)` | `lib/utils.test.ts`         |
| Next.js special   | Reserved lowercase     | `page.tsx`, `route.ts`      |
| Docs              | `kebab-case.md`        | `docs/local-development.md` |

## Imports

Always absolute, via the `@/*` alias:

```ts
import { Button } from '@/components/ui/Button';
import { env } from '@/lib/env';
import type { HealthStatus } from '@/types';
```

Never `../../../lib/env`. A relative import breaks when a file moves. It also hides which layer a module belongs to.

`eslint-plugin-simple-import-sort` enforces the ordering automatically — run `pnpm lint:fix` rather than hand-sorting.

## Placeholder folders

`components/`, `hooks/` and `services/` ship with only a `README.md`. Each README holds the conventions for that folder. Read the relevant one before you add the first real file. Keep it accurate as the folder grows.
