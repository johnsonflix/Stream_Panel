/**
 * Migration: Add IPTV Editor fields to iptv_channel_groups table
 *
 * This migration adds three fields to store selected IPTV Editor content IDs
 * for channels, movies, and series when creating channel groups.
 */

const db = require('../database-config');

async function migrate() {
    console.log('🔄 Starting migration: Add IPTV Editor fields to iptv_channel_groups...');

    try {
        // SQLite doesn't support ADD COLUMN with default JSON, so we need to recreate the table
        await db.query('BEGIN TRANSACTION');

        // Create new table with editor fields
        await db.query(`
            CREATE TABLE iptv_channel_groups_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                iptv_panel_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                bouquet_ids TEXT NOT NULL,

                -- IPTV Editor Integration Fields
                editor_channel_ids TEXT DEFAULT '[]',
                editor_movie_ids TEXT DEFAULT '[]',
                editor_series_ids TEXT DEFAULT '[]',

                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),

                FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE CASCADE
            )
        `);

        console.log('✓ Created new iptv_channel_groups table with editor fields');

        // Copy data from old table to new table
        await db.query(`
            INSERT INTO iptv_channel_groups_new (
                id, iptv_panel_id, name, description, bouquet_ids,
                is_active, created_at, updated_at
            )
            SELECT
                id, iptv_panel_id, name, description, bouquet_ids,
                is_active, created_at, updated_at
            FROM iptv_channel_groups
        `);

        console.log('✓ Copied data from old table to new table');

        // Drop old table
        await db.query('DROP TABLE iptv_channel_groups');

        console.log('✓ Dropped old iptv_channel_groups table');

        // Rename new table to old table name
        await db.query('ALTER TABLE iptv_channel_groups_new RENAME TO iptv_channel_groups');

        console.log('✓ Renamed new table to iptv_channel_groups');

        // Recreate indexes
        await db.query('CREATE INDEX IF NOT EXISTS idx_channel_groups_panel ON iptv_channel_groups(iptv_panel_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_channel_groups_active ON iptv_channel_groups(is_active)');

        console.log('✓ Recreated indexes');

        // Commit transaction
        await db.query('COMMIT');

        console.log('✅ Migration completed successfully!');
        console.log('   - Added editor_channel_ids field to iptv_channel_groups table');
        console.log('   - Added editor_movie_ids field to iptv_channel_groups table');
        console.log('   - Added editor_series_ids field to iptv_channel_groups table');

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
