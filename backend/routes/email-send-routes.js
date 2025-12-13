/**
 * Email Send Routes
 *
 * Endpoints for sending emails and getting user lists by tag/owner
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database-config');
const { sendEmail, sendTemplateEmail } = require('../services/email-service');

// GET /api/v2/email/send/search-users - Search users by name or email
router.get('/search-users', async (req, res) => {
    try {
        const { query: searchQuery, limit = 10 } = req.query;

        if (!searchQuery || searchQuery.trim().length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        const searchTerm = `%${searchQuery.trim()}%`;

        const users = await query(`
            SELECT u.id, u.name, u.email, u.plex_email, u.role, u.owner_id,
                   CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END as is_admin,
                   owner.name as owner_name, owner.email as owner_email
            FROM users u
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            WHERE (
                u.name LIKE ?
                OR u.email LIKE ?
                OR u.plex_email LIKE ?
            )
            AND (u.email IS NOT NULL OR u.plex_email IS NOT NULL)
            ORDER BY u.name
            LIMIT ?
        `, [searchTerm, searchTerm, searchTerm, parseInt(limit)]);

        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search users',
            error: error.message
        });
    }
});

// GET /api/v2/email/send/users-by-tag/:tagName - Get users with a specific tag
router.get('/users-by-tag/:tagName', async (req, res) => {
    try {
        const { tagName } = req.params;

        // Find the tag by name
        const tags = await query('SELECT id FROM tags WHERE name = ?', [tagName]);
        if (tags.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: 'No tag found with that name'
            });
        }

        const tagId = tags[0].id;

        // Get users with this tag
        const users = await query(`
            SELECT u.id, u.name, u.email, u.plex_email,
                   u.plex_expiration_date, u.iptv_expiration_date, u.is_active
            FROM users u
            INNER JOIN user_tags ut ON u.id = ut.user_id
            WHERE ut.tag_id = ?
            AND (u.email IS NOT NULL OR u.plex_email IS NOT NULL)
            ORDER BY u.name
        `, [tagId]);

        res.json({
            success: true,
            data: users,
            count: users.length
        });
    } catch (error) {
        console.error('Error fetching users by tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users by tag',
            error: error.message
        });
    }
});

// GET /api/v2/email/send/users-by-owner/:ownerId - Get users for a specific owner
router.get('/users-by-owner/:ownerId', async (req, res) => {
    try {
        const { ownerId } = req.params;

        const users = await query(`
            SELECT u.id, u.name, u.email, u.plex_email,
                   u.plex_expiration_date, u.iptv_expiration_date, u.is_active
            FROM users u
            WHERE u.owner_id = ?
            AND (u.email IS NOT NULL OR u.plex_email IS NOT NULL)
            ORDER BY u.name
        `, [ownerId]);

        res.json({
            success: true,
            data: users,
            count: users.length
        });
    } catch (error) {
        console.error('Error fetching users by owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users by owner',
            error: error.message
        });
    }
});

// POST /api/v2/email/send - Send an email
router.post('/', async (req, res) => {
    try {
        const {
            template_id,
            to,          // Array of email addresses or user IDs
            cc,          // Optional CC addresses
            bcc,         // Optional BCC addresses
            subject,     // Custom subject (optional, overrides template)
            body,        // Custom body (optional, overrides template)
            custom_message // Custom message to append
        } = req.body;

        // Validate required fields
        if (!to || to.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one recipient is required'
            });
        }

        // For now, log the email request (actual sending would use emailService)
        console.log('Email send request:', {
            template_id,
            to,
            cc,
            bcc,
            subject,
            custom_message
        });

        // Log to email_logs table
        await query(`
            INSERT INTO email_logs (recipient_email, template_id, subject, status, sent_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `, [JSON.stringify(to), template_id, subject || 'N/A']);

        res.json({
            success: true,
            message: 'Email queued for sending',
            recipientCount: Array.isArray(to) ? to.length : 1
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});

// POST /api/v2/email/send/users - Send email to specific users by ID
router.post('/users', async (req, res) => {
    try {
        const { userIds, templateId, cc, bcc } = req.body;

        if (!userIds || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one user ID is required'
            });
        }

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Get template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [templateId]);
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // Get user data with owner info
        const placeholders = userIds.map(() => '?').join(',');
        const users = await query(`
            SELECT u.id, u.name, u.email, u.plex_email,
                   u.plex_expiration_date, u.iptv_expiration_date,
                   o.name as owner_name
            FROM users u
            LEFT JOIN owners o ON u.owner_id = o.id
            WHERE u.id IN (${placeholders})
        `, userIds);

        let sent = 0;
        let failed = 0;
        const errors = [];

        // Send emails to each user
        for (const user of users) {
            try {
                const recipientEmail = user.email || user.plex_email;
                if (!recipientEmail) {
                    console.log(`User ${user.id} (${user.name}) has no email address, skipping`);
                    failed++;
                    errors.push({ userId: user.id, error: 'No email address' });
                    continue;
                }

                console.log('Sending email to user:', {
                    userId: user.id,
                    email: recipientEmail,
                    templateId: templateId
                });

                const result = await sendTemplateEmail({
                    templateId: templateId,
                    to: recipientEmail,
                    userData: user,
                    cc: cc,
                    bcc: bcc
                });

                // Log to email_logs table
                await query(`
                    INSERT INTO email_logs (recipient_email, template_id, subject, body, status, sent_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'))
                `, [recipientEmail, templateId, templates[0].subject, templates[0].body, result.success ? 'sent' : 'failed']);

                if (result.success) {
                    sent++;
                } else {
                    failed++;
                    errors.push({ userId: user.id, error: result.error });
                }
            } catch (err) {
                console.error(`Failed to send email to user ${user.id}:`, err);
                failed++;
                errors.push({ userId: user.id, error: err.message });
            }
        }

        res.json({
            success: true,
            sent: sent,
            failed: failed,
            errors: errors.length > 0 ? errors : undefined,
            message: `Sent: ${sent}, Failed: ${failed}`
        });
    } catch (error) {
        console.error('Error sending emails to users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send emails',
            error: error.message
        });
    }
});

// POST /api/v2/email/send/bulk - Send ONE bulk email with TO field + BCC recipients
router.post('/bulk', async (req, res) => {
    try {
        const { to, recipients, templateId, cc } = req.body;

        // Validate: need either a TO address or recipients for BCC
        if (!to && (!recipients || recipients.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Either a "to" email or BCC recipients are required'
            });
        }

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Get template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [templateId]);
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        const template = templates[0];

        // Build BCC string from recipients array
        const bccString = recipients && recipients.length > 0 ? recipients.join(',') : null;

        console.log('Sending bulk email:', {
            to: to,
            bccCount: recipients ? recipients.length : 0,
            templateId: templateId,
            templateName: template.name
        });

        // Send ONE email with TO + BCC
        const result = await sendTemplateEmail({
            templateId: templateId,
            to: to,
            cc: cc,
            bcc: bccString
        });

        // Log to email_logs table
        const allRecipients = [to, ...(recipients || [])].filter(e => e);
        await query(`
            INSERT INTO email_logs (recipient_email, template_id, subject, body, status, sent_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `, [allRecipients.join(', '), templateId, template.subject, template.body, result.success ? 'sent' : 'failed']);

        if (result.success) {
            res.json({
                success: true,
                sent: 1,
                failed: 0,
                recipient_count: allRecipients.length,
                to: to,
                bcc_count: recipients ? recipients.length : 0,
                message: `Bulk email sent to ${to} with ${recipients ? recipients.length : 0} BCC recipients`
            });
        } else {
            res.json({
                success: false,
                sent: 0,
                failed: 1,
                error: result.error,
                message: 'Failed to send bulk email'
            });
        }
    } catch (error) {
        console.error('Error sending bulk email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk email',
            error: error.message
        });
    }
});

// POST /api/v2/email/send/custom - Send custom email without template
router.post('/custom', async (req, res) => {
    try {
        const { to, cc, bcc, subject, body } = req.body;

        if (!to) {
            return res.status(400).json({
                success: false,
                message: 'At least one recipient is required'
            });
        }

        if (!body) {
            return res.status(400).json({
                success: false,
                message: 'Email body is required'
            });
        }

        // Parse recipients
        const recipients = to.split(',').map(e => e.trim()).filter(e => e);

        let sent = 0;
        let failed = 0;
        const errors = [];

        // Send email to each recipient
        for (const email of recipients) {
            try {
                console.log('Sending custom email to:', {
                    email: email,
                    subject: subject
                });

                // Wrap body in basic HTML if not already HTML
                let htmlBody = body;
                if (!body.toLowerCase().includes('<html') && !body.toLowerCase().includes('<!doctype')) {
                    htmlBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${body}</div>`;
                }

                const result = await sendEmail({
                    to: email,
                    subject: subject || 'Message',
                    html: htmlBody,
                    cc: cc,
                    bcc: bcc
                });

                // Log to email_logs table
                await query(`
                    INSERT INTO email_logs (recipient_email, template_id, subject, body, status, sent_at)
                    VALUES (?, NULL, ?, ?, ?, datetime('now'))
                `, [email, subject || 'Custom Email', htmlBody, result.success ? 'sent' : 'failed']);

                if (result.success) {
                    sent++;
                } else {
                    failed++;
                    errors.push({ email: email, error: result.error });
                }
            } catch (err) {
                console.error(`Failed to send custom email to ${email}:`, err);
                failed++;
                errors.push({ email: email, error: err.message });
            }
        }

        res.json({
            success: true,
            sent: sent,
            failed: failed,
            recipient_count: recipients.length,
            errors: errors.length > 0 ? errors : undefined,
            message: `Custom email sent: ${sent} success, ${failed} failed`
        });
    } catch (error) {
        console.error('Error sending custom email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send custom email',
            error: error.message
        });
    }
});

// POST /api/v2/email/send/preview - Preview rendered email
router.post('/preview', async (req, res) => {
    try {
        const { template_id, user_id, custom_message } = req.body;

        // Get template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [template_id]);
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        const template = templates[0];
        let userData = {};

        // Get user data if provided
        if (user_id) {
            const users = await query(`
                SELECT u.*, o.name as owner_name, sp.name as subscription_plan_name
                FROM users u
                LEFT JOIN owners o ON u.owner_id = o.id
                LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
                WHERE u.id = ?
            `, [user_id]);

            if (users.length > 0) {
                userData = users[0];
            }
        }

        // Simple variable replacement (would use Handlebars in production)
        let body = template.body;
        let subject = template.subject;

        // Replace common variables
        const replacements = {
            '{{name}}': userData.name || 'User',
            '{{username}}': userData.username || 'username',
            '{{email}}': userData.email || 'user@example.com',
            '{{subscription_end}}': userData.subscription_end || 'N/A',
            '{{owner_name}}': userData.owner_name || 'Admin',
            '{{custom_message}}': custom_message || template.custom_message || ''
        };

        for (const [key, value] of Object.entries(replacements)) {
            body = body.replace(new RegExp(key, 'g'), value);
            subject = subject.replace(new RegExp(key, 'g'), value);
        }

        res.json({
            success: true,
            preview: {
                subject: subject,
                body: body,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${body}</div>`
            }
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate preview',
            error: error.message
        });
    }
});

module.exports = router;
