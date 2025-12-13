/**
 * Fix IPTV Editor Playlists Schema Migration
 * Adds missing columns needed for playlist sync
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');
const db = new Database(dbPath);

console.log('🔄 Fixing IPTV Editor Playlists schema...');

try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // Get current table info
    const tableInfo = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const existingColumns = tableInfo.map(col => col.name);

    console.log('📋 Current columns:', existingColumns);

    // Add username if it doesn't exist
    if (!existingColumns.includes('username')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN username TEXT`);
        console.log('✅ Added username column');
    }

    // Add password if it doesn't exist
    if (!existingColumns.includes('password')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN password TEXT`);
        console.log('✅ Added password column');
    }

    // Add m3u_code if it doesn't exist
    if (!existingColumns.includes('m3u_code')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN m3u_code TEXT`);
        console.log('✅ Added m3u_code column');
    }

    // Add epg_code if it doesn't exist
    if (!existingColumns.includes('epg_code')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN epg_code TEXT`);
        console.log('✅ Added epg_code column');
    }

    // Add expiry_date if it doesn't exist
    if (!existingColumns.includes('expiry_date')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN expiry_date TEXT`);
        console.log('✅ Added expiry_date column');
    }

    // Add max_connections if it doesn't exist
    if (!existingColumns.includes('max_connections')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN max_connections INTEGER DEFAULT 1`);
        console.log('✅ Added max_connections column');
    }

    // Add customer_count if it doesn't exist
    if (!existingColumns.includes('customer_count')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN customer_count INTEGER DEFAULT 0`);
        console.log('✅ Added customer_count column');
    }

    // Add channel_count if it doesn't exist
    if (!existingColumns.includes('channel_count')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN channel_count INTEGER DEFAULT 0`);
        console.log('✅ Added channel_count column');
    }

    // Add movie_count if it doesn't exist
    if (!existingColumns.includes('movie_count')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN movie_count INTEGER DEFAULT 0`);
        console.log('✅ Added movie_count column');
    }

    // Add series_count if it doesn't exist
    if (!existingColumns.includes('series_count')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN series_count INTEGER DEFAULT 0`);
        console.log('✅ Added series_count column');
    }

    // Add patterns if it doesn't exist
    if (!existingColumns.includes('patterns')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN patterns TEXT DEFAULT '[]'`);
        console.log('✅ Added patterns column');
    }

    // Add last_synced if it doesn't exist
    if (!existingColumns.includes('last_synced')) {
        db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN last_synced TEXT`);
        console.log('✅ Added last_synced column');
    }

    // Commit transaction
    db.exec('COMMIT');

    console.log('✅ IPTV Editor Playlists schema fixed successfully!');
    process.exit(0);

} catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
