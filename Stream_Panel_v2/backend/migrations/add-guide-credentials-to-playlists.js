/**
 * Migration: Add guide credentials to IPTV Editor playlists
 *
 * Adds guide_username and guide_password fields to iptv_editor_playlists.
 * These credentials are used with the IPTV Editor DNS to fetch guide data
 * via Xtream Codes API for the TV Guide cache.
 *
 * Run with: node migrations/add-guide-credentials-to-playlists.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(DB_PATH);

function migrate() {
    console.log('🚀 Starting migration: Add guide credentials to IPTV Editor playlists...\n');

    try {
        // Check existing columns
        const columns = db.pragma('table_info(iptv_editor_playlists)');
        const columnNames = columns.map(c => c.name);

        // Add guide_username if not exists
        if (!columnNames.includes('guide_username')) {
            console.log('📝 Adding guide_username column...');
            db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN guide_username TEXT`);
            console.log('   ✅ Added guide_username');
        } else {
            console.log('✅ guide_username column already exists');
        }

        // Add guide_password if not exists
        if (!columnNames.includes('guide_password')) {
            console.log('📝 Adding guide_password column...');
            db.exec(`ALTER TABLE iptv_editor_playlists ADD COLUMN guide_password TEXT`);
            console.log('   ✅ Added guide_password');
        } else {
            console.log('✅ guide_password column already exists');
        }

        // Verify schema
        const updatedColumns = db.pragma('table_info(iptv_editor_playlists)');
        console.log('\n📋 Guide-related columns in iptv_editor_playlists:');
        updatedColumns
            .filter(c => c.name.includes('guide') || c.name.includes('provider'))
            .forEach(col => {
                console.log(`   - ${col.name} (${col.type})`);
            });

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📝 Note: Update the IPTV Editor playlist admin UI to show these new fields.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Run migration
migrate();
