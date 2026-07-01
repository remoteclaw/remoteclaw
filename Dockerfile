# Opt-in extension dependencies at build time (space-separated directory names).
# Example: docker build --build-arg REMOTECLAW_EXTENSIONS="diagnostics-otel matrix" .
#
# Multi-stage build produces a minimal runtime image without build tools,
# source code, or Bun. Works with Docker, Buildx, and Podman.
# The ext-deps stage extracts only the package.json files we need from
# extensions/, so the main build layer is not invalidated by unrelated
# extension source changes.
#
# Two runtime variants:
#   Default (bookworm):      docker build .
#   Slim (bookworm-slim):    docker build --build-arg REMOTECLAW_VARIANT=slim .
ARG REMOTECLAW_EXTENSIONS=""
ARG REMOTECLAW_VARIANT=default
ARG REMOTECLAW_NODE_BOOKWORM_IMAGE="node:22-bookworm@sha256:b501c082306a4f528bc4038cbf2fbb58095d583d0419a259b2114b5ac53d12e9"
ARG REMOTECLAW_NODE_BOOKWORM_DIGEST="sha256:b501c082306a4f528bc4038cbf2fbb58095d583d0419a259b2114b5ac53d12e9"
ARG REMOTECLAW_NODE_BOOKWORM_SLIM_IMAGE="node:22-bookworm-slim@sha256:9c2c405e3ff9b9afb2873232d24bb06367d649aa3e6259cbe314da59578e81e9"
ARG REMOTECLAW_NODE_BOOKWORM_SLIM_DIGEST="sha256:9c2c405e3ff9b9afb2873232d24bb06367d649aa3e6259cbe314da59578e81e9"

# Base images are pinned to SHA256 digests for reproducible builds.
# Trade-off: digests must be updated manually when upstream tags move.
# To update, run: docker manifest inspect node:22-bookworm (or podman)
# and replace the digest below with the current multi-arch manifest list entry.

FROM ${REMOTECLAW_NODE_BOOKWORM_IMAGE} AS ext-deps
ARG REMOTECLAW_EXTENSIONS
# Copy package.json for opted-in extensions so pnpm resolves their deps.
RUN --mount=type=bind,source=extensions,target=/tmp/extensions,readonly \
    mkdir -p /out && \
    for ext in $REMOTECLAW_EXTENSIONS; do \
      if [ -f "/tmp/extensions/$ext/package.json" ]; then \
        mkdir -p "/out/$ext" && \
        cp "/tmp/extensions/$ext/package.json" "/out/$ext/package.json"; \
      fi; \
    done

# ── Stage 2: Build ──────────────────────────────────────────────
FROM ${REMOTECLAW_NODE_BOOKWORM_IMAGE} AS build

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

COPY --from=ext-deps /out/ ./extensions/

# Reduce OOM risk on low-memory hosts during dependency installation.
# Docker builds on small VMs may otherwise fail with "Killed" (exit 137).
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm install --frozen-lockfile

COPY . .

# A2UI bundle may fail under QEMU cross-compilation (e.g. building amd64
# on Apple Silicon). CI builds natively per-arch so this is a no-op there.
# Stub it so local cross-arch builds still succeed.
RUN pnpm canvas:a2ui:bundle || \
    (echo "A2UI bundle: creating stub (non-fatal)" && \
     mkdir -p src/canvas-host/a2ui && \
     echo "/* A2UI bundle unavailable in this build */" > src/canvas-host/a2ui/a2ui.bundle.js && \
     echo "stub" > src/canvas-host/a2ui/.bundle.hash && \
     rm -rf vendor/a2ui apps/shared/RemoteClawKit/Tools/CanvasA2UI)
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV REMOTECLAW_PREFER_PNPM=1
RUN pnpm ui:build

# ── Prune runtime dependencies ──────────────────────────────────
FROM build AS runtime-assets
RUN CI=true pnpm prune --prod

