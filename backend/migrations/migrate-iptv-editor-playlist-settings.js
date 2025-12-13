/**
 * IPTV Editor Playlist Settings Migration
 * Moves provider and auto-updater settings from global to per-playlist
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');
const db = new Database(dbPath);

console.log('🔄 Starting IPTV Editor Playlist Settings migration...');

try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Add new columns to iptv_editor_playlists table
    console.log('📋 Adding settings columns to iptv_editor_playlists...');

    const tableInfo = db.prepare("PRAGMA table_info(iptv_editor_playlists)").all();
    const existingColumns = tableInfo.map(col => col.name);

    // Add provider_base_url if it doesn't exist
    if (!existingColumns.includes('provider_base_url')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN provider_base_url TEXT DEFAULT ''
        `);
        console.log('✅ Added provider_base_url column');
    }

    // Add provider_username if it doesn't exist
    if (!existingColumns.includes('provider_username')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN provider_username TEXT DEFAULT ''
        `);
        console.log('✅ Added provider_username column');
    }

    // Add provider_password if it doesn't exist
    if (!existingColumns.includes('provider_password')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN provider_password TEXT DEFAULT ''
        `);
        console.log('✅ Added provider_password column');
    }

    // Add auto_updater_enabled if it doesn't exist
    if (!existingColumns.includes('auto_updater_enabled')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN auto_updater_enabled INTEGER DEFAULT 0
        `);
        console.log('✅ Added auto_updater_enabled column');
    }

    // Add auto_updater_schedule_hours if it doesn't exist
    if (!existingColumns.includes('auto_updater_schedule_hours')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN auto_updater_schedule_hours INTEGER DEFAULT 24
        `);
        console.log('✅ Added auto_updater_schedule_hours column');
    }

    // Add last_auto_updater_run if it doesn't exist
    if (!existingColumns.includes('last_auto_updater_run')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN last_auto_updater_run TEXT
        `);
        console.log('✅ Added last_auto_updater_run column');
    }

    // Add auto_updater_status if it doesn't exist (for queue management)
    if (!existingColumns.includes('auto_updater_status')) {
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN auto_updater_status TEXT DEFAULT 'idle'
        `);
        console.log('✅ Added auto_updater_status column (for queue management)');
    }

    // 2. Remove old global settings that are now per-playlist
    console.log('📋 Removing deprecated global settings...');

    db.prepare(`
        DELETE FROM iptv_editor_settings
        WHERE setting_key IN (
            'provider_base_url',
            'provider_username',
            'provider_password',
            'auto_updater_enabled',
            'auto_updater_schedule_hours',
            'last_auto_updater_run'
        )
    `).run();

    console.log('✅ Removed global provider and auto-updater settings');

    // Commit transaction
    db.exec('COMMIT');

    console.log('✅ IPTV Editor Playlist Settings migration completed successfully!');
    process.exit(0);

} catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
