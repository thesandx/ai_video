import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';

/**
 * Image generation through OpenRouter's chat endpoint.
 *
 * Images come back on `message.images`, not in the text content, and only when
 * `modalities` asks for them. Reference images are ordinary `image_url` parts,
 * which is how a character sheet and the previous still are chained into a new
 * frame.
 *
 * Aspect ratio is not a prompt instruction: asking for "vertical 9:16" in words
 * still returns a square. `image_config.aspect_ratio` is what actually works,
 * and it was verified returning 768x1344.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 300_000;

export interface ImageRequest {
  model: string;
  prompt: string;
  /** Data URLs attached as references, in order. */
  references?: readonly string[];
  aspectRatio?: string;
}

export interface GeneratedImage {
  /** `data:image/png;base64,...` as returned by the provider. */
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  costUsd: number;
}

function readImage(payload: unknown): { url: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const images = (message as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const image = images[0];
  if (typeof image !== 'object' || image === null) return null;
  const holder = (image as { image_url?: unknown }).image_url;
  if (typeof holder !== 'object' || holder === null) return null;
  const url = (holder as { url?: unknown }).url;
  return typeof url === 'string' ? { url } : null;
}

/** The text a model returns instead of an image, usually a refusal. */
function readText(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return '';
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return '';
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

export async function generateImage(request: ImageRequest): Promise<GeneratedImage> {
  if (env.openRouterKey === '') {
    throw new OpenRouterError(503, 'No OpenRouter key is configured. Set OPENROUTER_API_KEY.');
  }

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: request.prompt }];
  for (const reference of request.references ?? []) {
    content.push({ type: 'image_url', image_url: { url: reference } });
  }

  const body: Record<string, unknown> = {
    model: request.model,
    messages: [{ role: 'user', content }],
    modalities: ['image', 'text'],
  };
  if (request.aspectRatio !== undefined) {
    body.image_config = { aspect_ratio: request.aspectRatio };
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.openRouterKey}`,
        'content-type': 'application/json',
        'http-referer': env.appUrl,
        'x-title': env.appName,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpenRouterError(
      504,
      `The image model did not answer in time. ${error instanceof Error ? error.message : ''}`.trim(),
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? String((payload as { error?: { message?: unknown } }).error?.message ?? 'Unknown error')
        : 'Unknown error';
    throw new OpenRouterError(response.status, message);
  }

  const image = readImage(payload);
  if (image === null) {
    // A refusal arrives as ordinary text with a 200, so surface it verbatim:
    // it usually names exactly what the provider objected to.
    const text = readText(payload);
    throw new OpenRouterError(
      422,
      text === ''
        ? 'The model returned no image and gave no reason.'
        : `The model returned no image. It said: ${text.slice(0, 300)}`,
    );
  }

  const base64 = image.url.split(',', 2)[1] ?? '';
  const mimeType = image.url.slice(5).split(';', 1)[0] ?? 'image/png';
  const usage = (payload as { usage?: { cost?: unknown } }).usage;
  const costUsd = Number(usage?.cost ?? 0);

  logger.info('image generated', { model: request.model, costUsd });

  return {
    dataUrl: image.url,
    mimeType,
    sizeBytes: Math.floor((base64.length * 3) / 4),
    costUsd: Number.isFinite(costUsd) ? costUsd : 0,
  };
}
