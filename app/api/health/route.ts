import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { formatIst } from '@/lib/utils';

/**
 * Liveness / readiness probe.
 *
 * Consumed by three things, which is why it must stay fast and dependency-free:
 *   - the Docker `HEALTHCHECK` instruction (local and Compose runs)
 *   - Cloud Run startup and liveness probes
 *   - uptime checks / load balancer health checks
 *
 * It deliberately does NOT reach out to databases or third-party APIs. A probe
 * that fails when a downstream dependency blips will make Cloud Run kill a
 * perfectly healthy container and amplify the outage. Add a separate
 * `/api/health/deep` endpoint for dependency checks if you need one, and point
 * only dashboards — never the orchestrator — at it.
 */

// Never cached, never statically prerendered: a cached "ok" is worthless.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const startedAt = Date.now();

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: env.appName,
      version: env.appVersion,
      environment: env.nodeEnv,
      region: env.gcpRegion || 'local',
      // Last deploy time in IST, or null when this build was not deployed by
      // the pipeline (local dev). Lets you confirm a deploy without GitHub.
      deployedAt: formatIst(env.deployedAt),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
