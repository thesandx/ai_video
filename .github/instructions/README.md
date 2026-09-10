# Instructions for AI coding assistants

This folder is the authoritative rulebook for any AI assistant working in this repository — Claude Code, GitHub Copilot, Cursor, ChatGPT, or whatever comes next. Human contributors should read it too; it is the same rulebook.

## Read these in order

| Document                                       | Read it when                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| [coding-rules.md](./coding-rules.md)           | **Always. Start here.** The non-negotiables, in one page.       |
| [project-structure.md](./project-structure.md) | Creating any new file — it decides where the file goes.         |
| [coding-standards.md](./coding-standards.md)   | Writing TypeScript, React, or CSS.                              |
| [architecture.md](./architecture.md)           | Adding a layer, a dependency, or changing how data flows.       |
| [deployment.md](./deployment.md)               | Touching the Dockerfile, env vars, or anything Cloud Run reads. |
| [github-workflows.md](./github-workflows.md)   | Touching anything in `.github/workflows/`.                      |

## The short version

If you only read one paragraph:

> Server Components by default. TypeScript with no `any`. Never invent a new top-level folder. Never add a dependency you could avoid. Never commit a secret or a service account key. Design every UI mobile-first. Explain architectural decisions in the PR. When architecture or behaviour changes, update the docs in the same PR. Write every document in Simplified Technical English.

## How to use these as an assistant

1. **Before writing code**, check `project-structure.md` for where the file belongs and `coding-rules.md` for the constraints that apply.
2. **While writing**, follow the patterns already in the repository over patterns from your training data. When they conflict, the repository wins.
3. **After writing**, run `pnpm validate`. Do not report work as complete on the strength of a diff alone.
4. **When you make a judgement call** — a dependency, a data-flow change, a client boundary — state the reasoning in your response and in the PR description. The next contributor reverts a decision nobody can reconstruct.
5. **If a rule here blocks the task**, say so explicitly and propose the change to the rule. Do not silently work around it.

## Precedence

When guidance conflicts, later entries win:

1. Your own training defaults
2. General Next.js / Google Cloud documentation
3. This folder
4. `CLAUDE.md` at the repository root
5. An explicit instruction from the human you are working with

## Keeping this current

These documents describe the repository as it is, not as it was. If a PR changes the architecture, the folder layout, the deploy pipeline, or a rule, that same PR updates the relevant file here. A stale rulebook is worse than none: assistants follow it with confidence and produce confidently wrong code.
