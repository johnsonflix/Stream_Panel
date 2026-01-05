/**
 * Tag Auto-Assignment Scheduled Job
 *
 * Runs hourly (or as configured) to automatically assign/unassign tags
 * based on user subscriptions to linked Plex servers and IPTV panels
 */

const cron = require('node-cron');
const axios = require('axios');

const TAG_ASSIGNMENT_CRON = process.env.TAG_ASSIGNMENT_CRON || '0 * * * *'; // Every hour at minute 0
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

/**
 * Execute tag auto-assignment by calling the API endpoint
 */
async function runTagAutoAssignment() {
    const startTime = Date.now();
    console.log(`[Tag Auto-Assignment] Starting at ${new Date().toISOString()}`);

    try {
        const response = await axios.post(`${API_BASE_URL}/api/v2/tags/auto-assign`, {}, {
            timeout: 120000 // 2 minute timeout
        });

        const duration = Date.now() - startTime;
        const results = response.data.results;

        console.log(`[Tag Auto-Assignment] Completed in ${duration}ms`);
        console.log(`  - Processed tags: ${results.processed_tags}`);
        console.log(`  - Users assigned: ${results.assigned_count}`);
        console.log(`  - Users unassigned: ${results.unassigned_count}`);
        console.log(`  - Errors: ${results.errors.length}`);

        if (results.errors.length > 0) {
            console.error(`[Tag Auto-Assignment] Errors encountered:`);
            results.errors.forEach(err => {
                console.error(`  - Tag ${err.tag_name}: ${err.error}`);
            });
        }

    } catch (error) {
        console.error(`[Tag Auto-Assignment] Failed:`, error.message);

        if (error.response) {
            console.error(`  - Status: ${error.response.status}`);
            console.error(`  - Data:`, error.response.data);
        }
    }
}

/**
 * Initialize the scheduled job
 */
function initializeTagAutoAssignment() {
    console.log(`[Tag Auto-Assignment] Scheduling job with cron: ${TAG_ASSIGNMENT_CRON}`);

    // Validate cron expression
    if (!cron.validate(TAG_ASSIGNMENT_CRON)) {
        console.error(`[Tag Auto-Assignment] Invalid cron expression: ${TAG_ASSIGNMENT_CRON}`);
        console.error(`[Tag Auto-Assignment] Job NOT scheduled. Fix the cron expression in .env`);
        return;
    }

    // Schedule the job
    const task = cron.schedule(TAG_ASSIGNMENT_CRON, () => {
        runTagAutoAssignment();
    });

    console.log(`[Tag Auto-Assignment] Job scheduled successfully`);
    console.log(`[Tag Auto-Assignment] Next run: ${getNextRunTime(TAG_ASSIGNMENT_CRON)}`);

    // Run immediately on startup (optional - comment out if you don't want this)
    setTimeout(() => {
        console.log(`[Tag Auto-Assignment] Running initial assignment on startup...`);
        runTagAutoAssignment();
    }, 5000); // Wait 5 seconds after startup

    return task;
}

/**
 * Get human-readable next run time for a cron expression
 */
function getNextRunTime(cronExpression) {
    try {
        const parts = cronExpression.split(' ');
        const minute = parts[0];
        const hour = parts[1];

        if (hour === '*') {
            return `Every hour at minute ${minute}`;
        } else {
            return `Daily at ${hour}:${minute.padStart(2, '0')}`;
        }
    } catch {
        return 'See cron expression';
    }
}

module.exports = {
    initializeTagAutoAssignment,
    runTagAutoAssignment
};
