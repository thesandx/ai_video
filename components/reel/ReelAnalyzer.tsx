'use client';

import { useRef, useState } from 'react';

import { AnalysisResult } from '@/components/reel/AnalysisResult';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { parseReelUrl } from '@/lib/reel-url';
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from '@/lib/video-models';
import type { ReelAnalysis } from '@/types/reel';

type Status = 'idle' | 'working' | 'done' | 'failed';

/**
 * The one interactive surface on the page, and the only `'use client'`
 * component in the app.
 *
 * It holds the form state, calls `/api/analyze`, and renders the result. The
 * result panels are ordinary presentational components, so the client bundle
 * carries markup rather than logic.
 */
export function ReelAnalyzer() {
  const [url, setUrl] = useState('');
  const [angle, setAngle] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_VIDEO_MODEL);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReelAnalysis | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  async function analyse() {
    const parsed = parseReelUrl(url);
    if (parsed.kind === 'invalid') {
      setError(parsed.reason);
      setStatus('failed');
      urlRef.current?.focus();
      return;
    }

    setStatus('working');
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: parsed.url, model, angle }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload !== null
            ? String((payload as { error?: unknown }).error ?? 'That did not work.')
            : 'That did not work.';
        setError(message);
        setStatus('failed');
        return;
      }

      setAnalysis(payload as ReelAnalysis);
      setStatus('done');
    } catch {
      setError('The request did not complete. Check your connection and try again.');
      setStatus('failed');
    }
  }

  const working = status === 'working';

  return (
    <div className="flex flex-col gap-6">
      <Card surface="white">
        <div className="flex flex-col gap-5">
          <TextInput
            ref={urlRef}
            label="Reel link"
            hint="Paste a direct link to an MP4 file."
            placeholder="https://example.com/reel.mp4"
            value={url}
            inputMode="url"
            autoComplete="off"
            onChange={(event) => setUrl(event.target.value)}
            {...(status === 'failed' && error !== null ? { error } : {})}
          />

          <TextInput
            label="Steer the idea (optional)"
            hint="Say what your version should be about. Leave it empty to let the director choose."
            placeholder="Make it about a morning coffee routine"
            value={angle}
            autoComplete="off"
            onChange={(event) => setAngle(event.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor="model" className="text-ink-1 text-sm font-medium">
              Model that watches the video
            </label>
            <select
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="text-ink-1 border-ink-1 rounded-input min-h-[52px] w-full border-2 bg-white px-4 text-base"
            >
              {VIDEO_MODELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}, {option.promptUsdPerMillion} USD per million tokens
                </option>
              ))}
            </select>
            <p className="text-ink-3 text-sm">
              {VIDEO_MODELS.find((option) => option.id === model)?.note ?? ''}
            </p>
          </div>

          <Button onClick={() => void analyse()} disabled={working} block>
            {working ? 'Reading the reel' : 'Analyse the reel'}
          </Button>
        </div>
      </Card>

      <p aria-live="polite" className="text-ink-3 text-sm">
        {working
          ? 'Downloading the video, then watching it. This takes a minute or two.'
          : status === 'done'
            ? 'Analysis complete. Your script is below.'
            : ''}
      </p>

      {status === 'failed' && error !== null ? (
        <Card surface="coral">
          <h2 className="font-display mb-2 text-lg font-medium text-white">That did not work</h2>
          <p className="max-w-[65ch] text-sm text-white">{error}</p>
        </Card>
      ) : null}

      {analysis === null ? (
        <Callout title="What you get back">
          A shot by shot reading of the source, the structural formula behind it, and an original
          shooting script that applies the same craft to your own idea. The script is new writing.
          It does not reuse the words, captions or music from the source.
        </Callout>
      ) : (
        <AnalysisResult analysis={analysis} />
      )}
    </div>
  );
}
