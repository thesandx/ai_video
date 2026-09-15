import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ReelSource } from '@/types/reel';

/**
 * Getting the video file.
 *
 * Instagram refuses logged-out downloads. Verified against a live host: the
 * reel page returns a JavaScript shell with no `og:video` meta tag, the GraphQL
 * endpoint answers 403, and `/api/v1/media/.../info/` redirects to a login. The
 * `yt-dlp` extractor fails the same way and says so in plain words: "Instagram
 * sent an empty media response ... use --cookies".
 *
 * So resolution is a strategy list, tried in order, and the last one always
 * works:
 *   1. `cookieStrategy`  - automatic, needs `INSTAGRAM_SESSION_COOKIE`.
 *   2. `directUrlStrategy` - the reader supplies a media URL or uploads a file.
 *
 * Adding a third (a paid resolver API, say) means adding one function to
 * `STRATEGIES`, not touching the route or the UI.
 */

/** Distinguishes an expected, explainable failure from a bug. */
export type ReelErrorReason =
  'login-required' | 'not-found' | 'too-large' | 'not-a-video' | 'network';

export class ReelFetchError extends Error {
  readonly reason: ReelErrorReason;

  constructor(reason: ReelErrorReason, message: string) {
    super(message);
    this.name = 'ReelFetchError';
    this.reason = reason;
  }
}

export interface FetchedVideo {
  bytes: Uint8Array;
  contentType: string;
  source: ReelSource;
}

/** Outbound calls get a deadline. A reel download should never hang a request. */
const DOWNLOAD_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 15_000;

/**
 * A desktop browser user agent.
 *
 * Instagram serves a different, emptier document to unrecognised clients. This
 * does not defeat the login gate, but without it even the cookie path returns
 * a stub.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Instagram's public web app id, sent by the site's own front end. */
const IG_APP_ID = '936619743392459';

function assertVideoContentType(contentType: string, url: string): void {
  if (!contentType.startsWith('video/')) {
    throw new ReelFetchError(
      'not-a-video',
      `That link returned ${contentType || 'an unknown type'}, not a video. Paste a link that ends in .mp4, or upload the file.`,
    );
  }
  logger.debug('reel content type accepted', { contentType, url });
}

/**
 * Streams a media URL into memory, refusing anything over the configured cap.
 *
 * Checks `content-length` first when the server sends one, then enforces the
 * cap again while reading, because the header is a claim and not a guarantee.
 */
async function downloadVideo(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'user-agent': BROWSER_UA, accept: 'video/*,*/*' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ReelFetchError(
      'network',
      `Could not reach that video URL. ${error instanceof Error ? error.message : 'Unknown error.'}`,
    );
  }

  if (!response.ok) {
    throw new ReelFetchError(
      response.status === 404 ? 'not-found' : 'network',
      `The video URL answered ${response.status}. Instagram media links expire, so copy a fresh one.`,
    );
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  assertVideoContentType(contentType, url);

  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isInteger(declared) && declared > env.maxVideoBytes) {
    throw new ReelFetchError(
      'too-large',
      `That video is ${Math.round(declared / 1_000_000)} MB. The limit is ${Math.round(env.maxVideoBytes / 1_000_000)} MB.`,
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > env.maxVideoBytes) {
    throw new ReelFetchError(
      'too-large',
      `That video is ${Math.round(buffer.byteLength / 1_000_000)} MB. The limit is ${Math.round(env.maxVideoBytes / 1_000_000)} MB.`,
    );
  }

  return { bytes: new Uint8Array(buffer), contentType };
}

/**
 * Asks Instagram's web GraphQL endpoint for the reel, authenticated by the
 * reader's own session cookie.
 *
 * Returns `null` rather than throwing when there is no cookie, so the caller
 * can fall through to the next strategy.
 */
