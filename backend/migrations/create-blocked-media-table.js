/**
 * Migration: Create Blocked Media Table
 *
 * Creates the blocked_media table for tracking media that admins have blocked from requests
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating blocked media table...');

    try {
        // Check if table already exists
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blocked_media'").get();

        if (!tableExists) {
            // Create blocked_media table
            db.exec(`
                CREATE TABLE blocked_media (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tmdb_id INTEGER NOT NULL,
                    media_type TEXT NOT NULL,
                    title TEXT,
                    poster_path TEXT,
                    blocked_by INTEGER,
                    blocked_reason TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tmdb_id, media_type)
                )
            `);
            console.log('  Created blocked_media table');

            // Create indexes
            db.exec(`CREATE INDEX idx_blocked_media_tmdb ON blocked_media(tmdb_id, media_type)`);
            console.log('  Created indexes');
        } else {
            console.log('  blocked_media table already exists');
        }

        db.close();

        console.log('');
        console.log('Migration completed successfully!');
        console.log('');

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
