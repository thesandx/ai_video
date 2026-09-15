import { Card } from '@/components/ui/Card';
import { formatTimecode } from '@/lib/reel-url';
import type { ReelReading } from '@/types/reel';

export interface HookPanelProps {
  reading: ReelReading;
}

/**
 * What the opening seconds do. Mint, because it is the first thing the reader
 * should act on and the design reserves mint for a ready state.
 */
export function HookPanel({ reading }: HookPanelProps) {
  return (
    <Card surface="mint" eyebrow="The hook">
      <h2 className="font-display text-ink-1 mb-3 text-[26px] font-normal text-balance">
        {reading.hook.device}
      </h2>
      <p className="text-ink-2 mb-4 max-w-[65ch] text-sm">{reading.hook.whyItWorks}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-ink-1 text-sm font-medium">Lands at</dt>
          <dd className="font-display text-ink-2 text-sm tabular-nums">
            {formatTimecode(reading.hook.landsAtSeconds)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-1 text-sm font-medium">Runs for</dt>
          <dd className="font-display text-ink-2 text-sm tabular-nums">
            {formatTimecode(reading.durationSeconds)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-1 text-sm font-medium">Pacing</dt>
          <dd className="text-ink-2 text-sm">{reading.pacing}</dd>
        </div>
      </dl>
    </Card>
  );
}
