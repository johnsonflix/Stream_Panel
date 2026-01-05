/**
 * Authentication Middleware
 *
 * Provides middleware functions for protecting routes and checking permissions
 */

const { query } = require('../database-config');

/**
 * Middleware: Require authentication
 * Verifies session token and attaches user to request
 */
async function requireAuth(req, res, next) {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Find valid session
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

        // Attach user and session to request
        req.user = user;
        req.session = session;

        next();

    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during authentication'
        });
    }
}

/**
 * Middleware: Require admin role
 * Must be used after requireAuth
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }

    next();
}

/**
 * Middleware: Optional authentication
 * Attaches user if authenticated, but doesn't require it
 */
async function optionalAuth(req, res, next) {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            // No token provided, continue without user
            return next();
        }

        // Find valid session
        const sessions = await query(`
            SELECT * FROM sessions
            WHERE session_token = ?
            AND datetime(expires_at) > datetime('now')
        `, [sessionToken]);

        if (sessions.length === 0) {
            // Invalid session, continue without user
            return next();
        }

        const session = sessions[0];

        // Get user
        const users = await query('SELECT * FROM users WHERE id = ?', [session.user_id]);

        if (users.length > 0) {
            const user = users[0];

            // Remove sensitive data
            delete user.password_hash;
            delete user.login_attempts;
            delete user.account_locked_until;

            // Attach user and session to request
            req.user = user;
            req.session = session;
        }

        next();

    } catch (error) {
        console.error('Optional auth middleware error:', error);
        // On error, continue without user
        next();
    }
}

/**
 * Helper: Check if user has access to a specific Plex server
 * This is a placeholder for future granular permissions
 */
function hasPlexServerAccess(user, serverId) {
    // For now, admins have access to all servers
    if (user.role === 'admin') return true;

    // TODO: Implement granular permissions check
    // Check user_permissions table for specific server access

    return false; // Default: no access for non-admins yet
}

/**
 * Helper: Check if user has access to a specific IPTV panel
 * This is a placeholder for future granular permissions
 */
function hasIPTVPanelAccess(user, panelId) {
    // For now, admins have access to all panels
    if (user.role === 'admin') return true;

    // TODO: Implement granular permissions check
    // Check user_permissions table for specific panel access

    return false; // Default: no access for non-admins yet
}

/**
 * Middleware: Check Plex server access
 * Requires serverId in request params or body
 */
function requirePlexAccess(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const serverId = req.params.serverId || req.body.serverId;

    if (!serverId) {
        return res.status(400).json({
            success: false,
            message: 'Server ID required'
        });
    }

    if (!hasPlexServerAccess(req.user, serverId)) {
        return res.status(403).json({
            success: false,
            message: 'You do not have access to this Plex server'
        });
    }

    next();
}

/**
 * Middleware: Check IPTV panel access
 * Requires panelId in request params or body
 */
function requireIPTVAccess(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const panelId = req.params.panelId || req.body.panelId;

    if (!panelId) {
        return res.status(400).json({
            success: false,
            message: 'Panel ID required'
        });
    }

    if (!hasIPTVPanelAccess(req.user, panelId)) {
        return res.status(403).json({
            success: false,
            message: 'You do not have access to this IPTV panel'
        });
    }

    next();
}

module.exports = {
    requireAuth,
    requireAdmin,
    optionalAuth,
    requirePlexAccess,
    requireIPTVAccess,
    hasPlexServerAccess,
    hasIPTVPanelAccess
};
