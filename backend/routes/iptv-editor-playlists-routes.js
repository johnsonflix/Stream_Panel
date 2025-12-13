/**
 * IPTV Editor Playlists API Routes
 *
 * Manage IPTV Editor playlist configurations and links to IPTV panels
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');

// GET /api/v2/iptv-editor/playlists - Get all playlists
// Note: Playlists no longer link to panels (relationship reversed)
// Use iptv_panels.iptv_editor_playlist_id to find panels linked to a playlist
// TEST ENDPOINT - direct update of guide credentials
router.post('/:id/test-guide-save', async (req, res) => {
    try {
        const { id } = req.params;
        const { guide_username, guide_password } = req.body;

        console.log('TEST SAVE - Received:', { id, guide_username, guide_password });

        // Direct update
        const result = await db.query(
            'UPDATE iptv_editor_playlists SET guide_username = ?, guide_password = ? WHERE id = ?',
            [guide_username, guide_password, id]
        );

        console.log('TEST SAVE - Update result:', result);

        // Read back
        const playlist = await db.query(
            'SELECT id, name, guide_username, guide_password FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        console.log('TEST SAVE - After update:', playlist[0]);

        res.json({
            success: true,
            received: { guide_username, guide_password },
            updateResult: result,
            afterUpdate: playlist[0]
        });
    } catch (error) {
        console.error('TEST SAVE ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const playlists = await db.query(`
            SELECT iep.*
            FROM iptv_editor_playlists iep
            ORDER BY iep.created_at DESC
        `);

        // Debug: Log guide credentials being returned
        playlists.forEach(p => {
            console.log(`📋 Playlist ${p.id} (${p.name}): guide_username=${p.guide_username || '(empty)'}, guide_password=${p.guide_password ? '***' : '(empty)'}`);
        });

        res.json({
            success: true,
            playlists,
            count: playlists.length
        });

    } catch (error) {
        console.error('Error fetching IPTV Editor playlists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch playlists',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-editor/playlists/queue-status - Get auto-updater queue status
// IMPORTANT: This must come BEFORE /:id route to avoid matching 'queue-status' as an ID
router.get('/queue-status', async (req, res) => {
    try {
        const autoUpdaterQueue = require('../services/auto-updater-queue');
        const status = autoUpdaterQueue.getStatus();

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue status',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-editor/playlists/:id - Get single playlist
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const playlists = await db.query(`
            SELECT iep.*
            FROM iptv_editor_playlists iep
            WHERE iep.id = ?
        `, [id]);

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        res.json({
            success: true,
            playlist: playlists[0]
        });

    } catch (error) {
        console.error('Error fetching playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch playlist',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-editor/playlists - Create new playlist
router.post('/', async (req, res) => {
    try {
        const {
            name,
            playlist_id,
            bearer_token,
            iptv_panel_id,
            max_users,
            is_active
        } = req.body;

        // Validate required fields
        if (!name || !playlist_id || !bearer_token || !iptv_panel_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, playlist_id, bearer_token, iptv_panel_id'
            });
        }

        // Check if playlist_id already exists
        const existing = await db.query(
            'SELECT id FROM iptv_editor_playlists WHERE playlist_id = ?',
            [playlist_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A playlist with this ID already exists'
            });
        }

        // Check if panel exists
        const panel = await db.query(
            'SELECT id FROM iptv_panels WHERE id = ?',
            [iptv_panel_id]
        );

        if (panel.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'IPTV Panel not found'
            });
        }

        // Insert playlist
        const result = await db.query(`
            INSERT INTO iptv_editor_playlists (
                name,
                playlist_id,
                iptv_panel_id,
                bearer_token,
                max_users,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            name,
            playlist_id,
            iptv_panel_id,
            bearer_token,
            max_users || null,
            is_active !== false ? 1 : 0
        ]);

        res.json({
            success: true,
            message: 'Playlist created successfully',
            id: result.lastID
        });

    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create playlist',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-editor/playlists/:id - Update playlist
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            bearer_token,
            iptv_panel_id,
            max_users,
            is_active
        } = req.body;

        // Check if playlist exists
        const existing = await db.query(
            'SELECT id FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Check if panel exists
        if (iptv_panel_id) {
            const panel = await db.query(
                'SELECT id FROM iptv_panels WHERE id = ?',
                [iptv_panel_id]
            );

            if (panel.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'IPTV Panel not found'
                });
            }
        }

        // Build update query
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (bearer_token !== undefined) {
            updates.push('bearer_token = ?');
            values.push(bearer_token);
        }
        if (iptv_panel_id !== undefined) {
            updates.push('iptv_panel_id = ?');
            values.push(iptv_panel_id);
        }
        if (max_users !== undefined) {
            updates.push('max_users = ?');
            values.push(max_users || null);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(id);

        await db.query(`
            UPDATE iptv_editor_playlists
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Playlist updated successfully'
        });

    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update playlist',
            error: error.message
        });
    }
});

// DELETE /api/v2/iptv-editor/playlists/:id - Delete playlist
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if playlist exists
        const existing = await db.query(
            'SELECT id, name FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Check if any users are linked to this playlist
        const users = await db.query(
            'SELECT COUNT(*) as count FROM iptv_editor_users WHERE iptv_editor_playlist_id = ?',
            [id]
        );

        if (users[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete playlist: ${users[0].count} user(s) are linked to this playlist. Please remove them first.`
            });
        }

        // Delete playlist
        await db.query('DELETE FROM iptv_editor_playlists WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Playlist deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete playlist',
            error: error.message
        });
    }
});

// PATCH /api/v2/iptv-editor/playlists/:id/settings - Update playlist settings
router.patch('/:id/settings', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            provider_base_url,
            provider_username,
            provider_password,
            auto_updater_enabled,
            auto_updater_schedule_hours,
            guide_m3u_url,
            guide_username,
            guide_password
        } = req.body;

        console.log(`📝 Updating settings for playlist ID: ${id}`);
        console.log(`   Request body:`, JSON.stringify(req.body, null, 2));

        // Check if playlist exists
        const existing = await db.query(
            'SELECT id FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (provider_base_url !== undefined) {
            updates.push('provider_base_url = ?');
            values.push(provider_base_url);
        }

        if (provider_username !== undefined) {
            updates.push('provider_username = ?');
            values.push(provider_username);
        }

        if (provider_password !== undefined) {
            updates.push('provider_password = ?');
            values.push(provider_password);
        }

        if (auto_updater_enabled !== undefined) {
            updates.push('auto_updater_enabled = ?');
            values.push(auto_updater_enabled ? 1 : 0);
        }

        if (auto_updater_schedule_hours !== undefined) {
            updates.push('auto_updater_schedule_hours = ?');
            values.push(parseInt(auto_updater_schedule_hours));
        }

        if (guide_m3u_url !== undefined) {
            updates.push('guide_m3u_url = ?');
            values.push(guide_m3u_url || null);
        }

        // Explicitly check req.body for guide credentials
        if (req.body.guide_username !== undefined) {
            updates.push('guide_username = ?');
            values.push(req.body.guide_username || null);
            console.log(`   Adding guide_username: ${req.body.guide_username}`);
        }

        if (req.body.guide_password !== undefined) {
            updates.push('guide_password = ?');
            values.push(req.body.guide_password || null);
            console.log(`   Adding guide_password: ${req.body.guide_password ? '***' : 'null'}`);
        }

        // Always update the updated_at timestamp
        updates.push('updated_at = datetime(\'now\')');

        if (updates.length === 1) { // Only updated_at
            return res.status(400).json({
                success: false,
                message: 'No settings provided to update'
            });
        }

        values.push(id);

        const query = `UPDATE iptv_editor_playlists SET ${updates.join(', ')} WHERE id = ?`;
        console.log(`   SQL Query: ${query}`);
        console.log(`   Values:`, values);

        await db.query(query, values);

        console.log(`✅ Updated settings for playlist ID: ${id}`);

        // Return updated playlist
        const updated = await db.query(
            'SELECT * FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Playlist settings updated successfully',
            playlist: updated[0],
            debug: {
                receivedBody: req.body,
                updatesArray: updates,
                valuesArray: values.map((v, i) => i === values.length - 1 ? v : (typeof v === 'string' && v.length > 20 ? v.substring(0, 20) + '...' : v))
            }
        });

    } catch (error) {
        console.error('Error updating playlist settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update playlist settings',
            error: error.message
        });
    }
});

// OBSOLETE ENDPOINT - Relationship direction reversed
// Playlists no longer link to panels; panels link to playlists
// Use PUT /api/v2/iptv-panels/:id/playlist-link instead
//
// PATCH /api/v2/iptv-editor/playlists/:id/link-panel - Link playlist to IPTV panel
// router.patch('/:id/link-panel', async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { iptv_panel_id } = req.body;
//
//         console.log(`🔗 Linking playlist ID: ${id} to panel ID: ${iptv_panel_id}`);
//
//         // Check if playlist exists
//         const playlists = await db.query(
//             'SELECT id, name FROM iptv_editor_playlists WHERE id = ?',
//             [id]
//         );
//
//         if (playlists.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Playlist not found'
//             });
//         }
//
//         // If linking to a panel, verify the panel exists
//         if (iptv_panel_id !== null && iptv_panel_id !== undefined) {
//             const panels = await db.query(
//                 'SELECT id, name FROM iptv_panels WHERE id = ?',
//                 [iptv_panel_id]
//             );
//
//             if (panels.length === 0) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'IPTV panel not found'
//                 });
//             }
//
//             console.log(`✅ Linking "${playlists[0].name}" to panel "${panels[0].name}"`);
//         } else {
//             console.log(`🔓 Unlinking "${playlists[0].name}" from any panel`);
//         }
//
//         // Update the link
//         await db.query(
//             'UPDATE iptv_editor_playlists SET iptv_panel_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
//             [iptv_panel_id || null, id]
//         );
//
//         res.json({
//             success: true,
//             message: iptv_panel_id ? 'Playlist linked to panel successfully' : 'Playlist unlinked from panel',
//             playlist_id: id,
//             iptv_panel_id: iptv_panel_id || null
//         });
//
//     } catch (error) {
//         console.error('Error linking playlist to panel:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to link playlist to panel',
//             error: error.message
//         });
//     }
// });

// POST /api/v2/iptv-editor/playlists/:id/run-auto-updater - Run auto-updater for specific playlist
router.post('/:id/run-auto-updater', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🚀 Auto-updater requested for playlist ID: ${id}`);

        // Check if playlist exists
        const playlists = await db.query(
            'SELECT * FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        const playlist = playlists[0];

        // Validate required settings
        if (!playlist.provider_base_url || !playlist.provider_username || !playlist.provider_password) {
            return res.status(400).json({
                success: false,
                message: 'Playlist must have provider settings configured before running auto-updater'
            });
        }

        // Check if this playlist is already in queue or running
        const autoUpdaterQueue = require('../services/auto-updater-queue');
        if (autoUpdaterQueue.isPlaylistQueued(parseInt(id))) {
            const position = autoUpdaterQueue.getPlaylistPosition(parseInt(id));
            const status = position === 0 ? 'currently running' : `queued (position ${position})`;

            return res.status(409).json({
                success: false,
                message: `Auto-updater for "${playlist.name}" is ${status}. Please wait for it to complete.`,
                position
            });
        }

        // Set status to queued
        await db.query(
            'UPDATE iptv_editor_playlists SET auto_updater_status = ? WHERE id = ?',
            ['queued', id]
        );

        // Respond immediately that the job has been queued
        res.json({
            success: true,
            message: 'Auto-updater has been queued and will start shortly',
            playlist_id: id,
            playlist_name: playlist.name,
            queued: true
        });

        // Add to queue (runs asynchronously after response sent)
        const IPTVEditorService = require('../services/iptv-editor-service');

        // Create the async job function
        const runJob = async () => {
            try {
                // Set status to running when job starts
                await db.query(
                    'UPDATE iptv_editor_playlists SET auto_updater_status = ? WHERE id = ?',
                    ['running', id]
                );

                // Create service instance and initialize with bearer token
                const iptvEditorService = new IPTVEditorService();
                await iptvEditorService.initialize();

                // Run the auto-updater
                const result = await iptvEditorService.runPlaylistAutoUpdater(playlist);

                // Reset status to idle and update timestamp
                await db.query(
                    `UPDATE iptv_editor_playlists
                     SET auto_updater_status = ?,
                         last_auto_updater_run = datetime('now')
                     WHERE id = ?`,
                    ['idle', id]
                );

                // Schedule guide cache refresh 5 minutes after auto-updater completes
                // Only if guide credentials are configured
                if (playlist.guide_username && playlist.guide_password) {
                    const { schedulePlaylistGuideRefresh } = require('../jobs/guide-cache-refresh-scheduler');
                    schedulePlaylistGuideRefresh(parseInt(id), 5); // 5 minutes delay
                    console.log(`📅 Scheduled guide cache refresh for playlist ${id} in 5 minutes`);
                }

                return result;

            } catch (error) {
                // Reset status to idle on error
                await db.query(
                    'UPDATE iptv_editor_playlists SET auto_updater_status = ? WHERE id = ?',
                    ['idle', id]
                );
                throw error;
            }
        };

        // Add to queue
        autoUpdaterQueue.add(parseInt(id), playlist.name, runJob).catch(error => {
            console.error(`❌ Queued auto-updater failed for ${playlist.name}:`, error);
        });

    } catch (error) {
        console.error('Error queueing auto-updater:', error);

        // Reset status to idle on error
        try {
            await db.query(
                'UPDATE iptv_editor_playlists SET auto_updater_status = ? WHERE id = ?',
                ['idle', req.params.id]
            );
        } catch (resetError) {
            console.error('Error resetting auto-updater status:', resetError);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to queue auto-updater: ' + error.message,
            error: error.message
        });
    }
});

// POST /api/v2/iptv-editor/playlists/:id/refresh-guide-cache - Refresh guide cache for specific playlist
router.post('/:id/refresh-guide-cache', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📺 Manual guide cache refresh requested for playlist ${id}`);

        // Check if playlist exists
        const playlists = await db.query(
            'SELECT id, name, guide_username, guide_password FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        const playlist = playlists[0];

        // Check if guide credentials are configured
        if (!playlist.guide_username || !playlist.guide_password) {
            return res.status(400).json({
                success: false,
                message: 'Playlist must have guide credentials configured before refreshing guide cache'
            });
        }

        const { refreshPlaylistGuide } = require('../jobs/guide-cache-refresh-scheduler');
        const result = await refreshPlaylistGuide(parseInt(id));

        if (result.success) {
            res.json({
                success: true,
                message: `Guide cache refreshed for ${playlist.name}`,
                playlist_name: playlist.name,
                categories: result.categories,
                channels: result.channels,
                epgPrograms: result.epgPrograms
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to refresh guide cache for ${playlist.name}`,
                error: result.error
            });
        }

    } catch (error) {
        console.error('Error refreshing playlist guide cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh guide cache',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-editor/playlists/:id/guide-cache-status - Get guide cache status for specific playlist
router.get('/:id/guide-cache-status', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if playlist exists
        const playlists = await db.query(
            'SELECT id, name FROM iptv_editor_playlists WHERE id = ?',
            [id]
        );

        if (playlists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Get cache status for this playlist
        const cache = await db.query(`
            SELECT
                total_categories,
                total_channels,
                epg_channel_count,
                epg_program_count,
                last_updated,
                epg_last_updated,
                last_error
            FROM guide_cache
            WHERE source_type = 'playlist' AND source_id = ?
        `, [id]);

        if (cache.length === 0) {
            return res.json({
                success: true,
                has_cache: false,
                playlist_name: playlists[0].name,
                message: 'No guide cache found for this playlist. Run a guide refresh to populate the cache.'
            });
        }

        res.json({
            success: true,
            has_cache: true,
            playlist_name: playlists[0].name,
            cache_status: {
                categories: cache[0].total_categories,
                channels: cache[0].total_channels,
                epg_channels: cache[0].epg_channel_count,
                epg_programs: cache[0].epg_program_count,
                last_updated: cache[0].last_updated,
                epg_last_updated: cache[0].epg_last_updated,
                last_error: cache[0].last_error
            }
        });

    } catch (error) {
        console.error('Error getting playlist guide cache status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get guide cache status',
            error: error.message
        });
    }
});

module.exports = router;
