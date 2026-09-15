/**
 * The models on OpenRouter that can actually watch a video.
 *
 * "Multimodal" is not enough. A model has to declare `video` in its
 * `architecture.input_modalities`, otherwise OpenRouter rejects a `video_url`
 * content part. This list was built by querying `GET /api/v1/models` and
 * filtering on that field, then narrowing to the ones worth offering.
 *
 * `services/openrouter.ts` can refresh the full list at runtime. This catalogue
 * exists so the UI has a curated, ordered default set with a reason attached to
 * each entry, rather than 79 rows of mostly-identical model ids.
 *
 * The catalogue is also a gate: `isSupportedVideoModel` rejects anything absent
 * from it, so a model left out here cannot be requested at all. Leaving one out
 * is therefore a decision, not an oversight. When a caller asks for a video
 * capable model that is missing, add it rather than telling them it is
 * unsupported. Check with `listVideoModels()` before deciding.
 *
 * Prices are USD per million prompt tokens, as reported by the models endpoint
 * at the time of writing. Treat them as indicative, not as a billing source.
 */

export interface VideoModel {
  id: string;
  label: string;
  /** Why someone would pick this one. */
  note: string;
  /** USD per million prompt tokens. */
  promptUsdPerMillion: number;
  contextTokens: number;
}

/**
 * Ordered best-first. The head of this list is the default.
 *
 * `google/gemini-3.5-flash` leads because it was verified end to end against
 * this exact pipeline: a base64 `video_url` part plus a strict `json_schema`
 * response format, which is the combination the director service depends on.
 */
export const VIDEO_MODELS: readonly VideoModel[] = [
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    note: 'The default. Verified against this pipeline, strong on shot detection, fast.',
    promptUsdPerMillion: 1.5,
    contextTokens: 1_048_576,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    note: 'The most careful reader of subtext and pacing. Slower and dearer.',
    promptUsdPerMillion: 2.0,
    contextTokens: 1_048_576,
  },
  {
    id: 'google/gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    note: 'Newest of the Flash line. Also reads audio, so it catches sound design.',
    promptUsdPerMillion: 0.75,
    contextTokens: 1_048_576,
  },
  {
    id: 'google/gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    note: 'Reads audio. Half the price of 3.5 Flash for the same context window.',
    promptUsdPerMillion: 0.75,
    contextTokens: 1_048_576,
  },
  {
    id: 'google/gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    note: 'Reads audio. Half the price of 3.5 Flash for the same context window.',
    promptUsdPerMillion: 0.75,
    contextTokens: 1_048_576,
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    note: 'The cheap Google option. Good enough for a first pass on a short reel.',
    promptUsdPerMillion: 0.3,
    contextTokens: 1_048_576,
  },
  {
    id: 'qwen/qwen3.8-max-0902',
    label: 'Qwen 3.8 Max',
    note: 'The strongest non-Google reader. Useful as a second opinion.',
    promptUsdPerMillion: 2.0,
    contextTokens: 1_000_000,
  },
  {
    id: 'minimax/minimax-m3',
    label: 'MiniMax M3',
    note: 'Cheap, and notably good on motion and transitions.',
    promptUsdPerMillion: 0.3,
    contextTokens: 1_048_576,
  },
  {
    id: 'z-ai/glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    note: 'The lowest cost per run here. Expect a coarser shot breakdown.',
    promptUsdPerMillion: 0.15,
    contextTokens: 1_310_720,
  },
];

export const DEFAULT_VIDEO_MODEL = 'google/gemini-3.5-flash';

/** True when the id is one this app is prepared to send a video to. */
export function isSupportedVideoModel(id: string): boolean {
  return VIDEO_MODELS.some((model) => model.id === id);
}

/** The catalogue entry for an id, or the default when it is unknown. */
export function resolveVideoModel(id: string | undefined): VideoModel {
  const found = VIDEO_MODELS.find((model) => model.id === id);
  if (found !== undefined) return found;
  // The list is a non-empty literal, so index 0 always exists. `noUncheckedIndexedAccess`
  // cannot see that, hence the explicit fallback rather than a non-null assertion.
  const first = VIDEO_MODELS[0];
  if (first === undefined) throw new Error('VIDEO_MODELS must not be empty');
  return first;
}
