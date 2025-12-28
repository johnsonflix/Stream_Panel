/**
 * Migration: Add Seerr-Style Plex Scanning Support
 *
 * Adds columns and tables needed for:
 * - Recently Added scanning (last_scan per server)
 * - 4K tracking (status_4k columns)
 * - GUID cache (avoid redundant TMDB lookups)
 * - Availability sync tracking
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Adding Seerr-style Plex scanning support...');

    // 1. Add last_scan to plex_servers for incremental scanning
    try {
        await query(`ALTER TABLE plex_servers ADD COLUMN last_scan INTEGER`);
        console.log('[Migration] Added last_scan to plex_servers');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] last_scan column already exists or error:', e.message);
        }
    }

    // 2. Add 4K tracking columns to request_site_media
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN plex_rating_key_4k TEXT`);
        console.log('[Migration] Added plex_rating_key_4k to request_site_media');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] plex_rating_key_4k already exists');
        }
    }

    // 3. Add last_availability_check for sync job
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN last_availability_check DATETIME`);
        console.log('[Migration] Added last_availability_check to request_site_media');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] last_availability_check already exists');
        }
    }

    // 4. Create GUID cache table for persistent TMDB lookups
    await query(`
        CREATE TABLE IF NOT EXISTS plex_guid_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plex_rating_key TEXT NOT NULL,
            plex_server_id INTEGER NOT NULL,
            tmdb_id INTEGER,
            tvdb_id INTEGER,
            imdb_id TEXT,
            media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
            title TEXT,
            year INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(plex_rating_key, plex_server_id),
            FOREIGN KEY (plex_server_id) REFERENCES plex_servers(id) ON DELETE CASCADE
        )
    `);
    console.log('[Migration] Created plex_guid_cache table');

    // 5. Create indexes for GUID cache
    await query(`CREATE INDEX IF NOT EXISTS idx_guid_cache_rating_key ON plex_guid_cache(plex_rating_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_guid_cache_tmdb ON plex_guid_cache(tmdb_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_guid_cache_server ON plex_guid_cache(plex_server_id)`);

    // 6. Add episode-level availability tracking
    await query(`
        CREATE TABLE IF NOT EXISTS request_site_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            episode_number INTEGER NOT NULL,
            status INTEGER DEFAULT 0,
            status_4k INTEGER DEFAULT 0,
            plex_rating_key TEXT,
            plex_rating_key_4k TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (season_id) REFERENCES request_site_seasons(id) ON DELETE CASCADE,
            UNIQUE(season_id, episode_number)
        )
    `);
    console.log('[Migration] Created request_site_episodes table');

    await query(`CREATE INDEX IF NOT EXISTS idx_episodes_season ON request_site_episodes(season_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_episodes_status ON request_site_episodes(status)`);

    // 7. Add library tracking to plex_servers
    try {
        await query(`ALTER TABLE plex_servers ADD COLUMN libraries_config TEXT DEFAULT '[]'`);
        console.log('[Migration] Added libraries_config to plex_servers');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] libraries_config already exists');
        }
    }

    console.log('[Migration] Seerr-style Plex scanning support added successfully!');
}

async function down() {
    console.log('[Migration] Removing Seerr-style Plex scanning support...');
    await query(`DROP TABLE IF EXISTS plex_guid_cache`);
    await query(`DROP TABLE IF EXISTS request_site_episodes`);
    console.log('[Migration] Tables dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
