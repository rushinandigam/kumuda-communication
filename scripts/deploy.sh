#!/bin/bash
set -e

REBUILD_UI="${1:-true}"
REBUILD_API="${2:-true}"

cd ~/kumuda-communication

echo "==> Pulling latest code..."
git pull origin main

SERVICES_TO_RECREATE=""

if [ "$REBUILD_UI" = "true" ]; then
  echo "==> Rebuilding UI image from source..."
  docker build -t kkconnect-ui:latest -f ui/Dockerfile .
  SERVICES_TO_RECREATE="$SERVICES_TO_RECREATE ui"
fi

if [ "$REBUILD_API" = "true" ]; then
  echo "==> Rebuilding API image from source..."
  docker build -t kkconnect-api:latest -f api/Dockerfile .
  SERVICES_TO_RECREATE="$SERVICES_TO_RECREATE api"
fi

API_RUNNING=$(docker inspect --format='{{.State.Running}}' kumuda-communication-api-1 2>/dev/null || echo "false")
API_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' kumuda-communication-api-1 2>/dev/null || echo "missing")
if [ "$API_RUNNING" != "true" ] || [ "$API_HEALTH" = "unhealthy" ]; then
  echo "==> API container not healthy (running=$API_RUNNING, health=$API_HEALTH) — forcing restart..."
  if ! echo "$SERVICES_TO_RECREATE" | grep -q "api"; then
    SERVICES_TO_RECREATE="$SERVICES_TO_RECREATE api"
  fi
fi

if [ -n "$SERVICES_TO_RECREATE" ]; then
  echo "==> Recreating containers:$SERVICES_TO_RECREATE"
  docker compose up -d --force-recreate $SERVICES_TO_RECREATE
else
  echo "==> No containers to rebuild."
fi

docker network connect kumuda-communication_app-network caddy 2>/dev/null || true

echo "==> Waiting for containers to stabilize..."
sleep 15

API_RUNNING=$(docker inspect --format='{{.State.Running}}' kumuda-communication-api-1 2>/dev/null || echo "false")
if [ "$API_RUNNING" != "true" ]; then
  echo "==> API container crashed! Last 80 lines of logs:"
  docker logs kumuda-communication-api-1 --tail 80 2>&1
  echo ""
  echo "==> DEPLOY FAILED: API container not running"
  exit 1
fi

sleep 15
curl -sf http://localhost:8000/api/v1/health > /dev/null && echo "API: healthy" || echo "API: UNHEALTHY"
curl -sf http://localhost:3010/ > /dev/null && echo "UI: healthy" || echo "UI: UNHEALTHY"

echo "==> Deploy complete!"
