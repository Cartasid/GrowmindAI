ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest
ARG CACHEBUST=1

# ---------- Stage 1: Frontend builder ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

# Use npm install to ensure architecture-specific dependencies are fetched correctly
# We remove package-lock.json to avoid the npm optional dependencies bug on cross-arch builds
COPY frontend/package.json ./
RUN npm install --omit=dev --audit=audit

COPY frontend/ .
RUN npm run build

# Verify build output
RUN test -d dist && echo "Frontend build successful" || exit 1

# ---------- Stage 2: Runtime image ----------
FROM ${BUILD_FROM} AS runtime

# small no-op that includes build arg to force cache invalidation when changed
RUN echo "CACHEBUST=${CACHEBUST}"

# Install Python and essential tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bash \
    wget && \
    ln -sf python3 /usr/bin/python

# Allow pip to install to system-wide environment (PEP 668)
# This is safe because we are in a dedicated container
ENV PIP_BREAK_SYSTEM_PACKAGES=1

WORKDIR /app

# Upgrade essential Python tools
RUN pip3 install --no-cache-dir --no-warn-script-location \
    --upgrade pip \
    setuptools \
    wheel

# Install Python dependencies
COPY backend/pyproject.toml backend/requirements.txt* ./
RUN pip3 install --no-cache-dir --no-warn-script-location \
    "fastapi>=0.109.0" \
    "uvicorn[standard]>=0.27.0" \
    "httpx>=0.28.0,<0.29.0" \
    "portalocker>=2.8.1" \
    "google-genai>=0.3.0,<1.0.0" \
    "websockets==12.0" \
    "pydantic>=2.9.0"

# Copy backend source
COPY backend/ ./backend/

# Copy runtime configuration
COPY mapping.json ./mapping.json
COPY config.yaml ./config.yaml

# Copy built frontend as FastAPI static files
COPY --from=frontend-builder /frontend/dist ./backend/app/static

# Copy s6-overlay service definition with execute bit
COPY --chmod=755 rootfs/ /

# Health check to detect if service is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

EXPOSE 8080
