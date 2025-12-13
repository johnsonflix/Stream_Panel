/**
 * Service Cancellation Processor Job
 *
 * Runs daily to process scheduled service deletions.
 * Checks for users with scheduled deletion dates that have passed
 * and performs the actual service removal.
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const db = require('../database-config');
const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
const IPTVEditorService = require('../services/iptv-editor-service');

// Run daily at 2 AM
const CANCELLATION_PROCESSOR_CRON = process.env.SERVICE_CANCELLATION_CRON || '0 2 * * *';

// IPTV Manager instance
let iptvManager;

/**
 * Helper: Remove user from a Plex server via Python
 */
function removeUserFromPlexServer(userEmail, serverConfig) {
    return new Promise((resolve, reject) => {
        // Script is at v2/plex_service_v2.py, we're in v2/backend/jobs/
        const pythonScript = path.join(__dirname, '..', '..', 'plex_service_v2.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';

        // Use share_libraries with empty array to remove access from specific server
        const args = [
            pythonScript,
            'share_libraries',
            userEmail,
            JSON.stringify(serverConfig),
            JSON.stringify([])  // Empty array removes all library access
        ];

        console.log(`[Cancellation] Removing ${userEmail} from Plex server ${serverConfig.name}...`);

        const pythonProcess = spawn(pythonExecutable, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

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
                console.log(`[Cancellation] Successfully removed ${userEmail} from ${serverConfig.name}`);
                resolve({ success: true });
            } else {
                console.error(`[Cancellation] Failed to remove user: ${stderr}`);
                resolve({ success: false, error: stderr });
            }
        });

        pythonProcess.on('error', (error) => {
            console.error(`[Cancellation] Failed to spawn Python: ${error.message}`);
            resolve({ success: false, error: error.message });
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            pythonProcess.kill();
            resolve({ success: false, error: 'Timeout' });
        }, 60000);
    });
}

/**
 * Process a single Plex cancellation
 */
