/**
 * Migration: Add rs_has_access column to users table
 *
 * This column controls user-level access to the Request Site (Discover/Request sections).
 * Values:
 *   NULL = Auto (Plex enabled = yes, IPTV-only = no)
 *   1 = Explicitly enabled
 *   0 = Explicitly disabled
 */

const Database = require('better-sqlite3');
const path = require('path');

// Use correct path: /app/data/subsapp_v2.db (not /app/backend/data/)
const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    console.log('[Migration] Adding rs_has_access column to users table...');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    try {
        // Check if column already exists
        const columns = db.prepare("PRAGMA table_info(users)").all();
        const hasColumn = columns.some(col => col.name === 'rs_has_access');

        if (hasColumn) {
            console.log('[Migration] rs_has_access column already exists, skipping');
            db.close();
            return;
        }

        // Add the column with NULL default (auto-determine based on services)
        db.exec(`
            ALTER TABLE users ADD COLUMN rs_has_access INTEGER DEFAULT NULL
        `);

        console.log('[Migration] rs_has_access column added successfully');

        // Set default values for existing users based on their current services
        // Plex users get access, IPTV-only users don't
        const result = db.prepare(`
            UPDATE users
            SET rs_has_access = CASE
                WHEN plex_enabled = 1 THEN 1
                ELSE 0
            END
            WHERE rs_has_access IS NULL
        `).run();

        console.log(`[Migration] Set rs_has_access for ${result.changes} existing users`);

    } catch (error) {
        console.error('[Migration] Error adding rs_has_access column:', error.message);
    } finally {
        db.close();
    }
}

// Run migration
migrate();
