# Coding rules

The non-negotiables. Everything else in this folder elaborates on these.

---

## 1. Never break the folder structure

The top-level folders (`app/`, `components/`, `hooks/`, `lib/`, `services/`, `types/`, `styles/`, `public/`, `docs/`, `scripts/`, `cloud/`, `.github/`) are fixed. Every file has exactly one correct home.

- **Do not invent new top-level folders.** No `utils/` next to `lib/`, no `helpers/`, no `api/` at the root, no `src/`.
- If something does not fit, that is a signal to discuss the architecture — not to create a folder. Raise it, propose it, and update `project-structure.md` in the same PR if it is accepted.
- Nest inside the existing folders instead: `components/checkout/`, `services/billing/`, `types/billing.ts`.

**Why:** dozens of projects come from this template. When layouts diverge, cross-project navigation, shared tooling and every assistant's assumptions break at once.

---

## 2. Always use TypeScript

- No `.js` or `.jsx` source files. Configuration files may be `.mjs` where the tool requires it.
- No `any`. It is an ESLint error. When a type is genuinely unknown, use `unknown` and narrow it.
- No `@ts-ignore`. `@ts-expect-error` is permitted **only** with a comment explaining why and what would remove it.
- Never weaken `tsconfig.json`. `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are load-bearing.
- Type the boundaries: exported function signatures, component props, API payloads. Let inference handle local variables.

**Why:** the strict settings let you refactor with confidence. Every escape hatch converts a compile-time error into a production incident.

---

## 3. Prefer Server Components

Every component is a Server Component unless it cannot be.

**Legitimate reasons for `'use client'`:**

- `useState`, `useReducer`, `useEffect`, `useRef`
- Event handlers (`onClick`, `onChange`, ...)
- Browser-only APIs (`window`, `localStorage`, `IntersectionObserver`)
- Context providers, and third-party libraries that use any of the above

**Not legitimate reasons:** "it's what I'm used to", "it might need state later", "the parent is a client component so why not".

---

## 4. Keep client components minimal

`'use client'` is contagious: everything a client component imports becomes client code.

- Push the boundary **down** the tree, toward the leaves. Wrap the interactive button, not the page.
- Server Components can render Client Components and pass them data as props. The reverse does not work — a Client Component cannot import a Server Component, only receive one via `children`.
- Never put `'use client'` in `app/layout.tsx`. That turns the entire application into a client bundle.
- Anything you pass across the boundary must be serialisable — no functions, no class instances, no `Date` inside deeply nested objects you did not check.

---

## 5. Keep components reusable

- One component, one responsibility, one file.
- Presentational components (`components/ui/`) take data as props and do no fetching.
- No hidden coupling to a route, a global, or a specific parent.
- Export the props interface so the component can be composed and tested.
- Before you write a component, check whether one already exists. A duplicate `Button` slowly breaks the design system.

---

## 6. Write production-quality code

Assume this code runs in production tonight, for real users.

- Handle the error path. Every `fetch` gets a timeout and a failure branch.
- Log through `@/lib/logger`, never bare `console.log`.
- No `TODO` left as the implementation. No commented-out code. No stubs that silently return empty data.
- No secrets in source, ever — not in a comment, not in a test fixture, not "temporarily".
- Validate input at trust boundaries: request bodies, query params, third-party responses.

---

## 7. Explain architectural decisions

When you choose between real alternatives, record the reasoning.

- In the code: a short comment explaining **why**, when the reason is not obvious from the code. Comments explain intent; the code already shows mechanism.
- In the PR: what you chose, what you rejected, and the trade-off.
- For decisions that will outlive the PR, add an ADR in `docs/adr/`.

Without a recorded reason, the next person who finds a decision inconvenient just reverts it.

---

## 8. Avoid unnecessary dependencies

Every dependency is permanent attack surface, install time, bundle weight and an upgrade obligation.

Before adding one, answer all of these:

1. Can the platform do it? (`Intl`, `fetch`, `crypto`, `URL`, `AbortSignal.timeout`, `structuredClone`)
2. Can it be done in under ~50 lines in `lib/`?
3. Is it maintained — releases in the last 6 months, no critical advisories?
4. What does it cost the client bundle? (Zero, for a server-only dependency.)

Adding one anyway? Say why in the PR. Adding a _transitive-heavy_ one (a package with 20+ dependencies) needs explicit human agreement.

**Never add:** a date library where `Intl.DateTimeFormat` suffices, `lodash` for one function, an HTTP client wrapper around `fetch`, a state library before there is state to manage.

---

## 9. Always update documentation when architecture or behaviour changes

Same PR. Not "later". This covers a change in **how something works**, not only a change in structure — if the observable behaviour of a module, endpoint, or config differs, the docs that describe it change with it.

| If you change...                    | Update...                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Folder layout                       | `project-structure.md`, README structure section                                    |
| Data flow, layers, a new dependency | `architecture.md`, `cloud/architecture.md`                                          |
| `Dockerfile`, runtime configuration | `deployment.md`, `cloud/deployment.md`, README                                      |
| A workflow in `.github/workflows/`  | `github-workflows.md`, README                                                       |
| Any environment variable            | `.env.example` **and** `lib/env.ts` **and** `cloud/environment-variables.md`        |
| How a module or endpoint behaves    | its doc comment, `.env.example`, and any guide or troubleshooting that describes it |
| A convention or rule                | the relevant file in this folder                                                    |

---

## 10. Verify before you claim — and before you push

- **Run `pnpm validate` before every push, not only before you claim the work is done.** It is exactly what CI runs (typecheck + lint + format:check + test), so a green local run is a green CI run. **CI must never fail on something you could have caught locally.**
- **`format:check` is part of the gate.** The most common self-inflicted CI failure is a Prettier miss — for example, editing a Markdown table re-widens its columns. Run `pnpm format` to write the fix, then re-run `pnpm validate` before you push.
- If a check fails, report the failure with its output. Do not describe unverified work as working.
- If you cannot run `pnpm validate` locally, run `pnpm install` and the gate. If you truly cannot, do not push silently — say so and treat the work as unverified.
- Changed the Dockerfile? Build the image and run the container. `docker compose up --build` then `curl localhost:8080/api/health`.
- Changed a workflow? YAML that parses is not a workflow that runs.

---

## 11. Design mobile-first

Every UI is built for a small screen first, then progressively enhanced for larger ones. Responsiveness is a requirement of the component, not a later pass.

- **Base styles are the mobile layout.** Write unprefixed Tailwind utilities for the phone, then add `sm:`, `md:`, `lg:`, `xl:` breakpoints to adapt upward. Never write a desktop layout and try to claw it back down.
- **Never overflow the viewport.** Prefer fluid widths (`w-full`, `max-w-*`, `min-w-0`) over fixed pixel widths. The body must not scroll horizontally at 320px. Wide content (tables, code blocks, diagrams) scrolls inside its own `overflow-x-auto` container.
- **Touch first.** Interactive targets are at least 44×44px, with enough spacing that a finger cannot hit two at once.
- **Layout that reflows.** Use flexbox and grid that wrap and stack; avoid absolute positioning that assumes a viewport size. Images and media get `max-w-full` and intrinsic sizing.
- **Verify both ends.** Check the component at ~320px and at desktop width before claiming it done — a layout that only works on one is not finished.

**Why:** most traffic is mobile, and a broken small-screen layout is a broken product. Mobile-first also forces a content and priority order that scales up cleanly, whereas desktop-first almost never scales down without rework.

---

## 12. Write documentation in Simplified Technical English

Every Markdown document in the repository follows ASD-STE100 Simplified Technical English. This includes `CLAUDE.md`, the files in this folder, `docs/`, `cloud/`, the ADRs, and every README.

- **Keep sentences short.** At most 20 words for an instruction, 25 for a description. One idea per sentence.
- **One instruction per sentence.** Split a compound step into separate sentences or list items.
- **Use the active voice and the present tense.** "The build generates the types", not "the types are generated by the build".
- **Use one approved term per concept.** Do not call the same thing a "folder" here and a "directory" there. Keep verbs and nouns distinct — do not use a noun as a verb.
- **Start a procedure step with the command verb.** "Run `pnpm validate`", not "You should now run `pnpm validate`".
- **Keep paragraphs to one topic.** Six sentences is a reasonable maximum.
- **Write for a non-native reader.** Choose the plain word over the clever one. Avoid idiom, slang, and long noun clusters.
- **Bring a document into compliance when you edit it.** Do not rewrite every file at once; improve the file you touch, in the same PR.

**Why:** many readers — human and machine — parse these documents as instructions. Simple, consistent, unambiguous English lowers the chance that a reader acts on a sentence in a way the author did not mean.

---

## Quick reference

| Do                                | Don't                                   |
| --------------------------------- | --------------------------------------- |
| Server Component by default       | `'use client'` at the top of the tree   |
| `unknown` + narrowing             | `any`                                   |
| `import { x } from '@/lib/x'`     | `import { x } from '../../../lib/x'`    |
| Read config from `@/lib/env`      | `process.env.FOO` scattered in the code |
| `logger.info(...)`                | `console.log(...)`                      |
| Add to an existing folder         | Create a new top-level folder           |
| Platform API                      | A dependency that wraps a platform API  |
| Update docs in the same PR        | "I'll document it later"                |
| Mobile-first, enhance upward      | Desktop layout patched down with hacks  |
| Short, active, present-tense docs | Long passive sentences, mixed terms     |
| Open a PR for every change        | Push or commit straight to `main`       |
