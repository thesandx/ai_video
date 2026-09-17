import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanSummary } from '@/components/studio/PlanSummary';
import type { ProductionPlan } from '@/types/pipeline';

const PLAN: ProductionPlan = {
  title: 'The Echo of Play',
  aspectRatio: '9:16',
  targetDurationSeconds: 26,
  styleBible: 'Flat pastel cutouts, thick outlines, no gradients.',
  negativePrompt: 'photoreal, text, watermark',
  characters: [
    { id: 'maya', name: 'Maya', bible: 'Nine years old, red raincoat.', sheetPrompt: 'Maya sheet' },
    { id: 'lila', name: 'Lila', bible: 'A grey tabby cat.', sheetPrompt: 'Lila sheet' },
  ],
  shots: [
    {
      id: 'S1',
      index: 1,
      startSeconds: 0,
      endSeconds: 4,
      generateSeconds: 4,
      cameraSetup: 'Low close on the puddle',
      beat: 'Maya jumps in.',
      stillPrompt: 'Maya at the edge of a puddle, flat pastel cutout.',
      videoPrompt: 'Maya jumps, water arcs upward.',
      continuityFrom: null,
    },
  ],
};

describe('PlanSummary', () => {
  it('names the plan, so the reader sees what the model is talking about', () => {
    render(<PlanSummary plan={PLAN} />);
    expect(screen.getByRole('heading', { name: 'The Echo of Play' })).toBeInTheDocument();
  });

  it('counts the shots and the characters', () => {
    render(<PlanSummary plan={PLAN} />);
    expect(screen.getByText(/26 seconds, 9:16, 1 shot, 2 characters/)).toBeInTheDocument();
  });

  it('lists every character with its bible', () => {
    render(<PlanSummary plan={PLAN} />);
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('Nine years old, red raincoat.')).toBeInTheDocument();
    expect(screen.getByText('Lila')).toBeInTheDocument();
  });

  it('shows the style bible, which every downstream prompt inherits', () => {
    render(<PlanSummary plan={PLAN} />);
    expect(screen.getByText(/Flat pastel cutouts/)).toBeInTheDocument();
  });
});
