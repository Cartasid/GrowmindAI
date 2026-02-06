ARG BUILD_FROM

# UI build stage
FROM node:20-alpine AS ui
WORKDIR /ui
COPY build-frontend/ /ui/
RUN npm install
RUN rm -rf public && npm run clean && npm run build && cp -f index.html public/index.html

# Runtime stage
FROM $BUILD_FROM
SHELL ["/bin/ash","-o","pipefail","-c"]
RUN apk add --no-cache python3 py3-pip
ENV VENV=/opt/venv
RUN python3 -m venv $VENV
ENV PATH="$VENV/bin:$PATH"

WORKDIR /app
COPY backend/ /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# Static SPA
COPY --from=ui /ui/public/ /app/public/

# s6 services
COPY rootfs/ /

EXPOSE 8099
