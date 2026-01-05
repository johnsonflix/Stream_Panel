/**
 * IPTV Editor Integration Migration
 * Creates tables for IPTV Editor settings, playlists, and sync logs
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(dbPath);

console.log('🔄 Starting IPTV Editor migration...');

try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Create iptv_editor_settings table
    console.log('📋 Creating iptv_editor_settings table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_editor_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT,
            setting_type TEXT DEFAULT 'string',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Insert default settings
    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO iptv_editor_settings (setting_key, setting_value, setting_type)
        VALUES (?, ?, ?)
    `);

    insertSetting.run('bearer_token', '', 'string');
    insertSetting.run('provider_base_url', '', 'string');
    insertSetting.run('provider_username', '', 'string');
    insertSetting.run('provider_password', '', 'string');
    insertSetting.run('auto_updater_enabled', 'false', 'boolean');
    insertSetting.run('auto_updater_schedule_hours', '24', 'integer');
    insertSetting.run('last_auto_updater_run', '', 'string');
    insertSetting.run('last_sync_time', '', 'string');

    console.log('✅ iptv_editor_settings table created with default values');

    // 2. Create iptv_editor_playlists table
    console.log('📋 Creating iptv_editor_playlists table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_editor_playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            username TEXT,
            password TEXT,
            m3u_code TEXT,
            epg_code TEXT,
            expiry_date TEXT,
            max_connections INTEGER DEFAULT 1,
            customer_count INTEGER DEFAULT 0,
            channel_count INTEGER DEFAULT 0,
            movie_count INTEGER DEFAULT 0,
            series_count INTEGER DEFAULT 0,
            patterns TEXT DEFAULT '[]',
            is_active INTEGER DEFAULT 1,
            last_synced TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    console.log('✅ iptv_editor_playlists table created');

    // 3. Create iptv_sync_logs table
    console.log('📋 Creating iptv_sync_logs table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_type TEXT NOT NULL,
            user_id INTEGER,
            status TEXT NOT NULL,
            request_data TEXT,
            response_data TEXT,
            error_message TEXT,
            duration_ms INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Create index on created_at for faster log queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_iptv_sync_logs_created_at
        ON iptv_sync_logs(created_at)
    `);

    // Create index on sync_type for filtering
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_iptv_sync_logs_sync_type
        ON iptv_sync_logs(sync_type)
    `);

    console.log('✅ iptv_sync_logs table created with indexes');

    // 4. Add iptv_editor_playlist_id column to iptv_panels if table exists
    console.log('📋 Checking for iptv_panels table...');

    // Check if iptv_panels table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='iptv_panels'").all();

    if (tables.length > 0) {
        // Check if column exists
        const tableInfo = db.prepare("PRAGMA table_info(iptv_panels)").all();
        const hasColumn = tableInfo.some(col => col.name === 'iptv_editor_playlist_id');

        if (!hasColumn) {
            db.exec(`
                ALTER TABLE iptv_panels
                ADD COLUMN iptv_editor_playlist_id TEXT
            `);
            console.log('✅ Added iptv_editor_playlist_id column to iptv_panels');
        } else {
            console.log('ℹ️ iptv_editor_playlist_id column already exists in iptv_panels');
        }
    } else {
        console.log('ℹ️ iptv_panels table does not exist yet, skipping column addition');
    }

    // Commit transaction
    db.exec('COMMIT');

    console.log('✅ IPTV Editor migration completed successfully!');
    process.exit(0);

} catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
