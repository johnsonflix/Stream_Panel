/**
 * Migration: Create guide_cache table
 *
 * Creates a unified cache table for TV Guide data from both IPTV panels and IPTV Editor playlists.
 * Stores categories and channels as JSON for fast retrieval.
 *
 * Run with: node migrations/create-guide-cache-table.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(DB_PATH);

function migrate() {
    console.log('🚀 Starting migration: Create guide_cache table...\n');

    try {
        // Check if table already exists
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='guide_cache'
        `).get();

        if (tableExists) {
            console.log('✅ Table guide_cache already exists - skipping creation');
        } else {
            // Create guide_cache table
            console.log('📝 Creating guide_cache table...');
            db.exec(`
                CREATE TABLE guide_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL CHECK(source_type IN ('panel', 'playlist')),
                    source_id INTEGER NOT NULL,
                    categories_json TEXT,
                    channels_json TEXT,
                    total_categories INTEGER DEFAULT 0,
                    total_channels INTEGER DEFAULT 0,
                    last_updated DATETIME,
                    last_error TEXT,
                    created_at DATETIME DEFAULT (datetime('now')),
                    UNIQUE(source_type, source_id)
                )
            `);
            console.log('   ✅ Created guide_cache table');

            // Create index for fast lookups
            db.exec(`
                CREATE INDEX idx_guide_cache_source ON guide_cache(source_type, source_id)
            `);
            console.log('   ✅ Created index on source_type, source_id');
        }

        // Verify schema
        const columns = db.pragma('table_info(guide_cache)');
        console.log('\n📋 guide_cache schema:');
        columns.forEach(col => {
            console.log(`   - ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''})`);
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
