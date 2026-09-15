import { describe, expect, it } from 'vitest';

import { readVideoUrl } from '@/services/reel-fetcher';

/**
 * `readVideoUrl` is the one pure function in the fetcher, and it is the part
 * most likely to break: Instagram has moved the playable-URL field more than
 * once, so it narrows `unknown` defensively rather than trusting one shape.
 * The network paths around it are exercised by running the app, not by mocking
 * `fetch` into agreeing with itself.
 */
describe('readVideoUrl', () => {
  it('reads the current xdt_shortcode_media shape', () => {
    const payload = { data: { xdt_shortcode_media: { video_url: 'https://cdn/video.mp4' } } };
    expect(readVideoUrl(payload)).toBe('https://cdn/video.mp4');
  });

  it('reads the older shortcode_media shape', () => {
    const payload = { data: { shortcode_media: { video_url: 'https://cdn/old.mp4' } } };
    expect(readVideoUrl(payload)).toBe('https://cdn/old.mp4');
  });

  it('falls back to the first usable entry in video_versions', () => {
    const payload = {
      data: {
        xdt_shortcode_media: {
          video_versions: [{ url: '' }, { url: 'https://cdn/v2.mp4' }],
        },
      },
    };
    expect(readVideoUrl(payload)).toBe('https://cdn/v2.mp4');
  });

  it.each([null, undefined, 'a string', 42, {}, { data: null }, { data: {} }])(
    'returns null for %s rather than throwing',
    (payload) => {
      expect(readVideoUrl(payload)).toBeNull();
    },
  );

  it('returns null when Instagram answers with an empty media object', () => {
    expect(readVideoUrl({ data: { xdt_shortcode_media: {} } })).toBeNull();
  });
});
