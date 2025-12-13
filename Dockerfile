# StreamPanel Production Dockerfile
FROM node:20-slim

# Install Python, build tools, sqlite3, and git for updates
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-requests \
    build-essential \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages plexapi

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY backend/package*.json ./backend/

# Install dependencies
WORKDIR /app/backend
RUN npm ci --only=production

# Copy backend source
WORKDIR /app
COPY backend/ ./backend/

# Copy frontend
COPY frontend/ ./frontend/

# Copy database schema
COPY database/ ./database/

# Copy Python services
COPY plex_service_v2.py ./
COPY plex_watch_statistics.py ./
COPY plex_resource_monitor.py ./

# Copy version info
COPY version.json ./

# Create necessary directories
RUN mkdir -p /app/backend/logs /app/backend/uploads/branding /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3050
ENV PYTHON_PATH=python3

# Create .env file with defaults (will be overridden by docker-compose)
RUN cp /app/backend/.env.example /app/backend/.env 2>/dev/null || true

# Copy entrypoint script and fix line endings
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3050

# Use entrypoint to auto-initialize database on first run
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
