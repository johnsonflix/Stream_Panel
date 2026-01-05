/**
 * Migration: Add icon_url column to media_managers table
 *
 * Allows custom logo URLs for each tool, overriding the default icons.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding icon_url column to media_managers...');

    // Check if column already exists
    const columns = db.prepare("PRAGMA table_info(media_managers)").all();
    const hasIconUrl = columns.some(col => col.name === 'icon_url');

    if (hasIconUrl) {
        console.log('[Migration] icon_url column already exists, skipping');
        db.close();
        return;
    }

    // Add icon_url column
    db.exec(`ALTER TABLE media_managers ADD COLUMN icon_url TEXT`);

    console.log('[Migration] icon_url column added successfully!');
    db.close();
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
