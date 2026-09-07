FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    sudo \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN usermod -u 1000 node 2>/dev/null || true \
    && echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN corepack enable pnpm

ENV NEXT_TELEMETRY_DISABLED=1
