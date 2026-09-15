'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { createProject } from '@/lib/pipeline';
import { DEFAULT_VIDEO_GEN_MODEL } from '@/lib/video-gen-models';
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models';
import type { Project } from '@/types/pipeline';

/**
 * The run, persisted in the browser.
 *
 * Only the plan is stored here. Binary assets live in IndexedDB via
 * `lib/asset-store.ts`, because a few megabytes of video would blow the
 * localStorage quota immediately.
 *
 * This is written as an external store rather than `useState` plus an effect.
 * localStorage cannot be read while rendering on the server, so the naive
 * version reads it in an effect and calls `setState`, which cascades renders
 * and is what `react-hooks/set-state-in-effect` warns about.
 * `useSyncExternalStore` is the supported way to read something that lives
 * outside React: `getServerSnapshot` covers the server render, and the store
 * seeds itself on subscribe, which happens after mount rather than during it.
 */

const KEY = 'reel-director:project';

export const DEFAULT_MODELS: Project['models'] = {
  analysis: DEFAULT_VIDEO_MODEL,
  chat: 'deepseek/deepseek-v4-flash',
  image: 'google/gemini-2.5-flash-image',
  video: DEFAULT_VIDEO_GEN_MODEL,
};

/**
 * Cached parse of the stored JSON.
 *
 * `getSnapshot` must return the same reference when nothing changed, or React
 * re-renders forever. Comparing the raw string is what makes that safe.
 */
let cachedRaw: string | null = null;
let cachedProject: Project | null = null;
let storageFailed = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeRaw(project: Project): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(project));
    storageFailed = false;
    return true;
  } catch {
    storageFailed = true;
    return false;
  }
}

function getSnapshot(): Project | null {
  const raw = readRaw();
  if (raw === null) return null;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedProject = JSON.parse(raw) as Project;
    } catch {
      cachedProject = null;
    }
  }
  return cachedProject;
}

/** The server has no localStorage, so it renders the loading state. */
function getServerSnapshot(): Project | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Seed a run on first subscribe. This runs after mount, so it is a legitimate
  // write to an external store rather than state set during render.
  if (readRaw() === null) {
    const fresh = createProject(DEFAULT_MODELS);
    if (writeRaw(fresh)) {
      cachedRaw = null; // force a re-parse on the next snapshot
      queueMicrotask(emit);
    }
  }

  // Another tab editing the same run should be reflected here.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) emit();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export interface UseProject {
  project: Project | null;
  /** True once a run exists in storage, so the UI can wait for the first read. */
  ready: boolean;
  /** Set when the run cannot be persisted, so the operator is told rather than surprised. */
  storageError: string | null;
  update: (change: (current: Project) => Project) => void;
  reset: () => void;
}

export function useProject(): UseProject {
  const project = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((change: (current: Project) => Project) => {
    const current = getSnapshot();
    if (current === null) return;
    const next = { ...change(current), updatedAt: new Date().toISOString() };
    writeRaw(next);
    cachedRaw = null;
    emit();
  }, []);

  const reset = useCallback(() => {
    writeRaw(createProject(DEFAULT_MODELS));
    cachedRaw = null;
    emit();
  }, []);

  return {
    project,
    ready: project !== null,
    storageError: storageFailed
      ? 'This run cannot be saved in the browser, so it will be lost on refresh. Free up space, or leave private browsing.'
      : null,
    update,
    reset,
  };
}
