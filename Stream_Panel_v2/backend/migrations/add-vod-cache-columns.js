/**
 * Migration: Add VOD cache columns to guide_cache table
 *
 * Adds columns for caching VOD (movies) and Series (TV shows) data
 * alongside the existing live TV guide cache.
 *
 * Run with: node migrations/add-vod-cache-columns.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';
const db = new Database(DB_PATH);

function migrate() {
    console.log('Starting migration: Add VOD cache columns to guide_cache...\n');

    try {
        // Check if columns already exist
        const columns = db.pragma('table_info(guide_cache)');
        const columnNames = columns.map(c => c.name);

        const columnsToAdd = [
            { name: 'vod_categories_json', type: 'TEXT', desc: 'VOD movie categories JSON' },
            { name: 'vod_movies_json', type: 'TEXT', desc: 'All VOD movies JSON' },
            { name: 'vod_movies_count', type: 'INTEGER DEFAULT 0', desc: 'Count of movies' },
            { name: 'series_categories_json', type: 'TEXT', desc: 'Series categories JSON' },
            { name: 'series_json', type: 'TEXT', desc: 'All series JSON' },
            { name: 'series_count', type: 'INTEGER DEFAULT 0', desc: 'Count of series' },
            { name: 'vod_last_updated', type: 'DATETIME', desc: 'VOD cache last updated time' }
        ];

        let addedCount = 0;
        for (const col of columnsToAdd) {
            if (!columnNames.includes(col.name)) {
                console.log(`Adding column: ${col.name} (${col.desc})`);
                db.exec(`ALTER TABLE guide_cache ADD COLUMN ${col.name} ${col.type}`);
                addedCount++;
            } else {
                console.log(`Column already exists: ${col.name} - skipping`);
            }
        }

        // Verify schema
        const updatedColumns = db.pragma('table_info(guide_cache)');
        console.log('\nUpdated guide_cache schema:');
        updatedColumns.forEach(col => {
            console.log(`   - ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''})`);
        });

        console.log(`\nMigration completed! Added ${addedCount} new columns.`);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Run migration
migrate();
