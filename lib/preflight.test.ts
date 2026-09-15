import { describe, expect, it } from 'vitest';

import { createProject } from '@/lib/pipeline';
import { preflight } from '@/lib/preflight';
import type { Asset, Project, ShotSpec } from '@/types/pipeline';

const MODELS: Project['models'] = {
  analysis: 'google/gemini-3.6-flash',
  chat: 'deepseek/deepseek-v4-flash',
  image: 'google/gemini-2.5-flash-image',
  video: 'kwaivgi/kling-v3.0-std',
};

function still(key: string, width = 768, height = 1344): Asset {
  return {
    key,
    origin: 'generated',
    mimeType: 'image/png',
    sizeBytes: 1_000_000,
    blobKey: `blob_${key}`,
    width,
    height,
    createdAt: '2026-09-15T00:00:00.000Z',
  };
}

function shot(index: number, overrides: Partial<ShotSpec> = {}): ShotSpec {
  const start = (index - 1) * 4;
  return {
    id: `S${index}`,
    index,
    startSeconds: start,
    endSeconds: start + 4,
    generateSeconds: 5,
    cameraSetup: 'Medium, static',
    beat: 'Something happens.',
    stillPrompt: 'a still prompt',
    videoPrompt: 'the motion',
    continuityFrom: index === 1 ? null : `S${index - 1}`,
    ...overrides,
  };
}

/** A run that should pass cleanly: 3 shots, 3 stills, 1 character, 1 sheet. */
function healthyProject(shotCount = 3): Project {
  const p = createProject(MODELS);
  const shots = Array.from({ length: shotCount }, (_, i) => shot(i + 1));
  return {
    ...p,
    plan: {
      title: 'Test reel',
      aspectRatio: '9:16',
      targetDurationSeconds: shotCount * 4,
      styleBible: 'style',
      negativePrompt: 'negative',
      characters: [{ id: 'lead', name: 'Lead', bible: 'bible', sheetPrompt: 'sheet' }],
      shots,
    },
    sheets: { lead: { ...still('lead'), key: 'lead' } },
    stills: Object.fromEntries(shots.map((s) => [s.id, still(s.id)])),
  };
}

const codes = (p: Project) => preflight(p).issues.map((i) => i.code);

