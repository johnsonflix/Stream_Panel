/**
 * Migration: Create Portal Customization Tables
 *
 * Creates tables for:
 * - portal_apps: Customizable app cards with categories (TV, Mobile, Desktop, Web)
 * - portal_guides: HTML/Markdown guides with public URLs
 * - portal_quick_actions: Customizable quick action buttons
 */

const db = require('../database-config');

async function up() {
    console.log('Creating portal customization tables...');

    // Portal Apps - Customizable app download cards
    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            icon_type TEXT DEFAULT 'emoji',
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')) DEFAULT 'both',
            platform_category TEXT CHECK(platform_category IN ('tv', 'mobile', 'desktop', 'web')) NOT NULL,
            app_type TEXT CHECK(app_type IN ('downloader_code', 'store_link', 'direct_url', 'apk', 'web_player')) NOT NULL,
            downloader_code TEXT,
            store_url_ios TEXT,
            store_url_android TEXT,
            store_url_windows TEXT,
            store_url_mac TEXT,
            direct_url TEXT,
            apk_url TEXT,
            instructions TEXT,
            display_order INTEGER DEFAULT 0,
            is_visible INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  - Created portal_apps table');

    // Portal Guides - HTML content guides with public URLs
    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            icon TEXT,
            icon_type TEXT DEFAULT 'emoji',
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both', 'general')) DEFAULT 'general',
            category TEXT CHECK(category IN ('setup', 'troubleshooting', 'support', 'faq', 'other')) DEFAULT 'setup',
            short_description TEXT,
            content TEXT,
            content_type TEXT CHECK(content_type IN ('html', 'markdown')) DEFAULT 'markdown',
            is_public INTEGER DEFAULT 1,
            is_visible INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  - Created portal_guides table');

    // Portal Quick Actions - Customizable action buttons (webapp, request site, etc.)
    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_quick_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            icon_type TEXT DEFAULT 'emoji',
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')) DEFAULT 'both',
            action_type TEXT CHECK(action_type IN ('external_url', 'internal_page', 'dynamic')) NOT NULL,
            url TEXT,
            dynamic_field TEXT,
            button_style TEXT DEFAULT 'primary',
            display_order INTEGER DEFAULT 0,
            is_visible INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  - Created portal_quick_actions table');

    // Portal App-Guide Links - Link apps to their setup guides
    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_app_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            guide_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (app_id) REFERENCES portal_apps(id) ON DELETE CASCADE,
            FOREIGN KEY (guide_id) REFERENCES portal_guides(id) ON DELETE CASCADE,
            UNIQUE(app_id, guide_id)
        )
    `);
    console.log('  - Created portal_app_guides table');

    // Insert some default apps
    const defaultApps = [
        // TV Apps
        { name: 'IPTV Smarters Pro', description: 'Full-featured IPTV player', icon: '📺', service_type: 'iptv', platform_category: 'tv', app_type: 'downloader_code', downloader_code: '123456' },
        { name: 'TiviMate', description: 'Premium IPTV player for Android TV', icon: '📺', service_type: 'iptv', platform_category: 'tv', app_type: 'store_link', store_url_android: 'https://play.google.com/store/apps/details?id=ar.tvplayer.tv' },
        { name: 'Plex', description: 'Official Plex app', icon: '🎬', service_type: 'plex', platform_category: 'tv', app_type: 'store_link', store_url_android: 'https://play.google.com/store/apps/details?id=com.plexapp.android' },

        // Mobile Apps
        { name: 'IPTV Smarters', description: 'IPTV player for mobile', icon: '📱', service_type: 'iptv', platform_category: 'mobile', app_type: 'store_link', store_url_ios: 'https://apps.apple.com/app/iptv-smarters-player/id1383614816', store_url_android: 'https://play.google.com/store/apps/details?id=com.nst.iptvsmarterstvbox' },
        { name: 'Plex', description: 'Official Plex mobile app', icon: '🎬', service_type: 'plex', platform_category: 'mobile', app_type: 'store_link', store_url_ios: 'https://apps.apple.com/app/plex-movies-tv-music-more/id383457673', store_url_android: 'https://play.google.com/store/apps/details?id=com.plexapp.android' },

        // Desktop Apps
        { name: 'Plex Desktop', description: 'Plex for Windows/Mac', icon: '💻', service_type: 'plex', platform_category: 'desktop', app_type: 'direct_url', direct_url: 'https://www.plex.tv/media-server-downloads/#plex-app' },
        { name: 'VLC Player', description: 'Open source media player', icon: '🔶', service_type: 'iptv', platform_category: 'desktop', app_type: 'direct_url', direct_url: 'https://www.videolan.org/vlc/' }
    ];

    for (let i = 0; i < defaultApps.length; i++) {
        const app = defaultApps[i];
        await db.query(`
            INSERT INTO portal_apps (name, description, icon, service_type, platform_category, app_type, downloader_code, store_url_ios, store_url_android, direct_url, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [app.name, app.description, app.icon, app.service_type, app.platform_category, app.app_type, app.downloader_code || null, app.store_url_ios || null, app.store_url_android || null, app.direct_url || null, i]);
    }
    console.log('  - Inserted default apps');

    // Insert default quick actions
    const defaultActions = [
        { name: 'Open Web Player', description: 'Watch in your browser', icon: '🌐', service_type: 'iptv', action_type: 'internal_page', url: '/portal/player.html', button_style: 'primary' },
        { name: 'TV Guide', description: 'Browse channels and schedule', icon: '📺', service_type: 'iptv', action_type: 'internal_page', url: '/portal/guide.html', button_style: 'secondary' },
        { name: 'Open Plex', description: 'Launch Plex Web App', icon: '🎬', service_type: 'plex', action_type: 'dynamic', dynamic_field: 'plex_server_url', button_style: 'primary' },
        { name: 'Request Content', description: 'Request movies and shows', icon: '📝', service_type: 'plex', action_type: 'dynamic', dynamic_field: 'request_site_url', button_style: 'secondary' }
    ];

    for (let i = 0; i < defaultActions.length; i++) {
        const action = defaultActions[i];
        await db.query(`
            INSERT INTO portal_quick_actions (name, description, icon, service_type, action_type, url, dynamic_field, button_style, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [action.name, action.description, action.icon, action.service_type, action.action_type, action.url || null, action.dynamic_field || null, action.button_style, i]);
    }
    console.log('  - Inserted default quick actions');

    // Insert a sample guide
    await db.query(`
        INSERT INTO portal_guides (slug, title, icon, service_type, category, short_description, content, content_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        'getting-started',
        'Getting Started',
        '🚀',
        'general',
        'setup',
        'Learn how to get started with your services',
        `# Getting Started

Welcome to your streaming services! This guide will help you get set up.

## Plex Setup

1. Download the Plex app on your device
2. Sign in with your Plex account email
3. Accept the server invitation
4. Start watching!

## IPTV Setup

1. Download an IPTV player app (we recommend IPTV Smarters)
2. Open the app and select "Xtream Codes API" login
3. Enter your credentials from your account page
4. Enjoy live TV!

## Need Help?

If you have any issues, use the **Contact Support** button in the portal header.
`,
        'markdown'
    ]);
    console.log('  - Inserted sample guide');

    console.log('Portal customization tables created successfully!');
}

async function down() {
    console.log('Dropping portal customization tables...');

    await db.query('DROP TABLE IF EXISTS portal_app_guides');
    await db.query('DROP TABLE IF EXISTS portal_quick_actions');
    await db.query('DROP TABLE IF EXISTS portal_guides');
    await db.query('DROP TABLE IF EXISTS portal_apps');

    console.log('Portal customization tables dropped.');
}

// Run migration
if (require.main === module) {
    up()
        .then(() => {
            console.log('Migration completed.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { up, down };
