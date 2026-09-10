# `hooks/`

Reusable React hooks. Intentionally empty in the template.

## Rules

1. **Hooks are client-only.** Any file here is imported by a `'use client'` component. If you want a hook in a Server Component, you really want a plain function in `lib/` or `services/`.
2. **Name them `use<Thing>.ts`**, one hook per file, matching export name.
3. **Return a stable shape.** Prefer an object with named fields over a positional tuple once there are more than two values.
4. **Memoise what you return.** Wrap returned callbacks in `useCallback` and derived objects in `useMemo` so consumers do not re-render on every parent render.
5. **No fetching business data here by default.** Server Components fetch; hooks handle interaction, subscriptions, and browser APIs. If a project really needs client-side fetching, standardise on one library (TanStack Query) and wrap it here instead of writing `useEffect` fetches by hand.
6. **Clean up.** Every subscription, timer, and listener gets a teardown in the effect return.

## Template

```ts
'use client';

import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // server snapshot — avoids a hydration mismatch
  );
}
```
