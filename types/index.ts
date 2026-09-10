/**
 * Shared, app-wide TypeScript types.
 *
 * What belongs here:
 *   - types used by more than one feature or layer
 *   - the shape of external API payloads consumed by `services/`
 *   - branded primitives and generic result wrappers
 *
 * What does NOT belong here:
 *   - component prop types  -> define them next to the component
 *   - hook return types     -> define them next to the hook
 *   - types used by exactly one module -> keep them local until reused
 *
 * A type file that grows to hundreds of lines is a sign the domain wants
 * splitting into `types/<domain>.ts` modules re-exported from here.
 */

/** ISO-8601 timestamp, e.g. `2026-07-21T09:30:00.000Z`. */
export type IsoDateString = string;

/** Health probe payload returned by `GET /api/health`. */
export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  region: string;
  uptimeSeconds: number;
  timestamp: IsoDateString;
}

/**
 * Result of an operation that can fail without throwing.
 * Forces call sites to handle the failure branch to reach `data`.
 */
export type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

/** Makes the listed keys required on an otherwise partial type. */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Recursively marks every property optional. Useful for test fixtures. */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;
