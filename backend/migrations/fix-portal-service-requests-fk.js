/**
 * Migration: Fix portal_service_requests foreign key
 *
 * The table incorrectly references app_users which doesn't exist.
 * App users are stored in the users table with is_app_user = 1.
 * This migration recreates the table with the correct FK.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Fixing portal_service_requests foreign key...');

    try {
        // Disable foreign keys temporarily
        db.pragma('foreign_keys = OFF');

        // Start transaction
        db.exec('BEGIN TRANSACTION');

        // Backup existing data
        const existingData = db.prepare('SELECT * FROM portal_service_requests').all();
        console.log(`Backing up ${existingData.length} existing records...`);

        // Drop old table
        db.exec('DROP TABLE IF EXISTS portal_service_requests');

        // Create new table with correct FK (users instead of app_users)
        db.exec(`
            CREATE TABLE portal_service_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                request_type TEXT NOT NULL CHECK(request_type IN ('add_plex', 'add_iptv', 'cancel_plex', 'cancel_iptv', 'upgrade', 'downgrade')),
                service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv')),
                details TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
                handled_by INTEGER,
                handled_at DATETIME,
                admin_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Restore data if any
        if (existingData.length > 0) {
            const insertStmt = db.prepare(`
                INSERT INTO portal_service_requests
                (id, user_id, request_type, service_type, details, status, handled_by, handled_at, admin_notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const row of existingData) {
                insertStmt.run(
                    row.id,
                    row.user_id,
                    row.request_type,
                    row.service_type,
                    row.details,
                    row.status,
                    row.handled_by,
                    row.handled_at,
                    row.admin_notes,
                    row.created_at,
                    row.updated_at
                );
            }
            console.log(`Restored ${existingData.length} records`);
        }

        // Commit transaction
        db.exec('COMMIT');

        // Re-enable foreign keys
        db.pragma('foreign_keys = ON');

        console.log('portal_service_requests table fixed successfully!');

        db.close();

    } catch (error) {
        db.exec('ROLLBACK');
        console.error('Migration failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
