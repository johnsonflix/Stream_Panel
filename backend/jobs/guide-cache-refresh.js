/**
 * Guide Cache Refresh Job
 *
 * Refreshes TV Guide cache for all IPTV panels and IPTV Editor playlists.
 * Uses Xtream Codes API to fetch categories and channels.
 *
 * Run manually: node jobs/guide-cache-refresh.js
 * Or schedule via cron/JobProcessor
 */

const path = require('path');
const Database = require('better-sqlite3');
const { fetchFullGuideData, testConnection, fetchXMLTV, getVodCategories, getVodStreams, getSeriesCategories, getSeries } = require('../utils/xtream-api');
const { parseXMLTVFromString } = require('../utils/xmltv-parser');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'subsapp_v2.db');
const EPG_DAYS_TO_CACHE = 7; // Cache 7 days of EPG data

class GuideCacheRefreshJob {
    constructor() {
        this.db = new Database(DB_PATH);
        // CRITICAL: Set busy_timeout to wait for locks instead of failing immediately
        // This prevents SQLITE_BUSY errors when main app is also writing
        this.db.pragma('busy_timeout = 10000'); // Wait up to 10 seconds for locks
    }

    /**
     * Fetch VOD (movies) and Series (TV shows) data
     * @param {string} baseUrl - API base URL
     * @param {string} username - API username
     * @param {string} password - API password
     * @returns {Promise<Object>} VOD data including categories, movies, and series
     */
    async fetchVodData(baseUrl, username, password) {
        console.log(`   🎬 Fetching VOD data...`);

        const vodData = {
            vodCategories: [],
            vodMovies: [],
            seriesCategories: [],
            series: []
        };

        // Fetch VOD (Movies)
        try {
            vodData.vodCategories = await getVodCategories(baseUrl, username, password);
            console.log(`   ✅ Found ${vodData.vodCategories.length} VOD categories`);

            vodData.vodMovies = await getVodStreams(baseUrl, username, password);
            console.log(`   ✅ Found ${vodData.vodMovies.length} movies`);
        } catch (vodError) {
            console.warn(`   ⚠️ VOD fetch failed: ${vodError.message}`);
            // Continue - VOD may not be available for this source
        }

        // Fetch Series (TV Shows)
        try {
            vodData.seriesCategories = await getSeriesCategories(baseUrl, username, password);
            console.log(`   ✅ Found ${vodData.seriesCategories.length} series categories`);

            vodData.series = await getSeries(baseUrl, username, password);
            console.log(`   ✅ Found ${vodData.series.length} TV shows`);
        } catch (seriesError) {
            console.warn(`   ⚠️ Series fetch failed: ${seriesError.message}`);
            // Continue - Series may not be available for this source
        }

        return vodData;
    }