describe('preflight, the happy path', () => {
  it('passes a complete run', () => {
    const report = preflight(healthyProject());
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('counts what it found, so the UI can show the tally', () => {
    const report = preflight(healthyProject(3));
    expect(report.counts).toEqual({ shots: 3, stills: 3, characters: 1, sheets: 1, clips: 0 });
  });

  it('estimates the video spend at the measured per-second rate', () => {
    // 3 shots, 5s each on Kling standard at 0.084 USD per second.
    expect(preflight(healthyProject(3)).estimatedVideoUsd).toBeCloseTo(1.26, 3);
  });
});

describe('preflight blocks a run with a missing first frame', () => {
  /**
   * The case this gate exists for: the plan needs 6 shots, only 5 stills were
   * generated or uploaded. Without this the sixth clip is generated from
   * nothing, or the run fails after money is already spent.
   */
  it('refuses 6 shots with only 5 stills, and names the missing one', () => {
    const p = healthyProject(6);
    const stills = { ...p.stills };
    delete stills.S6;
    const report = preflight({ ...p, stills });

    expect(report.ok).toBe(false);
    const missing = report.issues.filter((i) => i.code === 'missing-still');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.subject).toBe('S6');
    expect(missing[0]?.level).toBe('error');
  });

  it('reports every missing still, not just the first', () => {
    const p = healthyProject(4);
    const report = preflight({ ...p, stills: { S1: still('S1') } });
    expect(report.issues.filter((i) => i.code === 'missing-still').map((i) => i.subject)).toEqual([
      'S2',
      'S3',
      'S4',
    ]);
  });

  it('tells the operator they may upload instead of generating', () => {
    const p = healthyProject(2);
    const report = preflight({ ...p, stills: { S1: still('S1') } });
    const issue = report.issues.find((i) => i.code === 'missing-still');
    expect(issue?.fix).toMatch(/upload/i);
  });
});

describe('preflight blocks a run with a missing character sheet', () => {
  it('refuses when a character has no sheet', () => {
    const p = healthyProject();
    const report = preflight({ ...p, sheets: {} });
    expect(report.ok).toBe(false);
    expect(codes({ ...p, sheets: {} })).toContain('missing-sheet');
  });

  it('accepts an uploaded sheet exactly like a generated one', () => {
    const p = healthyProject();
    const uploaded: Asset = { ...still('lead'), origin: 'uploaded' };
    expect(preflight({ ...p, sheets: { lead: uploaded } }).ok).toBe(true);
  });
});

describe('preflight checks the plan itself', () => {
  it('refuses a run with no plan at all', () => {
    const report = preflight(createProject(MODELS));
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe('no-plan');
  });

  it('refuses a plan with no shots', () => {
    const p = healthyProject();
    expect(codes({ ...p, plan: { ...p.plan!, shots: [] } })).toContain('no-shots');
  });

  it('refuses a shot with no motion prompt', () => {
    const p = healthyProject(1);
    const shots = [shot(1, { videoPrompt: '   ' })];
    expect(codes({ ...p, plan: { ...p.plan!, shots } })).toContain('empty-video-prompt');
  });

  it('refuses a shot that ends before it starts', () => {
    const p = healthyProject(1);
    const shots = [shot(1, { startSeconds: 5, endSeconds: 2 })];
    expect(codes({ ...p, plan: { ...p.plan!, shots } })).toContain('bad-timecode');
  });

  it('refuses a continuity chain pointing at a shot that does not exist', () => {
    const p = healthyProject(1);
    const shots = [shot(1, { continuityFrom: 'S9' })];
    expect(codes({ ...p, plan: { ...p.plan!, shots } })).toContain('dangling-continuity');
  });
});

describe('preflight checks the chosen video model', () => {
  it('refuses an unknown model', () => {
    const p = healthyProject();
    const report = preflight({ ...p, models: { ...MODELS, video: 'nope/not-real' } });
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('unknown-video-model');
  });

  it('refuses a model that cannot produce the plan aspect ratio', () => {
    const p = healthyProject();
    // Veo supports 16:9 and 9:16 only.
    const odd = { ...p, plan: { ...p.plan!, aspectRatio: '4:3' } };
    expect(codes({ ...odd, models: { ...MODELS, video: 'google/veo-3.1-fast' } })).toContain(
      'model-aspect-unsupported',
    );
  });

  it('refuses a duration the model cannot generate', () => {
    const p = healthyProject(1);
    // Veo offers 4, 6 and 8 seconds only, so 30 cannot be satisfied.
    const shots = [shot(1, { generateSeconds: 30 })];
    const bad = {
      ...p,
      plan: { ...p.plan!, shots },
      models: { ...MODELS, video: 'google/veo-3.1-fast' },
    };
    expect(codes(bad)).toContain('duration-unsupported');
  });
});

describe('preflight warns without blocking', () => {
  it('warns when a still is the wrong shape but still lets the run proceed', () => {
    const p = healthyProject(1);
    const report = preflight({ ...p, stills: { S1: still('S1', 1024, 1024) } });
    const issue = report.issues.find((i) => i.code === 'still-aspect-mismatch');
    expect(issue?.level).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('warns when generation is shorter than the cut', () => {
    const p = healthyProject(1);
    const shots = [shot(1, { startSeconds: 0, endSeconds: 8, generateSeconds: 5 })];
    const report = preflight({ ...p, plan: { ...p.plan!, shots } });
    expect(report.issues.find((i) => i.code === 'short-generation')?.level).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('warns about a still left behind by a deleted shot', () => {
    const p = healthyProject(2);
    const report = preflight({ ...p, stills: { ...p.stills, S9: still('S9') } });
    expect(report.issues.find((i) => i.code === 'orphan-still')?.subject).toBe('S9');
    expect(report.ok).toBe(true);
  });

  it('warns that regenerating replaces clips already paid for', () => {
    const p = healthyProject(2);
    const clips = { S1: { ...still('S1'), mimeType: 'video/mp4' } };
    const report = preflight({ ...p, clips });
    expect(report.issues.map((i) => i.code)).toContain('clips-exist');
    expect(report.ok).toBe(true);
  });

  it('leaves clips it already has out of the cost estimate', () => {
    const p = healthyProject(2);
    const clips = { S1: { ...still('S1'), mimeType: 'video/mp4' } };
    // One shot left at 5s x 0.084.
    expect(preflight({ ...p, clips }).estimatedVideoUsd).toBeCloseTo(0.42, 3);
  });

  it('warns when two shots overlap on the timeline', () => {
    const p = healthyProject(1);
    const shots = [
      shot(1, { startSeconds: 0, endSeconds: 6 }),
      shot(2, { startSeconds: 3, endSeconds: 8 }),
    ];
    const report = preflight({
      ...p,
      plan: { ...p.plan!, shots },
      stills: { S1: still('S1'), S2: still('S2') },
    });
    expect(report.issues.map((i) => i.code)).toContain('overlapping-shots');
  });
});

describe('every issue is actionable', () => {
  it('gives a fix for each finding, because the UI shows it to an operator', () => {
    const p = healthyProject(3);
    const report = preflight({ ...p, stills: {}, sheets: {} });
    expect(report.issues.length).toBeGreaterThan(0);
    for (const issue of report.issues) {
      expect(issue.fix.length).toBeGreaterThan(10);
      expect(issue.message.length).toBeGreaterThan(10);
    }
  });
});
