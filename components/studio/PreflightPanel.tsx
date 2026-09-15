'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { PreflightReport } from '@/types/pipeline';

export interface PreflightPanelProps {
  report: PreflightReport;
  onProceed: () => void;
  onBack: (stage: 'plan' | 'sheets' | 'stills') => void;
}

/**
 * The gate before any money is spent on video.
 *
 * Errors are shown first and block the button. Warnings are shown, explained,
 * and do not block, because some of them are deliberate choices. Every finding
 * carries its fix, because this panel is read by whoever has to act on it.
 */
export function PreflightPanel({ report, onProceed, onBack }: PreflightPanelProps) {
  const errors = report.issues.filter((i) => i.level === 'error');
  const warnings = report.issues.filter((i) => i.level === 'warning');
  const { counts } = report;

  const tally: ReadonlyArray<{ label: string; have: number; need: number }> = [
    { label: 'First frames', have: counts.stills, need: counts.shots },
    { label: 'Character sheets', have: counts.sheets, need: counts.characters },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card surface={report.ok ? 'mint' : 'coral'} eyebrow="Preflight">
        <h2
          className={`font-display mb-3 text-[26px] font-normal text-balance ${
            report.ok ? 'text-ink-1' : 'text-white'
          }`}
        >
          {report.ok
            ? 'Everything the video stage needs is here'
            : `${errors.length} thing${errors.length === 1 ? '' : 's'} must be fixed first`}
        </h2>
        <p className={`max-w-[65ch] text-sm ${report.ok ? 'text-ink-2' : 'text-white'}`}>
          {report.ok
            ? `Generating the missing clips will cost about ${report.estimatedVideoUsd.toFixed(2)} USD. This is the only stage that spends real money.`
            : 'Video is the expensive stage. These checks run first so nothing is paid for twice.'}
        </p>
      </Card>

      <Card surface="white">
        <h3 className="font-display text-ink-1 mb-4 text-lg font-medium">What is on hand</h3>
        <ul className="flex flex-col gap-3">
          {tally.map((row) => {
            const complete = row.have >= row.need && row.need > 0;
            return (
              <li
                key={row.label}
                className="border-hairline flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <span className="text-ink-2 text-sm">{row.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-display text-ink-1 text-sm tabular-nums">
                    {row.have} of {row.need}
                  </span>
                  <Chip tone={complete ? 'mint' : 'yellow'}>
                    {complete ? 'Complete' : `${Math.max(row.need - row.have, 0)} missing`}
                  </Chip>
                </span>
              </li>
            );
          })}
          <li className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-ink-2 text-sm">Clips already generated</span>
            <span className="font-display text-ink-1 text-sm tabular-nums">
              {counts.clips} of {counts.shots}
            </span>
          </li>
        </ul>
      </Card>

      {errors.length > 0 ? (
        <Card surface="white">
          <h3 className="font-display text-coral mb-1 text-lg font-medium">
            Blocking, {errors.length} to fix
          </h3>
          <p className="text-ink-3 mb-4 text-sm">
            Video cannot start until each of these is cleared.
          </p>
          <ul className="flex flex-col gap-4">
            {errors.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.subject ?? index}`}
                className="border-coral rounded-input border-l-2 pl-4"
              >
                <p className="text-ink-1 text-sm font-medium">
                  {issue.subject === undefined ? null : (
                    <span className="font-display mr-2 tabular-nums">{issue.subject}</span>
                  )}
                  {issue.message}
                </p>
                <p className="text-ink-2 mt-1 max-w-[65ch] text-sm">{issue.fix}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="sm" variant="secondary" onClick={() => onBack('stills')}>
              Fix the first frames
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onBack('sheets')}>
              Fix the sheets
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onBack('plan')}>
              Edit the plan
            </Button>
          </div>
        </Card>
      ) : null}

      {warnings.length > 0 ? (
        <Card surface="cream">
          <h3 className="font-display text-ink-1 mb-1 text-lg font-medium">
            Worth a look, {warnings.length}
          </h3>
          <p className="text-ink-3 mb-4 text-sm">
            These do not block. Some of them are deliberate choices.
          </p>
          <ul className="flex flex-col gap-4">
            {warnings.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.subject ?? index}`}
                className="border-mustard rounded-input border-l-2 pl-4"
              >
                <p className="text-ink-1 text-sm font-medium">
                  {issue.subject === undefined ? null : (
                    <span className="font-display mr-2 tabular-nums">{issue.subject}</span>
                  )}
                  {issue.message}
                </p>
                <p className="text-ink-2 mt-1 max-w-[65ch] text-sm">{issue.fix}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button onClick={onProceed} disabled={!report.ok} block>
          {report.ok
            ? `Generate ${counts.shots - counts.clips} clip${counts.shots - counts.clips === 1 ? '' : 's'}, about ${report.estimatedVideoUsd.toFixed(2)} USD`
            : 'Blocked until the errors above are fixed'}
        </Button>
        <p aria-live="polite" className="text-ink-3 text-sm">
          {report.ok
            ? 'All checks passed.'
            : `${errors.length} blocking issue${errors.length === 1 ? '' : 's'} remain.`}
        </p>
      </div>
    </div>
  );
}
