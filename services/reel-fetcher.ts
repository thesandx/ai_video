import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ReelSource } from '@/types/reel';

/**
 * Getting the video file.
 *
 * There are two ways in, and neither needs a credential: the reader pastes a
 * direct media URL, or uploads a file. Both end at the same `FetchedVideo`, so
 * nothing downstream knows which one arrived.
 *
 * Downloading from Instagram was tried and removed. See
 * `docs/adr/0008-drop-the-instagram-resolver.md`.
 */

/** Distinguishes an expected, explainable failure from a bug. */
export type ReelErrorReason = 'not-found' | 'too-large' | 'not-a-video' | 'network';

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

/**
 * A desktop browser user agent.
 *
 * Some content delivery networks answer an unrecognised client with an error
 * page rather than the file, so the download asks as a browser would.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
