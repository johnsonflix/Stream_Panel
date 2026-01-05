/**
 * Plex Library Access Sync Job
 *
 * Provides functions for syncing library access information from Plex servers.
 * This is now integrated with plex-sync-scheduler.js which handles the scheduled execution.
 */

const { query } = require('../database-config');
const { spawn } = require('child_process');
const path = require('path');

// Track sync status
let syncStatus = {
    isRunning: false,
    lastSync: null,
    lastSyncStatus: 'idle',
    serversProcessed: 0,
    totalServers: 0,
    errors: []
};

/**
 * Get current sync status
 */
function getSyncStatus() {
    return { ...syncStatus };
}

/**
 * Initialize the library access sync (placeholder for backwards compatibility)
 * Actual scheduling is handled by plex-sync-scheduler.js
 */
function initializePlexLibraryAccessSync() {
    console.log('[Library Access Sync] Initialized (scheduling handled by plex-sync-scheduler)');
}

/**
 * Sync library access for a specific server
 * @param {Object} server - Server object with id, name, url, server_id, token
 */
async function syncServerLibraryAccess(server) {
    // Handle both server object and server ID
    let serverConfig = server;

    if (typeof server === 'number' || typeof server === 'string') {
        // It's a server ID, fetch the server details
        const servers = await query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE id = ?
        `, [server]);

        if (servers.length === 0) {
            throw new Error(`Server ${server} not found`);
        }
        serverConfig = servers[0];
    }

    console.log(`[Library Access Sync] Syncing library access for server: ${serverConfig.name}`);

    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../../plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        const config = JSON.stringify({
            name: serverConfig.name,
            url: serverConfig.url,
            server_id: serverConfig.server_id,
            token: serverConfig.token
        });

        const pythonProcess = spawn(pythonExecutable, [
            pythonScript,
            'get_all_users_with_library_access',
            config
        ]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`[Library Access Sync] Python script error:`, stderr);
                reject(new Error(`Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);

                if (!result.success) {
                    reject(new Error(result.message || 'Failed to get library access'));
                    return;
                }

                let usersUpdated = 0;
                const usersWithAccess = [];

                for (const user of result.users || []) {
                    try {
                        // First find the user in our users table by plex_email (case-insensitive)
                        const matchingUsers = await query(`
                            SELECT id, plex_email
                            FROM users
                            WHERE LOWER(plex_email) = ?
                        `, [user.email?.toLowerCase()]);

                        if (matchingUsers.length === 0) {
                            // User not in our system, skip
                            continue;
                        }

                        const userId = matchingUsers[0].id;
                        const libraryIds = (user.library_ids || []).map(id => String(id));

                        // Check if user_plex_shares record exists for this server
                        const existingShares = await query(`
                            SELECT id
                            FROM user_plex_shares
                            WHERE user_id = ? AND plex_server_id = ?
                        `, [userId, serverConfig.id]);

                        if (existingShares.length > 0) {
                            // Update existing share with library IDs
                            await query(`
                                UPDATE user_plex_shares
                                SET library_ids = ?,
                                    share_status = 'active',
                                    updated_at = datetime('now')
                                WHERE id = ?
                            `, [JSON.stringify(libraryIds), existingShares[0].id]);
                        } else {
                            // Insert new share record for this user/server
                            await query(`
                                INSERT INTO user_plex_shares (user_id, plex_server_id, library_ids, share_status, shared_at, created_at, updated_at)
                                VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'), datetime('now'))
                            `, [userId, serverConfig.id, JSON.stringify(libraryIds)]);
                        }
                        usersUpdated++;

                        usersWithAccess.push({
                            email: user.email,
                            username: user.username,
                            libraryCount: (user.library_ids || []).length
                        });
                    } catch (userError) {
                        console.error(`[Library Access Sync] Error updating library access for ${user.email}:`, userError.message);
                    }
                }

                console.log(`[Library Access Sync] Updated library access for ${usersUpdated} users on ${serverConfig.name}`);

                resolve({
                    success: true,
                    server: serverConfig.name,
                    usersUpdated,
                    totalUsers: result.users?.length || 0,
                    users: usersWithAccess
                });

            } catch (parseError) {
                console.error('[Library Access Sync] Error parsing Python output:', parseError);
                reject(parseError);
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[Library Access Sync] Failed to start Python process:', error);
            reject(error);
        });
    });
}

