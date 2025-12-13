/**
 * Plex Auto Sync Job
 *
 * This job is now a wrapper that initializes the plex-sync-scheduler.
 * The actual sync scheduling and execution is handled by plex-sync-scheduler.js
 *
 * Syncs for each server based on its sync_schedule setting:
 * - Libraries (from direct server connection)
 * - User Activity (usernames, last_seen from Plex API)
 * - Library Access (which libraries each user has access to)
 */

const { initializeScheduler, getSyncStatus, triggerServerSync, triggerAllServersSync } = require('../services/plex-sync-scheduler');

/**
 * Initialize the Plex auto sync job
 * This starts the scheduler which handles hourly/daily/weekly syncs
 */
function initializePlexAutoSync() {
    console.log('[Plex Auto Sync] Initializing...');
    initializeScheduler();
    console.log('[Plex Auto Sync] Scheduler initialized');
}

/**
 * Get the current sync status
 */
function getPlexSyncStatus() {
    return getSyncStatus();
}

/**
 * Manually trigger a sync for a specific server
 */
async function manualSyncServer(serverId) {
    return await triggerServerSync(serverId);
}

/**
 * Manually trigger a sync for all servers
 */
async function manualSyncAllServers() {
    return await triggerAllServersSync();
}

module.exports = {
    initializePlexAutoSync,
    getPlexSyncStatus,
    manualSyncServer,
    manualSyncAllServers
};
