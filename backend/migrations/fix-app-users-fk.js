/**
 * Migration: Fix app_users foreign key references
 *
 * portal_announcements and portal_messages incorrectly reference app_users which doesn't exist.
 * This migration recreates the tables with the correct FK references to owners table.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Fixing app_users foreign key references...');

    try {
        // Disable foreign keys temporarily
        db.pragma('foreign_keys = OFF');

        // Start transaction
        db.exec('BEGIN TRANSACTION');

        // ===== Fix portal_announcements =====
        console.log('\n1. Fixing portal_announcements table...');
        const announcementsData = db.prepare('SELECT * FROM portal_announcements').all();
        console.log(`   Backing up ${announcementsData.length} existing records...`);

        db.exec('DROP TABLE IF EXISTS portal_announcements');

        db.exec(`
            CREATE TABLE portal_announcements (
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
                FOREIGN KEY (created_by) REFERENCES owners(id) ON DELETE SET NULL
            )
        `);

        if (announcementsData.length > 0) {
            const insertAnnouncement = db.prepare(`
                INSERT INTO portal_announcements
                (id, title, message, type, target_audience, is_active, is_dismissible, priority, starts_at, expires_at, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const row of announcementsData) {
                insertAnnouncement.run(
                    row.id,
                    row.title,
                    row.message,
                    row.type,
                    row.target_audience,
                    row.is_active,
                    row.is_dismissible,
                    row.priority,
                    row.starts_at,
                    row.expires_at,
                    row.created_by,
                    row.created_at,
                    row.updated_at
                );
            }
            console.log(`   Restored ${announcementsData.length} records`);
        }

        // ===== Fix portal_messages =====
        console.log('\n2. Fixing portal_messages table...');
        const messagesData = db.prepare('SELECT * FROM portal_messages').all();
        console.log(`   Backing up ${messagesData.length} existing records...`);

        db.exec('DROP TABLE IF EXISTS portal_messages');

        db.exec(`
            CREATE TABLE portal_messages (
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
                FOREIGN KEY (assigned_to) REFERENCES owners(id) ON DELETE SET NULL
            )
        `);

        if (messagesData.length > 0) {
            const insertMessage = db.prepare(`
                INSERT INTO portal_messages
                (id, user_id, subject, message, category, status, priority, assigned_to, admin_notes, resolved_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const row of messagesData) {
                insertMessage.run(
                    row.id,
                    row.user_id,
                    row.subject,
                    row.message,
                    row.category,
                    row.status,
                    row.priority,
                    row.assigned_to,
                    row.admin_notes,
                    row.resolved_at,
                    row.created_at,
                    row.updated_at
                );
            }
            console.log(`   Restored ${messagesData.length} records`);
        }

        // Commit transaction
        db.exec('COMMIT');

        // Re-enable foreign keys
        db.pragma('foreign_keys = ON');

        console.log('\nMigration completed successfully!');
        console.log('portal_announcements and portal_messages tables fixed.');

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