/**
 * Sync library access for a single user on a specific server
 */
async function syncSingleUserServerAccess(serverId, userId) {
    console.log(`[Library Access Sync] Syncing library access for user ${userId} on server ${serverId}`);

    try {
        // Get user's plex email
        const users = await query(`
            SELECT id, plex_email
            FROM users
            WHERE id = ?
        `, [userId]);

        if (users.length === 0 || !users[0].plex_email) {
            return { success: false, message: 'User not found or no Plex email' };
        }

        // Get server details
        const servers = await query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE id = ?
        `, [serverId]);

        if (servers.length === 0) {
            return { success: false, message: 'Server not found' };
        }

        const server = servers[0];
        const userEmail = users[0].plex_email.toLowerCase();

        // Get library access for this specific user
        const result = await getUserLibraryAccess(server, userEmail);

        if (result.success && result.libraryIds) {
            // Update user_plex_shares
            await query(`
                UPDATE user_plex_shares
                SET library_ids = ?,
                    updated_at = datetime('now')
                WHERE user_id = ? AND plex_server_id = ?
            `, [JSON.stringify(result.libraryIds), userId, serverId]);
        }

        return result;
    } catch (error) {
        console.error(`[Library Access Sync] Error syncing user ${userId} on server ${serverId}:`, error);
        return { success: false, message: error.message };
    }
}

/**
 * Get library access for a specific user on a server
 */
async function getUserLibraryAccess(server, userEmail) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../../plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        const config = JSON.stringify({
            name: server.name,
            url: server.url,
            server_id: server.server_id,
            token: server.token
        });

        const pythonProcess = spawn(pythonExecutable, [
            pythonScript,
            'get_all_users_with_library_access',
            config
        ]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                resolve({ success: false, message: `Python script exited with code ${code}` });
                return;
            }

            try {
                const result = JSON.parse(stdout);

                if (!result.success) {
                    resolve({ success: false, message: result.message || 'Failed to get library access' });
                    return;
                }

                // Find the specific user
                const user = (result.users || []).find(u =>
                    u.email?.toLowerCase() === userEmail.toLowerCase()
                );

                if (user) {
                    resolve({
                        success: true,
                        email: user.email,
                        username: user.username,
                        libraryIds: user.library_ids || [],
                        libraryNames: user.library_names || []
                    });
                } else {
                    resolve({
                        success: false,
                        message: 'User not found on server'
                    });
                }

            } catch (parseError) {
                resolve({ success: false, message: 'Error parsing response' });
            }
        });

        pythonProcess.on('error', (error) => {
            resolve({ success: false, message: error.message });
        });
    });
}

/**
 * Sync library access for all active servers
 */
async function syncAllServersLibraryAccess() {
    if (syncStatus.isRunning) {
        console.log('[Library Access Sync] Sync already in progress');
        return { success: false, message: 'Sync already in progress' };
    }

    syncStatus.isRunning = true;
    syncStatus.errors = [];
    syncStatus.serversProcessed = 0;

    try {
        const servers = await query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE is_active = 1
        `);

        syncStatus.totalServers = servers.length;
        console.log(`[Library Access Sync] Starting sync for ${servers.length} servers`);

        const results = [];

        for (const server of servers) {
            try {
                const result = await syncServerLibraryAccess(server);
                results.push(result);
                syncStatus.serversProcessed++;
            } catch (error) {
                console.error(`[Library Access Sync] Error syncing server ${server.name}:`, error.message);
                syncStatus.errors.push({ server: server.name, error: error.message });
                syncStatus.serversProcessed++;
            }
        }

        syncStatus.isRunning = false;
        syncStatus.lastSync = new Date();
        syncStatus.lastSyncStatus = syncStatus.errors.length > 0 ? 'completed_with_errors' : 'completed';

        console.log(`[Library Access Sync] Completed sync for all servers`);
        return { success: true, results };

    } catch (error) {
        syncStatus.isRunning = false;
        syncStatus.lastSyncStatus = 'error';
        syncStatus.errors.push({ error: error.message });
        console.error('[Library Access Sync] Error:', error);
        return { success: false, message: error.message };
    }
}

module.exports = {
    initializePlexLibraryAccessSync,
    syncServerLibraryAccess,
    syncSingleUserServerAccess,
    syncAllServersLibraryAccess,
    getUserLibraryAccess,
    getSyncStatus
};
