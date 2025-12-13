/**
 * Plex Sync Scheduler
 *
 * Handles scheduled synchronization of Plex servers based on each server's sync_schedule setting.
 * Syncs: libraries, user activity (usernames, last_seen), library access, and watch stats.
 *
 * Sync Schedules:
 * - manual: Only sync when manually triggered
 * - hourly: Sync every hour
 * - daily: Sync once per day (at night)
 * - weekly: Sync once per week
 */

const cron = require('node-cron');
const { query } = require('../database-config');

// Track sync state
let schedulerInitialized = false;
let hourlyJob = null;
let dailyJob = null;
let weeklyJob = null;

// Track currently syncing servers to prevent overlaps
const syncingServers = new Set();

/**
 * Initialize the scheduler with cron jobs for each schedule type
 */
function initializeScheduler() {
    if (schedulerInitialized) {
        console.log('[Plex Sync Scheduler] Already initialized');
        return;
    }

    console.log('[Plex Sync Scheduler] Initializing...');

    // Hourly sync - runs at minute 0 of every hour
    hourlyJob = cron.schedule('0 * * * *', async () => {
        console.log('[Plex Sync Scheduler] Running hourly sync check...');
        await syncServersBySchedule('hourly');
    }, {
        scheduled: true,
        timezone: 'America/Chicago'
    });

    // Daily sync - runs at 4 AM (after watch stats at 3 AM)
    dailyJob = cron.schedule('0 4 * * *', async () => {
        console.log('[Plex Sync Scheduler] Running daily sync check...');
        await syncServersBySchedule('daily');
    }, {
        scheduled: true,
        timezone: 'America/Chicago'
    });

    // Weekly sync - runs at 5 AM on Sundays
    weeklyJob = cron.schedule('0 5 * * 0', async () => {
        console.log('[Plex Sync Scheduler] Running weekly sync check...');
        await syncServersBySchedule('weekly');
    }, {
        scheduled: true,
        timezone: 'America/Chicago'
    });

    schedulerInitialized = true;
    console.log('[Plex Sync Scheduler] Initialized with schedules:');
    console.log('  - Hourly: Every hour at :00');
    console.log('  - Daily: 4:00 AM');
    console.log('  - Weekly: Sunday 5:00 AM');

    // Run initial sync check after a delay to let the server fully start
    setTimeout(async () => {
        console.log('[Plex Sync Scheduler] Running initial sync check on startup...');
        await runStartupSync();
    }, 60000); // 1 minute after startup
}

/**
 * Run sync for servers that may have been missed while server was down
 */
async function runStartupSync() {
    try {
        // Get servers that need syncing based on their schedule and last sync time
        const servers = await query(`
            SELECT id, name, sync_schedule, last_activity_sync
            FROM plex_servers
            WHERE is_active = 1
            AND sync_schedule != 'manual'
        `);

        const now = new Date();

        for (const server of servers) {
            const lastSync = server.last_activity_sync ? new Date(server.last_activity_sync) : null;
            let needsSync = false;

            if (!lastSync) {
                needsSync = true;
            } else {
                const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

                switch (server.sync_schedule) {
                    case 'hourly':
                        needsSync = hoursSinceLastSync >= 1;
                        break;
                    case 'daily':
                        needsSync = hoursSinceLastSync >= 24;
                        break;
                    case 'weekly':
                        needsSync = hoursSinceLastSync >= 168; // 7 days
                        break;
                }
            }

            if (needsSync) {
                console.log(`[Plex Sync Scheduler] Server "${server.name}" needs sync (schedule: ${server.sync_schedule})`);
                await syncServer(server.id);
            }
        }
    } catch (error) {
        console.error('[Plex Sync Scheduler] Startup sync error:', error);
    }
}

/**
 * Sync all servers with a specific schedule
 */
