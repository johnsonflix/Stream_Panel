/**
 * Request Site - Notification Service
 *
 * Comprehensive notification system supporting:
 * - Email (using existing email service with templates)
 * - Discord (webhook with rich embeds)
 * - Telegram (bot API with markdown)
 * - Webhook (generic JSON payloads)
 * - WebPush (browser push notifications with VAPID)
 *
 * Features:
 * - System-level default settings
 * - User-level preference overrides
 * - Role-based notification routing (approvers get relevant requests)
 * - Notification logging for audit trail
 */

const { query } = require('../database-config');
const axios = require('axios');
const { sendEmail } = require('./email-service');

/**
 * Notification types
 */
const NotificationType = {
    MEDIA_PENDING: 'media_pending',
    MEDIA_APPROVED: 'media_approved',
    MEDIA_DECLINED: 'media_declined',
    MEDIA_AVAILABLE: 'media_available',
    MEDIA_FAILED: 'media_failed',
    MEDIA_AUTO_APPROVED: 'media_auto_approved',
    TEST_NOTIFICATION: 'test_notification'
};

/**
 * Get system-level notification settings
 */
async function getNotificationSettings() {
    try {
        const settings = await query("SELECT key, value FROM request_site_settings WHERE key LIKE 'notification_%' OR key LIKE 'notify_%'");

        const notificationSettings = {
            notifyAdminOnRequest: true,
            notifyApproversOnRequest: true,
            notifyUserOnApproved: true,
            notifyUserOnDeclined: true,
            notifyUserOnAvailable: true,
            email: { enabled: true, types: ['media_pending', 'media_approved', 'media_declined', 'media_available', 'media_auto_approved'] },
            discord: { enabled: false, webhookUrl: '', botUsername: '', botAvatarUrl: '', types: [] },
            telegram: { enabled: false, botToken: '', botUsername: '', chatId: '', sendSilently: false, types: [] },
            webhook: { enabled: false, webhookUrl: '', authHeader: '', jsonPayload: '', types: [] },
            webpush: { enabled: false, types: [] }
        };

        for (const setting of settings) {
            try {
                const value = JSON.parse(setting.value);
                switch (setting.key) {
                    case 'notify_admin_on_request': notificationSettings.notifyAdminOnRequest = value; break;
                    case 'notify_approvers_on_request': notificationSettings.notifyApproversOnRequest = value; break;
                    case 'notify_user_on_approved': notificationSettings.notifyUserOnApproved = value; break;
                    case 'notify_user_on_declined': notificationSettings.notifyUserOnDeclined = value; break;
                    case 'notify_user_on_available': notificationSettings.notifyUserOnAvailable = value; break;
                    case 'notification_email': notificationSettings.email = { ...notificationSettings.email, ...value }; break;
                    case 'notification_discord': notificationSettings.discord = { ...notificationSettings.discord, ...value }; break;
                    case 'notification_telegram': notificationSettings.telegram = { ...notificationSettings.telegram, ...value }; break;
                    case 'notification_webhook': notificationSettings.webhook = { ...notificationSettings.webhook, ...value }; break;
                    case 'notification_webpush': notificationSettings.webpush = { ...notificationSettings.webpush, ...value }; break;
                }
            } catch (e) { /* ignore parse errors */ }
        }
        return notificationSettings;
    } catch (error) {
        console.error('[Notifications] Error getting settings:', error);
        return null;
    }
}

/**
 * Get user's notification preferences
 */
async function getUserNotificationPreferences(userId) {
    try {
        const prefs = await query('SELECT * FROM request_site_user_notifications WHERE user_id = ?', [userId]);
        return prefs.length > 0 ? prefs[0] : null;
    } catch (error) {
        return null;
    }
}

/**
 * Get admins and approvers who should receive notification
 */
async function getNotificationRecipients(mediaType, is4k) {
    try {
        let whereClause = 'WHERE (rs_can_manage_requests = 1';
        if (is4k) {
            whereClause += ' OR rs_can_auto_approve_4k = 1';
        } else if (mediaType === 'movie') {
            whereClause += ' OR rs_can_auto_approve_movie = 1';
        } else {
            whereClause += ' OR rs_can_auto_approve_tv = 1';
        }
        whereClause += ") AND email IS NOT NULL AND email != ''";

        return await query(`SELECT id, username, name, email FROM users ${whereClause}`);
    } catch (error) {
        return [];
    }
}

