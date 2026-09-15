import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';
import { generateImage } from '@/services/openrouter-image';

/**
 * Generates one image: a character sheet, or a shot's first frame.
 *
 * References arrive as data URLs from the browser, which holds the run's
 * assets. That keeps the route stateless and means an uploaded sheet chains
 * exactly like a generated one.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    const { model, prompt, references, aspectRatio } = body as {
      model?: unknown;
      prompt?: unknown;
      references?: unknown;
      aspectRatio?: unknown;
    };

    if (typeof model !== 'string' || typeof prompt !== 'string' || prompt.trim() === '') {
      return NextResponse.json({ error: 'A model and a prompt are required.' }, { status: 400 });
    }

    const refs =
      Array.isArray(references) && references.every((r) => typeof r === 'string')
        ? (references as string[])
        : [];

    const image = await generateImage({
      model,
      prompt,
      references: refs,
      ...(typeof aspectRatio === 'string' ? { aspectRatio } : {}),
    });

    return NextResponse.json(image);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('image generation failed', { error });
    return NextResponse.json({ error: 'Image generation failed.' }, { status: 500 });
  }
}