async function syncServersBySchedule(schedule) {
    try {
        const servers = await query(`
            SELECT id, name
            FROM plex_servers
            WHERE is_active = 1
            AND sync_schedule = ?
        `, [schedule]);

        console.log(`[Plex Sync Scheduler] Found ${servers.length} servers with ${schedule} schedule`);

        for (const server of servers) {
            await syncServer(server.id);
        }
    } catch (error) {
        console.error(`[Plex Sync Scheduler] Error syncing ${schedule} servers:`, error);
    }
}

/**
 * Perform full sync for a single server
 * Syncs: libraries, user activity, library access
 */
async function syncServer(serverId) {
    // Prevent concurrent syncs of the same server
    if (syncingServers.has(serverId)) {
        console.log(`[Plex Sync Scheduler] Server ${serverId} is already syncing, skipping...`);
        return;
    }

    syncingServers.add(serverId);

    try {
        // Get server details
        const servers = await query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE id = ?
        `, [serverId]);

        if (servers.length === 0) {
            console.log(`[Plex Sync Scheduler] Server ${serverId} not found`);
            return;
        }

        const server = servers[0];
        console.log(`[Plex Sync Scheduler] Starting full sync for server: ${server.name}`);

        const syncResults = {
            libraries: { success: false, count: 0 },
            userActivity: { success: false, usersProcessed: 0 },
            libraryAccess: { success: false, usersUpdated: 0 }
        };

        // 1. Sync Libraries
        try {
            console.log(`[Plex Sync Scheduler] [${server.name}] Syncing libraries...`);
            const libraryResult = await syncServerLibraries(server);
            syncResults.libraries = { success: true, count: libraryResult.count };
            console.log(`[Plex Sync Scheduler] [${server.name}] Synced ${libraryResult.count} libraries`);
        } catch (error) {
            console.error(`[Plex Sync Scheduler] [${server.name}] Library sync error:`, error.message);
        }

        // 2. Sync User Activity (usernames, last_seen, etc.)
        try {
            console.log(`[Plex Sync Scheduler] [${server.name}] Syncing user activity...`);
            const activityResult = await syncServerUserActivity(server);
            syncResults.userActivity = { success: true, usersProcessed: activityResult.usersProcessed };
            console.log(`[Plex Sync Scheduler] [${server.name}] Synced activity for ${activityResult.usersProcessed} users`);
        } catch (error) {
            console.error(`[Plex Sync Scheduler] [${server.name}] User activity sync error:`, error.message);
        }

        // 3. Sync Library Access (which libraries each user has access to)
        try {
            console.log(`[Plex Sync Scheduler] [${server.name}] Syncing library access...`);
            const accessResult = await syncServerLibraryAccess(server);
            syncResults.libraryAccess = { success: true, usersUpdated: accessResult.usersUpdated };
            console.log(`[Plex Sync Scheduler] [${server.name}] Updated library access for ${accessResult.usersUpdated} users`);
        } catch (error) {
            console.error(`[Plex Sync Scheduler] [${server.name}] Library access sync error:`, error.message);
        }

        // Update last sync timestamp
        await query(`
            UPDATE plex_servers
            SET last_activity_sync = datetime('now')
            WHERE id = ?
        `, [serverId]);

        console.log(`[Plex Sync Scheduler] Completed sync for server: ${server.name}`, syncResults);

    } catch (error) {
        console.error(`[Plex Sync Scheduler] Error syncing server ${serverId}:`, error);
    } finally {
        syncingServers.delete(serverId);
    }
}

/**
 * Sync libraries from a Plex server
 */
async function syncServerLibraries(server) {
    const axios = require('axios');
    const xml2js = require('xml2js');

    try {
        const response = await axios.get(`${server.url}/library/sections`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/xml'
            },
            timeout: 30000
        });

        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(response.data);
        const directories = result.MediaContainer?.Directory || [];
        const dirArray = Array.isArray(directories) ? directories : [directories];

        const libraries = [];
        for (const dir of dirArray) {
            if (dir && dir.$) {
                libraries.push({
                    key: dir.$.key,
                    title: dir.$.title,
                    type: dir.$.type,
                    uuid: dir.$.uuid
                });
            }
        }

        // Update database
        await query(`
            UPDATE plex_servers
            SET libraries = ?,
                last_library_sync = datetime('now'),
                health_status = 'online'
            WHERE id = ?
        `, [JSON.stringify(libraries), server.id]);

        return { count: libraries.length };

    } catch (error) {
        // Update health status to error if server is unreachable
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            await query(`
                UPDATE plex_servers
                SET health_status = 'offline'
                WHERE id = ?
            `, [server.id]);
        }
        throw error;
    }
}

/**
 * Sync user activity (usernames, last_seen) from Plex server
 */
async function syncServerUserActivity(server) {
    const { spawn } = require('child_process');
    const path = require('path');

    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../../plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        const serverConfig = JSON.stringify({
            name: server.name,
            url: server.url,
            server_id: server.server_id,
            token: server.token
        });

        const pythonProcess = spawn(pythonExecutable, [
            pythonScript,
            'get_all_users_with_activity',
            serverConfig
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
                console.error(`[Plex Sync Scheduler] Python script error:`, stderr);
                reject(new Error(`Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);

                if (!result.success) {
                    reject(new Error(result.message || 'Failed to get user activity'));
                    return;
                }

                // Update plex_user_activity table and user records
                let usersProcessed = 0;

                for (const user of result.users || []) {
                    try {
                        // Upsert into plex_user_activity table
                        await query(`
                            INSERT INTO plex_user_activity (
                                plex_server_id, plex_user_email, plex_username,
                                last_seen_at, days_since_last_activity,
                                is_pending_invite, is_active_friend, synced_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                            ON CONFLICT(plex_server_id, plex_user_email) DO UPDATE SET
                                plex_username = excluded.plex_username,
                                last_seen_at = excluded.last_seen_at,
                                days_since_last_activity = excluded.days_since_last_activity,
                                is_pending_invite = excluded.is_pending_invite,
                                is_active_friend = excluded.is_active_friend,
                                synced_at = datetime('now'),
                                updated_at = datetime('now')
                        `, [
                            server.id,
                            user.email?.toLowerCase(),
                            user.username,
                            user.last_seen_at,
                            user.days_since_last_activity,
                            user.is_pending_invite ? 1 : 0,
                            user.is_active_friend ? 1 : 0
                        ]);

                        // Also update user record if we can match by plex_email
                        await query(`
                            UPDATE users
                            SET plex_username = ?,
                                updated_at = datetime('now')
                            WHERE plex_email = ?
                            AND (plex_username IS NULL OR plex_username != ?)
                        `, [user.username, user.email?.toLowerCase(), user.username]);

                        // Update user_plex_shares with last_seen
                        await query(`
                            UPDATE user_plex_shares
                            SET last_seen = ?,
                                last_activity_sync = datetime('now')
                            WHERE plex_server_id = ?
                            AND user_id IN (SELECT id FROM users WHERE plex_email = ?)
                        `, [user.last_seen_at, server.id, user.email?.toLowerCase()]);

                        usersProcessed++;
                    } catch (userError) {
                        console.error(`[Plex Sync Scheduler] Error processing user ${user.email}:`, userError.message);
                    }
                }

                // Process pending invites
                for (const invite of result.pending_invites || []) {
                    try {
                        await query(`
                            INSERT INTO plex_user_activity (
                                plex_server_id, plex_user_email, plex_username,
                                is_pending_invite, is_active_friend, synced_at
                            ) VALUES (?, ?, ?, 1, 0, datetime('now'))
                            ON CONFLICT(plex_server_id, plex_user_email) DO UPDATE SET
                                plex_username = excluded.plex_username,
                                is_pending_invite = 1,
                                synced_at = datetime('now'),
                                updated_at = datetime('now')
                        `, [
                            server.id,
                            invite.email?.toLowerCase(),
                            invite.username
                        ]);
                    } catch (inviteError) {
                        console.error(`[Plex Sync Scheduler] Error processing invite ${invite.email}:`, inviteError.message);
                    }
                }

                resolve({ usersProcessed });

            } catch (parseError) {
                console.error('[Plex Sync Scheduler] Error parsing Python output:', parseError);
                reject(parseError);
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[Plex Sync Scheduler] Failed to start Python process:', error);
            reject(error);
        });
    });
}

