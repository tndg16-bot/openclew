# OpenClaw Sandbox Dockerfile
# Phase 1: Secure execution environment for coder-agent

FROM node:20-slim

# Security: Run as non-root user
RUN useradd -m -s /bin/bash sandbox

# Install minimal dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /sandbox

# Create directory structure
RUN mkdir -p /sandbox/workspace /sandbox/output && \
    chown -R sandbox:sandbox /sandbox

# Copy package files (will be mounted at runtime for actual code)
# This is just a placeholder
COPY --chown=sandbox:sandbox . /sandbox/app/

# Security: No network access by default (can be overridden)
# Only allow localhost
ENV NODE_ENV=sandbox

# Switch to non-root user
USER sandbox

# Default command
CMD ["node", "--version"]
