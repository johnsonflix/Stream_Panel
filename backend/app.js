/**
 * StreamPanel - Main Express Application
 *
 * Multi-server subscription management system
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const fs = require('fs');

// === CRASH PROTECTION ===
const logsDir = require('path').join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
let isLoggingCrash = false; // Prevent infinite loop on EPIPE errors
function logCrash(type, error) {
    if (isLoggingCrash) return; // Prevent cascading errors
    isLoggingCrash = true;
    const ts = new Date().toISOString();
    try { console.error(`\n${'!'.repeat(60)}\n[${ts}] ${type}\n`, error, `\n${'!'.repeat(60)}\n`); } catch(e) {}
    try { fs.appendFileSync(require('path').join(logsDir, 'crash.log'), `[${ts}] ${type}\n${error.stack||error}\n${'='.repeat(60)}\n`); } catch(e) {}
    isLoggingCrash = false;
}
process.on('uncaughtException', (e) => logCrash('UNCAUGHT EXCEPTION', e));
process.on('unhandledRejection', (r) => logCrash('UNHANDLED REJECTION', r instanceof Error ? r : new Error(String(r))));
process.on('SIGTERM', () => { console.log('[SHUTDOWN] SIGTERM received'); process.exit(0); });
process.on('SIGINT', () => { console.log('[SHUTDOWN] SIGINT received'); process.exit(0); });
console.log('[STARTUP] Crash protection enabled');
// === END CRASH PROTECTION ===

// === FILE LOGGER ===
// Initialize logger to capture all console output to log files
const { initializeLogger } = require('./utils/logger');
initializeLogger();
// === END FILE LOGGER ===

const app = express();

// Initialize scheduled jobs
const { initializeTagAutoAssignment } = require('./jobs/tag-auto-assignment');
const { initializeIPTVEditorAutoUpdater } = require('./jobs/iptv-editor-auto-updater');
const { initializeIPTVPanelAutoSync } = require('./jobs/iptv-panel-auto-sync');
const { initializePlexAutoSync } = require('./jobs/plex-auto-sync');
const { initializeWatchStatsAutoRefresh } = require('./jobs/watch-stats-auto-refresh');
const { initializeServiceCancellationProcessor } = require('./jobs/service-cancellation-processor');
const { initializeDashboardStatsRefresh, runFullRefresh } = require('./jobs/dashboard-stats-refresh');
const { initializeGuideCacheRefresh, preloadAllGuideCaches } = require('./jobs/guide-cache-refresh-scheduler');
// Note: plex-library-access-sync is now integrated with plex-sync-scheduler
// and runs as part of each server's sync schedule (hourly/daily/weekly).
const emailScheduler = require('./services/email/EmailScheduler');
const { initializeScheduler } = require('./services/plex-sync-scheduler');

// Dashboard cache management
const { dashboardStatsCache, iptvPanelsCache, saveCacheToDatabase, loadCacheFromDatabase, loadIptvPanelsCacheFromDatabase, getCachedStatsFromDatabase, getCacheAge } = require('./utils/dashboard-cache');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve uploaded files (branding assets, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
const authRoutes = require('./routes/routes-auth');
const appUsersRoutes = require('./routes/app-users-routes');
const plexServersRoutes = require('./routes/plex-servers-routes');
const plexPackagesRoutes = require('./routes/plex-packages-routes');
const iptvPanelsRoutes = require('./routes/iptv-panels-routes');
const iptvPlaylistsRoutes = require('./routes/iptv-playlists-routes');
const iptvEditorRoutes = require('./routes/iptv-editor-routes');
const iptvEditorPlaylistsRoutes = require('./routes/iptv-editor-playlists-routes');
const tagsRoutes = require('./routes/tags-routes');
const usersRoutes = require('./routes/users-routes');
const csvImportRoutes = require('./routes/csv-import-routes');
const settingsRoutes = require('./routes/settings-routes');
const subscriptionPlansRoutes = require('./routes/subscription-plans-routes');
const paymentProvidersRoutes = require('./routes/payment-providers-routes');
const emailTemplatesRoutes = require('./routes/email-templates-routes');
const emailSchedulesRoutes = require('./routes/email-schedules-routes');
const emailSendRoutes = require('./routes/email-send-routes');
const plexSsoRoutes = require('./routes/plex-sso-routes');
const portalAuthRoutes = require('./routes/portal-auth-routes');
const portalRoutes = require('./routes/portal-routes');
const portalAdminRoutes = require('./routes/portal-admin-routes');
const portalPublicRoutes = require('./routes/portal-public-routes');
const serviceRequestsRoutes = require('./routes/service-requests-routes');
const jobsRoutes = require('./routes/jobs-routes');
const ownersRoutes = require('./routes/owners-routes');
const logsRoutes = require('./routes/logs-routes');
const updatesRoutes = require('./routes/updates-routes');

// Authentication routes (no auth required for these endpoints)
app.use('/api/v2/auth', authRoutes);
app.use('/api/v2/auth/plex', plexSsoRoutes);
app.use('/api/v2/portal/auth', portalAuthRoutes);

// Public routes (no auth required - shareable guides, etc.)
app.use('/api/v2/public', portalPublicRoutes);

// Portal routes (authenticated via portal session)
app.use('/api/v2/portal', portalRoutes);

// Admin portal management routes
app.use('/api/v2/admin/portal', portalAdminRoutes);

// Other API routes (TODO: add auth middleware as needed)
app.use('/api/v2/app-users', appUsersRoutes); // App login accounts (admins/staff) - also serve as owners/resellers
app.use('/api/v2/users', usersRoutes); // Subscription users (customers)
app.use('/api/v2/plex-servers', plexServersRoutes);
app.use('/api/v2/plex-packages', plexPackagesRoutes);
app.use('/api/v2/iptv-panels', iptvPanelsRoutes);
app.use('/api/v2/iptv-playlists', iptvPlaylistsRoutes);
app.use('/api/v2/iptv-editor', iptvEditorRoutes);
app.use('/api/v2/iptv-editor/playlists', iptvEditorPlaylistsRoutes);
app.use('/api/v2/tags', tagsRoutes);
app.use('/api/v2/csv-import', csvImportRoutes);
app.use('/api/v2/settings', settingsRoutes);
app.use('/api/v2/subscription-plans', subscriptionPlansRoutes);
app.use('/api/v2/payment-providers', paymentProvidersRoutes);
app.use('/api/v2/email-templates', emailTemplatesRoutes);
app.use('/api/v2/email-schedules', emailSchedulesRoutes);
app.use('/api/v2/email/send', emailSendRoutes);
app.use('/api/v2/service-requests', serviceRequestsRoutes);
app.use('/api/v2/jobs', jobsRoutes);
app.use('/api/v2/owners', ownersRoutes);
app.use('/api/v2/logs', logsRoutes);
app.use('/api/v2/updates', updatesRoutes);

// Health check endpoint
app.get('/api/v2/health', (req, res) => {
    res.json({
        success: true,
        message: 'StreamPanel API is running',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

const CACHE_DURATION = 30 * 1000; // 30 seconds for live session data

// INSTANT stats from pre-cached database table
// Stats are refreshed every 5 minutes by the background job
// This returns instantly with all pre-computed data
app.get('/api/v2/dashboard/quick-stats', async (req, res) => {
    try {
        console.log('[DASHBOARD QUICK] Fetching pre-cached stats...');

        // Get stats from the dashboard_cached_stats table (updated every 5 minutes)
        const { stats: cachedStats, updated_at } = await getCachedStatsFromDatabase();

        // If we have cached stats, return them immediately
        if (cachedStats && Object.keys(cachedStats).length > 0) {
            const cacheAgeSeconds = await getCacheAge();
            console.log(`[DASHBOARD QUICK] ✓ Returning cached stats (age: ${cacheAgeSeconds}s)`);

            res.json({
                success: true,
                instant: true,
                cached: true,
                cache_age_seconds: cacheAgeSeconds,
                stats: {
                    // Database stats (from cache)
                    total_users: cachedStats.total_users || 0,
                    active_plex_users: cachedStats.active_plex_users || 0,
                    active_iptv_users: cachedStats.active_iptv_users || 0,
                    iptv_editor_users: cachedStats.iptv_editor_users || 0,
                    plex_servers_count: cachedStats.plex_servers_count || 0,
                    iptv_panels_count: cachedStats.iptv_panels_count || 0,
                    pending_plex_requests: cachedStats.pending_plex_requests || 0,
                    pending_iptv_requests: cachedStats.pending_iptv_requests || 0,
                    expiring_soon: cachedStats.expiring_soon || 0,
                    expiring_soon_month: cachedStats.expiring_soon_month || 0,
                    expiring_plex_week: cachedStats.expiring_plex_week || 0,
                    expiring_iptv_week: cachedStats.expiring_iptv_week || 0,
                    new_users_week: cachedStats.new_users_week || 0,
                    new_users_month: cachedStats.new_users_month || 0,

                    // Server/panel details (from cache)
                    plex_server_details: cachedStats.plex_server_details || [],
                    iptv_panel_details: cachedStats.iptv_panel_details || [],
                    iptv_panels_data: cachedStats.iptv_panels_data || null,

                    // Live stats (from cache - updated every 5 minutes)
                    live_plex_users: cachedStats.live_plex_users || 0,
                    total_unique_plex_users: cachedStats.total_unique_plex_users || 0,
                    live_pending_invites: cachedStats.live_pending_invites || 0,
                    plex_servers_online: cachedStats.plex_servers_online || 0,
                    plex_servers_offline: cachedStats.plex_servers_offline || 0,
                    iptv_live_streams: cachedStats.iptv_live_streams || 0,

                    // Session data is still loaded on-demand (not from cache)
                    live_sessions: dashboardStatsCache.data?.stats?.live_sessions || [],
                    total_live_sessions: cachedStats.live_plex_users || 0,
                    total_bandwidth_mbps: cachedStats.total_bandwidth_mbps || '0.0',
                    wan_bandwidth_mbps: cachedStats.wan_bandwidth_mbps || '0.0',
                    direct_plays_count: cachedStats.direct_plays_count || 0,
                    direct_streams_count: cachedStats.direct_streams_count || 0,
                    transcodes_count: cachedStats.transcodes_count || 0,

                    // Aggregate stats
                    most_popular_content: cachedStats.most_popular_content || [],
                    most_watched_content: cachedStats.most_watched_content || [],
                    most_active_users: cachedStats.most_active_users || [],
                    most_active_platforms: cachedStats.most_active_platforms || []
                }
            });
            return;
        }

        // Fallback: No cached stats yet, run database queries directly
        // This only happens on first run before background job has executed
        console.log('[DASHBOARD QUICK] No cached stats, running live queries...');
        const db = require('./database-config');

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
            plexServers,
            iptvPanels,
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
            db.query(`SELECT id, name, server_id, health_status FROM plex_servers WHERE is_active = 1 ORDER BY name`),
            db.query(`SELECT id, name, panel_type, is_active, current_credit_balance FROM iptv_panels WHERE is_active = 1 ORDER BY name`),
            db.query(`SELECT COUNT(*) as count FROM portal_service_requests WHERE payment_status IN ('pending', 'submitted') AND service_type = 'plex'`).catch(() => [{ count: 0 }]),
            db.query(`SELECT COUNT(*) as count FROM portal_service_requests WHERE payment_status IN ('pending', 'submitted') AND service_type = 'iptv'`).catch(() => [{ count: 0 }])
        ]);

        console.log('[DASHBOARD QUICK] ✓ Database queries complete (fallback mode)');

        res.json({
            success: true,
            instant: true,
            cached: false,
            stats: {
                total_users: totalUsersResult[0].count,
                active_plex_users: plexUsersResult[0].count,
                active_iptv_users: iptvUsersResult[0].count,
                iptv_editor_users: editorUsersResult[0].count,
                plex_servers_count: plexServersResult[0].count,
                iptv_panels_count: iptvPanelsResult[0].count,
                pending_plex_requests: pendingPlexRequestsResult[0]?.count || 0,
                pending_iptv_requests: pendingIptvRequestsResult[0]?.count || 0,
                expiring_soon: expiringSoonResult[0].count,
                expiring_soon_month: expiringSoonMonthResult[0].count,
                expiring_plex_week: expiringPlexWeekResult[0].count,
                expiring_iptv_week: expiringIptvWeekResult[0].count,
                new_users_week: recentUsersResult[0].count,
                new_users_month: recentUsersMonthResult[0].count,
                plex_server_details: plexServers.map(s => ({
                    id: s.id,
                    name: s.name,
                    status: s.health_status || 'unknown',
                    users: 0,
                    pending: 0,
                    activeSessions: 0
                })),
                iptv_panel_details: iptvPanels.map(p => ({
                    id: p.id,
                    name: p.name,
                    panel_type: p.panel_type,
                    status: p.is_active ? 'active' : 'inactive',
                    credits: Math.round(p.current_credit_balance || 0),
                    users: 0,
                    activeUsers: 0,
                    liveStreams: 0
                })),
                // Placeholder values for live stats until background job runs
                live_plex_users: 0,
                total_unique_plex_users: 0,
                live_pending_invites: 0,
                plex_servers_online: 0,
                plex_servers_offline: 0,
                iptv_live_streams: 0,
                live_sessions: [],
                total_live_sessions: 0,
                total_bandwidth_mbps: '0.0',
                wan_bandwidth_mbps: '0.0',
                direct_plays_count: 0,
                direct_streams_count: 0,
                transcodes_count: 0,
                most_popular_content: [],
                most_watched_content: [],
                most_active_users: [],
                most_active_platforms: []
            }
        });

    } catch (error) {
        console.error('[DASHBOARD QUICK] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Track if a full refresh is in progress and when it last completed
let isFullRefreshing = false;
let lastRefreshCompletedAt = 0;

// Dashboard stats endpoint - returns database cache instantly, triggers background refresh
app.get('/api/v2/dashboard/stats', async (req, res) => {
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

    try {
        // ALWAYS get stats from database cache first (fast!)
        const { stats: cachedStats, updated_at } = await getCachedStatsFromDatabase();

        // Calculate seconds since last successful refresh (not from database, track in memory)
        const secondsSinceLastRefresh = lastRefreshCompletedAt ? Math.floor((Date.now() - lastRefreshCompletedAt) / 1000) : Infinity;

        console.log(`[DASHBOARD] Serving stats (lastRefresh: ${secondsSinceLastRefresh}s ago, force=${forceRefresh}, isRefreshing=${isFullRefreshing})`);

        // Determine if we need to trigger a background refresh
        // Only trigger if: (force=true AND not already refreshing) OR (more than 30s since last refresh AND not already refreshing)
        let shouldTriggerRefresh = false;
        if (!isFullRefreshing) {
            if (forceRefresh) {
                shouldTriggerRefresh = true;
            } else if (secondsSinceLastRefresh > 30) {
                shouldTriggerRefresh = true;
            }
        }

        if (shouldTriggerRefresh) {
            console.log('[DASHBOARD] Triggering FULL background refresh via runFullRefresh()...');
            isFullRefreshing = true;
            // Run the full refresh (with Plex/IPTV API calls) in background
            runFullRefresh().finally(() => {
                isFullRefreshing = false;
                lastRefreshCompletedAt = Date.now();
                console.log('[DASHBOARD] Full background refresh completed, lastRefreshCompletedAt updated');
            });
        } else if (isFullRefreshing) {
            console.log('[DASHBOARD] Full refresh already in progress');
        }

        // Build stats response from database cache
        const stats = {
            // Database stats
            total_users: cachedStats.total_users || 0,
            active_plex_users: cachedStats.active_plex_users || 0,
            active_iptv_users: cachedStats.active_iptv_users || 0,
            iptv_editor_users: cachedStats.iptv_editor_users || 0,
            plex_servers_count: cachedStats.plex_servers_count || 0,
            iptv_panels_count: cachedStats.iptv_panels_count || 0,
            pending_plex_requests: cachedStats.pending_plex_requests || 0,
            pending_iptv_requests: cachedStats.pending_iptv_requests || 0,
            expiring_soon: cachedStats.expiring_soon || 0,
            expiring_soon_month: cachedStats.expiring_soon_month || 0,
            expiring_plex_week: cachedStats.expiring_plex_week || 0,
            expiring_iptv_week: cachedStats.expiring_iptv_week || 0,
            new_users_week: cachedStats.new_users_week || 0,
            new_users_month: cachedStats.new_users_month || 0,

            // Server/panel details
            plex_server_details: cachedStats.plex_server_details || [],
            iptv_panel_details: cachedStats.iptv_panel_details || [],
            iptv_panels_data: cachedStats.iptv_panels_data || null,

            // Live stats
            live_plex_users: cachedStats.live_plex_users || 0,
            total_unique_plex_users: cachedStats.total_unique_plex_users || 0,
            live_pending_invites: cachedStats.live_pending_invites || 0,
            plex_servers_online: cachedStats.plex_servers_online || 0,
            plex_servers_offline: cachedStats.plex_servers_offline || 0,
            iptv_live_streams: cachedStats.iptv_live_streams || 0,

            // Session data
            live_sessions: cachedStats.live_sessions || [],
            total_live_sessions: cachedStats.live_plex_users || 0,
            total_bandwidth_mbps: cachedStats.total_bandwidth_mbps || '0.0',
            wan_bandwidth_mbps: cachedStats.wan_bandwidth_mbps || '0.0',
            direct_plays_count: cachedStats.direct_plays_count || 0,
            direct_streams_count: cachedStats.direct_streams_count || 0,
            transcodes_count: cachedStats.transcodes_count || 0,

            // Aggregate stats
            most_popular_content: cachedStats.most_popular_content || [],
            most_watched_content: cachedStats.most_watched_content || [],
            most_active_users: cachedStats.most_active_users || [],
            most_active_platforms: cachedStats.most_active_platforms || []
        };

        return res.json({
            success: true,
            cached: !forceRefresh,
            refreshing: isFullRefreshing, // Only true while refresh is actually in progress
            cache_age_seconds: secondsSinceLastRefresh,
            stats: stats
        });

    } catch (error) {
        console.error('[DASHBOARD] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// OLD endpoint kept for backwards compatibility - redirects to new logic above
app.get('/api/v2/dashboard/stats-old', async (req, res) => {
    const now = Date.now();
    const cacheAge = dashboardStatsCache.timestamp ? now - dashboardStatsCache.timestamp : Infinity;
    const isCacheValid = cacheAge < CACHE_DURATION;
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

    // ALWAYS return cached data immediately if available (unless forcing refresh)
    if (dashboardStatsCache.data && !forceRefresh) {
        console.log(`[DASHBOARD-OLD] Serving cached stats (age: ${Math.round(cacheAge / 1000)}s)`);

        // If cache is stale and not already refreshing, trigger background refresh
        if (!isCacheValid && !dashboardStatsCache.isRefreshing) {
            console.log('[DASHBOARD-OLD] Cache is stale, triggering background refresh...');
            // Start background refresh (don't await - let it run async)
            refreshDashboardStatsInBackground();
        }

        return res.json({
            ...dashboardStatsCache.data,
            cached: true,
            cache_age_seconds: Math.round(cacheAge / 1000)
        });
    }

    // No cached data available - need to generate fresh stats
    // If already refreshing, tell client cached data will be available soon
    if (dashboardStatsCache.isRefreshing) {
        console.log('[DASHBOARD-OLD] Initial stats generation in progress...');
        return res.status(202).json({
            success: false,
            message: 'Dashboard statistics are being generated. Please try again in a moment.',
            refreshing: true
        });
    }

    // Generate fresh stats for the first time (blocking)
    dashboardStatsCache.isRefreshing = true;
    console.log('[DASHBOARD-OLD] Generating initial stats...');

    try {
        const db = require('./database-config');
        const axios = require('axios');
        const xml2js = require('xml2js');

        // Get total users
        const totalUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users WHERE is_active = 1
        `);

        // Get active Plex users
        const plexUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE plex_enabled = 1 AND plex_expiration_date > datetime('now')
        `);

        // Get active IPTV users
        const iptvUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE iptv_enabled = 1 AND iptv_expiration_date > datetime('now')
        `);

        // Get IPTV Editor users
        const editorUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users WHERE iptv_editor_enabled = 1
        `);

        // Get total Plex servers
        const plexServersResult = await db.query(`
            SELECT COUNT(*) as count FROM plex_servers WHERE is_active = 1
        `);

        // Get total IPTV panels
        const iptvPanelsResult = await db.query(`
            SELECT COUNT(*) as count FROM iptv_panels WHERE is_active = 1
        `);

        // Get expiring soon (next 7 days)
        const expiringSoonResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE (
                (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
                OR
                (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
            )
        `);

        // Get recent users (last 7 days)
        const recentUsersResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE created_at >= datetime('now', '-7 days')
        `);

        // Get recent users (last 30 days / this month)
        const recentUsersMonthResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE created_at >= datetime('now', '-30 days')
        `);

        // Get expiring soon (next 30 days)
        const expiringSoonMonthResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE (
                (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
                OR
                (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
            )
        `);

        // Get expiring Plex users (next 7 days)
        const expiringPlexWeekResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')
        `);

        // Get expiring IPTV users (next 7 days)
        const expiringIptvWeekResult = await db.query(`
            SELECT COUNT(*) as count FROM users
            WHERE iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')
        `);

        // Get all active Plex servers for live stats
        const plexServers = await db.query(`
            SELECT id, name, url, server_id, token, health_status
            FROM plex_servers
            WHERE is_active = 1
            ORDER BY name
        `);

        // Fetch live stats from each Plex server IN PARALLEL for faster loading
        const parser = new xml2js.Parser();

        console.log(`[DASHBOARD] Fetching stats from ${plexServers.length} Plex servers in parallel...`);

        // Process all servers in parallel using Promise.all
        const serverResults = await Promise.all(plexServers.map(async (server) => {
            try {
                const serverUsers = new Set();
                const serverPendingInvites = new Set();
                const serverLiveSessions = [];

                // Get shared users from Plex.tv
                const sharedUsersResponse = await axios.get(`https://plex.tv/api/servers/${server.server_id}/shared_servers`, {
                    params: { 'X-Plex-Token': server.token },
                    timeout: 5000
                });

                const result = await parser.parseStringPromise(sharedUsersResponse.data);
                const sharedServers = result.MediaContainer.SharedServer || [];

                // Collect users for this server
                sharedServers.forEach(user => {
                    const email = user.$.email || user.$.username;
                    if (email) {
                        serverUsers.add(email.toLowerCase());
                    }
                });

                const userCount = sharedServers.length;

                // Get pending invites
                const invitesResponse = await axios.get('https://plex.tv/api/invites/requested', {
                    params: { 'X-Plex-Token': server.token },
                    timeout: 5000
                });

                const invitesResult = await parser.parseStringPromise(invitesResponse.data);
                const invites = invitesResult.MediaContainer?.Invite || [];

                // Collect invites for this server
                invites.forEach(invite => {
                    const email = invite.$.email;
                    if (email) {
                        serverPendingInvites.add(email.toLowerCase());
                    }
                });

                const pendingCount = invites.length;

                // Get active sessions (live streams) - try Plex.tv API first, fallback to direct
                let sessionCount = 0;
                let sessionsData = null;

                try {
                    // Try Plex.tv API first
                    const plexTvUrl = `https://plex.tv/api/servers/${server.server_id}/status/sessions`;
                    console.log(`[SESSION] Trying Plex.tv API for ${server.name}: ${plexTvUrl}`);
                    const plexTvResponse = await axios.get(plexTvUrl, {
                        headers: {
                            'X-Plex-Token': server.token,
                            'Accept': 'application/xml'
                        },
                        timeout: 10000
                    });
                    sessionsData = plexTvResponse.data;
                    console.log(`[SESSION] ✓ Plex.tv API succeeded for ${server.name}`);

                } catch (plexTvError) {
                    console.log(`[SESSION] Plex.tv API failed for ${server.name}: ${plexTvError.message}`);
                    // Fallback to direct server connection
                    try {
                        const directUrl = `${server.url}/status/sessions`;
                        console.log(`[SESSION] Trying direct server for ${server.name}: ${directUrl}`);
                        const directResponse = await axios.get(directUrl, {
                            headers: {
                                'X-Plex-Token': server.token,
                                'Accept': 'application/xml'
                            },
                            timeout: 15000
                        });
                        sessionsData = directResponse.data;
                        console.log(`[SESSION] ✓ Direct server succeeded for ${server.name}`);
                    } catch (directError) {
                        console.error(`[SESSION] ✗ Both endpoints failed for ${server.name}. Plex.tv: ${plexTvError.message}, Direct: ${directError.message}`);
                    }
                }

                // Parse sessions data if we got it
                if (sessionsData) {
                    try {
                        const sessionsResult = await parser.parseStringPromise(sessionsData);
                        const videos = sessionsResult.MediaContainer?.Video;

                        if (videos && Array.isArray(videos)) {
                            sessionCount = videos.length;
                        } else if (videos) {
                            sessionCount = 1;
                        } else {
                            sessionCount = 0;
                        }

                        // Parse session details with comprehensive metadata
                        if (videos) {
                            const videoArray = Array.isArray(videos) ? videos : [videos];
                            videoArray.forEach(video => {
                                try {
                                    const attrs = video.$ || {};
                                    const userInfo = video.User && video.User[0] && video.User[0].$ ? video.User[0].$ : {};
                                    const playerInfo = video.Player && video.Player[0] && video.Player[0].$ ? video.Player[0].$ : {};
                                    const mediaArray = video.Media || [];
                                    const media = mediaArray[0] || {};
                                    const mediaAttrs = media.$ || {};
                                    const partArray = media.Part || [];
                                    const part = partArray[0] || {};
                                    const partAttrs = part.$ || {};
                                    const streamArray = part.Stream || [];

                                    // Parse video/audio streams
                                    let videoStream = null;
                                    let audioStream = null;
                                    streamArray.forEach(stream => {
                                        const streamAttrs = stream.$ || {};
                                        if (streamAttrs.streamType === '1') videoStream = streamAttrs;
                                        else if (streamAttrs.streamType === '2') audioStream = streamAttrs;
                                    });

                                    // Build quality string
                                    let quality = 'Unknown';
                                    if (mediaAttrs.bitrate) {
                                        const bitrateMbps = (parseInt(mediaAttrs.bitrate) / 1000).toFixed(1);
                                        quality = `${bitrateMbps} Mbps`;
                                    }

                                    // Build video codec string
                                    let videoCodec = 'Unknown';
                                    if (videoStream) {
                                        const codec = videoStream.codec?.toUpperCase() || 'Unknown';
                                        const height = parseInt(videoStream.height) || 0;
                                        let resolution = '';
                                        if (height >= 2160) resolution = '4K';
                                        else if (height >= 1080) resolution = '1080p';
                                        else if (height >= 720) resolution = '720p';
                                        else if (height > 0) resolution = `${height}p`;
                                        videoCodec = resolution ? `${codec} ${resolution}` : codec;
                                    }

                                    // Stream decision
                                    let streamDecision = 'Unknown';
                                    if (partAttrs.decision) {
                                        const decision = partAttrs.decision.toLowerCase();
                                        if (decision === 'directplay') streamDecision = 'Direct Play';
                                        else if (decision === 'directstream') streamDecision = 'Direct Stream';
                                        else if (decision === 'transcode') streamDecision = 'Transcode';
                                    }

                                    // Build thumbnail URL - prefer poster artwork
                                    let thumbnail = null;
                                    if (attrs.type === 'episode') {
                                        // For TV episodes, use the show's poster (grandparentThumb) if available
                                        if (attrs.grandparentThumb) {
                                            thumbnail = `${server.url}${attrs.grandparentThumb}?X-Plex-Token=${server.token}`;
                                        } else if (attrs.thumb) {
                                            thumbnail = `${server.url}${attrs.thumb}?X-Plex-Token=${server.token}`;
                                        }
                                    } else {
                                        // For movies, use thumb (which should be the poster)
                                        if (attrs.thumb) {
                                            thumbnail = `${server.url}${attrs.thumb}?X-Plex-Token=${server.token}`;
                                        }
                                    }

                                    const sessionData = {
                                        serverName: server.name,
                                        user: userInfo.title || 'Unknown',
                                        title: attrs.title || 'Unknown',
                                        type: attrs.type || 'unknown',
                                        year: attrs.year || null,
                                        state: playerInfo.state || 'unknown',
                                        player: playerInfo.title || playerInfo.product || 'Unknown',
                                        progress: attrs.viewOffset && attrs.duration ?
                                            Math.round((parseInt(attrs.viewOffset) / parseInt(attrs.duration)) * 100) : 0,
                                        duration: attrs.duration ? Math.round(parseInt(attrs.duration) / 60000) : 0, // in minutes
                                        quality: quality,
                                        bitrateMbps: mediaAttrs.bitrate ? parseFloat((parseInt(mediaAttrs.bitrate) / 1000).toFixed(1)) : 0,
                                        videoCodec: videoCodec,
                                        streamDecision: streamDecision,
                                        location: playerInfo.local === '1' ? 'LAN' : 'WAN',
                                        ipAddress: playerInfo.address || null,
                                        thumbnail: thumbnail,
                                        // Additional metadata
                                        grandparentTitle: attrs.grandparentTitle || null, // TV show name
                                        parentTitle: attrs.parentTitle || null, // Season name
                                        originalTitle: attrs.originalTitle || null,
                                        parentIndex: attrs.parentIndex || null, // Season number
                                        index: attrs.index || null, // Episode number
                                        // Stream format details
                                        container: mediaAttrs.container || null,
                                        videoFrameRate: videoStream?.frameRate || null,
                                        audioCodec: audioStream?.codec?.toUpperCase() || null,
                                        audioChannels: audioStream?.channels || null
                                    };

                                    serverLiveSessions.push(sessionData);
                                } catch (parseError) {
                                    console.error('Error parsing session:', parseError.message);
                                }
                            });
                        }
                    } catch (parseError) {
                        console.error(`Error parsing sessions XML for ${server.name}:`, parseError.message);
                    }
                }

                // Get library information for this server
                let libraries = [];
                try {
                    const libResponse = await axios.get(`${server.url}/library/sections`, {
                        headers: {
                            'X-Plex-Token': server.token,
                            'Accept': 'application/xml'
                        },
                        timeout: 10000
                    });

                    const libResult = await parser.parseStringPromise(libResponse.data);
                    const directories = libResult.MediaContainer.Directory || [];

                    // Fetch item counts for each library in parallel
                    const libraryPromises = directories.map(async (dir) => {
                        try {
                            const countResponse = await axios.get(`${server.url}/library/sections/${dir.$.key}/all`, {
                                headers: {
                                    'X-Plex-Token': server.token,
                                    'Accept': 'application/xml'
                                },
                                params: {
                                    'X-Plex-Container-Start': 0,
                                    'X-Plex-Container-Size': 0
                                },
                                timeout: 5000
                            });

                            const countResult = await parser.parseStringPromise(countResponse.data);
                            const totalSize = parseInt(countResult.MediaContainer.$.totalSize) || 0;

                            const library = {
                                key: dir.$.key,
                                title: dir.$.title,
                                type: dir.$.type,
                                count: totalSize
                            };

                            // For music libraries, also fetch album count
                            if (dir.$.type === 'artist') {
                                try {
                                    const albumResponse = await axios.get(`${server.url}/library/sections/${dir.$.key}/albums`, {
                                        headers: {
                                            'X-Plex-Token': server.token,
                                            'Accept': 'application/xml'
                                        },
                                        params: {
                                            'X-Plex-Container-Start': 0,
                                            'X-Plex-Container-Size': 0
                                        },
                                        timeout: 5000
                                    });

                                    const albumResult = await parser.parseStringPromise(albumResponse.data);
                                    const albumCount = parseInt(albumResult.MediaContainer.$.totalSize) || 0;

                                    library.artistCount = totalSize;
                                    library.albumCount = albumCount;
                                } catch (albumError) {
                                    console.error(`Error fetching album count for ${dir.$.title}:`, albumError.message);
                                    library.artistCount = totalSize;
                                    library.albumCount = 0;
                                }
                            }

                            // For TV show libraries, also fetch season and episode counts
                            if (dir.$.type === 'show') {
                                try {
                                    const showsResponse = await axios.get(`${server.url}/library/sections/${dir.$.key}/all`, {
                                        headers: {
                                            'X-Plex-Token': server.token,
                                            'Accept': 'application/xml'
                                        },
                                        timeout: 10000
                                    });

                                    const showsResult = await parser.parseStringPromise(showsResponse.data);
                                    let totalSeasons = 0;
                                    let totalEpisodes = 0;

                                    if (showsResult.MediaContainer.Directory) {
                                        const shows = Array.isArray(showsResult.MediaContainer.Directory)
                                            ? showsResult.MediaContainer.Directory
                                            : [showsResult.MediaContainer.Directory];

                                        for (const show of shows) {
                                            // childCount = seasons, leafCount = episodes
                                            totalSeasons += parseInt(show.$.childCount) || 0;
                                            totalEpisodes += parseInt(show.$.leafCount) || 0;
                                        }
                                    }

                                    library.showCount = totalSize;
                                    library.seasonCount = totalSeasons;
                                    library.episodeCount = totalEpisodes;
                                } catch (showError) {
                                    console.error(`Error fetching season/episode counts for ${dir.$.title}:`, showError.message);
                                    library.showCount = totalSize;
                                    library.seasonCount = 0;
                                    library.episodeCount = 0;
                                }
                            }

                            return library;
                        } catch (countError) {
                            return {
                                key: dir.$.key,
                                title: dir.$.title,
                                type: dir.$.type,
                                count: 0
                            };
                        }
                    });

                    libraries = await Promise.all(libraryPromises);
                } catch (libError) {
                    console.error(`Error fetching libraries for ${server.name}:`, libError.message);
                }

                console.log(`[DASHBOARD] ✓ ${server.name}: ${userCount} users, ${sessionCount} sessions`);

                return {
                    success: true,
                    serverStat: {
                        id: server.id,
                        name: server.name,
                        status: 'online',
                        users: userCount,
                        pending: pendingCount,
                        activeSessions: sessionCount,
                        libraries: libraries,
                        cpu_percent: null,
                        memory_percent: null,
                        bandwidth_mbps: null
                    },
                    users: serverUsers,
                    pendingInvites: serverPendingInvites,
                    liveSessions: serverLiveSessions
                };

            } catch (error) {
                console.error(`[DASHBOARD] ✗ Error fetching stats for server ${server.name}:`, error.message);

                return {
                    success: false,
                    serverStat: {
                        id: server.id,
                        name: server.name,
                        status: 'offline',
                        users: 0,
                        pending: 0,
                        activeSessions: 0,
                        libraries: [],
                        cpu_percent: null,
                        memory_percent: null,
                        bandwidth_mbps: null
                    },
                    users: new Set(),
                    pendingInvites: new Set(),
                    liveSessions: []
                };
            }
        }));

        // Aggregate results from all servers
        const allUsers = new Set();
        const allPendingInvites = new Set();
        const allLiveSessions = [];
        const serverStats = [];
        let totalActiveSessions = 0;
        let onlineServers = 0;
        let offlineServers = 0;

        serverResults.forEach(result => {
            // Aggregate users (deduplicated across servers)
            result.users.forEach(email => allUsers.add(email));

            // Aggregate pending invites (deduplicated across servers)
            result.pendingInvites.forEach(email => allPendingInvites.add(email));

            // Aggregate live sessions
            allLiveSessions.push(...result.liveSessions);
            totalActiveSessions += result.serverStat.activeSessions;

            // Count online/offline servers
            if (result.success) {
                onlineServers++;
            } else {
                offlineServers++;
            }

            // Add to server stats
            serverStats.push(result.serverStat);
        });

        console.log(`[DASHBOARD] Aggregated: ${allUsers.size} unique users, ${totalActiveSessions} sessions, ${onlineServers}/${plexServers.length} servers online`);

        // DEBUG: Log first session if any
        if (allLiveSessions.length > 0) {
            const firstSession = allLiveSessions[0];
            console.log('[DEBUG] First session data:', {
                title: firstSession.title,
                bitrateMbps: firstSession.bitrateMbps,
                container: firstSession.container,
                videoCodec: firstSession.videoCodec,
                audioCodec: firstSession.audioCodec,
                audioChannels: firstSession.audioChannels,
                ipAddress: firstSession.ipAddress,
                location: firstSession.location
            });
        }

        // Get resource usage from Python script
        try {
            const { spawn } = require('child_process');
            const path = require('path');

            const pythonScriptPath = path.join(__dirname, '../plex_resource_monitor.py');
            console.log(`[RESOURCE] Calling Python script: ${pythonScriptPath}`);

            const pythonExecutable = process.env.PYTHON_PATH || 'python3';
            const pythonProcess = spawn(pythonExecutable, [pythonScriptPath], {
                timeout: 30000 // 30 second timeout
            });

            let pythonOutput = '';
            let pythonError = '';

            pythonProcess.stdout.on('data', (data) => {
                pythonOutput += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                pythonError += data.toString();
                console.log(`[RESOURCE] Python stderr: ${data.toString().trim()}`);
            });

            await new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const resourceData = JSON.parse(pythonOutput);
                            console.log(`[RESOURCE] Python script succeeded, processing data...`);

                            // Debug: Log database server names
                            console.log(`[DEBUG] Database servers (${serverStats.length}):`);
                            serverStats.forEach(s => console.log(`  - "${s.name}"`));

                            // Debug: Log Python server names
                            console.log(`[DEBUG] Python resource data:`);
                            for (const [serverGroup, servers] of Object.entries(resourceData)) {
                                for (const [serverType, data] of Object.entries(servers)) {
                                    if (data.server_name) {
                                        console.log(`  - "${data.server_name}" (${serverGroup}/${serverType}): CPU ${data.resources?.cpu_usage_percent || 'N/A'}%, Memory ${data.resources?.memory_usage_percent || 'N/A'}%`);
                                    }
                                }
                            }

                            // Helper function to normalize name into sorted words for flexible matching
                            const normalizeToWords = (name) => {
                                return name.toLowerCase().trim()
                                    .replace(/\.$/, '')  // Remove trailing dot
                                    .replace(/\s+/g, ' ')  // Normalize spaces
                                    .split(' ')  // Split into words
                                    .sort()  // Sort alphabetically
                                    .join(' ');  // Rejoin
                            };

                            // Map Python script output to serverStats by matching names
                            serverStats.forEach(server => {
                                // Normalize server name for comparison
                                const normalizedDbName = server.name.toLowerCase().trim().replace(/\.$/, '').replace(/\s+/g, ' ');
                                const dbWords = normalizeToWords(server.name);

                                // Find matching resource data by comparing names
                                for (const [serverGroup, servers] of Object.entries(resourceData)) {
                                    for (const [serverType, data] of Object.entries(servers)) {
                                        if (data.success && data.server_name && data.resources) {
                                            // Normalize Python server name too
                                            const normalizedPythonName = data.server_name.toLowerCase().trim().replace(/\s+/g, ' ');
                                            const pythonWords = normalizeToWords(data.server_name);

                                            // Try exact match first, then word-order-independent match
                                            if (normalizedPythonName === normalizedDbName || pythonWords === dbWords) {
                                                server.cpu_percent = data.resources.cpu_usage_percent || null;
                                                server.memory_percent = data.resources.memory_usage_percent || null;
                                                console.log(`[RESOURCE] ✓ MATCHED "${server.name}" with "${data.server_name}": CPU ${server.cpu_percent}%, Memory ${server.memory_percent}%`);
                                                break; // Stop searching once matched
                                            }
                                        }
                                    }
                                }
                            });

                            resolve();
                        } catch (parseError) {
                            console.error(`[RESOURCE] Failed to parse Python output: ${parseError.message}`);
                            resolve(); // Don't fail the whole request
                        }
                    } else {
                        console.error(`[RESOURCE] Python script exited with code ${code}`);
                        if (pythonError) console.error(`[RESOURCE] Python error: ${pythonError}`);
                        resolve(); // Don't fail the whole request
                    }
                });

                pythonProcess.on('error', (error) => {
                    console.error(`[RESOURCE] Failed to start Python process: ${error.message}`);
                    resolve(); // Don't fail the whole request
                });
            });

        } catch (resourceError) {
            console.error(`[RESOURCE] Error calling Python script: ${resourceError.message}`);
            // Continue without resource data
        }

        // Calculate aggregate statistics from live sessions (Tautulli-style)
        const contentMap = new Map();
        const userMap = new Map();
        const platformMap = new Map();

        allLiveSessions.forEach(session => {
            // Track content (movies and TV shows separately)
            const contentKey = session.grandparentTitle || session.title; // TV show name or movie name
            if (!contentMap.has(contentKey)) {
                contentMap.set(contentKey, {
                    title: contentKey,
                    type: session.type,
                    year: session.year,
                    users: new Set(),
                    plays: 0,
                    thumbnail: session.thumbnail
                });
            }
            const content = contentMap.get(contentKey);
            content.users.add(session.user);
            content.plays++;

            // Track users
            if (!userMap.has(session.user)) {
                userMap.set(session.user, 0);
            }
            userMap.set(session.user, userMap.get(session.user) + 1);

            // Track platforms
            if (!platformMap.has(session.player)) {
                platformMap.set(session.player, 0);
            }
            platformMap.set(session.player, platformMap.get(session.player) + 1);
        });

        // Convert to sorted arrays
        const mostPopularContent = Array.from(contentMap.values())
            .map(c => ({ ...c, userCount: c.users.size }))
            .sort((a, b) => b.userCount - a.userCount)
            .slice(0, 10);

        const mostWatchedContent = Array.from(contentMap.values())
            .map(c => ({ ...c, userCount: c.users.size }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const mostActiveUsers = Array.from(userMap.entries())
            .map(([user, plays]) => ({ user, plays }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const mostActivePlatforms = Array.from(platformMap.entries())
            .map(([platform, plays]) => ({ platform, plays }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        // Count IPTV live streams (active connections)
        let iptvLiveStreams = 0;
        try {
            // Get all active IPTV user connections from the database
            const iptvConnectionsResult = await db.query(`
                SELECT COUNT(*) as count FROM users
                WHERE iptv_enabled = 1
                AND iptv_expiration_date > datetime('now')
                AND last_iptv_activity > datetime('now', '-5 minutes')
            `);
            iptvLiveStreams = iptvConnectionsResult[0]?.count || 0;
        } catch (error) {
            console.error('Error counting IPTV live streams:', error.message);
        }

        const responseData = {
            success: true,
            stats: {
                // Database stats
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

                // Live Plex stats (UPDATED with deduplication)
                live_plex_users: totalActiveSessions, // Active streams right now
                total_unique_plex_users: allUsers.size, // Unique users across all servers
                live_pending_invites: allPendingInvites.size, // Deduplicated pending invites
                plex_servers_online: onlineServers,
                plex_servers_offline: offlineServers,
                plex_server_details: serverStats,

                // IPTV stats
                iptv_live_streams: iptvLiveStreams,

                // Live session details
                live_sessions: allLiveSessions,
                total_live_sessions: totalActiveSessions,

                // Calculate bandwidth statistics
                total_bandwidth_mbps: allLiveSessions.reduce((sum, session) => sum + (session.bitrateMbps || 0), 0).toFixed(1),
                wan_bandwidth_mbps: allLiveSessions.filter(s => s.location === 'WAN').reduce((sum, session) => sum + (session.bitrateMbps || 0), 0).toFixed(1),
                direct_plays_count: allLiveSessions.filter(s => s.streamDecision === 'Direct Play').length,
                direct_streams_count: allLiveSessions.filter(s => s.streamDecision === 'Direct Stream').length,
                transcodes_count: allLiveSessions.filter(s => s.streamDecision === 'Transcode').length,

                // Aggregate statistics (Tautulli-style)
                most_popular_content: mostPopularContent,
                most_watched_content: mostWatchedContent,
                most_active_users: mostActiveUsers,
                most_active_platforms: mostActivePlatforms
            }
        };

        // Update cache
        dashboardStatsCache.data = responseData;
        dashboardStatsCache.timestamp = Date.now();
        dashboardStatsCache.isRefreshing = false;
        console.log('[DASHBOARD] Cache updated successfully');

        // Save cache to database for persistence across restarts
        await saveCacheToDatabase(responseData, dashboardStatsCache.timestamp);

        res.json({
            ...responseData,
            cached: false,
            cache_age_seconds: 0
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        dashboardStatsCache.isRefreshing = false; // Reset refreshing flag on error

        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard stats',
            error: error.message
        });
    }
});

// Background refresh function for dashboard stats (non-blocking)
async function refreshDashboardStatsInBackground() {
    dashboardStatsCache.isRefreshing = true;
    console.log('[DASHBOARD] Starting background refresh...');

    try {
        // Re-use the same stats generation logic from the endpoint
        const generateStats = async () => {
            const db = require('./database-config');
            const axios = require('axios');
            const xml2js = require('xml2js');

            // (All the database queries and Plex API calls from lines 113-775)
            // For brevity, this would contain the exact same logic as the endpoint above
            // Since it's identical code, we could refactor both to call this function
            // But for now, let's just duplicate it for the background refresh

            // Get total users
            const totalUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE is_active = 1`);
            const plexUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE plex_enabled = 1 AND plex_expiration_date > datetime('now')`);
            const iptvUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_enabled = 1 AND iptv_expiration_date > datetime('now')`);
            const editorUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_editor_enabled = 1`);
            const plexServersResult = await db.query(`SELECT COUNT(*) as count FROM plex_servers WHERE is_active = 1`);
            const iptvPanelsResult = await db.query(`SELECT COUNT(*) as count FROM iptv_panels WHERE is_active = 1`);

            const expiringSoonResult = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE (
                    (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
                    OR (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days'))
                )
            `);

            const recentUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')`);
            const recentUsersMonthResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-30 days')`);

            const expiringSoonMonthResult = await db.query(`
                SELECT COUNT(*) as count FROM users WHERE (
                    (plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
                    OR (iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+30 days'))
                )
            `);

            const expiringPlexWeekResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE plex_enabled = 1 AND plex_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')`);
            const expiringIptvWeekResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE iptv_enabled = 1 AND iptv_expiration_date BETWEEN datetime('now') AND datetime('now', '+7 days')`);

            // For background refresh, we'll just update basic stats and skip the intensive Plex API calls
            // This allows faster refresh cycles. Full refresh only happens on force=true

            return {
                success: true,
                stats: {
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
                    //  Keep existing live session data from cache
                    ...(dashboardStatsCache.data?.stats || {})
                }
            };
        };

        const responseData = await generateStats();

        // Update cache
        dashboardStatsCache.data = responseData;
        dashboardStatsCache.timestamp = Date.now();
        dashboardStatsCache.isRefreshing = false;

        // Save cache to database for persistence across restarts
        await saveCacheToDatabase(responseData, dashboardStatsCache.timestamp);

        console.log('[DASHBOARD] ✓ Background refresh complete');

    } catch (error) {
        console.error('[DASHBOARD] Background refresh error:', error);
        dashboardStatsCache.isRefreshing = false;
    }
}

// Watch statistics endpoint with DATABASE caching
const WATCH_STATS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours (once a day)
let watchStatsRefreshing = false;

const IPTV_PANELS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

app.get('/api/v2/dashboard/watch-stats', async (req, res) => {
    try {
        const db = require('./database-config');
        const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';

        // Read watch stats from database (instant)
        const cached = await db.query(`
            SELECT setting_value, updated_at
            FROM settings
            WHERE setting_key = 'watch_stats_cache'
        `);

        const now = Date.now();

        // If we have cached data in database, return it immediately
        if (cached && cached.length > 0 && cached[0].setting_value) {
            const watchStats = JSON.parse(cached[0].setting_value);
            const cacheTimestamp = new Date(cached[0].updated_at).getTime();
            const cacheAge = Math.round((now - cacheTimestamp) / 1000);
            const isCacheValid = (now - cacheTimestamp) < WATCH_STATS_CACHE_DURATION;

            console.log(`[WATCH STATS] Serving from database (age: ${cacheAge}s, force: ${forceRefresh})`);

            // If force refresh requested OR cache is stale, trigger background refresh
            if ((forceRefresh || !isCacheValid) && !watchStatsRefreshing) {
                console.log('[WATCH STATS] Triggering background refresh...');
                refreshWatchStatsInBackground();
            }

            return res.json({
                success: true,
                stats: watchStats,
                cached: !forceRefresh,
                refreshing: forceRefresh || !isCacheValid,
                cache_age_seconds: cacheAge
            });
        }

        // No cache in database - need to generate for the first time
        if (watchStatsRefreshing) {
            console.log('[WATCH STATS] Initial generation in progress...');
            return res.json({
                success: true,
                stats: {
                    mostPopularMovies: [],
                    mostWatchedMovies: [],
                    mostPopularShows: [],
                    mostWatchedShows: [],
                    mostActiveUsers: [],
                    mostActivePlatforms: []
                },
                cached: false,
                generating: true
            });
        }

        // Generate stats for the first time
        console.log('[WATCH STATS] No cache found, generating initial stats...');
        refreshWatchStatsInBackground();

        return res.json({
            success: true,
            stats: {
                mostPopularMovies: [],
                mostWatchedMovies: [],
                mostPopularShows: [],
                mostWatchedShows: [],
                mostActiveUsers: [],
                mostActivePlatforms: []
            },
            cached: false,
            generating: true
        });

    } catch (error) {
        console.error('[WATCH STATS] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch watch statistics',
            error: error.message
        });
    }
});

// Import watch stats background refresh
const { refreshWatchStatsInBackground } = require("./watch-stats-refresh");

// IPTV Panels dashboard statistics endpoint with caching
app.get('/api/v2/dashboard/iptv-panels', async (req, res) => {
    const now = Date.now();
    const cacheAge = iptvPanelsCache.timestamp ? now - iptvPanelsCache.timestamp : Infinity;
    const isCacheValid = cacheAge < IPTV_PANELS_CACHE_DURATION;
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

    // If cache is valid and not forcing refresh, return cached data immediately
    if (isCacheValid && !forceRefresh && iptvPanelsCache.data) {
        console.log(`[IPTV PANELS] Serving cached data (age: ${Math.round(cacheAge / 1000)}s)`);
        return res.json({
            ...iptvPanelsCache.data,
            cached: true,
            cache_age_seconds: Math.round(cacheAge / 1000)
        });
    }

    // If cache is being refreshed by another request, return cached data if available
    if (iptvPanelsCache.isRefreshing) {
        if (iptvPanelsCache.data) {
            console.log('[IPTV PANELS] Returning stale cache while refresh in progress');
            return res.json({
                ...iptvPanelsCache.data,
                cached: true,
                refreshing: true,
                cache_age_seconds: Math.round(cacheAge / 1000)
            });
        } else {
            console.log('[IPTV PANELS] Refresh in progress, no cache available yet');
            return res.status(202).json({
                success: false,
                message: 'IPTV panel statistics are being generated. Please try again in a moment.',
                refreshing: true
            });
        }
    }

    // Start refresh process
    iptvPanelsCache.isRefreshing = true;
    console.log('[IPTV PANELS] Generating fresh statistics...');

    try {
        const db = require('./database-config');
        const IPTVServiceManager = require('./services/iptv/IPTVServiceManager');

        // Get all active IPTV panels
        const panels = await db.query(`
            SELECT id, name, panel_type, base_url, is_active
            FROM iptv_panels
            WHERE is_active = 1
            ORDER BY name
        `);

        if (panels.length === 0) {
            const emptyResponse = {
                success: true,
                panels: [],
                aggregated: {
                    totalPanels: 0,
                    totalCredits: 0,
                    totalUsers: 0,
                    totalActiveUsers: 0,
                    totalLiveViewers: 0,
                    totalLiveChannels: 0,
                    totalVodMovies: 0,
                    totalVodSeries: 0,
                    totalBouquets: 0
                },
                liveViewers: []
            };

            // Cache the empty response
            iptvPanelsCache.data = emptyResponse;
            iptvPanelsCache.timestamp = Date.now();
            iptvPanelsCache.isRefreshing = false;

            return res.json(emptyResponse);
        }

        // Initialize IPTV Service Manager
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        // Fetch statistics from each panel in parallel
        const panelStatsPromises = panels.map(async (panel) => {
            try {
                const panelService = iptvManager.getPanel(panel.id);
                const stats = await panelService.getDashboardStatistics();
                return { success: true, stats };
            } catch (error) {
                console.error(`[IPTV DASHBOARD] Error fetching stats for panel ${panel.name}:`, error.message);
                return {
                    success: false,
                    error: error.message,
                    panel_id: panel.id,
                    panel_name: panel.name
                };
            }
        });

        const results = await Promise.allSettled(panelStatsPromises);

        // Extract successful results
        const panelStats = [];
        const allLiveViewers = [];
        let aggregated = {
            totalPanels: panels.length,
            totalCredits: 0,
            totalUsers: 0,
            totalActiveUsers: 0,
            totalLiveViewers: 0,
            totalLiveChannels: 0,
            totalVodMovies: 0,
            totalVodSeries: 0,
            totalBouquets: 0
        };

        results.forEach((result, index) => {
            const panel = panels[index];
            if (result.status === 'fulfilled' && result.value.success) {
                const stats = result.value.stats;
                // Include panel metadata with stats
                panelStats.push({
                    panel_id: panel.id,
                    panel_name: panel.name,
                    panel_type: panel.panel_type,
                    error: null,
                    credits: parseFloat(stats.credits) || 0,
                    users: stats.users || { total: 0, active: 0, liveNow: 0 },
                    content: stats.content || { liveChannels: 0, vodMovies: 0, vodSeries: 0 },
                    liveViewers: stats.liveViewers || []
                });

                // Aggregate statistics
                aggregated.totalCredits += stats.credits || 0;
                aggregated.totalUsers += stats.users?.total || 0;
                aggregated.totalActiveUsers += stats.users?.active || 0;
                aggregated.totalLiveViewers += stats.users?.liveNow || 0;
                aggregated.totalLiveChannels += stats.content?.liveChannels || 0;
                aggregated.totalVodMovies += stats.content?.vodMovies || 0;
                aggregated.totalVodSeries += stats.content?.vodSeries || 0;
                aggregated.totalBouquets += stats.content?.totalBouquets || 0;

                // Collect live viewers
                if (stats.liveViewers && Array.isArray(stats.liveViewers)) {
                    allLiveViewers.push(...stats.liveViewers);
                }
            } else {
                // Add error entry for failed panels
                panelStats.push({
                    panel_id: panel.id,
                    panel_name: panel.name,
                    panel_type: panel.panel_type,
                    error: result.value?.error || 'Unknown error',
                    credits: 0,
                    content: { liveChannels: 0, vodMovies: 0, vodSeries: 0, totalBouquets: 0 },
                    users: { total: 0, active: 0, liveNow: 0 },
                    liveViewers: []
                });
            }
        });

        console.log(`[IPTV PANELS] ✓ Aggregated stats from ${panelStats.length} panels`);

        const response = {
            success: true,
            panels: panelStats,
            aggregated: aggregated,
            liveViewers: allLiveViewers,
            timestamp: new Date().toISOString()
        };

        // Cache the response
        iptvPanelsCache.data = response;
        iptvPanelsCache.timestamp = Date.now();
        iptvPanelsCache.isRefreshing = false;

        console.log('[IPTV PANELS] ✓ Cache updated');

        res.json({
            ...response,
            cached: false
        });

    } catch (error) {
        console.error('[IPTV PANELS] Error:', error);
        iptvPanelsCache.isRefreshing = false;
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV panel statistics',
            error: error.message
        });
    }
});

// Fetch all available Plex libraries from active servers
app.get('/api/v2/plex/libraries', async (req, res) => {
    try {
        const db = require('./database-config');
        const axios = require('axios');
        const xml2js = require('xml2js');

        // Get all active Plex servers
        const plexServers = await db.query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE is_active = 1
            ORDER BY name
        `);

        const parser = new xml2js.Parser();
        const serverLibraries = [];

        for (const server of plexServers) {
            try {
                // Fetch libraries from each server
                const librariesResponse = await axios.get(`${server.url}/library/sections`, {
                    headers: {
                        'X-Plex-Token': server.token,
                        'Accept': 'application/xml'
                    },
                    timeout: 10000
                });

                const result = await parser.parseStringPromise(librariesResponse.data);
                const directories = result.MediaContainer.Directory || [];

                const libraries = directories.map(dir => ({
                    key: dir.$.key,
                    title: dir.$.title,
                    type: dir.$.type,
                    agent: dir.$.agent || null,
                    scanner: dir.$.scanner || null,
                    language: dir.$.language || null,
                    refreshing: dir.$.refreshing === '1'
                }));

                serverLibraries.push({
                    server_id: server.id,
                    server_name: server.name,
                    libraries: libraries,
                    status: 'online'
                });

            } catch (error) {
                console.error(`Error fetching libraries from ${server.name}:`, error.message);
                serverLibraries.push({
                    server_id: server.id,
                    server_name: server.name,
                    libraries: [],
                    status: 'error',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            servers: serverLibraries
        });

    } catch (error) {
        console.error('Error fetching Plex libraries:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex libraries',
            error: error.message
        });
    }
});

// Get dashboard library preferences
app.get('/api/v2/dashboard/library-preferences', async (req, res) => {
    try {
        const db = require('./database-config');

        const preferences = await db.query(`
            SELECT
                dlp.id,
                dlp.plex_server_id,
                ps.name as server_name,
                dlp.library_key,
                dlp.library_title,
                dlp.library_type,
                dlp.display_order,
                dlp.is_active
            FROM dashboard_library_preferences dlp
            JOIN plex_servers ps ON ps.id = dlp.plex_server_id
            WHERE dlp.is_active = 1 AND ps.is_active = 1
            ORDER BY dlp.display_order ASC, dlp.library_title ASC
        `);

        res.json({
            success: true,
            preferences: preferences
        });

    } catch (error) {
        console.error('Error fetching library preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch library preferences',
            error: error.message
        });
    }
});

// Save dashboard library preferences
app.post('/api/v2/dashboard/library-preferences', async (req, res) => {
    try {
        const db = require('./database-config');
        const { libraries } = req.body;

        if (!libraries || !Array.isArray(libraries)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request: libraries array is required'
            });
        }

        // Clear existing preferences
        await db.query('DELETE FROM dashboard_library_preferences');

        // Insert new preferences
        let displayOrder = 0;
        for (const lib of libraries) {
            await db.query(`
                INSERT INTO dashboard_library_preferences
                (plex_server_id, library_key, library_title, library_type, display_order, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `, [lib.server_id, lib.library_key, lib.library_title, lib.library_type, displayOrder]);
            displayOrder++;
        }

        res.json({
            success: true,
            message: 'Library preferences saved successfully',
            count: libraries.length
        });

    } catch (error) {
        console.error('Error saving library preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save library preferences',
            error: error.message
        });
    }
});

// Get library statistics for dashboard display
app.get('/api/v2/dashboard/library-stats', async (req, res) => {
    try {
        const db = require('./database-config');
        const axios = require('axios');
        const xml2js = require('xml2js');

        // Get active library preferences
        const preferences = await db.query(`
            SELECT
                dlp.id,
                dlp.plex_server_id,
                ps.name as server_name,
                ps.url as server_url,
                ps.token as server_token,
                dlp.library_key,
                dlp.library_title,
                dlp.library_type,
                dlp.display_order
            FROM dashboard_library_preferences dlp
            JOIN plex_servers ps ON ps.id = dlp.plex_server_id
            WHERE dlp.is_active = 1 AND ps.is_active = 1
            ORDER BY dlp.display_order ASC, dlp.library_title ASC
        `);

        const parser = new xml2js.Parser();
        const libraryStats = [];

        for (const pref of preferences) {
            try {
                // Fetch library statistics from Plex
                const libResponse = await axios.get(`${pref.server_url}/library/sections/${pref.library_key}/all`, {
                    headers: {
                        'X-Plex-Token': pref.server_token,
                        'Accept': 'application/xml'
                    },
                    params: {
                        'X-Plex-Container-Start': 0,
                        'X-Plex-Container-Size': 0 // Just get the count
                    },
                    timeout: 10000
                });

                const result = await parser.parseStringPromise(libResponse.data);
                const totalSize = parseInt(result.MediaContainer.$.totalSize) || 0;

                libraryStats.push({
                    id: pref.id,
                    server_name: pref.server_name,
                    library_title: pref.library_title,
                    library_type: pref.library_type,
                    total_items: totalSize,
                    display_order: pref.display_order,
                    status: 'online'
                });

            } catch (error) {
                console.error(`Error fetching stats for library ${pref.library_title}:`, error.message);
                libraryStats.push({
                    id: pref.id,
                    server_name: pref.server_name,
                    library_title: pref.library_title,
                    library_type: pref.library_type,
                    total_items: 0,
                    display_order: pref.display_order,
                    status: 'error',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            libraries: libraryStats
        });

    } catch (error) {
        console.error('Error fetching library stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch library stats',
            error: error.message
        });
    }
});

// =====================================================
// FRONTEND ROUTING
// =====================================================

// Landing page - shows login options (User Portal vs Admin)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/welcome.html'));
});

// Admin authentication page routes
app.get('/admin/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/reset-password.html'));
});

app.get('/admin/setup-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/setup-password.html'));
});

app.get('/admin/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/forgot-password.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/login.html'));
});

// Admin SPA catch-all (for hash-based routing within admin)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
});

// Portal login route
app.get('/portal/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/portal/login.html'));
});

// Portal SPA catch-all
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/portal/index.html'));
});

app.get('/portal/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/portal/index.html'));
});

// Legacy redirects (for bookmarks/old links)
app.get('/login.html', (req, res) => {
    res.redirect('/admin/login');
});

app.get('/index.html', (req, res) => {
    res.redirect('/admin/');
});

// API 404 catch-all
app.get('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Final catch-all - redirect to landing page
app.get('*', (req, res) => {
    res.redirect('/');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 3050;

// Async startup function to load cache before accepting requests
async function startServer() {
    // Load dashboard cache from database BEFORE starting server
    try {
        console.log('[DASHBOARD] Loading cached stats from database...');
        await loadCacheFromDatabase();
        console.log('[DASHBOARD] Cache loaded successfully');
    } catch (error) {
        console.error('[DASHBOARD] Failed to load cache from database:', error);
    }

    // Load IPTV panels cache from database to prevent showing 0 after restart
    try {
        console.log('[IPTV PANELS] Loading cached IPTV panels from database...');
        await loadIptvPanelsCacheFromDatabase();
    } catch (error) {
        console.error('[IPTV PANELS] Failed to load IPTV panels cache from database:', error);
    }

    // Pre-load EPG guide data into memory for instant guide loading
    try {
        await preloadAllGuideCaches();
    } catch (error) {
        console.error('[GUIDE CACHE] Failed to pre-load EPG caches:', error);
    }

    // Now start the server - cache will be available for first request
    app.listen(PORT, () => {
        console.log(`StreamPanel server running on port ${PORT}`);
        console.log(`API base: http://localhost:${PORT}/api/v2`);
        console.log(`Health check: http://localhost:${PORT}/api/v2/health`);
        console.log(`Timezone: ${process.env.TZ || 'System default'} (Current time: ${new Date().toLocaleString()})`);

        // Initialize scheduled jobs after server starts
        try {
            console.log('🚀 Initializing scheduled jobs...');
            initializeTagAutoAssignment();
            initializeIPTVEditorAutoUpdater();
            initializeIPTVPanelAutoSync();
            initializePlexAutoSync();
            initializeWatchStatsAutoRefresh();
            initializeServiceCancellationProcessor();
            initializeDashboardStatsRefresh(); // Background refresh every 5 minutes
            initializeGuideCacheRefresh(); // Guide cache refresh every 2 hours for panels
            emailScheduler.initialize();
            initializeScheduler();
            // Note: plex-library-access-sync runs as part of plex-sync-scheduler
            console.log('✅ All scheduled jobs initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize scheduled jobs:', error);
        }
    });
}

// Start the server
startServer();

module.exports = app;