/**
 * Sync library access for users on a Plex server
 */
async function syncServerLibraryAccess(server) {
    const { spawn } = require('child_process');
    const path = require('path');

    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '../../plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        const serverConfig = JSON.stringify({
            name: server.name,
            url: server.url,
            server_id: server.server_id,
            token: server.token
        });

        const pythonProcess = spawn(pythonExecutable, [
            pythonScript,
            'get_all_users_with_library_access',
            serverConfig
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
                console.error(`[Plex Sync Scheduler] Python script error:`, stderr);
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

                for (const user of result.users || []) {
                    try {
                        // Update user_plex_shares with current library access
                        const existingShares = await query(`
                            SELECT ups.id, u.id as user_id
                            FROM user_plex_shares ups
                            JOIN users u ON ups.user_id = u.id
                            WHERE ups.plex_server_id = ?
                            AND u.plex_email = ?
                        `, [server.id, user.email?.toLowerCase()]);

                        if (existingShares.length > 0) {
                            // Update existing share with library IDs
                            const libraryIds = (user.library_ids || []).map(id => String(id));
                            await query(`
                                UPDATE user_plex_shares
                                SET library_ids = ?,
                                    updated_at = datetime('now')
                                WHERE id = ?
                            `, [JSON.stringify(libraryIds), existingShares[0].id]);
                            usersUpdated++;
                        }
                    } catch (userError) {
                        console.error(`[Plex Sync Scheduler] Error updating library access for ${user.email}:`, userError.message);
                    }
                }

                resolve({ usersUpdated });

            } catch (parseError) {
                console.error('[Plex Sync Scheduler] Error parsing Python output:', parseError);
                reject(parseError);
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[Plex Sync Scheduler] Failed to start Python process:', error);
            reject(error);
        });
    });
}