/**
 * Log a notification attempt
 */
async function logNotification(data) {
    try {
        await query(`INSERT INTO request_site_notification_logs
            (request_id, user_id, notification_type, channel, recipient, subject, status, error_message, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.requestId || null, data.userId || null, data.notificationType, data.channel,
             data.recipient || null, data.subject || null, data.status || 'sent',
             data.errorMessage || null, data.payload ? JSON.stringify(data.payload) : null]);
    } catch (error) { /* ignore logging errors */ }
}

/**
 * Get email template by name
 */
async function getEmailTemplate(templateName) {
    try {
        const templates = await query("SELECT * FROM email_templates WHERE name = ? AND template_type = 'request_site'", [templateName]);
        return templates.length > 0 ? templates[0] : null;
    } catch (error) {
        return null;
    }
}

/**
 * Replace template placeholders
 */
function replaceTemplatePlaceholders(text, data) {
    if (!text) return text;
    const replacements = {
        '{{media_title}}': data.mediaTitle || '',
        '{{media_type}}': data.mediaType === 'movie' ? 'Movie' : 'TV Show',
        '{{requester_name}}': data.requesterName || data.username || 'User',
        '{{is_4k}}': data.is4k ? 'true' : '',
        '{{decline_reason}}': data.reason || ''
    };

    let result = text;
    // Handle {{#if variable}}...{{/if}} blocks
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
        const value = replacements[`{{${variable}}}`];
        return (value && value !== '' && value !== 'false') ? content : '';
    });
    // Replace simple placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return result;
}

/**
 * Send email notification
 */
async function sendEmailNotification(recipient, type, data) {
    try {
        const templateMap = {
            [NotificationType.MEDIA_PENDING]: 'Request Pending (Admin)',
            [NotificationType.MEDIA_APPROVED]: 'Request Approved (User)',
            [NotificationType.MEDIA_AUTO_APPROVED]: 'Request Auto-Approved (User)',
            [NotificationType.MEDIA_DECLINED]: 'Request Declined (User)',
            [NotificationType.MEDIA_AVAILABLE]: 'Media Available (User)'
        };

        const template = await getEmailTemplate(templateMap[type]);
        let subject, html;

        if (template) {
            subject = replaceTemplatePlaceholders(template.subject, data);
            html = replaceTemplatePlaceholders(template.body, data);
        } else {
            // Fallback templates
            const mediaType = data.mediaType === 'movie' ? 'Movie' : 'TV Show';
            switch (type) {
                case NotificationType.MEDIA_PENDING:
                    subject = `New Request: ${data.mediaTitle}`;
                    html = `<h2>New Media Request</h2><p><strong>${data.username}</strong> has requested:</p><p><strong>${data.mediaTitle}</strong> (${mediaType})</p>${data.is4k ? '<p><strong>4K Request</strong></p>' : ''}<p>Status: Pending Approval</p>`;
                    break;
                case NotificationType.MEDIA_APPROVED:
                    subject = `Request Approved: ${data.mediaTitle}`;
                    html = `<h2>Request Approved</h2><p>Your request for <strong>${data.mediaTitle}</strong> has been approved!</p>${data.is4k ? '<p><strong>4K Version</strong></p>' : ''}<p>It will be downloaded and added to Plex shortly.</p>`;
                    break;
                case NotificationType.MEDIA_AUTO_APPROVED:
                    subject = `Request Auto-Approved: ${data.mediaTitle}`;
                    html = `<h2>Request Auto-Approved</h2><p>Your request for <strong>${data.mediaTitle}</strong> has been automatically approved!</p>${data.is4k ? '<p><strong>4K Version</strong></p>' : ''}<p>It will be downloaded and added to Plex shortly.</p>`;
                    break;
                case NotificationType.MEDIA_DECLINED:
                    subject = `Request Declined: ${data.mediaTitle}`;
                    html = `<h2>Request Declined</h2><p>Your request for <strong>${data.mediaTitle}</strong> has been declined.</p>${data.reason ? `<p>Reason: ${data.reason}</p>` : ''}`;
                    break;
                case NotificationType.MEDIA_AVAILABLE:
                    subject = `Now Available: ${data.mediaTitle}`;
                    html = `<h2>Media Now Available!</h2><p><strong>${data.mediaTitle}</strong> is now available on Plex!</p>${data.is4k ? '<p><strong>4K Version</strong></p>' : ''}<p>You can start watching it now.</p>`;
                    break;
                case NotificationType.TEST_NOTIFICATION:
                    subject = 'Test Notification - Stream Panel';
                    html = `<h2>Test Notification</h2><p>If you're seeing this, email notifications are working correctly!</p>`;
                    break;
                default:
                    return false;
            }
        }

        const result = await sendEmail({ to: recipient.email, subject, html });
        await logNotification({ requestId: data.requestId, userId: recipient.id, notificationType: type, channel: 'email', recipient: recipient.email, subject, status: result.success ? 'sent' : 'failed', errorMessage: result.error });
        if (result.success) console.log(`[Notifications] Email sent to ${recipient.email} for ${type}`);
        return result.success;
    } catch (error) {
        console.error('[Notifications] Email error:', error);
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'email', recipient: recipient?.email, status: 'failed', errorMessage: error.message });
        return false;
    }
}

