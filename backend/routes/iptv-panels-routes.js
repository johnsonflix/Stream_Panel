/**
 * IPTV Panels API Routes
 *
 * CRUD operations for IPTV panels and panel-related functionality
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');
const { clearAllCaches } = require('../utils/dashboard-cache');

// GET /api/v2/iptv-panels - Get all IPTV panels
router.get('/', async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';

        let sql = `
            SELECT
                p.id,
                p.name,
                p.panel_type,
                p.base_url,
                p.provider_base_url,
                p.credit_cost_per_connection,
                p.credit_cost_per_month,
                p.current_credit_balance,
                p.is_active,
                p.last_sync,
                p.health_status,
                p.panel_settings,
                p.notes,
                p.created_at,
                p.updated_at,
                p.iptv_editor_playlist_id as linked_playlist_id,
                ep.name as linked_playlist_name
            FROM iptv_panels p
            LEFT JOIN iptv_editor_playlists ep ON p.iptv_editor_playlist_id = ep.id AND ep.is_active = TRUE
        `;

        if (!includeInactive) {
            sql += ' WHERE p.is_active = TRUE';
        }

        sql += ' ORDER BY p.name';

        const panels = await db.query(sql);

        res.json({
            success: true,
            panels,
            count: panels.length
        });

    } catch (error) {
        console.error('Error fetching IPTV panels:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV panels',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-panels/:id - Get single IPTV panel
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const panels = await db.query(`
            SELECT
                p.id, p.name, p.panel_type, p.base_url, p.login_url, p.provider_base_url,
                p.credentials, p.panel_settings, p.credit_cost_per_connection,
                p.credit_cost_per_month, p.current_credit_balance, p.auth_token,
                p.auth_expires, p.session_data, p.is_active, p.last_sync,
                p.health_status, p.created_at, p.updated_at, p.last_health_check,
                p.m3u_url, p.m3u_last_sync, p.m3u_channel_count, p.m3u_movie_count,
                p.m3u_series_count, p.notes,
                p.user_count, p.active_user_count, p.live_connection_count, p.last_stats_update,
                p.iptv_editor_playlist_id,
                p.iptv_editor_playlist_id as linked_playlist_id,
                ep.name as linked_playlist_name
            FROM iptv_panels p
            LEFT JOIN iptv_editor_playlists ep ON p.iptv_editor_playlist_id = ep.id AND ep.is_active = TRUE
            WHERE p.id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        const panel = panels[0];

        // Parse JSON fields
        panel.credentials = JSON.parse(panel.credentials);
        panel.panel_settings = panel.panel_settings ? JSON.parse(panel.panel_settings) : {};
        panel.session_data = panel.session_data ? JSON.parse(panel.session_data) : {};

        // user_count, active_user_count, and live_connection_count are now read directly from the database
        // These values are cached and updated when getDashboardStatistics() is called

        res.json({
            success: true,
            panel
        });

    } catch (error) {
        console.error('Error fetching IPTV panel:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch IPTV panel',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-panels/:id/editor-link - Check if panel has linked IPTV Editor playlist
router.get('/:id/editor-link', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if panel exists
        const panels = await db.query(`
            SELECT id, name FROM iptv_panels WHERE id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Check for linked playlist
        const playlists = await db.query(`
            SELECT
                id,
                name as playlist_name,
                current_user_count,
                max_users
            FROM iptv_editor_playlists
            WHERE iptv_panel_id = ? AND is_active = TRUE
        `, [id]);

        // Get global setting for default create behavior
        const settingRows = await db.query(`
            SELECT setting_value
            FROM settings
            WHERE setting_key = 'iptv_editor_create_by_default'
        `);

        const defaultCreateOnEditor = settingRows.length > 0 ?
            settingRows[0].setting_value === 'true' : false;

        // Check if any playlists exist in system (for messaging)
        const allPlaylists = await db.query(`
            SELECT COUNT(*) as count
            FROM iptv_editor_playlists
            WHERE is_active = TRUE
        `);

        const has_playlists_in_system = allPlaylists[0].count > 0;

        if (playlists.length > 0) {
            const playlist = playlists[0];
            const available = playlist.max_users ? playlist.max_users - playlist.current_user_count : 999999;

            return res.json({
                success: true,
                has_linked_playlist: true,
                playlist_id: playlist.id,
                playlist_name: playlist.playlist_name,
                playlist_capacity: {
                    current: playlist.current_user_count,
                    max: playlist.max_users,
                    available
                },
                default_create_on_editor: defaultCreateOnEditor,
                message: 'Panel is linked to IPTV Editor'
            });
        }

        // No linked playlist
        res.json({
            success: true,
            has_linked_playlist: false,
            playlist_id: null,
            playlist_name: null,
            default_create_on_editor: false,
            has_playlists_in_system,
            message: has_playlists_in_system ?
                'Panel has no linked IPTV Editor playlist' :
                'No IPTV Editor playlists configured'
        });

    } catch (error) {
        console.error('Error checking editor link:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check editor link',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-panels/:id/packages - Get packages for a specific panel
router.get('/:id/packages', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if panel exists
        const panels = await db.query(`
            SELECT id, name FROM iptv_panels WHERE id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Get packages for this panel
        const packages = await db.query(`
            SELECT
                id,
                iptv_panel_id,
                package_id,
                name,
                connections,
                duration_months,
                credits,
                package_type
            FROM iptv_packages
            WHERE iptv_panel_id = ?
            ORDER BY package_type, name
        `, [id]);

        // Generate billing_interval from duration_months for each package
        const packagesWithBillingInterval = packages.map(pkg => {
            let billingInterval = '';
            if (pkg.duration_months === 1) {
                billingInterval = '1 Month';
            } else if (pkg.duration_months > 0) {
                billingInterval = `${pkg.duration_months} Months`;
            } else {
                billingInterval = 'Custom'; // For trial or special packages
            }

            return {
                ...pkg,
                billing_interval: billingInterval
            };
        });

        res.json({
            success: true,
            packages: packagesWithBillingInterval,
            count: packagesWithBillingInterval.length
        });

    } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch packages',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-panels/:id/bouquets - Get bouquets for a specific panel from database
router.get('/:id/bouquets', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if panel exists
        const panels = await db.query(`
            SELECT id, name FROM iptv_panels WHERE id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Get bouquets for this panel from database
        const bouquets = await db.query(`
            SELECT
                id,
                iptv_panel_id,
                bouquet_id,
                name,
                custom_name,
                category,
                synced_at
            FROM iptv_bouquets
            WHERE iptv_panel_id = ?
            ORDER BY category, COALESCE(custom_name, name)
        `, [id]);

        res.json({
            success: true,
            bouquets: bouquets.map(b => ({
                id: b.bouquet_id,
                name: b.name,
                custom_name: b.custom_name,
                display_name: b.custom_name || b.name,
                category: b.category
            })),
            count: bouquets.length
        });

    } catch (error) {
        console.error('Error fetching bouquets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bouquets',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-panels/:id/bouquets/:bouquetId/custom-name - Update bouquet custom name
router.put('/:id/bouquets/:bouquetId/custom-name', async (req, res) => {
    try {
        const { id, bouquetId } = req.params;
        const { custom_name } = req.body;

        // Check if panel exists
        const panels = await db.query('SELECT id FROM iptv_panels WHERE id = ?', [id]);
        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Check if bouquet exists
        const bouquets = await db.query(
            'SELECT id FROM iptv_bouquets WHERE iptv_panel_id = ? AND bouquet_id = ?',
            [id, bouquetId]
        );

        if (bouquets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Bouquet not found'
            });
        }

        // Update custom name (null to clear it)
        await db.query(`
            UPDATE iptv_bouquets
            SET custom_name = ?
            WHERE iptv_panel_id = ? AND bouquet_id = ?
        `, [custom_name || null, id, bouquetId]);

        res.json({
            success: true,
            message: 'Custom name updated',
            bouquet_id: bouquetId,
            custom_name: custom_name || null
        });

    } catch (error) {
        console.error('Error updating bouquet custom name:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update bouquet custom name',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels - Create new IPTV panel
router.post('/', async (req, res) => {
    try {
        const {
            name,
            panel_type,
            base_url,
            login_url,
            provider_base_url,
            credentials,
            panel_settings,
            credit_cost_per_connection,
            credit_cost_per_month,
            notes
        } = req.body;

        // Validation
        if (!name || !panel_type || !base_url || !provider_base_url || !credentials) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, panel_type, base_url, provider_base_url, credentials'
            });
        }

        // Validate panel_type
        const validTypes = ['nxt_dash', 'xui_one', 'one_stream', 'xtream_ui', 'midnight_streamer'];
        if (!validTypes.includes(panel_type)) {
            return res.status(400).json({
                success: false,
                message: `Invalid panel_type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        // Insert panel
        const result = await db.query(`
            INSERT INTO iptv_panels
            (name, panel_type, base_url, login_url, provider_base_url, credentials, panel_settings,
             credit_cost_per_connection, credit_cost_per_month, notes, is_active, health_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'online')
        `, [
            name,
            panel_type,
            base_url,
            login_url || base_url,
            provider_base_url,
            JSON.stringify(credentials),
            panel_settings ? JSON.stringify(panel_settings) : null,
            credit_cost_per_connection,
            credit_cost_per_month,
            notes || null
        ]);

        res.status(201).json({
            success: true,
            message: 'IPTV panel created successfully',
            panel_id: result.insertId
        });

    } catch (error) {
        console.error('Error creating IPTV panel:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV panel',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-panels/:id - Update IPTV panel
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            panel_type,
            base_url,
            login_url,
            provider_base_url,
            credentials,
            panel_settings,
            credit_cost_per_connection,
            credit_cost_per_month,
            is_active,
            notes
        } = req.body;

        // Check if panel exists
        const existing = await db.query(`
            SELECT id FROM iptv_panels WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (panel_type !== undefined) {
            const validTypes = ['nxt_dash', 'xui_one', 'one_stream', 'xtream_ui', 'midnight_streamer'];
            if (!validTypes.includes(panel_type)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid panel_type. Must be one of: ${validTypes.join(', ')}`
                });
            }
            updates.push('panel_type = ?');
            values.push(panel_type);
        }
        if (base_url !== undefined) {
            updates.push('base_url = ?');
            values.push(base_url);
        }
        if (login_url !== undefined) {
            updates.push('login_url = ?');
            values.push(login_url);
        }
        if (provider_base_url !== undefined) {
            updates.push('provider_base_url = ?');
            values.push(provider_base_url);
        }
        if (credentials !== undefined) {
            updates.push('credentials = ?');
            values.push(JSON.stringify(credentials));
        }
        if (panel_settings !== undefined) {
            updates.push('panel_settings = ?');
            values.push(JSON.stringify(panel_settings));
        }
        if (credit_cost_per_connection !== undefined) {
            updates.push('credit_cost_per_connection = ?');
            values.push(credit_cost_per_connection);
        }
        if (credit_cost_per_month !== undefined) {
            updates.push('credit_cost_per_month = ?');
            values.push(credit_cost_per_month);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push("updated_at = datetime('now')");
        values.push(id);

        await db.query(`
            UPDATE iptv_panels
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'IPTV panel updated successfully'
        });

    } catch (error) {
        console.error('Error updating IPTV panel:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update IPTV panel',
            error: error.message
        });
    }
});

// DELETE /api/v2/iptv-panels/:id - Delete IPTV panel
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if panel is used by any users
        const usersUsing = await db.query(`
            SELECT COUNT(*) as count
            FROM users
            WHERE iptv_panel_id = ?
        `, [id]);

        if (usersUsing[0].count > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete panel: It is assigned to ${usersUsing[0].count} user(s)`,
                users_count: usersUsing[0].count
            });
        }

        // Delete panel (cascades to packages, bouquets, etc.)
        const result = await db.query(`
            DELETE FROM iptv_panels WHERE id = ?
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        res.json({
            success: true,
            message: 'IPTV panel deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting IPTV panel:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete IPTV panel',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/test-connection - Test connection with temporary credentials (don't save to DB)
router.post('/test-connection', async (req, res) => {
    try {
        const {
            panel_type,
            base_url,
            login_url,
            credentials
        } = req.body;

        // Validation
        if (!panel_type || !base_url || !credentials) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: panel_type, base_url, credentials'
            });
        }

        // Validate panel type
        const validTypes = ['nxt_dash', 'one_stream', 'xui_one', 'xtream_ui', 'midnight_streamer'];
        if (!validTypes.includes(panel_type)) {
            return res.status(400).json({
                success: false,
                message: `Invalid panel type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        // Create temporary panel config
        const tempConfig = {
            id: null,
            name: 'Test Connection',
            panel_type,
            base_url: base_url,
            login_url: login_url || base_url,
            provider_base_url: base_url,
            credentials: credentials,
            panel_settings: {}
        };

        // Dynamically load panel class based on type
        let panel;
        try {
            const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
            const manager = new IPTVServiceManager(db);
            panel = manager.createPanelInstance(tempConfig);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: `Panel type "${panel_type}" is not yet implemented or failed to load: ${error.message}`
            });
        }

        // Test connection
        const isOnline = await panel.testConnection();

        if (!isOnline) {
            return res.json({
                success: false,
                message: 'Connection failed - unable to reach panel'
            });
        }

        // Try to authenticate
        try {
            await panel.authenticate();

            res.json({
                success: true,
                message: 'Connection and authentication successful',
                panel_type,
                base_url
            });
        } catch (authError) {
            res.json({
                success: false,
                message: `Connection successful but authentication failed: ${authError.message}`,
                error: authError.message
            });
        }

    } catch (error) {
        console.error('Error testing connection:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test connection',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/test-connection - Test existing panel connection
router.post('/:id/test-connection', async (req, res) => {
    try {
        const { id } = req.params;

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        const result = await iptvManager.testPanelConnection(parseInt(id));

        // Update health_status in database
        await db.query(`
            UPDATE iptv_panels
            SET health_status = ?,
                last_health_check = datetime('now')
            WHERE id = ?
        `, [result.online ? 'online' : 'offline', id]);

        res.json({
            success: result.online,
            message: result.message,
            panel_name: result.panel_name,
            online: result.online
        });

    } catch (error) {
        console.error('Error testing connection:', error);

        // Update to error status
        try {
            await db.query(`
                UPDATE iptv_panels
                SET health_status = 'error',
                    last_health_check = datetime('now')
                WHERE id = ?
            `, [req.params.id]);
        } catch (dbError) {
            console.error('Failed to update error status:', dbError);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to test connection',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/fetch-packages - Fetch available packages from panel (for setup)
router.post('/:id/fetch-packages', async (req, res) => {
    try {
        const { id } = req.params;

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        const panel = iptvManager.getPanel(parseInt(id));
        const packages = await panel.fetchAvailablePackages();

        res.json({
            success: true,
            packages: packages,
            count: packages.length
        });

    } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch packages',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/fetch-bouquets - Fetch bouquets for selected package
router.post('/:id/fetch-bouquets', async (req, res) => {
    try {
        const { id } = req.params;
        const { package_id } = req.body;

        if (!package_id) {
            return res.status(400).json({
                success: false,
                message: 'package_id is required'
            });
        }

        // Update panel settings with selected package_id
        await db.query(`
            UPDATE iptv_panels
            SET panel_settings = json_set(COALESCE(panel_settings, '{}'), '$.selected_package_id', ?)
            WHERE id = ?
        `, [package_id, id]);

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        // Reload to get updated settings
        await iptvManager.reload();

        const bouquets = await iptvManager.syncPanelBouquets(parseInt(id));

        res.json({
            success: true,
            message: 'Bouquets synced successfully',
            bouquets: bouquets,
            count: bouquets.length
        });

    } catch (error) {
        console.error('Error fetching bouquets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bouquets',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/sync-packages - Sync packages from panel
router.post('/:id/sync-packages', async (req, res) => {
    try {
        const { id } = req.params;

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        const packages = await iptvManager.syncPanelPackages(parseInt(id));

        res.json({
            success: true,
            message: 'Packages synced successfully',
            packages: packages,
            count: packages.length
        });

    } catch (error) {
        console.error('Error syncing packages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync packages',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/sync-bouquets - Sync bouquets from panel
router.post('/:id/sync-bouquets', async (req, res) => {
    try {
        const { id } = req.params;

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        // Sync bouquets (this saves to DB with custom_name preserved)
        await iptvManager.syncPanelBouquets(parseInt(id));

        // Fetch bouquets from database (includes custom_name)
        const bouquetsFromDb = await db.query(`
            SELECT
                bouquet_id,
                name,
                custom_name,
                category,
                synced_at
            FROM iptv_bouquets
            WHERE iptv_panel_id = ?
            ORDER BY category, COALESCE(custom_name, name)
        `, [id]);

        // Format response with display_name
        const bouquets = bouquetsFromDb.map(b => ({
            id: b.bouquet_id,
            name: b.name,
            custom_name: b.custom_name,
            display_name: b.custom_name || b.name,
            category: b.category
        }));

        res.json({
            success: true,
            message: 'Bouquets synced successfully',
            bouquets: bouquets,
            count: bouquets.length
        });

    } catch (error) {
        console.error('Error syncing bouquets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync bouquets',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/search-user - Search for user by username across all IPTV panels
router.post('/search-user', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'username is required'
            });
        }

        console.log(`🔍 API: Searching for username "${username}" across all IPTV panels...`);

        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        const searchResult = await iptvManager.searchUserAcrossAllPanels(username);

        res.json({
            success: true,
            ...searchResult
        });

    } catch (error) {
        console.error('Error searching IPTV panels:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search IPTV panels',
            error: error.message
        });
    }
});

// PATCH /api/v2/iptv-panels/:id/settings - Update panel settings
router.patch('/:id/settings', async (req, res) => {
    try {
        const { id } = req.params;
        const { selected_package_id } = req.body;

        // Get current panel settings
        const panels = await db.query('SELECT panel_settings FROM iptv_panels WHERE id = ?', [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Panel not found'
            });
        }

        // Parse existing settings or create new object
        let panelSettings = {};
        if (panels[0].panel_settings) {
            try {
                panelSettings = JSON.parse(panels[0].panel_settings);
            } catch (error) {
                console.warn('Failed to parse existing panel_settings, creating new object');
            }
        }

        // Update selected_package_id
        panelSettings.selected_package_id = selected_package_id;

        // Save updated settings
        await db.query(
            'UPDATE iptv_panels SET panel_settings = ? WHERE id = ?',
            [JSON.stringify(panelSettings), id]
        );

        // Reload panel instance to pick up new settings
        const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
        const iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        res.json({
            success: true,
            message: 'Panel settings updated successfully',
            settings: panelSettings
        });

    } catch (error) {
        console.error('Error updating panel settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update panel settings',
            error: error.message
        });
    }
});

// ============================================================================
// Channel Groups (Packages) Endpoints
// ============================================================================

// GET /api/v2/iptv-panels/:id/channel-groups - Get all channel groups for a panel
router.get('/:id/channel-groups', async (req, res) => {
    try {
        const { id } = req.params;

        // Get custom channel groups
        const channelGroups = await db.query(`
            SELECT
                id,
                iptv_panel_id,
                name,
                description,
                bouquet_ids,
                editor_channel_ids,
                editor_movie_ids,
                editor_series_ids,
                is_active,
                created_at,
                updated_at
            FROM iptv_channel_groups
            WHERE iptv_panel_id = ?
            ORDER BY created_at DESC
        `, [id]);

        // Parse JSON fields for each group
        const groups = channelGroups.map(group => ({
            ...group,
            bouquet_ids: JSON.parse(group.bouquet_ids || '[]'),
            editor_channel_ids: JSON.parse(group.editor_channel_ids || '[]'),
            editor_movie_ids: JSON.parse(group.editor_movie_ids || '[]'),
            editor_series_ids: JSON.parse(group.editor_series_ids || '[]')
        }));

        res.json({
            success: true,
            channel_groups: groups,
            count: groups.length
        });

    } catch (error) {
        console.error('Error fetching channel groups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch channel groups',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/channel-groups - Create a new channel group
router.post('/:id/channel-groups', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            bouquet_ids,
            editor_channel_ids,
            editor_movie_ids,
            editor_series_ids
        } = req.body;

        if (!name || !bouquet_ids || !Array.isArray(bouquet_ids) || bouquet_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Name and bouquet_ids array are required'
            });
        }

        // Validate editor fields if provided
        if (editor_channel_ids && !Array.isArray(editor_channel_ids)) {
            return res.status(400).json({
                success: false,
                message: 'editor_channel_ids must be an array'
            });
        }
        if (editor_movie_ids && !Array.isArray(editor_movie_ids)) {
            return res.status(400).json({
                success: false,
                message: 'editor_movie_ids must be an array'
            });
        }
        if (editor_series_ids && !Array.isArray(editor_series_ids)) {
            return res.status(400).json({
                success: false,
                message: 'editor_series_ids must be an array'
            });
        }

        // Verify panel exists
        const panels = await db.query('SELECT id FROM iptv_panels WHERE id = ?', [id]);
        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Create channel group with editor fields
        const result = await db.query(`
            INSERT INTO iptv_channel_groups (
                iptv_panel_id,
                name,
                description,
                bouquet_ids,
                editor_channel_ids,
                editor_movie_ids,
                editor_series_ids,
                is_active,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `, [
            id,
            name,
            description || '',
            JSON.stringify(bouquet_ids),
            JSON.stringify(editor_channel_ids || []),
            JSON.stringify(editor_movie_ids || []),
            JSON.stringify(editor_series_ids || [])
        ]);

        res.json({
            success: true,
            message: 'Channel group created successfully',
            channel_group_id: result.insertId
        });

    } catch (error) {
        console.error('Error creating channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create channel group',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-panels/:id/channel-groups/:groupId - Update a channel group
router.put('/:id/channel-groups/:groupId', async (req, res) => {
    try {
        const { id, groupId } = req.params;
        const {
            name,
            description,
            bouquet_ids,
            editor_channel_ids,
            editor_movie_ids,
            editor_series_ids,
            is_active
        } = req.body;

        // Verify channel group exists and belongs to this panel
        const groups = await db.query(
            'SELECT * FROM iptv_channel_groups WHERE id = ? AND iptv_panel_id = ?',
            [groupId, id]
        );

        if (groups.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Channel group not found'
            });
        }

        // Build update query
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }

        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }

        if (bouquet_ids !== undefined) {
            if (!Array.isArray(bouquet_ids)) {
                return res.status(400).json({
                    success: false,
                    message: 'bouquet_ids must be an array'
                });
            }
            updates.push('bouquet_ids = ?');
            values.push(JSON.stringify(bouquet_ids));
        }

        if (editor_channel_ids !== undefined) {
            if (!Array.isArray(editor_channel_ids)) {
                return res.status(400).json({
                    success: false,
                    message: 'editor_channel_ids must be an array'
                });
            }
            updates.push('editor_channel_ids = ?');
            values.push(JSON.stringify(editor_channel_ids));
        }

        if (editor_movie_ids !== undefined) {
            if (!Array.isArray(editor_movie_ids)) {
                return res.status(400).json({
                    success: false,
                    message: 'editor_movie_ids must be an array'
                });
            }
            updates.push('editor_movie_ids = ?');
            values.push(JSON.stringify(editor_movie_ids));
        }

        if (editor_series_ids !== undefined) {
            if (!Array.isArray(editor_series_ids)) {
                return res.status(400).json({
                    success: false,
                    message: 'editor_series_ids must be an array'
                });
            }
            updates.push('editor_series_ids = ?');
            values.push(JSON.stringify(editor_series_ids));
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

        updates.push('updated_at = datetime(\'now\')');
        values.push(groupId);

        await db.query(`
            UPDATE iptv_channel_groups
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Channel group updated successfully'
        });

    } catch (error) {
        console.error('Error updating channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update channel group',
            error: error.message
        });
    }
});

// DELETE /api/v2/iptv-panels/:id/channel-groups/:groupId - Delete a channel group
router.delete('/:id/channel-groups/:groupId', async (req, res) => {
    try {
        const { id, groupId } = req.params;

        // Verify channel group exists and belongs to this panel
        const groups = await db.query(
            'SELECT * FROM iptv_channel_groups WHERE id = ? AND iptv_panel_id = ?',
            [groupId, id]
        );

        if (groups.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Channel group not found'
            });
        }

        // Delete channel group
        await db.query('DELETE FROM iptv_channel_groups WHERE id = ?', [groupId]);

        res.json({
            success: true,
            message: 'Channel group deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete channel group',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/sync-m3u - Sync M3U playlist for a panel
router.post('/:id/sync-m3u', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📡 M3U sync requested for panel ID: ${id}`);

        // Get panel from database
        const panels = await db.query(`
            SELECT id, name, panel_type, base_url, credentials, panel_settings, m3u_url
            FROM iptv_panels
            WHERE id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        const panelConfig = panels[0];

        // Check if M3U URL is configured
        if (!panelConfig.m3u_url) {
            return res.status(400).json({
                success: false,
                message: 'No M3U URL configured for this panel'
            });
        }

        // Load panel class based on panel type
        const NXTDashPanel = require('../services/iptv/panels/NXTDashPanel');
        const OneStreamPanel = require('../services/iptv/panels/OneStreamPanel');

        // Parse credentials
        panelConfig.credentials = JSON.parse(panelConfig.credentials);
        panelConfig.panel_settings = panelConfig.panel_settings ? JSON.parse(panelConfig.panel_settings) : {};

        // Create panel instance based on type
        let panel;
        if (panelConfig.panel_type === '1-stream') {
            panel = new OneStreamPanel(panelConfig, db);
        } else {
            panel = new NXTDashPanel(panelConfig, db);
        }

        // Sync M3U playlist
        const result = await panel.syncM3UPlaylist();

        // Clear all caches (dashboard + IPTV panels) so updated counts are reflected immediately
        clearAllCaches();

        res.json({
            success: true,
            message: 'M3U playlist synced successfully',
            data: result
        });

    } catch (error) {
        console.error('Error syncing M3U playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync M3U playlist',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-panels/:id/m3u-url - Update M3U URL for a panel
router.put('/:id/m3u-url', async (req, res) => {
    try {
        const { id } = req.params;
        const { m3u_url } = req.body;

        console.log(`🔗 Updating M3U URL for panel ID: ${id}`);

        // Validate M3U URL if provided
        if (m3u_url) {
            const { isValidM3UUrl } = require('../utils/m3u-parser');
            if (!isValidM3UUrl(m3u_url)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid M3U URL format'
                });
            }
        }

        // Check if panel exists
        const panels = await db.query(`
            SELECT id FROM iptv_panels WHERE id = ?
        `, [id]);

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // Update M3U URL
        await db.query(`
            UPDATE iptv_panels
            SET m3u_url = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [m3u_url || null, id]);

        res.json({
            success: true,
            message: 'M3U URL updated successfully'
        });

    } catch (error) {
        console.error('Error updating M3U URL:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update M3U URL',
            error: error.message
        });
    }
});

// PUT /api/v2/iptv-panels/:id/playlist-link - Link panel to IPTV Editor playlist
router.put('/:id/playlist-link', async (req, res) => {
    try {
        const { id } = req.params;
        const { iptv_editor_playlist_id } = req.body;

        console.log(`🔗 Linking panel ID: ${id} to playlist ID: ${iptv_editor_playlist_id}`);

        // Check if panel exists
        const panels = await db.query(
            'SELECT id, name FROM iptv_panels WHERE id = ?',
            [id]
        );

        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        // If linking to a playlist, verify the playlist exists
        if (iptv_editor_playlist_id !== null && iptv_editor_playlist_id !== undefined && iptv_editor_playlist_id !== '') {
            const playlists = await db.query(
                'SELECT id, name FROM iptv_editor_playlists WHERE id = ?',
                [iptv_editor_playlist_id]
            );

            if (playlists.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'IPTV Editor playlist not found'
                });
            }

            console.log(`✅ Linking "${panels[0].name}" to playlist "${playlists[0].name}"`);
        } else {
            console.log(`🔓 Unlinking "${panels[0].name}" from any playlist`);
        }

        // Update the link
        await db.query(
            'UPDATE iptv_panels SET iptv_editor_playlist_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
            [iptv_editor_playlist_id || null, id]
        );

        res.json({
            success: true,
            message: iptv_editor_playlist_id ? 'Panel linked to playlist successfully' : 'Panel unlinked from playlist',
            panel_id: id,
            iptv_editor_playlist_id: iptv_editor_playlist_id || null
        });

    } catch (error) {
        console.error('Error linking panel to playlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to link panel to playlist',
            error: error.message
        });
    }
});

// ============================================================================
// Guide Cache Refresh Endpoints
// ============================================================================

// POST /api/v2/iptv-panels/refresh-guide-cache - Refresh guide cache for all panels
router.post('/refresh-guide-cache', async (req, res) => {
    try {
        console.log(`📺 Manual guide cache refresh requested for all panels`);

        const { refreshAllPanelsGuide } = require('../jobs/guide-cache-refresh-scheduler');
        const results = await refreshAllPanelsGuide();

        res.json({
            success: true,
            message: 'Guide cache refresh completed',
            results: {
                total: results.total,
                successful: results.success,
                failed: results.failed,
                skipped: results.skipped || 0
            }
        });

    } catch (error) {
        console.error('Error refreshing guide cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh guide cache',
            error: error.message
        });
    }
});

// POST /api/v2/iptv-panels/:id/refresh-guide-cache - Refresh guide cache for specific panel
router.post('/:id/refresh-guide-cache', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📺 Manual guide cache refresh requested for panel ${id}`);

        // Check if panel exists
        const panels = await db.query('SELECT id, name FROM iptv_panels WHERE id = ?', [id]);
        if (panels.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV panel not found'
            });
        }

        const { refreshPanelGuide } = require('../jobs/guide-cache-refresh-scheduler');
        const result = await refreshPanelGuide(parseInt(id));

        if (result.success) {
            res.json({
                success: true,
                message: `Guide cache refreshed for ${panels[0].name}`,
                panel_name: panels[0].name,
                categories: result.categories,
                channels: result.channels,
                epgPrograms: result.epgPrograms
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Failed to refresh guide cache for ${panels[0].name}`,
                error: result.error
            });
        }

    } catch (error) {
        console.error('Error refreshing panel guide cache:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh guide cache',
            error: error.message
        });
    }
});

// GET /api/v2/iptv-panels/guide-cache-status - Get guide cache status for all panels
router.get('/guide-cache-status', async (req, res) => {
    try {
        const { getCacheStatus } = require('../jobs/guide-cache-refresh-scheduler');
        const caches = getCacheStatus();

        // Filter to just panels
        const panelCaches = caches.filter(c => c.source_type === 'panel');

        // Get panel names
        const panelIds = panelCaches.map(c => c.source_id);
        let panelNames = {};

        if (panelIds.length > 0) {
            const panels = await db.query(
                `SELECT id, name FROM iptv_panels WHERE id IN (${panelIds.map(() => '?').join(',')})`,
                panelIds
            );
            panels.forEach(p => { panelNames[p.id] = p.name; });
        }

        const status = panelCaches.map(cache => ({
            panel_id: cache.source_id,
            panel_name: panelNames[cache.source_id] || `Panel ${cache.source_id}`,
            categories: cache.total_categories,
            channels: cache.total_channels,
            last_updated: cache.last_updated,
            last_error: cache.last_error
        }));

        res.json({
            success: true,
            cache_status: status,
            count: status.length
        });

    } catch (error) {
        console.error('Error getting guide cache status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get guide cache status',
            error: error.message
        });
    }
});

module.exports = router;
