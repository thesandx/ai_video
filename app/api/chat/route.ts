import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';
import { refine } from '@/services/reel-chat';
import type { ChatTurn, ProductionPlan } from '@/types/pipeline';

/** Refinement chat. Cheap, stateless, and the plan is sent by the browser each turn. */
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    const { model, plan, history, message } = body as {
      model?: unknown;
      plan?: unknown;
      history?: unknown;
      message?: unknown;
    };

    if (typeof model !== 'string' || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'A model and a message are required.' }, { status: 400 });
    }
    if (typeof plan !== 'object' || plan === null) {
      return NextResponse.json({ error: 'There is no plan to talk about yet.' }, { status: 400 });
    }

    const reply = await refine(
      model,
      plan as ProductionPlan,
      Array.isArray(history) ? (history as ChatTurn[]) : [],
      message,
    );
    return NextResponse.json(reply);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('chat failed', { error });
    return NextResponse.json({ error: 'The chat request failed.' }, { status: 500 });
  }
}
