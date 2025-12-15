/**
 * Job Processor
 *
 * Handles background job tracking for user creation/provisioning
 */

const db = require('../database-config');

/**
 * Convert a Date object to YYYY-MM-DD format using local timezone
 * This ensures expiration dates are consistent with the server's timezone (Central Time)
 */
function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

class JobProcessor {
    constructor() {
        this.jobs = new Map();
        this.queue = [];
        this.plexManager = null;
        this.iptvManager = null;
    }

    /**
     * Set service managers (called after they're initialized)
     */
    setServiceManagers(plexManager, iptvManager) {
        this.plexManager = plexManager;
        this.iptvManager = iptvManager;
    }

    /**
     * Create a new job for tracking user provisioning
     * @param {number} userId - The user ID this job is for
     * @returns {string} - The job ID
     */
    createJob(userId) {
        const jobId = `job_${Date.now()}_${userId}`;
        this.jobs.set(jobId, {
            id: jobId,
            userId,
            status: 'pending',
            stages: {},
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log(`[JobProcessor] Created job ${jobId} for user ${userId}`);
        return jobId;
    }

    /**
     * Update the status of a specific stage in a job
     * @param {string} jobId - The job ID
     * @param {string} stage - The stage name (e.g., 'user', 'plex', 'iptv')
     * @param {string} status - The status ('pending', 'processing', 'completed', 'failed')
     * @param {string} message - Optional message
     */
    updateJobStatus(jobId, stage, status, message = '') {
        const job = this.jobs.get(jobId);
        if (job) {
            job.stages[stage] = {
                status,
                message,
                updatedAt: new Date()
            };
            job.updatedAt = new Date();

            // Update overall job status based on stages
            const stageStatuses = Object.values(job.stages).map(s => s.status);
            if (stageStatuses.every(s => s === 'completed')) {
                job.status = 'completed';
            } else if (stageStatuses.some(s => s === 'failed')) {
                job.status = 'failed';
            } else if (stageStatuses.some(s => s === 'processing')) {
                job.status = 'processing';
            }

            console.log(`[JobProcessor] Job ${jobId} stage "${stage}": ${status} - ${message}`);
        }
    }

    /**
     * Get job status
     * @param {string} jobId - The job ID
     * @returns {object|null} - The job object or null if not found
     */
    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    /**
     * Get job status in API-friendly format
     * @param {string} jobId - The job ID
     * @returns {object} - Status object with success flag
     */
    getJobStatus(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return {
                success: false,
                message: 'Job not found'
            };
        }

        return {
            success: true,
            job_id: job.id,
            status: job.status,
            stages: job.stages,
            userId: job.userId,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt
        };
    }

    /**
     * Legacy method for adding jobs to queue
     */
    async addJob(jobType, data) {
        console.log(`[JobProcessor] Job added: ${jobType}`, data);
        return { id: Date.now(), type: jobType };
    }

    async processJobs() {
        console.log('[JobProcessor] Processing jobs');
    }

    /**
     * Clean up old jobs (older than 1 hour)
     */
    cleanup() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        for (const [jobId, job] of this.jobs.entries()) {
            if (job.createdAt < oneHourAgo) {
                this.jobs.delete(jobId);
            }
        }
    }

