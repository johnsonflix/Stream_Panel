/**
 * IPTV Editor Auto-Updater Scheduled Job
 *
 * Runs periodically (default: every 5 minutes) to check for playlists
 * that need automatic updates based on their schedule settings
 */

const cron = require('node-cron');
const axios = require('axios');
const db = require('../database-config');

// Run every 5 minutes to check for playlists that need updating
const AUTO_UPDATER_CHECK_CRON = process.env.IPTV_EDITOR_AUTO_UPDATER_CRON || '*/5 * * * *'; // Every 5 minutes
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

/**
 * Check for playlists that need auto-updating and trigger them
 */
async function checkAndRunAutoUpdaters() {
    const startTime = Date.now();
    console.log(`[IPTV Auto-Updater] Checking for due playlists at ${new Date().toISOString()}`);

    try {
        // Get all playlists with auto-updater enabled
        const playlists = await db.query(`
            SELECT
                id,
                name,
                auto_updater_enabled,
                auto_updater_schedule_hours,
                last_auto_updater_run,
                auto_updater_status,
                provider_base_url,
                provider_username,
                provider_password
            FROM iptv_editor_playlists
            WHERE auto_updater_enabled = 1
            AND is_active = 1
        `);

        if (playlists.length === 0) {
            console.log(`[IPTV Auto-Updater] No playlists have auto-updater enabled`);
            return;
        }

        console.log(`[IPTV Auto-Updater] Found ${playlists.length} playlist(s) with auto-updater enabled`);

        const now = new Date();
        let triggeredCount = 0;
        let skippedCount = 0;

        for (const playlist of playlists) {
            // Skip if required provider settings are missing
            if (!playlist.provider_base_url || !playlist.provider_username || !playlist.provider_password) {
                console.log(`[IPTV Auto-Updater] ⚠️  Skipping "${playlist.name}" - missing provider settings`);
                skippedCount++;
                continue;
            }

            // Skip if already queued or running
            if (playlist.auto_updater_status === 'queued' || playlist.auto_updater_status === 'running') {
                console.log(`[IPTV Auto-Updater] ⏭️  Skipping "${playlist.name}" - status: ${playlist.auto_updater_status}`);
                skippedCount++;
                continue;
            }

            // Check if it's time to run based on schedule
            const scheduleHours = playlist.auto_updater_schedule_hours || 24;
            // SQLite stores timestamps in UTC - add 'Z' to parse correctly
            const lastRun = playlist.last_auto_updater_run ? new Date(playlist.last_auto_updater_run + 'Z') : null;

            let shouldRun = false;
            let reason = '';

            if (!lastRun) {
                shouldRun = true;
                reason = 'never run before';
            } else {
                const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
                if (hoursSinceLastRun >= scheduleHours) {
                    shouldRun = true;
                    reason = `${Math.round(hoursSinceLastRun * 10) / 10} hours since last run (schedule: every ${scheduleHours} hours)`;
                } else {
                    const hoursRemaining = scheduleHours - hoursSinceLastRun;
                    console.log(`[IPTV Auto-Updater] ⏰ "${playlist.name}" - Next run in ${Math.round(hoursRemaining * 10) / 10} hours`);
                    skippedCount++;
                }
            }

            if (shouldRun) {
                console.log(`[IPTV Auto-Updater] 🚀 Triggering auto-updater for "${playlist.name}" - ${reason}`);

                try {
                    // Call the existing API endpoint to run auto-updater
                    const response = await axios.post(
                        `${API_BASE_URL}/api/v2/iptv-editor/playlists/${playlist.id}/run-auto-updater`,
                        {},
                        { timeout: 10000 } // 10 second timeout for queueing (actual update runs async)
                    );

                    if (response.data.success) {
                        console.log(`[IPTV Auto-Updater] ✅ "${playlist.name}" queued successfully`);
                        triggeredCount++;
                    } else {
                        console.error(`[IPTV Auto-Updater] ❌ Failed to queue "${playlist.name}": ${response.data.message}`);
                    }
                } catch (error) {
                    // Check if it's a 409 conflict (already queued)
                    if (error.response && error.response.status === 409) {
                        console.log(`[IPTV Auto-Updater] ⏭️  "${playlist.name}" already queued or running`);
                        skippedCount++;
                    } else {
                        console.error(`[IPTV Auto-Updater] ❌ Error triggering "${playlist.name}":`, error.message);
                    }
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[IPTV Auto-Updater] Check completed in ${duration}ms`);
        console.log(`[IPTV Auto-Updater] Summary: ${triggeredCount} triggered, ${skippedCount} skipped`);

    } catch (error) {
        console.error(`[IPTV Auto-Updater] Failed:`, error.message);
        if (error.response) {
            console.error(`  - Status: ${error.response.status}`);
            console.error(`  - Data:`, error.response.data);
        }
    }
}

/**
 * Initialize the scheduled job
 */
function initializeIPTVEditorAutoUpdater() {
    console.log(`[IPTV Auto-Updater] Scheduling job with cron: ${AUTO_UPDATER_CHECK_CRON}`);

    // Validate cron expression
    if (!cron.validate(AUTO_UPDATER_CHECK_CRON)) {
        console.error(`[IPTV Auto-Updater] Invalid cron expression: ${AUTO_UPDATER_CHECK_CRON}`);
        console.error(`[IPTV Auto-Updater] Job NOT scheduled. Fix the cron expression in .env`);
        return;
    }

    // Schedule the job
    const task = cron.schedule(AUTO_UPDATER_CHECK_CRON, () => {
        checkAndRunAutoUpdaters();
    });

    console.log(`[IPTV Auto-Updater] Job scheduled successfully - checks every 5 minutes`);
    console.log(`[IPTV Auto-Updater] Skipping startup check - will run on next scheduled interval`);

    return task;
}

module.exports = {
    initializeIPTVEditorAutoUpdater,
    checkAndRunAutoUpdaters
};
