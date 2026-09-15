import { beforeEach, describe, expect, it } from 'vitest';

import { createProject } from '@/lib/pipeline';
import { LocalRunStore } from '@/services/local-run-store';
import { runStore } from '@/services/run-transport';
import type { Project } from '@/types/pipeline';

/**
 * The app must run on a laptop with no database and no DATABASE_URL.
 *
 * That is the default path, and the one most likely to break silently: adding
 * a database tempts every later change to assume one is there. These tests pin
 * the promise that a fresh checkout works with only an OpenRouter key.
 *
 * `NEXT_PUBLIC_RUN_TRANSPORT` is unset here, exactly as it is on a fresh clone.
 */

const MODELS: Project['models'] = {
  analysis: 'google/gemini-3.6-flash',
  chat: 'deepseek/deepseek-v4-flash',
  image: 'google/gemini-2.5-flash-image',
  video: 'kwaivgi/kling-v3.0-std',
};

describe('the default transport, with no database configured', () => {
  it('selects the browser store, not Neon', () => {
    expect(runStore().kind).toBe('local');
  });

  it('returns the same instance rather than rebuilding it per call', () => {
    expect(runStore()).toBe(runStore());
  });

  it('never reaches for a connection string', () => {
    // The Neon store is only ever constructed by the transport, and the
    // transport chose local, so nothing in this path can require a database.
    expect(runStore()).toBeInstanceOf(LocalRunStore);
  });
});

describe('the local store round-trips a run', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null before anything is saved', async () => {
    await expect(new LocalRunStore().load()).resolves.toBeNull();
  });

  it('saves and reads back a run', async () => {
    const store = new LocalRunStore();
    const project = createProject(MODELS);
    await store.save(project);
    await expect(store.load()).resolves.toEqual(project);
  });

  it('keeps the plan and the approvals across a reload', async () => {
    const store = new LocalRunStore();
    const project: Project = {
      ...createProject(MODELS),
      stage: 'stills',
      approved: ['source', 'analysis', 'refine', 'plan', 'sheets'],
      spendUsd: 1.23,
    };
    await store.save(project);

    const reloaded = await store.load();
    expect(reloaded?.stage).toBe('stills');
    expect(reloaded?.approved).toHaveLength(5);
    expect(reloaded?.spendUsd).toBe(1.23);
  });

  it('replaces the run on reset', async () => {
    const store = new LocalRunStore();
    const first = createProject(MODELS);
    await store.save(first);
    const second = createProject(MODELS);
    await store.reset(second);

    const loaded = await store.load();
    expect(loaded?.id).toBe(second.id);
    expect(loaded?.id).not.toBe(first.id);
  });

  it('returns null rather than throwing when the stored value is corrupt', async () => {
    window.localStorage.setItem('reel-director:project', 'not json');
    await expect(new LocalRunStore().load()).resolves.toBeNull();
  });
});
