/**
 * Guide Cache Refresh Scheduler
 *
 * Schedules automatic refresh of TV guide cache for IPTV panels every 2 hours.
 * Also provides functions for manual refresh and playlist guide refresh after auto-updater.
 * After refreshing database, reloads data into portal in-memory cache for instant guide loading.
 */

const cron = require('node-cron');
const GuideCacheRefreshJob = require('./guide-cache-refresh');

// Import the in-memory cache reload function from portal routes
// This ensures guide loads instantly after refresh (no need to wait for cache warm-up)
let reloadSourceCache = null;
let clearUserCategoriesCache = null;
try {
    const portalRoutes = require('../routes/portal-routes');
    reloadSourceCache = portalRoutes.reloadSourceCache;
    clearUserCategoriesCache = portalRoutes.clearUserCategoriesCache;
} catch (e) {
    console.warn('[Guide Cache] Could not import portal-routes functions - in-memory cache will not auto-refresh');
}

// Every 2 hours for IPTV panels
const PANEL_GUIDE_REFRESH_CRON = process.env.PANEL_GUIDE_REFRESH_CRON || '0 */2 * * *';

// Track pending playlist refreshes (after auto-updater)
const pendingPlaylistRefreshes = new Map();

/**
 * Initialize the scheduled guide cache refresh for panels
 */
function initializeGuideCacheRefresh() {
    console.log(`[Guide Cache] Scheduling panel guide refresh with cron: ${PANEL_GUIDE_REFRESH_CRON}`);

    // Validate cron expression
    if (!cron.validate(PANEL_GUIDE_REFRESH_CRON)) {
        console.error(`[Guide Cache] Invalid cron expression: ${PANEL_GUIDE_REFRESH_CRON}`);
        console.error(`[Guide Cache] Job NOT scheduled. Fix the cron expression in .env`);
        return;
    }

    // Schedule the job
    const task = cron.schedule(PANEL_GUIDE_REFRESH_CRON, async () => {
        console.log(`[Guide Cache] Running scheduled panel guide refresh at ${new Date().toISOString()}`);
        await refreshAllPanelsGuide();
    });

    console.log(`[Guide Cache] Panel guide refresh scheduled - runs every 2 hours`);

    return task;
}

/**
 * Refresh guide cache for all IPTV panels
 */
