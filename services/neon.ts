import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Neon Postgres access. Server only: this module reads the connection string.
 *
 * The driver talks over HTTP rather than holding a TCP pool. That suits Cloud
 * Run, which scales to zero and can start a fresh instance per request: a
 * pooled TCP client would spend its life reconnecting, and would exhaust Neon's
 * connection limit under any concurrency.
 *
 * Two Neon behaviours shape this file, both documented in the Playroom backend
 * handover before they were hit here:
 *
 *   - Neon scales to zero. The first query after an idle period pays a cold
 *     start of a few hundred milliseconds. That is fine for a tool with an
 *     operator sitting in front of it, and it is why nothing here runs a query
 *     merely to check liveness.
 *   - `LISTEN`/`NOTIFY` does not work through the pooled endpoint, which is
 *     PgBouncer in transaction mode. Nothing here needs it, so the pooled
 *     string is correct. A future feature that wants it must open the direct
 *     endpoint separately rather than switching this one.
 */

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('No DATABASE_URL is configured. Set it, or run with NEXT_PUBLIC_RUN_TRANSPORT=local.');
    this.name = 'DatabaseNotConfiguredError';
  }
}

function client() {
  if (env.databaseUrl === '') throw new DatabaseNotConfiguredError();
  return neon(env.databaseUrl);
}

/**
 * Creates the schema if it is absent, once per process.
 *
 * Every statement is idempotent, so this is safe to call before any query. It
 * is memoised because the check is a round trip, and Neon charges for those in
 * cold-start latency. `scripts/schema.sql` holds the same DDL for anyone who
 * would rather migrate explicitly.
 */
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (schemaReady !== null) return schemaReady;

  schemaReady = (async () => {
    const sql = client();
    await sql`
      CREATE TABLE IF NOT EXISTS runs (
        id          text PRIMARY KEY,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        stage       text        NOT NULL,
        approved    jsonb       NOT NULL DEFAULT '[]'::jsonb,
        source      jsonb,
        reading     jsonb,
        brief       jsonb,
        script      jsonb,
        plan        jsonb,
        chat        jsonb       NOT NULL DEFAULT '[]'::jsonb,
        jobs        jsonb       NOT NULL DEFAULT '{}'::jsonb,
        models      jsonb       NOT NULL,
        spend_usd   numeric(12, 4) NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS run_assets (
        run_id      text        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        bucket      text        NOT NULL,
        key         text        NOT NULL,
        origin      text        NOT NULL,
        mime_type   text        NOT NULL,
        size_bytes  integer     NOT NULL,
        width       integer,
        height      integer,
        cost_usd    numeric(12, 4),
        bytes       bytea       NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (run_id, bucket, key)
      )
    `;
    // Listing a run's assets must never drag the bytes along with it.
    await sql`
      CREATE INDEX IF NOT EXISTS run_assets_run_idx ON run_assets (run_id, bucket)
    `;
    logger.info('neon schema ready');
  })().catch((error: unknown) => {
    // A failed migration must not be cached as success, or every later request
    // reports a confusing missing-table error instead of the real cause.
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

/** The tagged-template SQL client, with the schema guaranteed. */
export async function db() {
  await ensureSchema();
  return client();
}
