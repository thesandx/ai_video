# ADR-0006: Gate video generation behind preflight checks

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Application engineering

## Context

The stages in this pipeline do not cost the same amount. Measured on this account:

| Stage              | Cost                         |
| ------------------ | ---------------------------- |
| Refinement chat    | Fractions of a cent per turn |
| Reading the reel   | About 0.02 USD               |
| One image          | About 0.04 USD               |
| **One video clip** | **About 0.42 USD**           |

A clip costs roughly ten times an image and a hundred times a chat turn. An eight shot reel spends
about 3.40 USD in one press of one button.

Several failures are cheap to catch before that press and expensive after it. The plainest is a count
mismatch: a plan with 6 shots and 5 stills. The sixth clip either fails after the first five are paid
for, or is generated from the wrong frame. Others are quieter. A model that cannot produce 9:16. A
duration the model does not offer. A still that is square when the plan says vertical.

The upstream API does not protect against any of this. `/api/v1/videos` **does not strictly validate
its request body**: an unrecognised key is accepted and starts a billable job. Five throwaway probes
during development cost 0.63 USD each.

## Decision

A single pure function, `preflight()` in `lib/preflight.ts`, runs every check before the video stage
can be entered. Its findings are split:

- **Errors block.** The generate button is disabled while any error stands.
- **Warnings inform.** Some are legitimate choices, such as a deliberate gap between two shots.

Every finding carries a `code` for tests, a `message` for the operator, a `fix` naming the action, and
a `subject` naming the shot or character. The panel shows the fix, because the person reading it is
the person who has to act.

`app/api/video/route.ts` re-validates the model, the aspect ratio and the duration server side. The
UI gate is for the operator; the route gate is because the upstream API bills for a request it does
not check.

## Consequences

The expensive mistake is now unreachable through the UI. A missing still is refused by name, whether
it was never generated or never uploaded, since the gate checks that the asset exists rather than how
it arrived.

`preflight()` is pure: no network, no storage, no clock. It is covered by 23 unit tests, including the
6-shots-5-stills case stated directly. The gate is the most tested code in the repository, which is
proportionate to it being the last thing between a plan and a bill.

The cost estimate shown on the button counts only the clips that are missing, so regenerating a
single failed shot does not quote the price of the whole reel.

Warnings could be ignored into irrelevance if the list grows. Anything added here must genuinely be
worth an operator's attention, or it belongs as an error or not at all.