async function refreshAllPanelsGuide() {
    const startTime = Date.now();
    console.log(`[Guide Cache] Starting panel guide refresh...`);

    try {
        const job = new GuideCacheRefreshJob();
        const results = await job.refreshAllPanels();

        // Get list of all panels to reload into memory
        const panelIds = job.db.prepare(`
            SELECT id FROM iptv_panels WHERE is_active = 1
        `).all().map(p => p.id);

        job.close();

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Guide Cache] Panel guide refresh completed in ${duration}s`);
        console.log(`[Guide Cache] Results: ${results.success}/${results.total} successful, ${results.failed} failed, ${results.skipped} skipped`);

        // Reload all panels into in-memory cache for instant guide loading
        if (reloadSourceCache && panelIds.length > 0) {
            console.log(`[Guide Cache] Reloading ${panelIds.length} panels into memory...`);
            for (const panelId of panelIds) {
                await reloadSourceCache('panel', panelId);
            }
            console.log(`[Guide Cache] ✅ Memory cache reloaded for all panels`);
        }

        // Clear user categories cache so users get fresh access data
        if (clearUserCategoriesCache) {
            clearUserCategoriesCache();
        }

        return results;
    } catch (error) {
        console.error(`[Guide Cache] Panel guide refresh failed:`, error);
        return {
            success: 0,
            failed: 1,
            error: error.message
        };
    }
}

/**
 * Refresh guide cache for a specific panel
 * @param {number} panelId - Panel ID
 */
async function refreshPanelGuide(panelId) {
    console.log(`[Guide Cache] Refreshing guide for panel ${panelId}...`);

    try {
        const job = new GuideCacheRefreshJob();
        const result = await job.refreshPanel(panelId);
        job.close();

        // Reload into in-memory cache for instant guide loading
        if (reloadSourceCache && result.success) {
            await reloadSourceCache('panel', panelId);
        }

        // Clear user categories cache so users get fresh access data
        if (clearUserCategoriesCache && result.success) {
            clearUserCategoriesCache();
        }

        return result;
    } catch (error) {
        console.error(`[Guide Cache] Panel ${panelId} guide refresh failed:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Refresh guide cache for a specific playlist
 * @param {number} playlistId - Playlist ID
 */
async function refreshPlaylistGuide(playlistId) {
    console.log(`[Guide Cache] Refreshing guide for playlist ${playlistId}...`);

    try {
        const job = new GuideCacheRefreshJob();
        const result = await job.refreshPlaylist(playlistId);
        job.close();

        // Reload into in-memory cache for instant guide loading
        if (reloadSourceCache && result.success) {
            await reloadSourceCache('playlist', playlistId);
        }

        // Clear user categories cache so users get fresh access data
        if (clearUserCategoriesCache && result.success) {
            clearUserCategoriesCache();
        }

        return result;
    } catch (error) {
        console.error(`[Guide Cache] Playlist ${playlistId} guide refresh failed:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Refresh guide cache for all playlists
 */
async function refreshAllPlaylistsGuide() {
    const startTime = Date.now();
    console.log(`[Guide Cache] Starting playlist guide refresh...`);

    try {
        const job = new GuideCacheRefreshJob();
        const results = await job.refreshAllPlaylists();

        // Get list of all playlists to reload into memory
        const playlistIds = job.db.prepare(`
            SELECT id FROM iptv_editor_playlists WHERE is_active = 1
        `).all().map(p => p.id);

        job.close();

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Guide Cache] Playlist guide refresh completed in ${duration}s`);
        console.log(`[Guide Cache] Results: ${results.success}/${results.total} successful, ${results.failed} failed`);

        // Reload all playlists into in-memory cache for instant guide loading
        if (reloadSourceCache && playlistIds.length > 0) {
            console.log(`[Guide Cache] Reloading ${playlistIds.length} playlists into memory...`);
            for (const playlistId of playlistIds) {
                await reloadSourceCache('playlist', playlistId);
            }
            console.log(`[Guide Cache] ✅ Memory cache reloaded for all playlists`);
        }

        // Clear user categories cache so users get fresh access data
        if (clearUserCategoriesCache) {
            clearUserCategoriesCache();
        }

        return results;
    } catch (error) {
        console.error(`[Guide Cache] Playlist guide refresh failed:`, error);
        return {
            success: 0,
            failed: 1,
            error: error.message
        };
    }
}

/**
 * Schedule a playlist guide refresh to run after a delay (used after auto-updater)
 * @param {number} playlistId - Playlist ID
 * @param {number} delayMinutes - Delay in minutes before running refresh (default: 5)
 */
function schedulePlaylistGuideRefresh(playlistId, delayMinutes = 5) {
    // Cancel any existing scheduled refresh for this playlist
    if (pendingPlaylistRefreshes.has(playlistId)) {
        clearTimeout(pendingPlaylistRefreshes.get(playlistId));
        console.log(`[Guide Cache] Cancelled pending guide refresh for playlist ${playlistId}`);
    }

    const delayMs = delayMinutes * 60 * 1000;
    console.log(`[Guide Cache] Scheduling guide refresh for playlist ${playlistId} in ${delayMinutes} minutes`);

    const timeoutId = setTimeout(async () => {
        pendingPlaylistRefreshes.delete(playlistId);
        console.log(`[Guide Cache] Running scheduled guide refresh for playlist ${playlistId}`);
        await refreshPlaylistGuide(playlistId);
    }, delayMs);

    pendingPlaylistRefreshes.set(playlistId, timeoutId);
}

/**
 * Get cache status for all sources
 */
function getCacheStatus() {
    const job = new GuideCacheRefreshJob();
    const status = job.getCacheStatus();
    job.close();
    return status;
}

/**
 * Pre-load all cached EPG data into memory at application startup
 * This ensures guide loads instantly on the first request after server restart
 */
async function preloadAllGuideCaches() {
    console.log('[Guide Cache] Pre-loading all EPG data into memory at startup...');

    if (!reloadSourceCache) {
        console.warn('[Guide Cache] reloadSourceCache not available - skipping pre-load');
        return { loaded: 0, failed: 0 };
    }

    try {
        const job = new GuideCacheRefreshJob();

        // Get all sources that have cached EPG data
        const cachedSources = job.db.prepare(`
            SELECT source_type, source_id, epg_channel_count
            FROM guide_cache
            WHERE epg_json IS NOT NULL AND epg_channel_count > 0
        `).all();

        job.close();

        if (cachedSources.length === 0) {
            console.log('[Guide Cache] No cached EPG data to pre-load');
            return { loaded: 0, failed: 0 };
        }

        console.log(`[Guide Cache] Found ${cachedSources.length} sources with cached EPG data`);

        let loaded = 0;
        let failed = 0;

        for (const source of cachedSources) {
            try {
                await reloadSourceCache(source.source_type, source.source_id);
                loaded++;
            } catch (error) {
                console.error(`[Guide Cache] Failed to pre-load ${source.source_type}:${source.source_id}:`, error.message);
                failed++;
            }
        }

        console.log(`[Guide Cache] ✅ Pre-loaded ${loaded} EPG caches into memory (${failed} failed)`);
        return { loaded, failed };

    } catch (error) {
        console.error('[Guide Cache] Failed to pre-load EPG caches:', error);
        return { loaded: 0, failed: 1, error: error.message };
    }
}

module.exports = {
    initializeGuideCacheRefresh,
    refreshAllPanelsGuide,
    refreshPanelGuide,
    refreshPlaylistGuide,
    refreshAllPlaylistsGuide,
    schedulePlaylistGuideRefresh,
    getCacheStatus,
    preloadAllGuideCaches
};
