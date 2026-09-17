import { Card } from '@/components/ui/Card';
import type { ProductionPlan } from '@/types/pipeline';

export interface PlanSummaryProps {
  plan: ProductionPlan;
}

/**
 * The plan, readable, while the reader talks about changing it.
 *
 * The refine stage sends the whole plan to the model on every turn, so the
 * model answers as though the reader can see it. Until this existed the reader
 * could not: a reply like "the plan is in the JSON block above" pointed at
 * something the page never rendered.
 *
 * This is the summary only. The shot list stays in `ShotTable`, which already
 * renders rows and columns as a real table.
 */
export function PlanSummary({ plan }: PlanSummaryProps) {
  return (
    <Card eyebrow="The plan">
      <h2 className="font-display text-ink-1 mb-1 text-[26px] font-normal text-balance">
        {plan.title}
      </h2>
      <p className="font-display text-ink-2 mb-5 text-sm tabular-nums">
        {plan.targetDurationSeconds} seconds, {plan.aspectRatio}, {plan.shots.length} shot
        {plan.shots.length === 1 ? '' : 's'}, {plan.characters.length} character
        {plan.characters.length === 1 ? '' : 's'}
      </p>

      <h3 className="text-ink-1 mb-2 text-sm font-medium">Characters</h3>
      <dl className="mb-5 flex flex-col gap-3">
        {plan.characters.map((character) => (
          <div key={character.id}>
            <dt className="text-ink-1 text-sm font-medium">{character.name}</dt>
            <dd className="text-ink-2 max-w-[65ch] text-sm">{character.bible}</dd>
          </div>
        ))}
      </dl>

      <h3 className="text-ink-1 mb-2 text-sm font-medium">Style</h3>
      <p className="text-ink-2 max-w-[65ch] text-sm">{plan.styleBible}</p>
    </Card>
  );
}
