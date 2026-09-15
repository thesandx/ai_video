# ADR-0007: Store the run in Neon, behind a transport

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Application engineering
- **Supersedes part of:** [ADR-0005](./0005-keep-the-run-in-the-browser.md)

## Context

[ADR-0005](./0005-keep-the-run-in-the-browser.md) put the run in the browser because Cloud Run gives
this app a read-only filesystem, no database and no bucket. That was true, and it made a fresh
checkout work with no credentials.

It also has a real cost, which that ADR recorded: a run is confined to one browser on one machine.
Clearing site data loses a run that cost several dollars of generation to produce. A run cannot be
started on a laptop and finished on a desktop.

A Neon Postgres database is now available, so that cost no longer has to be paid.

The question is not whether to use it. It is whether to replace browser storage or to keep both.

## Decision

Both, behind one interface.

`types/run-store.ts` defines `RunStore`. Two implementations satisfy it:

- `services/local-run-store.ts`, localStorage plus IndexedDB.
- `services/neon-run-store.ts`, this app's own routes over Neon Postgres.

`services/run-transport.ts` selects between them from `NEXT_PUBLIC_RUN_TRANSPORT`. No component
imports either implementation directly.

This is the shape the Playroom games repository uses for room state, in its
ADR-0003, and it is adopted here for the same reasons.

The browser never holds the connection string. `DATABASE_URL` is server-only, and the browser reaches
Postgres through `/api/runs`, which refuses to answer unless the transport is `neon`.

## Consequences

**A fresh checkout still works.** `local` remains the default, so cloning the repository and setting
one OpenRouter key gives a working application. The database is an upgrade, not a prerequisite.

**Switching is one environment variable and a rebuild.** No component changes, because no component
knows which store it is talking to.

**The notice earns its place.** `components/layout/TransportNotice.tsx` states on screen that a
browser-held run will not survive a cleared browser, and hides itself once Postgres is in use. A
storage limitation that is invisible in the interface is a limitation that will surprise someone.

**Two implementations must be kept in step.** Adding an operation means adding it in three places:
the interface, the local store and the Neon store. This is the known cost of the pattern, and it is
a review responsibility rather than something the types enforce.

**Neon's own behaviour is designed around, not discovered.** Two points from the Playroom backend
handover apply directly:

- Neon scales to zero, so the first query after an idle period pays a cold start of a few hundred
  milliseconds. Acceptable for a tool with an operator in front of it. Nothing queries merely to
  check liveness.
- `LISTEN`/`NOTIFY` does not work through the pooled endpoint, which is PgBouncer in transaction
  mode. Nothing here needs it, so the pooled string is correct. A later feature that wants it must
  open the direct endpoint separately rather than switching this one.

The driver is `@neondatabase/serverless`, which talks over HTTP rather than holding a TCP pool. Cloud
Run scales to zero and may start an instance per request, so a pooled TCP client would spend its life
reconnecting and would exhaust Neon's connection limit under any concurrency.

**Clips in `bytea` are a deliberate compromise.** Images are about 1 MB and sit comfortably. A clip
can reach 40 MB, which Postgres stores out of line through TOAST and handles, but object storage is
the better home once runs accumulate. The schema is shaped so that move is contained: `bytes`
becomes a URL and nothing above the repository changes.

## Alternatives considered

### Option A: Transport interface with both stores (chosen)

Described above.

### Option B: Replace browser storage with Neon

Simpler, one implementation, no drift. Rejected because it makes a database a prerequisite for the
application running at all, which breaks the template's promise that a fresh checkout works.

### Option C: Keep the browser store and add an export button

Cheapest. Rejected because it solves durability and not portability, and because it puts the burden
of remembering to export on the person least likely to think about it before clearing their browser.
