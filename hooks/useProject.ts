'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { createProject } from '@/lib/pipeline';
import { DEFAULT_VIDEO_GEN_MODEL } from '@/lib/video-gen-models';
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models';
import { runStore } from '@/services/run-transport';
import type { Project } from '@/types/pipeline';

/**
 * The run, read through whichever store the transport selected.
 *
 * This hook knows nothing about localStorage or Postgres. It holds the loaded
 * run in a module-level cache and re-reads it through `useSyncExternalStore`,
 * which is the supported way to read something living outside React.
 * `getServerSnapshot` covers the server render, and loading happens on
 * subscribe, after mount, rather than in an effect that calls `setState` and
 * cascades renders.
 *
 * Writes are optimistic: the cache updates and the UI re-renders at once, then
 * the store is told. A failed write surfaces as `storageError` rather than
 * rolling the screen back under the operator.
 */

export const DEFAULT_MODELS: Project['models'] = {
  analysis: DEFAULT_VIDEO_MODEL,
  chat: 'deepseek/deepseek-v4-flash',
  image: 'google/gemini-2.5-flash-image',
  video: DEFAULT_VIDEO_GEN_MODEL,
};

let cache: Project | null = null;
let loading = false;
let storageError: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setError(error: unknown): void {
  storageError =
    error instanceof Error
      ? error.message
      : 'This run could not be saved, so recent changes may be lost.';
  emit();
}

function getSnapshot(): Project | null {
  return cache;
}

/** The server has no store, so it renders the loading state. */
function getServerSnapshot(): Project | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Load once, after mount. A store call during render would be a side effect
  // in the wrong place, and on the neon transport it is a network request.
  if (cache === null && !loading) {
    loading = true;
    void (async () => {
      const store = runStore();
      try {
        const existing = await store.load();
        if (existing !== null) {
          cache = existing;
        } else {
          const fresh = createProject(DEFAULT_MODELS);
          await store.save(fresh);
          cache = fresh;
        }
        storageError = null;
      } catch (error) {
        // Without a run there is nothing to show, so fall back to an
        // in-memory one and say that it will not persist.
        cache = createProject(DEFAULT_MODELS);
        setError(error);
      } finally {
        loading = false;
        emit();
      }
    })();
  }

  return () => {
    listeners.delete(listener);
  };
}

export interface UseProject {
  project: Project | null;
  /** True once the run has been read from the store. */
  ready: boolean;
  /** Set when the run could not be persisted, so the operator is told. */
  storageError: string | null;
  /** Which store is in use, for the notice shown while runs are browser-only. */
  transport: 'local' | 'neon';
  update: (change: (current: Project) => Project) => void;
  reset: () => void;
}

export function useProject(): UseProject {
  const project = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((change: (current: Project) => Project) => {
    if (cache === null) return;
    const next = { ...change(cache), updatedAt: new Date().toISOString() };
    cache = next;
    emit();
    void runStore()
      .save(next)
      .then(() => {
        if (storageError !== null) {
          storageError = null;
          emit();
        }
      })
      .catch(setError);
  }, []);

  const reset = useCallback(() => {
    const fresh = createProject(DEFAULT_MODELS);
    cache = fresh;
    emit();
    void runStore().reset(fresh).catch(setError);
  }, []);

  return {
    project,
    ready: project !== null,
    storageError,
    transport: runStore().kind,
    update,
    reset,
  };
}
