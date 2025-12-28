/**
 * Request Site - Download Tracker Job
 *
 * Queries Radarr/Sonarr queue APIs every minute to track download progress.
 * Stores progress in memory cache for fast frontend queries.
 *
 * Based on Seerr's download tracker pattern.
 */

const { query } = require('../database-config');
const RadarrAPI = require('../utils/radarr-api');
const SonarrAPI = require('../utils/sonarr-api');

// In-memory cache of download progress
// Format: { movieId: { ... }, seriesId: { ... } }
let downloadCache = {
    radarr: {}, // { radarrId: { movieId: {...} } }
    sonarr: {}  // { sonarrId: { seriesId: {...} } }
};

let isRunning = false;
let scheduledInterval = null;

/**
 * Get Radarr servers from request_site_settings
 */
async function getRadarrServers() {
    try {
        const settings = await query(
            'SELECT value FROM request_site_settings WHERE key IN (?, ?)',
            ['default_radarr_server', 'default_radarr_4k_server']
        );

        const servers = [];
        for (const setting of settings) {
            if (setting.value && setting.value !== 'null') {
                const serverId = JSON.parse(setting.value);
                if (serverId) {
                    servers.push(serverId);
                }
            }
        }

        // TODO: In the future, support multiple Radarr servers
        // For now, just get the default ones from settings

        return servers;
    } catch (error) {
        console.error('[Download Tracker] Error fetching Radarr servers:', error);
        return [];
    }
}

/**
 * Get Sonarr servers from request_site_settings
 */
async function getSonarrServers() {
    try {
        const settings = await query(
            'SELECT value FROM request_site_settings WHERE key IN (?, ?)',
            ['default_sonarr_server', 'default_sonarr_4k_server']
        );

        const servers = [];
        for (const setting of settings) {
            if (setting.value && setting.value !== 'null') {
                const serverId = JSON.parse(setting.value);
                if (serverId) {
                    servers.push(serverId);
                }
            }
        }

        return servers;
    } catch (error) {
        console.error('[Download Tracker] Error fetching Sonarr servers:', error);
        return [];
    }
}

/**
 * Update Radarr download queue
 */
async function updateRadarrQueue(serverId, apiKey, url) {
    try {
        const radarr = new RadarrAPI({ apiKey, url });
        const queueItems = await radarr.getQueue();

        const downloads = {};

        for (const item of queueItems) {
            // Map queue item to our download format
            downloads[item.movieId] = {
                movieId: item.movieId,
                title: item.title,
                status: item.status,
                trackedDownloadStatus: item.trackedDownloadStatus,
                trackedDownloadState: item.trackedDownloadState,
                errorMessage: item.errorMessage,
                size: item.size,
                sizeleft: item.sizeleft,
                timeleft: item.timeleft,
                estimatedCompletionTime: item.estimatedCompletionTime,
                protocol: item.protocol,
                downloadClient: item.downloadClient,
                downloadId: item.downloadId,
                // Calculate progress percentage
                progress: item.size > 0 ? ((item.size - item.sizeleft) / item.size) * 100 : 0
            };
        }

        downloadCache.radarr[serverId] = downloads;
        console.log(`[Download Tracker] Radarr server ${serverId}: ${queueItems.length} downloads`);

    } catch (error) {
        console.error(`[Download Tracker] Error updating Radarr queue (server ${serverId}):`, error.message);
    }
}

/**
 * Update Sonarr download queue
 */
async function updateSonarrQueue(serverId, apiKey, url) {
    try {
        const sonarr = new SonarrAPI({ apiKey, url });
        const queueItems = await sonarr.getQueue();

        const downloads = {};

        for (const item of queueItems) {
            // Map queue item to our download format
            downloads[item.seriesId] = {
                seriesId: item.seriesId,
                title: item.title,
                status: item.status,
                trackedDownloadStatus: item.trackedDownloadStatus,
                trackedDownloadState: item.trackedDownloadState,
                errorMessage: item.errorMessage,
                size: item.size,
                sizeleft: item.sizeleft,
                timeleft: item.timeleft,
                estimatedCompletionTime: item.estimatedCompletionTime,
                protocol: item.protocol,
                downloadClient: item.downloadClient,
                downloadId: item.downloadId,
                episode: {
                    seasonNumber: item.episode?.seasonNumber,
                    episodeNumber: item.episode?.episodeNumber
                },
                // Calculate progress percentage
                progress: item.size > 0 ? ((item.size - item.sizeleft) / item.size) * 100 : 0
            };
        }

        downloadCache.sonarr[serverId] = downloads;
        console.log(`[Download Tracker] Sonarr server ${serverId}: ${queueItems.length} downloads`);

    } catch (error) {
        console.error(`[Download Tracker] Error updating Sonarr queue (server ${serverId}):`, error.message);
    }
}

