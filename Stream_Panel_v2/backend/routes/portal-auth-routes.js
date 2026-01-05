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

// Portal session duration: 90 days (for home screen app convenience)
const PORTAL_SESSION_DURATION_DAYS = 90;

// In-memory pin storage for Plex OAuth (popup-based flow)
const portalPlexPins = new Map();

// Plex API configuration
const PLEX_API_BASE = 'https://plex.tv/api/v2';
const PLEX_CLIENT_ID = 'StreamPanel-Portal';

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

// Lockout configuration
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 30;

/**
 * Helper: Check if account is locked
 */
function isAccountLocked(user) {
    if (!user.account_locked_until) return false;
    const lockTime = new Date(user.account_locked_until);
    return new Date() < lockTime;
}

/**
 * Helper: Lock account after too many failed attempts
 */
async function lockAccount(userId) {
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);

    await query(`
        UPDATE users
        SET account_locked_until = ?, login_attempts = 0, first_failed_attempt_at = NULL
        WHERE id = ?
    `, [lockUntil.toISOString(), userId]);
}

/**
 * Helper: Track failed login attempt with time window
 * Returns the new attempt count
 */
async function trackFailedAttempt(user) {
    const now = new Date();

    // Check if first attempt was outside window - reset if so
    if (user.first_failed_attempt_at) {
        const firstAttempt = new Date(user.first_failed_attempt_at);
        const windowExpiry = new Date(firstAttempt.getTime() + LOCKOUT_WINDOW_MINUTES * 60000);
        if (now > windowExpiry) {
            // Reset counter - outside window
            await query(`UPDATE users SET login_attempts = 1, first_failed_attempt_at = ? WHERE id = ?`,
                [now.toISOString(), user.id]);
            return 1;
        }
    }

    // Within window or first attempt
    const newAttempts = (user.login_attempts || 0) + 1;
    const firstAttempt = user.first_failed_attempt_at || now.toISOString();
    await query(`UPDATE users SET login_attempts = ?, first_failed_attempt_at = ? WHERE id = ?`,
        [newAttempts, firstAttempt, user.id]);
    return newAttempts;
}

/**
 * Helper: Reset login attempts on successful login
 */
async function resetLoginAttempts(userId) {
    await query(`
        UPDATE users
        SET login_attempts = 0, first_failed_attempt_at = NULL, account_locked_until = NULL
        WHERE id = ?
    `, [userId]);
}

/**
 * Helper: Sanitize user data for response
 */
function sanitizeUserForPortal(user) {
    // Compute request site access:
    // - If rs_has_access is explicitly 1, access granted
    // - If rs_has_access is null/undefined/0, default to plex_enabled value (auto mode)
    // Note: 0 is treated as "auto" (not explicitly disabled) for backwards compatibility
    // Use Number() to handle string/int type coercion from SQLite
    let hasRequestSiteAccess;
    const rsAccess = user.rs_has_access;
    if (rsAccess === 1 || rsAccess === '1' || rsAccess === true) {
        // Explicitly granted
        hasRequestSiteAccess = true;
    } else {
        // null/undefined/0 = auto: grant access if user has Plex enabled
        hasRequestSiteAccess = Number(user.plex_enabled) === 1;
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        plex_email: user.plex_email,
        expiration_date: user.expiration_date,
        subscription_status: user.subscription_status,
        // Service enabled flags
        plex_enabled: user.plex_enabled,
        iptv_enabled: user.iptv_enabled,
        iptv_editor_enabled: user.iptv_editor_enabled,
        // Service expiration dates
        plex_expiration_date: user.plex_expiration_date,
        iptv_expiration_date: user.iptv_expiration_date,
        // Cancellation fields
        plex_cancelled: user.plex_cancelled,
        plex_cancelled_at: user.plex_cancelled_at,
        plex_scheduled_deletion: user.plex_scheduled_deletion,
        iptv_cancelled: user.iptv_cancelled,
        iptv_cancelled_at: user.iptv_cancelled_at,
        iptv_scheduled_deletion: user.iptv_scheduled_deletion,
        // IPTV credentials
        iptv_username: user.iptv_username,
        iptv_password: user.iptv_password,
        iptv_editor_username: user.iptv_editor_username,
        iptv_editor_password: user.iptv_editor_password,
        m3u_url: user.m3u_url,
        iptv_subscription_name: user.iptv_subscription_name,
        plex_package_name: user.plex_package_name,
        // Request Site Access
        has_request_site_access: hasRequestSiteAccess,
        // Admin flag - allows portal to show admin-specific features
        is_app_user: user.is_app_user === 1 || user.is_app_user === true
    };
}

