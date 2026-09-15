import { env } from '@/lib/env';
import { OpenRouterError } from '@/services/openrouter';
import type { ChatTurn, ProductionPlan } from '@/types/pipeline';

/**
 * The refinement conversation.
 *
 * Between reading the reel and spending money on images, the operator needs to
 * argue with the plan: change a character, cut a shot, retime a beat. This runs
 * on a cheap, long-context text model so that conversation costs almost
 * nothing, and the whole plan is re-sent every turn rather than kept server
 * side, because the browser owns the run.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 120_000;
const MAX_TOKENS = 4_000;

const SYSTEM_PROMPT = `You are a short-form video director helping refine a production plan before any money is spent generating images or video.

The plan is given to you as JSON. Answer questions about it and suggest concrete changes. Be specific and brief: name the shot, say what changes, say why.

When the operator asks for a change, reply in two parts:
1. A short sentence saying what you changed and why.
2. A fenced json code block containing ONLY the fields of the plan that change, in the same shape as the plan. Omit anything unchanged.

If they are only asking a question, answer it and include no json block.

Rules for any script content you write: it is original work. Never reproduce dialogue, captions, on-screen words or song lyrics from the source reel. Never use an em dash or an en dash. No emoji.`;

export interface ChatReply {
  message: string;
  /** A partial plan the operator can apply, when the model proposed one. */
  patch?: Record<string, unknown>;
  costUsd: number;
}

/** Pulls the first fenced json block out of a reply, if there is one. */
export function extractPatch(text: string): Record<string, unknown> | null {
  const match = /```json\s*([\s\S]*?)```/.exec(text);
  if (match === null || match[1] === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function refine(
  model: string,
  plan: ProductionPlan,
  history: readonly ChatTurn[],
  message: string,
): Promise<ChatReply> {
  if (env.openRouterKey === '') {
    throw new OpenRouterError(503, 'No OpenRouter key is configured. Set OPENROUTER_API_KEY.');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Here is the current plan:\n\n${JSON.stringify(plan, null, 2)}` },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: message },
  ];

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
      body: JSON.stringify({ model, messages, max_tokens: MAX_TOKENS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpenRouterError(
      504,
      `The chat model did not answer in time. ${error instanceof Error ? error.message : ''}`.trim(),
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null
        ? String((payload as { error?: { message?: unknown } }).error?.message ?? 'Unknown error')
        : 'Unknown error';
    throw new OpenRouterError(response.status, detail);
  }

  const choices = (payload as { choices?: unknown }).choices;
  const text =
    Array.isArray(choices) && typeof choices[0] === 'object' && choices[0] !== null
      ? String(((choices[0] as { message?: { content?: unknown } }).message ?? {}).content ?? '')
      : '';

  const patch = extractPatch(text);
  const cost = Number(((payload as { usage?: { cost?: unknown } }).usage ?? {}).cost ?? 0);

  return {
    message: text,
    ...(patch === null ? {} : { patch }),
    costUsd: Number.isFinite(cost) ? cost : 0,
  };
}
