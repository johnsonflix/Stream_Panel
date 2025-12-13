/**
 * Migration: Create dashboard_cached_stats table
 *
 * This table stores all dashboard statistics for instant loading.
 * Background jobs update these stats every 5 minutes.
 */

const db = require('../database-config');

async function migrate() {
    console.log('[MIGRATION] Creating dashboard_cached_stats table...');

    try {
        // Create the dashboard_cached_stats table
        await db.query(`
            CREATE TABLE IF NOT EXISTS dashboard_cached_stats (
                stat_key TEXT PRIMARY KEY,
                stat_value TEXT NOT NULL,
                stat_type TEXT DEFAULT 'number',
                updated_at DATETIME DEFAULT (datetime('now'))
            )
        `);

        console.log('[MIGRATION] dashboard_cached_stats table created successfully');

        // Create index for faster lookups
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_dashboard_cached_stats_updated
            ON dashboard_cached_stats(updated_at)
        `);

        console.log('[MIGRATION] Index created successfully');

        // Insert initial placeholder values
        const initialStats = [
            // User counts
            { key: 'total_users', value: '0', type: 'number' },
            { key: 'active_plex_users', value: '0', type: 'number' },
            { key: 'active_iptv_users', value: '0', type: 'number' },
            { key: 'iptv_editor_users', value: '0', type: 'number' },

            // Server/panel counts
            { key: 'plex_servers_count', value: '0', type: 'number' },
            { key: 'iptv_panels_count', value: '0', type: 'number' },
            { key: 'plex_servers_online', value: '0', type: 'number' },
            { key: 'plex_servers_offline', value: '0', type: 'number' },

            // Expiring/new users
            { key: 'expiring_soon', value: '0', type: 'number' },
            { key: 'expiring_soon_month', value: '0', type: 'number' },
            { key: 'expiring_plex_week', value: '0', type: 'number' },
            { key: 'expiring_iptv_week', value: '0', type: 'number' },
            { key: 'new_users_week', value: '0', type: 'number' },
            { key: 'new_users_month', value: '0', type: 'number' },

            // Pending requests
            { key: 'pending_plex_requests', value: '0', type: 'number' },
            { key: 'pending_iptv_requests', value: '0', type: 'number' },

            // Live stats (updated from Plex/IPTV APIs)
            { key: 'live_plex_users', value: '0', type: 'number' },
            { key: 'total_unique_plex_users', value: '0', type: 'number' },
            { key: 'live_pending_invites', value: '0', type: 'number' },
            { key: 'iptv_live_streams', value: '0', type: 'number' },

            // Bandwidth stats
            { key: 'total_bandwidth_mbps', value: '0.0', type: 'string' },
            { key: 'wan_bandwidth_mbps', value: '0.0', type: 'string' },
            { key: 'direct_plays_count', value: '0', type: 'number' },
            { key: 'direct_streams_count', value: '0', type: 'number' },
            { key: 'transcodes_count', value: '0', type: 'number' },

            // Complex data (JSON arrays)
            { key: 'plex_server_details', value: '[]', type: 'json' },
            { key: 'iptv_panel_details', value: '[]', type: 'json' },
            { key: 'iptv_panels_data', value: 'null', type: 'json' },

            // Aggregate stats
            { key: 'most_popular_content', value: '[]', type: 'json' },
            { key: 'most_watched_content', value: '[]', type: 'json' },
            { key: 'most_active_users', value: '[]', type: 'json' },
            { key: 'most_active_platforms', value: '[]', type: 'json' }
        ];

        for (const stat of initialStats) {
            await db.query(`
                INSERT OR IGNORE INTO dashboard_cached_stats (stat_key, stat_value, stat_type)
                VALUES (?, ?, ?)
            `, [stat.key, stat.value, stat.type]);
        }

        console.log('[MIGRATION] Initial stats inserted successfully');
        console.log('[MIGRATION] Migration completed!');

        return true;
    } catch (error) {
        console.error('[MIGRATION] Error:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    migrate()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { migrate };
