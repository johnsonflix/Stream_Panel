/**
 * Portal Routes
 *
 * API routes for the end-user portal.
 * Handles announcements, messages, service requests, and user data.
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const db = require('../database-config');
const { query } = db;
const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
const IPTVEditorService = require('../services/iptv-editor-service');
const { parseXMLTVEPG, organizeForGuideGrid } = require('../utils/xmltv-parser');

// In-memory cache for parsed EPG data to avoid re-parsing large JSON on each request
const epgCache = {
    data: new Map(), // key: "sourceType:sourceId", value: { parsedEpg, lastUpdated }
    maxAge: 5 * 60 * 1000, // 5 minute cache TTL

    get(sourceType, sourceId, dbLastUpdated) {
        const key = `${sourceType}:${sourceId}`;
        const cached = this.data.get(key);
        if (!cached) return null;

        // Check if cache is stale (db was updated after cache)
        if (dbLastUpdated && new Date(dbLastUpdated) > cached.cachedAt) {
            this.data.delete(key);
            return null;
        }

        // Check TTL
        if (Date.now() - cached.cachedAt.getTime() > this.maxAge) {
            this.data.delete(key);
            return null;
        }

        return cached.parsedEpg;
    },

    set(sourceType, sourceId, parsedEpg) {
        const key = `${sourceType}:${sourceId}`;
        this.data.set(key, { parsedEpg, cachedAt: new Date() });
    }
};

// Initialize IPTV service manager for cancellation
let iptvManager;
(async () => {
    try {
        iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();
        console.log('Portal: IPTV Service Manager initialized');
    } catch (error) {
        console.error('Portal: Failed to initialize IPTV Service Manager:', error);
    }
})();

/**
 * Helper: Remove user from Plex server via Python
 * Uses share_libraries with empty array to remove access from specific server
 */
function removeUserFromPlexServer(userEmail, serverConfig) {
    return new Promise((resolve, reject) => {
        // Script is at v2/plex_service_v2.py, we're in v2/backend/routes/
        const pythonScript = path.join(__dirname, '..', '..', 'plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        // Use share_libraries with empty array to remove from this specific server
        // DO NOT use remove_user as it removes from the ENTIRE Plex account
        const args = [
            pythonScript,
            'share_libraries',
            userEmail,
            JSON.stringify(serverConfig),
            JSON.stringify([])  // Empty array = remove all library access from this server
        ];

        console.log(`🗑️ Removing ${userEmail} from Plex server ${serverConfig.name}...`);

        const pythonProcess = spawn(pythonExecutable, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log(`🐍 Python stderr: ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Successfully removed ${userEmail} from ${serverConfig.name}`);
                resolve({ success: true });
            } else {
                console.error(`❌ Failed to remove user: ${stderr}`);
                resolve({ success: false, error: stderr });
            }
        });

        pythonProcess.on('error', (error) => {
            console.error(`❌ Failed to spawn Python: ${error.message}`);
            resolve({ success: false, error: error.message });
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            pythonProcess.kill();
            resolve({ success: false, error: 'Timeout' });
        }, 60000);
    });
}

const router = express.Router();

/**
 * Middleware: Verify portal session
 */
async function verifyPortalSession(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        const sessions = await query(`
            SELECT ps.*, u.id as user_id, u.name, u.email,
                   u.plex_enabled, u.iptv_enabled, u.iptv_editor_enabled
            FROM portal_sessions ps
            JOIN users u ON ps.user_id = u.id
            WHERE ps.token = ?
            AND datetime(ps.expires_at) > datetime('now')
        `, [token]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        req.portalUser = sessions[0];
        next();

    } catch (error) {
        console.error('Portal session verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}

// Apply middleware to all routes
router.use(verifyPortalSession);

/**
 * GET /api/v2/portal/announcements
 * Get active announcements for the current user
 */
router.get('/announcements', async (req, res) => {
    try {
        const user = req.portalUser;
        const hasPlex = user.plex_enabled === 1;
        const hasIPTV = user.iptv_enabled === 1 || user.iptv_editor_enabled === 1;

        // Build audience filter based on user's services
        let audienceConditions = ["target_audience = 'all'"];

        if (hasPlex) {
            audienceConditions.push("target_audience = 'plex'");
            if (!hasIPTV) {
                audienceConditions.push("target_audience = 'plex_only'");
            }
        }

        if (hasIPTV) {
            audienceConditions.push("target_audience = 'iptv'");
            if (!hasPlex) {
                audienceConditions.push("target_audience = 'iptv_only'");
            }
        }

        const audienceFilter = audienceConditions.join(' OR ');

        // Get active announcements not dismissed by this user
        const announcements = await query(`
            SELECT a.*
            FROM portal_announcements a
            LEFT JOIN portal_announcement_dismissals d
                ON a.id = d.announcement_id AND d.user_id = ?
            WHERE a.is_active = 1
            AND (${audienceFilter})
            AND (a.starts_at IS NULL OR datetime(a.starts_at) <= datetime('now'))
            AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))
            AND d.id IS NULL
            ORDER BY a.priority DESC, a.created_at DESC
        `, [user.user_id]);

        res.json({
            success: true,
            announcements
        });

    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch announcements'
        });
    }
});

/**
 * POST /api/v2/portal/announcements/:id/dismiss
 * Dismiss an announcement for the current user
 */
router.post('/announcements/:id/dismiss', async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.portalUser;

        // Check if announcement exists and is dismissible
        const announcements = await query(
            'SELECT * FROM portal_announcements WHERE id = ? AND is_dismissible = 1',
            [id]
        );

        if (announcements.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found or cannot be dismissed'
            });
        }

        // Insert dismissal record (ignore if already exists)
        await query(`
            INSERT OR IGNORE INTO portal_announcement_dismissals (announcement_id, user_id)
            VALUES (?, ?)
        `, [id, user.user_id]);

        res.json({
            success: true,
            message: 'Announcement dismissed'
        });

    } catch (error) {
        console.error('Error dismissing announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to dismiss announcement'
        });
    }
});

/**
 * GET /api/v2/portal/notices
 * Get portal notices relevant to the current user's services
 */
router.get('/notices', async (req, res) => {
    try {
        const user = req.portalUser;
        const hasPlex = user.plex_enabled === 1;
        const hasIPTV = user.iptv_enabled === 1 || user.iptv_editor_enabled === 1;

        const notices = [];

        // Get "everyone" notice
        const everyoneNotice = await query(
            'SELECT setting_value FROM settings WHERE setting_key = ?',
            ['portal_notice_everyone']
        );
        if (everyoneNotice.length > 0 && everyoneNotice[0].setting_value) {
            notices.push({
                type: 'everyone',
                content: everyoneNotice[0].setting_value
            });
        }

        // Get Plex notice if user has Plex
        if (hasPlex) {
            const plexNotice = await query(
                'SELECT setting_value FROM settings WHERE setting_key = ?',
                ['portal_notice_plex']
            );
            if (plexNotice.length > 0 && plexNotice[0].setting_value) {
                notices.push({
                    type: 'plex',
                    content: plexNotice[0].setting_value
                });
            }
        }

        // Get IPTV notice if user has IPTV
        if (hasIPTV) {
            const iptvNotice = await query(
                'SELECT setting_value FROM settings WHERE setting_key = ?',
                ['portal_notice_iptv']
            );
            if (iptvNotice.length > 0 && iptvNotice[0].setting_value) {
                notices.push({
                    type: 'iptv',
                    content: iptvNotice[0].setting_value
                });
            }
        }

        res.json({
            success: true,
            notices
        });

    } catch (error) {
        console.error('Error fetching portal notices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal notices'
        });
    }
});

/**
 * GET /api/v2/portal/user/full
 * Get full user data for the portal overview
 */
