/**
 * Migration: Create Media Managers Table
 *
 * Creates table for admin tool configurations (Sonarr, Radarr, qBittorrent, SABnzbd)
 * These are embedded/proxied into the admin portal for easy access.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Creating media_managers table...');

    // Create media_managers table
    db.exec(`
        CREATE TABLE IF NOT EXISTS media_managers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('sonarr', 'radarr', 'qbittorrent', 'sabnzbd')),
            url TEXT NOT NULL,
            api_key TEXT,
            username TEXT,
            password TEXT,
            connection_mode TEXT DEFAULT 'proxy' CHECK(connection_mode IN ('direct', 'proxy')),
            is_enabled INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create index for ordering
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_media_managers_display_order ON media_managers(display_order);
        CREATE INDEX IF NOT EXISTS idx_media_managers_type ON media_managers(type);
        CREATE INDEX IF NOT EXISTS idx_media_managers_is_enabled ON media_managers(is_enabled);
    `);

    db.close();
    console.log('[Migration] Media managers table created successfully!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
