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

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(dbPath);

try {
    // Check if migration already done - iptv_panels has iptv_editor_playlist_id column
    const panelColumns = db.prepare("PRAGMA table_info(iptv_panels)").all();
    const hasNewColumn = panelColumns.some(col => col.name === 'iptv_editor_playlist_id');

    // Check if iptv_editor_playlists still has iptv_panel_id column
    const playlistColumns = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const hasOldColumn = playlistColumns.some(col => col.name === 'iptv_panel_id');

    // If new column exists and old column is gone, migration is complete
    if (hasNewColumn && !hasOldColumn) {
        db.close();
        process.exit(0);
    }

    // If new column already exists, this migration has already run or is partially complete
    if (hasNewColumn) {
        db.close();
        process.exit(0);
    }

    console.log('🔄 Starting playlist-panel relationship reversal migration...');
    db.exec('BEGIN TRANSACTION');

    // 1. Add new column to iptv_panels table
    console.log('📝 Step 1: Adding iptv_editor_playlist_id column to iptv_panels...');
    db.exec(`
        ALTER TABLE iptv_panels
        ADD COLUMN iptv_editor_playlist_id INTEGER REFERENCES iptv_editor_playlists(id) ON DELETE SET NULL
    `);

    // 2. Migrate existing data (reverse the relationship)
    console.log('📝 Step 2: Migrating existing relationships...');
    const existingLinks = db.prepare(`
        SELECT id, iptv_panel_id
        FROM iptv_editor_playlists
        WHERE iptv_panel_id IS NOT NULL
    `).all();

    console.log(`   Found ${existingLinks.length} existing playlist→panel links`);

    for (const link of existingLinks) {
        db.prepare(`
            UPDATE iptv_panels
            SET iptv_editor_playlist_id = ?
            WHERE id = ?
        `).run(link.id, link.iptv_panel_id);
        console.log(`   ✓ Migrated: Panel ${link.iptv_panel_id} → Playlist ${link.id}`);
    }

    db.exec('COMMIT');

    console.log('✅ Migration completed successfully!');

} catch (error) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
