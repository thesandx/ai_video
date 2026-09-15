import { Card } from '@/components/ui/Card';
import { formatTimecode } from '@/lib/reel-url';
import type { ReelScript } from '@/types/reel';

export interface ScriptPanelProps {
  script: ReelScript;
}

/**
 * The shooting script. Forest, the darkest surface in the system, because it
 * is the payoff of the whole page.
 *
 * Every beat is original work written in the source's style. None of the copy
 * here is taken from the source reel.
 */
export function ScriptPanel({ script }: ScriptPanelProps) {
  return (
    <Card surface="forest" eyebrow="Your shooting script">
      <h2 className="font-display mb-2 text-[26px] font-normal text-balance text-white">
        {script.title}
      </h2>
      <p className="mb-8 max-w-[65ch] text-sm text-white">{script.logline}</p>

      <ol className="flex flex-col gap-6">
        {script.beats.map((beat, index) => (
          <li key={`${beat.start}-${index}`} className="border-t border-white/30 pt-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-sm font-medium text-white tabular-nums">
                {formatTimecode(beat.start)} to {formatTimecode(beat.end)}
              </span>
              <span className="text-sm text-white opacity-85">
                {beat.shotSize}, {beat.cameraMove}
              </span>
            </div>

            <dl className="flex flex-col gap-2 text-sm text-white">
              <div>
                <dt className="font-medium">Visual</dt>
                <dd className="max-w-[65ch] opacity-85">{beat.visual}</dd>
              </div>
              {beat.voiceover.trim() === '' ? null : (
                <div>
                  <dt className="font-medium">Voiceover</dt>
                  <dd className="max-w-[65ch] opacity-85">{beat.voiceover}</dd>
                </div>
              )}
              {beat.onScreenText.trim() === '' ? null : (
                <div>
                  <dt className="font-medium">On screen</dt>
                  <dd className="max-w-[65ch] opacity-85">{beat.onScreenText}</dd>
                </div>
              )}
              <div>
                <dt className="font-medium">Audio</dt>
                <dd className="max-w-[65ch] opacity-85">{beat.audio}</dd>
              </div>
              <div>
                <dt className="font-medium">Direction</dt>
                <dd className="max-w-[65ch] opacity-85">{beat.directorNote}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-t border-white/30 pt-4">
        <h3 className="mb-2 text-sm font-medium text-white">Caption to post with it</h3>
        <p className="max-w-[65ch] text-sm text-white opacity-85">{script.caption}</p>
      </div>

      {script.productionNotes.length === 0 ? null : (
        <div className="mt-6 border-t border-white/30 pt-4">
          <h3 className="mb-2 text-sm font-medium text-white">Production notes</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-white opacity-85">
            {script.productionNotes.map((note) => (
              <li key={note} className="max-w-[65ch]">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
