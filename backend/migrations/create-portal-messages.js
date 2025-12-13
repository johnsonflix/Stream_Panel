/**
 * Migration: Create portal_messages table
 *
 * This migration creates a table for user support messages/requests
 * sent from the portal to admins.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating portal_messages table...');

    try {
        // Create portal_messages table
        db.exec(`
            CREATE TABLE IF NOT EXISTS portal_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general', 'billing', 'technical', 'cancel_request', 'add_service')),
                status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'read', 'in_progress', 'resolved', 'closed')),
                priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
                assigned_to INTEGER,
                admin_notes TEXT,
                resolved_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_to) REFERENCES app_users(id) ON DELETE SET NULL
            )
        `);

        // Create indexes
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_messages_user
            ON portal_messages(user_id)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_messages_status
            ON portal_messages(status)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_messages_category
            ON portal_messages(category)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_messages_created
            ON portal_messages(created_at)
        `);

        console.log('portal_messages table created successfully');

        // Create portal_service_requests table for add/cancel service requests
        db.exec(`
            CREATE TABLE IF NOT EXISTS portal_service_requests (
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
                FOREIGN KEY (handled_by) REFERENCES app_users(id) ON DELETE SET NULL
            )
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_service_requests_user
            ON portal_service_requests(user_id)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_service_requests_status
            ON portal_service_requests(status)
        `);

        console.log('portal_service_requests table created successfully');

        // Verify table structure
        const tableInfo = db.prepare("PRAGMA table_info(portal_messages)").all();
        console.log('\nMessages table structure:');
        tableInfo.forEach(col => {
            console.log(`  - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
        });

        db.close();
        console.log('\nMigration completed successfully!');

    } catch (error) {
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
