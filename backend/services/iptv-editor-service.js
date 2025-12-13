/**
 * IPTV Editor Service
 * Handles all interactions with editor.iptveditor.com API
 */

const axios = require('axios');
const { query } = require('../database-config');

class IPTVEditorService {
    constructor(apiBaseUrl = null, bearerToken = null, playlistId = null) {
        this.baseURL = apiBaseUrl || 'https://editor.iptveditor.com';
        this.bearerToken = bearerToken;
        this.defaultPlaylistId = playlistId;
        this.providerBaseUrl = null;
        this.initialized = bearerToken && playlistId ? true : false;
    }

    /**
     * Initialize service with settings from database
     */
    async initialize() {
        try {
            const settings = await this.getAllSettings();

            if (settings.bearer_token) {
                this.bearerToken = settings.bearer_token;
            }
            if (settings.default_playlist_id) {
                this.defaultPlaylistId = settings.default_playlist_id;
            }
            if (settings.provider_base_url) {
                this.providerBaseUrl = settings.provider_base_url;
            }

            console.log('✅ IPTV Editor service initialized');
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize IPTV Editor service:', error);
            this.initialized = false;
            throw error;
        }
    }

    /**
     * Get single setting from database
     */
    async getSetting(key) {
        try {
            const rows = await query(
                'SELECT setting_value, setting_type FROM iptv_editor_settings WHERE setting_key = ?',
                [key]
            );

            if (rows.length === 0) {
                return null;
            }

            const row = rows[0];
            let value = row.setting_value;

            // Convert value based on type
            switch (row.setting_type) {
                case 'boolean':
                    value = value === 'true' || value === true || value === 1 || value === '1';
                    break;
                case 'integer':
                    value = parseInt(value) || 0;
                    break;
                case 'json':
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        value = {};
                    }
                    break;
                default:
                    // string - keep as is
                    break;
            }

            return value;
        } catch (error) {
            console.error(`❌ Failed to get setting ${key}:`, error);
            throw error;
        }
    }

    /**
     * Set setting in database
     */
    async setSetting(key, value, type = 'string') {
        try {
            let processedValue = value;

            // Convert value to string for storage
            if (type === 'json') {
                processedValue = JSON.stringify(value);
            } else if (type === 'boolean') {
                processedValue = value ? 'true' : 'false';
            } else {
                processedValue = String(value);
            }

            await query(`
                INSERT INTO iptv_editor_settings (setting_key, setting_value, setting_type, created_at, updated_at)
                VALUES (?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = excluded.setting_value,
                    setting_type = excluded.setting_type,
                    updated_at = datetime('now')
            `, [key, processedValue, type]);

            console.log(`✅ Setting ${key} updated successfully`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to set setting ${key}:`, error);
            throw error;
        }
    }

    /**
     * Get all settings for frontend
     */
    async getAllSettings() {
        try {
            const rows = await query('SELECT setting_key, setting_value, setting_type FROM iptv_editor_settings');

            const settings = {};
            for (const row of rows) {
                let value = row.setting_value;

                // Convert value based on type
                switch (row.setting_type) {
                    case 'boolean':
                        value = value === 'true' || value === true || value === 1 || value === '1';
                        break;
                    case 'integer':
                        value = parseInt(value) || 0;
                        break;
                    case 'json':
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            value = {};
                        }
                        break;
                    default:
                        // string - keep as is
                        break;
                }

                settings[row.setting_key] = value;
            }

            return settings;
        } catch (error) {
            console.error('❌ Failed to get all settings:', error);
            throw error;
        }
    }

    /**
     * Test connection to IPTV Editor API
     */
    async testConnection() {
        try {
            console.log('🔧 Testing IPTV Editor connection...');

            if (!this.bearerToken) {
                await this.initialize();
            }

            if (!this.bearerToken) {
                return {
                    success: false,
                    message: 'Bearer token not configured'
                };
            }

            // Test by fetching playlists (lightweight operation)
            const response = await this.getPlaylists();

            // Check if response has the expected structure
            if (response && response.playlist && Array.isArray(response.playlist)) {
                console.log(`✅ Connection test successful - found ${response.playlist.length} playlists`);
                return {
                    success: true,
                    message: 'Connection successful',
                    playlistCount: response.playlist.length
                };
            } else {
                throw new Error('Invalid response format - expected playlist array');
            }
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            return {
                success: false,
                message: error.message || 'Connection failed'
            };
        }
    }

    /**
     * Make HTTP request to IPTV Editor API
     */
    async makeRequest(endpoint, data = {}, method = 'POST') {
        // Ensure service is initialized
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.bearerToken) {
            throw new Error('IPTV Editor service not properly configured - Bearer token missing');
        }

        const url = `${this.baseURL}${endpoint}`;
        const startTime = Date.now();

        try {
            console.log(`📡 Making ${method} request to ${endpoint}...`);
            console.log(`🔍 Full URL: ${url}`);
            console.log(`📋 Payload:`, JSON.stringify(data, null, 2));

            const config = {
                method,
                url,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'User-Agent': 'curl/7.58.0',
                    'Accept': '*/*',
                    'Authorization': `Bearer ${this.bearerToken}`,
                    'Origin': 'https://cloud.iptveditor.com'
                },
                timeout: 30000
            };

            if (method === 'POST') {
                config.data = data;
            }

            const response = await axios(config);
            const duration = Date.now() - startTime;

            console.log(`✅ Request to ${endpoint} completed successfully (${duration}ms)`);
            return response.data;
        } catch (error) {
            const duration = Date.now() - startTime;

            console.error('❌ IPTV Editor API Error Details:');
            console.error('   Endpoint:', endpoint);
            console.error('   Method:', method);
            console.error('   Duration:', duration + 'ms');

            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Response Data:', error.response.data);

                // Create enhanced error with title and body from API response
                const apiError = new Error(`IPTV Editor API Error: ${error.response.status}: ${error.response.data?.title || error.response.data?.message || error.message}`);
                apiError.response = error.response; // Preserve the full response
                throw apiError;
            }

            throw new Error(`IPTV Editor API Error: ${error.message}`);
        }
    }

    /**
     * Get playlists from IPTV Editor
     */
    async getPlaylists() {
        try {
            console.log('📺 Fetching IPTV Editor playlists...');

            const response = await this.makeRequest('/api/playlist/list', {});

            console.log(`✅ Fetched playlists from IPTV Editor`);
            return response;
        } catch (error) {
            console.error('❌ Failed to get playlists:', error);
            throw error;
        }
    }

    /**
     * Get stored playlists from database
     * Note: Playlists no longer link to panels (relationship reversed)
     * Use iptv_panels.iptv_editor_playlist_id to find panels linked to a playlist
     */
    async getStoredPlaylists() {
        try {
            const playlists = await query(`
                SELECT iep.*
                FROM iptv_editor_playlists iep
                WHERE iep.is_active = 1
                ORDER BY iep.name
            `);

            return playlists;
        } catch (error) {
            console.error('❌ Failed to get stored playlists:', error);
            throw error;
        }
    }

    /**
     * Store playlist in database
     */
    async storePlaylist(playlist) {
        try {
            console.log('🔍 Storing playlist:', playlist.name);

            if (!playlist.id || !playlist.name) {
                throw new Error('Playlist ID and name are required');
            }

            await query(`
                INSERT INTO iptv_editor_playlists (
                    playlist_id, name, username, password, m3u_code, epg_code,
                    expiry_date, max_connections, customer_count, channel_count,
                    movie_count, series_count, patterns, last_synced, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
                ON CONFLICT(playlist_id) DO UPDATE SET
                    name = excluded.name,
                    username = excluded.username,
                    password = excluded.password,
                    m3u_code = excluded.m3u_code,
                    epg_code = excluded.epg_code,
                    expiry_date = excluded.expiry_date,
                    max_connections = excluded.max_connections,
                    customer_count = excluded.customer_count,
                    channel_count = excluded.channel_count,
                    movie_count = excluded.movie_count,
                    series_count = excluded.series_count,
                    patterns = excluded.patterns,
                    last_synced = datetime('now'),
                    updated_at = datetime('now')
            `, [
                playlist.id,
                playlist.name,
                playlist.username || null,
                playlist.password || null,
                playlist.m3u || null,
                playlist.epg || null,
                playlist.expiry ? new Date(playlist.expiry).toISOString() : null,
                playlist.max_connections || 1,
                playlist.customerCount || 0,
                playlist.channel || 0,
                playlist.movie || 0,
                playlist.series || 0,
                JSON.stringify(playlist.patterns || [])
            ]);

            console.log(`✅ Successfully stored playlist: ${playlist.name}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to store playlist:', error);
            throw error;
        }
    }

    /**
     * Sync playlists from IPTV Editor to database
     */
    async syncPlaylists() {
        try {
            console.log('🔄 Syncing IPTV Editor playlists...');

            const response = await this.getPlaylists();

            if (!response || !response.playlist || !Array.isArray(response.playlist)) {
                throw new Error('Invalid playlist data received from IPTV Editor API');
            }

            const apiPlaylists = response.playlist;
            console.log(`📥 Retrieved ${apiPlaylists.length} playlists from IPTV Editor`);

            // Store each playlist
            for (const playlist of apiPlaylists) {
                await this.storePlaylist(playlist);
            }

            // Update last sync time
            await this.setSetting('last_sync_time', new Date().toISOString(), 'string');

            console.log(`✅ Successfully synced ${apiPlaylists.length} playlists`);

            return {
                success: true,
                message: `Successfully synced ${apiPlaylists.length} playlists`,
                count: apiPlaylists.length
            };
        } catch (error) {
            console.error('❌ Failed to sync playlists:', error);
            throw error;
        }
    }

    /**
     * Get auto-updater configuration (Phase 0)
     */
    async getAutoUpdaterConfig(playlistId) {
        try {
            console.log('🔄 Phase 0: Getting auto-updater configuration...');

            const response = await axios.post(
                `${this.baseURL}/api/auto-updater/get-data`,
                { playlist: playlistId },
                {
                    headers: {
                        'Authorization': `Bearer ${this.bearerToken}`,
                        'Content-Type': 'application/json',
                        'Origin': 'https://cloud.iptveditor.com',
                        'Referer': 'https://cloud.iptveditor.com/'
                    }
                }
            );

            console.log('✅ Phase 0 completed - playlist configuration retrieved');
            return response.data;
        } catch (error) {
            console.error('❌ Phase 0 failed:', error);
            throw error;
        }
    }

    /**
     * Collect provider data (Phase 1)
     */
    async collectProviderData(baseUrl, username, password) {
        console.log('🔄 Phase 1: Making 8 sequential API calls to provider...');

        const endpoints = [
            '',                                     // 1. Basic info
            '&action=get_live_streams',             // 2. Live streams
            '&action=get_live_categories',          // 3. Live categories
            '&action=get_vod_streams',              // 4. VOD streams
            '&action=get_vod_categories',           // 5. VOD categories
            '&action=get_series',                   // 6. Series
            '&action=get_series_categories'         // 7. Series categories
        ];

        const datasets = [];

        // First 7 calls to player_api.php
        for (let i = 0; i < endpoints.length; i++) {
            const url = `${baseUrl}/player_api.php?username=${username}&password=${password}${endpoints[i]}`;
            const callName = endpoints[i] ? endpoints[i].replace('&action=', '') : 'basic_info';

            console.log(`📡 API Call ${i + 1}/8: ${callName}`);

            try {
                const response = await axios.get(url, { timeout: 30000 });
                const dataString = JSON.stringify(response.data);
                datasets.push(dataString);

                console.log(`✅ Call ${i + 1} completed - ${dataString.length} bytes`);

                // Small delay between requests
                if (i < endpoints.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                const statusCode = error.response?.status || 'N/A';
                const statusText = error.response?.statusText || 'N/A';
                console.error(`❌ API Call ${i + 1} (${callName}) failed:`);
                console.error(`   URL: ${url}`);
                console.error(`   Status: ${statusCode} ${statusText}`);
                console.error(`   Error: ${error.message}`);
                throw new Error(`Provider API call ${i + 1} (${callName}) failed with status ${statusCode}: ${error.message}`);
            }
        }

        // 8th call: M3U playlist
        console.log('📡 API Call 8/8: M3U Playlist');
        try {
            const m3uUrl = `${baseUrl}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
            const response = await axios.get(m3uUrl, { timeout: 30000 });

            datasets.push(response.data);
            console.log(`✅ Call 8 completed - ${response.data.length} bytes`);
        } catch (error) {
            const statusCode = error.response?.status || 'N/A';
            const statusText = error.response?.statusText || 'N/A';
            console.error('❌ API Call 8 (M3U) failed:');
            console.error(`   URL: ${baseUrl}/get.php?username=${username}&password=***&type=m3u_plus&output=ts`);
            console.error(`   Status: ${statusCode} ${statusText}`);
            console.error(`   Error: ${error.message}`);
            throw new Error(`M3U playlist retrieval failed with status ${statusCode}: ${error.message}`);
        }

        console.log('✅ All provider data collected successfully');
        return datasets;
    }

    /**
     * Submit to auto-updater (Phase 2)
     * NOTE: Based on HAR file analysis, IPTV Editor only needs the provider URL.
     * The backend fetches all data server-side, avoiding massive payload transfers.
     */
    async submitToAutoUpdater(baseUrl, token) {
        console.log('🚀 Phase 2: Submitting to IPTV Editor auto-updater...');
        console.log('   📤 Sending provider URL (IPTV Editor will fetch data on their backend)');

        const FormData = require('form-data');
        const formData = new FormData();

        // Only send the provider URL - IPTV Editor fetches data server-side
        formData.append('url', baseUrl);

        try {
            const headers = {
                ...formData.getHeaders(),
                'authorization': `Bearer ${token}`,
                'origin': 'https://cloud.iptveditor.com',
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-GB,en;q=0.9,en-US;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0'
            };

            const response = await axios.post(
                'https://editor.iptveditor.com/api/auto-updater/run-auto-updater',
                formData,
                {
                    headers: headers,
                    timeout: 120000, // 2 minutes is plenty for just URL submission
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    validateStatus: (status) => status < 500 // Don't throw on 4xx
                }
            );

            console.log('✅ Auto-updater submission successful');
            console.log(`   Response status: ${response.status} ${response.statusText}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('❌ Auto-updater submission failed:', error);
            throw error;
        }
    }

    /**
     * Run complete auto-updater process
     */
    async runAutoUpdater() {
        const startTime = Date.now();

        try {
            console.log('🚀 Starting auto-updater process...');

            // Update timestamp at start
            await this.setSetting('last_auto_updater_run', new Date().toISOString(), 'string');

            // Get settings
            const settings = await this.getAllSettings();
            const baseUrl = settings.provider_base_url;
            const username = settings.provider_username;
            const password = settings.provider_password;
            const playlistId = settings.default_playlist_id;

            // Validate settings
            if (!baseUrl || !username || !password) {
                throw new Error('Missing required provider settings');
            }

            if (!this.bearerToken || !playlistId) {
                throw new Error('Missing required IPTV Editor settings');
            }

            // Phase 0: Get fresh token
            const configResponse = await this.getAutoUpdaterConfig(playlistId);
            const freshToken = configResponse.token;

            if (!freshToken) {
                throw new Error('Failed to get auto-updater token');
            }

            // Phase 1: Submit to auto-updater (IPTV Editor fetches data on their backend)
            const response = await this.submitToAutoUpdater(baseUrl, freshToken);

            const duration = Date.now() - startTime;

            // Update timestamp after completion
            await this.setSetting('last_auto_updater_run', new Date().toISOString(), 'string');

            console.log(`✅ Auto-updater completed in ${Math.round(duration / 1000)}s`);

            return {
                ...response.data,
                duration: `${Math.round(duration / 1000)} seconds`,
                success: true
            };
        } catch (error) {
            console.error('❌ Auto-updater process failed:', error);

            const duration = Date.now() - startTime;

            // Update timestamp even on failure
            await this.setSetting('last_auto_updater_run', new Date().toISOString(), 'string');

            throw error;
        }
    }

    /**
     * Run auto-updater for a specific playlist (per-playlist settings)
     */
    async runPlaylistAutoUpdater(playlistData) {
        const startTime = Date.now();

        try {
            console.log(`🚀 Starting auto-updater for playlist: ${playlistData.name}`);

            const baseUrl = playlistData.provider_base_url;
            const username = playlistData.provider_username;
            const password = playlistData.provider_password;
            const playlistId = playlistData.playlist_id;

            // Validate settings
            if (!baseUrl || !username || !password) {
                throw new Error('Missing required provider settings for this playlist');
            }

            if (!this.bearerToken || !playlistId) {
                throw new Error('Missing required IPTV Editor settings for this playlist');
            }

            console.log(`🔧 Using provider settings for playlist ${playlistData.name}`);
            console.log(`🔧 Provider URL: ${baseUrl}`);

            // Phase 0: Get fresh token
            try {
                console.log('📋 Phase 0: Getting playlist configuration from IPTV Editor...');
                const configResponse = await this.getAutoUpdaterConfig(playlistId);
                const freshToken = configResponse.token;

                if (!freshToken) {
                    throw new Error('Failed to get auto-updater token');
                }

                console.log('✅ Phase 0 completed - playlist configuration retrieved');

                // Phase 1: Submit to auto-updater (IPTV Editor fetches data on their backend)
                console.log('📤 Phase 1: Submitting to IPTV Editor...');
                const response = await this.submitToAutoUpdater(baseUrl, freshToken);

                const duration = Date.now() - startTime;

                console.log(`✅ Auto-updater completed for ${playlistData.name} in ${Math.round(duration / 1000)}s`);

                return {
                    ...response.data,
                    duration: `${Math.round(duration / 1000)} seconds`,
                    success: true,
                    playlist_name: playlistData.name
                };
            } catch (phaseError) {
                const duration = Date.now() - startTime;
                console.error(`❌ Auto-updater failed for ${playlistData.name} after ${Math.round(duration / 1000)}s`);
                console.error(`   Error: ${phaseError.message}`);
                throw phaseError;
            }
        } catch (error) {
            console.error(`❌ Auto-updater process failed for ${playlistData.name}:`, error);
            throw error;
        }
    }

    /**
     * Create IPTV Editor user
     */
    async createUser(userData) {
        try {
            console.log(`📝 Creating IPTV Editor user: ${userData.name}`);

            // Get the actual IPTV Editor playlist_id from database
            // (this.defaultPlaylistId is our internal database ID, not the IPTV Editor API ID)
            const playlists = await query(
                'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
                [this.defaultPlaylistId]
            );

            if (!playlists || playlists.length === 0) {
                throw new Error(`Playlist with DB ID ${this.defaultPlaylistId} not found`);
            }

            const actualPlaylistId = playlists[0].playlist_id;
            console.log(`📋 Using IPTV Editor playlist_id: ${actualPlaylistId} (DB ID: ${this.defaultPlaylistId})`);

            const payload = {
                playlist: actualPlaylistId,
                items: {
                    name: userData.name,
                    note: userData.note || '',
                    username: userData.username,
                    password: userData.password,
                    message: null,
                    channels_categories: userData.channels_categories || [],
                    vods_categories: userData.vods_categories || [],
                    series_categories: userData.series_categories || [],
                    patterns: [{
                        url: userData.provider_base_url || this.providerBaseUrl,
                        param1: userData.username,
                        param2: userData.password,
                        type: "xtream"
                    }],
                    language: "en"
                }
            };

            console.log('📡 [IPTV Editor] Full API Payload being sent:');
            console.log(JSON.stringify(payload, null, 2));

            const response = await this.makeRequest('/api/reseller/new-customer', payload);

            if (response && response.customer && response.customer.id) {
                console.log(`✅ IPTV Editor user created successfully - ID: ${response.customer.id}`);
                return {
                    id: response.customer.id,
                    m3u_code: response.customer.m3u || null,
                    epg_code: response.customer.epg || null,
                    expiry: response.customer.expiry || null
                };
            } else {
                throw new Error('Invalid response from IPTV Editor - no customer ID returned');
            }
        } catch (error) {
            console.error('❌ Failed to create IPTV Editor user:', error.message);
            if (error.response) {
                console.error('   HTTP Status:', error.response.status);
                console.error('   API Response:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    /**
     * Force sync IPTV Editor user - matches IPTV Editor cloud app format
     * @param {Object} payload - The force sync payload
     * @param {Object} payload.fullEditorUser - Full user data from IPTV Editor (from get-data endpoint)
     * @param {Object} payload.locale - Panel response with user_info and server_info
     * @param {string} payload.providerUrl - The provider/panel URL
     * @param {number} payload.playlistId - The IPTV Editor playlist ID (list_id)
     * @param {string} payload.panelUsername - The xtream panel username (from patterns)
     * @param {string} payload.panelPassword - The xtream panel password (from patterns)
     */
    async forceSync(payload) {
        try {
            const { fullEditorUser, locale, providerUrl, playlistId, panelUsername, panelPassword } = payload;

            console.log(`🔄 Force-syncing user ${fullEditorUser.username} on ${providerUrl} (playlist: ${playlistId})`);
            console.log(`📋 Using panel credentials: ${panelUsername}/*** for xtream section`);

            // Mark the user as updated (this tells IPTV Editor to sync)
            const userItem = {
                ...fullEditorUser,
                updated: true,
                iptveditor: false  // This flag is set to false in the HAR
            };

            // Build request - include playlist/list_id as required by the API
            // IMPORTANT: Use the PANEL credentials for the xtream section, not IPTV Editor credentials
            // The xtream section tells IPTV Editor where to fetch the actual content from
            const requestData = {
                playlist: playlistId,  // Required: The IPTV Editor playlist/list ID
                items: [userItem],
                xtream: {
                    url: providerUrl,
                    param1: panelUsername,  // Panel/xtream username (may differ from IPTV Editor username)
                    param2: panelPassword,  // Panel/xtream password
                    type: "xtream"
                },
                locale: locale
            };

            console.log('📤 Force-sync request:', JSON.stringify(requestData, null, 2));

            const response = await this.makeRequest('/api/reseller/force-sync', requestData);

            console.log('✅ Force-sync response:', JSON.stringify(response, null, 2));

            return response;
        } catch (error) {
            console.error('❌ Force-sync failed:', error.message);
            throw error;
        }
    }

    /**
     * Delete IPTV Editor user
     */
    async getUserById(editorUserId, playlistId = null) {
        try {
            console.log(`📡 Fetching IPTV Editor user ID: ${editorUserId}`);

            const targetPlaylist = playlistId || this.defaultPlaylistId;
            if (!targetPlaylist) {
                throw new Error('Playlist ID required to fetch user');
            }

            const payload = {
                playlist: targetPlaylist
            };

            const response = await this.makeRequest('/api/reseller/get-customers', payload);

            // Find the user by ID in the response
            if (response && response.customers) {
                const user = response.customers.find(u => u.id === editorUserId);
                if (user) {
                    console.log(`✅ Found user: ${user.name} (ID: ${user.id})`);
                    return user;
                }
            }

            throw new Error(`User ${editorUserId} not found in playlist ${targetPlaylist}`);
        } catch (error) {
            console.error(`❌ Failed to fetch IPTV Editor user ${editorUserId}:`, error);
            throw error;
        }
    }

    async findUserByUsername(username, playlistId = null) {
        try {
            const targetPlaylistDbId = playlistId || this.defaultPlaylistId;
            if (!targetPlaylistDbId) {
                throw new Error('Playlist ID required to search for user');
            }

            console.log(`🔍 Searching for user "${username}" in IPTV Editor playlist (DB ID: ${targetPlaylistDbId})...`);

            // Get the actual IPTV Editor playlist_id from database
            const playlists = await query(
                'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
                [targetPlaylistDbId]
            );

            if (!playlists || playlists.length === 0) {
                throw new Error(`Playlist with DB ID ${targetPlaylistDbId} not found`);
            }

            const actualPlaylistId = playlists[0].playlist_id;
            console.log(`📋 Using IPTV Editor playlist_id: ${actualPlaylistId}`);

            // Call IPTV Editor API to get all users
            const payload = {
                playlist: actualPlaylistId
            };

            console.log(`📡 Calling IPTV Editor API to fetch users from playlist...`);
            const response = await this.makeRequest('/api/reseller/get-data', payload);

            // Search through items array to find matching username
            // Note: API returns 'm3u' field (M3U username) and 'username' field (IPTV panel username)
            if (response && response.items && Array.isArray(response.items)) {
                console.log(`📋 Searching through ${response.items.length} users for username "${username}"...`);

                // Search by panel username
                const user = response.items.find(item => item.username === username);

                if (user) {
                    console.log(`✅ Found user "${username}" in IPTV Editor - ID: ${user.id}`);
                    console.log(`📊 User data:`, JSON.stringify(user, null, 2));
                    return user;
                } else {
                    console.log(`❌ User "${username}" not found in IPTV Editor playlist`);
                    return null;
                }
            } else {
                console.log(`⚠️ Invalid response format from IPTV Editor API`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Failed to search for IPTV Editor user "${username}":`, error);
            throw error;
        }
    }

    /**
     * Find user by IPTV Editor ID (more reliable than username search)
     */
    async findUserById(editorId, playlistId = null) {
        try {
            const targetPlaylistDbId = playlistId || this.defaultPlaylistId;
            if (!targetPlaylistDbId) {
                throw new Error('Playlist ID required to search for user');
            }

            console.log(`🔍 Searching for user by ID ${editorId} in IPTV Editor playlist (DB ID: ${targetPlaylistDbId})...`);

            // Get the actual IPTV Editor playlist_id from database
            const playlists = await query(
                'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
                [targetPlaylistDbId]
            );

            if (!playlists || playlists.length === 0) {
                throw new Error(`Playlist with DB ID ${targetPlaylistDbId} not found`);
            }

            const actualPlaylistId = playlists[0].playlist_id;
            console.log(`📋 Using IPTV Editor playlist_id: ${actualPlaylistId}`);

            // Call IPTV Editor API to get all users
            const payload = {
                playlist: actualPlaylistId
            };

            console.log(`📡 Calling IPTV Editor API to fetch users from playlist...`);
            const response = await this.makeRequest('/api/reseller/get-data', payload);

            // Search through items array to find matching ID
            if (response && response.items && Array.isArray(response.items)) {
                console.log(`📋 Searching through ${response.items.length} users for ID ${editorId}...`);

                const user = response.items.find(item => item.id === editorId);

                if (user) {
                    console.log(`✅ Found user with ID ${editorId} in IPTV Editor`);
                    console.log(`📊 User data:`, JSON.stringify(user, null, 2));
                    return user;
                } else {
                    console.log(`❌ User with ID ${editorId} not found in IPTV Editor playlist`);
                    return null;
                }
            } else {
                console.log(`⚠️ Invalid response format from IPTV Editor API`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Failed to search for IPTV Editor user by ID ${editorId}:`, error);
            throw error;
        }
    }

    /**
     * Find users by username OR name (for edit user page)
     */
    async findUsersByUsernameOrName(searchTerm, playlistId = null) {
        try {
            const targetPlaylistDbId = playlistId || this.defaultPlaylistId;
            if (!targetPlaylistDbId) {
                throw new Error('Playlist ID required to search for user');
            }

            console.log(`🔍 Searching for "${searchTerm}" (by username or name) in IPTV Editor playlist (DB ID: ${targetPlaylistDbId})...`);

            // Get the actual IPTV Editor playlist_id from database
            const playlists = await query(
                'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
                [targetPlaylistDbId]
            );

            if (!playlists || playlists.length === 0) {
                throw new Error(`Playlist with DB ID ${targetPlaylistDbId} not found`);
            }

            const actualPlaylistId = playlists[0].playlist_id;
            console.log(`📋 Using IPTV Editor playlist_id: ${actualPlaylistId}`);

            // Call IPTV Editor API to get all users
            const payload = {
                playlist: actualPlaylistId
            };

            console.log(`📡 Calling IPTV Editor API to fetch users from playlist...`);
            const response = await this.makeRequest('/api/reseller/get-data', payload);

            // Search through items array to find matching username OR name
            if (response && response.items && Array.isArray(response.items)) {
                console.log(`📋 Searching through ${response.items.length} users for "${searchTerm}" in username or name...`);

                const searchLower = searchTerm.toLowerCase();
                const matchingUsers = response.items.filter(item => {
                    const usernameLower = (item.username || '').toLowerCase();
                    const nameLower = (item.name || '').toLowerCase();
                    return usernameLower.includes(searchLower) || nameLower.includes(searchLower);
                });

                if (matchingUsers.length > 0) {
                    console.log(`✅ Found ${matchingUsers.length} user(s) matching "${searchTerm}" in IPTV Editor`);
                    return matchingUsers;
                } else {
                    console.log(`❌ No users found matching "${searchTerm}" in IPTV Editor playlist`);
                    return [];
                }
            } else {
                console.log(`⚠️ Invalid response format from IPTV Editor API`);
                return [];
            }
        } catch (error) {
            console.error(`❌ Failed to search for IPTV Editor users with term "${searchTerm}":`, error);
            throw error;
        }
    }

    async deleteUser(editorUserId, playlistId = null) {
        try {
            console.log(`🗑️ Deleting IPTV Editor user ID: ${editorUserId}`);

            const targetPlaylist = playlistId || this.defaultPlaylistId;
            if (!targetPlaylist) {
                throw new Error('Playlist ID required to delete user');
            }

            // Use the correct API format from old working code
            const deleteData = {
                playlist: targetPlaylist,  // playlist ID
                items: [
                    {
                        id: editorUserId  // Just the ID, not full user object
                    }
                ]
            };

            console.log(`📡 Deleting user ${editorUserId} from playlist ${targetPlaylist}`);
            const response = await this.makeRequest('/api/reseller/remove', deleteData);

            console.log(`✅ Successfully deleted IPTV Editor user ${editorUserId}`);
            return response;
        } catch (error) {
            console.error(`❌ Failed to delete IPTV Editor user ${editorUserId}:`, error);
            throw error;
        }
    }
}

// Export class (not singleton) to allow per-playlist instances
module.exports = IPTVEditorService;
