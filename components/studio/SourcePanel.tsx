'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { parseReelUrl } from '@/lib/reel-url';

export interface SourcePanelProps {
  busy: boolean;
  onAnalyse: (input: { url?: string; file?: File; angle: string }) => void;
}

/**
 * Getting the reel in, by link or by file.
 *
 * Both routes are offered together rather than one being a fallback, because
 * Instagram refuses logged-out downloads: without a session cookie the link
 * route cannot work at all, and an operator who hits that wall needs the upload
 * in front of them, not buried in an error.
 */
export function SourcePanel({ busy, onAnalyse }: SourcePanelProps) {
  const [url, setUrl] = useState('');
  const [angle, setAngle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function start() {
    setError(null);
    if (file !== null) {
      onAnalyse({ file, angle });
      return;
    }
    const parsed = parseReelUrl(url);
    if (parsed.kind === 'invalid') {
      setError(parsed.reason);
      return;
    }
    onAnalyse({ url: parsed.url, angle });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card surface="white">
        <div className="flex flex-col gap-5">
          <TextInput
            label="Reel link"
            hint="A public Instagram reel, or a direct link to an MP4."
            placeholder="https://www.instagram.com/reel/..."
            value={url}
            inputMode="url"
            autoComplete="off"
            disabled={busy || file !== null}
            onChange={(event) => setUrl(event.target.value)}
            {...(error === null ? {} : { error })}
          />

          <div className="flex flex-col gap-2">
            <span className="text-ink-1 text-sm font-medium">Or use a file you already have</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {file === null ? 'Choose an MP4' : 'Choose a different file'}
              </Button>
              {file === null ? null : (
                <span className="text-ink-2 text-sm">
                  {file.name}, {(file.size / 1_000_000).toFixed(1)} MB
                </span>
              )}
              {file === null ? null : (
                <Button variant="secondary" size="sm" onClick={() => setFile(null)} disabled={busy}>
                  Clear
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/*"
                className="sr-only"
                aria-label="Upload a reel MP4"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen !== undefined) {
                    setFile(chosen);
                    setError(null);
                  }
                  event.target.value = '';
                }}
              />
            </div>
          </div>

          <TextInput
            label="Steer the idea (optional)"
            hint="Say what your version should be about. Leave it empty to let the director choose."
            placeholder="Turn it into a 3D animated short about a street food stall"
            value={angle}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setAngle(event.target.value)}
          />

          <Button onClick={start} disabled={busy || (file === null && url.trim() === '')} block>
            {busy ? 'Reading the reel' : 'Read the reel'}
          </Button>
          <p aria-live="polite" className="text-ink-3 text-sm">
            {busy ? 'Downloading, then watching it. This takes a minute or two.' : ''}
          </p>
        </div>
      </Card>

      <Callout title="If the link route fails">
        Instagram does not serve reels to logged-out clients. Without an INSTAGRAM_SESSION_COOKIE
        the app cannot download one for you, and it will say so. Saving the reel yourself and
        uploading the file needs no credentials and always works.
      </Callout>
    </div>
  );
}
