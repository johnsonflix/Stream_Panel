#!/bin/bash
set -e

# Check if database exists and has tables
DB_PATH="${DB_PATH:-/app/data/subsapp_v2.db}"
RUN_SETUP=false

if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
    echo "🔧 Database not found or empty. Initializing fresh database..."
    cd /app/backend
    node setup-sqlite.js
    RUN_SETUP=true
    echo "✅ Database initialized successfully!"
else
    # Check if tables exist
    TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" 2>/dev/null || echo "0")
    if [ "$TABLE_COUNT" -eq "0" ]; then
        echo "🔧 Database exists but has no tables. Running setup..."
        cd /app/backend
        node setup-sqlite.js
        RUN_SETUP=true
        echo "✅ Database initialized successfully!"
    else
        echo "✅ Database already initialized with $TABLE_COUNT tables"
    fi
fi

# Always run migrations (they're idempotent - safe to run multiple times)
echo "🔄 Running migrations..."
cd /app/backend/migrations
for f in *.js; do
    echo "  Running $f..."
    node "$f" 2>/dev/null || true
done
echo "✅ Migrations completed!"

# Create default admin only if setup was run
if [ "$RUN_SETUP" = true ]; then

    # Create default admin using Node.js for proper bcrypt hashing
    echo "👤 Creating default admin..."
    cd /app/backend
    node -e "
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || '/app/data/subsapp_v2.db');

const hash = bcrypt.hashSync('admin', 10);
try {
    db.prepare(\`
        INSERT INTO users (name, email, password_hash, role, is_app_user, is_active, created_at, updated_at)
        VALUES ('Admin', 'admin@streampanel.local', ?, 'admin', 1, 1, datetime('now'), datetime('now'))
    \`).run(hash);
    console.log('✅ Default admin created!');
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║     DEFAULT ADMIN CREDENTIALS              ║');
    console.log('║                                            ║');
    console.log('║     Email: admin@streampanel.local         ║');
    console.log('║     Password: admin                        ║');
    console.log('║                                            ║');
    console.log('║  ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!     ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
} catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
        console.log('✅ Admin already exists');
    } else {
        console.error('Error creating admin:', err.message);
    }
}
db.close();
"
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
# Version file stored in kometa_app so it persists across container rebuilds
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
echo "🚀 Starting StreamPanel..."
cd /app/backend
exec node --max-old-space-size=4096 app.js
