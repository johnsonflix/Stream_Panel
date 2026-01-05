/**
 * Migration: Create playlist channel cache table
 *
 * Caches parsed M3U channel data at the playlist level so all users
 * on the same playlist get instant access to guide data.
 */

const { db } = require('../database-config');

function migrate() {
    console.log('Creating iptv_editor_playlist_channels table...');

    // Create the channel cache table
    db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_editor_playlist_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            channel_data TEXT NOT NULL,
            channel_count INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE
        )
    `);

    // Create index for fast lookup
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_playlist_channels_playlist_id
        ON iptv_editor_playlist_channels(playlist_id)
    `);

    console.log('✅ Migration complete: iptv_editor_playlist_channels table created');
}

// Run if called directly
if (require.main === module) {
    try {
        migrate();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

module.exports = { migrate };
