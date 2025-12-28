/**
 * Watch Stats Auto Refresh Job
 *
 * Runs daily at 3 AM to refresh Plex watch statistics.
 * This ensures watch stats are always up-to-date even when no one visits the dashboard.
 */

const cron = require('node-cron');

let watchStatsRefreshJob = null;

function initializeWatchStatsAutoRefresh() {
    console.log('[Watch Stats Auto Refresh] Initializing...');

    // Run daily at 3 AM
    const cronSchedule = '0 3 * * *';

    watchStatsRefreshJob = cron.schedule(cronSchedule, async () => {
        console.log('[Watch Stats Auto Refresh] Starting scheduled refresh...');
        await refreshWatchStats();
    }, {
        scheduled: true,
        timezone: 'America/Chicago'  // Adjust to your timezone
    });

    console.log('[Watch Stats Auto Refresh] Job scheduled - runs daily at 3 AM');
    console.log('[Watch Stats Auto Refresh] Startup refresh disabled - stats only refresh at 3 AM or manual trigger');
}

async function refreshWatchStats() {
    try {
        const { refreshWatchStatsInBackground } = require('../watch-stats-refresh');
        await refreshWatchStatsInBackground();
        console.log('[Watch Stats Auto Refresh] ✓ Refresh completed');
    } catch (error) {
        console.error('[Watch Stats Auto Refresh] Error:', error.message);
    }
}

function stopWatchStatsAutoRefresh() {
    if (watchStatsRefreshJob) {
        watchStatsRefreshJob.stop();
        watchStatsRefreshJob = null;
        console.log('[Watch Stats Auto Refresh] Job stopped');
    }
}

module.exports = {
    initializeWatchStatsAutoRefresh,
    stopWatchStatsAutoRefresh,
    refreshWatchStats
};