/**
 * Manually trigger sync for a specific server
 */
async function triggerServerSync(serverId) {
    console.log(`[Plex Sync Scheduler] Manual sync triggered for server ${serverId}`);
    await syncServer(serverId);
}

/**
 * Manually trigger sync for all servers (ignores schedule)
 */
async function triggerAllServersSync() {
    console.log('[Plex Sync Scheduler] Manual sync triggered for all servers');

    const servers = await query(`
        SELECT id, name
        FROM plex_servers
        WHERE is_active = 1
    `);

    for (const server of servers) {
        await syncServer(server.id);
    }
}

/**
 * Get current sync status
 */
function getSyncStatus() {
    return {
        initialized: schedulerInitialized,
        currentlySyncing: Array.from(syncingServers),
        schedules: {
            hourly: 'Every hour at :00',
            daily: '4:00 AM daily',
            weekly: 'Sunday 5:00 AM'
        }
    };
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    if (hourlyJob) {
        hourlyJob.stop();
        hourlyJob = null;
    }
    if (dailyJob) {
        dailyJob.stop();
        dailyJob = null;
    }
    if (weeklyJob) {
        weeklyJob.stop();
        weeklyJob = null;
    }
    schedulerInitialized = false;
    console.log('[Plex Sync Scheduler] Stopped');
}

module.exports = {
    initializeScheduler,
    stopScheduler,
    triggerServerSync,
    triggerAllServersSync,
    getSyncStatus,
    syncServer,
    syncServerLibraryAccess
};
