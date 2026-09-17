# ADR-0003: Resolve reels through a pluggable strategy

- **Status:** Superseded in part by [ADR-0008](./0008-drop-the-instagram-resolver.md)
- **Date:** 2026-09-15
- **Deciders:** Application engineering

## Context

The application must turn a reel link into a video file before a model can watch it.

Instagram does not permit this without a session. Three routes were tested against the live site:

- The reel page returns a JavaScript shell. It holds no `og:video` meta tag.
- The web GraphQL endpoint answers `403`.
- The `/api/v1/media/.../info/` endpoint redirects to a login page.

The `yt-dlp` extractor fails the same way. It reports that Instagram sent an empty media response, and
it asks for cookies.

Cloud Run adds a second problem. Requests leave from a data centre address. Instagram gates those
addresses harder than home addresses, so a route that works from a laptop can still fail in production.

Four options were available:

- Run `yt-dlp` inside the container. This adds Python and a binary to a 64 MB image. It also needs a
  writable path, and the container runs on a read-only root filesystem. It still fails without cookies.
- Store an Instagram session cookie. This works, but the cookie expires and it is a credential.
- Call a paid resolver API. This works, but it adds a dependency, a second key, and a cost per run.
- Accept a direct video URL or an uploaded file. This always works and needs no credential.

## Decision

We resolve a reel through **an ordered list of strategies**, and the last strategy always works.

1. `fetchInstagramReel` runs when `INSTAGRAM_SESSION_COOKIE` is set. It is automatic.
2. `fetchDirectVideo` and `acceptUploadedVideo` take a media URL or a file. They need no credential.

All strategies return the same `FetchedVideo`, so the route and the user interface do not know which
one ran.

## Consequences

The product works on a fresh checkout with no Instagram credential at all. That was the deciding
factor: a feature that only works with a cookie is a feature that breaks silently when the cookie
expires.

When no cookie is set, `/api/analyze` answers `424` and tells the reader what to do. The message
names both remedies, so the failure is actionable rather than mysterious.

Adding a paid resolver later means adding one function. It does not mean touching the route, the
types, or the user interface.

We accept that the automatic path is fragile. A session cookie expires, and Instagram may change the
GraphQL shape again. `readVideoUrl` narrows several known shapes for that reason, and it is unit
tested. The fragile path degrades to the robust one; it does not take the product down with it.

We do not ship `yt-dlp`. The image stays at roughly 64 MB, the root filesystem stays read-only, and
the supply chain stays a lockfile rather than a lockfile plus a Python runtime.