/**
 * Send Discord webhook notification
 * @param {string} webhookUrl - Discord webhook URL
 * @param {string} type - Notification type
 * @param {object} data - Notification data
 * @param {object} discordSettings - Discord settings (botUsername, botAvatarUrl)
 */
async function sendDiscordNotification(webhookUrl, type, data, discordSettings = {}) {
    try {
        const colors = { [NotificationType.MEDIA_PENDING]: 0xFFA500, [NotificationType.MEDIA_APPROVED]: 0x22C55E, [NotificationType.MEDIA_AUTO_APPROVED]: 0x22C55E, [NotificationType.MEDIA_DECLINED]: 0xEF4444, [NotificationType.MEDIA_AVAILABLE]: 0x6366F1, [NotificationType.TEST_NOTIFICATION]: 0x6366F1 };
        const icons = { [NotificationType.MEDIA_PENDING]: '📬', [NotificationType.MEDIA_APPROVED]: '✅', [NotificationType.MEDIA_AUTO_APPROVED]: '⚡', [NotificationType.MEDIA_DECLINED]: '❌', [NotificationType.MEDIA_AVAILABLE]: '🎉', [NotificationType.TEST_NOTIFICATION]: '🔔' };
        const mediaType = data.mediaType === 'movie' ? 'Movie' : 'TV Show';

        let embed = { color: colors[type] || 0x6366F1, timestamp: new Date().toISOString(), footer: { text: 'Stream Panel' } };
        if (data.posterPath) embed.thumbnail = { url: `https://image.tmdb.org/t/p/w300${data.posterPath}` };

        switch (type) {
            case NotificationType.MEDIA_PENDING:
                embed.title = `${icons[type]} New ${data.is4k ? '4K ' : ''}${mediaType} Request`;
                embed.description = `**${data.mediaTitle}**`;
                embed.fields = [{ name: 'Requested By', value: data.username || 'Unknown', inline: true }, { name: 'Type', value: mediaType, inline: true }];
                if (data.is4k) embed.fields.push({ name: 'Quality', value: '4K', inline: true });
                break;
            case NotificationType.MEDIA_APPROVED:
            case NotificationType.MEDIA_AUTO_APPROVED:
                embed.title = `${icons[type]} ${type === NotificationType.MEDIA_AUTO_APPROVED ? 'Auto-Approved' : 'Request Approved'}`;
                embed.description = `**${data.mediaTitle}** has been approved!`;
                embed.fields = [{ name: 'Type', value: mediaType, inline: true }];
                break;
            case NotificationType.MEDIA_DECLINED:
                embed.title = `${icons[type]} Request Declined`;
                embed.description = `**${data.mediaTitle}** has been declined.`;
                if (data.reason) embed.fields = [{ name: 'Reason', value: data.reason }];
                break;
            case NotificationType.MEDIA_AVAILABLE:
                embed.title = `${icons[type]} Now Available!`;
                embed.description = `**${data.mediaTitle}** is now available on Plex!`;
                break;
            case NotificationType.TEST_NOTIFICATION:
                embed.title = `${icons[type]} Test Notification`;
                embed.description = 'Discord notifications are working!';
                break;
            default: return false;
        }

        // Build Discord payload with optional bot username and avatar
        const payload = { embeds: [embed] };
        if (discordSettings.botUsername) payload.username = discordSettings.botUsername;
        else payload.username = 'Stream Panel';
        if (discordSettings.botAvatarUrl) payload.avatar_url = discordSettings.botAvatarUrl;

        await axios.post(webhookUrl, payload, { timeout: 10000 });
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'discord', status: 'sent' });
        console.log(`[Notifications] Discord webhook sent for ${type}`);
        return true;
    } catch (error) {
        console.error('[Notifications] Discord error:', error.message);
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'discord', status: 'failed', errorMessage: error.message });
        return false;
    }
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(botToken, chatId, type, data, sendSilently = false) {
    try {
        const icons = { [NotificationType.MEDIA_PENDING]: '📬', [NotificationType.MEDIA_APPROVED]: '✅', [NotificationType.MEDIA_AUTO_APPROVED]: '⚡', [NotificationType.MEDIA_DECLINED]: '❌', [NotificationType.MEDIA_AVAILABLE]: '🎉', [NotificationType.TEST_NOTIFICATION]: '🔔' };
        const mediaType = data.mediaType === 'movie' ? 'Movie' : 'TV Show';
        let message = '';

        switch (type) {
            case NotificationType.MEDIA_PENDING:
                message = `${icons[type]} *New ${data.is4k ? '4K ' : ''}${mediaType} Request*\n\n*${data.mediaTitle}*\nRequested by: ${data.username || 'Unknown'}`;
                break;
            case NotificationType.MEDIA_APPROVED:
                message = `${icons[type]} *Request Approved*\n\n*${data.mediaTitle}*\nYour request has been approved!`;
                break;
            case NotificationType.MEDIA_AUTO_APPROVED:
                message = `${icons[type]} *Auto-Approved*\n\n*${data.mediaTitle}*\nYour request was automatically approved.`;
                break;
            case NotificationType.MEDIA_DECLINED:
                message = `${icons[type]} *Request Declined*\n\n*${data.mediaTitle}*\n${data.reason ? `Reason: ${data.reason}` : 'Your request has been declined.'}`;
                break;
            case NotificationType.MEDIA_AVAILABLE:
                message = `${icons[type]} *Now Available!*\n\n*${data.mediaTitle}*\nNow available on Plex!`;
                break;
            case NotificationType.TEST_NOTIFICATION:
                message = `${icons[type]} *Test Notification*\n\nTelegram notifications are working!`;
                break;
            default: return false;
        }

        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: message, parse_mode: 'Markdown', disable_notification: sendSilently }, { timeout: 10000 });
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'telegram', recipient: chatId, status: 'sent' });
        console.log(`[Notifications] Telegram message sent for ${type}`);
        return true;
    } catch (error) {
        console.error('[Notifications] Telegram error:', error.message);
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'telegram', status: 'failed', errorMessage: error.message });
        return false;
    }
}

