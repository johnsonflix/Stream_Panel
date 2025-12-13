/**
 * Migration: Create portal_sessions table
 *
 * This migration creates a separate sessions table for the end-user portal.
 * Portal sessions are separate from admin sessions for security.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating portal_sessions table...');

    try {
        // Create portal_sessions table
        db.exec(`
            CREATE TABLE IF NOT EXISTS portal_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                login_method TEXT NOT NULL DEFAULT 'iptv',
                plex_token TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create index for faster token lookups
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_sessions_token
            ON portal_sessions(token)
        `);

        // Create index for user sessions
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_sessions_user
            ON portal_sessions(user_id)
        `);

        // Create index for cleanup queries
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires
            ON portal_sessions(expires_at)
        `);

        console.log('portal_sessions table created successfully');

        // Verify table structure
        const tableInfo = db.prepare("PRAGMA table_info(portal_sessions)").all();
        console.log('Table structure:');
        tableInfo.forEach(col => {
            console.log(`  - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
        });

        db.close();
        console.log('Migration completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
