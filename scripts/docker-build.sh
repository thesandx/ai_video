#!/usr/bin/env bash
#
# Build the production image locally, exactly as CI does.
#
# Usage:
#   ./scripts/docker-build.sh                 # tag :local
#   ./scripts/docker-build.sh v1.2.3          # tag :v1.2.3
#   NO_CACHE=1 ./scripts/docker-build.sh      # force a clean build
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE_NAME="${IMAGE_NAME:-$(node -p "require('./package.json').name")}"
TAG="${1:-local}"
FULL_TAG="${IMAGE_NAME}:${TAG}"

# Stamp the image with the commit it was built from, so a running container can
# always be traced back to source via /api/health.
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  GIT_SHA="${GIT_SHA}-dirty"
fi

BUILD_ARGS=(
  --build-arg "NEXT_PUBLIC_APP_VERSION=${GIT_SHA}"
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:8080}"
)

[[ "${NO_CACHE:-0}" == "1" ]] && BUILD_ARGS+=(--no-cache)

echo "Building ${FULL_TAG} (version ${GIT_SHA})"
echo

docker build "${BUILD_ARGS[@]}" --tag "$FULL_TAG" --progress=plain .

echo
SIZE="$(docker image inspect "$FULL_TAG" --format='{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')"
echo "Built ${FULL_TAG} — ${SIZE}"
echo
echo "Run it:      ./scripts/docker-run.sh ${TAG}"
echo "Inspect it:  docker history ${FULL_TAG}"
