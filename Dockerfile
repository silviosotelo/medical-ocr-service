# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

# System dependencies for PDF processing
RUN apk add --no-cache \
    poppler-utils \
    curl \
    bash

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# Copy source code
COPY . .

# Copy frontend build from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create required directories
RUN mkdir -p temp logs

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Default port (overridden by docker-compose env)
ENV NODE_ENV=production \
    PORT=13500 \
    TEMP_DIR=/app/temp \
    LOG_DIR=/app/logs

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "server.js"]
