/**
 * Migration: Create WebPush Subscriptions Table
 *
 * Creates the table to store web push notification subscriptions
 * for the Request Site.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Creating request_site_webpush_subscriptions table...');

    await query(`
        CREATE TABLE IF NOT EXISTS request_site_webpush_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, endpoint)
        )
    `);

    // Create index for faster lookups by user_id
    await query(`
        CREATE INDEX IF NOT EXISTS idx_webpush_user_id
        ON request_site_webpush_subscriptions(user_id)
    `);

    console.log('[Migration] request_site_webpush_subscriptions table created successfully');
}

async function down() {
    await query('DROP TABLE IF EXISTS request_site_webpush_subscriptions');
}

module.exports = { up, down };
