import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { DatabaseNotConfiguredError } from '@/services/neon';
import { deleteAssetBytes, putAssetBytes, readAssetBytes } from '@/services/run-repository';
import type { AssetBucket } from '@/types/run-store';

/**
 * One asset's bytes, in Postgres.
 *
 * Bytes are sent and served raw rather than as base64 JSON. A 40 MB clip
 * inflates by a third as base64 and then has to be parsed as a string, which
 * costs memory on a container sized for a web app.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKETS: readonly AssetBucket[] = ['sheets', 'stills', 'clips'];

interface Context {
  params: Promise<{ runId: string; bucket: string; key: string }>;
}

function bad(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function guard(bucket: string): NextResponse | null {
  if (env.runTransport !== 'neon') {
    return bad('This deployment stores assets in the browser.', 409);
  }
  if (!BUCKETS.includes(bucket as AssetBucket)) {
    return bad(`"${bucket}" is not an asset collection.`, 400);
  }
  return null;
}

function fail(error: unknown): NextResponse {
  if (error instanceof DatabaseNotConfiguredError) {
    return bad(error.message, 503);
  }
  logger.error('asset storage failed', { error });
  return bad('The asset request failed.', 500);
}

export async function GET(_request: Request, context: Context) {
  const { runId, bucket, key } = await context.params;
  const blocked = guard(bucket);
  if (blocked !== null) return blocked;
  try {
    const found = await readAssetBytes(runId, bucket as AssetBucket, key);
    if (found === null) return bad('That asset is not stored.', 404);
    return new Response(found.bytes as unknown as BodyInit, {
      headers: {
        'content-type': found.mimeType,
        'content-length': String(found.bytes.byteLength),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: Context) {
  const { runId, bucket, key } = await context.params;
  const blocked = guard(bucket);
  if (blocked !== null) return blocked;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) return bad('No bytes were sent.', 400);

    const headers = request.headers;
    const number = (name: string): number | undefined => {
      const raw = headers.get(name);
      if (raw === null) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    // Read each header once and narrow it, so `exactOptionalPropertyTypes` can
    // see that an omitted property is absent rather than explicitly undefined.
    const width = number('x-asset-width');
    const height = number('x-asset-height');
    const cost = number('x-asset-cost');

    await putAssetBytes(
      runId,
      bucket as AssetBucket,
      key,
      {
        key,
        origin: headers.get('x-asset-origin') === 'uploaded' ? 'uploaded' : 'generated',
        mimeType: headers.get('content-type') ?? 'application/octet-stream',
        sizeBytes: bytes.byteLength,
        createdAt: new Date().toISOString(),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        ...(cost === undefined ? {} : { costUsd: cost }),
      },
      bytes,
    );
    return NextResponse.json({ ok: true, sizeBytes: bytes.byteLength });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { runId, bucket, key } = await context.params;
  const blocked = guard(bucket);
  if (blocked !== null) return blocked;
  try {
    await deleteAssetBytes(runId, bucket as AssetBucket, key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
