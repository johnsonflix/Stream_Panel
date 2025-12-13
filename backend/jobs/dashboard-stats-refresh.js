/**
 * Dashboard Stats Background Refresh Job
 *
 * Runs every 5 minutes to keep dashboard statistics up-to-date.
 * This ensures the dashboard loads instantly with near real-time data.
 *
 * What gets refreshed:
 * - All database counts (users, servers, panels, expiring, etc.)
 * - Plex server live data (users, pending invites, online status)
 * - IPTV panel stats (users, credits, live connections)
 *
 * What is NOT cached (loaded on-demand):
 * - Live session details (now playing) - fetched when user views dashboard
 * - CPU/memory usage for Plex servers - too volatile to cache
 */

const db = require('../database-config');
const axios = require('axios');
const xml2js = require('xml2js');
const { spawn } = require('child_process');

// Refresh interval: 5 minutes
const REFRESH_INTERVAL = 5 * 60 * 1000;

let isRefreshing = false;
let refreshTimer = null;

/**
 * Save a stat to the database cache
 */
async function saveStat(key, value, type = 'number') {
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
        console.error(`[DASHBOARD REFRESH] Error saving stat ${key}:`, error.message);
    }
}

/**
 * Save multiple stats at once
 */
async function saveStats(stats) {
    for (const [key, value] of Object.entries(stats)) {
        const type = Array.isArray(value) || (typeof value === 'object' && value !== null) ? 'json' : 'number';
        await saveStat(key, value, type);
    }
}

/**
 * Refresh all database-based stats (instant queries)
 */
async function refreshDatabaseStats() {
    console.log('[DASHBOARD REFRESH] Refreshing database stats...');

    const [
        totalUsersResult,
        plexUsersResult,
        iptvUsersResult,
        editorUsersResult,
        plexServersResult,
        iptvPanelsResult,
        expiringSoonResult,
        recentUsersResult,
        recentUsersMonthResult,
        expiringSoonMonthResult,
        expiringPlexWeekResult,
        expiringIptvWeekResult,
        pendingPlexRequestsResult,
        pendingIptvRequestsResult
    ] = await Promise.all([
        db.query(`SELECT COUNT(*) as count FROM users WHERE is_active = 1`),
        db.query(`SELECT COUNT(*) as count FROM users WHERE plex_enabled = 1 AND plex_expiration_date > datetime('now')`),
        db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_enabled = 1 AND iptv_expiration_date > datetime('now')`),
        db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_editor_enabled = 1`),
        db.query(`SELECT COUNT(*) as count FROM plex_servers WHERE is_active = 1`),
        db.query(`SELECT COUNT(*) as count FROM iptv_panels WHERE is_active = 1`),
        db.query(`
            SELECT COUNT(*) as count FROM users WHERE (
                (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
                OR (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
            )
        `),
        db.query(`SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')`),
        db.query(`SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-30 days')`),
        db.query(`
            SELECT COUNT(*) as count FROM users WHERE (
                (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
                OR (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
            )
        `),
        db.query(`SELECT COUNT(*) as count FROM users WHERE plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')`),
        db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')`),
        db.query(`SELECT COUNT(*) as count FROM portal_service_requests WHERE payment_status IN ('pending', 'submitted') AND service_type = 'plex'`).catch(() => [{ count: 0 }]),
        db.query(`SELECT COUNT(*) as count FROM portal_service_requests WHERE payment_status IN ('pending', 'submitted') AND service_type = 'iptv'`).catch(() => [{ count: 0 }])
    ]);

    await saveStats({
        total_users: totalUsersResult[0].count,
        active_plex_users: plexUsersResult[0].count,
        active_iptv_users: iptvUsersResult[0].count,
        iptv_editor_users: editorUsersResult[0].count,
        plex_servers_count: plexServersResult[0].count,
        iptv_panels_count: iptvPanelsResult[0].count,
        expiring_soon: expiringSoonResult[0].count,
        expiring_soon_month: expiringSoonMonthResult[0].count,
        expiring_plex_week: expiringPlexWeekResult[0].count,
        expiring_iptv_week: expiringIptvWeekResult[0].count,
        new_users_week: recentUsersResult[0].count,
        new_users_month: recentUsersMonthResult[0].count,
        pending_plex_requests: pendingPlexRequestsResult[0]?.count || 0,
        pending_iptv_requests: pendingIptvRequestsResult[0]?.count || 0
    });

    console.log('[DASHBOARD REFRESH] Database stats refreshed');
}

