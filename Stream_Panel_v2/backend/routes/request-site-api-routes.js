/**
 * Request Site - Core API Routes
 *
 * Handles authentication, media availability, requests, and user permissions.
 * Uses new database schema: request_site_media, request_site_requests, etc.
 */

const express = require('express');
const { query } = require('../database-config');
const { getMovieDownloadProgress, getSeriesDownloadProgress } = require('../jobs/request-site-download-tracker');
const { submitRequest, getMediaInfoFromTmdb } = require('../services/request-site-radarr-sonarr');
const {
    notifyAdminsNewRequest,
    notifyUserRequestApproved,
    notifyUserRequestAutoApproved,
    notifyUserRequestDeclined
} = require('../services/request-site-notifications');

const router = express.Router();

// ============ Helper Functions ============

/**
 * Get user from portal session
 * Portal sessions are stored in portal_sessions table
 */
async function getUserFromSession(req) {
    try {
        // Check for session cookie or Authorization header
        const sessionToken = req.cookies?.portal_session || req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            return null;
        }

        // Query portal_sessions table (column is 'token', not 'session_token')
        const sessions = await query(
            `SELECT * FROM portal_sessions WHERE token = ? AND datetime(expires_at) > datetime('now')`,
            [sessionToken]
        );

        if (sessions.length === 0) {
            return null;
        }

        const session = sessions[0];

        // Get user details
        const users = await query('SELECT * FROM users WHERE id = ?', [session.user_id]);

        if (users.length === 0) {
            return null;
        }

        return users[0];
    } catch (error) {
        console.error('[Request Site] Error getting user from session:', error);
        return null;
    }
}

/**
 * Get admin user from session
 * Admin sessions are stored in sessions table, users have is_app_user = 1
 */
async function getAdminFromSession(req) {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');

        if (!sessionToken) {
            console.log('[Request Site] getAdminFromSession: No session token provided');
            return null;
        }

        // Query sessions table
        const sessions = await query(
            `SELECT * FROM sessions WHERE session_token = ? AND datetime(expires_at) > datetime('now')`,
            [sessionToken]
        );

        if (sessions.length === 0) {
            console.log('[Request Site] getAdminFromSession: Session not found or expired');
            return null;
        }

        const session = sessions[0];

        // Get user - first try with is_app_user = 1, then without (for backwards compatibility)
        let users = await query('SELECT * FROM users WHERE id = ? AND is_app_user = 1', [session.user_id]);

        if (users.length === 0) {
            // Try without is_app_user check - some older setups may not have this field set
            users = await query('SELECT * FROM users WHERE id = ?', [session.user_id]);
            if (users.length > 0) {
                console.log('[Request Site] getAdminFromSession: User found without is_app_user flag, allowing access');
            }
        }

        if (users.length === 0) {
            console.log('[Request Site] getAdminFromSession: User not found for session user_id:', session.user_id);
            return null;
        }

        return users[0];
    } catch (error) {
        console.error('[Request Site] Error getting admin from session:', error);
        return null;
    }
}

/**
 * Get setting value
 */
async function getSetting(key) {
    try {
        const settings = await query('SELECT value FROM request_site_settings WHERE key = ?', [key]);
        return settings.length > 0 ? settings[0].value : null;
    } catch (error) {
        console.error('[Request Site] Error getting setting:', error);
        return null;
    }
}

/**
 * Get user permissions (with global defaults fallback)
 */
