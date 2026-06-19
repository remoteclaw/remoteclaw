#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm test:docker:live-build
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:live-models
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:live-gateway

export REMOTECLAW_DOCKER_E2E_IMAGE="${REMOTECLAW_DOCKER_E2E_IMAGE:-remoteclaw-docker-e2e:local}"
pnpm test:docker:e2e-build

REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openwebui
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:onboard
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:gateway-network
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-web-search-minimal
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:mcp-channels
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:pi-bundle-mcp-tools
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:cron-mcp-cleanup
pnpm test:docker:qr
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:doctor-switch
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugins
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugin-update
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:config-reload
REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:bundled-channel-deps
pnpm test:docker:cleanup