    /**
     * Refresh cache for a single source
     * @param {string} sourceType - 'panel' or 'playlist'
     * @param {number} sourceId - Panel or playlist ID
     * @param {string} baseUrl - API base URL
     * @param {string} username - API username
     * @param {string} password - API password
     */
    async refreshSource(sourceType, sourceId, baseUrl, username, password) {
        console.log(`\n📺 Refreshing ${sourceType} #${sourceId}: ${baseUrl}`);

        try {
            // Test connection first
            const connectionTest = await testConnection(baseUrl, username, password);
            if (!connectionTest.success) {
                throw new Error(`Connection failed: ${connectionTest.message}`);
            }

            // Fetch full guide data (categories + channels)
            const guideData = await fetchFullGuideData(baseUrl, username, password);

            // Fetch EPG data (XMLTV)
            let epgData = null;
            let epgChannelCount = 0;
            let epgProgramCount = 0;

            try {
                console.log(`   📖 Fetching EPG data...`);
                const xmltvContent = await fetchXMLTV(baseUrl, username, password);

                if (xmltvContent && xmltvContent.length > 0) {
                    epgData = await parseXMLTVFromString(xmltvContent, EPG_DAYS_TO_CACHE);
                    epgChannelCount = Object.keys(epgData.channels).length;
                    epgProgramCount = epgData.programs.length;

                    // Organize programs by channel_id for easier lookup
                    const programsByChannel = {};
                    for (const prog of epgData.programs) {
                        if (!programsByChannel[prog.channel_id]) {
                            programsByChannel[prog.channel_id] = [];
                        }
                        programsByChannel[prog.channel_id].push(prog);
                    }

                    // Sort each channel's programs by start time
                    for (const channelId of Object.keys(programsByChannel)) {
                        programsByChannel[channelId].sort((a, b) => a.start_timestamp - b.start_timestamp);
                    }

                    epgData.programsByChannel = programsByChannel;
                    console.log(`   ✅ Parsed ${epgChannelCount} EPG channels, ${epgProgramCount} programs`);
                }
            } catch (epgError) {
                console.warn(`   ⚠️ EPG fetch failed: ${epgError.message}`);
                // Continue without EPG - channels will still work
            }

            // Fetch VOD data (movies and series)
            const vodData = await this.fetchVodData(baseUrl, username, password);

            // Check if VOD columns exist before trying to insert
            const columns = this.db.pragma('table_info(guide_cache)');
            const columnNames = columns.map(c => c.name);
            const hasVodColumns = columnNames.includes('vod_categories_json');

            // Store in cache
            if (hasVodColumns) {
                // Use extended schema with VOD columns
                const stmt = this.db.prepare(`
                    INSERT INTO guide_cache (
                        source_type, source_id,
                        categories_json, channels_json, total_categories, total_channels,
                        epg_json, epg_channel_count, epg_program_count, epg_last_updated,
                        vod_categories_json, vod_movies_json, vod_movies_count,
                        series_categories_json, series_json, series_count, vod_last_updated,
                        last_updated
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    ON CONFLICT(source_type, source_id) DO UPDATE SET
                        categories_json = excluded.categories_json,
                        channels_json = excluded.channels_json,
                        total_categories = excluded.total_categories,
                        total_channels = excluded.total_channels,
                        epg_json = excluded.epg_json,
                        epg_channel_count = excluded.epg_channel_count,
                        epg_program_count = excluded.epg_program_count,
                        epg_last_updated = excluded.epg_last_updated,
                        vod_categories_json = excluded.vod_categories_json,
                        vod_movies_json = excluded.vod_movies_json,
                        vod_movies_count = excluded.vod_movies_count,
                        series_categories_json = excluded.series_categories_json,
                        series_json = excluded.series_json,
                        series_count = excluded.series_count,
                        vod_last_updated = excluded.vod_last_updated,
                        last_updated = datetime('now'),
                        last_error = NULL
                `);

                stmt.run(
                    sourceType,
                    sourceId,
                    JSON.stringify(guideData.categories),
                    JSON.stringify(guideData.streams),
                    guideData.categories.length,
                    guideData.totalChannels,
                    epgData ? JSON.stringify(epgData) : null,
                    epgChannelCount,
                    epgProgramCount,
                    vodData.vodCategories.length > 0 ? JSON.stringify(vodData.vodCategories) : null,
                    vodData.vodMovies.length > 0 ? JSON.stringify(vodData.vodMovies) : null,
                    vodData.vodMovies.length,
                    vodData.seriesCategories.length > 0 ? JSON.stringify(vodData.seriesCategories) : null,
                    vodData.series.length > 0 ? JSON.stringify(vodData.series) : null,
                    vodData.series.length
                );
            } else {
                // Fallback: Use original schema without VOD columns (migration not run yet)
                console.log(`   ⚠️ VOD cache columns not found - run migration add-vod-cache-columns.js`);
                const stmt = this.db.prepare(`
                    INSERT INTO guide_cache (source_type, source_id, categories_json, channels_json, total_categories, total_channels, epg_json, epg_channel_count, epg_program_count, epg_last_updated, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    ON CONFLICT(source_type, source_id) DO UPDATE SET
                        categories_json = excluded.categories_json,
                        channels_json = excluded.channels_json,
                        total_categories = excluded.total_categories,
                        total_channels = excluded.total_channels,
                        epg_json = excluded.epg_json,
                        epg_channel_count = excluded.epg_channel_count,
                        epg_program_count = excluded.epg_program_count,
                        epg_last_updated = excluded.epg_last_updated,
                        last_updated = datetime('now'),
                        last_error = NULL
                `);

                stmt.run(
                    sourceType,
                    sourceId,
                    JSON.stringify(guideData.categories),
                    JSON.stringify(guideData.streams),
                    guideData.categories.length,
                    guideData.totalChannels,
                    epgData ? JSON.stringify(epgData) : null,
                    epgChannelCount,
                    epgProgramCount
                );
            }

            console.log(`   ✅ Cached ${guideData.categories.length} categories, ${guideData.totalChannels} channels`);
            if (epgData) {
                console.log(`   ✅ Cached ${epgProgramCount} EPG programs (${EPG_DAYS_TO_CACHE} days)`);
            }
            if (vodData.vodMovies.length > 0) {
                console.log(`   ✅ Cached ${vodData.vodMovies.length} movies, ${vodData.series.length} TV shows`);
            }

            return {
                success: true,
                categories: guideData.categories.length,
                channels: guideData.totalChannels,
                epgPrograms: epgProgramCount,
                movies: vodData.vodMovies.length,
                series: vodData.series.length
            };

        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);

            // Store error in cache
            const stmt = this.db.prepare(`
                INSERT INTO guide_cache (source_type, source_id, last_error, last_updated)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(source_type, source_id) DO UPDATE SET
                    last_error = excluded.last_error,
                    last_updated = datetime('now')
            `);
            stmt.run(sourceType, sourceId, error.message);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse M3U URL to extract Xtream API credentials
     * M3U URLs typically look like:
     *   https://server.com/get.php?username=XXX&password=YYY&type=m3u_plus
     * Or:
     *   https://server.com/USERNAME/PASSWORD/playlist.m3u8
     */
    parseM3uUrl(m3uUrl) {
        if (!m3uUrl) return null;

        try {
            const url = new URL(m3uUrl);

            // Method 1: Query parameters (most common)
            const username = url.searchParams.get('username');
            const password = url.searchParams.get('password');

            if (username && password) {
                // Base URL is the origin (scheme + host)
                return {
                    baseUrl: url.origin,
                    username,
                    password
                };
            }

            // Method 2: Path-based credentials (e.g., /username/password/get.m3u)
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts.length >= 2) {
                return {
                    baseUrl: url.origin,
                    username: pathParts[0],
                    password: pathParts[1]
                };
            }

            return null;
        } catch (e) {
            console.error(`   Failed to parse M3U URL: ${e.message}`);
            return null;
        }
    }

