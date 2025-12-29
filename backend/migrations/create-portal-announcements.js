/**
 * Migration: Create portal_announcements table
 *
 * This migration creates a table for portal announcements/notifications
 * that can be targeted to specific user types (plex, iptv, all).
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating portal_announcements table...');

    try {
        // Create portal_announcements table
        db.exec(`
            CREATE TABLE IF NOT EXISTS portal_announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'error')),
                target_audience TEXT NOT NULL DEFAULT 'all' CHECK(target_audience IN ('all', 'plex', 'iptv', 'plex_only', 'iptv_only')),
                is_active INTEGER DEFAULT 1,
                is_dismissible INTEGER DEFAULT 1,
                priority INTEGER DEFAULT 0,
                starts_at DATETIME,
                expires_at DATETIME,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
            )
        `);

        // Create indexes
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_announcements_active
            ON portal_announcements(is_active)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_announcements_target
            ON portal_announcements(target_audience)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_portal_announcements_dates
            ON portal_announcements(starts_at, expires_at)
        `);

        console.log('portal_announcements table created successfully');

        // Create portal_announcement_dismissals table to track which users dismissed which announcements
        db.exec(`
            CREATE TABLE IF NOT EXISTS portal_announcement_dismissals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                announcement_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (announcement_id) REFERENCES portal_announcements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(announcement_id, user_id)
            )
        `);

        console.log('portal_announcement_dismissals table created successfully');

        // Verify table structure
        const tableInfo = db.prepare("PRAGMA table_info(portal_announcements)").all();
        console.log('\nAnnouncements table structure:');
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
