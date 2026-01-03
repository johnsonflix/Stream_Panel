/**
 * Migration: Fix plex share_status for existing records
 *
 * Records with library_ids but NULL share_status should be set to 'active'
 * so they appear in the end user portal.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Fixing plex share_status for existing records...');

    try {
        // Update all records that have library_ids but NULL or empty share_status to 'active'
        const result = db.prepare(`
            UPDATE user_plex_shares
            SET share_status = 'active',
                updated_at = datetime('now')
            WHERE library_ids IS NOT NULL
              AND library_ids != '[]'
              AND (share_status IS NULL OR share_status = '')
        `).run();

        console.log(`  Updated ${result.changes} records to share_status = 'active'`);

        db.close();
        console.log('Migration completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