router.get('/user/full', async (req, res) => {
    try {
        const user = req.portalUser;

        // Get complete user data
        const users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_iptv.price as iptv_price,
                   sp_iptv.price_type as iptv_price_type,
                   sp_plex.name as plex_package_name,
                   sp_plex.price as plex_price,
                   sp_plex.price_type as plex_price_type,
                   ip.name as iptv_panel_name,
                   ip.m3u_channel_count,
                   ip.m3u_movie_count,
                   ip.m3u_series_count
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = users[0];

        // Get Plex server access with library details (only active shares)
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name, ps.libraries, ps.request_site_url,
                   ps.health_status
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ? AND ups.share_status = 'active'
        `, [user.user_id]);

        // Process Plex servers with library info
        const plexServers = plexShares.map(share => {
            let libraries = [];
            let userLibraryIds = [];

            try {
                userLibraryIds = share.library_ids ? JSON.parse(share.library_ids) : [];
                const allLibraries = share.libraries ? JSON.parse(share.libraries) : [];

                // Filter to only libraries user has access to, or all if no specific filter
                if (userLibraryIds.length > 0) {
                    // Convert lib.key to string since userLibraryIds contains string values
                    libraries = allLibraries.filter(lib => userLibraryIds.includes(String(lib.key || lib.id)));
                } else {
                    libraries = allLibraries;
                }
            } catch (e) {
                console.error('Error parsing library data:', e);
            }

            return {
                id: share.plex_server_id,
                name: share.server_name,
                status: share.health_status || 'unknown',
                request_site_url: share.request_site_url,
                libraries: libraries,
                library_count: libraries.length
            };
        });

        // Get IPTV Editor data if applicable
        let iptvEditorData = null;
        if (userData.iptv_editor_enabled) {
            const editorUsers = await query(`
                SELECT ieu.*, iep.name as playlist_name
                FROM iptv_editor_users ieu
                JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                WHERE ieu.user_id = ?
            `, [user.user_id]);

            if (editorUsers.length > 0) {
                iptvEditorData = {
                    username: editorUsers[0].iptv_editor_username,
                    password: editorUsers[0].iptv_editor_password,
                    m3u_code: editorUsers[0].m3u_code,
                    epg_code: editorUsers[0].epg_code,
                    playlist_name: editorUsers[0].playlist_name,
                    max_connections: editorUsers[0].max_connections,
                    expiry_date: editorUsers[0].expiry_date
                };
            }
        }

        // Determine account status
        let accountStatus = 'active';
        let daysRemaining = null;
        const expirationDate = userData.expiration_date || userData.plex_expiration_date || userData.iptv_expiration_date;

        // Check for cancellation status first
        const hasPlexCancellation = userData.plex_enabled && userData.plex_cancelled_at;
        const hasIptvCancellation = (userData.iptv_enabled || userData.iptv_editor_enabled) && userData.iptv_cancelled_at;

        if (hasPlexCancellation || hasIptvCancellation) {
            accountStatus = 'cancelled';
        } else if (expirationDate) {
            const expiry = new Date(expirationDate);
            const now = new Date();
            daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

            if (daysRemaining < 0) {
                accountStatus = 'expired';
            } else if (daysRemaining <= 7) {
                accountStatus = 'expiring_soon';
            }
        }

        // Determine subscription type from plan's price_type
        // Priority: donation > fixed (paid) > free
        let subscriptionType = 'free';
        const plexPriceType = userData.plex_price_type;
        const iptvPriceType = userData.iptv_price_type;

        if (plexPriceType === 'donation' || iptvPriceType === 'donation') {
            subscriptionType = 'donation';
        } else if (plexPriceType === 'fixed' || iptvPriceType === 'fixed') {
            subscriptionType = 'paid';
        } else if (plexPriceType === 'free' || iptvPriceType === 'free') {
            subscriptionType = 'free';
        }

        // Build response
        const response = {
            success: true,
            user: {
                id: userData.id,
                name: userData.name,
                email: userData.email,
                account_type: userData.account_type || 'free',
                subscription_type: subscriptionType, // from plan's price_type: 'free', 'paid', 'donation'
                account_status: accountStatus,
                expiration_date: expirationDate,
                days_remaining: daysRemaining,

                // Plex access
                plex_enabled: userData.plex_enabled === 1,
                plex_username: userData.plex_username,
                plex_email: userData.plex_email,
                plex_package_name: userData.plex_package_name,
                plex_price_type: userData.plex_price_type,
                plex_expiration_date: userData.plex_expiration_date,
                plex_servers: plexServers,
                // Plex cancellation status
                plex_cancelled: !!userData.plex_cancelled_at,
                plex_cancelled_at: userData.plex_cancelled_at,
                plex_scheduled_deletion: userData.plex_scheduled_deletion,

                // IPTV access
                iptv_enabled: userData.iptv_enabled === 1,
                iptv_username: userData.iptv_username,
                iptv_password: userData.iptv_password,
                iptv_m3u_url: userData.iptv_m3u_url,
                iptv_subscription_name: userData.iptv_subscription_name,
                iptv_subscription_plan_id: userData.iptv_subscription_plan_id,
                iptv_price: userData.iptv_price,
                iptv_price_type: userData.iptv_price_type,
                iptv_expiration_date: userData.iptv_expiration_date,
                iptv_connections: userData.iptv_connections,
                iptv_panel_name: userData.iptv_panel_name,
                // IPTV cancellation status
                iptv_cancelled: !!userData.iptv_cancelled_at,
                iptv_cancelled_at: userData.iptv_cancelled_at,
                iptv_scheduled_deletion: userData.iptv_scheduled_deletion,

                // Content stats from panel
                content_stats: {
                    channels: userData.m3u_channel_count || 0,
                    movies: userData.m3u_movie_count || 0,
                    series: userData.m3u_series_count || 0
                },

                // IPTV Editor - only consider enabled if user actually has an editor account
                iptv_editor_enabled: userData.iptv_editor_enabled === 1 && iptvEditorData !== null,
                iptv_editor: iptvEditorData
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Error fetching full user data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user data'
        });
    }
});

/**
 * POST /api/v2/portal/messages
 * Send a message/support request to admins
 */
router.post('/messages', async (req, res) => {
    try {
        const user = req.portalUser;
        const { subject, message, category } = req.body;

        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject and message are required'
            });
        }

        const validCategories = ['general', 'billing', 'technical', 'cancel_request', 'add_service'];
        const messageCategory = validCategories.includes(category) ? category : 'general';

        const insertResult = await query(`
            INSERT INTO portal_messages (user_id, subject, message, category)
            VALUES (?, ?, ?, ?)
        `, [user.user_id, subject, message, messageCategory]);

        const messageId = insertResult.insertId || insertResult.lastInsertRowid;

        // Send email notification to admins
        try {
            const emailService = require('../services/email-service');

            // Get user details for the email
            const userDetails = await query(`
                SELECT name, email, plex_email
                FROM users
                WHERE id = ?
            `, [user.user_id]);

            const userName = userDetails.length > 0 ? userDetails[0].name : 'Unknown User';
            const userEmail = userDetails.length > 0 ? (userDetails[0].email || userDetails[0].plex_email || 'No email') : 'No email';

            // Get app name for email subject
            const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
            const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

            // Format category for display
            const categoryLabels = {
                'general': 'General',
                'billing': 'Billing',
                'technical': 'Technical Support',
                'cancel_request': 'Cancellation Request',
                'add_service': 'Add Service'
            };
            const categoryLabel = categoryLabels[messageCategory] || messageCategory;

            const emailSubject = `[${appName}] New Support Message: ${subject}`;
            const emailBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New Support Message</h2>
                    <p>A user has submitted a support message through the portal.</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p><strong>From:</strong> ${userName} (${userEmail})</p>
                    <p><strong>Category:</strong> ${categoryLabel}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
                    </div>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="color: #666; font-size: 13px;">Please respond to this message in the admin panel.</p>
                </div>
            `;

            // Get all admin emails
            const admins = await query("SELECT email FROM users WHERE is_app_user = 1 AND role = 'admin' AND email IS NOT NULL AND email != ''");
            if (admins.length > 0) {
                // Set replyTo to user's email so admins can reply directly
                const replyToEmail = userDetails.length > 0 ? (userDetails[0].email || userDetails[0].plex_email) : null;

                for (const admin of admins) {
                    await emailService.sendEmail({
                        to: admin.email,
                        subject: emailSubject,
                        html: emailBody,
                        replyTo: replyToEmail || undefined
                    });
                }
                console.log(`Support message notification sent to ${admins.length} admin(s)${replyToEmail ? ` (reply-to: ${replyToEmail})` : ''}`);
            } else {
                console.log('No admin emails configured for support message notification');
            }

            // Create admin notification for in-app alert (linked to message so it stays until handled)
            await query(`
                INSERT INTO admin_notifications (message, created_by, related_message_id)
                VALUES (?, ?, ?)
            `, [`New support message from ${userName}: ${subject}`, userName, messageId]);
            console.log('Admin notification created for support message, linked to message ID:', messageId);
        } catch (emailError) {
            console.error('Failed to send support message notification email:', emailError);
            // Don't fail the request if email fails - message is still saved
        }

        res.json({
            success: true,
            message: 'Your message has been sent. We will get back to you soon.'
        });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});

/**
 * GET /api/v2/portal/messages
 * Get user's message history
 */
router.get('/messages', async (req, res) => {
    try {
        const user = req.portalUser;

        const messages = await query(`
            SELECT id, subject, category, status, created_at, updated_at
            FROM portal_messages
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [user.user_id]);

        res.json({
            success: true,
            messages
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages'
        });
    }
});

/**
 * GET /api/v2/portal/available-plans
 * Get subscription plans available on portal
 */
router.get('/available-plans', async (req, res) => {
    try {
        const plans = await query(`
            SELECT
                id, name, description, service_type, duration_months,
                price, currency, price_type, iptv_connections,
                portal_description, is_portal_default, portal_display_order
            FROM subscription_plans
            WHERE is_active = 1
            AND show_on_portal = 1
            ORDER BY service_type, portal_display_order, display_order, name
        `);

        // Group by service type
        const plexPlans = plans.filter(p => p.service_type === 'plex');
        const iptvPlans = plans.filter(p => p.service_type === 'iptv');

        // Find defaults
        const defaultPlexPlan = plexPlans.find(p => p.is_portal_default) || plexPlans[0];
        const defaultIptvPlan = iptvPlans.find(p => p.is_portal_default) || iptvPlans[0];

        res.json({
            success: true,
            plans: {
                plex: plexPlans,
                iptv: iptvPlans
            },
            defaults: {
                plex: defaultPlexPlan || null,
                iptv: defaultIptvPlan || null
            }
        });

    } catch (error) {
        console.error('Error fetching available plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch plans'
        });
    }
});

/**
 * GET /api/v2/portal/payment-methods
 * Get payment methods available to this user based on their preference
 */
router.get('/payment-methods', async (req, res) => {
    try {
        const user = req.portalUser;

        // Get user's full data including payment preference
        const users = await query('SELECT * FROM users WHERE id = ?', [user.user_id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = users[0];
        const preference = userData.payment_preference || 'global';
        let paymentMethods = [];

        console.log(`[Payment Methods] User ${user.user_id}: preference=${preference}, owner_id=${userData.owner_id}`);

        if (preference === 'global') {
            // Get global payment providers
            paymentMethods = await query(`
                SELECT id, name, payment_url, qr_code_data
                FROM payment_providers
                WHERE is_active = 1
                ORDER BY display_order, name
            `);
        } else if (preference === 'owner' && userData.owner_id) {
            // Get owner's payment methods (owners are app_users with is_app_user = 1)
            const owners = await query('SELECT * FROM users WHERE id = ? AND is_app_user = 1', [userData.owner_id]);
            console.log(`[Payment Methods] Found ${owners.length} owner(s) for owner_id=${userData.owner_id}`);
            if (owners.length > 0) {
                const owner = owners[0];
                console.log(`[Payment Methods] Owner payment fields: venmo=${owner.venmo_username}, paypal=${owner.paypal_username}, cashapp=${owner.cashapp_username}`);
                // Build payment methods from owner fields
                if (owner.venmo_username) {
                    paymentMethods.push({ name: 'Venmo', payment_url: `https://venmo.com/u/${owner.venmo_username}` });
                }
                if (owner.paypal_username) {
                    paymentMethods.push({ name: 'PayPal', payment_url: `https://paypal.me/${owner.paypal_username}` });
                }
                if (owner.cashapp_username) {
                    paymentMethods.push({ name: 'CashApp', payment_url: `https://cash.app/${owner.cashapp_username}` });
                }
                if (owner.google_pay_username) {
                    paymentMethods.push({ name: 'Google Pay', payment_url: owner.google_pay_username });
                }
                if (owner.apple_cash_username) {
                    paymentMethods.push({ name: 'Apple Pay', payment_url: owner.apple_cash_username });
                }
            }
        } else if (preference === 'custom') {
            // Get user's custom payment methods
            let customMethodIds = [];
            try {
                customMethodIds = JSON.parse(userData.custom_payment_methods || '[]');
            } catch (e) {
                customMethodIds = [];
            }

            if (customMethodIds.length > 0) {
                const placeholders = customMethodIds.map(() => '?').join(',');
                paymentMethods = await query(`
                    SELECT id, name, payment_url, qr_code_data
                    FROM payment_providers
                    WHERE id IN (${placeholders}) AND is_active = 1
                    ORDER BY display_order, name
                `, customMethodIds);
            }
        }

        // If no methods found, fall back to global
        if (paymentMethods.length === 0) {
            paymentMethods = await query(`
                SELECT id, name, payment_url, qr_code_data
                FROM payment_providers
                WHERE is_active = 1
                ORDER BY display_order, name
            `);
        }

        res.json({
            success: true,
            payment_methods: paymentMethods,
            preference
        });

    } catch (error) {
        console.error('Error fetching payment methods:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment methods'
        });
    }
});

