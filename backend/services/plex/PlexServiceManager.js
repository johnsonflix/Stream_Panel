/**
 * PlexServiceManager - Multi-Server Plex Management
 *
 * Manages multiple Plex servers dynamically loaded from database.
 * Handles library sharing, user invites, and server health monitoring.
 */

const { spawn } = require('child_process');
const path = require('path');

class PlexServiceManager {
    constructor(db) {
        this.db = db;
        this.servers = new Map(); // server_id -> server config
        this.packages = new Map(); // package_id -> package config
        this.initialized = false;
    }

    /**
     * Initialize service - load servers and packages from database
     */
    async initialize() {
        try {
            console.log('🎬 Initializing Plex Service Manager...');

            // Load active Plex servers
            await this.loadServers();

            // Load Plex packages
            await this.loadPackages();

            this.initialized = true;
            console.log(`✅ Plex Service Manager initialized with ${this.servers.size} servers and ${this.packages.size} packages`);

            return true;

        } catch (error) {
            console.error('❌ Failed to initialize Plex Service Manager:', error);
            throw error;
        }
    }

    /**
     * Load all active Plex servers from database
     */
    async loadServers() {
        try {
            const servers = await this.db.query(`
                SELECT * FROM plex_servers
                WHERE is_active = TRUE
                ORDER BY name
            `);

            this.servers.clear();

            for (const server of servers) {
                this.servers.set(server.id, {
                    id: server.id,
                    name: server.name,
                    url: server.url,
                    server_id: server.server_id,  // Plex machine ID
                    token: server.token,
                    libraries: server.libraries ? JSON.parse(server.libraries) : [],
                    health_status: server.health_status,
                    last_library_sync: server.last_library_sync
                });
            }

            console.log(`✅ Loaded ${this.servers.size} Plex servers from database`);

        } catch (error) {
            console.error('❌ Failed to load Plex servers:', error);
            throw error;
        }
    }

    /**
     * Load all active Plex packages from database
     */
    async loadPackages() {
        try {
            const packages = await this.db.query(`
                SELECT * FROM plex_packages
                WHERE is_active = TRUE
                ORDER BY display_order, name
            `);

            this.packages.clear();

            for (const pkg of packages) {
                this.packages.set(pkg.id, {
                    id: pkg.id,
                    name: pkg.name,
                    description: pkg.description,
                    price: pkg.price,
                    duration_months: pkg.duration_months,
                    server_library_mappings: JSON.parse(pkg.server_library_mappings)
                });
            }

            console.log(`✅ Loaded ${this.packages.size} Plex packages from database`);

        } catch (error) {
            console.error('❌ Failed to load Plex packages:', error);
            throw error;
        }
    }

    /**
     * Get server by ID
     */
    getServer(serverId) {
        return this.servers.get(serverId);
    }

    /**
     * Get all servers
     */
    getAllServers() {
        return Array.from(this.servers.values());
    }

    /**
     * Get package by ID
     */
    getPackage(packageId) {
        return this.packages.get(packageId);
    }

    /**
     * Get all packages
     */
    getAllPackages() {
        return Array.from(this.packages.values());
    }