/**
 * Send generic webhook notification
 * @param {string} webhookUrl - Webhook URL
 * @param {string} type - Notification type
 * @param {object} data - Notification data
 * @param {string} authHeader - Authorization header value
 * @param {string} jsonPayloadTemplate - Custom JSON payload template (optional)
 */
async function sendWebhookNotification(webhookUrl, type, data, authHeader = '', jsonPayloadTemplate = '') {
    try {
        let payload;

        if (jsonPayloadTemplate && jsonPayloadTemplate.trim()) {
            // Use custom JSON template with placeholder replacement
            const placeholders = {
                '{{notification_type}}': type,
                '{{event}}': type,
                '{{subject}}': data.mediaTitle || '',
                '{{message}}': getWebhookMessage(type, data),
                '{{image}}': data.posterPath ? `https://image.tmdb.org/t/p/w300${data.posterPath}` : '',
                '{{media_title}}': data.mediaTitle || '',
                '{{media_type}}': data.mediaType === 'movie' ? 'Movie' : 'TV Show',
                '{{media_tmdbid}}': data.tmdbId || '',
                '{{media_tvdbid}}': data.tvdbId || '',
                '{{media_imdbid}}': data.imdbId || '',
                '{{media_status}}': type.replace('media_', ''),
                '{{media_is4k}}': data.is4k ? 'true' : 'false',
                '{{request_id}}': data.requestId || '',
                '{{requestedby_username}}': data.username || '',
                '{{requestedby_email}}': data.userEmail || '',
                '{{extra}}': data.reason || ''
            };

            let payloadStr = jsonPayloadTemplate;
            for (const [key, value] of Object.entries(placeholders)) {
                payloadStr = payloadStr.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '');
            }

            try {
                payload = JSON.parse(payloadStr);
            } catch (parseError) {
                console.error('[Notifications] Invalid JSON template:', parseError.message);
                // Fall back to default payload
                payload = getDefaultWebhookPayload(type, data);
            }
        } else {
            // Use default payload structure
            payload = getDefaultWebhookPayload(type, data);
        }

        const headers = { 'Content-Type': 'application/json', 'User-Agent': 'StreamPanel/1.0' };
        if (authHeader) headers['Authorization'] = authHeader;

        await axios.post(webhookUrl, payload, { headers, timeout: 10000 });
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'webhook', status: 'sent', payload });
        console.log(`[Notifications] Webhook sent for ${type}`);
        return true;
    } catch (error) {
        console.error('[Notifications] Webhook error:', error.message);
        await logNotification({ requestId: data.requestId, notificationType: type, channel: 'webhook', status: 'failed', errorMessage: error.message });
        return false;
    }
}

