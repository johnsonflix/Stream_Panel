#!/bin/bash
set -e

# Initialize git repository for updates
GITHUB_REPO="https://github.com/johnsonflix/Stream_Panel.git"
if [ ! -d "/app/.git" ]; then
    echo "🔧 Initializing git for update system..."
    cd /app
    git init
    git remote add origin "$GITHUB_REPO" 2>/dev/null || git remote set-url origin "$GITHUB_REPO"
    git fetch origin main --depth=1 2>/dev/null || echo "  (Could not fetch from remote)"
    git reset --soft origin/main 2>/dev/null || echo "  (Could not reset to remote)"
    echo "✅ Git initialized for updates"
fi

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

# Run migrations if setup was run
if [ "$RUN_SETUP" = true ]; then
    echo "🔄 Running migrations..."
    cd /app/backend/migrations
    for f in *.js; do
        echo "  Running $f..."
        node "$f" 2>/dev/null || true
    done
    echo "✅ Migrations completed!"

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

# Start the application
echo "🚀 Starting StreamPanel..."
cd /app/backend
exec node app.js
