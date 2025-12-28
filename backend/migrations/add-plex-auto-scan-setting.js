/**
 * Migration: Add auto_scan column to plex_servers table
 * This allows users to select which Plex servers should be included in scheduled auto-scans
 *
 * Like Seerr, we scan:
 * - Recently added: every 5 minutes (only servers with enable_auto_scan = 1)
 * - Full scan: every 6 hours (only servers with enable_auto_scan = 1)
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Adding Plex auto-scan settings...');

    // Add enable_auto_scan column (default to 1 = enabled)
    try {
        await query(`ALTER TABLE plex_servers ADD COLUMN enable_auto_scan INTEGER DEFAULT 1`);
        console.log('[Migration] Added enable_auto_scan to plex_servers');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] enable_auto_scan column already exists');
        }
    }

    // Add last_recent_scan for tracking incremental scans separately
    try {
        await query(`ALTER TABLE plex_servers ADD COLUMN last_recent_scan INTEGER`);
        console.log('[Migration] Added last_recent_scan to plex_servers');
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.log('[Migration] last_recent_scan column already exists');
        }
    }

    console.log('[Migration] Plex auto-scan settings added successfully!');
}

// Run migration
up().then(() => {
    console.log('[Migration] add-plex-auto-scan-setting completed');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] add-plex-auto-scan-setting failed:', err);
    process.exit(1);
});
