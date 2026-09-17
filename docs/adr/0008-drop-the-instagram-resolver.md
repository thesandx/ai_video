# ADR-0008: Drop the Instagram resolver

- **Status:** Accepted
- **Date:** 2026-09-17
- **Deciders:** Application engineering
- **Supersedes:** [ADR-0003](./0003-resolve-reels-through-a-pluggable-strategy.md), in part

## Context

[ADR-0003](./0003-resolve-reels-through-a-pluggable-strategy.md) kept an automatic Instagram
download behind an optional `INSTAGRAM_SESSION_COOKIE`. It was the convenience path. A direct media
URL and an upload were the paths that always work.

The convenience path stopped working. Two failures were measured against the live site on
2026-09-16, with a valid session cookie:

- The GraphQL POST answered `403`. The request carried no `x-csrftoken` header, which Instagram now
  requires on every GraphQL POST. Adding the header changed the answer to `200`.
- With the header added, the endpoint answered `200` and an `execution error`. The persisted query
  id in the code was no longer valid.

The session itself was healthy throughout. The reel page reported the reader as logged in.

A stale query id is repairable, but only until the next rotation. Instagram rotates these ids and
changes the variables they accept, on their schedule, with no notice and no contract. Each rotation
breaks the feature in production and reads to the operator as an expired cookie.

The cost was not only the breakage:

- The cookie is a full credential. It authenticates as the account that made it, with no password
  and no second factor.
- Automated downloading is against Instagram's terms. The account holding the cookie carries that
  risk.
- The resolver was 221 lines, and the largest single piece of the fetcher.

## Decision

Remove the Instagram resolver, the session cookie, and the shortcode parsing.

A video enters the application two ways, and neither needs a credential:

1. A direct media URL the reader pastes.
2. A file the reader uploads.

An Instagram link is rejected at parse time with a message that names the next action: save the
reel, then upload the file. The host check stays for that message alone. Without it the link would
be fetched as a media URL and fail as "not a video", which tells the reader nothing.

## Consequences

**Good.** No credential to store, rotate, or leak. No dependency on an undocumented endpoint owned
by somebody else. The fetcher lost 221 lines and one whole class of failure. Nothing in the
application can now break because a third party changed a query id.

**Bad.** The reader saves the reel themselves before uploading it. That is one manual step per run.

**Kept from ADR-0003.** The decision that a direct URL and an upload are first-class inputs, not a
consolation prize, stands. This ADR removes only the resolver that sat in front of them.

**Reversible.** A paid resolver API remains the option it was in ADR-0003. It would be a new
service in `services/`, a new key, and a cost per run. Nothing in this change blocks it.
