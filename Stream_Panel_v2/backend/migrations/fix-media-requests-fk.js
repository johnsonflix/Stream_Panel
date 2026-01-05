/**
 * Migration: Fix media_requests foreign key constraint
 *
 * The media_requests table incorrectly references app_users(id)
 * but portal users are in the users table.
 *
 * SQLite doesn't support ALTER TABLE to drop/add constraints,
 * so we need to recreate the table.
 */

const { query, getDb } = require('../database-config');

async function run() {
    try {
        // Check if table exists
        const tableExists = await query(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='media_requests'
        `);

        if (tableExists.length === 0) {
            // Table doesn't exist, nothing to do
            return;
        }

        // Check if the FK is already correct (references users, not app_users)
        const tableSchema = await query(`
            SELECT sql FROM sqlite_master
            WHERE type='table' AND name='media_requests'
        `);

        if (tableSchema.length > 0 && tableSchema[0].sql) {
            const sql = tableSchema[0].sql;
            // If it references users(id) and NOT app_users, we're done
            if (sql.includes('REFERENCES users(id)') && !sql.includes('app_users')) {
                // Already migrated, nothing to do
                return;
            }
        }

        console.log('[Migration] fix-media-requests-fk: Fixing media_requests foreign key...');

        // SQLite doesn't allow modifying foreign keys, but we can work around it
        // by disabling foreign key checks and recreating the table

        // First, backup existing data
        console.log('[Migration] Backing up existing requests...');
        const existingRequests = await query('SELECT * FROM media_requests');
        console.log(`[Migration] Found ${existingRequests.length} existing requests`);

        // Drop old table
        await query('DROP TABLE IF EXISTS media_requests_old');
        await query('ALTER TABLE media_requests RENAME TO media_requests_old');

        // Create new table with correct foreign key (references users instead of app_users)
        await query(`
            CREATE TABLE media_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tmdb_id INTEGER NOT NULL,
                tvdb_id INTEGER,
                imdb_id TEXT,
                media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
                title TEXT NOT NULL,
                poster_path TEXT,
                backdrop_path TEXT,
                overview TEXT,
                release_date TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'processing', 'available', 'declined', 'failed')),
                server_id INTEGER,
                external_id INTEGER,
                seasons TEXT,
                is_4k INTEGER DEFAULT 0,
                requested_by TEXT,
                approved_by INTEGER,
                requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                available_at DATETIME,
                notes TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (server_id) REFERENCES request_servers(id) ON DELETE SET NULL
            )
        `);

        // Create indexes
        await query('CREATE INDEX IF NOT EXISTS idx_media_requests_user_id ON media_requests(user_id)');
        await query('CREATE INDEX IF NOT EXISTS idx_media_requests_status ON media_requests(status)');
        await query('CREATE INDEX IF NOT EXISTS idx_media_requests_tmdb_id ON media_requests(tmdb_id)');
        await query('CREATE INDEX IF NOT EXISTS idx_media_requests_media_type ON media_requests(media_type)');

        // Restore data
        if (existingRequests.length > 0) {
            console.log('[Migration] Restoring requests...');
            for (const req of existingRequests) {
                await query(`
                    INSERT INTO media_requests (
                        id, user_id, tmdb_id, tvdb_id, imdb_id, media_type, title,
                        poster_path, backdrop_path, overview, release_date, status,
                        server_id, external_id, seasons, is_4k, requested_by,
                        approved_by, requested_at, processed_at, available_at, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    req.id, req.user_id, req.tmdb_id, req.tvdb_id, req.imdb_id,
                    req.media_type, req.title, req.poster_path, req.backdrop_path,
                    req.overview, req.release_date, req.status, req.server_id,
                    req.external_id, req.seasons, req.is_4k, req.requested_by,
                    req.approved_by, req.requested_at, req.processed_at,
                    req.available_at, req.notes
                ]);
            }
        }

        // Drop backup table
        await query('DROP TABLE media_requests_old');

        console.log('[Migration] ✅ media_requests foreign key fixed successfully');

    } catch (error) {
        console.error('[Migration] Error fixing media_requests:', error);
        // Try to restore from backup if something went wrong
        try {
            const backupExists = await query(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='media_requests_old'
            `);
            if (backupExists.length > 0) {
                await query('DROP TABLE IF EXISTS media_requests');
                await query('ALTER TABLE media_requests_old RENAME TO media_requests');
                console.log('[Migration] Restored original table from backup');
            }
        } catch (e) {
            console.error('[Migration] Failed to restore backup:', e);
        }
        throw error;
    }
}

// Auto-run when called directly
if (require.main === module) {
    run()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { run };
