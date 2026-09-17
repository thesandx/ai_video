import { describe, expect, it } from 'vitest';

import { formatTimecode, parseReelUrl } from '@/lib/reel-url';

describe('parseReelUrl', () => {
  it('accepts a direct media URL as a first-class source', () => {
    const parsed = parseReelUrl('https://cdn.example.com/video.mp4');
    expect(parsed.kind).toBe('direct-url');
  });

  it('rejects an empty input with a usable message', () => {
    const parsed = parseReelUrl('   ');
    expect(parsed).toEqual({ kind: 'invalid', reason: 'Paste a reel link to get started.' });
  });

  it('rejects text that is not a URL', () => {
    expect(parseReelUrl('not a url').kind).toBe('invalid');
  });

  it('rejects a non-http protocol', () => {
    expect(parseReelUrl('ftp://example.com/video.mp4').kind).toBe('invalid');
  });

  it.each([
    'https://www.instagram.com/reel/Abc12XyZ/',
    'https://instagram.com/reels/Abc12XyZ/?igsh=tracking',
    'https://www.instagram.com/somecreator/',
    'https://instagr.am/p/Abc12XyZ/',
  ])('rejects %s, because Instagram refuses logged-out downloads', (link) => {
    const parsed = parseReelUrl(link);
    expect(parsed.kind).toBe('invalid');
  });

  it('tells the reader to upload the file when they paste an Instagram link', () => {
    const parsed = parseReelUrl('https://www.instagram.com/reel/Abc12XyZ/');
    expect(parsed).toEqual({
      kind: 'invalid',
      reason: expect.stringContaining('upload the file'),
    });
  });
});

describe('formatTimecode', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [61, '1:01'],
    [125.7, '2:05'],
  ])('formats %s as %s', (seconds, expected) => {
    expect(formatTimecode(seconds)).toBe(expected);
  });

  it('floors a negative or broken value rather than printing NaN', () => {
    expect(formatTimecode(-4)).toBe('0:00');
    expect(formatTimecode(Number.NaN)).toBe('0:00');
  });
});
