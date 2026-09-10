# `components/`

Reusable React components. Intentionally empty in the template — the Hello World page needs none.

## Layout

| Folder                  | Contents                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| `components/ui/`        | Generic, presentational primitives: `Button`, `Card`, `Input`. No business logic. |
| `components/layout/`    | Structural chrome: `Header`, `Footer`, `Sidebar`, `PageShell`.                    |
| `components/<feature>/` | Components belonging to one feature. Create the folder when the feature exists.   |

## Rules

1. **Server Components by default.** Only add `'use client'` when the component needs state, effects, event handlers, or browser-only APIs.
2. **Push `'use client'` to the leaves.** A client boundary at the top of a tree turns every descendant into client code. Keep interactive islands small and let Server Components pass data into them as props.
3. **One component per file**, named after the file. `components/ui/Button.tsx` exports `Button`.
4. **Props are typed and exported** so consumers and tests can reference them: `export interface ButtonProps { ... }`.
5. **No data fetching inside `ui/`.** Presentational components receive data as props. Fetching belongs in a Server Component page or in `services/`.
6. **Accessible by construction.** Semantic elements, real `<button>`s, labelled inputs, keyboard reachable. `eslint-plugin-jsx-a11y` runs via `eslint-config-next` and its findings are errors, not suggestions.
7. **Style with Tailwind utilities and the tokens in `styles/globals.css`.** No raw hex values.
8. **Mobile-first and responsive.** Base utilities target the small screen; add `sm:`/`md:`/`lg:` to scale up. Use fluid widths, keep touch targets at least 44px, and never cause horizontal scroll on a phone.

## Template

```tsx
import { cn } from '@/lib/utils';

export interface CardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <section className={cn('border-border rounded-lg border p-4', className)}>
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}
```
