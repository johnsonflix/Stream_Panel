/**
 * Request Site - Radarr/Sonarr Webhook Routes
 *
 * Handles webhooks from Radarr and Sonarr to immediately update
 * media availability when downloads complete.
 *
 * This provides INSTANT updates (like Seerr) instead of waiting for scheduled scans.
 *
 * Webhook events we handle:
 * - Radarr: "Download" (when movie is imported to library)
 * - Sonarr: "Download" (when episode is imported to library)
 *
 * Setup in Radarr/Sonarr:
 * Settings > Connect > Add > Webhook
 * URL: http://your-server:3050/api/v2/webhooks/radarr (or /sonarr)
 * Triggers: On Import (Download)
 */

const express = require('express');
const { query } = require('../database-config');
const router = express.Router();

// Media status enum (matches Seerr)
const MediaStatus = {
    UNKNOWN: 0,
    PENDING: 1,
    PROCESSING: 2,
    PARTIALLY_AVAILABLE: 3,
    AVAILABLE: 4,
    DELETED: 5
};

/**
 * POST /api/v2/webhooks/radarr - Handle Radarr webhooks
 *
 * Radarr webhook payload example (On Import event):
 * {
 *   "eventType": "Download",
 *   "movie": {
 *     "id": 123,
 *     "title": "The Matrix",
 *     "year": 1999,
 *     "tmdbId": 603
 *   },
 *   "movieFile": {
 *     "quality": "Bluray-1080p",
 *     "qualityVersion": 1,
 *     "releaseGroup": "SPARKS",
 *     "sceneName": "The.Matrix.1999.1080p.BluRay.x264-SPARKS"
 *   },
 *   "isUpgrade": false
 * }
 */
