/**
 * Request Site - Notification Service
 *
 * Handles notifications for media requests (Email, Discord, Telegram, WebPush, Webhook)
 * Based on Seerr's notification agent pattern
 */

const { query } = require('../database-config');
const axios = require('axios');
const { sendEmail } = require('./email-service');

/**
 * Notification types
 */
const NotificationType = {
    MEDIA_PENDING: 'media_pending',           // New request submitted
    MEDIA_APPROVED: 'media_approved',         // Request approved
    MEDIA_DECLINED: 'media_declined',         // Request declined
    MEDIA_AVAILABLE: 'media_available',       // Media now available on Plex
    MEDIA_FAILED: 'media_failed',             // Media download/import failed
    MEDIA_AUTO_APPROVED: 'media_auto_approved' // Request auto-approved
};

/**
 * Get notification settings
 */
async function getNotificationSettings() {
    try {
        const settings = await query('SELECT key, value FROM request_site_settings WHERE key LIKE "notification_%"');

        const notificationSettings = {
            email: { enabled: false },
            discord: { enabled: false, webhook: '' },
            telegram: { enabled: false, botToken: '', chatId: '' },
            webpush: { enabled: false },
            webhook: { enabled: false, url: '' }
        };

        for (const setting of settings) {
            if (setting.key === 'notification_email') {
                notificationSettings.email = JSON.parse(setting.value);
            } else if (setting.key === 'notification_discord') {
                notificationSettings.discord = JSON.parse(setting.value);
            } else if (setting.key === 'notification_telegram') {
                notificationSettings.telegram = JSON.parse(setting.value);
            } else if (setting.key === 'notification_webpush') {
                notificationSettings.webpush = JSON.parse(setting.value);
            } else if (setting.key === 'notification_webhook') {
                notificationSettings.webhook = JSON.parse(setting.value);
            }
        }

        return notificationSettings;
    } catch (error) {
        console.error('[Notifications] Error getting settings:', error);
        return null;
    }
}

/**
 * Send email notification
 */
async function sendEmailNotification(user, type, data) {
    try {
        let subject = '';
        let html = '';

        switch (type) {
            case NotificationType.MEDIA_PENDING:
                subject = `New Request: ${data.mediaTitle}`;
                html = `
                    <h2>New Media Request</h2>
                    <p><strong>${user.username}</strong> has requested:</p>
                    <p><strong>${data.mediaTitle}</strong> (${data.mediaType})</p>
                    <p>Status: Pending Approval</p>
                `;
                break;

            case NotificationType.MEDIA_APPROVED:
                subject = `Request Approved: ${data.mediaTitle}`;
                html = `
                    <h2>Request Approved</h2>
                    <p>Your request for <strong>${data.mediaTitle}</strong> has been approved!</p>
                    <p>It will be downloaded and added to Plex shortly.</p>
                `;
                break;

            case NotificationType.MEDIA_DECLINED:
                subject = `Request Declined: ${data.mediaTitle}`;
                html = `
                    <h2>Request Declined</h2>
                    <p>Your request for <strong>${data.mediaTitle}</strong> has been declined.</p>
                    ${data.reason ? `<p>Reason: ${data.reason}</p>` : ''}
                `;
                break;

            case NotificationType.MEDIA_AVAILABLE:
                subject = `Now Available: ${data.mediaTitle}`;
                html = `
                    <h2>Media Now Available!</h2>
                    <p><strong>${data.mediaTitle}</strong> is now available on Plex!</p>
                    <p>You can start watching it now.</p>
                `;
                break;

            case NotificationType.MEDIA_AUTO_APPROVED:
                subject = `Request Auto-Approved: ${data.mediaTitle}`;
                html = `
                    <h2>Request Auto-Approved</h2>
                    <p>Your request for <strong>${data.mediaTitle}</strong> has been automatically approved!</p>
                    <p>It will be downloaded and added to Plex shortly.</p>
                `;
                break;

            default:
                return;
        }

        await sendEmail({
            to: user.email,
            subject,
            html
        });

        console.log(`[Notifications] Email sent to ${user.email} for ${type}`);
    } catch (error) {
        console.error('[Notifications] Email error:', error);
    }
}

/**
 * Send Discord notification
 */
