import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { formatTimecode } from '@/lib/reel-url';
import type { Shot } from '@/types/reel';

export interface ShotListProps {
  shots: readonly Shot[];
  editingStyle: string;
  soundDesign: string;
}

/**
 * How the source is cut, shot by shot.
 *
 * A real `<table>`, because rows and columns carry meaning here: a screen
 * reader should be able to say "row 3, camera move, whip pan". It scrolls
 * inside its own container so the page body never scrolls sideways.
 */
export function ShotList({ shots, editingStyle, soundDesign }: ShotListProps) {
  return (
    <Card surface="peach" eyebrow="How it is cut">
      <h2 className="font-display text-ink-1 mb-4 text-[26px] font-normal text-balance">
        {shots.length} {shots.length === 1 ? 'shot' : 'shots'} in the source
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            Shot by shot breakdown of the source reel, with timecodes, shot sizes and camera moves.
          </caption>
          <thead>
            <tr className="border-ink-1 border-b-2">
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Shot
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Time
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Framing
              </th>
              <th scope="col" className="text-ink-1 py-2 pr-4 text-sm font-medium">
                Camera
              </th>
              <th scope="col" className="text-ink-1 py-2 text-sm font-medium">
                What happens, and why
              </th>
            </tr>
          </thead>
          <tbody>
            {shots.map((shot, index) => (
              <tr key={`${shot.start}-${index}`} className="border-hairline border-b align-top">
                <th scope="row" className="py-3 pr-4">
                  <Chip tone="white">{index + 1}</Chip>
                </th>
                <td className="font-display text-ink-2 py-3 pr-4 text-sm whitespace-nowrap tabular-nums">
                  {formatTimecode(shot.start)} to {formatTimecode(shot.end)}
                </td>
                <td className="text-ink-2 py-3 pr-4 text-sm">{shot.shotSize}</td>
                <td className="text-ink-2 py-3 pr-4 text-sm">{shot.cameraMove}</td>
                <td className="text-ink-2 py-3 text-sm">
                  {shot.action}
                  <span className="text-ink-3 block">{shot.purpose}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="border-ink-1 mt-6 grid grid-cols-1 gap-4 border-t-2 pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-ink-1 text-sm font-medium">Editing</dt>
          <dd className="text-ink-2 text-sm">{editingStyle}</dd>
        </div>
        <div>
          <dt className="text-ink-1 text-sm font-medium">Sound</dt>
          <dd className="text-ink-2 text-sm">{soundDesign}</dd>
        </div>
      </dl>
    </Card>
  );
}
