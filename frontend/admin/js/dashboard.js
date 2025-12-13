/**
 * Dashboard Page for StreamPanel
 * With server-side caching and auto-refresh support
 */

const Dashboard = {
    refreshInterval: null,
    isRefreshing: false,
    lastCacheAge: null,
    expandedSections: new Set(), // Track which sections are expanded
    cardPreferences: null, // Card order and visibility preferences
    sectionPreferences: null, // Section order and visibility preferences
    watchStats: {}, // Watch statistics data
    cachedStats: null, // Frontend cache for instant rendering on navigation

    /**
     * Get placeholder stats for instant rendering
     * Shows "-" for values that are loading
     */
    getPlaceholderStats() {
        return {
            // User stats - show "-" while loading
            total_users: '-',
            active_plex_users: '-',
            active_iptv_users: '-',
            iptv_editor_users: '-',
            total_iptv_users: '-',
            total_unique_plex_users: '-',

            // Server/panel counts
            plex_servers_count: '-',
            iptv_panels_count: '-',
            plex_servers_online: '-',
            plex_servers_offline: 0,

            // Expiring/recent users
            expiring_soon: '-',
            expiring_soon_month: '-',
            expiring_plex_week: '-',
            expiring_iptv_week: '-',
            new_users_week: '-',
            new_users_month: '-',

            // Live stats
            live_plex_users: '-',
            live_pending_invites: '-',
            iptv_live_streams: '-',

            // Server details (empty arrays - sections won't show until data loads)
            plex_server_details: [],
            iptv_panel_details: [],

            // IPTV panels data (null - section won't show until data loads)
            iptv_panels_data: null,

            // Other live data
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
        };
    },

    /**
     * Render dashboard
     */
    async render(container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-line"></i>
                        Dashboard
                        <span id="last-updated" style="font-size: 0.8rem; color: #64748b; font-weight: normal; margin-left: 1rem;"></span>
                    </h2>
                    <div>
                        <button class="btn btn-secondary btn-sm" onclick="Dashboard.openCustomizeModal()" style="margin-right: 0.5rem;">
                            <i class="fas fa-cog"></i> Customize
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="Dashboard.refreshStats()" id="refresh-btn">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>

                <div id="stats-container">
                    <!-- Stats will load from server cache -->
                </div>
            </div>
        `;

        // STEP 1: Load cached preferences FIRST (instant - from localStorage)
        // This ensures card order and section order are correct on initial display
        this.loadPreferencesFromCache();

        // STEP 2: IMMEDIATELY show placeholder/cached stats so page is never blank
        const persistentCache = this.getFromPersistentCache();
        if (persistentCache) {
            console.log('[Dashboard] ✓ Showing persistent cached data instantly');
            this.cachedStats = persistentCache; // Cache for re-render when preferences load
            this.displayStats(persistentCache, true);
        } else {
            console.log('[Dashboard] Showing placeholder stats instantly');
            const placeholderStats = this.getPlaceholderStats();
            this.cachedStats = placeholderStats; // Cache for re-render when preferences load
            this.displayStats(placeholderStats, false);
        }

        // STEP 3: IMMEDIATELY load database stats (fast - no external API calls)
        // This gets all local data: server names, panel names, user counts, etc.
        // Only live sessions require slow external API calls
        console.log('[Dashboard] Loading database stats immediately...');
        this.loadQuickStats().then(() => {
            // After quick stats load, show loading indicators on API sections
            // These will be removed when full stats load
            this.showLoadingIndicators();
        }).catch(err => {
            console.log('[Dashboard] Quick stats failed, will use full load:', err.message);
            // Still show indicators even if quick stats failed
            this.showLoadingIndicators();
        });

        // STEP 4: Load fresh preferences from database in background
        // (will update cache if preferences changed on another device)
        this.loadAllPreferences().catch(() => {});

        // STEP 5: Load full stats with live data (slower - external API calls)
        // Always show loading indicators while fetching live data
        console.log('[Dashboard] Loading full stats with live data...');
        this.loadStats(true, true, true); // silent=true, showIndicators=true, force=true

        // Start auto-refresh (5 minutes)
        this.startAutoRefresh();
    },

    /**
     * Start auto-refresh interval
     */
    startAutoRefresh() {
        // Clear any existing interval
        this.stopAutoRefresh();

        // Refresh every 30 seconds (30000ms)
        this.refreshInterval = setInterval(() => {
            this.loadStats(true); // true = silent refresh
        }, 30000);

        console.log('[Dashboard] Auto-refresh started (30 second interval)');
    },

    /**
     * Stop auto-refresh interval
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('[Dashboard] Auto-refresh stopped');
        }
    },

    /**
     * Get dashboard stats from sessionStorage cache
     * @returns {Object|null} - Returns cached data with age in seconds, or null if cache is stale/missing
     */
    getFromCache() {
        try {
            const cached = sessionStorage.getItem('dashboard_stats_cache');
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            const now = Date.now();
            const ageSeconds = Math.floor((now - cacheData.timestamp) / 1000);

            // Cache is valid for 5 minutes (300 seconds) - matches background refresh interval
            if (ageSeconds > 300) {
                console.log(`[Dashboard Cache] Cache expired (${ageSeconds}s old)`);
                sessionStorage.removeItem('dashboard_stats_cache');
                return null;
            }

            return {
                stats: cacheData.stats,
                age: ageSeconds
            };
        } catch (error) {
            console.error('[Dashboard Cache] Error reading cache:', error);
            return null;
        }
    },

    /**
     * Save dashboard stats to sessionStorage cache
     * @param {Object} stats - The stats object to cache
     */
    saveToCache(stats) {
        try {
            const cacheData = {
                stats: stats,
                timestamp: Date.now()
            };
            sessionStorage.setItem('dashboard_stats_cache', JSON.stringify(cacheData));
            // Also save to persistent cache (localStorage) for instant loading on next visit
            this.saveToPersistentCache(stats);
            console.log('[Dashboard Cache] Stats saved to session and persistent cache');
        } catch (error) {
            console.error('[Dashboard Cache] Error saving cache:', error);
        }
    },

    /**
     * Get dashboard stats from localStorage (persistent across browser sessions)
     * This cache NEVER expires - always returns last known good data
     * @returns {Object|null} - Returns cached stats or null if no cache exists
     */
    getFromPersistentCache() {
        try {
            const cached = localStorage.getItem('dashboard_stats_persistent');
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            // Always return the cached data - it never expires
            // This ensures we ALWAYS have something to show instantly
            return cacheData.stats;
        } catch (error) {
            console.error('[Dashboard Persistent Cache] Error reading cache:', error);
            return null;
        }
    },

    /**
     * Save dashboard stats to localStorage (persistent across browser sessions)
     * @param {Object} stats - The stats object to cache
     */
    saveToPersistentCache(stats) {
        try {
            const cacheData = {
                stats: stats,
                timestamp: Date.now()
            };
            localStorage.setItem('dashboard_stats_persistent', JSON.stringify(cacheData));
        } catch (error) {
            console.error('[Dashboard Persistent Cache] Error saving cache:', error);
        }
    },

    /**
     * Load INSTANT database-only stats (no slow API calls)
     * This renders the dashboard immediately with all database data
     */
    async loadQuickStats() {
        console.log('[Dashboard] Fetching instant database stats...');

        try {
            // ONLY call quick-stats - this is database-only, no external API calls
            // Do NOT call getDashboardIPTVPanels here - it makes slow external API calls
            const response = await API.getDashboardQuickStats();

            if (response.success && response.stats) {
                const stats = response.stats;

                // Convert iptv_panel_details to iptv_panels_data format for display
                // This allows the IPTV section to show immediately with basic info
                if (stats.iptv_panel_details && stats.iptv_panel_details.length > 0) {
                    stats.iptv_panels_data = {
                        panels: stats.iptv_panel_details.map(p => ({
                            panel_id: p.id,
                            panel_name: p.name,
                            panel_type: p.panel_type,
                            error: null,
                            credits: p.credits,
                            users: { total: '-', liveNow: '-' }, // Will be updated by full stats
                            content: {
                                liveChannels: '-',
                                vodMovies: '-',
                                vodSeries: '-',
                                status: 'loading'
                            },
                            liveViewers: []
                        }))
                    };
                }

                // Cache stats in memory
                this.cachedStats = stats;

                // Display immediately
                this.displayStats(stats, false);

                // Save to persistent cache so next visit shows this data instantly
                // (full stats will update it with live data later)
                this.saveToPersistentCache(stats);

                console.log('[Dashboard] ✓ Instant database stats displayed');
            }

        } catch (error) {
            console.error('[Dashboard] Quick stats error:', error);
            throw error; // Rethrow so caller can fallback
        }
    },

    /**
     * Load dashboard statistics
     * @param {boolean} silent - If true, won't show loading indicators
     * @param {boolean} showIndicators - If true, will show loading indicators regardless of silent parameter
     * @param {boolean} force - If true, will force fresh data from server (bypass cache)
     * @returns {boolean} - Returns true if refresh happened, false if skipped
     */
    async loadStats(silent = false, showIndicators = false, force = false) {
        if (this.isRefreshing) {
            console.log('[Dashboard] Already refreshing, skipping...');
            return false;
        }

        this.isRefreshing = true;

        if (!silent || showIndicators) {
            // Show loading indicators on stat cards
            console.log('[Dashboard] Showing loading indicators...');
            this.showLoadingIndicators();
        }

        try {
            console.log(`[Dashboard] Fetching stats (force=${force}, silent=${silent}, showIndicators=${showIndicators})`);
            const response = await API.getDashboardStats(force);

            // Handle case where stats are being generated for the first time
            if (!response.success || !response.stats) {
                console.log('[Dashboard] Stats not ready yet, will retry automatically');
                if (!silent || showIndicators) {
                    this.removeLoadingIndicators();
                }
                this.isRefreshing = false;

                // Retry after a short delay
                setTimeout(() => {
                    this.loadStats(silent, showIndicators, force);
                }, 1000);
                return false;
            }

            const stats = response.stats;
            const isCached = response.cached || false;
            const isRefreshingInBackground = response.refreshing || false;
            const cacheAge = response.cache_age_seconds || 0;

            this.lastCacheAge = cacheAge;

            // Fetch IPTV panels data (backend has caching)
            try {
                const iptvPanelsResponse = await API.getDashboardIPTVPanels();
                stats.iptv_panels_data = iptvPanelsResponse;
            } catch (error) {
                console.error('[Dashboard] Error fetching IPTV panels data:', error);
                stats.iptv_panels_data = null;
            }

            // Cache stats in memory for instant rendering on next navigation
            this.cachedStats = stats;

            // Display the stats immediately (even if refreshing in background)
            this.displayStats(stats, isCached);

            // Save to sessionStorage cache for future page loads
            this.saveToCache(stats);

            // Update last updated timestamp
            this.updateLastUpdatedTime(isCached, cacheAge);

            if (isCached) {
                console.log(`[Dashboard] Displaying cached stats (age: ${cacheAge}s)`);
            } else {
                console.log('[Dashboard] Displaying fresh stats');
            }

            // If backend is refreshing in background and we want indicators, poll for fresh data
            if (isRefreshingInBackground && (force || showIndicators)) {
                console.log('[Dashboard] Backend is refreshing, polling for fresh data...');
                // Keep loading indicators visible on API-dependent cards
                this.showLoadingIndicatorsOnApiCards();
                // Start polling for fresh data
                this.pollForFreshData(silent);
                return true; // Don't set isRefreshing = false yet
            }

            // Not refreshing, done
            if (!silent || showIndicators) {
                this.removeLoadingIndicators();
            }
            this.isRefreshing = false;

        } catch (error) {
            console.error('Error loading stats:', error);
            if (!silent || showIndicators) {
                document.getElementById('stats-container').innerHTML = `
                    <div class="text-center mt-4 mb-4">
                        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                        <p class="mt-2" style="color: var(--danger-color);">Failed to load statistics</p>
                        <button class="btn btn-primary mt-2" onclick="Dashboard.refreshStats()">
                            Try Again
                        </button>
                    </div>
                `;
                Utils.showToast('Error', 'Failed to load dashboard statistics', 'error');
            }
            this.isRefreshing = false;
            return false;
        }

        return true;
    },

    /**
     * Show loading indicators only on API-dependent cards (live stats)
     */
    showLoadingIndicatorsOnApiCards() {
        const apiCards = document.querySelectorAll('[data-refresh-type="api"]');
        apiCards.forEach(card => {
            const indicator = card.querySelector('.refresh-indicator');
            if (indicator) {
                indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
            }
        });
    },

    /**
     * Poll for fresh data while backend is refreshing
     */
    async pollForFreshData(silent = false, attempts = 0) {
        const maxAttempts = 30; // Max 30 attempts (about 30 seconds)
        const pollInterval = 1000; // 1 second between polls

        if (attempts >= maxAttempts) {
            console.log('[Dashboard] Max poll attempts reached, giving up');
            this.removeLoadingIndicators();
            this.isRefreshing = false;
            return;
        }

        try {
            // Wait before polling
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            console.log(`[Dashboard] Polling for fresh data (attempt ${attempts + 1}/${maxAttempts})`);
            const response = await API.getDashboardStats(false); // Don't force, just check

            if (!response.success || !response.stats) {
                // Keep polling
                this.pollForFreshData(silent, attempts + 1);
                return;
            }

            const isStillRefreshing = response.refreshing || false;

            if (!isStillRefreshing) {
                // Refresh complete! Update display with fresh data
                console.log('[Dashboard] Fresh data received!');
                const stats = response.stats;

                // Fetch IPTV panels data
                try {
                    const iptvPanelsResponse = await API.getDashboardIPTVPanels();
                    stats.iptv_panels_data = iptvPanelsResponse;
                } catch (error) {
                    console.error('[Dashboard] Error fetching IPTV panels data:', error);
                }

                // Update display
                this.cachedStats = stats;
                this.displayStats(stats, false);
                this.saveToCache(stats);
                this.updateLastUpdatedTime(false, 0);

                // Remove loading indicators
                this.removeLoadingIndicators();
                this.isRefreshing = false;

                if (!silent) {
                    Utils.showToast('Success', 'Dashboard updated with fresh data', 'success');
                }
            } else {
                // Still refreshing, keep polling
                this.pollForFreshData(silent, attempts + 1);
            }

        } catch (error) {
            console.error('[Dashboard] Polling error:', error);
            // Keep trying on error
            this.pollForFreshData(silent, attempts + 1);
        }
    },

    /**
     * Get default card order
     */
    getDefaultCardOrder() {
        return [
            'total-app-users',
            'plex-live-streams',
            'iptv-live-streams',
            'total-plex-users',
            'total-iptv-users',
            'pending-invites',
            'pending-service-requests',
            'active-plex-users',
            'active-iptv-users',
            'plex-servers',
            'iptv-panels',
            'expiring-soon',
            'expiring-soon-month',
            'expiring-plex-week',
            'expiring-iptv-week',
            'new-users-week',
            'new-users-month'
        ];
    },

    /**
     * Get default section order
     */
    getDefaultSectionOrder() {
        return [
            'overview-stats',
            'iptv-section',
            'plex-section'
        ];
    },

    /**
     * Get section display names
     */
    getSectionNames() {
        return {
            'overview-stats': 'Overview Stats',
            'iptv-section': 'IPTV Section',
            'plex-section': 'Plex Section'
        };
    },

    /**
     * Generate HTML for a specific card
     */
    generateCardHTML(cardId, stats) {
        const cards = {
            'total-app-users': `
                <div class="stat-card" data-refresh-type="database" data-card-id="total-app-users" draggable="true">
                    <div class="stat-icon blue">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total App Users</div>
                        <div class="stat-value">${stats.total_users}</div>
                    </div>
                </div>`,

            'plex-live-streams': `
                <div class="stat-card" data-refresh-type="api" data-card-id="plex-live-streams" draggable="true" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <div class="stat-icon white">
                        <i class="fas fa-play-circle"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label" style="color: rgba(255,255,255,0.9);">Plex Live Streams <span class="refresh-indicator"></span></div>
                        <div class="stat-value" style="color: white;">${stats.live_plex_users}</div>
                        <small style="color: rgba(255,255,255,0.8);"><i class="fas fa-broadcast-tower"></i> Active right now</small>
                    </div>
                </div>`,

            'iptv-live-streams': `
                <div class="stat-card" data-refresh-type="api" data-card-id="iptv-live-streams" draggable="true" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
                    <div class="stat-icon white">
                        <i class="fas fa-tv"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label" style="color: rgba(255,255,255,0.9);">IPTV Live Streams <span class="refresh-indicator"></span></div>
                        <div class="stat-value" style="color: white;">${stats.iptv_live_streams || 0}</div>
                        <small style="color: rgba(255,255,255,0.8);"><i class="fas fa-signal"></i> Active connections</small>
                    </div>
                </div>`,

            'total-plex-users': `
                <div class="stat-card" data-refresh-type="api" data-card-id="total-plex-users" draggable="true">
                    <div class="stat-icon purple">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total Plex Users <span class="refresh-indicator"></span></div>
                        <div class="stat-value">${stats.total_unique_plex_users || 0}</div>
                        <small class="text-muted">Unique shared users across all servers</small>
                    </div>
                </div>`,

            'total-iptv-users': `
                <div class="stat-card" data-refresh-type="database" data-card-id="total-iptv-users" draggable="true">
                    <div class="stat-icon purple">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Total IPTV Users</div>
                        <div class="stat-value">${stats.total_iptv_users || 0}</div>
                        <small class="text-muted">Total lines across all panels</small>
                    </div>
                </div>`,

            'pending-invites': `
                <div class="stat-card" data-refresh-type="api" data-card-id="pending-invites" draggable="true" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
                    <div class="stat-icon white">
                        <i class="fas fa-user-clock"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label" style="color: rgba(255,255,255,0.9);">Pending Plex Invites <span class="refresh-indicator"></span></div>
                        <div class="stat-value" style="color: white;">${stats.live_pending_invites}</div>
                        <small style="color: rgba(255,255,255,0.8);"><i class="fas fa-sync-alt"></i> Unique across all servers</small>
                    </div>
                </div>`,

            'pending-service-requests': (() => {
                const totalPending = (stats.pending_plex_requests || 0) + (stats.pending_iptv_requests || 0);
                const hasRequests = totalPending > 0;
                return `
                <div class="stat-card" data-refresh-type="database" data-card-id="pending-service-requests" draggable="true"${hasRequests ? ' style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;"' : ''}>
                    <div class="stat-icon ${hasRequests ? 'white' : 'orange'}">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label"${hasRequests ? ' style="color: rgba(255,255,255,0.9);"' : ''}>Pending Service Requests</div>
                        <div class="stat-value"${hasRequests ? ' style="color: white;"' : ''}>${totalPending}</div>
                        <small${hasRequests ? ' style="color: rgba(255,255,255,0.8);"' : ' class="text-muted"'}>
                            <i class="fas fa-film"></i> ${stats.pending_plex_requests || 0} Plex &nbsp;|&nbsp;
                            <i class="fas fa-tv"></i> ${stats.pending_iptv_requests || 0} IPTV
                        </small>
                    </div>
                </div>`;
            })(),

            'active-plex-users': `
                <div class="stat-card" data-refresh-type="database" data-card-id="active-plex-users" draggable="true">
                    <div class="stat-icon green">
                        <i class="fas fa-film"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Plex Subscribers</div>
                        <div class="stat-value">${stats.active_plex_users}</div>
                    </div>
                </div>`,

            'active-iptv-users': `
                <div class="stat-card" data-refresh-type="database" data-card-id="active-iptv-users" draggable="true">
                    <div class="stat-icon purple">
                        <i class="fas fa-tv"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">IPTV Subscribers</div>
                        <div class="stat-value">${stats.active_iptv_users}</div>
                    </div>
                </div>`,

            'plex-servers': `
                <div class="stat-card" data-refresh-type="database" data-card-id="plex-servers" draggable="true">
                    <div class="stat-icon ${stats.plex_servers_offline > 0 ? 'orange' : 'green'}">
                        <i class="fas fa-server"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Plex Servers</div>
                        <div class="stat-value">${stats.plex_servers_online}/${stats.plex_servers_count}</div>
                        <small class="text-${stats.plex_servers_offline > 0 ? 'warning' : 'success'}">
                            <i class="fas fa-circle"></i> ${stats.plex_servers_online} online ${stats.plex_servers_offline > 0 ? `, ${stats.plex_servers_offline} offline` : ''}
                        </small>
                    </div>
                </div>`,

            'iptv-panels': `
                <div class="stat-card" data-refresh-type="database" data-card-id="iptv-panels" draggable="true">
                    <div class="stat-icon purple">
                        <i class="fas fa-network-wired"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">IPTV Panels</div>
                        <div class="stat-value">${stats.iptv_panels_count}</div>
                    </div>
                </div>`,

            'expiring-soon': `
                <div class="stat-card" data-refresh-type="database" data-card-id="expiring-soon" draggable="true">
                    <div class="stat-icon ${stats.expiring_soon > 0 ? 'orange' : 'green'}">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Expiring Soon (7 days)</div>
                        <div class="stat-value">${stats.expiring_soon}</div>
                    </div>
                </div>`,

            'expiring-soon-month': `
                <div class="stat-card" data-refresh-type="database" data-card-id="expiring-soon-month" draggable="true">
                    <div class="stat-icon ${stats.expiring_soon_month > 0 ? 'orange' : 'green'}">
                        <i class="fas fa-calendar-times"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Expiring This Month</div>
                        <div class="stat-value">${stats.expiring_soon_month || 0}</div>
                        <small class="text-muted">Next 30 days</small>
                    </div>
                </div>`,

            'expiring-plex-week': `
                <div class="stat-card" data-refresh-type="database" data-card-id="expiring-plex-week" draggable="true">
                    <div class="stat-icon ${stats.expiring_plex_week > 0 ? 'orange' : 'green'}">
                        <i class="fas fa-film"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Expiring Plex Users</div>
                        <div class="stat-value">${stats.expiring_plex_week || 0}</div>
                        <small class="text-muted">Next 7 days</small>
                    </div>
                </div>`,

            'expiring-iptv-week': `
                <div class="stat-card" data-refresh-type="database" data-card-id="expiring-iptv-week" draggable="true">
                    <div class="stat-icon ${stats.expiring_iptv_week > 0 ? 'orange' : 'green'}">
                        <i class="fas fa-tv"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Expiring IPTV Users</div>
                        <div class="stat-value">${stats.expiring_iptv_week || 0}</div>
                        <small class="text-muted">Next 7 days</small>
                    </div>
                </div>`,

            'new-users-week': `
                <div class="stat-card" data-refresh-type="database" data-card-id="new-users-week" draggable="true">
                    <div class="stat-icon blue">
                        <i class="fas fa-user-plus"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">New Users (7 days)</div>
                        <div class="stat-value">${stats.new_users_week}</div>
                    </div>
                </div>`,

            'new-users-month': `
                <div class="stat-card" data-refresh-type="database" data-card-id="new-users-month" draggable="true">
                    <div class="stat-icon blue">
                        <i class="fas fa-user-plus"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">New Users This Month</div>
                        <div class="stat-value">${stats.new_users_month || 0}</div>
                        <small class="text-muted">Last 30 days</small>
                    </div>
                </div>`
        };

        return cards[cardId] || '';
    },

    /**
     * Load card preferences from database (user-specific)
     */
    /**
     * Load all dashboard preferences (cards and sections)
     */
    /**
     * Load preferences from localStorage cache (instant)
     * @returns {boolean} - Returns true if cached preferences were found
     */
    loadPreferencesFromCache() {
        try {
            const cached = localStorage.getItem('dashboard_preferences_cache');
            if (!cached) return false;

            const prefs = JSON.parse(cached);
            if (prefs.cardPreferences) {
                this.cardPreferences = prefs.cardPreferences;
            }
            if (prefs.sectionPreferences) {
                this.sectionPreferences = prefs.sectionPreferences;
            }
            console.log('[Dashboard] ✓ Loaded preferences from cache');
            return true;
        } catch (error) {
            console.error('[Dashboard] Error loading cached preferences:', error);
            return false;
        }
    },

    /**
     * Save preferences to localStorage cache
     */
    savePreferencesToCache() {
        try {
            const prefs = {
                cardPreferences: this.cardPreferences,
                sectionPreferences: this.sectionPreferences,
                timestamp: Date.now()
            };
            localStorage.setItem('dashboard_preferences_cache', JSON.stringify(prefs));
        } catch (error) {
            console.error('[Dashboard] Error saving preferences to cache:', error);
        }
    },

    async loadAllPreferences() {
        const defaultCardOrder = this.getDefaultCardOrder();
        const defaultSectionOrder = this.getDefaultSectionOrder();

        // Capture current preferences before loading from database (for comparison)
        const previousCardPrefs = this.cardPreferences ? JSON.parse(JSON.stringify(this.cardPreferences)) : null;
        const previousSectionPrefs = this.sectionPreferences ? JSON.parse(JSON.stringify(this.sectionPreferences)) : null;

        try {
            // Fetch preferences from API (won't auto-logout on 401)
            const response = await API.getUserPreferences();

            if (response && response.success && response.preferences) {
                // Load card preferences
                if (response.preferences.dashboardCards) {
                    this.cardPreferences = response.preferences.dashboardCards;

                    // Merge new cards that don't exist in saved preferences
                    const newCards = defaultCardOrder.filter(cardId => !this.cardPreferences.order.includes(cardId));
                    if (newCards.length > 0) {
                        console.log('[Dashboard] Adding new cards to saved preferences:', newCards);
                        this.cardPreferences.order = [...this.cardPreferences.order, ...newCards];
                        await this.saveAllPreferences();
                    }
                } else {
                    this.cardPreferences = {
                        order: defaultCardOrder,
                        hidden: []
                    };
                }

                // Load section preferences
                if (response.preferences.dashboardSections) {
                    this.sectionPreferences = response.preferences.dashboardSections;

                    // Merge new sections that don't exist in saved preferences
                    const newSections = defaultSectionOrder.filter(sectionId => !this.sectionPreferences.order.includes(sectionId));
                    if (newSections.length > 0) {
                        console.log('[Dashboard] Adding new sections to saved preferences:', newSections);
                        this.sectionPreferences.order = [...this.sectionPreferences.order, ...newSections];
                        await this.saveAllPreferences();
                    }
                } else {
                    this.sectionPreferences = {
                        order: defaultSectionOrder,
                        hidden: []
                    };
                }

                // Check if preferences actually changed before re-rendering
                const prefsChanged = JSON.stringify(previousCardPrefs) !== JSON.stringify(this.cardPreferences) ||
                                    JSON.stringify(previousSectionPrefs) !== JSON.stringify(this.sectionPreferences);

                // Save to localStorage cache for instant loading next time
                this.savePreferencesToCache();

                console.log('[Dashboard] Loaded preferences from database');

                // Only re-render if preferences actually changed from what was in localStorage
                // This prevents the "card order reset" issue when localStorage already had correct order
                if (this.cachedStats && prefsChanged) {
                    console.log('[Dashboard] Re-rendering stats with updated preferences');
                    this.displayStats(this.cachedStats, true);
                } else {
                    console.log('[Dashboard] Preferences unchanged, skipping re-render');
                }
                return;
            }
        } catch (error) {
            console.error('Error loading preferences from database:', error);
        }

        // Initialize default preferences if not exists or error occurred
        console.log('[Dashboard] Using default preferences');
        this.cardPreferences = {
            order: defaultCardOrder,
            hidden: []
        };
        this.sectionPreferences = {
            order: defaultSectionOrder,
            hidden: []
        };
    },

    /**
     * Save all preferences to database (user-specific)
     */
    async saveAllPreferences() {
        try {
            // Save to localStorage cache immediately for instant loading
            this.savePreferencesToCache();

            // Get current preferences from database
            const response = await API.getUserPreferences();
            const allPreferences = (response.success && response.preferences) ? response.preferences : {};

            // Update dashboard preferences
            allPreferences.dashboardCards = this.cardPreferences;
            allPreferences.dashboardSections = this.sectionPreferences;

            // Save back to database
            await API.saveUserPreferences(allPreferences);
            console.log('[Dashboard] All preferences saved to database', {
                cards: this.cardPreferences,
                sections: this.sectionPreferences
            });
        } catch (error) {
            console.error('Error saving preferences to database:', error);
        }
    },

    /**
     * Open comprehensive customization modal with cards and sections
     */
    openCustomizeModal() {
        const cardNames = {
            'total-app-users': 'Total App Users',
            'plex-live-streams': 'Plex Live Streams',
            'iptv-live-streams': 'IPTV Live Streams',
            'total-plex-users': 'Total Plex Users',
            'total-iptv-users': 'Total IPTV Users',
            'pending-invites': 'Pending Plex Invites',
            'active-plex-users': 'Plex Subscribers',
            'active-iptv-users': 'IPTV Subscribers',
            'plex-servers': 'Plex Servers',
            'iptv-panels': 'IPTV Panels',
            'expiring-soon': 'Expiring Soon (7 days)',
            'expiring-soon-month': 'Expiring This Month',
            'expiring-plex-week': 'Expiring Plex Users (7 days)',
            'expiring-iptv-week': 'Expiring IPTV Users (7 days)',
            'new-users-week': 'New Users This Week',
            'new-users-month': 'New Users This Month'
        };

        const sectionNames = this.getSectionNames();

        // Build cards checkboxes
        const cardCheckboxesHTML = this.cardPreferences.order.map(cardId => {
            const isHidden = this.cardPreferences.hidden.includes(cardId);
            return `
                <div style="margin: 0.5rem 0;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox"
                               value="${cardId}"
                               ${!isHidden ? 'checked' : ''}
                               style="margin-right: 0.5rem;">
                        ${cardNames[cardId] || cardId}
                    </label>
                </div>
            `;
        }).join('');

        // Build sections drag-and-drop list
        const sectionsHTML = this.sectionPreferences.order.map((sectionId, index) => {
            const isHidden = this.sectionPreferences.hidden.includes(sectionId);
            return `
                <div class="section-item" data-section-id="${sectionId}" draggable="true"
                     style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: move; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-grip-vertical" style="color: var(--text-secondary); font-size: 14px;"></i>
                        <label style="display: flex; align-items: center; cursor: pointer; margin: 0;">
                            <input type="checkbox"
                                   class="section-visibility-checkbox"
                                   value="${sectionId}"
                                   ${!isHidden ? 'checked' : ''}
                                   style="margin-right: 8px;">
                            <span style="font-weight: 500;">${sectionNames[sectionId] || sectionId}</span>
                        </label>
                    </div>
                    <i class="fas fa-bars" style="color: var(--text-secondary); font-size: 14px;"></i>
                </div>
            `;
        }).join('');

        const modalHTML = `
            <div class="modal-overlay" id="customize-modal" onclick="if(event.target === this) Dashboard.closeCustomizeModal()">
                <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-cog"></i> Customize Dashboard</h3>
                        <button class="btn-close" onclick="Dashboard.closeCustomizeModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Section Order and Visibility -->
                        <div style="margin-bottom: 2rem;">
                            <h4 style="margin-bottom: 1rem; font-size: 1.1rem;">
                                <i class="fas fa-layer-group"></i> Dashboard Sections
                            </h4>
                            <p style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                                Drag sections to reorder them. Uncheck to hide sections from your dashboard.
                            </p>
                            <div id="sections-list" style="margin-bottom: 1rem;">
                                ${sectionsHTML}
                            </div>
                        </div>

                        <hr style="border: none; border-top: 1px solid var(--border-color); margin: 2rem 0;">

                        <!-- Overview Stats Cards -->
                        <div>
                            <h4 style="margin-bottom: 1rem; font-size: 1.1rem;">
                                <i class="fas fa-th"></i> Overview Stats Cards
                            </h4>
                            <p style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                                Select which stat cards to display in the Overview Stats section.
                            </p>
                            <div id="card-visibility-checkboxes" style="column-count: 2; column-gap: 20px;">
                                ${cardCheckboxesHTML}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Dashboard.resetAllPreferences()">
                            <i class="fas fa-undo"></i> Reset to Default
                        </button>
                        <button class="btn btn-primary" onclick="Dashboard.saveCustomizeSettings()">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Initialize drag-and-drop for sections
        this.initSectionDragAndDrop();
    },

    /**
     * Close customize modal
     */
    closeCustomizeModal() {
        const modal = document.getElementById('customize-modal');
        if (modal) {
            modal.remove();
        }
    },

    /**
     * Save customize settings from modal
     */
    saveCustomizeSettings() {
        // Save card visibility
        const cardCheckboxes = document.querySelectorAll('#card-visibility-checkboxes input[type="checkbox"]');
        const hiddenCards = [];

        cardCheckboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                hiddenCards.push(checkbox.value);
            }
        });

        this.cardPreferences.hidden = hiddenCards;

        // Save section visibility and order
        const sectionItems = document.querySelectorAll('.section-item');
        const sectionOrder = [];
        const hiddenSections = [];

        sectionItems.forEach(item => {
            const sectionId = item.dataset.sectionId;
            sectionOrder.push(sectionId);

            const checkbox = item.querySelector('.section-visibility-checkbox');
            if (!checkbox.checked) {
                hiddenSections.push(sectionId);
            }
        });

        this.sectionPreferences.order = sectionOrder;
        this.sectionPreferences.hidden = hiddenSections;

        // Save to database
        this.saveAllPreferences();

        // Reload stats to apply changes
        this.loadStats(true);
        this.closeCustomizeModal();

        Utils.showToast('Success', 'Dashboard preferences saved!', 'success');
    },

    /**
     * Reset all preferences to default
     */
    resetAllPreferences() {
        if (confirm('Reset all dashboard preferences to default? This will restore the original order and show all sections and cards.')) {
            this.cardPreferences = {
                order: this.getDefaultCardOrder(),
                hidden: []
            };
            this.sectionPreferences = {
                order: this.getDefaultSectionOrder(),
                hidden: []
            };
            this.saveAllPreferences();
            this.loadStats(true);
            this.closeCustomizeModal();
            Utils.showToast('Success', 'Dashboard preferences reset to default!', 'success');
        }
    },

    /**
     * Initialize drag-and-drop for sections
     */
    initSectionDragAndDrop() {
        const sections = document.querySelectorAll('.section-item');

        sections.forEach(section => {
            section.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('sectionId', section.dataset.sectionId);
                section.classList.add('dragging');
                section.style.opacity = '0.5';
            });

            section.addEventListener('dragend', (e) => {
                section.classList.remove('dragging');
                section.style.opacity = '1';
            });

            section.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const draggingSection = document.querySelector('.section-item.dragging');
                if (draggingSection && draggingSection !== section) {
                    const rect = section.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;

                    if (e.clientY < midpoint) {
                        section.parentNode.insertBefore(draggingSection, section);
                    } else {
                        section.parentNode.insertBefore(draggingSection, section.nextSibling);
                    }
                }
            });

            section.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    },

    /**
     * Initialize drag and drop for cards
     */
    initDragAndDrop() {
        const cards = document.querySelectorAll('.stat-card[draggable="true"]');

        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', card.innerHTML);
                e.dataTransfer.setData('cardId', card.dataset.cardId);
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', (e) => {
                card.classList.remove('dragging');
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const draggingCard = document.querySelector('.stat-card.dragging');
                if (draggingCard && draggingCard !== card) {
                    const rect = card.getBoundingClientRect();
                    const midpoint = rect.left + rect.width / 2;

                    if (e.clientX < midpoint) {
                        card.parentNode.insertBefore(draggingCard, card);
                    } else {
                        card.parentNode.insertBefore(draggingCard, card.nextSibling);
                    }
                }
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Save new order
                this.saveCardOrder();
            });
        });
    },

    /**
     * Save current card order from DOM
     */
    saveCardOrder() {
        const cards = document.querySelectorAll('.stat-card[data-card-id]');
        const newOrder = Array.from(cards).map(card => card.dataset.cardId);

        this.cardPreferences.order = newOrder;
        this.saveAllPreferences();

        console.log('[Dashboard] Card order saved:', newOrder);
    },

    /**
     * Show loading indicators on API-dependent stat cards and sections
     */
    showLoadingIndicators() {
        // Show spinners on API-dependent stat cards (Plex Live Streams, IPTV Live Streams, etc.)
        const apiCards = document.querySelectorAll('[data-refresh-type="api"] .refresh-indicator');
        apiCards.forEach(el => {
            el.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="font-size: 0.7em; margin-left: 0.35rem;"></i>';
        });

        // Show spinner next to "NOW PLAYING" label
        const nowPlayingIndicator = document.getElementById('now-playing-refresh-indicator');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="font-size: 0.7em; margin-left: 0.5rem;"></i>';
        }

        // Show spinner next to "LIVE STREAMS" label (IPTV)
        const iptvLiveStreamsIndicator = document.getElementById('iptv-live-streams-refresh-indicator');
        if (iptvLiveStreamsIndicator) {
            iptvLiveStreamsIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="font-size: 0.7em; margin-left: 0.5rem;"></i>';
        }

        // Show spinner on "IPTV Panels" section header
        const iptvPanelsIndicator = document.getElementById('iptv-panels-refresh-indicator');
        if (iptvPanelsIndicator) {
            iptvPanelsIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="font-size: 0.7em; margin-left: 0.5rem; color: #64748b;"></i>';
        }

        // Show spinner on "Plex Servers" section header
        const plexServersIndicator = document.getElementById('plex-servers-refresh-indicator');
        if (plexServersIndicator) {
            plexServersIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="font-size: 0.7em; margin-left: 0.5rem; color: #64748b;"></i>';
        }

        // Clear Plex server CPU/Memory values to trigger spinners
        // Store current stats temporarily
        if (!this.cachedStatsBeforeRefresh && this.currentStats && this.currentStats.plex_server_details) {
            this.cachedStatsBeforeRefresh = JSON.parse(JSON.stringify(this.currentStats));

            // Set CPU/Memory to null to show spinners
            const clearedStats = JSON.parse(JSON.stringify(this.currentStats));
            clearedStats.plex_server_details.forEach(server => {
                server.cpu_percent = null;
                server.memory_percent = null;
            });

            // Re-render with null values to show spinners
            this.displayStats(clearedStats, true);
        }
    },

    /**
     * Remove loading indicators
     */
    removeLoadingIndicators() {
        // Remove spinners from API-dependent stat cards
        const apiCards = document.querySelectorAll('[data-refresh-type="api"] .refresh-indicator');
        apiCards.forEach(el => {
            el.innerHTML = '';
        });

        // Remove spinner from "NOW PLAYING" label
        const nowPlayingIndicator = document.getElementById('now-playing-refresh-indicator');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.innerHTML = '';
        }

        // Remove spinner from "LIVE STREAMS" label (IPTV)
        const iptvLiveStreamsIndicator = document.getElementById('iptv-live-streams-refresh-indicator');
        if (iptvLiveStreamsIndicator) {
            iptvLiveStreamsIndicator.innerHTML = '';
        }

        // Remove spinner from "IPTV Panels" section header
        const iptvPanelsIndicator = document.getElementById('iptv-panels-refresh-indicator');
        if (iptvPanelsIndicator) {
            iptvPanelsIndicator.innerHTML = '';
        }

        // Remove spinner from "Plex Servers" section header
        const plexServersIndicator = document.getElementById('plex-servers-refresh-indicator');
        if (plexServersIndicator) {
            plexServersIndicator.innerHTML = '';
        }

        // Restore cached stats if refresh was interrupted (fixes stuck CPU/Memory spinners)
        if (this.cachedStatsBeforeRefresh) {
            this.displayStats(this.cachedStatsBeforeRefresh, true);
            this.cachedStatsBeforeRefresh = null;
        }
    },

    /**
     * Show skeleton cards immediately to avoid blank screen
     */
    showSkeletonCards() {
        const container = document.getElementById('stats-container');
        if (!container) return;

        // Simple skeleton - show a grid of shimmer cards
        container.innerHTML = `
            <div class="row g-3 mb-3">
                ${[1,2,3,4].map(() => `
                    <div class="col-md-3">
                        <div class="card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); height: 120px;">
                            <div class="card-body" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
                                <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                                <div style="width: 80px; height: 12px; background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-top: 1rem;"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <style>
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            </style>
        `;
    },

    /**
     * Show placeholder dashboard with basic stats (loads instantly, no async needed)
     */
    showPlaceholderDashboard() {
        const container = document.getElementById('stats-container');
        if (!container) return;

        // Show basic stat cards with placeholder values - renders instantly
        container.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-md-3">
                    <div class="card" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">
                        <div class="card-body text-center">
                            <i class="fas fa-users" style="font-size: 2rem; color: var(--primary-color);"></i>
                            <h3 class="mt-2">...</h3>
                            <p class="text-muted mb-0">Total Users</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">
                        <div class="card-body text-center">
                            <i class="fas fa-play-circle" style="font-size: 2rem; color: #10b981;"></i>
                            <h3 class="mt-2">...</h3>
                            <p class="text-muted mb-0">Active Plex Users</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">
                        <div class="card-body text-center">
                            <i class="fas fa-tv" style="font-size: 2rem; color: #3b82f6;"></i>
                            <h3 class="mt-2">...</h3>
                            <p class="text-muted mb-0">Active IPTV Users</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">
                        <div class="card-body text-center">
                            <i class="fas fa-server" style="font-size: 2rem; color: #8b5cf6;"></i>
                            <h3 class="mt-2">...</h3>
                            <p class="text-muted mb-0">Plex Servers</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Capture which sections are currently expanded before DOM replacement
     */
    captureExpandedSections() {
        // Don't clear - keep the set updated incrementally
        // this.expandedSections.clear();

        // Check Now Playing section
        const nowPlayingContent = document.getElementById('now-playing-content');
        if (nowPlayingContent && nowPlayingContent.style.display !== 'none') {
            this.expandedSections.add('now-playing');
        } else if (nowPlayingContent) {
            this.expandedSections.delete('now-playing');
        }

        // Check Watch Stats section
        const watchStatsContent = document.getElementById('watch-stats-content');
        if (watchStatsContent && watchStatsContent.style.display !== 'none') {
            this.expandedSections.add('watch-stats');
        } else if (watchStatsContent) {
            this.expandedSections.delete('watch-stats');
        }

        // Check IPTV Live Streams section
        const iptvLiveStreamsContent = document.getElementById('iptv-live-streams-content');
        if (iptvLiveStreamsContent && iptvLiveStreamsContent.style.display !== 'none') {
            this.expandedSections.add('iptv-live-streams');
        } else if (iptvLiveStreamsContent) {
            this.expandedSections.delete('iptv-live-streams');
        }

        // Check all Plex server sections
        const serverContents = document.querySelectorAll('[id^="server-"][id$="-content"]');
        serverContents.forEach(content => {
            if (content.style.display !== 'none') {
                this.expandedSections.add(content.id);
            } else {
                this.expandedSections.delete(content.id);
            }
        });

        // Check all IPTV panel sections
        const panelContents = document.querySelectorAll('[id^="panel-"][id$="-content"]');
        panelContents.forEach(content => {
            if (content.style.display !== 'none') {
                this.expandedSections.add(content.id);
            } else {
                this.expandedSections.delete(content.id);
            }
        });

        console.log('[Dashboard] Captured expanded sections:', Array.from(this.expandedSections));
    },

    /**
     * Restore previously expanded sections after DOM replacement
     */
    restoreExpandedSections() {
        if (this.expandedSections.size === 0) {
            return;
        }

        console.log('[Dashboard] Restoring expanded sections:', Array.from(this.expandedSections));

        this.expandedSections.forEach(sectionId => {
            if (sectionId === 'now-playing') {
                // Restore Now Playing section
                const content = document.getElementById('now-playing-content');
                const icon = document.getElementById('now-playing-icon');
                if (content && icon) {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                }
            } else if (sectionId === 'watch-stats') {
                // Restore Watch Stats section
                const content = document.getElementById('watch-stats-content');
                const icon = document.getElementById('watch-stats-icon');
                if (content && icon) {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                    // Render watch stats content if we have data
                    if (this.watchStats && Object.keys(this.watchStats).length > 0) {
                        content.innerHTML = this.renderWatchStatsContent();
                    }
                }
            } else if (sectionId === 'iptv-live-streams') {
                // Restore IPTV Live Streams section
                const content = document.getElementById('iptv-live-streams-content');
                const icon = document.getElementById('iptv-live-streams-icon');
                if (content && icon) {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                }
            } else if (sectionId.startsWith('server-')) {
                // Restore Plex server section
                const content = document.getElementById(sectionId);
                const iconId = sectionId.replace('-content', '-icon');
                const icon = document.getElementById(iconId);
                if (content && icon) {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                }
            } else if (sectionId.startsWith('panel-')) {
                // Restore IPTV panel section
                const content = document.getElementById(sectionId);
                const iconId = sectionId.replace('-content', '-icon');
                const icon = document.getElementById(iconId);
                if (content && icon) {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                }
            }
        });
    },

    /**
     * Generate HTML for dashboard sections based on preferences
     * @param {Object} sectionsMap - Map of section IDs to their HTML content
     * @returns {string} - Ordered HTML based on user preferences
     */
    generateSectionsHTML(sectionsMap) {
        let sectionsHTML = '';

        // Loop through sections in preferred order
        // Use defaults if preferences haven't loaded yet
        const sectionOrder = this.sectionPreferences?.order || this.getDefaultSectionOrder();
        const hiddenSections = this.sectionPreferences?.hidden || [];

        sectionOrder.forEach(sectionId => {
            // Skip hidden sections
            if (hiddenSections.includes(sectionId)) {
                return;
            }

            // Add section HTML if it exists
            if (sectionsMap[sectionId]) {
                sectionsHTML += sectionsMap[sectionId];
            }
        });

        return sectionsHTML;
    },

    /**
     * Display stats (shared logic for cached and fresh data)
     */
    displayStats(stats, isCached = false) {
        // Debug: Log stats to check libraries data
        if (!isCached) {
            console.log('[DEBUG] Dashboard stats received:', stats);
            console.log('[DEBUG] Plex server details:', stats.plex_server_details);
            if (stats.plex_server_details && stats.plex_server_details.length > 0) {
                stats.plex_server_details.forEach((server, index) => {
                    console.log(`[DEBUG] Server ${index} (${server.name}):`, {
                        libraries: server.libraries,
                        libraryCount: server.libraries?.length || 0
                    });
                });
            }
        }

        // Capture which sections are currently expanded before DOM replacement
        this.captureExpandedSections();

        const statsContainer = document.getElementById('stats-container');

        // If stats container doesn't exist (user navigated away), stop updating
        if (!statsContainer) {
            return;
        }

        // Calculate total IPTV users across all panels (before rendering cards)
        let totalIPTVUsers = 0;
        if (stats.iptv_panels_data && stats.iptv_panels_data.panels) {
            stats.iptv_panels_data.panels.forEach(panel => {
                if (!panel.error && panel.users && panel.users.total) {
                    totalIPTVUsers += panel.users.total;
                }
            });
        }
        stats.total_iptv_users = totalIPTVUsers;

        // Aggregate all IPTV live streams from all panels - grouped by username (before rendering cards)
        const iptvLiveStreamsByUser = {};
        let totalIPTVStreams = 0;

        if (stats.iptv_panels_data && stats.iptv_panels_data.panels) {
            stats.iptv_panels_data.panels.forEach(panel => {
                if (panel.liveViewers && panel.liveViewers.length > 0) {
                    panel.liveViewers.forEach(viewer => {
                        if (viewer.connections && viewer.connections.length > 0) {
                            // Group by username
                            if (!iptvLiveStreamsByUser[viewer.username]) {
                                iptvLiveStreamsByUser[viewer.username] = {
                                    username: viewer.username,
                                    streams: [],
                                    totalConnections: 0,
                                    maxConnections: viewer.maxConnections
                                };
                            }

                            // Add each connection with panel info, logo, and category
                            viewer.connections.forEach(conn => {
                                iptvLiveStreamsByUser[viewer.username].streams.push({
                                    panel_name: panel.panel_name,
                                    streamName: conn.streamName || 'Unknown',
                                    ip: conn.ip || 'Unknown',
                                    userAgent: conn.user_agent || conn.userAgent || 'Unknown',
                                    dateStart: conn.dateStart || conn.date_start || null,
                                    logo: conn.logo || null,
                                    category: conn.category || null
                                });
                                totalIPTVStreams++;
                            });

                            iptvLiveStreamsByUser[viewer.username].totalConnections += viewer.connections.length;
                        }
                    });
                }
            });
        }

        const iptvLiveStreamsList = Object.values(iptvLiveStreamsByUser);

        // Update the IPTV live streams count in stats
        stats.iptv_live_streams = totalIPTVStreams;

        // Build stats grid HTML dynamically based on card preferences (after calculations)
        // Wrap in collapsible section for mobile
        let statsGridHTML = `
            <div class="card" style="margin-bottom: 2rem;">
                <div class="card-header" style="cursor: pointer; user-select: none;" onclick="Dashboard.toggleStatsGrid()" id="stats-grid-header">
                    <h3 class="card-title">
                        <i class="fas fa-chart-pie"></i>
                        Overview Stats
                        <i id="stats-grid-icon" class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.8rem; transition: transform 0.3s;"></i>
                    </h3>
                </div>
                <div id="stats-grid-content" class="card-body" style="padding: 1.5rem;">
                    <div class="stats-grid">`;

        // Loop through cards in the saved order
        // Use defaults if preferences haven't loaded yet
        const cardOrder = this.cardPreferences?.order || this.getDefaultCardOrder();
        const hiddenCards = this.cardPreferences?.hidden || [];

        cardOrder.forEach(cardId => {
            // Skip hidden cards
            if (!hiddenCards.includes(cardId)) {
                const cardHTML = this.generateCardHTML(cardId, stats);
                if (cardHTML) {
                    statsGridHTML += cardHTML;
                }
            }
        });

        statsGridHTML += `
                    </div>
                </div>
            </div>`;

        // Build IPTV Section HTML
        const iptvSectionHTML = `
            <!-- IPTV Panels Section -->
            ${stats.iptv_panels_data && stats.iptv_panels_data.panels && stats.iptv_panels_data.panels.length > 0 ? `
            <div class="card" style="margin-top: 2rem;">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-network-wired"></i>
                        IPTV Panels
                        <span id="iptv-panels-refresh-indicator"></span>
                    </h3>
                </div>
                <div class="card-body" style="padding: 0;">
                    <!-- Panel Cards -->
                    <div style="border-top: 1px solid var(--border-color);">
                        ${stats.iptv_panels_data.panels.map((panel, index) => `
                            <div style="border-bottom: 1px solid var(--border-color);">
                                <!-- Panel Header -->
                                <div style="padding: 1.25rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background-color 0.2s;"
                                     onclick="Dashboard.toggleIPTVPanelCard('panel-${index}')"
                                     onmouseenter="this.style.backgroundColor='#f8fafc'"
                                     onmouseleave="this.style.backgroundColor='white'">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${panel.error ? '#ef4444' : '#10b981'};"></div>
                                        <div>
                                            <div style="font-weight: 600; font-size: 1rem; color: #0f172a; margin-bottom: 0.25rem;">
                                                <i class="fas fa-network-wired" style="margin-right: 0.5rem; color: #8b5cf6;"></i>
                                                ${panel.panel_name}
                                            </div>
                                            ${!panel.error ? `
                                                <div style="font-size: 0.75rem; color: #64748b;">
                                                    ${panel.users.total} Users • ${panel.users.liveNow} Live Viewers
                                                </div>
                                            ` : `
                                                <div style="font-size: 0.75rem; color: #ef4444;">
                                                    Error: ${panel.error}
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        ${!panel.error ? `
                                            <div style="text-align: right;">
                                                <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.15rem;">Credits</div>
                                                <div style="font-size: 0.85rem; font-weight: 600; color: ${panel.credits < 10 ? '#ef4444' : panel.credits < 50 ? '#f59e0b' : '#10b981'};">
                                                    ${panel.credits !== undefined ? Math.round(panel.credits).toLocaleString() : 'N/A'}
                                                </div>
                                            </div>
                                        ` : ''}
                                        <i id="panel-${index}-icon" class="fas fa-chevron-down" style="color: #64748b; font-size: 0.9rem; transition: transform 0.3s;"></i>
                                    </div>
                                </div>

                                <!-- Panel Details (Expandable) -->
                                <div id="panel-${index}-content" style="display: none; padding: 0 1.25rem 1.25rem 1.25rem; background: var(--bg-tertiary);">
                                    ${!panel.error ? `
                                        <!-- Panel Stats Grid -->
                                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #3b82f6;">
                                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Live Channels</div>
                                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">
                                                    ${panel.content.status === 'needs_configured' ? '<span style="font-size: 0.875rem; color: #f59e0b;">Needs configured</span>' : (panel.content.liveChannels || 0)}
                                                </div>
                                            </div>
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #ec4899;">
                                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">VOD Movies</div>
                                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">
                                                    ${panel.content.status === 'needs_configured' ? '<span style="font-size: 0.875rem; color: #f59e0b;">Needs configured</span>' : (panel.content.vodMovies || 0)}
                                                </div>
                                            </div>
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #8b5cf6;">
                                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">VOD Series</div>
                                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">
                                                    ${panel.content.status === 'needs_configured' ? '<span style="font-size: 0.875rem; color: #f59e0b;">Needs configured</span>' : (panel.content.vodSeries || 0)}
                                                </div>
                                            </div>
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #10b981;">
                                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Total Users</div>
                                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${panel.users.total || 0}</div>
                                            </div>
                                        </div>

                                        <!-- M3U Sync Info/Button -->
                                        ${panel.content.status === 'needs_configured' ? `
                                            <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
                                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                                    <i class="fas fa-info-circle" style="color: #f59e0b; font-size: 1.25rem;"></i>
                                                    <div>
                                                        <div style="font-weight: 600; color: #92400e; margin-bottom: 0.25rem;">Content Stats Not Configured</div>
                                                        <div style="font-size: 0.875rem; color: #78350f;">
                                                            Add an M3U playlist URL in panel settings to display channel/movie/series counts
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ` : panel.content.m3u_url ? `
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                                                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                                                    ${panel.content.m3u_last_sync ? `Last synced: ${new Date(panel.content.m3u_last_sync + 'Z').toLocaleString()}` : ''}
                                                </div>
                                                <button class="btn btn-sm btn-primary" onclick="Dashboard.syncM3UPlaylist(${panel.panel_id})" style="white-space: nowrap;">
                                                    <i class="fas fa-sync-alt"></i> Sync M3U
                                                </button>
                                            </div>
                                        ` : ''}

                                        <!-- Live Viewers Section - Card Format -->
                                        ${panel.liveViewers && panel.liveViewers.length > 0 ? `
                                            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem;">
                                                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 1rem; display: flex; align-items: center;">
                                                    <i class="fas fa-eye" style="margin-right: 0.5rem; color: #ef4444;"></i>
                                                    Live Viewers (${panel.liveViewers.length})
                                                </div>
                                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 0.75rem;">
                                                    ${panel.liveViewers.map(viewer => `
                                                        <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.5rem; overflow: hidden;">
                                                            <!-- User Header -->
                                                            <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(239, 68, 68, 0.1); display: flex; justify-content: space-between; align-items: center;">
                                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                                    <div style="width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #ef4444 0%, #a855f7 100%); display: flex; align-items: center; justify-content: center;">
                                                                        <i class="fas fa-user" style="color: white; font-size: 0.65rem;"></i>
                                                                    </div>
                                                                    <span style="font-weight: 600; font-size: 0.8rem; color: var(--text-primary);">${viewer.username}</span>
                                                                    <span style="font-size: 0.65rem; color: var(--text-secondary);">(${viewer.connections.length} ${viewer.connections.length === 1 ? 'stream' : 'streams'})</span>
                                                                </div>
                                                                <div style="padding: 0.2rem 0.4rem; background: ${viewer.activeConnections >= viewer.maxConnections ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; border-radius: 0.25rem;">
                                                                    <span style="font-size: 0.75rem; font-weight: 700; color: ${viewer.activeConnections >= viewer.maxConnections ? '#ef4444' : '#10b981'};">
                                                                        ${viewer.activeConnections}/${viewer.maxConnections}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <!-- Streams -->
                                                            <div style="padding: 0.5rem; display: grid; gap: 0.4rem;">
                                                                ${viewer.connections.map(conn => `
                                                                    <div style="display: flex; gap: 0.5rem; padding: 0.4rem; background: var(--bg-tertiary); border-radius: 0.375rem; align-items: center;">
                                                                        <!-- Channel Logo -->
                                                                        <div style="flex-shrink: 0; width: 40px; height: 40px; border-radius: 0.25rem; overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center;">
                                                                            ${conn.logo ? `
                                                                                <img src="${conn.logo}" alt="${conn.streamName}"
                                                                                     style="width: 100%; height: 100%; object-fit: contain;"
                                                                                     onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-tv\\' style=\\'font-size: 1rem; color: var(--text-muted); opacity: 0.5;\\'></i>'"/>
                                                                            ` : `
                                                                                <i class="fas fa-tv" style="font-size: 1rem; color: var(--text-muted); opacity: 0.5;"></i>
                                                                            `}
                                                                        </div>

                                                                        <!-- Stream Details -->
                                                                        <div style="flex: 1; min-width: 0;">
                                                                            <div style="font-weight: 600; font-size: 0.7rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${conn.streamName}">
                                                                                ${conn.streamName}
                                                                            </div>
                                                                            ${conn.category ? `
                                                                                <span style="display: inline-block; padding: 0.1rem 0.25rem; background: rgba(139, 92, 246, 0.15); color: #a78bfa; font-size: 0.5rem; border-radius: 0.15rem; text-transform: uppercase; font-weight: 600; margin-top: 0.15rem;">
                                                                                    ${conn.category}
                                                                                </span>
                                                                            ` : ''}
                                                                            <div class="iptv-stream-ip" style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.55rem; color: var(--text-secondary); margin-top: 0.15rem;">
                                                                                <i class="fas fa-map-marker-alt" style="color: #ec4899; font-size: 0.45rem;"></i>
                                                                                <span>${conn.ip}</span>
                                                                                ${conn.dateStart ? `
                                                                                    <span style="color: var(--text-muted);">• ${Dashboard.formatRelativeTime(conn.dateStart)}</span>
                                                                                ` : ''}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        ` : `
                                            <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 0.5rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
                                                <i class="fas fa-eye-slash" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
                                                <div>No live viewers</div>
                                            </div>
                                        `}
                                    ` : `
                                        <div style="background: var(--bg-secondary); padding: 2rem; border-radius: 0.5rem; text-align: center; color: var(--text-secondary);">
                                            <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.75rem; color: #ef4444;"></i>
                                            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">Panel Error</div>
                                            <div style="font-size: 0.8rem;">${panel.error}</div>
                                        </div>
                                    `}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- IPTV Live Streams (Subsection) -->
                    <div style="border-top: 1px solid var(--border-color); padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; cursor: pointer;" onclick="toggleSection('iptv-live-streams')">
                            <h4 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; display: flex; align-items: center;">
                                <i class="fas fa-play-circle" style="margin-right: 0.5rem;"></i>
                                LIVE STREAMS
                                <span id="iptv-live-streams-refresh-indicator" class="iptv-live-streams-refresh-indicator"></span>
                                <i id="iptv-live-streams-icon" class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.7rem; transition: transform 0.3s;"></i>
                            </h4>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">
                                    Viewers: <strong>${iptvLiveStreamsList.length}</strong> | Streams: <strong>${totalIPTVStreams}</strong>
                                </span>
                            </div>
                        </div>
                        <div id="iptv-live-streams-content" style="display: none;">
                            ${iptvLiveStreamsList.length > 0 ? `
                                <!-- Desktop View - Card-based IPTV Live Streams Grid -->
                                <div class="iptv-streams-desktop" style="grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 0.75rem;">
                                    ${iptvLiveStreamsList.map(viewer => `
                                        <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.5rem; overflow: hidden;">
                                            <!-- User Header - Compact -->
                                            <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(239, 68, 68, 0.1); display: flex; justify-content: space-between; align-items: center;">
                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                    <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #ef4444 0%, #a855f7 100%); display: flex; align-items: center; justify-content: center;">
                                                        <i class="fas fa-user" style="color: white; font-size: 0.7rem;"></i>
                                                    </div>
                                                    <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">
                                                        ${viewer.username}
                                                    </div>
                                                    <div style="font-size: 0.7rem; color: var(--text-secondary);">
                                                        (${viewer.streams.length} ${viewer.streams.length === 1 ? 'stream' : 'streams'})
                                                    </div>
                                                </div>
                                                <div style="padding: 0.25rem 0.5rem; background: ${viewer.totalConnections >= viewer.maxConnections ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; border-radius: 0.25rem;">
                                                    <span style="font-size: 0.8rem; font-weight: 700; color: ${viewer.totalConnections >= viewer.maxConnections ? '#ef4444' : '#10b981'};">
                                                        ${viewer.totalConnections}/${viewer.maxConnections}
                                                    </span>
                                                    <span style="font-size: 0.6rem; color: var(--text-secondary); text-transform: uppercase; margin-left: 0.25rem;">conn</span>
                                                </div>
                                            </div>

                                            <!-- Streams Grid - 2 columns when possible -->
                                            <div style="padding: 0.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.5rem;">
                                                ${viewer.streams.map(stream => `
                                                    <div style="display: flex; gap: 0.5rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 0.375rem;">
                                                        <!-- Channel Logo - Smaller -->
                                                        <div style="flex-shrink: 0; width: 50px; height: 50px; border-radius: 0.25rem; overflow: hidden; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center;">
                                                            ${stream.logo ? `
                                                                <img src="${stream.logo}" alt="${stream.streamName}"
                                                                     style="width: 100%; height: 100%; object-fit: contain;"
                                                                     onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-tv\\' style=\\'font-size: 1.2rem; color: var(--text-muted); opacity: 0.5;\\'></i>'"/>
                                                            ` : `
                                                                <i class="fas fa-tv" style="font-size: 1.2rem; color: var(--text-muted); opacity: 0.5;"></i>
                                                            `}
                                                        </div>

                                                        <!-- Stream Details - Compact -->
                                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
                                                            <div style="font-weight: 600; font-size: 0.75rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${stream.streamName}">
                                                                ${stream.streamName}
                                                            </div>

                                                            <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.15rem; flex-wrap: wrap;">
                                                                ${stream.category ? `
                                                                    <span style="padding: 0.1rem 0.3rem; background: rgba(139, 92, 246, 0.15); color: #a78bfa; font-size: 0.55rem; border-radius: 0.15rem; text-transform: uppercase; font-weight: 600;">
                                                                        ${stream.category}
                                                                    </span>
                                                                ` : ''}
                                                                <span style="padding: 0.1rem 0.3rem; background: rgba(139, 92, 246, 0.1); color: #a78bfa; font-size: 0.55rem; border-radius: 0.15rem;">
                                                                    ${stream.panel_name}
                                                                </span>
                                                            </div>

                                                            <div class="iptv-stream-ip" style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.6rem; color: var(--text-secondary); margin-top: 0.2rem;">
                                                                <i class="fas fa-map-marker-alt" style="color: #ec4899; font-size: 0.5rem;"></i>
                                                                <span>${stream.ip}</span>
                                                                ${stream.dateStart ? `
                                                                    <span style="margin-left: 0.25rem; color: var(--text-muted);">• ${Dashboard.formatRelativeTime(stream.dateStart)}</span>
                                                                ` : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- Mobile View - Compact IPTV Live Streams -->
                                <div class="iptv-streams-mobile" style="grid-template-columns: 1fr; gap: 0.5rem;">
                                    ${iptvLiveStreamsList.map(viewer => `
                                        <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.5rem; overflow: hidden;">
                                            <!-- Mobile User Header - Very Compact -->
                                            <div style="padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(239, 68, 68, 0.1); display: flex; justify-content: space-between; align-items: center;">
                                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                                    <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #ef4444 0%, #a855f7 100%); display: flex; align-items: center; justify-content: center;">
                                                        <i class="fas fa-user" style="color: white; font-size: 0.55rem;"></i>
                                                    </div>
                                                    <span style="font-weight: 600; font-size: 0.75rem; color: var(--text-primary);">${viewer.username}</span>
                                                </div>
                                                <div style="padding: 0.15rem 0.35rem; background: ${viewer.totalConnections >= viewer.maxConnections ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; border-radius: 0.2rem;">
                                                    <span style="font-size: 0.7rem; font-weight: 700; color: ${viewer.totalConnections >= viewer.maxConnections ? '#ef4444' : '#10b981'};">
                                                        ${viewer.totalConnections}/${viewer.maxConnections}
                                                    </span>
                                                </div>
                                            </div>

                                            <!-- Mobile Streams List - Ultra Compact -->
                                            <div style="padding: 0.35rem;">
                                                ${viewer.streams.map(stream => `
                                                    <div style="display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem; background: var(--bg-secondary); border-radius: 0.25rem; margin-bottom: 0.25rem;">
                                                        <!-- Mini Channel Logo -->
                                                        <div style="flex-shrink: 0; width: 32px; height: 32px; border-radius: 0.2rem; overflow: hidden; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center;">
                                                            ${stream.logo ? `
                                                                <img src="${stream.logo}" alt="${stream.streamName}"
                                                                     style="width: 100%; height: 100%; object-fit: contain;"
                                                                     onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-tv\\' style=\\'font-size: 0.75rem; color: var(--text-muted); opacity: 0.5;\\'></i>'"/>
                                                            ` : `
                                                                <i class="fas fa-tv" style="font-size: 0.75rem; color: var(--text-muted); opacity: 0.5;"></i>
                                                            `}
                                                        </div>

                                                        <!-- Mobile Stream Info -->
                                                        <div style="flex: 1; min-width: 0;">
                                                            <div style="font-weight: 600; font-size: 0.7rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                                ${stream.streamName}
                                                            </div>
                                                            <div class="iptv-stream-ip" style="font-size: 0.55rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.2rem;">
                                                                <span>${stream.ip}</span>
                                                                ${stream.dateStart ? `<span style="color: var(--text-muted);">• ${Dashboard.formatRelativeTime(stream.dateStart)}</span>` : ''}
                                                            </div>
                                                        </div>

                                                        <!-- Panel Badge - Mobile -->
                                                        <span style="flex-shrink: 0; padding: 0.1rem 0.25rem; background: rgba(139, 92, 246, 0.1); color: #a78bfa; font-size: 0.5rem; border-radius: 0.15rem;">
                                                            ${stream.panel_name}
                                                        </span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                                    <i class="fas fa-satellite-dish" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                                    <p style="margin: 0; font-size: 0.9rem;">No active streams</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
        `;

        // Build Plex Section HTML - only show if Plex servers are configured
        const plexSectionHTML = (stats.plex_server_details && stats.plex_server_details.length > 0) ? `
            <!-- Plex Servers Section -->
            <div class="card" style="margin-top: 2rem;">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-server"></i>
                        Plex Servers
                        <span id="plex-servers-refresh-indicator"></span>
                    </h3>
                </div>
                <div class="card-body" style="padding: 0;">
                    <!-- Server Cards -->
                    ${stats.plex_server_details && stats.plex_server_details.length > 0 ? `
                        <div style="border-top: 1px solid var(--border-color);">
                            ${stats.plex_server_details.map((server, index) => `
                                <div style="border-bottom: 1px solid var(--border-color);">
                                    <!-- Server Header -->
                                    <div style="padding: 1.25rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background-color 0.2s;"
                                         onclick="Dashboard.toggleServerCard('server-${index}')"
                                         onmouseenter="this.style.backgroundColor='#f8fafc'"
                                         onmouseleave="this.style.backgroundColor='white'">
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${server.status === 'online' ? '#10b981' : '#ef4444'};"></div>
                                            <div>
                                                <div style="font-weight: 600; font-size: 1rem; color: #0f172a; margin-bottom: 0.25rem;">
                                                    <i class="fas fa-server" style="margin-right: 0.5rem; color: #3b82f6;"></i>
                                                    ${server.name}
                                                </div>
                                                <div style="font-size: 0.75rem; color: #64748b;">
                                                    ${server.status === 'online' ?
                                                        `${server.libraries?.length || 0} Libraries • ${server.users || 0} Users • ${server.activeSessions || 0} Active ${server.activeSessions === 1 ? 'Session' : 'Sessions'}` :
                                                        'Offline'
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 1rem;">
                                            ${server.status === 'online' ? `
                                                <div style="text-align: right;">
                                                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.15rem;">CPU</div>
                                                    ${server.cpu_percent != null ? `
                                                        <div style="font-size: 0.85rem; font-weight: 600; color: ${server.cpu_percent > 80 ? '#ef4444' : server.cpu_percent > 50 ? '#f59e0b' : '#10b981'};">
                                                            ${Number(server.cpu_percent).toFixed(1)}%
                                                        </div>
                                                    ` : `
                                                        <div style="font-size: 0.85rem; font-weight: 600; color: #64748b;">N/A</div>
                                                    `}
                                                </div>
                                            ` : ''}
                                            ${server.status === 'online' ? `
                                                <div style="text-align: right;">
                                                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.15rem;">Memory</div>
                                                    ${server.memory_percent != null ? `
                                                        <div style="font-size: 0.85rem; font-weight: 600; color: ${server.memory_percent > 80 ? '#ef4444' : server.memory_percent > 50 ? '#f59e0b' : '#10b981'};">
                                                            ${Number(server.memory_percent).toFixed(1)}%
                                                        </div>
                                                    ` : `
                                                        <div style="font-size: 0.85rem; font-weight: 600; color: #64748b;">N/A</div>
                                                    `}
                                                </div>
                                            ` : ''}
                                            <i id="server-${index}-icon" class="fas fa-chevron-down" style="color: #64748b; font-size: 0.9rem; transition: transform 0.3s;"></i>
                                        </div>
                                    </div>

                                    <!-- Server Details (Expandable) -->
                                    <div id="server-${index}-content" style="display: none; padding: 0 1.25rem 1.25rem 1.25rem; background: var(--bg-tertiary);">
                                        ${server.status === 'online' ? `
                                            <!-- Server Stats Grid -->
                                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                                                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #3b82f6;">
                                                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Total Users</div>
                                                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${server.users || 0}</div>
                                                </div>
                                                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #f59e0b;">
                                                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Pending Invites</div>
                                                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${server.pending || 0}</div>
                                                </div>
                                                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #10b981;">
                                                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Active Sessions</div>
                                                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${server.activeSessions || 0}</div>
                                                </div>
                                                ${server.bandwidth_mbps !== null && server.bandwidth_mbps !== undefined && server.bandwidth_mbps > 0 ? `
                                                    <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #ec4899;">
                                                        <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Bandwidth</div>
                                                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${Number(server.bandwidth_mbps).toFixed(1)} <span style="font-size: 0.9rem; color: var(--text-secondary);">Mbps</span></div>
                                                    </div>
                                                ` : ''}
                                            </div>

                                            <!-- Libraries Section -->
                                            ${server.libraries && server.libraries.length > 0 ? `
                                                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem;">
                                                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 1rem; display: flex; align-items: center;">
                                                        <i class="fas fa-photo-video" style="margin-right: 0.5rem; color: #8b5cf6;"></i>
                                                        Libraries
                                                    </div>
                                                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem;">
                                                        ${server.libraries.map(lib => {
                                                            const typeIcons = {
                                                                'movie': 'fa-film',
                                                                'show': 'fa-tv',
                                                                'artist': 'fa-music',
                                                                'photo': 'fa-camera'
                                                            };
                                                            const typeColors = {
                                                                'movie': '#ec4899',
                                                                'show': '#3b82f6',
                                                                'artist': '#8b5cf6',
                                                                'photo': '#10b981'
                                                            };
                                                            const icon = typeIcons[lib.type] || 'fa-folder';
                                                            const color = typeColors[lib.type] || '#64748b';

                                                            return `
                                                                <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 0.375rem; border-left: 3px solid ${color};">
                                                                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                                                        <i class="fas ${icon}" style="color: ${color}; font-size: 0.85rem;"></i>
                                                                        <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lib.title}">
                                                                            ${lib.title}
                                                                        </div>
                                                                    </div>
                                                                    <div style="display: flex; justify-content: flex-end; align-items: center;">
                                                                        ${lib.type === 'artist' && lib.artistCount !== undefined && lib.albumCount !== undefined ? `
                                                                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                                                                                <span style="font-size: 0.75rem; font-weight: 600; color: ${color};">${lib.artistCount.toLocaleString()} ${lib.artistCount === 1 ? 'artist' : 'artists'}</span>
                                                                                <span style="font-size: 0.7rem; color: var(--text-secondary);">${lib.albumCount.toLocaleString()} ${lib.albumCount === 1 ? 'album' : 'albums'}</span>
                                                                            </div>
                                                                        ` : lib.type === 'show' && lib.showCount !== undefined && lib.seasonCount !== undefined && lib.episodeCount !== undefined ? `
                                                                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                                                                                <span style="font-size: 0.75rem; font-weight: 600; color: ${color};">${lib.showCount.toLocaleString()} ${lib.showCount === 1 ? 'show' : 'shows'}</span>
                                                                                <span style="font-size: 0.7rem; color: var(--text-secondary);">${lib.seasonCount.toLocaleString()} ${lib.seasonCount === 1 ? 'season' : 'seasons'}, ${lib.episodeCount.toLocaleString()} ${lib.episodeCount === 1 ? 'episode' : 'episodes'}</span>
                                                                            </div>
                                                                        ` : `
                                                                            <span style="font-size: 0.85rem; font-weight: 600; color: ${color};">${lib.count.toLocaleString()} ${lib.count === 1 ? 'item' : 'items'}</span>
                                                                        `}
                                                                    </div>
                                                                </div>
                                                            `;
                                                        }).join('')}
                                                    </div>
                                                </div>
                                            ` : `
                                                <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 0.5rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
                                                    <i class="fas fa-photo-video" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
                                                    <div>No libraries found</div>
                                                </div>
                                            `}
                                        ` : `
                                            <div style="background: var(--bg-secondary); padding: 2rem; border-radius: 0.5rem; text-align: center; color: var(--text-secondary);">
                                                <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.75rem; color: #ef4444;"></i>
                                                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">Server Offline</div>
                                                <div style="font-size: 0.8rem;">This server is currently unavailable</div>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <!-- Now Playing -->
                    ${stats.live_sessions && stats.live_sessions.length > 0 ? `
                        <div style="border-top: 1px solid var(--border-color); padding: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; cursor: pointer;" onclick="toggleSection('now-playing')">
                                <h4 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; display: flex; align-items: center;">
                                    <i class="fas fa-play-circle" style="margin-right: 0.5rem;"></i>
                                    NOW PLAYING
                                    <span id="now-playing-refresh-indicator" class="now-playing-refresh-indicator"></span>
                                    <i id="now-playing-icon" class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.7rem; transition: transform 0.3s;"></i>
                                </h4>
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                    <span style="font-size: 0.85rem; color: var(--text-secondary);">
                                        Sessions: <strong>${stats.total_live_sessions}</strong> (${stats.direct_plays_count + stats.direct_streams_count} direct plays, ${stats.transcodes_count} transcodes) | Bandwidth: <strong>${stats.total_bandwidth_mbps} Mbps (WAN: ${stats.wan_bandwidth_mbps} Mbps)</strong>
                                    </span>
                                </div>
                            </div>
                            <div id="now-playing-content" style="display: none;">
                                <!-- Mobile View - Compact Cards -->
                                <div class="now-playing-mobile" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                                    ${stats.live_sessions.map((session, index) => {
                                        // Build title display
                                        let titleDisplay = session.title;
                                        let subtitleDisplay = '';

                                        if (session.type === 'episode' && session.grandparentTitle) {
                                            titleDisplay = session.grandparentTitle;
                                            let episodeInfo = session.title;
                                            if (session.parentIndex && session.index) {
                                                episodeInfo = `S${session.parentIndex}E${session.index} - ${session.title}`;
                                            }
                                            subtitleDisplay = episodeInfo;
                                        }

                                        return `
                                        <div class="plex-session-card">
                                            <!-- Poster -->
                                            <div class="session-poster">
                                                ${session.thumbnail ? `
                                                    <img src="${session.thumbnail}" alt="${titleDisplay}"
                                                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;"
                                                         onerror="this.style.display='none'"/>
                                                ` : `
                                                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #4a5568;">
                                                        <i class="fas fa-${session.type === 'movie' ? 'film' : 'tv'}" style="font-size: 1.5rem; opacity: 0.3;"></i>
                                                    </div>
                                                `}
                                            </div>

                                            <!-- Session Info -->
                                            <div class="session-info">
                                                <div class="session-title" title="${titleDisplay}">
                                                    ${titleDisplay}
                                                </div>
                                                <div class="session-subtitle" title="${subtitleDisplay || session.user}">
                                                    ${subtitleDisplay || session.user}
                                                </div>

                                                <!-- Progress Bar -->
                                                <div class="progress-bar">
                                                    <div class="progress-fill" style="width: ${session.progress}%;"></div>
                                                </div>

                                                <!-- Metadata -->
                                                <div class="session-meta">
                                                    <div>
                                                        <i class="fas fa-user" style="margin-right: 4px;"></i>${session.user}
                                                    </div>
                                                    <div>
                                                        <i class="fas fa-${session.streamDecision === 'Transcode' ? 'exchange-alt' : 'play'}" style="margin-right: 4px; color: ${session.streamDecision === 'Transcode' ? '#f59e0b' : '#10b981'};"></i>${session.streamDecision === 'Transcode' ? 'Transcoding' : 'Direct'}
                                                    </div>
                                                </div>
                                                <div class="session-meta" style="margin-top: 2px;">
                                                    <div>
                                                        <i class="fas fa-signal" style="margin-right: 4px;"></i>${session.quality}
                                                    </div>
                                                    <div>
                                                        <i class="fas fa-tachometer-alt" style="margin-right: 4px;"></i>${session.bitrateMbps ? Number(session.bitrateMbps).toFixed(1) + ' Mbps' : '--'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>

                                <!-- Desktop View - Detailed Cards -->
                                <div class="now-playing-desktop" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 1rem;">
                                    ${stats.live_sessions.map((session, index) => {
                                        // Build title display
                                        let titleDisplay = session.title;
                                        let subtitleDisplay = '';

                                        if (session.type === 'episode' && session.grandparentTitle) {
                                            titleDisplay = session.grandparentTitle;
                                            let episodeInfo = session.title;
                                            if (session.parentIndex && session.index) {
                                                episodeInfo = `S${session.parentIndex}E${session.index} - ${session.title}`;
                                            }
                                            subtitleDisplay = episodeInfo;
                                        }

                                        return `
                                        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 0.75rem; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                                            <div style="display: flex; gap: 1rem; padding: 1rem;">
                                                <!-- Poster -->
                                                <div style="flex-shrink: 0;">
                                                    ${session.thumbnail ? `
                                                        <img src="${session.thumbnail}" alt="${titleDisplay}"
                                                             style="width: 120px; height: 180px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);"
                                                             onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width: 120px; height: 180px; background: #2a2a2a; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center;\\'><i class=\\'fas fa-${session.type === 'movie' ? 'film' : 'tv'}\\' style=\\'font-size: 2.5rem; color: #4a5568; opacity: 0.3;\\'></i></div>'"/>
                                                    ` : `
                                                        <div style="width: 120px; height: 180px; background: #2a2a2a; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-${session.type === 'movie' ? 'film' : 'tv'}" style="font-size: 2.5rem; color: #4a5568; opacity: 0.3;"></i>
                                                        </div>
                                                    `}
                                                </div>

                                                <!-- Session Details -->
                                                <div style="flex: 1; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0;">
                                                    <!-- Title -->
                                                    <div>
                                                        <div style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${titleDisplay}">
                                                            ${titleDisplay}
                                                        </div>
                                                        ${subtitleDisplay ? `
                                                            <div style="font-size: 0.85rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${subtitleDisplay}">
                                                                ${subtitleDisplay}
                                                            </div>
                                                        ` : ''}
                                                    </div>

                                                    <!-- User & Player Info -->
                                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem;">
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-user" style="color: #3b82f6; width: 14px;"></i>
                                                            <span style="color: #475569; font-weight: 500;">${session.user}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-desktop" style="color: #8b5cf6; width: 14px;"></i>
                                                            <span style="color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${session.player}">${session.player}</span>
                                                        </div>
                                                    </div>

                                                    <!-- Stream Details -->
                                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.75rem;">
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-${session.streamDecision === 'Transcode' ? 'exchange-alt' : 'play'}" style="color: ${session.streamDecision === 'Transcode' ? '#f59e0b' : '#10b981'}; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.streamDecision}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-map-marker-alt" style="color: #ec4899; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.location === 'WAN' && session.ipAddress ? session.ipAddress : session.location}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-cube" style="color: #06b6d4; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.container?.toUpperCase() || 'Unknown'}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-video" style="color: #f59e0b; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.videoCodec}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-volume-up" style="color: #10b981; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.audioCodec || 'Unknown'}${session.audioChannels ? ' ' + session.audioChannels + 'ch' : ''}</span>
                                                        </div>
                                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                            <i class="fas fa-tachometer-alt" style="color: #8b5cf6; width: 14px;"></i>
                                                            <span style="color: #64748b;">${session.bitrateMbps !== null && session.bitrateMbps !== undefined ? Number(session.bitrateMbps).toFixed(1) + ' Mbps' : 'Unknown'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Progress Bar -->
                                            <div style="padding: 0 1rem 1rem 1rem;">
                                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: #64748b; margin-bottom: 0.25rem;">
                                                    <span>${session.duration > 0 ? Math.round((session.progress / 100) * session.duration) + ' min' : '--'}</span>
                                                    <span>${session.progress}%</span>
                                                    <span>${session.duration > 0 ? session.duration + ' min' : '--'}</span>
                                                </div>
                                                <div style="width: 100%; height: 6px; background: rgba(0, 0, 0, 0.1); border-radius: 3px; overflow: hidden;">
                                                    <div style="height: 100%; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%); width: ${session.progress}%; transition: width 0.3s ease;"></div>
                                                </div>
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                    ` : ''}

                    <!-- Watch Stats -->
                    <div id="watch-stats-container" style="border-top: 1px solid var(--border-color); padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <div style="display: flex; align-items: center; cursor: pointer; flex: 1;" onclick="Dashboard.toggleSection('watch-stats')">
                                <h4 style="margin: 0; color: var(--text-secondary); font-size: 0.9rem; display: flex; align-items: center;">
                                    <i class="fas fa-chart-bar" style="margin-right: 0.5rem;"></i>
                                    WATCH STATS
                                    <span style="margin-left: 0.5rem; font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">(Past 30 Days)</span>
                                    <i id="watch-stats-icon" class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.7rem; transition: transform 0.3s;"></i>
                                </h4>
                            </div>
                            <button onclick="event.stopPropagation(); Dashboard.refreshWatchStats();" style="padding: 0.4rem 0.8rem; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; border-radius: 0.5rem; color: white; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 0.4rem; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fas fa-sync-alt"></i>
                                Refresh
                            </button>
                        </div>
                        <div id="watch-stats-content" style="display: none;">
                            ${this.watchStats && Object.keys(this.watchStats).length > 0 ? `
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1rem;">
                                    <!-- Most Popular Movies -->
                                    ${this.watchStats.mostPopularMovies && this.watchStats.mostPopularMovies.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #ec4899; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-fire" style="margin-right: 0.5rem;"></i>
                                                Most Popular Movie
                                            </h5>
                                            ${this.watchStats.mostPopularMovies.slice(0, 1).map(movie => `
                                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                                    ${movie.thumb ? `
                                                        <img src="${movie.thumb}" alt="${movie.title}"
                                                             style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                                             onerror="this.style.display='none'"/>
                                                    ` : ''}
                                                    <div style="flex: 1; min-width: 0;">
                                                        <div style="font-weight: 600; color: #0f172a; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${movie.title}">
                                                            ${movie.title}
                                                        </div>
                                                        ${movie.year ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 0.125rem;">${movie.year}</div>` : ''}
                                                        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                                            <i class="fas fa-users" style="color: #ec4899; margin-right: 0.25rem;"></i>
                                                            <strong>${movie.uniqueUsers}</strong> unique viewers
                                                        </div>
                                                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                                            <i class="fas fa-play-circle" style="margin-right: 0.25rem;"></i>
                                                            ${movie.playCount} plays
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}

                                    <!-- Most Watched Movies -->
                                    ${this.watchStats.mostWatchedMovies && this.watchStats.mostWatchedMovies.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #f59e0b; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-film" style="margin-right: 0.5rem;"></i>
                                                Most Watched Movie
                                            </h5>
                                            ${this.watchStats.mostWatchedMovies.slice(0, 1).map(movie => `
                                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                                    ${movie.thumb ? `
                                                        <img src="${movie.thumb}" alt="${movie.title}"
                                                             style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                                             onerror="this.style.display='none'"/>
                                                    ` : ''}
                                                    <div style="flex: 1; min-width: 0;">
                                                        <div style="font-weight: 600; color: #0f172a; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${movie.title}">
                                                            ${movie.title}
                                                        </div>
                                                        ${movie.year ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 0.125rem;">${movie.year}</div>` : ''}
                                                        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                                            <i class="fas fa-play-circle" style="color: #f59e0b; margin-right: 0.25rem;"></i>
                                                            <strong>${movie.playCount}</strong> total plays
                                                        </div>
                                                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                                            <i class="fas fa-users" style="margin-right: 0.25rem;"></i>
                                                            ${movie.uniqueUsers} unique viewers
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}

                                    <!-- Most Popular TV Show -->
                                    ${this.watchStats.mostPopularShows && this.watchStats.mostPopularShows.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #3b82f6; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-star" style="margin-right: 0.5rem;"></i>
                                                Most Popular TV Show
                                            </h5>
                                            ${this.watchStats.mostPopularShows.slice(0, 1).map(show => `
                                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                                    ${show.thumb ? `
                                                        <img src="${show.thumb}" alt="${show.title}"
                                                             style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                                             onerror="this.style.display='none'"/>
                                                    ` : ''}
                                                    <div style="flex: 1; min-width: 0;">
                                                        <div style="font-weight: 600; color: #0f172a; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${show.title}">
                                                            ${show.title}
                                                        </div>
                                                        ${show.year ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 0.125rem;">${show.year}</div>` : ''}
                                                        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                                            <i class="fas fa-users" style="color: #3b82f6; margin-right: 0.25rem;"></i>
                                                            <strong>${show.uniqueUsers}</strong> unique viewers
                                                        </div>
                                                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                                            <i class="fas fa-play-circle" style="margin-right: 0.25rem;"></i>
                                                            ${show.playCount} plays
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}

                                    <!-- Most Watched TV Show -->
                                    ${this.watchStats.mostWatchedShows && this.watchStats.mostWatchedShows.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #8b5cf6; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-tv" style="margin-right: 0.5rem;"></i>
                                                Most Watched TV Show
                                            </h5>
                                            ${this.watchStats.mostWatchedShows.slice(0, 1).map(show => `
                                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                                    ${show.thumb ? `
                                                        <img src="${show.thumb}" alt="${show.title}"
                                                             style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                                             onerror="this.style.display='none'"/>
                                                    ` : ''}
                                                    <div style="flex: 1; min-width: 0;">
                                                        <div style="font-weight: 600; color: #0f172a; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${show.title}">
                                                            ${show.title}
                                                        </div>
                                                        ${show.year ? `<div style="font-size: 0.75rem; color: #64748b; margin-top: 0.125rem;">${show.year}</div>` : ''}
                                                        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                                            <i class="fas fa-play-circle" style="color: #8b5cf6; margin-right: 0.25rem;"></i>
                                                            <strong>${show.playCount}</strong> total plays
                                                        </div>
                                                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                                            <i class="fas fa-users" style="margin-right: 0.25rem;"></i>
                                                            ${show.uniqueUsers} unique viewers
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}

                                    <!-- Most Active User -->
                                    ${this.watchStats.mostActiveUsers && this.watchStats.mostActiveUsers.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #10b981; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-user-check" style="margin-right: 0.5rem;"></i>
                                                Most Active User
                                            </h5>
                                            ${this.watchStats.mostActiveUsers.slice(0, 1).map(user => `
                                                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                                    <div style="font-weight: 600; color: #0f172a; font-size: 1.1rem;">
                                                        <i class="fas fa-user-circle" style="color: #10b981; margin-right: 0.5rem; font-size: 1.5rem;"></i>
                                                        ${user.username}
                                                    </div>
                                                    <div style="font-size: 0.9rem; color: #475569; margin-left: 2rem;">
                                                        <i class="fas fa-play" style="color: #10b981; margin-right: 0.25rem;"></i>
                                                        <strong>${user.playCount}</strong> total plays
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}

                                    <!-- Most Active Platform -->
                                    ${this.watchStats.mostActivePlatforms && this.watchStats.mostActivePlatforms.length > 0 ? `
                                        <div style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 0.75rem; padding: 1rem;">
                                            <h5 style="margin: 0 0 0.75rem 0; color: #06b6d4; font-size: 0.85rem; display: flex; align-items: center;">
                                                <i class="fas fa-desktop" style="margin-right: 0.5rem;"></i>
                                                Most Active Platform
                                            </h5>
                                            ${this.watchStats.mostActivePlatforms.slice(0, 1).map(platform => `
                                                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                                    <div style="font-weight: 600; color: #0f172a; font-size: 1.1rem;">
                                                        <i class="fas fa-laptop" style="color: #06b6d4; margin-right: 0.5rem; font-size: 1.5rem;"></i>
                                                        ${platform.platform}
                                                    </div>
                                                    <div style="font-size: 0.9rem; color: #475569; margin-left: 2rem;">
                                                        <i class="fas fa-play" style="color: #06b6d4; margin-right: 0.25rem;"></i>
                                                        <strong>${platform.playCount}</strong> total plays
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        ` : '';

        // Build sections map for ordered rendering
        const sectionsMap = {
            'overview-stats': statsGridHTML,
            'iptv-section': iptvSectionHTML,
            'plex-section': plexSectionHTML
        };

        // Set the stats container HTML using section preferences for ordering
        statsContainer.innerHTML = this.generateSectionsHTML(sectionsMap);

        // Restore previously expanded sections after DOM replacement
        this.restoreExpandedSections();

        // Initialize stats grid collapse state on mobile (collapsed by default)
        this.initStatsGridCollapseState();

        // Initialize drag and drop for stat cards
        this.initDragAndDrop();

        // Remove loading indicators if showing fresh data
        if (!isCached) {
            this.removeLoadingIndicators();
        }
    },

    /**
     * Update last updated timestamp
     */
    updateLastUpdatedTime(isCached = false, cacheAge = 0) {
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            lastUpdated.textContent = `Last updated: ${timeString}`;
        }
    },

    /**
     * Render watch stats HTML content
     */
    renderWatchStatsContent() {
        if (!this.watchStats || Object.keys(this.watchStats).length === 0) {
            return '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No watch statistics available.</div>';
        }

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1rem;">
                ${this.watchStats.mostPopularMovies && this.watchStats.mostPopularMovies.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #ec4899; font-size: 0.85rem;">
                            <i class="fas fa-fire" style="margin-right: 0.5rem;"></i>Most Popular Movies
                        </h5>
                        ${this.watchStats.mostPopularMovies[0] ? `
                            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
                                ${this.watchStats.mostPopularMovies[0].thumb ? `
                                    <img src="${this.watchStats.mostPopularMovies[0].thumb}" alt="${this.watchStats.mostPopularMovies[0].title}"
                                         style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                         onerror="this.style.display='none'"/>
                                ` : ''}
                                <div>
                                    <div style="font-weight: 600; color: #0f172a;">1. ${this.watchStats.mostPopularMovies[0].title}</div>
                                    ${this.watchStats.mostPopularMovies[0].year ? `<div style="font-size: 0.75rem; color: #64748b;">${this.watchStats.mostPopularMovies[0].year}</div>` : ''}
                                    <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                        <i class="fas fa-users" style="color: #ec4899;"></i> <strong>${this.watchStats.mostPopularMovies[0].uniqueUsers}</strong> viewers
                                    </div>
                                    <div style="font-size: 0.75rem; color: #64748b;">
                                        <i class="fas fa-play-circle"></i> ${this.watchStats.mostPopularMovies[0].playCount} plays
                                    </div>
                                </div>
                            </div>
                            ${this.watchStats.mostPopularMovies.length > 1 ? `
                                <div style="border-top: 1px solid rgba(236, 72, 153, 0.2); padding-top: 0.5rem;">
                                    ${this.watchStats.mostPopularMovies.slice(1, 10).map((movie, index) => `
                                        <div style="font-size: 0.85rem; color: #475569; padding: 0.25rem 0; display: flex; justify-content: space-between;">
                                            <span><strong>${index + 2}.</strong> ${movie.title} ${movie.year ? `(${movie.year})` : ''}</span>
                                            <span style="color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                                <i class="fas fa-users" style="color: #ec4899; font-size: 0.7rem;"></i> ${movie.uniqueUsers}
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                ` : ''}

                ${this.watchStats.mostWatchedMovies && this.watchStats.mostWatchedMovies.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #f59e0b; font-size: 0.85rem;">
                            <i class="fas fa-film" style="margin-right: 0.5rem;"></i>Most Watched Movies
                        </h5>
                        ${this.watchStats.mostWatchedMovies[0] ? `
                            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
                                ${this.watchStats.mostWatchedMovies[0].thumb ? `
                                    <img src="${this.watchStats.mostWatchedMovies[0].thumb}" alt="${this.watchStats.mostWatchedMovies[0].title}"
                                         style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                         onerror="this.style.display='none'"/>
                                ` : ''}
                                <div>
                                    <div style="font-weight: 600; color: #0f172a;">1. ${this.watchStats.mostWatchedMovies[0].title}</div>
                                    ${this.watchStats.mostWatchedMovies[0].year ? `<div style="font-size: 0.75rem; color: #64748b;">${this.watchStats.mostWatchedMovies[0].year}</div>` : ''}
                                    <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                        <i class="fas fa-play-circle" style="color: #f59e0b;"></i> <strong>${this.watchStats.mostWatchedMovies[0].playCount}</strong> plays
                                    </div>
                                    <div style="font-size: 0.75rem; color: #64748b;">
                                        <i class="fas fa-users"></i> ${this.watchStats.mostWatchedMovies[0].uniqueUsers} viewers
                                    </div>
                                </div>
                            </div>
                            ${this.watchStats.mostWatchedMovies.length > 1 ? `
                                <div style="border-top: 1px solid rgba(245, 158, 11, 0.2); padding-top: 0.5rem;">
                                    ${this.watchStats.mostWatchedMovies.slice(1, 10).map((movie, index) => `
                                        <div style="font-size: 0.85rem; color: #475569; padding: 0.25rem 0; display: flex; justify-content: space-between;">
                                            <span><strong>${index + 2}.</strong> ${movie.title} ${movie.year ? `(${movie.year})` : ''}</span>
                                            <span style="color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                                <i class="fas fa-play-circle" style="color: #f59e0b; font-size: 0.7rem;"></i> ${movie.playCount}
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                ` : ''}

                ${this.watchStats.mostPopularShows && this.watchStats.mostPopularShows.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #3b82f6; font-size: 0.85rem;">
                            <i class="fas fa-star" style="margin-right: 0.5rem;"></i>Most Popular Shows
                        </h5>
                        ${this.watchStats.mostPopularShows[0] ? `
                            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
                                ${this.watchStats.mostPopularShows[0].thumb ? `
                                    <img src="${this.watchStats.mostPopularShows[0].thumb}" alt="${this.watchStats.mostPopularShows[0].title}"
                                         style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                         onerror="this.style.display='none'"/>
                                ` : ''}
                                <div>
                                    <div style="font-weight: 600; color: #0f172a;">1. ${this.watchStats.mostPopularShows[0].title}</div>
                                    ${this.watchStats.mostPopularShows[0].year ? `<div style="font-size: 0.75rem; color: #64748b;">${this.watchStats.mostPopularShows[0].year}</div>` : ''}
                                    <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                        <i class="fas fa-users" style="color: #3b82f6;"></i> <strong>${this.watchStats.mostPopularShows[0].uniqueUsers}</strong> viewers
                                    </div>
                                    <div style="font-size: 0.75rem; color: #64748b;">
                                        <i class="fas fa-play-circle"></i> ${this.watchStats.mostPopularShows[0].playCount} plays
                                    </div>
                                </div>
                            </div>
                            ${this.watchStats.mostPopularShows.length > 1 ? `
                                <div style="border-top: 1px solid rgba(59, 130, 246, 0.2); padding-top: 0.5rem;">
                                    ${this.watchStats.mostPopularShows.slice(1, 10).map((show, index) => `
                                        <div style="font-size: 0.85rem; color: #475569; padding: 0.25rem 0; display: flex; justify-content: space-between;">
                                            <span><strong>${index + 2}.</strong> ${show.title} ${show.year ? `(${show.year})` : ''}</span>
                                            <span style="color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                                <i class="fas fa-users" style="color: #3b82f6; font-size: 0.7rem;"></i> ${show.uniqueUsers}
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                ` : ''}

                ${this.watchStats.mostWatchedShows && this.watchStats.mostWatchedShows.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #8b5cf6; font-size: 0.85rem;">
                            <i class="fas fa-tv" style="margin-right: 0.5rem;"></i>Most Watched Shows
                        </h5>
                        ${this.watchStats.mostWatchedShows[0] ? `
                            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
                                ${this.watchStats.mostWatchedShows[0].thumb ? `
                                    <img src="${this.watchStats.mostWatchedShows[0].thumb}" alt="${this.watchStats.mostWatchedShows[0].title}"
                                         style="width: 60px; height: 90px; object-fit: cover; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);"
                                         onerror="this.style.display='none'"/>
                                ` : ''}
                                <div>
                                    <div style="font-weight: 600; color: #0f172a;">1. ${this.watchStats.mostWatchedShows[0].title}</div>
                                    ${this.watchStats.mostWatchedShows[0].year ? `<div style="font-size: 0.75rem; color: #64748b;">${this.watchStats.mostWatchedShows[0].year}</div>` : ''}
                                    <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #475569;">
                                        <i class="fas fa-play-circle" style="color: #8b5cf6;"></i> <strong>${this.watchStats.mostWatchedShows[0].playCount}</strong> plays
                                    </div>
                                    <div style="font-size: 0.75rem; color: #64748b;">
                                        <i class="fas fa-users"></i> ${this.watchStats.mostWatchedShows[0].uniqueUsers} viewers
                                    </div>
                                </div>
                            </div>
                            ${this.watchStats.mostWatchedShows.length > 1 ? `
                                <div style="border-top: 1px solid rgba(139, 92, 246, 0.2); padding-top: 0.5rem;">
                                    ${this.watchStats.mostWatchedShows.slice(1, 10).map((show, index) => `
                                        <div style="font-size: 0.85rem; color: #475569; padding: 0.25rem 0; display: flex; justify-content: space-between;">
                                            <span><strong>${index + 2}.</strong> ${show.title} ${show.year ? `(${show.year})` : ''}</span>
                                            <span style="color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                                <i class="fas fa-play-circle" style="color: #8b5cf6; font-size: 0.7rem;"></i> ${show.playCount}
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                ` : ''}

                ${this.watchStats.mostActiveUsers && this.watchStats.mostActiveUsers.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #10b981; font-size: 0.85rem;">
                            <i class="fas fa-user-check" style="margin-right: 0.5rem;"></i>Most Active Users
                        </h5>
                        ${this.watchStats.mostActiveUsers.slice(0, 10).map((user, index) => `
                            <div style="padding: 0.4rem 0; ${index === 0 ? 'border-bottom: 1px solid rgba(16, 185, 129, 0.2); padding-bottom: 0.75rem; margin-bottom: 0.5rem;' : ''}">
                                <div style="font-weight: ${index === 0 ? '600' : '500'}; color: #0f172a; font-size: ${index === 0 ? '1rem' : '0.9rem'}; display: flex; justify-content: space-between; align-items: center;">
                                    <span>
                                        ${index === 0 ? `<i class="fas fa-user-circle" style="color: #10b981; margin-right: 0.5rem;"></i>` : `<strong>${index + 1}.</strong> `}${user.username}
                                    </span>
                                    <span style="font-size: 0.85rem; color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                        <i class="fas fa-play" style="color: #10b981; font-size: 0.7rem;"></i> ${user.playCount}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${this.watchStats.mostActivePlatforms && this.watchStats.mostActivePlatforms.length > 0 ? `
                    <div style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 0.75rem; padding: 1rem;">
                        <h5 style="margin: 0 0 0.75rem 0; color: #06b6d4; font-size: 0.85rem;">
                            <i class="fas fa-desktop" style="margin-right: 0.5rem;"></i>Most Active Platforms
                        </h5>
                        ${this.watchStats.mostActivePlatforms.slice(0, 10).map((platform, index) => `
                            <div style="padding: 0.4rem 0; ${index === 0 ? 'border-bottom: 1px solid rgba(6, 182, 212, 0.2); padding-bottom: 0.75rem; margin-bottom: 0.5rem;' : ''}">
                                <div style="font-weight: ${index === 0 ? '600' : '500'}; color: #0f172a; font-size: ${index === 0 ? '1rem' : '0.9rem'}; display: flex; justify-content: space-between; align-items: center;">
                                    <span>
                                        ${index === 0 ? `<i class="fas fa-laptop" style="color: #06b6d4; margin-right: 0.5rem;"></i>` : `<strong>${index + 1}.</strong> `}${platform.platform}
                                    </span>
                                    <span style="font-size: 0.85rem; color: #64748b; white-space: nowrap; margin-left: 0.5rem;">
                                        <i class="fas fa-play" style="color: #06b6d4; font-size: 0.7rem;"></i> ${platform.playCount}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Toggle collapsible section
     */
    async toggleSection(sectionId) {
        const content = document.getElementById(`${sectionId}-content`);
        const icon = document.getElementById(`${sectionId}-icon`);

        if (content.style.display === 'none') {
            // Expand section - add to tracking BEFORE any async operations
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            this.expandedSections.add(sectionId);

            // If this is watch-stats section and we haven't loaded watch stats yet, load them now
            if (sectionId === 'watch-stats' && Object.keys(this.watchStats).length === 0) {
                try {
                    console.log('[Dashboard] Fetching watch stats on demand (from cache)...');
                    // No loading message - backend returns cached data instantly

                    const watchStatsResponse = await API.getDashboardWatchStats();
                    if (watchStatsResponse.success && watchStatsResponse.stats) {
                        this.watchStats = watchStatsResponse.stats;
                        console.log('[Dashboard] Watch stats loaded successfully');
                        // Render the watch stats content directly
                        content.innerHTML = this.renderWatchStatsContent();
                    } else {
                        // Only show message if initial generation is in progress
                        content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Watch statistics are being generated for the first time. Please try again in a moment.</div>';
                    }
                } catch (error) {
                    console.error('[Dashboard] Error fetching watch stats:', error);
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load watch statistics. Please try again later.</div>';
                }
                return;
            }
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            this.expandedSections.delete(sectionId);
        }
    },

    /**
     * Toggle session card expansion (mobile only)
     */
    toggleSessionCard(cardElement) {
        // Only toggle on mobile (window width <= 768px)
        if (window.innerWidth > 768) {
            return;
        }

        cardElement.classList.toggle('expanded');
    },

    /**
     * Toggle server card expansion
     */
    toggleServerCard(serverId) {
        const content = document.getElementById(`${serverId}-content`);
        const icon = document.getElementById(`${serverId}-icon`);

        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            this.expandedSections.add(`${serverId}-content`);
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            this.expandedSections.delete(`${serverId}-content`);
        }
    },

    /**
     * Toggle IPTV panel card expansion
     */
    toggleIPTVPanelCard(panelId) {
        const content = document.getElementById(`${panelId}-content`);
        const icon = document.getElementById(`${panelId}-icon`);

        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            this.expandedSections.add(`${panelId}-content`);
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            this.expandedSections.delete(`${panelId}-content`);
        }
    },

    /**
     * Format a date as relative time (e.g., "5 minutes ago")
     */
    formatRelativeTime(dateString) {
        if (!dateString || dateString === 'Invalid Date') return '';

        const date = new Date(dateString);
        // Check if date is valid
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);

        if (diffSecs < 60) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    },

    /**
     * Toggle stats grid expansion
     */
    toggleStatsGrid() {
        const content = document.getElementById('stats-grid-content');
        const icon = document.getElementById('stats-grid-icon');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            this.expandedSections.add('stats-grid-content');
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
            this.expandedSections.delete('stats-grid-content');
        }
    },

    /**
     * Initialize stats grid collapse state on mobile
     */
    initStatsGridCollapseState() {
        // Check if mobile (window width <= 768px)
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // Collapse by default on mobile
            const content = document.getElementById('stats-grid-content');
            const icon = document.getElementById('stats-grid-icon');

            if (content && icon) {
                // Only collapse if not already in expandedSections
                if (!this.expandedSections.has('stats-grid-content')) {
                    content.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        }
    },

    /**
     * Refresh statistics
     */
    async refreshStats() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing...';
        }

        // Force fresh data with loading indicators (silent=false, showIndicators=true, force=true)
        const refreshed = await this.loadStats(false, true, true);

        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }

        // Only show success toast if refresh actually happened
        if (refreshed) {
            Utils.showToast('Refreshed', 'Dashboard statistics updated', 'success');
        }
    },

    /**
     * Refresh watch statistics
     */
    async refreshWatchStats() {
        try {
            console.log('[Dashboard] Refreshing watch stats...');

            // Show loading in the watch stats content area
            const watchStatsContent = document.getElementById('watch-stats-content');
            if (watchStatsContent) {
                watchStatsContent.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><i class="fas fa-sync-alt fa-spin" style="margin-right: 0.5rem;"></i>Refreshing watch statistics...</div>';
            }

            // Force fresh data from server
            const watchStatsResponse = await API.getDashboardWatchStats(true);

            if (watchStatsResponse.success && watchStatsResponse.stats) {
                this.watchStats = watchStatsResponse.stats;
                console.log('[Dashboard] Watch stats received', watchStatsResponse);

                // Re-render the watch stats content
                if (watchStatsContent) {
                    watchStatsContent.innerHTML = this.renderWatchStatsContent();
                }

                // Show appropriate message based on whether refresh was actually triggered
                if (watchStatsResponse.refreshing) {
                    const cacheAge = watchStatsResponse.cache_age_seconds;
                    const ageDisplay = cacheAge > 3600 ? `${Math.round(cacheAge / 3600)} hours` : `${Math.round(cacheAge / 60)} minutes`;
                    Utils.showToast('Refreshing', `Showing cached data (${ageDisplay} old). Fresh data is being fetched in the background.`, 'info');
                } else {
                    Utils.showToast('Refreshed', 'Watch statistics updated', 'success');
                }
            } else {
                throw new Error(watchStatsResponse.error || 'Failed to refresh watch statistics');
            }
        } catch (error) {
            console.error('[Dashboard] Error refreshing watch stats:', error);
            Utils.showToast('Error', 'Failed to refresh watch statistics: ' + error.message, 'error');

            // Show error in content area
            const watchStatsContent = document.getElementById('watch-stats-content');
            if (watchStatsContent) {
                watchStatsContent.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-danger);">Error refreshing watch statistics. Please try again.</div>`;
            }
        }
    },

    /**
     * Sync M3U playlist for an IPTV panel
     */
    async syncM3UPlaylist(panelId) {
        try {
            Utils.showLoading('Syncing M3U playlist...');

            const response = await API.request(`/api/v2/iptv-panels/${panelId}/sync-m3u`, {
                method: 'POST'
            });

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', 'M3U playlist synced successfully', 'success');
                // Refresh stats to show updated counts
                await this.loadStats(true, false, false);
            } else {
                throw new Error(response.message || 'Failed to sync M3U playlist');
            }
        } catch (error) {
            Utils.hideLoading();
            console.error('[Dashboard] Error syncing M3U playlist:', error);
            Utils.showToast('Error', 'Failed to sync M3U playlist: ' + error.message, 'error');
        }
    },

    /**
     * Cleanup when leaving dashboard
     */
    cleanup() {
        this.stopAutoRefresh();
        console.log('[Dashboard] Cleanup complete');
    }
};

// Make toggleSection available globally for onclick handlers
window.toggleSection = (sectionId) => Dashboard.toggleSection(sectionId);
