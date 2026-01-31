/**
 * Request Site API Routes
 *
 * Provides endpoints for the media request system (Overseerr clone)
 * Handles TMDB searches, Radarr/Sonarr integration, and request management
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { fork } = require('child_process');
const TMDBService = require('../services/tmdb-service');
const RadarrService = require('../services/radarr-service');
const SonarrService = require('../services/sonarr-service');
const TVDBService = require('../services/tvdb-service');
const { PlexScannerService, MediaStatus } = require('../services/plex-scanner-service');
const db = require('../database-config');
const {
    notifyAdminsNewRequest,
    notifyUserRequestApproved,
    notifyUserRequestAutoApproved,
    notifyUserRequestDeclined
} = require('../services/request-site-notifications');

// Legacy SQLite compatibility layer for PostgreSQL
// getDb() now returns an object with async query methods
function getDb() {
    // Return a compatibility object that mimics better-sqlite3 API
    // but actually uses PostgreSQL through database-config
    return {
        // Simulate prepare().get() - returns a function that returns result
        prepare: (sql) => ({
            get: async (...params) => {
                const results = await db.query(sql, params);
                return results[0] || null;
            },
            all: async (...params) => {
                return await db.query(sql, params);
            },
            run: async (...params) => {
                const result = await db.query(sql, params);
                return { changes: result.rowCount || 0, lastInsertRowid: result[0]?.id };
            }
        }),
        exec: async (sql) => {
            return await db.query(sql);
        }
    };
}

// Async query helper for simpler cases
async function dbQuery(sql, params = []) {
    return await db.query(sql, params);
}

async function dbGet(sql, params = []) {
    const results = await db.query(sql, params);
    return results[0] || null;
}

async function dbAll(sql, params = []) {
    return await db.query(sql, params);
}

async function dbRun(sql, params = []) {
    return await db.query(sql, params);
}

// Initialize TMDB service
const tmdb = new TMDBService();

// ============ Ratings Cache ============
// In-memory cache for external ratings (RT, IMDb) - 1 hour TTL
const RATINGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ratingsCache = new Map();

function getCachedRatings(key) {
    const cached = ratingsCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < RATINGS_CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCachedRatings(key, data) {
    ratingsCache.set(key, { data, timestamp: Date.now() });
}

// Clean up old cache entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of ratingsCache.entries()) {
        if (now - value.timestamp > RATINGS_CACHE_TTL) {
            ratingsCache.delete(key);
        }
    }
}, 10 * 60 * 1000);

// ============ Helper Functions ============

/**
 * Get a setting value from request_settings table
 */
async function getSetting(key) {
    const row = await dbGet('SELECT setting_value FROM request_settings WHERE setting_key = ?', [key]);
    return row ? row.setting_value : null;
}

/**
 * Set a setting value in request_settings table
 */
async function setSetting(key, value) {
    await dbRun(`
        INSERT INTO request_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
    `, [key, value, value]);
}

/**
 * Get effective permissions for a user (merges defaults with overrides)
 * Internal version for use within routes
 * Falls back to request_settings table for limits if not set in permissions table
 */
async function getUserPermissionsInternal(userId) {
    // Get default permissions from permissions table
    const defaults = await dbGet('SELECT * FROM request_default_permissions WHERE id = $1', [1]);

    // Also check request_settings table as fallback for limits
    const movieQuotaLimit = parseInt(await getSetting('movie_quota_limit')) || 0;
    const movieQuotaDays = parseInt(await getSetting('movie_quota_days')) || 7;
    const tvQuotaLimit = parseInt(await getSetting('tv_quota_limit')) || 0;
    const tvQuotaDays = parseInt(await getSetting('tv_quota_days')) || 7;
    const seasonQuotaLimit = parseInt(await getSetting('season_quota_limit')) || 0;
    const seasonQuotaDays = parseInt(await getSetting('season_quota_days')) || 7;
    const default4kMovies = (await getSetting('default_can_request_4k_movies')) === '1' ? 1 : 0;
    const default4kTv = (await getSetting('default_can_request_4k_tv')) === '1' ? 1 : 0;
    const autoApproveMovies = (await getSetting('auto_approve_movies')) === '1' ? 1 : 0;
    const autoApproveTv = (await getSetting('auto_approve_tv')) === '1' ? 1 : 0;
    // 4K limits from settings
    const movie4kQuotaLimit = parseInt(await getSetting('movie_4k_quota_limit')) || 0;
    const movie4kQuotaDays = parseInt(await getSetting('movie_4k_quota_days')) || 7;
    const tv4kQuotaLimit = parseInt(await getSetting('tv_4k_quota_limit')) || 0;
    const tv4kQuotaDays = parseInt(await getSetting('tv_4k_quota_days')) || 7;
    const season4kQuotaLimit = parseInt(await getSetting('season_4k_quota_limit')) || 0;
    const season4kQuotaDays = parseInt(await getSetting('season_4k_quota_days')) || 7;

    // Get user-specific overrides if any
    const userPerms = userId ? await dbGet('SELECT * FROM request_user_permissions WHERE user_id = $1', [userId]) : null;

    // Helper to get effective limit value (prefers permissions table, falls back to settings)
    const getLimit = (permVal, settingsVal) => {
        if (permVal !== null && permVal !== undefined && permVal > 0) return permVal;
        return settingsVal;
    };

    // If user has custom permissions, use those; otherwise use defaults
    if (userPerms && userPerms.has_custom_permissions) {
        return {
            can_request_movies: userPerms.can_request_movies ?? defaults?.can_request_movies ?? 1,
            can_request_tv: userPerms.can_request_tv ?? defaults?.can_request_tv ?? 1,
            can_request_4k: userPerms.can_request_4k ?? defaults?.can_request_4k ?? 0,
            can_request_4k_movie: userPerms.can_request_4k_movie ?? defaults?.can_request_4k_movie ?? default4kMovies,
            can_request_4k_tv: userPerms.can_request_4k_tv ?? defaults?.can_request_4k_tv ?? default4kTv,
            auto_approve_movies: userPerms.auto_approve_movies ?? defaults?.auto_approve_movies ?? autoApproveMovies,
            auto_approve_tv: userPerms.auto_approve_tv ?? defaults?.auto_approve_tv ?? autoApproveTv,
            movie_limit_per_week: userPerms.movie_limit_per_week ?? getLimit(defaults?.movie_limit_per_week, movieQuotaLimit),
            movie_limit_days: userPerms.movie_limit_days ?? defaults?.movie_limit_days ?? movieQuotaDays,
            tv_limit_per_week: userPerms.tv_limit_per_week ?? defaults?.tv_limit_per_week ?? 0,
            tv_show_limit: userPerms.tv_show_limit ?? getLimit(defaults?.tv_show_limit, tvQuotaLimit),
            tv_show_limit_days: userPerms.tv_show_limit_days ?? defaults?.tv_show_limit_days ?? tvQuotaDays,
            tv_season_limit: userPerms.tv_season_limit ?? getLimit(defaults?.tv_season_limit, seasonQuotaLimit),
            tv_season_limit_days: userPerms.tv_season_limit_days ?? defaults?.tv_season_limit_days ?? seasonQuotaDays,
            // 4K limits
            movie_4k_limit: userPerms.movie_4k_limit ?? getLimit(defaults?.movie_4k_limit, movie4kQuotaLimit),
            movie_4k_limit_days: userPerms.movie_4k_limit_days ?? defaults?.movie_4k_limit_days ?? movie4kQuotaDays,
            tv_show_4k_limit: userPerms.tv_show_4k_limit ?? getLimit(defaults?.tv_show_4k_limit, tv4kQuotaLimit),
            tv_show_4k_limit_days: userPerms.tv_show_4k_limit_days ?? defaults?.tv_show_4k_limit_days ?? tv4kQuotaDays,
            tv_season_4k_limit: userPerms.tv_season_4k_limit ?? getLimit(defaults?.tv_season_4k_limit, season4kQuotaLimit),
            tv_season_4k_limit_days: userPerms.tv_season_4k_limit_days ?? defaults?.tv_season_4k_limit_days ?? season4kQuotaDays,
            // Approval rights (only from user permissions, not defaults)
            can_approve_movies: userPerms.can_approve_movies ?? 0,
            can_approve_tv: userPerms.can_approve_tv ?? 0,
            can_approve_4k_movies: userPerms.can_approve_4k_movies ?? 0,
            can_approve_4k_tv: userPerms.can_approve_4k_tv ?? 0,
            has_custom_permissions: true
        };
    }

    return {
        can_request_movies: defaults?.can_request_movies ?? 1,
        can_request_tv: defaults?.can_request_tv ?? 1,
        can_request_4k: defaults?.can_request_4k ?? 0,
        can_request_4k_movie: defaults?.can_request_4k_movie ?? default4kMovies,
        can_request_4k_tv: defaults?.can_request_4k_tv ?? default4kTv,
        auto_approve_movies: defaults?.auto_approve_movies ?? autoApproveMovies,
        auto_approve_tv: defaults?.auto_approve_tv ?? autoApproveTv,
        movie_limit_per_week: getLimit(defaults?.movie_limit_per_week, movieQuotaLimit),
        movie_limit_days: defaults?.movie_limit_days ?? movieQuotaDays,
        tv_limit_per_week: defaults?.tv_limit_per_week ?? 0,
        tv_show_limit: getLimit(defaults?.tv_show_limit, tvQuotaLimit),
        tv_show_limit_days: defaults?.tv_show_limit_days ?? tvQuotaDays,
        tv_season_limit: getLimit(defaults?.tv_season_limit, seasonQuotaLimit),
        tv_season_limit_days: defaults?.tv_season_limit_days ?? seasonQuotaDays,
        // 4K limits
        movie_4k_limit: getLimit(defaults?.movie_4k_limit, movie4kQuotaLimit),
        movie_4k_limit_days: defaults?.movie_4k_limit_days ?? movie4kQuotaDays,
        tv_show_4k_limit: getLimit(defaults?.tv_show_4k_limit, tv4kQuotaLimit),
        tv_show_4k_limit_days: defaults?.tv_show_4k_limit_days ?? tv4kQuotaDays,
        tv_season_4k_limit: getLimit(defaults?.tv_season_4k_limit, season4kQuotaLimit),
        tv_season_4k_limit_days: defaults?.tv_season_4k_limit_days ?? season4kQuotaDays,
        // Approval rights (default users have none)
        can_approve_movies: 0,
        can_approve_tv: 0,
        can_approve_4k_movies: 0,
        can_approve_4k_tv: 0,
        has_custom_permissions: false
    };
}

/**
 * Get Radarr service for a server
 * @param {number|null} serverId - Specific server ID to use
 * @param {boolean} is4k - If true, prefer 4K server; if false, prefer non-4K server
 */
async function getRadarrService(serverId = null, is4k = false) {
    let server;

    if (serverId) {
        server = await dbGet('SELECT * FROM request_servers WHERE id = $1 AND type = $2', [serverId, 'radarr']);
    } else if (is4k) {
        // For 4K requests, get the 4K server (is_4k = 1)
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_4k = 1 AND is_active = 1', ['radarr']);
        // Fallback to default if no 4K server
        if (!server) {
            server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_default = 1 AND is_active = 1', ['radarr']);
        }
    } else {
        // For non-4K requests, get the default non-4K server
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_default = 1 AND is_active = 1', ['radarr']);
    }

    if (!server) {
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_active = 1 ORDER BY id LIMIT 1', ['radarr']);
    }

    if (!server) return null;

    return {
        service: new RadarrService({ url: server.url, apiKey: server.api_key }),
        server
    };
}

/**
 * Get Sonarr service for a server
 * @param {number|null} serverId - Specific server ID to use
 * @param {boolean} is4k - If true, prefer 4K server; if false, prefer non-4K server
 */
async function getSonarrService(serverId = null, is4k = false) {
    let server;

    if (serverId) {
        server = await dbGet('SELECT * FROM request_servers WHERE id = $1 AND type = $2', [serverId, 'sonarr']);
    } else if (is4k) {
        // For 4K requests, get the 4K server (is_4k = 1)
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_4k = 1 AND is_active = 1', ['sonarr']);
        // Fallback to default if no 4K server
        if (!server) {
            server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_default = 1 AND is_active = 1', ['sonarr']);
        }
    } else {
        // For non-4K requests, get the default non-4K server
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_default = 1 AND is_active = 1', ['sonarr']);
    }

    if (!server) {
        server = await dbGet('SELECT * FROM request_servers WHERE type = $1 AND is_active = 1 ORDER BY id LIMIT 1', ['sonarr']);
    }

    if (!server) return null;

    return {
        service: new SonarrService({ url: server.url, apiKey: server.api_key }),
        server
    };
}

/**
 * Get media status from existing requests
 */
async function getMediaStatus(tmdbId, mediaType, userId = null) {
    // Check if there's an existing request
    let query = 'SELECT * FROM media_requests WHERE tmdb_id = $1 AND media_type = $2';
    const params = [tmdbId, mediaType];

    if (userId) {
        query += ' AND user_id = $3';
        params.push(userId);
    }

    query += ' ORDER BY requested_at DESC LIMIT 1';

    return await dbGet(query, params);
}

/**
 * Get both regular and 4K request status for a media item
 */
async function getMediaRequests(tmdbId, mediaType) {
    // Get non-4K request (is_4k = 0 or NULL)
    const request = await dbGet(`
        SELECT * FROM media_requests
        WHERE tmdb_id = $1 AND media_type = $2 AND (is_4k = 0 OR is_4k IS NULL)
        ORDER BY requested_at DESC LIMIT 1
    `, [tmdbId, mediaType]);

    // Get 4K request
    const request4k = await dbGet(`
        SELECT * FROM media_requests
        WHERE tmdb_id = $1 AND media_type = $2 AND is_4k = 1
        ORDER BY requested_at DESC LIMIT 1
    `, [tmdbId, mediaType]);

    return { request, request4k };
}

// ============ Settings Routes ============

/**
 * GET /api/v2/request-site/settings
 * Get all request site settings
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await dbAll('SELECT setting_key, setting_value FROM request_settings');
        const settingsObj = {};
        for (const s of settings) {
            settingsObj[s.setting_key] = s.setting_value;
        }
        res.json(settingsObj);
    } catch (error) {
        console.error('[Request Site] Failed to get settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

/**
 * PUT /api/v2/request-site/settings
 * Update request site settings
 */
