import { env } from '@/lib/env';
import { OpenRouterError } from '@/services/openrouter';
import type { ProductionPlan } from '@/types/pipeline';
import type { CreativeBrief, ReelReading, ReelScript } from '@/types/reel';

/**
 * Turns the reading, the brief and the script into a production plan.
 *
 * This is where character bibles and per-shot prompts are written. It runs on
 * the cheap chat model rather than the video model, because no video is being
 * watched: the reading already happened and is passed in as text. One call
 * costs a fraction of a cent.
 *
 * The bibles matter more than they look. A generated sheet drifts, and the
 * bible string is what pulls it back, so it is pasted verbatim into every
 * downstream prompt rather than summarised.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 180_000;
const MAX_TOKENS = 16_000;

const SYSTEM_PROMPT = `You are a production designer preparing a stylised 3D animated vertical reel for generation.

You are given a reading of a source reel and an original script written in its style. Turn them into a production plan that image and video models can execute.

Rules that are not negotiable:

CHARACTERS. Invent original characters. Never describe a real person from the source footage, and never resemble any existing animated character from any studio. For each character write a "bible": one dense paragraph naming skin tone with a hex value, facial features stated independently of complexion, eye shape and hex, hair colour hex and texture, clothing with hex values and fabric behaviour, one signature prop, and accessories. This exact string is pasted into every later prompt, so it must stand alone.

EAR AND SILHOUETTE CONSISTENCY. If a character has a distinctive feature, state it in absolute terms and never contradict it in a shot description. Saying ears "lift" when the bible says they hang is the single most common cause of a character changing between shots.

SHOTS. One shot per beat. Every shot needs a different camera setup from the one before it. Give each shot a still prompt describing the OPENING state, not the peak, and a video prompt describing MOTION ONLY with exactly one camera move.

SILENT. Characters never speak, sing or open their mouths to talk. Every video prompt ends with a no audio, no mouth movement instruction.

STYLE. Never use the words cartoon, Pixar, Disney, DreamWorks, Ghibli, feature film or any studio name: an IP filter blocks them. Say "stylised 3D animation" instead.

WRITING. No em dashes or en dashes. No emoji. Sentence case.

Return JSON only, matching the schema.`;

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;

function object(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

const SCHEMA = object({
  title: str,
  aspectRatio: str,
  targetDurationSeconds: num,
  styleBible: str,
  negativePrompt: str,
  characters: {
    type: 'array',
    items: object({ id: str, name: str, bible: str, sheetPrompt: str }),
  },
  shots: {
    type: 'array',
    items: object({
      id: str,
      index: num,
      startSeconds: num,
      endSeconds: num,
      generateSeconds: num,
      cameraSetup: str,
      beat: str,
      stillPrompt: str,
      videoPrompt: str,
    }),
  },
});

export async function buildPlan(
  model: string,
  reading: ReelReading,
  brief: CreativeBrief,
  script: ReelScript,
): Promise<{ plan: ProductionPlan; costUsd: number }> {
  if (env.openRouterKey === '') {
    throw new OpenRouterError(503, 'No OpenRouter key is configured. Set OPENROUTER_API_KEY.');
  }

  const userPrompt = `READING OF THE SOURCE:
${JSON.stringify(reading, null, 2)}

THE BRIEF FOR THE NEW VIDEO:
${JSON.stringify(brief, null, 2)}

THE SCRIPT:
${JSON.stringify(script, null, 2)}

Build the production plan. Use 9:16. Generate each shot one to two seconds longer than its cut, so there is tail to trim.`;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.openRouterKey}`,
      'content-type': 'application/json',
      'http-referer': env.appUrl,
      'x-title': env.appName,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: MAX_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'production_plan', strict: true, schema: SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null
        ? String((payload as { error?: { message?: unknown } }).error?.message ?? 'Unknown error')
        : 'Unknown error';
    throw new OpenRouterError(response.status, detail);
  }

  const choices = (payload as { choices?: unknown }).choices;
  const content =
    Array.isArray(choices) && typeof choices[0] === 'object' && choices[0] !== null
      ? String(((choices[0] as { message?: { content?: unknown } }).message ?? {}).content ?? '')
      : '';

  let parsed: ProductionPlan;
  try {
    parsed = JSON.parse(content) as ProductionPlan;
  } catch {
    throw new OpenRouterError(502, 'The planner returned a reply that was not valid JSON.');
  }

  // The model is not asked for `continuityFrom`: it is structural, not creative,
  // so it is derived here and cannot come back dangling.
  const shots = parsed.shots.map((shot, index) => ({
    ...shot,
    continuityFrom: index === 0 ? null : (parsed.shots[index - 1]?.id ?? null),
  }));

  const cost = Number(((payload as { usage?: { cost?: unknown } }).usage ?? {}).cost ?? 0);

  return {
    plan: { ...parsed, shots },
    costUsd: Number.isFinite(cost) ? cost : 0,
  };
}
