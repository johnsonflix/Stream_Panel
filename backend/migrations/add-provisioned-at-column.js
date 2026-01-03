/**
 * Migration: Add provisioned_at column to portal_service_requests
 *
 * This column was missing from the original migration if it was run before it was added.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding provisioned_at column if missing...');

    try {
        // Check for existing columns
        const tableInfo = db.pragma('table_info(portal_service_requests)');
        const existingColumns = tableInfo.map(col => col.name);

        if (!existingColumns.includes('provisioned_at')) {
            db.exec(`ALTER TABLE portal_service_requests ADD COLUMN provisioned_at DATETIME`);
            console.log('  Added provisioned_at column to portal_service_requests');
        } else {
            console.log('  provisioned_at column already exists');
        }

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
