'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Project, ShotSpec } from '@/types/pipeline';

export interface DeliverPanelProps {
  shots: readonly ShotSpec[];
  project: Project;
  clipUrls: Record<string, string>;
  onDownload: (shotId: string) => void;
  onDownloadAll: () => void;
  onReset: () => void;
}

/**
 * The end of the run: take the clips away.
 *
 * Each clip downloads individually because a browser cannot reliably start
 * eight downloads at once, and a partial bulk download that silently drops
 * files is worse than eight deliberate clicks.
 */
export function DeliverPanel({
  shots,
  project,
  clipUrls,
  onDownload,
  onDownloadAll,
  onReset,
}: DeliverPanelProps) {
  const ready = shots.filter((s) => project.clips[s.id] !== undefined);
  const totalSeconds = shots.reduce((sum, s) => sum + (s.endSeconds - s.startSeconds), 0);

  return (
    <div className="flex flex-col gap-6">
      <Card surface="forest" eyebrow="Finished">
        <h2 className="font-display mb-3 text-[26px] font-normal text-balance text-white">
          {ready.length} clip{ready.length === 1 ? '' : 's'} ready to stitch
        </h2>
        <p className="mb-4 max-w-[65ch] text-sm text-white">
          Every clip is silent. Cut them at the timecodes in the plan, export 9:16, then add your
          music in the app you post from.
        </p>
        <dl className="grid grid-cols-1 gap-3 text-sm text-white sm:grid-cols-3">
          <div>
            <dt className="font-medium">Final runtime</dt>
            <dd className="tabular-nums opacity-85">{totalSeconds.toFixed(1)}s</dd>
          </div>
          <div>
            <dt className="font-medium">Footage generated</dt>
            <dd className="tabular-nums opacity-85">
              {shots.reduce((s, x) => s + x.generateSeconds, 0)}s
            </dd>
          </div>
          <div>
            <dt className="font-medium">Spent on this run</dt>
            <dd className="tabular-nums opacity-85">{project.spendUsd.toFixed(2)} USD</dd>
          </div>
        </dl>
      </Card>

      <ul className="flex flex-col gap-3">
        {shots.map((shot) => {
          const clip = project.clips[shot.id];
          const url = clipUrls[shot.id];
          return (
            <li key={shot.id}>
              <Card surface="white">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {url === undefined ? null : (
                    <video
                      src={url}
                      controls
                      muted
                      playsInline
                      className="border-ink-1 rounded-input w-full max-w-[160px] border-2"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="font-display text-ink-1 mr-3 text-lg font-medium">
                        {shot.id}
                      </span>
                      <span className="text-ink-2 text-sm">{shot.beat}</span>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => onDownload(shot.id)}
                      disabled={clip === undefined}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3">
        <Button onClick={onDownloadAll} disabled={ready.length === 0} block>
          Download all {ready.length} clips
        </Button>
        <Button variant="secondary" onClick={onReset} block>
          Start a new run
        </Button>
      </div>
    </div>
  );
}
