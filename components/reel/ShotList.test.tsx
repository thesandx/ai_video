import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShotList } from '@/components/reel/ShotList';
import type { Shot } from '@/types/reel';

const SHOTS: readonly Shot[] = [
  {
    start: 0,
    end: 1.4,
    shotSize: 'Close-up',
    cameraMove: 'Handheld push-in',
    action: 'Hands open a notebook.',
    purpose: 'Sets the promise before a word is spoken.',
  },
  {
    start: 1.4,
    end: 6,
    shotSize: 'Medium',
    cameraMove: 'Static',
    action: 'The subject speaks to camera.',
    purpose: 'Delivers the claim.',
  },
];

describe('ShotList', () => {
  it('renders a real table, because rows and columns carry meaning', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('gives the table an accessible caption', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByRole('table')).toHaveAccessibleName(/Shot by shot breakdown/);
  });

  it('counts the shots in the heading', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByRole('heading', { name: '2 shots in the source' })).toBeInTheDocument();
  });

  it('uses the singular when there is one shot', () => {
    const single = SHOTS.slice(0, 1);
    render(<ShotList shots={single} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByRole('heading', { name: '1 shot in the source' })).toBeInTheDocument();
  });

  it('prints a timecode range per shot, not just a colour', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByText('0:00 to 0:01')).toBeInTheDocument();
  });

  it('numbers each row so the shot order is readable without colour', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0] as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('reports the editing and sound reading', () => {
    render(<ShotList shots={SHOTS} editingStyle="Hard cuts" soundDesign="Room tone" />);
    expect(screen.getByText('Hard cuts')).toBeInTheDocument();
    expect(screen.getByText('Room tone')).toBeInTheDocument();
  });
});
