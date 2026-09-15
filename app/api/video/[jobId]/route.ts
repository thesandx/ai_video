import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';
import { readVideoJob } from '@/services/openrouter-video';

/** Polls one video job. Free to call, so the browser polls this until it settles. */
export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  try {
    return NextResponse.json(await readVideoJob(jobId));
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('video poll failed', { jobId, error });
    return NextResponse.json({ error: 'Could not read that job.' }, { status: 500 });
  }
}
