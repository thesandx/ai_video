import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';
import { buildPlan } from '@/services/plan-builder';
import type { CreativeBrief, ReelReading, ReelScript } from '@/types/reel';

/** Builds the production plan from an analysis. Cheap: it reads text, not video. */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }
    const { model, reading, brief, script } = body as Record<string, unknown>;
    if (
      typeof model !== 'string' ||
      reading === undefined ||
      brief === undefined ||
      script === undefined
    ) {
      return NextResponse.json(
        { error: 'A model, a reading, a brief and a script are all required.' },
        { status: 400 },
      );
    }

    const result = await buildPlan(
      model,
      reading as ReelReading,
      brief as CreativeBrief,
      script as ReelScript,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('plan build failed', { error });
    return NextResponse.json({ error: 'Could not build the plan.' }, { status: 500 });
  }
}
