/**
 * Dashboard Statistics Cache
 *
 * Centralized cache management for dashboard statistics
 *
 * NEW: Stats are now stored in dashboard_cached_stats table
 * and refreshed every 5 minutes by a background job.
 */

const db = require('../database-config');

// Server-side cache for dashboard stats (in-memory for fast access)
const dashboardStatsCache = {
    data: null,
    timestamp: null,
    isRefreshing: false
};

// Server-side cache for IPTV panels statistics
const iptvPanelsCache = {
    data: null,
    timestamp: null,
    isRefreshing: false
};

// Cache duration for live session data (30 seconds)
// Note: Stats are refreshed every 5 minutes in background, but live sessions
// can be refreshed more frequently on-demand
const LIVE_SESSION_CACHE_DURATION = 30 * 1000;

/**
 * Save dashboard cache to database
 */
async function saveCacheToDatabase(cacheData, timestamp) {
    try {
        const cacheJson = JSON.stringify({
            data: cacheData,
            timestamp: timestamp
        });

        await db.query(`
            INSERT INTO dashboard_cache (id, cache_data, updated_at)
            VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                cache_data = excluded.cache_data,
                updated_at = excluded.updated_at
        `, [cacheJson]);

        console.log('[CACHE] Dashboard cache saved to database');
    } catch (error) {
        console.error('[CACHE] Error saving cache to database:', error);
    }
}

/**
 * Load dashboard cache from database
 */
async function loadCacheFromDatabase() {
    try {
        const result = await db.query(`
            SELECT cache_data, updated_at
            FROM dashboard_cache
            WHERE id = 1
        `);

        if (result && result.length > 0 && result[0].cache_data) {
            const cached = JSON.parse(result[0].cache_data);
            dashboardStatsCache.data = cached.data;
            dashboardStatsCache.timestamp = cached.timestamp;

            console.log(`[CACHE] Dashboard cache loaded from database (last updated: ${result[0].updated_at})`);
            return true;
        } else {
            console.log('[CACHE] No cached dashboard data found in database');
            return false;
        }
    } catch (error) {
        console.error('[CACHE] Error loading cache from database:', error);
        return false;
    }
}

/**
 * Clear the dashboard statistics cache
 */
function clearCache() {
    console.log('[CACHE] Clearing dashboard statistics cache');
    dashboardStatsCache.data = null;
    dashboardStatsCache.timestamp = null;
}

/**
 * Clear the IPTV panels statistics cache
 */
function clearIptvPanelsCache() {
    console.log('[CACHE] Clearing IPTV panels statistics cache');
    iptvPanelsCache.data = null;
    iptvPanelsCache.timestamp = null;
}

/**
 * Clear all caches
 */
function clearAllCaches() {
    console.log('[CACHE] Clearing all caches (dashboard + IPTV panels)');
    clearCache();
    clearIptvPanelsCache();
}

/**
 * Get the dashboard cache object
 */
function getCache() {
    return dashboardStatsCache;
}

/**
 * Get the IPTV panels cache object
 */
function getIptvPanelsCache() {
    return iptvPanelsCache;
}

/**
 * Get all cached stats from database (dashboard_cached_stats table)
 * These are refreshed every 5 minutes by the background job
 */
async function getCachedStatsFromDatabase() {
    try {
        const results = await db.query(`
            SELECT stat_key, stat_value, stat_type, updated_at
            FROM dashboard_cached_stats
        `);

        const stats = {};
        let oldestUpdate = null;

        for (const row of results) {
            if (row.stat_type === 'json') {
                try {
                    stats[row.stat_key] = JSON.parse(row.stat_value);
                } catch {
                    stats[row.stat_key] = row.stat_value;
                }
            } else if (row.stat_type === 'number') {
                stats[row.stat_key] = parseFloat(row.stat_value) || 0;
            } else {
                stats[row.stat_key] = row.stat_value;
            }

            // Track oldest update time
            if (!oldestUpdate || new Date(row.updated_at) < new Date(oldestUpdate)) {
                oldestUpdate = row.updated_at;
            }
        }

        return { stats, updated_at: oldestUpdate };
    } catch (error) {
        console.error('[CACHE] Error getting cached stats from database:', error);
        return { stats: {}, updated_at: null };
    }
}

