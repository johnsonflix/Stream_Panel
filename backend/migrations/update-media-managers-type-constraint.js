/**
 * Migration: Update Media Managers Type Constraint
 *
 * Adds 'other_arr' and 'other' to the allowed types in media_managers table.
 * SQLite requires recreating the table to modify CHECK constraints.
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Updating media_managers type constraint...');

    // Check if table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_managers'").get();
    if (!tableExists) {
        console.log('[Migration] media_managers table does not exist, skipping');
        db.close();
        return;
    }

    // Check if constraint already allows new types by trying to see the table structure
    // We'll just recreate to be safe
    try {
        db.exec('BEGIN TRANSACTION');

        // 1. Create new table with updated constraint
        db.exec(`
            CREATE TABLE media_managers_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('sonarr', 'radarr', 'qbittorrent', 'sabnzbd', 'other_arr', 'other')),
                url TEXT NOT NULL,
                api_key TEXT,
                username TEXT,
                password TEXT,
                connection_mode TEXT DEFAULT 'proxy' CHECK(connection_mode IN ('direct', 'proxy')),
                is_enabled INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                icon_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Copy data from old table
        db.exec(`
            INSERT INTO media_managers_new (id, name, type, url, api_key, username, password, connection_mode, is_enabled, display_order, icon_url, created_at, updated_at)
            SELECT id, name, type, url, api_key, username, password, connection_mode, is_enabled, display_order, icon_url, created_at, updated_at
            FROM media_managers
        `);

        // 3. Drop old table
        db.exec('DROP TABLE media_managers');

        // 4. Rename new table
        db.exec('ALTER TABLE media_managers_new RENAME TO media_managers');

        // 5. Recreate indexes
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_media_managers_display_order ON media_managers(display_order);
            CREATE INDEX IF NOT EXISTS idx_media_managers_type ON media_managers(type);
            CREATE INDEX IF NOT EXISTS idx_media_managers_is_enabled ON media_managers(is_enabled);
        `);

        db.exec('COMMIT');
        console.log('[Migration] media_managers type constraint updated successfully!');
    } catch (error) {
        db.exec('ROLLBACK');
        console.error('[Migration] Error updating media_managers:', error.message);
        throw error;
    }

    db.close();
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