    /**
     * Extract Xtream credentials from panel
     * Primary: Parse username/password from M3U URL, use provider_base_url for API
     * Fallback: Use credentials JSON with provider_base_url
     */
    extractPanelCredentials(panel) {
        // Primary method: Parse credentials from M3U URL, use provider_base_url for Xtream API
        if (panel.m3u_url && panel.provider_base_url) {
            const parsed = this.parseM3uUrl(panel.m3u_url);
            if (parsed) {
                console.log(`   Using M3U credentials with provider_base_url: ${panel.provider_base_url}`);
                return {
                    baseUrl: panel.provider_base_url,
                    username: parsed.username,
                    password: parsed.password
                };
            }
        }

        // Fallback: Use credentials JSON (for panels without M3U)
        if (panel.credentials && panel.provider_base_url) {
            try {
                const creds = JSON.parse(panel.credentials);

                if (creds.username && creds.password) {
                    return {
                        baseUrl: panel.provider_base_url,
                        username: creds.username,
                        password: creds.password
                    };
                }
            } catch (e) {
                console.error(`   Failed to parse credentials JSON: ${e.message}`);
            }
        }

        return null;
    }

    /**
     * Refresh all panel caches
     */
    async refreshAllPanels() {
        console.log('\n🔄 Refreshing IPTV Panel caches...');

        const panels = this.db.prepare(`
            SELECT id, name, panel_type, base_url, provider_base_url, credentials, m3u_url
            FROM iptv_panels
            WHERE is_active = 1
              AND (m3u_url IS NOT NULL OR (provider_base_url IS NOT NULL AND credentials IS NOT NULL))
        `).all();

        console.log(`   Found ${panels.length} panels with provider URLs`);

        const results = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const panel of panels) {
            const creds = this.extractPanelCredentials(panel);

            if (!creds) {
                console.log(`   ⏭️ Skipping panel ${panel.name} (${panel.panel_type}) - no Xtream credentials`);
                results.skipped++;
                continue;
            }

            results.total++;
            const result = await this.refreshSource(
                'panel',
                panel.id,
                creds.baseUrl,
                creds.username,
                creds.password
            );

            if (result.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push({
                    panelId: panel.id,
                    name: panel.name,
                    error: result.error
                });
            }
        }

