ARG BUILD_FROM

# ---------- Stage 1: Frontend builder ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install

COPY frontend/ .
RUN npm run build

# ---------- Stage 2: Runtime image ----------
FROM ${BUILD_FROM} AS runtime

RUN apk add --no-cache python3 py3-pip bash && \
    ln -sf python3 /usr/bin/python

WORKDIR /app

# Install backend dependencies (explicit)
RUN pip3 install --no-cache-dir --break-system-packages --upgrade pip && \
    pip3 install --no-cache-dir --break-system-packages \
      "fastapi~=0.109" \
      "uvicorn[standard]~=0.27" \
      "httpx~=0.26" \
      "portalocker~=2.8" \
      "google-genai~=0.3" \
      "websockets>=12.0"

# Copy backend source
COPY backend/ ./backend/

# Runtime assets
COPY mapping.json ./mapping.json
# Provide built frontend as FastAPI static files
COPY --from=frontend-builder /frontend/dist /app/backend/app/static

# s6-overlay service definition
COPY rootfs/ /
RUN chmod +x /etc/services.d/growmind/run

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

EXPOSE 8080
