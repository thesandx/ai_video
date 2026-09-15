/**
 * Parsing and validation for the URL a reader pastes in.
 *
 * Pure: no network, no environment. The resolver in `services/` decides how to
 * fetch; this file only decides what the reader gave us.
 */

/** Instagram shortcodes are base64url-ish and at least 5 characters. */
const SHORTCODE = /^[A-Za-z0-9_-]{5,32}$/;

/** Host suffixes Instagram serves reels from. */
const INSTAGRAM_HOSTS = ['instagram.com', 'instagr.am', 'ddinstagram.com'];

/** Path segments that precede a shortcode on a reel or post URL. */
const MEDIA_SEGMENTS = new Set(['reel', 'reels', 'p', 'tv']);

export type ParsedReelUrl =
  | { kind: 'instagram'; url: string; shortcode: string }
  | { kind: 'direct-url'; url: string }
  | { kind: 'invalid'; reason: string };

function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return INSTAGRAM_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

/**
 * Pulls the shortcode out of any Instagram reel or post URL shape.
 *
 * Handles `/reel/<code>`, `/reels/<code>`, `/p/<code>`, `/tv/<code>` and the
 * profile-prefixed `/<user>/reel/<code>` form, with or without a trailing
 * slash and with any tracking query attached.
 */
export function extractShortcode(pathname: string): string | null {
  const segments = pathname.split('/').filter((segment) => segment !== '');
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    if (segment !== undefined && next !== undefined && MEDIA_SEGMENTS.has(segment.toLowerCase())) {
      return SHORTCODE.test(next) ? next : null;
    }
  }
  return null;
}

/**
 * Classifies the reader's input.
 *
 * A direct media URL is accepted as a first-class source, not a consolation
 * prize: Instagram refuses logged-out downloads, so pasting a media URL (or
 * uploading a file) is the path that always works. See
 * `docs/adr/0003-resolve-reels-through-a-pluggable-strategy.md`.
 */
export function parseReelUrl(input: string): ParsedReelUrl {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { kind: 'invalid', reason: 'Paste a reel link to get started.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { kind: 'invalid', reason: 'That is not a URL. It needs to start with https://.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { kind: 'invalid', reason: 'Only http and https links are supported.' };
  }

  if (isInstagramHost(parsed.hostname)) {
    const shortcode = extractShortcode(parsed.pathname);
    if (shortcode === null) {
      return {
        kind: 'invalid',
        reason: 'That Instagram link has no reel in it. Copy the link from the reel itself.',
      };
    }
    return {
      kind: 'instagram',
      url: `https://www.instagram.com/reel/${shortcode}/`,
      shortcode,
    };
  }

  return { kind: 'direct-url', url: parsed.toString() };
}

/** Formats seconds as `m:ss`, for a timecode column. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
