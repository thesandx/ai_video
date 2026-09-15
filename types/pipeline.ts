/**
 * The end to end pipeline: a reel goes in, eight silent clips come out.
 *
 * A run moves through ordered stages, and every stage that spends money sits
 * behind an explicit approval. The shapes here are the contract between the
 * browser, which owns the run, and the route handlers, which stay stateless.
 *
 * Why the browser owns it: Cloud Run gives this app a read-only filesystem, no
 * database and no bucket. Persisting a multi-step run server side would need
 * all three. The plan lives in localStorage, the binary assets live in
 * IndexedDB, and the routes only ever proxy OpenRouter. See
 * `docs/adr/0005-keep-the-run-in-the-browser.md`.
 */

import type { CreativeBrief, ReelReading, ReelScript, ReelSource } from '@/types/reel';

/** Ordered. `STAGES` in `lib/pipeline.ts` is the single source of that order. */
export type StageId =
  | 'source'
  | 'analysis'
  | 'refine'
  | 'plan'
  | 'sheets'
  | 'stills'
  | 'preflight'
  | 'video'
  | 'deliver';

/** How a given asset came to exist. Both are first-class. */
export type AssetOrigin = 'generated' | 'uploaded';

export interface Asset {
  /** Stable key: a character slug for a sheet, a shot id for a still or clip. */
  key: string;
  origin: AssetOrigin;
  mimeType: string;
  sizeBytes: number;
  /** Key into IndexedDB. The bytes never travel through the project JSON. */
  blobKey: string;
  /** Pixel dimensions, when known. Used by preflight to check the aspect ratio. */
  width?: number;
  height?: number;
  /** Seconds, for a clip. */
  durationSeconds?: number;
  createdAt: string;
  /** USD, when this app paid for it. Absent for an upload. */
  costUsd?: number;
}

export interface CharacterSpec {
  /** Slug used as the asset key, for example `meera`. */
  id: string;
  name: string;
  /** The bible string pasted verbatim into every downstream prompt. */
  bible: string;
  /** The character sheet prompt, editable before it is run. */
  sheetPrompt: string;
}

export interface ShotSpec {
  /** `S1`, `S2`, and so on. Used as the asset key. */
  id: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  /** Seconds asked of the video model. Longer than the cut, to leave tail. */
  generateSeconds: number;
  cameraSetup: string;
  beat: string;
  /** Prompt for the opening frame. */
  stillPrompt: string;
  /** Image-to-video motion prompt. Motion only. */
  videoPrompt: string;
  /** Shot id whose still is attached for continuity, or null for the first. */
  continuityFrom: string | null;
}

/** The editable plan, produced from the analysis and refined in chat. */
export interface ProductionPlan {
  title: string;
  aspectRatio: string;
  targetDurationSeconds: number;
  styleBible: string;
  negativePrompt: string;
  characters: readonly CharacterSpec[];
  shots: readonly ShotSpec[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

/** A video job in flight on OpenRouter. */
export interface VideoJob {
  shotId: string;
  jobId: string;
  status: 'pending' | 'completed' | 'failed';
  costUsd?: number;
  error?: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  stage: StageId;
  /** Stages the operator has signed off. A stage runs only once the one before it is approved. */
  approved: readonly StageId[];

  source?: ReelSource;
  reading?: ReelReading;
  brief?: CreativeBrief;
  script?: ReelScript;
  plan?: ProductionPlan;
  chat: readonly ChatTurn[];

  /** Keyed by character id. */
  sheets: Record<string, Asset>;
  /** Keyed by shot id. */
  stills: Record<string, Asset>;
  /** Keyed by shot id. */
  clips: Record<string, Asset>;
  jobs: Record<string, VideoJob>;

  models: {
    analysis: string;
    chat: string;
    image: string;
    video: string;
  };
  /** Running total of what this app has spent, in USD. */
  spendUsd: number;
}

/** Severity decides whether the operator is blocked or merely warned. */
export type IssueLevel = 'error' | 'warning';

/**
 * One preflight finding.
 *
 * `fix` is written for the operator, not the developer: it says which button to
 * press or what to upload, because this is what the UI shows when the run is
 * blocked.
 */
export interface PreflightIssue {
  level: IssueLevel;
  /** Stable code, so a test can assert on it without matching prose. */
  code: string;
  message: string;
  fix: string;
  /** Shot or character this concerns, when it concerns one. */
  subject?: string;
}

export interface PreflightReport {
  ok: boolean;
  issues: readonly PreflightIssue[];
  counts: {
    shots: number;
    stills: number;
    characters: number;
    sheets: number;
    clips: number;
  };
  /** What generating the missing clips would cost, in USD. */
  estimatedVideoUsd: number;
}