/**
 * Get default webhook message based on notification type
 */
function getWebhookMessage(type, data) {
    const mediaType = data.mediaType === 'movie' ? 'Movie' : 'TV Show';
    switch (type) {
        case NotificationType.MEDIA_PENDING:
            return `${data.username || 'Someone'} requested ${data.mediaTitle}${data.is4k ? ' (4K)' : ''}`;
        case NotificationType.MEDIA_APPROVED:
            return `${data.mediaTitle} has been approved`;
        case NotificationType.MEDIA_AUTO_APPROVED:
            return `${data.mediaTitle} has been automatically approved`;
        case NotificationType.MEDIA_DECLINED:
            return `${data.mediaTitle} has been declined${data.reason ? `: ${data.reason}` : ''}`;
        case NotificationType.MEDIA_AVAILABLE:
            return `${data.mediaTitle} is now available on Plex`;
        case NotificationType.TEST_NOTIFICATION:
            return 'Webhook notifications are working!';
        default:
            return data.mediaTitle || 'Notification';
    }
}

/**
 * Get default webhook payload structure
 */
function getDefaultWebhookPayload(type, data) {
    return {
        notification_type: type,
        event: type,
        subject: data.mediaTitle || '',
        message: getWebhookMessage(type, data),
        image: data.posterPath ? `https://image.tmdb.org/t/p/w300${data.posterPath}` : '',
        timestamp: new Date().toISOString(),
        media: {
            title: data.mediaTitle,
            type: data.mediaType,
            tmdbId: data.tmdbId,
            is4k: data.is4k || false
        },
        request: {
            id: data.requestId,
            status: type.replace('media_', ''),
            requestedBy: data.username,
            declineReason: data.reason
        }
    };
}

/**
 * Send WebPush notification
 */