/**
 * POST /api/v2/portal/auth/login
 * Authenticate user with IPTV credentials
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password, method } = req.body;
        console.log(`[Portal Login] Attempt for username: ${username}`);

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // First, find user by username only (to check lockout status)
        const usersForLockCheck = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE u.iptv_username = ? OR u.iptv_editor_username = ?
        `, [username, username]);

        // If user found, check if account is locked
        if (usersForLockCheck.length > 0) {
            const userToCheck = usersForLockCheck[0];
            console.log(`[Portal Login] User found: ${userToCheck.name || userToCheck.email}, login_attempts: ${userToCheck.login_attempts}, locked_until: ${userToCheck.account_locked_until}, first_failed: ${userToCheck.first_failed_attempt_at}`);

            // Check if account is locked
            if (isAccountLocked(userToCheck)) {
                const lockTime = new Date(userToCheck.account_locked_until);
                const minutesRemaining = Math.ceil((lockTime - new Date()) / 60000);
                console.log(`[Portal Login] Account is LOCKED for: ${userToCheck.name || userToCheck.email}`);
                return res.status(401).json({
                    success: false,
                    message: `Account temporarily locked due to too many failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
                    locked: true
                });
            }

            // Now check if password matches
            const passwordMatches =
                (userToCheck.iptv_username === username && userToCheck.iptv_password === password) ||
                (userToCheck.iptv_editor_username === username && userToCheck.iptv_editor_password === password);

            if (!passwordMatches) {
                // Track failed attempt
                const newAttempts = await trackFailedAttempt(userToCheck);
                console.log(`[Portal Login] Failed password for ${userToCheck.name || userToCheck.email}. Attempt #${newAttempts} of ${LOCKOUT_MAX_ATTEMPTS}`);

                // Check if we need to lock the account
                if (newAttempts >= LOCKOUT_MAX_ATTEMPTS) {
                    await lockAccount(userToCheck.id);
                    console.log(`[Portal Login] LOCKING account ${userToCheck.name || userToCheck.email} for ${LOCKOUT_DURATION_MINUTES} minutes`);
                    return res.status(401).json({
                        success: false,
                        message: `Account locked due to too many failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
                        locked: true
                    });
                }

                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials. Please check your username and password.'
                });
            }

            // Password matches - reset login attempts and continue
            console.log(`[Portal Login] Password correct for ${userToCheck.name || userToCheck.email}, resetting attempts`);
            await resetLoginAttempts(userToCheck.id);
        } else {
            console.log(`[Portal Login] No user found for IPTV username: ${username} - cannot track attempts for non-existent user`);
        }

        // Now do the full query with password check for final user data
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
            // This shouldn't happen if the above logic is correct, but handle it anyway
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
            SELECT ups.*, ps.name as server_name, ps.libraries as server_libraries
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_servers = plexShares.map(share => {
            const userLibraryIds = share.library_ids ? JSON.parse(share.library_ids) : [];
            const serverLibraries = share.server_libraries ? JSON.parse(share.server_libraries) : [];

            // Filter server libraries to only those the user has access to
            const userLibraries = serverLibraries.filter(lib =>
                userLibraryIds.includes(lib.key) || userLibraryIds.includes(String(lib.key))
            );

            return {
                id: share.plex_server_id,
                name: share.server_name,
                libraries: userLibraries
            };
        });

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
 * GET /api/v2/portal/auth/plex/redirect
 * Direct redirect to Plex auth - for mobile browsers that block JS navigation after async
 * This endpoint creates the PIN and immediately redirects to Plex (no JS async needed)
 * Uses Plex's forwardUrl to redirect back with pinId in URL (no cookies needed - Safari safe)
 */