router.post('/radarr', async (req, res) => {
    try {
        const payload = req.body;

        console.log('[Radarr Webhook] Received:', payload.eventType);

        // Handle test webhook
        if (payload.eventType === 'Test') {
            console.log('[Radarr Webhook] Test webhook received successfully');
            return res.status(200).json({ success: true, message: 'Test webhook received' });
        }

        // Only process "Download" (Import) events
        if (payload.eventType !== 'Download') {
            return res.status(200).json({ success: true, message: 'Event ignored (not a download)' });
        }

        const { movie, movieFile } = payload;
        if (!movie || !movie.tmdbId) {
            console.error('[Radarr Webhook] Missing tmdbId in payload');
            return res.status(400).json({ success: false, message: 'Missing tmdbId' });
        }

        const tmdbId = movie.tmdbId;
        // Detect 4K from quality string or resolution
        const qualityStr = movieFile?.quality || '';
        const is4k = qualityStr.includes('4K') ||
                     qualityStr.includes('2160p') ||
                     (movieFile?.mediaInfo?.width >= 3840) ||
                     false;

        console.log(`[Radarr Webhook] Movie downloaded - TMDB ID: ${tmdbId}, Title: ${movie.title}, 4K: ${is4k}`);

        // Check if media record exists
        const mediaRecords = await query(
            'SELECT * FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, 'movie']
        );

        if (mediaRecords.length === 0) {
            // Create new media record - mark as AVAILABLE immediately since it's downloaded
            await query(`
                INSERT INTO request_site_media (
                    tmdb_id,
                    media_type,
                    status,
                    status_4k,
                    media_added_at,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [
                tmdbId,
                'movie',
                is4k ? MediaStatus.UNKNOWN : MediaStatus.AVAILABLE,
                is4k ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN
            ]);

            console.log(`[Radarr Webhook] Created new media record for ${movie.title} (TMDB ${tmdbId}) - AVAILABLE`);
        } else {
            // Update existing media record to AVAILABLE (download complete!)
            if (is4k) {
                await query(`
                    UPDATE request_site_media
                    SET status_4k = ?, media_added_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE tmdb_id = ? AND media_type = ?
                `, [MediaStatus.AVAILABLE, tmdbId, 'movie']);
            } else {
                await query(`
                    UPDATE request_site_media
                    SET status = ?, media_added_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE tmdb_id = ? AND media_type = ?
                `, [MediaStatus.AVAILABLE, tmdbId, 'movie']);
            }

            console.log(`[Radarr Webhook] Updated ${movie.title} (TMDB ${tmdbId}) to AVAILABLE`);
        }

        // Update related requests in request_site_requests to AVAILABLE
        const siteRequestsUpdated = await query(`
            UPDATE request_site_requests
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE media_id IN (SELECT id FROM request_site_media WHERE tmdb_id = ? AND media_type = ?)
            AND is_4k = ?
            AND status IN (1, 2)
        `, [MediaStatus.AVAILABLE, tmdbId, 'movie', is4k ? 1 : 0]);

        // Update related requests in media_requests table to 'available'
        const mediaRequestsUpdated = await query(`
            UPDATE media_requests
            SET status = 'available', available_at = CURRENT_TIMESTAMP
            WHERE tmdb_id = ? AND media_type = 'movie' AND status IN ('processing', 'approved')
        `, [tmdbId]);

        console.log(`[Radarr Webhook] Updated ${mediaRequestsUpdated.changes || 0} request(s) to available for ${movie.title}`);

        // Update Radarr library cache
        await query(`
            INSERT INTO radarr_library_cache (radarr_id, tmdb_id, imdb_id, title, year, has_file, quality, added_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(radarr_id) DO UPDATE SET
                has_file = 1,
                quality = excluded.quality,
                updated_at = CURRENT_TIMESTAMP
        `, [
            movie.id,
            tmdbId,
            movie.imdbId || null,
            movie.title,
            movie.year,
            qualityStr
        ]);

        res.status(200).json({
            success: true,
            message: `Movie ${movie.title} marked as available`,
            tmdbId
        });

    } catch (error) {
        console.error('[Radarr Webhook] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/v2/webhooks/sonarr - Handle Sonarr webhooks
 *
 * Sonarr webhook payload example (On Import event):
 * {
 *   "eventType": "Download",
 *   "series": {
 *     "id": 1,
 *     "title": "Breaking Bad",
 *     "tvdbId": 81189,
 *     "tmdbId": 1396
 *   },
 *   "episodes": [
 *     {
 *       "id": 123,
 *       "episodeNumber": 1,
 *       "seasonNumber": 1,
 *       "title": "Pilot"
 *     }
 *   ],
 *   "episodeFile": {
 *     "quality": "HDTV-720p",
 *     "qualityVersion": 1,
 *     "releaseGroup": "DIMENSION",
 *     "sceneName": "Breaking.Bad.S01E01.720p.HDTV.x264-DIMENSION"
 *   },
 *   "isUpgrade": false
 * }
 */
router.post('/sonarr', async (req, res) => {
    try {
        const payload = req.body;

        console.log('[Sonarr Webhook] Received:', payload.eventType);

        // Handle test webhook
        if (payload.eventType === 'Test') {
            console.log('[Sonarr Webhook] Test webhook received successfully');
            return res.status(200).json({ success: true, message: 'Test webhook received' });
        }

        // Only process "Download" (Import) events
        if (payload.eventType !== 'Download') {
            return res.status(200).json({ success: true, message: 'Event ignored (not a download)' });
        }

        const { series, episodes, episodeFile } = payload;
        if (!series) {
            console.error('[Sonarr Webhook] Missing series in payload');
            return res.status(400).json({ success: false, message: 'Missing series' });
        }

        // Get TMDB ID - Sonarr might provide it directly or we need to lookup from tvdbId
        let tmdbId = series.tmdbId;
        const tvdbId = series.tvdbId;

        // If no TMDB ID, try to look it up from TVDB ID
        if (!tmdbId && tvdbId) {
            // Check our cache first
            const cached = await query(
                'SELECT tmdb_id FROM plex_guid_cache WHERE tvdb_id = ? AND media_type = ? LIMIT 1',
                [tvdbId, 'tv']
            );

            if (cached.length > 0) {
                tmdbId = cached[0].tmdb_id;
            } else {
                // Check request_site_media
                const mediaByTvdb = await query(
                    'SELECT tmdb_id FROM request_site_media WHERE tvdb_id = ? AND media_type = ?',
                    [tvdbId, 'tv']
                );

                if (mediaByTvdb.length > 0) {
                    tmdbId = mediaByTvdb[0].tmdb_id;
                } else {
                    // Try TMDB API lookup
                    try {
                        const axios = require('axios');
                        const response = await axios.get(
                            `https://api.themoviedb.org/3/find/${tvdbId}`,
                            {
                                params: {
                                    api_key: '431a8708161bcd1f1fbe7536137e61ed',
                                    external_source: 'tvdb_id'
                                },
                                timeout: 10000
                            }
                        );

                        if (response.data?.tv_results?.length > 0) {
                            tmdbId = response.data.tv_results[0].id;
                            console.log(`[Sonarr Webhook] Found TMDB ID ${tmdbId} for TVDB ${tvdbId}`);
                        }
                    } catch (e) {
                        console.log(`[Sonarr Webhook] Could not lookup TMDB ID for TVDB ${tvdbId}`);
                    }
                }
            }
        }

        if (!tmdbId) {
            console.log(`[Sonarr Webhook] Could not find TMDB ID for ${series.title} (TVDB ${tvdbId})`);
            return res.json({ success: true, message: 'TMDB ID not found, skipping' });
        }

        // Detect 4K from quality string or resolution
        const qualityStr = episodeFile?.quality || '';
        const is4k = qualityStr.includes('4K') ||
                     qualityStr.includes('2160p') ||
                     (episodeFile?.mediaInfo?.width >= 3840) ||
                     false;

        // Extract unique season numbers from episodes array
        const seasonNumbers = [...new Set((episodes || []).map(ep => ep.seasonNumber))];

        console.log(`[Sonarr Webhook] Episodes downloaded - TMDB ID: ${tmdbId}, Title: ${series.title}, Seasons: ${seasonNumbers.join(', ')}, 4K: ${is4k}`);

        // Check if media record exists
        const mediaRecords = await query(
            'SELECT * FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, 'tv']
        );

        let mediaId;
        if (mediaRecords.length === 0) {
            // Create new media record - mark as PARTIALLY_AVAILABLE (we have some content)
            const result = await query(`
                INSERT INTO request_site_media (
                    tmdb_id,
                    tvdb_id,
                    imdb_id,
                    media_type,
                    status,
                    status_4k,
                    media_added_at,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [
                tmdbId,
                tvdbId || null,
                series.imdbId || null,
                'tv',
                is4k ? MediaStatus.UNKNOWN : MediaStatus.PARTIALLY_AVAILABLE,
                is4k ? MediaStatus.PARTIALLY_AVAILABLE : MediaStatus.UNKNOWN
            ]);

            mediaId = result.lastID;
            console.log(`[Sonarr Webhook] Created new media record for ${series.title} (TMDB ${tmdbId})`);
        } else {
            mediaId = mediaRecords[0].id;

            // Update media timestamp
            await query(`
                UPDATE request_site_media
                SET media_added_at = CURRENT_TIMESTAMP,
                    status = MAX(status, ?),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [MediaStatus.PARTIALLY_AVAILABLE, mediaId]);
        }

        // Update/create season records - mark as PARTIALLY_AVAILABLE (we have some episodes)
        for (const seasonNumber of seasonNumbers) {
            if (seasonNumber === 0) continue; // Skip specials

            await query(`
                INSERT INTO request_site_seasons (
                    media_id,
                    season_number,
                    status,
                    status_4k,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(media_id, season_number) DO UPDATE SET
                    status = MAX(status, excluded.status),
                    status_4k = MAX(status_4k, excluded.status_4k),
                    updated_at = CURRENT_TIMESTAMP
            `, [
                mediaId,
                seasonNumber,
                is4k ? MediaStatus.UNKNOWN : MediaStatus.PARTIALLY_AVAILABLE,
                is4k ? MediaStatus.PARTIALLY_AVAILABLE : MediaStatus.UNKNOWN
            ]);

            console.log(`[Sonarr Webhook] Updated season ${seasonNumber} to PARTIALLY_AVAILABLE`);
        }

        // Update media record's last_season_change timestamp
        await query(
            'UPDATE request_site_media SET last_season_change = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [mediaId]
        );

        // Update related requests in request_site_requests
        await query(`
            UPDATE request_site_requests
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE media_id = ?
            AND is_4k = ?
            AND status IN (1, 2)
        `, [MediaStatus.AVAILABLE, mediaId, is4k ? 1 : 0]);

        // Update related requests in media_requests table to 'available'
        const mediaRequestsUpdated = await query(`
            UPDATE media_requests
            SET status = 'available', available_at = CURRENT_TIMESTAMP
            WHERE tmdb_id = ? AND media_type = 'tv' AND status IN ('processing', 'approved')
        `, [tmdbId]);

        console.log(`[Sonarr Webhook] Updated ${mediaRequestsUpdated.changes || 0} request(s) to available for ${series.title}`);

        // Update Sonarr library cache
        await query(`
            INSERT INTO sonarr_library_cache (
                sonarr_id, tvdb_id, tmdb_id, imdb_id, title, year,
                total_episodes, episode_file_count, added_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(sonarr_id) DO UPDATE SET
                episode_file_count = episode_file_count + ?,
                updated_at = CURRENT_TIMESTAMP
        `, [
            series.id,
            tvdbId || null,
            tmdbId,
            series.imdbId || null,
            series.title,
            series.year,
            episodes?.length || 1,
            episodes?.length || 1
        ]);

        res.status(200).json({
            success: true,
            message: `TV show ${series.title} updated`,
            tmdbId,
            seasonsUpdated: seasonNumbers
        });

    } catch (error) {
        console.error('[Sonarr Webhook] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Test endpoint to verify webhook routes are working
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Request Site webhooks are active',
        endpoints: {
            radarr: '/api/v2/webhooks/radarr',
            sonarr: '/api/v2/webhooks/sonarr'
        }
    });
});

module.exports = router;
