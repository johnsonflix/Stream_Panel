/**
 * Migration: Add Email Schedule Tracking Fields
 *
 * Adds columns to track detailed run status for email schedules
 */

const db = require('../database-config');

async function migrate() {
    console.log('Starting migration: add-email-schedule-tracking-fields');

    try {
        // Add last_run_count column
        try {
            await db.query(`ALTER TABLE email_schedules ADD COLUMN last_run_count INTEGER DEFAULT 0`);
            console.log('Added last_run_count column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('last_run_count column already exists');
            } else {
                throw e;
            }
        }

        // Add last_run_message column
        try {
            await db.query(`ALTER TABLE email_schedules ADD COLUMN last_run_message TEXT DEFAULT NULL`);
            console.log('Added last_run_message column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('last_run_message column already exists');
            } else {
                throw e;
            }
        }

        console.log('Migration completed successfully');
        return { success: true };

    } catch (error) {
        console.error('Migration failed:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    migrate()
        .then(() => {
            console.log('Migration finished');
            process.exit(0);
        })
        .catch(err => {
            console.error('Migration error:', err);
            process.exit(1);
        });
}

module.exports = { migrate };
