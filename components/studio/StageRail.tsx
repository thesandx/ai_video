'use client';

import { canEnter, STAGE_LABELS, stageIndex, STAGES } from '@/lib/pipeline';
import { cn } from '@/lib/utils';
import type { Project, StageId } from '@/types/pipeline';

export interface StageRailProps {
  project: Project;
  onGo: (stage: StageId) => void;
}

/**
 * The run's spine.
 *
 * Numbered because the stages are a real sequence: each one depends on the one
 * before, and a stage cannot be opened until its predecessor is approved. A
 * locked step is a real button that is disabled, so keyboard users meet the
 * same wall as everyone else and hear why.
 */
export function StageRail({ project, onGo }: StageRailProps) {
  const current = stageIndex(project.stage);

  return (
    <nav aria-label="Pipeline stages" className="overflow-x-auto">
      <ol className="flex min-w-max gap-2 pb-1">
        {STAGES.map((stage, index) => {
          const approved = project.approved.includes(stage);
          const active = stage === project.stage;
          const open = canEnter(project, stage);
          return (
            <li key={stage}>
              <button
                type="button"
                onClick={() => onGo(stage)}
                disabled={!open}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'border-ink-1 rounded-pill flex min-h-[44px] cursor-pointer items-center gap-2 border-2 px-4 text-sm font-medium transition-colors',
                  active && 'bg-ink-1 text-white',
                  !active && approved && 'bg-mint text-ink-1',
                  !active && !approved && open && 'text-ink-2 bg-white',
                  !open && 'cursor-not-allowed border-neutral-500 bg-neutral-50 text-neutral-500',
                )}
              >
                <span className="font-display tabular-nums">{index + 1}</span>
                <span>{STAGE_LABELS[stage]}</span>
                <span className="sr-only">
                  {approved
                    ? ', approved'
                    : !open
                      ? ', locked until earlier stages are approved'
                      : ''}
                </span>
                {approved && !active ? <span aria-hidden="true">&#10003;</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Stage {current + 1} of {STAGES.length}, {STAGE_LABELS[project.stage]}
      </p>
    </nav>
  );
}
