/**
 * Migration: Fix portal_service_requests foreign key
 *
 * The table incorrectly references app_users which doesn't exist.
 * App users are stored in the users table with is_app_user = 1.
 * This migration recreates the table with the correct FK.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

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

        // Create new table with correct FK (users instead of app_users) and ALL columns
        db.exec(`
            CREATE TABLE portal_service_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                service_type TEXT NOT NULL,
                subscription_plan_id INTEGER,
                request_type TEXT NOT NULL DEFAULT 'new_service',
                payment_status TEXT NOT NULL DEFAULT 'pending',
                transaction_reference TEXT,
                user_notes TEXT,
                admin_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                processed_by INTEGER,
                notified_at DATETIME,
                details TEXT,
                status TEXT DEFAULT 'pending',
                handled_by INTEGER,
                handled_at DATETIME,
                provisioning_status TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id),
                FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Restore data if any
        if (existingData.length > 0) {
            const insertStmt = db.prepare(`
                INSERT INTO portal_service_requests
                (id, user_id, service_type, subscription_plan_id, request_type, payment_status,
                 transaction_reference, user_notes, admin_notes, created_at, updated_at,
                 processed_at, processed_by, notified_at, details, status, handled_by, handled_at, provisioning_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const row of existingData) {
                insertStmt.run(
                    row.id,
                    row.user_id,
                    row.service_type,
                    row.subscription_plan_id || null,
                    row.request_type || 'new_service',
                    row.payment_status || 'pending',
                    row.transaction_reference || null,
                    row.user_notes || null,
                    row.admin_notes || null,
                    row.created_at,
                    row.updated_at,
                    row.processed_at || null,
                    row.processed_by || null,
                    row.notified_at || null,
                    row.details || null,
                    row.status || 'pending',
                    row.handled_by || null,
                    row.handled_at || null,
                    row.provisioning_status || null
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
