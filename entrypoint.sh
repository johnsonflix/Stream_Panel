#!/bin/bash
set -e

echo "🚀 StreamPanel PostgreSQL Edition"
echo "================================="

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-streampanel}" -d "${DB_NAME:-streampanel}" -q; do
    echo "   PostgreSQL is unavailable - sleeping"
    sleep 2
done
echo "✅ PostgreSQL is ready!"

# Check if this is a fresh database (check for users table)
cd /app/backend
TABLE_EXISTS=$(PGPASSWORD="${DB_PASSWORD:-streampanel_secure_password}" psql -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-streampanel}" -d "${DB_NAME:-streampanel}" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');" 2>/dev/null || echo "f")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo "✅ Database already initialized"
    FRESH_INSTALL=false
else
    echo "🔧 Fresh database detected. Schema will be initialized by app.js..."
    FRESH_INSTALL=true
fi

# Create default admin if fresh install (after app.js creates schema)
if [ "$FRESH_INSTALL" = true ]; then
    echo "👤 Will create default admin after schema initialization..."
    export CREATE_DEFAULT_ADMIN=true
fi

# Initialize git for update system (if not already initialized)
if [ ! -d "/app/.git" ]; then
    echo "🔧 Initializing git for update system..."
    cd /app
    git init
    git remote add origin https://github.com/johnsonflix/Stream_Panel.git
    git fetch origin main
    git reset --soft origin/main
    echo "✅ Git initialized for updates!"
else
    echo "✅ Git already initialized"
fi

# ============================================================================
# KOMETA INITIALIZATION
# ============================================================================
KOMETA_APP_DIR="/app/kometa_app"
KOMETA_VERSION_FILE="${KOMETA_APP_DIR}/kometa_version.json"
KOMETA_DATA_DIR="${KOMETA_DATA_DIR:-/app/data/kometa}"

# Ensure Kometa data directory exists
mkdir -p "$KOMETA_DATA_DIR"

# Check if Kometa is installed
if [ -f "$KOMETA_VERSION_FILE" ] && [ -f "$KOMETA_APP_DIR/kometa.py" ]; then
    KOMETA_VERSION=$(cat "$KOMETA_VERSION_FILE" | grep -o '"version":[^,]*' | sed 's/"version":"\([^"]*\)"/\1/')
    echo "✅ Kometa v$KOMETA_VERSION is installed"

    # Install Kometa requirements if requirements.txt exists
    if [ -f "$KOMETA_APP_DIR/requirements.txt" ]; then
        echo "📦 Installing Kometa Python dependencies..."
        pip3 install --break-system-packages -q -r "$KOMETA_APP_DIR/requirements.txt" 2>/dev/null || true
        echo "✅ Kometa dependencies installed"
    fi
else
    echo "ℹ️  Kometa not installed. Install via Settings > Media Apps when ready."
fi

# Start the application
echo ""
echo "🚀 Starting StreamPanel..."
cd /app/backend
exec node --max-old-space-size=4096 app.js