async function sendDiscordNotification(webhookUrl, type, data) {
    try {
        let embed = {
            title: '',
            description: '',
            color: 0x5865F2, // Discord blurple
            timestamp: new Date().toISOString()
        };

        switch (type) {
            case NotificationType.MEDIA_PENDING:
                embed.title = '📬 New Media Request';
                embed.description = `**${data.mediaTitle}** (${data.mediaType})\nRequested by: ${data.username}`;
                embed.color = 0xFFA500; // Orange
                break;

            case NotificationType.MEDIA_APPROVED:
                embed.title = '✅ Request Approved';
                embed.description = `**${data.mediaTitle}** (${data.mediaType})\nYour request has been approved!`;
                embed.color = 0x00FF00; // Green
                break;

            case NotificationType.MEDIA_DECLINED:
                embed.title = '❌ Request Declined';
                embed.description = `**${data.mediaTitle}** (${data.mediaType})\n${data.reason ? `Reason: ${data.reason}` : 'Your request has been declined.'}`;
                embed.color = 0xFF0000; // Red
                break;

            case NotificationType.MEDIA_AVAILABLE:
                embed.title = '🎉 Media Available!';
                embed.description = `**${data.mediaTitle}** is now available on Plex!`;
                embed.color = 0x00FF00; // Green
                break;

            case NotificationType.MEDIA_AUTO_APPROVED:
                embed.title = '⚡ Auto-Approved';
                embed.description = `**${data.mediaTitle}** (${data.mediaType})\nYour request has been automatically approved!`;
                embed.color = 0x00FF00; // Green
                break;

            default:
                return;
        }

        await axios.post(webhookUrl, {
            embeds: [embed]
        });

        console.log(`[Notifications] Discord webhook sent for ${type}`);
    } catch (error) {
        console.error('[Notifications] Discord error:', error.message);
    }
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(botToken, chatId, type, data) {
    try {
        let message = '';

        switch (type) {
            case NotificationType.MEDIA_PENDING:
                message = `📬 *New Media Request*\n\n*${data.mediaTitle}* (${data.mediaType})\nRequested by: ${data.username}`;
                break;

            case NotificationType.MEDIA_APPROVED:
                message = `✅ *Request Approved*\n\n*${data.mediaTitle}* (${data.mediaType})\nYour request has been approved!`;
                break;

            case NotificationType.MEDIA_DECLINED:
                message = `❌ *Request Declined*\n\n*${data.mediaTitle}* (${data.mediaType})\n${data.reason ? `Reason: ${data.reason}` : 'Your request has been declined.'}`;
                break;

            case NotificationType.MEDIA_AVAILABLE:
                message = `🎉 *Media Available!*\n\n*${data.mediaTitle}* is now available on Plex!`;
                break;

            case NotificationType.MEDIA_AUTO_APPROVED:
                message = `⚡ *Auto-Approved*\n\n*${data.mediaTitle}* (${data.mediaType})\nYour request has been automatically approved!`;
                break;

            default:
                return;
        }

        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });

        console.log(`[Notifications] Telegram message sent for ${type}`);
    } catch (error) {
        console.error('[Notifications] Telegram error:', error.message);
    }
}

/**
 * Send generic webhook notification
 */
async function sendWebhookNotification(webhookUrl, type, data) {
    try {
        const payload = {
            event: type,
            timestamp: new Date().toISOString(),
            data
        };

        await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'StreamPanel-RequestSite/1.0'
            },
            timeout: 5000
        });

        console.log(`[Notifications] Webhook sent to ${webhookUrl} for ${type}`);
    } catch (error) {
        console.error('[Notifications] Webhook error:', error.message);
    }
}

/**
 * Send notification to all enabled agents
 */
async function sendNotification(type, data) {
    try {
        const settings = await getNotificationSettings();

        if (!settings) {
            console.log('[Notifications] No notification settings found');
            return;
        }

        // Get user info if user_id provided
        let user = null;
        if (data.userId) {
            const users = await query('SELECT * FROM users WHERE id = ?', [data.userId]);
            if (users.length > 0) {
                user = users[0];
            }
        }

        // Email
        if (settings.email.enabled && user) {
            await sendEmailNotification(user, type, data);
        }

        // Discord
        if (settings.discord.enabled && settings.discord.webhook) {
            await sendDiscordNotification(settings.discord.webhook, type, data);
        }

        // Telegram
        if (settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId) {
            await sendTelegramNotification(settings.telegram.botToken, settings.telegram.chatId, type, data);
        }

        // Generic Webhook
        if (settings.webhook.enabled && settings.webhook.url) {
            await sendWebhookNotification(settings.webhook.url, type, data);
        }

        // WebPush - TODO: Implement browser push notifications
        // This requires service worker registration and VAPID keys

    } catch (error) {
        console.error('[Notifications] Error sending notification:', error);
    }
}

/**
 * Notify admins of new request
 */
async function notifyAdminsNewRequest(requestData) {
    await sendNotification(NotificationType.MEDIA_PENDING, {
        mediaTitle: requestData.mediaTitle,
        mediaType: requestData.mediaType,
        username: requestData.username,
        userId: requestData.userId
    });
}

/**
 * Notify user of approved request
 */
async function notifyUserRequestApproved(userId, mediaTitle, mediaType) {
    await sendNotification(NotificationType.MEDIA_APPROVED, {
        userId,
        mediaTitle,
        mediaType
    });
}

/**
 * Notify user of auto-approved request
 */
async function notifyUserRequestAutoApproved(userId, mediaTitle, mediaType) {
    await sendNotification(NotificationType.MEDIA_AUTO_APPROVED, {
        userId,
        mediaTitle,
        mediaType
    });
}

/**
 * Notify user of declined request
 */
async function notifyUserRequestDeclined(userId, mediaTitle, mediaType, reason) {
    await sendNotification(NotificationType.MEDIA_DECLINED, {
        userId,
        mediaTitle,
        mediaType,
        reason
    });
}

/**
 * Notify user media is available
 */
async function notifyUserMediaAvailable(userId, mediaTitle, mediaType) {
    await sendNotification(NotificationType.MEDIA_AVAILABLE, {
        userId,
        mediaTitle,
        mediaType
    });
}

module.exports = {
    NotificationType,
    sendNotification,
    notifyAdminsNewRequest,
    notifyUserRequestApproved,
    notifyUserRequestAutoApproved,
    notifyUserRequestDeclined,
    notifyUserMediaAvailable
};
