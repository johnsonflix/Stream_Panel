/**
 * Migration: Create Request Site Notification Settings
 *
 * Creates tables and settings for the comprehensive notification system:
 * - Notification agent settings (Email, Discord, Telegram, Webhook, WebPush)
 * - User notification preferences (overrides)
 * - WebPush subscriptions for browser notifications
 * - Notification logs for audit trail
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Creating request site notification settings...');

    // 1. Create email notification templates for request site
    db.exec(`
        INSERT OR IGNORE INTO email_templates (name, subject, body, template_type, category, is_system)
        VALUES
        ('Request Pending (Admin)', 'New Media Request: {{media_title}}',
         '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">New Media Request</h2>
            <p>A new request requires your attention:</p>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc;">{{media_title}}</h3>
                <p style="margin: 5px 0; color: #94a3b8;">Type: {{media_type}}</p>
                <p style="margin: 5px 0; color: #94a3b8;">Requested by: {{requester_name}}</p>
                {{#if is_4k}}<p style="margin: 5px 0; color: #fbbf24;">4K Request</p>{{/if}}
            </div>
            <p style="color: #64748b; font-size: 13px;">Login to the admin panel to approve or decline this request.</p>
         </div>',
         'request_site', 'notifications', 1),

        ('Request Approved (User)', 'Request Approved: {{media_title}}',
         '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Request Approved!</h2>
            <p>Great news! Your request has been approved:</p>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc;">{{media_title}}</h3>
                <p style="margin: 5px 0; color: #94a3b8;">Type: {{media_type}}</p>
                {{#if is_4k}}<p style="margin: 5px 0; color: #fbbf24;">4K Version</p>{{/if}}
            </div>
            <p style="color: #94a3b8;">Your content will be downloaded and added to Plex shortly. We will notify you when it is ready to watch!</p>
         </div>',
         'request_site', 'notifications', 1),

        ('Request Auto-Approved (User)', 'Request Auto-Approved: {{media_title}}',
         '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Request Auto-Approved!</h2>
            <p>Your request has been automatically approved:</p>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc;">{{media_title}}</h3>
                <p style="margin: 5px 0; color: #94a3b8;">Type: {{media_type}}</p>
                {{#if is_4k}}<p style="margin: 5px 0; color: #fbbf24;">4K Version</p>{{/if}}
            </div>
            <p style="color: #94a3b8;">Your content will be downloaded and added to Plex shortly. We will notify you when it is ready to watch!</p>
         </div>',
         'request_site', 'notifications', 1),

        ('Request Declined (User)', 'Request Declined: {{media_title}}',
         '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Request Declined</h2>
            <p>Unfortunately, your request has been declined:</p>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc;">{{media_title}}</h3>
                <p style="margin: 5px 0; color: #94a3b8;">Type: {{media_type}}</p>
                {{#if decline_reason}}<p style="margin: 10px 0 0 0; color: #fca5a5;">Reason: {{decline_reason}}</p>{{/if}}
            </div>
            <p style="color: #94a3b8;">If you have questions about this decision, please contact your administrator.</p>
         </div>',
         'request_site', 'notifications', 1),

        ('Media Available (User)', 'Now Available: {{media_title}}',
         '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Now Available on Plex!</h2>
            <p>Your requested content is ready to watch:</p>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc;">{{media_title}}</h3>
                <p style="margin: 5px 0; color: #94a3b8;">Type: {{media_type}}</p>
                {{#if is_4k}}<p style="margin: 5px 0; color: #fbbf24;">4K Version</p>{{/if}}
            </div>
            <p style="color: #94a3b8;">Open Plex and start watching now!</p>
         </div>',
         'request_site', 'notifications', 1)
    `);

    // 2. Insert default notification settings into request_site_settings
    const defaultSettings = [
        // Global notification event toggles
        { key: 'notify_admin_on_request', value: JSON.stringify(true) },
        { key: 'notify_approvers_on_request', value: JSON.stringify(true) },
        { key: 'notify_user_on_approved', value: JSON.stringify(true) },
        { key: 'notify_user_on_declined', value: JSON.stringify(true) },
        { key: 'notify_user_on_available', value: JSON.stringify(true) },

        // Email agent settings
        { key: 'notification_email', value: JSON.stringify({
            enabled: true,
            types: ['media_pending', 'media_approved', 'media_declined', 'media_available', 'media_auto_approved']
        })},

        // Discord agent settings
        { key: 'notification_discord', value: JSON.stringify({
            enabled: false,
            webhookUrl: '',
            types: ['media_pending', 'media_approved', 'media_declined', 'media_available']
        })},

        // Telegram agent settings
        { key: 'notification_telegram', value: JSON.stringify({
            enabled: false,
            botToken: '',
            chatId: '',
            sendSilently: false,
            types: ['media_pending', 'media_approved', 'media_declined', 'media_available']
        })},

        // Generic webhook settings
        { key: 'notification_webhook', value: JSON.stringify({
            enabled: false,
            webhookUrl: '',
            authHeader: '',
            types: ['media_pending', 'media_approved', 'media_declined', 'media_available']
        })},

        // WebPush settings
        { key: 'notification_webpush', value: JSON.stringify({
            enabled: false,
            types: ['media_pending', 'media_approved', 'media_declined', 'media_available']
        })}
    ];

    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO request_site_settings (key, value)
        VALUES (?, ?)
    `);

    for (const setting of defaultSettings) {
        insertSetting.run(setting.key, setting.value);
    }

    // 3. Create user notification preferences table
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_site_user_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,

            -- Which notification types to receive (NULL = use system default)
            notify_on_approved INTEGER DEFAULT NULL,
            notify_on_declined INTEGER DEFAULT NULL,
            notify_on_available INTEGER DEFAULT NULL,

            -- Channel preferences (NULL = use system default)
            email_enabled INTEGER DEFAULT NULL,
            discord_enabled INTEGER DEFAULT NULL,
            telegram_enabled INTEGER DEFAULT NULL,
            webpush_enabled INTEGER DEFAULT NULL,

            -- User-specific channel overrides
            discord_webhook TEXT,
            telegram_chat_id TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 4. Create WebPush subscriptions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_site_webpush_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, endpoint)
        )
    `);

    // 5. Create notification log table for audit trail
    db.exec(`
        CREATE TABLE IF NOT EXISTS request_site_notification_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            user_id INTEGER,
            notification_type TEXT NOT NULL,
            channel TEXT NOT NULL,
            recipient TEXT,
            subject TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            payload TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (request_id) REFERENCES request_site_requests(id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // 6. Create indexes for faster queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notification_logs_request ON request_site_notification_logs(request_id);
        CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON request_site_notification_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON request_site_notification_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_webpush_user ON request_site_webpush_subscriptions(user_id);
    `);

    db.close();
    console.log('[Migration] Request site notification settings created successfully');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
