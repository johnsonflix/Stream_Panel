/**
 * Portal Authentication Routes
 *
 * Handles authentication for the end-user portal.
 * Supports IPTV credential login and Plex SSO.
 */

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database-config');
const { sendIPTVCredentialsEmail } = require('../services/email-service');

const router = express.Router();

// Portal session duration: 7 days
const PORTAL_SESSION_DURATION_DAYS = 7;

/**
 * Helper: Generate secure session token
 */
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Helper: Calculate session expiration date
 */
function getSessionExpiration() {
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + PORTAL_SESSION_DURATION_DAYS);
    return expiration.toISOString();
}

/**
 * Helper: Sanitize user data for response
 */
function sanitizeUserForPortal(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        plex_email: user.plex_email,
        expiration_date: user.expiration_date,
        subscription_status: user.subscription_status,
        iptv_username: user.iptv_username,
        iptv_password: user.iptv_password,
        iptv_editor_username: user.iptv_editor_username,
        iptv_editor_password: user.iptv_editor_password,
        m3u_url: user.m3u_url,
        iptv_subscription_name: user.iptv_subscription_name,
        plex_package_name: user.plex_package_name
    };
}

/**
 * POST /api/v2/portal/auth/login
 * Authenticate user with IPTV credentials
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password, method } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Search for user by IPTV credentials (either regular or editor credentials)
        // Allow app users (admins) who also have IPTV/Plex services to login to portal
        const users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE ((u.iptv_username = ? AND u.iptv_password = ?)
               OR (u.iptv_editor_username = ? AND u.iptv_editor_password = ?))
        `, [username, password, username, password]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. Please check your username and password.'
            });
        }

        const user = users[0];

        // Generate session token
        const sessionToken = generateSessionToken();
        const expiresAt = getSessionExpiration();

        // Create portal session
        await query(`
            INSERT INTO portal_sessions (user_id, token, login_method, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            user.id,
            sessionToken,
            method || 'iptv',
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt
        ]);

        // Get user's Plex server access if any
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_servers = plexShares.map(share => ({
            id: share.plex_server_id,
            name: share.server_name,
            libraries: share.library_ids ? JSON.parse(share.library_ids) : []
        }));

        res.json({
            success: true,
            message: 'Login successful',
            token: sessionToken,
            user: sanitizedUser,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error('Portal IPTV login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

/**
 * POST /api/v2/portal/auth/email-login
 * Send IPTV login credentials to user's email
 */
router.post('/email-login', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Always return success message for security (don't reveal if email exists)
        const successMessage = 'If an account exists with this email, your login credentials have been sent.';

        // Search for user by email - allow all users including admins with services
        const users = await query(`
            SELECT u.id, u.name, u.email, u.iptv_username, u.iptv_password,
                   u.iptv_editor_username, u.iptv_editor_password
            FROM users u
            WHERE u.email = ?
        `, [email]);

        if (users.length === 0) {
            // User not found, but return success for security
            console.log(`[Portal Auth] Email lookup request for non-existent email: ${email}`);
            return res.json({
                success: true,
                message: successMessage
            });
        }

        const user = users[0];

        // Check if user has IPTV credentials
        if (!user.iptv_username && !user.iptv_editor_username) {
            console.log(`[Portal Auth] User ${email} has no IPTV credentials`);
            return res.json({
                success: true,
                message: successMessage
            });
        }

        // Check if user has Plex access
        const plexShares = await query(`
            SELECT COUNT(*) as count FROM user_plex_shares WHERE user_id = ?
        `, [user.id]);
        const hasPlexAccess = plexShares[0]?.count > 0;

        // Send email with credentials
        try {
            await sendIPTVCredentialsEmail(
                user.email,
                user.name || 'User',
                user.iptv_username,
                user.iptv_password,
                user.iptv_editor_username,
                user.iptv_editor_password,
                hasPlexAccess
            );
            console.log(`[Portal Auth] IPTV credentials email sent to ${email}`);
        } catch (emailError) {
            console.error(`[Portal Auth] Failed to send credentials email to ${email}:`, emailError);
            // Still return success to not reveal email existence
        }

        res.json({
            success: true,
            message: successMessage
        });

    } catch (error) {
        console.error('Portal email-login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.'
        });
    }
});

/**
 * POST /api/v2/portal/auth/plex/init
 * Initialize Plex OAuth flow
 */
