/**
 * Migration: Update Portal Tables
 * - Update platform_category to allow more specific platforms
 * - Update action_type for quick actions to match frontend values
 * - Add icon_url for image uploads
 * - Normalize is_visible/is_active naming
 */

const { db } = require('../database-config');

function migrate() {
    console.log('Starting portal tables update migration...');

    try {
        // Check current state of tables
        const appsSchema = db.prepare('PRAGMA table_info(portal_apps)').all();
        const actionsSchema = db.prepare('PRAGMA table_info(portal_quick_actions)').all();

        const appsHasIconUrl = appsSchema.some(c => c.name === 'icon_url');
        const actionsHasIconUrl = actionsSchema.some(c => c.name === 'icon_url');
        const actionsHasIsActive = actionsSchema.some(c => c.name === 'is_active');

        console.log('Current state:');
        console.log('- portal_apps has icon_url:', appsHasIconUrl);
        console.log('- portal_quick_actions has icon_url:', actionsHasIconUrl);
        console.log('- portal_quick_actions has is_active:', actionsHasIsActive);

        // 1. Update portal_apps if needed (update CHECK constraints)
        if (!appsHasIconUrl) {
            console.log('Updating portal_apps table...');

            // Check if _new table exists and drop it
            db.prepare('DROP TABLE IF EXISTS portal_apps_new').run();

            db.prepare(`
                CREATE TABLE portal_apps_new (
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
                    app_type TEXT CHECK(app_type IN ('downloader_code', 'store_link', 'direct_url', 'apk', 'web_player')),
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
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `).run();

            // Copy data - use COALESCE to handle missing columns
            db.prepare(`
                INSERT INTO portal_apps_new (
                    id, name, description, icon, icon_type, service_type, platform_category,
                    app_type, downloader_code, store_url_ios, store_url_android,
                    store_url_windows, store_url_mac, direct_url, apk_url, instructions,
                    display_order, is_active, created_at, updated_at
                )
                SELECT
                    id, name, description, icon,
                    COALESCE(icon_type, 'emoji'),
                    service_type,
                    CASE platform_category
                        WHEN 'tv' THEN 'android_tv'
                        ELSE platform_category
                    END,
                    app_type, downloader_code, store_url_ios, store_url_android,
                    store_url_windows, store_url_mac, direct_url, apk_url, instructions,
                    display_order,
                    1,
                    created_at, updated_at
                FROM portal_apps
            `).run();

            db.prepare('DROP TABLE portal_apps').run();
            db.prepare('ALTER TABLE portal_apps_new RENAME TO portal_apps').run();
            console.log('portal_apps table updated.');
        } else {
            console.log('portal_apps already has icon_url, skipping table recreation.');
        }

        // 2. Update portal_quick_actions
        if (!actionsHasIconUrl || !actionsHasIsActive) {
            console.log('Updating portal_quick_actions table...');

            // Check if _new table exists and drop it
            db.prepare('DROP TABLE IF EXISTS portal_quick_actions_new').run();

            db.prepare(`
                CREATE TABLE portal_quick_actions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    icon TEXT,
                    icon_url TEXT,
                    icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),
                    service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),
                    action_type TEXT CHECK(action_type IN (
                        'link', 'internal', 'plex_web', 'request_site',
                        'tv_guide', 'web_player', 'external_url', 'internal_page', 'dynamic'
                    )),
                    url TEXT,
                    dynamic_field TEXT,
                    button_style TEXT,
                    display_order INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `).run();

            // Copy data - map is_visible to is_active, map old action_type values
            db.prepare(`
                INSERT INTO portal_quick_actions_new (
                    id, name, description, icon, icon_type, service_type, action_type, url,
                    dynamic_field, button_style, display_order, is_active, created_at, updated_at
                )
                SELECT
                    id, name, description, icon, icon_type, service_type,
                    CASE action_type
                        WHEN 'external_url' THEN 'link'
                        WHEN 'internal_page' THEN 'internal'
                        WHEN 'dynamic' THEN 'internal'
                        ELSE COALESCE(action_type, 'link')
                    END,
                    url, dynamic_field, button_style, display_order,
                    COALESCE(is_visible, 1),
                    created_at, updated_at
                FROM portal_quick_actions
            `).run();

            db.prepare('DROP TABLE portal_quick_actions').run();
            db.prepare('ALTER TABLE portal_quick_actions_new RENAME TO portal_quick_actions').run();
            console.log('portal_quick_actions table updated.');
        } else {
            console.log('portal_quick_actions already updated, skipping.');
        }

        // 3. Add icon_url to portal_guides if not exists
        console.log('Checking portal_guides table...');
        const guidesSchema = db.prepare('PRAGMA table_info(portal_guides)').all();
        const guidesHasIconUrl = guidesSchema.some(c => c.name === 'icon_url');

        if (!guidesHasIconUrl) {
            db.prepare('ALTER TABLE portal_guides ADD COLUMN icon_url TEXT').run();
            console.log('Added icon_url to portal_guides.');
        } else {
            console.log('portal_guides already has icon_url.');
        }

        console.log('Migration completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

migrate();
console.log('Done');
process.exit(0);
