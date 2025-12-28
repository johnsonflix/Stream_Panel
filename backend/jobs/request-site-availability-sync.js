/**
 * Request Site - Availability Sync Job
 *
 * Runs every 6 hours to check if media in PROCESSING status is now
 * available on Plex. This is the safety net for media added manually
 * outside of Radarr/Sonarr or when webhooks fail.
 *
 * Based on Seerr's availability sync pattern.
 */

const { query } = require('../database-config');
const axios = require('axios');
const { notifyUserMediaAvailable } = require('../services/request-site-notifications');
const { getMediaInfoFromTmdb } = require('../services/request-site-radarr-sonarr');

let isRunning = false;
let scheduledInterval = null;

/**
 * Get all configured Plex servers
 */
async function getPlexServers() {
    try {
        const servers = await query(
            'SELECT * FROM plex_servers WHERE is_active = 1'
        );
        return servers;
    } catch (error) {
        console.error('[Availability Sync] Error fetching Plex servers:', error);
        return [];
    }
}

/**
 * Check if a movie exists on Plex by TMDB ID
 * Returns: { exists: boolean, ratingKey: string|null, server_id: number|null }
 */
async function checkMovieOnPlex(tmdbId) {
    const servers = await getPlexServers();

    for (const server of servers) {
        try {
            const searchUrl = `${server.url}/search?query=tmdb://${tmdbId}&type=1`;

            const response = await axios.get(searchUrl, {
                headers: {
                    'X-Plex-Token': server.token,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data?.MediaContainer?.Metadata?.length > 0) {
                const movie = response.data.MediaContainer.Metadata[0];
                console.log(`[Availability Sync] Found movie TMDB ${tmdbId} on ${server.name} (ratingKey: ${movie.ratingKey})`);

                return {
                    exists: true,
                    ratingKey: movie.ratingKey,
                    serverId: server.id
                };
            }
        } catch (error) {
            console.error(`[Availability Sync] Error checking movie on ${server.name}:`, error.message);
        }
    }

    return { exists: false, ratingKey: null, serverId: null };
}

/**
 * Check if a TV show exists on Plex by TMDB ID
 * Returns: { exists: boolean, ratingKey: string|null, server_id: number|null, seasons: array }
 */
async function checkTVShowOnPlex(tmdbId) {
    const servers = await getPlexServers();

    for (const server of servers) {
        try {
            const searchUrl = `${server.url}/search?query=tmdb://${tmdbId}&type=2`;

            const response = await axios.get(searchUrl, {
                headers: {
                    'X-Plex-Token': server.token,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data?.MediaContainer?.Metadata?.length > 0) {
                const show = response.data.MediaContainer.Metadata[0];

                // Get seasons for this show
                const seasonsUrl = `${server.url}/library/metadata/${show.ratingKey}/children`;
                const seasonsResponse = await axios.get(seasonsUrl, {
                    headers: {
                        'X-Plex-Token': server.token,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });

                const seasons = seasonsResponse.data?.MediaContainer?.Metadata || [];
                const seasonNumbers = seasons.map(s => s.index).filter(n => n > 0); // Exclude specials (index 0)

                console.log(`[Availability Sync] Found TV show TMDB ${tmdbId} on ${server.name} (ratingKey: ${show.ratingKey}, seasons: ${seasonNumbers.join(', ')})`);

                return {
                    exists: true,
                    ratingKey: show.ratingKey,
                    serverId: server.id,
                    seasons: seasonNumbers
                };
            }
        } catch (error) {
            console.error(`[Availability Sync] Error checking TV show on ${server.name}:`, error.message);
        }
    }

    return { exists: false, ratingKey: null, serverId: null, seasons: [] };
}

/**
 * Sync movie availability
 */
async function syncMovieAvailability(media) {
    try {
        const plexCheck = await checkMovieOnPlex(media.tmdb_id);

        if (plexCheck.exists) {
            // Update media to AVAILABLE
            await query(`
                UPDATE request_site_media
                SET status = 4,
                    plex_rating_key = ?,
                    plex_server_id = ?,
                    media_added_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [plexCheck.ratingKey, plexCheck.serverId, media.id]);

            // Update related requests to AVAILABLE (request_site_requests table)
            await query(`
                UPDATE request_site_requests
                SET status = 4, updated_at = CURRENT_TIMESTAMP
                WHERE media_id = ? AND is_4k = 0 AND status IN (1, 2)
            `, [media.id]);

            // Also update media_requests table (the actual requests table)
            await query(`
                UPDATE media_requests
                SET status = 'available', available_at = CURRENT_TIMESTAMP
                WHERE tmdb_id = ? AND media_type = 'movie' AND status IN ('processing', 'approved')
            `, [media.tmdb_id]);

            console.log(`[Availability Sync] ✅ Movie TMDB ${media.tmdb_id} marked as AVAILABLE`);

            // Notify users who requested this media
            const requests = await query(`
                SELECT DISTINCT user_id FROM request_site_requests
                WHERE media_id = ? AND is_4k = 0 AND status = 4
            `, [media.id]);

            const mediaInfo = await getMediaInfoFromTmdb(media.tmdb_id, 'movie');
            const mediaTitle = mediaInfo ? mediaInfo.title : `Movie ${media.tmdb_id}`;

            for (const request of requests) {
                await notifyUserMediaAvailable(request.user_id, mediaTitle, 'movie');
            }

            return true;
        }

        return false;
    } catch (error) {
        console.error(`[Availability Sync] Error syncing movie ${media.tmdb_id}:`, error);
        return false;
    }
}

/**
 * Sync TV show availability
 */
async function syncTVShowAvailability(media) {
    try {
        const plexCheck = await checkTVShowOnPlex(media.tmdb_id);

        if (plexCheck.exists) {
            // Update media
            await query(`
                UPDATE request_site_media
                SET plex_rating_key = ?,
                    plex_server_id = ?,
                    media_added_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP,
                    last_season_change = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [plexCheck.ratingKey, plexCheck.serverId, media.id]);

            // Update season records
            for (const seasonNumber of plexCheck.seasons) {
                // Check if season record exists
                const seasonRecords = await query(
                    'SELECT * FROM request_site_seasons WHERE media_id = ? AND season_number = ?',
                    [media.id, seasonNumber]
                );

                if (seasonRecords.length === 0) {
                    // Create new season record
                    await query(`
                        INSERT INTO request_site_seasons (
                            media_id,
                            season_number,
                            status,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    `, [media.id, seasonNumber]);
                } else {
                    // Update existing season to AVAILABLE
                    await query(
                        'UPDATE request_site_seasons SET status = 4, updated_at = CURRENT_TIMESTAMP WHERE media_id = ? AND season_number = ?',
                        [media.id, seasonNumber]
                    );
                }
            }

            // Check if ALL requested seasons are now available
            const requests = await query(
                'SELECT * FROM request_site_requests WHERE media_id = ? AND is_4k = 0 AND status IN (1, 2)',
                [media.id]
            );

            for (const request of requests) {
                let allAvailable = true;

                if (request.seasons && request.seasons !== 'all') {
                    const requestedSeasons = JSON.parse(request.seasons);
                    for (const seasonNum of requestedSeasons) {
                        if (!plexCheck.seasons.includes(seasonNum)) {
                            allAvailable = false;
                            break;
                        }
                    }
                } else {
                    // "all" seasons requested - just mark as available if show exists
                    allAvailable = true;
                }

                if (allAvailable) {
                    await query(
                        'UPDATE request_site_requests SET status = 4, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [request.id]
                    );
                    console.log(`[Availability Sync] ✅ TV request ${request.id} marked as AVAILABLE`);

                    // Notify user
                    const mediaInfo = await getMediaInfoFromTmdb(media.tmdb_id, 'tv');
                    const mediaTitle = mediaInfo ? mediaInfo.title : `TV Show ${media.tmdb_id}`;
                    await notifyUserMediaAvailable(request.user_id, mediaTitle, 'tv');
                }
            }

            // Also update media_requests table (the actual requests table)
            await query(`
                UPDATE media_requests
                SET status = 'available', available_at = CURRENT_TIMESTAMP
                WHERE tmdb_id = ? AND media_type = 'tv' AND status IN ('processing', 'approved')
            `, [media.tmdb_id]);

            // Update media status based on season availability
            const allSeasons = await query(
                'SELECT * FROM request_site_seasons WHERE media_id = ?',
                [media.id]
            );

            const availableSeasons = allSeasons.filter(s => s.status === 4).length;
            const totalSeasons = allSeasons.length;

            if (availableSeasons === totalSeasons && totalSeasons > 0) {
                await query('UPDATE request_site_media SET status = 4 WHERE id = ?', [media.id]);
            } else if (availableSeasons > 0) {
                await query('UPDATE request_site_media SET status = 3 WHERE id = ?', [media.id]); // PARTIALLY_AVAILABLE
            }

            console.log(`[Availability Sync] ✅ TV show TMDB ${media.tmdb_id} synced (${availableSeasons}/${totalSeasons} seasons available)`);

            return true;
        }

        return false;
    } catch (error) {
        console.error(`[Availability Sync] Error syncing TV show ${media.tmdb_id}:`, error);
        return false;
    }
}

/**
 * Sync media_requests table using Radarr/Sonarr library cache
 * This handles requests that might not be in request_site_media
 */
async function syncMediaRequestsFromArrCache() {
    try {
        // Get all processing/approved requests from media_requests table
        const pendingRequests = await query(`
            SELECT id, tmdb_id, media_type, title, status
            FROM media_requests
            WHERE status IN ('processing', 'approved')
        `);

        console.log(`[Availability Sync] Checking ${pendingRequests.length} media_requests against *arr cache`);

        let updated = 0;

        for (const request of pendingRequests) {
            let isAvailable = false;

            if (request.media_type === 'movie') {
                // Check Radarr cache for downloaded movie
                const radarrEntry = await query(
                    'SELECT * FROM radarr_library_cache WHERE tmdb_id = ? AND has_file = 1',
                    [request.tmdb_id]
                );
                isAvailable = radarrEntry && radarrEntry.length > 0;
            } else if (request.media_type === 'tv') {
                // Check Sonarr cache for TV episodes
                const sonarrEntry = await query(
                    'SELECT * FROM sonarr_library_cache WHERE tmdb_id = ? AND episode_file_count > 0',
                    [request.tmdb_id]
                );
                isAvailable = sonarrEntry && sonarrEntry.length > 0;
            }

            if (isAvailable) {
                await query(`
                    UPDATE media_requests
                    SET status = 'available', available_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [request.id]);
                updated++;
                console.log(`[Availability Sync] ✅ ${request.title} (TMDB ${request.tmdb_id}) marked as available via *arr cache`);
            }
        }

        return updated;
    } catch (error) {
        console.error('[Availability Sync] Error syncing from *arr cache:', error);
        return 0;
    }
}

/**
 * Main job function - runs every 6 hours
 */
async function runAvailabilitySync() {
    if (isRunning) {
        console.log('[Availability Sync] Already running, skipping this interval');
        return;
    }

    isRunning = true;

    try {
        console.log('[Availability Sync] Starting availability sync...');

        // First, sync from Radarr/Sonarr cache (faster, catches recently downloaded content)
        const arrSyncCount = await syncMediaRequestsFromArrCache();
        console.log(`[Availability Sync] *arr cache sync: ${arrSyncCount} items updated`);

        // Then, sync from request_site_media via Plex (slower, but catches manual additions)
        const processingMedia = await query(`
            SELECT * FROM request_site_media
            WHERE status = 2 OR status_4k = 2
            ORDER BY updated_at ASC
        `);

        console.log(`[Availability Sync] Found ${processingMedia.length} media items in PROCESSING status`);

        let syncedCount = 0;

        for (const media of processingMedia) {
            if (media.media_type === 'movie') {
                if (await syncMovieAvailability(media)) {
                    syncedCount++;
                }
            } else if (media.media_type === 'tv') {
                if (await syncTVShowAvailability(media)) {
                    syncedCount++;
                }
            }

            // Small delay between checks to avoid overwhelming Plex
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`[Availability Sync] Sync complete - ${syncedCount}/${processingMedia.length} items now available (+ ${arrSyncCount} from *arr cache)`);

    } catch (error) {
        console.error('[Availability Sync] Error:', error);
    } finally {
        isRunning = false;
    }
}

/**
 * Initialize the availability sync job
 */
function initializeAvailabilitySync() {
    console.log('[Availability Sync] Initializing availability sync job...');

    // Run immediately on startup
    runAvailabilitySync();

    // Then run every 6 hours
    scheduledInterval = setInterval(runAvailabilitySync, 6 * 60 * 60 * 1000);

    console.log('[Availability Sync] Availability sync job initialized (runs every 6 hours)');
}

/**
 * Stop the availability sync job
 */
function stopAvailabilitySync() {
    if (scheduledInterval) {
        clearInterval(scheduledInterval);
        scheduledInterval = null;
        console.log('[Availability Sync] Availability sync job stopped');
    }
}

module.exports = {
    initializeAvailabilitySync,
    stopAvailabilitySync,
    runAvailabilitySync,
    syncMediaRequestsFromArrCache
};
