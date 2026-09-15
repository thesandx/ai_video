import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { DatabaseNotConfiguredError } from '@/services/neon';
import { loadLatestRun, resetRuns, saveRun } from '@/services/run-repository';
import type { Project } from '@/types/pipeline';

/**
 * The run, in Postgres.
 *
 * These routes only answer when the deployment is configured for the `neon`
 * transport. In `local` mode the browser owns the run and never calls them, so
 * answering anyway would create a second, silently diverging copy.
 */
export const runtime = 'nodejs';

function guard(): NextResponse | null {
  if (env.runTransport !== 'neon') {
    return NextResponse.json(
      { error: 'This deployment stores runs in the browser. Set NEXT_PUBLIC_RUN_TRANSPORT=neon.' },
      { status: 409 },
    );
  }
  return null;
}

function fail(error: unknown): NextResponse {
  if (error instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  logger.error('run storage failed', { error });
  return NextResponse.json({ error: 'The database request failed.' }, { status: 500 });
}

export async function GET() {
  const blocked = guard();
  if (blocked !== null) return blocked;
  try {
    return NextResponse.json({ project: await loadLatestRun() });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  const blocked = guard();
  if (blocked !== null) return blocked;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null || typeof (body as Project).id !== 'string') {
      return NextResponse.json({ error: 'Send the run as a JSON body.' }, { status: 400 });
    }
    await saveRun(body as Project);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  const blocked = guard();
  if (blocked !== null) return blocked;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null || typeof (body as Project).id !== 'string') {
      return NextResponse.json(
        { error: 'Send the replacement run as a JSON body.' },
        { status: 400 },
      );
    }
    await resetRuns(body as Project);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
