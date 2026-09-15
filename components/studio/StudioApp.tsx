'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AssetGrid, type AssetSlot } from '@/components/studio/AssetGrid';
import { ChatPanel } from '@/components/studio/ChatPanel';
import { DeliverPanel } from '@/components/studio/DeliverPanel';
import { PreflightPanel } from '@/components/studio/PreflightPanel';
import { ShotTable } from '@/components/studio/ShotTable';
import { SourcePanel } from '@/components/studio/SourcePanel';
import { StageRail } from '@/components/studio/StageRail';
import { VideoPanel } from '@/components/studio/VideoPanel';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useProject } from '@/hooks/useProject';
import {
  dataUrlToBlob,
  deleteAsset,
  getAsset,
  getAssetDataUrl,
  imageSize,
  putAsset,
} from '@/lib/asset-store';
import { approve, revokeFrom, STAGE_BLURBS, STAGE_LABELS } from '@/lib/pipeline';
import { preflight } from '@/lib/preflight';
import { chooseDuration, findVideoGenModel } from '@/lib/video-gen-models';
import type { Asset, ChatTurn, ProductionPlan, StageId } from '@/types/pipeline';
import type { ReelAnalysis } from '@/types/reel';

const IMAGE_COST_HINT = 'about 0.04 USD';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? String((payload as { error?: unknown }).error ?? 'That request failed.')
        : 'That request failed.';
    throw new Error(message);
  }
  return payload as T;
}

/**
 * The whole run, in one client component.
 *
 * State lives here because every stage reads the same project, and the project
 * has to persist across stages. The panels below are presentational: they take
 * props and raise events, so the rules stay in one place and the components
 * stay testable.
 */
