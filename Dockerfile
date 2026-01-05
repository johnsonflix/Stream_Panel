# StreamPanel Production Dockerfile
FROM node:22-slim

# Install Python, build tools, git, rsync, and Kometa dependencies
# PostgreSQL client library (libpq) for pg npm package
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-requests \
    python3-lxml \
    build-essential \
    libpq-dev \
    postgresql-client \
    git \
    curl \
    unzip \
    rsync \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages plexapi \
    && npm install -g pnpm@9

# Install Kometa Python dependencies (pre-install common ones for faster startup)
# Full requirements will be installed when Kometa is downloaded
RUN pip3 install --break-system-packages \
    lxml \
    ruamel.yaml \
    schedule \
    tmdbapis \
    arrapi \
    GitPython \
    num2words \
    pillow \
    requests \
    retrying \
    pathvalidate \
    psutil \
    python-dateutil \
    python-dotenv

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY backend/package*.json ./backend/

# Install dependencies
WORKDIR /app/backend
RUN npm install --omit=dev

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

# Create necessary directories (including Kometa directories)
RUN mkdir -p /app/backend/logs /app/backend/uploads/branding /app/data /app/data/kometa /app/kometa_app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3050
ENV PYTHON_PATH=python3
ENV KOMETA_DATA_DIR=/app/data/kometa

# Create .env file with defaults (will be overridden by docker-compose)
RUN cp /app/backend/.env.example /app/backend/.env 2>/dev/null || true

# Copy entrypoint script and fix line endings
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3050

# Use entrypoint to auto-initialize database on first run
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
