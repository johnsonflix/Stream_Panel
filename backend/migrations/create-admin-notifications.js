/**
 * Migration: Create admin_notifications table
 *
 * This migration creates a table for one-time admin notifications
 * that appear as dismissible bubbles when admins are active.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating admin_notifications table...');

    try {
        // Create admin_notifications table
        db.exec(`
            CREATE TABLE IF NOT EXISTS admin_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_read INTEGER DEFAULT 0,
                read_at DATETIME,
                read_by INTEGER
            )
        `);

        // Create index for unread notifications
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
            ON admin_notifications(is_read)
        `);

        console.log('admin_notifications table created successfully');

        // Verify table structure
        const tableInfo = db.prepare("PRAGMA table_info(admin_notifications)").all();
        console.log('\nAdmin notifications table structure:');
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
