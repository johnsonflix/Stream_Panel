/**
 * Migration: Create Request Site Permissions Tables
 *
 * Creates tables for managing user permissions in the Request Site:
 * - request_default_permissions: Default settings for all users
 * - request_user_permissions: Per-user overrides
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Creating request permissions tables...');

    // Create default permissions table (single row)
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_default_permissions (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            can_request_movies INTEGER DEFAULT 1,
            can_request_tv INTEGER DEFAULT 1,
            can_request_4k INTEGER DEFAULT 0,
            auto_approve_movies INTEGER DEFAULT 0,
            auto_approve_tv INTEGER DEFAULT 0,
            movie_limit_per_week INTEGER DEFAULT 0,
            tv_limit_per_week INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default row if not exists
    db.exec(`
        INSERT OR IGNORE INTO request_default_permissions (id)
        VALUES (1)
    `);

    console.log('[Migration] Created request_default_permissions table');

    // Create per-user permissions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_user_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            has_custom_permissions INTEGER DEFAULT 0,
            can_request_movies INTEGER,
            can_request_tv INTEGER,
            can_request_4k INTEGER,
            auto_approve_movies INTEGER,
            auto_approve_tv INTEGER,
            movie_limit_per_week INTEGER,
            tv_limit_per_week INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    console.log('[Migration] Created request_user_permissions table');

    // Create index for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_request_user_permissions_user_id
        ON request_user_permissions(user_id)
    `);

    db.close();
    console.log('[Migration] Request permissions migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
