/**
 * Migration: Create request_site_settings table
 *
 * Stores global configuration for Request Site.
 * Uses key-value pattern for flexible settings storage.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_settings table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default settings
    const defaultSettings = [
        // Global quotas
        { key: 'movie_quota_limit', value: '10' },
        { key: 'movie_quota_days', value: '7' },
        { key: 'tv_quota_limit', value: '5' },
        { key: 'tv_quota_days', value: '7' },

        // Auto-approve settings
        { key: 'auto_approve_movies', value: '0' },
        { key: 'auto_approve_tv', value: '0' },
        { key: 'auto_approve_4k', value: '0' },

        // Granular auto-approve for TV shows (max seasons to auto-approve)
        { key: 'auto_approve_tv_max_seasons', value: '1' },

        // Default Radarr/Sonarr servers (JSON: server IDs)
        { key: 'default_radarr_server', value: 'null' },
        { key: 'default_radarr_4k_server', value: 'null' },
        { key: 'default_sonarr_server', value: 'null' },
        { key: 'default_sonarr_4k_server', value: 'null' },

        // Notification settings (JSON: {enabled, webhook, etc.})
        { key: 'notification_email', value: '{"enabled":false}' },
        { key: 'notification_discord', value: '{"enabled":false,"webhook":""}' },
        { key: 'notification_telegram', value: '{"enabled":false,"botToken":"","chatId":""}' },
        { key: 'notification_webpush', value: '{"enabled":false}' },
        { key: 'notification_webhook', value: '{"enabled":false,"url":""}' },

        // Availability sync settings
        { key: 'availability_sync_enabled', value: '1' },
        { key: 'availability_sync_interval_hours', value: '6' },
        { key: 'download_tracker_enabled', value: '1' },
        { key: 'download_tracker_interval_seconds', value: '60' },

        // Request Site enabled/disabled
        { key: 'request_site_enabled', value: '1' },

        // Default permissions for new users
        { key: 'default_can_request', value: '1' },
        { key: 'default_can_request_movie', value: '1' },
        { key: 'default_can_request_tv', value: '1' },
        { key: 'default_can_request_4k', value: '0' },
    ];

    for (const setting of defaultSettings) {
        await query(
            'INSERT OR IGNORE INTO request_site_settings (key, value) VALUES (?, ?)',
            [setting.key, setting.value]
        );
    }

    console.log('[Migration] request_site_settings table created with default values');
}

async function down() {
    console.log('[Migration] Dropping request_site_settings table...');
    await query(`DROP TABLE IF EXISTS request_site_settings`);
    console.log('[Migration] request_site_settings table dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
