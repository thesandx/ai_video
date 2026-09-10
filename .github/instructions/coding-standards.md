# Coding standards

How to write TypeScript, React and CSS in this repository. ESLint, Prettier and `tsc` enforce the mechanically checkable rules. This document covers the judgement that tooling cannot check.

---

## TypeScript

### Types

```ts
// Good: the boundary is typed, locals are inferred.
export function toSlug(title: string): string {
  const normalised = title.trim().toLowerCase(); // inferred string
  return normalised.replace(/[^a-z0-9]+/g, '-');
}

// Bad: annotating what inference already knows is noise that goes stale.
const normalised: string = title.trim().toLowerCase();
```

- **`interface` for object shapes that others extend or implement. `type` for unions, intersections, mapped and utility types.** Do not agonise; be consistent within a file.
- **Never `any`.** Use `unknown` and narrow:

  ```ts
  function parse(input: unknown): Config {
    if (typeof input !== 'object' || input === null) {
      throw new TypeError('Config must be an object');
    }
    // ... narrow further
  }
  ```

- **`noUncheckedIndexedAccess` is on**, so `arr[0]` is `T | undefined`. Handle it; do not reach for `!`.
- **Discriminated unions over optional-field soup:**

  ```ts
  // Good — impossible states are unrepresentable
  type Fetch<T> =
    { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ok'; data: T };

  // Bad — what does { loading: true, data: {...} } mean?
  type Fetch<T> = { loading?: boolean; error?: Error; data?: T };
  ```

- **`as const` for literal tuples and lookup tables**, so values narrow instead of widening to `string`.
- **`import type`** for type-only imports. Enforced by ESLint.

### Errors

```ts
// Typed errors carry context a string cannot.
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}
```

- Catch narrowly and rethrow what you cannot handle. A `catch` that swallows every error hides the bug you must then find.
- `catch (error: unknown)` is the default (`useUnknownInCatchVariables`). Narrow with `instanceof` before touching `.message`.
- Never `catch { return null }`. Return a `Result<T>` or throw.

### Async

- Every outbound call gets a timeout: `AbortSignal.timeout(5_000)`.
- Independent awaits run concurrently:

  ```ts
  // Good — one round trip's worth of latency
  const [user, orders] = await Promise.all([getUser(id), getOrders(id)]);

  // Bad — sequential for no reason
  const user = await getUser(id);
  const orders = await getOrders(id);
  ```

- `Promise.allSettled` when partial failure is acceptable; `Promise.all` when it is not.

---

## React and Next.js

### Server Components are the default

```tsx
// app/orders/page.tsx — Server Component. Runs on the server, ships no JS.
import { getOrders } from '@/services/order.service';

import { OrderFilters } from './OrderFilters'; // 'use client' lives in there

export default async function OrdersPage() {
  const orders = await getOrders();
  return (
    <>
      <OrderFilters /> {/* small interactive island */}
      <ul>
        {orders.map((order) => (
          <li key={order.id}>{order.reference}</li>
        ))}
      </ul>
    </>
  );
}
```

The interactive part is a separate `'use client'` file. The data fetching, the list rendering and the dependencies they pull in stay on the server.

### Components

```tsx
export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'success' | 'danger';
  className?: string;
}

export function Badge({ label, tone = 'neutral', className }: BadgeProps) {
  return <span className={cn(TONE_CLASSES[tone], className)}>{label}</span>;
}
```

- Named function declarations, not `const X = () => {}`. Better stack traces, hoisting, and a real `name` in React DevTools.
- Export the props interface.
- Destructure props with defaults in the signature.
- Accept `className` on anything reusable so callers can adjust spacing without a wrapper `<div>`.
- **`key` must be a stable id, never an array index** — index keys corrupt state on reorder.

### Data fetching

- Fetch in Server Components, as high in the tree as the data is needed.
- Use Next's caching deliberately and say why:

  ```ts
  fetch(url, { next: { revalidate: 60 } }); // tolerate 60s staleness
  fetch(url, { cache: 'no-store' }); // per-request, never cached
  ```

- Mutations go through Server Actions or route handlers, never a `useEffect` + `fetch` pair.

### Client Components

- `'use client'` on the first line, above imports.
- Keep them leaf-shaped and prop-driven.
- Every effect cleans up. Every dependency array is honest — do not silence the lint rule.
- Prefer `useSyncExternalStore` over `useEffect` + `useState` for reading browser state; it avoids hydration mismatches.

### Accessibility

Not optional. `eslint-plugin-jsx-a11y` runs as part of `eslint-config-next` and its findings are errors.

- Semantic elements first: `<button>`, `<nav>`, `<main>`, `<ul>`.
- Every interactive element is keyboard reachable and has an accessible name.
- Every image has `alt` (empty `alt=""` for decorative).
- Colour is never the only signal.
- One `<h1>` per page; heading levels do not skip.

---

## Styling

- Tailwind utilities in `className`. No inline `style` except for genuinely dynamic values (a computed width).
- Colours come from the tokens in `styles/globals.css`. No raw hex in a component.
- Mobile-first: unprefixed utilities are the small screen, `sm:` and up widen it — never the reverse. Prefer fluid widths (`w-full`, `max-w-*`) over fixed pixel widths, keep interactive targets ≥44px, never let the body scroll horizontally, and verify the layout at ~320px and at desktop width. See rule 11 in [coding-rules.md](./coding-rules.md).
- When a `className` string becomes unreadable, that is a signal to extract a component — not to reach for `@apply`.

---

## Comments

Comment **why**, not **what**. The code already says what it does.

```ts
// Good — explains a decision the code cannot
// Cloud Run kills the container 10s after SIGTERM, so flush before that.
const FLUSH_TIMEOUT_MS = 8_000;

// Bad — restates the line below it
// set the flush timeout to 8000
const FLUSH_TIMEOUT_MS = 8_000;
```

- JSDoc on exported functions whose purpose is not obvious from the signature.
- No commented-out code. Git remembers it.
- A `TODO` must name the condition that resolves it, or it is not a TODO — it is a bug.

---

## Testing

- Test behaviour through the public interface, not internals.
- Query by role and accessible name (`getByRole('button', { name: 'Save' })`), not by test id. If the query is hard to write, the markup is probably inaccessible.
- One assertion concept per test; a descriptive name that reads as a sentence.
- Test the failure paths. Most incidents come from a failure path, not the happy path.
- Async Server Components cannot be rendered by React Testing Library — test their `services/` and `lib/` helpers directly instead.

---

## Formatting

Prettier owns it. Do not argue with it, do not hand-format, do not add `// prettier-ignore` without a reason.

```bash
pnpm format        # write
pnpm format:check  # verify (this is what CI runs)
pnpm lint:fix      # fix lint + import order
```
