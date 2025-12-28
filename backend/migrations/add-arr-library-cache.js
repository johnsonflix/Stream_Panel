/**
 * Migration: Add Sonarr/Radarr Library Cache Tables
 *
 * Caches Sonarr/Radarr library data for fast status lookups.
 * Similar to how Seerr caches *arr library data.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function runMigration() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    console.log('[Migration] Adding Sonarr/Radarr library cache tables...');

    try {
        // Create Radarr library cache table
        db.exec(`
            CREATE TABLE IF NOT EXISTS radarr_library_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                radarr_id INTEGER NOT NULL,
                tmdb_id INTEGER NOT NULL,
                imdb_id TEXT,
                title TEXT NOT NULL,
                year INTEGER,
                has_file INTEGER DEFAULT 0,
                monitored INTEGER DEFAULT 1,
                quality_profile_id INTEGER,
                path TEXT,
                size_on_disk INTEGER DEFAULT 0,
                added_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(server_id, tmdb_id)
            )
        `);

        // Create Sonarr library cache table
        db.exec(`
            CREATE TABLE IF NOT EXISTS sonarr_library_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                sonarr_id INTEGER NOT NULL,
                tvdb_id INTEGER,
                tmdb_id INTEGER,
                imdb_id TEXT,
                title TEXT NOT NULL,
                year INTEGER,
                total_episodes INTEGER DEFAULT 0,
                episode_file_count INTEGER DEFAULT 0,
                monitored INTEGER DEFAULT 1,
                quality_profile_id INTEGER,
                path TEXT,
                size_on_disk INTEGER DEFAULT 0,
                added_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(server_id, tvdb_id)
            )
        `);

        // Create indexes for fast lookups
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_radarr_cache_tmdb ON radarr_library_cache(tmdb_id);
            CREATE INDEX IF NOT EXISTS idx_sonarr_cache_tvdb ON sonarr_library_cache(tvdb_id);
            CREATE INDEX IF NOT EXISTS idx_sonarr_cache_tmdb ON sonarr_library_cache(tmdb_id);
        `);

        // Add last_library_sync to request_servers table
        try {
            db.exec(`ALTER TABLE request_servers ADD COLUMN last_library_sync TEXT`);
            console.log('[Migration] Added last_library_sync column to request_servers');
        } catch (e) {
            if (!e.message.includes('duplicate column')) {
                throw e;
            }
        }

        console.log('[Migration] Sonarr/Radarr library cache tables created successfully');

    } catch (error) {
        console.error('[Migration] Error:', error);
        throw error;
    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };
