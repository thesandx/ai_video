/**
 * Parsing and validation for the URL a reader pastes in.
 *
 * Pure: no network, no environment. The fetcher in `services/` decides how to
 * fetch; this file only decides what the reader gave us.
 */

/**
 * Host suffixes Instagram serves reels from.
 *
 * Kept only to reject them with a message that helps. Instagram refuses
 * logged-out downloads and the app no longer tries: a link pasted from the app
 * would otherwise be fetched as a media URL and fail as "not a video", which
 * tells the reader nothing about what to do next.
 */
const INSTAGRAM_HOSTS = ['instagram.com', 'instagr.am', 'ddinstagram.com'];

export type ParsedReelUrl =
  { kind: 'direct-url'; url: string } | { kind: 'invalid'; reason: string };

function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return INSTAGRAM_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

/**
 * Classifies the reader's input.
 *
 * The only link this accepts is a direct media URL. Uploading a file is the
 * other way in, and the two are the whole set. See
 * `docs/adr/0008-drop-the-instagram-resolver.md`.
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
    return {
      kind: 'invalid',
      reason:
        'Instagram links are not supported. Instagram refuses downloads to anyone not logged in. Save the reel, then upload the file.',
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
