import { db } from '@/services/neon';
import type { Asset, Project } from '@/types/pipeline';
import type { AssetBucket } from '@/types/run-store';

/**
 * Reads and writes a run in Postgres.
 *
 * The run is one row. Its plan, chat and job map are `jsonb` rather than
 * normalised tables: they are read and written whole, never queried by field,
 * and normalising them would buy nothing but migrations every time a shot gains
 * a property.
 *
 * Assets are a separate table because they are large and because listing a run
 * must never drag megabytes of video along with it. `listAssets` therefore
 * selects every column except `bytes`.
 */

interface RunRow {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
  stage: string;
  approved: unknown;
  source: unknown;
  reading: unknown;
  brief: unknown;
  script: unknown;
  plan: unknown;
  chat: unknown;
  jobs: unknown;
  models: unknown;
  spend_usd: string | number;
}

interface AssetRow {
  bucket: string;
  key: string;
  origin: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  cost_usd: string | number | null;
  created_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAsset(row: AssetRow): Asset {
  const cost = row.cost_usd === null ? undefined : Number(row.cost_usd);
  return {
    key: row.key,
    origin: row.origin === 'uploaded' ? 'uploaded' : 'generated',
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    // The bytes live in Postgres, so the blob key is the address that finds
    // them again through the asset route.
    blobKey: `${row.bucket}:${row.key}`,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    ...(cost === undefined || Number.isNaN(cost) ? {} : { costUsd: cost }),
    createdAt: iso(row.created_at),
  };
}

/** The most recently touched run, with its asset metadata but not its bytes. */
export async function loadLatestRun(): Promise<Project | null> {
  const sql = await db();
  const runs = (await sql`
    SELECT * FROM runs ORDER BY updated_at DESC LIMIT 1
  `) as unknown as RunRow[];

  const row = runs[0];
  if (row === undefined) return null;

  const assets = (await sql`
    SELECT bucket, key, origin, mime_type, size_bytes, width, height, cost_usd, created_at
    FROM run_assets WHERE run_id = ${row.id}
  `) as unknown as AssetRow[];

  const buckets: Record<AssetBucket, Record<string, Asset>> = {
    sheets: {},
    stills: {},
    clips: {},
  };
  for (const asset of assets) {
    const bucket = asset.bucket as AssetBucket;
    if (bucket in buckets) buckets[bucket][asset.key] = toAsset(asset);
  }

  return {
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    stage: row.stage as Project['stage'],
    approved: (row.approved ?? []) as Project['approved'],
    chat: (row.chat ?? []) as Project['chat'],
    jobs: (row.jobs ?? {}) as Project['jobs'],
    models: row.models as Project['models'],
    spendUsd: Number(row.spend_usd),
    sheets: buckets.sheets,
    stills: buckets.stills,
    clips: buckets.clips,
    // `NonNullable` matters here: `Project['source']` includes `undefined`, and
    // under `exactOptionalPropertyTypes` an explicit undefined is not the same
    // as an absent property.
    ...(row.source === null ? {} : { source: row.source as NonNullable<Project['source']> }),
    ...(row.reading === null ? {} : { reading: row.reading as NonNullable<Project['reading']> }),
    ...(row.brief === null ? {} : { brief: row.brief as NonNullable<Project['brief']> }),
    ...(row.script === null ? {} : { script: row.script as NonNullable<Project['script']> }),
    ...(row.plan === null ? {} : { plan: row.plan as NonNullable<Project['plan']> }),
  };
}

/** Inserts or updates the run row. Assets are untouched. */
export async function saveRun(project: Project): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO runs (
      id, created_at, updated_at, stage, approved,
      source, reading, brief, script, plan, chat, jobs, models, spend_usd
    ) VALUES (
      ${project.id}, ${project.createdAt}, ${project.updatedAt}, ${project.stage},
      ${JSON.stringify(project.approved)}::jsonb,
      ${project.source === undefined ? null : JSON.stringify(project.source)}::jsonb,
      ${project.reading === undefined ? null : JSON.stringify(project.reading)}::jsonb,
      ${project.brief === undefined ? null : JSON.stringify(project.brief)}::jsonb,
      ${project.script === undefined ? null : JSON.stringify(project.script)}::jsonb,
      ${project.plan === undefined ? null : JSON.stringify(project.plan)}::jsonb,
      ${JSON.stringify(project.chat)}::jsonb,
      ${JSON.stringify(project.jobs)}::jsonb,
      ${JSON.stringify(project.models)}::jsonb,
      ${project.spendUsd}
    )
    ON CONFLICT (id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at,
      stage      = EXCLUDED.stage,
      approved   = EXCLUDED.approved,
      source     = EXCLUDED.source,
      reading    = EXCLUDED.reading,
      brief      = EXCLUDED.brief,
      script     = EXCLUDED.script,
      plan       = EXCLUDED.plan,
      chat       = EXCLUDED.chat,
      jobs       = EXCLUDED.jobs,
      models     = EXCLUDED.models,
      spend_usd  = EXCLUDED.spend_usd
  `;
}

/** Replaces the current run and, by cascade, every asset it owned. */
export async function resetRuns(project: Project): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM runs`;
  await saveRun(project);
}

export async function putAssetBytes(
  runId: string,
  bucket: AssetBucket,
  key: string,
  asset: Omit<Asset, 'blobKey'>,
  bytes: Uint8Array,
): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO run_assets (
      run_id, bucket, key, origin, mime_type, size_bytes, width, height, cost_usd, bytes, created_at
    ) VALUES (
      ${runId}, ${bucket}, ${key}, ${asset.origin}, ${asset.mimeType}, ${asset.sizeBytes},
      ${asset.width ?? null}, ${asset.height ?? null}, ${asset.costUsd ?? null},
      ${Buffer.from(bytes)}, ${asset.createdAt}
    )
    ON CONFLICT (run_id, bucket, key) DO UPDATE SET
      origin     = EXCLUDED.origin,
      mime_type  = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      width      = EXCLUDED.width,
      height     = EXCLUDED.height,
      cost_usd   = EXCLUDED.cost_usd,
      bytes      = EXCLUDED.bytes,
      created_at = EXCLUDED.created_at
  `;
}

export async function readAssetBytes(
  runId: string,
  bucket: AssetBucket,
  key: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const sql = await db();
  const rows = (await sql`
    SELECT bytes, mime_type FROM run_assets
    WHERE run_id = ${runId} AND bucket = ${bucket} AND key = ${key}
  `) as unknown as Array<{ bytes: Buffer | Uint8Array; mime_type: string }>;

  const row = rows[0];
  if (row === undefined) return null;
  return { bytes: new Uint8Array(row.bytes), mimeType: row.mime_type };
}

export async function deleteAssetBytes(
  runId: string,
  bucket: AssetBucket,
  key: string,
): Promise<void> {
  const sql = await db();
  await sql`
    DELETE FROM run_assets WHERE run_id = ${runId} AND bucket = ${bucket} AND key = ${key}
  `;
}
