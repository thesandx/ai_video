import { env } from '@/lib/env';
import { OpenRouterError } from '@/services/openrouter';
import type { ProductionPlan, ShotSpec } from '@/types/pipeline';
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

/**
 * A JSON Schema object where every declared property is required.
 *
 * Structured outputs with `strict: true` refuse a schema that leaves a
 * property optional, so the required list is the property list.
 */
function object(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

/**
 * A described field.
 *
 * The description is not decoration. A bare `{ type: 'string' }` tells a model
 * the shape and nothing about the content, and a model asked for a required
 * string it cannot interpret will fill it with the field name: the `beat`
 * column once read "beatNumber" for every shot. Every field below says what
 * belongs in it, in the words the planner should act on.
 */
function str(description: string): Record<string, unknown> {
  return { type: 'string', description };
}

function num(description: string): Record<string, unknown> {
  return { type: 'number', description };
}

const SCHEMA = object({
  title: str('Title of the new reel, in sentence case.'),
  aspectRatio: str('Aspect ratio as width colon height. Always "9:16".'),
  targetDurationSeconds: num('Length of the finished reel in seconds.'),
  styleBible: str(
    'One paragraph naming the visual style every shot inherits: rendering, lighting, palette, texture. Say "stylised 3D animation", never a studio name.',
  ),
  negativePrompt: str('Comma separated list of what no image may contain.'),
  characters: {
    type: 'array',
    description: 'Every character that appears. All original.',
    items: object({
      id: str('Lower case slug used as the asset key, for example "maya".'),
      name: str('The name the character is called by.'),
      bible: str(
        'The dense one paragraph description with hex values. Pasted verbatim into every later prompt, so it must stand alone.',
      ),
      sheetPrompt: str('Prompt that generates this character reference sheet.'),
    }),
  },
  shots: {
    type: 'array',
    description: 'One shot per beat, in playing order.',
    items: object({
      id: str('Shot id in the form "S1", "S2", "S3", numbered from 1 in order.'),
      index: num('Position in the sequence, starting at 1.'),
      startSeconds: num('Timecode in the finished reel where this shot starts.'),
      endSeconds: num('Timecode in the finished reel where this shot ends.'),
      generateSeconds: num(
        'How many seconds of video to generate for this shot. A LENGTH, never a timecode: take endSeconds minus startSeconds, then add one or two seconds of tail to trim. A four second cut generates five or six seconds.',
      ),
      cameraSetup: str(
        'The camera for this shot: shot size, angle and height. Must differ from the shot before it.',
      ),
      beat: str(
        'What happens in this shot, as one plain sentence of action naming who does what. For example: "Maya leans over the puddle and sees the reflection blink back." Never a number, a label, or a placeholder.',
      ),
      stillPrompt: str(
        'Prompt for the opening frame. Describes the opening state of the action, not its peak.',
      ),
      videoPrompt: str(
        'Motion only, with exactly one camera move. Ends with the no audio, no mouth movement instruction.',
      ),
    }),
  },
});

/** Most tail a shot may generate beyond its cut, in seconds. */
const MAX_TAIL_SECONDS = 2;

/**
 * Fills in what the planner is not asked for, and repairs what it gets wrong.
 *
 * `continuityFrom` is structural rather than creative, so it is derived here
 * and cannot come back pointing at a shot that does not exist.
 *
 * `generateSeconds` is repaired because the mistake is expensive. Video is
 * billed by the second, and a planner that reads the field as a timecode
 * returns 27 for the last shot of a 26 second reel instead of 7. That is four
 * times the clip and four times the bill, and nothing downstream would have
 * questioned it.
 */
export function normaliseShots(shots: readonly ShotSpec[]): ShotSpec[] {
  return shots.map((shot, index) => {
    const cut = Math.max(0, shot.endSeconds - shot.startSeconds);
    const ceiling = cut + MAX_TAIL_SECONDS;
    const asked = shot.generateSeconds;
    const usable = Number.isFinite(asked) && asked >= cut && asked <= ceiling;

    return {
      ...shot,
      generateSeconds: usable ? asked : Math.round(cut + 1),
      continuityFrom: index === 0 ? null : (shots[index - 1]?.id ?? null),
    };
  });
}

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

Build the production plan. Use 9:16. Set generateSeconds to the length of the cut, that is endSeconds minus startSeconds, plus one or two seconds of tail to trim. It is a duration in seconds, not a timecode.`;

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

  const shots = normaliseShots(parsed.shots);

  const cost = Number(((payload as { usage?: { cost?: unknown } }).usage ?? {}).cost ?? 0);

  return {
    plan: { ...parsed, shots },
    costUsd: Number.isFinite(cost) ? cost : 0,
  };
}