/**
 * POST /api/v2/portal/service-requests
 * Submit a service request (new service or renewal)
 */
router.post('/service-requests', async (req, res) => {
    try {
        const user = req.portalUser;
        const {
            service_type,
            subscription_plan_id,
            request_type: rawRequestType = 'new_service',
            payment_status = 'pending',  // 'pending' = I'll pay later, 'submitted' = I've paid
            transaction_reference,
            user_notes,
            iptv_connections
        } = req.body;

        // Build user notes including IPTV connections if specified
        let finalUserNotes = user_notes || '';
        if (service_type === 'iptv' && iptv_connections && iptv_connections > 1) {
            const connectionsNote = `Requested connections: ${iptv_connections}`;
            finalUserNotes = finalUserNotes ? `${finalUserNotes}\n${connectionsNote}` : connectionsNote;
        }

        // Validate service type
        if (!['plex', 'iptv'].includes(service_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid service type'
            });
        }

        // Map request type to database constraint values
        // Database allows: 'add_plex', 'add_iptv', 'cancel_plex', 'cancel_iptv', 'upgrade', 'downgrade'
        let request_type;
        if (rawRequestType === 'new_service' || rawRequestType === 'renewal') {
            request_type = service_type === 'plex' ? 'add_plex' : 'add_iptv';
        } else if (['add_plex', 'add_iptv', 'cancel_plex', 'cancel_iptv', 'upgrade', 'downgrade'].includes(rawRequestType)) {
            request_type = rawRequestType;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid request type'
            });
        }

        // Validate payment status
        if (!['pending', 'submitted'].includes(payment_status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment status'
            });
        }

        // Verify plan exists and is available
        if (subscription_plan_id) {
            const plans = await query(
                'SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1 AND show_on_portal = 1',
                [subscription_plan_id]
            );
            if (plans.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected plan is not available'
                });
            }
        }

        // Check if user already has a pending/submitted request for this service type
        const pendingRequests = await query(`
            SELECT id FROM portal_service_requests
            WHERE user_id = ?
            AND service_type = ?
            AND payment_status IN ('pending', 'submitted')
        `, [user.user_id, service_type]);

        if (pendingRequests.length > 0) {
            return res.status(400).json({
                success: false,
                message: `You already have a pending ${service_type.toUpperCase()} service request. Please wait for it to be processed before submitting another.`
            });
        }

        // Check if user already has an active service of this type (for new service requests only)
        if (rawRequestType === 'new_service') {
            const userData = await query('SELECT plex_enabled, iptv_enabled FROM users WHERE id = ?', [user.user_id]);
            if (userData.length > 0) {
                if (service_type === 'plex' && userData[0].plex_enabled) {
                    return res.status(400).json({
                        success: false,
                        message: 'You already have an active Plex service. Use "Renew Subscription" to extend your service.'
                    });
                }
                if (service_type === 'iptv' && userData[0].iptv_enabled) {
                    return res.status(400).json({
                        success: false,
                        message: 'You already have an active IPTV service. Use "Renew Subscription" to extend your service.'
                    });
                }
            }
        }

        // Create the service request
        const result = await query(`
            INSERT INTO portal_service_requests (
                user_id, service_type, subscription_plan_id, request_type,
                payment_status, transaction_reference, user_notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            user.user_id,
            service_type,
            subscription_plan_id || null,
            request_type,
            payment_status,
            transaction_reference || null,
            finalUserNotes || null
        ]);

        // Get user's owner info for notification routing
        const users = await query(`
            SELECT u.*, owner.name as owner_name, owner.email as owner_email
            FROM users u
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            WHERE u.id = ?
        `, [user.user_id]);

        const userData = users[0];

        // Send email notification
        try {
            const emailService = require('../services/email-service');

            // Get plan details for the email
            let planName = service_type === 'plex' ? 'Plex' : 'IPTV';
            let planPrice = '';
            if (subscription_plan_id) {
                const plans = await query('SELECT * FROM subscription_plans WHERE id = ?', [subscription_plan_id]);
                if (plans.length > 0) {
                    planName = plans[0].name;
                    planPrice = plans[0].price_type === 'free' ? 'Free' :
                        `${plans[0].currency || 'USD'} $${plans[0].price?.toFixed(2) || '0.00'}`;
                }
            }

            const statusText = payment_status === 'submitted' ? 'Payment Submitted' : 'Payment Pending';
            const subject = `New Service Request: ${planName} - ${statusText}`;
            const body = `
                <h2>New Service Request</h2>
                <p><strong>User:</strong> ${userData.name} (${userData.email})</p>
                <p><strong>Service:</strong> ${planName}</p>
                <p><strong>Price:</strong> ${planPrice}</p>
                <p><strong>Request Type:</strong> ${rawRequestType === 'renewal' ? 'Renewal' : 'New Service'}</p>
                <p><strong>Payment Status:</strong> ${statusText}</p>
                ${transaction_reference ? `<p><strong>Transaction Reference:</strong> ${transaction_reference}</p>` : ''}
                ${user_notes ? `<p><strong>User Notes:</strong> ${user_notes}</p>` : ''}
                <hr>
                <p>Please review this request in the admin panel.</p>
            `;

            // If user has owner with email, send to owner, otherwise send to all admins
            if (userData.owner_id && userData.owner_email) {
                await emailService.sendEmail({ to: userData.owner_email, subject, html: body });
                console.log(`Service request notification sent to owner: ${userData.owner_email}`);
            } else {
                // Get all admin emails (app_users are stored in users table with is_app_user = 1)
                const admins = await query("SELECT email FROM users WHERE is_app_user = 1 AND role = 'admin' AND email IS NOT NULL AND email != ''");
                if (admins.length > 0) {
                    for (const admin of admins) {
                        await emailService.sendEmail({ to: admin.email, subject, html: body });
                    }
                    console.log(`Service request notification sent to ${admins.length} admin(s)`);
                } else {
                    console.log('No email recipients available for service request notification (owner has no email and no admins configured)');
                }
            }
        } catch (emailError) {
            console.error('Failed to send service request notification:', emailError);
            // Don't fail the request if email fails
        }

        const message = payment_status === 'submitted'
            ? 'Your request has been submitted! Your service will be activated within 24 hours after we verify your payment.'
            : 'Your request has been submitted! Your service will be activated within 24 hours after we receive and verify your payment.';

        res.json({
            success: true,
            message,
            request_id: result.lastInsertRowid || result.insertId
        });

    } catch (error) {
        console.error('Error submitting service request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit service request'
        });
    }
});

/**
 * GET /api/v2/portal/service-requests
 * Get user's service request history
 */
router.get('/service-requests', async (req, res) => {
    try {
        const user = req.portalUser;

        const requests = await query(`
            SELECT
                psr.id, psr.service_type, psr.request_type, psr.payment_status,
                psr.transaction_reference, psr.user_notes, psr.admin_notes,
                psr.created_at, psr.updated_at, psr.processed_at,
                sp.name as plan_name, sp.price, sp.currency, sp.price_type,
                sp.duration_months
            FROM portal_service_requests psr
            LEFT JOIN subscription_plans sp ON psr.subscription_plan_id = sp.id
            WHERE psr.user_id = ?
            ORDER BY psr.created_at DESC
            LIMIT 20
        `, [user.user_id]);

        res.json({
            success: true,
            requests
        });

    } catch (error) {
        console.error('Error fetching service requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service requests'
        });
    }
});

/**
 * Helper: Immediately delete Plex service
 */
async function immediateDeletePlexService(userId, userData) {
    // Remove user from Plex servers
    const plexShares = await query(`
        SELECT ups.*, ps.token, ps.url, ps.name as server_name, ps.server_id as plex_server_machine_id
        FROM user_plex_shares ups
        JOIN plex_servers ps ON ups.plex_server_id = ps.id
        WHERE ups.user_id = ?
    `, [userId]);

    for (const share of plexShares) {
        try {
            if (share.token && userData.plex_email) {
                const serverConfig = {
                    name: share.server_name,
                    server_id: share.plex_server_machine_id,
                    url: share.url,
                    token: share.token
                };
                await removeUserFromPlexServer(userData.plex_email, serverConfig);
            }
        } catch (err) {
            console.error(`Failed to uninvite from server ${share.plex_server_id}:`, err.message);
        }
    }

    // Update user - disable Plex
    // Note: We preserve plex_cancelled_at, plex_scheduled_deletion, and plex_cancellation_reason
    // so the cancellation status persists and can be displayed correctly in the UI
    await query(`
        UPDATE users
        SET plex_enabled = 0,
            plex_package_id = NULL,
            plex_email = NULL,
            plex_expiration_date = NULL,
            updated_at = datetime('now')
        WHERE id = ?
    `, [userId]);

    // Mark shares as removed
    await query(`
        UPDATE user_plex_shares
        SET share_status = 'removed', updated_at = datetime('now')
        WHERE user_id = ?
    `, [userId]);

    // Cancel any pending service requests for Plex
    await query(`
        UPDATE portal_service_requests
        SET payment_status = 'cancelled',
            admin_notes = COALESCE(admin_notes, '') || ' [Auto-cancelled: User cancelled service]',
            updated_at = datetime('now')
        WHERE user_id = ? AND service_type = 'plex' AND payment_status IN ('pending', 'submitted', 'verified')
    `, [userId]);
}

/**
 * Helper: Immediately delete IPTV service
 */
async function immediateDeleteIPTVService(userId, userData) {
    // Delete IPTV panel line
    if (userData.iptv_enabled && userData.iptv_panel_id && userData.iptv_line_id) {
        try {
            if (iptvManager) {
                await iptvManager.deleteUserFromPanel(userData.iptv_panel_id, userData.iptv_line_id);
                console.log(`[Portal] Deleted IPTV line ${userData.iptv_line_id}`);
            }
        } catch (err) {
            console.error(`[Portal] Failed to delete IPTV line:`, err.message);
        }
    }

    // Delete IPTV Editor account - always check regardless of flag
    // (in case flag is out of sync with actual records)
    try {
        const editorUsers = await query(`
            SELECT ieu.*, iep.bearer_token, iep.playlist_id as api_playlist_id
            FROM iptv_editor_users ieu
            JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
            WHERE ieu.user_id = ?
        `, [userId]);

        console.log(`[Portal] Found ${editorUsers.length} IPTV Editor accounts to delete for user ${userId}`);

        for (const editorUser of editorUsers) {
            if (editorUser.iptv_editor_id && editorUser.bearer_token && editorUser.api_playlist_id) {
                try {
                    const editorService = new IPTVEditorService();
                    // Initialize with bearer token and set playlist ID (use API playlist ID, not local DB ID)
                    editorService.bearerToken = editorUser.bearer_token;
                    editorService.defaultPlaylistId = editorUser.api_playlist_id;
                    // Call deleteUser with correct params: (editorUserId, apiPlaylistId)
                    await editorService.deleteUser(editorUser.iptv_editor_id, editorUser.api_playlist_id);
                    console.log(`[Portal] Deleted IPTV Editor user ${editorUser.iptv_editor_id} from playlist ${editorUser.api_playlist_id}`);
                } catch (deleteErr) {
                    console.error(`[Portal] Failed to delete IPTV Editor user ${editorUser.iptv_editor_id}:`, deleteErr.message);
                }
            } else {
                console.log(`[Portal] Skipping IPTV Editor record - missing iptv_editor_id (${editorUser.iptv_editor_id}), bearer_token, or api_playlist_id (${editorUser.api_playlist_id})`);
            }
        }
    } catch (err) {
        console.error('[Portal] Error querying/deleting IPTV Editor accounts:', err.message);
    }

    // Update user - disable IPTV
    // Note: We preserve iptv_cancelled_at, iptv_scheduled_deletion, and iptv_cancellation_reason
    // so the cancellation status persists and can be displayed correctly in the UI
    await query(`
        UPDATE users
        SET iptv_enabled = 0,
            iptv_editor_enabled = 0,
            iptv_panel_id = NULL,
            iptv_username = NULL,
            iptv_password = NULL,
            iptv_line_id = NULL,
            iptv_m3u_url = NULL,
            iptv_connections = NULL,
            iptv_subscription_plan_id = NULL,
            iptv_expiration_date = NULL,
            iptv_editor_m3u_url = NULL,
            iptv_editor_epg_url = NULL,
            updated_at = datetime('now')
        WHERE id = ?
    `, [userId]);

    // Delete IPTV Editor user record
    await query('DELETE FROM iptv_editor_users WHERE user_id = ?', [userId]);

    // Cancel any pending service requests for IPTV
    await query(`
        UPDATE portal_service_requests
        SET payment_status = 'cancelled',
            admin_notes = COALESCE(admin_notes, '') || ' [Auto-cancelled: User cancelled service]',
            updated_at = datetime('now')
        WHERE user_id = ? AND service_type = 'iptv' AND payment_status IN ('pending', 'submitted', 'verified')
    `, [userId]);
}

/**
 * POST /api/v2/portal/cancel-service
 * Cancel a service (Plex or IPTV)
 * - Free/donation subscriptions: delete immediately
 * - Paid subscriptions: schedule deletion for expiration date
 */
router.post('/cancel-service', async (req, res) => {
    try {
        const user = req.portalUser;
        const { service_type, reason } = req.body;

        if (!['plex', 'iptv'].includes(service_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid service type'
            });
        }

        const userId = user.user_id;

        // Get full user data with subscription plan info
        const users = await query(`
            SELECT u.*,
                   sp_plex.price_type as plex_price_type,
                   sp_iptv.price_type as iptv_price_type
            FROM users u
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            WHERE u.id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = users[0];
        const now = new Date().toISOString();
        let message = '';
        let scheduledDeletion = null;

        if (service_type === 'plex') {
            // Check for pending service requests first (user may not have service yet)
            const pendingPlexRequests = await query(`
                SELECT id FROM portal_service_requests
                WHERE user_id = ? AND service_type = 'plex'
                AND payment_status IN ('pending', 'submitted', 'verified')
            `, [userId]);

            if (!userData.plex_enabled && pendingPlexRequests.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No Plex service or pending request to cancel'
                });
            }

            // If user has pending requests but no active service, just cancel the requests
            if (!userData.plex_enabled && pendingPlexRequests.length > 0) {
                await query(`
                    UPDATE portal_service_requests
                    SET payment_status = 'cancelled',
                        admin_notes = COALESCE(admin_notes, '') || ' [Cancelled by user]',
                        updated_at = datetime('now')
                    WHERE user_id = ? AND service_type = 'plex'
                    AND payment_status IN ('pending', 'submitted', 'verified')
                `, [userId]);

                message = 'Your Plex service request has been cancelled';
                console.log(`[Portal] User ${userId} cancelled pending Plex request. Reason: ${reason || 'Not provided'}`);
            } else {
                // User has active service - handle cancellation
                // Check if already cancelled
                if (userData.plex_cancelled_at) {
                    return res.status(400).json({
                        success: false,
                        message: 'Plex service is already cancelled and pending deletion'
                    });
                }

                // Determine if immediate or scheduled deletion based on expiration date
                // If there's a future expiration date, schedule deletion for that date
                // If no expiration date or already expired, delete immediately
                const hasFutureExpiration = userData.plex_expiration_date && new Date(userData.plex_expiration_date) > new Date();

                if (hasFutureExpiration) {
                    // Has future expiration date: schedule deletion for that date
                    scheduledDeletion = userData.plex_expiration_date;

                    await query(`
                        UPDATE users
                        SET plex_cancelled_at = ?,
                            plex_scheduled_deletion = ?,
                            plex_cancellation_reason = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [now, scheduledDeletion, reason || null, userId]);

                    const deletionDate = new Date(scheduledDeletion).toLocaleDateString();
                    message = `Plex service has been cancelled. Your access will remain active until ${deletionDate}. You can renew before then to keep your service.`;
                    console.log(`[Portal] User ${userId} cancelled Plex (scheduled for ${deletionDate}). Reason: ${reason || 'Not provided'}`);
                } else {
                    // No expiration date or already expired: delete immediately
                    await query(`
                        UPDATE users
                        SET plex_cancelled_at = ?,
                            plex_scheduled_deletion = ?,
                            plex_cancellation_reason = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [now, now, reason || null, userId]);

                    // Perform the actual deletion
                    await immediateDeletePlexService(userId, userData);
                    message = 'Plex service has been cancelled and removed successfully';
                    console.log(`[Portal] User ${userId} cancelled Plex (immediate - no future expiration). Reason: ${reason || 'Not provided'}`);
                }
            }

        } else if (service_type === 'iptv') {
            // Check for pending service requests first (user may not have service yet)
            const pendingIPTVRequests = await query(`
                SELECT id FROM portal_service_requests
                WHERE user_id = ? AND service_type = 'iptv'
                AND payment_status IN ('pending', 'submitted', 'verified')
            `, [userId]);

            if (!userData.iptv_enabled && !userData.iptv_editor_enabled && pendingIPTVRequests.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No IPTV service or pending request to cancel'
                });
            }

            // If user has pending requests but no active service, just cancel the requests
            if (!userData.iptv_enabled && !userData.iptv_editor_enabled && pendingIPTVRequests.length > 0) {
                await query(`
                    UPDATE portal_service_requests
                    SET payment_status = 'cancelled',
                        admin_notes = COALESCE(admin_notes, '') || ' [Cancelled by user]',
                        updated_at = datetime('now')
                    WHERE user_id = ? AND service_type = 'iptv'
                    AND payment_status IN ('pending', 'submitted', 'verified')
                `, [userId]);

                message = 'Your IPTV service request has been cancelled';
                console.log(`[Portal] User ${userId} cancelled pending IPTV request. Reason: ${reason || 'Not provided'}`);
            } else {
                // User has active service - handle cancellation
                // Check if already cancelled
                if (userData.iptv_cancelled_at) {
                    return res.status(400).json({
                        success: false,
                        message: 'IPTV service is already cancelled and pending deletion'
                    });
                }

                // Determine if immediate or scheduled deletion based on expiration date
                // If there's a future expiration date, schedule deletion for that date
                // If no expiration date or already expired, delete immediately
                const now = new Date();
                const nowISO = now.toISOString(); // SQLite requires string, not Date object
                const expirationDate = userData.iptv_expiration_date ? new Date(userData.iptv_expiration_date) : null;
                const hasFutureExpiration = expirationDate && expirationDate > now;

                console.log(`[Portal] IPTV Cancellation Check - User ${userId}:`);
                console.log(`[Portal]   - iptv_expiration_date (raw): ${userData.iptv_expiration_date}`);
                console.log(`[Portal]   - Parsed expiration: ${expirationDate ? expirationDate.toISOString() : 'null'}`);
                console.log(`[Portal]   - Now: ${now.toISOString()}`);
                console.log(`[Portal]   - hasFutureExpiration: ${hasFutureExpiration}`);

                if (hasFutureExpiration) {
                    // Has future expiration date: schedule deletion for that date
                    scheduledDeletion = userData.iptv_expiration_date;

                    await query(`
                        UPDATE users
                        SET iptv_cancelled_at = ?,
                            iptv_scheduled_deletion = ?,
                            iptv_cancellation_reason = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [nowISO, scheduledDeletion, reason || null, userId]);

                    const deletionDate = new Date(scheduledDeletion).toLocaleDateString();
                    message = `IPTV service has been cancelled. Your access will remain active until ${deletionDate}. You can renew before then to keep your service.`;
                    console.log(`[Portal] User ${userId} cancelled IPTV (scheduled for ${deletionDate}). Reason: ${reason || 'Not provided'}`);
                } else {
                    // No expiration date or already expired: delete immediately
                    // Set cancellation flags FIRST so status persists during deletion
                    await query(`
                        UPDATE users
                        SET iptv_cancelled_at = ?,
                            iptv_scheduled_deletion = ?,
                            iptv_cancellation_reason = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [nowISO, nowISO, reason || null, userId]);

                    // Now perform the actual deletion (can take time)
                    await immediateDeleteIPTVService(userId, userData);
                    message = 'IPTV service has been cancelled and removed successfully';
                    console.log(`[Portal] User ${userId} cancelled IPTV (immediate - no future expiration). Reason: ${reason || 'Not provided'}`);
                }
            }
        }

        // Note: Cancellations do NOT create service requests - those are for new/renewal requests only
        // The cancellation is logged via console and tracked in user's cancelled_at fields

        res.json({
            success: true,
            message,
            scheduled_deletion: scheduledDeletion
        });

    } catch (error) {
        console.error('Error cancelling service:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel service'
        });
    }
});