        return results;
    }

    /**
     * Refresh all playlist caches
     * Uses IPTV Editor DNS + guide credentials for Xtream API calls
     */
    async refreshAllPlaylists() {
        console.log('\n🔄 Refreshing IPTV Editor Playlist caches...');

        // Check if guide_username column exists (migration may not have run)
        const columns = this.db.pragma('table_info(iptv_editor_playlists)');
        const columnNames = columns.map(c => c.name);
        if (!columnNames.includes('guide_username') || !columnNames.includes('guide_password')) {
            console.log('   ⚠️ Guide credential columns not found in database - skipping playlists');
            console.log('   ℹ️  Run migration: add-guide-credentials-to-playlists.js');
            return { total: 0, success: 0, failed: 0, errors: [] };
        }

        // Get IPTV Editor DNS setting
        const editorDns = this.db.prepare(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
        `).get();

        const editorBaseUrl = editorDns?.setting_value;
        if (!editorBaseUrl) {
            console.log('   ⚠️ IPTV Editor DNS not configured - skipping playlists');
            return { total: 0, success: 0, failed: 0, errors: [] };
        }

        console.log(`   Using IPTV Editor DNS: ${editorBaseUrl}`);

        const playlists = this.db.prepare(`
            SELECT id, name, guide_username, guide_password,
                   provider_base_url, provider_username, provider_password
            FROM iptv_editor_playlists
            WHERE is_active = 1
              AND guide_username IS NOT NULL AND guide_username != ''
              AND guide_password IS NOT NULL AND guide_password != ''
        `).all();

        console.log(`   Found ${playlists.length} playlists with guide credentials`);

        const results = {
            total: playlists.length,
            success: 0,
            failed: 0,
            errors: []
        };

        for (const playlist of playlists) {
            const result = await this.refreshSource(
                'playlist',
                playlist.id,
                editorBaseUrl,
                playlist.guide_username,
                playlist.guide_password
            );

            if (result.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push({
                    playlistId: playlist.id,
                    name: playlist.name,
                    error: result.error
                });
            }
        }

        return results;
    }

    /**
     * Refresh a specific panel cache
     * @param {number} panelId - Panel ID
     */
    async refreshPanel(panelId) {
        const panel = this.db.prepare(`
            SELECT id, name, panel_type, base_url, provider_base_url, credentials, m3u_url
            FROM iptv_panels WHERE id = ?
        `).get(panelId);

        if (!panel) {
            throw new Error(`Panel ${panelId} not found`);
        }

        const creds = this.extractPanelCredentials(panel);
        if (!creds) {
            throw new Error(`Panel ${panelId} (${panel.panel_type}) missing Xtream credentials`);
        }

        return this.refreshSource('panel', panel.id, creds.baseUrl, creds.username, creds.password);
    }

    /**
     * Refresh a specific playlist cache
     * Uses IPTV Editor DNS + guide credentials
     * @param {number} playlistId - Playlist ID
     */
    async refreshPlaylist(playlistId) {
        // Get IPTV Editor DNS
        const editorDns = this.db.prepare(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
        `).get();

        const editorBaseUrl = editorDns?.setting_value;
        if (!editorBaseUrl) {
            throw new Error('IPTV Editor DNS not configured');
        }

        const playlist = this.db.prepare(`
            SELECT id, name, guide_username, guide_password
            FROM iptv_editor_playlists WHERE id = ?
        `).get(playlistId);

        if (!playlist) {
            throw new Error(`Playlist ${playlistId} not found`);
        }

        if (!playlist.guide_username || !playlist.guide_password) {
            throw new Error(`Playlist ${playlistId} missing guide credentials`);
        }

        return this.refreshSource(
            'playlist',
            playlist.id,
            editorBaseUrl,
            playlist.guide_username,
            playlist.guide_password
        );
    }

    /**
     * Run full refresh for all sources
     */
    async runFullRefresh() {
        console.log('🚀 Starting full guide cache refresh...');
        console.log(`   Time: ${new Date().toISOString()}`);

        const panelResults = await this.refreshAllPanels();
        const playlistResults = await this.refreshAllPlaylists();

        const summary = {
            panels: panelResults,
            playlists: playlistResults,
            totalSuccess: panelResults.success + playlistResults.success,
            totalFailed: panelResults.failed + playlistResults.failed,
            completedAt: new Date().toISOString()
        };

        console.log('\n📊 Refresh Summary:');
        console.log(`   Panels: ${panelResults.success}/${panelResults.total} successful${panelResults.skipped ? ` (${panelResults.skipped} skipped)` : ''}`);
        console.log(`   Playlists: ${playlistResults.success}/${playlistResults.total} successful`);
        console.log(`   Total: ${summary.totalSuccess}/${panelResults.total + playlistResults.total} successful`);

        if (summary.totalFailed > 0) {
            console.log('\n⚠️ Failed sources:');
            [...panelResults.errors, ...playlistResults.errors].forEach(err => {
                console.log(`   - ${err.name || err.panelId || err.playlistId}: ${err.error}`);
            });
        }

        return summary;
    }

    /**
     * Get cache status for all sources
     */
    getCacheStatus() {
        const caches = this.db.prepare(`
            SELECT
                source_type,
                source_id,
                total_categories,
                total_channels,
                last_updated,
                last_error
            FROM guide_cache
            ORDER BY source_type, source_id
        `).all();

        return caches;
    }

    /**
     * Get cached guide data for a source
     * @param {string} sourceType - 'panel' or 'playlist'
     * @param {number} sourceId - Source ID
     */
    getCachedGuide(sourceType, sourceId) {
        const cache = this.db.prepare(`
            SELECT * FROM guide_cache WHERE source_type = ? AND source_id = ?
        `).get(sourceType, sourceId);

        if (!cache) {
            return null;
        }

        return {
            categories: cache.categories_json ? JSON.parse(cache.categories_json) : [],
            channels: cache.channels_json ? JSON.parse(cache.channels_json) : [],
            totalCategories: cache.total_categories,
            totalChannels: cache.total_channels,
            lastUpdated: cache.last_updated,
            lastError: cache.last_error,
            // VOD data (if available)
            vodCategories: cache.vod_categories_json ? JSON.parse(cache.vod_categories_json) : [],
            vodMovies: cache.vod_movies_json ? JSON.parse(cache.vod_movies_json) : [],
            vodMoviesCount: cache.vod_movies_count || 0,
            seriesCategories: cache.series_categories_json ? JSON.parse(cache.series_categories_json) : [],
            series: cache.series_json ? JSON.parse(cache.series_json) : [],
            seriesCount: cache.series_count || 0,
            vodLastUpdated: cache.vod_last_updated
        };
    }

    close() {
        this.db.close();
    }
}

// Run if called directly
if (require.main === module) {
    const job = new GuideCacheRefreshJob();

    job.runFullRefresh()
        .then(results => {
            console.log('\n✅ Guide cache refresh completed');
            job.close();
            process.exit(results.totalFailed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('\n❌ Guide cache refresh failed:', error);
            job.close();
            process.exit(1);
        });
}

module.exports = GuideCacheRefreshJob;
