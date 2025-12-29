/**
 * Migration: Add M3U URL field to iptv_panels table
 *
 * Allows panels to specify an M3U playlist URL for content counting
 * when IPTV Editor is not used
 */

const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

try {
    const db = new Database(dbPath);

    // Check current columns
    const columns = db.prepare("PRAGMA table_info(iptv_panels)").all();
    const columnNames = columns.map(col => col.name);

    // Check if all columns already exist
    const requiredColumns = ['m3u_url', 'm3u_last_sync', 'm3u_channel_count', 'm3u_movie_count', 'm3u_series_count'];
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

    if (missingColumns.length === 0) {
        // All columns exist, nothing to do
        db.close();
        process.exit(0);
    }

    console.log('🔄 Adding M3U fields to iptv_panels table...');

    // Add missing columns
    if (!columnNames.includes('m3u_url')) {
        db.exec('ALTER TABLE iptv_panels ADD COLUMN m3u_url TEXT DEFAULT NULL');
        console.log('✅ Added m3u_url field');
    }

    if (!columnNames.includes('m3u_last_sync')) {
        db.exec('ALTER TABLE iptv_panels ADD COLUMN m3u_last_sync DATETIME DEFAULT NULL');
        console.log('✅ Added m3u_last_sync field');
    }

    if (!columnNames.includes('m3u_channel_count')) {
        db.exec('ALTER TABLE iptv_panels ADD COLUMN m3u_channel_count INTEGER DEFAULT 0');
        console.log('✅ Added m3u_channel_count field');
    }

    if (!columnNames.includes('m3u_movie_count')) {
        db.exec('ALTER TABLE iptv_panels ADD COLUMN m3u_movie_count INTEGER DEFAULT 0');
        console.log('✅ Added m3u_movie_count field');
    }

    if (!columnNames.includes('m3u_series_count')) {
        db.exec('ALTER TABLE iptv_panels ADD COLUMN m3u_series_count INTEGER DEFAULT 0');
        console.log('✅ Added m3u_series_count field');
    }

    db.close();
    console.log('✅ Migration completed successfully!');
    process.exit(0);

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
