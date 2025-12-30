/**
 * Migration: Complete the playlist-panel relationship reversal
 * Handles the case where column was already added with wrong type
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(dbPath);

console.log('🔄 Completing playlist-panel relationship reversal...');

try {
    db.exec('BEGIN TRANSACTION');

    // Check current state
    const panelsCols = db.prepare("PRAGMA table_info(iptv_panels)").all();
    const hasPlaylistCol = panelsCols.some(col => col.name === 'iptv_editor_playlist_id');

    if (!hasPlaylistCol) {
        console.log('❌ Column iptv_editor_playlist_id not found. Please run the initial migration first.');
        process.exit(1);
    }

    // Step 1: Check if iptv_panel_id exists in iptv_editor_playlists
    const playlistCols = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const hasOldColumn = playlistCols.some(col => col.name === 'iptv_panel_id');

    if (!hasOldColumn) {
        console.log('✅ Database already in correct state - iptv_panel_id column does not exist');
        console.log('   Skipping migration (already completed or not needed)');
        db.exec('COMMIT');
        process.exit(0);
    }

    // Step 1: Migrate existing relationships from playlists to panels
    console.log('📝 Step 1: Migrating existing relationships...');
    const existingLinks = db.prepare(`
        SELECT id, iptv_panel_id
        FROM iptv_editor_playlists
        WHERE iptv_panel_id IS NOT NULL
    `).all();

    console.log(`   Found ${existingLinks.length} existing playlist→panel links`);

    for (const link of existingLinks) {
        // Update panel to link to this playlist
        db.prepare(`
            UPDATE iptv_panels
            SET iptv_editor_playlist_id = ?
            WHERE id = ?
        `).run(link.id, link.iptv_panel_id);

        console.log(`   ✓ Migrated: Panel ${link.iptv_panel_id} → Playlist ${link.id}`);
    }

    // Step 2: Remove iptv_panel_id column from iptv_editor_playlists
    console.log('📝 Step 2: Removing iptv_panel_id from iptv_editor_playlists...');

    // Get all columns except iptv_panel_id
    const playlistCols = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const columns = playlistCols
        .filter(col => col.name !== 'iptv_panel_id')
        .map(col => col.name)
        .join(', ');

    // Recreate table without iptv_panel_id
    db.exec(`
        CREATE TABLE iptv_editor_playlists_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            playlist_id TEXT UNIQUE NOT NULL,
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

    // Copy data
    db.exec(`
        INSERT INTO iptv_editor_playlists_new (${columns})
        SELECT ${columns}
        FROM iptv_editor_playlists
    `);

    // Drop old and rename
    db.exec('DROP TABLE iptv_editor_playlists');
    db.exec('ALTER TABLE iptv_editor_playlists_new RENAME TO iptv_editor_playlists');

    // Recreate index
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_iptv_editor_playlist_id
        ON iptv_editor_playlists(playlist_id)
    `);

    db.exec('COMMIT');

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   - Migrated ${existingLinks.length} relationships (reversed direction)`);
    console.log(`   - Removed iptv_panel_id from iptv_editor_playlists`);
    console.log('');
    console.log('🎯 New relationship: iptv_panels.iptv_editor_playlist_id → iptv_editor_playlists.id');
    console.log('   (Multiple panels can now link to the same playlist)');

} catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
