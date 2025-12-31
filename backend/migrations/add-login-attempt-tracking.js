/**
 * Migration: Add Login Attempt Tracking
 *
 * Adds first_failed_attempt_at column to users table for time-window based lockout
 * - Tracks when the first failed login attempt occurred
 * - Used to implement "5 attempts within 15 minutes" lockout rule
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding login attempt tracking column...');

    try {
        // Check existing columns
        const tableInfo = db.pragma('table_info(users)');
        const existingColumns = tableInfo.map(col => col.name);

        // Add first_failed_attempt_at column if it doesn't exist
        if (!existingColumns.includes('first_failed_attempt_at')) {
            db.exec(`
                ALTER TABLE users
                ADD COLUMN first_failed_attempt_at TEXT
            `);
            console.log('  Added first_failed_attempt_at column');
        } else {
            console.log('  first_failed_attempt_at column already exists');
        }

        db.close();

        console.log('');
        console.log('Migration completed successfully!');
        console.log('');
        console.log('Summary:');
        console.log('  - first_failed_attempt_at: Tracks when first failed login in window occurred');
        console.log('  - Used for time-windowed lockout (5 attempts within 15 min = 30 min lockout)');
        console.log('');

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
