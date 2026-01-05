/**
 * Migration: Add guide_m3u_url to iptv_editor_playlists
 *
 * Adds a field for storing a M3U URL for TV Guide data per playlist.
 * This allows the portal TV Guide to load channel listings from the playlist's
 * provider, and inject the user's credentials into stream URLs when playing.
 *
 * Run with: node migrations/add-guide-m3u-url-to-playlists.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(DB_PATH);

function migrate() {
    console.log('🚀 Starting migration: Add guide_m3u_url to iptv_editor_playlists...\n');

    try {
        // Check current schema
        const columns = db.pragma('table_info(iptv_editor_playlists)');
        const hasGuideM3uUrl = columns.some(col => col.name === 'guide_m3u_url');

        if (hasGuideM3uUrl) {
            console.log('✅ Column guide_m3u_url already exists - skipping');
            return;
        }

        // Add guide_m3u_url column
        console.log('📝 Adding guide_m3u_url column...');
        db.exec(`
            ALTER TABLE iptv_editor_playlists
            ADD COLUMN guide_m3u_url TEXT
        `);
        console.log('   ✅ Added guide_m3u_url column');

        // Verify
        const updatedColumns = db.pragma('table_info(iptv_editor_playlists)');
        console.log('\n📋 Current iptv_editor_playlists schema:');
        updatedColumns.forEach(col => {
            console.log(`   - ${col.name} (${col.type})`);
        });

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Run migration
migrate();
