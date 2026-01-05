/**
 * Migration: Add EPG programs storage to guide_cache
 *
 * Adds columns to store XMLTV EPG program data alongside channel/category data
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || process.env.DB_PATH || '/app/data/subsapp_v2.db';

async function up() {
    const db = new Database(DB_PATH);

    try {
        console.log('Adding EPG columns to guide_cache table...');

        // Check if columns exist
        const tableInfo = db.prepare(`PRAGMA table_info(guide_cache)`).all();
        const columns = tableInfo.map(c => c.name);

        if (!columns.includes('epg_json')) {
            db.exec(`ALTER TABLE guide_cache ADD COLUMN epg_json TEXT`);
            console.log('  Added epg_json column');
        } else {
            console.log('  epg_json column already exists');
        }

        if (!columns.includes('epg_channel_count')) {
            db.exec(`ALTER TABLE guide_cache ADD COLUMN epg_channel_count INTEGER DEFAULT 0`);
            console.log('  Added epg_channel_count column');
        } else {
            console.log('  epg_channel_count column already exists');
        }

        if (!columns.includes('epg_program_count')) {
            db.exec(`ALTER TABLE guide_cache ADD COLUMN epg_program_count INTEGER DEFAULT 0`);
            console.log('  Added epg_program_count column');
        } else {
            console.log('  epg_program_count column already exists');
        }

        if (!columns.includes('epg_last_updated')) {
            db.exec(`ALTER TABLE guide_cache ADD COLUMN epg_last_updated DATETIME`);
            console.log('  Added epg_last_updated column');
        } else {
            console.log('  epg_last_updated column already exists');
        }

        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error.message);
        throw error;
    } finally {
        db.close();
    }
}

async function down() {
    const db = new Database(DB_PATH);

    try {
        console.log('Note: SQLite does not support DROP COLUMN easily.');
        console.log('To rollback, you would need to recreate the table without these columns.');
        // SQLite 3.35+ supports DROP COLUMN but older versions don't
        // For safety, we'll leave this as a no-op
    } finally {
        db.close();
    }
}

// Run migration if called directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('Done');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { up, down };
