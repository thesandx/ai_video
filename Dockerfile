# syntax=docker/dockerfile:1.7

###############################################################################
# Multi-stage build for Next.js on Google Cloud Run.
#
# Stages:
#   base    - pinned Node runtime shared by every other stage
#   deps    - dependency installation only, so it caches on lockfile changes
#   builder - compiles the app and emits the standalone server bundle
#   runner  - final image: node_modules-free, non-root, ~65 MB
#
# The size win comes from `output: 'standalone'` in next.config.ts, which traces
# the modules actually reachable at runtime and copies just those. Do not
# replace this with a `COPY . .` of the whole tree.
###############################################################################

ARG NODE_VERSION=22.20.0
ARG ALPINE_VERSION=3.21

###############################################################################
# base
###############################################################################
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# libc6-compat: some native transitive deps are built against glibc symbols.
# dumb-init: PID 1 that reaps zombies and forwards SIGTERM, which Cloud Run
#            sends before evicting an instance. Without it Node ignores the
#            signal and the container is SIGKILLed 10s later, dropping requests.
RUN apk add --no-cache libc6-compat dumb-init

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

###############################################################################
# deps — cached independently of application source
###############################################################################
FROM base AS deps

# Only the manifests are copied, so editing a component does not bust this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# `--frozen-lockfile` fails the build if the lockfile is out of date rather than
# silently resolving different versions than CI tested.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

###############################################################################
# builder — produces .next/standalone
###############################################################################
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public build-time configuration. Next.js inlines NEXT_PUBLIC_* values into the
# client bundle at build time, so they must be present here and not only at
# runtime. Pass them with `--build-arg` from CI.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_NAME="Next.js on Cloud Run"
ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

###############################################################################
# runner — the only stage that ships
###############################################################################
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cloud Run injects PORT (8080 by default) and the server must bind to it.
# HOSTNAME=0.0.0.0 is mandatory: Next defaults to localhost, which is
# unreachable from outside the container and shows up as "container failed to
# start and listen on the port defined by the PORT environment variable".
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user. Node's base image ships uid/gid 1000 as `node`;
# a dedicated account keeps intent explicit and survives base-image changes.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

WORKDIR /app

# Static assets and the public folder are not traced into the standalone output.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

# Cloud Run runs its own startup/liveness probes and ignores HEALTHCHECK, but
# this makes `docker run` and docker-compose report real health locally.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init as PID 1 -> correct signal handling and graceful shutdown.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
