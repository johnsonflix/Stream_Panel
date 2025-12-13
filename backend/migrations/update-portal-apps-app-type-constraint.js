/**
 * Migration: Update portal_apps app_type constraint to include new types
 *
 * Old types: downloader_code, store_link, direct_url, apk, web_player
 * New types: play_store, mobile_store, roku_store, appletv_store, windows_store, windows_download, mac_store, mac_download
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');
const db = new Database(dbPath);

console.log('Running migration: update-portal-apps-app-type-constraint');

try {
    // SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
    // First, get the current table structure
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='portal_apps'").get();
    console.log('Current table definition:', tableInfo?.sql);

    // Begin transaction
    db.exec('BEGIN TRANSACTION');

    // Create new table with updated constraint - matching existing structure exactly
    db.exec(`
        CREATE TABLE IF NOT EXISTS portal_apps_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            icon_url TEXT,
            icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),
            platform_category TEXT CHECK(platform_category IN (
                'tv', 'mobile', 'desktop', 'web',
                'android_tv', 'android_mobile', 'ios',
                'windows', 'macos', 'roku', 'firestick', 'apple_tv'
            )),
            app_type TEXT CHECK(app_type IN (
                'downloader_code', 'store_link', 'direct_url', 'apk', 'web_player',
                'play_store', 'mobile_store', 'roku_store', 'appletv_store',
                'windows_store', 'windows_download', 'mac_store', 'mac_download'
            )),
            downloader_code TEXT,
            store_url_ios TEXT,
            store_url_android TEXT,
            store_url_windows TEXT,
            store_url_mac TEXT,
            direct_url TEXT,
            apk_url TEXT,
            web_player_url TEXT,
            instructions TEXT,
            display_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            store_url_roku TEXT,
            store_url_appletv TEXT
        )
    `);

    // Copy data from old table to new table
    db.exec(`
        INSERT INTO portal_apps_new (
            id, name, description, icon, icon_url, icon_type, service_type, platform_category, app_type,
            downloader_code, store_url_ios, store_url_android, store_url_windows, store_url_mac,
            direct_url, apk_url, web_player_url, instructions, display_order, is_active,
            created_at, updated_at, store_url_roku, store_url_appletv
        )
        SELECT
            id, name, description, icon, icon_url, icon_type, service_type, platform_category, app_type,
            downloader_code, store_url_ios, store_url_android, store_url_windows, store_url_mac,
            direct_url, apk_url, web_player_url, instructions, display_order, is_active,
            created_at, updated_at, store_url_roku, store_url_appletv
        FROM portal_apps
    `);

    // Drop old table
    db.exec('DROP TABLE portal_apps');

    // Rename new table to original name
    db.exec('ALTER TABLE portal_apps_new RENAME TO portal_apps');

    // Commit transaction
    db.exec('COMMIT');

    console.log('Migration completed successfully');
    console.log('New app_type constraint includes: downloader_code, store_link, direct_url, apk, web_player, play_store, mobile_store, roku_store, appletv_store, windows_store, windows_download, mac_store, mac_download');
} catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
