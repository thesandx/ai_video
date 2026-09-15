'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { Asset } from '@/types/pipeline';

export interface AssetSlot {
  /** Asset key: a character id, or a shot id. */
  key: string;
  title: string;
  subtitle: string;
  prompt: string;
  asset?: Asset | undefined;
  /** Object URL for a preview, when the blob has been read. */
  previewUrl?: string | undefined;
}

export interface AssetGridProps {
  slots: readonly AssetSlot[];
  busyKey: string | null;
  errors: Record<string, string>;
  onGenerate: (key: string) => void;
  onUpload: (key: string, file: File) => void;
  onRemove: (key: string) => void;
  accept: string;
  /** Shown on the generate button, so the operator knows the price per press. */
  unitCostHint: string;
}

/**
 * One row per required asset, each with the same two ways to fill it.
 *
 * Generating and uploading are equal paths, not a primary and a fallback: a
 * missing still blocks the run whichever way it was meant to arrive, and an
 * operator who prefers their own image tool should not be second class. The
 * prompt is always visible so it can be copied and run elsewhere.
 */
export function AssetGrid({
  slots,
  busyKey,
  errors,
  onGenerate,
  onUpload,
  onRemove,
  accept,
  unitCostHint,
}: AssetGridProps) {
  return (
    <ul className="flex flex-col gap-4">
      {slots.map((slot) => (
        <li key={slot.key}>
          <AssetRow
            slot={slot}
            busy={busyKey === slot.key}
            error={errors[slot.key]}
            onGenerate={onGenerate}
            onUpload={onUpload}
            onRemove={onRemove}
            accept={accept}
            unitCostHint={unitCostHint}
          />
        </li>
      ))}
    </ul>
  );
}

interface AssetRowProps {
  slot: AssetSlot;
  busy: boolean;
  error: string | undefined;
  onGenerate: (key: string) => void;
  onUpload: (key: string, file: File) => void;
  onRemove: (key: string) => void;
  accept: string;
  unitCostHint: string;
}

function AssetRow({
  slot,
  busy,
  error,
  onGenerate,
  onUpload,
  onRemove,
  accept,
  unitCostHint,
}: AssetRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const have = slot.asset !== undefined;

  return (
    <Card surface={have ? 'white' : 'cream'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="border-ink-1 rounded-input flex h-[132px] w-full shrink-0 items-center justify-center overflow-hidden border-2 bg-neutral-50 sm:w-[100px]">
          {slot.previewUrl === undefined ? (
            <span className="text-ink-3 px-2 text-center text-sm">
              {busy ? 'Working' : 'Empty'}
            </span>
          ) : (
            // Object URLs from IndexedDB, so next/image cannot optimise them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.previewUrl}
              alt={`Preview of ${slot.title}`}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-ink-1 text-lg font-medium">{slot.title}</span>
            {have && slot.asset !== undefined ? (
              <Chip tone={slot.asset.origin === 'uploaded' ? 'yellow' : 'mint'}>
                {slot.asset.origin === 'uploaded' ? 'Uploaded' : 'Generated'}
              </Chip>
            ) : (
              <Chip tone="white">Needed</Chip>
            )}
          </div>

          <p className="text-ink-2 max-w-[65ch] text-sm">{slot.subtitle}</p>

          {have && slot.asset !== undefined ? (
            <p className="text-ink-3 text-sm tabular-nums">
              {slot.asset.width !== undefined && slot.asset.height !== undefined
                ? `${slot.asset.width} by ${slot.asset.height}, `
                : ''}
              {(slot.asset.sizeBytes / 1_000_000).toFixed(1)} MB
              {slot.asset.costUsd !== undefined ? `, ${slot.asset.costUsd.toFixed(3)} USD` : ''}
            </p>
          ) : null}

          {error === undefined ? null : (
            <p role="alert" className="text-coral max-w-[65ch] text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onGenerate(slot.key)} disabled={busy}>
              {busy
                ? 'Generating'
                : have
                  ? `Regenerate, ${unitCostHint}`
                  : `Generate, ${unitCostHint}`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Upload my own
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowPrompt((open) => !open)}
              aria-expanded={showPrompt}
            >
              {showPrompt ? 'Hide prompt' : 'Show prompt'}
            </Button>
            {have ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onRemove(slot.key)}
                disabled={busy}
              >
                Remove
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="sr-only"
              aria-label={`Upload a file for ${slot.title}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) onUpload(slot.key, file);
                event.target.value = '';
              }}
            />
          </div>

          {showPrompt ? (
            <div className="overflow-x-auto">
              <pre className="border-hairline text-ink-2 rounded-input max-w-full border bg-neutral-50 p-3 text-sm whitespace-pre-wrap">
                {slot.prompt}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
