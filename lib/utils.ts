/**
 * Small, dependency-free helpers shared across the app.
 *
 * Keep this file boring. Anything domain-specific belongs in `services/`,
 * anything React-specific belongs in `hooks/`.
 */

/**
 * Conditionally joins class names.
 *
 * Deliberately does NOT merge conflicting Tailwind utilities — that needs
 * `clsx` + `tailwind-merge`. Add them when a real component library starts
 * fighting over `p-2` vs `p-4`, not before.
 *
 * @example cn('rounded', isActive && 'bg-accent', undefined) // 'rounded bg-accent'
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Formats an ISO timestamp for display without pulling in a date library.
 * Uses UTC so server-rendered and client-rendered output cannot disagree,
 * which is a common source of hydration mismatches.
 */
export function formatUtc(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return 'invalid date';
  return value
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

/**
 * Formats an ISO timestamp in India Standard Time (UTC+5:30) via the platform
 * `Intl` API — no date library. Returns `null` for empty or unparseable input,
 * so `/api/health` can show "not deployed by the pipeline" instead of a crash.
 *
 * @example formatIst('2026-07-26T12:15:00Z') // '2026-07-26 17:45:00 IST'
 */
export function formatIst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} IST`;
}

/**
 * Type guard for narrowing `unknown` caught values.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Awaits a promise and returns a discriminated result instead of throwing,
 * so call sites can handle failure without nesting try/catch.
 */
export async function safeAwait<T>(
  promise: Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: Error }> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error: isError(error) ? error : new Error(String(error)) };
  }
}
