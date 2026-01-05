/**
 * IPTV Editor Integration API Routes
 */

const express = require('express');
const router = express.Router();
const IPTVEditorService = require('../services/iptv-editor-service');
const cron = require('node-cron');

// Create service instance (using default settings, will be initialized per request)
const iptvEditorService = new IPTVEditorService();

// Global variable to store scheduler task
let autoUpdaterTask = null;

/**
 * GET /api/v2/iptv-editor/settings - Get IPTV Editor settings
 */
router.get('/settings', async (req, res) => {
    try {
        console.log('⚙️ Loading IPTV Editor settings...');

        const settings = await iptvEditorService.getAllSettings();

        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('❌ Error getting IPTV Editor settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get settings',
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/iptv-editor/settings - Update IPTV Editor settings
 */
router.put('/settings', async (req, res) => {
    try {
        console.log('💾 Updating IPTV Editor settings...');

        const updates = req.body;

        // Validate at least one field is provided
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No settings provided for update'
            });
        }

        // Track if auto updater settings changed
        const autoUpdaterChanged = updates.auto_updater_enabled !== undefined ||
            updates.auto_updater_schedule_hours !== undefined;

        // Update each setting
        for (const [key, value] of Object.entries(updates)) {
            let type = 'string';
            if (typeof value === 'boolean') type = 'boolean';
            else if (typeof value === 'number') type = 'integer';
            else if (typeof value === 'object') type = 'json';

            await iptvEditorService.setSetting(key, value, type);
        }

        // Re-initialize service with new settings
        await iptvEditorService.initialize();

        // Update scheduler if auto updater settings changed
        if (autoUpdaterChanged) {
            try {
                console.log('🔄 Auto updater settings changed, updating scheduler...');

                // Stop existing task
                if (autoUpdaterTask) {
                    autoUpdaterTask.stop();
                    autoUpdaterTask = null;
                    console.log('🛑 Stopped existing auto updater task');
                }

                // If enabled, create new scheduled task
                if (updates.auto_updater_enabled === true || updates.auto_updater_enabled === 'true') {
                    const hours = parseInt(updates.auto_updater_schedule_hours) || 24;

                    // Convert hours to cron expression
                    let cronExpression;
                    switch (hours) {
                        case 1: cronExpression = '0 * * * *'; break;        // Every hour
                        case 2: cronExpression = '0 */2 * * *'; break;      // Every 2 hours
                        case 4: cronExpression = '0 */4 * * *'; break;      // Every 4 hours
                        case 6: cronExpression = '0 */6 * * *'; break;      // Every 6 hours
                        case 12: cronExpression = '0 */12 * * *'; break;    // Every 12 hours
                        case 24: cronExpression = '0 2 * * *'; break;       // Daily at 2:00 AM
                        default: cronExpression = '0 2 * * *'; break;       // Default to daily
                    }

                    console.log(`📅 Scheduling auto updater every ${hours} hours (${cronExpression})`);

                    // Create scheduled task
                    autoUpdaterTask = cron.schedule(cronExpression, async () => {
                        console.log('🔄 Running scheduled auto updater...');

                        try {
                            await iptvEditorService.runAutoUpdater();
                            console.log('✅ Scheduled auto updater completed successfully');
                        } catch (error) {
                            console.error('❌ Scheduled auto updater failed:', error.message);
                        }
                    });

                    console.log('✅ Auto updater scheduled successfully');
                } else {
                    console.log('ℹ️ Auto updater disabled');
                }
            } catch (schedulerError) {
                console.error('❌ Failed to update auto updater scheduler:', schedulerError);
                // Don't fail the whole request if scheduler update fails
            }
        }

        // Return updated settings
        const updatedSettings = await iptvEditorService.getAllSettings();

        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: updatedSettings
        });
    } catch (error) {
        console.error('❌ Error updating IPTV Editor settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update settings',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/test-connection - Test connection to IPTV Editor
 */
router.post('/test-connection', async (req, res) => {
    try {
        console.log('🔧 Testing IPTV Editor connection...');

        const result = await iptvEditorService.testConnection();

        res.json(result);
    } catch (error) {
        console.error('❌ Error testing IPTV Editor connection:', error);
        res.status(500).json({
            success: false,
            message: 'Connection test failed',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/sync-playlists - Sync playlists from IPTV Editor
 */
router.post('/sync-playlists', async (req, res) => {
    try {
        console.log('🔄 Syncing IPTV Editor playlists...');

        const result = await iptvEditorService.syncPlaylists();

        res.json(result);
    } catch (error) {
        console.error('❌ Error syncing playlists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync playlists',
            error: error.message
        });
    }
});

/**
 * OBSOLETE ENDPOINT - Moved to iptv-editor-playlists-routes.js
 *
 * This endpoint has been moved to /api/v2/iptv-editor/playlists in iptv-editor-playlists-routes.js
 * which properly handles playlist management using direct database queries.
 *
 * Keeping this commented out for reference:
 */
/*
router.get('/playlists', async (req, res) => {
    try {
        console.log('📺 Loading stored playlists from database...');

        const playlists = await iptvEditorService.getStoredPlaylists();

        res.json({
            success: true,
            playlists: playlists,
            count: playlists.length
        });
    } catch (error) {
        console.error('❌ Error getting stored playlists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get stored playlists',
            error: error.message
        });
    }
});
*/

/**
 * POST /api/v2/iptv-editor/run-auto-updater - Manually run auto-updater
 */
router.post('/run-auto-updater', async (req, res) => {
    try {
        console.log('🚀 Manually running IPTV Editor auto-updater...');

        const result = await iptvEditorService.runAutoUpdater();

        res.json({
            success: true,
            message: 'Auto-updater completed successfully',
            data: result
        });
    } catch (error) {
        console.error('❌ Auto-updater failed:', error);
        res.status(500).json({
            success: false,
            message: 'Auto-updater failed: ' + error.message,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/iptv-editor/categories/channels/:playlistId - Get channel categories for a specific playlist
 */
router.get('/categories/channels/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        console.log(`📺 Fetching IPTV Editor channel categories for playlist ${playlistId}...`);

        //  Get the playlist and bearer token from settings
        const db = require('../database-config');
        const playlists = await db.query(
            'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
            [playlistId]
        );

        if (!playlists || playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        const playlist = playlists[0];

        // Get bearer token from settings
        const settings = await db.query(
            'SELECT setting_value FROM iptv_editor_settings WHERE setting_key = ?',
            ['bearer_token']
        );

        if (!settings || settings.length === 0 || !settings[0].setting_value) {
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured. Please configure IPTV Editor settings first.'
            });
        }

        const bearerToken = settings[0].setting_value;

        // Make API call to get channel categories
        const response = await fetch('https://editor.iptveditor.com/api/category/channel/get-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify({
                playlist: playlist.playlist_id
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Filter out deleted categories and format for frontend
        const activeCategories = data.items
            .filter(cat => !cat.is_deleted && !cat.hidden)
            .map(cat => ({
                id: cat.id,
                name: cat.name,
                position: cat.position
            }))
            .sort((a, b) => a.position - b.position);

        console.log(`✅ Retrieved ${activeCategories.length} active channel categories`);

        res.json({
            success: true,
            data: activeCategories,
            message: `Retrieved ${activeCategories.length} channel categories`
        });

    } catch (error) {
        console.error('❌ Error fetching IPTV Editor channel categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch channel categories: ' + error.message
        });
    }
});

/**
 * GET /api/v2/iptv-editor/categories/movies/:playlistId - Get movie categories for a specific playlist
 */
router.get('/categories/movies/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        console.log(`📺 Fetching IPTV Editor movie categories for playlist ${playlistId}...`);

        // Get the playlist and bearer token from settings
        const db = require('../database-config');
        const playlists = await db.query(
            'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
            [playlistId]
        );

        if (!playlists || playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        const playlist = playlists[0];

        // Get bearer token from settings
        const settings = await db.query(
            'SELECT setting_value FROM iptv_editor_settings WHERE setting_key = ?',
            ['bearer_token']
        );

        if (!settings || settings.length === 0 || !settings[0].setting_value) {
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured. Please configure IPTV Editor settings first.'
            });
        }

        const bearerToken = settings[0].setting_value;

        // Make API call to get movie categories
        const response = await fetch('https://editor.iptveditor.com/api/category/movie/get-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify({
                playlist: playlist.playlist_id
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Filter out deleted categories and format for frontend
        const activeCategories = data.items
            .filter(cat => !cat.is_deleted && !cat.hidden)
            .map(cat => ({
                id: cat.id,
                name: cat.name,
                position: cat.position
            }))
            .sort((a, b) => a.position - b.position);

        console.log(`✅ Retrieved ${activeCategories.length} active movie categories`);

        res.json({
            success: true,
            data: activeCategories,
            message: `Retrieved ${activeCategories.length} movie categories`
        });

    } catch (error) {
        console.error('❌ Error fetching IPTV Editor movie categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch movie categories: ' + error.message
        });
    }
});

/**
 * GET /api/v2/iptv-editor/categories/series/:playlistId - Get series categories for a specific playlist
 */
router.get('/categories/series/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        console.log(`📺 Fetching IPTV Editor series categories for playlist ${playlistId}...`);

        // Get the playlist and bearer token from settings
        const db = require('../database-config');
        const playlists = await db.query(
            'SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?',
            [playlistId]
        );

        if (!playlists || playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        const playlist = playlists[0];

        // Get bearer token from settings
        const settings = await db.query(
            'SELECT setting_value FROM iptv_editor_settings WHERE setting_key = ?',
            ['bearer_token']
        );

        if (!settings || settings.length === 0 || !settings[0].setting_value) {
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured. Please configure IPTV Editor settings first.'
            });
        }

        const bearerToken = settings[0].setting_value;

        // Make API call to get series categories
        const response = await fetch('https://editor.iptveditor.com/api/category/series/get-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify({
                playlist: playlist.playlist_id
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Filter out deleted categories and format for frontend
        const activeCategories = data.items
            .filter(cat => !cat.is_deleted && !cat.hidden)
            .map(cat => ({
                id: cat.id,
                name: cat.name,
                position: cat.position
            }))
            .sort((a, b) => a.position - b.position);

        console.log(`✅ Retrieved ${activeCategories.length} active series categories`);

        res.json({
            success: true,
            data: activeCategories,
            message: `Retrieved ${activeCategories.length} series categories`
        });

    } catch (error) {
        console.error('❌ Error fetching IPTV Editor series categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch series categories: ' + error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/search-user - Search for user by username in IPTV Editor
 */
router.post('/search-user', async (req, res) => {
    try {
        const { username, iptv_editor_playlist_id } = req.body;

        if (!username || !iptv_editor_playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'username and iptv_editor_playlist_id are required'
            });
        }

        console.log(`🔍 API: Searching for "${username}" (by username or name) in IPTV Editor playlist ${iptv_editor_playlist_id}...`);

        // Initialize IPTV Editor service
        const service = new IPTVEditorService();
        await service.initialize();

        // Search for user by username OR name in the specified playlist
        const users = await service.findUsersByUsernameOrName(username, iptv_editor_playlist_id);

        if (users && users.length > 0) {
            console.log(`✅ Found ${users.length} user(s) matching "${username}" in IPTV Editor playlist ${iptv_editor_playlist_id}`);

            res.json({
                success: true,
                found: true,
                users: users,
                iptv_editor_playlist_id
            });
        } else {
            console.log(`❌ User "${username}" not found in IPTV Editor playlist ${iptv_editor_playlist_id}`);

            res.json({
                success: true,
                found: false,
                users: [],
                iptv_editor_playlist_id
            });
        }

    } catch (error) {
        console.error('❌ Error searching IPTV Editor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search IPTV Editor',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/create-user - Create IPTV Editor user
 */
router.post('/create-user', async (req, res) => {
    try {
        const { username, password, name, playlist_id, provider_base_url, channels_categories, vods_categories, series_categories } = req.body;

        if (!username || !password || !name || !playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'username, password, name, and playlist_id are required'
            });
        }

        console.log(`📝 API: Creating IPTV Editor user "${name}" (username: ${username}) in playlist ${playlist_id}...`);

        // Initialize IPTV Editor service with the specific playlist
        const service = new IPTVEditorService();
        await service.initialize();
        service.defaultPlaylistId = playlist_id;

        // Create user data
        const userData = {
            name: name,
            username: username,
            password: password,
            provider_base_url: provider_base_url,
            channels_categories: channels_categories || [],
            vods_categories: vods_categories || [],
            series_categories: series_categories || [],
            note: ''
        };

        // Create user in IPTV Editor
        const result = await service.createUser(userData);

        console.log(`✅ IPTV Editor user created successfully - ID: ${result.id}`);

        res.json({
            success: true,
            user: {
                id: result.id,
                username: username,
                password: password,
                m3u_url: result.m3u_code,
                epg_url: result.epg_code,
                expiry: result.expiry
            },
            iptv_editor_playlist_id: playlist_id
        });

    } catch (error) {
        console.error('❌ Error creating IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV Editor user',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/user/:username/sync - Force sync IPTV Editor user (V1 compatible endpoint)
 */
router.post('/user/:username/sync', async (req, res) => {
    const { username } = req.params;
    const { user_id } = req.body;
    const startTime = Date.now();

    try {
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required'
            });
        }

        console.log(`🔄 Force syncing IPTV Editor user '${username}' (user_id: ${user_id})...`);

        // Get IPTV Editor user record
        const db = require('../db');
        const editorUsers = await db.query(`
            SELECT * FROM iptv_editor_users
            WHERE iptv_editor_username = ?
        `, [username]);

        if (editorUsers.length === 0) {
            return res.status(404).json({
                success: false,
                message: `User '${username}' not found in IPTV Editor`
            });
        }

        const editorUser = editorUsers[0];

        // Initialize service
        const service = new IPTVEditorService();
        await service.initialize();
        service.defaultPlaylistId = editorUser.iptv_editor_playlist_id;

        // Force sync using simple API call
        const syncResponse = await service.forceSync(editorUser.iptv_editor_id);

        // Update sync status in database
        await db.query(`
            UPDATE iptv_editor_users
            SET last_sync_time = datetime('now'),
                sync_status = 'synced',
                max_connections = ?,
                expiration_date = ?
            WHERE id = ?
        `, [
            syncResponse.max_connections || editorUser.max_connections,
            syncResponse.expiry || editorUser.expiration_date,
            editorUser.id
        ]);

        const syncDuration = Date.now() - startTime;

        console.log(`✅ Force sync completed for '${username}' in ${syncDuration}ms`);

        res.json({
            success: true,
            message: `User '${username}' force-synced successfully`,
            operation: 'force-sync',
            data: {
                username: username,
                iptv_editor_id: editorUser.iptv_editor_id,
                sync_duration_ms: syncDuration,
                max_connections: syncResponse.max_connections || editorUser.max_connections,
                expiry: syncResponse.expiry || editorUser.expiration_date,
                updated: syncResponse.updated !== undefined ? syncResponse.updated : true
            }
        });

    } catch (error) {
        console.error(`❌ Error force syncing user '${username}':`, error);
        res.status(500).json({
            success: false,
            message: `Failed to force sync user '${username}'`,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/iptv-editor/user/:userId/status - Get IPTV Editor user status (V1 compatible endpoint)
 */
router.get('/user/:userId/status', async (req, res) => {
    const { userId } = req.params;

    try {
        const db = require('../db');

        // Get IPTV Editor user by user_id
        const editorUsers = await db.query(`
            SELECT * FROM iptv_editor_users
            WHERE user_id = ?
        `, [userId]);

        if (editorUsers.length === 0) {
            return res.status(404).json({
                success: false,
                message: `IPTV Editor user not found for user_id ${userId}`
            });
        }

        const iptvUser = editorUsers[0];

        res.json({
            success: true,
            iptvUser: {
                id: iptvUser.id,
                user_id: iptvUser.user_id,
                iptv_editor_id: iptvUser.iptv_editor_id,
                iptv_editor_username: iptvUser.iptv_editor_username,
                iptv_editor_password: iptvUser.iptv_editor_password,
                m3u_code: iptvUser.m3u_code,
                epg_code: iptvUser.epg_code,
                expiry_date: iptvUser.expiration_date,
                max_connections: iptvUser.max_connections,
                sync_status: iptvUser.sync_status,
                last_sync_time: iptvUser.last_sync_time,
                created_at: iptvUser.created_at,
                updated_at: iptvUser.updated_at
            }
        });

    } catch (error) {
        console.error(`❌ Error getting IPTV Editor user status for user ${userId}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user status',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/iptv-editor/create-user-for-subsapp-user - Create IPTV Editor user for existing subsapp user
 * Automatically pulls channel group categories from the user's iptv_channel_group_id
 */
router.post('/create-user-for-subsapp-user', async (req, res) => {
    try {
        const { user_id, playlist_id } = req.body;

        if (!user_id || !playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id and playlist_id are required'
            });
        }

        console.log(`📝 API: Creating IPTV Editor user for subsapp user ${user_id} in playlist ${playlist_id}...`);

        const db = require('../db');

        // Get the user's information including iptv_channel_group_id
        const users = await db.query(`
            SELECT id, name, email, iptv_username, iptv_password, iptv_channel_group_id, iptv_panel_id
            FROM users
            WHERE id = ?
        `, [user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: `User ${user_id} not found`
            });
        }

        const user = users[0];

        if (!user.iptv_channel_group_id) {
            return res.status(400).json({
                success: false,
                message: `User ${user_id} does not have a channel group assigned (iptv_channel_group_id is null)`
            });
        }

        console.log(`   User: ${user.name} (${user.email})`);
        console.log(`   Channel Group ID: ${user.iptv_channel_group_id}`);

        // Get the channel group with category IDs
        const channelGroups = await db.query(`
            SELECT id, name, editor_channel_ids, editor_movie_ids, editor_series_ids
            FROM iptv_channel_groups
            WHERE id = ?
        `, [user.iptv_channel_group_id]);

        if (channelGroups.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Channel group ${user.iptv_channel_group_id} not found`
            });
        }

        const channelGroup = channelGroups[0];
        console.log(`   Channel Group: ${channelGroup.name}`);

        // Parse the JSON arrays of category IDs
        const channelCategoryIds = channelGroup.editor_channel_ids ? JSON.parse(channelGroup.editor_channel_ids) : [];
        const movieCategoryIds = channelGroup.editor_movie_ids ? JSON.parse(channelGroup.editor_movie_ids) : [];
        const seriesCategoryIds = channelGroup.editor_series_ids ? JSON.parse(channelGroup.editor_series_ids) : [];

        console.log(`   Live Categories: ${channelCategoryIds.length} selected`);
        console.log(`   Movie Categories: ${movieCategoryIds.length} selected`);
        console.log(`   Series Categories: ${seriesCategoryIds.length} selected`);

        // Get the IPTV panel to find the provider_base_url
        const panels = await db.query(`
            SELECT id, api_url, panel_type
            FROM iptv_panels
            WHERE id = ?
        `, [user.iptv_panel_id]);

        let providerBaseUrl = '';
        if (panels.length > 0) {
            providerBaseUrl = panels[0].api_url || '';
            console.log(`   Provider Base URL: ${providerBaseUrl}`);
        }

        // Generate username/password if not set
        const username = user.iptv_username || `user_${user.id}_${Date.now()}`;
        const password = user.iptv_password || Math.random().toString(36).substring(2, 15);

        // Initialize IPTV Editor service with the specific playlist
        const service = new IPTVEditorService();
        await service.initialize();
        service.defaultPlaylistId = playlist_id;

        // Create user data
        const userData = {
            name: user.name,
            username: username,
            password: password,
            provider_base_url: providerBaseUrl,
            channels_categories: channelCategoryIds,
            vods_categories: movieCategoryIds,
            series_categories: seriesCategoryIds,
            note: `Created from subsapp user ${user.id}`
        };

        console.log(`   Creating IPTV Editor user with ${channelCategoryIds.length + movieCategoryIds.length + seriesCategoryIds.length} total categories...`);

        // Create user in IPTV Editor
        const result = await service.createUser(userData);

        console.log(`✅ IPTV Editor user created successfully - ID: ${result.id}`);

        // Store the IPTV Editor user information in the database
        await db.query(`
            INSERT INTO iptv_editor_users (
                user_id, iptv_editor_id, iptv_editor_username, iptv_editor_password,
                iptv_editor_playlist_id, m3u_code, epg_code, expiration_date, max_connections,
                sync_status, last_sync_time, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'), datetime('now'), datetime('now'))
        `, [
            user_id,
            result.id,
            username,
            password,
            playlist_id,
            result.m3u_code || null,
            result.epg_code || null,
            result.expiry || null,
            result.max_connections || null
        ]);

        console.log(`✅ IPTV Editor user record saved to database`);

        // Update the user's iptv_username and iptv_password if they were generated
        if (!user.iptv_username || !user.iptv_password) {
            await db.query(`
                UPDATE users
                SET iptv_username = ?, iptv_password = ?, iptv_editor_enabled = 1
                WHERE id = ?
            `, [username, password, user_id]);
            console.log(`✅ Updated user's IPTV credentials`);
        }

        res.json({
            success: true,
            message: `IPTV Editor user created successfully for ${user.name}`,
            user: {
                id: result.id,
                username: username,
                password: password,
                m3u_url: result.m3u_code,
                epg_url: result.epg_code,
                expiry: result.expiry,
                max_connections: result.max_connections
            },
            categories: {
                channels: channelCategoryIds.length,
                movies: movieCategoryIds.length,
                series: seriesCategoryIds.length
            },
            iptv_editor_playlist_id: playlist_id
        });

    } catch (error) {
        console.error('❌ Error creating IPTV Editor user for subsapp user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV Editor user',
            error: error.message
        });
    }
});

module.exports = router;