    /**
     * Share libraries with user based on package
     * @param {String} userEmail - User's Plex email
     * @param {Number} packageId - Plex package ID
     * @param {Number} userId - Our database user ID (for tracking)
     */
    async shareLibrariesByPackage(userEmail, packageId, userId) {
        const pkg = this.getPackage(packageId);
        if (!pkg) {
            throw new Error(`Package ${packageId} not found`);
        }

        console.log(`🎬 Sharing libraries with ${userEmail} using package: ${pkg.name}`);

        const results = [];

        // Process each server in the package
        for (const mapping of pkg.server_library_mappings) {
            const server = this.getServer(mapping.server_id);
            if (!server) {
                console.warn(`⚠️ Server ${mapping.server_id} not found, skipping`);
                continue;
            }

            try {
                const result = await this.shareLibrariesOnServer(
                    userEmail,
                    server,
                    mapping.library_ids
                );

                results.push({
                    server_id: server.id,
                    server_name: server.name,
                    success: result.success,
                    error: result.error
                });

                // Track in database
                await this.db.query(`
                    INSERT INTO user_plex_shares
                    (user_id, plex_server_id, library_ids, share_status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                    ON CONFLICT(user_id, plex_server_id) DO UPDATE SET
                    library_ids = excluded.library_ids,
                    share_status = excluded.share_status,
                    updated_at = datetime('now')
                `, [
                    userId,
                    server.id,
                    JSON.stringify(mapping.library_ids),
                    result.success ? 'active' : 'pending'
                ]);

            } catch (error) {
                console.error(`❌ Failed to share on server ${server.name}:`, error.message);
                results.push({
                    server_id: server.id,
                    server_name: server.name,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ Shared libraries with ${userEmail}: ${successCount}/${results.length} servers successful`);

        return {
            package: pkg.name,
            results,
            allSuccess: successCount === results.length
        };
    }

    /**
     * Share libraries with user on a specific server (manual selection)
     * Used when creating users with manual library selections instead of packages
     * @param {String} userEmail - User's Plex email
     * @param {Number} serverId - Database server ID
     * @param {Array} libraryIds - Array of library IDs to share
     * @param {Number} userId - Our database user ID (for tracking)
     */
    async shareLibrariesToUser(userEmail, serverId, libraryIds, userId = null) {
        const server = this.getServer(serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        console.log(`🎬 Sharing ${libraryIds.length} libraries on ${server.name} with ${userEmail}...`);

        try {
            // Insert as pending first if userId provided
            if (userId && this.db) {
                await this.db.query(`
                    INSERT INTO user_plex_shares
                    (user_id, plex_server_id, library_ids, share_status, shared_at)
                    VALUES (?, ?, ?, 'pending', NOW())
                    ON CONFLICT (user_id, plex_server_id) DO UPDATE SET
                      library_ids = EXCLUDED.library_ids,
                      share_status = EXCLUDED.share_status,
                      shared_at = NOW()
                `, [
                    userId,
                    serverId,
                    JSON.stringify(libraryIds)
                ]);
            }

            // Step 1: Make the actual API call to Plex to invite/share
            console.log(`📤 Step 1: Sending invite to ${userEmail}...`);
            const shareResult = await this.shareLibrariesOnServer(
                userEmail,
                server,
                libraryIds
            );

            // Check if the share call itself failed
            if (!shareResult.success) {
                console.error(`❌ Share libraries failed:`, shareResult.error);
                return shareResult;
            }

            console.log(`✅ Step 1 complete: Invite sent`);

            // Step 2: Verify the invite was created by checking user info
            console.log(`🔍 Step 2: Verifying invite for ${userEmail}...`);
            const verifyResult = await this.checkUserInfo(userEmail, server);

            if (!verifyResult.success) {
                console.error(`❌ Verification failed:`, verifyResult.error);
                return {
                    success: false,
                    error: 'Failed to verify user invite',
                    details: verifyResult
                };
            }

            // Check if user has pending invite
            const hasPendingInvite = verifyResult.data?.user_info?.pending_invite === true;
            const userExists = verifyResult.data?.user_info?.exists === true;

            if (hasPendingInvite || userExists) {
                console.log(`✅ Step 2 complete: User verified (${hasPendingInvite ? 'pending invite' : 'accepted invite'})`);

                // Update status to active if successful and userId provided
                if (userId && this.db) {
                    await this.db.query(`
                        UPDATE user_plex_shares
                        SET share_status = 'active', shared_at = datetime('now')
                        WHERE user_id = ? AND plex_server_id = ?
                    `, [userId, serverId]);
                }

                return {
                    success: true,
                    data: {
                        message: `Successfully invited ${userEmail}`,
                        server: server.name,
                        verified: true,
                        pending_invite: hasPendingInvite,
                        user_exists: userExists
                    }
                };
            } else {
                console.error(`❌ Verification failed: User not found in pending invites or friends list`);
                return {
                    success: false,
                    error: 'User invite could not be verified',
                    details: verifyResult.data
                };
            }

        } catch (error) {
            console.error(`❌ Failed to share libraries on ${server.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Share libraries on a specific server
     * Uses Python plex_service.py for actual Plex API calls
     * Note: Empty libraryIds array will update the user with no libraries on that server
     * but keeps them as a friend on the account (they may still have access to other servers)
     */
    async shareLibrariesOnServer(userEmail, server, libraryIds) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');
            const pythonExecutable = process.env.PYTHON_PATH || 'python3';

            const serverConfig = {
                name: server.name,
                server_id: server.server_id,
                token: server.token
            };

            // Always use share_libraries - it handles empty arrays internally
            // DO NOT use remove_user here as it removes user from entire Plex account
            const args = [
                pythonScript,
                'share_libraries',
                userEmail,
                JSON.stringify(serverConfig),
                JSON.stringify(libraryIds || [])
            ];

            console.log(`🐍 Calling Python service for server ${server.name}...`);
            console.log(`🐍 Python executable: ${pythonExecutable}`);
            console.log(`🐍 Python script: ${pythonScript}`);
            console.log(`🐍 Args: ${JSON.stringify(args)}`);

            const pythonProcess = spawn(pythonExecutable, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                console.log(`🐍 Python stdout: ${output.trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.log(`🐍 Python stderr: ${output.trim()}`);
            });

            pythonProcess.on('close', (code) => {
                console.log(`🐍 Python process exited with code ${code}`);
                console.log(`🐍 Final stdout length: ${stdout.length} bytes`);
                console.log(`🐍 Final stderr length: ${stderr.length} bytes`);

                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        console.log(`✅ Python result parsed successfully:`, JSON.stringify(result, null, 2));
                        resolve({ success: true, data: result });
                    } catch (error) {
                        console.error(`❌ Failed to parse Python stdout as JSON:`, stdout);
                        console.error(`Parse error:`, error.message);
                        resolve({ success: true, data: { message: 'Success' } });
                    }
                } else {
                    console.error(`❌ Python process failed with exit code ${code}`);
                    console.error(`Stderr:`, stderr);
                    resolve({
                        success: false,
                        error: stderr || 'Python process failed'
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to spawn Python process: ${error.message}`));
            });

            // Timeout after 60 seconds
            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Python process timed out after 60 seconds'));
            }, 60000);
        });
    }

    /**
     * Check user info on a specific server (for verification)
     * Uses Python plex_service_v2.py check_user_info command
     */
    async checkUserInfo(userEmail, server) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');
            const pythonExecutable = process.env.PYTHON_PATH || 'python3';

            const serverConfig = {
                name: server.name,
                server_id: server.server_id,
                token: server.token
            };

            const args = [
                pythonScript,
                'check_user_info',
                userEmail,
                JSON.stringify(serverConfig)
            ];

            console.log(`🔍 Calling Python check_user_info for ${userEmail} on ${server.name}...`);

            const pythonProcess = spawn(pythonExecutable, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                console.log(`🐍 Python stdout: ${output.trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.log(`🐍 Python stderr: ${output.trim()}`);
            });

            pythonProcess.on('close', (code) => {
                console.log(`🐍 Python check_user_info exited with code ${code}`);

                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        console.log(`✅ User info result:`, JSON.stringify(result, null, 2));
                        resolve({ success: true, data: result });
                    } catch (error) {
                        console.error(`❌ Failed to parse Python stdout as JSON:`, stdout);
                        resolve({
                            success: false,
                            error: 'Failed to parse verification response'
                        });
                    }
                } else {
                    console.error(`❌ Python check_user_info failed with exit code ${code}`);
                    resolve({
                        success: false,
                        error: stderr || 'User verification failed'
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to spawn Python process: ${error.message}`));
            });

            // Timeout after 20 seconds (reduced from 30s for faster verification)
            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('User verification timed out after 20 seconds'));
            }, 20000);
        });
    }

    /**
     * Uninvite/remove user from a specific server by server ID
     * Used by portal cancel-service and other cleanup operations
     * @param {Number} serverId - Database server ID
     * @param {String} userEmail - User's Plex email
     */
    async uninviteUser(serverId, userEmail) {
        const server = this.getServer(serverId);
        if (!server) {
            // Try loading the server directly if not in cache
            const servers = await this.db.query('SELECT * FROM plex_servers WHERE id = ?', [serverId]);
            if (servers.length === 0) {
                throw new Error(`Server ${serverId} not found`);
            }
            const serverData = servers[0];
            const serverConfig = {
                id: serverData.id,
                name: serverData.name,
                url: serverData.url,
                server_id: serverData.server_id,
                token: serverData.token
            };
            console.log(`🗑️ Uninviting ${userEmail} from server ${serverConfig.name}...`);
            return this.removeUserFromServer(userEmail, serverConfig);
        }

        console.log(`🗑️ Uninviting ${userEmail} from server ${server.name}...`);
        return this.removeUserFromServer(userEmail, server);
    }

    /**
     * Remove user from all servers in package
     */
    async removeUserByPackage(userEmail, packageId, userId) {
        const pkg = this.getPackage(packageId);
        if (!pkg) {
            throw new Error(`Package ${packageId} not found`);
        }

        console.log(`🗑️ Removing ${userEmail} from package: ${pkg.name}`);

        const results = [];

        for (const mapping of pkg.server_library_mappings) {
            const server = this.getServer(mapping.server_id);
            if (!server) continue;

            try {
                await this.removeUserFromServer(userEmail, server);

                results.push({
                    server_id: server.id,
                    server_name: server.name,
                    success: true
                });

                // Update database
                await this.db.query(`
                    UPDATE user_plex_shares
                    SET share_status = 'removed', removed_at = datetime('now'), updated_at = datetime('now')
                    WHERE user_id = ? AND plex_server_id = ?
                `, [userId, server.id]);

            } catch (error) {
                console.error(`❌ Failed to remove from server ${server.name}:`, error.message);
                results.push({
                    server_id: server.id,
                    server_name: server.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return { results };
    }

    /**
     * Remove user from specific server
     */
    async removeUserFromServer(userEmail, server) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');

            const serverConfig = {
                name: server.name,
                server_id: server.server_id,
                token: server.token
            };

            const args = [
                pythonScript,
                'remove_user',
                userEmail,
                JSON.stringify(serverConfig)
            ];

            const pythonExecutable = process.env.PYTHON_PATH || 'python3';
            const pythonProcess = spawn(pythonExecutable, args);
            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: stderr });
                }
            });

            pythonProcess.on('error', (error) => {
                reject(error);
            });

            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Timeout'));
            }, 60000);
        });
    }

    /**
     * Check user invite status across all servers
     */
    async checkUserInviteStatus(userEmail) {
        console.log(`🔍 Checking invite status for ${userEmail} across all servers...`);

        const results = [];

        for (const [serverId, server] of this.servers) {
            try {
                const status = await this.checkInviteOnServer(userEmail, server);
                results.push({
                    server_id: serverId,
                    server_name: server.name,
                    status: status.status,
                    pending: status.pending
                });
            } catch (error) {
                console.error(`❌ Failed to check invite on ${server.name}:`, error.message);
                results.push({
                    server_id: serverId,
                    server_name: server.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Check invite status on specific server
     */
    async checkInviteOnServer(userEmail, server) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');

            const serverConfig = {
                name: server.name,
                server_id: server.server_id,
                token: server.token
            };

            const args = [
                pythonScript,
                'check_invite_status',
                userEmail,
                JSON.stringify(serverConfig)
            ];

            const pythonExecutable = process.env.PYTHON_PATH || 'python3';
            const pythonProcess = spawn(pythonExecutable, args);
            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (error) {
                        resolve({ status: 'unknown', pending: false });
                    }
                } else {
                    resolve({ status: 'error', pending: false, error: stderr });
                }
            });

            pythonProcess.on('error', (error) => {
                reject(error);
            });

            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Timeout'));
            }, 30000);
        });
    }

    /**
     * Sync libraries for a specific server
     */
    async syncServerLibraries(serverId) {
        const server = this.getServer(serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        console.log(`🔄 Syncing libraries for server ${server.name}...`);

        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');

            const serverConfig = {
                name: server.name,
                url: server.url,
                server_id: server.server_id,
                token: server.token
            };

            const args = [
                pythonScript,
                'get_libraries',
                JSON.stringify(serverConfig)
            ];

            const pythonExecutable = process.env.PYTHON_PATH || 'python3';
            const pythonProcess = spawn(pythonExecutable, args);
            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const libraries = JSON.parse(stdout);

                        // Update in database
                        await this.db.query(`
                            UPDATE plex_servers
                            SET libraries = ?,
                                last_library_sync = datetime('now'),
                                health_status = 'online'
                            WHERE id = ?
                        `, [JSON.stringify(libraries), serverId]);

                        // Update in-memory cache
                        server.libraries = libraries;
                        server.last_library_sync = new Date();
                        server.health_status = 'online';

                        console.log(`✅ Synced ${libraries.length} libraries for ${server.name}`);
                        resolve(libraries);

                    } catch (error) {
                        reject(new Error(`Failed to parse libraries: ${error.message}`));
                    }
                } else {
                    await this.db.query(`
                        UPDATE plex_servers
                        SET health_status = 'error'
                        WHERE id = ?
                    `, [serverId]);

                    reject(new Error(stderr || 'Failed to get libraries'));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(error);
            });

            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Timeout'));
            }, 30000);
        });
    }

    /**
     * Sync libraries for all active servers (PARALLEL EXECUTION)
     */
    async syncAllServerLibraries() {
        console.log('🔄 Syncing libraries for all servers in parallel...');

        // Process all servers in parallel using Promise.all
        const results = await Promise.all(
            Array.from(this.servers.entries()).map(async ([serverId, server]) => {
                try {
                    const libraries = await this.syncServerLibraries(serverId);
                    return {
                        server_id: serverId,
                        server_name: server.name,
                        library_count: libraries.length,
                        success: true
                    };
                } catch (error) {
                    console.error(`❌ Failed to sync ${server.name}:`, error.message);
                    return {
                        server_id: serverId,
                        server_name: server.name,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        return results;
    }

    /**
     * Get aggregated stats from all servers
     */
    async getAggregatedStats() {
        const stats = {
            total_servers: this.servers.size,
            online_servers: 0,
            total_libraries: 0,
            servers: []
        };

        for (const [serverId, server] of this.servers) {
            if (server.health_status === 'online') {
                stats.online_servers++;
            }

            stats.total_libraries += server.libraries.length;

            stats.servers.push({
                id: serverId,
                name: server.name,
                library_count: server.libraries.length,
                health_status: server.health_status,
                last_sync: server.last_library_sync
            });
        }

        return stats;
    }

    /**
     * Get all users with watch activity for a specific server
     * Fetches user list, pending invites, and last watch date for each user
     */
    async getAllUsersWithActivity(serverId) {
        const server = this.getServer(serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        console.log(`🔍 Fetching all users and activity for server ${server.name}...`);

        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../../../plex_service_v2.py');
            const pythonExecutable = process.env.PYTHON_PATH || 'python3';

            const serverConfig = {
                name: server.name,
                url: server.url,  // Include server URL for fetching watch history
                server_id: server.server_id,
                token: server.token
            };

            const args = [
                '-u',  // Unbuffered output for proper stdout handling when piped
                pythonScript,
                'get_all_users_with_activity',
                JSON.stringify(serverConfig)
            ];

            console.log(`🐍 Calling Python service for server ${server.name}...`);

            const pythonProcess = spawn(pythonExecutable, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.log(`🐍 Python stderr: ${output.trim()}`);
            });

            pythonProcess.on('close', (code) => {
                console.log(`🐍 Python process exited with code ${code}`);

                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        console.log(`✅ Retrieved ${result.total_users} users and ${result.total_pending} pending invites`);
                        resolve(result);
                    } catch (error) {
                        console.error(`❌ Failed to parse Python stdout as JSON:`, stdout);
                        reject(new Error('Failed to parse user activity response'));
                    }
                } else {
                    console.error(`❌ Python process failed with exit code ${code}`);
                    console.error(`Stderr:`, stderr);
                    reject(new Error(stderr || 'Python process failed'));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to spawn Python process: ${error.message}`));
            });

            // Timeout after 300 seconds (5 minutes)
            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Python process timed out after 300 seconds'));
            }, 300000);
        });
    }

    /**
     * Get all users with activity for all servers (PARALLEL EXECUTION)
     */
    async getAllServersUsersWithActivity() {
        console.log('🔍 Fetching user activity from all servers in parallel...');

        // Process all servers in parallel using Promise.all
        const results = await Promise.all(
            Array.from(this.servers.entries()).map(async ([serverId, server]) => {
                try {
                    const activityData = await this.getAllUsersWithActivity(serverId);
                    return {
                        plex_db_id: serverId,  // Database ID for foreign key
                        server_id: server.server_id,  // Plex machineIdentifier
                        server_name: server.name,
                        success: true,
                        ...activityData
                    };
                } catch (error) {
                    console.error(`❌ Failed to get activity for ${server.name}:`, error.message);
                    return {
                        plex_db_id: serverId,  // Database ID for foreign key
                        server_id: server.server_id,  // Plex machineIdentifier
                        server_name: server.name,
                        success: false,
                        error: error.message,
                        users: [],
                        pending_invites: [],
                        total_users: 0,
                        total_pending: 0
                    };
                }
            })
        );

        return results;
    }
}

module.exports = PlexServiceManager;