    /**
     * Process user creation jobs (Plex, IPTV, IPTV Editor provisioning)
     * Runs asynchronously in the background
     */
    async processUserCreationJobs(jobId, userData, jobConfig) {
        console.log(`[JobProcessor] Starting background processing for job ${jobId}`);

        // Store IPTV credentials from panel creation to pass to IPTV Editor if needed
        let iptvCredentials = null;

        // Process Plex
        if (jobConfig.plex) {
            this.updateJobStatus(jobId, 'plex', 'processing', 'Inviting to Plex servers...');
            try {
                if (this.plexManager) {
                    const plexEmail = jobConfig.plex.email || userData.email;
                    const userId = jobConfig.plex.userId || userData.user_id;
                    let plexSuccess = true;
                    let plexErrors = [];

                    // Check if using package-based provisioning or manual server selection
                    if (jobConfig.plex.packageId) {
                        // Package-based provisioning
                        console.log(`[JobProcessor] Using package-based Plex provisioning with package ${jobConfig.plex.packageId}`);
                        const plexResult = await this.plexManager.shareLibrariesByPackage(
                            plexEmail,
                            jobConfig.plex.packageId,
                            userId
                        );
                        plexSuccess = plexResult.allSuccess;
                        if (!plexSuccess) {
                            plexErrors = plexResult.results.filter(r => !r.success).map(r => r.error);
                        }
                    } else if (jobConfig.plex.serverConfigs && jobConfig.plex.serverConfigs.length > 0) {
                        // Manual server/library selection - run in parallel for speed
                        console.log(`[JobProcessor] Using manual Plex server selection with ${jobConfig.plex.serverConfigs.length} servers (parallel)`);

                        const serverPromises = jobConfig.plex.serverConfigs.map(async (serverConfig) => {
                            try {
                                console.log(`[JobProcessor] Sharing libraries on server ${serverConfig.serverId}:`, serverConfig.libraryIds);
                                const result = await this.plexManager.shareLibrariesToUser(
                                    plexEmail,
                                    serverConfig.serverId,
                                    serverConfig.libraryIds,
                                    userId
                                );
                                return { serverId: serverConfig.serverId, success: result.success, error: result.error };
                            } catch (serverError) {
                                return { serverId: serverConfig.serverId, success: false, error: serverError.message };
                            }
                        });

                        const results = await Promise.all(serverPromises);
                        for (const result of results) {
                            if (!result.success) {
                                plexSuccess = false;
                                plexErrors.push(`Server ${result.serverId}: ${result.error || 'Failed'}`);
                            }
                        }
                    } else {
                        plexSuccess = false;
                        plexErrors.push('No package or server configuration provided');
                    }

                    if (plexSuccess) {
                        this.updateJobStatus(jobId, 'plex', 'completed', 'Plex invite sent successfully');

                        // Auto-complete any pending portal service requests for this user/service
                        try {
                            const completeResult = await db.query(`
                                UPDATE portal_service_requests
                                SET provisioning_status = 'completed',
                                    provisioned_at = datetime('now'),
                                    updated_at = datetime('now')
                                WHERE user_id = ?
                                  AND service_type = 'plex'
                                  AND payment_status = 'verified'
                                  AND (provisioning_status IS NULL OR provisioning_status = 'pending')
                            `, [userId]);
                            if (completeResult.changes > 0) {
                                console.log(`[JobProcessor] Auto-completed ${completeResult.changes} Plex service request(s) for user ${userId}`);
                            }
                        } catch (serviceReqError) {
                            console.error(`[JobProcessor] Failed to auto-complete service requests:`, serviceReqError);
                        }

                        // Send welcome email if configured
                        if (jobConfig.plex.welcome_email_template_id) {
                            try {
                                const emailService = require('./email-service');
                                await emailService.sendWelcomeEmail(userId, 'plex', jobConfig.plex.welcome_email_template_id);
                                console.log(`[JobProcessor] Plex welcome email sent for user ${userId}`);
                            } catch (emailError) {
                                console.error(`[JobProcessor] Failed to send Plex welcome email:`, emailError);
                            }
                        }
                    } else {
                        this.updateJobStatus(jobId, 'plex', 'failed', plexErrors.join('; ') || 'Plex invite failed');
                    }
                } else {
                    this.updateJobStatus(jobId, 'plex', 'failed', 'Plex manager not available');
                }
            } catch (error) {
                console.error(`[JobProcessor] Plex provisioning error:`, error);
                this.updateJobStatus(jobId, 'plex', 'failed', error.message);
            }
        }

        // Process IPTV
        if (jobConfig.iptv) {
            // Check if we're linking an existing user instead of creating new
            if (jobConfig.iptv.is_linked_user && jobConfig.iptv.linked_panel_user_id) {
                this.updateJobStatus(jobId, 'iptv', 'processing', 'Linking existing IPTV account...');
                try {
                    console.log(`[JobProcessor] 🔗 Linking existing IPTV user (line_id: ${jobConfig.iptv.linked_panel_user_id}) instead of creating new`);

                    // Fetch user info from panel to get current data
                    let userInfo = null;
                    if (this.iptvManager) {
                        try {
                            userInfo = await this.iptvManager.getUserInfoOnPanel(jobConfig.iptv.panel_id, jobConfig.iptv.linked_panel_user_id);
                            console.log(`[JobProcessor] ✅ Retrieved linked user info:`, userInfo);
                        } catch (fetchError) {
                            console.log(`[JobProcessor] ⚠️ Could not fetch linked user info: ${fetchError.message}`);
                        }
                    }

                    // Calculate expiration from user info or use existing
                    let expirationDate = null;
                    const expValue = userInfo?.expiration || userInfo?.expiry_date || userInfo?.exp;
                    if (expValue) {
                        expirationDate = toLocalDateString(new Date(expValue * 1000));
                    }

                    const connections = userInfo?.max_connections || userInfo?.connections || 1;

                    // Update user with linked IPTV credentials
                    await db.query(`
                        UPDATE users SET
                            iptv_enabled = 1,
                            iptv_line_id = ?,
                            iptv_password = ?,
                            iptv_username = ?,
                            iptv_panel_id = ?,
                            iptv_connections = ?,
                            iptv_expiration_date = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [
                        jobConfig.iptv.linked_panel_user_id,
                        jobConfig.iptv.password || userInfo?.password || '',
                        jobConfig.iptv.username || userInfo?.username || '',
                        jobConfig.iptv.panel_id,
                        connections,
                        expirationDate,
                        userData.user_id
                    ]);

                    this.updateJobStatus(jobId, 'iptv', 'completed', 'Linked to existing IPTV account');
                    console.log(`[JobProcessor] ✅ Successfully linked user ${userData.user_id} to existing IPTV account (line_id: ${jobConfig.iptv.linked_panel_user_id})`);

                    // Set iptvCredentials for IPTV Editor to use
                    iptvCredentials = {
                        username: jobConfig.iptv.username || userInfo?.username || '',
                        password: jobConfig.iptv.password || userInfo?.password || '',
                        line_id: jobConfig.iptv.linked_panel_user_id
                    };

                    // Send welcome email if requested
                    if (jobConfig.iptv.send_welcome_email && jobConfig.iptv.welcome_email_template_id) {
                        try {
                            const emailService = require('./email-service');
                            await emailService.sendWelcomeEmail(userData.user_id, 'iptv', jobConfig.iptv.welcome_email_template_id);
                            console.log(`[JobProcessor] IPTV welcome email sent for linked user ${userData.user_id}`);
                        } catch (emailError) {
                            console.error(`[JobProcessor] Failed to send IPTV welcome email:`, emailError);
                        }
                    }

                    // Link IPTV Editor account if one was found
                    if (jobConfig.iptv.linked_editor_user_id && jobConfig.iptv.linked_editor_playlist_id) {
                        this.updateJobStatus(jobId, 'iptvEditor', 'processing', 'Linking existing IPTV Editor account...');
                        try {
                            console.log(`[JobProcessor] 🔗 Linking existing IPTV Editor user (ID: ${jobConfig.iptv.linked_editor_user_id}) to user ${userData.user_id}`);

                            // Insert into iptv_editor_users table
                            await db.query(`
                                INSERT INTO iptv_editor_users (user_id, iptv_editor_id, iptv_editor_playlist_id, iptv_editor_username, iptv_editor_password, created_at)
                                VALUES (?, ?, ?, ?, ?, datetime('now'))
                                ON CONFLICT(user_id, iptv_editor_playlist_id) DO UPDATE SET
                                    iptv_editor_id = excluded.iptv_editor_id,
                                    iptv_editor_username = excluded.iptv_editor_username,
                                    iptv_editor_password = excluded.iptv_editor_password
                            `, [
                                userData.user_id,
                                jobConfig.iptv.linked_editor_user_id,
                                jobConfig.iptv.linked_editor_playlist_id,
                                jobConfig.iptv.linked_editor_username || iptvCredentials?.username || '',
                                jobConfig.iptv.linked_editor_password || iptvCredentials?.password || ''
                            ]);

                            // Update user's iptv_editor_enabled flag
                            await db.query(`UPDATE users SET iptv_editor_enabled = 1 WHERE id = ?`, [userData.user_id]);

                            this.updateJobStatus(jobId, 'iptvEditor', 'completed', 'Linked to existing IPTV Editor account');
                            console.log(`[JobProcessor] ✅ Successfully linked user ${userData.user_id} to existing IPTV Editor account (ID: ${jobConfig.iptv.linked_editor_user_id})`);
                        } catch (editorError) {
                            console.error(`[JobProcessor] Error linking IPTV Editor account:`, editorError);
                            this.updateJobStatus(jobId, 'iptvEditor', 'failed', editorError.message);
                        }
                    } else {
                        // No IPTV Editor to link
                        this.updateJobStatus(jobId, 'iptvEditor', 'completed', 'No IPTV Editor account to link');
                    }
                } catch (error) {
                    console.error(`[JobProcessor] Error linking IPTV account:`, error);
                    this.updateJobStatus(jobId, 'iptv', 'failed', error.message);
                }
            } else {
                // Create new IPTV user
                this.updateJobStatus(jobId, 'iptv', 'processing', 'Creating IPTV account...');
                try {
                    if (this.iptvManager) {
                        // Look up the package from database to get panel_package_id
                        let packageRows = [];

                    if (jobConfig.iptv.package_id) {
                        // Direct lookup by package_id
                        packageRows = await db.query(
                            'SELECT id, iptv_panel_id, package_id as panel_package_id, name as package_name, connections, duration_months, credits as credit_cost, package_type FROM iptv_packages WHERE id = ?',
                            [jobConfig.iptv.package_id]
                        );
                    } else if (jobConfig.iptv.panel_id) {
                        // Fallback: Find matching package by panel_id and connections/duration
                        console.log(`[JobProcessor] No package_id provided, searching by panel_id=${jobConfig.iptv.panel_id}, connections=${jobConfig.iptv.connections}, duration=${jobConfig.iptv.duration_months}`);

                        // Try to find exact match first
                        if (jobConfig.iptv.connections && jobConfig.iptv.duration_months) {
                            packageRows = await db.query(
                                'SELECT id, iptv_panel_id, package_id as panel_package_id, name as package_name, connections, duration_months, credits as credit_cost, package_type FROM iptv_packages WHERE iptv_panel_id = ? AND connections = ? AND duration_months = ? LIMIT 1',
                                [jobConfig.iptv.panel_id, jobConfig.iptv.connections, jobConfig.iptv.duration_months]
                            );
                        }

                        // If no exact match, try by panel_id and connections only
                        if (packageRows.length === 0 && jobConfig.iptv.connections) {
                            packageRows = await db.query(
                                'SELECT id, iptv_panel_id, package_id as panel_package_id, name as package_name, connections, duration_months, credits as credit_cost, package_type FROM iptv_packages WHERE iptv_panel_id = ? AND connections = ? LIMIT 1',
                                [jobConfig.iptv.panel_id, jobConfig.iptv.connections]
                            );
                        }

                        // Last resort: any package for this panel
                        if (packageRows.length === 0) {
                            packageRows = await db.query(
                                'SELECT id, iptv_panel_id, package_id as panel_package_id, name as package_name, connections, duration_months, credits as credit_cost, package_type FROM iptv_packages WHERE iptv_panel_id = ? LIMIT 1',
                                [jobConfig.iptv.panel_id]
                            );
                        }
                    }

                    if (packageRows.length === 0) {
                        throw new Error(`IPTV package not found (package_id=${jobConfig.iptv.package_id}, panel_id=${jobConfig.iptv.panel_id}, connections=${jobConfig.iptv.connections}, duration=${jobConfig.iptv.duration_months})`);
                    }

                    const packageData = packageRows[0];
                    console.log(`[JobProcessor] Found IPTV package: ${packageData.package_name} (panel_package_id: ${packageData.panel_package_id})`);

                    const iptvResult = await this.iptvManager.createUserOnPanel(
                        jobConfig.iptv.panel_id,
                        jobConfig.iptv.username,
                        jobConfig.iptv.password,
                        packageData,
                        jobConfig.iptv.bouquet_ids,
                        false,
                        jobConfig.iptv.notes
                    );

                    // Check for success - panel returns created: true and line_id on success
                    if (iptvResult.created && iptvResult.line_id) {
                        // Sync user info from panel to get accurate connection count and expiration
                        // This is needed because the initial creation may not return all data immediately
                        let syncedUserInfo = null;
                        try {
                            console.log(`[JobProcessor] 🔄 Syncing user info from panel for line_id ${iptvResult.line_id}...`);
                            syncedUserInfo = await this.iptvManager.getUserInfoOnPanel(jobConfig.iptv.panel_id, iptvResult.line_id);
                            console.log(`[JobProcessor] ✅ Panel sync complete: connections=${syncedUserInfo?.max_connections}, expiration=${syncedUserInfo?.expiration || syncedUserInfo?.expiry_date}`);
                        } catch (syncError) {
                            console.log(`[JobProcessor] ⚠️ Panel sync failed (using initial values): ${syncError.message}`);
                        }

                        // Calculate expiration date - prefer synced data, fall back to panel result or package data
                        let expirationDate = null;
                        const syncedExpiration = syncedUserInfo?.expiration || syncedUserInfo?.expiry_date || syncedUserInfo?.exp;
                        if (syncedExpiration) {
                            // Convert Unix timestamp to ISO date string from synced data
                            expirationDate = toLocalDateString(new Date(syncedExpiration * 1000));
                            console.log(`[JobProcessor] Using synced expiration: ${syncedExpiration} -> ${expirationDate}`);
                        } else if (iptvResult.expiration || iptvResult.expiry_date || iptvResult.exp) {
                            const resultExpiration = iptvResult.expiration || iptvResult.expiry_date || iptvResult.exp;
                            // Convert Unix timestamp to ISO date string
                            expirationDate = toLocalDateString(new Date(resultExpiration * 1000));
                            console.log(`[JobProcessor] Using result expiration: ${resultExpiration} -> ${expirationDate}`);
                        } else if (packageData.duration_months) {
                            // Calculate from package duration
                            const exp = new Date();
                            exp.setMonth(exp.getMonth() + packageData.duration_months);
                            expirationDate = toLocalDateString(exp);
                        }

                        // Get connections - prefer synced data, fall back to panel result or package data
                        const connections = syncedUserInfo?.max_connections || syncedUserInfo?.connections || iptvResult.connections || packageData.connections || 1;

                        // Get final username and password (from result or config)
                        const finalUsername = iptvResult.username || jobConfig.iptv.username;
                        const finalPassword = iptvResult.password || jobConfig.iptv.password;

                        // Update user with IPTV credentials
                        await db.query(`
                            UPDATE users SET
                                iptv_enabled = 1,
                                iptv_line_id = ?,
                                iptv_password = ?,
                                iptv_username = ?,
                                iptv_panel_id = ?,
                                iptv_connections = ?,
                                iptv_expiration_date = ?
                            WHERE id = ?
                        `, [iptvResult.line_id, finalPassword, finalUsername, jobConfig.iptv.panel_id, connections, expirationDate, userData.user_id]);

                        // Store credentials for IPTV Editor if needed
                        iptvCredentials = {
                            username: finalUsername,
                            password: finalPassword,
                            line_id: iptvResult.line_id,
                            connections: connections,
                            expiration: expirationDate,
                            panel_id: jobConfig.iptv.panel_id
                        };

                        // Create detailed message with credentials
                        const detailMessage = `Username: ${finalUsername} | Password: ${finalPassword} | Connections: ${connections} | Expires: ${expirationDate || 'N/A'}`;
                        this.updateJobStatus(jobId, 'iptv', 'completed', detailMessage);
                        console.log(`[JobProcessor] IPTV account created: line_id=${iptvResult.line_id}, username=${finalUsername}, connections=${connections}, expiration=${expirationDate}`);

                        // Auto-complete any pending portal service requests for this user/service
                        try {
                            const completeResult = await db.query(`
                                UPDATE portal_service_requests
                                SET provisioning_status = 'completed',
                                    provisioned_at = datetime('now'),
                                    updated_at = datetime('now')
                                WHERE user_id = ?
                                  AND service_type = 'iptv'
                                  AND payment_status = 'verified'
                                  AND (provisioning_status IS NULL OR provisioning_status = 'pending')
                            `, [userData.user_id]);
                            if (completeResult.changes > 0) {
                                console.log(`[JobProcessor] Auto-completed ${completeResult.changes} IPTV service request(s) for user ${userData.user_id}`);
                            }
                        } catch (serviceReqError) {
                            console.error(`[JobProcessor] Failed to auto-complete service requests:`, serviceReqError);
                        }

                        // Send welcome email if configured
                        if (jobConfig.iptv.welcome_email_template_id) {
                            try {
                                const emailService = require('./email-service');
                                await emailService.sendWelcomeEmail(userData.user_id, 'iptv', jobConfig.iptv.welcome_email_template_id);
                                console.log(`[JobProcessor] IPTV welcome email sent for user ${userData.user_id}`);
                            } catch (emailError) {
                                console.error(`[JobProcessor] Failed to send IPTV welcome email:`, emailError);
                            }
                        }
                    } else {
                        this.updateJobStatus(jobId, 'iptv', 'failed', 'IPTV creation failed - no line_id returned');
                    }
                } else {
                    this.updateJobStatus(jobId, 'iptv', 'failed', 'IPTV manager not available');
                }
            } catch (error) {
                console.error(`[JobProcessor] IPTV provisioning error:`, error);
                this.updateJobStatus(jobId, 'iptv', 'failed', error.message);
            }
            } // end else (create new IPTV user)
        }

        // Process IPTV Editor
        if (jobConfig.iptvEditor) {
            // Check if we need to wait for IPTV credentials
            if (jobConfig.iptv && !iptvCredentials) {
                // IPTV was requested but failed, skip IPTV Editor
                this.updateJobStatus(jobId, 'iptvEditor', 'failed', 'Skipped - IPTV panel provisioning failed');
                console.log(`[JobProcessor] Skipping IPTV Editor because IPTV panel provisioning failed`);
            } else {
                this.updateJobStatus(jobId, 'iptvEditor', 'processing', 'Creating IPTV Editor account...');
                try {
                    const IPTVEditorService = require('./iptv-editor-service');

                    // Create instance with proper configuration
                    const editorService = new IPTVEditorService();
                    await editorService.initialize();

                    // Set the playlist ID for this operation
                    editorService.defaultPlaylistId = jobConfig.iptvEditor.playlist_db_id;

                    // Use credentials from IPTV panel if available, otherwise use config
                    const editorUsername = iptvCredentials ? iptvCredentials.username : jobConfig.iptvEditor.username;
                    const editorPassword = iptvCredentials ? iptvCredentials.password : jobConfig.iptvEditor.password;

                    // Prepare create user payload matching the expected format
                    const createUserPayload = {
                        name: userData.name || userData.email || 'User',
                        note: jobConfig.iptvEditor.notes || '',
                        username: editorUsername,
                        password: editorPassword,
                        channels_categories: jobConfig.iptvEditor.channel_ids || [],
                        vods_categories: jobConfig.iptvEditor.movie_ids || [],
                        series_categories: jobConfig.iptvEditor.series_ids || [],
                        provider_base_url: jobConfig.iptvEditor.provider_base_url
                    };

                    console.log(`[JobProcessor] Creating IPTV Editor user with payload:`, JSON.stringify(createUserPayload, null, 2));

                    const createResult = await editorService.createUser(createUserPayload);

                    if (createResult && createResult.id) {
                        this.updateJobStatus(jobId, 'iptvEditor', 'completed', 'IPTV Editor account created');

                        // Store the editor user ID, credentials and expiry in database
                        // Use IPTV panel expiration if available
                        const editorExpiry = iptvCredentials ? iptvCredentials.expiration : null;

                        await db.query(`
                            INSERT INTO iptv_editor_users (user_id, iptv_editor_id, iptv_editor_playlist_id, iptv_editor_username, iptv_editor_password, expiry_date, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                            ON CONFLICT(user_id, iptv_editor_playlist_id) DO UPDATE SET
                                iptv_editor_id = excluded.iptv_editor_id,
                                iptv_editor_username = excluded.iptv_editor_username,
                                iptv_editor_password = excluded.iptv_editor_password,
                                expiry_date = excluded.expiry_date
                        `, [userData.user_id, createResult.id, jobConfig.iptvEditor.playlist_db_id, editorUsername, editorPassword, editorExpiry]);

                        // Update user's iptv_editor_enabled flag
                        await db.query(`UPDATE users SET iptv_editor_enabled = 1 WHERE id = ?`, [userData.user_id]);

                        // Run second panel sync after IPTV Editor creation
                        // This ensures we have the final, accurate data from the panel
                        if (iptvCredentials && iptvCredentials.line_id && iptvCredentials.panel_id) {
                            try {
                                console.log(`[JobProcessor] 🔄 Running second panel sync after IPTV Editor creation for line_id ${iptvCredentials.line_id}...`);
                                const finalSyncedInfo = await this.iptvManager.getUserInfoOnPanel(iptvCredentials.panel_id, iptvCredentials.line_id);

                                if (finalSyncedInfo) {
                                    // Update user with final synced data
                                    const finalConnections = finalSyncedInfo.max_connections || finalSyncedInfo.connections || iptvCredentials.connections;
                                    let finalExpiration = iptvCredentials.expiration;
                                    if (finalSyncedInfo.expiration) {
                                        finalExpiration = toLocalDateString(new Date(finalSyncedInfo.expiration * 1000));
                                    }

                                    await db.query(`
                                        UPDATE users SET
                                            iptv_connections = ?,
                                            iptv_expiration_date = ?
                                        WHERE id = ?
                                    `, [finalConnections, finalExpiration, userData.user_id]);

                                    // Also update iptv_editor_users with the final expiration
                                    await db.query(`
                                        UPDATE iptv_editor_users SET
                                            expiry_date = ?
                                        WHERE user_id = ? AND iptv_editor_playlist_id = ?
                                    `, [finalExpiration, userData.user_id, jobConfig.iptvEditor.playlist_db_id]);

                                    console.log(`[JobProcessor] ✅ Second panel sync complete: connections=${finalConnections}, expiration=${finalExpiration}`);
                                }
                            } catch (secondSyncError) {
                                console.log(`[JobProcessor] ⚠️ Second panel sync failed (data already stored): ${secondSyncError.message}`);
                            }
                        }
                    } else {
                        this.updateJobStatus(jobId, 'iptvEditor', 'failed', 'IPTV Editor creation failed - no ID returned');
                    }
                } catch (error) {
                    console.error(`[JobProcessor] IPTV Editor provisioning error:`, error);
                    this.updateJobStatus(jobId, 'iptvEditor', 'failed', error.message);
                }
            }
        }

        console.log(`[JobProcessor] Completed background processing for job ${jobId}`);
    }
}

const jobProcessor = new JobProcessor();

// Clean up old jobs every 30 minutes
setInterval(() => jobProcessor.cleanup(), 30 * 60 * 1000);

module.exports = jobProcessor;
