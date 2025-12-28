/**
 * Migration: Add Extended Sonarr/Radarr Options
 *
 * Adds missing columns to request_servers table for full Seerr compatibility:
 * - use_ssl: SSL toggle
 * - base_url: URL base path
 * - series_type: Default series type (standard/daily) for Sonarr
 * - anime_series_type: Anime series type (standard/anime)
 * - anime_quality_profile_id/name: Anime quality profile
 * - anime_root_folder_path: Anime root folder
 * - anime_language_profile_id: Anime language profile
 * - anime_tags: Tags for anime content
 * - enable_season_folders: Create season folders in Sonarr
 * - external_url: External URL for links
 * - tag_requests: Auto-tag requests with user info
 * - enable_scan: Enable library scanning
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding extended Sonarr/Radarr options...');

    const columnsToAdd = [
        { name: 'use_ssl', type: 'INTEGER DEFAULT 0' },
        { name: 'base_url', type: 'TEXT' },
        { name: 'series_type', type: "TEXT DEFAULT 'standard'" },
        { name: 'anime_series_type', type: "TEXT DEFAULT 'standard'" },
        { name: 'anime_quality_profile_id', type: 'INTEGER' },
        { name: 'anime_quality_profile_name', type: 'TEXT' },
        { name: 'anime_root_folder_path', type: 'TEXT' },
        { name: 'anime_language_profile_id', type: 'INTEGER' },
        { name: 'anime_tags', type: "TEXT DEFAULT '[]'" },
        { name: 'enable_season_folders', type: 'INTEGER DEFAULT 0' },
        { name: 'external_url', type: 'TEXT' },
        { name: 'tag_requests', type: 'INTEGER DEFAULT 0' },
        { name: 'enable_scan', type: 'INTEGER DEFAULT 1' }
    ];

    // Check existing columns
    const tableInfo = db.prepare("PRAGMA table_info(request_servers)").all();
    const existingColumns = tableInfo.map(col => col.name);

    for (const column of columnsToAdd) {
        if (!existingColumns.includes(column.name)) {
            try {
                db.exec(`ALTER TABLE request_servers ADD COLUMN ${column.name} ${column.type}`);
                console.log(`[Migration] Added column: ${column.name}`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${column.name}:`, err.message);
                }
            }
        } else {
            console.log(`[Migration] Column ${column.name} already exists`);
        }
    }

    db.close();
    console.log('[Migration] Extended Sonarr/Radarr options migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