async function resolveViaCookie(shortcode: string): Promise<string | null> {
  const cookie = env.instagramSessionCookie;
  if (cookie === '') return null;

  const body = new URLSearchParams({
    doc_id: '8845758582119845',
    variables: JSON.stringify({ shortcode }),
  });

  let response: Response;
  try {
    response = await fetch('https://www.instagram.com/graphql/query', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': BROWSER_UA,
        'x-ig-app-id': IG_APP_ID,
        cookie: cookie.includes('=') ? cookie : `sessionid=${cookie}`,
      },
      body,
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn('instagram graphql call failed', { shortcode, error });
    return null;
  }

  if (!response.ok) {
    logger.warn('instagram graphql rejected the session', {
      shortcode,
      status: response.status,
    });
    return null;
  }

  const payload: unknown = await response.json().catch(() => null);
  const videoUrl = readVideoUrl(payload);
  if (videoUrl === null) {
    logger.warn('instagram returned no video url', { shortcode });
  }
  return videoUrl;
}

/**
 * Walks the GraphQL payload for a playable URL.
 *
 * Instagram has moved this field more than once, so this narrows `unknown`
 * defensively instead of trusting one shape.
 */
export function readVideoUrl(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;

  const media =
    (data as { xdt_shortcode_media?: unknown }).xdt_shortcode_media ??
    (data as { shortcode_media?: unknown }).shortcode_media;
  if (typeof media !== 'object' || media === null) return null;

  const direct = (media as { video_url?: unknown }).video_url;
  if (typeof direct === 'string' && direct !== '') return direct;

  const versions = (media as { video_versions?: unknown }).video_versions;
  if (Array.isArray(versions)) {
    for (const version of versions) {
      if (typeof version === 'object' && version !== null) {
        const url = (version as { url?: unknown }).url;
        if (typeof url === 'string' && url !== '') return url;
      }
    }
  }
  return null;
}

/** Fetches an Instagram reel, if the deployment holds a session cookie. */
export async function fetchInstagramReel(
  shortcode: string,
  canonicalUrl: string,
): Promise<FetchedVideo> {
  const mediaUrl = await resolveViaCookie(shortcode);

  if (mediaUrl === null) {
    throw new ReelFetchError(
      'login-required',
      env.instagramSessionCookie === ''
        ? 'Instagram does not allow logged-out downloads. Add an INSTAGRAM_SESSION_COOKIE, or paste the direct video URL instead.'
        : 'Instagram rejected the stored session. The cookie has probably expired. Replace it, or paste the direct video URL instead.',
    );
  }

  const { bytes, contentType } = await downloadVideo(mediaUrl);
  logger.info('reel downloaded from instagram', { shortcode, sizeBytes: bytes.byteLength });

  return {
    bytes,
    contentType,
    source: {
      kind: 'instagram',
      url: canonicalUrl,
      shortcode,
      sizeBytes: bytes.byteLength,
      contentType,
    },
  };
}

/** Fetches a media URL the reader supplied directly. */
export async function fetchDirectVideo(url: string): Promise<FetchedVideo> {
  const { bytes, contentType } = await downloadVideo(url);
  logger.info('reel downloaded from a direct url', { sizeBytes: bytes.byteLength });

  return {
    bytes,
    contentType,
    source: { kind: 'direct-url', url, sizeBytes: bytes.byteLength, contentType },
  };
}

/** Wraps bytes the reader uploaded, so an upload takes the same path as a fetch. */
export function acceptUploadedVideo(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
): FetchedVideo {
  if (bytes.byteLength > env.maxVideoBytes) {
    throw new ReelFetchError(
      'too-large',
      `That file is ${Math.round(bytes.byteLength / 1_000_000)} MB. The limit is ${Math.round(env.maxVideoBytes / 1_000_000)} MB.`,
    );
  }
  assertVideoContentType(contentType, filename);

  return {
    bytes,
    contentType,
    source: { kind: 'direct-url', url: filename, sizeBytes: bytes.byteLength, contentType },
  };
}
