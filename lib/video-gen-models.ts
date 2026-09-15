/**
 * Models that GENERATE video, which is a different catalogue from the models
 * that WATCH video in `lib/video-models.ts`.
 *
 * They also live behind a different API. Video generation is not part of
 * `/api/v1/chat/completions` and its models do not appear in `/api/v1/models`:
 * they are served by the asynchronous `/api/v1/videos` endpoint and listed by
 * `/api/v1/videos/models`. Looking for `video` in a chat model's
 * `output_modalities` finds nothing and wrongly suggests the platform cannot
 * make video at all.
 *
 * Rates below are measured from completed jobs on this account, not quoted.
 * `kwaivgi/kling-v3.0-std` billed 0.420 USD for 5s, 0.504 for 6s and 0.588 for
 * 7s: a flat 0.084 USD per second. A text-only job with no first frame billed
 * 0.63, so supplying a still is cheaper as well as more controlled.
 */

export interface VideoGenModel {
  id: string;
  label: string;
  note: string;
  /** USD per second of generated footage. */
  usdPerSecond: number;
  /** Durations the endpoint accepts, in seconds. */
  durations: readonly number[];
  aspectRatios: readonly string[];
  /** True when the model accepts a first frame image, which this pipeline requires. */
  acceptsFirstFrame: boolean;
}

export const VIDEO_GEN_MODELS: readonly VideoGenModel[] = [
  {
    id: 'kwaivgi/kling-v3.0-std',
    label: 'Kling 3.0 Standard',
    note: 'The default. Measured end to end on this pipeline at 0.084 USD per second.',
    usdPerSecond: 0.084,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['16:9', '9:16', '1:1'],
    acceptsFirstFrame: true,
  },
  {
    id: 'kwaivgi/kling-v3.0-pro',
    label: 'Kling 3.0 Pro',
    note: 'Cleaner motion and better hands. Costs more than standard.',
    usdPerSecond: 0.17,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['16:9', '9:16', '1:1'],
    acceptsFirstFrame: true,
  },
  {
    id: 'bytedance/seedance-2.0-fast',
    label: 'Seedance 2.0 Fast',
    note: 'Quick and cheap. Good for low motion shots such as a held close-up.',
    usdPerSecond: 0.06,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['1:1', '3:4', '9:16', '4:3', '16:9', '21:9', '9:21'],
    acceptsFirstFrame: true,
  },
  {
    id: 'minimax/hailuo-3',
    label: 'Hailuo 3',
    note: 'Best at body physics and comedy. Use it for a leap or a bounce.',
    usdPerSecond: 0.1,
    durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    acceptsFirstFrame: true,
  },
  {
    id: 'google/veo-3.1-fast',
    label: 'Veo 3.1 Fast',
    note: 'Strongest face retention on a held close-up. Only 4, 6 or 8 seconds.',
    usdPerSecond: 0.15,
    durations: [4, 6, 8],
    aspectRatios: ['16:9', '9:16'],
    acceptsFirstFrame: true,
  },
  {
    id: 'alibaba/wan-2.7',
    label: 'Wan 2.7',
    note: 'The cheapest option here. Expect looser character hold.',
    usdPerSecond: 0.05,
    durations: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    acceptsFirstFrame: true,
  },
];

export const DEFAULT_VIDEO_GEN_MODEL = 'kwaivgi/kling-v3.0-std';

export function findVideoGenModel(id: string): VideoGenModel | undefined {
  return VIDEO_GEN_MODELS.find((m) => m.id === id);
}

/**
 * The shortest supported duration that still covers `needed` seconds.
 *
 * Clip lengths are fixed per model and rarely match a shot, so the pipeline
 * generates the next size up and trims into the tail at assembly.
 */
export function chooseDuration(model: VideoGenModel, needed: number): number | null {
  const fits = model.durations.filter((d) => d >= needed);
  if (fits.length === 0) return null;
  return Math.min(...fits);
}
