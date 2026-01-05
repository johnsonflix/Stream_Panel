/**
 * Migration: Create Notification Templates Table
 *
 * Stores customizable message templates for Request Site notifications.
 * Each template is specific to a notification_type + platform combination.
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Creating request_site_notification_templates table...');

    // Create notification templates table
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_site_notification_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_type TEXT NOT NULL CHECK(notification_type IN ('media_pending', 'media_approved', 'media_auto_approved', 'media_declined', 'media_available')),
            platform TEXT NOT NULL CHECK(platform IN ('discord', 'telegram', 'email', 'webpush')),
            title_template TEXT,
            body_template TEXT,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(notification_type, platform)
        )
    `);

    // Create index
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notification_templates_type_platform
        ON request_site_notification_templates(notification_type, platform);
    `);

    // Insert default templates
    const defaultTemplates = [
        // Discord templates
        { type: 'media_pending', platform: 'discord', title: '📬 New {{media_type}} Request', body: '**{{username}}** requested **{{media_title}}**{{#if is_4k}} (4K){{/if}}' },
        { type: 'media_approved', platform: 'discord', title: '✅ Request Approved', body: '**{{media_title}}** has been approved and is being processed.' },
        { type: 'media_auto_approved', platform: 'discord', title: '⚡ Request Auto-Approved', body: '**{{media_title}}** was automatically approved and is being processed.' },
        { type: 'media_declined', platform: 'discord', title: '❌ Request Declined', body: '**{{media_title}}** has been declined.{{#if reason}}\n\nReason: {{reason}}{{/if}}' },
        { type: 'media_available', platform: 'discord', title: '🎉 Now Available', body: '**{{media_title}}** is now available on Plex!' },

        // Telegram templates
        { type: 'media_pending', platform: 'telegram', title: '📬 New Request', body: '<b>{{username}}</b> requested <b>{{media_title}}</b>{{#if is_4k}} (4K){{/if}}\n\nType: {{media_type}}' },
        { type: 'media_approved', platform: 'telegram', title: '✅ Approved', body: '<b>{{media_title}}</b> has been approved!' },
        { type: 'media_auto_approved', platform: 'telegram', title: '⚡ Auto-Approved', body: '<b>{{media_title}}</b> was automatically approved!' },
        { type: 'media_declined', platform: 'telegram', title: '❌ Declined', body: '<b>{{media_title}}</b> was declined.{{#if reason}}\n\nReason: {{reason}}{{/if}}' },
        { type: 'media_available', platform: 'telegram', title: '🎉 Available', body: '<b>{{media_title}}</b> is now available on Plex!' },

        // Email templates (subject + body intro)
        { type: 'media_pending', platform: 'email', title: 'New Media Request: {{media_title}}', body: '{{username}} has requested {{media_title}}{{#if is_4k}} (4K){{/if}}.' },
        { type: 'media_approved', platform: 'email', title: 'Request Approved: {{media_title}}', body: 'Your request for {{media_title}} has been approved and is being processed.' },
        { type: 'media_auto_approved', platform: 'email', title: 'Request Auto-Approved: {{media_title}}', body: 'Your request for {{media_title}} was automatically approved and is being processed.' },
        { type: 'media_declined', platform: 'email', title: 'Request Declined: {{media_title}}', body: 'Your request for {{media_title}} has been declined.{{#if reason}} Reason: {{reason}}{{/if}}' },
        { type: 'media_available', platform: 'email', title: 'Now Available: {{media_title}}', body: '{{media_title}} is now available on Plex! Log in to start watching.' },

        // WebPush templates
        { type: 'media_pending', platform: 'webpush', title: 'New Request', body: '{{username}} requested {{media_title}}' },
        { type: 'media_approved', platform: 'webpush', title: 'Request Approved', body: '{{media_title}} has been approved!' },
        { type: 'media_auto_approved', platform: 'webpush', title: 'Auto-Approved', body: '{{media_title}} was auto-approved!' },
        { type: 'media_declined', platform: 'webpush', title: 'Request Declined', body: '{{media_title}} was declined' },
        { type: 'media_available', platform: 'webpush', title: 'Now Available!', body: '{{media_title}} is ready to watch!' }
    ];

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO request_site_notification_templates
        (notification_type, platform, title_template, body_template)
        VALUES (?, ?, ?, ?)
    `);

    for (const t of defaultTemplates) {
        insertStmt.run(t.type, t.platform, t.title, t.body);
    }

    db.close();
    console.log('[Migration] Notification templates table created with defaults!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
