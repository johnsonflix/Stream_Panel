/**
 * Migration: Add last_activity_sync column to plex_servers table
 *
 * This column tracks when the last full activity sync was performed for each server.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../subsapp_v2.db');

function migrate() {
    console.log('Adding last_activity_sync column to plex_servers table...');

    try {
        const db = new Database(DB_PATH);

        // Add last_activity_sync column
        try {
            db.exec(`ALTER TABLE plex_servers ADD COLUMN last_activity_sync TEXT`);
            console.log('Added last_activity_sync column');
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log('last_activity_sync column already exists');
            } else {
                throw e;
            }
        }

        db.close();
        console.log('Migration completed successfully');

    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