/**
 * Refresh Plex server stats (API calls) - Full data including libraries and sessions
 */
async function refreshPlexStats() {
    console.log('[DASHBOARD REFRESH] Refreshing Plex stats (full)...');

    const plexServers = await db.query(`
        SELECT id, name, url, server_id, token, health_status
        FROM plex_servers
        WHERE is_active = 1
        ORDER BY name
    `);

    if (plexServers.length === 0) {
        await saveStats({
            live_plex_users: 0,
            total_unique_plex_users: 0,
            live_pending_invites: 0,
            plex_servers_online: 0,
            plex_servers_offline: 0,
            plex_server_details: [],
            live_sessions: [],
            total_bandwidth_mbps: '0.0',
            wan_bandwidth_mbps: '0.0',
            direct_plays_count: 0,
            direct_streams_count: 0,
            transcodes_count: 0
        });
        return;
    }

    const parser = new xml2js.Parser();
    const allUsers = new Set();
    const allPendingInvites = new Set();
    let onlineServers = 0;
    let offlineServers = 0;
    let totalActiveSessions = 0;
    const allLiveSessions = [];
    let totalBandwidth = 0;
    let wanBandwidth = 0;
    let directPlays = 0;
    let directStreams = 0;
    let transcodes = 0;

    // Process all servers in parallel
    const serverResults = await Promise.all(plexServers.map(async (server) => {
        try {
            const serverUsers = new Set();
            const serverPendingInvites = new Set();
            let activeSessions = 0;
            let libraries = [];
            let serverSessions = [];

            // Get shared users from Plex.tv
            try {
                const sharedUsersResponse = await axios.get(
                    `https://plex.tv/api/servers/${server.server_id}/shared_servers`,
                    { params: { 'X-Plex-Token': server.token }, timeout: 10000 }
                );

                const result = await parser.parseStringPromise(sharedUsersResponse.data);
                const sharedServers = result.MediaContainer.SharedServer || [];

                sharedServers.forEach(user => {
                    const email = user.$.email || user.$.username;
                    if (email) {
                        serverUsers.add(email.toLowerCase());
                        allUsers.add(email.toLowerCase());
                    }
                });
            } catch (error) {
                console.log(`[DASHBOARD REFRESH] Could not fetch shared users for ${server.name}: ${error.message}`);
            }

            // Get pending invites
            try {
                const invitesResponse = await axios.get('https://plex.tv/api/invites/requested', {
                    params: { 'X-Plex-Token': server.token },
                    timeout: 10000
                });

                const inviteResult = await parser.parseStringPromise(invitesResponse.data);
                const invites = inviteResult.MediaContainer?.Invite || [];

                invites.forEach(invite => {
                    const email = invite.$?.email;
                    if (email) {
                        serverPendingInvites.add(email.toLowerCase());
                        allPendingInvites.add(email.toLowerCase());
                    }
                });
            } catch (error) {
                // Ignore errors for pending invites
            }

            // Get active sessions with details
            try {
                const sessionsResponse = await axios.get(`${server.url}/status/sessions`, {
                    params: { 'X-Plex-Token': server.token },
                    headers: { 'Accept': 'application/xml' },
                    timeout: 10000
                });

                const sessionResult = await parser.parseStringPromise(sessionsResponse.data);
                activeSessions = parseInt(sessionResult.MediaContainer?.$?.size || '0');
                onlineServers++;

                // Parse session details for Now Playing
                const videos = sessionResult.MediaContainer?.Video || [];
                const tracks = sessionResult.MediaContainer?.Track || [];
                const allMedia = [...(Array.isArray(videos) ? videos : [videos]), ...(Array.isArray(tracks) ? tracks : [tracks])].filter(m => m);

                for (const media of allMedia) {
                    const attrs = media.$ || {};
                    const userAttrs = media.User?.[0]?.$ || {};
                    const playerAttrs = media.Player?.[0]?.$ || {};
                    const mediaInfo = media.Media?.[0]?.$ || {};
                    const partInfo = media.Media?.[0]?.Part?.[0]?.$ || {};
                    const transcodeSess = media.TranscodeSession?.[0]?.$ || {};

                    // Calculate bitrate
                    const bitrate = parseInt(mediaInfo.bitrate) || parseInt(transcodeSess.speed) || 0;
                    const bitrateMbps = (bitrate / 1000).toFixed(1);

                    // Determine stream type
                    let streamDecision = 'Direct Play';
                    if (transcodeSess && Object.keys(transcodeSess).length > 0) {
                        streamDecision = 'Transcode';
                        transcodes++;
                    } else if (partInfo.decision === 'directstream') {
                        streamDecision = 'Direct Stream';
                        directStreams++;
                    } else {
                        directPlays++;
                    }

                    totalBandwidth += bitrate;

                    // Determine quality (resolution)
                    const videoWidth = parseInt(mediaInfo.width) || 0;
                    let quality = 'SD';
                    if (videoWidth >= 3840) quality = '4K';
                    else if (videoWidth >= 1920) quality = '1080p';
                    else if (videoWidth >= 1280) quality = '720p';
                    else if (videoWidth >= 720) quality = '480p';

                    // Build thumbnail URL
                    let thumbnail = null;
                    if (attrs.thumb) {
                        thumbnail = `${server.url}${attrs.thumb}?X-Plex-Token=${server.token}`;
                    } else if (attrs.grandparentThumb) {
                        thumbnail = `${server.url}${attrs.grandparentThumb}?X-Plex-Token=${server.token}`;
                    }

                    // Calculate progress percentage
                    const viewOffset = parseInt(attrs.viewOffset || 0);
                    const duration = parseInt(attrs.duration || 1);
                    const progressPercent = duration > 0 ? Math.round((viewOffset / duration) * 100) : 0;

                    const session = {
                        serverId: server.id,
                        serverName: server.name,
                        title: attrs.title || 'Unknown',
                        grandparentTitle: attrs.grandparentTitle || null,
                        parentTitle: attrs.parentTitle || null,
                        parentIndex: attrs.parentIndex || null,
                        index: attrs.index || null,
                        type: attrs.type || 'unknown',
                        year: attrs.year || null,
                        user: userAttrs.title || 'Unknown User',
                        userThumb: userAttrs.thumb || null,
                        player: playerAttrs.title || 'Unknown Player',
                        platform: playerAttrs.platform || 'Unknown',
                        state: playerAttrs.state || 'playing',
                        progress: progressPercent,
                        duration: duration,
                        bitrateMbps: bitrateMbps,
                        streamDecision: streamDecision,
                        quality: quality,
                        thumbnail: thumbnail,
                        ipAddress: playerAttrs.address || null
                    };

                    serverSessions.push(session);
                    allLiveSessions.push(session);
                }
            } catch (error) {
                offlineServers++;
                console.log(`[DASHBOARD REFRESH] Server ${server.name} appears offline: ${error.message}`);
                return {
                    id: server.id,
                    name: server.name,
                    status: 'offline',
                    users: 0,
                    pending: 0,
                    activeSessions: 0,
                    libraries: [],
                    cpu_percent: null,
                    memory_percent: null
                };
            }

            // Get library details
            try {
                const librariesResponse = await axios.get(`${server.url}/library/sections`, {
                    params: { 'X-Plex-Token': server.token },
                    headers: { 'Accept': 'application/xml' },
                    timeout: 10000
                });

                const librariesResult = await parser.parseStringPromise(librariesResponse.data);
                const directories = librariesResult.MediaContainer?.Directory || [];

                // Helper function to get count for a specific type
                const getTypeCount = async (sectionKey, typeNum) => {
                    try {
                        const resp = await axios.get(`${server.url}/library/sections/${sectionKey}/all`, {
                            params: { 'X-Plex-Token': server.token, 'type': typeNum, 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': 0 },
                            headers: { 'Accept': 'application/xml' },
                            timeout: 10000
                        });
                        const result = await parser.parseStringPromise(resp.data);
                        return parseInt(result.MediaContainer?.$?.totalSize) || 0;
                    } catch {
                        return 0;
                    }
                };

                for (const dir of (Array.isArray(directories) ? directories : [directories])) {
                    if (!dir || !dir.$) continue;

                    try {
                        const libType = dir.$.type;
                        const libKey = dir.$.key;
                        let libData = {
                            key: libKey,
                            title: dir.$.title,
                            type: libType,
                            count: 0
                        };

                        if (libType === 'show') {
                            // TV Shows: Get show count, season count, episode count
                            const [showCount, seasonCount, episodeCount] = await Promise.all([
                                getTypeCount(libKey, 2),   // type 2 = shows
                                getTypeCount(libKey, 3),   // type 3 = seasons
                                getTypeCount(libKey, 4)    // type 4 = episodes
                            ]);
                            libData.showCount = showCount;
                            libData.seasonCount = seasonCount;
                            libData.episodeCount = episodeCount;
                            libData.count = showCount;
                        } else if (libType === 'artist') {
                            // Music: Get artist count, album count
                            const [artistCount, albumCount] = await Promise.all([
                                getTypeCount(libKey, 8),   // type 8 = artists
                                getTypeCount(libKey, 9)    // type 9 = albums
                            ]);
                            libData.artistCount = artistCount;
                            libData.albumCount = albumCount;
                            libData.count = artistCount;
                        } else {
                            // Movies, Photos, etc: Just get the total count
                            const countResponse = await axios.get(`${server.url}/library/sections/${libKey}/all`, {
                                params: { 'X-Plex-Token': server.token, 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': 0 },
                                headers: { 'Accept': 'application/xml' },
                                timeout: 10000
                            });
                            const countResult = await parser.parseStringPromise(countResponse.data);
                            libData.count = parseInt(countResult.MediaContainer?.$?.totalSize) || 0;
                        }

                        libraries.push(libData);
                    } catch (countError) {
                        libraries.push({
                            key: dir.$.key,
                            title: dir.$.title,
                            type: dir.$.type,
                            count: 0
                        });
                    }
                }
            } catch (libError) {
                console.log(`[DASHBOARD REFRESH] Could not fetch libraries for ${server.name}: ${libError.message}`);
            }

            totalActiveSessions += activeSessions;

            // Try to get real CPU/memory stats from Plex server's /statistics/resources endpoint
            let cpuPercent = null;
            let memoryPercent = null;

            try {
                // Fetch statistics resources - must include Plex headers for this to work
                // The PlexAPI library sends these headers and they're required for the statistics endpoint
                const statsResponse = await axios.get(`${server.url}/statistics/resources`, {
                    params: {
                        'X-Plex-Token': server.token,
                        'timespan': 6  // Request 6 seconds worth of resource data
                    },
                    headers: {
                        'Accept': 'application/xml',
                        'X-Plex-Client-Identifier': 'SubsApp-Dashboard',
                        'X-Plex-Product': 'SubsApp',
                        'X-Plex-Version': '2.0',
                        'X-Plex-Platform': 'Node.js',
                        'X-Plex-Device': 'Dashboard',
                        'X-Plex-Device-Name': 'SubsApp Dashboard'
                    },
                    timeout: 10000
                });

                const statsResult = await parser.parseStringPromise(statsResponse.data);
                const statsResources = statsResult.MediaContainer?.StatisticsResources || [];

                // Get the most recent entry (last one in the array)
                const resourcesArray = Array.isArray(statsResources) ? statsResources : (statsResources ? [statsResources] : []);
                if (resourcesArray.length > 0) {
                    const latestStats = resourcesArray[resourcesArray.length - 1].$ || resourcesArray[resourcesArray.length - 1] || {};

                    cpuPercent = parseFloat(latestStats.hostCpuUtilization) || null;
                    memoryPercent = parseFloat(latestStats.hostMemoryUtilization) || null;

                    if (cpuPercent !== null && memoryPercent !== null) {
                        console.log(`[DASHBOARD REFRESH] ✅ ${server.name} resources: CPU ${cpuPercent.toFixed(1)}%, Memory ${memoryPercent.toFixed(1)}%`);
                    }
                }
            } catch (statsError) {
                // Plex may not support statistics endpoint or resource monitoring may be disabled
                // This is not an error - just means we can't get these stats
            }

            return {
                id: server.id,
                name: server.name,
                status: 'online',
                users: serverUsers.size,
                pending: serverPendingInvites.size,
                activeSessions: activeSessions,
                libraries: libraries,
                cpu_percent: cpuPercent,
                memory_percent: memoryPercent
            };
        } catch (error) {
            console.error(`[DASHBOARD REFRESH] Error processing server ${server.name}:`, error.message);
            offlineServers++;
            return {
                id: server.id,
                name: server.name,
                status: 'offline',
                users: 0,
                pending: 0,
                activeSessions: 0,
                libraries: [],
                cpu_percent: null,
                memory_percent: null
            };
        }
    }));

    await saveStats({
        live_plex_users: totalActiveSessions,
        total_live_sessions: allLiveSessions.length,
        total_unique_plex_users: allUsers.size,
        live_pending_invites: allPendingInvites.size,
        plex_servers_online: onlineServers,
        plex_servers_offline: offlineServers,
        plex_server_details: serverResults,
        live_sessions: allLiveSessions,
        total_bandwidth_mbps: (totalBandwidth / 1000).toFixed(1),
        wan_bandwidth_mbps: (wanBandwidth / 1000).toFixed(1),
        direct_plays_count: directPlays,
        direct_streams_count: directStreams,
        transcodes_count: transcodes
    });

    console.log(`[DASHBOARD REFRESH] Plex stats refreshed: ${onlineServers} online, ${offlineServers} offline, ${totalActiveSessions} active streams`);
}

/**
 * Refresh IPTV panel stats (API calls)
 */
async function refreshIPTVStats() {
    console.log('[DASHBOARD REFRESH] Refreshing IPTV stats...');

    try {
        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');

        const panels = await db.query(`
            SELECT id, name, panel_type, base_url, is_active, current_credit_balance
            FROM iptv_panels
            WHERE is_active = 1
            ORDER BY name
        `);

        if (panels.length === 0) {
            await saveStats({
                iptv_live_streams: 0,
                iptv_panel_details: [],
                iptv_panels_data: null
            });
            return;
        }

        // Initialize IPTV Service Manager
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        let totalLiveStreams = 0;
        const panelDetails = [];
        const panelsData = { panels: [] };

        // Process panels in parallel
        await Promise.all(panels.map(async (panel) => {
            try {
                const panelService = iptvManager.getPanel(panel.id);
                const stats = await panelService.getDashboardStatistics();

                const liveNow = stats.users?.liveNow || 0;
                totalLiveStreams += liveNow;

                const panelInfo = {
                    id: panel.id,
                    name: panel.name,
                    panel_type: panel.panel_type,
                    status: 'active',
                    credits: Math.round(stats.credits || panel.current_credit_balance || 0),
                    users: stats.users?.total || 0,
                    activeUsers: stats.users?.active || 0,
                    liveStreams: liveNow
                };

                panelDetails.push(panelInfo);

                panelsData.panels.push({
                    panel_id: panel.id,
                    panel_name: panel.name,
                    panel_type: panel.panel_type,
                    error: null,
                    credits: panelInfo.credits,
                    users: {
                        total: stats.users?.total || 0,
                        liveNow: liveNow
                    },
                    content: {
                        liveChannels: stats.content?.liveChannels || 0,
                        vodMovies: stats.content?.vodMovies || 0,
                        vodSeries: stats.content?.vodSeries || 0
                    },
                    liveViewers: stats.liveViewers || [] // Include live viewer details for instant dashboard load
                });

            } catch (error) {
                console.error(`[DASHBOARD REFRESH] Error fetching stats for panel ${panel.name}:`, error.message);
                panelDetails.push({
                    id: panel.id,
                    name: panel.name,
                    panel_type: panel.panel_type,
                    status: 'error',
                    credits: Math.round(panel.current_credit_balance || 0),
                    users: 0,
                    activeUsers: 0,
                    liveStreams: 0
                });

                panelsData.panels.push({
                    panel_id: panel.id,
                    panel_name: panel.name,
                    panel_type: panel.panel_type,
                    error: error.message,
                    credits: Math.round(panel.current_credit_balance || 0),
                    users: { total: 0, liveNow: 0 },
                    content: { liveChannels: 0, vodMovies: 0, vodSeries: 0 },
                    liveViewers: []
                });
            }
        }));

        await saveStats({
            iptv_live_streams: totalLiveStreams,
            iptv_panel_details: panelDetails,
            iptv_panels_data: panelsData
        });

        console.log(`[DASHBOARD REFRESH] IPTV stats refreshed: ${totalLiveStreams} live streams across ${panels.length} panels`);

    } catch (error) {
        console.error('[DASHBOARD REFRESH] Error refreshing IPTV stats:', error.message);
    }
}

/**
 * Run full dashboard refresh
 */
async function runFullRefresh() {
    if (isRefreshing) {
        console.log('[DASHBOARD REFRESH] Refresh already in progress, skipping...');
        return;
    }

    isRefreshing = true;
    const startTime = Date.now();
    console.log('[DASHBOARD REFRESH] ========================================');
    console.log('[DASHBOARD REFRESH] Starting full dashboard refresh...');

    try {
        // Run all refreshes in parallel for speed
        await Promise.all([
            refreshDatabaseStats(),
            refreshPlexStats(),
            refreshIPTVStats()
        ]);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[DASHBOARD REFRESH] ✓ Full refresh completed in ${duration}s`);
        console.log('[DASHBOARD REFRESH] ========================================');

    } catch (error) {
        console.error('[DASHBOARD REFRESH] Error during refresh:', error);
    } finally {
        isRefreshing = false;
    }
}

/**
 * Get all cached stats from database
 */
async function getCachedStats() {
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
        console.error('[DASHBOARD REFRESH] Error getting cached stats:', error);
        return { stats: {}, updated_at: null };
    }
}

/**
 * Initialize the background refresh job
 */
function initializeDashboardStatsRefresh() {
    console.log('[DASHBOARD REFRESH] Initializing background refresh job...');
    console.log(`[DASHBOARD REFRESH] Refresh interval: ${REFRESH_INTERVAL / 1000 / 60} minutes`);

    // Run initial refresh after a short delay (let app start up first)
    setTimeout(() => {
        console.log('[DASHBOARD REFRESH] Running initial refresh...');
        runFullRefresh();
    }, 5000);

    // Schedule periodic refreshes
    refreshTimer = setInterval(() => {
        runFullRefresh();
    }, REFRESH_INTERVAL);

    console.log('[DASHBOARD REFRESH] Background job initialized');
}

/**
 * Stop the background refresh job
 */
function stopDashboardStatsRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
        console.log('[DASHBOARD REFRESH] Background job stopped');
    }
}

module.exports = {
    initializeDashboardStatsRefresh,
    stopDashboardStatsRefresh,
    runFullRefresh,
    getCachedStats,
    saveStat,
    saveStats,
    refreshDatabaseStats,
    refreshPlexStats,
    refreshIPTVStats
};
