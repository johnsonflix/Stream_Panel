/**
 * Migration: Add show_in_dropdown column to media_managers
 *
 * Allows admins to control which tools appear in the Tools dropdown menu
 * without disabling the tool entirely.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding show_in_dropdown column to media_managers...');

    // Check if column already exists
    const columns = db.prepare("PRAGMA table_info(media_managers)").all();
    const hasColumn = columns.some(col => col.name === 'show_in_dropdown');

    if (!hasColumn) {
        // Add column - default to 1 (show in dropdown)
        db.exec(`ALTER TABLE media_managers ADD COLUMN show_in_dropdown INTEGER DEFAULT 1`);
        console.log('[Migration] Added show_in_dropdown column');
    } else {
        console.log('[Migration] show_in_dropdown column already exists');
    }

    db.close();
    console.log('[Migration] Done!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
