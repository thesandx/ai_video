import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { chooseDuration, findVideoGenModel } from '@/lib/video-gen-models';
import { OpenRouterError } from '@/services/openrouter';
import { createVideoJob } from '@/services/openrouter-video';

/**
 * Starts one video job.
 *
 * This is the only route in the app that spends real money per call, so it
 * validates the model, the aspect ratio and the duration BEFORE calling out.
 * The upstream API does not reject an unsupported duration: it bills for
 * whatever it decides to make.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    const { model, prompt, aspectRatio, durationSeconds, firstFrame } = body as {
      model?: unknown;
      prompt?: unknown;
      aspectRatio?: unknown;
      durationSeconds?: unknown;
      firstFrame?: unknown;
    };

    if (typeof model !== 'string' || typeof prompt !== 'string' || prompt.trim() === '') {
      return NextResponse.json({ error: 'A model and a prompt are required.' }, { status: 400 });
    }
    if (typeof firstFrame !== 'string' || !firstFrame.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'A first frame image is required. Generate or upload the still for this shot.' },
        { status: 400 },
      );
    }

    const spec = findVideoGenModel(model);
    if (spec === undefined) {
      return NextResponse.json(
        { error: `"${model}" is not a supported video model.` },
        { status: 400 },
      );
    }

    const ratio = typeof aspectRatio === 'string' ? aspectRatio : '9:16';
    if (!spec.aspectRatios.includes(ratio)) {
      return NextResponse.json(
        { error: `${spec.label} does not support ${ratio}.` },
        { status: 400 },
      );
    }

    const wanted = Number(durationSeconds);
    const duration = chooseDuration(spec, Number.isFinite(wanted) ? wanted : 0);
    if (duration === null) {
      return NextResponse.json(
        {
          error: `${spec.label} cannot generate ${wanted}s. It supports ${spec.durations.join(', ')}.`,
        },
        { status: 400 },
      );
    }

    const job = await createVideoJob({
      model,
      prompt,
      aspectRatio: ratio,
      durationSeconds: duration,
      firstFrameDataUrl: firstFrame,
    });

    logger.info('video job started', { jobId: job.id, model, duration });
    return NextResponse.json({ ...job, durationSeconds: duration });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('video job failed to start', { error });
    return NextResponse.json({ error: 'Could not start the video job.' }, { status: 500 });
  }
}
