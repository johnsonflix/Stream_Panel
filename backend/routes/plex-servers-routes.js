/**
 * Plex Servers API Routes
 *
 * CRUD operations for Plex servers management
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');
const { syncServerLibraryAccess, getUserLibraryAccess } = require('../jobs/plex-library-access-sync');

// GET /api/v2/plex-servers - Get all Plex servers with user counts from Plex API
router.get('/', async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';

        let sql = `
            SELECT
                ps.id,
                ps.name,
                ps.url,
                ps.server_id,
                ps.token,
                ps.is_active,
                ps.sync_schedule,
                ps.libraries,
                ps.last_library_sync,
                ps.last_health_check,
                ps.health_status,
                ps.request_site_url,
                ps.created_at,
                ps.updated_at
            FROM plex_servers ps
        `;

        if (!includeInactive) {
            sql += ' WHERE ps.is_active = TRUE';
        }

        sql += ' ORDER BY ps.name';

        const servers = await db.query(sql);
        const axios = require('axios');
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser();

        // Get user counts from Plex API for each server
        const parsedServers = await Promise.all(servers.map(async (server) => {
            let shared_user_count = 0;

            // Query Plex.tv API for shared users count
            try {
                const response = await axios.get(`https://plex.tv/api/servers/${server.server_id}/shared_servers`, {
                    params: {
                        'X-Plex-Token': server.token
                    },
                    timeout: 5000
                });

                const result = await parser.parseStringPromise(response.data);
                const sharedServers = result.MediaContainer.SharedServer || [];
                shared_user_count = sharedServers.length;
            } catch (error) {
                // Silently fail - just use 0 for count
                console.log(`Could not get user count for ${server.name}: ${error.message}`);
            }

            return {
                ...server,
                libraries: server.libraries ? JSON.parse(server.libraries) : [],
                token: undefined, // Don't send token to frontend
                shared_user_count
            };
        }));

        res.json({
            success: true,
            servers: parsedServers,
            count: parsedServers.length
        });

    } catch (error) {
        console.error('Error fetching Plex servers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex servers',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/check-access - Check user access across all Plex servers
router.post('/check-access', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Get all active servers with their libraries
        const servers = await db.query(`
            SELECT id, name, url, server_id, token, libraries
            FROM plex_servers
            WHERE is_active = TRUE
            ORDER BY name
        `);

        if (servers.length === 0) {
            return res.json({
                success: true,
                email,
                found: false,
                access: [],
                message: 'No active Plex servers configured'
            });
        }

        const accessResults = [];
        let foundUser = false;

        // Check each server for user access using the Python script (same as sync button)
        for (const server of servers) {
            try {
                // Use the same method as the sync button - this uses the Python script
                const result = await getUserLibraryAccess(server, email);

                if (result.success && result.libraryIds && result.libraryIds.length > 0) {
                    foundUser = true;

                    // Parse server libraries to get names
                    const serverLibraries = server.libraries ? JSON.parse(server.libraries) : [];

                    // Build accessible libraries with names
                    const accessibleLibraries = result.libraryIds.map(libId => {
                        const lib = serverLibraries.find(l => String(l.key || l.id) === String(libId));
                        return {
                            id: String(libId),
                            name: lib ? lib.title : `Library ${libId}`,
                            type: lib ? lib.type : 'unknown'
                        };
                    });

                    console.log(`✅ [check-access] ${server.name}: User has access to ${accessibleLibraries.length} libraries`);

                    accessResults.push({
                        server_id: server.id,
                        server_name: server.name,
                        has_access: true,
                        status: 'accepted',
                        libraries: accessibleLibraries
                    });
                } else {
                    console.log(`ℹ️ [check-access] ${server.name}: User not found or no access`);
                    accessResults.push({
                        server_id: server.id,
                        server_name: server.name,
                        has_access: false,
                        libraries: []
                    });
                }

            } catch (serverError) {
                console.error(`Error checking access on server ${server.name}:`, serverError.message);
                accessResults.push({
                    server_id: server.id,
                    server_name: server.name,
                    has_access: false,
                    error: serverError.message,
                    libraries: []
                });
            }
        }

        res.json({
            success: true,
            email,
            found: foundUser,
            access: accessResults,
            servers_checked: servers.length,
            servers_with_access: accessResults.filter(r => r.has_access).length
        });

    } catch (error) {
        console.error('Error checking Plex access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check Plex access',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/search - Search for user across all Plex servers
router.post('/search', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Get all active servers
        const servers = await db.query(`
            SELECT id, name, server_id, token
            FROM plex_servers
            WHERE is_active = TRUE
            ORDER BY name
        `);

        // This will use PlexServiceManager to search each server
        // For now, return structure - actual search implementation pending
        const results = [];
        const searched_servers = servers.map(server => ({
            id: server.id,
            name: server.name,
            found: false,
            status: 'not_checked'
        }));

        res.json({
            success: true,
            email,
            found: false,
            results,
            searched_servers,
            note: 'Search implementation pending - will use PlexServiceManager'
        });

    } catch (error) {
        console.error('Error searching Plex servers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search Plex servers',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/:id/stats - Get server statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        // Get server details
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Get user count from OUR database (users managed by this app for this server)
        const appUserCount = await db.query(`
            SELECT COUNT(DISTINCT u.id) as count
            FROM users u
            INNER JOIN plex_packages pp ON u.plex_package_id = pp.id
            WHERE u.plex_enabled = 1
            AND u.is_active = 1
            AND json_extract(pp.server_library_mappings, '$') LIKE '%"server_id":' || ? || '%'
        `, [id]);

        // Get pending invites from our database
        const pendingInvites = await db.query(`
            SELECT COUNT(*) as count
            FROM users u
            WHERE u.pending_plex_invites IS NOT NULL
            AND u.pending_plex_invites != ''
            AND u.pending_plex_invites LIKE '%"server_id":' || ? || '%'
        `, [id]);

        // Try to get actual Plex server user count from Plex.tv API
        let plexUserCount = null;
        let plexPendingCount = null;

        try {
            const axios = require('axios');
            const xml2js = require('xml2js');

            // Get shared users from Plex.tv (not local server)
            const sharedUsersResponse = await axios.get(`https://plex.tv/api/servers/${server.server_id}/shared_servers`, {
                params: {
                    'X-Plex-Token': server.token
                },
                timeout: 5000
            });

            // Parse XML response
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(sharedUsersResponse.data);
            const sharedServers = result.MediaContainer.SharedServer || [];

            plexUserCount = sharedServers.length;

            // Count pending invites from shared_servers (users invited but haven't accepted)
            const pendingInSharedServers = sharedServers.filter(s =>
                s.$.invitedAt && !s.$.acceptedAt
            ).length;

            // Also check the pending invites endpoint for invites not yet in shared_servers
            let pendingInvites = 0;
            try {
                const invitesResponse = await axios.get('https://plex.tv/api/invites/requested', {
                    params: {
                        'X-Plex-Token': server.token
                    },
                    timeout: 5000
                });

                const invitesResult = await parser.parseStringPromise(invitesResponse.data);
                const invites = invitesResult.MediaContainer?.Invite || [];
                pendingInvites = invites.length;
            } catch (invitesError) {
                console.log('Could not fetch pending invites:', invitesError.message);
            }

            // Total pending is sum of both
            plexPendingCount = pendingInSharedServers + pendingInvites;

        } catch (plexError) {
            console.log('Could not fetch Plex user stats:', plexError.message);
            // Continue with database stats only
        }

        // Parse libraries
        const libraries = server.libraries ? JSON.parse(server.libraries) : [];

        res.json({
            success: true,
            stats: {
                // Use Plex API counts if available, otherwise fall back to app database
                user_count: plexUserCount !== null ? plexUserCount : appUserCount[0]?.count || 0,
                pending_shares: plexPendingCount !== null ? plexPendingCount : pendingInvites[0]?.count || 0,
                app_managed_users: appUserCount[0]?.count || 0, // Users created through this app
                library_count: libraries.length,
                libraries: libraries,
                health_status: server.health_status,
                last_sync: server.last_library_sync,
                last_health_check: server.last_health_check
            }
        });

    } catch (error) {
        console.error('Error fetching server stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch server stats',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/:id/users - Get users for this server
router.get('/:id/users', async (req, res) => {
    try {
        const { id } = req.params;

        // Get server details
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Fetch users from Plex API
        try {
            const axios = require('axios');
            const xml2js = require('xml2js');

            // Get shared users from Plex.tv
            const sharedUsersResponse = await axios.get(`https://plex.tv/api/servers/${server.server_id}/shared_servers`, {
                params: {
                    'X-Plex-Token': server.token
                },
                timeout: 10000
            });

            // Parse XML response
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(sharedUsersResponse.data);
            const sharedServers = result.MediaContainer.SharedServer || [];

            // Extract user information
            const users = sharedServers.map(s => ({
                id: s.$.id,
                username: s.$.username,
                email: s.$.email,
                userID: s.$.userID,
                acceptedAt: s.$.acceptedAt || null,
                invitedAt: s.$.invitedAt || null,
                status: s.$.acceptedAt ? 'accepted' : 'pending'
            }));

            res.json({
                success: true,
                users,
                count: users.length
            });

        } catch (plexError) {
            console.error('Error fetching users from Plex:', plexError);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch users from Plex API',
                error: plexError.message
            });
        }

    } catch (error) {
        console.error('Error fetching Plex server users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex server users',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/:id/users-with-activity - Get users with watch activity data
router.get('/:id/users-with-activity', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        // Get server details
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Use PlexServiceManager to get users with activity
        const PlexServiceManager = require('../services/plex/PlexServiceManager');
        const plexManager = new PlexServiceManager(db);
        await plexManager.initialize();

        console.log(`[Plex Users Activity] Fetching users with activity for server ${server.name} (ID: ${id})...`);
        console.log(`[Plex Users Activity] Available servers in manager:`, Array.from(plexManager.servers.keys()));

        // First, try to get from database cache (plex_user_activity table)
        const cachedUsers = await db.query(`
            SELECT
                plex_user_email as email,
                plex_username as username,
                last_seen_at,
                days_since_last_activity,
                is_pending_invite,
                is_active_friend,
                synced_at
            FROM plex_user_activity
            WHERE plex_server_id = ?
            ORDER BY
                CASE
                    WHEN is_active_friend = 1 THEN 0
                    WHEN is_pending_invite = 1 THEN 1
                    ELSE 2
                END,
                plex_username
        `, [id]);

        // ALWAYS use cached data only (fresh data is synced by scheduled job at 3 AM)
        const cacheAge = cachedUsers.length > 0 && cachedUsers[0].synced_at
            ? (Date.now() - new Date(cachedUsers[0].synced_at + 'Z').getTime()) / 1000 / 60
            : null;

        if (cachedUsers.length > 0) {
            // Use cached data
            console.log(`[Plex Users Activity] Returning cached data (age: ${cacheAge ? Math.round(cacheAge) + ' minutes' : 'unknown'})`);

            res.json({
                success: true,
                users: cachedUsers.filter(u => u.is_active_friend === 1),
                pending_invites: cachedUsers.filter(u => u.is_pending_invite === 1),
                total_users: cachedUsers.filter(u => u.is_active_friend === 1).length,
                total_pending: cachedUsers.filter(u => u.is_pending_invite === 1).length,
                cached: true,
                cache_age_minutes: cacheAge ? Math.round(cacheAge) : null,
                last_sync: cachedUsers[0].synced_at
            });
        } else {
            // No cached data available yet - will be populated by scheduled sync at 3 AM
            console.log(`[Plex Users Activity] No cached data available yet`);

            res.json({
                success: true,
                users: [],
                pending_invites: [],
                total_users: 0,
                total_pending: 0,
                cached: false,
                message: 'Activity data not yet available. Data is synced daily at 3 AM.',
                next_sync: '3:00 AM daily'
            });
        }
    } catch (error) {
        console.error('Error fetching Plex server users with activity:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex server users with activity',
            error: error.message,
            details: error.stack
        });
    }
});

// GET /api/v2/plex-servers/:id/pending-invites - Get pending invites for this server
router.get('/:id/pending-invites', async (req, res) => {
    try {
        const { id } = req.params;

        // Get server details
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Fetch pending invites from Plex API
        try {
            const axios = require('axios');
            const xml2js = require('xml2js');

            // Get pending invites from Plex.tv
            const invitesResponse = await axios.get('https://plex.tv/api/invites/requested', {
                params: {
                    'X-Plex-Token': server.token
                },
                timeout: 10000
            });

            // Parse XML response
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(invitesResponse.data);
            const invites = result.MediaContainer?.Invite || [];

            // Extract invite information
            // Note: The token is server-specific, so all invites returned are for this server
            const pendingInvites = invites.map(invite => {
                // Convert Unix timestamp to ISO date string
                const createdAtTimestamp = parseInt(invite.$.createdAt);
                const createdAt = new Date(createdAtTimestamp * 1000).toISOString();

                return {
                    id: invite.$.id,
                    username: invite.$.username,
                    email: invite.$.email,
                    friendlyName: invite.$.friendlyName,
                    createdAt: createdAt,
                    status: 'pending'
                };
            });

            res.json({
                success: true,
                invites: pendingInvites,
                count: pendingInvites.length
            });

        } catch (plexError) {
            console.error('Error fetching pending invites from Plex:', plexError);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending invites from Plex API',
                error: plexError.message
            });
        }

    } catch (error) {
        console.error('Error fetching Plex server pending invites:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex server pending invites',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/:id/sync-libraries - Sync libraries for server (full sync with stats)
router.post('/:id/sync-libraries', async (req, res) => {
    try {
        const { id } = req.params;

        // Get server from database
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const server = servers[0];

        // Fetch libraries from Plex with detailed statistics
        const axios = require('axios');
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser();

        let libraries = [];
        let directSyncError = null;

        // Wrap direct server operations in try-catch so library access sync can still run
        try {
            // Fetch libraries
            const libResponse = await axios.get(`${server.url}/library/sections`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/xml'
            },
            timeout: 10000
        });

            const libResult = await parser.parseStringPromise(libResponse.data);
            const directories = libResult.MediaContainer.Directory || [];

            // Fetch detailed stats for each library
            for (const dir of directories) {
            try {
                // Get total count
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

                // For music libraries, fetch album count
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

                // For TV show libraries, fetch season and episode counts
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

                libraries.push(library);
            } catch (countError) {
                console.error(`Error fetching stats for library ${dir.$.title}:`, countError.message);
                libraries.push({
                    key: dir.$.key,
                    title: dir.$.title,
                    type: dir.$.type,
                    count: 0
                });
            }
        }

            // Update database with detailed library stats
            await db.query(`
                UPDATE plex_servers
                SET libraries = ?,
                    last_library_sync = datetime('now'),
                    health_status = 'online',
                    last_health_check = datetime('now')
                WHERE id = ?
            `, [JSON.stringify(libraries), id]);
        } catch (directError) {
            // Direct server operations failed (e.g., 401, connection error)
            // Continue to library access sync which uses plex.tv API
            console.error(`[Sync Libraries] Direct server sync failed for ${server.name}:`, directError.message);
            directSyncError = directError.message;

            // Update server health status to error
            try {
                await db.query(`
                    UPDATE plex_servers
                    SET health_status = 'error',
                        last_health_check = datetime('now')
                    WHERE id = ?
                `, [id]);
            } catch (dbError) {
                console.error('Error updating health status:', dbError);
            }
        }

        // Sync user library access (which libraries each user has access to)
        // This uses plex.tv API which may work even if direct server connection fails
        let libraryAccessResult = null;
        try {
            console.log(`[Sync Libraries] Syncing user library access for server ${server.name}...`);
            libraryAccessResult = await syncServerLibraryAccess(server);
            console.log(`[Sync Libraries] ✓ User library access synced for server ${server.name}`);
        } catch (libAccessError) {
            console.error(`[Sync Libraries] Warning: Library access sync failed for ${server.name}:`, libAccessError.message);
            // Don't fail the whole sync if library access sync fails
        }

        // Clear dashboard cache to force refresh on next request
        const { clearCache } = require('../utils/dashboard-cache');
        clearCache();

        // Determine success status and message
        const partialSuccess = directSyncError !== null;
        res.json({
            success: true,
            partial: partialSuccess,
            message: partialSuccess
                ? 'User library access synced successfully, but direct server sync failed'
                : 'Libraries, statistics, and user library access synced successfully',
            library_count: libraries.length,
            direct_sync_error: directSyncError,
            library_access_sync: libraryAccessResult || { skipped: true }
        });

    } catch (error) {
        console.error('Error syncing libraries:', error);

        // Update server health status to error
        try {
            await db.query(`
                UPDATE plex_servers
                SET health_status = 'error',
                    last_health_check = datetime('now')
                WHERE id = ?
            `, [req.params.id]);
        } catch (dbError) {
            console.error('Error updating health status:', dbError);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to sync libraries',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/:id/test-connection - Test server connection
router.post('/:id/test-connection', async (req, res) => {
    try {
        const { id } = req.params;
        const axios = require('axios');

        // Get server details from database
        const servers = await db.query(`
            SELECT id, name, url, token FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const server = servers[0];

        // Try to fetch server identity to test connection
        try {
            const response = await axios.get(`${server.url}/identity`, {
                headers: {
                    'X-Plex-Token': server.token
                },
                timeout: 10000,
                validateStatus: () => true // Accept any status
            });

            if (response.status === 200) {
                // Server is online
                await db.query(`
                    UPDATE plex_servers
                    SET health_status = 'online',
                        last_health_check = datetime('now')
                    WHERE id = ?
                `, [id]);

                res.json({
                    success: true,
                    message: 'Connection successful',
                    server_name: server.name,
                    online: true
                });
            } else {
                // Server returned non-200 status
                await db.query(`
                    UPDATE plex_servers
                    SET health_status = 'offline',
                        last_health_check = datetime('now')
                    WHERE id = ?
                `, [id]);

                res.json({
                    success: false,
                    message: `Connection failed - server returned status ${response.status}`,
                    server_name: server.name,
                    online: false
                });
            }
        } catch (connectionError) {
            // Server unreachable
            await db.query(`
                UPDATE plex_servers
                SET health_status = 'offline',
                    last_health_check = datetime('now')
                WHERE id = ?
            `, [id]);

            res.json({
                success: false,
                message: 'Connection failed - server unreachable',
                server_name: server.name,
                online: false,
                error: connectionError.message
            });
        }

    } catch (error) {
        console.error('Error testing connection:', error);

        // Update to error status
        try {
            await db.query(`
                UPDATE plex_servers
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

// GET /api/v2/plex-servers/:id - Get single Plex server
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];
        server.libraries = server.libraries ? JSON.parse(server.libraries) : [];

        res.json({
            success: true,
            server
        });

    } catch (error) {
        console.error('Error fetching Plex server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex server',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers - Create new Plex server
router.post('/', async (req, res) => {
    try {
        const {
            name,
            url,
            server_id,
            token,
            sync_schedule,
            request_site_url
        } = req.body;

        // Validation
        if (!name || !url || !server_id || !token) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, url, server_id, token'
            });
        }

        // Validate sync_schedule if provided
        if (sync_schedule && !['manual', 'hourly', 'daily', 'weekly'].includes(sync_schedule)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sync_schedule value. Must be one of: manual, hourly, daily, weekly'
            });
        }

        // Check for duplicate server_id + token combination
        const existing = await db.query(`
            SELECT id FROM plex_servers WHERE server_id = ? AND token = ?
        `, [server_id, token]);

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A server with this server_id and token combination already exists'
            });
        }

        // Insert server
        const result = await db.query(`
            INSERT INTO plex_servers
            (name, url, server_id, token, sync_schedule, request_site_url, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [name, url, server_id, token, sync_schedule || 'manual', request_site_url || null]);

        res.status(201).json({
            success: true,
            message: 'Plex server created successfully',
            server_id: result.insertId
        });

    } catch (error) {
        console.error('Error creating Plex server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create Plex server',
            error: error.message
        });
    }
});

// PUT /api/v2/plex-servers/:id - Update Plex server
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            url,
            server_id,
            token,
            is_active,
            sync_schedule,
            request_site_url
        } = req.body;

        // Check if server exists
        const existing = await db.query(`
            SELECT id FROM plex_servers WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        // Validate sync_schedule if provided
        if (sync_schedule !== undefined && !['manual', 'hourly', 'daily', 'weekly'].includes(sync_schedule)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sync_schedule value. Must be one of: manual, hourly, daily, weekly'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (url !== undefined) {
            updates.push('url = ?');
            values.push(url);
        }
        if (server_id !== undefined) {
            updates.push('server_id = ?');
            values.push(server_id);
        }
        if (token !== undefined) {
            updates.push('token = ?');
            values.push(token);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (sync_schedule !== undefined) {
            updates.push('sync_schedule = ?');
            values.push(sync_schedule);
        }
        if (request_site_url !== undefined) {
            updates.push('request_site_url = ?');
            values.push(request_site_url);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = datetime(\'now\')');
        values.push(id);

        await db.query(`
            UPDATE plex_servers
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Plex server updated successfully'
        });

    } catch (error) {
        console.error('Error updating Plex server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update Plex server',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/:id/check-user - Check if user exists on Plex server
router.post('/:id/check-user', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_email } = req.body;

        if (!user_email) {
            return res.status(400).json({
                success: false,
                message: 'user_email is required'
            });
        }

        // Get server details
        const servers = await db.query(`
            SELECT * FROM plex_servers WHERE id = ?
        `, [id]);

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Use PlexServiceManager to check user info
        const PlexServiceManager = require('../services/plex/PlexServiceManager');
        const plexManager = new PlexServiceManager();

        const serverConfig = {
            name: server.name,
            server_id: server.server_id,
            token: server.token
        };

        const result = await plexManager.checkUserInfo(user_email, serverConfig);

        res.json(result);

    } catch (error) {
        console.error('Error checking user info on Plex:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check user info',
            error: error.message
        });
    }
});

// DELETE /api/v2/plex-servers/:id - Delete Plex server
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if server is used in any packages
        const packagesUsing = await db.query(`
            SELECT COUNT(*) as count
            FROM plex_packages
            WHERE JSON_CONTAINS(server_library_mappings, JSON_OBJECT('server_id', ?))
        `, [parseInt(id)]);

        if (packagesUsing[0].count > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete server: It is used in ${packagesUsing[0].count} package(s)`,
                packages_count: packagesUsing[0].count
            });
        }

        // Delete server
        const result = await db.query(`
            DELETE FROM plex_servers WHERE id = ?
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        res.json({
            success: true,
            message: 'Plex server deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting Plex server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete Plex server',
            error: error.message
        });
    }
});

// POST /api/v2/plex-servers/sync-activity - Trigger manual activity sync for all servers
router.post('/sync-activity', async (req, res) => {
    try {
        const syncManager = require('../services/plex-activity-sync-manager');

        // Start sync in background
        const status = syncManager.startSyncInBackground();

        res.json({
            success: true,
            message: 'Activity sync started',
            status: status
        });

    } catch (error) {
        console.error('Error starting activity sync:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start activity sync',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/sync-activity/status - Get sync status
router.get('/sync-activity/status', async (req, res) => {
    try {
        const syncManager = require('../services/plex-activity-sync-manager');
        const status = syncManager.getSyncStatus();

        res.json({
            success: true,
            status: status
        });

    } catch (error) {
        console.error('Error getting sync status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get sync status',
            error: error.message
        });
    }
});


// ============================================================================
// Library Access Sync Routes
// ============================================================================

// Import additional library access sync functions (getUserLibraryAccess already imported at top)
const {
    getSyncStatus: getLibrarySyncStatus,
    syncAllServersLibraryAccess
} = require('../jobs/plex-library-access-sync');

// POST /api/v2/plex-servers/library-access-sync/start - Start library access sync for all servers
router.post('/library-access-sync/start', async (req, res) => {
    try {
        console.log('[Library Sync Route] Starting library access sync...');

        // Start sync in background
        syncAllServersLibraryAccess().catch(error => {
            console.error('[Library Sync Route] Background sync error:', error);
        });

        res.json({
            success: true,
            message: 'Library access sync started in background',
            status: getLibrarySyncStatus()
        });
    } catch (error) {
        console.error('[Library Sync Route] Error starting sync:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start library access sync',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/library-access-sync/status - Get library access sync status
router.get('/library-access-sync/status', async (req, res) => {
    try {
        res.json({
            success: true,
            status: getLibrarySyncStatus()
        });
    } catch (error) {
        console.error('[Library Sync Route] Error getting status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get library access sync status',
            error: error.message
        });
    }
});

// GET /api/v2/plex-servers/:serverId/user-library-access/:email - Get library access for a specific user on a server
// Used to verify library access after updates from edit page
router.get('/:serverId/user-library-access/:email', async (req, res) => {
    try {
        const { serverId, email } = req.params;

        console.log(`[Library Sync Route] Getting library access for ${email} on server ${serverId}...`);

        // Get server config
        const servers = await db.query(
            'SELECT id, name, url, server_id, token FROM plex_servers WHERE id = ? AND is_active = 1',
            [serverId]
        );

        if (servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex server not found'
            });
        }

        const server = servers[0];

        // Get user's current library access from Plex
        const result = await getUserLibraryAccess(email, server);

        res.json({
            success: true,
            server_id: serverId,
            server_name: server.name,
            email: email,
            ...result
        });
    } catch (error) {
        console.error('[Library Sync Route] Error getting user library access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user library access',
            error: error.message
        });
    }
});

module.exports = router;
