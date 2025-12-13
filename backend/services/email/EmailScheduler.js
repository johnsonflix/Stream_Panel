/**
 * Email Scheduler
 *
 * Runs every 5 minutes to check for scheduled emails that need to be sent.
 * Each schedule only runs once per day at the specified time.
 */

const cron = require('node-cron');
const { query } = require('../../database-config');
const { sendTemplateEmail } = require('../email-service');

class EmailScheduler {
    constructor() {
        this.cronJob = null;
        this.isRunning = false;
        console.log('[EmailScheduler] Initialized');
    }

    /**
     * Initialize and start the scheduler
     */
    async initialize() {
        // Run every 5 minutes
        this.cronJob = cron.schedule('*/5 * * * *', async () => {
            await this.checkAndRunSchedules();
        });

        console.log('[EmailScheduler] Started - checking every 5 minutes');

        // Run immediately on startup to catch any missed schedules
        setTimeout(() => {
            this.checkAndRunSchedules();
        }, 5000);
    }

    /**
     * Check all active schedules and run any that are due
     */
    async checkAndRunSchedules() {
        if (this.isRunning) {
            console.log('[EmailScheduler] Already running, skipping this check');
            return;
        }

        this.isRunning = true;

        try {
            const now = new Date();
            const currentTime = now.toTimeString().substring(0, 5); // "HH:MM"
            // Use local date (not UTC) to match how last_run is stored with datetime('now', 'localtime')
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const currentDate = `${year}-${month}-${day}`; // "YYYY-MM-DD" in local time

            console.log(`[EmailScheduler] Checking schedules at ${currentTime} on ${currentDate}`);

            // Get all active schedules
            const schedules = await query(`
                SELECT * FROM email_schedules
                WHERE is_active = 1
            `);

            if (schedules.length === 0) {
                console.log('[EmailScheduler] No active schedules found');
                this.isRunning = false;
                return;
            }

            for (const schedule of schedules) {
                try {
                    await this.processSchedule(schedule, currentTime, currentDate);
                } catch (error) {
                    console.error(`[EmailScheduler] Error processing schedule ${schedule.id}:`, error);
                    // Update schedule with error status
                    await query(`
                        UPDATE email_schedules
                        SET last_run_status = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [`error: ${error.message}`, schedule.id]);
                }
            }
        } catch (error) {
            console.error('[EmailScheduler] Error checking schedules:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process a single schedule
     */
    async processSchedule(schedule, currentTime, currentDate) {
        const scheduledTime = schedule.scheduled_time || '12:00';

        // Check if it's time to run this schedule (within 5 minute window)
        if (!this.isTimeToRun(currentTime, scheduledTime)) {
            return;
        }

        // Check if already ran today (initial check with stale data)
        if (this.hasRunToday(schedule.last_run, currentDate)) {
            console.log(`[EmailScheduler] Schedule "${schedule.name}" already ran today, skipping`);
            return;
        }

        // ATOMIC LOCK: Try to claim this schedule for today using database-level locking
        // This prevents race conditions where multiple scheduler instances or checks could run simultaneously
        const lockResult = await query(`
            UPDATE email_schedules
            SET last_run = datetime('now', 'localtime'),
                updated_at = datetime('now')
            WHERE id = ?
            AND (last_run IS NULL OR date(last_run) != date('now', 'localtime'))
        `, [schedule.id]);

        // Check if we successfully claimed the lock (affected 1 row)
        if (!lockResult || lockResult.changes === 0) {
            console.log(`[EmailScheduler] Schedule "${schedule.name}" already claimed by another process, skipping`);
            return;
        }

        console.log(`[EmailScheduler] Running schedule "${schedule.name}" (ID: ${schedule.id})`);

        // Get target users based on schedule type and filters
        const users = await this.getTargetUsers(schedule);

        if (users.length === 0) {
            console.log(`[EmailScheduler] No matching users for schedule "${schedule.name}"`);
            await this.updateScheduleStatus(schedule.id, 'completed', 0, 'No matching users');
            return;
        }

        console.log(`[EmailScheduler] Found ${users.length} users for schedule "${schedule.name}"`);

        // Send emails to all matching users
        let successCount = 0;
        let failCount = 0;
        const errors = [];

        for (const user of users) {
            try {
                const email = user.email || user.plex_email;
                if (!email) {
                    console.log(`[EmailScheduler] User ${user.id} (${user.name}) has no email, skipping`);
                    failCount++;
                    continue;
                }

                // Get full user data for template variables
                const userData = await this.getUserData(user.id);

                const result = await sendTemplateEmail({
                    templateId: schedule.template_id,
                    to: email,
                    userData: userData,
                    customMessage: schedule.custom_message || ''
                });

                if (result.success) {
                    successCount++;
                    console.log(`[EmailScheduler] Email sent to ${email}`);
                } else {
                    failCount++;
                    errors.push(`${email}: ${result.error}`);
                    console.error(`[EmailScheduler] Failed to send to ${email}:`, result.error);
                }
            } catch (error) {
                failCount++;
                errors.push(`${user.email || user.id}: ${error.message}`);
                console.error(`[EmailScheduler] Error sending to user ${user.id}:`, error);
            }
        }

        // Update schedule status
        const status = failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed');
        const statusMessage = `Sent: ${successCount}, Failed: ${failCount}`;
        await this.updateScheduleStatus(schedule.id, status, successCount, statusMessage);

        console.log(`[EmailScheduler] Schedule "${schedule.name}" completed: ${statusMessage}`);
    }

    /**
     * Check if current time is within 5 minutes of scheduled time
     */
    isTimeToRun(currentTime, scheduledTime) {
        const [currentHour, currentMin] = currentTime.split(':').map(Number);
        const [schedHour, schedMin] = scheduledTime.split(':').map(Number);

        const currentMins = currentHour * 60 + currentMin;
        const schedMins = schedHour * 60 + schedMin;

        // Check if within 5 minute window (0-4 minutes after scheduled time)
        const diff = currentMins - schedMins;
        return diff >= 0 && diff < 5;
    }

    /**
     * Check if schedule has already run today
     */
    hasRunToday(lastRun, currentDate) {
        if (!lastRun) return false;

        // Parse last_run date
        const lastRunDate = lastRun.split(' ')[0].split('T')[0];
        return lastRunDate === currentDate;
    }

    /**
     * Get target users for a schedule based on its type and filters
     */
    async getTargetUsers(schedule) {
        let filterConditions = { mode: 'AND', conditions: [] };

        try {
            if (schedule.filter_conditions) {
                filterConditions = JSON.parse(schedule.filter_conditions);
            }
        } catch (e) {
            console.error('[EmailScheduler] Error parsing filter conditions:', e);
        }

        // Build the query
        let sql = `
            SELECT DISTINCT
                u.id,
                u.name,
                u.email,
                u.plex_email,
                u.plex_enabled,
                u.plex_expiration_date,
                u.iptv_enabled,
                u.iptv_expiration_date,
                u.is_active,
                u.owner_id
            FROM users u
            LEFT JOIN user_tags ut ON u.id = ut.user_id
            LEFT JOIN tags t ON ut.tag_id = t.id
        `;

        const conditions = [];
        const values = [];

        // Exclude users who opted out of automated emails
        conditions.push('(u.exclude_from_automated_emails IS NULL OR u.exclude_from_automated_emails = 0)');

        // Apply schedule type filters
        if (schedule.schedule_type === 'expiration_reminder') {
            const days = schedule.days_before_expiration || 7;
            const serviceType = schedule.service_type || 'both';

            // Use 'localtime' to get local date
            if (serviceType === 'plex') {
                conditions.push('u.plex_enabled = 1');
                conditions.push(`CAST(julianday(date(u.plex_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else if (serviceType === 'iptv') {
                conditions.push('u.iptv_enabled = 1');
                conditions.push(`CAST(julianday(date(u.iptv_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else {
                // Both
                conditions.push(`(
                    (u.plex_enabled = 1 AND CAST(julianday(date(u.plex_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?)
                    OR
                    (u.iptv_enabled = 1 AND CAST(julianday(date(u.iptv_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?)
                )`);
                values.push(days, days);
            }
        } else {
            // Apply service_type filter for non-expiration schedules
            if (schedule.service_type === 'plex') {
                conditions.push('u.plex_enabled = 1');
            } else if (schedule.service_type === 'iptv') {
                conditions.push('u.iptv_enabled = 1');
            }
        }

        // Apply additional filter conditions
        if (filterConditions.conditions && filterConditions.conditions.length > 0) {
            const conditionClauses = [];

            for (const condition of filterConditions.conditions) {
                const { field, operator, value } = condition;

                if (field === 'tags' && Array.isArray(value) && value.length > 0) {
                    const tagPlaceholders = value.map(() => '?').join(',');
                    if (operator === 'contains_any') {
                        conditionClauses.push(`t.name IN (${tagPlaceholders})`);
                        values.push(...value);
                    } else if (operator === 'contains_all') {
                        conditionClauses.push(`
                            u.id IN (
                                SELECT ut2.user_id FROM user_tags ut2
                                JOIN tags t2 ON ut2.tag_id = t2.id
                                WHERE t2.name IN (${tagPlaceholders})
                                GROUP BY ut2.user_id
                                HAVING COUNT(DISTINCT t2.name) = ${value.length}
                            )
                        `);
                        values.push(...value);
                    }
                } else if (field === 'platform' && value) {
                    if (value === 'plex') {
                        conditionClauses.push('u.plex_enabled = 1');
                    } else if (value === 'iptv') {
                        conditionClauses.push('u.iptv_enabled = 1');
                    }
                } else if (field === 'owner_id' && value) {
                    if (Array.isArray(value) && value.length > 0) {
                        const ownerPlaceholders = value.map(() => '?').join(',');
                        conditionClauses.push(`u.owner_id IN (${ownerPlaceholders})`);
                        values.push(...value);
                    } else if (!Array.isArray(value)) {
                        conditionClauses.push('u.owner_id = ?');
                        values.push(value);
                    }
                } else if (field === 'subscription_plan_id' && value) {
                    if (Array.isArray(value) && value.length > 0) {
                        const planPlaceholders = value.map(() => '?').join(',');
                        conditionClauses.push(`(u.plex_package_id IN (${planPlaceholders}) OR u.iptv_subscription_plan_id IN (${planPlaceholders}))`);
                        values.push(...value, ...value);
                    } else if (!Array.isArray(value)) {
                        conditionClauses.push('(u.plex_package_id = ? OR u.iptv_subscription_plan_id = ?)');
                        values.push(value, value);
                    }
                } else if (field === 'is_active') {
                    conditionClauses.push(`u.is_active = ${value ? 1 : 0}`);
                }
            }

            if (conditionClauses.length > 0) {
                const joinOp = filterConditions.mode === 'OR' ? ' OR ' : ' AND ';
                conditions.push(`(${conditionClauses.join(joinOp)})`);
            }
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY u.name';

        return await query(sql, values);
    }

    /**
     * Get full user data for template variables
     */
    async getUserData(userId) {
        const users = await query(`
            SELECT u.*, o.name as owner_name
            FROM users u
            LEFT JOIN owners o ON u.owner_id = o.id
            WHERE u.id = ?
        `, [userId]);

        if (users.length === 0) return {};

        const user = users[0];

        // Get IPTV Editor user data if available
        const editorUsers = await query(`
            SELECT ieu.*, iep.name as playlist_name
            FROM iptv_editor_users ieu
            LEFT JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
            WHERE ieu.user_id = ?
            LIMIT 1
        `, [userId]);

        if (editorUsers.length > 0) {
            user.iptv_editor_username = editorUsers[0].iptv_editor_username;
            user.iptv_editor_password = editorUsers[0].iptv_editor_password;
            user.iptv_editor_expiration_date = editorUsers[0].expiry_date;
        }

        return user;
    }

    /**
     * Update schedule status after running
     * Note: last_run is already set by the atomic lock in processSchedule, so we don't update it here
     */
    async updateScheduleStatus(scheduleId, status, emailsSent, message) {
        await query(`
            UPDATE email_schedules
            SET run_count = COALESCE(run_count, 0) + 1,
                last_run_status = ?,
                last_run_user_count = ?,
                last_run_message = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [status, emailsSent, message, scheduleId]);
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('[EmailScheduler] Stopped');
        }
    }

    /**
     * Manually run a specific schedule (for testing or manual triggers)
     * Manual runs bypass the once-per-day check but still update last_run
     */
    async runScheduleNow(scheduleId) {
        const schedules = await query('SELECT * FROM email_schedules WHERE id = ?', [scheduleId]);

        if (schedules.length === 0) {
            throw new Error('Schedule not found');
        }

        const schedule = schedules[0];

        console.log(`[EmailScheduler] Manual run requested for schedule "${schedule.name}"`);

        // Update last_run immediately to prevent any automated runs from firing
        await query(`
            UPDATE email_schedules
            SET last_run = datetime('now', 'localtime'),
                updated_at = datetime('now')
            WHERE id = ?
        `, [scheduleId]);

        // Get target users
        const users = await this.getTargetUsers(schedule);

        if (users.length === 0) {
            await this.updateScheduleStatus(scheduleId, 'completed', 0, 'No matching users');
            return { success: true, message: 'No matching users found', emailsSent: 0 };
        }

        // Send emails
        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                const email = user.email || user.plex_email;
                if (!email) {
                    failCount++;
                    continue;
                }

                const userData = await this.getUserData(user.id);

                const result = await sendTemplateEmail({
                    templateId: schedule.template_id,
                    to: email,
                    userData: userData,
                    customMessage: schedule.custom_message || ''
                });

                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
                console.error(`[EmailScheduler] Error sending to user ${user.id}:`, error);
            }
        }

        const status = failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed');
        await this.updateScheduleStatus(scheduleId, status, successCount, `Manual run - Sent: ${successCount}, Failed: ${failCount}`);

        return {
            success: true,
            message: `Emails sent: ${successCount}, Failed: ${failCount}`,
            emailsSent: successCount,
            emailsFailed: failCount
        };
    }
}

const emailScheduler = new EmailScheduler();

module.exports = emailScheduler;
