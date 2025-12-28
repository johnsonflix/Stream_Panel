/**
 * Migration: Fix Request User Permissions Foreign Key
 *
 * Recreates request_user_permissions table with correct FK reference to users table
 * instead of the non-existent app_users table.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Fixing request_user_permissions foreign key...');

    try {
        // Check if the table exists and has the wrong FK
        const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='request_user_permissions'").get();

        if (tableInfo && tableInfo.sql && tableInfo.sql.includes('app_users')) {
            console.log('[Migration] Found incorrect FK reference to app_users, recreating table...');

            // Backup existing data
            const existingData = db.prepare('SELECT * FROM request_user_permissions').all();
            console.log(`[Migration] Backing up ${existingData.length} existing records...`);

            // Drop old table and index
            db.exec('DROP INDEX IF EXISTS idx_request_user_permissions_user_id');
            db.exec('DROP TABLE IF EXISTS request_user_permissions');

            // Recreate table with correct FK
            db.exec(`
                CREATE TABLE request_user_permissions (
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

            // Recreate index
            db.exec(`
                CREATE INDEX idx_request_user_permissions_user_id
                ON request_user_permissions(user_id)
            `);

            // Restore data if any
            if (existingData.length > 0) {
                const insertStmt = db.prepare(`
                    INSERT INTO request_user_permissions (
                        user_id, has_custom_permissions, can_request_movies, can_request_tv,
                        can_request_4k, auto_approve_movies, auto_approve_tv,
                        movie_limit_per_week, tv_limit_per_week, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const row of existingData) {
                    try {
                        insertStmt.run(
                            row.user_id,
                            row.has_custom_permissions,
                            row.can_request_movies,
                            row.can_request_tv,
                            row.can_request_4k,
                            row.auto_approve_movies,
                            row.auto_approve_tv,
                            row.movie_limit_per_week,
                            row.tv_limit_per_week,
                            row.created_at,
                            row.updated_at
                        );
                    } catch (err) {
                        console.log(`[Migration] Skipped invalid record for user_id ${row.user_id}: ${err.message}`);
                    }
                }
                console.log(`[Migration] Restored ${existingData.length} records`);
            }

            console.log('[Migration] Table recreated with correct FK');
        } else {
            console.log('[Migration] Table already has correct FK or does not exist');
        }
    } catch (err) {
        console.error('[Migration] Error:', err.message);
    }

    db.close();
    console.log('[Migration] Request permissions FK fix complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
