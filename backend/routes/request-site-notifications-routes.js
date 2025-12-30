/**
 * Request Site - Notification Settings Routes
 *
 * API endpoints for managing notification settings:
 * - GET/PUT system-level notification settings
 * - GET/PUT user-level notification preferences
 * - POST test notifications
 * - WebPush subscription management
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database-config');
const { requireAuth, requireAdmin } = require('../middleware/auth-middleware');
const {
    getNotificationSettings,
    getUserNotificationPreferences,
    sendTestNotification
} = require('../services/request-site-notifications');

/**
 * GET /api/v2/request-site/notifications/settings
 * Get all notification settings (admin only)
 */
router.get('/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const settings = await getNotificationSettings();
        if (!settings) {
            return res.status(500).json({ error: 'Failed to load notification settings' });
        }

        // Get email templates for request site
        const templates = await query(
            "SELECT id, name, subject FROM email_templates WHERE template_type = 'request_site' AND category = 'notifications'"
        );

        res.json({
            settings,
            templates
        });
    } catch (error) {
        console.error('[Notifications API] Error getting settings:', error);
        res.status(500).json({ error: 'Failed to load notification settings' });
    }
});

/**
 * PUT /api/v2/request-site/notifications/settings
 * Update notification settings (admin only)
 */
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const updates = req.body;

        // Map of setting keys to their database keys
        const settingMap = {
            notifyAdminOnRequest: 'notify_admin_on_request',
            notifyApproversOnRequest: 'notify_approvers_on_request',
            notifyUserOnApproved: 'notify_user_on_approved',
            notifyUserOnDeclined: 'notify_user_on_declined',
            notifyUserOnAvailable: 'notify_user_on_available',
            email: 'notification_email',
            discord: 'notification_discord',
            telegram: 'notification_telegram',
            webhook: 'notification_webhook',
            webpush: 'notification_webpush'
        };

        for (const [key, value] of Object.entries(updates)) {
            const dbKey = settingMap[key];
            if (dbKey) {
                const jsonValue = JSON.stringify(value);
                await query(`
                    INSERT INTO request_site_settings (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = ?
                `, [dbKey, jsonValue, jsonValue]);
            }
        }

        // Return updated settings
        const settings = await getNotificationSettings();
        res.json({ success: true, settings });
    } catch (error) {
        console.error('[Notifications API] Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update notification settings' });
    }
});

/**
 * POST /api/v2/request-site/notifications/test/:channel
 * Send a test notification
 */
