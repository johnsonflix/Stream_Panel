/**
 * Plex Activity Sync Manager
 *
 * Manages background synchronization of Plex user activity across all servers.
 * Tracks watch history, session info, and user statistics.
 */

const { query } = require('../database-config');
const PlexServiceManager = require('./plex/PlexServiceManager');
const { syncAllServersLibraryAccess } = require('../jobs/plex-library-access-sync');

class PlexActivitySyncManager {
    constructor() {
        this.syncStatus = {
            isRunning: false,
            lastSync: null,
            lastSyncStatus: 'idle',
            progress: 0,
            totalServers: 0,
            serversCompleted: 0,
            currentServer: null,
            errors: [],
            usersProcessed: 0
        };
        this.plexManager = null;
    }

    /**
     * Get the current sync status
     */
    getSyncStatus() {
        return {
            ...this.syncStatus,
            lastSync: this.syncStatus.lastSync ? this.syncStatus.lastSync.toISOString() : null
        };
    }

    /**
     * Start activity sync in background for all servers
     * Returns immediately with status while sync runs
     */
    startSyncInBackground() {
        if (this.syncStatus.isRunning) {
            return {
                started: false,
                message: 'Sync already in progress',
                status: this.getSyncStatus()
            };
        }

        // Reset status
        this.syncStatus = {
            isRunning: true,
            lastSync: null,
            lastSyncStatus: 'running',
            progress: 0,
            totalServers: 0,
            serversCompleted: 0,
            currentServer: null,
            errors: [],
            usersProcessed: 0
        };

        // Start sync in background (don't await)
        this.runFullSync().catch(err => {
            console.error('Background activity sync failed:', err);
            this.syncStatus.isRunning = false;
            this.syncStatus.lastSyncStatus = 'error';
            this.syncStatus.errors.push(err.message);
        });

        return {
            started: true,
            message: 'Activity sync started in background',
            status: this.getSyncStatus()
        };
    }

    /**
     * Run full activity sync across all Plex servers
     */
    async runFullSync() {
        try {
            console.log('🔄 Starting Plex activity sync...');

            // Get all active Plex servers
            const servers = await query(`
                SELECT id, name, url, token, server_id
                FROM plex_servers
                WHERE is_active = 1
            `);

            this.syncStatus.totalServers = servers.length;

            if (servers.length === 0) {
                this.syncStatus.isRunning = false;
                this.syncStatus.lastSyncStatus = 'completed';
                this.syncStatus.lastSync = new Date();
                console.log('ℹ️ No active Plex servers to sync');
                return;
            }

            // Initialize PlexServiceManager with all servers
            console.log('🔧 Initializing Plex Service Manager...');
            this.plexManager = new PlexServiceManager({ query });
            // Manually populate the servers Map since we already have the data
            for (const server of servers) {
                this.plexManager.servers.set(server.id, {
                    id: server.id,
                    name: server.name,
                    url: server.url,
                    token: server.token,
                    server_id: server.server_id
                });
            }
            this.plexManager.initialized = true;

            // Process each server sequentially for progress tracking
            for (const server of servers) {
                this.syncStatus.currentServer = server.name;

                try {
                    await this.syncServerActivity(server);
                    this.syncStatus.serversCompleted++;
                    this.syncStatus.progress = Math.round(
                        (this.syncStatus.serversCompleted / this.syncStatus.totalServers) * 100
                    );
                } catch (serverError) {
                    console.error(`Error syncing server ${server.name}:`, serverError);
                    this.syncStatus.errors.push(`${server.name}: ${serverError.message}`);
                    // Still increment completed count so progress moves forward
                    this.syncStatus.serversCompleted++;
                    this.syncStatus.progress = Math.round(
                        (this.syncStatus.serversCompleted / this.syncStatus.totalServers) * 100
                    );
                }
            }

            console.log(`✅ Plex activity sync completed. Processed ${this.syncStatus.usersProcessed} users across ${this.syncStatus.serversCompleted} servers`);

            // Now run library access sync to update which libraries each user has access to
            console.log('🔄 Starting library access sync...');
            this.syncStatus.currentServer = 'Library Access Sync';
            try {
                const libraryAccessResult = await syncAllServersLibraryAccess();
                if (libraryAccessResult.success) {
                    const totalUsersUpdated = libraryAccessResult.results?.reduce((sum, r) => sum + (r.usersUpdated || 0), 0) || 0;
                    console.log(`✅ Library access sync completed. Updated ${totalUsersUpdated} user records`);
                } else {
                    console.error('⚠️ Library access sync completed with issues:', libraryAccessResult.message);
                    this.syncStatus.errors.push(`Library access: ${libraryAccessResult.message}`);
                }
            } catch (libAccessError) {
                console.error('⚠️ Library access sync failed:', libAccessError.message);
                this.syncStatus.errors.push(`Library access: ${libAccessError.message}`);
            }

            // Update completion status
            this.syncStatus.isRunning = false;
            this.syncStatus.lastSync = new Date();
            this.syncStatus.lastSyncStatus = this.syncStatus.errors.length > 0 ? 'completed_with_errors' : 'completed';
            this.syncStatus.currentServer = null;
            this.syncStatus.progress = 100;

        } catch (error) {
            console.error('❌ Plex activity sync failed:', error);
            this.syncStatus.isRunning = false;
            this.syncStatus.lastSyncStatus = 'error';
            this.syncStatus.errors.push(error.message);
            throw error;
        }
    }

