FROM node:22-bookworm@sha256:cd7bcd2e7a1e6f72052feb023c7f6b722205d3fcab7bbcbd2d1bfdab10b1e935

# OCI base-image metadata for downstream image consumers.
# If you change these annotations, also update:
# - docs/install/docker.md ("Base image metadata" section)
# - https://docs.remoteclaw.com/install/docker
LABEL org.opencontainers.image.base.name="docker.io/library/node:22-bookworm" \
  org.opencontainers.image.base.digest="sha256:cd7bcd2e7a1e6f72052feb023c7f6b722205d3fcab7bbcbd2d1bfdab10b1e935" \
  org.opencontainers.image.source="https://github.com/remoteclaw/remoteclaw" \
  org.opencontainers.image.url="https://remoteclaw.com" \
  org.opencontainers.image.documentation="https://docs.remoteclaw.com/install/docker" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.title="RemoteClaw" \
  org.opencontainers.image.description="RemoteClaw gateway and CLI runtime container image"

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app
RUN chown node:node /app

ARG REMOTECLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$REMOTECLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $REMOTECLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node ui/package.json ./ui/package.json
COPY --chown=node:node patches ./patches
COPY --chown=node:node scripts ./scripts

USER node
# Reduce OOM risk on low-memory hosts during dependency installation.
# Docker builds on small VMs may otherwise fail with "Killed" (exit 137).
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm install --frozen-lockfile

# Optionally install Chromium and Xvfb for browser automation.
# Build with: docker build --build-arg REMOTECLAW_INSTALL_BROWSER=1 ...
# Adds ~300MB but eliminates the 60-90s Playwright install on every container start.
# Must run after pnpm install so playwright-core is available in node_modules.
USER root
ARG REMOTECLAW_INSTALL_BROWSER=""
RUN if [ -n "$REMOTECLAW_INSTALL_BROWSER" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb && \
      mkdir -p /home/node/.cache/ms-playwright && \
      PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
      node /app/node_modules/playwright-core/cli.js install --with-deps chromium && \
      chown -R node:node /home/node/.cache/ms-playwright && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

USER node
COPY --chown=node:node . .
# Normalize copied plugin/agent paths so plugin safety checks do not reject
# world-writable directories inherited from source file modes.
RUN for dir in /app/extensions /app/.agent /app/.agents; do \
      if [ -d "$dir" ]; then \
        find "$dir" -type d -exec chmod 755 {} +; \
        find "$dir" -type f -exec chmod 644 {} +; \
      fi; \
    done
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV REMOTECLAW_PREFER_PNPM=1
RUN pnpm ui:build

# Expose the CLI binary without requiring npm global writes as non-root.
USER root
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
CMD ["node", "remoteclaw.mjs", "gateway", "--allow-unconfigured"]