async function sendWebPushNotification(userId, type, data) {
    try {
        const subscriptions = await query('SELECT * FROM request_site_webpush_subscriptions WHERE user_id = ?', [userId]);
        if (subscriptions.length === 0) return false;

        const vapidSettings = await query("SELECT key, value FROM request_site_settings WHERE key IN ('vapid_public_key', 'vapid_private_key', 'vapid_email')");
        const vapidConfig = {};
        vapidSettings.forEach(s => { vapidConfig[s.key] = s.value; });
        if (!vapidConfig.vapid_public_key || !vapidConfig.vapid_private_key) return false;

        let webpush;
        try { webpush = require('web-push'); } catch (e) { return false; }

        webpush.setVapidDetails(`mailto:${vapidConfig.vapid_email || 'admin@localhost'}`, vapidConfig.vapid_public_key, vapidConfig.vapid_private_key);

        const titles = { [NotificationType.MEDIA_PENDING]: '📬 New Request', [NotificationType.MEDIA_APPROVED]: '✅ Request Approved', [NotificationType.MEDIA_AUTO_APPROVED]: '⚡ Auto-Approved', [NotificationType.MEDIA_DECLINED]: '❌ Request Declined', [NotificationType.MEDIA_AVAILABLE]: '🎉 Now Available!', [NotificationType.TEST_NOTIFICATION]: '🔔 Test' };
        const payload = JSON.stringify({ title: titles[type] || 'Notification', body: data.mediaTitle || 'Stream Panel', data: { type, mediaTitle: data.mediaTitle, requestId: data.requestId } });

        let successCount = 0;
        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
                successCount++;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await query('DELETE FROM request_site_webpush_subscriptions WHERE id = ?', [sub.id]);
                }
            }
        }
        if (successCount > 0) await logNotification({ requestId: data.requestId, userId, notificationType: type, channel: 'webpush', status: 'sent' });
        return successCount > 0;
    } catch (error) {
        console.error('[Notifications] WebPush error:', error);
        return false;
    }
}

/**
 * Check if notification type is enabled for an agent
 */
function isTypeEnabled(agentSettings, type) {
    if (!agentSettings.enabled) return false;
    if (!agentSettings.types || agentSettings.types.length === 0) return true;
    return agentSettings.types.includes(type);
}

/**
 * Send notification to all enabled agents
 */
async function sendNotification(type, data) {
    try {
        const settings = await getNotificationSettings();
        if (!settings) return;

        let user = null;
        if (data.userId) {
            const users = await query('SELECT * FROM users WHERE id = ?', [data.userId]);
            if (users.length > 0) user = users[0];
        }

        const userPrefs = user ? await getUserNotificationPreferences(user.id) : null;

        // Notification categories:
        // - Admin channels (Discord/Telegram/Webhook): new requests + media available
        // - User channels (Email/WebPush): approved, auto-approved, declined, available
        const isUserNotification = [NotificationType.MEDIA_APPROVED, NotificationType.MEDIA_AUTO_APPROVED, NotificationType.MEDIA_DECLINED, NotificationType.MEDIA_AVAILABLE].includes(type);

        // Check global toggles for user notifications
        if (type === NotificationType.MEDIA_APPROVED && !settings.notifyUserOnApproved) return;
        if (type === NotificationType.MEDIA_DECLINED && !settings.notifyUserOnDeclined) return;
        if (type === NotificationType.MEDIA_AVAILABLE && !settings.notifyUserOnAvailable) return;

        // Check user preference overrides
        if (userPrefs && isUserNotification) {
            if (type === NotificationType.MEDIA_APPROVED && userPrefs.notify_on_approved === 0) return;
            if (type === NotificationType.MEDIA_DECLINED && userPrefs.notify_on_declined === 0) return;
            if (type === NotificationType.MEDIA_AVAILABLE && userPrefs.notify_on_available === 0) return;
        }

        const promises = [];

        // Email - can be configured for any notification type
        if (isTypeEnabled(settings.email, type)) {
            if (type === NotificationType.MEDIA_PENDING) {
                // New request - notify admins/approvers
                const recipients = await getNotificationRecipients(data.mediaType, data.is4k);
                for (const r of recipients) promises.push(sendEmailNotification(r, type, data));
            } else if (isUserNotification && user) {
                // User notifications - notify the requesting user
                promises.push(sendEmailNotification(user, type, data));
            }
        }

        // Discord - uses types from settings
        if (isTypeEnabled(settings.discord, type) && settings.discord.webhookUrl) {
            promises.push(sendDiscordNotification(settings.discord.webhookUrl, type, data, {
                botUsername: settings.discord.botUsername,
                botAvatarUrl: settings.discord.botAvatarUrl
            }));
        }

        // Telegram - uses types from settings
        if (isTypeEnabled(settings.telegram, type) && settings.telegram.botToken && settings.telegram.chatId) {
            promises.push(sendTelegramNotification(settings.telegram.botToken, settings.telegram.chatId, type, data, settings.telegram.sendSilently));
        }

        // Webhook - uses types from settings
        if (isTypeEnabled(settings.webhook, type) && settings.webhook.webhookUrl) {
            promises.push(sendWebhookNotification(settings.webhook.webhookUrl, type, data, settings.webhook.authHeader, settings.webhook.jsonPayload));
        }

        // WebPush - uses types from settings, sends to requesting user
        if (isTypeEnabled(settings.webpush, type) && user) {
            promises.push(sendWebPushNotification(user.id, type, data));
        }

        await Promise.allSettled(promises);
    } catch (error) {
        console.error('[Notifications] Error:', error);
    }
}