/**
 * POST /api/v2/portal/cancel-scheduled-deletion
 * Cancel a scheduled service deletion (user changed their mind)
 */
router.post('/cancel-scheduled-deletion', async (req, res) => {
    try {
        const user = req.portalUser;
        const { service_type } = req.body;

        if (!['plex', 'iptv'].includes(service_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid service type'
            });
        }

        const userId = user.user_id;

        // Get user data
        const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = users[0];

        if (service_type === 'plex') {
            if (!userData.plex_cancelled_at) {
                return res.status(400).json({
                    success: false,
                    message: 'Plex service is not pending cancellation'
                });
            }

            // Clear cancellation fields
            await query(`
                UPDATE users
                SET plex_cancelled_at = NULL,
                    plex_scheduled_deletion = NULL,
                    plex_cancellation_reason = NULL,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [userId]);

            console.log(`[Portal] User ${userId} cancelled their Plex deletion schedule`);

        } else if (service_type === 'iptv') {
            if (!userData.iptv_cancelled_at) {
                return res.status(400).json({
                    success: false,
                    message: 'IPTV service is not pending cancellation'
                });
            }

            // Clear cancellation fields
            await query(`
                UPDATE users
                SET iptv_cancelled_at = NULL,
                    iptv_scheduled_deletion = NULL,
                    iptv_cancellation_reason = NULL,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [userId]);

            console.log(`[Portal] User ${userId} cancelled their IPTV deletion schedule`);
        }

        res.json({
            success: true,
            message: `${service_type === 'plex' ? 'Plex' : 'IPTV'} cancellation has been reversed. Your service will continue normally.`
        });

    } catch (error) {
        console.error('Error cancelling scheduled deletion:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel scheduled deletion'
        });
    }
});

