/**
 * Migration: Reverse the playlist-panel relationship
 *
 * BEFORE: iptv_editor_playlists.iptv_panel_id → iptv_panels.id
 *         (many playlists → one panel)
 *
 * AFTER:  iptv_panels.iptv_editor_playlist_id → iptv_editor_playlists.id
 *         (many panels → one playlist)
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../subsapp_v2.db');
const db = new Database(dbPath);

console.log('🔄 Starting playlist-panel relationship reversal migration...');

try {
    db.exec('BEGIN TRANSACTION');

    // 1. Add new column to iptv_panels table
    console.log('📝 Step 1: Adding iptv_editor_playlist_id column to iptv_panels...');
    db.exec(`
        ALTER TABLE iptv_panels
        ADD COLUMN iptv_editor_playlist_id INTEGER REFERENCES iptv_editor_playlists(id) ON DELETE SET NULL
    `);

    // 2. Migrate existing data (reverse the relationship)
    // For each playlist that links to a panel, make that panel link to the playlist instead
    console.log('📝 Step 2: Migrating existing relationships...');
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

    // 3. Remove old column from iptv_editor_playlists
    // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    console.log('📝 Step 3: Removing iptv_panel_id from iptv_editor_playlists...');

    // Get current table schema
    const tableInfo = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const columns = tableInfo
        .filter(col => col.name !== 'iptv_panel_id')
        .map(col => col.name)
        .join(', ');

    // Create new table without iptv_panel_id
    db.exec(`
        CREATE TABLE iptv_editor_playlists_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            playlist_id TEXT UNIQUE NOT NULL,
            customer_count INTEGER DEFAULT 0,
            channel_count INTEGER DEFAULT 0,
            movie_count INTEGER DEFAULT 0,
            series_count INTEGER DEFAULT 0,
            provider_base_url TEXT,
            provider_username TEXT,
            provider_password TEXT,
            auto_updater_enabled BOOLEAN DEFAULT 0,
            auto_updater_cron TEXT,
            auto_updater_status TEXT DEFAULT 'idle',
            last_auto_updater_run DATETIME,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Copy data to new table
    db.exec(`
        INSERT INTO iptv_editor_playlists_new (${columns})
        SELECT ${columns}
        FROM iptv_editor_playlists
    `);

    // Drop old table and rename new one
    db.exec('DROP TABLE iptv_editor_playlists');
    db.exec('ALTER TABLE iptv_editor_playlists_new RENAME TO iptv_editor_playlists');

    // 4. Recreate indexes
    console.log('📝 Step 4: Recreating indexes...');
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_iptv_editor_playlist_id
        ON iptv_editor_playlists(playlist_id)
    `);

    db.exec('COMMIT');

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   - Added iptv_editor_playlist_id to iptv_panels`);
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