export function StudioApp() {
  const { project, ready, storageError, update, reset } = useProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);

  const plan = project?.plan;
  const report = useMemo(() => (project === null ? null : preflight(project)), [project]);

  /** Object URLs for everything stored, rebuilt when the asset set changes. */
  const assetKeys = useMemo(() => {
    if (project === null) return '';
    return [
      ...Object.values(project.sheets).map((a) => a.blobKey),
      ...Object.values(project.stills).map((a) => a.blobKey),
      ...Object.values(project.clips).map((a) => a.blobKey),
    ].join('|');
  }, [project]);

  useEffect(() => {
    if (project === null) return;
    let cancelled = false;
    const created: string[] = [];

    async function load() {
      const next: Record<string, string> = {};
      const all: Asset[] = [
        ...Object.values(project?.sheets ?? {}),
        ...Object.values(project?.stills ?? {}),
        ...Object.values(project?.clips ?? {}),
      ];
      for (const asset of all) {
        const blob = await getAsset(asset.blobKey);
        if (blob === null) continue;
        const url = URL.createObjectURL(blob);
        created.push(url);
        next[asset.blobKey] = url;
      }
      if (!cancelled) setPreviews(next);
    }
    void load();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [assetKeys, project]);

  const fail = useCallback((key: string, message: string) => {
    setErrors((current) => ({ ...current, [key]: message }));
  }, []);

  const clearError = useCallback((key: string) => {
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  /** Stores a generated or uploaded file and records it on the project. */
  const storeAsset = useCallback(
    async (
      bucket: 'sheets' | 'stills' | 'clips',
      key: string,
      blob: Blob,
      origin: Asset['origin'],
      costUsd?: number,
    ) => {
      const blobKey = `${bucket}:${key}:${Date.now()}`;
      await putAsset(blobKey, blob);
      const size = blob.type.startsWith('image/') ? await imageSize(blob) : null;
      const asset: Asset = {
        key,
        origin,
        mimeType: blob.type,
        sizeBytes: blob.size,
        blobKey,
        createdAt: new Date().toISOString(),
        ...(size === null ? {} : { width: size.width, height: size.height }),
        ...(costUsd === undefined ? {} : { costUsd }),
      };
      update((current) => ({
        ...current,
        [bucket]: { ...current[bucket], [key]: asset },
        spendUsd: current.spendUsd + (costUsd ?? 0),
      }));
    },
    [update],
  );

  // ---- stage: source -------------------------------------------------------

  const analyse = useCallback(
    async (input: { url?: string; file?: File; angle: string }) => {
      if (project === null) return;
      setBusy('analyse');
      setGlobalError(null);
      try {
        let analysis: ReelAnalysis;
        if (input.file !== undefined) {
          const form = new FormData();
          form.append('file', input.file);
          form.append('model', project.models.analysis);
          form.append('angle', input.angle);
          const response = await fetch('/api/analyze', { method: 'POST', body: form });
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              String((payload as { error?: unknown })?.error ?? 'That upload could not be read.'),
            );
          }
          analysis = payload as ReelAnalysis;
        } else {
          analysis = await postJson<ReelAnalysis>('/api/analyze', {
            url: input.url,
            model: project.models.analysis,
            angle: input.angle,
          });
        }
        update((current) =>
          approve(
            {
              ...current,
              source: analysis.source,
              reading: analysis.reading,
              brief: analysis.brief,
              script: analysis.script,
              spendUsd: current.spendUsd + analysis.usage.costUsd,
            },
            'source',
          ),
        );
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : 'The analysis failed.');
      } finally {
        setBusy(null);
      }
    },
    [project, update],
  );

  // ---- stage: plan ---------------------------------------------------------

  const makePlan = useCallback(async () => {
    if (
      project?.reading === undefined ||
      project.brief === undefined ||
      project.script === undefined
    ) {
      return;
    }
    setBusy('plan');
    setGlobalError(null);
    try {
      const result = await postJson<{ plan: ProductionPlan; costUsd: number }>('/api/plan', {
        model: project.models.chat,
        reading: project.reading,
        brief: project.brief,
        script: project.script,
      });
      update((current) => ({
        ...current,
        plan: result.plan,
        spendUsd: current.spendUsd + result.costUsd,
      }));
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'The plan could not be built.');
    } finally {
      setBusy(null);
    }
  }, [project, update]);

  // ---- stage: refine -------------------------------------------------------

  const sendChat = useCallback(
    async (message: string) => {
      if (project === null || plan === undefined) return;
      setBusy('chat');
      setGlobalError(null);
      const turn: ChatTurn = { role: 'user', content: message, at: new Date().toISOString() };
      update((current) => ({ ...current, chat: [...current.chat, turn] }));
      try {
        const reply = await postJson<{
          message: string;
          patch?: Record<string, unknown>;
          costUsd: number;
        }>('/api/chat', {
          model: project.models.chat,
          plan,
          history: project.chat,
          message,
        });
        update((current) => ({
          ...current,
          chat: [
            ...current.chat,
            { role: 'assistant', content: reply.message, at: new Date().toISOString() },
          ],
          spendUsd: current.spendUsd + reply.costUsd,
        }));
        setPendingPatch(reply.patch ?? null);
      } catch (error) {
        setGlobalError(error instanceof Error ? error.message : 'The chat failed.');
      } finally {
        setBusy(null);
      }
    },
    [project, plan, update],
  );

  const applyPatch = useCallback(() => {
    if (pendingPatch === null) return;
    update((current) => {
      if (current.plan === undefined) return current;
      const merged = { ...current.plan, ...pendingPatch } as ProductionPlan;
      // Editing the plan invalidates everything downstream, otherwise the run
      // could reach video with frames that no longer match the shot list.
      return revokeFrom({ ...current, plan: merged }, 'plan');
    });
    setPendingPatch(null);
  }, [pendingPatch, update]);

  // ---- stages: sheets and stills -------------------------------------------

  const generateImage = useCallback(
    async (bucket: 'sheets' | 'stills', key: string) => {
      if (project === null || plan === undefined) return;
      setBusy(key);
      clearError(key);
      try {
        let prompt: string;
        const references: string[] = [];

        if (bucket === 'sheets') {
          const character = plan.characters.find((c) => c.id === key);
          if (character === undefined) throw new Error('That character is no longer in the plan.');
          prompt = character.sheetPrompt;
        } else {
          const shot = plan.shots.find((s) => s.id === key);
          if (shot === undefined) throw new Error('That shot is no longer in the plan.');
          prompt = shot.stillPrompt;
          // Character sheets carry identity; the previous still carries both
          // identity and composition, which is why it is attached last.
          for (const character of plan.characters) {
            const sheet = project.sheets[character.id];
            if (sheet === undefined) continue;
            const url = await getAssetDataUrl(sheet.blobKey);
            if (url !== null) references.push(url);
          }
          if (shot.continuityFrom !== null) {
            const previous = project.stills[shot.continuityFrom];
            if (previous !== undefined) {
              const url = await getAssetDataUrl(previous.blobKey);
              if (url !== null) references.push(url);
            }
          }
        }

        const image = await postJson<{ dataUrl: string; costUsd: number }>('/api/image', {
          model: project.models.image,
          prompt,
          references,
          ...(bucket === 'stills' ? { aspectRatio: plan.aspectRatio } : {}),
        });
        await storeAsset(bucket, key, dataUrlToBlob(image.dataUrl), 'generated', image.costUsd);
      } catch (error) {
        fail(key, error instanceof Error ? error.message : 'Generation failed.');
      } finally {
        setBusy(null);
      }
    },
    [project, plan, storeAsset, fail, clearError],
  );

  const uploadAsset = useCallback(
    async (bucket: 'sheets' | 'stills', key: string, file: File) => {
      clearError(key);
      try {
        await storeAsset(bucket, key, file, 'uploaded');
      } catch (error) {
        fail(key, error instanceof Error ? error.message : 'That file could not be stored.');
      }
    },
    [storeAsset, fail, clearError],
  );

  const removeAsset = useCallback(
    async (bucket: 'sheets' | 'stills', key: string) => {
      const asset = project?.[bucket][key];
      if (asset !== undefined) await deleteAsset(asset.blobKey).catch(() => undefined);
      update((current) => {
        const next = { ...current[bucket] };
        delete next[key];
        return { ...current, [bucket]: next };
      });
    },
    [project, update],
  );

  // ---- stage: video --------------------------------------------------------

  const runVideo = useCallback(async () => {
    if (project === null || plan === undefined) return;
    const model = findVideoGenModel(project.models.video);
    if (model === undefined) return;

    setRunning(true);
    setGlobalError(null);

    const pending = plan.shots.filter((s) => project.clips[s.id] === undefined);

    // Start every job first: the provider runs them in parallel, so submitting
    // together turns half an hour of sequential waiting into a few minutes.
    const started: Array<{ shotId: string; jobId: string }> = [];
    for (const shot of pending) {
      try {
        const still = project.stills[shot.id];
        if (still === undefined) throw new Error('No first frame.');
        const firstFrame = await getAssetDataUrl(still.blobKey);
        if (firstFrame === null) throw new Error('The first frame could not be read back.');

        const job = await postJson<{ id: string }>('/api/video', {
          model: project.models.video,
          prompt: shot.videoPrompt,
          aspectRatio: plan.aspectRatio,
          durationSeconds: chooseDuration(model, shot.generateSeconds) ?? shot.generateSeconds,
          firstFrame,
        });
        started.push({ shotId: shot.id, jobId: job.id });
        update((current) => ({
          ...current,
          jobs: {
            ...current.jobs,
            [shot.id]: { shotId: shot.id, jobId: job.id, status: 'pending' },
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not start.';
        update((current) => ({
          ...current,
          jobs: {
            ...current.jobs,
            [shot.id]: { shotId: shot.id, jobId: '', status: 'failed', error: message },
          },
        }));
      }
    }

    // Then poll them all until each settles.
    const outstanding = new Map(started.map((s) => [s.shotId, s.jobId]));
    const deadline = Date.now() + 20 * 60 * 1000;
    while (outstanding.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15000));
      for (const [shotId, jobId] of [...outstanding]) {
        try {
          const state = await fetch(`/api/video/${jobId}`).then(
            (r) => r.json() as Promise<{ status: string; costUsd?: number }>,
          );
          if (state.status === 'completed') {
            const blob = await fetch(`/api/video/${jobId}/content`).then((r) => r.blob());
            await storeAsset('clips', shotId, blob, 'generated', state.costUsd);
            update((current) => ({
              ...current,
              jobs: {
                ...current.jobs,
                [shotId]: {
                  shotId,
                  jobId,
                  status: 'completed',
                  ...(state.costUsd === undefined ? {} : { costUsd: state.costUsd }),
                },
              },
            }));
            outstanding.delete(shotId);
          } else if (state.status === 'failed') {
            update((current) => ({
              ...current,
              jobs: {
                ...current.jobs,
                [shotId]: {
                  shotId,
                  jobId,
                  status: 'failed',
                  error: 'The provider failed this clip.',
                },
              },
            }));
            outstanding.delete(shotId);
          }
        } catch {
          // A transient poll failure is not a job failure. Keep waiting.
        }
      }
    }

    setRunning(false);
  }, [project, plan, storeAsset, update]);

  const downloadClip = useCallback(
    (shotId: string) => {
      const clip = project?.clips[shotId];
      const url = clip === undefined ? undefined : previews[clip.blobKey];
      if (url === undefined) return;
      const link = document.createElement('a');
      link.href = url;
      link.download = `${shotId}.mp4`;
      link.click();
    },
    [project, previews],
  );

  if (!ready || project === null || report === null) {
    return (
      <p className="text-ink-3 text-sm" aria-live="polite">
        Loading your run.
      </p>
    );
  }

  const stage = project.stage;

  return (
    <div className="flex flex-col gap-8">
      <StageRail project={project} onGo={(s) => update((c) => ({ ...c, stage: s }))} />

      {storageError === null ? null : (
        <Card surface="coral">
          <p className="max-w-[65ch] text-sm text-white">{storageError}</p>
        </Card>
      )}

      <div>
        <h2 className="font-display text-ink-1 mb-2 text-[clamp(1.75rem,5vw,2.5rem)] font-medium text-balance">
          {STAGE_LABELS[stage]}
        </h2>
        <p className="text-ink-2 max-w-[65ch] text-sm">{STAGE_BLURBS[stage]}</p>
      </div>

      {globalError === null ? null : (
        <Card surface="coral">
          <h3 className="font-display mb-2 text-lg font-medium text-white">That did not work</h3>
          <p className="max-w-[65ch] text-sm text-white">{globalError}</p>
        </Card>
      )}

      {stage === 'source' ? <SourcePanel busy={busy === 'analyse'} onAnalyse={analyse} /> : null}

      {stage === 'analysis' && project.reading !== undefined ? (
        <div className="flex flex-col gap-6">
          <Card surface="mint" eyebrow="What was read">
            <h3 className="font-display text-ink-1 mb-3 text-[26px] font-normal text-balance">
              {project.reading.hook.device}
            </h3>
            <p className="text-ink-2 mb-4 max-w-[65ch] text-sm">
              {project.reading.hook.whyItWorks}
            </p>
            <p className="text-ink-2 max-w-[65ch] text-sm">
              <strong>The formula:</strong> {project.reading.structuralFormula}
            </p>
          </Card>
          <Button onClick={() => update((c) => approve(c, 'analysis'))} block>
            Looks right, go to refine
          </Button>
        </div>
      ) : null}

      {stage === 'refine' ? (
        <div className="flex flex-col gap-6">
          {plan === undefined ? (
            <Card surface="cream">
              <p className="text-ink-2 mb-4 max-w-[65ch] text-sm">
                Build the production plan first. It turns the script into character bibles and
                per-shot prompts, and costs a fraction of a cent.
              </p>
              <Button onClick={() => void makePlan()} disabled={busy === 'plan'}>
                {busy === 'plan' ? 'Building' : 'Build the plan'}
              </Button>
            </Card>
          ) : (
            <ChatPanel
              turns={project.chat}
              busy={busy === 'chat'}
              error={null}
              pendingPatch={pendingPatch}
              onSend={(m) => void sendChat(m)}
              onApplyPatch={applyPatch}
              onDiscardPatch={() => setPendingPatch(null)}
            />
          )}
          {plan === undefined ? null : (
            <Button onClick={() => update((c) => approve(c, 'refine'))} block>
              Done refining, lock the plan
            </Button>
          )}
        </div>
      ) : null}

      {stage === 'plan' && plan !== undefined ? (
        <div className="flex flex-col gap-6">
          <ShotTable
            plan={plan}
            onRemoveShot={(id) =>
              update((c) =>
                c.plan === undefined
                  ? c
                  : revokeFrom(
                      { ...c, plan: { ...c.plan, shots: c.plan.shots.filter((s) => s.id !== id) } },
                      'plan',
                    ),
              )
            }
          />
          <Callout title="What this fixes">
            Approving here fixes what must exist later: one character sheet per character, and one
            first frame per shot. Preflight will refuse to start video until every one of them is
            present.
          </Callout>
          <Button onClick={() => update((c) => approve(c, 'plan'))} block>
            Lock {plan.shots.length} shots and {plan.characters.length} characters
          </Button>
        </div>
      ) : null}

      {stage === 'sheets' && plan !== undefined ? (
        <div className="flex flex-col gap-6">
          <AssetGrid
            accept="image/*"
            unitCostHint={IMAGE_COST_HINT}
            busyKey={busy}
            errors={errors}
            slots={plan.characters.map<AssetSlot>((character) => ({
              key: character.id,
              title: character.name,
              subtitle: character.bible.slice(0, 160) + (character.bible.length > 160 ? '...' : ''),
              prompt: character.sheetPrompt,
              asset: project.sheets[character.id],
              previewUrl: previews[project.sheets[character.id]?.blobKey ?? ''],
            }))}
            onGenerate={(key) => void generateImage('sheets', key)}
            onUpload={(key, file) => void uploadAsset('sheets', key, file)}
            onRemove={(key) => void removeAsset('sheets', key)}
          />
          <Callout title="What to reject on">
            If the large portrait face does not match the hero pose face, regenerate. That one flaw
            propagates into every shot. A missing expression in the strip does not matter.
          </Callout>
          <Button onClick={() => update((c) => approve(c, 'sheets'))} block>
            Sheets are good, go to first frames
          </Button>
        </div>
      ) : null}

      {stage === 'stills' && plan !== undefined ? (
        <div className="flex flex-col gap-6">
          <AssetGrid
            accept="image/*"
            unitCostHint={IMAGE_COST_HINT}
            busyKey={busy}
            errors={errors}
            slots={plan.shots.map<AssetSlot>((shot) => ({
              key: shot.id,
              title: `${shot.id}, ${shot.cameraSetup}`,
              subtitle: shot.beat,
              prompt: shot.stillPrompt,
              asset: project.stills[shot.id],
              previewUrl: previews[project.stills[shot.id]?.blobKey ?? ''],
            }))}
            onGenerate={(key) => void generateImage('stills', key)}
            onUpload={(key, file) => void uploadAsset('stills', key, file)}
            onRemove={(key) => void removeAsset('stills', key)}
          />
          <Callout title="Generate these in order">
            Each frame attaches the character sheets and the previous frame, which is what holds the
            characters steady. Generating out of order still works, but the chain is weaker.
          </Callout>
          <Button onClick={() => update((c) => approve(c, 'stills'))} block>
            Frames are good, run preflight
          </Button>
        </div>
      ) : null}

      {stage === 'preflight' ? (
        <PreflightPanel
          report={report}
          onProceed={() => update((c) => approve(c, 'preflight'))}
          onBack={(target: StageId) => update((c) => ({ ...c, stage: target }))}
        />
      ) : null}

      {stage === 'video' && plan !== undefined ? (
        <VideoPanel
          shots={plan.shots}
          project={project}
          running={running}
          onStart={() => void runVideo()}
          onDone={() => update((c) => approve(c, 'video'))}
        />
      ) : null}

      {stage === 'deliver' && plan !== undefined ? (
        <DeliverPanel
          shots={plan.shots}
          project={project}
          clipUrls={Object.fromEntries(
            plan.shots
              .map((s) => [s.id, previews[project.clips[s.id]?.blobKey ?? '']])
              .filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
          )}
          onDownload={downloadClip}
          onDownloadAll={() => plan.shots.forEach((s) => downloadClip(s.id))}
          onReset={reset}
        />
      ) : null}
    </div>
  );
}