router.put('/settings', async (req, res) => {
    try {
        const settings = req.body;

        // Save settings through write queue
        for (const [key, value] of Object.entries(settings)) {
            await setSetting(key, value?.toString() || '');
        }

        // Update TMDB API key if provided
        if (settings.tmdb_api_key) {
            tmdb.setApiKey(settings.tmdb_api_key);
        }

        // Sync limit settings to request_default_permissions table
        // This ensures /my-usage endpoint can read the correct limits
        const hasLimitSettings = settings.movie_quota_limit !== undefined ||
                                  settings.tv_quota_limit !== undefined ||
                                  settings.season_quota_limit !== undefined ||
                                  settings.auto_approve_movies !== undefined ||
                                  settings.default_can_request_4k_movies !== undefined ||
                                  settings.movie_4k_quota_limit !== undefined;

        if (hasLimitSettings) {
            try {
                await dbRun(`
                    INSERT INTO request_default_permissions (
                        id, can_request_movies, can_request_tv, can_request_4k_movie, can_request_4k_tv,
                        auto_approve_movies, auto_approve_tv, movie_limit_per_week, movie_limit_days,
                        tv_show_limit, tv_show_limit_days, tv_season_limit, tv_season_limit_days,
                        movie_4k_limit, movie_4k_limit_days, tv_show_4k_limit, tv_show_4k_limit_days,
                        tv_season_4k_limit, tv_season_4k_limit_days, updated_at
                    ) VALUES (1, 1, 1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        can_request_4k_movie = $1,
                        can_request_4k_tv = $2,
                        auto_approve_movies = $3,
                        auto_approve_tv = $4,
                        movie_limit_per_week = $5,
                        movie_limit_days = $6,
                        tv_show_limit = $7,
                        tv_show_limit_days = $8,
                        tv_season_limit = $9,
                        tv_season_limit_days = $10,
                        movie_4k_limit = $11,
                        movie_4k_limit_days = $12,
                        tv_show_4k_limit = $13,
                        tv_show_4k_limit_days = $14,
                        tv_season_4k_limit = $15,
                        tv_season_4k_limit_days = $16,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    settings.default_can_request_4k_movies === '1' ? 1 : 0,
                    settings.default_can_request_4k_tv === '1' ? 1 : 0,
                    settings.auto_approve_movies === '1' ? 1 : 0,
                    settings.auto_approve_tv === '1' ? 1 : 0,
                    parseInt(settings.movie_quota_limit) || 0,
                    parseInt(settings.movie_quota_days) || 7,
                    parseInt(settings.tv_quota_limit) || 0,
                    parseInt(settings.tv_quota_days) || 7,
                    parseInt(settings.season_quota_limit) || 0,
                    parseInt(settings.season_quota_days) || 7,
                    parseInt(settings.movie_4k_quota_limit) || 0,
                    parseInt(settings.movie_4k_quota_days) || 7,
                    parseInt(settings.tv_4k_quota_limit) || 0,
                    parseInt(settings.tv_4k_quota_days) || 7,
                    parseInt(settings.season_4k_quota_limit) || 0,
                    parseInt(settings.season_4k_quota_days) || 7
                ]);
                console.log('[Request Site] Synced limit settings to request_default_permissions');
            } catch (syncError) {
                console.error('[Request Site] Failed to sync to permissions table:', syncError);
                // Don't fail the request, settings were still saved
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to update settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * GET /api/v2/request-site/settings/tvdb
 * Get TVDB API key (masked)
 */
router.get('/settings/tvdb', async (req, res) => {
    try {
        const apiKey = await getSetting('tvdb_api_key');
        res.json({
            apiKey: apiKey || '',
            configured: !!apiKey
        });
    } catch (error) {
        console.error('[Request Site] Failed to get TVDB settings:', error);
        res.status(500).json({ error: 'Failed to get TVDB settings' });
    }
});

/**
 * POST /api/v2/request-site/tvdb/test
 * Test TVDB API connection
 */
router.post('/tvdb/test', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            return res.status(400).json({ success: false, error: 'API key is required' });
        }

        const tvdb = new TVDBService(apiKey);
        const result = await tvdb.testConnection();
        res.json(result);
    } catch (error) {
        console.error('[Request Site] TVDB test failed:', error);
        res.json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v2/request-site/settings/tmdb
 * Get TMDB API key
 */
router.get('/settings/tmdb', async (req, res) => {
    try {
        const apiKey = await getSetting('tmdb_api_key');
        res.json({
            apiKey: apiKey || '',
            configured: !!apiKey
        });
    } catch (error) {
        console.error('[Request Site] Failed to get TMDB settings:', error);
        res.status(500).json({ error: 'Failed to get TMDB settings' });
    }
});

/**
 * POST /api/v2/request-site/tmdb/test
 * Test TMDB API connection
 */
router.post('/tmdb/test', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            return res.status(400).json({ success: false, error: 'API key is required' });
        }

        // Test the API key by making a simple request to TMDB
        const axios = require('axios');
        const response = await axios.get('https://api.themoviedb.org/3/configuration', {
            params: { api_key: apiKey },
            timeout: 10000
        });

        if (response.data && response.data.images) {
            res.json({ success: true, message: 'TMDB API connection successful' });
        } else {
            res.json({ success: false, error: 'Invalid response from TMDB' });
        }
    } catch (error) {
        console.error('[Request Site] TMDB test failed:', error);
        const errorMsg = error.response?.status === 401 ? 'Invalid API key' : error.message;
        res.json({ success: false, error: errorMsg });
    }
});

// ============ TMDB Search Routes ============

/**
 * GET /api/v2/request-site/search
 * Search for movies and TV shows
 */
router.get('/search', async (req, res) => {
    try {
        const { query, page = 1, type } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`[Request Site] Search: query="${query}", page=${page}, type=${type || 'all'}`);

        let results;

        if (type === 'movie') {
            // Search movies only
            results = await tmdb.searchMovies(query, parseInt(page));
            // Add media_type since movie search doesn't include it
            if (results.results) {
                results.results = results.results.map(item => ({
                    ...item,
                    media_type: 'movie',
                    posterUrl: TMDBService.getPosterUrl(item.poster_path),
                    backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
                }));
            }
        } else if (type === 'tv') {
            // Search TV shows only
            results = await tmdb.searchTv(query, parseInt(page));
            // Add media_type since TV search doesn't include it
            if (results.results) {
                results.results = results.results.map(item => ({
                    ...item,
                    media_type: 'tv',
                    posterUrl: TMDBService.getPosterUrl(item.poster_path),
                    backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
                }));
            }
        } else {
            // Search BOTH movies and TV separately, then combine
            // This avoids the issue where multi-search returns mostly people
            const [movieResults, tvResults] = await Promise.all([
                tmdb.searchMovies(query, parseInt(page)),
                tmdb.searchTv(query, parseInt(page))
            ]);

            console.log(`[Request Site] TMDB returned ${movieResults.results?.length || 0} movies (total: ${movieResults.total_results})`);
            console.log(`[Request Site] TMDB returned ${tvResults.results?.length || 0} TV shows (total: ${tvResults.total_results})`);
            if (tvResults.results?.length > 0) {
                console.log(`[Request Site] First few TV results: ${tvResults.results.slice(0, 5).map(t => t.name).join(', ')}`);
            }

            // Combine and add media_type
            const combinedResults = [
                ...(movieResults.results || []).map(item => ({
                    ...item,
                    media_type: 'movie',
                    posterUrl: TMDBService.getPosterUrl(item.poster_path),
                    backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
                })),
                ...(tvResults.results || []).map(item => ({
                    ...item,
                    media_type: 'tv',
                    posterUrl: TMDBService.getPosterUrl(item.poster_path),
                    backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
                }))
            ];

            // Sort by vote_count (descending) so most popular/rated results appear first
            // vote_count is more reliable than "popularity" which is based on recent trending activity
            combinedResults.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

            // Calculate combined totals
            const totalResults = (movieResults.total_results || 0) + (tvResults.total_results || 0);
            const maxPages = Math.max(movieResults.total_pages || 0, tvResults.total_pages || 0);

            results = {
                page: parseInt(page),
                results: combinedResults,
                total_results: totalResults,
                total_pages: maxPages
            };
        }

        console.log(`[Request Site] Returning ${results.results?.length || 0} results (total_results: ${results.total_results})`);

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Search failed:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * GET /api/v2/request-site/search/autocomplete
 * Autocomplete suggestions as user types - uses multi-search for better fuzzy matching
 */
router.get('/search/autocomplete', async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.length < 2) {
            return res.json({ results: [] });
        }

        // Use multi-search for autocomplete - it has better fuzzy matching
        const results = await tmdb.searchMulti(query, 1, false);

        // Filter to only movies and TV, add poster URLs, limit to 8 suggestions
        const suggestions = (results.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .slice(0, 8)
            .map(item => ({
                id: item.id,
                title: item.media_type === 'movie' ? item.title : item.name,
                media_type: item.media_type,
                year: item.media_type === 'movie'
                    ? (item.release_date ? item.release_date.substring(0, 4) : null)
                    : (item.first_air_date ? item.first_air_date.substring(0, 4) : null),
                poster_path: item.poster_path,
                posterUrl: TMDBService.getPosterUrl(item.poster_path, 'w92')
            }));

        res.json({ results: suggestions });
    } catch (error) {
        console.error('[Request Site] Autocomplete failed:', error);
        res.json({ results: [] }); // Return empty on error, don't break UI
    }
});

/**
 * GET /api/v2/request-site/search/keyword
 * Search for keywords
 */
router.get('/search/keyword', async (req, res) => {
    try {
        const { query, page = 1 } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const results = await tmdb.searchKeyword(query, parseInt(page));
        res.json(results);
    } catch (error) {
        console.error('[Request Site] Keyword search failed:', error);
        res.status(500).json({ error: 'Keyword search failed' });
    }
});

/**
 * GET /api/v2/request-site/search/company
 * Search for companies (studios/production companies)
 */
router.get('/search/company', async (req, res) => {
    try {
        const { query, page = 1 } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const results = await tmdb.searchCompany(query, parseInt(page));
        res.json(results);
    } catch (error) {
        console.error('[Request Site] Company search failed:', error);
        res.status(500).json({ error: 'Company search failed' });
    }
});

/**
 * GET /api/v2/request-site/discover
 * Discover movies and TV shows
 * IMPORTANT: Matches Seerr's exact API calls for consistent results
 */
router.get('/discover', async (req, res) => {
    try {
        const { type = 'movie', category = 'trending', page = 1, genres } = req.query;

        let results;

        switch (category) {
            case 'trending':
                // Seerr uses 'day' for trending, not 'week'
                // Note: TMDB's trending endpoint doesn't support with_original_language
                // so we need to filter results server-side for English content
                results = await tmdb.getTrending(type, 'day', parseInt(page));
                if (results.results) {
                    results.results = results.results.filter(item => item.original_language === 'en');
                }
                break;

            case 'popular':
                // Seerr uses /discover endpoints with sort_by=popularity.desc, NOT /movie/popular or /tv/popular
                const popularOptions = {
                    page: parseInt(page),
                    sortBy: 'popularity.desc',
                    originalLanguage: 'en'  // Match Seerr's language filtering
                };
                results = type === 'movie'
                    ? await tmdb.discoverMovies(popularOptions)
                    : await tmdb.discoverTv(popularOptions);
                break;

            case 'top_rated':
                // Note: TMDB's top_rated endpoint doesn't support with_original_language
                // so we filter results server-side for English content
                results = type === 'movie'
                    ? await tmdb.getTopRatedMovies(parseInt(page))
                    : await tmdb.getTopRatedTv(parseInt(page));
                if (results.results) {
                    results.results = results.results.filter(item => item.original_language === 'en');
                }
                break;

            case 'upcoming':
                // Seerr uses /discover endpoints with date filters, NOT /movie/upcoming or /tv/on_the_air
                // IMPORTANT: Match Seerr's exact date calculation with timezone offset adjustment
                const now = new Date();
                const offset = now.getTimezoneOffset();
                const todayDate = new Date(now.getTime() - offset * 60 * 1000)
                    .toISOString()
                    .split('T')[0];  // Format: YYYY-MM-DD (timezone adjusted)

                // Calculate max date (1 year from now) to filter out far-future releases
                const maxDate = new Date(now.getTime() - offset * 60 * 1000);
                maxDate.setFullYear(maxDate.getFullYear() + 1);
                const maxDateStr = maxDate.toISOString().split('T')[0];

                const upcomingOptions = {
                    page: parseInt(page),
                    sortBy: 'popularity.desc',
                    originalLanguage: 'en'  // Match Seerr's language filtering
                };

                if (type === 'movie') {
                    upcomingOptions.releaseDateGte = todayDate;  // primary_release_date.gte
                    upcomingOptions.releaseDateLte = maxDateStr; // primary_release_date.lte - limit to 1 year
                    results = await tmdb.discoverMovies(upcomingOptions);
                } else {
                    upcomingOptions.airDateGte = todayDate;  // first_air_date.gte
                    upcomingOptions.airDateLte = maxDateStr; // first_air_date.lte - limit to 1 year
                    results = await tmdb.discoverTv(upcomingOptions);
                }
                break;

            case 'now_playing':
                // Note: TMDB's now_playing endpoint doesn't support with_original_language
                // so we filter results server-side for English content
                results = type === 'movie'
                    ? await tmdb.getNowPlayingMovies(parseInt(page))
                    : await tmdb.getAiringTodayTv(parseInt(page));
                if (results.results) {
                    results.results = results.results.filter(item => item.original_language === 'en');
                }
                break;

            default:
                // Use discover with filters
                const options = { page: parseInt(page), originalLanguage: 'en' };
                if (genres) options.genres = genres;
                results = type === 'movie'
                    ? await tmdb.discoverMovies(options)
                    : await tmdb.discoverTv(options);
        }

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: item.media_type || type,
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Discover failed:', error);
        res.status(500).json({ error: 'Discover failed' });
    }
});

/**
 * GET /api/v2/request-site/genres
 * Get genre lists
 */
router.get('/genres', async (req, res) => {
    try {
        const [movieGenres, tvGenres] = await Promise.all([
            tmdb.getMovieGenres(),
            tmdb.getTvGenres()
        ]);

        res.json({
            movie: movieGenres.genres,
            tv: tvGenres.genres
        });
    } catch (error) {
        console.error('[Request Site] Failed to get genres:', error);
        res.status(500).json({ error: 'Failed to get genres' });
    }
});

/**
 * GET /api/v2/request-site/watch-providers
 * Get available watch providers (streaming services) for a region
 */
router.get('/watch-providers', async (req, res) => {
    try {
        const { region = 'US', type = 'movie' } = req.query;
        const providers = await tmdb.getWatchProviders(type, region);
        res.json(providers);
    } catch (error) {
        console.error('[Request Site] Failed to get watch providers:', error);
        res.status(500).json({ error: 'Failed to get watch providers' });
    }
});

/**
 * GET /api/v2/request-site/movie/:id
 * Get movie details
 */
router.get('/movie/:id', async (req, res) => {
    try {
        const movieId = parseInt(req.params.id);
        const movie = await tmdb.getMovie(movieId);

        // Get both regular and 4K request status
        const { request, request4k } = await getMediaRequests(movieId, 'movie');

        // Check Radarr status from CACHE (not live API - that was causing 12 second delays!)
        let radarrStatus = null;
        const cached = await dbGet(`
            SELECT c.*, s.name as server_name
            FROM radarr_library_cache c
            JOIN request_servers s ON s.id = c.server_id
            WHERE c.tmdb_id = $1 AND s.is_active = 1
            LIMIT 1
        `, [movieId]);

        if (cached) {
            radarrStatus = {
                exists: true,
                hasFile: cached.has_file === 1,
                monitored: cached.monitored === 1,
                id: cached.radarr_id,
                serverName: cached.server_name
            };
        }

        res.json({
            ...movie,
            posterUrl: TMDBService.getPosterUrl(movie.poster_path),
            backdropUrl: TMDBService.getBackdropUrl(movie.backdrop_path),
            request,
            request4k,
            radarrStatus
        });
    } catch (error) {
        console.error('[Request Site] Failed to get movie:', error);
        res.status(500).json({ error: 'Failed to get movie details' });
    }
});

/**
 * GET /api/v2/request-site/tv/:id
 * Get TV show details
 * Supplements TMDB season data with TVDB when available for more complete listings
 */
router.get('/tv/:id', async (req, res) => {
    try {
        const tvId = parseInt(req.params.id);
        const show = await tmdb.getTvShow(tvId);

        // Get both regular and 4K request status
        const { request, request4k } = await getMediaRequests(tvId, 'tv');

        // Check Sonarr status from CACHE (not live API)
        let sonarrStatus = null;
        const cached = await dbGet(`
            SELECT c.*, s.name as server_name
            FROM sonarr_library_cache c
            JOIN request_servers s ON s.id = c.server_id
            WHERE c.tmdb_id = $1 AND s.is_active = 1
            LIMIT 1
        `, [tvId]);

        if (cached) {
            const totalEpisodes = cached.total_episodes || 0;
            const downloadedEpisodes = cached.episode_file_count || 0;
            sonarrStatus = {
                exists: true,
                monitored: cached.monitored === 1,
                id: cached.sonarr_id,
                serverName: cached.server_name,
                totalEpisodes,
                downloadedEpisodes,
                hasAllEpisodes: totalEpisodes > 0 && downloadedEpisodes >= totalEpisodes
            };
        }

        // Try to supplement season data from TVDB (more complete than TMDB for some shows)
        let mergedSeasons = show.seasons || [];
        try {
            const tvdbApiKey = await getSetting('tvdb_api_key');
            const tvdbId = show.external_ids?.tvdb_id;

            if (tvdbApiKey && tvdbId) {
                // Use TVDB API directly for complete season data with episode counts
                const tvdb = new TVDBService(tvdbApiKey);
                const tvdbSeasons = await tvdb.getSeasons(tvdbId);

                if (tvdbSeasons && tvdbSeasons.length > 0) {
                    // Create a map of TMDB seasons for quick lookup
                    const tmdbSeasonMap = new Map();
                    (show.seasons || []).forEach(s => {
                        tmdbSeasonMap.set(s.season_number, s);
                    });

                    // Merge: use TVDB as the base list, supplement with TMDB data
                    mergedSeasons = tvdbSeasons.map(tvdbSeason => {
                        const tmdbSeason = tmdbSeasonMap.get(tvdbSeason.season_number);
                        if (tmdbSeason) {
                            // TMDB has this season - use TMDB's poster/overview but TVDB's episode count
                            return {
                                ...tmdbSeason,
                                episode_count: tvdbSeason.episode_count > 0 ? tvdbSeason.episode_count : tmdbSeason.episode_count,
                                tvdb_id: tvdbSeason.tvdb_id
                            };
                        } else {
                            // TMDB is missing this season - use TVDB data
                            return {
                                id: null,
                                season_number: tvdbSeason.season_number,
                                name: tvdbSeason.name,
                                episode_count: tvdbSeason.episode_count,
                                air_date: tvdbSeason.air_date,
                                overview: tvdbSeason.overview || '',
                                poster_path: tvdbSeason.poster_path,
                                tvdb_id: tvdbSeason.tvdb_id,
                                source: 'tvdb'
                            };
                        }
                    });

                    // Add any TMDB seasons that aren't in TVDB (rare but possible)
                    (show.seasons || []).forEach(tmdbSeason => {
                        const exists = mergedSeasons.some(s => s.season_number === tmdbSeason.season_number);
                        if (!exists) {
                            mergedSeasons.push(tmdbSeason);
                        }
                    });

                    // Sort by season number
                    mergedSeasons.sort((a, b) => a.season_number - b.season_number);

                    console.log(`[Request Site] Merged seasons for TMDB ${tvId}: TMDB had ${show.seasons?.length || 0}, TVDB has ${tvdbSeasons.length}, merged to ${mergedSeasons.length}`);
                }
            }
        } catch (tvdbError) {
            // TVDB fetch failed - continue with TMDB data only
            console.log(`[Request Site] TVDB lookup failed for TMDB ${tvId}, using TMDB data only:`, tvdbError.message);
        }

        // Get per-season status from request_site_seasons
        let seasonStatus = {};
        try {
            const mediaRecord = await dbGet(
                'SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2',
                [tvId, 'tv']
            );

            if (mediaRecord) {
                const seasonRecords = await dbAll(
                    'SELECT season_number, status, status_4k FROM request_site_seasons WHERE media_id = $1',
                    [mediaRecord.id]
                );

                for (const season of seasonRecords) {
                    seasonStatus[season.season_number] = {
                        status: season.status || 'unknown',
                        status4k: season.status_4k || 'unknown'
                    };
                }
            }

            // Fallback: also check media_requests table for requested seasons
            // This handles requests made before season tracking was added
            const allRequests = await dbAll(
                `SELECT seasons, status, is_4k FROM media_requests WHERE tmdb_id = $1 AND media_type = 'tv' AND status NOT IN ('declined', 'failed')`,
                [tvId]
            );
            for (const req of allRequests) {
                if (req.seasons) {
                    try {
                        const reqSeasons = typeof req.seasons === 'string' ? JSON.parse(req.seasons) : req.seasons;
                        if (Array.isArray(reqSeasons)) {
                            for (const sn of reqSeasons) {
                                if (!seasonStatus[sn]) {
                                    seasonStatus[sn] = { status: 'unknown', status4k: 'unknown' };
                                }
                                // Only set if not already tracked with a real status
                                const field = req.is_4k ? 'status4k' : 'status';
                                if (!seasonStatus[sn][field] || seasonStatus[sn][field] === 'unknown') {
                                    seasonStatus[sn][field] = req.status || 'pending';
                                }
                            }
                        }
                    } catch (e) { /* ignore parse errors */ }
                }
            }

            // Query Sonarr directly for per-season monitoring status
            // This ensures we show accurate status even for shows added outside Request Site
            if (cached && cached.sonarr_id) {
                try {
                    // Get the Sonarr server config
                    const sonarrServer = await dbGet(`
                        SELECT * FROM request_servers
                        WHERE id = $1 AND type = 'sonarr' AND is_active = 1
                    `, [cached.server_id]);

                    if (sonarrServer) {
                        const sonarr = new SonarrService({
                            url: sonarrServer.url,
                            apiKey: sonarrServer.api_key
                        });

                        // Get full series data including season monitoring status
                        const seriesData = await sonarr.getSeriesById(cached.sonarr_id);

                        if (seriesData && seriesData.seasons) {
                            for (const season of seriesData.seasons) {
                                const seasonNum = season.seasonNumber;
                                if (seasonNum === 0) continue; // Skip specials

                                // Calculate episode availability
                                const stats = season.statistics || {};
                                const totalEpisodes = stats.totalEpisodeCount || 0;
                                const hasEpisodes = stats.episodeFileCount || 0;
                                const percentComplete = totalEpisodes > 0 ? (hasEpisodes / totalEpisodes) * 100 : 0;

                                // Determine status based on Sonarr data
                                let sonarrSeasonStatus = 'unknown';
                                if (hasEpisodes >= totalEpisodes && totalEpisodes > 0) {
                                    sonarrSeasonStatus = 'available';
                                } else if (hasEpisodes > 0) {
                                    sonarrSeasonStatus = 'partially_available';
                                } else if (season.monitored) {
                                    sonarrSeasonStatus = 'processing';
                                }

                                // Only update if we don't have a status yet, or if Sonarr shows more progress
                                if (!seasonStatus[seasonNum]) {
                                    seasonStatus[seasonNum] = { status: 'unknown', status4k: 'unknown' };
                                }

                                const currentStatus = seasonStatus[seasonNum].status;
                                const statusPriority = { 'unknown': 0, 'pending': 1, 'processing': 2, 'partially_available': 3, 'available': 4 };

                                if ((statusPriority[sonarrSeasonStatus] || 0) > (statusPriority[currentStatus] || 0)) {
                                    // Check if this is a 4K server
                                    if (sonarrServer.is_4k) {
                                        seasonStatus[seasonNum].status4k = sonarrSeasonStatus;
                                    } else {
                                        seasonStatus[seasonNum].status = sonarrSeasonStatus;
                                    }
                                }
                            }
                        }
                    }
                } catch (sonarrErr) {
                    console.log('[Request Site] Could not query Sonarr for season status:', sonarrErr.message);
                    // Continue without Sonarr data - not critical
                }
            }
        } catch (seasonErr) {
            console.error('[Request Site] Failed to get season status:', seasonErr);
            // Continue without season status - it's not critical
        }

        res.json({
            ...show,
            seasons: mergedSeasons,
            posterUrl: TMDBService.getPosterUrl(show.poster_path),
            backdropUrl: TMDBService.getBackdropUrl(show.backdrop_path),
            request,
            request4k,
            sonarrStatus,
            seasonStatus
        });
    } catch (error) {
        console.error('[Request Site] Failed to get TV show:', error);
        res.status(500).json({ error: 'Failed to get TV show details' });
    }
});

/**
 * GET /api/v2/request-site/tv/:id/season/:seasonNumber
 * Get TV season details
 * Tries TMDB first, falls back to TVDB if TMDB doesn't have the season
 */
router.get('/tv/:id/season/:seasonNumber', async (req, res) => {
    try {
        const tvId = parseInt(req.params.id);
        const seasonNumber = parseInt(req.params.seasonNumber);

        // Try TMDB first
        try {
            const season = await tmdb.getTvSeason(tvId, seasonNumber);
            if (season && season.episodes && season.episodes.length > 0) {
                return res.json({
                    ...season,
                    posterUrl: TMDBService.getPosterUrl(season.poster_path),
                    source: 'tmdb'
                });
            }
        } catch (tmdbError) {
            console.log(`[Request Site] TMDB doesn't have season ${seasonNumber} for show ${tvId}, trying TVDB...`);
        }

        // Fallback to TVDB
        const tvdbApiKey = await getSetting('tvdb_api_key');
        if (!tvdbApiKey) {
            return res.status(404).json({ error: 'Season not found in TMDB and TVDB API key not configured' });
        }

        // Get TVDB ID from show's external IDs
        let tvdbId = null;
        try {
            const showDetails = await tmdb.getTvShow(tvId);
            tvdbId = showDetails.external_ids?.tvdb_id;
        } catch (err) {
            console.error('[Request Site] Failed to get show details for TVDB fallback:', err.message);
        }

        if (!tvdbId) {
            return res.status(404).json({ error: 'Season not found in TMDB and TVDB ID not available' });
        }

        // Get episodes from TVDB
        const tvdb = new TVDBService(tvdbApiKey);
        const series = await tvdb.getSeries(tvdbId);

        if (!series || !series.episodes) {
            return res.status(404).json({ error: 'Season not found in TVDB' });
        }

        // Filter episodes for this season
        const seasonEpisodes = series.episodes
            .filter(ep => ep.seasonNumber === seasonNumber)
            .sort((a, b) => a.number - b.number)
            .map(ep => ({
                id: ep.id,
                episode_number: ep.number,
                name: ep.name || `Episode ${ep.number}`,
                overview: ep.overview || '',
                air_date: ep.aired || null,
                still_path: ep.image || null,
                stillUrl: ep.image || null,
                runtime: ep.runtime || null,
                vote_average: 0,
                source: 'tvdb'
            }));

        if (seasonEpisodes.length === 0) {
            return res.status(404).json({ error: 'No episodes found for this season' });
        }

        // Find season info
        const seasonInfo = series.seasons?.find(s => s.number === seasonNumber);

        res.json({
            id: seasonInfo?.id || `tvdb-${tvdbId}-s${seasonNumber}`,
            season_number: seasonNumber,
            name: seasonInfo?.name || `Season ${seasonNumber}`,
            overview: seasonInfo?.overview || '',
            poster_path: seasonInfo?.image || null,
            posterUrl: seasonInfo?.image || null,
            air_date: seasonInfo?.aired || null,
            episodes: seasonEpisodes,
            source: 'tvdb'
        });
    } catch (error) {
        console.error('[Request Site] Failed to get season:', error);
        res.status(500).json({ error: 'Failed to get season details' });
    }
});

/**
 * GET /api/v2/request-site/person/:id
 * Get person details
 */
router.get('/person/:id', async (req, res) => {
    try {
        const personId = parseInt(req.params.id);
        const person = await tmdb.getPerson(personId);

        res.json({
            ...person,
            profileUrl: TMDBService.getProfileUrl(person.profile_path)
        });
    } catch (error) {
        console.error('[Request Site] Failed to get person:', error);
        res.status(500).json({ error: 'Failed to get person details' });
    }
});

// ============ Server Management Routes ============

/**
 * GET /api/v2/request-site/servers
 * Get all configured servers
 */
router.get('/servers', async (req, res) => {
    try {
        const servers = await dbAll(`
            SELECT id, name, type, url, is_default, is_4k, quality_profile_id, quality_profile_name,
                   root_folder_path, language_profile_id, tags, minimum_availability,
                   search_on_add, is_active, created_at
            FROM request_servers
            ORDER BY type, name
        `);

        // Parse tags JSON
        servers.forEach(s => {
            try {
                s.tags = JSON.parse(s.tags || '[]');
            } catch (e) {
                s.tags = [];
            }
        });

        res.json({ servers });
    } catch (error) {
        console.error('[Request Site] Failed to get servers:', error);
        res.status(500).json({ error: 'Failed to get servers' });
    }
});

/**
 * GET /api/v2/request-site/servers/:id
 * Get a single server by ID
 */
router.get('/servers/:id', async (req, res) => {
    try {
        const serverId = parseInt(req.params.id);

        const server = await dbGet(`
            SELECT id, name, type, url, api_key, is_default, is_4k,
                   quality_profile_id, quality_profile_name, root_folder_path,
                   language_profile_id, tags, minimum_availability,
                   search_on_add, is_active, created_at,
                   use_ssl, base_url, series_type, anime_series_type,
                   anime_quality_profile_id, anime_quality_profile_name,
                   anime_root_folder_path, anime_language_profile_id, anime_tags,
                   enable_season_folders, external_url, tag_requests, enable_scan
            FROM request_servers
            WHERE id = $1
        `, [serverId]);

        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Parse tags JSON
        try {
            server.tags = JSON.parse(server.tags || '[]');
        } catch (e) {
            server.tags = [];
        }

        // Parse anime_tags JSON
        try {
            server.anime_tags = JSON.parse(server.anime_tags || '[]');
        } catch (e) {
            server.anime_tags = [];
        }

        res.json(server);
    } catch (error) {
        console.error('[Request Site] Failed to get server:', error);
        res.status(500).json({ error: 'Failed to get server' });
    }
});

/**
 * POST /api/v2/request-site/servers
 * Add a new server
 */
router.post('/servers', async (req, res) => {
    try {
        const b = req.body;
        // Accept both snake_case and camelCase field names
        const name = b.name;
        const type = b.type;
        const url = b.url;
        const apiKey = b.apiKey || b.api_key;
        const isDefault = b.isDefault ?? b.is_default ?? false;
        const is4k = b.is4k ?? b.is_4k ?? false;
        const qualityProfileId = b.qualityProfileId || b.quality_profile_id || null;
        const qualityProfileName = b.qualityProfileName || b.quality_profile_name || null;
        const rootFolderPath = b.rootFolderPath || b.root_folder || null;
        const languageProfileId = b.languageProfileId || b.language_profile_id || null;
        const tags = b.tags || [];
        const minimumAvailability = b.minimumAvailability || b.minimum_availability || 'released';
        const searchOnAdd = b.searchOnAdd ?? b.enable_auto_search ?? true;
        const enableScan = b.enableScan ?? b.enable_scan ?? true;
        const isActive = b.isActive ?? b.is_active ?? true;

        // New extended fields
        const useSsl = b.useSsl ?? b.use_ssl ?? false;
        const baseUrl = b.baseUrl || b.base_url || null;
        const seriesType = b.seriesType || b.series_type || 'standard';
        const animeSeriesType = b.animeSeriesType || b.anime_series_type || 'standard';
        const animeQualityProfileId = b.animeQualityProfileId || b.anime_quality_profile_id || null;
        const animeQualityProfileName = b.animeQualityProfileName || b.anime_quality_profile_name || null;
        const animeRootFolderPath = b.animeRootFolderPath || b.anime_root_folder_path || null;
        const animeLanguageProfileId = b.animeLanguageProfileId || b.anime_language_profile_id || null;
        const animeTags = b.animeTags || b.anime_tags || [];
        const enableSeasonFolders = b.enableSeasonFolders ?? b.enable_season_folders ?? false;
        const externalUrl = b.externalUrl || b.external_url || null;
        const tagRequests = b.tagRequests ?? b.tag_requests ?? false;

        if (!name || !type || !url || !apiKey) {
            return res.status(400).json({ error: 'Name, type, URL, and API key are required' });
        }

        if (!['radarr', 'sonarr'].includes(type)) {
            return res.status(400).json({ error: 'Type must be radarr or sonarr' });
        }

        // Test connection
        const Service = type === 'radarr' ? RadarrService : SonarrService;
        const service = new Service({ url, apiKey });
        const testResult = await service.testConnection();

        if (!testResult.success) {
            return res.status(400).json({ error: `Connection failed: ${testResult.error}` });
        }

        // If setting as default, clear other defaults
        if (isDefault) {
            await dbRun('UPDATE request_servers SET is_default = 0 WHERE type = $1', [type]);
        }

        const result = await dbRun(`
            INSERT INTO request_servers (
                name, type, url, api_key, is_default, is_4k, quality_profile_id,
                quality_profile_name, root_folder_path, language_profile_id, tags,
                minimum_availability, search_on_add, is_active, enable_scan,
                use_ssl, base_url, series_type, anime_series_type,
                anime_quality_profile_id, anime_quality_profile_name, anime_root_folder_path,
                anime_language_profile_id, anime_tags, enable_season_folders,
                external_url, tag_requests
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
            RETURNING id
        `, [
            name, type, url, apiKey, isDefault ? 1 : 0, is4k ? 1 : 0,
            qualityProfileId, qualityProfileName, rootFolderPath,
            languageProfileId, JSON.stringify(tags), minimumAvailability,
            searchOnAdd ? 1 : 0, isActive ? 1 : 0, enableScan ? 1 : 0,
            useSsl ? 1 : 0, baseUrl, seriesType, animeSeriesType,
            animeQualityProfileId, animeQualityProfileName, animeRootFolderPath,
            animeLanguageProfileId, JSON.stringify(animeTags), enableSeasonFolders ? 1 : 0,
            externalUrl, tagRequests ? 1 : 0
        ]);

        res.json({
            success: true,
            id: result[0]?.id,
            version: testResult.version
        });
    } catch (error) {
        console.error('[Request Site] Failed to add server:', error);
        res.status(500).json({ error: 'Failed to add server' });
    }
});

/**
 * PUT /api/v2/request-site/servers/:id
 * Update a server
 */
router.put('/servers/:id', async (req, res) => {
    try {
        const serverId = parseInt(req.params.id);

        const existing = await dbGet('SELECT * FROM request_servers WHERE id = $1', [serverId]);
        if (!existing) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const b = req.body;
        // Accept both snake_case and camelCase field names
        const name = b.name ?? existing.name;
        const url = b.url ?? existing.url;
        const apiKey = b.apiKey || b.api_key || existing.api_key;
        const isDefault = b.isDefault ?? b.is_default ?? existing.is_default;
        const is4k = b.is4k ?? b.is_4k ?? existing.is_4k;
        const qualityProfileId = b.qualityProfileId || b.quality_profile_id || existing.quality_profile_id;
        const qualityProfileName = b.qualityProfileName || b.quality_profile_name || existing.quality_profile_name;
        const rootFolderPath = b.rootFolderPath || b.root_folder || existing.root_folder_path;
        const languageProfileId = b.languageProfileId || b.language_profile_id || existing.language_profile_id;
        const tags = b.tags || (existing.tags ? JSON.parse(existing.tags) : []);
        const minimumAvailability = b.minimumAvailability || b.minimum_availability || existing.minimum_availability || 'released';
        const searchOnAdd = b.searchOnAdd ?? b.enable_auto_search ?? existing.search_on_add ?? true;
        const enableScan = b.enableScan ?? b.enable_scan ?? existing.enable_scan ?? true;
        const isActive = b.isActive ?? b.is_active ?? existing.is_active ?? true;

        // New extended fields
        const useSsl = b.useSsl ?? b.use_ssl ?? existing.use_ssl ?? false;
        const baseUrl = b.baseUrl || b.base_url || existing.base_url || null;
        const seriesType = b.seriesType || b.series_type || existing.series_type || 'standard';
        const animeSeriesType = b.animeSeriesType || b.anime_series_type || existing.anime_series_type || 'standard';
        const animeQualityProfileId = b.animeQualityProfileId || b.anime_quality_profile_id || existing.anime_quality_profile_id || null;
        const animeQualityProfileName = b.animeQualityProfileName || b.anime_quality_profile_name || existing.anime_quality_profile_name || null;
        const animeRootFolderPath = b.animeRootFolderPath || b.anime_root_folder_path || existing.anime_root_folder_path || null;
        const animeLanguageProfileId = b.animeLanguageProfileId || b.anime_language_profile_id || existing.anime_language_profile_id || null;
        const animeTags = b.animeTags || b.anime_tags || (existing.anime_tags ? JSON.parse(existing.anime_tags) : []);
        const enableSeasonFolders = b.enableSeasonFolders ?? b.enable_season_folders ?? existing.enable_season_folders ?? false;
        const externalUrl = b.externalUrl || b.external_url || existing.external_url || null;
        const tagRequests = b.tagRequests ?? b.tag_requests ?? existing.tag_requests ?? false;

        // Test connection if URL or API key changed
        if (url !== existing.url || apiKey !== existing.api_key) {
            const Service = existing.type === 'radarr' ? RadarrService : SonarrService;
            const service = new Service({ url, apiKey });
            const testResult = await service.testConnection();

            if (!testResult.success) {
                return res.status(400).json({ error: `Connection failed: ${testResult.error}` });
            }
        }

        // If setting as default, clear other defaults
        if (isDefault && !existing.is_default) {
            await dbRun('UPDATE request_servers SET is_default = 0 WHERE type = $1', [existing.type]);
        }

        await dbRun(`
            UPDATE request_servers SET
                name = $1, url = $2, api_key = $3, is_default = $4, is_4k = $5,
                quality_profile_id = $6, quality_profile_name = $7, root_folder_path = $8,
                language_profile_id = $9, tags = $10, minimum_availability = $11,
                search_on_add = $12, is_active = $13, enable_scan = $14,
                use_ssl = $15, base_url = $16, series_type = $17, anime_series_type = $18,
                anime_quality_profile_id = $19, anime_quality_profile_name = $20, anime_root_folder_path = $21,
                anime_language_profile_id = $22, anime_tags = $23, enable_season_folders = $24,
                external_url = $25, tag_requests = $26, updated_at = CURRENT_TIMESTAMP
            WHERE id = $27
        `, [
            name, url, apiKey, isDefault ? 1 : 0, is4k ? 1 : 0,
            qualityProfileId, qualityProfileName, rootFolderPath,
            languageProfileId, JSON.stringify(tags), minimumAvailability,
            searchOnAdd ? 1 : 0, isActive ? 1 : 0, enableScan ? 1 : 0,
            useSsl ? 1 : 0, baseUrl, seriesType, animeSeriesType,
            animeQualityProfileId, animeQualityProfileName, animeRootFolderPath,
            animeLanguageProfileId, JSON.stringify(animeTags), enableSeasonFolders ? 1 : 0,
            externalUrl, tagRequests ? 1 : 0, serverId
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to update server:', error);
        res.status(500).json({ error: 'Failed to update server' });
    }
});

/**
 * DELETE /api/v2/request-site/servers/:id
 * Delete a server
 */
router.delete('/servers/:id', async (req, res) => {
    try {
        const serverId = parseInt(req.params.id);

        // Check if server exists first
        const existing = await dbGet('SELECT id FROM request_servers WHERE id = $1', [serverId]);
        if (!existing) {
            return res.status(404).json({ error: 'Server not found' });
        }

        await dbRun('DELETE FROM request_servers WHERE id = $1', [serverId]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to delete server:', error);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});

/**
 * POST /api/v2/request-site/servers/test-connection
 * Test server connection before adding (no server ID required)
 */
router.post('/servers/test-connection', async (req, res) => {
    try {
        const { url, api_key, type } = req.body;

        if (!url || !api_key || !type) {
            return res.status(400).json({ error: 'URL, API key, and type are required' });
        }

        if (!['radarr', 'sonarr'].includes(type)) {
            return res.status(400).json({ error: 'Type must be radarr or sonarr' });
        }

        const Service = type === 'radarr' ? RadarrService : SonarrService;
        const service = new Service({ url, apiKey: api_key });
        const testResult = await service.testConnection();

        if (!testResult.success) {
            return res.json({ success: false, error: testResult.error });
        }

        // Get profiles and root folders for the connection
        const [qualityProfiles, rootFolders] = await Promise.all([
            service.getQualityProfiles(),
            service.getRootFolders()
        ]);

        let languageProfiles = [];
        if (type === 'sonarr') {
            try {
                languageProfiles = await service.getLanguageProfiles();
            } catch (e) {
                // Sonarr v4+ doesn't have separate language profiles
            }
        }

        res.json({
            success: true,
            version: testResult.version,
            qualityProfiles,
            rootFolders,
            languageProfiles
        });
    } catch (error) {
        console.error('[Request Site] Server test-connection failed:', error);
        res.status(500).json({ success: false, error: error.message || 'Connection test failed' });
    }
});

/**
 * POST /api/v2/request-site/servers/:id/test
 * Test server connection
 */
router.post('/servers/:id/test', async (req, res) => {
    try {
        const serverId = parseInt(req.params.id);

        const server = await dbGet('SELECT * FROM request_servers WHERE id = $1', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const Service = server.type === 'radarr' ? RadarrService : SonarrService;
        const service = new Service({ url: server.url, apiKey: server.api_key });
        const result = await service.testConnection();

        res.json(result);
    } catch (error) {
        console.error('[Request Site] Server test failed:', error);
        res.status(500).json({ error: 'Server test failed' });
    }
});

/**
 * GET /api/v2/request-site/servers/:id/profiles
 * Get quality profiles and root folders for a server
 */
router.get('/servers/:id/profiles', async (req, res) => {
    try {
        const serverId = parseInt(req.params.id);

        const server = await dbGet('SELECT * FROM request_servers WHERE id = $1', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const Service = server.type === 'radarr' ? RadarrService : SonarrService;
        const service = new Service({ url: server.url, apiKey: server.api_key });

        const [qualityProfiles, rootFolders, tags] = await Promise.all([
            service.getQualityProfiles(),
            service.getRootFolders(),
            service.getTags()
        ]);

        let languageProfiles = [];
        if (server.type === 'sonarr') {
            try {
                languageProfiles = await service.getLanguageProfiles();
            } catch (e) {
                // Sonarr v4+ doesn't have separate language profiles
            }
        }

        res.json({
            qualityProfiles,
            rootFolders,
            tags,
            languageProfiles,
            // Include server's default settings for auto-selection
            defaultQualityProfileId: server.quality_profile_id,
            defaultRootFolderPath: server.root_folder_path
        });
    } catch (error) {
        console.error('[Request Site] Failed to get profiles:', error);
        res.status(500).json({ error: 'Failed to get profiles' });
    }
});

// ============ Request Management Routes ============

/**
 * GET /api/v2/request-site/requests
 * Get all requests (admin) or user's requests
 */
router.get('/requests', async (req, res) => {
    try {
        const { status, mediaType, userId, page = 1, limit = 20 } = req.query;

        let query = `
            SELECT r.*, u.email as user_email, u.name as user_name
            FROM media_requests r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND r.status = $${paramIndex++}`;
            params.push(status);
        }
        if (mediaType) {
            query += ` AND r.media_type = $${paramIndex++}`;
            params.push(mediaType);
        }
        if (userId) {
            query += ` AND r.user_id = $${paramIndex++}`;
            params.push(parseInt(userId));
        }

        query += ` ORDER BY r.requested_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const requests = await dbAll(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM media_requests WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;
        if (status) {
            countQuery += ` AND status = $${countParamIndex++}`;
            countParams.push(status);
        }
        if (mediaType) {
            countQuery += ` AND media_type = $${countParamIndex++}`;
            countParams.push(mediaType);
        }
        if (userId) {
            countQuery += ` AND user_id = $${countParamIndex++}`;
            countParams.push(parseInt(userId));
        }
        const totalResult = await dbGet(countQuery, countParams);
        const total = totalResult?.count || 0;

        res.json({
            requests,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        console.error('[Request Site] Failed to get requests:', error);
        res.status(500).json({ error: 'Failed to get requests' });
    }
});

/**
 * POST /api/v2/request-site/requests
 * Create a new request
 */
router.post('/requests', async (req, res) => {
    try {
        const {
            userId, tmdbId, mediaType, title, posterPath, backdropPath,
            overview, releaseDate, seasons: requestedSeasons, is4k = false, requestedBy
        } = req.body;

        // Use let so we can filter to only unrequested seasons later
        let seasons = requestedSeasons;

        if (!userId || !tmdbId || !mediaType || !title) {
            return res.status(400).json({ error: 'userId, tmdbId, mediaType, and title are required' });
        }

        // Get user permissions
        const permissions = await getUserPermissionsInternal(userId);

        // Check media type permission
        if (mediaType === 'movie' && !permissions.can_request_movies) {
            return res.status(403).json({ error: 'You do not have permission to request movies' });
        }
        if (mediaType === 'tv' && !permissions.can_request_tv) {
            return res.status(403).json({ error: 'You do not have permission to request TV shows' });
        }

        // Check 4K permission (separate permissions for movies vs TV)
        if (is4k) {
            const can4kMovie = permissions.can_request_4k_movie ?? permissions.can_request_4k;
            const can4kTv = permissions.can_request_4k_tv ?? permissions.can_request_4k;

            if (mediaType === 'movie' && !can4kMovie) {
                return res.status(403).json({ error: 'You do not have permission to request 4K movies' });
            }
            if (mediaType === 'tv' && !can4kTv) {
                return res.status(403).json({ error: 'You do not have permission to request 4K TV shows' });
            }
        }

        // Check request limits (flexible time periods)

        // Movie limit: X movies per Y days
        const movieLimit = permissions.movie_limit_per_week || 0;
        const movieLimitDays = permissions.movie_limit_days || 7;
        if (mediaType === 'movie' && movieLimit > 0) {
            const cutoffDate = new Date(Date.now() - movieLimitDays * 24 * 60 * 60 * 1000).toISOString();
            const recentMovieResult = await dbGet(`
                SELECT COUNT(*) as count FROM media_requests
                WHERE user_id = $1 AND media_type = 'movie' AND requested_at > $2
            `, [userId, cutoffDate]);
            const recentMovieCount = recentMovieResult?.count || 0;

            if (recentMovieCount >= movieLimit) {
                return res.status(403).json({ error: `You have reached your movie request limit (${movieLimit} per ${movieLimitDays} days)` });
            }
        }

        // TV Show limit: X shows per Y days (regardless of how many seasons)
        const tvShowLimit = permissions.tv_show_limit || permissions.tv_limit_per_week || 0;
        const tvShowLimitDays = permissions.tv_show_limit_days || 7;
        if (mediaType === 'tv' && tvShowLimit > 0) {
            const cutoffDate = new Date(Date.now() - tvShowLimitDays * 24 * 60 * 60 * 1000).toISOString();
            const recentTvShowResult = await dbGet(`
                SELECT COUNT(*) as count FROM media_requests
                WHERE user_id = $1 AND media_type = 'tv' AND requested_at > $2
            `, [userId, cutoffDate]);
            const recentTvShowCount = recentTvShowResult?.count || 0;

            if (recentTvShowCount >= tvShowLimit) {
                return res.status(403).json({ error: `You have reached your TV show request limit (${tvShowLimit} shows per ${tvShowLimitDays} days)` });
            }
        }

        // TV Season limit: X seasons per Y days (total seasons across all shows)
        const tvSeasonLimit = permissions.tv_season_limit || 0;
        const tvSeasonLimitDays = permissions.tv_season_limit_days || 7;
        if (mediaType === 'tv' && tvSeasonLimit > 0 && seasons && seasons.length > 0) {
            const cutoffDate = new Date(Date.now() - tvSeasonLimitDays * 24 * 60 * 60 * 1000).toISOString();

            // Count total seasons requested in time period
            const recentTvRequests = await dbAll(`
                SELECT seasons FROM media_requests
                WHERE user_id = $1 AND media_type = 'tv' AND requested_at > $2
            `, [userId, cutoffDate]);

            let totalRecentSeasons = 0;
            for (const req of recentTvRequests) {
                if (req.seasons) {
                    try {
                        const parsedSeasons = JSON.parse(req.seasons);
                        totalRecentSeasons += Array.isArray(parsedSeasons) ? parsedSeasons.length : 0;
                    } catch (e) {
                        // If parsing fails, count as 1 season
                        totalRecentSeasons += 1;
                    }
                } else {
                    // No seasons specified = assume all seasons, count as 1 for safety
                    totalRecentSeasons += 1;
                }
            }

            const newSeasonCount = seasons.length;
            if (totalRecentSeasons + newSeasonCount > tvSeasonLimit) {
                const remaining = Math.max(0, tvSeasonLimit - totalRecentSeasons);
                return res.status(403).json({
                    error: `You have reached your TV season limit. You can request ${remaining} more season(s) in the next ${tvSeasonLimitDays} days (limit: ${tvSeasonLimit} seasons per ${tvSeasonLimitDays} days)`
                });
            }
        }

        // Check if already requested (same media, same 4K status)
        const existing = await dbGet(`
            SELECT * FROM media_requests
            WHERE tmdb_id = $1 AND media_type = $2 AND is_4k = $3 AND status NOT IN ('declined', 'failed')
        `, [tmdbId, mediaType, is4k ? 1 : 0]);

        if (existing) {
            // For TV shows, allow requesting additional seasons
            if (mediaType === 'tv' && seasons && seasons.length > 0) {
                // Check if any of the requested seasons are actually new (not already requested)
                const mediaRecord = await dbGet(
                    'SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2',
                    [tmdbId, 'tv']
                );

                // Build season status map from request_site_seasons table
                const seasonStatusMap = {};

                if (mediaRecord) {
                    const statusField = is4k ? 'status_4k' : 'status';
                    const seasonRecords = await dbAll(
                        `SELECT season_number, ${statusField} as status FROM request_site_seasons WHERE media_id = $1`,
                        [mediaRecord.id]
                    );
                    for (const sr of seasonRecords) {
                        seasonStatusMap[sr.season_number] = sr.status;
                    }
                }

                // Fallback: also check media_requests.seasons column for all existing requests
                const allExistingRequests = await dbAll(
                    `SELECT seasons, status, is_4k FROM media_requests WHERE tmdb_id = $1 AND media_type = 'tv' AND status NOT IN ('declined', 'failed')`,
                    [tmdbId]
                );
                for (const req of allExistingRequests) {
                    if (req.seasons) {
                        try {
                            const reqSeasons = typeof req.seasons === 'string' ? JSON.parse(req.seasons) : req.seasons;
                            if (Array.isArray(reqSeasons)) {
                                for (const sn of reqSeasons) {
                                    const matchesType = is4k ? req.is_4k : !req.is_4k;
                                    if (matchesType && (!seasonStatusMap[sn] || seasonStatusMap[sn] === 'unknown')) {
                                        seasonStatusMap[sn] = req.status || 'pending';
                                    }
                                }
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                }

                // Filter out seasons that are already requested/processing/available
                const newSeasons = seasons.filter(seasonNum => {
                    const status = seasonStatusMap[seasonNum];
                    return !status || status === 'unknown';
                });

                if (newSeasons.length === 0) {
                    return res.status(400).json({
                        error: 'All selected seasons have already been requested',
                        existingRequest: existing
                    });
                }

                // Update seasons array to only include new seasons
                seasons = newSeasons;
                console.log(`[Request Site] TV show already has request, adding new seasons: ${newSeasons.join(', ')}`);
            } else {
                // Movies or TV without specific seasons - reject duplicate
                return res.status(400).json({ error: 'This media has already been requested', existingRequest: existing });
            }
        }

        // Check for auto-approve based on user permissions
        let autoApprove = false;
        if (mediaType === 'movie' && permissions.auto_approve_movies) {
            autoApprove = true;
        } else if (mediaType === 'tv' && permissions.auto_approve_tv) {
            autoApprove = true;
        } else {
            // Fall back to global settings
            autoApprove = mediaType === 'movie'
                ? (await getSetting('auto_approve_movies')) === '1'
                : (await getSetting('auto_approve_tv')) === '1';
        }

        const status = autoApprove ? 'approved' : 'pending';

        // Insert request
        const result = await dbRun(`
            INSERT INTO media_requests (
                user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
                overview, release_date, status, seasons, is_4k, requested_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `, [
            userId, tmdbId, mediaType, title, posterPath, backdropPath,
            overview, releaseDate, status, seasons ? JSON.stringify(seasons) : null,
            is4k ? 1 : 0, requestedBy
        ]);

        const requestId = result[0]?.id;

        // For TV shows, create/update request_site_media and request_site_seasons records
        // This enables per-season status tracking from the moment of request
        if (mediaType === 'tv' && seasons && seasons.length > 0) {
            try {
                // Get or create request_site_media record
                let mediaRecord = await dbGet(
                    'SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2',
                    [tmdbId, 'tv']
                );

                if (!mediaRecord) {
                    const insertResult = await dbRun(`
                        INSERT INTO request_site_media (tmdb_id, media_type, title, status, status_4k, created_at, updated_at)
                        VALUES ($1, 'tv', $2, 'pending', 'unknown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING id
                    `, [tmdbId, title]);
                    mediaRecord = { id: insertResult[0]?.id };
                }

                if (mediaRecord && mediaRecord.id) {
                    // Create/update request_site_seasons records for each requested season
                    const statusField = is4k ? 'status_4k' : 'status';

                    for (const seasonNum of seasons) {
                        await dbRun(`
                            INSERT INTO request_site_seasons (media_id, season_number, ${statusField}, created_at, updated_at)
                            VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                            ON CONFLICT (media_id, season_number) DO UPDATE SET
                                ${statusField} = CASE
                                    WHEN request_site_seasons.${statusField} IN ('unknown', 'pending') THEN 'pending'
                                    ELSE request_site_seasons.${statusField}
                                END,
                                updated_at = CURRENT_TIMESTAMP
                        `, [mediaRecord.id, seasonNum]);
                    }

                    console.log(`[Request Site] Created/updated season records for TV request - media_id: ${mediaRecord.id}, seasons: ${seasons.join(', ')}, is_4k: ${is4k}`);
                }
            } catch (seasonTrackErr) {
                console.error('[Request Site] Failed to create season tracking records:', seasonTrackErr);
                // Don't fail the request if season tracking fails
            }
        }

        // If auto-approved, send to Radarr/Sonarr
        if (autoApprove) {
            try {
                if (mediaType === 'movie') {
                    await processMovieRequest(requestId);
                } else {
                    await processTvRequest(requestId, seasons);
                }
                // Notify user of auto-approval
                console.log('[Request Site] Sending auto-approval notification to user:', userId);
                await notifyUserRequestAutoApproved(userId, title, mediaType, {
                    requestId,
                    tmdbId,
                    posterPath,
                    is4k
                });
            } catch (processError) {
                console.error('[Request Site] Auto-process failed:', processError);
                // Update status to pending if auto-process failed
                await dbRun('UPDATE media_requests SET status = $1 WHERE id = $2', ['pending', requestId]);
                // Since it reverted to pending, notify admins instead
                console.log('[Request Site] Auto-process failed, notifying admins of pending request');
                await notifyAdminsNewRequest({
                    requestId,
                    mediaTitle: title,
                    mediaType,
                    username: requestedBy,
                    userId,
                    tmdbId,
                    posterPath,
                    is4k
                });
            }
        } else {
            // Notify admins of new pending request
            console.log('[Request Site] Sending pending request notification to admins');
            await notifyAdminsNewRequest({
                requestId,
                mediaTitle: title,
                mediaType,
                username: requestedBy,
                userId,
                tmdbId,
                posterPath,
                is4k
            });
        }

        const newRequest = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);
        res.json(newRequest);
    } catch (error) {
        console.error('[Request Site] Failed to create request:', error);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

/**
 * PUT /api/v2/request-site/requests/:id/approve
 * Approve a request
 */
router.put('/requests/:id/approve', async (req, res) => {
    try {
        const requestId = parseInt(req.params.id);
        const { approvedBy, serverId } = req.body;

        const request = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Request is not pending' });
        }

        // Check approval rights for non-admin users
        const userId = req.session?.userId || req.session?.portalUserId;
        const isAdmin = req.session?.role === 'admin';

        if (!isAdmin && userId) {
            const userPerms = await getUserPermissionsInternal(userId);
            const is4k = request.is_4k === 1;
            const isMovie = request.media_type === 'movie';

            // Check appropriate approval right based on media type and 4K status
            let canApprove = false;
            if (is4k && isMovie && userPerms.can_approve_4k_movies) canApprove = true;
            else if (is4k && !isMovie && userPerms.can_approve_4k_tv) canApprove = true;
            else if (!is4k && isMovie && userPerms.can_approve_movies) canApprove = true;
            else if (!is4k && !isMovie && userPerms.can_approve_tv) canApprove = true;

            if (!canApprove) {
                return res.status(403).json({ error: 'You do not have permission to approve this type of request' });
            }
        }

        // Update status to approved
        await dbRun(`
            UPDATE media_requests SET status = $1, approved_by = $2, processed_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, ['approved', approvedBy, requestId]);

        // Process the request
        try {
            if (request.media_type === 'movie') {
                await processMovieRequest(requestId, serverId);
            } else {
                const seasons = request.seasons ? JSON.parse(request.seasons) : null;
                await processTvRequest(requestId, seasons, serverId);
            }

            await dbRun('UPDATE media_requests SET status = $1 WHERE id = $2', ['processing', requestId]);
        } catch (processError) {
            console.error('[Request Site] Process failed:', processError);
            await dbRun('UPDATE media_requests SET status = $1, notes = $2 WHERE id = $3', ['failed', processError.message, requestId]);
        }

        // Notify user of approval
        console.log('[Request Site] Sending approval notification to user:', request.user_id);
        await notifyUserRequestApproved(request.user_id, request.title, request.media_type, {
            requestId,
            tmdbId: request.tmdb_id,
            posterPath: request.poster_path,
            is4k: request.is_4k === 1
        });

        const updatedRequest = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);
        res.json(updatedRequest);
    } catch (error) {
        console.error('[Request Site] Failed to approve request:', error);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

/**
 * PUT /api/v2/request-site/requests/:id/decline
 * Decline a request
 */
router.put('/requests/:id/decline', async (req, res) => {
    try {
        const requestId = parseInt(req.params.id);
        const { reason } = req.body;

        const request = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Check approval rights for non-admin users (same rights needed to decline)
        const userId = req.session?.userId || req.session?.portalUserId;
        const isAdmin = req.session?.role === 'admin';

        if (!isAdmin && userId) {
            const userPerms = await getUserPermissionsInternal(userId);
            const is4k = request.is_4k === 1;
            const isMovie = request.media_type === 'movie';

            // Check appropriate approval right based on media type and 4K status
            let canDecline = false;
            if (is4k && isMovie && userPerms.can_approve_4k_movies) canDecline = true;
            else if (is4k && !isMovie && userPerms.can_approve_4k_tv) canDecline = true;
            else if (!is4k && isMovie && userPerms.can_approve_movies) canDecline = true;
            else if (!is4k && !isMovie && userPerms.can_approve_tv) canDecline = true;

            if (!canDecline) {
                return res.status(403).json({ error: 'You do not have permission to decline this type of request' });
            }
        }

        await dbRun(`
            UPDATE media_requests SET status = $1, notes = $2, processed_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, ['declined', reason || 'Request declined', requestId]);

        // Notify user of decline
        console.log('[Request Site] Sending decline notification to user:', request.user_id);
        await notifyUserRequestDeclined(request.user_id, request.title, request.media_type, reason, {
            requestId,
            tmdbId: request.tmdb_id,
            posterPath: request.poster_path,
            is4k: request.is_4k === 1
        });

        const updatedRequest = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);
        res.json(updatedRequest);
    } catch (error) {
        console.error('[Request Site] Failed to decline request:', error);
        res.status(500).json({ error: 'Failed to decline request' });
    }
});

/**
 * DELETE /api/v2/request-site/requests/:id
 * Delete a request
 */
router.delete('/requests/:id', async (req, res) => {
    try {
        const requestId = parseInt(req.params.id);

        // Check if request exists first
        const existing = await dbGet('SELECT id FROM media_requests WHERE id = $1', [requestId]);
        if (!existing) {
            return res.status(404).json({ error: 'Request not found' });
        }

        await dbRun('DELETE FROM media_requests WHERE id = $1', [requestId]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to delete request:', error);
        res.status(500).json({ error: 'Failed to delete request' });
    }
});

// ============ Helper Functions for Processing ============

/**
 * Process a movie request through Radarr
 */
async function processMovieRequest(requestId, serverId = null) {
    const request = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);

    if (!request) {
        throw new Error('Request not found');
    }

    // Get appropriate Radarr server based on 4K flag
    const is4k = request.is_4k === 1;
    const radarr = await getRadarrService(serverId, is4k);
    if (!radarr) {
        throw new Error(`No ${is4k ? '4K ' : ''}Radarr server configured`);
    }

    console.log(`[Request Site] Processing movie request #${requestId} (4K: ${is4k}) using server: ${radarr.server.name}`);
    console.log(`[Request Site] Radarr server config: qualityProfileId=${radarr.server.quality_profile_id}, rootFolder=${radarr.server.root_folder_path}, searchOnAdd=${radarr.server.search_on_add}, url=${radarr.server.url}`);

    const result = await radarr.service.addMovie({
        tmdbId: request.tmdb_id,
        qualityProfileId: radarr.server.quality_profile_id,
        rootFolderPath: radarr.server.root_folder_path,
        minimumAvailability: radarr.server.minimum_availability || 'announced',
        tags: JSON.parse(radarr.server.tags || '[]'),
        monitored: true,
        searchNow: radarr.server.search_on_add == 1
    });

    console.log(`[Request Site] Radarr addMovie result: success=${result.success}, alreadyExists=${result.alreadyExists}, hasFile=${result.hasFile}, wasUpdated=${result.wasUpdated}, movieId=${result.movie?.id}, error=${result.error}`);

    if (result.success) {
        // Check if movie already has file - mark as available immediately
        const newStatus = result.hasFile ? 'available' : 'processing';

        if (result.hasFile) {
            await dbRun(`
                UPDATE media_requests SET
                    server_id = $1, external_id = $2, status = $3, available_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [radarr.server.id, result.movie?.id, newStatus, requestId]);
        } else {
            await dbRun(`
                UPDATE media_requests SET
                    server_id = $1, external_id = $2, status = $3
                WHERE id = $4
            `, [radarr.server.id, result.movie?.id, newStatus, requestId]);
        }

        // If already downloaded, also update request_site_media table
        if (result.hasFile) {
            console.log(`[Request Site] Movie already downloaded in Radarr - marking as AVAILABLE`);

            // Update or insert request_site_media record
            const statusField = is4k ? 'status_4k' : 'status';
            const existing = await dbGet('SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2', [request.tmdb_id, 'movie']);

            if (existing) {
                await dbRun(`UPDATE request_site_media SET ${statusField} = 4, media_added_at = COALESCE(media_added_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [existing.id]);
            } else {
                await dbRun(`INSERT INTO request_site_media (tmdb_id, media_type, ${statusField}, media_added_at, created_at, updated_at) VALUES ($1, 'movie', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [request.tmdb_id]);
            }
        }
    } else {
        throw new Error(result.error || 'Failed to add to Radarr');
    }

    return result;
}

/**
 * Process a TV request through Sonarr
 */
async function processTvRequest(requestId, seasons = null, serverId = null) {
    const request = await dbGet('SELECT * FROM media_requests WHERE id = $1', [requestId]);

    if (!request) {
        throw new Error('Request not found');
    }

    // Get appropriate Sonarr server based on 4K flag
    const is4k = request.is_4k === 1;
    const sonarr = await getSonarrService(serverId, is4k);
    if (!sonarr) {
        throw new Error(`No ${is4k ? '4K ' : ''}Sonarr server configured`);
    }

    console.log(`[Request Site] Processing TV request #${requestId} (4K: ${is4k}) using server: ${sonarr.server.name}`);

    // First get TVDB ID from TMDB
    const tmdbService = new TMDBService();
    const externalIds = await tmdbService.getTvExternalIds(request.tmdb_id);
    const tvdbId = externalIds?.tvdb_id;

    if (!tvdbId) {
        throw new Error('Could not find TVDB ID for this show');
    }

    const result = await sonarr.service.addSeries({
        tvdbId,
        tmdbId: request.tmdb_id,
        qualityProfileId: sonarr.server.quality_profile_id,
        languageProfileId: sonarr.server.language_profile_id,
        rootFolderPath: sonarr.server.root_folder_path,
        tags: JSON.parse(sonarr.server.tags || '[]'),
        seasons: seasons,
        monitorAllSeasons: !seasons,
        searchNow: sonarr.server.search_on_add === 1
    });

    if (result.success) {
        // Check if series already has files - determine appropriate status
        const episodeFileCount = result.series?.statistics?.episodeFileCount || 0;
        const totalEpisodeCount = result.series?.statistics?.totalEpisodeCount || 0;
        const hasFiles = episodeFileCount > 0;
        const isFullyAvailable = episodeFileCount >= totalEpisodeCount && totalEpisodeCount > 0;

        let newStatus = 'processing';
        if (isFullyAvailable) {
            newStatus = 'available';
        } else if (hasFiles) {
            // Partial availability - still mark as processing until fully complete
            newStatus = 'processing';
        }

        if (newStatus === 'available') {
            await dbRun(`
                UPDATE media_requests SET
                    server_id = $1, external_id = $2, tvdb_id = $3, status = $4, available_at = CURRENT_TIMESTAMP
                WHERE id = $5
            `, [sonarr.server.id, result.series?.id, tvdbId, newStatus, requestId]);
        } else {
            await dbRun(`
                UPDATE media_requests SET
                    server_id = $1, external_id = $2, tvdb_id = $3, status = $4
                WHERE id = $5
            `, [sonarr.server.id, result.series?.id, tvdbId, newStatus, requestId]);
        }

        // Update request_site_media and request_site_seasons records
        const statusField = is4k ? 'status_4k' : 'status';
        let mediaRecord = await dbGet('SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2', [request.tmdb_id, 'tv']);

        // Create media record if it doesn't exist
        if (!mediaRecord) {
            const insertResult = await dbRun(`
                INSERT INTO request_site_media (tmdb_id, media_type, title, status, status_4k, created_at, updated_at)
                VALUES ($1, 'tv', $2, 'processing', 'unknown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
            `, [request.tmdb_id, request.title]);
            mediaRecord = { id: insertResult[0]?.id };
        }

        if (mediaRecord && mediaRecord.id) {
            // Get requested seasons from the request
            let requestedSeasons = seasons;
            if (!requestedSeasons && request.seasons) {
                try {
                    requestedSeasons = JSON.parse(request.seasons);
                } catch (e) {
                    requestedSeasons = [];
                }
            }

            // Update each requested season to "processing" status
            if (requestedSeasons && requestedSeasons.length > 0) {
                for (const seasonNum of requestedSeasons) {
                    await dbRun(`
                        INSERT INTO request_site_seasons (media_id, season_number, ${statusField}, created_at, updated_at)
                        VALUES ($1, $2, 'processing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT (media_id, season_number) DO UPDATE SET
                            ${statusField} = 'processing',
                            updated_at = CURRENT_TIMESTAMP
                    `, [mediaRecord.id, seasonNum]);
                }
                console.log(`[Request Site] Updated season records to 'processing' - media_id: ${mediaRecord.id}, seasons: ${requestedSeasons.join(', ')}, is_4k: ${is4k}`);
            }

            // If already has files, update statuses
            if (hasFiles) {
                console.log(`[Request Site] TV show has ${episodeFileCount}/${totalEpisodeCount} episodes in Sonarr - marking as ${isFullyAvailable ? 'AVAILABLE' : 'PARTIALLY_AVAILABLE'}`);

                const mediaStatus = isFullyAvailable ? 4 : 3; // 4 = AVAILABLE, 3 = PARTIALLY_AVAILABLE
                await dbRun(`UPDATE request_site_media SET ${statusField} = $1, media_added_at = COALESCE(media_added_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [mediaStatus, mediaRecord.id]);
            } else {
                // Update media record to processing
                await dbRun(`UPDATE request_site_media SET ${statusField} = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [mediaRecord.id]);
            }
        }
    } else {
        throw new Error(result.error || 'Failed to add to Sonarr');
    }

    return result;
}

// ============ Discover by Genre/Studio/Network Routes ============

/**
 * GET /api/v2/request-site/constants
 * Get all constants (genres, studios, networks)
 */
router.get('/constants', (req, res) => {
    try {
        const constants = require('../services/tmdb-constants');
        res.json({
            movieGenres: constants.MOVIE_GENRES,
            tvGenres: constants.TV_GENRES,
            studios: constants.STUDIOS,
            networks: constants.NETWORKS
        });
    } catch (error) {
        console.error('[Request Site] Failed to get constants:', error);
        res.status(500).json({ error: 'Failed to get constants' });
    }
});

/**
 * GET /api/v2/request-site/discover/movies
 * General movie discovery with sorting
 */
router.get('/discover/movies', async (req, res) => {
    try {
        const {
            page = 1,
            sortBy = 'popularity.desc',
            primaryReleaseDateGte,
            primaryReleaseDateLte,
            withGenres,
            withRuntimeGte,
            withRuntimeLte,
            voteAverageGte,
            voteAverageLte,
            voteCountGte,
            voteCountLte,
            language
        } = req.query;

        const options = {
            page: parseInt(page),
            sortBy: sortBy
        };

        // Add filter params if present
        if (primaryReleaseDateGte) options.primaryReleaseDateGte = primaryReleaseDateGte;
        if (primaryReleaseDateLte) options.primaryReleaseDateLte = primaryReleaseDateLte;
        if (withGenres) options.with_genres = withGenres;
        if (withRuntimeGte) options.with_runtime_gte = parseInt(withRuntimeGte);
        if (withRuntimeLte) options.with_runtime_lte = parseInt(withRuntimeLte);
        if (voteAverageGte) options.vote_average_gte = parseFloat(voteAverageGte);
        if (voteAverageLte) options.vote_average_lte = parseFloat(voteAverageLte);
        if (voteCountGte) options.vote_count_gte = parseInt(voteCountGte);
        if (voteCountLte) options.vote_count_lte = parseInt(voteCountLte);
        if (language) options.with_original_language = language;

        const results = await tmdb.discoverMovies(options);

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: 'movie',
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Movie discover failed:', error);
        res.status(500).json({ error: 'Movie discover failed' });
    }
});

/**
 * GET /api/v2/request-site/discover/tv
 * General TV show discovery with sorting
 */
router.get('/discover/tv', async (req, res) => {
    try {
        const {
            page = 1,
            sortBy = 'popularity.desc',
            firstAirDateGte,
            firstAirDateLte,
            withGenres,
            status,
            withRuntimeGte,
            withRuntimeLte,
            voteAverageGte,
            voteAverageLte,
            voteCountGte,
            voteCountLte,
            language
        } = req.query;

        const options = {
            page: parseInt(page),
            sortBy: sortBy
        };

        // Add filter params if present
        if (firstAirDateGte) options.firstAirDateGte = firstAirDateGte;
        if (firstAirDateLte) options.firstAirDateLte = firstAirDateLte;
        if (withGenres) options.with_genres = withGenres;
        if (status) options.with_status = status;
        if (withRuntimeGte) options.with_runtime_gte = parseInt(withRuntimeGte);
        if (withRuntimeLte) options.with_runtime_lte = parseInt(withRuntimeLte);
        if (voteAverageGte) options.vote_average_gte = parseFloat(voteAverageGte);
        if (voteAverageLte) options.vote_average_lte = parseFloat(voteAverageLte);
        if (voteCountGte) options.vote_count_gte = parseInt(voteCountGte);
        if (voteCountLte) options.vote_count_lte = parseInt(voteCountLte);
        if (language) options.with_original_language = language;

        const results = await tmdb.discoverTv(options);

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: 'tv',
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] TV discover failed:', error);
        res.status(500).json({ error: 'TV discover failed' });
    }
});

/**
 * GET /api/v2/request-site/discover/genre/:genreId
 * Discover media by genre
 */
router.get('/discover/genre/:genreId', async (req, res) => {
    try {
        const { genreId } = req.params;
        const { type = 'movie', page = 1 } = req.query;

        const options = {
            genres: genreId,
            page: parseInt(page)
        };

        const results = type === 'movie'
            ? await tmdb.discoverMovies(options)
            : await tmdb.discoverTv(options);

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: type,
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Genre discover failed:', error);
        res.status(500).json({ error: 'Genre discover failed' });
    }
});

/**
 * GET /api/v2/request-site/discover/studio/:studioId
 * Discover movies by studio
 */
router.get('/discover/studio/:studioId', async (req, res) => {
    try {
        const { studioId } = req.params;
        const { page = 1 } = req.query;

        const results = await tmdb.discoverMoviesByStudio(studioId, parseInt(page));

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: 'movie',
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Studio discover failed:', error);
        res.status(500).json({ error: 'Studio discover failed' });
    }
});

/**
 * GET /api/v2/request-site/discover/network/:networkId
 * Discover TV shows by network
 */
router.get('/discover/network/:networkId', async (req, res) => {
    try {
        const { networkId } = req.params;
        const { page = 1 } = req.query;

        const results = await tmdb.discoverTvByNetwork(networkId, parseInt(page));

        // Add image URLs
        if (results.results) {
            results.results = results.results.map(item => ({
                ...item,
                media_type: 'tv',
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            }));
        }

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Network discover failed:', error);
        res.status(500).json({ error: 'Network discover failed' });
    }
});

/**
 * GET /api/v2/request-site/collection/:collectionId
 * Get movies in a collection
 */
router.get('/collection/:collectionId', async (req, res) => {
    try {
        const { collectionId } = req.params;

        const collection = await tmdb.getCollection(collectionId);

        // Format results to match the expected structure
        const results = {
            results: collection.parts ? collection.parts.map(item => ({
                ...item,
                media_type: 'movie',
                posterUrl: TMDBService.getPosterUrl(item.poster_path),
                backdropUrl: TMDBService.getBackdropUrl(item.backdrop_path)
            })) : [],
            page: 1,
            total_pages: 1,
            total_results: collection.parts ? collection.parts.length : 0
        };

        res.json(results);
    } catch (error) {
        console.error('[Request Site] Collection fetch failed:', error);
        res.status(500).json({ error: 'Collection fetch failed' });
    }
});

// ============ EPISODE AVAILABILITY ENDPOINTS ============

/**
 * GET /api/v2/request-site/tv/:tmdbId/season/:seasonNumber/episodes/availability
 * Get episode availability for a specific season from Plex
 */
router.get('/tv/:tmdbId/season/:seasonNumber/episodes/availability', async (req, res) => {
    try {
        const axios = require('axios');
        const tmdbId = parseInt(req.params.tmdbId);
        const seasonNumber = parseInt(req.params.seasonNumber);

        console.log(`[Episode Availability] Checking TMDB ${tmdbId}, Season ${seasonNumber}`);

        // Find the show in our media database
        const mediaRecord = await dbGet(`
            SELECT id, tmdb_id, plex_rating_key, plex_server_id, status FROM request_site_media
            WHERE tmdb_id = $1 AND media_type = 'tv'
        `, [tmdbId]);

        console.log(`[Episode Availability] Media record:`, mediaRecord);

        if (!mediaRecord || !mediaRecord.plex_rating_key) {
            // Show not on Plex - return empty availability
            console.log(`[Episode Availability] No media record or plex_rating_key for TMDB ${tmdbId}`);
            return res.json({ available: [], status: 'not_on_plex' });
        }

        // Get the Plex server details
        const server = await dbGet(`
            SELECT url, token FROM plex_servers WHERE id = $1
        `, [mediaRecord.plex_server_id]);

        if (!server) {
            return res.json({ available: [], status: 'server_not_found' });
        }

        // Query Plex for seasons
        const childrenUrl = `${server.url}/library/metadata/${mediaRecord.plex_rating_key}/children`;
        const childrenResponse = await axios.get(childrenUrl, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        const plexSeasons = childrenResponse.data?.MediaContainer?.Metadata || [];
        console.log(`[Episode Availability] Found ${plexSeasons.length} seasons on Plex:`, plexSeasons.map(s => ({ index: s.index, title: s.title })));

        const plexSeason = plexSeasons.find(s => s.index === seasonNumber);

        if (!plexSeason) {
            console.log(`[Episode Availability] Season ${seasonNumber} not found on Plex`);
            return res.json({ available: [], status: 'season_not_on_plex' });
        }

        console.log(`[Episode Availability] Found season ${seasonNumber} with ratingKey ${plexSeason.ratingKey}`);

        // Get episodes from this Plex season
        const episodesUrl = `${server.url}/library/metadata/${plexSeason.ratingKey}/children`;
        const episodesResponse = await axios.get(episodesUrl, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        const plexEpisodes = episodesResponse.data?.MediaContainer?.Metadata || [];
        const availableEpisodes = plexEpisodes.map(ep => ep.index);

        console.log(`[Episode Availability] Found ${plexEpisodes.length} episodes:`, availableEpisodes);

        res.json({
            available: availableEpisodes,
            status: 'success',
            count: availableEpisodes.length
        });

    } catch (error) {
        console.error('[Request Site] Episode availability check failed:', error.message);
        res.json({ available: [], status: 'error', message: error.message });
    }
});

// ============ RATINGS ENDPOINTS (Matching Seerr Implementation) ============

/**
 * GET /api/v2/request-site/movie/:id/ratingscombined
 * Get combined ratings from RT, IMDb, and TMDB for a movie
 * Matches Seerr's /api/v1/movie/:id/ratingscombined endpoint
 */
router.get('/movie/:id/ratingscombined', async (req, res) => {
    try {
        const movieId = parseInt(req.params.id);

        // Check cache first
        const cacheKey = `movie:${movieId}:ratings`;
        const cached = getCachedRatings(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Get movie details from TMDB first (includes title, year, IMDb ID)
        const movie = await tmdb.getMovie(movieId);

        const ratingsPromises = [];
        const ratingTypes = [];

        // 1. Rotten Tomatoes ratings via Algolia API (same as Seerr)
        if (movie.title && movie.release_date) {
            const year = parseInt(movie.release_date.slice(0, 4));
            ratingsPromises.push(fetchRottenTomatoesRatings(movie.title, year));
            ratingTypes.push('rt');
        } else {
            ratingsPromises.push(Promise.resolve(null));
            ratingTypes.push('rt');
        }

        // 2. IMDb rating via Radarr proxy API (same as Seerr)
        if (movie.external_ids?.imdb_id) {
            ratingsPromises.push(fetchIMDbRating(movie.external_ids.imdb_id));
            ratingTypes.push('imdb');
        } else {
            ratingsPromises.push(Promise.resolve(null));
            ratingTypes.push('imdb');
        }

        // Wait for all ratings to be fetched
        const ratingsResults = await Promise.allSettled(ratingsPromises);

        const combinedRatings = {
            rt: null,
            imdb: null,
            tmdb: {
                voteAverage: movie.vote_average,
                voteCount: movie.vote_count
            }
        };

        ratingsResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const type = ratingTypes[index];
                combinedRatings[type] = result.value;
            }
        });

        // Cache the result
        setCachedRatings(cacheKey, combinedRatings);
        res.json(combinedRatings);

    } catch (error) {
        console.error('[Request Site] Failed to fetch combined ratings:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

/**
 * GET /api/v2/request-site/tv/:id/ratingscombined
 * Get combined ratings from RT, IMDb, and TMDB for a TV show
 */
router.get('/tv/:id/ratingscombined', async (req, res) => {
    try {
        const tvId = parseInt(req.params.id);

        // Check cache first
        const cacheKey = `tv:${tvId}:ratings`;
        const cached = getCachedRatings(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Get TV show details from TMDB (includes name, first_air_date, external_ids)
        const show = await tmdb.getTvShow(tvId);
        const externalIds = await tmdb.getTvExternalIds(tvId);

        const ratingsPromises = [];
        const ratingTypes = [];

        // 1. Rotten Tomatoes ratings via Algolia API (for TV shows)
        if (show.name && show.first_air_date) {
            const year = parseInt(show.first_air_date.slice(0, 4));
            ratingsPromises.push(fetchRottenTomatoesRatingsTV(show.name, year));
            ratingTypes.push('rt');
        } else {
            ratingsPromises.push(Promise.resolve(null));
            ratingTypes.push('rt');
        }

        // 2. IMDb rating via Radarr proxy (if we have IMDb ID)
        if (externalIds?.imdb_id) {
            ratingsPromises.push(fetchIMDbRating(externalIds.imdb_id));
            ratingTypes.push('imdb');
        } else {
            ratingsPromises.push(Promise.resolve(null));
            ratingTypes.push('imdb');
        }

        // Fetch all ratings in parallel
        const ratingsResults = await Promise.allSettled(ratingsPromises);

        // Combine results
        const combinedRatings = {
            rt: null,
            imdb: null,
            tmdb: {
                voteAverage: show.vote_average,
                voteCount: show.vote_count
            }
        };

        ratingsResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const type = ratingTypes[index];
                combinedRatings[type] = result.value;
            }
        });

        // Cache the result
        setCachedRatings(cacheKey, combinedRatings);
        res.json(combinedRatings);

    } catch (error) {
        console.error('[Request Site] Failed to fetch TV combined ratings:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

// ============ Plex Library Scan Routes (Seerr-Style) ============

// Singleton scanner instance (for direct scans if needed)
let plexScanner = null;
let scanInProgress = false;
let currentScanWorker = null;
let lastScanResults = null;

function getPlexScanner() {
    if (!plexScanner) {
        plexScanner = new PlexScannerService();
    }
    return plexScanner;
}

/**
 * Start Plex scan in a worker process (non-blocking)
 * This prevents scans from blocking API requests
 */
function startPlexScanWorker(options = {}) {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, '..', 'workers', 'plex-scan-worker.js');

        console.log(`[Plex Scan] Starting scan in worker process...`);
        const worker = fork(workerPath, [], {
            env: { ...process.env }
        });

        currentScanWorker = worker;
        let completed = false;

        worker.on('message', (msg) => {
            switch (msg.type) {
                case 'ready':
                    worker.send({ command: options.recentOnly ? 'recentScan' : 'scan', options });
                    break;
                case 'status':
                    console.log(`[Plex Scan Worker] ${msg.message}`);
                    break;
                case 'progress':
                    console.log(`[Plex Scan Worker] Progress: ${msg.message || JSON.stringify(msg)}`);
                    break;
                case 'complete':
                    console.log(`[Plex Scan Worker] ${msg.message}`);
                    completed = true;
                    lastScanResults = msg.results;
                    scanInProgress = false;
                    currentScanWorker = null;
                    resolve(msg.results);
                    break;
                case 'error':
                    console.error(`[Plex Scan Worker] ${msg.message}`);
                    completed = true;
                    scanInProgress = false;
                    currentScanWorker = null;
                    reject(new Error(msg.error || msg.message));
                    break;
            }
        });

        worker.on('error', (error) => {
            console.error('[Plex Scan] Worker error:', error);
            scanInProgress = false;
            currentScanWorker = null;
            if (!completed) reject(error);
        });

        worker.on('exit', (code) => {
            currentScanWorker = null;
            if (code !== 0 && !completed) {
                scanInProgress = false;
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

/**
 * GET /api/v2/request-site/plex/servers
 * Get available Plex servers for scanning (includes auto-scan setting)
 */
router.get('/plex/servers', async (req, res) => {
    try {
        const servers = await dbAll(`
            SELECT id, name, url, last_scan, last_recent_scan,
                   COALESCE(enable_auto_scan, 1) as enable_auto_scan
            FROM plex_servers WHERE is_active = 1 ORDER BY name
        `);
        res.json({ servers });
    } catch (error) {
        console.error('[Request Site] Failed to get Plex servers:', error);
        res.status(500).json({ error: 'Failed to get Plex servers' });
    }
});

/**
 * PUT /api/v2/request-site/plex/servers/:id/auto-scan
 * Update auto-scan setting for a Plex server
 */
router.put('/plex/servers/:id/auto-scan', async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        await dbRun(`
            UPDATE plex_servers SET enable_auto_scan = $1 WHERE id = $2
        `, [enabled ? 1 : 0, id]);

        console.log(`[Request Site] Plex server ${id} auto-scan set to ${enabled}`);
        res.json({ success: true, serverId: id, enableAutoScan: enabled });
    } catch (error) {
        console.error('[Request Site] Failed to update auto-scan setting:', error);
        res.status(500).json({ error: 'Failed to update auto-scan setting' });
    }
});

/**
 * PUT /api/v2/request-site/plex/servers/auto-scan-bulk
 * Update auto-scan settings for multiple Plex servers at once
 */
router.put('/plex/servers/auto-scan-bulk', async (req, res) => {
    try {
        const { servers } = req.body; // Array of { id, enabled }

        if (!Array.isArray(servers)) {
            return res.status(400).json({ error: 'servers must be an array' });
        }

        for (const server of servers) {
            await dbRun(`UPDATE plex_servers SET enable_auto_scan = $1 WHERE id = $2`, [server.enabled ? 1 : 0, server.id]);
        }

        console.log(`[Request Site] Updated auto-scan settings for ${servers.length} servers`);
        res.json({ success: true, updated: servers.length });
    } catch (error) {
        console.error('[Request Site] Failed to update auto-scan settings:', error);
        res.status(500).json({ error: 'Failed to update auto-scan settings' });
    }
});

/**
 * POST /api/v2/request-site/plex/scan
 * Scan selected Plex libraries using Seerr-style scanner
 * Request body: { serverIds: [1, 2, 3], recentOnly: false, background: false }
 * - serverIds: optional, if not provided scans all active servers
 * - recentOnly: if true, only scan recently added content (incremental scan)
 * - background: if true, returns immediately and runs scan in background (non-blocking)
 *
 * NOTE: Scans now run in a worker process to prevent blocking other API requests
 */
router.post('/plex/scan', async (req, res) => {
    try {
        if (scanInProgress) {
            return res.status(409).json({
                error: 'Scan already in progress',
                message: 'Please wait for the current scan to complete'
            });
        }

        scanInProgress = true;
        const { serverIds, recentOnly = false, background = false } = req.body || {};
        const scanType = recentOnly ? 'RECENT' : 'FULL';

        console.log(`[Plex Scan] Starting ${scanType} scan in worker process...`);

        // Run scan in worker process (non-blocking to main thread)
        const scanPromise = startPlexScanWorker({
            serverIds: serverIds && Array.isArray(serverIds) ? serverIds : undefined,
            recentOnly
        });

        // If background mode, return immediately
        if (background) {
            res.json({
                success: true,
                message: `${scanType} scan started in background`,
                scanType: recentOnly ? 'recent' : 'full',
                status: 'running'
            });

            // Handle completion in background
            scanPromise.then(async () => {
                await dbRun(`
                    INSERT INTO request_settings (setting_key, setting_value, updated_at)
                    VALUES ('plex_last_scan', NOW(), CURRENT_TIMESTAMP)
                    ON CONFLICT(setting_key) DO UPDATE SET
                        setting_value = NOW(),
                        updated_at = CURRENT_TIMESTAMP
                `);
            }).catch(err => {
                console.error('[Plex Scan] Background scan failed:', err);
            });
            return;
        }

        // Wait for scan to complete
        await scanPromise;

        // Update last scan timestamp in settings
        await dbRun(`
            INSERT INTO request_settings (setting_key, setting_value, updated_at)
            VALUES ('plex_last_scan', NOW(), CURRENT_TIMESTAMP)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = NOW(),
                updated_at = CURRENT_TIMESTAMP
        `);

        res.json({
            success: true,
            scanType: recentOnly ? 'recent' : 'full',
            totalMovies: results.totalMovies,
            totalTVShows: results.totalTVShows,
            totalEpisodes: results.totalEpisodes,
            newlyAdded: results.newlyAdded,
            servers: results.servers,
            errors: results.errors
        });

    } catch (error) {
        scanInProgress = false;
        console.error('[Plex Scan] Scan failed:', error);
        res.status(500).json({ error: 'Failed to scan Plex libraries', message: error.message });
    }
});

/**
 * POST /api/v2/request-site/plex/scan/recent
 * Quick scan for recently added content only (incremental)
 * NOTE: Runs in worker process to prevent blocking other API requests
 */
router.post('/plex/scan/recent', async (req, res) => {
    try {
        if (scanInProgress) {
            return res.status(409).json({
                error: 'Scan already in progress',
                message: 'Please wait for the current scan to complete'
            });
        }

        scanInProgress = true;
        const { serverIds, background = false } = req.body || {};

        console.log('[Plex Scan] Starting RECENT-ONLY scan in worker process...');

        // Run scan in worker process (non-blocking to main thread)
        const scanPromise = startPlexScanWorker({
            serverIds: serverIds && Array.isArray(serverIds) ? serverIds : undefined,
            recentOnly: true
        });

        // If background mode, return immediately
        if (background) {
            res.json({
                success: true,
                message: 'Recent scan started in background',
                scanType: 'recent',
                status: 'running'
            });
            return;
        }

        // Wait for scan to complete
        const results = await scanPromise;

        res.json({
            success: true,
            scanType: 'recent',
            totalMovies: results.totalMovies,
            totalTVShows: results.totalTVShows,
            newlyAdded: results.newlyAdded,
            servers: results.servers,
            errors: results.errors
        });

    } catch (error) {
        scanInProgress = false;
        console.error('[Plex Scan] Recent scan failed:', error);
        res.status(500).json({ error: 'Failed to scan recently added', message: error.message });
    }
});

/**
 * POST /api/v2/request-site/plex/availability-sync
 * Check if previously available media has been removed from Plex
 * Marks removed content with DELETED status
 */
router.post('/plex/availability-sync', async (req, res) => {
    const axios = require('axios');

    try {
        let removedCount = 0;
        let checkedCount = 0;

        // Get all media marked as available
        const availableMedia = await dbAll(`
            SELECT m.id, m.tmdb_id, m.media_type, m.plex_rating_key, m.plex_server_id, s.url, s.token
            FROM request_site_media m
            JOIN plex_servers s ON m.plex_server_id = s.id
            WHERE m.status >= $1 AND m.plex_rating_key IS NOT NULL
        `, [MediaStatus.PARTIALLY_AVAILABLE]);

        console.log(`[Availability Sync] Checking ${availableMedia.length} items...`);

        for (const item of availableMedia) {
            checkedCount++;

            try {
                // Check if item still exists on Plex
                const metadataUrl = `${item.url}/library/metadata/${item.plex_rating_key}`;
                await axios.get(metadataUrl, {
                    headers: {
                        'X-Plex-Token': item.token,
                        'Accept': 'application/json'
                    },
                    timeout: 5000
                });
                // Item still exists, update last check time
                await dbRun(`
                    UPDATE request_site_media SET last_availability_check = CURRENT_TIMESTAMP WHERE id = $1
                `, [item.id]);

            } catch (error) {
                if (error.response && error.response.status === 404) {
                    // Item no longer exists on Plex - mark as deleted
                    console.log(`[Availability Sync] Marking as removed: TMDB ${item.tmdb_id} (${item.media_type})`);
                    await dbRun(`
                        UPDATE request_site_media
                        SET status = $1, plex_rating_key = NULL, last_availability_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [MediaStatus.DELETED, item.id]);
                    removedCount++;
                }
            }
        }

        console.log(`[Availability Sync] Complete: ${checkedCount} checked, ${removedCount} removed`);

        res.json({
            success: true,
            checked: checkedCount,
            removed: removedCount
        });

    } catch (error) {
        console.error('[Availability Sync] Failed:', error);
        res.status(500).json({ error: 'Availability sync failed', message: error.message });
    }
});

/**
 * DELETE /api/v2/request-site/plex/cache
 * Clear the GUID cache to force fresh TMDB lookups
 */
router.delete('/plex/cache', async (req, res) => {
    try {
        const { serverId } = req.query;

        if (serverId) {
            await dbRun('DELETE FROM plex_guid_cache WHERE plex_server_id = $1', [parseInt(serverId)]);
            console.log(`[Plex Cache] Cleared cache for server ${serverId}`);
        } else {
            await dbRun('DELETE FROM plex_guid_cache');
            console.log('[Plex Cache] Cleared all cache');
        }

        res.json({ success: true });

    } catch (error) {
        console.error('[Plex Cache] Failed to clear cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

/**
 * GET /api/v2/request-site/plex/cache/stats
 * Get cache statistics
 */
router.get('/plex/cache/stats', async (req, res) => {
    try {
        const stats = await dbAll(`
            SELECT
                plex_server_id,
                COUNT(*) as total,
                SUM(CASE WHEN tmdb_id IS NOT NULL THEN 1 ELSE 0 END) as with_tmdb
            FROM plex_guid_cache
            GROUP BY plex_server_id
        `);

        const totalCached = stats.reduce((sum, s) => sum + parseInt(s.total), 0);
        const totalWithTmdb = stats.reduce((sum, s) => sum + parseInt(s.with_tmdb), 0);

        res.json({
            totalCached,
            totalWithTmdb,
            hitRate: totalCached > 0 ? Math.round((totalWithTmdb / totalCached) * 100) : 0,
            byServer: stats
        });

    } catch (error) {
        console.error('[Plex Cache] Failed to get stats:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

/**
 * GET /api/v2/request-site/plex/recently-added
 * Get recently added content from Plex (from request_site_media with actual addedAt from Plex)
 */
router.get('/plex/recently-added', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        // Get recently added media from request_site_media using actual Plex addedAt timestamp
        // Check for both 'available' (new) and '4' (legacy integer as text) status values
        const items = await dbAll(`
            SELECT DISTINCT
                m.tmdb_id,
                m.media_type,
                g.title,
                g.year,
                m.media_added_at as added_at
            FROM request_site_media m
            LEFT JOIN plex_guid_cache g ON m.tmdb_id = g.tmdb_id AND m.media_type = g.media_type
            WHERE (m.status = 'available' OR m.status = '4')
              AND m.media_added_at IS NOT NULL
            ORDER BY m.media_added_at DESC
            LIMIT $1
        `, [limit]);

        // Format the results (frontend will fetch poster from TMDB if title missing)
        const formattedItems = items.map(item => ({
            tmdb_id: item.tmdb_id,
            media_type: item.media_type,
            title: item.title || null,
            year: item.year || null,
            added_at: item.added_at
        }));

        res.json({ items: formattedItems });

    } catch (error) {
        console.error('[Plex] Failed to get recently added:', error);
        res.status(500).json({ error: 'Failed to get recently added content' });
    }
});

/**
 * GET /api/v2/request-site/plex/scan-status
 * Get the last scan timestamp and stats
 */
router.get('/plex/scan-status', async (req, res) => {
    try {
        // Get last scan timestamp
        const lastScan = await dbGet(`
            SELECT setting_value FROM request_settings WHERE setting_key = 'plex_last_scan'
        `);

        // Get count of available media
        const stats = await dbAll(`
            SELECT
                media_type,
                COUNT(*) as count
            FROM request_site_media
            WHERE status = 'available'
            GROUP BY media_type
        `);

        const movieCount = parseInt(stats.find(s => s.media_type === 'movie')?.count) || 0;
        const tvCount = parseInt(stats.find(s => s.media_type === 'tv')?.count) || 0;

        res.json({
            lastScan: lastScan?.setting_value || null,
            availableMovies: movieCount,
            availableTVShows: tvCount,
            totalAvailable: movieCount + tvCount
        });

    } catch (error) {
        console.error('[Plex Scan] Failed to get scan status:', error);
        res.status(500).json({ error: 'Failed to get scan status' });
    }
});

/**
 * GET /api/v2/request-site/media/:type/:tmdbId/status
 * Check if a specific media is available on Plex
 */
router.get('/media/:type/:tmdbId/status', async (req, res) => {
    try {
        const { type, tmdbId } = req.params;

        const media = await dbGet(`
            SELECT * FROM request_site_media
            WHERE tmdb_id = $1 AND media_type = $2
        `, [tmdbId, type]);

        if (media && media.status === 4) {
            res.json({
                available: true,
                status: 4,
                plexRatingKey: media.plex_rating_key,
                plexServerId: media.plex_server_id
            });
        } else {
            res.json({
                available: false,
                status: media?.status || 0
            });
        }

    } catch (error) {
        console.error('[Request Site] Failed to check media status:', error);
        res.status(500).json({ error: 'Failed to check media status' });
    }
});

/**
 * GET /api/v2/request-site/tv/:tmdbId/seasons/availability
 * Get season-level availability for a TV show
 * Returns status for each season (0=unknown, 3=partial, 4=available)
 */
router.get('/tv/:tmdbId/seasons/availability', async (req, res) => {
    try {
        const { tmdbId } = req.params;

        // First find the media record
        const media = await dbGet(`
            SELECT id, status FROM request_site_media
            WHERE tmdb_id = $1 AND media_type = 'tv'
        `, [tmdbId]);

        if (!media) {
            return res.json({ seasons: {} });
        }

        // Get all seasons for this show
        const seasons = await dbAll(`
            SELECT season_number, status
            FROM request_site_seasons
            WHERE media_id = $1
        `, [media.id]);

        const seasonStatus = {};
        for (const season of seasons) {
            seasonStatus[season.season_number] = season.status;
        }

        res.json({
            showStatus: media.status,
            seasons: seasonStatus
        });

    } catch (error) {
        console.error('[Request Site] Failed to get season availability:', error);
        res.status(500).json({ error: 'Failed to get season availability' });
    }
});

/**
 * GET /api/v2/request-site/media/batch-status
 * Check availability status for multiple TMDB IDs at once
 * Checks both Plex (from request_site_media) AND Sonarr/Radarr (from cache)
 * Query params: type=movie|tv, ids=123,456,789
 *
 * Status codes:
 * 0 = Unknown (not tracked anywhere)
 * 1 = Requested (pending approval)
 * 2 = Processing (in Sonarr/Radarr, downloading)
 * 3 = Partially Available (some episodes on Plex)
 * 4 = Available (on Plex)
 * 5 = Deleted
 */
router.get('/media/batch-status', async (req, res) => {
    try {
        const { type, ids } = req.query;

        if (!type || !ids) {
            return res.status(400).json({ error: 'Type and ids are required' });
        }

        const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

        if (idList.length === 0) {
            return res.json({ statuses: {} });
        }

        // Get all matching media records (Plex availability)
        const placeholders = idList.map((_, i) => `$${i + 1}`).join(',');
        const mediaRecords = await db.query(`
            SELECT tmdb_id, status FROM request_site_media
            WHERE tmdb_id IN (${placeholders}) AND media_type = $${idList.length + 1}
        `, [...idList, type]);

        // Build status map from Plex data
        const statuses = {};
        for (const record of mediaRecords) {
            statuses[record.tmdb_id] = record.status;
        }

        // For items not found in Plex (or status 0), check Sonarr/Radarr cache
        const missingIds = idList.filter(id => !statuses[id] || statuses[id] === 0);

        if (missingIds.length > 0) {
            if (type === 'movie') {
                // Check Radarr cache
                const radarrPlaceholders = missingIds.map((_, i) => `$${i + 1}`).join(',');
                const radarrRecords = await db.query(`
                    SELECT tmdb_id, has_file FROM radarr_library_cache
                    WHERE tmdb_id IN (${radarrPlaceholders})
                `, missingIds);

                for (const record of radarrRecords) {
                    // If has file, mark as available (4), else processing (2)
                    statuses[record.tmdb_id] = record.has_file ? 4 : 2;
                }
            } else if (type === 'tv') {
                // Check Sonarr cache by TMDB ID
                const sonarrPlaceholders = missingIds.map((_, i) => `$${i + 1}`).join(',');
                const sonarrRecords = await db.query(`
                    SELECT tmdb_id, total_episodes, episode_file_count FROM sonarr_library_cache
                    WHERE tmdb_id IN (${sonarrPlaceholders})
                `, missingIds);

                for (const record of sonarrRecords) {
                    if (record.episode_file_count >= record.total_episodes && record.total_episodes > 0) {
                        // All episodes downloaded
                        statuses[record.tmdb_id] = 4; // Available
                    } else if (record.episode_file_count > 0) {
                        // Some episodes downloaded
                        statuses[record.tmdb_id] = 3; // Partially Available
                    } else {
                        // No episodes yet, but being monitored
                        statuses[record.tmdb_id] = 2; // Processing
                    }
                }
            }
        }

        res.json({ statuses });

    } catch (error) {
        console.error('[Request Site] Failed to batch check media status:', error);
        res.status(500).json({ error: 'Failed to check media status' });
    }
});

// ============ Sonarr/Radarr Library Sync Routes ============

/**
 * POST /api/v2/request-site/arr/sync
 * Trigger a manual sync of Sonarr/Radarr libraries to cache
 */
router.post('/arr/sync', async (req, res) => {
    try {
        const { arrLibrarySyncJob } = require('../jobs/arr-library-sync');

        console.log('[Arr Sync] Manual sync triggered');

        // Run sync in background
        arrLibrarySyncJob.run().catch(err => {
            console.error('[Arr Sync] Background sync error:', err);
        });

        res.json({
            success: true,
            message: 'Sync started in background'
        });

    } catch (error) {
        console.error('[Arr Sync] Failed to start sync:', error);
        res.status(500).json({ error: 'Failed to start sync' });
    }
});

/**
 * GET /api/v2/request-site/arr/sync/status
 * Get Sonarr/Radarr sync status and cache statistics
 */
router.get('/arr/sync/status', async (req, res) => {
    try {
        const { arrLibrarySyncJob } = require('../jobs/arr-library-sync');

        // Get last sync times for each server
        const servers = await dbAll(`
            SELECT id, name, type, last_library_sync FROM request_servers WHERE is_active = 1
        `);

        const stats = arrLibrarySyncJob.getStats();

        res.json({
            isRunning: arrLibrarySyncJob.isRunning,
            stats,
            servers: servers.map(s => ({
                id: s.id,
                name: s.name,
                type: s.type,
                lastSync: s.last_library_sync
            }))
        });

    } catch (error) {
        console.error('[Arr Sync] Failed to get status:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

/**
 * GET /api/v2/request-site/media/:type/:tmdbId/monitoring
 * Check if media is being monitored in Sonarr/Radarr
 * Uses CACHED library data instead of live API calls for fast response
 * Returns status for BOTH regular and 4K servers separately
 * Also checks Plex availability (request_site_media) for immediate status updates
 */
router.get('/media/:type/:tmdbId/monitoring', async (req, res) => {
    try {
        const { type, tmdbId } = req.params;

        if (type === 'movie') {
            // Check cached Radarr library data for BOTH regular and 4K servers
            const allCached = await dbAll(`
                SELECT c.*, s.name as server_name, s.is_4k
                FROM radarr_library_cache c
                JOIN request_servers s ON s.id = c.server_id
                WHERE c.tmdb_id = $1 AND s.is_active = 1
            `, [parseInt(tmdbId)]);

            // Also check Plex availability from request_site_media
            // This provides immediate status when Plex detects the file before Radarr cache syncs
            const plexMedia = await dbGet(`
                SELECT plex_rating_key, media_added_at
                FROM request_site_media
                WHERE tmdb_id = $1 AND media_type = 'movie' AND plex_rating_key IS NOT NULL
            `, [parseInt(tmdbId)]);
            const isOnPlex = !!plexMedia;

            // Separate regular and 4K status
            const regularServer = allCached.find(c => !c.is_4k || c.is_4k === 0);
            const fourKServer = allCached.find(c => c.is_4k === 1);

            // If movie is on Plex, treat as downloaded (even if Radarr cache hasn't synced yet)
            const regularHasFile = regularServer?.has_file === 1 || isOnPlex;
            const fourKHasFile = fourKServer?.has_file === 1;

            const result = {
                monitoring: allCached.length > 0,
                // Regular (non-4K) status
                regular: regularServer ? {
                    monitoring: true,
                    hasFile: regularHasFile,
                    serverName: regularServer.server_name,
                    status: regularHasFile ? 'downloaded' : 'processing',
                    monitored: regularServer.monitored === 1
                } : (isOnPlex ? {
                    // Movie is on Plex but not in Radarr cache (e.g., manual add)
                    monitoring: false,
                    hasFile: true,
                    serverName: 'Plex',
                    status: 'downloaded',
                    monitored: false
                } : null),
                // 4K status
                fourK: fourKServer ? {
                    monitoring: true,
                    hasFile: fourKHasFile,
                    serverName: fourKServer.server_name,
                    status: fourKHasFile ? 'downloaded' : 'processing',
                    monitored: fourKServer.monitored === 1
                } : null,
                // Legacy fields for backward compatibility
                hasFile: regularHasFile || fourKHasFile,
                serverName: regularServer?.server_name || fourKServer?.server_name || (isOnPlex ? 'Plex' : null),
                status: (regularHasFile || fourKHasFile) ? 'downloaded' :
                        (allCached.length > 0 ? 'processing' : null),
                onPlex: isOnPlex
            };

            return res.json(result);

        } else if (type === 'tv') {
            // Check cached Sonarr library data for BOTH regular and 4K servers
            const allCached = await dbAll(`
                SELECT c.*, s.name as server_name, s.is_4k
                FROM sonarr_library_cache c
                JOIN request_servers s ON s.id = c.server_id
                WHERE c.tmdb_id = $1 AND s.is_active = 1
            `, [parseInt(tmdbId)]);

            // Also check Plex availability from request_site_media
            const plexMedia = await dbGet(`
                SELECT plex_rating_key, media_added_at
                FROM request_site_media
                WHERE tmdb_id = $1 AND media_type = 'tv' AND plex_rating_key IS NOT NULL
            `, [parseInt(tmdbId)]);
            const isOnPlex = !!plexMedia;

            const regularServer = allCached.find(c => !c.is_4k || c.is_4k === 0);
            const fourKServer = allCached.find(c => c.is_4k === 1);

            const getShowStatus = (cached, plexAvailable = false) => {
                if (!cached && !plexAvailable) return null;
                if (!cached && plexAvailable) {
                    // Show is on Plex but not in Sonarr cache
                    return {
                        monitoring: false,
                        hasFile: true,
                        hasFiles: true,
                        serverName: 'Plex',
                        status: 'downloaded',
                        totalEpisodes: 0,
                        downloadedEpisodes: 0,
                        monitored: false
                    };
                }
                const totalEpisodes = cached.total_episodes || 0;
                const downloadedEpisodes = cached.episode_file_count || 0;
                // If on Plex, treat as having files even if Sonarr hasn't synced
                const hasFiles = downloadedEpisodes > 0 || plexAvailable;
                const hasAllEpisodes = (totalEpisodes > 0 && downloadedEpisodes >= totalEpisodes) || plexAvailable;
                return {
                    monitoring: true,
                    hasFile: hasAllEpisodes,
                    hasFiles: hasFiles,
                    serverName: cached.server_name,
                    status: hasAllEpisodes ? 'downloaded' : (hasFiles ? 'partial' : 'processing'),
                    totalEpisodes,
                    downloadedEpisodes,
                    monitored: cached.monitored === 1
                };
            };

            const result = {
                monitoring: allCached.length > 0,
                regular: getShowStatus(regularServer, isOnPlex),
                fourK: getShowStatus(fourKServer, false),
                // Legacy fields for backward compatibility
                hasFile: regularServer?.episode_file_count >= regularServer?.total_episodes ||
                         fourKServer?.episode_file_count >= fourKServer?.total_episodes || isOnPlex,
                serverName: regularServer?.server_name || fourKServer?.server_name || (isOnPlex ? 'Plex' : null),
                status: allCached.length > 0 ? 'processing' : null,
                onPlex: isOnPlex
            };

            return res.json(result);
        }

        res.json({ monitoring: false });

    } catch (error) {
        console.error('[Request Site] Failed to check monitoring status:', error);
        res.status(500).json({ error: 'Failed to check monitoring status' });
    }
});

// ============ Helper Functions ============

/**
 * Fetch Rotten Tomatoes ratings using Algolia API (RT's internal search)
 * Improved matching logic for better coverage
 */
async function fetchRottenTomatoesRatings(title, year) {
    try {
        const axios = require('axios');

        // Clean title for better matching - remove articles and special chars
        const cleanTitle = title
            .replace(/\bthe\b ?/gi, '')
            .replace(/[:\-–—]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const response = await axios.post('https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries', {
            requests: [{
                indexName: 'content_rt',
                query: cleanTitle,
                params: `filters=${encodeURIComponent('isEmsSearchable=1 AND type:"movie"')}&hitsPerPage=30`
            }]
        }, {
            headers: {
                'X-Algolia-API-Key': '175588f6e5f8319b27702e4cc4013561',
                'X-Algolia-Application-Id': '79FRDP12PN'
            },
            timeout: 5000
        });

        const hits = response.data.results[0].hits || [];
        if (hits.length === 0) return null;

        // Find best match: prioritize year match + has ratings
        let bestMatch = null;

        // First pass: exact year match with ratings
        for (const hit of hits) {
            if (hit.rottenTomatoes && (hit.releaseYear === year || Math.abs(hit.releaseYear - year) <= 1)) {
                if (hit.rottenTomatoes.criticsScore !== null || hit.rottenTomatoes.audienceScore !== null) {
                    bestMatch = hit;
                    break;
                }
            }
        }

        // Second pass: any year with ratings
        if (!bestMatch) {
            for (const hit of hits) {
                if (hit.rottenTomatoes && (hit.rottenTomatoes.criticsScore !== null || hit.rottenTomatoes.audienceScore !== null)) {
                    bestMatch = hit;
                    break;
                }
            }
        }

        if (!bestMatch || !bestMatch.rottenTomatoes) return null;

        const rt = bestMatch.rottenTomatoes;
        return {
            title: bestMatch.title,
            url: `https://www.rottentomatoes.com/m/${bestMatch.vanity}`,
            criticsScore: rt.criticsScore,
            criticsRating: rt.certifiedFresh ? 'Certified Fresh' : (rt.criticsScore >= 60 ? 'Fresh' : 'Rotten'),
            audienceScore: rt.audienceScore,
            audienceRating: rt.audienceScore >= 60 ? 'Upright' : 'Spilled'
        };

    } catch (error) {
        // Silently fail - RT is optional
        return null;
    }
}

/**
 * Fetch Rotten Tomatoes ratings for TV shows using Algolia API
 * Improved matching logic for better coverage
 */
async function fetchRottenTomatoesRatingsTV(title, year) {
    try {
        const axios = require('axios');

        // Clean title for better matching
        const cleanTitle = title
            .replace(/\bthe\b ?/gi, '')
            .replace(/[:\-–—]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const response = await axios.post('https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries', {
            requests: [{
                indexName: 'content_rt',
                query: cleanTitle,
                params: `filters=${encodeURIComponent('isEmsSearchable=1 AND type:"tv"')}&hitsPerPage=30`
            }]
        }, {
            headers: {
                'X-Algolia-API-Key': '175588f6e5f8319b27702e4cc4013561',
                'X-Algolia-Application-Id': '79FRDP12PN'
            },
            timeout: 5000
        });

        const hits = response.data.results[0].hits || [];
        if (hits.length === 0) return null;

        // Find best match: prioritize year match + has ratings
        let bestMatch = null;

        // First pass: exact year match with ratings
        for (const hit of hits) {
            if (hit.rottenTomatoes && (hit.releaseYear === year || Math.abs(hit.releaseYear - year) <= 1)) {
                if (hit.rottenTomatoes.criticsScore !== null || hit.rottenTomatoes.audienceScore !== null) {
                    bestMatch = hit;
                    break;
                }
            }
        }

        // Second pass: any year with ratings
        if (!bestMatch) {
            for (const hit of hits) {
                if (hit.rottenTomatoes && (hit.rottenTomatoes.criticsScore !== null || hit.rottenTomatoes.audienceScore !== null)) {
                    bestMatch = hit;
                    break;
                }
            }
        }

        if (!bestMatch || !bestMatch.rottenTomatoes) return null;

        const rt = bestMatch.rottenTomatoes;
        return {
            title: bestMatch.title,
            url: `https://www.rottentomatoes.com/tv/${bestMatch.vanity}`,
            criticsScore: rt.criticsScore,
            criticsRating: rt.certifiedFresh ? 'Certified Fresh' : (rt.criticsScore >= 60 ? 'Fresh' : 'Rotten'),
            audienceScore: rt.audienceScore,
            audienceRating: rt.audienceScore >= 60 ? 'Upright' : 'Spilled'
        };

    } catch (error) {
        // Silently fail - RT is optional
        return null;
    }
}

/**
 * Fetch IMDb rating using multiple sources with fallback
 * 1. First try Radarr's public proxy API (fast, no API key needed)
 * 2. Fall back to OMDb API if available (more reliable coverage)
 */
async function fetchIMDbRating(imdbId) {
    const axios = require('axios');

    // Try Radarr proxy first (no API key needed)
    try {
        const response = await axios.get(`https://api.radarr.video/v1/movie/imdb/${imdbId}`, {
            timeout: 3000
        });

        const data = response.data;
        if (data && data.length > 0 && data[0].MovieRatings?.Imdb?.Value) {
            return {
                title: data[0].Title,
                url: `https://www.imdb.com/title/${data[0].ImdbId}`,
                criticsScore: data[0].MovieRatings.Imdb.Value
            };
        }
    } catch (error) {
        // Silently continue to fallback
    }

    // Fallback to OMDb API (requires API key in settings)
    try {
        const omdbKey = await dbGet(`SELECT setting_value FROM request_settings WHERE setting_key = 'omdb_api_key'`);

        if (omdbKey?.setting_value) {
            const omdbResponse = await axios.get(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey.setting_value}`, {
                timeout: 3000
            });

            if (omdbResponse.data && omdbResponse.data.imdbRating && omdbResponse.data.imdbRating !== 'N/A') {
                return {
                    title: omdbResponse.data.Title,
                    url: `https://www.imdb.com/title/${imdbId}`,
                    criticsScore: parseFloat(omdbResponse.data.imdbRating)
                };
            }
        }
    } catch (error) {
        // Silently fail
    }

    return null;
}

/**
 * POST /api/v2/request-site/sync-availability
 * Sync media_requests status with Radarr/Sonarr download status
 */
router.post('/sync-availability', async (req, res) => {
    try {
        let updated = 0;

        // Get all media_requests in 'processing' or 'approved' status
        const pendingRequests = await dbAll(`
            SELECT id, tmdb_id, media_type, title, status
            FROM media_requests
            WHERE status IN ('processing', 'approved')
        `);

        for (const request of pendingRequests) {
            let isAvailable = false;

            if (request.media_type === 'movie') {
                // Check Radarr cache
                const radarrEntry = await dbGet(`
                    SELECT * FROM radarr_library_cache WHERE tmdb_id = $1 AND has_file = 1
                `, [request.tmdb_id]);
                isAvailable = !!radarrEntry;
            } else if (request.media_type === 'tv') {
                // Check Sonarr cache
                const sonarrEntry = await dbGet(`
                    SELECT * FROM sonarr_library_cache WHERE tmdb_id = $1 AND episode_file_count > 0
                `, [request.tmdb_id]);
                isAvailable = !!sonarrEntry;
            }

            if (isAvailable) {
                await dbRun(`
                    UPDATE media_requests SET status = 'available', available_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [request.id]);
                updated++;
                console.log(`[Availability Sync] ${request.title} (TMDB ${request.tmdb_id}) marked as available`);
            }
        }

        res.json({ success: true, checked: pendingRequests.length, updated });
    } catch (error) {
        console.error('[Availability Sync] Error:', error);
        res.status(500).json({ error: 'Failed to sync availability' });
    }
});

// ============ Permission Routes ============

/**
 * Get effective permissions for a user (merges defaults with overrides)
 * Falls back to request_settings table for limits if not set in permissions table
 * NOTE: This is the exported version - uses the internal async version
 */
async function getUserPermissions(userId) {
    return await getUserPermissionsInternal(userId);
}

/**
 * GET /api/v2/request-site/permissions/defaults
 * Get default permission settings
 */
router.get('/permissions/defaults', async (req, res) => {
    try {
        let defaults = await dbGet('SELECT * FROM request_default_permissions WHERE id = $1', [1]);

        // If no defaults exist, return sensible defaults
        if (!defaults) {
            defaults = {
                can_request_movies: 1,
                can_request_tv: 1,
                can_request_4k: 0,
                can_request_4k_movie: 0,
                can_request_4k_tv: 0,
                auto_approve_movies: 0,
                auto_approve_tv: 0,
                movie_limit_per_week: 0,
                movie_limit_days: 7,
                tv_limit_per_week: 0,
                tv_show_limit: 0,
                tv_show_limit_days: 7,
                tv_season_limit: 0,
                tv_season_limit_days: 7
            };
        }

        res.json(defaults);
    } catch (error) {
        console.error('[Request Site] Failed to get default permissions:', error);
        res.status(500).json({ error: 'Failed to get default permissions' });
    }
});

/**
 * PUT /api/v2/request-site/permissions/defaults
 * Update default permission settings
 */
router.put('/permissions/defaults', async (req, res) => {
    try {
        const {
            can_request_movies,
            can_request_tv,
            can_request_4k,
            can_request_4k_movie,
            can_request_4k_tv,
            auto_approve_movies,
            auto_approve_tv,
            movie_limit_per_week,
            movie_limit_days,
            tv_limit_per_week,
            tv_show_limit,
            tv_show_limit_days,
            tv_season_limit,
            tv_season_limit_days
        } = req.body;

        await dbRun(`
            INSERT INTO request_default_permissions (
                id, can_request_movies, can_request_tv, can_request_4k, can_request_4k_movie, can_request_4k_tv,
                auto_approve_movies, auto_approve_tv, movie_limit_per_week, movie_limit_days,
                tv_limit_per_week, tv_show_limit, tv_show_limit_days, tv_season_limit, tv_season_limit_days, updated_at
            ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                can_request_movies = $1,
                can_request_tv = $2,
                can_request_4k = $3,
                can_request_4k_movie = $4,
                can_request_4k_tv = $5,
                auto_approve_movies = $6,
                auto_approve_tv = $7,
                movie_limit_per_week = $8,
                movie_limit_days = $9,
                tv_limit_per_week = $10,
                tv_show_limit = $11,
                tv_show_limit_days = $12,
                tv_season_limit = $13,
                tv_season_limit_days = $14,
                updated_at = CURRENT_TIMESTAMP
        `, [
            can_request_movies ? 1 : 0,
            can_request_tv ? 1 : 0,
            can_request_4k ? 1 : 0,
            can_request_4k_movie ? 1 : 0,
            can_request_4k_tv ? 1 : 0,
            auto_approve_movies ? 1 : 0,
            auto_approve_tv ? 1 : 0,
            movie_limit_per_week || 0,
            movie_limit_days || 7,
            tv_limit_per_week || 0,
            tv_show_limit || 0,
            tv_show_limit_days || 7,
            tv_season_limit || 0,
            tv_season_limit_days || 7
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to update default permissions:', error);
        res.status(500).json({ error: 'Failed to update default permissions' });
    }
});

/**
 * GET /api/v2/request-site/permissions/users
 * Get all users with Request Site access (admins + users with Plex access)
 */
router.get('/permissions/users', async (req, res) => {
    try {
        const { filter } = req.query; // 'all', 'overrides'

        // Get all users who have Request Site access OR are admins
        // users table has plex_enabled, rs_has_access, and role columns
        // rs_has_access: NULL = auto (based on plex_enabled), 1 = explicitly enabled, 0 = explicitly disabled
        const users = await dbAll(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.plex_username,
                u.role,
                u.created_at,
                p.has_custom_permissions,
                p.can_request_movies,
                p.can_request_tv,
                p.can_request_4k,
                p.can_request_4k_movie,
                p.can_request_4k_tv,
                p.auto_approve_movies,
                p.auto_approve_tv,
                p.movie_limit_per_week,
                p.movie_limit_days,
                p.tv_limit_per_week,
                p.tv_show_limit,
                p.tv_show_limit_days,
                p.tv_season_limit,
                p.tv_season_limit_days,
                p.can_approve_movies,
                p.can_approve_tv,
                p.can_approve_4k_movies,
                p.can_approve_4k_tv
            FROM users u
            LEFT JOIN request_user_permissions p ON p.user_id = u.id
            WHERE u.role = 'admin'
               OR u.rs_has_access = 1
               OR (u.rs_has_access IS NULL AND u.plex_enabled = 1)
            ORDER BY u.name
        `);

        // Get default permissions for comparison
        const defaults = await dbGet('SELECT * FROM request_default_permissions WHERE id = 1') || {
            can_request_movies: 1,
            can_request_tv: 1,
            can_request_4k: 0,
            can_request_4k_movie: 0,
            can_request_4k_tv: 0,
            auto_approve_movies: 0,
            auto_approve_tv: 0,
            movie_limit_per_week: 0,
            movie_limit_days: 7,
            tv_limit_per_week: 0,
            tv_show_limit: 0,
            tv_show_limit_days: 7,
            tv_season_limit: 0,
            tv_season_limit_days: 7
        };

        // Process users and add effective permissions
        let processedUsers = users.map(user => ({
            id: user.id,
            name: user.name || user.plex_username || 'Unknown',
            email: user.email,
            plex_username: user.plex_username,
            role: user.role,
            created_at: user.created_at,
            has_custom_permissions: user.has_custom_permissions === 1,
            permissions: {
                can_request_movies: user.has_custom_permissions ? user.can_request_movies : defaults.can_request_movies,
                can_request_tv: user.has_custom_permissions ? user.can_request_tv : defaults.can_request_tv,
                can_request_4k: user.has_custom_permissions ? user.can_request_4k : defaults.can_request_4k,
                can_request_4k_movie: user.has_custom_permissions ? user.can_request_4k_movie : defaults.can_request_4k_movie,
                can_request_4k_tv: user.has_custom_permissions ? user.can_request_4k_tv : defaults.can_request_4k_tv,
                auto_approve_movies: user.has_custom_permissions ? user.auto_approve_movies : defaults.auto_approve_movies,
                auto_approve_tv: user.has_custom_permissions ? user.auto_approve_tv : defaults.auto_approve_tv,
                movie_limit_per_week: user.has_custom_permissions ? user.movie_limit_per_week : defaults.movie_limit_per_week,
                movie_limit_days: user.has_custom_permissions ? (user.movie_limit_days || 7) : (defaults.movie_limit_days || 7),
                tv_limit_per_week: user.has_custom_permissions ? user.tv_limit_per_week : defaults.tv_limit_per_week,
                tv_show_limit: user.has_custom_permissions ? (user.tv_show_limit || 0) : (defaults.tv_show_limit || 0),
                tv_show_limit_days: user.has_custom_permissions ? (user.tv_show_limit_days || 7) : (defaults.tv_show_limit_days || 7),
                tv_season_limit: user.has_custom_permissions ? (user.tv_season_limit || 0) : (defaults.tv_season_limit || 0),
                tv_season_limit_days: user.has_custom_permissions ? (user.tv_season_limit_days || 7) : (defaults.tv_season_limit_days || 7),
                // Approval rights (only from user permissions, not defaults - defaults have no approval rights)
                can_approve_movies: user.can_approve_movies || 0,
                can_approve_tv: user.can_approve_tv || 0,
                can_approve_4k_movies: user.can_approve_4k_movies || 0,
                can_approve_4k_tv: user.can_approve_4k_tv || 0
            }
        }));

        // Filter if requested
        if (filter === 'overrides') {
            processedUsers = processedUsers.filter(u => u.has_custom_permissions);
        }

        res.json({
            users: processedUsers,
            defaults,
            total: processedUsers.length,
            withOverrides: processedUsers.filter(u => u.has_custom_permissions).length
        });
    } catch (error) {
        console.error('[Request Site] Failed to get users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

/**
 * GET /api/v2/request-site/permissions/users/:userId
 * Get permissions for a specific user
 */
router.get('/permissions/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const permissions = await getUserPermissions(parseInt(userId));
        res.json(permissions);
    } catch (error) {
        console.error('[Request Site] Failed to get user permissions:', error);
        res.status(500).json({ error: 'Failed to get user permissions' });
    }
});

/**
 * PUT /api/v2/request-site/permissions/users/:userId
 * Update permissions for a specific user
 */
router.put('/permissions/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const {
        has_custom_permissions,
        can_request_movies,
        can_request_tv,
        can_request_4k,
        can_request_4k_movie,
        can_request_4k_tv,
        auto_approve_movies,
        auto_approve_tv,
        movie_limit_per_week,
        movie_limit_days,
        tv_limit_per_week,
        tv_show_limit,
        tv_show_limit_days,
        tv_season_limit,
        tv_season_limit_days,
        // 4K limits
        movie_4k_limit,
        movie_4k_limit_days,
        tv_show_4k_limit,
        tv_show_4k_limit_days,
        tv_season_4k_limit,
        tv_season_4k_limit_days,
        // Approval rights
        can_approve_movies,
        can_approve_tv,
        can_approve_4k_movies,
        can_approve_4k_tv
    } = req.body;

    try {
        // If clearing custom permissions, delete the row
        if (!has_custom_permissions) {
            await dbRun('DELETE FROM request_user_permissions WHERE user_id = $1', [parseInt(userId)]);
            return res.json({ success: true, message: 'User reset to defaults' });
        }

        // Upsert user permissions
        await dbRun(`
            INSERT INTO request_user_permissions (
                user_id, has_custom_permissions, can_request_movies, can_request_tv, can_request_4k,
                can_request_4k_movie, can_request_4k_tv,
                auto_approve_movies, auto_approve_tv, movie_limit_per_week, movie_limit_days,
                tv_limit_per_week, tv_show_limit, tv_show_limit_days, tv_season_limit, tv_season_limit_days,
                movie_4k_limit, movie_4k_limit_days, tv_show_4k_limit, tv_show_4k_limit_days, tv_season_4k_limit, tv_season_4k_limit_days,
                can_approve_movies, can_approve_tv, can_approve_4k_movies, can_approve_4k_tv,
                updated_at
            ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                has_custom_permissions = 1,
                can_request_movies = $2,
                can_request_tv = $3,
                can_request_4k = $4,
                can_request_4k_movie = $5,
                can_request_4k_tv = $6,
                auto_approve_movies = $7,
                auto_approve_tv = $8,
                movie_limit_per_week = $9,
                movie_limit_days = $10,
                tv_limit_per_week = $11,
                tv_show_limit = $12,
                tv_show_limit_days = $13,
                tv_season_limit = $14,
                tv_season_limit_days = $15,
                movie_4k_limit = $16,
                movie_4k_limit_days = $17,
                tv_show_4k_limit = $18,
                tv_show_4k_limit_days = $19,
                tv_season_4k_limit = $20,
                tv_season_4k_limit_days = $21,
                can_approve_movies = $22,
                can_approve_tv = $23,
                can_approve_4k_movies = $24,
                can_approve_4k_tv = $25,
                updated_at = CURRENT_TIMESTAMP
        `, [
            parseInt(userId),
            can_request_movies ? 1 : 0,
            can_request_tv ? 1 : 0,
            can_request_4k ? 1 : 0,
            can_request_4k_movie ? 1 : 0,
            can_request_4k_tv ? 1 : 0,
            auto_approve_movies ? 1 : 0,
            auto_approve_tv ? 1 : 0,
            movie_limit_per_week || 0,
            movie_limit_days || 7,
            tv_limit_per_week || 0,
            tv_show_limit || 0,
            tv_show_limit_days || 7,
            tv_season_limit || 0,
            tv_season_limit_days || 7,
            movie_4k_limit || 0,
            movie_4k_limit_days || 7,
            tv_show_4k_limit || 0,
            tv_show_4k_limit_days || 7,
            tv_season_4k_limit || 0,
            tv_season_4k_limit_days || 7,
            can_approve_movies ? 1 : 0,
            can_approve_tv ? 1 : 0,
            can_approve_4k_movies ? 1 : 0,
            can_approve_4k_tv ? 1 : 0
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[Request Site] Failed to update user permissions:', error);
        res.status(500).json({ error: 'Failed to update user permissions' });
    }
});

/**
 * DELETE /api/v2/request-site/permissions/users/:userId
 * Reset a user's permissions to defaults
 */
router.delete('/permissions/users/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        await dbRun('DELETE FROM request_user_permissions WHERE user_id = $1', [parseInt(userId)]);
        res.json({ success: true, message: 'User permissions reset to defaults' });
    } catch (error) {
        console.error('[Request Site] Failed to reset user permissions:', error);
        res.status(500).json({ error: 'Failed to reset user permissions' });
    }
});

/**
 * GET /api/v2/request-site/permissions/my
 * Get the current user's permissions (for portal users)
 */
router.get('/permissions/my', async (req, res) => {
    try {
        // Get user ID from session (portal auth)
        const userId = req.session?.portalUserId || req.session?.userId;

        if (!userId) {
            // If no user, return defaults
            const permissions = await getUserPermissions(null);
            return res.json(permissions);
        }

        const permissions = await getUserPermissions(userId);
        res.json(permissions);
    } catch (error) {
        console.error('[Request Site] Failed to get my permissions:', error);
        res.status(500).json({ error: 'Failed to get permissions' });
    }
});

/**
 * GET /api/v2/request-site/auth/me
 * Get current user info and permissions (for portal frontend)
 */
router.get('/auth/me', async (req, res) => {
    try {
        // Get token from Authorization header or session
        const token = req.headers.authorization?.replace('Bearer ', '');
        let userId = req.session?.portalUserId || req.session?.userId;

        // If no session, try portal_sessions table with token
        if (!userId && token) {
            const session = await dbGet(`
                SELECT user_id FROM portal_sessions
                WHERE token = $1 AND expires_at > NOW()
            `, [token]);

            if (session) {
                userId = session.user_id;
            }
        }

        // Also try admin sessions table
        if (!userId && token) {
            const session = await dbGet(`
                SELECT user_id FROM sessions
                WHERE session_token = $1 AND expires_at > NOW()
            `, [token]);

            if (session) {
                userId = session.user_id;
            }
        }

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Get user info
        const user = await dbGet('SELECT id, name, email, plex_username, role FROM users WHERE id = $1', [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get permissions
        const permissions = await getUserPermissions(userId);

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            plexUsername: user.plex_username,
            role: user.role,
            permissions: permissions
        });
    } catch (error) {
        console.error('[Request Site] Failed to get auth/me:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

/**
 * GET /api/v2/request-site/my-requests
 * Get requests for the current user only (for end users)
 */
router.get('/my-requests', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        // Get user ID from session
        const userId = req.session?.portalUserId || req.session?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Get user from users table
        const user = await dbGet('SELECT id, name, plex_username FROM users WHERE id = $1', [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Build query for user's requests only - use parameterized query
        let paramIndex = 1;
        const params = [userId];
        let query = `SELECT * FROM media_requests WHERE user_id = $${paramIndex++}`;

        if (status && status !== 'all') {
            query += ` AND status = $${paramIndex++}`;
            params.push(status);
        }

        query += ' ORDER BY requested_at DESC';

        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), offset);

        const requests = await dbAll(query, params);

        // Get total count for pagination
        let countParamIndex = 1;
        const countParams = [userId];
        let countQuery = `SELECT COUNT(*) as count FROM media_requests WHERE user_id = $${countParamIndex++}`;
        if (status && status !== 'all') {
            countQuery += ` AND status = $${countParamIndex++}`;
            countParams.push(status);
        }
        const totalResult = await dbGet(countQuery, countParams);
        const total = parseInt(totalResult.count);

        res.json({
            requests,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[Request Site] Failed to get my requests:', error);
        res.status(500).json({ error: 'Failed to get requests' });
    }
});

/**
 * GET /api/v2/request-site/my-usage
 * Get current user's request usage stats against their limits
 */
router.get('/my-usage', async (req, res) => {
    try {
        // Get token from Authorization header or session
        const token = req.headers.authorization?.replace('Bearer ', '');
        let userId = req.session?.portalUserId || req.session?.userId;

        // If no session, try portal_sessions table with token
        if (!userId && token) {
            const session = await dbGet(`
                SELECT user_id FROM portal_sessions
                WHERE token = $1 AND expires_at > NOW()
            `, [token]);

            if (session) {
                userId = session.user_id;
            }
        }

        // Also try admin sessions table
        if (!userId && token) {
            const session = await dbGet(`
                SELECT user_id FROM sessions
                WHERE session_token = $1 AND expires_at > NOW()
            `, [token]);

            if (session) {
                userId = session.user_id;
            }
        }

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Get user's permissions (includes limits)
        const permissions = await getUserPermissions(userId);

        // Calculate usage for each limit type
        const now = Date.now();

        // Movie usage (non-4K)
        const movieLimitDays = permissions.movie_limit_days || 7;
        const movieCutoff = new Date(now - movieLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const movieUsage = await dbGet(`
            SELECT COUNT(*) as count FROM media_requests
            WHERE user_id = $1 AND media_type = 'movie' AND (is_4k = 0 OR is_4k IS NULL) AND requested_at > $2
        `, [userId, movieCutoff]);

        // TV Show usage (non-4K, unique shows, not seasons)
        const tvShowLimitDays = permissions.tv_show_limit_days || 7;
        const tvShowCutoff = new Date(now - tvShowLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const tvShowUsage = await dbGet(`
            SELECT COUNT(*) as count FROM media_requests
            WHERE user_id = $1 AND media_type = 'tv' AND (is_4k = 0 OR is_4k IS NULL) AND requested_at > $2
        `, [userId, tvShowCutoff]);

        // TV Season usage (non-4K, total seasons across all shows)
        const tvSeasonLimitDays = permissions.tv_season_limit_days || 7;
        const tvSeasonCutoff = new Date(now - tvSeasonLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const tvRequests = await dbAll(`
            SELECT seasons FROM media_requests
            WHERE user_id = $1 AND media_type = 'tv' AND (is_4k = 0 OR is_4k IS NULL) AND requested_at > $2
        `, [userId, tvSeasonCutoff]);

        let totalSeasons = 0;
        for (const req of tvRequests) {
            if (req.seasons) {
                try {
                    const parsed = JSON.parse(req.seasons);
                    totalSeasons += Array.isArray(parsed) ? parsed.length : 1;
                } catch {
                    totalSeasons += 1;
                }
            }
        }

        // 4K Movie usage
        const movie4kLimitDays = permissions.movie_4k_limit_days || 7;
        const movie4kCutoff = new Date(now - movie4kLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const movie4kUsage = await dbGet(`
            SELECT COUNT(*) as count FROM media_requests
            WHERE user_id = $1 AND media_type = 'movie' AND is_4k = 1 AND requested_at > $2
        `, [userId, movie4kCutoff]);

        // 4K TV Show usage
        const tvShow4kLimitDays = permissions.tv_show_4k_limit_days || 7;
        const tvShow4kCutoff = new Date(now - tvShow4kLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const tvShow4kUsage = await dbGet(`
            SELECT COUNT(*) as count FROM media_requests
            WHERE user_id = $1 AND media_type = 'tv' AND is_4k = 1 AND requested_at > $2
        `, [userId, tvShow4kCutoff]);

        // 4K TV Season usage
        const tvSeason4kLimitDays = permissions.tv_season_4k_limit_days || 7;
        const tvSeason4kCutoff = new Date(now - tvSeason4kLimitDays * 24 * 60 * 60 * 1000).toISOString();
        const tv4kRequests = await dbAll(`
            SELECT seasons FROM media_requests
            WHERE user_id = $1 AND media_type = 'tv' AND is_4k = 1 AND requested_at > $2
        `, [userId, tvSeason4kCutoff]);

        let total4kSeasons = 0;
        for (const req of tv4kRequests) {
            if (req.seasons) {
                try {
                    const parsed = JSON.parse(req.seasons);
                    total4kSeasons += Array.isArray(parsed) ? parsed.length : 1;
                } catch {
                    total4kSeasons += 1;
                }
            }
        }

        res.json({
            movies: {
                used: parseInt(movieUsage.count),
                limit: permissions.movie_limit_per_week || 0,
                days: movieLimitDays,
                unlimited: !permissions.movie_limit_per_week
            },
            tvShows: {
                used: parseInt(tvShowUsage.count),
                limit: permissions.tv_show_limit || 0,
                days: tvShowLimitDays,
                unlimited: !permissions.tv_show_limit
            },
            tvSeasons: {
                used: totalSeasons,
                limit: permissions.tv_season_limit || 0,
                days: tvSeasonLimitDays,
                unlimited: !permissions.tv_season_limit
            },
            movies4k: {
                used: parseInt(movie4kUsage.count),
                limit: permissions.movie_4k_limit || 0,
                days: movie4kLimitDays,
                unlimited: !permissions.movie_4k_limit
            },
            tvShows4k: {
                used: parseInt(tvShow4kUsage.count),
                limit: permissions.tv_show_4k_limit || 0,
                days: tvShow4kLimitDays,
                unlimited: !permissions.tv_show_4k_limit
            },
            tvSeasons4k: {
                used: total4kSeasons,
                limit: permissions.tv_season_4k_limit || 0,
                days: tvSeason4kLimitDays,
                unlimited: !permissions.tv_season_4k_limit
            },
            permissions: {
                can_request_movies: permissions.can_request_movies,
                can_request_tv: permissions.can_request_tv,
                can_request_4k_movie: permissions.can_request_4k_movie,
                can_request_4k_tv: permissions.can_request_4k_tv
            }
        });
    } catch (error) {
        console.error('[Request Site] Failed to get my usage:', error);
        res.status(500).json({ error: 'Failed to get usage' });
    }
});

// ============ Admin Media Management Routes ============

/**
 * Ensure blocked_media table exists (handled by migrations in PostgreSQL)
 */
async function ensureBlockedMediaTable() {
    // Table creation is handled by migrations - this is a no-op for PostgreSQL
    // Kept for backward compatibility with existing code structure
}

/**
 * GET /api/v2/request-site/media/:type/:id/blocked
 * Check if media is blocked from requests
 */
router.get('/media/:type/:id/blocked', async (req, res) => {
    try {
        await ensureBlockedMediaTable();
        const { type, id } = req.params;

        const blocked = await dbGet(`
            SELECT * FROM blocked_media WHERE tmdb_id = $1 AND media_type = $2
        `, [parseInt(id), type]);

        res.json({
            blocked: !!blocked,
            blockedAt: blocked?.created_at,
            reason: blocked?.blocked_reason
        });
    } catch (error) {
        console.error('[Request Site] Failed to check blocked status:', error);
        res.status(500).json({ error: 'Failed to check blocked status' });
    }
});

/**
 * POST /api/v2/request-site/media/:type/:id/block
 * Block media from being requested (admin only)
 */
router.post('/media/:type/:id/block', async (req, res) => {
    try {
        await ensureBlockedMediaTable();
        const { type, id } = req.params;
        const { title, poster_path, reason } = req.body;
        const adminId = req.user?.id;

        await dbRun(`
            INSERT INTO blocked_media (tmdb_id, media_type, title, poster_path, blocked_by, blocked_reason, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (tmdb_id, media_type) DO UPDATE SET
                title = $3, poster_path = $4, blocked_by = $5, blocked_reason = $6, created_at = CURRENT_TIMESTAMP
        `, [parseInt(id), type, title, poster_path, adminId, reason || null]);

        console.log(`[Request Site] Media blocked: ${title} (TMDB ${id}, ${type})`);
        res.json({ success: true, message: 'Media blocked successfully' });
    } catch (error) {
        console.error('[Request Site] Failed to block media:', error);
        res.status(500).json({ error: 'Failed to block media' });
    }
});

/**
 * DELETE /api/v2/request-site/media/:type/:id/block
 * Unblock media (admin only)
 */
router.delete('/media/:type/:id/block', async (req, res) => {
    try {
        await ensureBlockedMediaTable();
        const { type, id } = req.params;

        await dbRun(`
            DELETE FROM blocked_media WHERE tmdb_id = $1 AND media_type = $2
        `, [parseInt(id), type]);

        console.log(`[Request Site] Media unblocked: TMDB ${id}, ${type}`);
        res.json({ success: true, message: 'Media unblocked successfully' });
    } catch (error) {
        console.error('[Request Site] Failed to unblock media:', error);
        res.status(500).json({ error: 'Failed to unblock media' });
    }
});

/**
 * DELETE /api/v2/request-site/media/:type/:id/clear-data
 * Clear all request data for a specific media item (admin only)
 * Removes all requests, making it appear as if it was never requested
 */
router.delete('/media/:type/:id/clear-data', async (req, res) => {
    try {
        const { type, id } = req.params;

        // Delete all requests for this media
        const result = await dbRun(`
            DELETE FROM media_requests WHERE tmdb_id = $1 AND media_type = $2
        `, [parseInt(id), type]);

        // Also clear from request_site_media cache if exists
        try {
            await dbRun(`
                DELETE FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2
            `, [parseInt(id), type]);
        } catch (e) {
            // Table might not exist, ignore
        }

        const deletedCount = result.rowCount || 0;
        console.log(`[Request Site] Cleared data for TMDB ${id} (${type}): ${deletedCount} requests deleted`);
        res.json({
            success: true,
            message: `Cleared ${deletedCount} request(s)`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('[Request Site] Failed to clear media data:', error);
        res.status(500).json({ error: 'Failed to clear media data' });
    }
});

/**
 * POST /api/v2/request-site/sync-deleted-media
 * Check for media that was deleted from Radarr/Sonarr and reset their request status
 * This makes previously "processing" content requestable again
 */
router.post('/sync-deleted-media', async (req, res) => {
    try {
        let resetCount = 0;

        // Get all media_requests in 'processing' or 'approved' status
        const processingRequests = await dbAll(`
            SELECT id, tmdb_id, media_type, title, status, is_4k
            FROM media_requests
            WHERE status IN ('processing', 'approved')
        `);

        for (const request of processingRequests) {
            let stillExists = false;

            if (request.media_type === 'movie') {
                // Check if movie is still in Radarr (either regular or 4K servers)
                const radarrEntry = await dbGet(`
                    SELECT * FROM radarr_library_cache WHERE tmdb_id = $1
                `, [request.tmdb_id]);
                stillExists = !!radarrEntry;
            } else if (request.media_type === 'tv') {
                // Check if TV show is still in Sonarr
                const sonarrEntry = await dbGet(`
                    SELECT * FROM sonarr_library_cache WHERE tmdb_id = $1
                `, [request.tmdb_id]);
                stillExists = !!sonarrEntry;
            }

            // If not in arr anymore, reset the request status to allow new requests
            if (!stillExists) {
                // Mark the existing request as "removed" so it doesn't block new requests
                await dbRun(`
                    UPDATE media_requests
                    SET status = 'removed', notes = 'Media was deleted from server'
                    WHERE id = $1
                `, [request.id]);
                resetCount++;
                console.log(`[Deleted Media Sync] Reset status for ${request.title} (TMDB ${request.tmdb_id}) - removed from server`);
            }
        }

        res.json({
            success: true,
            checked: processingRequests.length,
            reset: resetCount,
            message: `Checked ${processingRequests.length} requests, reset ${resetCount} that were deleted from servers`
        });
    } catch (error) {
        console.error('[Deleted Media Sync] Error:', error);
        res.status(500).json({ error: 'Failed to sync deleted media' });
    }
});

/**
 * GET /api/v2/request-site/blocked-media
 * Get list of all blocked media (admin only)
 */
router.get('/blocked-media', async (req, res) => {
    try {
        await ensureBlockedMediaTable();

        const blocked = await dbAll(`
            SELECT * FROM blocked_media ORDER BY created_at DESC
        `);

        res.json({ blocked });
    } catch (error) {
        console.error('[Request Site] Failed to get blocked media:', error);
        res.status(500).json({ error: 'Failed to get blocked media' });
    }
});

module.exports = router;
