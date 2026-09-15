# ADR-0005: Keep the run in the browser

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Application engineering

## Context

A run moves through nine stages and pauses at each one for approval. It holds a plan, a chat history,
and up to twenty binary assets: character sheets, one still per shot, and one clip per shot. A single
run can hold 40 MB of video.

The deployment target constrains where that can live. Cloud Run runs this container on a **read-only
root filesystem**, with **no database** and **no storage bucket** attached. The container also scales
to zero, so in-memory state does not survive between requests.

Three options were available:

- Add Cloud SQL and Cloud Storage. Correct for a multi-user product, but it adds two services, two
  IAM bindings, a schema and a migration path, for a tool one person drives at a time.
- Keep the run in memory on the server. It does not survive scale-to-zero, and Cloud Run scales to
  zero constantly at this traffic level.
- Keep the run in the browser.

## Decision

The browser owns the run. **localStorage** holds the project JSON, **IndexedDB** holds the binary
assets, and every route handler stays **stateless**.

Route handlers proxy OpenRouter and nothing else. The OpenRouter key stays server side and never
reaches the browser, which is why finished clips are fetched through
`/api/video/[jobId]/content` rather than directly.

## Consequences

The app deploys with no additional infrastructure and no credentials beyond the OpenRouter key. A
fresh checkout runs.

Downloads are immediate: the clips are already on the operator's machine by the time they reach the
final stage, so the download button needs no round trip.

A run is tied to one browser on one machine. That matches how the tool is used, and it is stated in
the UI rather than left to be discovered.

Storage can fail. A private window, blocked site data, or a full quota makes localStorage throw and
IndexedDB return nothing. Every access is guarded, and `useProject` surfaces a plain message when the
run cannot be saved instead of losing work silently.

`useProject` reads localStorage through `useSyncExternalStore` rather than `useState` plus an effect.
The naive version calls `setState` inside an effect, which cascades renders and is reported by
`react-hooks/set-state-in-effect`. `getServerSnapshot` covers the server render, and the store seeds
a fresh run on subscribe, which happens after mount.

If this ever becomes multi-user, the swap is a real one: the project JSON moves to a database and the
assets to a bucket. The types in `types/pipeline.ts` already describe assets by key rather than by
bytes, so the shape survives the move.
