import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Thin client for OpenRouter's chat completions endpoint.
 *
 * Only the parts this app needs, written against behaviour verified against the
 * live API rather than assumed:
 *
 *   - A video is a `video_url` content part on the Chat Completions API. The
 *     Responses API calls the same thing `input_video`; this client uses the
 *     former. A base64 `data:video/mp4;base64,...` URL works and is what the
 *     app sends, because an Instagram media URL is signed and short-lived, so
 *     handing the raw link to a third party is unreliable.
 *   - Confirmation that the model really watched the video is
 *     `usage.prompt_tokens_details.video_tokens`. A non-zero count means the
 *     frames were ingested; zero means the request degraded to text and the
 *     answer is guesswork.
 *   - `reasoning: { enabled: false }` is REJECTED by the Gemini endpoints:
 *     "Reasoning is mandatory for this endpoint and cannot be disabled." So the
 *     token budget has to cover reasoning plus the answer. A budget sized only
 *     for the answer returns an empty string and looks like a model fault.
 *   - Strict `json_schema` response formats do work alongside a video part.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

/** Watching a whole reel and writing a script is slow. Allow for it, but bound it. */
const COMPLETION_TIMEOUT_MS = 300_000;
const MODELS_TIMEOUT_MS = 15_000;

export class OpenRouterError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

export interface CompletionUsage {
  videoTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface VideoCompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Raw video bytes. Encoded to a data URL here, not by the caller. */
  video: { bytes: Uint8Array; contentType: string };
  /** A strict JSON schema the reply must satisfy. */
  schema: { name: string; schema: Record<string, unknown> };
  maxTokens: number;
}

export interface VideoCompletionResult<T> {
  data: T;
  usage: CompletionUsage;
  model: string;
}

/**
 * Encodes bytes as base64 without blowing the call stack.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte array throws
 * `RangeError: Maximum call stack size exceeded`, so this goes through Node's
 * Buffer, which the Cloud Run runtime always has.
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function readUsage(payload: unknown): CompletionUsage {
  const empty: CompletionUsage = {
    videoTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
  };
  if (typeof payload !== 'object' || payload === null) return empty;
  const usage = (payload as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) return empty;

  const details = (usage as { prompt_tokens_details?: unknown }).prompt_tokens_details;
  const videoTokens =
    typeof details === 'object' && details !== null
      ? Number((details as { video_tokens?: unknown }).video_tokens ?? 0)
      : 0;

  return {
    videoTokens: Number.isFinite(videoTokens) ? videoTokens : 0,
    promptTokens: Number((usage as { prompt_tokens?: unknown }).prompt_tokens ?? 0),
    completionTokens: Number((usage as { completion_tokens?: unknown }).completion_tokens ?? 0),
    costUsd: Number((usage as { cost?: unknown }).cost ?? 0),
  };
}

function readContent(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}

/**
 * Sends a video plus a prompt and parses a strict-schema JSON reply.
 *
 * Generic over the reply shape. The schema is enforced server side by
 * OpenRouter, so the cast after `JSON.parse` is checked by the provider rather
 * than being a bare assertion, but the parse itself is still guarded.
 */
export async function completeWithVideo<T>(
  request: VideoCompletionRequest,
): Promise<VideoCompletionResult<T>> {
  if (env.openRouterKey === '') {
    throw new OpenRouterError(
      503,
      'No OpenRouter key is configured. Set OPENROUTER_API_KEY and redeploy.',
    );
  }

  const dataUrl = `data:${request.video.contentType};base64,${toBase64(request.video.bytes)}`;

  const body = {
    model: request.model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: request.userPrompt },
          { type: 'video_url', video_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: request.maxTokens,
    response_format: {
      type: 'json_schema',
      json_schema: { name: request.schema.name, strict: true, schema: request.schema.schema },
    },
  };

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
      signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpenRouterError(
      504,
      `The model did not answer in time. ${error instanceof Error ? error.message : ''}`.trim(),
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? String(
            (payload as { error?: { message?: unknown } }).error?.message ??
              'Unknown provider error',
          )
        : 'Unknown provider error';
    logger.error('openrouter rejected the request', { status: response.status, message });
    throw new OpenRouterError(response.status, message);
  }

  const content = readContent(payload);
  if (content === null || content.trim() === '') {
    throw new OpenRouterError(
      502,
      'The model returned an empty reply. This usually means the token budget was spent on reasoning before the answer started.',
    );
  }

  const usage = readUsage(payload);
  if (usage.videoTokens === 0) {
    // Not fatal: the model still answered. But the answer did not come from
    // watching the video, so the caller should not present it as a reading.
    logger.warn('model reported no video tokens', { model: request.model });
  }

  let data: T;
  try {
    data = JSON.parse(content) as T;
  } catch {
    throw new OpenRouterError(502, 'The model returned a reply that was not valid JSON.');
  }

  return { data, usage, model: request.model };
}

export interface LiveVideoModel {
  id: string;
  name: string;
  contextLength: number;
}

/**
 * Lists every model currently advertising video input.
 *
 * `lib/video-models.ts` holds the curated shortlist the UI offers by default.
 * This exists so the catalogue can be checked against reality rather than
 * quietly going stale.
 */
export async function listVideoModels(): Promise<readonly LiveVideoModel[]> {
  if (env.openRouterKey === '') return [];

  const response = await fetch(MODELS_ENDPOINT, {
    headers: { authorization: `Bearer ${env.openRouterKey}` },
    signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new OpenRouterError(response.status, 'Could not list models from OpenRouter.');
  }

  const payload: unknown = await response.json();
  const rows =
    typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : null;
  if (!Array.isArray(rows)) return [];

  const models: LiveVideoModel[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const architecture = (row as { architecture?: unknown }).architecture;
    if (typeof architecture !== 'object' || architecture === null) continue;
    const modalities = (architecture as { input_modalities?: unknown }).input_modalities;
    if (!Array.isArray(modalities) || !modalities.includes('video')) continue;

    const id = (row as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    models.push({
      id,
      name: String((row as { name?: unknown }).name ?? id),
      contextLength: Number((row as { context_length?: unknown }).context_length ?? 0),
    });
  }
  return models;
}
