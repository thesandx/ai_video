/**
 * Where a run is kept.
 *
 * Two implementations satisfy this: the browser (`services/local-run-store.ts`)
 * and Neon Postgres (`services/neon-run-store.ts`). `services/run-transport.ts`
 * picks between them from `NEXT_PUBLIC_RUN_TRANSPORT`, and no component
 * imports either directly, so switching is one environment variable and a
 * rebuild.
 *
 * The pattern is taken from the Playroom games repository, where room state
 * sits behind a `RoomTransport` for the same reason. See
 * `docs/adr/0007-store-the-run-in-neon-behind-a-transport.md`.
 *
 * Every method is async even where the local implementation answers
 * immediately. A synchronous interface would fit localStorage and then have to
 * be rewritten for the database, which defeats the point of having one.
 */

import type { Asset, Project } from '@/types/pipeline';

/** Which collection an asset belongs to. Matches the keys on `Project`. */
export type AssetBucket = 'sheets' | 'stills' | 'clips';

export interface RunStore {
  /** Human name for the notice shown while a run is not in the database. */
  readonly kind: 'local' | 'neon';

  /** The current run, or null when none has been started. */
  load(): Promise<Project | null>;

  /** Writes the run. Assets are not included; they go through `putAsset`. */
  save(project: Project): Promise<void>;

  /** Starts a fresh run, discarding the current one and its assets. */
  reset(project: Project): Promise<void>;

  /** Stores bytes and returns the asset record to put on the project. */
  putAsset(
    runId: string,
    bucket: AssetBucket,
    key: string,
    blob: Blob,
    origin: Asset['origin'],
    costUsd?: number,
  ): Promise<Asset>;

  /** Reads an asset back as a data URL, which is what the generation routes take. */
  getAssetDataUrl(runId: string, asset: Asset): Promise<string | null>;

  /** An object URL for previewing in the page, or null when the bytes are gone. */
  getAssetObjectUrl(runId: string, asset: Asset): Promise<string | null>;

  /** Removes an asset's bytes. The caller removes it from the project. */
  deleteAsset(runId: string, asset: Asset): Promise<void>;
}
