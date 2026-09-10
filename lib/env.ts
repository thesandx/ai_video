/**
 * Typed, validated access to environment variables.
 *
 * Why this file exists: `process.env.FOO` is `string | undefined` everywhere,
 * so a missing variable surfaces as a confusing runtime error deep in a request
 * handler — often only in production. Validating once, at module load, turns
 * that into a loud failure at container start, which Cloud Run reports as a
 * failed revision instead of silently serving broken traffic.
 *
 * Rules:
 *   - Every variable the app reads MUST be declared here and in `.env.example`.
 *   - Never read `process.env` directly outside this file.
 *   - Server-only values must never be re-exported into a Client Component.
 *     Anything the browser may see has to be prefixed `NEXT_PUBLIC_`.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so those reads are
 * written out literally below rather than looked up dynamically.
 */

type NodeEnv = 'development' | 'production' | 'test';

const VALID_NODE_ENVS: readonly NodeEnv[] = ['development', 'production', 'test'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

class EnvValidationError extends Error {
  constructor(issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}\n\n` +
        'See .env.example for the full list of supported variables.',
    );
    this.name = 'EnvValidationError';
  }
}

const issues: string[] = [];

function optional(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim() === '' ? fallback : value;
}

function oneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value.trim() === '') return fallback;
  if (!allowed.includes(value as T)) {
    issues.push(`${name} must be one of [${allowed.join(', ')}] but was "${value}"`);
    return fallback;
  }
  return value as T;
}

function port(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    issues.push(`${name} must be an integer between 1 and 65535 but was "${value}"`);
    return fallback;
  }
  return parsed;
}

const nodeEnv = oneOf('NODE_ENV', process.env.NODE_ENV, VALID_NODE_ENVS, 'development');

export const env = {
  /** Node runtime mode. Set by the tooling; never override it by hand. */
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',

  /** Injected by Cloud Run. The server MUST bind to this, not a hardcoded 3000. */
  port: port('PORT', process.env.PORT, 3000),

  /** Interface to bind. `0.0.0.0` is required inside a container. */
  host: optional(process.env.HOSTNAME, '0.0.0.0'),

  /** Verbosity floor for application logs. */
  logLevel: oneOf('LOG_LEVEL', process.env.LOG_LEVEL, VALID_LOG_LEVELS, 'info'),

  /** Public origin of the deployment, used for canonical URLs and metadata. */
  appUrl: optional(process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000'),

  /** Human-readable name shown in the UI and in page titles. */
  appName: optional(process.env.NEXT_PUBLIC_APP_NAME, 'Next.js on Cloud Run'),

  /** Commit SHA of the running build. Surfaced by /api/health for traceability. */
  appVersion: optional(process.env.NEXT_PUBLIC_APP_VERSION, 'dev'),

  /** GCP project id. Injected by the deploy workflow; absent locally. */
  gcpProjectId: optional(process.env.GCP_PROJECT_ID, ''),

  /** Cloud Run region, e.g. `asia-southeast1`. */
  gcpRegion: optional(process.env.GCP_REGION, ''),

  /**
   * UTC time of the last deploy (ISO-8601), injected by the deploy workflow.
   * Empty locally. Surfaced by /api/health, rendered in IST, so a deploy is
   * visible without opening GitHub.
   */
  deployedAt: optional(process.env.DEPLOYED_AT, ''),
} as const;

/**
 * Add production-required variables here as the project grows. Use a validator
 * that pushes to `issues` (like `oneOf`/`port` above) so the app refuses to
 * start when a required value is missing or invalid.
 *
 * `NEXT_PUBLIC_APP_URL` is intentionally NOT required. Cloud Run only generates
 * the service URL after the first deploy, and `NEXT_PUBLIC_*` values are inlined
 * at build time — so making it mandatory would fail the first deploy's health
 * check before the URL can exist. `appUrl` above falls back to a safe default,
 * and the deploy workflow inlines the real value on the next build.
 */

if (issues.length > 0) {
  throw new EnvValidationError(issues);
}

export type Env = typeof env;
