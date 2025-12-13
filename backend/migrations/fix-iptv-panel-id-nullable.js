/**
 * Fix IPTV Panel ID to be Nullable
 * Playlists can exist without being linked to a panel yet
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');
const db = new Database(dbPath);

console.log('🔄 Making iptv_panel_id nullable...');

try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
    console.log('📋 Recreating table with nullable iptv_panel_id...');

    // Get all existing data
    const existingData = db.prepare('SELECT * FROM iptv_editor_playlists').all();

    // Drop the old table
    db.exec('DROP TABLE IF EXISTS iptv_editor_playlists_old');
    db.exec('ALTER TABLE iptv_editor_playlists RENAME TO iptv_editor_playlists_old');

    // Create new table with nullable iptv_panel_id
    db.exec(`
        CREATE TABLE iptv_editor_playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            playlist_id TEXT UNIQUE NOT NULL,
            iptv_panel_id INTEGER,
            bearer_token TEXT,
            token_expires TEXT,
            max_users INTEGER,
            current_user_count INTEGER DEFAULT 0,
            playlist_settings TEXT,
            is_active INTEGER DEFAULT 1,
            last_sync TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            provider_base_url TEXT DEFAULT '',
            provider_username TEXT DEFAULT '',
            provider_password TEXT DEFAULT '',
            auto_updater_enabled INTEGER DEFAULT 0,
            auto_updater_schedule_hours INTEGER DEFAULT 24,
            last_auto_updater_run TEXT,
            auto_updater_status TEXT DEFAULT 'idle',
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
            last_synced TEXT
        )
    `);

    console.log('✅ New table created');

    // Migrate existing data if any
    if (existingData.length > 0) {
        console.log(`📋 Migrating ${existingData.length} existing records...`);

        const insert = db.prepare(`
            INSERT INTO iptv_editor_playlists (
                id, name, playlist_id, iptv_panel_id, bearer_token, token_expires,
                max_users, current_user_count, playlist_settings, is_active, last_sync,
                created_at, updated_at, provider_base_url, provider_username, provider_password,
                auto_updater_enabled, auto_updater_schedule_hours, last_auto_updater_run,
                auto_updater_status, username, password, m3u_code, epg_code, expiry_date,
                max_connections, customer_count, channel_count, movie_count, series_count,
                patterns, last_synced
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);

        for (const row of existingData) {
            insert.run(
                row.id, row.name, row.playlist_id, row.iptv_panel_id, row.bearer_token, row.token_expires,
                row.max_users, row.current_user_count, row.playlist_settings, row.is_active, row.last_sync,
                row.created_at, row.updated_at, row.provider_base_url, row.provider_username, row.provider_password,
                row.auto_updater_enabled, row.auto_updater_schedule_hours, row.last_auto_updater_run,
                row.auto_updater_status, row.username, row.password, row.m3u_code, row.epg_code, row.expiry_date,
                row.max_connections, row.customer_count, row.channel_count, row.movie_count, row.series_count,
                row.patterns, row.last_synced
            );
        }

        console.log(`✅ Migrated ${existingData.length} records`);
    }

    // Drop old table
    db.exec('DROP TABLE iptv_editor_playlists_old');

    // Commit transaction
    db.exec('COMMIT');

    console.log('✅ iptv_panel_id is now nullable!');
    process.exit(0);

} catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
