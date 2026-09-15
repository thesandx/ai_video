import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_MODEL,
  isSupportedVideoModel,
  resolveVideoModel,
  VIDEO_MODELS,
} from '@/lib/video-models';

describe('the video model catalogue', () => {
  it('is not empty, because the default is read from its head', () => {
    expect(VIDEO_MODELS.length).toBeGreaterThan(0);
  });

  it('leads with the model the pipeline was verified against', () => {
    expect(VIDEO_MODELS[0]?.id).toBe(DEFAULT_VIDEO_MODEL);
  });

  it('lists every model exactly once', () => {
    const ids = VIDEO_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a reason to be chosen', () => {
    for (const model of VIDEO_MODELS) {
      expect(model.note.length).toBeGreaterThan(10);
      expect(model.promptUsdPerMillion).toBeGreaterThan(0);
    }
  });
});

describe('the catalogue gates what can be requested', () => {
  /**
   * `isSupportedVideoModel` rejects anything absent from the catalogue, so a
   * video capable model left out of it cannot be requested at all. That is how
   * `google/gemini-3.6-flash` came to be refused while being perfectly capable.
   * These cases pin the Flash line so the omission cannot come back silently.
   */
  it.each([
    'google/gemini-3.5-flash',
    'google/gemini-3.6-flash',
    'google/gemini-3.7-flash',
    'google/gemini-3.8-flash',
    'google/gemini-2.5-flash',
  ])('accepts %s, which reads both video and audio', (id) => {
    expect(isSupportedVideoModel(id)).toBe(true);
  });

  it('resolves 3.6 Flash to itself rather than falling back', () => {
    expect(resolveVideoModel('google/gemini-3.6-flash').id).toBe('google/gemini-3.6-flash');
  });
});

describe('isSupportedVideoModel', () => {
  it('accepts a catalogued model', () => {
    expect(isSupportedVideoModel(DEFAULT_VIDEO_MODEL)).toBe(true);
  });

  it('rejects a model that cannot take video input', () => {
    expect(isSupportedVideoModel('openai/gpt-4o-mini')).toBe(false);
  });
});

describe('resolveVideoModel', () => {
  it('falls back to the default when the id is unknown', () => {
    expect(resolveVideoModel('nope/not-real').id).toBe(DEFAULT_VIDEO_MODEL);
  });

  it('falls back when nothing was chosen', () => {
    expect(resolveVideoModel(undefined).id).toBe(DEFAULT_VIDEO_MODEL);
  });

  it('returns the requested model when it is catalogued', () => {
    expect(resolveVideoModel('google/gemini-2.5-flash').id).toBe('google/gemini-2.5-flash');
  });
});