router.post('/plex/init', async (req, res) => {
    try {
        // Check if Plex login is enabled
        const plexEnabled = await query(`SELECT setting_value FROM settings WHERE setting_key = 'portal_plex_enabled'`);
        if (plexEnabled.length > 0 && (plexEnabled[0].setting_value === 'false' || plexEnabled[0].setting_value === false)) {
            return res.status(403).json({
                success: false,
                message: 'Plex login is not enabled'
            });
        }

        // Get Plex client ID from settings or generate one
        let clientId;
        const clientIdSetting = await query(`SELECT setting_value FROM settings WHERE setting_key = 'plex_client_id'`);

        if (clientIdSetting.length === 0) {
            // Generate and store a new client ID
            clientId = crypto.randomUUID();
            await query(`INSERT INTO settings (setting_key, setting_value) VALUES ('plex_client_id', ?)`, [clientId]);
        } else {
            clientId = clientIdSetting[0].setting_value;
        }

        // Generate a state token to prevent CSRF
        const stateToken = crypto.randomBytes(16).toString('hex');

        // Store state token temporarily (could use a temp table or memory store)
        // For simplicity, we'll include it in the redirect URL

        // Build Plex OAuth URL
        const plexAuthUrl = new URL('https://app.plex.tv/auth#!');
        plexAuthUrl.searchParams.set('clientID', clientId);
        plexAuthUrl.searchParams.set('code', stateToken);
        plexAuthUrl.searchParams.set('context[device][product]', 'StreamPanel Portal');
        plexAuthUrl.searchParams.set('context[device][environment]', 'bundled');
        plexAuthUrl.searchParams.set('context[device][layout]', 'desktop');
        plexAuthUrl.searchParams.set('context[device][platform]', 'Web');

        // Get the host from request for callback URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers.host || 'localhost:3050';
        const forwardUrl = `${protocol}://${host}/portal/login?state=${stateToken}`;

        plexAuthUrl.searchParams.set('forwardUrl', forwardUrl);

        res.json({
            success: true,
            authUrl: plexAuthUrl.toString(),
            state: stateToken
        });

    } catch (error) {
        console.error('Plex OAuth init error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize Plex authentication'
        });
    }
});

/**
 * POST /api/v2/portal/auth/plex/callback
 * Handle Plex OAuth callback and verify user
 */
router.post('/plex/callback', async (req, res) => {
    try {
        const { plex_token } = req.body;

        if (!plex_token) {
            return res.status(400).json({
                success: false,
                message: 'No Plex token provided'
            });
        }

        // Get user info from Plex
        const plexUserInfo = await getPlexUserInfo(plex_token);

        if (!plexUserInfo || !plexUserInfo.email) {
            return res.status(400).json({
                success: false,
                message: 'Failed to get Plex account information'
            });
        }

        // Find user by plex_email - allow all users including admins with Plex access
        const users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE u.plex_email = ?
        `, [plexUserInfo.email]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'No account found linked to this Plex email. Please contact support.'
            });
        }

        const user = users[0];

        // Verify user has access to at least one of our Plex servers
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name, ps.server_id
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        if (plexShares.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Your account does not have access to any Plex servers.'
            });
        }

        // Generate session token
        const sessionToken = generateSessionToken();
        const expiresAt = getSessionExpiration();

        // Create portal session with Plex token
        await query(`
            INSERT INTO portal_sessions (user_id, token, login_method, plex_token, ip_address, user_agent, expires_at)
            VALUES (?, ?, 'plex', ?, ?, ?, ?)
        `, [
            user.id,
            sessionToken,
            plex_token,
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt
        ]);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_email = plexUserInfo.email;
        sanitizedUser.plex_username = plexUserInfo.username;
        sanitizedUser.plex_servers = plexShares.map(share => ({
            id: share.plex_server_id,
            name: share.server_name,
            libraries: share.library_ids ? JSON.parse(share.library_ids) : []
        }));

        res.json({
            success: true,
            message: 'Plex login successful',
            token: sessionToken,
            user: sanitizedUser,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error('Plex callback error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during Plex authentication'
        });
    }
});

/**
 * GET /api/v2/portal/auth/verify
 * Verify portal session token
 */
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find valid session
        const sessions = await query(`
            SELECT * FROM portal_sessions
            WHERE token = ?
            AND datetime(expires_at) > datetime('now')
        `, [token]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Update last activity
        await query(`
            UPDATE portal_sessions
            SET last_activity = datetime('now')
            WHERE id = ?
        `, [session.id]);

        // Get user data
        const users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE u.id = ?
        `, [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Get Plex shares
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_servers = plexShares.map(share => ({
            id: share.plex_server_id,
            name: share.server_name,
            libraries: share.library_ids ? JSON.parse(share.library_ids) : []
        }));

        res.json({
            success: true,
            user: sanitizedUser,
            session: {
                login_method: session.login_method,
                created_at: session.created_at,
                expires_at: session.expires_at
            }
        });

    } catch (error) {
        console.error('Portal session verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * POST /api/v2/portal/auth/logout
 * Logout from portal
 */
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Delete session
        await query('DELETE FROM portal_sessions WHERE token = ?', [token]);

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Portal logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
});

/**
 * Helper: Get Plex user info from token
 */
async function getPlexUserInfo(plexToken) {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch('https://plex.tv/api/v2/user', {
            headers: {
                'Accept': 'application/json',
                'X-Plex-Token': plexToken,
                'X-Plex-Client-Identifier': 'StreamPanel-Portal'
            }
        });

        if (!response.ok) {
            console.error('Plex API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();

        return {
            id: data.id,
            uuid: data.uuid,
            username: data.username,
            email: data.email,
            thumb: data.thumb
        };

    } catch (error) {
        console.error('Error getting Plex user info:', error);
        return null;
    }
}

/**
 * Cleanup expired portal sessions
 */
router.post('/cleanup', async (req, res) => {
    try {
        const result = await query(`
            DELETE FROM portal_sessions
            WHERE datetime(expires_at) <= datetime('now')
        `);

        res.json({
            success: true,
            message: 'Expired sessions cleaned up'
        });

    } catch (error) {
        console.error('Portal session cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
