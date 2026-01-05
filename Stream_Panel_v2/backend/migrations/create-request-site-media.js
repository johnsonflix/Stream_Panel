/**
 * Migration: Create request_site_media table
 *
 * Tracks all movies and TV shows with their availability status on Plex and Radarr/Sonarr.
 * Based on Seerr's Media entity pattern.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_media table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER NOT NULL,
            tvdb_id INTEGER,
            imdb_id TEXT,
            media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),

            -- Status (Seerr MediaStatus enum)
            -- 0=UNKNOWN, 1=PENDING, 2=PROCESSING, 3=PARTIALLY_AVAILABLE, 4=AVAILABLE
            status INTEGER DEFAULT 0,
            status_4k INTEGER DEFAULT 0,

            -- Plex integration (populated by existing Plex sync)
            plex_rating_key TEXT,
            plex_rating_key_4k TEXT,
            plex_server_id INTEGER,

            -- Radarr/Sonarr integration (external service IDs)
            radarr_id INTEGER,
            radarr_id_4k INTEGER,
            sonarr_id INTEGER,
            sonarr_id_4k INTEGER,

            -- Timestamps
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_season_change DATETIME DEFAULT CURRENT_TIMESTAMP,
            media_added_at DATETIME,

            -- Constraints
            UNIQUE(tmdb_id, media_type)
        )
    `);

    // Create indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_media_tmdb ON request_site_media(tmdb_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_media_type ON request_site_media(media_type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_media_status ON request_site_media(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_media_plex_key ON request_site_media(plex_rating_key)`);

    console.log('[Migration] request_site_media table created successfully');
}

async function down() {
    console.log('[Migration] Dropping request_site_media table...');
    await query(`DROP TABLE IF EXISTS request_site_media`);
    console.log('[Migration] request_site_media table dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
