/**
 * The gate that stands between a plan and spending money on video.
 *
 * Video is the only expensive stage: a clip costs roughly a hundred times what
 * a still costs. Every failure mode that is cheap to catch here is expensive to
 * catch afterwards, so this file is deliberately strict and deliberately pure.
 *
 * The rule that matters most: a shot without its own first frame cannot be
 * generated. A plan with 6 shots and 5 stills is the exact case this exists to
 * refuse, whether the missing still was never generated or never uploaded.
 *
 * Pure: no network, no storage, no clock. Every check is a unit test.
 */

import { chooseDuration, findVideoGenModel } from '@/lib/video-gen-models';
import type { PreflightIssue, PreflightReport, Project } from '@/types/pipeline';

/** Tolerance when comparing a still's aspect ratio to the plan's. */
const ASPECT_TOLERANCE = 0.02;

function parseAspect(ratio: string): number | null {
  const parts = ratio.split(':');
  if (parts.length !== 2) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  return w / h;
}

/**
 * Runs every check and reports what must be fixed.
 *
 * Errors block. Warnings are shown and can be accepted, because some of them
 * are legitimate choices: a deliberate gap between two shots, for example.
 */
export function preflight(project: Project): PreflightReport {
  const issues: PreflightIssue[] = [];
  const plan = project.plan;

  const counts = {
    shots: plan?.shots.length ?? 0,
    stills: Object.keys(project.stills).length,
    characters: plan?.characters.length ?? 0,
    sheets: Object.keys(project.sheets).length,
    clips: Object.keys(project.clips).length,
  };

  if (plan === undefined) {
    issues.push({
      level: 'error',
      code: 'no-plan',
      message: 'There is no production plan yet.',
      fix: 'Go back to Lock the plan and confirm the characters and shot list.',
    });
    return { ok: false, issues, counts, estimatedVideoUsd: 0 };
  }

  if (plan.shots.length === 0) {
    issues.push({
      level: 'error',
      code: 'no-shots',
      message: 'The plan has no shots.',
      fix: 'Add at least one shot before generating video.',
    });
  }

  const model = findVideoGenModel(project.models.video);
  if (model === undefined) {
    issues.push({
      level: 'error',
      code: 'unknown-video-model',
      message: `"${project.models.video}" is not a video model this app can use.`,
      fix: 'Pick a model from the list on the video stage.',
    });
  } else {
    if (!model.acceptsFirstFrame) {
      issues.push({
        level: 'error',
        code: 'model-no-first-frame',
        message: `${model.label} cannot take a first frame image.`,
        fix: 'Choose a model that accepts a first frame, so your stills are used.',
      });
    }
    if (!model.aspectRatios.includes(plan.aspectRatio)) {
      issues.push({
        level: 'error',
        code: 'model-aspect-unsupported',
        message: `${model.label} does not support ${plan.aspectRatio}.`,
        fix: `Choose a model that supports ${plan.aspectRatio}, or change the plan's aspect ratio.`,
      });
    }
  }

  // Characters: every character in the plan needs a sheet, generated or uploaded.
  for (const character of plan.characters) {
    const sheet = project.sheets[character.id];
    if (sheet === undefined) {
      issues.push({
        level: 'error',
        code: 'missing-sheet',
        message: `${character.name} has no character sheet.`,
        fix: `Generate the sheet for ${character.name}, or upload your own on the Character sheets stage.`,
        subject: character.id,
      });
    } else if (!sheet.mimeType.startsWith('image/')) {
      issues.push({
        level: 'error',
        code: 'sheet-not-image',
        message: `The sheet for ${character.name} is ${sheet.mimeType}, not an image.`,
        fix: 'Replace it with a PNG or JPEG.',
        subject: character.id,
      });
    }
  }

  const planAspect = parseAspect(plan.aspectRatio);
  const shotIds = new Set(plan.shots.map((s) => s.id));

  // Shots: the heart of the gate.
  for (const shot of plan.shots) {
    const still = project.stills[shot.id];

    if (still === undefined) {
      issues.push({
        level: 'error',
        code: 'missing-still',
        message: `${shot.id} has no first frame.`,
        fix: `Generate the still for ${shot.id}, or upload one, before video can run.`,
        subject: shot.id,
      });
    } else {
      if (!still.mimeType.startsWith('image/')) {
        issues.push({
          level: 'error',
          code: 'still-not-image',
          message: `The first frame for ${shot.id} is ${still.mimeType}, not an image.`,
          fix: 'Replace it with a PNG or JPEG.',
          subject: shot.id,
        });
      }
      if (
        planAspect !== null &&
        still.width !== undefined &&
        still.height !== undefined &&
        still.height > 0
      ) {
        const actual = still.width / still.height;
        if (Math.abs(actual - planAspect) > ASPECT_TOLERANCE) {
          issues.push({
            level: 'warning',
            code: 'still-aspect-mismatch',
            message: `${shot.id} is ${still.width}x${still.height}, which is not ${plan.aspectRatio}.`,
            fix: 'The model will letterbox or crop it. Regenerate the still at the right ratio to avoid that.',
            subject: shot.id,
          });
        }
      }
    }

    if (shot.videoPrompt.trim() === '') {
      issues.push({
        level: 'error',
        code: 'empty-video-prompt',
        message: `${shot.id} has no motion prompt.`,
        fix: `Write what moves in ${shot.id} on the Lock the plan stage.`,
        subject: shot.id,
      });
    }

    const cut = shot.endSeconds - shot.startSeconds;
    if (cut <= 0) {
      issues.push({
        level: 'error',
        code: 'bad-timecode',
        message: `${shot.id} ends at or before it starts.`,
        fix: 'Correct the in and out points.',
        subject: shot.id,
      });
    } else if (shot.generateSeconds < cut) {
      issues.push({
        level: 'warning',
        code: 'short-generation',
        message: `${shot.id} generates ${shot.generateSeconds}s but the cut needs ${cut.toFixed(1)}s.`,
        fix: 'Generate longer than the cut so there is tail to trim into.',
        subject: shot.id,
      });
    }

    if (model !== undefined && chooseDuration(model, shot.generateSeconds) === null) {
      issues.push({
        level: 'error',
        code: 'duration-unsupported',
        message: `${model.label} cannot generate ${shot.generateSeconds}s for ${shot.id}.`,
        fix: `Supported lengths are ${model.durations.join(', ')} seconds. Shorten the shot or change model.`,
        subject: shot.id,
      });
    }

    if (shot.continuityFrom !== null && !shotIds.has(shot.continuityFrom)) {
      issues.push({
        level: 'error',
        code: 'dangling-continuity',
        message: `${shot.id} chains from ${shot.continuityFrom}, which is not in the shot list.`,
        fix: 'Point it at a shot that exists, or clear the chain.',
        subject: shot.id,
      });
    }
  }

  // Stills with no matching shot: usually a shot was deleted after the still was made.
  for (const key of Object.keys(project.stills)) {
    if (!shotIds.has(key)) {
      issues.push({
        level: 'warning',
        code: 'orphan-still',
        message: `There is a first frame for ${key}, but no such shot.`,
        fix: 'It will be ignored. Delete it, or add the shot back.',
        subject: key,
      });
    }
  }

  // Sequence sanity, reported once rather than per shot.
  const ordered = [...plan.shots].sort((a, b) => a.startSeconds - b.startSeconds);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (prev === undefined || cur === undefined) continue;
    if (cur.startSeconds < prev.endSeconds - 0.001) {
      issues.push({
        level: 'warning',
        code: 'overlapping-shots',
        message: `${prev.id} and ${cur.id} overlap on the timeline.`,
        fix: 'Adjust the in and out points so the cuts meet cleanly.',
        subject: cur.id,
      });
    }
  }

  // Clips already present are about to be replaced.
  const existingClips = plan.shots.filter((s) => project.clips[s.id] !== undefined);
  if (existingClips.length > 0) {
    issues.push({
      level: 'warning',
      code: 'clips-exist',
      message: `${existingClips.length} shot${existingClips.length === 1 ? ' has' : 's have'} a clip already.`,
      fix: 'Generating again replaces them and costs again. Skip the ones you are happy with.',
    });
  }

  const missing = plan.shots.filter((s) => project.clips[s.id] === undefined);
  const estimatedVideoUsd =
    model === undefined
      ? 0
      : missing.reduce((sum, s) => {
          const seconds = chooseDuration(model, s.generateSeconds) ?? s.generateSeconds;
          return sum + seconds * model.usdPerSecond;
        }, 0);

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    counts,
    estimatedVideoUsd: Math.round(estimatedVideoUsd * 1000) / 1000,
  };
}
