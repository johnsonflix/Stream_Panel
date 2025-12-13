/**
 * App Users API Routes
 *
 * Manage login accounts (admins/staff) separate from subscription users
 */

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../database-config');
const { requireAuth } = require('../middleware/auth-middleware');
const { sendWelcomeEmail, sendPasswordResetEmail, getBaseUrlFromRequest } = require('../services/email-service');

const router = express.Router();

/**
 * GET /api/v2/app-users - Get all app users (login accounts)
 */
router.get('/', async (req, res) => {
    try {
        const appUsers = await query(`
            SELECT
                id,
                name,
                email,
                role,
                last_login,
                created_at,
                updated_at,
                CASE WHEN password_hash IS NULL THEN 1 ELSE 0 END as needs_password_setup,
                plex_sso_enabled,
                plex_sso_required,
                plex_sso_server_ids,
                plex_sso_email,
                plex_sso_username,
                plex_sso_thumb,
                plex_sso_last_verified
            FROM users
            WHERE is_app_user = 1
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            users: appUsers,
            count: appUsers.length
        });

    } catch (error) {
        console.error('Error fetching app users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch app users',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/app-users/:id - Get single app user
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const users = await query(`
            SELECT
                id,
                name,
                email,
                role,
                last_login,
                created_at,
                updated_at,
                telegram_username,
                whatsapp_username,
                discord_username,
                venmo_username,
                paypal_username,
                cashapp_username,
                google_pay_username,
                apple_cash_username,
                plex_sso_enabled,
                plex_sso_required,
                plex_sso_server_ids,
                plex_sso_email,
                plex_sso_username,
                plex_sso_thumb,
                plex_sso_last_verified
            FROM users
            WHERE id = ? AND is_app_user = 1
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'App user not found'
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error('Error fetching app user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch app user',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/app-users - Create new app user
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, password, role, sendWelcome = true,
                telegram_username, whatsapp_username, discord_username,
                venmo_username, paypal_username, cashapp_username,
                google_pay_username, apple_cash_username,
                plex_sso_enabled, plex_sso_required, plex_sso_email, plex_sso_server_ids,
                welcomeEmailSubject, welcomeEmailHeader, welcomeEmailFooter } = req.body;

        // Validate required fields (password is now optional)
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and email are required'
            });
        }

        // Check if email already exists
        const existingUsers = await query('SELECT id, is_app_user, name FROM users WHERE email = ?', [email]);

        let passwordHash = null;
        let setupToken = null;
        let setupExpires = null;
        let isFirstLogin = 1;

        // If password is provided, hash it and set first login to 0
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }
            passwordHash = await bcrypt.hash(password, 10);
            isFirstLogin = 0;
        } else {
            // No password provided - generate setup token
            setupToken = crypto.randomBytes(32).toString('hex');
            setupExpires = new Date();
            setupExpires.setHours(setupExpires.getHours() + 24); // 24 hour expiration
        }

        let result;
        let wasPromoted = false;

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];

            // If already an app user, reject
            if (existingUser.is_app_user) {
                return res.status(400).json({
                    success: false,
                    message: 'An admin account with this email already exists'
                });
            }

            // Existing regular user - promote them to app user
            await query(`
                UPDATE users SET
                    is_app_user = 1,
                    password_hash = ?,
                    password_reset_token = ?,
                    password_reset_expires = ?,
                    role = ?,
                    is_first_login = ?,
                    plex_sso_enabled = ?,
                    plex_sso_required = ?,
                    plex_sso_email = ?,
                    plex_sso_server_ids = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [
                passwordHash,
                setupToken,
                setupExpires ? setupExpires.toISOString() : null,
                role || 'user',
                isFirstLogin,
                plex_sso_enabled ? 1 : 0,
                plex_sso_required ? 1 : 0,
                plex_sso_email || null,
                plex_sso_server_ids ? JSON.stringify(plex_sso_server_ids) : null,
                existingUser.id
            ]);

            result = { insertId: existingUser.id };
            wasPromoted = true;
            console.log(`✅ Promoted existing user ${existingUser.name} (${email}) to app admin`);
        } else {
            // Create new app user
            result = await query(`
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    password_reset_token,
                    password_reset_expires,
                    role,
                    is_app_user,
                    is_first_login,
                    telegram_username,
                    whatsapp_username,
                    discord_username,
                    venmo_username,
                    paypal_username,
                    cashapp_username,
                    google_pay_username,
                    apple_cash_username,
                    plex_sso_enabled,
                    plex_sso_required,
                    plex_sso_email,
                    plex_sso_server_ids,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                name,
                email,
                passwordHash,
                setupToken,
                setupExpires ? setupExpires.toISOString() : null,
                role || 'user',
                isFirstLogin,
                telegram_username || null,
                whatsapp_username || null,
                discord_username || null,
                venmo_username || null,
                paypal_username || null,
                cashapp_username || null,
                google_pay_username || null,
                apple_cash_username || null,
                plex_sso_enabled ? 1 : 0,
                plex_sso_required ? 1 : 0,
                plex_sso_email || null,
                plex_sso_server_ids ? JSON.stringify(plex_sso_server_ids) : null
            ]);
        }

        // Send welcome email if no password was set and sendWelcome is true
        if (!password && sendWelcome && setupToken) {
            try {
                const baseUrl = getBaseUrlFromRequest(req);

                // Build email customization options
                const emailCustomization = {};
                if (welcomeEmailSubject) emailCustomization.subject = welcomeEmailSubject;
                if (welcomeEmailHeader) emailCustomization.header = welcomeEmailHeader;
                if (welcomeEmailFooter) emailCustomization.footer = welcomeEmailFooter;

                await sendWelcomeEmail(email, name, setupToken, baseUrl, emailCustomization);
                console.log(`✅ Welcome email sent to ${email}`);
            } catch (emailError) {
                console.error('Failed to send welcome email:', emailError);
                // Don't fail the request if email fails
            }
        }

        let message;
        if (wasPromoted) {
            message = password ?
                'Existing user promoted to admin successfully' :
                'Existing user promoted to admin. Welcome email sent.';
        } else {
            message = password ?
                'App user created successfully' :
                'App user created successfully. Welcome email sent.';
        }

        res.json({
            success: true,
            message,
            user_id: result.insertId,
            wasPromoted,
            requiresPasswordSetup: !password
        });

    } catch (error) {
        console.error('Error creating app user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create app user',
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/app-users/:id - Update app user
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, password, telegram_username, whatsapp_username,
                discord_username, venmo_username, paypal_username, cashapp_username,
                google_pay_username, apple_cash_username,
                plex_sso_enabled, plex_sso_required, plex_sso_server_ids, plex_sso_email } = req.body;

        // Check if user exists and is an app user
        const existingUsers = await query('SELECT * FROM users WHERE id = ? AND is_app_user = 1', [id]);
        if (existingUsers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'App user not found'
            });
        }

        // Check if email is being changed and if it's already in use
        if (email && email !== existingUsers[0].email) {
            const emailCheck = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
            if (emailCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
        }

        // Build update query
        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = ?');
            values.push(name);
        }

        if (email) {
            updates.push('email = ?');
            values.push(email);
        }

        if (role) {
            updates.push('role = ?');
            values.push(role);
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }
            const passwordHash = await bcrypt.hash(password, 10);
            updates.push('password_hash = ?');
            values.push(passwordHash);
        }

        if (telegram_username !== undefined) {
            updates.push('telegram_username = ?');
            values.push(telegram_username);
        }
        if (whatsapp_username !== undefined) {
            updates.push('whatsapp_username = ?');
            values.push(whatsapp_username);
        }
        if (discord_username !== undefined) {
            updates.push('discord_username = ?');
            values.push(discord_username);
        }
        if (venmo_username !== undefined) {
            updates.push('venmo_username = ?');
            values.push(venmo_username);
        }
        if (paypal_username !== undefined) {
            updates.push('paypal_username = ?');
            values.push(paypal_username);
        }
        if (cashapp_username !== undefined) {
            updates.push('cashapp_username = ?');
            values.push(cashapp_username);
        }
        if (google_pay_username !== undefined) {
            updates.push('google_pay_username = ?');
            values.push(google_pay_username);
        }
        if (apple_cash_username !== undefined) {
            updates.push('apple_cash_username = ?');
            values.push(apple_cash_username);
        }

        // Plex SSO fields
        if (plex_sso_enabled !== undefined) {
            updates.push('plex_sso_enabled = ?');
            values.push(plex_sso_enabled ? 1 : 0);
        }
        if (plex_sso_required !== undefined) {
            updates.push('plex_sso_required = ?');
            values.push(plex_sso_required ? 1 : 0);
        }
        if (plex_sso_server_ids !== undefined) {
            updates.push('plex_sso_server_ids = ?');
            // Handle both array and string inputs
            if (Array.isArray(plex_sso_server_ids)) {
                values.push(plex_sso_server_ids.length > 0 ? JSON.stringify(plex_sso_server_ids) : null);
            } else {
                values.push(plex_sso_server_ids || null);
            }
        }
        if (plex_sso_email !== undefined) {
            updates.push('plex_sso_email = ?');
            values.push(plex_sso_email || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = datetime(\'now\')');
        values.push(id);

        await query(`
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'App user updated successfully'
        });

    } catch (error) {
        console.error('Error updating app user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update app user',
            error: error.message
        });
    }
});

/**
 * DELETE /api/v2/app-users/:id - Delete app user
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists and is an app user
        const users = await query('SELECT * FROM users WHERE id = ? AND is_app_user = 1', [id]);
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'App user not found'
            });
        }

        // Prevent deleting the last admin
        if (users[0].role === 'admin') {
            const adminCount = await query('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_app_user = 1', ['admin']);
            if (adminCount[0].count <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete the last admin user'
                });
            }
        }

        // Delete user (temporarily disable foreign key checks to handle orphaned constraints)
        // This is a workaround for legacy database constraints that reference non-existent tables
        await query('PRAGMA foreign_keys = OFF');
        try {
            await query('DELETE FROM users WHERE id = ?', [id]);
        } finally {
            await query('PRAGMA foreign_keys = ON');
        }

        res.json({
            success: true,
            message: 'App user deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting app user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete app user',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/app-users/me/preferences - Get current user's preferences
 */
router.get('/me/preferences', requireAuth, async (req, res) => {
    try {
        // Get user ID from authenticated user (set by requireAuth middleware)
        const userId = req.user.id;

        // Get user preferences
        const users = await query('SELECT preferences FROM users WHERE id = ?', [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Parse preferences JSON
        let preferences = {};
        if (users[0].preferences) {
            try {
                preferences = JSON.parse(users[0].preferences);
            } catch (error) {
                console.error('Error parsing preferences:', error);
            }
        }

        res.json({
            success: true,
            preferences
        });

    } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch preferences',
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/app-users/me/preferences - Update current user's preferences
 */
router.put('/me/preferences', requireAuth, async (req, res) => {
    try {
        // Get user ID from authenticated user (set by requireAuth middleware)
        const userId = req.user.id;

        const { preferences } = req.body;

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Preferences must be a valid object'
            });
        }

        // Save preferences as JSON string
        await query(`
            UPDATE users
            SET preferences = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [JSON.stringify(preferences), userId]);

        res.json({
            success: true,
            message: 'Preferences saved successfully'
        });

    } catch (error) {
        console.error('Error saving preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save preferences',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/app-users/setup-password
 * Set password for first-time login (using token from welcome email)
 */
router.post('/setup-password', async (req, res) => {
    try {
        const { email, token, password } = req.body;

        if (!email || !token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email, token, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user with matching email and token
        const users = await query(`
            SELECT * FROM users
            WHERE email = ?
            AND password_reset_token = ?
            AND is_app_user = 1
        `, [email, token]);

        if (users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired setup link'
            });
        }

        const user = users[0];

        // Check if token has expired
        if (user.password_reset_expires) {
            const expiresAt = new Date(user.password_reset_expires);
            if (new Date() > expiresAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Setup link has expired. Please contact an administrator.'
                });
            }
        }

        // Hash the new password
        const passwordHash = await bcrypt.hash(password, 10);

        // Update user with password and clear token
        await query(`
            UPDATE users
            SET password_hash = ?,
                password_reset_token = NULL,
                password_reset_expires = NULL,
                is_first_login = 0,
                updated_at = datetime('now')
            WHERE id = ?
        `, [passwordHash, user.id]);

        res.json({
            success: true,
            message: 'Password set successfully. You can now log in.'
        });

    } catch (error) {
        console.error('Error setting up password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set up password',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/app-users/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user by email
        const users = await query(`
            SELECT * FROM users
            WHERE email = ?
            AND is_app_user = 1
        `, [email]);

        // Always return success to prevent email enumeration
        if (users.length === 0) {
            return res.json({
                success: true,
                message: 'If an account exists with that email, a password reset link has been sent.'
            });
        }

        const user = users[0];

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date();
        resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiration

        // Save token to database
        await query(`
            UPDATE users
            SET password_reset_token = ?,
                password_reset_expires = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [resetToken, resetExpires.toISOString(), user.id]);

        // Send password reset email
        try {
            const baseUrl = getBaseUrlFromRequest(req);
            await sendPasswordResetEmail(email, user.name, resetToken, baseUrl);
            console.log(`✅ Password reset email sent to ${email}`);
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send password reset email. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'If an account exists with that email, a password reset link has been sent.'
        });

    } catch (error) {
        console.error('Error processing forgot password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/app-users/reset-password
 * Reset password using token from reset email
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, password } = req.body;

        if (!email || !token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email, token, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user with matching email and token
        const users = await query(`
            SELECT * FROM users
            WHERE email = ?
            AND password_reset_token = ?
            AND is_app_user = 1
        `, [email, token]);

        if (users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset link'
            });
        }

        const user = users[0];

        // Check if token has expired
        if (user.password_reset_expires) {
            const expiresAt = new Date(user.password_reset_expires);
            if (new Date() > expiresAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Reset link has expired. Please request a new one.'
                });
            }
        }

        // Hash the new password
        const passwordHash = await bcrypt.hash(password, 10);

        // Update user with new password and clear token
        await query(`
            UPDATE users
            SET password_hash = ?,
                password_reset_token = NULL,
                password_reset_expires = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `, [passwordHash, user.id]);

        // Optionally: Delete all sessions to force re-login
        await query('DELETE FROM sessions WHERE user_id = ?', [user.id]);

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/app-users/:id/resend-welcome
 * Resend welcome email to user
 */
router.post('/:id/resend-welcome', async (req, res) => {
    try {
        const { id } = req.params;

        // Get user
        const users = await query(`
            SELECT * FROM users
            WHERE id = ?
            AND is_app_user = 1
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Check if user already has a password
        if (user.password_hash) {
            return res.status(400).json({
                success: false,
                message: 'User has already set up their password'
            });
        }

        // Generate new setup token
        const setupToken = crypto.randomBytes(32).toString('hex');
        const setupExpires = new Date();
        setupExpires.setHours(setupExpires.getHours() + 24); // 24 hour expiration

        // Update user with new token
        await query(`
            UPDATE users
            SET password_reset_token = ?,
                password_reset_expires = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [setupToken, setupExpires.toISOString(), user.id]);

        // Send welcome email
        try {
            const baseUrl = getBaseUrlFromRequest(req);
            await sendWelcomeEmail(user.email, user.name, setupToken, baseUrl);
            console.log(`✅ Welcome email resent to ${user.email}`);
        } catch (emailError) {
            console.error('Failed to resend welcome email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send welcome email'
            });
        }

        res.json({
            success: true,
            message: 'Welcome email sent successfully'
        });

    } catch (error) {
        console.error('Error resending welcome email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend welcome email',
            error: error.message
        });
    }
});

module.exports = router;
