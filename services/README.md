# `services/`

The integration layer: every call that leaves this process lives here. Intentionally empty in the template.

## Why this layer exists

Without it, `fetch` calls, retry logic, auth headers and response parsing spread across pages and components. Named modules keep them in one place: the rest of the app calls `userService.getById(id)` — a typed function — and knows nothing about transport. A change from REST to gRPC, or a new cache, then touches one file.

## `services/` vs `lib/`

|              | `lib/`                                        | `services/`                                  |
| ------------ | --------------------------------------------- | -------------------------------------------- |
| Purpose      | Pure helpers, config, cross-cutting utilities | I/O with external systems                    |
| Side effects | None                                          | Network, database, cloud SDKs                |
| Examples     | `cn()`, `env`, `logger`                       | `userService`, `billingService`, `gcsClient` |

## Rules

1. **Server-side only.** Files here may read secrets and MUST NOT be imported from a `'use client'` component. Add `import 'server-only';` at the top of any module holding credentials — the build then fails loudly if a client component imports it.
2. **One module per external system**, named `<domain>.service.ts` or `<system>.client.ts`.
3. **Validate at the boundary.** Never assume an external payload matches its declared type; parse and narrow, then return your own domain type from `types/`.
4. **Return `Result<T>` (see `types/index.ts`) or throw a typed error.** Do not return `null` to mean three different failures.
5. **Every outbound call gets a timeout.** An un-timed `fetch` on Cloud Run holds a request slot open until the platform's 300s limit. This exhausts concurrency during a downstream outage.
6. **Log failures via `@/lib/logger`**, never `console.log`.

## Template

```ts
import 'server-only';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { Result } from '@/types';

const TIMEOUT_MS = 5_000;

export interface User {
  id: string;
  email: string;
}

export async function getUser(id: string): Promise<Result<User>> {
  try {
    const response = await fetch(`${env.appUrl}/api/users/${id}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return { ok: false, error: new Error(`Upstream returned ${response.status}`) };
    }

    return { ok: true, data: (await response.json()) as User };
  } catch (error) {
    logger.error('getUser failed', error, { userId: id });
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
```
