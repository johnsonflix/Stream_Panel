/**
 * Migration: Remove Notification Templates from Email Templates
 *
 * The notification templates for Request Site were incorrectly added to email_templates.
 * They should only exist in request_site_notification_templates table.
 * This migration removes them from email_templates.
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Removing notification templates from email_templates...');

    try {
        // Delete the request site notification templates that were incorrectly added to email_templates
        const result = db.prepare(`
            DELETE FROM email_templates
            WHERE category = 'notifications'
            AND template_type = 'request_site'
            AND is_system = 1
        `).run();

        console.log(`[Migration] Removed ${result.changes} notification templates from email_templates table`);
    } catch (error) {
        // Table or columns might not exist
        console.log('[Migration] email_templates table not found or no matching records');
    }

    db.close();
    console.log('[Migration] Notification templates cleanup complete');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