router.post('/test/:channel', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { channel } = req.params;
        const settings = req.body;

        const validChannels = ['email', 'discord', 'telegram', 'webhook', 'webpush'];
        if (!validChannels.includes(channel)) {
            return res.status(400).json({ error: 'Invalid notification channel' });
        }

        const success = await sendTestNotification(channel, settings, req.user.id);

        if (success) {
            res.json({ success: true, message: `Test ${channel} notification sent successfully` });
        } else {
            res.status(400).json({ success: false, error: `Failed to send test ${channel} notification` });
        }
    } catch (error) {
        console.error('[Notifications API] Error sending test notification:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

/**
 * GET /api/v2/request-site/notifications/user-preferences
 * Get current user's notification preferences
 */
router.get('/user-preferences', requireAuth, async (req, res) => {
    try {
        const prefs = await getUserNotificationPreferences(req.user.id);
        res.json({ preferences: prefs });
    } catch (error) {
        console.error('[Notifications API] Error getting user preferences:', error);
        res.status(500).json({ error: 'Failed to load preferences' });
    }
});

/**
 * PUT /api/v2/request-site/notifications/user-preferences
 * Update current user's notification preferences
 */
router.put('/user-preferences', requireAuth, async (req, res) => {
    try {
        const {
            notify_on_approved,
            notify_on_declined,
            notify_on_available,
            email_enabled,
            discord_enabled,
            telegram_enabled,
            webpush_enabled,
            discord_webhook,
            telegram_chat_id
        } = req.body;

        // Check if user already has preferences
        const existing = await query(
            'SELECT id FROM request_site_user_notifications WHERE user_id = ?',
            [req.user.id]
        );

        if (existing.length > 0) {
            // Update existing
            await query(`
                UPDATE request_site_user_notifications SET
                    notify_on_approved = ?,
                    notify_on_declined = ?,
                    notify_on_available = ?,
                    email_enabled = ?,
                    discord_enabled = ?,
                    telegram_enabled = ?,
                    webpush_enabled = ?,
                    discord_webhook = ?,
                    telegram_chat_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [
                notify_on_approved ?? null,
                notify_on_declined ?? null,
                notify_on_available ?? null,
                email_enabled ?? null,
                discord_enabled ?? null,
                telegram_enabled ?? null,
                webpush_enabled ?? null,
                discord_webhook || null,
                telegram_chat_id || null,
                req.user.id
            ]);
        } else {
            // Insert new
            await query(`
                INSERT INTO request_site_user_notifications (
                    user_id, notify_on_approved, notify_on_declined, notify_on_available,
                    email_enabled, discord_enabled, telegram_enabled, webpush_enabled,
                    discord_webhook, telegram_chat_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                req.user.id,
                notify_on_approved ?? null,
                notify_on_declined ?? null,
                notify_on_available ?? null,
                email_enabled ?? null,
                discord_enabled ?? null,
                telegram_enabled ?? null,
                webpush_enabled ?? null,
                discord_webhook || null,
                telegram_chat_id || null
            ]);
        }

        const prefs = await getUserNotificationPreferences(req.user.id);
        res.json({ success: true, preferences: prefs });
    } catch (error) {
        console.error('[Notifications API] Error updating user preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

/**
 * POST /api/v2/request-site/notifications/webpush/subscribe
 * Register a WebPush subscription
 */
router.post('/webpush/subscribe', requireAuth, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ error: 'Invalid subscription data' });
        }

        // Check if subscription already exists
        const existing = await query(
            'SELECT id FROM request_site_webpush_subscriptions WHERE user_id = ? AND endpoint = ?',
            [req.user.id, endpoint]
        );

        if (existing.length > 0) {
            // Update existing
            await query(`
                UPDATE request_site_webpush_subscriptions
                SET p256dh = ?, auth = ?, user_agent = ?
                WHERE id = ?
            `, [keys.p256dh, keys.auth, req.headers['user-agent'], existing[0].id]);
        } else {
            // Insert new
            await query(`
                INSERT INTO request_site_webpush_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
                VALUES (?, ?, ?, ?, ?)
            `, [req.user.id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent']]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Notifications API] Error subscribing to WebPush:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

/**
 * POST /api/v2/request-site/notifications/webpush/unsubscribe
 * Remove a WebPush subscription
 */
router.post('/webpush/unsubscribe', requireAuth, async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint required' });
        }

        await query(
            'DELETE FROM request_site_webpush_subscriptions WHERE user_id = ? AND endpoint = ?',
            [req.user.id, endpoint]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[Notifications API] Error unsubscribing from WebPush:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

/**
 * GET /api/v2/request-site/notifications/webpush/vapid-key
 * Get VAPID public key for WebPush
 */
router.get('/webpush/vapid-key', requireAuth, async (req, res) => {
    try {
        const result = await query(
            "SELECT value FROM request_site_settings WHERE key = 'vapid_public_key'"
        );

        if (result.length > 0) {
            res.json({ publicKey: result[0].value });
        } else {
            res.json({ publicKey: null });
        }
    } catch (error) {
        console.error('[Notifications API] Error getting VAPID key:', error);
        res.status(500).json({ error: 'Failed to get VAPID key' });
    }
});

/**
 * POST /api/v2/request-site/notifications/webpush/generate-vapid
 * Generate new VAPID keys (admin only)
 */
router.post('/webpush/generate-vapid', requireAuth, requireAdmin, async (req, res) => {
    try {
        let webpush;
        try {
            webpush = require('web-push');
        } catch (e) {
            return res.status(500).json({ error: 'web-push package not installed' });
        }

        const vapidKeys = webpush.generateVAPIDKeys();

        // Get admin email for VAPID
        const adminResult = await query(
            "SELECT setting_value FROM settings WHERE setting_key = 'smtp_from'"
        );
        const vapidEmail = adminResult.length > 0 ? adminResult[0].setting_value : 'admin@localhost';

        // Save keys
        await query(`
            INSERT INTO request_site_settings (key, value)
            VALUES ('vapid_public_key', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?
        `, [vapidKeys.publicKey, vapidKeys.publicKey]);

        await query(`
            INSERT INTO request_site_settings (key, value)
            VALUES ('vapid_private_key', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?
        `, [vapidKeys.privateKey, vapidKeys.privateKey]);

        await query(`
            INSERT INTO request_site_settings (key, value)
            VALUES ('vapid_email', ?)
            ON CONFLICT(key) DO UPDATE SET value = ?
        `, [vapidEmail, vapidEmail]);

        res.json({
            success: true,
            publicKey: vapidKeys.publicKey
        });
    } catch (error) {
        console.error('[Notifications API] Error generating VAPID keys:', error);
        res.status(500).json({ error: 'Failed to generate VAPID keys' });
    }
});

/**
 * GET /api/v2/request-site/notifications/logs
 * Get notification logs (admin only)
 */
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0, channel, status } = req.query;

        let whereClause = '';
        const params = [];

        if (channel) {
            whereClause += ' WHERE channel = ?';
            params.push(channel);
        }

        if (status) {
            whereClause += whereClause ? ' AND status = ?' : ' WHERE status = ?';
            params.push(status);
        }

        params.push(parseInt(limit), parseInt(offset));

        const logs = await query(`
            SELECT l.*, u.username, u.name as user_name
            FROM request_site_notification_logs l
            LEFT JOIN users u ON l.user_id = u.id
            ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, params);

        const countResult = await query(`
            SELECT COUNT(*) as total FROM request_site_notification_logs ${whereClause}
        `, params.slice(0, -2));

        res.json({
            logs,
            total: countResult[0]?.total || 0,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('[Notifications API] Error getting logs:', error);
        res.status(500).json({ error: 'Failed to load notification logs' });
    }
});

/**
 * GET /api/v2/request-site/notifications/user/:userId/preferences
 * Get a specific user's notification preferences (admin only)
 */
router.get('/user/:userId/preferences', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const prefs = await query(
            'SELECT * FROM request_site_user_notifications WHERE user_id = ?',
            [userId]
        );
        res.json({ preferences: prefs.length > 0 ? prefs[0] : null });
    } catch (error) {
        console.error('[Notifications API] Error getting user preferences:', error);
        res.status(500).json({ error: 'Failed to load user preferences' });
    }
});

/**
 * PUT /api/v2/request-site/notifications/user/:userId/preferences
 * Update a specific user's notification preferences (admin only)
 */
router.put('/user/:userId/preferences', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            notify_on_approved,
            notify_on_declined,
            notify_on_available,
            email_enabled,
            discord_enabled,
            telegram_enabled,
            webpush_enabled,
            discord_webhook,
            telegram_chat_id
        } = req.body;

        // Check if user already has preferences
        const existing = await query(
            'SELECT id FROM request_site_user_notifications WHERE user_id = ?',
            [userId]
        );

        if (existing.length > 0) {
            // Update existing
            await query(`
                UPDATE request_site_user_notifications SET
                    notify_on_approved = ?,
                    notify_on_declined = ?,
                    notify_on_available = ?,
                    email_enabled = ?,
                    discord_enabled = ?,
                    telegram_enabled = ?,
                    webpush_enabled = ?,
                    discord_webhook = ?,
                    telegram_chat_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [
                notify_on_approved ?? null,
                notify_on_declined ?? null,
                notify_on_available ?? null,
                email_enabled ?? null,
                discord_enabled ?? null,
                telegram_enabled ?? null,
                webpush_enabled ?? null,
                discord_webhook || null,
                telegram_chat_id || null,
                userId
            ]);
        } else {
            // Insert new
            await query(`
                INSERT INTO request_site_user_notifications (
                    user_id, notify_on_approved, notify_on_declined, notify_on_available,
                    email_enabled, discord_enabled, telegram_enabled, webpush_enabled,
                    discord_webhook, telegram_chat_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                userId,
                notify_on_approved ?? null,
                notify_on_declined ?? null,
                notify_on_available ?? null,
                email_enabled ?? null,
                discord_enabled ?? null,
                telegram_enabled ?? null,
                webpush_enabled ?? null,
                discord_webhook || null,
                telegram_chat_id || null
            ]);
        }

        const prefs = await query(
            'SELECT * FROM request_site_user_notifications WHERE user_id = ?',
            [userId]
        );
        res.json({ success: true, preferences: prefs.length > 0 ? prefs[0] : null });
    } catch (error) {
        console.error('[Notifications API] Error updating user preferences:', error);
        res.status(500).json({ error: 'Failed to update user preferences' });
    }
});

/**
 * DELETE /api/v2/request-site/notifications/user/:userId/preferences
 * Reset a user's notification preferences to defaults (admin only)
 */
router.delete('/user/:userId/preferences', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        await query('DELETE FROM request_site_user_notifications WHERE user_id = ?', [userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('[Notifications API] Error resetting user preferences:', error);
        res.status(500).json({ error: 'Failed to reset user preferences' });
    }
});

// ============ Message Templates ============

/**
 * GET /api/v2/request-site/notifications/templates
 * Get all notification message templates (admin only)
 */
router.get('/templates', requireAuth, requireAdmin, async (req, res) => {
    try {
        const templates = await query(`
            SELECT * FROM request_site_notification_templates
            ORDER BY notification_type, platform
        `);

        // Group by notification_type for easier UI consumption
        const grouped = {};
        for (const t of templates) {
            if (!grouped[t.notification_type]) {
                grouped[t.notification_type] = {};
            }
            grouped[t.notification_type][t.platform] = t;
        }

        res.json({ templates, grouped });
    } catch (error) {
        console.error('[Notifications API] Error getting templates:', error);
        res.status(500).json({ error: 'Failed to load notification templates' });
    }
});

/**
 * PUT /api/v2/request-site/notifications/templates/:id
 * Update a notification message template (admin only)
 */
router.put('/templates/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title_template, body_template, is_enabled } = req.body;

        await query(`
            UPDATE request_site_notification_templates
            SET title_template = ?,
                body_template = ?,
                is_enabled = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [title_template, body_template, is_enabled ? 1 : 0, id]);

        const updated = await query('SELECT * FROM request_site_notification_templates WHERE id = ?', [id]);
        res.json({ success: true, template: updated[0] });
    } catch (error) {
        console.error('[Notifications API] Error updating template:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * POST /api/v2/request-site/notifications/templates/reset
 * Reset all templates to defaults (admin only)
 */
router.post('/templates/reset', requireAuth, requireAdmin, async (req, res) => {
    try {
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

            // Email templates
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

        for (const t of defaultTemplates) {
            await query(`
                UPDATE request_site_notification_templates
                SET title_template = ?, body_template = ?, is_enabled = 1, updated_at = CURRENT_TIMESTAMP
                WHERE notification_type = ? AND platform = ?
            `, [t.title, t.body, t.type, t.platform]);
        }

        const templates = await query('SELECT * FROM request_site_notification_templates ORDER BY notification_type, platform');
        res.json({ success: true, templates });
    } catch (error) {
        console.error('[Notifications API] Error resetting templates:', error);
        res.status(500).json({ error: 'Failed to reset templates' });
    }
});

/**
 * GET /api/v2/request-site/notifications/templates/variables
 * Get available template variables (for documentation)
 */
router.get('/templates/variables', requireAuth, requireAdmin, async (req, res) => {
    res.json({
        variables: [
            { name: '{{media_title}}', description: 'Title of the movie/show' },
            { name: '{{media_type}}', description: '"Movie" or "TV Show"' },
            { name: '{{username}}', description: 'Username of the requester' },
            { name: '{{is_4k}}', description: 'Whether this is a 4K request (use with {{#if is_4k}})' },
            { name: '{{reason}}', description: 'Decline reason (use with {{#if reason}})' },
            { name: '{{poster_url}}', description: 'Full URL to movie/show poster' },
            { name: '{{tmdb_id}}', description: 'TMDB ID of the media' },
            { name: '{{request_id}}', description: 'Internal request ID' }
        ],
        conditionals: [
            { syntax: '{{#if variable}}...{{/if}}', description: 'Show content only if variable exists' }
        ]
    });
});

module.exports = router;
