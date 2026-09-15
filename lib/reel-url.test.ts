import { describe, expect, it } from 'vitest';

import { extractShortcode, formatTimecode, parseReelUrl } from '@/lib/reel-url';

describe('extractShortcode', () => {
  it('reads a plain reel path', () => {
    expect(extractShortcode('/reel/Abc12XyZ/')).toBe('Abc12XyZ');
  });

  it('reads the profile-prefixed form', () => {
    expect(extractShortcode('/somecreator/reel/Abc12XyZ/')).toBe('Abc12XyZ');
  });

  it.each(['/reels/Abc12XyZ/', '/p/Abc12XyZ/', '/tv/Abc12XyZ/'])('reads %s', (path) => {
    expect(extractShortcode(path)).toBe('Abc12XyZ');
  });

  it('returns null when there is no media segment', () => {
    expect(extractShortcode('/somecreator/')).toBeNull();
  });

  it('rejects a shortcode with illegal characters', () => {
    expect(extractShortcode('/reel/not a code/')).toBeNull();
  });
});

describe('parseReelUrl', () => {
  it('canonicalises any Instagram reel URL to the same shape', () => {
    const parsed = parseReelUrl('https://instagram.com/reels/Abc12XyZ/?igsh=tracking');
    expect(parsed).toEqual({
      kind: 'instagram',
      url: 'https://www.instagram.com/reel/Abc12XyZ/',
      shortcode: 'Abc12XyZ',
    });
  });

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

  it('rejects an Instagram profile link that carries no reel', () => {
    const parsed = parseReelUrl('https://www.instagram.com/somecreator/');
    expect(parsed.kind).toBe('invalid');
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
