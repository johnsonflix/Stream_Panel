/**
 * Migration: Create request_site_blacklist table
 *
 * Tracks media that has been denied and should not be requested again.
 * When an admin denies a request, the media is added to this blacklist.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_blacklist table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER NOT NULL,
            media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),

            -- User who was denied (for tracking purposes)
            user_id INTEGER,

            -- Admin who denied the request
            denied_by INTEGER,

            -- Optional reason for denial
            reason TEXT,

            -- Timestamp
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            -- Foreign keys
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
            FOREIGN KEY (denied_by) REFERENCES app_users(id) ON DELETE SET NULL,

            -- Constraints
            UNIQUE(tmdb_id, media_type)
        )
    `);

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_blacklist_tmdb ON request_site_blacklist(tmdb_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_blacklist_type ON request_site_blacklist(media_type)`);

    console.log('[Migration] request_site_blacklist table created successfully');
}

async function down() {
    console.log('[Migration] Dropping request_site_blacklist table...');
    await query(`DROP TABLE IF EXISTS request_site_blacklist`);
    console.log('[Migration] request_site_blacklist table dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
