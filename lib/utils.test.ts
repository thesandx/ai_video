import { describe, expect, it } from 'vitest';

import { cn, formatIst, formatUtc, isError, safeAwait } from '@/lib/utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values so conditionals stay inline', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, undefined)).toBe('');
  });
});

describe('formatUtc', () => {
  it('formats a Date in UTC', () => {
    expect(formatUtc(new Date('2026-07-21T09:30:00.000Z'))).toBe('2026-07-21 09:30:00 UTC');
  });

  it('accepts an ISO string', () => {
    expect(formatUtc('2026-01-01T00:00:00.000Z')).toBe('2026-01-01 00:00:00 UTC');
  });

  it('does not throw on garbage input', () => {
    expect(formatUtc('not-a-date')).toBe('invalid date');
  });
});

describe('isError', () => {
  it('narrows Error instances', () => {
    expect(isError(new TypeError('boom'))).toBe(true);
  });

  it('rejects error-shaped objects that are not Errors', () => {
    expect(isError({ message: 'boom' })).toBe(false);
  });
});

describe('formatIst', () => {
  it('converts a UTC instant to IST (UTC+5:30)', () => {
    // 12:15 UTC is 17:45 IST.
    expect(formatIst('2026-07-26T12:15:00Z')).toBe('2026-07-26 17:45:00 IST');
  });

  it('rolls the date forward when the offset crosses midnight', () => {
    // 20:00 UTC + 5:30 = 01:30 IST the next day.
    expect(formatIst('2026-07-26T20:00:00Z')).toBe('2026-07-27 01:30:00 IST');
  });

  it('returns null for empty, null, or undefined input', () => {
    expect(formatIst('')).toBeNull();
    expect(formatIst(null)).toBeNull();
    expect(formatIst(undefined)).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(formatIst('not-a-date')).toBeNull();
  });
});

describe('safeAwait', () => {
  it('returns ok with the resolved value', async () => {
    await expect(safeAwait(Promise.resolve(42))).resolves.toEqual({ ok: true, data: 42 });
  });

  it('captures a rejection instead of throwing', async () => {
    const result = await safeAwait(Promise.reject(new Error('nope')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('nope');
  });

  it('wraps non-Error rejections', async () => {
    const result = await safeAwait(Promise.reject('a string'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});
