# Which OpenRouter models can watch a video

This document records what was measured, not what the documentation promises. Every claim here comes
from a live call made while building the feature.

## How to tell

A model can accept a video only if it declares `video` in `architecture.input_modalities`.

```bash
curl -sS https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
| python3 -c "
import json,sys
for m in json.load(sys.stdin)['data']:
    if 'video' in (m.get('architecture') or {}).get('input_modalities', []):
        print(m['id'])
"
```

At the time of writing this returned **79 models out of 445**. Send a video to a model outside that
set and OpenRouter rejects the request.

## How a video is sent

The Chat Completions API takes a `video_url` content part. The Responses API calls the same thing
`input_video`. This application uses the former.

```json
{
  "type": "video_url",
  "video_url": { "url": "data:video/mp4;base64,AAAA..." }
}
```

Supported container formats are `video/mp4`, `video/mpeg`, `video/mov` and `video/webm`. A remote URL
works too, but this application sends base64. A media URL is often signed and expires, so handing
the link to a third party is unreliable.

## Four things that are not in the documentation

These cost time to find. They are written down so nobody finds them twice.

### 1. `video_tokens` is the proof the model actually watched

The reply reports the count under `usage.prompt_tokens_details.video_tokens`. A 10 second clip at 360p
read as **660 video tokens**.

A zero here means the request degraded to text and the answer is guesswork. `services/openrouter.ts`
logs a warning when it happens, because a confident answer built on no frames is the worst possible
output.

### 2. Reasoning cannot be turned off, and it spends the answer's budget

Sending `reasoning: { enabled: false }` to a Gemini endpoint fails:

```
400 Reasoning is mandatory for this endpoint and cannot be disabled.
```

The first attempt at this feature set `max_tokens` to 400. Reasoning consumed 393 of them and the
reply was an empty string. It looked like a model fault and was a budget fault. The service now asks
for 16000 tokens.

### 3. Strict JSON schemas work alongside a video part

`response_format: { type: "json_schema", json_schema: { strict: true, ... } }` returns schema-valid
JSON in the same request that carries the video. This was verified, and the whole director service
depends on it.

Strict mode requires `additionalProperties: false` and every property listed in `required`. The
`object()` helper in `services/reel-director.ts` derives `required` from the property names so the two
cannot drift apart.

### 4. Cost is dominated by the video, not the words

A 10 second 360p clip with a full shot breakdown cost about **0.006 USD**. A 30 second reel at higher
resolution costs more, but the order of magnitude holds: this is a fraction of a cent per run.

## The curated list

`lib/video-models.ts` holds the models the user interface offers, ordered best first. The full 79 are
mostly minor variants of the same families, so offering all of them would be noise.

| Model                           | USD per million prompt tokens | Why it is on the list                                |
| ------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `google/gemini-3.5-flash`       | 1.50                          | The default. Verified end to end against this code   |
| `google/gemini-3.1-pro-preview` | 2.00                          | Reads subtext and pacing most carefully              |
| `google/gemini-3.8-flash`       | 0.75                          | Newest Flash. Reads audio, so it catches sound       |
| `google/gemini-2.5-flash`       | 0.30                          | The cheap Google option, fine for a first pass       |
| `qwen/qwen3.8-max-0902`         | 2.00                          | Strongest non-Google reader, a useful second opinion |
| `minimax/minimax-m3`            | 0.30                          | Cheap, good on motion and transitions                |
| `z-ai/glm-5.3-flash`            | 0.15                          | Lowest cost here. Expect a coarser breakdown         |

Prices come from the models endpoint and are indicative, not a billing source.

`services/openrouter.ts` exports `listVideoModels()`, which re-runs the capability filter at runtime.
Use it to check the curated list against reality rather than letting it go stale.
