FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 python3-pytest python3-venv \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

WORKDIR /workspace
ENV HOME=/tmp \
    TMPDIR=/tmp \
    npm_config_cache=/tmp/npm-cache \
    PNPM_HOME=/tmp/pnpm

