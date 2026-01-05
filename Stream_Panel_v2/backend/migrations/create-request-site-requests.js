/**
 * Migration: Create request_site_requests table
 *
 * Tracks all user requests for movies/TV shows.
 * Based on Seerr's MediaRequest entity pattern.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_requests table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,

            -- Request type and details
            is_4k BOOLEAN DEFAULT 0,

            -- Request status (1=PENDING, 2=APPROVED, 3=DECLINED, 4=AVAILABLE)
            status INTEGER DEFAULT 1,

            -- For TV shows: which seasons were requested
            -- JSON array of season numbers, e.g., "[1,2,3]" or "all"
            seasons TEXT,

            -- Service assignment (which Radarr/Sonarr instance to use)
            radarr_server_id INTEGER,
            sonarr_server_id INTEGER,

            -- Root folder path (from Radarr/Sonarr configuration)
            root_folder TEXT,

            -- Quality profile ID (from Radarr/Sonarr configuration)
            quality_profile_id INTEGER,

            -- Admin actions
            modified_by INTEGER, -- User ID who approved/declined

            -- Timestamps
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            -- Foreign keys
            FOREIGN KEY (media_id) REFERENCES request_site_media(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
            FOREIGN KEY (modified_by) REFERENCES app_users(id) ON DELETE SET NULL
        )
    `);

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_requests_media ON request_site_requests(media_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_requests_user ON request_site_requests(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_requests_status ON request_site_requests(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_request_site_requests_created ON request_site_requests(created_at)`);

    console.log('[Migration] request_site_requests table created successfully');
}

async function down() {
    console.log('[Migration] Dropping request_site_requests table...');
    await query(`DROP TABLE IF EXISTS request_site_requests`);
    console.log('[Migration] request_site_requests table dropped');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
