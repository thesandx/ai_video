/**
 * Shared contracts for the reel analysis pipeline.
 *
 * Split deliberately in two halves:
 *   - `ReelReading` DESCRIBES the source reel. It is analysis, and it is
 *     factual: shot sizes, pacing, where the hook lands.
 *   - `ReelScript` and `CreativeBrief` are ORIGINAL work produced in the style
 *     of the source. They must never carry the source's own dialogue, caption
 *     or on-screen copy. The prompt in `services/reel-director.ts` enforces
 *     that, and the split exists so the boundary is visible in the type system
 *     rather than living only in a prompt string.
 */

/** How the video file reached us. */
export type ReelSourceKind = 'instagram' | 'direct-url';

export interface ReelSource {
  kind: ReelSourceKind;
  /** The canonical reel URL, or the direct media URL. */
  url: string;
  /** Instagram shortcode, when the source is a reel. */
  shortcode?: string;
  /** Bytes of the downloaded file. */
  sizeBytes: number;
  contentType: string;
}

export interface Shot {
  /** Seconds from the start of the reel. */
  start: number;
  end: number;
  /** Wide, medium, close-up, and so on. */
  shotSize: string;
  /** Static, handheld push-in, whip pan, and so on. */
  cameraMove: string;
  /** What happens on screen, described plainly. */
  action: string;
  /** Why this shot works where it sits in the sequence. */
  purpose: string;
}

export interface HookReading {
  /** What the first seconds do to stop the scroll. */
  device: string;
  /** Seconds at which the hook resolves or the promise is made. */
  landsAtSeconds: number;
  /** Why it holds attention. */
  whyItWorks: string;
}

/** Descriptive analysis of the source reel. */
export interface ReelReading {
  durationSeconds: number;
  format: string;
  subject: string;
  setting: string;
  pacing: string;
  editingStyle: string;
  soundDesign: string;
  textOnScreen: string;
  hook: HookReading;
  shots: readonly Shot[];
  /** The repeatable structure, stated so it can be reused on another topic. */
  structuralFormula: string;
}

/** The plan for the reader's own, new video. */
export interface CreativeBrief {
  concept: string;
  targetDurationSeconds: number;
  audience: string;
  tone: string;
  /** The single idea the new video must land. */
  controllingIdea: string;
  /** What is borrowed: technique and structure, never content. */
  borrowedTechnique: string;
  /** How the new video deliberately differs from the source. */
  pointOfDifference: string;
}

export interface ScriptBeat {
  start: number;
  end: number;
  shotSize: string;
  cameraMove: string;
  /** What the camera sees. */
  visual: string;
  /** Spoken line or voiceover, original copy. */
  voiceover: string;
  /** Original on-screen caption. */
  onScreenText: string;
  /** Music, effects, ambience. */
  audio: string;
  /** Direction for the performer or the operator. */
  directorNote: string;
}

export interface ReelScript {
  title: string;
  logline: string;
  beats: readonly ScriptBeat[];
  /** Original caption to post with the finished video. */
  caption: string;
  productionNotes: readonly string[];
}

export interface ReelAnalysis {
  source: ReelSource;
  model: string;
  reading: ReelReading;
  brief: CreativeBrief;
  script: ReelScript;
  usage: {
    videoTokens: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  };
}