/**
 * Main job function - runs every minute
 */
async function runDownloadTracker() {
    if (isRunning) {
        console.log('[Download Tracker] Already running, skipping this interval');
        return;
    }

    isRunning = true;

    try {
        console.log('[Download Tracker] Starting download tracker update...');

        // Get Radarr servers (TODO: implement proper server fetching from settings)
        // For now, this is a placeholder - we'll need to fetch actual server configs
        // from the database when the admin settings page is built

        // Update all Radarr servers
        const radarrServers = await getRadarrServers();
        for (const serverId of radarrServers) {
            // TODO: Fetch actual server config from database
            // await updateRadarrQueue(serverId, apiKey, url);
        }

        // Update all Sonarr servers
        const sonarrServers = await getSonarrServers();
        for (const serverId of sonarrServers) {
            // TODO: Fetch actual server config from database
            // await updateSonarrQueue(serverId, apiKey, url);
        }

        console.log('[Download Tracker] Update complete');

    } catch (error) {
        console.error('[Download Tracker] Error:', error);
    } finally {
        isRunning = false;
    }
}

/**
 * Get download progress for a specific movie (by TMDB ID)
 */
async function getMovieDownloadProgress(tmdbId) {
    try {
        // Find the media record to get the radarr_id
        const media = await query(
            'SELECT radarr_id, radarr_id_4k FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, 'movie']
        );

        if (media.length === 0) {
            return null;
        }

        // Check all Radarr server caches for this movie
        for (const serverId in downloadCache.radarr) {
            const serverCache = downloadCache.radarr[serverId];

            // Check both standard and 4K radarr IDs
            if (media[0].radarr_id && serverCache[media[0].radarr_id]) {
                return serverCache[media[0].radarr_id];
            }
            if (media[0].radarr_id_4k && serverCache[media[0].radarr_id_4k]) {
                return serverCache[media[0].radarr_id_4k];
            }
        }

        return null;
    } catch (error) {
        console.error('[Download Tracker] Error getting movie download progress:', error);
        return null;
    }
}

/**
 * Get download progress for a specific TV series (by TMDB ID)
 */
async function getSeriesDownloadProgress(tmdbId) {
    try {
        // Find the media record to get the sonarr_id
        const media = await query(
            'SELECT sonarr_id, sonarr_id_4k FROM request_site_media WHERE tmdb_id = ? AND media_type = ?',
            [tmdbId, 'tv']
        );

        if (media.length === 0) {
            return null;
        }

        // Check all Sonarr server caches for this series
        for (const serverId in downloadCache.sonarr) {
            const serverCache = downloadCache.sonarr[serverId];

            // Check both standard and 4K sonarr IDs
            if (media[0].sonarr_id && serverCache[media[0].sonarr_id]) {
                return serverCache[media[0].sonarr_id];
            }
            if (media[0].sonarr_id_4k && serverCache[media[0].sonarr_id_4k]) {
                return serverCache[media[0].sonarr_id_4k];
            }
        }

        return null;
    } catch (error) {
        console.error('[Download Tracker] Error getting series download progress:', error);
        return null;
    }
}

/**
 * Initialize the download tracker job
 */
function initializeDownloadTracker() {
    console.log('[Download Tracker] Initializing download tracker job...');

    // Run immediately on startup
    runDownloadTracker();

    // Then run every 60 seconds
    scheduledInterval = setInterval(runDownloadTracker, 60 * 1000);

    console.log('[Download Tracker] Download tracker job initialized (runs every 60 seconds)');
}

/**
 * Stop the download tracker job
 */
function stopDownloadTracker() {
    if (scheduledInterval) {
        clearInterval(scheduledInterval);
        scheduledInterval = null;
        console.log('[Download Tracker] Download tracker job stopped');
    }
}

module.exports = {
    initializeDownloadTracker,
    stopDownloadTracker,
    getMovieDownloadProgress,
    getSeriesDownloadProgress,
    downloadCache
};
