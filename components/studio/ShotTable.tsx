'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatTimecode } from '@/lib/reel-url';
import type { ProductionPlan } from '@/types/pipeline';

export interface ShotTableProps {
  plan: ProductionPlan;
  /**
   * Omitted where the plan is shown for reading rather than editing. Without it
   * the actions column is dropped, so the table never offers a control that
   * does nothing.
   */
  onRemoveShot?: (shotId: string) => void;
}

/**
 * The shot list, as a real table.
 *
 * Rows and columns carry meaning here, so a screen reader should be able to say
 * "row 3, camera, low close on the puppy". It scrolls inside its own container
 * so the page body never scrolls sideways.
 */
export function ShotTable({ plan, onRemoveShot }: ShotTableProps) {
  const canRemove = onRemoveShot !== undefined;

  return (
    <Card surface="peach" eyebrow="The shot list">
      <h2 className="font-display text-ink-1 mb-1 text-[26px] font-normal text-balance">
        {plan.shots.length} shot{plan.shots.length === 1 ? '' : 's'}, {plan.targetDurationSeconds}{' '}
        seconds
      </h2>
      <p className="text-ink-2 mb-4 max-w-[65ch] text-sm">
        Each shot needs its own first frame before video can run.
        {canRemove ? ' Removing one here removes that requirement with it.' : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            Shots with timecodes, camera setup, the beat, and how long each is generated for.
          </caption>
          <thead>
            <tr className="border-ink-1 border-b-2">
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Shot
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                In / out
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Gen
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Camera
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                The beat
              </th>
              {canRemove ? (
                <th scope="col" className="text-ink-1 py-2 text-sm font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {plan.shots.map((shot) => (
              <tr key={shot.id} className="border-hairline border-b align-top">
                <th scope="row" className="font-display text-ink-1 py-3 pr-4 text-sm font-medium">
                  {shot.id}
                </th>
                <td className="font-display text-ink-2 py-3 pr-4 text-sm whitespace-nowrap tabular-nums">
                  {formatTimecode(shot.startSeconds)} to {formatTimecode(shot.endSeconds)}
                </td>
                <td className="font-display text-ink-2 py-3 pr-4 text-sm tabular-nums">
                  {shot.generateSeconds}s
                </td>
                <td className="text-ink-2 py-3 pr-4 text-sm">{shot.cameraSetup}</td>
                <td className="text-ink-2 py-3 pr-4 text-sm">{shot.beat}</td>
                {onRemoveShot === undefined ? null : (
                  <td className="py-3">
                    <Button size="sm" variant="secondary" onClick={() => onRemoveShot(shot.id)}>
                      Remove
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
