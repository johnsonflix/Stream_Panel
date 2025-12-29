/**
 * Migration: Create Request Site Tables
 *
 * Creates tables for the media request system (Overseerr clone):
 * - request_servers: Radarr/Sonarr server configurations
 * - media_requests: User media requests
 * - request_settings: Global request site settings
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Creating request site tables...');

    // Create request_servers table (Radarr/Sonarr instances)
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('radarr', 'sonarr')),
            url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            is_4k INTEGER DEFAULT 0,
            quality_profile_id INTEGER,
            quality_profile_name TEXT,
            root_folder_path TEXT,
            language_profile_id INTEGER,
            tags TEXT DEFAULT '[]',
            minimum_availability TEXT DEFAULT 'announced',
            search_on_add INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create media_requests table
    db.exec(`
        CREATE TABLE IF NOT EXISTS media_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tmdb_id INTEGER NOT NULL,
            tvdb_id INTEGER,
            imdb_id TEXT,
            media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
            title TEXT NOT NULL,
            poster_path TEXT,
            backdrop_path TEXT,
            overview TEXT,
            release_date TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'processing', 'available', 'declined', 'failed')),
            server_id INTEGER,
            external_id INTEGER,
            seasons TEXT,
            is_4k INTEGER DEFAULT 0,
            requested_by TEXT,
            approved_by INTEGER,
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME,
            available_at DATETIME,
            notes TEXT,
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES request_servers(id) ON DELETE SET NULL
        )
    `);

    // Create request_settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default settings
    const defaultSettings = [
        { key: 'tmdb_api_key', value: '' },
        { key: 'auto_approve_movies', value: '0' },
        { key: 'auto_approve_tv', value: '0' },
        { key: 'movie_request_limit', value: '0' },
        { key: 'tv_request_limit', value: '0' },
        { key: 'request_limit_days', value: '7' },
        { key: 'hide_available_media', value: '0' },
        { key: 'allow_4k_requests', value: '1' },
        { key: 'default_language', value: 'en' },
        { key: 'default_region', value: 'US' }
    ];

    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO request_settings (setting_key, setting_value)
        VALUES (?, ?)
    `);

    for (const setting of defaultSettings) {
        insertSetting.run(setting.key, setting.value);
    }

    // Create indexes for better performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_media_requests_user_id ON media_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_media_requests_status ON media_requests(status);
        CREATE INDEX IF NOT EXISTS idx_media_requests_tmdb_id ON media_requests(tmdb_id);
        CREATE INDEX IF NOT EXISTS idx_media_requests_media_type ON media_requests(media_type);
        CREATE INDEX IF NOT EXISTS idx_request_servers_type ON request_servers(type);
        CREATE INDEX IF NOT EXISTS idx_request_servers_is_default ON request_servers(is_default);
    `);

    db.close();
    console.log('[Migration] Request site tables created successfully!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