// ============================================
// PORTAL APPS (User-facing)
// ============================================

/**
 * GET /api/v2/portal/apps
 * Get portal apps for the current user's services
 */
router.get('/apps', async (req, res) => {
    try {
        const user = req.portalUser;
        const hasPlex = user.plex_enabled === 1;
        const hasIPTV = user.iptv_enabled === 1 || user.iptv_editor_enabled === 1;

        // Build service type filter
        let serviceFilter = ["service_type = 'both'"];
        if (hasPlex) serviceFilter.push("service_type = 'plex'");
        if (hasIPTV) serviceFilter.push("service_type = 'iptv'");

        const apps = await query(`
            SELECT * FROM portal_apps
            WHERE is_active = 1
            AND (${serviceFilter.join(' OR ')})
            ORDER BY platform_category, display_order, name
        `);

        // Group by platform category
        const grouped = {
            tv: apps.filter(a => ['tv', 'android_tv', 'firestick', 'roku', 'apple_tv'].includes(a.platform_category)),
            mobile: apps.filter(a => ['mobile', 'ios', 'android_mobile'].includes(a.platform_category)),
            desktop: apps.filter(a => ['desktop', 'windows', 'macos'].includes(a.platform_category)),
            web: apps.filter(a => a.platform_category === 'web')
        };

        res.json({
            success: true,
            apps: grouped
        });

    } catch (error) {
        console.error('Error fetching portal apps:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal apps'
        });
    }
});

// ============================================
// PORTAL GUIDES (User-facing)
// ============================================

/**
 * GET /api/v2/portal/guides
 * Get portal guides for the current user's services
 */
router.get('/guides', async (req, res) => {
    try {
        const user = req.portalUser;
        const hasPlex = user.plex_enabled === 1;
        const hasIPTV = user.iptv_enabled === 1 || user.iptv_editor_enabled === 1;

        // Build service type filter (include NULL for "all services" guides)
        let serviceFilter = ["service_type IS NULL", "service_type = 'general'", "service_type = 'both'"];
        if (hasPlex) serviceFilter.push("service_type = 'plex'");
        if (hasIPTV) serviceFilter.push("service_type = 'iptv'");

        const guides = await query(`
            SELECT id, slug, title, icon, icon_type, icon_url, service_type, category, short_description
            FROM portal_guides
            WHERE is_visible = 1
            AND (${serviceFilter.join(' OR ')})
            ORDER BY display_order, title
        `);

        res.json({
            success: true,
            guides
        });

    } catch (error) {
        console.error('Error fetching portal guides:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal guides'
        });
    }
});

/**
 * GET /api/v2/portal/guides/:slug
 * Get a specific guide by slug
 */
router.get('/guides/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const guides = await query(`
            SELECT * FROM portal_guides
            WHERE slug = ? AND is_visible = 1
        `, [slug]);

        if (guides.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guide not found'
            });
        }

        // Increment view count
        await query(
            'UPDATE portal_guides SET views = views + 1 WHERE id = ?',
            [guides[0].id]
        );

        res.json({
            success: true,
            guide: guides[0]
        });

    } catch (error) {
        console.error('Error fetching portal guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal guide'
        });
    }
});

// ============================================
// PORTAL QUICK ACTIONS (User-facing)
// ============================================

/**
 * GET /api/v2/portal/quick-actions
 * Get quick actions for the current user's services
 */
router.get('/quick-actions', async (req, res) => {
    try {
        const user = req.portalUser;
        const hasPlex = user.plex_enabled === 1;
        const hasIPTV = user.iptv_enabled === 1 || user.iptv_editor_enabled === 1;

        // Build service type filter
        let serviceFilter = ["service_type = 'both'"];
        if (hasPlex) serviceFilter.push("service_type = 'plex'");
        if (hasIPTV) serviceFilter.push("service_type = 'iptv'");

        const actions = await query(`
            SELECT * FROM portal_quick_actions
            WHERE is_active = 1
            AND (${serviceFilter.join(' OR ')})
            ORDER BY display_order, name
        `);

        // Resolve dynamic fields and auto-resolve action types
        for (const action of actions) {
            // Handle dynamic action type with dynamic_field
            if (action.action_type === 'dynamic' && action.dynamic_field) {
                if (action.dynamic_field === 'plex_server_url' && hasPlex) {
                    const servers = await query(`
                        SELECT ps.url FROM user_plex_shares ups
                        JOIN plex_servers ps ON ups.plex_server_id = ps.id
                        WHERE ups.user_id = ? AND ups.share_status = 'active'
                        ORDER BY (SELECT COUNT(*) FROM user_plex_shares WHERE plex_server_id = ps.id) DESC
                        LIMIT 1
                    `, [user.user_id]);
                    action.resolved_url = servers.length > 0 ? servers[0].url : null;
                } else if (action.dynamic_field === 'request_site_url' && hasPlex) {
                    const servers = await query(`
                        SELECT ps.request_site_url FROM user_plex_shares ups
                        JOIN plex_servers ps ON ups.plex_server_id = ps.id
                        WHERE ups.user_id = ? AND ups.share_status = 'active'
                        AND ps.request_site_url IS NOT NULL AND ps.request_site_url != ''
                        LIMIT 1
                    `, [user.user_id]);
                    action.resolved_url = servers.length > 0 ? servers[0].request_site_url : null;
                }
            }
            // Handle auto-resolve action types (plex_web, request_site, tv_guide, web_player)
            else if (action.action_type === 'plex_web' && hasPlex) {
                const servers = await query(`
                    SELECT ps.url FROM user_plex_shares ups
                    JOIN plex_servers ps ON ups.plex_server_id = ps.id
                    WHERE ups.user_id = ? AND ups.share_status = 'active'
                    ORDER BY (SELECT COUNT(*) FROM user_plex_shares WHERE plex_server_id = ps.id) DESC
                    LIMIT 1
                `, [user.user_id]);
                action.resolved_url = servers.length > 0 ? servers[0].url : null;
            }
            else if (action.action_type === 'request_site' && hasPlex) {
                const servers = await query(`
                    SELECT ps.request_site_url FROM user_plex_shares ups
                    JOIN plex_servers ps ON ups.plex_server_id = ps.id
                    WHERE ups.user_id = ? AND ups.share_status = 'active'
                    AND ps.request_site_url IS NOT NULL AND ps.request_site_url != ''
                    LIMIT 1
                `, [user.user_id]);
                action.resolved_url = servers.length > 0 ? servers[0].request_site_url : null;
            }
            else if (action.action_type === 'tv_guide' || action.action_type === 'web_player') {
                // Use the url field if provided for these types
                action.resolved_url = action.url || null;
            }
        }

        // Group by service type
        const grouped = {
            plex: actions.filter(a => a.service_type === 'plex' || a.service_type === 'both').filter(a => hasPlex || a.service_type === 'both'),
            iptv: actions.filter(a => a.service_type === 'iptv' || a.service_type === 'both').filter(a => hasIPTV || a.service_type === 'both')
        };

        res.json({
            success: true,
            actions: grouped
        });

    } catch (error) {
        console.error('Error fetching portal quick actions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal quick actions'
        });
    }
});

// ============================================
// WATCH STATS (User-facing)
// ============================================

/**
 * GET /api/v2/portal/watch-stats
 * Get watch statistics for the portal (public trending data)
 */
router.get('/watch-stats', async (req, res) => {
    try {
        // Read watch stats from database cache
        const cached = await query(`
            SELECT setting_value, updated_at
            FROM settings
            WHERE setting_key = 'watch_stats_cache'
        `);

        if (cached && cached.length > 0 && cached[0].setting_value) {
            const watchStats = JSON.parse(cached[0].setting_value);

            // Only return the 4 main stat categories (not user/platform data)
            return res.json({
                success: true,
                stats: {
                    mostPopularMovies: watchStats.mostPopularMovies || [],
                    mostWatchedMovies: watchStats.mostWatchedMovies || [],
                    mostPopularShows: watchStats.mostPopularShows || [],
                    mostWatchedShows: watchStats.mostWatchedShows || []
                }
            });
        }

        // Fallback: Return empty stats if no cache available
        res.json({
            success: true,
            stats: {
                mostPopularMovies: [],
                mostWatchedMovies: [],
                mostPopularShows: [],
                mostWatchedShows: []
            }
        });
    } catch (error) {
        console.error('Error fetching watch stats:', error);
        res.json({
            success: false,
            message: 'Watch statistics not available'
        });
    }
});

// ============================================
// IPTV CREDENTIALS & M3U (User-facing)
// ============================================

/**
 * GET /api/v2/portal/iptv/credentials
 * Get IPTV credentials for the current user
 */
router.get('/iptv/credentials', async (req, res) => {
    try {
        const user = req.portalUser;

        if (!user.iptv_enabled && !user.iptv_editor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'IPTV service not enabled'
            });
        }

        // Get full user data with IPTV info
        const users = await query(`
            SELECT u.*,
                   ip.name as panel_name,
                   ip.base_url as panel_url
            FROM users u
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = users[0];
        const credentials = {
            hasEditorAccess: userData.iptv_editor_enabled === 1,
            panel: null,
            editor: null
        };

        // Panel credentials (backup if editor is enabled, primary otherwise)
        if (userData.iptv_enabled && userData.iptv_username) {
            // panel_url is already a full URL from base_url (e.g., https://panel.example.com:8080)
            const panelBaseUrl = userData.panel_url || '';

            credentials.panel = {
                username: userData.iptv_username,
                password: userData.iptv_password,
                connections: userData.iptv_connections,
                expiration: userData.iptv_expiration_date,
                panel_name: userData.panel_name,
                panel_url: panelBaseUrl,
                m3u_url: userData.iptv_m3u_url || (panelBaseUrl ? `${panelBaseUrl}/get.php?username=${userData.iptv_username}&password=${userData.iptv_password}&type=m3u_plus&output=ts` : null),
                epg_url: panelBaseUrl ? `${panelBaseUrl}/xmltv.php?username=${userData.iptv_username}&password=${userData.iptv_password}` : null
            };
        }

        // Editor credentials (primary if enabled)
        // Generate M3U/EPG URLs from editor_dns setting + user credentials
        if (userData.iptv_editor_enabled === 1) {
            const editorUsers = await query(`
                SELECT ieu.*, iep.name as playlist_name
                FROM iptv_editor_users ieu
                JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                WHERE ieu.user_id = ?
            `, [user.user_id]);

            if (editorUsers.length > 0) {
                const editorUser = editorUsers[0];

                // Get editor DNS base URL from settings
                const editorDnsSettings = await query(`
                    SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
                `);
                const editorDns = editorDnsSettings.length > 0 ? editorDnsSettings[0].setting_value : null;

                // Use credentials from users table or fallback to editor_users table
                const editorUsername = userData.iptv_editor_username || editorUser.iptv_editor_username;
                const editorPassword = userData.iptv_editor_password || editorUser.iptv_editor_password;

                // Generate M3U/EPG URLs - use stored URLs if available, otherwise generate from editor_dns
                let m3uUrl = userData.iptv_editor_m3u_url;
                let epgUrl = userData.iptv_editor_epg_url;

                if (!m3uUrl && editorDns && editorUsername && editorPassword) {
                    m3uUrl = `${editorDns}/get.php?username=${editorUsername}&password=${editorPassword}&type=m3u_plus&output=ts`;
                }
                if (!epgUrl && editorDns && editorUsername && editorPassword) {
                    epgUrl = `${editorDns}/xmltv.php?username=${editorUsername}&password=${editorPassword}`;
                }

                credentials.editor = {
                    username: editorUsername,
                    password: editorPassword,
                    max_connections: userData.iptv_connections || editorUser.max_connections,
                    expiration: editorUser.expiry_date,
                    playlist_name: editorUser.playlist_name,
                    m3u_url: m3uUrl,
                    m3u_code: editorUser.m3u_code,
                    epg_url: epgUrl,
                    epg_code: editorUser.epg_code
                };
            }
        }

        res.json({
            success: true,
            credentials
        });

    } catch (error) {
        console.error('Error fetching IPTV credentials:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV credentials'
        });
    }
});

