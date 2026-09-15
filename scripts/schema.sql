-- Reel Director schema for Neon Postgres.
--
-- The application creates these tables itself on first use, through
-- `ensureSchema()` in services/neon.ts, because every statement below is
-- idempotent. This file exists for anyone who would rather migrate explicitly,
-- or review the shape before pointing the app at a database.
--
-- Apply it with:
--   psql "$DATABASE_URL" -f scripts/schema.sql
--
-- Use the POOLED Neon connection string. The direct endpoint exists for
-- LISTEN/NOTIFY, which does not work through Neon's pooler, and nothing here
-- needs it.

-- One row per run. The plan, chat and job map are jsonb rather than normalised
-- tables: they are read and written whole, never queried by field, and
-- normalising them would buy a migration every time a shot gains a property.
CREATE TABLE IF NOT EXISTS runs (
  id          text PRIMARY KEY,
  created_at  timestamptz    NOT NULL DEFAULT now(),
  updated_at  timestamptz    NOT NULL DEFAULT now(),
  stage       text           NOT NULL,
  approved    jsonb          NOT NULL DEFAULT '[]'::jsonb,
  source      jsonb,
  reading     jsonb,
  brief       jsonb,
  script      jsonb,
  plan        jsonb,
  chat        jsonb          NOT NULL DEFAULT '[]'::jsonb,
  jobs        jsonb          NOT NULL DEFAULT '{}'::jsonb,
  models      jsonb          NOT NULL,
  spend_usd   numeric(12, 4) NOT NULL DEFAULT 0
);

-- Character sheets, first frames and clips. Separate from `runs` because they
-- are large: listing a run must never drag megabytes of video with it, so the
-- application selects every column except `bytes` when it loads one.
--
-- A note on `bytea`. Images are around 1 MB and sit here comfortably. A clip
-- can reach 40 MB, which Postgres stores out of line through TOAST and handles,
-- but object storage is the better home once runs are kept in bulk. The key
-- shape below does not change if that move happens: `bytes` becomes a URL.
CREATE TABLE IF NOT EXISTS run_assets (
  run_id      text           NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  bucket      text           NOT NULL,   -- 'sheets' | 'stills' | 'clips'
  key         text           NOT NULL,   -- character id, or shot id
  origin      text           NOT NULL,   -- 'generated' | 'uploaded'
  mime_type   text           NOT NULL,
  size_bytes  integer        NOT NULL,
  width       integer,
  height      integer,
  cost_usd    numeric(12, 4),
  bytes       bytea          NOT NULL,
  created_at  timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, bucket, key)
);

CREATE INDEX IF NOT EXISTS run_assets_run_idx ON run_assets (run_id, bucket);