async function processPlexCancellation(user) {
    console.log(`[Cancellation] Processing Plex deletion for user ${user.id} (${user.email})`);

    try {
        // Get user's Plex shares
        const plexShares = await db.query(`
            SELECT ups.*, ps.token, ps.url, ps.name as server_name, ps.server_id as plex_server_machine_id
            FROM user_plex_shares ups
            JOIN plex_servers ps ON ups.plex_server_id = ps.id
            WHERE ups.user_id = ?
        `, [user.id]);

        // Remove from each Plex server
        for (const share of plexShares) {
            if (share.token && user.plex_email) {
                const serverConfig = {
                    name: share.server_name,
                    server_id: share.plex_server_machine_id,
                    url: share.url,
                    token: share.token
                };
                await removeUserFromPlexServer(user.plex_email, serverConfig);
            }
        }

        // Update user - disable Plex and clear cancellation fields
        await db.query(`
            UPDATE users
            SET plex_enabled = 0,
                plex_package_id = NULL,
                plex_email = NULL,
                plex_expiration_date = NULL,
                plex_cancelled_at = NULL,
                plex_scheduled_deletion = NULL,
                plex_cancellation_reason = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `, [user.id]);

        // Mark shares as removed
        await db.query(`
            UPDATE user_plex_shares
            SET share_status = 'removed', updated_at = datetime('now')
            WHERE user_id = ?
        `, [user.id]);

        // Cancel any portal service requests for Plex
        await db.query(`
            UPDATE portal_service_requests
            SET payment_status = 'cancelled',
                admin_notes = COALESCE(admin_notes, '') || ' [Auto-cancelled: Service deleted by cancellation job]',
                updated_at = datetime('now')
            WHERE user_id = ? AND service_type = 'plex'
            AND payment_status IN ('pending', 'submitted', 'verified')
        `, [user.id]);

        console.log(`[Cancellation] Plex deletion completed for user ${user.id}`);
        return { success: true };

    } catch (error) {
        console.error(`[Cancellation] Failed to process Plex deletion for user ${user.id}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Process a single IPTV cancellation
 */
async function processIPTVCancellation(user) {
    console.log(`[Cancellation] Processing IPTV deletion for user ${user.id} (${user.email})`);

    try {
        // If user has direct IPTV panel line, delete it
        if (user.iptv_enabled && user.iptv_panel_id && user.iptv_line_id) {
            try {
                if (iptvManager) {
                    await iptvManager.deleteUserFromPanel(user.iptv_panel_id, user.iptv_line_id);
                    console.log(`[Cancellation] Deleted IPTV line ${user.iptv_line_id} from panel`);
                }
            } catch (err) {
                console.error(`[Cancellation] Failed to delete IPTV line:`, err.message);
            }
        }

        // If user has IPTV Editor, delete their editor account
        if (user.iptv_editor_enabled) {
            try {
                const editorUsers = await db.query(`
                    SELECT ieu.*, iep.bearer_token
                    FROM iptv_editor_users ieu
                    JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                    WHERE ieu.user_id = ?
                `, [user.id]);

                for (const editorUser of editorUsers) {
                    if (editorUser.iptv_editor_id && editorUser.bearer_token) {
                        const editorService = new IPTVEditorService();
                        await editorService.deleteUser(editorUser.bearer_token, editorUser.iptv_editor_id);
                        console.log(`[Cancellation] Deleted IPTV Editor user ${editorUser.iptv_editor_id}`);
                    }
                }
            } catch (err) {
                console.error(`[Cancellation] Failed to delete IPTV Editor:`, err.message);
            }
        }

        // Update user - disable IPTV and clear cancellation fields
        await db.query(`
            UPDATE users
            SET iptv_enabled = 0,
                iptv_editor_enabled = 0,
                iptv_panel_id = NULL,
                iptv_username = NULL,
                iptv_password = NULL,
                iptv_line_id = NULL,
                iptv_m3u_url = NULL,
                iptv_connections = NULL,
                iptv_subscription_plan_id = NULL,
                iptv_expiration_date = NULL,
                iptv_editor_m3u_url = NULL,
                iptv_editor_epg_url = NULL,
                iptv_cancelled_at = NULL,
                iptv_scheduled_deletion = NULL,
                iptv_cancellation_reason = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `, [user.id]);

        // Delete IPTV Editor user record
        await db.query('DELETE FROM iptv_editor_users WHERE user_id = ?', [user.id]);

        // Cancel any portal service requests for IPTV
        await db.query(`
            UPDATE portal_service_requests
            SET payment_status = 'cancelled',
                admin_notes = COALESCE(admin_notes, '') || ' [Auto-cancelled: Service deleted by cancellation job]',
                updated_at = datetime('now')
            WHERE user_id = ? AND service_type = 'iptv'
            AND payment_status IN ('pending', 'submitted', 'verified')
        `, [user.id]);

        console.log(`[Cancellation] IPTV deletion completed for user ${user.id}`);
        return { success: true };

    } catch (error) {
        console.error(`[Cancellation] Failed to process IPTV deletion for user ${user.id}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Process all scheduled service deletions
 */
async function processScheduledDeletions() {
    const startTime = Date.now();
    console.log(`[Cancellation] Starting scheduled deletion check at ${new Date().toISOString()}`);

    try {
        // Initialize IPTV Manager if not already done
        if (!iptvManager) {
            iptvManager = new IPTVServiceManager(db);
            await iptvManager.initialize();
        }

        const now = new Date().toISOString();

        // Find users with scheduled Plex deletions that are due
        const plexDeletions = await db.query(`
            SELECT id, name, email, plex_email, plex_scheduled_deletion
            FROM users
            WHERE plex_enabled = 1
            AND plex_scheduled_deletion IS NOT NULL
            AND datetime(plex_scheduled_deletion) <= datetime(?)
        `, [now]);

        console.log(`[Cancellation] Found ${plexDeletions.length} Plex deletion(s) to process`);

        let plexSuccess = 0;
        let plexFailed = 0;

        for (const user of plexDeletions) {
            const result = await processPlexCancellation(user);
            if (result.success) {
                plexSuccess++;
            } else {
                plexFailed++;
            }
        }

        // Find users with scheduled IPTV deletions that are due
        const iptvDeletions = await db.query(`
            SELECT id, name, email, iptv_enabled, iptv_editor_enabled,
                   iptv_panel_id, iptv_line_id, iptv_scheduled_deletion
            FROM users
            WHERE (iptv_enabled = 1 OR iptv_editor_enabled = 1)
            AND iptv_scheduled_deletion IS NOT NULL
            AND datetime(iptv_scheduled_deletion) <= datetime(?)
        `, [now]);

        console.log(`[Cancellation] Found ${iptvDeletions.length} IPTV deletion(s) to process`);

        let iptvSuccess = 0;
        let iptvFailed = 0;

        for (const user of iptvDeletions) {
            const result = await processIPTVCancellation(user);
            if (result.success) {
                iptvSuccess++;
            } else {
                iptvFailed++;
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[Cancellation] Completed in ${duration}ms`);
        console.log(`[Cancellation] Summary: Plex: ${plexSuccess} success, ${plexFailed} failed | IPTV: ${iptvSuccess} success, ${iptvFailed} failed`);

    } catch (error) {
        console.error(`[Cancellation] Fatal error:`, error.message);
    }
}

/**
 * Initialize the scheduled job
 */
function initializeServiceCancellationProcessor() {
    console.log(`[Cancellation] Scheduling job with cron: ${CANCELLATION_PROCESSOR_CRON}`);

    // Validate cron expression
    if (!cron.validate(CANCELLATION_PROCESSOR_CRON)) {
        console.error(`[Cancellation] Invalid cron expression: ${CANCELLATION_PROCESSOR_CRON}`);
        return;
    }

    // Schedule the job
    const task = cron.schedule(CANCELLATION_PROCESSOR_CRON, () => {
        processScheduledDeletions();
    });

    console.log(`[Cancellation] Job scheduled successfully - runs daily at 2 AM`);

    return task;
}

module.exports = {
    initializeServiceCancellationProcessor,
    processScheduledDeletions,
    processPlexCancellation,
    processIPTVCancellation
};
