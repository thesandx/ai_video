# Architecture Decision Records

An ADR captures **one** significant decision: the context that forced it, what was chosen, and what it costs. Months later, when someone asks "why is it done this way?", the ADR answers instead of git blame.

## When to write one

Write an ADR when a decision:

- is expensive to reverse (a database, a framework, an auth model)
- affects how the whole team works (folder structure, a testing strategy)
- rejects an obvious alternative (and someone will later ask why)
- will outlive the people who made it

Do **not** write one for a routine choice with an obvious answer. An ADR per pull request devalues the ones that matter.

## How

1. Copy [`0000-template.md`](./0000-template.md).
2. Number it sequentially: `0003-use-cloud-sql-for-persistence.md`.
3. Write it in the PR that makes the change, not afterwards.
4. Never edit an accepted ADR to change its decision. Write a new one that supersedes it and link both ways. The record of the earlier decision is the valuable part.

## Status values

| Status                 | Meaning                                |
| ---------------------- | -------------------------------------- |
| Proposed               | Under discussion; not yet acted on     |
| Accepted               | Decided and in effect                  |
| Deprecated             | No longer applies, nothing replaced it |
| Superseded by ADR-NNNN | Replaced by a later decision           |

## Index

| ADR                                                | Title                                                            | Status   |
| -------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](./0001-use-cloud-run-for-hosting.md)        | Use Cloud Run for hosting                                        | Accepted |
| [0002](./0002-use-workload-identity-federation.md) | Use Workload Identity Federation instead of service account keys | Accepted |
