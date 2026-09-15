import { env } from '@/lib/env';
import { LocalRunStore } from '@/services/local-run-store';
import { NeonRunStore } from '@/services/neon-run-store';
import type { RunStore } from '@/types/run-store';

/**
 * Picks where a run is stored.
 *
 * `NEXT_PUBLIC_RUN_TRANSPORT` decides, and nothing else in the app imports an
 * implementation directly, so switching between the browser and Postgres is
 * one environment variable and a rebuild. The same shape is used for room
 * state in the Playroom games repository.
 *
 * `NEXT_PUBLIC_` because the browser makes this choice. It names a strategy,
 * never a credential: the connection string stays server-side in `DATABASE_URL`
 * and is reached only through `/api/runs`.
 */

let store: RunStore | null = null;

export function runStore(): RunStore {
  if (store === null) {
    store = env.runTransport === 'neon' ? new NeonRunStore() : new LocalRunStore();
  }
  return store;
}
