/**
 * Migration: Add channel logos cache to iptv_panels table
 *
 * Stores parsed M3U channel logos as JSON for quick lookup
 * when displaying live streams on the dashboard.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding channel logos cache to iptv_panels table...');

    try {
        // Check if column exists
        const tableInfo = db.prepare("PRAGMA table_info(iptv_panels)").all();
        const hasLogosColumn = tableInfo.some(col => col.name === 'm3u_channel_logos');

        if (!hasLogosColumn) {
            // Add m3u_channel_logos column (stores JSON of channel -> logo mapping)
            db.exec(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_channel_logos TEXT DEFAULT NULL
            `);
            console.log('  Added m3u_channel_logos column');
        } else {
            console.log('  m3u_channel_logos column already exists');
        }

        // Verify table structure
        const updatedInfo = db.prepare("PRAGMA table_info(iptv_panels)").all();
        const logoCol = updatedInfo.find(col => col.name === 'm3u_channel_logos');
        if (logoCol) {
            console.log(`  Verified: m3u_channel_logos (${logoCol.type})`);
        }

        db.close();
        console.log('\nMigration completed successfully!');

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
