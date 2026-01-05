/**
 * Migration: Add Service Cancellation Fields
 *
 * Adds columns to track cancellation status and scheduled deletion dates
 * for Plex and IPTV services.
 */

const db = require('../database-config');

async function migrate() {
    console.log('Starting migration: add-service-cancellation-fields');

    try {
        // Add plex_cancelled_at column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN plex_cancelled_at TEXT DEFAULT NULL`);
            console.log('Added plex_cancelled_at column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('plex_cancelled_at column already exists');
            } else {
                throw e;
            }
        }

        // Add plex_scheduled_deletion column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN plex_scheduled_deletion TEXT DEFAULT NULL`);
            console.log('Added plex_scheduled_deletion column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('plex_scheduled_deletion column already exists');
            } else {
                throw e;
            }
        }

        // Add iptv_cancelled_at column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN iptv_cancelled_at TEXT DEFAULT NULL`);
            console.log('Added iptv_cancelled_at column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('iptv_cancelled_at column already exists');
            } else {
                throw e;
            }
        }

        // Add iptv_scheduled_deletion column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN iptv_scheduled_deletion TEXT DEFAULT NULL`);
            console.log('Added iptv_scheduled_deletion column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('iptv_scheduled_deletion column already exists');
            } else {
                throw e;
            }
        }

        // Add plex_cancellation_reason column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN plex_cancellation_reason TEXT DEFAULT NULL`);
            console.log('Added plex_cancellation_reason column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('plex_cancellation_reason column already exists');
            } else {
                throw e;
            }
        }

        // Add iptv_cancellation_reason column
        try {
            await db.query(`ALTER TABLE users ADD COLUMN iptv_cancellation_reason TEXT DEFAULT NULL`);
            console.log('Added iptv_cancellation_reason column');
        } catch (e) {
            if (e.message.includes('duplicate column')) {
                console.log('iptv_cancellation_reason column already exists');
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
