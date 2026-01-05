/**
 * Plex SSO Routes for Admin Login
 *
 * Handles Plex OAuth flow for app users (admins) who have Plex SSO enabled
 */

const express = require('express');
const crypto = require('crypto');
const { query } = require('../database-config');

const router = express.Router();

// In-memory pin storage (in production, use Redis or database)
const pins = new Map();

// Plex API configuration
const PLEX_API_BASE = 'https://plex.tv/api/v2';
const PLEX_CLIENT_ID = 'StreamPanel-Admin';

/**
 * GET /api/v2/auth/plex/config
 * Check if Plex SSO is available (any app user has it enabled)
 */
router.get('/config', async (req, res) => {
    try {
        // Check if any app user has Plex SSO enabled
        const users = await query(`
            SELECT COUNT(*) as count FROM users
            WHERE is_app_user = 1
            AND plex_sso_enabled = 1
        `);

        const enabled = users[0]?.count > 0;

        res.json({
            success: true,
            enabled: enabled
        });

    } catch (error) {
        console.error('Plex SSO config check error:', error);
        res.json({
            success: true,
            enabled: false
        });
    }
});

/**
 * POST /api/v2/auth/plex/init
 * Initialize Plex OAuth flow
 */
router.post('/init', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        // Generate a unique pin ID
        const pinId = crypto.randomBytes(16).toString('hex');

        // Request a PIN from Plex
        const pinResponse = await fetch(`${PLEX_API_BASE}/pins?strong=true`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
                'X-Plex-Product': 'StreamPanel',
                'X-Plex-Version': '2.0.0',
                'X-Plex-Device': 'Web',
                'X-Plex-Platform': 'Web'
            }
        });

        if (!pinResponse.ok) {
            throw new Error('Failed to create Plex PIN');
        }

        const pinData = await pinResponse.json();

        // Store the pin info
        pins.set(pinId, {
            plexPinId: pinData.id,
            plexPinCode: pinData.code,
            authToken: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        // Build the Plex auth URL
        const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinData.code}&context%5Bdevice%5D%5Bproduct%5D=StreamPanel&context%5Bdevice%5D%5Bplatform%5D=Web`;

        res.json({
            success: true,
            pinId: pinId,
            authUrl: authUrl
        });

    } catch (error) {
        console.error('Plex SSO init error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize Plex login'
        });
    }
});

/**
 * GET /api/v2/auth/plex/redirect
 * Server-side redirect for mobile Safari (no popup support)
 * Creates PIN and redirects to Plex with forwardUrl for automatic return
 */
router.get('/redirect', async (req, res) => {
    try {
        // Check if any app user has Plex SSO enabled
        const users = await query(`
            SELECT COUNT(*) as count FROM users
            WHERE is_app_user = 1
            AND plex_sso_enabled = 1
        `);

        if (users[0]?.count === 0) {
            return res.redirect('/login.html?error=plex_not_configured');
        }

        const fetch = (await import('node-fetch')).default;

        // Generate a unique pin ID for our internal tracking
        const pinId = crypto.randomBytes(16).toString('hex');

        // Request a PIN from Plex
        const pinResponse = await fetch(`${PLEX_API_BASE}/pins?strong=true`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
                'X-Plex-Product': 'StreamPanel',
                'X-Plex-Version': '2.0.0',
                'X-Plex-Device': 'Web',
                'X-Plex-Platform': 'Web'
            }
        });

        if (!pinResponse.ok) {
            console.error('[Admin Plex Redirect] Failed to create PIN:', pinResponse.status);
            return res.redirect('/login.html?error=plex_init_failed');
        }

        const pinData = await pinResponse.json();

        // Store the pin info
        pins.set(pinId, {
            plexPinId: pinData.id,
            plexPinCode: pinData.code,
            authToken: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        // Build return URL with pinId in query params (no cookies needed!)
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.headers.host;
        const returnUrl = `${protocol}://${host}/login.html?admin_plex_pin=${pinId}`;
        const encodedReturnUrl = encodeURIComponent(returnUrl);

        // Build the Plex auth URL with forwardUrl for automatic redirect back
        const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinData.code}&forwardUrl=${encodedReturnUrl}&context%5Bdevice%5D%5Bproduct%5D=StreamPanel&context%5Bdevice%5D%5Bplatform%5D=Web`;

        console.log('[Admin Plex Redirect] Redirecting to Plex auth, pinId:', pinId, 'returnUrl:', returnUrl);
        res.redirect(authUrl);

    } catch (error) {
        console.error('[Admin Plex Redirect] Error:', error);
        res.redirect('/login.html?error=plex_init_failed');
    }
});

/**
 * GET /api/v2/auth/plex/status/:pinId
 * Check if the PIN has been authenticated
 */
router.get('/status/:pinId', async (req, res) => {
    try {
        const { pinId } = req.params;
        const pinInfo = pins.get(pinId);

        if (!pinInfo) {
            return res.json({
                success: false,
                expired: true,
                authenticated: false
            });
        }

        // Check if expired
        if (Date.now() > pinInfo.expiresAt) {
            pins.delete(pinId);
            return res.json({
                success: false,
                expired: true,
                authenticated: false
            });
        }

        // If already authenticated, return immediately
        if (pinInfo.authToken) {
            return res.json({
                success: true,
                authenticated: true,
                expired: false
            });
        }

        // Check with Plex API
        const fetch = (await import('node-fetch')).default;

        const statusResponse = await fetch(`${PLEX_API_BASE}/pins/${pinInfo.plexPinId}`, {
            headers: {
                'Accept': 'application/json',
                'X-Plex-Client-Identifier': PLEX_CLIENT_ID
            }
        });

        if (!statusResponse.ok) {
            return res.json({
                success: false,
                authenticated: false,
                expired: false
            });
        }

        const statusData = await statusResponse.json();

        if (statusData.authToken) {
            // PIN was authenticated! Store the token
            pinInfo.authToken = statusData.authToken;
            pins.set(pinId, pinInfo);

            return res.json({
                success: true,
                authenticated: true,
                expired: false
            });
        }

        res.json({
            success: true,
            authenticated: false,
            expired: false
        });

    } catch (error) {
        console.error('Plex SSO status error:', error);
        res.json({
            success: false,
            authenticated: false,
            expired: false
        });
    }
});

/**
 * POST /api/v2/auth/plex/complete
 * Complete the Plex SSO login
 */
router.post('/complete', async (req, res) => {
    try {
        const { pinId } = req.body;
        const pinInfo = pins.get(pinId);

        if (!pinInfo || !pinInfo.authToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired authorization'
            });
        }

        // Get user info from Plex
        const fetch = (await import('node-fetch')).default;

        const userResponse = await fetch(`${PLEX_API_BASE}/user`, {
            headers: {
                'Accept': 'application/json',
                'X-Plex-Token': pinInfo.authToken,
                'X-Plex-Client-Identifier': PLEX_CLIENT_ID
            }
        });

        if (!userResponse.ok) {
            throw new Error('Failed to get Plex user info');
        }

        const plexUser = await userResponse.json();
        const plexEmail = plexUser.email?.toLowerCase();
        const plexUsername = plexUser.username;

        if (!plexEmail) {
            return res.status(400).json({
                success: false,
                error: 'no_email',
                message: 'Could not get email from Plex account'
            });
        }

        // Find app user with Plex SSO enabled and matching email
        const users = await query(`
            SELECT * FROM users
            WHERE is_app_user = 1
            AND plex_sso_enabled = 1
            AND (LOWER(plex_email) = ? OR LOWER(plex_sso_email) = ?)
        `, [plexEmail, plexEmail]);

        if (users.length === 0) {
            // Clean up pin
            pins.delete(pinId);

            return res.status(401).json({
                success: false,
                error: 'no_account',
                message: 'No account found with Plex SSO enabled for this Plex email'
            });
        }

        const user = users[0];

        // Optional: Check if user has access to required Plex servers
        // (This would require additional configuration per user)

        // Generate session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        // Create session
        await query(`
            INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `, [
            user.id,
            sessionToken,
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt.toISOString()
        ]);

        // Update last login
        await query(`
            UPDATE users
            SET last_login = datetime('now')
            WHERE id = ?
        `, [user.id]);

        // Clean up pin
        pins.delete(pinId);

        // Remove sensitive data
        delete user.password_hash;

        res.json({
            success: true,
            token: sessionToken,
            user: {
                ...user,
                plexUsername: plexUsername,
                plexEmail: plexEmail
            }
        });

    } catch (error) {
        console.error('Plex SSO complete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete Plex login'
        });
    }
});

// Clean up expired pins periodically
setInterval(() => {
    const now = Date.now();
    for (const [pinId, pinInfo] of pins.entries()) {
        if (now > pinInfo.expiresAt) {
            pins.delete(pinId);
        }
    }
}, 60000); // Every minute

module.exports = router;