/**
 * Save a single stat to the database cache
 */
async function saveStatToDatabase(key, value, type = 'number') {
    try {
        const stringValue = type === 'json' ? JSON.stringify(value) : String(value);
        await db.query(`
            INSERT INTO dashboard_cached_stats (stat_key, stat_value, stat_type, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(stat_key) DO UPDATE SET
                stat_value = excluded.stat_value,
                stat_type = excluded.stat_type,
                updated_at = excluded.updated_at
        `, [key, stringValue, type]);
    } catch (error) {
        console.error(`[CACHE] Error saving stat ${key} to database:`, error.message);
    }
}

/**
 * Get the age of cached stats in seconds
 */
async function getCacheAge() {
    try {
        const result = await db.query(`
            SELECT MIN(updated_at) as oldest_update
            FROM dashboard_cached_stats
        `);

        if (result && result[0] && result[0].oldest_update) {
            const updatedAt = new Date(result[0].oldest_update);
            const now = new Date();
            return Math.floor((now - updatedAt) / 1000);
        }
        return Infinity;
    } catch (error) {
        console.error('[CACHE] Error getting cache age:', error);
        return Infinity;
    }
}

/**
 * Load IPTV panels cache from database on startup
 * This prevents showing 0 for IPTV live streams after container restart
 */
async function loadIptvPanelsCacheFromDatabase() {
    try {
        const result = await db.query(`
            SELECT stat_value, updated_at
            FROM dashboard_cached_stats
            WHERE stat_key = 'iptv_panels_data'
        `);

        if (result && result.length > 0 && result[0].stat_value && result[0].stat_value !== 'null') {
            const panelsData = JSON.parse(result[0].stat_value);

            if (panelsData && panelsData.panels && panelsData.panels.length > 0) {
                // Transform database format to API response format
                const allLiveViewers = [];
                let aggregated = {
                    totalPanels: panelsData.panels.length,
                    totalCredits: 0,
                    totalUsers: 0,
                    totalActiveUsers: 0,
                    totalLiveViewers: 0,
                    totalLiveChannels: 0,
                    totalVodMovies: 0,
                    totalVodSeries: 0,
                    totalBouquets: 0
                };

                panelsData.panels.forEach(panel => {
                    aggregated.totalCredits += panel.credits || 0;
                    aggregated.totalUsers += panel.users?.total || 0;
                    aggregated.totalActiveUsers += panel.users?.active || 0;
                    aggregated.totalLiveViewers += panel.users?.liveNow || 0;
                    aggregated.totalLiveChannels += panel.content?.liveChannels || 0;
                    aggregated.totalVodMovies += panel.content?.vodMovies || 0;
                    aggregated.totalVodSeries += panel.content?.vodSeries || 0;
                    aggregated.totalBouquets += panel.content?.totalBouquets || 0;

                    // Collect live viewers from each panel
                    if (panel.liveViewers && Array.isArray(panel.liveViewers)) {
                        allLiveViewers.push(...panel.liveViewers);
                    }
                });

                // Store in iptvPanelsCache in the format expected by /dashboard/iptv-panels
                iptvPanelsCache.data = {
                    success: true,
                    panels: panelsData.panels,
                    aggregated: aggregated,
                    liveViewers: allLiveViewers,
                    timestamp: result[0].updated_at
                };
                iptvPanelsCache.timestamp = new Date(result[0].updated_at).getTime();

                console.log(`[CACHE] IPTV panels cache loaded from database (${panelsData.panels.length} panels, ${aggregated.totalLiveViewers} live viewers)`);
                return true;
            }
        }

        console.log('[CACHE] No cached IPTV panels data found in database');
        return false;
    } catch (error) {
        console.error('[CACHE] Error loading IPTV panels cache from database:', error);
        return false;
    }
}

module.exports = {
    dashboardStatsCache,
    iptvPanelsCache,
    clearCache,
    clearIptvPanelsCache,
    clearAllCaches,
    getCache,
    getIptvPanelsCache,
    saveCacheToDatabase,
    loadCacheFromDatabase,
    loadIptvPanelsCacheFromDatabase,
    // New database-backed cache functions
    getCachedStatsFromDatabase,
    saveStatToDatabase,
    getCacheAge,
    LIVE_SESSION_CACHE_DURATION
};
