/**
 * Migration: Create request_site_seasons table
 *
 * Tracks individual TV show seasons and their availability.
 * Based on Seerr's Season entity pattern.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_seasons table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            season_number INTEGER NOT NULL,

            -- Status (0=UNKNOWN, 1=PENDING, 2=PROCESSING, 3=PARTIALLY_AVAILABLE, 4=AVAILABLE)
            status INTEGER DEFAULT 0,
            status_4k INTEGER DEFAULT 0,

            -- Timestamps
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            -- Foreign key
            FOREIGN KEY (media_id) REFERENCES request_site_media(id) ON DELETE CASCADE,

            -- Constraints
            UNIQUE(media_id, season_number)
        )
    `);

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_seasons_media ON request_site_seasons(media_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_seasons_status ON request_site_seasons(status)`);

    console.log('[Migration] request_site_seasons table created successfully');
}

async function down() {
    console.log('[Migration] Dropping request_site_seasons table...');
    await query(`DROP TABLE IF EXISTS request_site_seasons`);
    console.log('[Migration] request_site_seasons table dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
