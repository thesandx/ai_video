import { describe, expect, it } from 'vitest';

import { normaliseShots } from '@/services/plan-builder';
import type { ShotSpec } from '@/types/pipeline';

function shot(overrides: Partial<ShotSpec> & Pick<ShotSpec, 'id' | 'index'>): ShotSpec {
  return {
    startSeconds: 0,
    endSeconds: 4,
    generateSeconds: 5,
    cameraSetup: 'Low close',
    beat: 'Maya jumps in.',
    stillPrompt: 'still',
    videoPrompt: 'motion',
    continuityFrom: null,
    ...overrides,
  };
}

describe('normaliseShots', () => {
  it('keeps a generate length that is the cut plus a usable tail', () => {
    const [first] = normaliseShots([shot({ id: 'S1', index: 1 })]);
    expect(first?.generateSeconds).toBe(5);
  });

  it('accepts the cut length exactly, with no tail', () => {
    const [first] = normaliseShots([shot({ id: 'S1', index: 1, generateSeconds: 4 })]);
    expect(first?.generateSeconds).toBe(4);
  });

  it('repairs a timecode returned in place of a length', () => {
    // The planner returned endSeconds + 1 for a shot running 0:20 to 0:26.
    const [first] = normaliseShots([
      shot({ id: 'S6', index: 6, startSeconds: 20, endSeconds: 26, generateSeconds: 27 }),
    ]);
    expect(first?.generateSeconds).toBe(7);
  });

  it('repairs a generate length shorter than the cut it must cover', () => {
    const [first] = normaliseShots([
      shot({ id: 'S1', index: 1, startSeconds: 0, endSeconds: 4, generateSeconds: 2 }),
    ]);
    expect(first?.generateSeconds).toBe(5);
  });

  it('derives continuity from the shot before, and leaves the first one open', () => {
    const shots = normaliseShots([
      shot({ id: 'S1', index: 1 }),
      shot({ id: 'S2', index: 2, startSeconds: 4, endSeconds: 8, generateSeconds: 5 }),
      shot({ id: 'S3', index: 3, startSeconds: 8, endSeconds: 12, generateSeconds: 5 }),
    ]);
    expect(shots.map((s) => s.continuityFrom)).toEqual([null, 'S1', 'S2']);
  });

  it('never trusts a continuity link the planner supplied', () => {
    const shots = normaliseShots([
      shot({ id: 'S1', index: 1, continuityFrom: 'S99' }),
      shot({ id: 'S2', index: 2, continuityFrom: 'S99' }),
    ]);
    expect(shots.map((s) => s.continuityFrom)).toEqual([null, 'S1']);
  });
});
