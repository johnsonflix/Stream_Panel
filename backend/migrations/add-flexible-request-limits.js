/**
 * Migration: Add Flexible Request Limits
 *
 * Replaces simple "per week" limits with configurable time periods:
 * - Movies: X movies per Y days
 * - TV Shows: X shows per Y days (regardless of seasons)
 * - TV Seasons: X seasons per Y days (total across all shows)
 *
 * This allows admins to set limits like:
 * - "5 movies per 30 days"
 * - "3 shows per 7 days"
 * - "10 seasons per 14 days"
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding flexible request limits...');

    // Columns to add to request_default_permissions
    const defaultColumnsToAdd = [
        { name: 'movie_limit_days', type: 'INTEGER DEFAULT 7' },
        { name: 'tv_show_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'tv_show_limit_days', type: 'INTEGER DEFAULT 7' },
        { name: 'tv_season_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'tv_season_limit_days', type: 'INTEGER DEFAULT 7' }
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

    // Migrate existing tv_limit_per_week to tv_show_limit (if tv_show_limit is 0)
    try {
        db.exec(`
            UPDATE request_default_permissions
            SET tv_show_limit = tv_limit_per_week, tv_show_limit_days = 7
            WHERE tv_limit_per_week > 0 AND (tv_show_limit IS NULL OR tv_show_limit = 0)
        `);
        console.log('[Migration] Migrated existing tv_limit_per_week to tv_show_limit');
    } catch (err) {
        console.log('[Migration] Note:', err.message);
    }

    // Columns to add to request_user_permissions
    const userColumnsToAdd = [
        { name: 'movie_limit_days', type: 'INTEGER' },
        { name: 'tv_show_limit', type: 'INTEGER' },
        { name: 'tv_show_limit_days', type: 'INTEGER' },
        { name: 'tv_season_limit', type: 'INTEGER' },
        { name: 'tv_season_limit_days', type: 'INTEGER' }
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

    // Migrate existing tv_limit_per_week to tv_show_limit for user permissions
    try {
        db.exec(`
            UPDATE request_user_permissions
            SET tv_show_limit = tv_limit_per_week, tv_show_limit_days = 7
            WHERE tv_limit_per_week > 0 AND (tv_show_limit IS NULL OR tv_show_limit = 0)
        `);
        console.log('[Migration] Migrated existing user tv_limit_per_week to tv_show_limit');
    } catch (err) {
        console.log('[Migration] Note:', err.message);
    }

    db.close();
    console.log('[Migration] Flexible request limits migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
