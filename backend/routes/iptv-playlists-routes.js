/**
 * IPTV Editor Playlists API Routes
 *
 * CRUD operations for IPTV Editor playlists and playlist-related functionality
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');
const axios = require('axios');

// GET /api/v2/iptv-playlists - Get all IPTV Editor playlists
router.get('/', async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';

        let sql = `
            SELECT
                p.id,
                p.name,
                p.iptv_panel_id,
                panel.name as panel_name,
                panel.panel_type,
                p.playlist_id,
                p.playlist_url,
                p.current_user_count,
                p.max_users,
                p.is_active,
                p.last_sync,
                p.created_at,
                p.updated_at
            FROM iptv_editor_playlists p
            LEFT JOIN iptv_panels panel ON p.iptv_panel_id = panel.id
        `;

        if (!includeInactive) {
            sql += ' WHERE p.is_active = TRUE';
        }

        sql += ' ORDER BY p.name';

        const playlists = await db.query(sql);

        // Calculate available capacity for each playlist
        const playlistsWithCapacity = playlists.map(playlist => ({
            ...playlist,
            available_capacity: playlist.max_users ?
                playlist.max_users - playlist.current_user_count :
                999999,
            is_full: playlist.max_users ?
                playlist.current_user_count >= playlist.max_users :
                false
        }));

        res.json({
            success: true,
            playlists: playlistsWithCapacity,
            count: playlistsWithCapacity.length
        });

    } catch (error) {
        console.error('Error fetching IPTV Editor playlists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV Editor playlists',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-playlists/:id - Get single IPTV Editor playlist
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const playlists = await db.query(`
            SELECT
                p.*,
                panel.name as panel_name,
                panel.panel_type,
                panel.provider_base_url
            FROM iptv_editor_playlists p
            LEFT JOIN iptv_panels panel ON p.iptv_panel_id = panel.id
            WHERE p.id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        const playlist = playlists[0];

        // Get user count linked to this playlist
        const userCount = await db.query(`
            SELECT COUNT(*) as count
            FROM iptv_editor_users
            WHERE iptv_editor_playlist_id = ?
        `, [id]);

        playlist.linked_users_count = userCount[0].count;
        playlist.available_capacity = playlist.max_users ?
            playlist.max_users - playlist.current_user_count :
            999999;
        playlist.is_full = playlist.max_users ?
            playlist.current_user_count >= playlist.max_users :
            false;

        res.json({
            success: true,
            playlist
        });

    } catch (error) {
        console.error('Error fetching IPTV Editor playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV Editor playlist',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-playlists/:id/users - Get all users in playlist
router.get('/:id/users', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if playlist exists
        const playlists = await db.query(`
            SELECT id, name FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        // Get all users in this playlist
        const users = await db.query(`
            SELECT
                edu.id as editor_user_id,
                edu.user_id,
                u.name as user_name,
                u.email,
                edu.iptv_editor_id,
                edu.iptv_editor_username,
                edu.iptv_editor_password,
                edu.m3u_code,
                edu.epg_code,
                edu.last_sync_time,
                edu.sync_status,
                edu.created_at
            FROM iptv_editor_users edu
            LEFT JOIN users u ON edu.user_id = u.id
            WHERE edu.iptv_editor_playlist_id = ?
            ORDER BY u.name
        `, [id]);

        res.json({
            success: true,
            playlist_id: id,
            playlist_name: playlists[0].name,
            users,
            count: users.length
        });

    } catch (error) {
        console.error('Error fetching playlist users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch playlist users',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-playlists - Create new IPTV Editor playlist
router.post('/', async (req, res) => {
    try {
        const {
            name,
            iptv_panel_id,
            playlist_id,
            playlist_url,
            bearer_token,
            max_users
        } = req.body;

        // Validation
        if (!name || !iptv_panel_id || !playlist_id || !playlist_url || !bearer_token) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, iptv_panel_id, playlist_id, playlist_url, bearer_token'
            });
        }

        // Check if panel exists
        const panels = await db.query(`
            SELECT id, name FROM iptv_panels WHERE id = ?
        `, [iptv_panel_id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Check if playlist_id already exists (must be unique)
        const existing = await db.query(`
            SELECT id FROM iptv_editor_playlists WHERE playlist_id = ?
        `, [playlist_id]);

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A playlist with this playlist_id already exists'
            });
        }

        // Insert playlist
        const result = await db.query(`
            INSERT INTO iptv_editor_playlists
            (name, iptv_panel_id, playlist_id, playlist_url, bearer_token, max_users, is_active)
            VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `, [name, iptv_panel_id, playlist_id, playlist_url, bearer_token, max_users]);

        res.status(201).json({
            success: true,
            message: 'IPTV Editor playlist created successfully',
            playlist_id: result.insertId
        });

    } catch (error) {
        console.error('Error creating IPTV Editor playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV Editor playlist',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-playlists/:id - Update IPTV Editor playlist
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            iptv_panel_id,
            playlist_id,
            playlist_url,
            bearer_token,
            max_users,
            is_active
        } = req.body;

        // Check if playlist exists
        const existing = await db.query(`
            SELECT id FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (iptv_panel_id !== undefined) {
            // Validate panel exists
            const panels = await db.query(`
                SELECT id FROM iptv_panels WHERE id = ?
            `, [iptv_panel_id]);

            if (panels.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'IPTV panel not found'
                });
            }

            updates.push('iptv_panel_id = ?');
            values.push(iptv_panel_id);
        }
        if (playlist_id !== undefined) {
            // Check for duplicate playlist_id
            const duplicate = await db.query(`
                SELECT id FROM iptv_editor_playlists
                WHERE playlist_id = ? AND id != ?
            `, [playlist_id, id]);

            if (duplicate.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'A playlist with this playlist_id already exists'
                });
            }

            updates.push('playlist_id = ?');
            values.push(playlist_id);
        }
        if (playlist_url !== undefined) {
            updates.push('playlist_url = ?');
            values.push(playlist_url);
        }
        if (bearer_token !== undefined) {
            updates.push('bearer_token = ?');
            values.push(bearer_token);
        }
        if (max_users !== undefined) {
            updates.push('max_users = ?');
            values.push(max_users);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await db.query(`
            UPDATE iptv_editor_playlists
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'IPTV Editor playlist updated successfully'
        });

    } catch (error) {
        console.error('Error updating IPTV Editor playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update IPTV Editor playlist',
            error: error.message
        });
    }
});

// DELETE /api/v2/iptv-playlists/:id - Delete IPTV Editor playlist
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if playlist has users linked to it
        const usersUsing = await db.query(`
            SELECT COUNT(*) as count
            FROM iptv_editor_users
            WHERE iptv_editor_playlist_id = ?
        `, [id]);

        if (usersUsing[0].count > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete playlist: ${usersUsing[0].count} user(s) are linked to it`,
                users_count: usersUsing[0].count
            });
        }

        // Delete playlist
        const result = await db.query(`
            DELETE FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        res.json({
            success: true,
            message: 'IPTV Editor playlist deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting IPTV Editor playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete IPTV Editor playlist',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-playlists/:id/test-connection - Test playlist connection
router.post('/:id/test-connection', async (req, res) => {
    try {
        const { id } = req.params;

        // Get playlist details
        const playlists = await db.query(`
            SELECT * FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        // This will use IPTVEditorService to test connection
        // For now, return success - actual implementation pending
        res.json({
            success: true,
            message: 'Connection test initiated',
            note: 'Implementation pending - will use IPTVEditorService'
        });

    } catch (error) {
        console.error('Error testing playlist connection:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test playlist connection',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-playlists/:id/sync - Sync playlist user count from IPTV Editor
router.post('/:id/sync', async (req, res) => {
    try {
        const { id } = req.params;

        // Get playlist details
        const playlists = await db.query(`
            SELECT * FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        // This will use IPTVEditorService to sync user count
        // For now, return success - actual implementation pending
        res.json({
            success: true,
            message: 'Playlist sync initiated',
            note: 'Implementation pending - will use IPTVEditorService to fetch current user count'
        });

    } catch (error) {
        console.error('Error syncing playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync playlist',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-playlists/:id/force-sync-user - Force sync specific user to provider
router.post('/:id/force-sync-user', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required'
            });
        }

        // Get playlist details
        const playlists = await db.query(`
            SELECT * FROM iptv_editor_playlists WHERE id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }

        const playlist = playlists[0];

        // Check if user is in this playlist
        const editorUsers = await db.query(`
            SELECT * FROM iptv_editor_users
            WHERE iptv_editor_playlist_id = ? AND user_id = ?
        `, [id, user_id]);

        if (editorUsers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found in this playlist'
            });
        }

        const editorUser = editorUsers[0];

        // Get bearer token
        const tokenRows = await db.query(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'bearer_token'
        `);

        if (tokenRows.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured'
            });
        }

        const bearerToken = tokenRows[0].setting_value;

        // Create IPTV Editor service
        const IPTVEditorService = require('../services/iptv-editor-service');
        const editorService = new IPTVEditorService(
            'https://editor.iptveditor.com',
            bearerToken,
            id
        );

        console.log(`🔄 Force syncing IPTV Editor user ${editorUser.iptv_editor_id} (${editorUser.iptv_editor_username})`);

        // Get provider URL from playlist
        const providerUrl = playlist.provider_base_url || null;
        if (!providerUrl) {
            return res.status(400).json({
                success: false,
                message: 'IPTV Editor playlist does not have a provider URL configured'
            });
        }

        console.log(`📡 IPTV Editor playlist provider: ${providerUrl}`);

        // Step 1: Fetch full user data from IPTV Editor (get-data endpoint)
        // Try by username first, if not available try by ID
        let fullEditorUser = null;

        if (editorUser.iptv_editor_username) {
            console.log(`📡 Fetching full user data from IPTV Editor for username: ${editorUser.iptv_editor_username}`);
            fullEditorUser = await editorService.findUserByUsername(editorUser.iptv_editor_username, id);
        }

        // If username lookup failed or username was null, try to find by ID using the new method
        if (!fullEditorUser && editorUser.iptv_editor_id) {
            console.log(`📡 Username lookup failed, trying to find user by IPTV Editor ID: ${editorUser.iptv_editor_id}`);
            try {
                fullEditorUser = await editorService.findUserById(editorUser.iptv_editor_id, id);

                // Also update the local database with the missing credentials if found
                if (fullEditorUser) {
                    // Use username and password fields from IPTV Editor API
                    const editorUsername = fullEditorUser.username;
                    const editorPassword = fullEditorUser.password;

                    await db.query(`
                        UPDATE iptv_editor_users
                        SET iptv_editor_username = ?, iptv_editor_password = ?,
                            expiry_date = ?, updated_at = datetime('now')
                        WHERE id = ?
                    `, [editorUsername, editorPassword, fullEditorUser.expiry || null, editorUser.id]);
                    console.log(`✅ Updated missing credentials in database for IPTV Editor user ${editorUser.iptv_editor_id}`);
                }
            } catch (fetchError) {
                console.error(`❌ Failed to fetch user by ID:`, fetchError.message);
            }
        }

        if (!fullEditorUser) {
            return res.status(404).json({
                success: false,
                message: 'Could not find user in IPTV Editor. The user may have been deleted from IPTV Editor.'
            });
        }

        console.log(`✅ Found full IPTV Editor user data:`, JSON.stringify(fullEditorUser, null, 2));

        // NOTE: We don't update expiry_date here because this is the OLD data before sync.
        // The expiry_date is updated AFTER forceSync completes (see below) with the fresh data.

        // Step 2: Extract panel credentials from the patterns array
        // The patterns array contains the actual xtream panel credentials (different from IPTV Editor credentials)
        let panelUsername = fullEditorUser.username;
        let panelPassword = fullEditorUser.password;

        if (fullEditorUser.patterns && fullEditorUser.patterns.length > 0) {
            const xtreamPattern = fullEditorUser.patterns.find(p => p.type === 'xtream');
            if (xtreamPattern) {
                panelUsername = xtreamPattern.param1;
                panelPassword = xtreamPattern.param2;
                console.log(`📋 Using panel credentials from patterns: ${panelUsername}/***`);
            }
        }

        // Step 3: Fetch current panel state from provider (player_api.php)
        // This gets the user_info and server_info needed for the locale field
        // IMPORTANT: Use the PANEL credentials, not IPTV Editor credentials
        console.log(`📡 Fetching panel state from ${providerUrl} for panel user ${panelUsername}`);

        let locale = null;

        try {
            // Clean provider URL (remove trailing slash)
            const cleanProviderUrl = providerUrl.replace(/\/$/, '');
            const playerApiUrl = `${cleanProviderUrl}/player_api.php?username=${encodeURIComponent(panelUsername)}&password=${encodeURIComponent(panelPassword)}`;

            console.log(`📡 Calling player_api: ${cleanProviderUrl}/player_api.php?username=${panelUsername}&password=***`);

            const panelResponse = await axios.get(playerApiUrl, {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (panelResponse.data && panelResponse.data.user_info) {
                locale = {
                    user_info: panelResponse.data.user_info,
                    server_info: panelResponse.data.server_info || {}
                };
                console.log(`✅ Got panel state - Status: ${locale.user_info.status}, Expiry: ${locale.user_info.exp_date}`);
            } else {
                console.log(`⚠️ Panel API response missing user_info, continuing without locale`);
            }
        } catch (panelError) {
            console.log(`⚠️ Could not fetch panel state: ${panelError.message}`);
            console.log(`⚠️ Continuing force sync without locale data (this may still work)`);
        }

        // Step 4: Build sync payload and call force sync
        // Pass the panel credentials separately so they can be used in the xtream section
        const syncPayload = {
            fullEditorUser,
            locale,
            providerUrl,
            playlistId: playlist.playlist_id,  // The actual IPTV Editor playlist ID
            panelUsername,  // The xtream panel credentials (may differ from IPTV Editor username)
            panelPassword
        };

        console.log(`📤 Calling forceSync with payload...`);

        // Perform force sync with full payload
        const syncResponse = await editorService.forceSync(syncPayload);

        if (syncResponse && (syncResponse.updated !== undefined || syncResponse.expiry)) {
            console.log(`✅ Force sync successful for user ${editorUser.iptv_editor_username}`);
            console.log(`📊 Sync result: expiry=${syncResponse.expiry}, updated=${syncResponse.updated}`);

            // Update last_sync_time AND expiry_date in database from sync response
            await db.query(`
                UPDATE iptv_editor_users
                SET last_sync_time = datetime('now'),
                    sync_status = 'synced',
                    expiry_date = ?
                WHERE id = ?
            `, [syncResponse.expiry || null, editorUser.id]);
            console.log(`✅ Updated expiry_date in database after sync: ${syncResponse.expiry}`);

            res.json({
                success: true,
                message: 'Force sync completed successfully',
                data: {
                    expiry: syncResponse.expiry,
                    updated: syncResponse.updated,
                    max_connections: syncResponse.max_connections,
                    time_shift: syncResponse.time_shift
                }
            });
        } else {
            throw new Error('Force sync response missing expected data');
        }

    } catch (error) {
        console.error('Error force syncing user:', error);

        // Check if this is a panel credentials issue (404 means user doesn't exist on panel)
        if (error.message && error.message.includes('Could not fetch panel state') && error.message.includes('404')) {
            return res.status(400).json({
                success: false,
                message: 'Panel credentials are invalid or user does not exist on the IPTV panel. Force sync requires valid panel credentials.'
            });
        }

        // Check if this is an external API error
        let errorMessage = 'Failed to force sync user';
        if (error.message && error.message.includes('IPTV Editor API Error: 500')) {
            errorMessage = 'IPTV Editor service is currently unavailable. Please try again later or contact IPTV Editor support if the issue persists.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message
        });
    }
});

// POST /api/v2/iptv-playlists/search - Search for user across all playlists
router.post('/search', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'username is required'
            });
        }

        // Get all active playlists
        const playlists = await db.query(`
            SELECT
                p.id,
                p.name,
                p.playlist_id,
                p.bearer_token,
                panel.name as panel_name
            FROM iptv_editor_playlists p
            LEFT JOIN iptv_panels panel ON p.iptv_panel_id = panel.id
            WHERE p.is_active = TRUE
            ORDER BY p.name
        `);

        // This will use IPTVEditorService to search each playlist
        // For now, return structure - actual search implementation pending
        const results = [];
        const searched_playlists = playlists.map(playlist => ({
            id: playlist.id,
            name: playlist.name,
            panel_name: playlist.panel_name,
            found: false,
            status: 'not_checked'
        }));

        res.json({
            success: true,
            username,
            found: false,
            results,
            searched_playlists,
            note: 'Search implementation pending - will use IPTVEditorService to search each playlist'
        });

    } catch (error) {
        console.error('Error searching IPTV Editor playlists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search IPTV Editor playlists',
            error: error.message
        });
    }
});

module.exports = router;
