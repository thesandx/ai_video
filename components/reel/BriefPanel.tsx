import { Card } from '@/components/ui/Card';
import type { CreativeBrief, ReelReading } from '@/types/reel';

export interface BriefPanelProps {
  brief: CreativeBrief;
  structuralFormula: string;
  reading: ReelReading;
}

/**
 * The plan for the reader's own video. Yellow, because this is the part they
 * act on.
 */
export function BriefPanel({ brief, structuralFormula }: BriefPanelProps) {
  const rows: ReadonlyArray<{ term: string; detail: string }> = [
    { term: 'The idea it has to land', detail: brief.controllingIdea },
    { term: 'Who it is for', detail: brief.audience },
    { term: 'Tone', detail: brief.tone },
    { term: 'What you are borrowing', detail: brief.borrowedTechnique },
    { term: 'How yours differs', detail: brief.pointOfDifference },
    { term: 'The reusable formula', detail: structuralFormula },
  ];

  return (
    <Card surface="yellow" eyebrow="Your brief">
      <h2 className="font-display text-ink-1 mb-2 text-[26px] font-normal text-balance">
        {brief.concept}
      </h2>
      <p className="text-ink-2 mb-6 text-sm tabular-nums">
        Target length: {Math.round(brief.targetDurationSeconds)} seconds
      </p>

      <dl className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.term} className="border-hairline border-t pt-3 first:border-t-0 first:pt-0">
            <dt className="text-ink-1 text-sm font-medium">{row.term}</dt>
            <dd className="text-ink-2 max-w-[65ch] text-sm">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
