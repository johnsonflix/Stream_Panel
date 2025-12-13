/**
 * Migration: Add Roku and Apple TV store URL columns to portal_apps
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');
const db = new Database(dbPath);

console.log('Running migration: add-roku-appletv-store-urls');

try {
    // Check if columns already exist
    const columns = db.prepare("PRAGMA table_info(portal_apps)").all();
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('store_url_roku')) {
        db.exec(`ALTER TABLE portal_apps ADD COLUMN store_url_roku TEXT`);
        console.log('Added store_url_roku column');
    } else {
        console.log('store_url_roku column already exists');
    }

    if (!columnNames.includes('store_url_appletv')) {
        db.exec(`ALTER TABLE portal_apps ADD COLUMN store_url_appletv TEXT`);
        console.log('Added store_url_appletv column');
    } else {
        console.log('store_url_appletv column already exists');
    }

    console.log('Migration completed successfully');
} catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