// High-level notification functions
async function notifyAdminsNewRequest(requestData) {
    await sendNotification(NotificationType.MEDIA_PENDING, { requestId: requestData.requestId, mediaTitle: requestData.mediaTitle, mediaType: requestData.mediaType, username: requestData.username, userId: requestData.userId, tmdbId: requestData.tmdbId, posterPath: requestData.posterPath, is4k: requestData.is4k });
}

async function notifyUserRequestApproved(userId, mediaTitle, mediaType, options = {}) {
    await sendNotification(NotificationType.MEDIA_APPROVED, { userId, mediaTitle, mediaType, ...options });
}

async function notifyUserRequestAutoApproved(userId, mediaTitle, mediaType, options = {}) {
    await sendNotification(NotificationType.MEDIA_AUTO_APPROVED, { userId, mediaTitle, mediaType, ...options });
}

async function notifyUserRequestDeclined(userId, mediaTitle, mediaType, reason, options = {}) {
    await sendNotification(NotificationType.MEDIA_DECLINED, { userId, mediaTitle, mediaType, reason, ...options });
}

async function notifyUserMediaAvailable(userId, mediaTitle, mediaType, options = {}) {
    await sendNotification(NotificationType.MEDIA_AVAILABLE, { userId, mediaTitle, mediaType, ...options });
}

async function sendTestNotification(channel, settings, userId = null) {
    const testData = { mediaTitle: 'Test Movie', mediaType: 'movie', username: 'Test User' };
    try {
        switch (channel) {
            case 'email':
                if (userId) {
                    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
                    if (users.length > 0) return await sendEmailNotification(users[0], NotificationType.TEST_NOTIFICATION, testData);
                }
                return false;
            case 'discord':
                if (!settings.webhookUrl) return false;
                return await sendDiscordNotification(settings.webhookUrl, NotificationType.TEST_NOTIFICATION, testData, {
                    botUsername: settings.botUsername,
                    botAvatarUrl: settings.botAvatarUrl
                });
            case 'telegram':
                return (settings.botToken && settings.chatId)
                    ? await sendTelegramNotification(settings.botToken, settings.chatId, NotificationType.TEST_NOTIFICATION, testData, settings.sendSilently)
                    : false;
            case 'webhook':
                if (!settings.webhookUrl) return false;
                return await sendWebhookNotification(settings.webhookUrl, NotificationType.TEST_NOTIFICATION, testData, settings.authHeader, settings.jsonPayload);
            case 'webpush':
                if (!userId) {
                    console.log('[Notifications] WebPush test requires user to subscribe first via browser');
                    return false;
                }
                return await sendWebPushNotification(userId, NotificationType.TEST_NOTIFICATION, testData);
            default: return false;
        }
    } catch (error) {
        console.error('[Notifications] Test notification error:', error);
        return false;
    }
}

module.exports = {
    NotificationType,
    getNotificationSettings,
    getUserNotificationPreferences,
    sendNotification,
    sendTestNotification,
    notifyAdminsNewRequest,
    notifyUserRequestApproved,
    notifyUserRequestAutoApproved,
    notifyUserRequestDeclined,
    notifyUserMediaAvailable,
    sendEmailNotification,
    sendDiscordNotification,
    sendTelegramNotification,
    sendWebhookNotification,
    sendWebPushNotification
};
