'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import type { ChatTurn } from '@/types/pipeline';

export interface ChatPanelProps {
  turns: readonly ChatTurn[];
  busy: boolean;
  error: string | null;
  /** Set when the last reply proposed a change that can be applied. */
  pendingPatch: Record<string, unknown> | null;
  onSend: (message: string) => void;
  onApplyPatch: () => void;
  onDiscardPatch: () => void;
}

/**
 * Talking to the plan before any money is spent.
 *
 * This is the cheapest stage in the run and the one that saves the most: a shot
 * removed here costs nothing, the same shot removed after its clip exists costs
 * a dollar. A proposed change is never applied silently, it is shown and
 * applied on request.
 */
export function ChatPanel({
  turns,
  busy,
  error,
  pendingPatch,
  onSend,
  onApplyPatch,
  onDiscardPatch,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');

  function send() {
    const text = draft.trim();
    if (text === '' || busy) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 ? (
        <Card surface="cream">
          <p className="text-ink-2 max-w-[65ch] text-sm">
            Ask for anything you want changed: drop a shot, retime a beat, rewrite a character,
            change the setting. Nothing here costs more than a fraction of a cent, and every change
            made now is a change you do not pay to redo later.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {turns.map((turn, index) => (
            <li key={`${turn.at}-${index}`}>
              <Card surface={turn.role === 'user' ? 'white' : 'cream'}>
                <p className="text-ink-3 mb-2 text-xs font-medium tracking-[0.08em] uppercase">
                  {turn.role === 'user' ? 'You' : 'Director'}
                </p>
                <p className="text-ink-2 max-w-[65ch] text-sm whitespace-pre-wrap">
                  {turn.content}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pendingPatch === null ? null : (
        <Card surface="yellow">
          <h3 className="font-display text-ink-1 mb-2 text-lg font-medium">
            A change is ready to apply
          </h3>
          <p className="text-ink-2 mb-4 max-w-[65ch] text-sm">
            Applying this rewrites the plan and withdraws approval for every stage after it, so any
            sheets or frames you already made stay, but must be checked again.
          </p>
          <div className="mb-4 overflow-x-auto">
            <pre className="border-ink-1 text-ink-2 rounded-input max-w-full border-2 bg-white p-3 text-sm whitespace-pre-wrap">
              {JSON.stringify(pendingPatch, null, 2)}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onApplyPatch}>
              Apply to the plan
            </Button>
            <Button size="sm" variant="secondary" onClick={onDiscardPatch}>
              Leave it
            </Button>
          </div>
        </Card>
      )}

      {error === null ? null : (
        <Card surface="coral">
          <p className="max-w-[65ch] text-sm text-white">{error}</p>
        </Card>
      )}

      <TextInput
        label="Ask for a change"
        hint="For example: cut shot 6, it repeats shot 5. Or: make the puppy a tabby cat instead."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        disabled={busy}
      />
      <Button onClick={send} disabled={busy || draft.trim() === ''} block>
        {busy ? 'Thinking' : 'Send'}
      </Button>
    </div>
  );
}
