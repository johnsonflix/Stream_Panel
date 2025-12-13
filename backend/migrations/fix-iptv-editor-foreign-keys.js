/**
 * Migration: Fix foreign key references from iptv_editor_playlists_old to iptv_editor_playlists
 *
 * Problem: iptv_editor_users and iptv_sync_logs reference a non-existent table
 * "iptv_editor_playlists_old" when they should reference "iptv_editor_playlists"
 *
 * This is preventing user deletion due to foreign key constraint errors
 */

const db = require('../database-config');

async function migrate() {
    console.log('🔧 Starting foreign key fix migration...');

    try {
        // Disable foreign key constraints temporarily
        await db.query('PRAGMA foreign_keys = OFF');

        // ========== FIX iptv_editor_users TABLE ==========
        console.log('Fixing iptv_editor_users table...');

        // Rename old table
        await db.query('ALTER TABLE iptv_editor_users RENAME TO iptv_editor_users_old');

        // Create new table with correct foreign key
        await db.query(`
            CREATE TABLE iptv_editor_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              iptv_editor_playlist_id INTEGER NOT NULL,

              -- Editor Account Details
              iptv_editor_id INTEGER,
              iptv_editor_username TEXT,
              iptv_editor_password TEXT,

              -- Streaming URLs
              m3u_code TEXT,
              epg_code TEXT,

              -- Sync Status
              expiry_date TEXT,
              max_connections INTEGER DEFAULT 1,
              sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'error')),
              last_sync_time TEXT,

              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now')),

              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (iptv_editor_playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE,
              UNIQUE (user_id, iptv_editor_playlist_id)
            )
        `);

        // Copy data from old table
        await db.query(`
            INSERT INTO iptv_editor_users
            SELECT * FROM iptv_editor_users_old
        `);

        // Drop old table
        await db.query('DROP TABLE iptv_editor_users_old');

        console.log('✅ iptv_editor_users table fixed');

        // ========== FIX iptv_sync_logs TABLE ==========
        console.log('Fixing iptv_sync_logs table...');

        // Rename old table
        await db.query('ALTER TABLE iptv_sync_logs RENAME TO iptv_sync_logs_old');

        // Create new table with correct foreign key
        await db.query(`
            CREATE TABLE iptv_sync_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sync_type TEXT NOT NULL,
              user_id INTEGER,
              iptv_editor_playlist_id INTEGER,
              status TEXT NOT NULL CHECK(status IN ('success', 'error')),
              request_data TEXT,  -- JSON stored as TEXT
              response_data TEXT,  -- JSON stored as TEXT
              error_message TEXT,
              duration_ms INTEGER,
              created_at TEXT DEFAULT (datetime('now')),

              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
              FOREIGN KEY (iptv_editor_playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE SET NULL
            )
        `);

        // Copy data from old table
        await db.query(`
            INSERT INTO iptv_sync_logs
            SELECT * FROM iptv_sync_logs_old
        `);

        // Drop old table
        await db.query('DROP TABLE iptv_sync_logs_old');

        console.log('✅ iptv_sync_logs table fixed');

        // Re-enable foreign key constraints
        await db.query('PRAGMA foreign_keys = ON');

        console.log('✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migrate()
        .then(() => {
            console.log('Migration complete');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration error:', error);
            process.exit(1);
        });
}

module.exports = migrate;
