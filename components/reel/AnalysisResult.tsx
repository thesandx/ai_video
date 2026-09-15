import { BriefPanel } from '@/components/reel/BriefPanel';
import { HookPanel } from '@/components/reel/HookPanel';
import { ScriptPanel } from '@/components/reel/ScriptPanel';
import { ShotList } from '@/components/reel/ShotList';
import { Card } from '@/components/ui/Card';
import type { ReelAnalysis } from '@/types/reel';

export interface AnalysisResultProps {
  analysis: ReelAnalysis;
}

/**
 * The four result panels, in reading order: what the source does, how it is
 * cut, what you should make, and the script to shoot.
 *
 * Surfaces follow the fixed vocabulary in the design guide, so the colour
 * sequence is mint, peach, yellow, forest rather than a choice made per screen.
 */
export function AnalysisResult({ analysis }: AnalysisResultProps) {
  const { reading, brief, script, usage, model, source } = analysis;

  return (
    <div className="flex flex-col gap-6">
      <Card surface="white">
        <h2 className="font-display text-ink-1 mb-3 text-lg font-medium">What was read</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-ink-1 text-sm font-medium">Subject</dt>
            <dd className="text-ink-2 text-sm">{reading.subject}</dd>
          </div>
          <div>
            <dt className="text-ink-1 text-sm font-medium">Setting</dt>
            <dd className="text-ink-2 text-sm">{reading.setting}</dd>
          </div>
          <div>
            <dt className="text-ink-1 text-sm font-medium">Format</dt>
            <dd className="text-ink-2 text-sm">{reading.format}</dd>
          </div>
        </dl>
        <p className="text-ink-3 border-hairline mt-4 border-t pt-3 text-sm tabular-nums">
          {model} read {Math.round(source.sizeBytes / 100_000) / 10} MB as {usage.videoTokens} video
          tokens. Run cost {usage.costUsd.toFixed(4)} USD.
        </p>
      </Card>

      <HookPanel reading={reading} />
      <ShotList
        shots={reading.shots}
        editingStyle={reading.editingStyle}
        soundDesign={reading.soundDesign}
      />
      <BriefPanel brief={brief} structuralFormula={reading.structuralFormula} reading={reading} />
      <ScriptPanel script={script} />
    </div>
  );
}