router.get('/plex/redirect', async (req, res) => {
    try {
        // Check if Plex login is enabled
        const plexEnabled = await query(`SELECT setting_value FROM settings WHERE setting_key = 'portal_plex_enabled'`);
        if (plexEnabled.length > 0 && (plexEnabled[0].setting_value === 'false' || plexEnabled[0].setting_value === false)) {
            return res.redirect('/login.html?error=plex_disabled');
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
                'X-Plex-Product': 'StreamPanel Portal',
                'X-Plex-Version': '2.0.0',
                'X-Plex-Device': 'Web',
                'X-Plex-Platform': 'Web'
            }
        });

        if (!pinResponse.ok) {
            console.error('[Plex Redirect] Failed to create PIN:', pinResponse.status);
            return res.redirect('/login.html?error=plex_init_failed');
        }

        const pinData = await pinResponse.json();

        // Store the pin info
        portalPlexPins.set(pinId, {
            plexPinId: pinData.id,
            plexPinCode: pinData.code,
            authToken: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        // Build return URL with pinId in query params (no cookies needed!)
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = req.headers.host;
        const returnUrl = `${protocol}://${host}/login.html?plex_pin=${pinId}`;
        const encodedReturnUrl = encodeURIComponent(returnUrl);

        // Build the Plex auth URL with forwardUrl for automatic redirect back
        const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinData.code}&forwardUrl=${encodedReturnUrl}&context%5Bdevice%5D%5Bproduct%5D=StreamPanel%20Portal&context%5Bdevice%5D%5Bplatform%5D=Web`;

        console.log('[Plex Redirect] Redirecting to Plex auth, pinId:', pinId, 'returnUrl:', returnUrl);
        res.redirect(authUrl);

    } catch (error) {
        console.error('[Plex Redirect] Error:', error);
        res.redirect('/login.html?error=plex_init_failed');
    }
});

/**
 * POST /api/v2/portal/auth/plex/init
 * Initialize Plex OAuth flow using PIN-based popup method
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

        const fetch = (await import('node-fetch')).default;

        // Generate a unique pin ID for our internal tracking
        const pinId = crypto.randomBytes(16).toString('hex');

        // Request a PIN from Plex
        const pinResponse = await fetch(`${PLEX_API_BASE}/pins?strong=true`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
                'X-Plex-Product': 'StreamPanel Portal',
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
        portalPlexPins.set(pinId, {
            plexPinId: pinData.id,
            plexPinCode: pinData.code,
            authToken: null,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        // Build the Plex auth URL (for popup window)
        const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinData.code}&context%5Bdevice%5D%5Bproduct%5D=StreamPanel%20Portal&context%5Bdevice%5D%5Bplatform%5D=Web`;

        res.json({
            success: true,
            pinId: pinId,
            authUrl: authUrl
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
 * GET /api/v2/portal/auth/plex/status/:pinId
 * Check if the PIN has been authenticated
 */
router.get('/plex/status/:pinId', async (req, res) => {
    try {
        const { pinId } = req.params;
        const pinInfo = portalPlexPins.get(pinId);

        if (!pinInfo) {
            return res.json({
                success: false,
                expired: true,
                authenticated: false
            });
        }

        // Check if expired
        if (Date.now() > pinInfo.expiresAt) {
            portalPlexPins.delete(pinId);
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
            portalPlexPins.set(pinId, pinInfo);

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
        console.error('Portal Plex status error:', error);
        res.json({
            success: false,
            authenticated: false,
            expired: false
        });
    }
});

/**
 * POST /api/v2/portal/auth/plex/complete
 * Complete the Plex OAuth login using PIN
 */
router.post('/plex/complete', async (req, res) => {
    try {
        const { pinId } = req.body;
        const pinInfo = portalPlexPins.get(pinId);

        if (!pinInfo || !pinInfo.authToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired authorization'
            });
        }

        // Get user info from Plex
        const plexUserInfo = await getPlexUserInfo(pinInfo.authToken);

        if (!plexUserInfo || !plexUserInfo.email) {
            portalPlexPins.delete(pinId);
            return res.status(400).json({
                success: false,
                message: 'Failed to get Plex account information'
            });
        }

        // Find user by plex_email OR primary email (case-insensitive)
        console.log(`[Plex Login] Looking up user with Plex email: ${plexUserInfo.email}`);

        let users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE LOWER(TRIM(u.plex_email)) = LOWER(TRIM(?))
        `, [plexUserInfo.email]);

        // If not found by plex_email, try primary email as fallback
        if (users.length === 0) {
            console.log(`[Plex Login] No match on plex_email, trying primary email`);
            users = await query(`
                SELECT u.*,
                       sp_iptv.name as iptv_subscription_name,
                       sp_plex.name as plex_package_name
                FROM users u
                LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
                LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
                WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(?))
            `, [plexUserInfo.email]);
        }

        if (users.length === 0) {
            // Debug: Log what plex_email values exist for users with Plex access
            const plexUsers = await query(`
                SELECT u.id, u.name, u.email, u.plex_email
                FROM users u
                WHERE u.plex_enabled = 1 OR EXISTS (
                    SELECT 1 FROM user_plex_shares ups WHERE ups.user_id = u.id
                )
                LIMIT 20
            `);
            console.log(`[Plex Login] No user found for Plex email: ${plexUserInfo.email}`);
            console.log(`[Plex Login] Users with Plex access in DB:`, plexUsers.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                plex_email: u.plex_email || '(empty)'
            })));

            portalPlexPins.delete(pinId);
            return res.status(401).json({
                success: false,
                message: 'No account found linked to this Plex email. Please contact support.'
            });
        }

        console.log(`[Plex Login] Found user: ${users[0].name || users[0].email} (id: ${users[0].id}, plex_email: ${users[0].plex_email})`)

        const user = users[0];

        // Verify user has access to at least one of our Plex servers (not removed)
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name, ps.server_id, ps.libraries as server_libraries
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ? AND (ups.share_status IS NULL OR ups.share_status != 'removed')
        `, [user.id]);

        if (plexShares.length === 0) {
            portalPlexPins.delete(pinId);
            return res.status(401).json({
                success: false,
                message: 'Your account does not have access to any Plex servers. Please contact support.'
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
            pinInfo.authToken,
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt
        ]);

        // Clean up pin
        portalPlexPins.delete(pinId);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_email = plexUserInfo.email;
        sanitizedUser.plex_username = plexUserInfo.username;
        sanitizedUser.plex_servers = plexShares.map(share => {
            const userLibraryIds = share.library_ids ? JSON.parse(share.library_ids) : [];
            const serverLibraries = share.server_libraries ? JSON.parse(share.server_libraries) : [];

            const userLibraries = serverLibraries.filter(lib =>
                userLibraryIds.includes(lib.key) || userLibraryIds.includes(String(lib.key))
            );

            return {
                id: share.plex_server_id,
                name: share.server_name,
                libraries: userLibraries
            };
        });

        res.json({
            success: true,
            message: 'Plex login successful',
            token: sessionToken,
            user: sanitizedUser,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error('Portal Plex complete error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during Plex authentication'
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

        // Find user by plex_email OR primary email (case-insensitive)
        console.log(`[Plex Callback] Looking up user with Plex email: ${plexUserInfo.email}`);

        let users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE LOWER(TRIM(u.plex_email)) = LOWER(TRIM(?))
        `, [plexUserInfo.email]);

        // If not found by plex_email, try primary email as fallback
        if (users.length === 0) {
            console.log(`[Plex Callback] No match on plex_email, trying primary email`);
            users = await query(`
                SELECT u.*,
                       sp_iptv.name as iptv_subscription_name,
                       sp_plex.name as plex_package_name
                FROM users u
                LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
                LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
                WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(?))
            `, [plexUserInfo.email]);
        }

        if (users.length === 0) {
            console.log(`[Plex Callback] No user found for email: ${plexUserInfo.email}`);
            return res.status(401).json({
                success: false,
                message: 'No account found linked to this Plex email. Please contact support.'
            });
        }

        console.log(`[Plex Callback] Found user: ${users[0].name || users[0].email} (id: ${users[0].id})`);
        const user = users[0];

        // Verify user has access to at least one of our Plex servers (not removed)
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name, ps.server_id, ps.libraries as server_libraries
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ? AND (ups.share_status IS NULL OR ups.share_status != 'removed')
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
        sanitizedUser.plex_servers = plexShares.map(share => {
            const userLibraryIds = share.library_ids ? JSON.parse(share.library_ids) : [];
            const serverLibraries = share.server_libraries ? JSON.parse(share.server_libraries) : [];

            // Filter server libraries to only those the user has access to
            const userLibraries = serverLibraries.filter(lib =>
                userLibraryIds.includes(lib.key) || userLibraryIds.includes(String(lib.key))
            );

            return {
                id: share.plex_server_id,
                name: share.server_name,
                libraries: userLibraries
            };
        });

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
            SELECT ups.*, ps.name as server_name, ps.libraries as server_libraries
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        const sanitizedUser = sanitizeUserForPortal(user);
        sanitizedUser.plex_servers = plexShares.map(share => {
            const userLibraryIds = share.library_ids ? JSON.parse(share.library_ids) : [];
            const serverLibraries = share.server_libraries ? JSON.parse(share.server_libraries) : [];

            // Filter server libraries to only those the user has access to
            const userLibraries = serverLibraries.filter(lib =>
                userLibraryIds.includes(lib.key) || userLibraryIds.includes(String(lib.key))
            );

            return {
                id: share.plex_server_id,
                name: share.server_name,
                libraries: userLibraries
            };
        });

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

// Clean up expired Plex pins periodically
setInterval(() => {
    const now = Date.now();
    for (const [pinId, pinInfo] of portalPlexPins.entries()) {
        if (now > pinInfo.expiresAt) {
            portalPlexPins.delete(pinId);
        }
    }
}, 60000); // Every minute

module.exports = router;