    /**
     * Sync activity for a specific server
     * Calls Plex API to get user activity data
     */
    async syncServerActivity(server) {
        console.log(`📊 Syncing activity for server: ${server.name}`);

        try {
            // Call PlexServiceManager to get actual activity data from Plex API
            const activityData = await this.plexManager.getAllUsersWithActivity(server.id);

            console.log(`📥 Retrieved ${activityData.total_users} users from ${server.name}`);

            // Process each user's activity
            for (const user of activityData.users || []) {
                try {
                    // Find or update user share record
                    const existingShare = await query(`
                        SELECT ups.id, u.id as user_id
                        FROM user_plex_shares ups
                        JOIN users u ON ups.user_id = u.id
                        WHERE ups.plex_server_id = ?
                        AND (u.plex_email = ? OR u.plex_username = ?)
                    `, [server.id, user.email, user.username]);

                    if (existingShare.length > 0) {
                        // Update existing share with activity data
                        await query(`
                            UPDATE user_plex_shares
                            SET last_activity_sync = datetime('now'),
                                last_seen = ?
                            WHERE id = ?
                        `, [user.last_seen || null, existingShare[0].id]);
                    }

                    this.syncStatus.usersProcessed++;
                } catch (userError) {
                    console.error(`Error processing user ${user.username || user.email}:`, userError);
                }
            }

            // Update server's last sync timestamp
            await query(`
                UPDATE plex_servers
                SET last_activity_sync = datetime('now')
                WHERE id = ?
            `, [server.id]);

            console.log(`✅ Synced ${activityData.total_users} users for server: ${server.name}`);

        } catch (error) {
            console.error(`❌ Error syncing server ${server.name}:`, error);
            throw error;
        }
    }

    /**
     * Sync activity for a specific user
     */
    async syncUserActivity(userId) {
        console.log(`📊 Syncing activity for user: ${userId}`);

        try {
            // Get user's Plex shares
            const shares = await query(`
                SELECT ups.*, ps.name as server_name, ps.url, ps.token
                FROM user_plex_shares ups
                JOIN plex_servers ps ON ups.plex_server_id = ps.id
                WHERE ups.user_id = ?
                AND ps.is_active = 1
            `, [userId]);

            for (const share of shares) {
                await query(`
                    UPDATE user_plex_shares
                    SET last_activity_sync = datetime('now')
                    WHERE id = ?
                `, [share.id]);
            }

            return {
                success: true,
                message: `Synced activity for ${shares.length} server(s)`
            };

        } catch (error) {
            console.error(`Error syncing user ${userId} activity:`, error);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

// Export singleton instance
const plexActivitySyncManager = new PlexActivitySyncManager();

module.exports = plexActivitySyncManager;
