/**
 * Stage order and the rules for moving between stages.
 *
 * Pure: no network, no storage. The browser owns the run, so this file decides
 * only what is allowed, never what is stored.
 */

import type { Project, StageId } from '@/types/pipeline';

/** The single source of stage order. Everything else derives from it. */
export const STAGES: readonly StageId[] = [
  'source',
  'analysis',
  'refine',
  'plan',
  'sheets',
  'stills',
  'preflight',
  'video',
  'deliver',
];

export const STAGE_LABELS: Record<StageId, string> = {
  source: 'Reel in',
  analysis: 'Read the reel',
  refine: 'Refine with chat',
  plan: 'Lock the plan',
  sheets: 'Character sheets',
  stills: 'First frames',
  preflight: 'Preflight checks',
  video: 'Generate video',
  deliver: 'Download',
};

/**
 * One line per stage, shown under its heading.
 *
 * Written for the operator: what this stage does and what it costs them.
 */
export const STAGE_BLURBS: Record<StageId, string> = {
  source: 'Paste a reel link, or upload the MP4 yourself.',
  analysis: 'A video model watches the reel and reports how it is built.',
  refine: 'Talk to a model to change anything before a rupee is spent on images.',
  plan: 'Confirm the characters and the shot list. This fixes what must exist later.',
  sheets:
    'One reference sheet per character. Generate here, or run the prompt yourself and upload.',
  stills: 'One opening frame per shot, chained so the characters hold.',
  preflight: 'Every check that must pass before video spending starts.',
  video: 'One silent clip per shot, from its own still.',
  deliver: 'Download every clip, then stitch and post.',
};

export function stageIndex(stage: StageId): number {
  return STAGES.indexOf(stage);
}

/** True when `stage` has been signed off. */
export function isApproved(project: Project, stage: StageId): boolean {
  return project.approved.includes(stage);
}

/**
 * A stage is reachable once every stage before it is approved.
 *
 * This is what stops someone jumping to video with half a shot list, which is
 * the expensive mistake the whole gate exists to prevent.
 */
export function canEnter(project: Project, stage: StageId): boolean {
  const target = stageIndex(stage);
  if (target <= 0) return true;
  return STAGES.slice(0, target).every((earlier) => project.approved.includes(earlier));
}

/** The furthest stage the operator may currently open. */
export function furthestReachable(project: Project): StageId {
  let reachable: StageId = 'source';
  for (const stage of STAGES) {
    if (canEnter(project, stage)) reachable = stage;
  }
  return reachable;
}

/** Approves a stage and advances, without mutating the original. */
export function approve(project: Project, stage: StageId): Project {
  const approved = project.approved.includes(stage)
    ? project.approved
    : [...project.approved, stage];
  const next = STAGES[stageIndex(stage) + 1] ?? stage;
  return { ...project, approved, stage: next, updatedAt: new Date().toISOString() };
}

/**
 * Withdraws approval for a stage and every stage after it.
 *
 * Editing the shot list after stills exist has to invalidate the later
 * approvals, otherwise the run could reach video with stills that no longer
 * match the plan.
 */
export function revokeFrom(project: Project, stage: StageId): Project {
  const from = stageIndex(stage);
  const approved = project.approved.filter((s) => stageIndex(s) < from);
  return {
    ...project,
    approved,
    stage,
    updatedAt: new Date().toISOString(),
  };
}

/** A fresh run. */
export function createProject(models: Project['models']): Project {
  const now = new Date().toISOString();
  return {
    id: `run_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
    stage: 'source',
    approved: [],
    chat: [],
    sheets: {},
    stills: {},
    clips: {},
    jobs: {},
    models,
    spendUsd: 0,
  };
}