async function getUserPermissions(userId) {
    try {
        const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return null;
        }

        const user = users[0];

        // Get global defaults
        const defaults = {
            can_request: await getSetting('default_can_request') === '1',
            can_request_movie: await getSetting('default_can_request_movie') === '1',
            can_request_tv: await getSetting('default_can_request_tv') === '1',
            can_request_4k: await getSetting('default_can_request_4k') === '1',
            movie_quota_limit: parseInt(await getSetting('movie_quota_limit') || '10'),
            movie_quota_days: parseInt(await getSetting('movie_quota_days') || '7'),
            tv_quota_limit: parseInt(await getSetting('tv_quota_limit') || '5'),
            tv_quota_days: parseInt(await getSetting('tv_quota_days') || '7'),
            auto_approve_movies: await getSetting('auto_approve_movies') === '1',
            auto_approve_tv: await getSetting('auto_approve_tv') === '1',
            auto_approve_tv_max_seasons: parseInt(await getSetting('auto_approve_tv_max_seasons') || '1')
        };

        // User overrides (NULL = use default)
        return {
            can_request: user.rs_can_request !== null ? user.rs_can_request === 1 : defaults.can_request,
            can_request_movie: user.rs_can_request_movie !== null ? user.rs_can_request_movie === 1 : defaults.can_request_movie,
            can_request_tv: user.rs_can_request_tv !== null ? user.rs_can_request_tv === 1 : defaults.can_request_tv,
            can_request_4k: user.rs_can_request_4k !== null ? user.rs_can_request_4k === 1 : defaults.can_request_4k,
            can_request_4k_movie: user.rs_can_request_4k_movie !== null ? user.rs_can_request_4k_movie === 1 : false,
            can_request_4k_tv: user.rs_can_request_4k_tv !== null ? user.rs_can_request_4k_tv === 1 : false,
            can_manage_requests: user.rs_can_manage_requests === 1 || user.is_admin === 1,
            can_auto_approve: user.rs_can_auto_approve !== null ? user.rs_can_auto_approve === 1 : (defaults.auto_approve_movies || defaults.auto_approve_tv),
            can_auto_approve_movie: user.rs_can_auto_approve_movie !== null ? user.rs_can_auto_approve_movie === 1 : defaults.auto_approve_movies,
            can_auto_approve_tv: user.rs_can_auto_approve_tv !== null ? user.rs_can_auto_approve_tv === 1 : defaults.auto_approve_tv,
            can_auto_approve_4k: user.rs_can_auto_approve_4k !== null ? user.rs_can_auto_approve_4k === 1 : false,
            auto_approve_tv_max_seasons: user.rs_auto_approve_tv_max_seasons !== null ? user.rs_auto_approve_tv_max_seasons : defaults.auto_approve_tv_max_seasons,
            movie_quota_limit: user.rs_movie_quota_limit !== null ? user.rs_movie_quota_limit : defaults.movie_quota_limit,
            movie_quota_days: user.rs_movie_quota_days !== null ? user.rs_movie_quota_days : defaults.movie_quota_days,
            tv_quota_limit: user.rs_tv_quota_limit !== null ? user.rs_tv_quota_limit : defaults.tv_quota_limit,
            tv_quota_days: user.rs_tv_quota_days !== null ? user.rs_tv_quota_days : defaults.tv_quota_days
        };
    } catch (error) {
        console.error('[Request Site] Error getting user permissions:', error);
        return null;
    }
}

/**
 * Check user quota
 */
async function checkQuota(userId, mediaType) {
    try {
        const permissions = await getUserPermissions(userId);
        if (!permissions) return { allowed: false, reason: 'User not found' };

        const quotaLimit = mediaType === 'movie' ? permissions.movie_quota_limit : permissions.tv_quota_limit;
        const quotaDays = mediaType === 'movie' ? permissions.movie_quota_days : permissions.tv_quota_days;

        // 0 = unlimited
        if (quotaLimit === 0) {
            return { allowed: true, used: 0, limit: 0, remaining: null };
        }

        // Count requests in the quota period
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - quotaDays);

        const requests = await query(`
            SELECT COUNT(*) as count FROM request_site_requests
            WHERE user_id = ?
            AND media_id IN (SELECT id FROM request_site_media WHERE media_type = ?)
            AND created_at >= ?
            AND status != 'declined'
        `, [userId, mediaType, cutoffDate.toISOString()]);

        const used = requests[0].count;
        const remaining = Math.max(0, quotaLimit - used);

        return {
            allowed: used < quotaLimit,
            used,
            limit: quotaLimit,
            remaining,
            days: quotaDays
        };
    } catch (error) {
        console.error('[Request Site] Error checking quota:', error);
        return { allowed: false, reason: 'Error checking quota' };
    }
}

/**
 * Check if media is blacklisted
 */
