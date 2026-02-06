ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest

# ---------- Stage 1: Frontend builder ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

# Use npm ci for reproducible builds (strict lockfile)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev --audit=audit

COPY frontend/ .
RUN npm run build

# Verify build output
RUN test -d dist && echo "Frontend build successful" || exit 1

# ---------- Stage 2: Runtime image ----------
FROM ${BUILD_FROM} AS runtime

# Install Python and essential tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bash \
    wget && \
    ln -sf python3 /usr/bin/python

WORKDIR /app

# Install Python dependencies with exact pinned versions
# Create a virtual environment to avoid PEP 668 issues
RUN python3 -m venv /app/venv

# Use the venv pip directly with full path
RUN /app/venv/bin/pip3 install --no-cache-dir --no-warn-script-location \
    --upgrade pip \
    setuptools \
    wheel

# Create constraints file for reproducible builds
COPY backend/pyproject.toml backend/requirements.txt* ./
RUN /app/venv/bin/pip3 install --no-cache-dir --no-warn-script-location \
    "fastapi==0.109.0" \
    "uvicorn[standard]==0.27.0" \
    "httpx==0.26.0" \
    "portalocker==2.8.1" \
    "google-genai==0.3.0" \
    "websockets==12.0"

# Copy backend source
COPY backend/ ./backend/

# Copy runtime configuration
COPY mapping.json ./mapping.json
COPY config.yaml ./config.yaml

# Copy built frontend as FastAPI static files
COPY --from=frontend-builder /frontend/dist ./backend/app/static

# Copy s6-overlay service definition with execute bit
COPY --chmod=755 rootfs/ /

# Set environment variables for venv
ENV PATH="/app/venv/bin:$PATH"
ENV VIRTUAL_ENV=/app/venv

# Health check to detect if service is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

EXPOSE 8080
