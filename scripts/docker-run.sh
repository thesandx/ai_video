#!/usr/bin/env bash
#
# Run the production image locally and wait until it is genuinely healthy.
#
# This is the closest thing to a Cloud Run dry run: same image, same PORT
# handling, same non-root user, same health endpoint.
#
# Usage:
#   ./scripts/docker-run.sh              # image :local on port 8080
#   ./scripts/docker-run.sh v1.2.3       # a specific tag
#   PORT=3001 ./scripts/docker-run.sh    # a different host port
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE_NAME="${IMAGE_NAME:-$(node -p "require('./package.json').name")}"
TAG="${1:-local}"
FULL_TAG="${IMAGE_NAME}:${TAG}"
HOST_PORT="${PORT:-8080}"
CONTAINER_NAME="${IMAGE_NAME}-${TAG//[^a-zA-Z0-9_.-]/-}"

if ! docker image inspect "$FULL_TAG" >/dev/null 2>&1; then
  echo "Image ${FULL_TAG} not found. Build it first:" >&2
  echo "  ./scripts/docker-build.sh ${TAG}" >&2
  exit 1
fi

# Remove a container left over from a previous run.
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "Starting ${FULL_TAG} on http://localhost:${HOST_PORT}"

docker run -d \
  --name "$CONTAINER_NAME" \
  --publish "${HOST_PORT}:8080" \
  --env PORT=8080 \
  --env NODE_ENV=production \
  --env "LOG_LEVEL=${LOG_LEVEL:-info}" \
  $([[ -f .env.local ]] && echo "--env-file .env.local") \
  --read-only \
  --tmpfs /tmp \
  --security-opt no-new-privileges:true \
  "$FULL_TAG" >/dev/null

cleanup_on_failure() {
  echo
  echo "Container logs:" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  echo >&2
  echo "Container left running for inspection. Remove with:" >&2
  echo "  docker rm -f ${CONTAINER_NAME}" >&2
}

echo -n "Waiting for health"
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    echo " — healthy"
    echo
    curl -s "http://localhost:${HOST_PORT}/api/health" | (command -v jq >/dev/null && jq || cat)
    echo
    echo "Open:   http://localhost:${HOST_PORT}"
    echo "Logs:   docker logs -f ${CONTAINER_NAME}"
    echo "Shell:  docker exec -it ${CONTAINER_NAME} sh"
    echo "Stop:   docker rm -f ${CONTAINER_NAME}"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " — failed"
cleanup_on_failure
exit 1