async function isBlacklisted(tmdbId, mediaType) {
    try {
        const blacklist = await query(
            'SELECT * FROM request_site_blacklist WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, mediaType]
        );
        return blacklist.length > 0;
    } catch (error) {
        console.error('[Request Site] Error checking blacklist:', error);
        return false;
    }
}

// ============ Authentication Routes ============

/**
 * GET /api/v2/request-site/auth/me
 * Get current user info + permissions
 */
router.get('/auth/me', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Check if user has Request Site access
        // rs_has_access: 1 = enabled, 0 = disabled, null = auto (based on plex_enabled)
        let hasRequestSiteAccess;
        if (user.rs_has_access === 1) {
            hasRequestSiteAccess = true;
        } else if (user.rs_has_access === 0) {
            hasRequestSiteAccess = false;
        } else {
            // null = auto: grant access if user has Plex enabled
            hasRequestSiteAccess = user.plex_enabled === 1;
        }

        if (!hasRequestSiteAccess) {
            return res.status(403).json({
                success: false,
                message: 'Request Site access is not enabled for your account',
                has_access: false
            });
        }

        const permissions = await getUserPermissions(user.id);

        // Get quota usage
        const movieQuota = await checkQuota(user.id, 'movie');
        const tvQuota = await checkQuota(user.id, 'tv');

        res.json({
            success: true,
            has_access: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                is_admin: user.is_admin === 1,
                plex_username: user.plex_username
            },
            permissions,
            quotas: {
                movie: movieQuota,
                tv: tvQuota
            }
        });
    } catch (error) {
        console.error('[Request Site] Error in /auth/me:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============ Media Availability Routes ============

/**
 * POST /api/v2/request-site/media/availability
 * Batch check availability for multiple TMDB IDs
 */
router.post('/media/availability', async (req, res) => {
    try {
        const { tmdbIds, mediaType } = req.body;

        if (!tmdbIds || !Array.isArray(tmdbIds) || !mediaType) {
            return res.status(400).json({ success: false, message: 'tmdbIds (array) and mediaType required' });
        }

        const availability = {};

        for (const tmdbId of tmdbIds) {
            const media = await query(
                'SELECT * FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
                [tmdbId, mediaType]
            );

            if (media.length > 0) {
                const m = media[0];
                availability[tmdbId] = {
                    status: m.status,
                    plex_server_id: m.plex_server_id,
                    available: m.status === 'available',
                    available_4k: false // 4K tracking not currently supported
                };

                // Check for active downloads
                if (m.status === 'processing') {
                    const downloadProgress = mediaType === 'movie'
                        ? await getMovieDownloadProgress(tmdbId)
                        : await getSeriesDownloadProgress(tmdbId);

                    if (downloadProgress) {
                        availability[tmdbId].downloading = true;
                        availability[tmdbId].progress = downloadProgress.progress;
                    }
                }
            } else {
                availability[tmdbId] = {
                    status: 'unknown',
                    available: false,
                    available_4k: false
                };
            }
        }

        res.json({ success: true, availability });
    } catch (error) {
        console.error('[Request Site] Error checking availability:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/v2/request-site/media/:tmdbId/:mediaType
 * Get detailed media info with status
 */
router.get('/media/:tmdbId/:mediaType', async (req, res) => {
    try {
        const { tmdbId, mediaType } = req.params;
        const user = await getUserFromSession(req);

        const media = await query(
            'SELECT * FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, mediaType]
        );

        let mediaInfo = null;
        let seasons = [];

        if (media.length > 0) {
            mediaInfo = media[0];

            // Get seasons for TV shows
            if (mediaType === 'tv') {
                seasons = await query(
                    'SELECT * FROM request_site_seasons WHERE media_id = ? ORDER BY season_number',
                    [mediaInfo.id]
                );
            }
        }

        // Get user's request for this media
        let userRequest = null;
        if (user) {
            const requests = await query(`
                SELECT * FROM request_site_requests
                WHERE user_id = ? AND media_id IN (SELECT id FROM request_site_media WHERE tmdb_id = ? AND media_type = ?)
                ORDER BY created_at DESC LIMIT 1
            `, [user.id, tmdbId, mediaType]);

            if (requests.length > 0) {
                userRequest = requests[0];
            }
        }

        // Check download progress
        let downloadProgress = null;
        if (mediaInfo && mediaInfo.status === 'processing') {
            downloadProgress = mediaType === 'movie'
                ? await getMovieDownloadProgress(tmdbId)
                : await getSeriesDownloadProgress(tmdbId);
        }

        res.json({
            success: true,
            media: mediaInfo,
            seasons,
            userRequest,
            downloadProgress
        });
    } catch (error) {
        console.error('[Request Site] Error getting media info:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============ Request Routes ============

/**
 * POST /api/v2/request-site/requests
 * Submit a new request
 */
router.post('/requests', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { tmdbId, mediaType, is4k, seasons } = req.body;

        if (!tmdbId || !mediaType) {
            return res.status(400).json({ success: false, message: 'tmdbId and mediaType required' });
        }

        // Check permissions
        const permissions = await getUserPermissions(user.id);

        if (!permissions.can_request) {
            return res.status(403).json({ success: false, message: 'You do not have permission to request media' });
        }

        if (mediaType === 'movie' && !permissions.can_request_movie) {
            return res.status(403).json({ success: false, message: 'You do not have permission to request movies' });
        }

        if (mediaType === 'tv' && !permissions.can_request_tv) {
            return res.status(403).json({ success: false, message: 'You do not have permission to request TV shows' });
        }

        if (is4k && !permissions.can_request_4k) {
            return res.status(403).json({ success: false, message: 'You do not have permission to request 4K content' });
        }

        // Check quota
        const quota = await checkQuota(user.id, mediaType);
        if (!quota.allowed) {
            return res.status(429).json({
                success: false,
                message: `Quota exceeded. You can request ${quota.limit} ${mediaType}s per ${quota.days} days. Currently used: ${quota.used}`,
                quota
            });
        }

        // Check blacklist
        if (await isBlacklisted(tmdbId, mediaType)) {
            return res.status(403).json({ success: false, message: 'This media has been blocked from requests' });
        }

        // Check if media already exists and is available
        const existingMedia = await query(
            'SELECT * FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, mediaType]
        );

        if (existingMedia.length > 0 && existingMedia[0].status === 'available') {
            return res.status(400).json({ success: false, message: 'This media is already available on Plex' });
        }

        // Check if user already has a pending request
        if (existingMedia.length > 0) {
            const existingRequest = await query(
                `SELECT * FROM request_site_requests WHERE user_id = ? AND media_id = ? AND status IN ('approved', 'processing')`,
                [user.id, existingMedia[0].id]
            );

            if (existingRequest.length > 0) {
                return res.status(400).json({ success: false, message: 'You already have a pending request for this media' });
            }
        }

        // Create or get media record
        let mediaId;
        if (existingMedia.length > 0) {
            mediaId = existingMedia[0].id;
        } else {
            const result = await query(`
                INSERT INTO request_site_media (tmdb_id, media_type, status, created_at, updated_at)
                VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [tmdbId, mediaType]);

            mediaId = result.insertId;
        }

        // Determine if auto-approve
        let shouldAutoApprove = false;
        if (permissions.can_auto_approve) {
            if (mediaType === 'movie' && permissions.can_auto_approve_movie) {
                shouldAutoApprove = true;
            } else if (mediaType === 'tv' && permissions.can_auto_approve_tv) {
                // Granular auto-approve for TV
                if (seasons && seasons !== 'all') {
                    const seasonArray = JSON.parse(seasons);
                    if (seasonArray.length <= permissions.auto_approve_tv_max_seasons) {
                        shouldAutoApprove = true;
                    }
                } else {
                    // "all" seasons - check total season count from TMDB
                    // For now, just auto-approve if max_seasons setting allows it
                    shouldAutoApprove = false; // Conservative: don't auto-approve "all"
                }
            }
        }

        const requestStatus = shouldAutoApprove ? 'processing' : 'pending';

        // Create request
        const requestResult = await query(`
            INSERT INTO request_site_requests (
                media_id, user_id, is_4k, status, seasons, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [mediaId, user.id, is4k ? 1 : 0, requestStatus, seasons || null]);

        const requestId = requestResult.insertId;

        // Get media info from TMDB for notifications
        const mediaInfo = await getMediaInfoFromTmdb(tmdbId, mediaType);
        const mediaTitle = mediaInfo ? mediaInfo.title : `${mediaType.toUpperCase()} ${tmdbId}`;

        // If auto-approved, send to Radarr/Sonarr
        if (shouldAutoApprove) {
            const submitResult = await submitRequest(requestId);

            if (submitResult.success) {
                console.log(`[Request Site] Auto-approved request ${requestId} sent to ${mediaType === 'movie' ? 'Radarr' : 'Sonarr'}`);

                // Notify user of auto-approval
                console.log('[Request Site] About to call notifyUserRequestAutoApproved');
                await notifyUserRequestAutoApproved(user.id, mediaTitle, mediaType);
                console.log('[Request Site] notifyUserRequestAutoApproved completed');
            } else {
                console.error(`[Request Site] Failed to send auto-approved request to ${mediaType === 'movie' ? 'Radarr' : 'Sonarr'}:`, submitResult.error);
                // Revert to pending if submission failed
                await query(`UPDATE request_site_requests SET status = 'pending' WHERE id = ?`, [requestId]);
            }
        } else {
            // Notify admins of new pending request
            console.log('[Request Site] About to call notifyAdminsNewRequest for pending request');
            await notifyAdminsNewRequest({
                requestId,
                mediaTitle,
                mediaType,
                tmdbId,
                posterPath: mediaInfo?.posterPath || null,
                username: user.username,
                userId: user.id,
                is4k
            });
            console.log('[Request Site] notifyAdminsNewRequest completed');
        }

        res.json({
            success: true,
            requestId,
            status: requestStatus === 2 ? 'approved' : 'pending',
            autoApproved: shouldAutoApprove,
            mediaTitle
        });
    } catch (error) {
        console.error('[Request Site] Error creating request:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/v2/request-site/requests/user
 * Get current user's requests
 */
router.get('/requests/user', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Query media_requests table (where requests are actually saved)
        const requests = await query(`
            SELECT
                id,
                user_id,
                tmdb_id,
                media_type,
                title,
                poster_path,
                backdrop_path,
                overview,
                release_date,
                seasons,
                is_4k,
                requested_by,
                requested_at as created_at,
                processed_at,
                available_at,
                notes,
                CASE status
                    WHEN 'pending' THEN 1
                    WHEN 'approved' THEN 2
                    WHEN 'processing' THEN 2
                    WHEN 'declined' THEN 3
                    WHEN 'available' THEN 4
                    WHEN 'failed' THEN 3
                    ELSE 1
                END as status
            FROM media_requests
            WHERE user_id = ?
            ORDER BY requested_at DESC
        `, [user.id]);

        res.json({ success: true, requests });
    } catch (error) {
        console.error('[Request Site] Error getting user requests:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/v2/request-site-api/requests/all
 * Get all requests (admin or users with approval rights) - for admin management page
 */
router.get('/requests/all', async (req, res) => {
    try {
        // Check for admin session first
        const admin = await getAdminFromSession(req);

        if (!admin) {
            // Check for portal user with approval rights
            const user = await getUserFromSession(req);
            if (!user) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            // Get user permissions from request_user_permissions table
            const userPermsResult = await query('SELECT * FROM request_user_permissions WHERE user_id = $1', [user.id]);
            const userPerms = userPermsResult.length > 0 ? userPermsResult[0] : null;

            const hasApprovalRights = userPerms && (
                userPerms.can_approve_movies ||
                userPerms.can_approve_tv ||
                userPerms.can_approve_4k_movies ||
                userPerms.can_approve_4k_tv
            );

            if (!hasApprovalRights) {
                return res.status(403).json({ success: false, message: 'Admin or approval rights required' });
            }
        }

        // Query media_requests table with user join for name
        // Use NULLIF to convert empty strings to NULL so COALESCE works correctly
        const requests = await query(`
            SELECT
                r.id,
                r.user_id,
                r.tmdb_id,
                r.media_type,
                r.title,
                r.poster_path,
                r.backdrop_path,
                r.release_date,
                r.status,
                r.seasons,
                r.is_4k,
                COALESCE(
                    NULLIF(u.name, ''),
                    NULLIF(r.requested_by, ''),
                    'Unknown'
                ) as requested_by,
                r.requested_at as created_at
            FROM media_requests r
            LEFT JOIN users u ON u.id = r.user_id
            ORDER BY r.requested_at DESC
        `);

        res.json({ success: true, requests });
    } catch (error) {
        console.error('[Request Site] Error getting all requests:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * GET /api/v2/request-site/requests/pending
 * Get all pending requests (admin only)
 */
router.get('/requests/pending', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const permissions = await getUserPermissions(user.id);
        if (!permissions.can_manage_requests) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const requests = await query(`
            SELECT
                r.*,
                m.tmdb_id,
                m.media_type,
                u.username,
                u.email,
                u.first_name,
                u.last_name
            FROM request_site_requests r
            JOIN request_site_media m ON r.media_id = m.id
            JOIN users u ON r.user_id = u.id
            WHERE r.status = 'pending'
            ORDER BY r.created_at ASC
        `);

        res.json({ success: true, requests });
    } catch (error) {
        console.error('[Request Site] Error getting pending requests:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * PUT /api/v2/request-site/requests/:id/approve
 * Approve a request (admin only)
 */
router.put('/requests/:id/approve', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const permissions = await getUserPermissions(user.id);
        if (!permissions.can_manage_requests) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const requestId = parseInt(req.params.id);

        const requests = await query(`
            SELECT r.*, m.tmdb_id, m.media_type
            FROM request_site_requests r
            JOIN request_site_media m ON r.media_id = m.id
            WHERE r.id = ?
        `, [requestId]);

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];

        // Update request status to PROCESSING (approved and being processed)
        await query(
            `UPDATE request_site_requests SET status = 'processing', modified_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [user.id, requestId]
        );

        // Get media info for notifications
        const mediaInfo = await getMediaInfoFromTmdb(request.tmdb_id, request.media_type);
        const mediaTitle = mediaInfo ? mediaInfo.title : `${request.media_type.toUpperCase()} ${request.tmdb_id}`;

        // Send to Radarr/Sonarr
        const submitResult = await submitRequest(requestId);

        if (submitResult.success) {
            // Determine response message based on whether content is already available
            let message = 'Request approved and sent to download';
            if (submitResult.hasFile || submitResult.isFullyAvailable) {
                message = 'Request approved - content is already available!';
            } else if (submitResult.hasFiles) {
                message = 'Request approved - some episodes already available, downloading remaining';
            } else if (submitResult.alreadyExists) {
                message = 'Request approved - searching for download';
            }

            console.log(`[Request Site] Request ${requestId} approved: ${message}`);

            // Notify user of approval
            console.log('[Request Site] About to call notifyUserRequestApproved for user:', request.user_id);
            await notifyUserRequestApproved(request.user_id, mediaTitle, request.media_type);
            console.log('[Request Site] notifyUserRequestApproved completed');

            res.json({
                success: true,
                message,
                status: submitResult.mediaStatus || 2,
                alreadyAvailable: submitResult.hasFile || submitResult.isFullyAvailable || false
            });
        } else {
            console.error(`[Request Site] Failed to send request to ${request.media_type === 'movie' ? 'Radarr' : 'Sonarr'}:`, submitResult.error);

            // Revert to pending if submission failed
            await query(`UPDATE request_site_requests SET status = 'pending' WHERE id = ?`, [requestId]);

            res.status(500).json({ success: false, message: `Failed to submit to ${request.media_type === 'movie' ? 'Radarr' : 'Sonarr'}: ${submitResult.error}` });
        }
    } catch (error) {
        console.error('[Request Site] Error approving request:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * PUT /api/v2/request-site/requests/:id/decline
 * Decline a request (admin only)
 */
router.put('/requests/:id/decline', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const permissions = await getUserPermissions(user.id);
        if (!permissions.can_manage_requests) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const requestId = parseInt(req.params.id);
        const { reason, notifyUser, addToBlacklist } = req.body;

        const requests = await query('SELECT * FROM request_site_requests WHERE id = ?', [requestId]);

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];

        // Get media info
        const media = await query('SELECT * FROM request_site_media WHERE id = ?', [request.media_id]);

        if (media.length === 0) {
            return res.status(404).json({ success: false, message: 'Media not found' });
        }

        // Update request status to DECLINED
        await query(
            `UPDATE request_site_requests SET status = 'declined', modified_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [user.id, requestId]
        );

        // Add to blacklist if requested
        if (addToBlacklist) {
            await query(`
                INSERT OR IGNORE INTO request_site_blacklist (
                    tmdb_id, media_type, user_id, denied_by, reason, created_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [media[0].tmdb_id, media[0].media_type, request.user_id, user.id, reason || null]);
        }

        // Send notification if requested
        console.log('[Request Site] Decline - notifyUser checkbox is:', notifyUser);
        if (notifyUser) {
            const mediaInfo = await getMediaInfoFromTmdb(media[0].tmdb_id, media[0].media_type);
            const mediaTitle = mediaInfo ? mediaInfo.title : `${media[0].media_type.toUpperCase()} ${media[0].tmdb_id}`;

            console.log('[Request Site] About to call notifyUserRequestDeclined for user:', request.user_id);
            await notifyUserRequestDeclined(request.user_id, mediaTitle, media[0].media_type, reason);
            console.log('[Request Site] notifyUserRequestDeclined completed');
        } else {
            console.log('[Request Site] Decline - NOT notifying user (checkbox unchecked)');
        }

        res.json({ success: true, message: 'Request declined' });
    } catch (error) {
        console.error('[Request Site] Error declining request:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * DELETE /api/v2/request-site/requests/:id
 * Delete a request
 */
router.delete('/requests/:id', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const requestId = parseInt(req.params.id);

        const requests = await query('SELECT * FROM request_site_requests WHERE id = ?', [requestId]);

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];

        // Check if user owns this request or is admin
        const permissions = await getUserPermissions(user.id);
        if (request.user_id !== user.id && !permissions.can_manage_requests) {
            return res.status(403).json({ success: false, message: 'You can only delete your own requests' });
        }

        await query('DELETE FROM request_site_requests WHERE id = ?', [requestId]);

        res.json({ success: true, message: 'Request deleted' });
    } catch (error) {
        console.error('[Request Site] Error deleting request:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============ User Permissions Routes (Admin Only) ============

/**
 * GET /api/v2/request-site/permissions/:userId
 * Get user's Request Site permissions (admin only)
 */
router.get('/permissions/:userId', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (user.is_admin !== 1) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const userId = parseInt(req.params.userId);
        const permissions = await getUserPermissions(userId);

        if (!permissions) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, permissions });
    } catch (error) {
        console.error('[Request Site] Error getting permissions:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * PUT /api/v2/request-site/permissions/:userId
 * Update user's Request Site permissions (admin only)
 */
router.put('/permissions/:userId', async (req, res) => {
    try {
        const user = await getUserFromSession(req);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (user.is_admin !== 1) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const userId = parseInt(req.params.userId);
        const updates = req.body;

        // Build UPDATE query dynamically based on provided fields
        const fields = [];
        const values = [];

        const allowedFields = [
            'rs_can_request', 'rs_can_request_movie', 'rs_can_request_tv',
            'rs_can_request_4k', 'rs_can_request_4k_movie', 'rs_can_request_4k_tv',
            'rs_can_manage_requests', 'rs_can_auto_approve',
            'rs_can_auto_approve_movie', 'rs_can_auto_approve_tv', 'rs_can_auto_approve_4k',
            'rs_auto_approve_tv_max_seasons',
            'rs_movie_quota_limit', 'rs_movie_quota_days',
            'rs_tv_quota_limit', 'rs_tv_quota_days'
        ];

        for (const field of allowedFields) {
            if (updates.hasOwnProperty(field)) {
                fields.push(`${field} = ?`);
                values.push(updates[field]);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        values.push(userId);

        await query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ success: true, message: 'Permissions updated' });
    } catch (error) {
        console.error('[Request Site] Error updating permissions:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
