import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';

/**
 * Video generation through OpenRouter's asynchronous `/api/v1/videos` endpoint.
 *
 * This is a different API from chat completions, with a different model list.
 * Two things about it are worth knowing before touching this file.
 *
 * 1. The models do NOT appear in `/api/v1/models`, and no chat model declares
 *    `video` in `output_modalities`. Concluding from that listing that the
 *    platform cannot generate video is wrong. `/api/v1/videos/models` is the
 *    real catalogue, and it lists Kling, Veo, Seedance, Hailuo and others.
 *
 * 2. The request body is NOT validated strictly. An unrecognised key does not
 *    fail the request: it is accepted and STARTS A BILLABLE JOB. Probing this
 *    endpoint with speculative fields costs real money, once per probe. Only
 *    add a field that this file already knows, and change the shape here first.
 *
 * The job is created, then polled, then its content is fetched with the same
 * bearer token. The browser never sees the key, so the content fetch is
 * proxied by the route handler.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/videos';
const CREATE_TIMEOUT_MS = 180_000;
const POLL_TIMEOUT_MS = 60_000;
const CONTENT_TIMEOUT_MS = 300_000;

export interface VideoJobRequest {
  model: string;
  prompt: string;
  aspectRatio: string;
  durationSeconds: number;
  /** The first frame, as a `data:image/...;base64,` URL. */
  firstFrameDataUrl: string;
}

export interface VideoJobCreated {
  id: string;
  status: string;
}

export interface VideoJobStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  costUsd?: number;
  contentUrl?: string;
  error?: string;
}

function authHeaders(): Record<string, string> {
  if (env.openRouterKey === '') {
    throw new OpenRouterError(503, 'No OpenRouter key is configured. Set OPENROUTER_API_KEY.');
  }
  return { authorization: `Bearer ${env.openRouterKey}` };
}

/** Starts a job. This spends money the moment it returns 202. */
export async function createVideoJob(request: VideoJobRequest): Promise<VideoJobCreated> {
  const body = {
    model: request.model,
    prompt: request.prompt,
    aspect_ratio: request.aspectRatio,
    duration: request.durationSeconds,
    generate_audio: false,
    frame_images: [
      {
        type: 'image_url',
        image_url: { url: request.firstFrameDataUrl },
        frame_type: 'first_frame',
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpenRouterError(
      504,
      `Could not reach the video API. ${error instanceof Error ? error.message : ''}`.trim(),
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? JSON.stringify((payload as { error?: unknown }).error ?? payload).slice(0, 300)
        : 'Unknown error';
    throw new OpenRouterError(response.status, `The video API refused the job: ${message}`);
  }

  const id = (payload as { id?: unknown })?.id;
  if (typeof id !== 'string') {
    throw new OpenRouterError(502, 'The video API accepted the job but returned no job id.');
  }

  logger.info('video job created', { jobId: id, model: request.model });
  return { id, status: String((payload as { status?: unknown }).status ?? 'pending') };
}

/** Reads a job's current state. Cheap and safe to call repeatedly. */
export async function readVideoJob(jobId: string): Promise<VideoJobStatus> {
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new OpenRouterError(response.status, `Could not read video job ${jobId}.`);
  }

  const payload: unknown = await response.json();
  const raw = String((payload as { status?: unknown }).status ?? 'pending');
  const status: VideoJobStatus['status'] =
    raw === 'completed' ? 'completed' : raw === 'failed' || raw === 'error' ? 'failed' : 'pending';

  const urls = (payload as { unsigned_urls?: unknown }).unsigned_urls;
  const contentUrl = Array.isArray(urls) && typeof urls[0] === 'string' ? urls[0] : undefined;
  const cost = Number(((payload as { usage?: { cost?: unknown } }).usage ?? {}).cost ?? 0);

  return {
    id: jobId,
    status,
    ...(Number.isFinite(cost) && cost > 0 ? { costUsd: cost } : {}),
    ...(contentUrl === undefined ? {} : { contentUrl }),
  };
}

/**
 * Downloads a finished clip.
 *
 * The content URL needs the bearer token, so this runs on the server and the
 * route streams the bytes to the browser.
 */
export async function fetchVideoContent(contentUrl: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const response = await fetch(contentUrl, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new OpenRouterError(response.status, 'Could not download the finished clip.');
  }

  const buffer = await response.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    contentType: response.headers.get('content-type') ?? 'video/mp4',
  };
}
