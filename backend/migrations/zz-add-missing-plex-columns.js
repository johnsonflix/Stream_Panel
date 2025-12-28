/**
 * Migration: Add Missing Plex Columns
 *
 * Fixes missing columns that cause SQLite errors:
 * - plex_servers.enable_auto_scan - for auto-scan job
 * - plex_servers.last_scan - for recent scan tracking
 * - plex_servers.last_recent_scan - for incremental scan tracking
 * - plex_servers.last_activity_sync - for sync scheduler
 * - plex_servers.libraries_config - for library tracking
 * - user_plex_shares.last_activity_sync - for user activity sync
 * - user_plex_shares.last_seen - for last seen tracking
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding missing Plex columns...');

    // Get existing columns from plex_servers
    const plexServerTableInfo = db.prepare("PRAGMA table_info(plex_servers)").all();
    const plexServerColumns = plexServerTableInfo.map(col => col.name);

    // Columns to add to plex_servers
    const plexServerNewColumns = [
        { name: 'enable_auto_scan', sql: 'INTEGER DEFAULT 1' },
        { name: 'last_scan', sql: 'INTEGER' },
        { name: 'last_recent_scan', sql: 'INTEGER' },
        { name: 'last_activity_sync', sql: 'DATETIME' },
        { name: 'libraries_config', sql: "TEXT DEFAULT '[]'" }
    ];

    for (const col of plexServerNewColumns) {
        if (!plexServerColumns.includes(col.name)) {
            try {
                db.exec(`ALTER TABLE plex_servers ADD COLUMN ${col.name} ${col.sql}`);
                console.log(`[Migration] Added ${col.name} to plex_servers`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${col.name} to plex_servers:`, err.message);
                }
            }
        }
    }

    // Get existing columns from user_plex_shares
    const userPlexSharesTableInfo = db.prepare("PRAGMA table_info(user_plex_shares)").all();
    const userPlexSharesColumns = userPlexSharesTableInfo.map(col => col.name);

    // Columns to add to user_plex_shares
    const userPlexSharesNewColumns = [
        { name: 'last_activity_sync', sql: 'DATETIME' },
        { name: 'last_seen', sql: 'DATETIME' }
    ];

    for (const col of userPlexSharesNewColumns) {
        if (!userPlexSharesColumns.includes(col.name)) {
            try {
                db.exec(`ALTER TABLE user_plex_shares ADD COLUMN ${col.name} ${col.sql}`);
                console.log(`[Migration] Added ${col.name} to user_plex_shares`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${col.name} to user_plex_shares:`, err.message);
                }
            }
        }
    }

    db.close();
    console.log('[Migration] Missing Plex columns migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
