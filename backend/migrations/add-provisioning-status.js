/**
 * Migration: Add Provisioning Status to Service Requests
 *
 * Adds provisioning_status column to track whether the wizard was completed
 * Values: null (not applicable), 'pending' (wizard not completed), 'completed' (service provisioned)
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding provisioning status tracking...');

    try {
        // Check for existing columns
        const tableInfo = db.pragma('table_info(portal_service_requests)');
        const existingColumns = tableInfo.map(col => col.name);

        if (!existingColumns.includes('provisioning_status')) {
            db.exec(`ALTER TABLE portal_service_requests ADD COLUMN provisioning_status TEXT DEFAULT NULL`);
            console.log('  Added provisioning_status column to portal_service_requests');

            // Update existing verified requests that haven't been provisioned
            // These are ones where payment was verified but we don't know if wizard completed
            // Set them to 'pending' so they show up in the list
            const result = db.prepare(`
                UPDATE portal_service_requests
                SET provisioning_status = 'pending'
                WHERE payment_status = 'verified' AND provisioning_status IS NULL
            `).run();
            console.log(`  Updated ${result.changes} existing verified requests to pending provisioning status`);
        } else {
            console.log('  provisioning_status column already exists');
        }

        if (!existingColumns.includes('provisioned_at')) {
            db.exec(`ALTER TABLE portal_service_requests ADD COLUMN provisioned_at DATETIME`);
            console.log('  Added provisioned_at column to portal_service_requests');
        } else {
            console.log('  provisioned_at column already exists');
        }

        // Create index for quick lookup of incomplete provisioning
        try {
            db.exec(`CREATE INDEX IF NOT EXISTS idx_service_requests_provisioning ON portal_service_requests(provisioning_status)`);
            console.log('  Created provisioning status index');
        } catch (e) {
            console.log('  Index already exists or could not be created');
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
