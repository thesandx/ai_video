'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { Project, ShotSpec } from '@/types/pipeline';

export interface VideoPanelProps {
  shots: readonly ShotSpec[];
  project: Project;
  running: boolean;
  onStart: () => void;
  onDone: () => void;
}

/**
 * Video generation, one row per shot.
 *
 * Jobs are started together and then polled, because the provider generates
 * them in parallel: eight sequential jobs take half an hour, eight parallel
 * ones take a few minutes. State is per shot so a single failure is visible and
 * retryable without re-running the ones that worked.
 */
export function VideoPanel({ shots, project, running, onStart, onDone }: VideoPanelProps) {
  const done = shots.filter((s) => project.clips[s.id] !== undefined).length;
  const failed = Object.values(project.jobs).filter((j) => j.status === 'failed');
  const allDone = done === shots.length && shots.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card surface={allDone ? 'mint' : 'white'}>
        <h2 className="font-display text-ink-1 mb-2 text-[26px] font-normal text-balance">
          {allDone ? 'Every clip is in' : `${done} of ${shots.length} clips generated`}
        </h2>
        <p className="text-ink-2 max-w-[65ch] text-sm">
          {running
            ? 'Jobs are running in parallel. This takes a few minutes and the page can stay open.'
            : allDone
              ? 'Move on to download them.'
              : 'Each clip is generated from its own first frame, silent, with no dialogue.'}
        </p>
        {project.spendUsd > 0 ? (
          <p className="text-ink-3 mt-3 text-sm tabular-nums">
            Spent on this run so far: {project.spendUsd.toFixed(2)} USD
          </p>
        ) : null}
      </Card>

      <ul className="flex flex-col gap-3">
        {shots.map((shot) => {
          const clip = project.clips[shot.id];
          const job = project.jobs[shot.id];
          const state =
            clip !== undefined
              ? 'done'
              : job?.status === 'failed'
                ? 'failed'
                : job !== undefined
                  ? 'running'
                  : 'waiting';
          return (
            <li key={shot.id}>
              <Card surface="white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="font-display text-ink-1 text-lg font-medium">{shot.id}</span>
                    <span className="text-ink-2 text-sm">{shot.cameraSetup}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {clip?.costUsd !== undefined ? (
                      <span className="text-ink-3 text-sm tabular-nums">
                        {clip.costUsd.toFixed(3)} USD
                      </span>
                    ) : null}
                    <Chip
                      tone={
                        state === 'done'
                          ? 'mint'
                          : state === 'failed'
                            ? 'yellow'
                            : state === 'running'
                              ? 'peach'
                              : 'white'
                      }
                    >
                      {state === 'done'
                        ? 'Ready'
                        : state === 'failed'
                          ? 'Failed'
                          : state === 'running'
                            ? 'Generating'
                            : 'Waiting'}
                    </Chip>
                  </span>
                </div>
                {job?.error === undefined ? null : (
                  <p role="alert" className="text-coral mt-2 max-w-[65ch] text-sm">
                    {job.error}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3">
        {allDone ? (
          <Button onClick={onDone} block>
            Go to download
          </Button>
        ) : (
          <Button onClick={onStart} disabled={running} block>
            {running
              ? 'Generating'
              : failed.length > 0
                ? `Retry ${failed.length} failed clip${failed.length === 1 ? '' : 's'}`
                : `Generate ${shots.length - done} clip${shots.length - done === 1 ? '' : 's'}`}
          </Button>
        )}
        <p aria-live="polite" className="text-ink-3 text-sm">
          {running ? `${done} of ${shots.length} finished.` : allDone ? 'All clips are ready.' : ''}
        </p>
      </div>
    </div>
  );
}
