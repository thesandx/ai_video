import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { parseReelUrl } from '@/lib/reel-url';
import { isSupportedVideoModel } from '@/lib/video-models';
import { OpenRouterError } from '@/services/openrouter';
import { directReel } from '@/services/reel-director';
import {
  acceptUploadedVideo,
  fetchDirectVideo,
  type FetchedVideo,
  fetchInstagramReel,
  ReelFetchError,
} from '@/services/reel-fetcher';

/**
 * Turns a reel into a reading and an original script.
 *
 * Node runtime, not edge: the handler base64-encodes video bytes through
 * `Buffer`, and holds a few megabytes in memory while it does.
 */
export const runtime = 'nodejs';

/** Watching a reel and writing a script takes minutes, not seconds. */
export const maxDuration = 300;

/** Maps an expected failure to the status that describes it. */
const REASON_STATUS: Record<string, number> = {
  'login-required': 424,
  'not-found': 404,
  'too-large': 413,
  'not-a-video': 415,
  network: 502,
};

function fail(message: string, status: number, hint?: string) {
  return NextResponse.json({ error: message, ...(hint === undefined ? {} : { hint }) }, { status });
}

/**
 * Reads the request in either shape.
 *
 * A JSON body carries a link; a multipart body carries an uploaded file. Both
 * end at the same `FetchedVideo`, so the rest of the handler does not care
 * which one arrived.
 */
async function readRequest(
  request: Request,
): Promise<
  | { ok: true; video: FetchedVideo; model?: string; angle?: string; correction?: string }
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return { ok: false, response: fail('No file was attached to that upload.', 400) };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const video = acceptUploadedVideo(bytes, file.type, file.name);
    const model = form.get('model');
    const angle = form.get('angle');
    const correction = form.get('correction');
    return {
      ok: true,
      video,
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof angle === 'string' ? { angle } : {}),
      ...(typeof correction === 'string' ? { correction } : {}),
    };
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return { ok: false, response: fail('Send a JSON body with a "url" field.', 400) };
  }

  const url = (body as { url?: unknown }).url;
  if (typeof url !== 'string') {
    return { ok: false, response: fail('Send a JSON body with a "url" field.', 400) };
  }

  const parsed = parseReelUrl(url);
  if (parsed.kind === 'invalid') {
    return { ok: false, response: fail(parsed.reason, 400) };
  }

  const video =
    parsed.kind === 'instagram'
      ? await fetchInstagramReel(parsed.shortcode, parsed.url)
      : await fetchDirectVideo(parsed.url);

  const model = (body as { model?: unknown }).model;
  const angle = (body as { angle?: unknown }).angle;
  const correction = (body as { correction?: unknown }).correction;
  return {
    ok: true,
    video,
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof angle === 'string' ? { angle } : {}),
    ...(typeof correction === 'string' ? { correction } : {}),
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const read = await readRequest(request);
    if (!read.ok) return read.response;

    if (read.model !== undefined && read.model !== '' && !isSupportedVideoModel(read.model)) {
      return fail(`"${read.model}" is not a model this app can send a video to.`, 400);
    }

    const analysis = await directReel(read.video, {
      model: read.model,
      angle: read.angle,
      correction: read.correction,
    });

    logger.info('reel analysed', {
      model: analysis.model,
      sizeBytes: analysis.source.sizeBytes,
      videoTokens: analysis.usage.videoTokens,
      costUsd: analysis.usage.costUsd,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof ReelFetchError) {
      logger.warn('reel download failed', { reason: error.reason });
      return fail(error.message, REASON_STATUS[error.reason] ?? 502);
    }
    if (error instanceof OpenRouterError) {
      logger.error('model call failed', { status: error.status, error });
      return fail(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
    }
    logger.error('analysis failed', { error });
    return fail('Something went wrong while analysing that reel.', 500);
  }
}
