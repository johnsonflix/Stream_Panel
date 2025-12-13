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
    lockUntil.setMinutes(lockUntil.getMinutes() + 15); // Lock for 15 minutes

    await query(`
        UPDATE users
        SET account_locked_until = ?, login_attempts = 0
        WHERE id = ?
    `, [lockUntil.toISOString(), userId]);
}

/**
 * POST /api/v2/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user by email - ONLY app users (admins) can login here
        const users = await query('SELECT * FROM users WHERE email = ? AND is_app_user = 1', [email]);

        if (users.length === 0) {
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
        if (isAccountLocked(user)) {
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.',
                showForgotPassword: true
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            // Increment login attempts
            const newAttempts = (user.login_attempts || 0) + 1;

            await query(`
                UPDATE users
                SET login_attempts = ?
                WHERE id = ?
            `, [newAttempts, user.id]);

            // Lock account after 5 failed attempts
            if (newAttempts >= 5) {
                await lockAccount(user.id);
                return res.status(423).json({
                    success: false,
                    message: 'Too many failed login attempts. Account locked for 15 minutes.',
                    showForgotPassword: true
                });
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                attemptsRemaining: 5 - newAttempts,
                showForgotPassword: newAttempts >= 1  // Show forgot password after first failed attempt
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
                account_locked_until = NULL
            WHERE id = ?
        `, [user.id]);

        // Remove sensitive data before sending response
        delete user.password_hash;
        delete user.login_attempts;
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
