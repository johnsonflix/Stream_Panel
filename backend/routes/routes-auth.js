/**
 * Authentication Routes
 *
 * Handles user authentication, session management, and password changes
 */

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query, getConnection } = require('../database-config');

const router = express.Router();

// Session duration: 7 days
const SESSION_DURATION_DAYS = 7;

// Lockout configuration
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 30;

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
    expiration.setDate(expiration.getDate() + SESSION_DURATION_DAYS);
    return expiration.toISOString();
}

/**
 * Helper: Check if account is locked
 */
function isAccountLocked(user) {
    if (!user.account_locked_until) return false;

    const lockTime = new Date(user.account_locked_until);
    const now = new Date();

    return now < lockTime;
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
 * POST /api/v2/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[Admin Login] Attempt for email: ${email}`);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user by email - ONLY app users (admins) can login here
        const users = await query('SELECT * FROM users WHERE email = ? AND is_app_user = 1', [email]);

        if (users.length === 0) {
            console.log(`[Admin Login] No user found for email: ${email} - cannot track attempts for non-existent user`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                showForgotPassword: true  // Always show forgot password for non-existent users
            });
        }

        const user = users[0];

        // Check if user requires Plex SSO (password login disabled)
        if (user.plex_sso_required && user.plex_sso_enabled) {
            return res.status(403).json({
                success: false,
                message: 'Password login is disabled for this account. Please use Plex SSO to sign in.',
                requirePlexSso: true
            });
        }

        // Check if account is locked
        console.log(`[Admin Login] User found: ${user.email}, login_attempts: ${user.login_attempts}, locked_until: ${user.account_locked_until}, first_failed: ${user.first_failed_attempt_at}`);
        if (isAccountLocked(user)) {
            console.log(`[Admin Login] Account is LOCKED for: ${user.email}`);
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
                showForgotPassword: true
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            // Track failed attempt with time window
            const newAttempts = await trackFailedAttempt(user);
            console.log(`[Admin Login] Failed password for ${user.email}. Attempt #${newAttempts} of ${LOCKOUT_MAX_ATTEMPTS}`);

            // Lock account after max failed attempts within window
            if (newAttempts >= LOCKOUT_MAX_ATTEMPTS) {
                await lockAccount(user.id);
                console.log(`[Admin Login] LOCKING account ${user.email} for ${LOCKOUT_DURATION_MINUTES} minutes`);
                return res.status(423).json({
                    success: false,
                    message: `Too many failed login attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
                    showForgotPassword: true
                });
            }

            // Generic error message - don't reveal attempt count for security
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                showForgotPassword: true
            });
        }

        // Generate session token
        const sessionToken = generateSessionToken();
        const expiresAt = getSessionExpiration();

        // Create session
        await query(`
            INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `, [
            user.id,
            sessionToken,
            req.ip || req.connection.remoteAddress,
            req.headers['user-agent'] || '',
            expiresAt
        ]);

        // Update user last login and reset login attempts
        await query(`
            UPDATE users
            SET last_login = datetime('now'),
                login_attempts = 0,
                first_failed_attempt_at = NULL,
                account_locked_until = NULL
            WHERE id = ?
        `, [user.id]);

        // Remove sensitive data before sending response
        delete user.password_hash;
        delete user.login_attempts;
        delete user.first_failed_attempt_at;
        delete user.account_locked_until;

        res.json({
            success: true,
            message: 'Login successful',
            user: user,
            sessionToken: sessionToken,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

/**
 * POST /api/v2/auth/logout
 * Destroy current session
 */
router.post('/logout', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(400).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Delete session
        await query('DELETE FROM sessions WHERE session_token = ?', [sessionToken]);

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
});

/**
 * GET /api/v2/auth/verify
 * Verify if the current session token is valid
 */
router.get('/verify', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Get user
        const users = await query('SELECT id, name, email, is_app_user FROM users WHERE id = ?', [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error('Session verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * GET /api/v2/auth/me
 * Get current authenticated user
 */
router.get('/me', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Get user
        const users = await query('SELECT * FROM users WHERE id = ?', [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Remove sensitive data
        delete user.password_hash;
        delete user.login_attempts;
        delete user.account_locked_until;

        res.json({
            success: true,
            user: user
        });

    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * POST /api/v2/auth/change-password
 * Change password for current user
 */
router.post('/change-password', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        const { currentPassword, newPassword } = req.body;

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Get user
        const users = await query('SELECT * FROM users WHERE id = ?', [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Verify current password
        const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await query(`
            UPDATE users
            SET password_hash = ?, updated_at = datetime('now')
            WHERE id = ?
        `, [newPasswordHash, user.id]);

        // Optionally: Delete all other sessions (logout from other devices)
        await query(`
            DELETE FROM sessions
            WHERE user_id = ? AND session_token != ?
        `, [user.id, sessionToken]);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during password change'
        });
    }
});

/**
 * DELETE /api/v2/auth/sessions
 * Delete all sessions for current user (logout from all devices)
 */
router.delete('/sessions', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Delete all sessions for this user
        const result = await query('DELETE FROM sessions WHERE user_id = ?', [session.user_id]);

        res.json({
            success: true,
            message: 'All sessions deleted successfully',
            sessionsDeleted: result.affectedRows
        });

    } catch (error) {
        console.error('Delete sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * GET /api/v2/auth/portal-credentials
 * Get the current admin's portal credentials (IPTV/Plex)
 */
router.get('/portal-credentials', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Get user's portal credentials
        const users = await query(`
            SELECT id, name, email, iptv_username, iptv_password, plex_email
            FROM users WHERE id = ?
        `, [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        res.json({
            success: true,
            credentials: {
                iptv_username: user.iptv_username || '',
                iptv_password: user.iptv_password || '',
                plex_email: user.plex_email || ''
            }
        });

    } catch (error) {
        console.error('Get portal credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * PUT /api/v2/auth/portal-credentials
 * Update the current admin's portal credentials (IPTV/Plex)
 */
router.put('/portal-credentials', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        const { iptv_username, iptv_password, plex_email } = req.body;

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Check if IPTV username is already taken by another user
        if (iptv_username) {
            const existingUsers = await query(`
                SELECT id FROM users WHERE iptv_username = ? AND id != ?
            `, [iptv_username, session.user_id]);

            if (existingUsers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'This IPTV username is already taken by another user'
                });
            }
        }

        // Update user's portal credentials
        await query(`
            UPDATE users
            SET iptv_username = ?,
                iptv_password = ?,
                plex_email = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [
            iptv_username || null,
            iptv_password || null,
            plex_email || null,
            session.user_id
        ]);

        res.json({
            success: true,
            message: 'Portal credentials updated successfully'
        });

    } catch (error) {
        console.error('Update portal credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * POST /api/v2/auth/portal-login
 * Create a portal session for the current admin (auto-login to end user portal)
 */
router.post('/portal-login', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        // Find admin session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Get admin user with portal access fields
        const users = await query(`
            SELECT id, name, email, iptv_username, iptv_password, plex_email, plex_enabled
            FROM users WHERE id = ? AND is_app_user = 1
        `, [session.user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Check if admin has portal access configured
        const hasIPTV = user.iptv_username && user.iptv_password;
        const hasPlex = user.plex_enabled && user.plex_email;

        if (!hasIPTV && !hasPlex) {
            return res.status(400).json({
                success: false,
                message: 'No portal access configured. Please set IPTV credentials or enable Plex in Settings > App Users.',
                needsSetup: true
            });
        }

        // Generate portal session token
        const crypto = require('crypto');
        const portalToken = crypto.randomBytes(32).toString('hex');

        // Portal session duration: 90 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        // Create portal session
        await query(`
            INSERT INTO portal_sessions (user_id, token, login_method, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            user.id,
            portalToken,
            hasIPTV ? 'iptv' : 'plex',
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt.toISOString()
        ]);

        res.json({
            success: true,
            token: portalToken,
            expiresAt: expiresAt.toISOString(),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                plex_email: user.plex_email,
                plex_enabled: user.plex_enabled,
                iptv_username: user.iptv_username
            }
        });

    } catch (error) {
        console.error('Portal login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * POST /api/v2/auth/sign-in-as-user
 * Create a portal session for any user (admin impersonation feature)
 * Allows admins to sign into the portal as a specific user for testing/support
 */
router.post('/sign-in-as-user', async (req, res) => {
    try {
        console.log('[Sign-in-as-user] Request received, body:', req.body);
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        const { userId } = req.body;
        console.log('[Sign-in-as-user] userId:', userId, 'sessionToken present:', !!sessionToken);

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'No session token provided'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Find admin session
        const sessions = await query(`
            SELECT s.*, u.is_app_user FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_token = ?
            AND datetime(s.expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired session'
            });
        }

        const session = sessions[0];

        // Verify caller is an admin (app user)
        if (!session.is_app_user) {
            return res.status(403).json({
                success: false,
                message: 'Only admins can use this feature'
            });
        }

        // Get the target user with all portal-related fields
        const users = await query(`
            SELECT u.*,
                   sp_iptv.name as iptv_subscription_name,
                   sp_plex.name as plex_package_name
            FROM users u
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id
            WHERE u.id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Generate portal session token
        const portalToken = crypto.randomBytes(32).toString('hex');

        // Portal session duration: 90 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        // Determine login method based on what the user has
        const hasIPTV = user.iptv_username && user.iptv_password;
        const loginMethod = hasIPTV ? 'iptv' : 'plex';

        // Create portal session for the target user
        await query(`
            INSERT INTO portal_sessions (user_id, token, login_method, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            user.id,
            portalToken,
            `admin_impersonate_${loginMethod}`,
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.headers['user-agent'] || '',
            expiresAt.toISOString()
        ]);

        // Get user's Plex server access
        const plexShares = await query(`
            SELECT ups.*, ps.name as server_name, ps.libraries as server_libraries
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        // Compute request site access (same logic as portal-auth-routes)
        let hasRequestSiteAccess;
        const rsAccess = user.rs_has_access;
        if (rsAccess === 1 || rsAccess === '1' || rsAccess === true) {
            hasRequestSiteAccess = true;
        } else {
            hasRequestSiteAccess = Number(user.plex_enabled) === 1;
        }

        // Build sanitized user object for portal
        const sanitizedUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            plex_email: user.plex_email,
            expiration_date: user.expiration_date,
            subscription_status: user.subscription_status,
            plex_enabled: user.plex_enabled,
            iptv_enabled: user.iptv_enabled,
            iptv_editor_enabled: user.iptv_editor_enabled,
            iptv_username: user.iptv_username,
            iptv_password: user.iptv_password,
            iptv_editor_username: user.iptv_editor_username,
            iptv_editor_password: user.iptv_editor_password,
            m3u_url: user.m3u_url,
            iptv_subscription_name: user.iptv_subscription_name,
            plex_package_name: user.plex_package_name,
            has_request_site_access: hasRequestSiteAccess,
            is_admin_impersonating: true  // Flag so portal knows this is an impersonation session
        };

        // Add Plex servers to user object
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

        console.log(`[Admin Impersonate] Admin user ID ${session.user_id} signing in as user ID ${user.id} (${user.name || user.email})`);

        res.json({
            success: true,
            token: portalToken,
            expiresAt: expiresAt.toISOString(),
            user: sanitizedUser
        });

    } catch (error) {
        console.error('[Sign-in-as-user] ERROR:', error.message);
        console.error('[Sign-in-as-user] Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

/**
 * Cleanup expired sessions (can be called periodically)
 */
router.post('/cleanup-sessions', async (req, res) => {
    try {
        const result = await query(`
            DELETE FROM sessions
            WHERE datetime(expires_at) <= datetime('now')
        `);

        res.json({
            success: true,
            message: 'Expired sessions cleaned up',
            sessionsDeleted: result.affectedRows
        });

    } catch (error) {
        console.error('Cleanup sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