# ── Runtime base images ─────────────────────────────────────────
FROM ${REMOTECLAW_NODE_BOOKWORM_IMAGE} AS base-default
ARG REMOTECLAW_NODE_BOOKWORM_DIGEST
LABEL org.opencontainers.image.base.name="docker.io/library/node:22-bookworm" \
  org.opencontainers.image.base.digest="${REMOTECLAW_NODE_BOOKWORM_DIGEST}"

FROM ${REMOTECLAW_NODE_BOOKWORM_SLIM_IMAGE} AS base-slim
ARG REMOTECLAW_NODE_BOOKWORM_SLIM_DIGEST
LABEL org.opencontainers.image.base.name="docker.io/library/node:22-bookworm-slim" \
  org.opencontainers.image.base.digest="${REMOTECLAW_NODE_BOOKWORM_SLIM_DIGEST}"

# ── Stage 3: Runtime ────────────────────────────────────────────
FROM base-${REMOTECLAW_VARIANT}
ARG REMOTECLAW_VARIANT

# OCI base-image metadata for downstream image consumers.
LABEL org.opencontainers.image.source="https://github.com/remoteclaw/remoteclaw" \
  org.opencontainers.image.url="https://remoteclaw.org" \
  org.opencontainers.image.documentation="https://docs.remoteclaw.org/install/docker" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.title="RemoteClaw" \
  org.opencontainers.image.description="RemoteClaw gateway and CLI runtime container image"

WORKDIR /app

# Install system utilities present in bookworm but missing in bookworm-slim.
# On the full bookworm image these are already installed (apt-get is a no-op).
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      procps hostname curl git openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN chown node:node /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=runtime-assets --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json .
COPY --from=build --chown=node:node /app/remoteclaw.mjs .
COPY --from=build --chown=node:node /app/extensions ./extensions
COPY --from=build --chown=node:node /app/skills ./skills
COPY --from=build --chown=node:node /app/docs ./docs

# Docker live-test runners invoke `pnpm` inside the runtime image.
# Activate the exact pinned package manager now so the container does not
# rely on a first-run network fetch or missing shims under the non-root user.
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && \
    corepack prepare "$(node -p "require('./package.json').packageManager")" --activate

# Install additional system packages needed by your skills or extensions.
# Example: docker build --build-arg REMOTECLAW_DOCKER_APT_PACKAGES="python3 wget" .
ARG REMOTECLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$REMOTECLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $REMOTECLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Optionally install Xvfb for headed Chrome attached over CDP.
# Build with: docker build --build-arg REMOTECLAW_INSTALL_BROWSER=1 ...
ARG REMOTECLAW_INSTALL_BROWSER=""
RUN if [ -n "$REMOTECLAW_INSTALL_BROWSER" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Normalize extension paths so plugin safety checks do not reject
# world-writable directories inherited from source file modes.
RUN for dir in /app/extensions /app/.agent /app/.agents; do \
      if [ -d "$dir" ]; then \
        find "$dir" -type d -exec chmod 755 {} +; \
        find "$dir" -type f -exec chmod 644 {} +; \
      fi; \
    done

# Expose the CLI binary without requiring npm global writes as non-root.
RUN ln -sf /app/remoteclaw.mjs /usr/local/bin/remoteclaw \
 && chmod 755 /app/remoteclaw.mjs

ENV NODE_ENV=production

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

# Start gateway server with default config.
# Binds to loopback (127.0.0.1) by default for security.
#
# For container platforms requiring external health checks:
#   1. Set REMOTECLAW_GATEWAY_TOKEN or REMOTECLAW_GATEWAY_PASSWORD env var
#   2. Override CMD: ["node","remoteclaw.mjs","gateway","--allow-unconfigured","--bind","lan"]
HEALTHCHECK --interval=3m --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18789/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "remoteclaw.mjs", "gateway", "--allow-unconfigured"]
