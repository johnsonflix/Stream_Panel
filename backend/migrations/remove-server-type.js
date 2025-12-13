/**
 * Migration: Remove server_type column from plex_servers table
 *
 * This migration removes the server_type column as it's no longer needed.
 * The distinction between "regular" and "4k" servers is not relevant anymore.
 */

const db = require('../database-config');

async function migrate() {
    console.log('🔄 Starting migration: Remove server_type from plex_servers...');

    try {
        // SQLite doesn't support DROP COLUMN directly, so we need to:
        // 1. Create a new table without the column
        // 2. Copy data from old table to new table
        // 3. Drop old table
        // 4. Rename new table to old table name

        // Start transaction
        await db.query('BEGIN TRANSACTION');

        // Create new table without server_type
        await db.query(`
            CREATE TABLE plex_servers_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                server_id TEXT NOT NULL,
                token TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                libraries TEXT,
                last_library_sync TEXT,
                sync_schedule TEXT DEFAULT 'manual',
                last_health_check TEXT,
                health_status TEXT DEFAULT 'online',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                request_site_url TEXT DEFAULT NULL
            )
        `);

        console.log('✓ Created new plex_servers table without server_type column');

        // Copy data from old table to new table (excluding server_type)
        // Check if request_site_url exists in the old table
        const columns = await db.query("PRAGMA table_info(plex_servers)");
        const hasRequestSiteUrl = columns.some(col => col.name === 'request_site_url');

        if (hasRequestSiteUrl) {
            await db.query(`
                INSERT INTO plex_servers_new (
                    id, name, url, server_id, token, is_active, libraries,
                    last_library_sync, sync_schedule, last_health_check,
                    health_status, created_at, updated_at, request_site_url
                )
                SELECT
                    id, name, url, server_id, token, is_active, libraries,
                    last_library_sync, sync_schedule, last_health_check,
                    health_status, created_at, updated_at, request_site_url
                FROM plex_servers
            `);
        } else {
            await db.query(`
                INSERT INTO plex_servers_new (
                    id, name, url, server_id, token, is_active, libraries,
                    last_library_sync, sync_schedule, last_health_check,
                    health_status, created_at, updated_at
                )
                SELECT
                    id, name, url, server_id, token, is_active, libraries,
                    last_library_sync, sync_schedule, last_health_check,
                    health_status, created_at, updated_at
                FROM plex_servers
            `);
        }

        console.log('✓ Copied data from old table to new table');

        // Drop old table
        await db.query('DROP TABLE plex_servers');

        console.log('✓ Dropped old plex_servers table');

        // Rename new table to old table name
        await db.query('ALTER TABLE plex_servers_new RENAME TO plex_servers');

        console.log('✓ Renamed new table to plex_servers');

        // Recreate indexes (but not the server_type index)
        await db.query('CREATE INDEX IF NOT EXISTS idx_plex_servers_server_id ON plex_servers(server_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_plex_servers_is_active ON plex_servers(is_active)');

        console.log('✓ Recreated indexes');

        // Commit transaction
        await db.query('COMMIT');

        console.log('✅ Migration completed successfully!');
        console.log('   - Removed server_type column from plex_servers table');
        console.log('   - Removed idx_plex_servers_server_type index');

        process.exit(0);

    } catch (error) {
        // Rollback on error
        await db.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
