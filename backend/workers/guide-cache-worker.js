/**
 * Guide Cache Worker
 *
 * Runs EPG caching in a SEPARATE Node.js process to avoid blocking the main app.
 * Uses IPC messages to communicate progress back to the parent process.
 *
 * This worker handles:
 * - Full refresh of all panels and playlists
 * - Single panel refresh
 * - Single playlist refresh
 * - Pre-loading EPG data into memory cache
 */

const path = require('path');
const Database = require('better-sqlite3');

// Set up paths relative to this worker file
const BACKEND_DIR = path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(BACKEND_DIR, 'subsapp_v2.db');

// Import the job class
const GuideCacheRefreshJob = require('../jobs/guide-cache-refresh');

/**
 * Send progress update to parent process
 */
function sendProgress(type, data) {
    if (process.send) {
        process.send({ type, ...data });
    }
}

/**
 * Run full refresh for all panels and playlists
 */
async function runFullRefresh() {
    sendProgress('status', { status: 'running', message: 'Starting full EPG cache refresh...' });

    try {
        const job = new GuideCacheRefreshJob();

        // Refresh panels
        sendProgress('status', { status: 'running', message: 'Refreshing IPTV Panel EPG caches...' });
        const panelResults = await job.refreshAllPanels();
        sendProgress('progress', {
            stage: 'panels',
            success: panelResults.success,
            total: panelResults.total,
            failed: panelResults.failed,
            skipped: panelResults.skipped || 0
        });

        // Refresh playlists
        sendProgress('status', { status: 'running', message: 'Refreshing IPTV Editor Playlist EPG caches...' });
        const playlistResults = await job.refreshAllPlaylists();
        sendProgress('progress', {
            stage: 'playlists',
            success: playlistResults.success,
            total: playlistResults.total,
            failed: playlistResults.failed
        });

        job.close();

        const summary = {
            panels: panelResults,
            playlists: playlistResults,
            totalSuccess: panelResults.success + playlistResults.success,
            totalFailed: panelResults.failed + playlistResults.failed
        };

        sendProgress('complete', {
            success: true,
            summary,
            message: `EPG cache refresh completed: ${summary.totalSuccess} successful, ${summary.totalFailed} failed`
        });

        return summary;

    } catch (error) {
        sendProgress('error', {
            success: false,
            error: error.message,
            message: `EPG cache refresh failed: ${error.message}`
        });
        throw error;
    }
}

/**
 * Refresh a single panel's EPG cache
 */
async function refreshPanel(panelId) {
    sendProgress('status', { status: 'running', message: `Refreshing EPG cache for panel ${panelId}...` });

    try {
        const job = new GuideCacheRefreshJob();
        const result = await job.refreshPanel(panelId);
        job.close();

        sendProgress('complete', {
            success: result.success,
            panelId,
            result,
            message: result.success
                ? `Panel ${panelId} EPG cache refreshed successfully`
                : `Panel ${panelId} EPG cache refresh failed: ${result.error}`
        });

        return result;

    } catch (error) {
        sendProgress('error', {
            success: false,
            panelId,
            error: error.message,
            message: `Panel ${panelId} EPG cache refresh failed: ${error.message}`
        });
        throw error;
    }
}

/**
 * Refresh a single playlist's EPG cache
 */
async function refreshPlaylist(playlistId) {
    sendProgress('status', { status: 'running', message: `Refreshing EPG cache for playlist ${playlistId}...` });

    try {
        const job = new GuideCacheRefreshJob();
        const result = await job.refreshPlaylist(playlistId);
        job.close();

        sendProgress('complete', {
            success: result.success,
            playlistId,
            result,
            message: result.success
                ? `Playlist ${playlistId} EPG cache refreshed successfully`
                : `Playlist ${playlistId} EPG cache refresh failed: ${result.error}`
        });

        return result;

    } catch (error) {
        sendProgress('error', {
            success: false,
            playlistId,
            error: error.message,
            message: `Playlist ${playlistId} EPG cache refresh failed: ${error.message}`
        });
        throw error;
    }
}

/**
 * Refresh all panels only (used by scheduled job)
 */
async function refreshAllPanels() {
    sendProgress('status', { status: 'running', message: 'Refreshing all IPTV Panel EPG caches...' });

    try {
        const job = new GuideCacheRefreshJob();
        const results = await job.refreshAllPanels();
        job.close();

        sendProgress('complete', {
            success: true,
            results,
            message: `Panel EPG cache refresh completed: ${results.success}/${results.total} successful`
        });

        return results;

    } catch (error) {
        sendProgress('error', {
            success: false,
            error: error.message,
            message: `Panel EPG cache refresh failed: ${error.message}`
        });
        throw error;
    }
}

/**
 * Refresh all playlists only
 */
async function refreshAllPlaylists() {
    sendProgress('status', { status: 'running', message: 'Refreshing all IPTV Editor Playlist EPG caches...' });

    try {
        const job = new GuideCacheRefreshJob();
        const results = await job.refreshAllPlaylists();
        job.close();

        sendProgress('complete', {
            success: true,
            results,
            message: `Playlist EPG cache refresh completed: ${results.success}/${results.total} successful`
        });

        return results;

    } catch (error) {
        sendProgress('error', {
            success: false,
            error: error.message,
            message: `Playlist EPG cache refresh failed: ${error.message}`
        });
        throw error;
    }
}

// Handle messages from parent process
process.on('message', async (msg) => {
    console.log(`[Guide Cache Worker] Received command: ${msg.command}`);

    try {
        switch (msg.command) {
            case 'fullRefresh':
                await runFullRefresh();
                break;

            case 'refreshPanel':
                await refreshPanel(msg.panelId);
                break;

            case 'refreshPlaylist':
                await refreshPlaylist(msg.playlistId);
                break;

            case 'refreshAllPanels':
                await refreshAllPanels();
                break;

            case 'refreshAllPlaylists':
                await refreshAllPlaylists();
                break;

            default:
                sendProgress('error', {
                    success: false,
                    error: `Unknown command: ${msg.command}`
                });
        }
    } catch (error) {
        console.error(`[Guide Cache Worker] Error:`, error);
        // Error already sent via sendProgress in the individual functions
    }

    // Exit after completing the task (parent will spawn new worker for next task)
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Guide Cache Worker] Uncaught exception:', error);
    sendProgress('error', {
        success: false,
        error: error.message,
        message: `Worker crashed: ${error.message}`
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Guide Cache Worker] Unhandled rejection:', reason);
    sendProgress('error', {
        success: false,
        error: String(reason),
        message: `Worker promise rejection: ${reason}`
    });
    process.exit(1);
});

console.log('[Guide Cache Worker] Started and waiting for commands...');
sendProgress('ready', { message: 'Guide cache worker ready' });