/**
 * GET /api/v2/portal/iptv/channels
 * Get cached channel list from user's assigned playlist
 * Channels are cached at the playlist level and URLs are personalized per-user
 */
router.get('/iptv/channels', async (req, res) => {
    try {
        const user = req.portalUser;

        if (!user.iptv_enabled && !user.iptv_editor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'IPTV service not enabled'
            });
        }

        // Get user data with IPTV Editor assignment
        const users = await query(`
            SELECT u.*,
                   ieu.iptv_editor_playlist_id,
                   ieu.iptv_editor_username as editor_user_username,
                   ieu.iptv_editor_password as editor_user_password,
                   ip.base_url as panel_url
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = users[0];

        // For IPTV Editor users, use playlist-level cached channels
        if (userData.iptv_editor_enabled === 1 && userData.iptv_editor_playlist_id) {
            // Get playlist info
            const playlists = await query(`
                SELECT * FROM iptv_editor_playlists WHERE id = ?
            `, [userData.iptv_editor_playlist_id]);

            if (playlists.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Playlist not found'
                });
            }

            const playlist = playlists[0];

            // Get editor_dns setting
            const editorDnsSettings = await query(`
                SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
            `);
            const editorDns = editorDnsSettings.length > 0 ? editorDnsSettings[0].setting_value : null;

            // User credentials for URL substitution
            const userUsername = userData.iptv_editor_username || userData.editor_user_username;
            const userPassword = userData.iptv_editor_password || userData.editor_user_password;

            if (!editorDns || !userUsername || !userPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing IPTV Editor credentials'
                });
            }

            // Check for cached channel data
            const cachedData = await query(`
                SELECT * FROM iptv_editor_playlist_channels WHERE playlist_id = ?
            `, [playlist.id]);

            let channels = [];

            if (cachedData.length > 0) {
                // Use cached data
                channels = JSON.parse(cachedData[0].channel_data);
            } else {
                // No cache - fetch from provider and cache it
                const providerM3uUrl = `${playlist.provider_base_url}/get.php?username=${playlist.provider_username}&password=${playlist.provider_password}&type=m3u_plus&output=ts`;

                console.log(`Fetching M3U from provider for playlist ${playlist.id}: ${playlist.provider_base_url}`);

                const https = require('https');
                const http = require('http');
                const url = require('url');

                const parsedUrl = url.parse(providerM3uUrl);
                const httpModule = parsedUrl.protocol === 'https:' ? https : http;

                const fetchM3U = () => new Promise((resolve, reject) => {
                    const options = {
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                        path: parsedUrl.path,
                        method: 'GET',
                        timeout: 120000,
                        rejectUnauthorized: false
                    };

                    const request = httpModule.request(options, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => resolve(data));
                    });

                    request.on('error', reject);
                    request.on('timeout', () => {
                        request.destroy();
                        reject(new Error('Request timeout'));
                    });

                    request.end();
                });

                const m3uContent = await fetchM3U();

                // Parse M3U content - extract channel metadata and stream IDs
                const lines = m3uContent.split('\n');
                let currentChannel = null;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (line.startsWith('#EXTINF:')) {
                        const match = line.match(/#EXTINF:-?\d+\s*(.*?),(.*)$/);
                        if (match) {
                            const attrs = match[1];
                            const name = match[2].trim();

                            const tvgId = attrs.match(/tvg-id="([^"]*)"/)?.[1] || '';
                            const tvgName = attrs.match(/tvg-name="([^"]*)"/)?.[1] || name;
                            const tvgLogo = attrs.match(/tvg-logo="([^"]*)"/)?.[1] || '';
                            const groupTitle = attrs.match(/group-title="([^"]*)"/)?.[1] || '';

                            currentChannel = {
                                id: tvgId || tvgName,
                                name: name,
                                logo: tvgLogo,
                                group: groupTitle,
                                stream_id: null
                            };
                        }
                    } else if (line && !line.startsWith('#') && currentChannel) {
                        // Extract stream_id from URL (last part before .ts/.m3u8)
                        // Format: http://host/live/user/pass/stream_id.ts
                        const streamMatch = line.match(/\/live\/[^\/]+\/[^\/]+\/([^\.]+)\.(ts|m3u8)/);
                        if (streamMatch) {
                            currentChannel.stream_id = streamMatch[1];
                        } else {
                            // Fallback: use full URL as template
                            currentChannel.stream_id = line;
                        }
                        // Only include live channels (not VOD)
                        if (line.includes('/live/')) {
                            channels.push(currentChannel);
                        }
                        currentChannel = null;
                    }
                }

                // Cache the parsed channel data
                if (channels.length > 0) {
                    await query(`
                        INSERT OR REPLACE INTO iptv_editor_playlist_channels
                        (playlist_id, channel_data, channel_count, last_updated)
                        VALUES (?, ?, ?, datetime('now'))
                    `, [playlist.id, JSON.stringify(channels), channels.length]);

                    console.log(`Cached ${channels.length} channels for playlist ${playlist.id}`);
                }
            }

            // Build user-specific URLs for each channel
            const userChannels = channels.map(ch => ({
                id: ch.id,
                name: ch.name,
                logo: ch.logo,
                group: ch.group,
                // Build URL with user's credentials through editor_dns
                url: `${editorDns}/live/${userUsername}/${userPassword}/${ch.stream_id}.ts`
            }));

            // Limit to first 1000 channels for performance
            const limitedChannels = userChannels.slice(0, 1000);

            return res.json({
                success: true,
                channels: limitedChannels,
                total: userChannels.length,
                limited: userChannels.length > 1000,
                cached: cachedData.length > 0
            });
        }

        // Fallback for non-IPTV Editor users (regular IPTV panel)
        if (userData.iptv_enabled && userData.iptv_username && userData.panel_url) {
            const m3uUrl = userData.iptv_m3u_url ||
                `${userData.panel_url}/get.php?username=${userData.iptv_username}&password=${userData.iptv_password}&type=m3u_plus&output=ts`;

            // ... existing fallback code for panel users ...
            return res.json({
                success: true,
                channels: [],
                total: 0,
                message: 'Panel IPTV not yet implemented with caching'
            });
        }

        return res.status(400).json({
            success: false,
            message: 'No IPTV service configured'
        });

    } catch (error) {
        console.error('Error fetching IPTV channels:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch channels: ' + error.message
        });
    }
});

/**
 * GET /api/v2/portal/iptv/epg
 * Get EPG program guide data for the user's IPTV service
 * Returns channels with programs for a time window (default: current time + 6 hours)
 */
router.get('/iptv/epg', async (req, res) => {
    try {
        const user = req.portalUser;

        if (!user.iptv_enabled && !user.iptv_editor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'IPTV service not enabled'
            });
        }

        // Get user's EPG URL
        let epgUrl = null;

        // Check for IPTV Editor credentials first
        if (user.iptv_editor_enabled) {
            const userData = await query(`
                SELECT u.*, ieu.iptv_editor_username as ieu_username, ieu.iptv_editor_password as ieu_password
                FROM users u
                LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
                WHERE u.id = ?
            `, [user.user_id]);

            if (userData.length > 0) {
                const ud = userData[0];
                epgUrl = ud.iptv_editor_epg_url;

                // If no stored URL, generate from editor_dns
                if (!epgUrl) {
                    const editorDnsSettings = await query(
                        `SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'`
                    );
                    const editorDns = editorDnsSettings.length > 0 ? editorDnsSettings[0].setting_value : null;
                    const username = ud.iptv_editor_username || ud.ieu_username;
                    const password = ud.iptv_editor_password || ud.ieu_password;

                    if (editorDns && username && password) {
                        epgUrl = `${editorDns}/xmltv.php?username=${username}&password=${password}`;
                    }
                }
            }
        }

        // Fallback to panel EPG URL
        if (!epgUrl && user.iptv_enabled) {
            const userData = await query(`
                SELECT u.*, ip.base_url as panel_url
                FROM users u
                LEFT JOIN iptv_panels ip ON ip.id = u.iptv_panel_id
                WHERE u.id = ?
            `, [user.user_id]);

            if (userData.length > 0 && userData[0].panel_url && userData[0].iptv_username) {
                const ud = userData[0];
                epgUrl = `${ud.panel_url}/xmltv.php?username=${ud.iptv_username}&password=${ud.iptv_password}`;
            }
        }

        if (!epgUrl) {
            return res.status(400).json({
                success: false,
                message: 'No EPG URL available for this user'
            });
        }

        // Parse time range from query params (default: 3 hours before to 6 hours after)
        const now = new Date();
        const hoursBack = parseInt(req.query.hoursBack) || 3;
        const hoursForward = parseInt(req.query.hoursForward) || 6;

        const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
        const endTime = new Date(now.getTime() + hoursForward * 60 * 60 * 1000);

        // Parse XMLTV EPG data
        const epgData = await parseXMLTVEPG(epgUrl);

        // Organize for guide grid
        const grid = organizeForGuideGrid(epgData.programs, epgData.channels, startTime, endTime);

        // Build response with channels and their programs
        const guideData = Object.entries(epgData.channels).map(([channelId, channel]) => ({
            id: channelId,
            name: channel.name,
            logo: channel.logo,
            programs: grid[channelId] || []
        }));

        // Sort channels by name
        guideData.sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            success: true,
            timeRange: {
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                now: now.toISOString()
            },
            channels: guideData,
            totalChannels: guideData.length,
            totalPrograms: epgData.programs.length
        });

    } catch (error) {
        console.error('Error fetching EPG data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch EPG data: ' + error.message
        });
    }
});

