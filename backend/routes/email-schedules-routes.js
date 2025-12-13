/**
 * Email Schedules Routes
 *
 * CRUD operations for automated email schedules
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database-config');
const emailScheduler = require('../services/email/EmailScheduler');

// GET /api/v2/email-schedules - List all schedules
router.get('/', async (req, res) => {
    try {
        const schedules = await query(`
            SELECT
                es.*,
                et.name as template_name
            FROM email_schedules es
            LEFT JOIN email_templates et ON es.template_id = et.id
            ORDER BY es.created_at DESC
        `);

        res.json({
            success: true,
            schedules: schedules,
            data: schedules
        });
    } catch (error) {
        console.error('Error fetching email schedules:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email schedules',
            error: error.message
        });
    }
});

// POST /api/v2/email-schedules/preview-users - Preview users matching filter conditions (before saving)
router.post('/preview-users', async (req, res) => {
    try {
        const { filter_conditions, schedule_config } = req.body;

        const filterConditions = filter_conditions || { mode: 'AND', conditions: [] };

        // Build the query based on filter conditions
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

        // Apply schedule_config filters (for expiration reminders)
        if (schedule_config && schedule_config.schedule_type === 'expiration_reminder') {
            const days = schedule_config.days_before_expiration || 7;
            const serviceType = schedule_config.service_type || 'both';

            // Build expiration condition based on service type
            // We want users whose expiration is EXACTLY X days from now
            // Use 'localtime' to get local date instead of UTC
            if (serviceType === 'plex') {
                conditions.push('u.plex_enabled = 1');
                conditions.push(`CAST(julianday(date(u.plex_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else if (serviceType === 'iptv') {
                conditions.push('u.iptv_enabled = 1');
                conditions.push(`CAST(julianday(date(u.iptv_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else {
                // Both - user expires on either platform in exactly X days
                conditions.push(`(
                    (u.plex_enabled = 1 AND CAST(julianday(date(u.plex_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?)
                    OR
                    (u.iptv_enabled = 1 AND CAST(julianday(date(u.iptv_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?)
                )`);
                values.push(days, days);
            }
        }

        // Apply filter conditions
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
                    // Support both single value and array of owner IDs
                    if (Array.isArray(value) && value.length > 0) {
                        const ownerPlaceholders = value.map(() => '?').join(',');
                        conditionClauses.push(`u.owner_id IN (${ownerPlaceholders})`);
                        values.push(...value);
                    } else if (!Array.isArray(value)) {
                        conditionClauses.push('u.owner_id = ?');
                        values.push(value);
                    }
                } else if (field === 'subscription_plan_id' && value) {
                    // Support both single value and array of subscription plan IDs
                    // Check both plex_package_id and iptv_subscription_plan_id
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
                } else if (field === 'days_until_expiration' && value !== undefined) {
                    const daysValue = parseInt(value, 10);
                    if (!isNaN(daysValue)) {
                        if (operator === 'less_than') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND julianday(u.plex_expiration_date) - julianday('now') < ?)
                                OR (u.iptv_enabled = 1 AND julianday(u.iptv_expiration_date) - julianday('now') < ?)
                            )`);
                            values.push(daysValue, daysValue);
                        } else if (operator === 'greater_than') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND julianday(u.plex_expiration_date) - julianday('now') > ?)
                                OR (u.iptv_enabled = 1 AND julianday(u.iptv_expiration_date) - julianday('now') > ?)
                            )`);
                            values.push(daysValue, daysValue);
                        } else if (operator === 'equals') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND CAST(julianday(u.plex_expiration_date) - julianday('now') AS INTEGER) = ?)
                                OR (u.iptv_enabled = 1 AND CAST(julianday(u.iptv_expiration_date) - julianday('now') AS INTEGER) = ?)
                            )`);
                            values.push(daysValue, daysValue);
                        }
                    }
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

        const users = await query(sql, values);

        // Map to expected format
        const result = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email || u.plex_email || 'No email'
        }));

        res.json({
            success: true,
            data: result,
            count: result.length
        });
    } catch (error) {
        console.error('Error previewing users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to preview users',
            error: error.message
        });
    }
});

// GET /api/v2/email-schedules/:id - Get single schedule
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const schedules = await query(`
            SELECT
                es.*,
                et.name as template_name
            FROM email_schedules es
            LEFT JOIN email_templates et ON es.template_id = et.id
            WHERE es.id = ?
        `, [id]);

        if (schedules.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        // Parse filter_conditions if it's a string
        const schedule = schedules[0];
        if (schedule.filter_conditions && typeof schedule.filter_conditions === 'string') {
            try {
                schedule.filter_conditions = JSON.parse(schedule.filter_conditions);
            } catch (e) {
                schedule.filter_conditions = { mode: 'AND', conditions: [] };
            }
        }

        res.json({
            success: true,
            schedule: schedule,
            data: schedule  // Also provide as 'data' for frontend compatibility
        });
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch schedule',
            error: error.message
        });
    }
});

// POST /api/v2/email-schedules - Create new schedule
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            template_id,
            schedule_type,
            days_before_expiration,
            scheduled_date,
            scheduled_time,
            recurrence_pattern,
            lifecycle_event,
            filter_conditions,
            is_active,
            service_type
        } = req.body;

        if (!name || !template_id || !schedule_type) {
            return res.status(400).json({
                success: false,
                message: 'Name, template_id, and schedule_type are required'
            });
        }

        const result = await query(`
            INSERT INTO email_schedules (
                name, description, template_id, schedule_type,
                days_before_expiration, scheduled_date, scheduled_time,
                recurrence_pattern, lifecycle_event, filter_conditions,
                is_active, service_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            description || null,
            template_id,
            schedule_type,
            days_before_expiration || null,
            scheduled_date || null,
            scheduled_time || '12:00',
            recurrence_pattern || null,
            lifecycle_event || null,
            filter_conditions ? JSON.stringify(filter_conditions) : '{"mode":"AND","conditions":[]}',
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            service_type || 'both'
        ]);

        res.json({
            success: true,
            message: 'Schedule created successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create schedule',
            error: error.message
        });
    }
});

// PUT /api/v2/email-schedules/:id - Update schedule
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            template_id,
            schedule_type,
            days_before_expiration,
            scheduled_date,
            scheduled_time,
            recurrence_pattern,
            lifecycle_event,
            filter_conditions,
            is_active,
            service_type
        } = req.body;

        // Check if schedule exists
        const existing = await query('SELECT id FROM email_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        await query(`
            UPDATE email_schedules
            SET name = ?, description = ?, template_id = ?, schedule_type = ?,
                days_before_expiration = ?, scheduled_date = ?, scheduled_time = ?,
                recurrence_pattern = ?, lifecycle_event = ?, filter_conditions = ?,
                is_active = ?, service_type = ?, updated_at = datetime('now')
            WHERE id = ?
        `, [
            name,
            description,
            template_id,
            schedule_type,
            days_before_expiration,
            scheduled_date,
            scheduled_time,
            recurrence_pattern,
            lifecycle_event,
            filter_conditions ? JSON.stringify(filter_conditions) : null,
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            service_type || 'both',
            id
        ]);

        res.json({
            success: true,
            message: 'Schedule updated successfully'
        });
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update schedule',
            error: error.message
        });
    }
});

// DELETE /api/v2/email-schedules/:id - Delete schedule
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT id FROM email_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        await query('DELETE FROM email_schedules WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete schedule',
            error: error.message
        });
    }
});

// PATCH /api/v2/email-schedules/:id/toggle - Toggle schedule active status
router.patch('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT id, is_active FROM email_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        const newStatus = existing[0].is_active ? 0 : 1;
        await query('UPDATE email_schedules SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [newStatus, id]);

        res.json({
            success: true,
            message: `Schedule ${newStatus ? 'activated' : 'deactivated'} successfully`,
            is_active: newStatus === 1
        });
    } catch (error) {
        console.error('Error toggling schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle schedule',
            error: error.message
        });
    }
});

// GET /api/v2/email-schedules/:id/target-users - Preview target users for a schedule
router.get('/:id/target-users', async (req, res) => {
    try {
        const { id } = req.params;

        // Get schedule with filter conditions
        const schedules = await query('SELECT * FROM email_schedules WHERE id = ?', [id]);
        if (schedules.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        const schedule = schedules[0];
        let filterConditions = { mode: 'AND', conditions: [] };

        try {
            if (schedule.filter_conditions) {
                filterConditions = JSON.parse(schedule.filter_conditions);
            }
        } catch (e) {
            console.error('Error parsing filter conditions:', e);
        }

        // Build the query based on filter conditions
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

        // Apply expiration reminder filters if schedule_type is expiration_reminder
        if (schedule.schedule_type === 'expiration_reminder') {
            const days = schedule.days_before_expiration || 7;
            const serviceType = schedule.service_type || 'both';

            // Build expiration condition based on service type
            // We want users whose expiration is EXACTLY X days from now
            // Use 'localtime' to get local date instead of UTC
            if (serviceType === 'plex') {
                conditions.push('u.plex_enabled = 1');
                conditions.push(`CAST(julianday(date(u.plex_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else if (serviceType === 'iptv') {
                conditions.push('u.iptv_enabled = 1');
                conditions.push(`CAST(julianday(date(u.iptv_expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) = ?`);
                values.push(days);
            } else {
                // Both - user expires on either platform in exactly X days
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
            // 'both' or null means no platform restriction
        }

        // Apply filter conditions
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
                        // For "contains all", we need a subquery
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
                    // Support both single value and array of owner IDs
                    if (Array.isArray(value) && value.length > 0) {
                        const ownerPlaceholders = value.map(() => '?').join(',');
                        conditionClauses.push(`u.owner_id IN (${ownerPlaceholders})`);
                        values.push(...value);
                    } else if (!Array.isArray(value)) {
                        conditionClauses.push('u.owner_id = ?');
                        values.push(value);
                    }
                } else if (field === 'subscription_plan_id' && value) {
                    // Support both single value and array of subscription plan IDs
                    // Check both plex_package_id and iptv_subscription_plan_id
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
                } else if (field === 'days_until_expiration' && value !== undefined) {
                    // Calculate based on both plex and iptv expiration dates
                    const daysValue = parseInt(value, 10);
                    if (!isNaN(daysValue)) {
                        if (operator === 'less_than') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND julianday(u.plex_expiration_date) - julianday('now') < ?)
                                OR (u.iptv_enabled = 1 AND julianday(u.iptv_expiration_date) - julianday('now') < ?)
                            )`);
                            values.push(daysValue, daysValue);
                        } else if (operator === 'greater_than') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND julianday(u.plex_expiration_date) - julianday('now') > ?)
                                OR (u.iptv_enabled = 1 AND julianday(u.iptv_expiration_date) - julianday('now') > ?)
                            )`);
                            values.push(daysValue, daysValue);
                        } else if (operator === 'equals') {
                            conditionClauses.push(`(
                                (u.plex_enabled = 1 AND CAST(julianday(u.plex_expiration_date) - julianday('now') AS INTEGER) = ?)
                                OR (u.iptv_enabled = 1 AND CAST(julianday(u.iptv_expiration_date) - julianday('now') AS INTEGER) = ?)
                            )`);
                            values.push(daysValue, daysValue);
                        }
                    }
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

        const users = await query(sql, values);

        // Map to expected format (use email or plex_email)
        const result = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email || u.plex_email || 'No email'
        }));

        res.json({
            success: true,
            data: result,
            count: result.length
        });
    } catch (error) {
        console.error('Error fetching target users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch target users',
            error: error.message
        });
    }
});

// POST /api/v2/email-schedules/:id/trigger - Manually trigger a schedule (alias for run)
router.post('/:id/trigger', async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT * FROM email_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        console.log(`Manual trigger requested for schedule ${id}: ${existing[0].name}`);

        // Run the schedule using the EmailScheduler
        const result = await emailScheduler.runScheduleNow(id);

        res.json({
            success: true,
            message: result.message,
            schedule: existing[0].name,
            emailsSent: result.emailsSent,
            emailsFailed: result.emailsFailed
        });
    } catch (error) {
        console.error('Error triggering schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger schedule',
            error: error.message
        });
    }
});

// POST /api/v2/email-schedules/:id/run - Manually run a schedule
router.post('/:id/run', async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await query('SELECT * FROM email_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        console.log(`Manual run requested for schedule ${id}: ${existing[0].name}`);

        // Run the schedule using the EmailScheduler
        const result = await emailScheduler.runScheduleNow(id);

        res.json({
            success: true,
            message: result.message,
            schedule: existing[0].name,
            emailsSent: result.emailsSent,
            emailsFailed: result.emailsFailed
        });
    } catch (error) {
        console.error('Error running schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to run schedule',
            error: error.message
        });
    }
});

module.exports = router;
