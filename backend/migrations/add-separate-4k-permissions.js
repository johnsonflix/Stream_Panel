/**
 * Migration: Add Separate 4K Permissions for Movies vs TV
 *
 * Splits the single can_request_4k permission into:
 * - can_request_4k_movie: Permission to request 4K movies
 * - can_request_4k_tv: Permission to request 4K TV shows
 *
 * This allows admins to grant 4K movie access without 4K TV access (or vice versa).
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding separate 4K permissions for movies vs TV...');

    // Add columns to request_default_permissions
    const defaultTableInfo = db.prepare("PRAGMA table_info(request_default_permissions)").all();
    const defaultColumns = defaultTableInfo.map(col => col.name);

    if (!defaultColumns.includes('can_request_4k_movie')) {
        try {
            db.exec(`ALTER TABLE request_default_permissions ADD COLUMN can_request_4k_movie INTEGER DEFAULT 0`);
            console.log('[Migration] Added can_request_4k_movie to request_default_permissions');

            // Migrate existing can_request_4k value to both new columns
            db.exec(`UPDATE request_default_permissions SET can_request_4k_movie = can_request_4k WHERE can_request_4k IS NOT NULL`);
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                console.error('[Migration] Error adding can_request_4k_movie:', err.message);
            }
        }
    }

    if (!defaultColumns.includes('can_request_4k_tv')) {
        try {
            db.exec(`ALTER TABLE request_default_permissions ADD COLUMN can_request_4k_tv INTEGER DEFAULT 0`);
            console.log('[Migration] Added can_request_4k_tv to request_default_permissions');

            // Migrate existing can_request_4k value to both new columns
            db.exec(`UPDATE request_default_permissions SET can_request_4k_tv = can_request_4k WHERE can_request_4k IS NOT NULL`);
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                console.error('[Migration] Error adding can_request_4k_tv:', err.message);
            }
        }
    }

    // Add columns to request_user_permissions
    const userTableInfo = db.prepare("PRAGMA table_info(request_user_permissions)").all();
    const userColumns = userTableInfo.map(col => col.name);

    if (!userColumns.includes('can_request_4k_movie')) {
        try {
            db.exec(`ALTER TABLE request_user_permissions ADD COLUMN can_request_4k_movie INTEGER`);
            console.log('[Migration] Added can_request_4k_movie to request_user_permissions');

            // Migrate existing can_request_4k value to both new columns
            db.exec(`UPDATE request_user_permissions SET can_request_4k_movie = can_request_4k WHERE can_request_4k IS NOT NULL`);
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                console.error('[Migration] Error adding can_request_4k_movie:', err.message);
            }
        }
    }

    if (!userColumns.includes('can_request_4k_tv')) {
        try {
            db.exec(`ALTER TABLE request_user_permissions ADD COLUMN can_request_4k_tv INTEGER`);
            console.log('[Migration] Added can_request_4k_tv to request_user_permissions');

            // Migrate existing can_request_4k value to both new columns
            db.exec(`UPDATE request_user_permissions SET can_request_4k_tv = can_request_4k WHERE can_request_4k IS NOT NULL`);
        } catch (err) {
            if (!err.message.includes('duplicate column')) {
                console.error('[Migration] Error adding can_request_4k_tv:', err.message);
            }
        }
    }

    db.close();
    console.log('[Migration] Separate 4K permissions migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
