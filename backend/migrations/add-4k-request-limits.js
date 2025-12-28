/**
 * Migration: Add 4K Request Limits
 *
 * Adds separate request limits for 4K content:
 * - 4K Movies: X movies per Y days
 * - 4K TV Shows: X shows per Y days
 * - 4K TV Seasons: X seasons per Y days
 *
 * These are independent of regular request limits, allowing admins
 * to set more restrictive limits for 4K content.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding 4K request limits...');

    // Columns to add to request_default_permissions
    const defaultColumnsToAdd = [
        { name: 'movie_4k_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'movie_4k_limit_days', type: 'INTEGER DEFAULT 7' },
        { name: 'tv_show_4k_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'tv_show_4k_limit_days', type: 'INTEGER DEFAULT 7' },
        { name: 'tv_season_4k_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'tv_season_4k_limit_days', type: 'INTEGER DEFAULT 7' }
    ];

    // Check existing columns in request_default_permissions
    const defaultTableInfo = db.prepare("PRAGMA table_info(request_default_permissions)").all();
    const defaultColumns = defaultTableInfo.map(col => col.name);

    for (const column of defaultColumnsToAdd) {
        if (!defaultColumns.includes(column.name)) {
            try {
                db.exec(`ALTER TABLE request_default_permissions ADD COLUMN ${column.name} ${column.type}`);
                console.log(`[Migration] Added ${column.name} to request_default_permissions`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${column.name}:`, err.message);
                }
            }
        }
    }

    // Columns to add to request_user_permissions (nullable for user overrides)
    const userColumnsToAdd = [
        { name: 'movie_4k_limit', type: 'INTEGER' },
        { name: 'movie_4k_limit_days', type: 'INTEGER' },
        { name: 'tv_show_4k_limit', type: 'INTEGER' },
        { name: 'tv_show_4k_limit_days', type: 'INTEGER' },
        { name: 'tv_season_4k_limit', type: 'INTEGER' },
        { name: 'tv_season_4k_limit_days', type: 'INTEGER' }
    ];

    // Check existing columns in request_user_permissions
    const userTableInfo = db.prepare("PRAGMA table_info(request_user_permissions)").all();
    const userColumns = userTableInfo.map(col => col.name);

    for (const column of userColumnsToAdd) {
        if (!userColumns.includes(column.name)) {
            try {
                db.exec(`ALTER TABLE request_user_permissions ADD COLUMN ${column.name} ${column.type}`);
                console.log(`[Migration] Added ${column.name} to request_user_permissions`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${column.name}:`, err.message);
                }
            }
        }
    }

    db.close();
    console.log('[Migration] 4K request limits migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