/**
 * GET /api/v2/portal/iptv/guide
 * Get TV Guide data using Xtream API with admin-level caching and user-level filtering
 *
 * Architecture:
 * 1. Cache: Full guide data (categories + channels) cached at panel/playlist level using admin credentials
 * 2. Filter: Quick Xtream API call with USER's credentials to get their allowed categories
 * 3. Serve: Filter cached data to only show categories the user has access to
 *
 * Query params:
 *   - source: 'editor' (default for editor users) or 'direct' (panel fallback)
 *   - category_id: Filter by category ID (optional)
 */
router.get('/iptv/guide', async (req, res) => {
    try {
        const user = req.portalUser;
        const { getLiveCategories, buildStreamUrl } = require('../utils/xtream-api');
        const requestedSource = req.query.source; // 'editor' or 'direct'
        const categoryFilter = req.query.category_id;

        if (!user.iptv_enabled && !user.iptv_editor_enabled) {
            return res.status(400).json({
                success: false,
                message: 'IPTV service not enabled'
            });
        }

        // Get user data with IPTV Editor assignment and panel info
        const users = await query(`
            SELECT u.*,
                   ieu.iptv_editor_playlist_id,
                   ieu.iptv_editor_username as editor_username,
                   ieu.iptv_editor_password as editor_password,
                   ip.id as panel_id,
                   ip.provider_base_url as panel_provider_url,
                   ip.m3u_url as panel_m3u_url,
                   ip.name as panel_name,
                   iep.provider_base_url as playlist_provider_url,
                   iep.name as playlist_name
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            LEFT JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = users[0];

        // Helper function to parse M3U URL and extract credentials
        function parseM3uCredentials(m3uUrl) {
            if (!m3uUrl) return null;
            try {
                const url = new URL(m3uUrl);
                const username = url.searchParams.get('username');
                const password = url.searchParams.get('password');
                if (username && password) {
                    return {
                        baseUrl: url.origin,
                        username,
                        password
                    };
                }
                // Fallback: path-based credentials (e.g., /username/password/get.m3u)
                const pathParts = url.pathname.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    return {
                        baseUrl: url.origin,
                        username: pathParts[0],
                        password: pathParts[1]
                    };
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        // Get Xtream credentials from M3U URL
        const m3uCreds = parseM3uCredentials(userData.panel_m3u_url);

        // Determine available sources for this user
        const hasEditor = userData.iptv_editor_enabled === 1 && userData.iptv_editor_playlist_id && userData.editor_username;
        const hasPanel = userData.iptv_enabled === 1 && userData.panel_provider_url && m3uCreds;

        // Determine which source to use
        // Accept both 'direct' and 'panel' as the panel source (for backwards compatibility)
        let useSource = 'panel'; // default
        if (hasEditor && (!requestedSource || requestedSource === 'editor')) {
            useSource = 'editor';
        } else if (hasPanel && (requestedSource === 'direct' || requestedSource === 'panel')) {
            useSource = 'panel';
        } else if (hasEditor) {
            useSource = 'editor';
        } else if (hasPanel) {
            useSource = 'panel';
        } else {
            return res.status(400).json({ success: false, message: 'No IPTV service configured' });
        }

        // Get the appropriate credentials and source info
        let sourceType, sourceId, baseUrl, userUsername, userPassword;

        if (useSource === 'editor') {
            sourceType = 'playlist';
            sourceId = userData.iptv_editor_playlist_id;
            // For editor users, use the editor DNS or provider URL for streams
            const editorDnsSettings = await query(`
                SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
            `);
            baseUrl = (editorDnsSettings.length > 0 && editorDnsSettings[0].setting_value)
                ? editorDnsSettings[0].setting_value
                : userData.playlist_provider_url;
            userUsername = userData.editor_username;
            userPassword = userData.editor_password;
        } else {
            sourceType = 'panel';
            sourceId = userData.panel_id;
            // Use provider_base_url with M3U credentials for Xtream API
            baseUrl = userData.panel_provider_url;
            userUsername = m3uCreds.username;
            userPassword = m3uCreds.password;
            console.log(`📺 Panel guide: using Xtream URL ${baseUrl} with M3U credentials`);
        }

        if (!userUsername || !userPassword || !baseUrl) {
            return res.status(400).json({ success: false, message: 'Missing IPTV credentials' });
        }

        // Get cached guide data
        const cacheData = await query(`
            SELECT * FROM guide_cache WHERE source_type = ? AND source_id = ?
        `, [sourceType, sourceId]);

        if (!cacheData.length || !cacheData[0].categories_json) {
            return res.status(400).json({
                success: false,
                message: 'Guide data not cached yet. Please wait for the background job to run or ask admin to refresh.',
                needsRefresh: true
            });
        }

        const cache = cacheData[0];
        const allCategories = JSON.parse(cache.categories_json);
        const allChannels = JSON.parse(cache.channels_json);

        // Quick API call with USER's credentials to get their allowed categories
        console.log(`📺 Fetching user categories for ${userUsername} from ${baseUrl}`);
        let userCategories;
        try {
            userCategories = await getLiveCategories(baseUrl, userUsername, userPassword);
        } catch (error) {
            console.error('Failed to fetch user categories:', error.message);
            // Fallback: use all cached categories (less restrictive)
            userCategories = allCategories;
        }

        // Create a set of category IDs the user has access to
        const userCategoryIds = new Set(userCategories.map(c => String(c.category_id)));

        // Filter categories to only those the user has (excluding 'all' pseudo-category for now)
        const filteredCategories = allCategories.filter(cat =>
            cat.category_id === 'all' || userCategoryIds.has(String(cat.category_id))
        );

        // Filter channels to only those in user's allowed categories
        let filteredChannels = allChannels.filter(ch =>
            userCategoryIds.has(String(ch.category_id))
        );

        // Apply category filter if specified
        if (categoryFilter && categoryFilter !== 'all') {
            filteredChannels = filteredChannels.filter(ch =>
                String(ch.category_id) === String(categoryFilter)
            );
        }

        // Build user-specific stream URLs
        const channelsWithUrls = filteredChannels.map(ch => ({
            stream_id: ch.stream_id,
            name: ch.name,
            stream_icon: ch.stream_icon,
            category_id: ch.category_id,
            epg_channel_id: ch.epg_channel_id,
            is_adult: ch.is_adult,
            url: buildStreamUrl(baseUrl, userUsername, userPassword, ch.stream_id, 'm3u8')
        }));

        // Parse EPG data - ONLY for channels being returned (performance optimization)
        // Skip EPG entirely if no category filter (loading all channels would be too slow)
        // Uses in-memory cache to avoid re-parsing large JSON on each request
        let epgData = {};
        let epgChannelCount = 0;
        const shouldLoadEpg = categoryFilter && categoryFilter !== 'all';

        if (shouldLoadEpg && cache.epg_json) {
            try {
                // Check in-memory cache first
                let fullEpg = epgCache.get(sourceType, sourceId, cache.epg_last_updated);

                if (!fullEpg) {
                    // Parse from database and cache in memory
                    console.log(`📺 Parsing EPG JSON for ${sourceType}:${sourceId} (not in memory cache)`);
                    fullEpg = JSON.parse(cache.epg_json);
                    epgCache.set(sourceType, sourceId, fullEpg);
                }

                if (fullEpg.programsByChannel) {
                    // Only include EPG for channels we're returning
                    const epgChannelIds = new Set(channelsWithUrls.map(ch => ch.epg_channel_id).filter(Boolean));
                    for (const epgId of epgChannelIds) {
                        if (fullEpg.programsByChannel[epgId]) {
                            epgData[epgId] = fullEpg.programsByChannel[epgId];
                            epgChannelCount++;
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to parse EPG cache:', e.message);
            }
        }

        // Build response
        const response = {
            success: true,
            source: useSource,
            sourceName: useSource === 'editor' ? userData.playlist_name : userData.panel_name,
            availableSources: {
                editor: hasEditor,
                direct: hasPanel
            },
            categories: filteredCategories,
            channels: channelsWithUrls,
            totalCategories: filteredCategories.length,
            totalChannels: channelsWithUrls.length,
            cacheLastUpdated: cache.last_updated,
            baseUrl: baseUrl, // For client to build HLS URLs if needed
            epg: epgData, // EPG program data keyed by epg_channel_id (filtered to visible channels only)
            epgLastUpdated: cache.epg_last_updated,
            epgChannelCount: epgChannelCount
        };

        console.log(`✅ Returning ${filteredCategories.length} categories, ${channelsWithUrls.length} channels, ${epgChannelCount} EPG channels for user ${user.user_id} (source: ${useSource})`);

        return res.json(response);

    } catch (error) {
        console.error('Error fetching guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch guide: ' + error.message
        });
    }
});

/**
 * GET /api/v2/portal/iptv/guide/channels/:categoryId
 * Get channels for a specific category (lazy loading)
 */
router.get('/iptv/guide/channels/:categoryId', async (req, res) => {
    try {
        const user = req.portalUser;
        const { categoryId } = req.params;
        const { buildStreamUrl } = require('../utils/xtream-api');
        const requestedSource = req.query.source;

        // Get user data
        const users = await query(`
            SELECT u.*,
                   ieu.iptv_editor_playlist_id,
                   ieu.iptv_editor_username as editor_username,
                   ieu.iptv_editor_password as editor_password,
                   ip.id as panel_id,
                   ip.provider_base_url as panel_provider_url,
                   ip.m3u_url as panel_m3u_url,
                   iep.provider_base_url as playlist_provider_url
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            LEFT JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = users[0];

        // Helper to parse M3U URL credentials
        function parseM3uCredentials(m3uUrl) {
            if (!m3uUrl) return null;
            try {
                const url = new URL(m3uUrl);
                const username = url.searchParams.get('username');
                const password = url.searchParams.get('password');
                if (username && password) {
                    return { baseUrl: url.origin, username, password };
                }
                const pathParts = url.pathname.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    return { baseUrl: url.origin, username: pathParts[0], password: pathParts[1] };
                }
                return null;
            } catch (e) {
                return null;
            }
        }
        const m3uCreds = parseM3uCredentials(userData.panel_m3u_url);

        // Determine source
        // Accept both 'direct' and 'panel' as the panel source
        const hasEditor = userData.iptv_editor_enabled === 1 && userData.iptv_editor_playlist_id;
        const hasPanel = userData.iptv_enabled === 1 && userData.panel_id && m3uCreds;
        const wantsPanel = requestedSource === 'direct' || requestedSource === 'panel';
        let useSource = hasEditor && !wantsPanel ? 'editor' : 'panel';

        let sourceType, sourceId, baseUrl, userUsername, userPassword;

        if (useSource === 'editor') {
            sourceType = 'playlist';
            sourceId = userData.iptv_editor_playlist_id;
            const editorDnsSettings = await query(`
                SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
            `);
            baseUrl = (editorDnsSettings.length > 0 && editorDnsSettings[0].setting_value)
                ? editorDnsSettings[0].setting_value
                : userData.playlist_provider_url;
            userUsername = userData.editor_username;
            userPassword = userData.editor_password;
        } else {
            sourceType = 'panel';
            sourceId = userData.panel_id;
            // Use M3U URL credentials for Xtream API
            baseUrl = m3uCreds.baseUrl;
            userUsername = m3uCreds.username;
            userPassword = m3uCreds.password;
        }

        // Get cached channels
        const cacheData = await query(`
            SELECT channels_json FROM guide_cache WHERE source_type = ? AND source_id = ?
        `, [sourceType, sourceId]);

        if (!cacheData.length) {
            return res.status(400).json({ success: false, message: 'Guide not cached' });
        }

        const allChannels = JSON.parse(cacheData[0].channels_json);

        // Filter by category
        let channels;
        if (categoryId === 'all') {
            channels = allChannels;
        } else {
            channels = allChannels.filter(ch => String(ch.category_id) === String(categoryId));
        }

        // Build URLs
        const channelsWithUrls = channels.map(ch => ({
            stream_id: ch.stream_id,
            name: ch.name,
            stream_icon: ch.stream_icon,
            category_id: ch.category_id,
            epg_channel_id: ch.epg_channel_id,
            is_adult: ch.is_adult,
            url: buildStreamUrl(baseUrl, userUsername, userPassword, ch.stream_id, 'm3u8')
        }));

        return res.json({
            success: true,
            categoryId,
            channels: channelsWithUrls,
            total: channelsWithUrls.length
        });

    } catch (error) {
        console.error('Error fetching category channels:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/v2/portal/iptv/guide/refresh
 * Trigger a guide cache refresh for the user's source (admin use or manual refresh)
 */
router.post('/iptv/guide/refresh', async (req, res) => {
    try {
        const user = req.portalUser;
        const GuideCacheRefreshJob = require('../jobs/guide-cache-refresh');

        // Get user's source info
        const users = await query(`
            SELECT u.*, ieu.iptv_editor_playlist_id, ip.id as panel_id
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = users[0];
        const job = new GuideCacheRefreshJob();

        const results = [];

        // Refresh playlist cache if user has editor
        if (userData.iptv_editor_enabled === 1 && userData.iptv_editor_playlist_id) {
            try {
                const result = await job.refreshPlaylist(userData.iptv_editor_playlist_id);
                results.push({ source: 'playlist', ...result });
            } catch (e) {
                results.push({ source: 'playlist', success: false, error: e.message });
            }
        }

        // Refresh panel cache if user has panel
        if (userData.iptv_enabled === 1 && userData.panel_id) {
            try {
                const result = await job.refreshPanel(userData.panel_id);
                results.push({ source: 'panel', ...result });
            } catch (e) {
                results.push({ source: 'panel', success: false, error: e.message });
            }
        }

        job.close();

        return res.json({
            success: true,
            message: 'Guide cache refresh completed',
            results
        });

    } catch (error) {
        console.error('Error refreshing guide:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/v2/portal/iptv/guide-channels (LEGACY - kept for backwards compatibility)
 * Redirects to new /iptv/guide endpoint
 */
router.get('/iptv/guide-channels', async (req, res) => {
    // Transform query params and redirect to new endpoint
    const newUrl = `/api/v2/portal/iptv/guide?grouped=true${req.query.category ? '&category_id=' + req.query.category : ''}`;
    console.log(`📢 Legacy guide-channels called, redirecting to new guide endpoint`);

    // Just call the new guide endpoint logic directly
    try {
        const user = req.portalUser;
        const { getLiveCategories, buildStreamUrl } = require('../utils/xtream-api');

        if (!user.iptv_enabled && !user.iptv_editor_enabled) {
            return res.status(400).json({ success: false, message: 'IPTV service not enabled' });
        }

        // Get user data
        const users = await query(`
            SELECT u.*,
                   ieu.iptv_editor_playlist_id,
                   ieu.iptv_editor_username as editor_username,
                   ieu.iptv_editor_password as editor_password,
                   ip.id as panel_id,
                   ip.base_url as panel_url,
                   iep.provider_base_url as playlist_provider_url
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON ieu.user_id = u.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            LEFT JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
            WHERE u.id = ?
        `, [user.user_id]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = users[0];
        const hasEditor = userData.iptv_editor_enabled === 1 && userData.iptv_editor_playlist_id;
        const hasPanel = userData.iptv_enabled === 1 && userData.panel_id;
        const useSource = hasEditor ? 'editor' : 'panel';

        let sourceType, sourceId, baseUrl, userUsername, userPassword;

        if (useSource === 'editor') {
            sourceType = 'playlist';
            sourceId = userData.iptv_editor_playlist_id;
            const editorDnsSettings = await query(`
                SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
            `);
            baseUrl = (editorDnsSettings.length > 0 && editorDnsSettings[0].setting_value)
                ? editorDnsSettings[0].setting_value
                : userData.playlist_provider_url;
            userUsername = userData.editor_username;
            userPassword = userData.editor_password;
        } else if (hasPanel) {
            sourceType = 'panel';
            sourceId = userData.panel_id;
            baseUrl = userData.panel_url;
            userUsername = userData.iptv_username;
            userPassword = userData.iptv_password;
        } else {
            return res.status(400).json({ success: false, message: 'No IPTV service configured' });
        }

        // Get cached data
        const cacheData = await query(`
            SELECT * FROM guide_cache WHERE source_type = ? AND source_id = ?
        `, [sourceType, sourceId]);

        if (!cacheData.length || !cacheData[0].channels_json) {
            return res.status(400).json({
                success: false,
                message: 'Guide data not cached. Please wait for refresh.',
                needsConfiguration: true
            });
        }

        const allChannels = JSON.parse(cacheData[0].channels_json);
        const allCategories = JSON.parse(cacheData[0].categories_json);

        // Build channels with URLs
        const channelsWithUrls = allChannels.map(ch => ({
            id: String(ch.stream_id),
            name: ch.name,
            logo: ch.stream_icon,
            group: allCategories.find(c => String(c.category_id) === String(ch.category_id))?.category_name || 'Other',
            url: buildStreamUrl(baseUrl, userUsername, userPassword, ch.stream_id, 'm3u8')
        }));

        // Group by category name for legacy format
        const grouped = {};
        channelsWithUrls.forEach(ch => {
            if (!grouped[ch.group]) grouped[ch.group] = [];
            grouped[ch.group].push(ch);
        });

        const categories = Object.keys(grouped).sort((a, b) => {
            if (a === 'Other') return 1;
            if (b === 'Other') return -1;
            return a.localeCompare(b);
        });

        return res.json({
            success: true,
            grouped,
            categories,
            channels: channelsWithUrls,
            total: channelsWithUrls.length,
            source: useSource === 'editor' ? 'iptv_editor' : 'iptv_panel',
            cached: true
        });

    } catch (error) {
        console.error('Error in legacy guide-channels:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
