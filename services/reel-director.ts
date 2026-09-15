import { resolveVideoModel } from '@/lib/video-models';
import { completeWithVideo } from '@/services/openrouter';
import type { FetchedVideo } from '@/services/reel-fetcher';
import type { CreativeBrief, ReelAnalysis, ReelReading, ReelScript } from '@/types/reel';

/**
 * The director and scriptwriter pass.
 *
 * One call does two jobs, and the split matters:
 *
 *   1. READ the source. What shots, what pacing, what the hook does. This part
 *      is descriptive and should be accurate.
 *   2. WRITE something new in that style. This part is original work. It
 *      borrows the technique, the shape and the pacing, never the content.
 *
 * Keeping both in one request is deliberate: the writer needs the reading in
 * working memory, and a second call would pay to re-encode the video. The
 * prompt draws the line between them, and `types/reel.ts` mirrors it so the
 * boundary is visible in the type system too.
 */

/** Reasoning is mandatory on these endpoints and spends the same budget as the answer. */
const MAX_TOKENS = 16_000;

const SYSTEM_PROMPT = `You are a short-form video director and scriptwriter. You watch a reel, work out exactly how it is built, and then write an original script that uses the same craft on a different idea.

You do two separate jobs in one reply.

JOB 1, READ THE SOURCE. Describe what is actually on screen. Give real timecodes, real shot sizes and real camera moves. Say where the hook lands and why it holds attention. State the structural formula in a way that could be applied to any subject. Be specific: "handheld push-in on the hands, 0.0 to 1.4s" beats "dynamic opening".

JOB 2, WRITE AN ORIGINAL SCRIPT. This is new work, inspired by the source, not a copy of it.
- Invent a new concept. Do not retell the source's story or reuse its subject.
- Write your own voiceover, your own on-screen text and your own caption. Never reproduce the source's dialogue, captions, on-screen words, or any song lyrics, even partially or reworded.
- Do not name or specify the source's music track. Describe the kind of audio that would work instead.
- What you borrow is craft: the shot grammar, the cutting rhythm, the way the hook is set, the shape of the structure.
- Say plainly, in pointOfDifference, how your version departs from the source.

Write the script so someone can shoot it. Every beat needs a timecode, a shot size, a camera move, what the camera sees and what is heard. Keep the total duration close to the source's.

Voice: plain, declarative, concrete. No hype adjectives. No emoji. Never use an em dash or an en dash; use a comma, a colon or a full stop.`;

const USER_PROMPT = `Watch this reel. Read how it is built, then write me an original script inspired by its craft, so I can shoot my own version on a different idea. Return JSON only.`;

/** Shorthand for a required string field, since every one of them repeats. */
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

/**
 * The reply schema, enforced strictly by the provider.
 *
 * Strict mode requires `additionalProperties: false` and every key listed in
 * `required`, which is why `object()` derives `required` rather than trusting
 * anyone to keep two lists in step.
 */
const SCHEMA = object({
  reading: object({
    durationSeconds: num,
    format: str,
    subject: str,
    setting: str,
    pacing: str,
    editingStyle: str,
    soundDesign: str,
    textOnScreen: str,
    structuralFormula: str,
    hook: object({ device: str, landsAtSeconds: num, whyItWorks: str }),
    shots: {
      type: 'array',
      items: object({
        start: num,
        end: num,
        shotSize: str,
        cameraMove: str,
        action: str,
        purpose: str,
      }),
    },
  }),
  brief: object({
    concept: str,
    targetDurationSeconds: num,
    audience: str,
    tone: str,
    controllingIdea: str,
    borrowedTechnique: str,
    pointOfDifference: str,
  }),
  script: object({
    title: str,
    logline: str,
    caption: str,
    productionNotes: { type: 'array', items: str },
    beats: {
      type: 'array',
      items: object({
        start: num,
        end: num,
        shotSize: str,
        cameraMove: str,
        visual: str,
        voiceover: str,
        onScreenText: str,
        audio: str,
        directorNote: str,
      }),
    },
  }),
});

interface DirectorReply {
  reading: ReelReading;
  brief: CreativeBrief;
  script: ReelScript;
}

export interface DirectOptions {
  /** Model id from the catalogue. Falls back to the default when unknown. */
  model?: string | undefined;
  /** Steer the brief, for example "make it about filter coffee". */
  angle?: string | undefined;
}

/**
 * Runs the full pass over a downloaded reel.
 *
 * Throws `OpenRouterError` on a provider failure, which the route maps to a
 * status and a reader-facing message.
 */
export async function directReel(
  video: FetchedVideo,
  options: DirectOptions = {},
): Promise<ReelAnalysis> {
  const model = resolveVideoModel(options.model);
  const angle = options.angle?.trim() ?? '';

  const userPrompt =
    angle === '' ? USER_PROMPT : `${USER_PROMPT}\n\nSteer the new concept this way: ${angle}`;

  const result = await completeWithVideo<DirectorReply>({
    model: model.id,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    video: { bytes: video.bytes, contentType: video.contentType },
    schema: { name: 'reel_direction', schema: SCHEMA },
    maxTokens: MAX_TOKENS,
  });

  return {
    source: video.source,
    model: result.model,
    reading: result.data.reading,
    brief: result.data.brief,
    script: result.data.script,
    usage: result.usage,
  };
}
