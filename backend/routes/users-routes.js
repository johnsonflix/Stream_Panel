/**
 * Users API Routes (v2)
 *
 * User creation, editing, and management with multi-server support
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');
const PlexServiceManager = require('../services/plex/PlexServiceManager');
const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');
const IPTVEditorService = require('../services/iptv-editor-service');
const { autoAssignTagsForUser } = require('./tags-routes');
const jobProcessor = require('../services/JobProcessor');
const { getUserLibraryAccess } = require('../jobs/plex-library-access-sync');

// Initialize service managers
let plexManager;
let iptvManager;

(async () => {
    try {
        plexManager = new PlexServiceManager(db);
        await plexManager.initialize();

        iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        // Set service managers on JobProcessor for background job processing
        jobProcessor.setServiceManagers(plexManager, iptvManager);

        console.log('Service managers initialized successfully');
    } catch (error) {
        console.error('Failed to initialize service managers:', error);
    }
})();

// GET /api/v2/users - Get all users
router.get('/', async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';
        const searchQuery = req.query.search;
        const ownerId = req.query.owner_id;
        const tagId = req.query.tag_id;
        const expiringSoon = req.query.expiring_soon; // 'plex', 'iptv', or 'any'

        let sql = `
            SELECT
                u.id,
                u.name,
                u.email,
                u.account_type,
                u.owner_id,
                u.plex_enabled,
                u.plex_package_id,
                sp.name as plex_package_name,
                sp.price_type as plex_price_type,
                u.plex_email,
                u.plex_expiration_date,
                u.iptv_enabled,
                u.iptv_panel_id,
                ip.name as iptv_panel_name,
                u.iptv_username,
                u.iptv_expiration_date,
                u.iptv_editor_enabled,
                u.plex_cancelled_at,
                u.iptv_cancelled_at,
                u.is_active,
                u.created_at,
                u.updated_at
            FROM users u
            LEFT JOIN subscription_plans sp ON u.plex_package_id = sp.id
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
        `;

        const conditions = [];
        const values = [];

        // IMPORTANT: Exclude app users (admins/staff) - only show subscription users
        conditions.push('(u.is_app_user = 0 OR u.is_app_user IS NULL)');

        if (!includeInactive) {
            conditions.push('u.is_active = TRUE');
        }

        if (searchQuery) {
            conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.iptv_username LIKE ? OR u.plex_email LIKE ? OR u.plex_username LIKE ?)');
            const searchPattern = `%${searchQuery}%`;
            values.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Filter by owner
        if (ownerId) {
            conditions.push('u.owner_id = ?');
            values.push(ownerId);
        }

        // Filter by tag - requires join with user_tags table
        if (tagId) {
            sql = sql.replace('FROM users u', 'FROM users u INNER JOIN user_tags ut ON u.id = ut.user_id');
            conditions.push('ut.tag_id = ?');
            values.push(tagId);
        }

        // Filter by expiring soon (within 7 days)
        if (expiringSoon) {
            const now = new Date().toISOString();
            const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            if (expiringSoon === 'plex') {
                conditions.push(`(u.plex_enabled = 1 AND (sp.price_type IS NULL OR sp.price_type != 'free') AND u.plex_expiration_date IS NOT NULL AND u.plex_expiration_date >= ? AND u.plex_expiration_date <= ?)`);
                values.push(now, sevenDays);
            } else if (expiringSoon === 'iptv') {
                conditions.push(`(u.iptv_enabled = 1 AND u.iptv_expiration_date IS NOT NULL AND u.iptv_expiration_date >= ? AND u.iptv_expiration_date <= ?)`);
                values.push(now, sevenDays);
            } else if (expiringSoon === 'any') {
                conditions.push(`((u.plex_enabled = 1 AND (sp.price_type IS NULL OR sp.price_type != 'free') AND u.plex_expiration_date IS NOT NULL AND u.plex_expiration_date >= ? AND u.plex_expiration_date <= ?) OR (u.iptv_enabled = 1 AND u.iptv_expiration_date IS NOT NULL AND u.iptv_expiration_date >= ? AND u.iptv_expiration_date <= ?))`);
                values.push(now, sevenDays, now, sevenDays);
            }
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY u.created_at DESC';

        const users = await db.query(sql, values);

        // Get tags for each user
        for (const user of users) {
            const tags = await db.query(`
                SELECT t.id, t.name, t.color, ut.assigned_by
                FROM user_tags ut
                INNER JOIN tags t ON ut.tag_id = t.id
                WHERE ut.user_id = ?
                ORDER BY t.name
            `, [user.id]);

            user.tags = tags;
        }

        res.json({
            success: true,
            users,
            count: users.length
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// GET /api/v2/users/:id - Get single user
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const users = await db.query(`
            SELECT
                u.*,
                sp_plex.name as plex_package_name,
                sp_plex.price_type as plex_price_type,
                sp_iptv.name as iptv_subscription_name,
                sp_iptv.iptv_connections as iptv_subscription_connections,
                ip.name as iptv_panel_name,
                ip.panel_type,
                owner.name as owner_name,
                owner.email as owner_email
            FROM users u
            LEFT JOIN subscription_plans sp_plex ON u.plex_package_id = sp_plex.id AND sp_plex.service_type = 'plex'
            LEFT JOIN subscription_plans sp_iptv ON u.iptv_subscription_plan_id = sp_iptv.id AND sp_iptv.service_type = 'iptv'
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            WHERE u.id = ?
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Get user tags
        const tags = await db.query(`
            SELECT t.id, t.name, t.color, ut.assigned_by
            FROM user_tags ut
            INNER JOIN tags t ON ut.tag_id = t.id
            WHERE ut.user_id = ?
            ORDER BY t.name
        `, [id]);

        user.tags = tags;

        // Get IPTV panel credentials if enabled
        if (user.iptv_enabled) {
            // IPTV panel credentials are stored in the users table itself
            user.iptv_accounts = [{
                username: user.iptv_username,
                password: user.iptv_password,
                m3u_url: user.iptv_m3u_url
            }];
        }

        // Get Plex shares if user has Plex enabled
        if (user.plex_enabled) {
            const plexShares = await db.query(`
                SELECT
                    ups.id,
                    ups.plex_server_id,
                    ps.name as server_name,
                    ups.library_ids,
                    ups.share_status
                FROM user_plex_shares ups
                INNER JOIN plex_servers ps ON ups.plex_server_id = ps.id
                WHERE ups.user_id = ? AND ups.removed_at IS NULL AND (ups.share_status IS NULL OR ups.share_status != 'removed')
            `, [id]);

            // Parse library_ids JSON
            plexShares.forEach(share => {
                share.library_ids = JSON.parse(share.library_ids);
            });

            user.plex_shares = plexShares;

            // Get plex activity data (days_since_last_activity, is_pending_invite) from plex_user_activity
            // Use plex_email or email to match (lowercase for case-insensitive matching)
            const plexEmailToCheck = (user.plex_email || user.email || '').toLowerCase();
            if (plexEmailToCheck) {
                const activityData = await db.query(`
                    SELECT
                        pua.plex_server_id,
                        pua.days_since_last_activity,
                        pua.last_seen_at,
                        pua.is_pending_invite,
                        pua.is_active_friend
                    FROM plex_user_activity pua
                    WHERE LOWER(pua.plex_user_email) = ?
                    ORDER BY pua.last_seen_at DESC
                `, [plexEmailToCheck]);

                // Create a map of server_id to activity data
                const activityMap = {};
                activityData.forEach(activity => {
                    activityMap[activity.plex_server_id] = activity;
                });

                // Merge activity data into plex_shares and find minimum days_since_last_activity
                let minDaysSinceActivity = null;
                plexShares.forEach(share => {
                    const activity = activityMap[share.plex_server_id];
                    if (activity) {
                        share.days_since_last_activity = activity.days_since_last_activity;
                        share.last_seen_at = activity.last_seen_at;
                        share.is_pending_invite = activity.is_pending_invite;
                        share.is_active_friend = activity.is_active_friend;
                        // Use activity data for accepted status (more accurate than share_status)
                        share.accepted = activity.is_pending_invite === 0;

                        // Track minimum days since activity across all servers
                        if (activity.days_since_last_activity !== null) {
                            if (minDaysSinceActivity === null || activity.days_since_last_activity < minDaysSinceActivity) {
                                minDaysSinceActivity = activity.days_since_last_activity;
                            }
                        }
                    } else {
                        // Default to share_status if no activity data
                        share.accepted = share.share_status === 'accepted';
                    }
                });

                // Add overall days_since_last_activity to user (minimum across all servers)
                user.plex_days_since_last_activity = minDaysSinceActivity;
            }
        }

        // Get IPTV Editor info if enabled
        if (user.iptv_editor_enabled) {
            const editorAccounts = await db.query(`
                SELECT
                    edu.id,
                    edu.iptv_editor_playlist_id,
                    iep.name as playlist_name,
                    edu.iptv_editor_id,
                    edu.iptv_editor_username,
                    edu.iptv_editor_password,
                    edu.m3u_code,
                    edu.epg_code,
                    edu.expiry_date,
                    edu.last_sync_time,
                    edu.sync_status
                FROM iptv_editor_users edu
                INNER JOIN iptv_editor_playlists iep ON edu.iptv_editor_playlist_id = iep.id
                WHERE edu.user_id = ?
            `, [id]);

            user.iptv_editor_accounts = editorAccounts;
        }

        // Get last portal login timestamp
        const lastPortalLogin = await db.query(`
            SELECT MAX(created_at) as last_portal_login
            FROM portal_sessions
            WHERE user_id = ?
        `, [id]);

        user.last_portal_login = lastPortalLogin[0]?.last_portal_login || null;

        // Parse custom_payment_methods JSON if present
        if (user.custom_payment_methods && typeof user.custom_payment_methods === 'string') {
            try {
                user.custom_payment_methods = JSON.parse(user.custom_payment_methods);
            } catch (e) {
                user.custom_payment_methods = [];
            }
        }

        res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
});

// POST /api/v2/users - Create new user (ASYNC with job processing)
router.post('/', async (req, res) => {
    console.log('🚀 [NEW POST ROUTE] User creation started with JobProcessor');
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const {
            name, email, account_type, notes, owner_id,
            // Email Preferences
            exclude_from_bulk_emails, bcc_owner_on_renewal, exclude_from_automated_emails,
            // Plex
            plex_enabled, plex_package_id, plex_email, plex_duration_months,
            plex_expiration_date: plex_expiration_date_override,  // Manual expiration override
            plex_send_welcome_email, plex_welcome_email_template_id,
            plex_skip_provisioning,  // Skip Plex API calls when linking existing user with unchanged access
            // IPTV
            iptv_enabled, iptv_panel_id, iptv_username, iptv_password, iptv_email,
            iptv_package_id, iptv_subscription_plan_id, iptv_channel_group_id, iptv_is_trial,
            iptv_duration_months, iptv_notes,
            iptv_send_welcome_email, iptv_welcome_email_template_id,
            // IPTV VOD Visibility
            show_iptv_movies, show_iptv_series,
            // IPTV Linked User
            iptv_is_linked_user, iptv_linked_panel_user_id, iptv_linked_editor_user_id,
            iptv_linked_editor_username, iptv_linked_editor_password, iptv_linked_editor_playlist_id,
            // IPTV Editor
            create_on_iptv_editor,
            // Tags
            tag_ids,
            // Add Service Mode (existing user)
            existing_user_id,
            // Request Site Access
            rs_has_access
        } = req.body;

        // Check if this is "Add Service" mode (adding services to existing user)
        const isAddServiceMode = !!existing_user_id;

        // Validation - only require name/email for new users, not add service mode
        if (!isAddServiceMode && (!name || !email)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Name and email are required'
            });
        }

        // Check for duplicate email (only for new user creation)
        // IMPORTANT: Only check for existing SUBSCRIPTION users with this email
        // Admins can have the same email - they are completely separate
        if (!isAddServiceMode) {
            const [existingUsers] = await connection.execute(
                'SELECT id FROM users WHERE email = ? AND (is_app_user = 0 OR is_app_user IS NULL)',
                [email]
            );

            if (existingUsers.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'A subscription user with this email already exists'
                });
            }
        } else {
            // Verify the existing user actually exists and get their email for fallback
            const [existingUsers] = await connection.execute(
                'SELECT id, email, name FROM users WHERE id = ?',
                [existing_user_id]
            );

            if (existingUsers.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Existing user not found'
                });
            }
            console.log(`📝 [ADD SERVICE MODE] Adding services to existing user ${existing_user_id}`);
        }

        // For Add Service mode, get fallback values from existing user
        let effectiveEmail = email;
        let effectiveName = name;
        if (isAddServiceMode) {
            const [existingUserData] = await connection.execute(
                'SELECT email, name FROM users WHERE id = ?',
                [existing_user_id]
            );
            if (existingUserData.length > 0) {
                effectiveEmail = email || existingUserData[0].email;
                effectiveName = name || existingUserData[0].name;
                console.log(`📝 [ADD SERVICE MODE] Effective email: ${effectiveEmail}, name: ${effectiveName}`);
            }
        }

        // IPTV expiration will be set by the panel after user creation - don't calculate it
        const iptvExpirationDate = null;

        // Note: plexExpirationDate is calculated after package validation to check if plan is free

        // Map account_type
        let validAccountType = 'paid';
        if (account_type === 'free') validAccountType = 'free';
        else if (account_type === 'trial' || iptv_is_trial) validAccountType = 'trial';
        else if (account_type === 'paid' || account_type === 'standard') validAccountType = 'paid';

        // Validate plex_package_id (now points to subscription_plans table)
        let validPlexPackageId = null;
        let isFreePlexPlan = false;
        if (plex_package_id) {
            const [plexPackageCheck] = await connection.execute(
                "SELECT id, price_type, price FROM subscription_plans WHERE id = ? AND service_type IN ('plex', 'combo')",
                [plex_package_id]
            );
            if (plexPackageCheck.length > 0) {
                validPlexPackageId = plex_package_id;
                const plan = plexPackageCheck[0];
                // Only check price_type - donation plans may have price=0 but should still have expiration
                if (plan.price_type === 'free') {
                    isFreePlexPlan = true;
                }
            }
        }

        // Calculate plex expiration date - free plans have no expiration
        // Use manual override if provided, otherwise calculate from duration
        let plexExpirationDate = null;
        if (plex_enabled && !isFreePlexPlan) {
            if (plex_expiration_date_override) {
                // Use the manually set expiration date from the form
                // Handle both date string and datetime formats
                const manualDate = new Date(plex_expiration_date_override + 'T00:00:00');
                plexExpirationDate = manualDate.toISOString().slice(0, 19).replace('T', ' ');
                console.log(`📅 [PLEX] Using manual expiration date: ${plexExpirationDate}`);
            } else if (plex_duration_months) {
                // Fall back to calculating from duration
                const expirationDate = new Date();
                expirationDate.setMonth(expirationDate.getMonth() + parseInt(plex_duration_months));
                plexExpirationDate = expirationDate.toISOString().slice(0, 19).replace('T', ' ');
                console.log(`📅 [PLEX] Calculated expiration from duration: ${plexExpirationDate}`);
            }
        }

        // Validate iptv_package_id (panel package ID - used for provisioning)
        let validIPTVPackageId = null;
        if (iptv_package_id) {
            validIPTVPackageId = iptv_package_id;  // No validation needed - panel will validate
        }

        // Validate iptv_subscription_plan_id (subscription plan choice - saved to DB only)
        let validIPTVSubscriptionPlanId = null;
        if (iptv_subscription_plan_id) {
            const [iptvSubPlanCheck] = await connection.execute(
                "SELECT id FROM subscription_plans WHERE id = ? AND service_type IN ('iptv', 'combo')",
                [iptv_subscription_plan_id]
            );
            if (iptvSubPlanCheck.length > 0) {
                validIPTVSubscriptionPlanId = iptv_subscription_plan_id;
            }
        }

        let userId;

        if (isAddServiceMode) {
            // ADD SERVICE MODE: Update existing user with new service fields
            userId = existing_user_id;

            // Build dynamic update query for only the service being added
            const updates = [];
            const values = [];

            // Update Plex fields if enabling Plex
            if (plex_enabled) {
                updates.push('plex_enabled = ?');
                values.push(1);
                // Clear any previous cancellation fields when re-enabling service
                updates.push('plex_cancelled_at = NULL');
                updates.push('plex_scheduled_deletion = NULL');
                updates.push('plex_cancellation_reason = NULL');
                if (validPlexPackageId) {
                    updates.push('plex_package_id = ?');
                    values.push(validPlexPackageId);
                }
                if (plex_email) {
                    updates.push('plex_email = ?');
                    values.push(plex_email);
                }
                if (plexExpirationDate) {
                    updates.push('plex_expiration_date = ?');
                    values.push(plexExpirationDate);
                }
            }

            // Update IPTV fields if enabling IPTV
            if (iptv_enabled) {
                updates.push('iptv_enabled = ?');
                values.push(1);
                // Clear any previous cancellation fields when re-enabling service
                updates.push('iptv_cancelled_at = NULL');
                updates.push('iptv_scheduled_deletion = NULL');
                updates.push('iptv_cancellation_reason = NULL');
                if (iptv_panel_id) {
                    updates.push('iptv_panel_id = ?');
                    values.push(iptv_panel_id);
                }
                if (iptv_username) {
                    updates.push('iptv_username = ?');
                    values.push(iptv_username);
                }
                if (iptv_password) {
                    updates.push('iptv_password = ?');
                    values.push(iptv_password);
                }
                if (iptv_email) {
                    updates.push('iptv_email = ?');
                    values.push(iptv_email);
                }
                if (validIPTVPackageId) {
                    updates.push('iptv_package_id = ?');
                    values.push(validIPTVPackageId);
                }
                if (validIPTVSubscriptionPlanId) {
                    updates.push('iptv_subscription_plan_id = ?');
                    values.push(validIPTVSubscriptionPlanId);
                }
                if (iptv_channel_group_id) {
                    updates.push('iptv_channel_group_id = ?');
                    values.push(iptv_channel_group_id);
                }
                updates.push('iptv_is_trial = ?');
                values.push(iptv_is_trial ? 1 : 0);
                if (iptv_duration_months) {
                    updates.push('iptv_duration_months = ?');
                    values.push(iptv_duration_months);
                }
                if (create_on_iptv_editor) {
                    updates.push('iptv_editor_enabled = ?');
                    values.push(1);
                }
                // VOD visibility settings
                if (show_iptv_movies !== undefined) {
                    updates.push('show_iptv_movies = ?');
                    values.push(show_iptv_movies ? 1 : 0);
                }
                if (show_iptv_series !== undefined) {
                    updates.push('show_iptv_series = ?');
                    values.push(show_iptv_series ? 1 : 0);
                }
            }

            updates.push("updated_at = datetime('now')");
            values.push(userId);

            await connection.execute(`
                UPDATE users SET ${updates.join(', ')} WHERE id = ?
            `, values);
        } else {
            // NEW USER MODE: Insert user record
            // Generate created_at timestamp in SQLite format
            const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // Determine rs_has_access value:
            // - If explicitly provided, use that value
            // - Otherwise, default to 1 (enabled) for Plex users, 0 (disabled) for IPTV-only
            let effectiveRsHasAccess;
            if (rs_has_access !== undefined && rs_has_access !== null) {
                effectiveRsHasAccess = rs_has_access ? 1 : 0;
            } else {
                effectiveRsHasAccess = plex_enabled ? 1 : 0;
            }

            const [userResult] = await connection.execute(`
                INSERT INTO users (
                    name, email, account_type, notes, owner_id,
                    exclude_from_bulk_emails, bcc_owner_on_renewal, exclude_from_automated_emails,
                    plex_enabled, plex_package_id, plex_email, plex_expiration_date,
                    iptv_enabled, iptv_panel_id, iptv_username, iptv_password, iptv_email,
                    iptv_package_id, iptv_subscription_plan_id, iptv_channel_group_id, iptv_is_trial, iptv_duration_months, iptv_expiration_date, iptv_editor_enabled,
                    show_iptv_movies, show_iptv_series,
                    rs_has_access, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `, [
                name, email, validAccountType, notes || null, owner_id || null,
                exclude_from_bulk_emails ? 1 : 0, bcc_owner_on_renewal ? 1 : 0, exclude_from_automated_emails ? 1 : 0,
                plex_enabled ? 1 : 0, validPlexPackageId, plex_email || email, plexExpirationDate,
                iptv_enabled ? 1 : 0, iptv_panel_id || null, iptv_username || null,
                iptv_password || null, iptv_email || null,
                validIPTVPackageId, validIPTVSubscriptionPlanId, iptv_channel_group_id || null, iptv_is_trial ? 1 : 0, iptv_duration_months || null, iptvExpirationDate, create_on_iptv_editor ? 1 : 0,
                show_iptv_movies !== false ? 1 : 0, show_iptv_series !== false ? 1 : 0,
                effectiveRsHasAccess, createdAt
            ]);

            userId = userResult.insertId;
        }

        // Assign manual tags if provided
        if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
            for (const tagId of tag_ids) {
                try {
                    await connection.execute(`
                        INSERT INTO user_tags (user_id, tag_id, assigned_by)
                        VALUES (?, ?, 'manual')
                    `, [userId, tagId]);
                } catch (tagError) {
                    console.error(`Error assigning tag ${tagId}:`, tagError);
                }
            }
        }

        // Auto-assign tags immediately based on user's Plex/IPTV configuration
        // (IPTV tags will work immediately, Plex tags will be assigned after background jobs create shares)
        try {
            await autoAssignTagsForUser(userId);
            console.log(`✅ Auto-assigned tags for user ${userId}`);
        } catch (autoTagError) {
            console.error('Error auto-assigning tags:', autoTagError);
            // Don't fail the whole user creation if tag assignment fails
        }

        await connection.commit();
        connection.release();

        // Create job for background Plex/IPTV provisioning
        const jobId = jobProcessor.createJob(userId);
        const userMessage = isAddServiceMode ? 'Service added to existing user' : 'User created successfully';
        jobProcessor.updateJobStatus(jobId, 'user', 'completed', userMessage);

        // Build config for background jobs
        const jobConfig = {};

        try {

        // === PLEX CONFIG ===
        if (plex_enabled) {
            const plexSharesData = req.body.plex_server_library_selections || req.body.plex_shares;

            // Check if we should skip provisioning (linking existing user with unchanged access)
            if (plex_skip_provisioning) {
                console.log('📺 [PLEX CONFIG] Skipping provisioning - linking existing Plex user with unchanged access');
                // Still save the user_plex_shares data if provided
                if (plexSharesData && Array.isArray(plexSharesData) && plexSharesData.length > 0) {
                    for (const share of plexSharesData) {
                        if (share.server_id && share.library_ids && share.library_ids.length > 0) {
                            // Save to user_plex_shares table (SQLite syntax)
                            await connection.execute(`
                                INSERT OR REPLACE INTO user_plex_shares
                                (user_id, plex_server_id, library_ids, share_status, shared_at, updated_at)
                                VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
                            `, [userId, share.server_id, JSON.stringify(share.library_ids)]);
                            console.log(`📺 [PLEX] Saved existing access for server ${share.server_id}: ${share.library_ids.length} libraries`);
                        }
                    }
                    // Auto-assign tags now that Plex shares are saved
                    try {
                        await autoAssignTagsForUser(userId);
                        console.log(`✅ [PLEX] Auto-assigned tags for user ${userId} after linking existing Plex access`);
                    } catch (tagError) {
                        console.error('[PLEX] Failed to auto-assign tags:', tagError);
                    }
                }
                jobProcessor.updateJobStatus(jobId, 'plex', 'completed', 'Linked existing Plex access (no changes)');
            } else {
                // Check for manual library selection FIRST (takes priority over package-based)
                if (plexSharesData && Array.isArray(plexSharesData) && plexSharesData.length > 0) {
                    // Manual library selection
                    const serverConfigs = [];
                    for (const share of plexSharesData) {
                        if (share.server_id && share.library_ids && share.library_ids.length > 0) {
                            serverConfigs.push({
                                serverId: share.server_id,
                                libraryIds: share.library_ids
                            });
                        }
                    }
                    if (serverConfigs.length > 0) {
                        jobConfig.plex = {
                            serverConfigs,
                            libraryIds: [],
                            email: plex_email || effectiveEmail,
                            userId: userId,
                            send_welcome_email: plex_send_welcome_email || false,
                            welcome_email_template_id: plex_welcome_email_template_id || null
                        };
                        console.log('📺 [PLEX CONFIG] Using manual library selection:', JSON.stringify(serverConfigs, null, 2));
                        console.log('📺 [PLEX CONFIG] Plex email to use:', plex_email || effectiveEmail);
                        console.log('📺 [PLEX CONFIG] Send welcome email:', plex_send_welcome_email, 'Template ID:', plex_welcome_email_template_id);
                    }
                }

                // Only use package-based if no manual selection was made
                if (!jobConfig.plex && validPlexPackageId) {
                    // Package-based configuration (requires actual plex_packages entry)
                    // Note: plex_package_id here is subscription_plans.id, which may have a linked plex_package_id
                    jobConfig.plex = {
                        packageId: plex_package_id,
                        email: plex_email || effectiveEmail,
                        userId: userId,
                        send_welcome_email: plex_send_welcome_email || false,
                        welcome_email_template_id: plex_welcome_email_template_id || null
                    };
                    console.log('📺 [PLEX CONFIG] Using package-based provisioning with package ID:', plex_package_id);
                    console.log('📺 [PLEX CONFIG] Plex email to use:', plex_email || effectiveEmail);
                    console.log('📺 [PLEX CONFIG] Send welcome email:', plex_send_welcome_email, 'Template ID:', plex_welcome_email_template_id);
                }
            }
        } else {
            jobProcessor.updateJobStatus(jobId, 'plex', 'completed', 'Plex not enabled');
        }

        // === IPTV CONFIG ===
        if (iptv_enabled && iptv_panel_id && (iptv_package_id || iptv_is_linked_user)) {
            let packageData = null;

            // Only fetch package data for new users (not linked users)
            if (iptv_package_id) {
                // Get package data
                const [packageRows] = await connection.execute(
                    'SELECT id, iptv_panel_id, package_id as panel_package_id, name as package_name, credits as credit_cost FROM iptv_packages WHERE id = ?',
                    [iptv_package_id]
                );

                if (packageRows.length === 0) {
                    jobProcessor.updateJobStatus(jobId, 'iptv', 'error', 'IPTV package not found');
                    jobProcessor.updateJobStatus(jobId, 'iptvEditor', 'completed', 'IPTV package not found');
                } else {
                    packageData = packageRows[0];
                }
            }

            // Continue if we have package data OR if this is a linked user
            if (packageData || iptv_is_linked_user) {
                let bouquetIds = [];
                let editorChannelIds = [];
                let editorMovieIds = [];
                let editorSeriesIds = [];

                // Get channel group data
                if (iptv_channel_group_id) {
                    const [channelGroupRows] = await connection.execute(
                        'SELECT bouquet_ids, editor_channel_ids, editor_movie_ids, editor_series_ids FROM iptv_channel_groups WHERE id = ?',
                        [iptv_channel_group_id]
                    );

                    if (channelGroupRows.length > 0) {
                        const channelGroup = channelGroupRows[0];
                        bouquetIds = JSON.parse(channelGroup.bouquet_ids || '[]');
                        editorChannelIds = JSON.parse(channelGroup.editor_channel_ids || '[]');
                        editorMovieIds = JSON.parse(channelGroup.editor_movie_ids || '[]');
                        editorSeriesIds = JSON.parse(channelGroup.editor_series_ids || '[]');
                    }
                }

                // Get panel config
                const [panelRows] = await connection.execute(
                    'SELECT id, base_url, panel_settings, m3u_url, iptv_editor_playlist_id FROM iptv_panels WHERE id = ?',
                    [iptv_panel_id]
                );

                if (panelRows.length > 0) {
                    const panel = panelRows[0];
                    const panelSettings = panel.panel_settings ? JSON.parse(panel.panel_settings) : {};
                    const providerBaseUrl = panelSettings.provider_base_url || panel.base_url;

                    jobConfig.iptv = {
                        panel_id: iptv_panel_id,
                        username: iptv_username,
                        password: iptv_password,
                        packageData,
                        bouquet_ids: bouquetIds,
                        is_trial: iptv_is_trial || false,
                        notes: iptv_notes || '',
                        provider_base_url: providerBaseUrl,
                        // Linked user information
                        is_linked_user: iptv_is_linked_user || false,
                        linked_panel_user_id: iptv_linked_panel_user_id || null,
                        linked_editor_user_id: iptv_linked_editor_user_id || null,
                        linked_editor_username: iptv_linked_editor_username || null,
                        linked_editor_password: iptv_linked_editor_password || null,
                        linked_editor_playlist_id: iptv_linked_editor_playlist_id || null,
                        // Welcome email settings
                        send_welcome_email: iptv_send_welcome_email || false,
                        welcome_email_template_id: iptv_welcome_email_template_id || null
                    };

                    // === IPTV EDITOR CONFIG ===
                    if (create_on_iptv_editor) {
                        // Get bearer token from settings
                        const [bearerTokenRow] = await connection.execute(`
                            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'bearer_token'
                        `);

                        // Get the IPTV Editor playlist linked to this panel
                        let playlist = null;
                        if (panel.iptv_editor_playlist_id) {
                            const [playlists] = await connection.execute(`
                                SELECT id, playlist_id, provider_base_url
                                FROM iptv_editor_playlists
                                WHERE id = ?
                            `, [panel.iptv_editor_playlist_id]);
                            playlist = playlists.length > 0 ? playlists[0] : null;
                        }

                        if (bearerTokenRow.length > 0 && playlist) {
                            const bearerToken = bearerTokenRow[0].setting_value;
                            jobConfig.iptvEditor = {
                                api_base_url: 'https://editor.iptveditor.com',
                                bearer_token: bearerToken,
                                playlist_id: playlist.playlist_id,
                                playlist_db_id: playlist.id,
                                channel_ids: editorChannelIds,
                                movie_ids: editorMovieIds,
                                series_ids: editorSeriesIds,
                                provider_base_url: playlist.provider_base_url,
                                notes: iptv_notes
                            };
                        } else {
                            const errorMsg = bearerTokenRow.length === 0 ? 'No IPTV Editor bearer token configured' :
                                !panel.iptv_editor_playlist_id ? 'Panel has no IPTV Editor playlist linked' :
                                'IPTV Editor playlist not found';
                            jobProcessor.updateJobStatus(jobId, 'iptvEditor', 'error', errorMsg);
                        }
                    } else {
                        jobProcessor.updateJobStatus(jobId, 'iptvEditor', 'completed', 'IPTV Editor not requested');
                    }
                }
            }  // Close: if (packageData || iptv_is_linked_user)
        } else {
            jobProcessor.updateJobStatus(jobId, 'iptv', 'completed', 'IPTV not enabled');
            jobProcessor.updateJobStatus(jobId, 'iptvEditor', 'completed', 'IPTV not enabled');
        }

        } catch (configError) {
            console.error('Error building job config:', configError);
            // User was already created, so just mark jobs as error
            if (plex_enabled) {
                jobProcessor.updateJobStatus(jobId, 'plex', 'error', 'Failed to configure Plex job');
            }
            if (iptv_enabled) {
                jobProcessor.updateJobStatus(jobId, 'iptv', 'error', 'Failed to configure IPTV job');
                jobProcessor.updateJobStatus(jobId, 'iptvEditor', 'error', 'Failed to configure IPTV Editor job');
            }
        }

        // Start background processing
        jobProcessor.processUserCreationJobs(jobId, {
            user_id: userId,
            email: email
        }, jobConfig);

        // Return immediately with job_id
        res.status(201).json({
            success: true,
            message: 'User creation started',
            job_id: jobId,
            user_id: userId
        });

    } catch (error) {
        // Only rollback if we haven't committed yet
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // Transaction may already be committed, ignore rollback error
            }
            connection.release();
        }
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: error.message
        });
    }
});

// GET /api/v2/users/creation-status/:job_id - Get job status
router.get('/creation-status/:job_id', (req, res) => {
    try {
        const { job_id } = req.params;
        const status = jobProcessor.getJobStatus(job_id);

        if (!status.success) {
            return res.status(404).json({
                success: false,
                message: status.message || 'Job not found'
            });
        }

        // Transform stages format to the format the frontend expects
        const response = {
            success: true,
            job_id: status.job_id,
            status: status.status,
            userId: status.userId
        };

        // Map stages to individual job fields (frontend expects user_job, plex_job, etc.)
        if (status.stages) {
            if (status.stages.user) {
                response.user_job = status.stages.user;
            }
            if (status.stages.plex) {
                response.plex_job = status.stages.plex;
            }
            if (status.stages.iptv) {
                response.iptv_job = status.stages.iptv;
            }
            if (status.stages.iptvEditor) {
                response.iptv_editor_job = status.stages.iptvEditor;
            }
        }

        res.json(response);
    } catch (error) {
        console.error('Error getting job status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get job status',
            error: error.message
        });
    }
});

// PUT /api/v2/users/:id - Update user
router.put('/:id', async (req, res) => {
    console.log('📝 [USER UPDATE] PUT /api/v2/users/' + req.params.id);
    console.log('📝 [USER UPDATE] plex_package_id received:', req.body.plex_package_id);

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            name,
            email,
            account_type,
            notes,
            is_active,
            owner_id,
            // Email Preferences
            exclude_from_bulk_emails,
            bcc_owner_on_renewal,
            exclude_from_automated_emails,
            // Plex updates
            plex_enabled,
            plex_package_id,
            plex_email,
            plex_expiration_date,
            // IPTV updates
            iptv_enabled,
            iptv_panel_id,
            iptv_username,
            iptv_password,
            iptv_package_id,
            iptv_subscription_plan_id,
            iptv_channel_group_id,
            iptv_expiration_date,
            // IPTV Editor updates
            iptv_editor_enabled,
            iptv_editor_id,
            iptv_editor_username,
            iptv_editor_password,
            iptv_editor_m3u_url,
            iptv_editor_epg_url,
            // IPTV VOD Visibility
            show_iptv_movies,
            show_iptv_series,
            // Contact and Payment Fields
            telegram_username,
            whatsapp_username,
            discord_username,
            venmo_username,
            paypal_username,
            cashapp_username,
            google_pay_username,
            apple_cash_username,
            // Payment Preference
            payment_preference,
            custom_payment_methods,
            // Tags
            tag_ids,
            // Request Site Access
            rs_has_access
        } = req.body;

        // Check if user exists
        const [existingUsers] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (existingUsers.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const existingUser = existingUsers[0];

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            values.push(email);
        }
        if (account_type !== undefined) {
            updates.push('account_type = ?');
            values.push(account_type);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (owner_id !== undefined) {
            updates.push('owner_id = ?');
            values.push(owner_id);
        }
        if (exclude_from_bulk_emails !== undefined) {
            updates.push('exclude_from_bulk_emails = ?');
            values.push(exclude_from_bulk_emails ? 1 : 0);
        }
        if (bcc_owner_on_renewal !== undefined) {
            updates.push('bcc_owner_on_renewal = ?');
            values.push(bcc_owner_on_renewal ? 1 : 0);
        }
        if (exclude_from_automated_emails !== undefined) {
            updates.push('exclude_from_automated_emails = ?');
            values.push(exclude_from_automated_emails ? 1 : 0);
        }
        if (payment_preference !== undefined) {
            updates.push('payment_preference = ?');
            values.push(payment_preference);
        }
        if (custom_payment_methods !== undefined) {
            updates.push('custom_payment_methods = ?');
            values.push(JSON.stringify(custom_payment_methods));
        }
        if (plex_enabled !== undefined) {
            updates.push('plex_enabled = ?');
            values.push(plex_enabled ? 1 : 0);
        }
        // Check if the new plex plan is free - if so, clear expiration date
        let isFreePlexPlan = false;
        if (plex_package_id !== undefined) {
            updates.push('plex_package_id = ?');
            values.push(plex_package_id);

            // Check if this is a free plan (by price_type or by price = 0)
            if (plex_package_id) {
                const [planCheck] = await connection.execute(
                    "SELECT price_type, price FROM subscription_plans WHERE id = ?",
                    [plex_package_id]
                );
                console.log(`🔍 [FREE PLAN CHECK] plex_package_id: ${plex_package_id}, planCheck:`, planCheck);
                if (planCheck.length > 0) {
                    const plan = planCheck[0];
                    // Only check price_type - donation plans may have price=0 but should still have expiration
                    if (plan.price_type === 'free') {
                        isFreePlexPlan = true;
                        console.log('✅ [FREE PLAN] Detected free plan - will clear expiration date');
                    }
                }
            }
        }
        if (plex_email !== undefined) {
            updates.push('plex_email = ?');
            values.push(plex_email);
        }
        // For free plans, always clear expiration date; otherwise use provided value
        if (isFreePlexPlan) {
            updates.push('plex_expiration_date = ?');
            values.push(null);
        } else if (plex_expiration_date !== undefined) {
            updates.push('plex_expiration_date = ?');
            values.push(plex_expiration_date);
        }
        if (iptv_enabled !== undefined) {
            updates.push('iptv_enabled = ?');
            values.push(iptv_enabled ? 1 : 0);
        }
        if (iptv_panel_id !== undefined) {
            updates.push('iptv_panel_id = ?');
            values.push(iptv_panel_id);
        }
        if (iptv_username !== undefined) {
            updates.push('iptv_username = ?');
            values.push(iptv_username);
        }
        if (iptv_password !== undefined) {
            updates.push('iptv_password = ?');
            values.push(iptv_password);
        }
        if (iptv_package_id !== undefined) {
            updates.push('iptv_package_id = ?');
            values.push(iptv_package_id);
        }
        if (iptv_subscription_plan_id !== undefined) {
            updates.push('iptv_subscription_plan_id = ?');
            values.push(iptv_subscription_plan_id);
        }
        if (iptv_channel_group_id !== undefined) {
            updates.push('iptv_channel_group_id = ?');
            values.push(iptv_channel_group_id);
        }
        if (iptv_expiration_date !== undefined) {
            updates.push('iptv_expiration_date = ?');
            values.push(iptv_expiration_date);
        }
        if (iptv_editor_enabled !== undefined) {
            updates.push('iptv_editor_enabled = ?');
            values.push(iptv_editor_enabled ? 1 : 0);
        }
        if (iptv_editor_id !== undefined) {
            updates.push('iptv_editor_id = ?');
            values.push(iptv_editor_id);
        }
        if (iptv_editor_username !== undefined) {
            updates.push('iptv_editor_username = ?');
            values.push(iptv_editor_username);
        }
        if (iptv_editor_password !== undefined) {
            updates.push('iptv_editor_password = ?');
            values.push(iptv_editor_password);
        }
        if (iptv_editor_m3u_url !== undefined) {
            updates.push('iptv_editor_m3u_url = ?');
            values.push(iptv_editor_m3u_url);
        }
        if (iptv_editor_epg_url !== undefined) {
            updates.push('iptv_editor_epg_url = ?');
            values.push(iptv_editor_epg_url);
        }
        // IPTV VOD Visibility
        if (show_iptv_movies !== undefined) {
            updates.push('show_iptv_movies = ?');
            values.push(show_iptv_movies ? 1 : 0);
        }
        if (show_iptv_series !== undefined) {
            updates.push('show_iptv_series = ?');
            values.push(show_iptv_series ? 1 : 0);
        }
        if (telegram_username !== undefined) {
            updates.push('telegram_username = ?');
            values.push(telegram_username);
        }
        if (whatsapp_username !== undefined) {
            updates.push('whatsapp_username = ?');
            values.push(whatsapp_username);
        }
        if (discord_username !== undefined) {
            updates.push('discord_username = ?');
            values.push(discord_username);
        }
        if (venmo_username !== undefined) {
            updates.push('venmo_username = ?');
            values.push(venmo_username);
        }
        if (paypal_username !== undefined) {
            updates.push('paypal_username = ?');
            values.push(paypal_username);
        }
        if (cashapp_username !== undefined) {
            updates.push('cashapp_username = ?');
            values.push(cashapp_username);
        }
        if (google_pay_username !== undefined) {
            updates.push('google_pay_username = ?');
            values.push(google_pay_username);
        }
        if (apple_cash_username !== undefined) {
            updates.push('apple_cash_username = ?');
            values.push(apple_cash_username);
        }
        // Request Site Access
        if (rs_has_access !== undefined) {
            updates.push('rs_has_access = ?');
            // Handle 'auto', 'enabled', 'disabled' from frontend or direct 0/1/null
            if (rs_has_access === 'auto' || rs_has_access === null) {
                values.push(null);
            } else if (rs_has_access === 'enabled' || rs_has_access === true || rs_has_access === 1) {
                values.push(1);
            } else if (rs_has_access === 'disabled' || rs_has_access === false || rs_has_access === 0) {
                values.push(0);
            } else {
                values.push(rs_has_access ? 1 : 0);
            }
        }

        // Check if there's anything to update (either user fields or tags)
        const hasTagUpdate = tag_ids !== undefined && Array.isArray(tag_ids);

        if (updates.length === 0 && !hasTagUpdate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        // Only run user update if there are field updates
        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(id);

            // Debug: Log values to find any non-primitive types
            console.log('📝 UPDATE values debug:');
            values.forEach((v, i) => {
                const type = typeof v;
                const isArray = Array.isArray(v);
                const isObject = v !== null && type === 'object' && !isArray;
                if (isArray || isObject) {
                    console.log(`  ⚠️ values[${i}] = ${JSON.stringify(v)} (${isArray ? 'ARRAY' : 'OBJECT'}) - THIS WILL CAUSE ERROR`);
                }
            });

            await connection.execute(`
                UPDATE users
                SET ${updates.join(', ')}
                WHERE id = ?
            `, values);
        }

        // Handle tag updates - replace all manual tags
        if (hasTagUpdate) {
            // Delete existing manual tags (keep auto-assigned ones)
            await connection.execute(
                'DELETE FROM user_tags WHERE user_id = ? AND assigned_by = ?',
                [id, 'manual']
            );

            // Insert new tags
            for (const tagId of tag_ids) {
                try {
                    await connection.execute(`
                        INSERT INTO user_tags (user_id, tag_id, assigned_by)
                        VALUES (?, ?, 'manual')
                    `, [id, tagId]);
                } catch (tagErr) {
                    // Ignore duplicate key errors for auto-assigned tags
                    if (!tagErr.message.includes('UNIQUE constraint') && !tagErr.message.includes('Duplicate')) {
                        throw tagErr;
                    }
                }
            }
            console.log(`✅ Updated tags for user ${id}: ${tag_ids.length} tags`);
        }

        // Auto-assign tags based on user's Plex/IPTV access changes
        try {
            await autoAssignTagsForUser(id);
        } catch (autoTagError) {
            console.error('Error auto-assigning tags:', autoTagError);
            // Don't fail the whole user update if tag assignment fails
        }

        // Auto-complete portal service requests when user has service enabled
        // This handles: 1) User being enabled for first time, 2) User already enabled with stale requests
        try {
            // Check the final plex_enabled state (either new value or existing)
            const finalPlexEnabled = plex_enabled !== undefined ? plex_enabled : existingUser.plex_enabled;
            if (finalPlexEnabled) {
                const [plexComplete] = await connection.execute(`
                    UPDATE portal_service_requests
                    SET provisioning_status = 'completed',
                        provisioned_at = datetime('now'),
                        updated_at = datetime('now')
                    WHERE user_id = ?
                      AND service_type = 'plex'
                      AND payment_status = 'verified'
                      AND (provisioning_status IS NULL OR provisioning_status = 'pending')
                `, [id]);
                if (plexComplete.affectedRows > 0) {
                    console.log(`✅ Auto-completed ${plexComplete.affectedRows} Plex service request(s) for user ${id}`);
                }
            }

            // Check the final iptv_enabled state (either new value or existing)
            const finalIptvEnabled = iptv_enabled !== undefined ? iptv_enabled : existingUser.iptv_enabled;
            if (finalIptvEnabled) {
                const [iptvComplete] = await connection.execute(`
                    UPDATE portal_service_requests
                    SET provisioning_status = 'completed',
                        provisioned_at = datetime('now'),
                        updated_at = datetime('now')
                    WHERE user_id = ?
                      AND service_type = 'iptv'
                      AND payment_status = 'verified'
                      AND (provisioning_status IS NULL OR provisioning_status = 'pending')
                `, [id]);
                if (iptvComplete.affectedRows > 0) {
                    console.log(`✅ Auto-completed ${iptvComplete.affectedRows} IPTV service request(s) for user ${id}`);
                }
            }
        } catch (serviceReqError) {
            console.error('Error auto-completing service requests:', serviceReqError);
            // Don't fail the whole user update if service request completion fails
        }

        await connection.commit();

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

// DELETE /api/v2/users/:id - Delete user
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { delete_from_plex, delete_from_iptv } = req.body;

        console.log(`🗑️ Deleting user ${id} (delete_from_plex: ${delete_from_plex}, delete_from_iptv: ${delete_from_iptv})`);

        // Get user details with Plex and IPTV info
        const [users] = await connection.execute(`
            SELECT
                u.*,
                u.plex_enabled,
                u.plex_package_id,
                u.iptv_enabled,
                u.iptv_panel_id,
                u.iptv_line_id,
                u.iptv_editor_enabled
            FROM users u
            WHERE u.id = ?
        `, [id]);

        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];
        const deletionResults = {
            local: false,
            plex: null,
            iptv: null,
            iptvEditor: null
        };

        // ===== PLEX DELETION =====
        if (delete_from_plex && user.plex_enabled) {
            try {
                // Check if user has a package AND the package exists in the system
                const plexPackage = user.plex_package_id ? plexManager.getPackage(user.plex_package_id) : null;

                if (plexPackage) {
                    // Package exists - use package-based removal
                    console.log(`🗑️ Removing user from Plex package ${user.plex_package_id} (${plexPackage.name})...`);

                    const result = await plexManager.removeUserByPackage(
                        user.email,
                        user.plex_package_id,
                        user.id
                    );

                    deletionResults.plex = {
                        success: true,
                        details: result
                    };
                } else {
                    // No package or package not found - remove from all servers they're shared on
                    if (user.plex_package_id) {
                        console.log(`⚠️ Package ${user.plex_package_id} not found in system, falling back to server shares...`);
                    }
                    console.log(`🗑️ Removing user ${user.email} from all Plex servers...`);

                    const [shares] = await connection.execute(`
                        SELECT DISTINCT plex_server_id
                        FROM user_plex_shares
                        WHERE user_id = ? AND removed_at IS NULL
                    `, [user.id]);

                    if (shares.length > 0) {
                        const results = [];
                        for (const share of shares) {
                            const server = plexManager.servers.get(share.plex_server_id);
                            if (server) {
                                try {
                                    console.log(`📡 Removing from server: ${server.name}...`);
                                    const result = await plexManager.removeUserFromServer(user.email, server);
                                    results.push({ server: server.name, success: true, result });
                                } catch (error) {
                                    console.error(`❌ Failed to remove from ${server.name}:`, error.message);
                                    results.push({ server: server.name, success: false, error: error.message });
                                }
                            }
                        }

                        deletionResults.plex = {
                            success: results.some(r => r.success),
                            details: results
                        };
                    } else {
                        console.log(`⚠️ No active Plex shares found for user ${user.id}`);
                        deletionResults.plex = {
                            success: true,
                            message: 'No active Plex shares found'
                        };
                    }
                }

                console.log(`✅ Successfully removed user from Plex`);
            } catch (error) {
                console.error(`❌ Failed to remove user from Plex:`, error);
                deletionResults.plex = {
                    success: false,
                    error: error.message
                };
            }
        }

        // ===== IPTV DELETION =====
        if (delete_from_iptv && user.iptv_enabled) {
            // Delete from IPTV Panel
            if (user.iptv_panel_id && user.iptv_line_id) {
                try {
                    console.log(`🗑️ Deleting user from IPTV Panel ${user.iptv_panel_id}, line ${user.iptv_line_id}...`);

                    await iptvManager.deleteUserFromPanel(
                        user.iptv_panel_id,
                        user.iptv_line_id
                    );

                    deletionResults.iptv = {
                        success: true,
                        message: 'User deleted from IPTV panel'
                    };

                    console.log(`✅ Successfully deleted user from IPTV panel`);
                } catch (error) {
                    console.error(`❌ Failed to delete user from IPTV panel:`, error);
                    deletionResults.iptv = {
                        success: false,
                        error: error.message
                    };
                }
            }

            // Delete from IPTV Editor (if enabled)
            if (user.iptv_editor_enabled) {
                try {
                    console.log(`🗑️ Deleting user from IPTV Editor...`);

                    // Get IPTV Editor user info and JOIN with playlists to get the actual playlist_id
                    const [editorUsers] = await connection.execute(`
                        SELECT
                            edu.iptv_editor_id,
                            edu.iptv_editor_playlist_id,
                            iep.playlist_id as actual_playlist_id
                        FROM iptv_editor_users edu
                        LEFT JOIN iptv_editor_playlists iep ON edu.iptv_editor_playlist_id = iep.id
                        WHERE edu.user_id = ?
                        LIMIT 1
                    `, [user.id]);

                    if (editorUsers.length > 0) {
                        const editorUser = editorUsers[0];

                        // Use the actual playlist_id from the join, or fall back to the stored value
                        const playlistId = editorUser.actual_playlist_id || editorUser.iptv_editor_playlist_id;

                        console.log(`📡 Deleting IPTV Editor user ${editorUser.iptv_editor_id} from playlist ${playlistId}`);

                        // Initialize IPTV Editor service
                        const editorService = new IPTVEditorService();
                        await editorService.initialize();

                        // Delete from IPTV Editor
                        await editorService.deleteUser(
                            editorUser.iptv_editor_id,
                            playlistId
                        );

                        deletionResults.iptvEditor = {
                            success: true,
                            message: 'User deleted from IPTV Editor'
                        };

                        console.log(`✅ Successfully deleted user from IPTV Editor`);
                    } else {
                        console.log(`⚠️ No IPTV Editor user found for user ${id}`);
                        deletionResults.iptvEditor = {
                            success: true,
                            message: 'No IPTV Editor user found (may have already been deleted)'
                        };
                    }
                } catch (error) {
                    console.error(`❌ Failed to delete user from IPTV Editor:`, error);
                    deletionResults.iptvEditor = {
                        success: false,
                        error: error.message
                    };
                }
            }
        }

        // ===== LOCAL DATABASE DELETION =====
        // Explicitly delete related records first (in case ON DELETE CASCADE isn't set)
        console.log(`🗑️ Cleaning up related records for user ${id}...`);

        // Delete from join/related tables first
        await connection.execute('DELETE FROM user_plex_shares WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM user_tags WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM iptv_editor_users WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM portal_service_requests WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM portal_sessions WHERE user_id = ?', [id]);
        await connection.execute('DELETE FROM portal_messages WHERE user_id = ?', [id]);

        // Now delete the user record
        await connection.execute('DELETE FROM users WHERE id = ?', [id]);
        deletionResults.local = true;
        console.log(`✅ User ${id} deleted from local database`);

        await connection.commit();

        res.json({
            success: true,
            message: 'User deleted successfully',
            results: deletionResults
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

// POST /api/v2/users/:id/extend-plex - Extend Plex subscription
router.post('/:id/extend-plex', async (req, res) => {
    try {
        const { id } = req.params;
        const { months } = req.body;

        if (!months || months <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid months value is required'
            });
        }

        const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Calculate new expiration date using proper month addition
        const currentExpiration = user.plex_expiration_date ?
            new Date(user.plex_expiration_date) : new Date();

        const newExpiration = new Date(currentExpiration);
        newExpiration.setMonth(newExpiration.getMonth() + parseInt(months));

        await db.query(
            'UPDATE users SET plex_expiration_date = ? WHERE id = ?',
            [newExpiration, id]
        );

        res.json({
            success: true,
            message: 'Plex subscription extended successfully',
            new_expiration_date: newExpiration
        });

    } catch (error) {
        console.error('Error extending Plex subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to extend Plex subscription',
            error: error.message
        });
    }
});

// POST /api/v2/users/:id/update-plex-libraries - Update user's Plex library access
router.post('/:id/update-plex-libraries', async (req, res) => {
    try {
        const { id } = req.params;
        const { plex_server_library_selections } = req.body;

        // Validate input
        if (!plex_server_library_selections || !Array.isArray(plex_server_library_selections)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid library selections'
            });
        }

        // Get user
        const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];
        const userEmail = user.plex_email || user.email;

        console.log(`🎬 Updating Plex library access for user ${id} (${userEmail})`);

        // Process all servers in PARALLEL for speed
        const updatePromises = plex_server_library_selections.map(async (selection) => {
            const { server_id, library_ids } = selection;

            if (!server_id || !Array.isArray(library_ids)) {
                console.warn(`⚠️ Invalid selection format, skipping:`, selection);
                return { server_id, success: false, message: 'Invalid selection format' };
            }

            try {
                // Get server from PlexServiceManager
                const server = plexManager.getServer(server_id);
                if (!server) {
                    console.warn(`⚠️ Server ${server_id} not found, skipping`);
                    return { server_id, success: false, message: `Server ${server_id} not found` };
                }

                // Update library sharing via Plex API
                const shareResult = await plexManager.shareLibrariesOnServer(
                    userEmail,
                    server,
                    library_ids,
                    user.id
                );

                console.log(`✅ Updated libraries on server ${server_id}:`, shareResult);

                // Update database to reflect the new library selections
                await db.query(`DELETE FROM user_plex_shares WHERE user_id = ? AND plex_server_id = ?`, [id, server_id]);
                await db.query(`INSERT INTO user_plex_shares (user_id, plex_server_id, library_ids) VALUES (?, ?, ?)`,
                    [id, server_id, JSON.stringify(library_ids)]);

                console.log(`📚 Updated database with ${library_ids.length} libraries for server ${server_id}`);

                return {
                    server_id,
                    success: true,
                    shared_libraries: shareResult.shared_libraries || library_ids.length
                };

            } catch (error) {
                console.error(`❌ Failed to update libraries on server ${server_id}:`, error);
                return { server_id, success: false, message: error.message };
            }
        });

        const results = await Promise.all(updatePromises);

        res.json({
            success: true,
            message: 'Plex library access updated successfully',
            results
        });

    } catch (error) {
        console.error('Error updating Plex library access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update Plex library access',
            error: error.message
        });
    }
});

// POST /api/v2/users/:id/sync-plex-libraries - Sync library access from Plex
router.post('/:id/sync-plex-libraries', async (req, res) => {
    try {
        const { id } = req.params;
        const users = await db.query('SELECT id, plex_email, email, plex_enabled FROM users WHERE id = ?', [id]);
        if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        const user = users[0];
        if (!user.plex_enabled) return res.status(400).json({ success: false, message: 'User does not have Plex enabled' });
        const userEmail = (user.plex_email || user.email || '').toLowerCase();
        if (!userEmail) return res.status(400).json({ success: false, message: 'User has no email for Plex lookup' });

        const servers = await db.query(`SELECT id, name, url, server_id, token FROM plex_servers WHERE is_active = 1`);
        if (servers.length === 0) return res.status(400).json({ success: false, message: 'No active Plex servers configured' });

        const results = [];
        for (const server of servers) {
            try {
                const result = await getUserLibraryAccess(server, userEmail);
                if (result.success && result.libraryIds) {
                    const existingShares = await db.query(`SELECT id FROM user_plex_shares WHERE user_id = ? AND plex_server_id = ?`, [id, server.id]);
                    const libraryJson = JSON.stringify(result.libraryIds.map(String));
                    if (existingShares.length > 0) {
                        await db.query(`UPDATE user_plex_shares SET library_ids = ?, updated_at = datetime('now') WHERE user_id = ? AND plex_server_id = ?`, [libraryJson, id, server.id]);
                        results.push({ server_id: server.id, server_name: server.name, success: true, libraries_found: result.libraryIds.length });
                    } else {
                        await db.query(`INSERT INTO user_plex_shares (user_id, plex_server_id, library_ids, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [id, server.id, libraryJson]);
                        results.push({ server_id: server.id, server_name: server.name, success: true, libraries_found: result.libraryIds.length });
                    }
                } else {
                    // User not found on this server - remove any existing share record
                    const existingShares = await db.query(`SELECT id FROM user_plex_shares WHERE user_id = ? AND plex_server_id = ?`, [id, server.id]);
                    if (existingShares.length > 0) {
                        await db.query(`DELETE FROM user_plex_shares WHERE user_id = ? AND plex_server_id = ?`, [id, server.id]);
                        results.push({ server_id: server.id, server_name: server.name, success: true, libraries_found: 0, action: 'removed' });
                    } else {
                        results.push({ server_id: server.id, server_name: server.name, success: true, libraries_found: 0, message: 'No access' });
                    }
                }
            } catch (e) {
                results.push({ server_id: server.id, server_name: server.name, success: false, message: e.message });
            }
        }
        const successCount = results.filter(r => r.success).length;
        const totalLibraries = results.reduce((sum, r) => sum + (r.libraries_found || 0), 0);
        res.json({ success: true, message: `Synced ${successCount}/${servers.length} servers (${totalLibraries} libraries)`, results });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to sync', error: error.message });
    }
});

// POST /api/v2/users/:id/extend-iptv - Extend IPTV subscription
router.post('/:id/extend-iptv', async (req, res) => {
    try {
        const { id } = req.params;
        const { months } = req.body;

        if (!months || months <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid months value is required'
            });
        }

        const users = await db.query('SELECT * FROM users WHERE id = ?', [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        if (!user.iptv_enabled || !user.iptv_panel_id || !user.iptv_line_id) {
            return res.status(400).json({
                success: false,
                message: 'User does not have an IPTV subscription'
            });
        }

        // Update expiration date
        const currentExpiration = user.iptv_expiration_date ?
            new Date(user.iptv_expiration_date) : new Date();

        const newExpiration = new Date(currentExpiration);
        newExpiration.setMonth(newExpiration.getMonth() + parseInt(months));

        await db.query(
            'UPDATE users SET iptv_expiration_date = ? WHERE id = ?',
            [newExpiration, id]
        );

        res.json({
            success: true,
            message: 'IPTV subscription extended successfully',
            new_expiration_date: newExpiration
        });

    } catch (error) {
        console.error('Error extending IPTV subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to extend IPTV subscription',
            error: error.message
        });
    }
});

// POST /api/v2/users/:id/iptv-editor/create - Create new IPTV Editor user for existing user
router.post('/:id/iptv-editor/create', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const {
            iptv_editor_playlist_id,
            iptv_channel_group_id,  // Get channel package ID to fetch category IDs
            notes = ''
        } = req.body;

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get user details with IPTV credentials
        const [userRows] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (userRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        const user = userRows[0];

        // Check if user has IPTV credentials
        if (!user.iptv_username || !user.iptv_password) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'User must have IPTV credentials before creating IPTV Editor account'
            });
        }

        // Get IPTV Editor playlist details
        const [playlistRows] = await connection.execute(`
            SELECT id, playlist_id, provider_base_url
            FROM iptv_editor_playlists
            WHERE id = ?
        `, [iptv_editor_playlist_id]);

        if (playlistRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }
        const playlist = playlistRows[0];

        // Get channel package category IDs if provided
        let editorChannelIds = [];
        let editorMovieIds = [];
        let editorSeriesIds = [];

        if (iptv_channel_group_id) {
            const [channelGroupRows] = await connection.execute(`
                SELECT editor_channel_ids, editor_movie_ids, editor_series_ids
                FROM iptv_channel_groups
                WHERE id = ?
            `, [iptv_channel_group_id]);

            if (channelGroupRows.length > 0) {
                const channelGroup = channelGroupRows[0];
                try {
                    editorChannelIds = channelGroup.editor_channel_ids ? JSON.parse(channelGroup.editor_channel_ids) : [];
                    editorMovieIds = channelGroup.editor_movie_ids ? JSON.parse(channelGroup.editor_movie_ids) : [];
                    editorSeriesIds = channelGroup.editor_series_ids ? JSON.parse(channelGroup.editor_series_ids) : [];
                } catch (parseError) {
                    console.error('Error parsing channel group IDs:', parseError);
                }
            }
        }

        // Get bearer token and editor DNS
        const [tokenRows] = await connection.execute(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'bearer_token'
        `);
        const [dnsRows] = await connection.execute(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'
        `);

        if (tokenRows.length === 0) {
            await connection.rollback();
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured'
            });
        }
        const bearerToken = tokenRows[0].setting_value;
        const editorDns = dnsRows.length > 0 ? dnsRows[0].setting_value : '';

        // Call IPTV Editor service to create user
        const editorService = new IPTVEditorService(
            'https://editor.iptveditor.com',
            bearerToken,
            iptv_editor_playlist_id
        );

        // Prepare create user payload
        const createUserPayload = {
            name: user.email || user.name || 'User',
            note: notes || '',
            username: user.iptv_username,  // Use existing IPTV username
            password: user.iptv_password,  // Use existing IPTV password
            channels_categories: editorChannelIds,
            vods_categories: editorMovieIds,
            series_categories: editorSeriesIds,
            provider_base_url: playlist.provider_base_url
        };

        // Use existing IPTV credentials (like the wizard does)
        const createResult = await editorService.createUser(createUserPayload);

        // Extract data from create response
        const editorId = createResult.id;
        const m3uCode = createResult.m3u || null;
        const epgCode = createResult.epg || null;

        // Get the actual IPTV Editor playlist_id from database
        const [playlistIdRows] = await connection.execute(`
            SELECT playlist_id FROM iptv_editor_playlists WHERE id = ?
        `, [iptv_editor_playlist_id]);

        const actualPlaylistId = playlistIdRows[0].playlist_id;

        // Retry mechanism to fetch user credentials from get-data
        // The IPTV Editor API may take a few seconds to include the new user
        let editorUsername = null;
        let editorPassword = null;
        let getDataPayload = { playlist: actualPlaylistId };
        let getDataResponse = null;
        const maxRetries = 3;
        const retryDelayMs = 3000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));

            getDataResponse = await editorService.makeRequest('/api/reseller/get-data', getDataPayload);

            if (getDataResponse && getDataResponse.items && Array.isArray(getDataResponse.items)) {
                // Search by ID - this is the most reliable method
                const createdUser = getDataResponse.items.find(item => item.id === editorId);

                if (createdUser) {
                    // Use username and password fields from IPTV Editor API
                    editorUsername = createdUser.username;
                    editorPassword = createdUser.password;
                    break; // Found the user, exit retry loop
                }
            }
        }

        // Generate M3U URL using provider_base_url and IPTV Editor username/password
        let m3uUrl = null;
        if (playlist.provider_base_url && editorUsername && editorPassword) {
            m3uUrl = `${playlist.provider_base_url}/get.php?username=${editorUsername}&password=${editorPassword}&type=m3u_plus&output=ts`;
        }

        // Try to call force-sync to get expiry and max_connections if panel credentials exist
        let expiryDate = null;
        let maxConnections = null;

        if (user.iptv_url && user.iptv_username && user.iptv_password) {
            try {
                console.log('🔄 Calling force-sync to get expiry and max_connections...');

                const syncPayload = {
                    editorUser: {
                        iptv_editor_id: editorId,
                        iptv_editor_username: editorUsername,
                        iptv_editor_password: editorPassword,
                        m3u_code: m3uCode,
                        epg_code: epgCode,
                        notes: notes || '',
                        created_at: new Date().toISOString()
                    },
                    panelUrl: user.iptv_url,
                    panelUsername: user.iptv_username,
                    panelPassword: user.iptv_password,
                    panelType: user.iptv_panel_type || 'nxt_dash',
                    panelM3uUrl: user.iptv_m3u_url
                };

                const syncResult = await editorService.forceSync(syncPayload);

                // Extract expiry and max_connections from sync result
                if (syncResult && syncResult.items && syncResult.items.length > 0) {
                    expiryDate = syncResult.items[0].expiry || null;
                    maxConnections = syncResult.items[0].max_connections || null;
                    console.log('✅ Retrieved from force-sync:');
                    console.log('   Expiry:', expiryDate);
                    console.log('   Max Connections:', maxConnections);
                }
            } catch (syncError) {
                console.log('⚠️ Force-sync failed (continuing without expiry/max_connections):', syncError.message);
                // Continue without force-sync data
            }
        } else {
            console.log('⚠️ Skipping force-sync (no panel credentials)');
        }

        // Insert into iptv_editor_users table with all data
        await connection.execute(`
            INSERT INTO iptv_editor_users (
                user_id, iptv_editor_playlist_id, iptv_editor_id,
                iptv_editor_username, iptv_editor_password, m3u_code, epg_code,
                expiry_date, max_connections,
                sync_status, last_sync_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'), datetime('now'))
        `, [
            id,
            iptv_editor_playlist_id,
            editorId,  // Use the ID from createResult
            editorUsername,
            editorPassword,
            m3uCode,
            epgCode,
            expiryDate,
            maxConnections
        ]);

        // Update users table with IPTV Editor data
        await connection.execute(`
            UPDATE users
            SET iptv_editor_enabled = 1,
                iptv_editor_id = ?,
                iptv_editor_username = ?,
                iptv_editor_password = ?,
                iptv_editor_m3u_url = ?
            WHERE id = ?
        `, [editorId, editorUsername, editorPassword, m3uUrl, id]);

        await connection.commit();
        connection.release();

        console.log('✅ IPTV Editor user creation complete for user', id);

        res.json({
            success: true,
            message: 'IPTV Editor user created successfully',
            editorUser: {
                id: editorId,  // Use the ID from createResult
                username: editorUsername,
                password: editorPassword,
                m3u_code: m3uCode,
                epg_code: epgCode,
                m3u_url: m3uUrl,
                expiration_date: expiryDate,
                max_connections: maxConnections,
                sync_status: 'synced',
                last_sync_time: new Date().toISOString()
            },
            debug: {
                createUserRequest: {
                    endpoint: '/api/reseller/customer',
                    payload: createUserPayload
                },
                createUserResponse: createResult,
                getDataRequest: {
                    endpoint: '/api/reseller/get-data',
                    payload: getDataPayload,
                    lookingForId: editorId
                },
                getDataResponse: {
                    totalUsers: getDataResponse?.items?.length || 0,
                    foundUser: getDataResponse?.items?.find(item => item.id === editorId) || null,
                    first5Users: getDataResponse?.items?.slice(0, 5) || [],
                    allUserIds: getDataResponse?.items?.map(item => item.id) || []
                },
                extraction: {
                    editorId: editorId,
                    editorUsername: editorUsername,
                    editorPassword: editorPassword,
                    m3uCode: m3uCode,
                    epgCode: epgCode,
                    m3uUrl: m3uUrl,
                    providerBaseUrl: playlist.provider_base_url
                }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                // Ignore rollback errors (transaction may not be active)
                console.log('Rollback not needed or already completed');
            }
            connection.release();
        }
        console.error('Error creating IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create IPTV Editor user',
            error: error.message
        });
    }
});

// POST /api/v2/users/:id/iptv-panel/sync-expiration - Sync expiration date from IPTV panel
router.post('/:id/iptv-panel/sync-expiration', async (req, res) => {
    try {
        const { id } = req.params;

        // Get user - just need their IPTV credentials
        const users = await db.query(`SELECT * FROM users WHERE id = ?`, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        if (!user.iptv_username || !user.iptv_password) {
            return res.status(400).json({
                success: false,
                message: 'User does not have IPTV panel credentials'
            });
        }

        // Get panel URL from iptv_url, or extract from iptv_m3u_url
        let panelUrl = user.iptv_url;
        if (!panelUrl && user.iptv_m3u_url) {
            // Extract base URL from M3U URL (e.g., https://example.com/get.php?... -> https://example.com)
            try {
                const url = new URL(user.iptv_m3u_url);
                panelUrl = `${url.protocol}//${url.host}`;
            } catch (e) {
                console.log('Failed to parse M3U URL:', e.message);
            }
        }

        if (!panelUrl) {
            return res.status(400).json({
                success: false,
                message: 'Could not determine IPTV panel URL'
            });
        }

        console.log(`🔄 Syncing expiration for user ${id} from panel ${panelUrl}`);

        // Call the panel's player_api to get user info
        const axios = require('axios');
        const cleanPanelUrl = panelUrl.replace(/\/$/, '');
        const playerApiUrl = `${cleanPanelUrl}/player_api.php?username=${encodeURIComponent(user.iptv_username)}&password=${encodeURIComponent(user.iptv_password)}`;

        const panelResponse = await axios.get(playerApiUrl, {
            timeout: 30000,
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!panelResponse.data || !panelResponse.data.user_info) {
            return res.status(400).json({
                success: false,
                message: 'Could not get user info from panel'
            });
        }

        const userInfo = panelResponse.data.user_info;
        let expirationDate = null;

        // Extract expiration date from panel response
        if (userInfo.exp_date) {
            // exp_date is typically a Unix timestamp
            if (typeof userInfo.exp_date === 'number' || !isNaN(userInfo.exp_date)) {
                // Use local date to avoid timezone issues
                const date = new Date(parseInt(userInfo.exp_date) * 1000);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                expirationDate = `${year}-${month}-${day}`;
            } else {
                expirationDate = userInfo.exp_date;
            }
        }

        console.log(`✅ Got expiration from panel: ${expirationDate}`);

        // Update user's expiration date in database
        await db.query(`
            UPDATE users
            SET iptv_expiration_date = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [expirationDate, id]);

        res.json({
            success: true,
            message: 'Expiration date synced from panel',
            expiration_date: expirationDate,
            panel_user_info: {
                status: userInfo.status,
                max_connections: userInfo.max_connections,
                exp_date: userInfo.exp_date
            }
        });

    } catch (error) {
        console.error('Error syncing IPTV panel expiration:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to sync expiration from panel'
        });
    }
});

// POST /api/v2/users/:id/iptv-editor/link - Link existing IPTV Editor user to existing user
router.post('/:id/iptv-editor/link', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const {
            iptv_editor_playlist_id,
            iptv_editor_username,
            iptv_editor_password
        } = req.body;

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Get user details
        const [userRows] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (userRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get IPTV Editor playlist details
        const [playlistRows] = await connection.execute(`
            SELECT id, playlist_id, provider_base_url
            FROM iptv_editor_playlists
            WHERE id = ?
        `, [iptv_editor_playlist_id]);

        if (playlistRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor playlist not found'
            });
        }
        const playlist = playlistRows[0];
        const editorDns = playlist.provider_base_url;

        // Get bearer token
        const [tokenRows] = await connection.execute(`
            SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'bearer_token'
        `);

        if (tokenRows.length === 0) {
            await connection.rollback();
            return res.status(500).json({
                success: false,
                message: 'IPTV Editor bearer token not configured'
            });
        }
        const bearerToken = tokenRows[0].setting_value;

        // Call IPTV Editor service to search for existing user
        // Constructor: new IPTVEditorService(apiBaseUrl, bearerToken, playlistId)
        const editorService = new IPTVEditorService(
            'https://editor.iptveditor.com',
            bearerToken,
            iptv_editor_playlist_id  // Our internal database ID
        );
        const searchResult = await editorService.findUserByUsername(
            iptv_editor_username,
            iptv_editor_playlist_id  // Our internal database ID
        );

        if (!searchResult || !searchResult.id) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor user not found'
            });
        }

        console.log('✅ Found IPTV Editor user:', {
            id: searchResult.id,
            username: searchResult.username,
            password: searchResult.password,
            exp_date: searchResult.exp_date,
            max_connections: searchResult.max_connections
        });

        // Extract data from the search result (NOT from request body)
        const editorUsername = searchResult.username;
        const editorPassword = searchResult.password;
        const m3uCode = searchResult.m3u_code || null;
        const epgCode = searchResult.epg_code || null;
        const expiryDate = searchResult.exp_date || searchResult.expiry || null;
        const maxConnections = searchResult.max_connections || null;

        // Generate M3U URL using the IPTV Editor credentials from the search result
        let m3uUrl = null;
        if (editorDns && editorUsername && editorPassword) {
            m3uUrl = `${editorDns}/get.php?username=${editorUsername}&password=${editorPassword}&type=m3u_plus&output=ts`;
            console.log('✅ Generated M3U URL with credentials:', editorUsername);
        }

        // Insert into iptv_editor_users table
        const [insertResult] = await connection.execute(`
            INSERT INTO iptv_editor_users (
                user_id, iptv_editor_playlist_id, iptv_editor_id,
                iptv_editor_username, iptv_editor_password, m3u_code, epg_code,
                expiry_date, max_connections, sync_status, last_sync_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'), datetime('now'))
        `, [
            id,
            iptv_editor_playlist_id,
            searchResult.id,
            editorUsername,
            editorPassword,
            m3uCode,
            epgCode,
            expiryDate,
            maxConnections
        ]);

        // Update users table with IPTV Editor data including M3U URL
        await connection.execute(`
            UPDATE users
            SET iptv_editor_enabled = 1,
                iptv_editor_username = ?,
                iptv_editor_password = ?,
                iptv_editor_m3u_url = ?
            WHERE id = ?
        `, [editorUsername, editorPassword, m3uUrl, id]);

        await connection.commit();
        connection.release();

        res.json({
            success: true,
            message: 'IPTV Editor user linked successfully',
            editor_user: {
                id: searchResult.id,
                username: editorUsername,
                password: editorPassword,
                m3u_code: m3uCode,
                epg_code: epgCode,
                m3u_url: m3uUrl,
                expiration_date: expiryDate,
                max_connections: maxConnections,
                epg_url: searchResult.epg_url
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Error linking IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to link IPTV Editor user',
            error: error.message
        });
    }
});

// DELETE /api/v2/users/:id/plex - Remove only Plex access from user
router.delete('/:id/plex', async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        // Check if we should also delete from Plex servers (default: true for backwards compatibility)
        const deleteFromServers = req.query.delete_from_servers !== 'false';

        console.log(`🗑️ Removing Plex access for user ${id} (delete from servers: ${deleteFromServers})`);

        // Get user details
        const [users] = await connection.execute(`
            SELECT * FROM users
            WHERE id = ? AND plex_enabled = 1
        `, [id]);

        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found or does not have Plex access'
            });
        }

        const user = users[0];
        const deletionResults = {
            plex: null
        };

        // Remove from Plex servers (only if deleteFromServers is true)
        if (deleteFromServers) {
            try {
                // Determine the correct identifier to use for Plex removal
                // Priority: plex_email > plex_username > email
                const plexIdentifier = user.plex_email || user.plex_username || user.email;
                console.log(`🗑️ Removing user from Plex servers using identifier: ${plexIdentifier}`);
                console.log(`   (plex_email: ${user.plex_email}, plex_username: ${user.plex_username}, email: ${user.email})`);

                // Get all servers the user has access to from user_plex_shares
                const [shares] = await connection.execute(`
                    SELECT DISTINCT plex_server_id
                    FROM user_plex_shares
                    WHERE user_id = ? AND removed_at IS NULL
                `, [user.id]);

                // Get list of servers to try removal on
                let serversToTry = [];

                if (shares.length > 0) {
                    // Use servers from shares
                    for (const share of shares) {
                        const server = plexManager.servers.get(share.plex_server_id);
                        if (server) {
                            serversToTry.push(server);
                        } else {
                            console.log(`⚠️ Server ${share.plex_server_id} not found in manager`);
                        }
                    }
                }

                // If no shares found or no servers from shares, try ALL active servers
                if (serversToTry.length === 0) {
                    console.log(`ℹ️ No active Plex shares found, trying ALL active servers...`);
                    for (const [serverId, server] of plexManager.servers) {
                        serversToTry.push(server);
                    }
                }

                if (serversToTry.length > 0) {
                    const results = [];
                    for (const server of serversToTry) {
                        try {
                            console.log(`📡 Removing from server: ${server.name}...`);
                            const result = await plexManager.removeUserFromServer(plexIdentifier, server);
                            results.push({ server: server.name, success: true, result });
                            console.log(`✅ Successfully removed from ${server.name}`);
                        } catch (error) {
                            console.error(`❌ Failed to remove from ${server.name}:`, error.message);
                            results.push({ server: server.name, success: false, error: error.message });
                        }
                    }

                    deletionResults.plex = {
                        success: results.some(r => r.success),
                        details: results
                    };
                } else {
                    console.log(`⚠️ No Plex servers available in manager`);
                    deletionResults.plex = {
                        success: false,
                        message: 'No Plex servers available'
                    };
                }

                console.log(`✅ Plex server removal complete`);
            } catch (error) {
                console.error(`❌ Failed to remove user from Plex:`, error);
                deletionResults.plex = {
                    success: false,
                    error: error.message
                };
            }
        } else {
            console.log(`📋 Skipping Plex server deletion (local only)`);
            deletionResults.plex = {
                success: true,
                message: 'Skipped - local database only'
            };
        }

        // Update user - disable Plex
        await connection.execute(`
            UPDATE users
            SET plex_enabled = 0,
                plex_package_id = NULL,
                plex_email = NULL,
                plex_expiration_date = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `, [id]);

        // Mark all plex shares as removed
        await connection.execute(`
            UPDATE user_plex_shares
            SET removed_at = datetime('now')
            WHERE user_id = ? AND removed_at IS NULL
        `, [id]);

        // Clean up any pending/verified Plex service requests for this user
        // Since the service is now removed, these requests are no longer relevant
        await connection.execute(`
            DELETE FROM portal_service_requests
            WHERE user_id = ? AND service_type = 'plex' AND payment_status IN ('pending', 'submitted', 'verified')
        `, [id]);

        // Remove Plex-related auto-assigned tags
        // These are tags with auto_assign_enabled that are linked to Plex servers
        await connection.execute(`
            DELETE FROM user_tags
            WHERE user_id = ?
            AND tag_id IN (
                SELECT DISTINCT t.id
                FROM tags t
                INNER JOIN tag_plex_servers tps ON t.id = tps.tag_id
                WHERE t.auto_assign_enabled = 1
            )
        `, [id]);

        await connection.commit();

        res.json({
            success: true,
            message: 'Plex access removed successfully',
            results: deletionResults
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error removing Plex access:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to remove Plex access'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// GET /api/v2/users/:id/renewal-packages - Get available IPTV renewal packages for a user
router.get('/:id/renewal-packages', async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.params;

        console.log(`📦 Fetching available renewal packages for user ${id}`);

        // Get user details with IPTV info
        const [users] = await connection.execute(`
            SELECT
                u.*,
                ip.panel_type,
                ip.name as panel_name
            FROM users u
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ? AND u.iptv_enabled = 1
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found or does not have IPTV access'
            });
        }

        const user = users[0];

        // Validate required IPTV fields
        if (!user.iptv_panel_id || !user.iptv_line_id) {
            return res.status(400).json({
                success: false,
                message: 'User missing IPTV panel or line information'
            });
        }

        console.log(`📋 User ${id} IPTV details: panel=${user.iptv_panel_id} (${user.panel_type}), line=${user.iptv_line_id}`);

        // Fetch available extension packages from the panel
        try {
            const packages = await iptvManager.getExtensionPackages(user.iptv_panel_id, user.iptv_line_id);

            console.log(`✅ Found ${packages.length} renewal packages for user ${id}`);

            res.json({
                success: true,
                packages: packages,
                panel_type: user.panel_type,
                current_package_id: user.iptv_panel_package_id
            });
        } catch (panelError) {
            console.error(`❌ Failed to fetch packages from panel:`, panelError.message);
            res.status(500).json({
                success: false,
                message: `Failed to fetch packages from panel: ${panelError.message}`
            });
        }

    } catch (error) {
        console.error('Error fetching renewal packages:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch renewal packages'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// POST /api/v2/users/:id/renew-iptv - Renew IPTV subscription
router.post('/:id/renew-iptv', async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.params;
        // Get optional package_id and bouquet_sync_mode from request body
        const { package_id: selectedPackageId, bouquet_sync_mode: bouquetSyncMode } = req.body || {};

        // Debug logging to see what we're receiving
        console.log(`🔄 [RENEW-IPTV] Raw request body:`, JSON.stringify(req.body));
        console.log(`🔄 [RENEW-IPTV] Extracted: selectedPackageId=${selectedPackageId}, bouquetSyncMode=${bouquetSyncMode}`);
        console.log(`🔄 Renewing IPTV subscription for user ${id}${selectedPackageId ? ` with package ${selectedPackageId}` : ''}${bouquetSyncMode ? ` (bouquet sync: ${bouquetSyncMode})` : ''}`);

        // Get user details with IPTV info
        const [users] = await connection.execute(`
            SELECT
                u.*,
                ip.panel_type,
                ip.name as panel_name
            FROM users u
            LEFT JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
            WHERE u.id = ? AND u.iptv_enabled = 1
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found or does not have IPTV access'
            });
        }

        const user = users[0];

        // Validate required IPTV fields
        if (!user.iptv_panel_id || !user.iptv_line_id) {
            return res.status(400).json({
                success: false,
                message: 'User missing IPTV panel or line information'
            });
        }

        // Determine which package to use: selected package or user's current package
        const packageIdToUse = selectedPackageId || user.iptv_panel_package_id;

        if (!packageIdToUse) {
            return res.status(400).json({
                success: false,
                message: 'No package specified and user does not have a package assigned. Please select a package to renew with.'
            });
        }

        console.log(`📋 User ${id} IPTV details: panel=${user.iptv_panel_id} (${user.panel_type}), line=${user.iptv_line_id}, using package=${packageIdToUse}`);

        // Get package details from the panel
        const [packages] = await connection.execute(`
            SELECT * FROM iptv_packages
            WHERE iptv_panel_id = ? AND package_id = ?
        `, [user.iptv_panel_id, packageIdToUse]);

        let packageInfo;
        let durationHours = null;
        let priceCredits = null;

        if (packages.length > 0) {
            packageInfo = packages[0];
            // Convert duration_months to hours (30 days per month)
            durationHours = packageInfo.duration_months ? packageInfo.duration_months * 30 * 24 : null;
            priceCredits = packageInfo.credits;
            console.log(`📦 Package info from DB: ${packageInfo.name} (duration: ${packageInfo.duration_months}mo/${durationHours}h, credits: ${priceCredits})`);
        } else {
            // Package not in our DB, but we'll still try to extend with just the package ID
            // This is useful when using packages from getExtensionPackages that aren't synced to DB
            console.log(`⚠️ Package ${packageIdToUse} not found in DB, will use panel package ID directly`);
        }

        // Get current bouquets for the user (for NXT Dash)
        let bouquetIds = [];
        if (user.panel_type === 'nxtdash' && packageInfo?.bouquets) {
            try {
                bouquetIds = JSON.parse(packageInfo.bouquets);
            } catch (e) {
                console.log('⚠️ Could not parse package bouquets, using empty array');
            }
        }

        // Prepare package data for the panel
        const packageData = {
            package_id: packageInfo?.id || null,
            panel_package_id: packageIdToUse,
            duration_hours: durationHours,
            credits: priceCredits
        };

        console.log(`🚀 Calling extendUserOnPanel for panel ${user.iptv_panel_id} with package data:`, packageData);

        // Call the panel to extend the user
        // Pass bouquetSyncMode for 1-Stream panels (no_change, sync_all, sync_added, sync_removed)
        const result = await iptvManager.extendUserOnPanel(
            user.iptv_panel_id,
            user.iptv_line_id,
            packageData,
            bouquetIds,
            bouquetSyncMode || 'no_change'
        );

        console.log(`✅ Panel renewal response:`, JSON.stringify(result, null, 2));

        // Calculate new expiration date
        // IMPORTANT: Preserve the exact date from the panel without timezone conversion
        let newExpiration = null;
        if (result.expire_at) {
            // 1-Stream returns date in format "YYYY-MM-DD HH:MM:SS" or ISO format
            // Extract just the date portion directly without timezone conversion
            const expireStr = result.expire_at.toString();
            // Match YYYY-MM-DD at the start of the string
            const dateMatch = expireStr.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                newExpiration = dateMatch[1];
            } else {
                // Fallback: parse as UTC to avoid timezone shift
                const date = new Date(expireStr + (expireStr.includes('Z') || expireStr.includes('+') ? '' : 'Z'));
                newExpiration = date.toISOString().split('T')[0];
            }
            console.log(`📅 1-Stream expire_at: "${expireStr}" → stored as: "${newExpiration}"`);
        } else if (result.exp_date) {
            // NXT Dash returns exp_date in "DD-MM-YYYY HH:mm" format or as Unix timestamp
            const expDateStr = result.exp_date.toString();

            // Check if it's in DD-MM-YYYY format (contains dashes and not a pure number)
            if (expDateStr.includes('-') && isNaN(parseInt(expDateStr))) {
                // Format: "13-07-2025 00:00" - extract date portion and convert to YYYY-MM-DD
                const datePart = expDateStr.split(' ')[0]; // Get "13-07-2025"
                const [day, month, year] = datePart.split('-');
                newExpiration = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                console.log(`📅 NXT Dash exp_date (DD-MM-YYYY): "${expDateStr}" → stored as: "${newExpiration}"`);
            } else if (!isNaN(parseInt(expDateStr))) {
                // It's a Unix timestamp
                newExpiration = new Date(parseInt(expDateStr) * 1000).toISOString().split('T')[0];
                console.log(`📅 NXT Dash exp_date (timestamp): ${expDateStr} → stored as: "${newExpiration}"`);
            } else {
                // Fallback: try to extract YYYY-MM-DD from any format
                const dateMatch = expDateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    newExpiration = dateMatch[0];
                    console.log(`📅 NXT Dash exp_date (ISO): "${expDateStr}" → stored as: "${newExpiration}"`);
                }
            }
        } else if (packageInfo.duration_hours) {
            // Calculate based on package duration (use UTC to avoid timezone issues)
            const currentExpiration = user.iptv_expiration_date ? new Date(user.iptv_expiration_date + 'T00:00:00Z') : new Date();
            const now = new Date();
            const baseDate = currentExpiration > now ? currentExpiration : now;
            newExpiration = new Date(baseDate.getTime() + (packageInfo.duration_hours * 60 * 60 * 1000)).toISOString().split('T')[0];
            console.log(`📅 Calculated expiration: "${newExpiration}"`);
        }

        // If we have updated_user_info from panel (NXT Dash returns this after fetching refreshed data),
        // use it as the source of truth for expiration and connections
        if (result.updated_user_info) {
            console.log(`📊 Got updated_user_info from panel:`, JSON.stringify(result.updated_user_info, null, 2));

            // Use expiry_date from updated user info (NXT Dash returns format like "DD-MM-YYYY HH:mm")
            if (result.updated_user_info.expiry_date) {
                const updatedExpDate = result.updated_user_info.expiry_date;
                // Handle "DD-MM-YYYY HH:mm" format from NXT Dash
                if (updatedExpDate.includes('-')) {
                    const datePart = updatedExpDate.split(' ')[0]; // Get just the date part
                    const parts = datePart.split('-');
                    if (parts[0].length === 2) {
                        // DD-MM-YYYY format - convert to YYYY-MM-DD
                        newExpiration = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    } else {
                        // YYYY-MM-DD format
                        newExpiration = datePart;
                    }
                } else {
                    newExpiration = updatedExpDate;
                }
                console.log(`📅 Using updated_user_info expiry_date: "${updatedExpDate}" → "${newExpiration}"`);
            }
        }

        // Get connections count from panel response or from the selected package
        let newConnections = result.max_connections || result.updated_user_info?.max_connections || null;

        // If not in panel response, get from extension packages
        if (!newConnections && selectedPackageId) {
            try {
                const extensionPackages = await iptvManager.getExtensionPackages(user.iptv_panel_id, user.iptv_line_id);
                const selectedPkg = extensionPackages.find(p => p.id && p.id.toString() === selectedPackageId.toString());
                if (selectedPkg && selectedPkg.connections) {
                    newConnections = selectedPkg.connections;
                }
            } catch (err) {
                console.log(`⚠️ Could not fetch extension packages for connections: ${err.message}`);
            }
        }

        // Update user's IPTV info in the database (expiration, connections, package_id)
        const updateFields = [];
        const updateValues = [];

        if (newExpiration) {
            updateFields.push('iptv_expiration_date = ?');
            updateValues.push(newExpiration);
        }

        if (newConnections) {
            updateFields.push('iptv_connections = ?');
            updateValues.push(newConnections);
        }

        // Update the package_id if a different package was selected
        if (selectedPackageId && selectedPackageId !== user.iptv_panel_package_id) {
            updateFields.push('iptv_panel_package_id = ?');
            updateValues.push(selectedPackageId);
        }

        if (updateFields.length > 0) {
            updateFields.push("updated_at = datetime('now')");
            updateValues.push(id);

            await connection.execute(`
                UPDATE users
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateValues);

            console.log(`📅 Updated user ${id} IPTV: expiration=${newExpiration}, connections=${newConnections}, package_id=${selectedPackageId || 'unchanged'}`);
        }

        res.json({
            success: true,
            message: 'IPTV subscription renewed successfully',
            new_expiration: newExpiration,
            new_connections: newConnections,
            panel_response: result
        });

    } catch (error) {
        console.error('Error renewing IPTV subscription:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to renew IPTV subscription'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// DELETE /api/v2/users/:id/iptv - Remove IPTV and IPTV Editor access from user
router.delete('/:id/iptv', async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        // Check if we should also delete from IPTV panel (default: true for backwards compatibility)
        const deleteFromPanel = req.query.delete_from_panel !== 'false';

        console.log(`🗑️ Removing IPTV access for user ${id} (delete from panel: ${deleteFromPanel})`);

        // Get user details
        const [users] = await connection.execute(`
            SELECT * FROM users
            WHERE id = ? AND iptv_enabled = 1
        `, [id]);

        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found or does not have IPTV access'
            });
        }

        const user = users[0];
        const deletionResults = {
            iptv: null,
            iptvEditor: null
        };

        // Delete from IPTV Panel (only if deleteFromPanel is true)
        if (deleteFromPanel) {
            if (user.iptv_panel_id && user.iptv_line_id) {
                try {
                    console.log(`🗑️ Deleting user from IPTV Panel ${user.iptv_panel_id}, line ${user.iptv_line_id}...`);

                    await iptvManager.deleteUserFromPanel(
                        user.iptv_panel_id,
                        user.iptv_line_id
                    );

                    deletionResults.iptv = {
                        success: true,
                        message: 'User deleted from IPTV panel'
                    };

                    console.log(`✅ Successfully deleted user from IPTV panel`);
                } catch (error) {
                    console.error(`❌ Failed to delete user from IPTV panel:`, error);
                    deletionResults.iptv = {
                        success: false,
                        error: error.message
                    };
                }
            }

            // Delete from IPTV Editor (if enabled)
            if (user.iptv_editor_enabled) {
                try {
                    console.log(`🗑️ Deleting user from IPTV Editor...`);

                    const [editorUsers] = await connection.execute(`
                        SELECT
                            edu.iptv_editor_id,
                            edu.iptv_editor_playlist_id,
                            iep.playlist_id as actual_playlist_id
                        FROM iptv_editor_users edu
                        LEFT JOIN iptv_editor_playlists iep ON edu.iptv_editor_playlist_id = iep.id
                        WHERE edu.user_id = ?
                        LIMIT 1
                    `, [user.id]);

                    if (editorUsers.length > 0) {
                        const editorUser = editorUsers[0];
                        const playlistId = editorUser.actual_playlist_id || editorUser.iptv_editor_playlist_id;

                        console.log(`📡 Deleting IPTV Editor user ${editorUser.iptv_editor_id} from playlist ${playlistId}`);

                        const editorService = new IPTVEditorService();
                        await editorService.initialize();

                        await editorService.deleteUser(
                            editorUser.iptv_editor_id,
                            playlistId
                        );

                        deletionResults.iptvEditor = {
                            success: true,
                            message: 'User deleted from IPTV Editor'
                        };

                        console.log(`✅ Successfully deleted user from IPTV Editor`);
                    } else {
                        deletionResults.iptvEditor = {
                            success: true,
                            message: 'No IPTV Editor user found'
                        };
                    }
                } catch (error) {
                    console.error(`❌ Failed to delete user from IPTV Editor:`, error);
                    deletionResults.iptvEditor = {
                        success: false,
                        error: error.message
                    };
                }
            }
        } else {
            console.log(`📋 Skipping IPTV Panel/Editor deletion (local only)`);
            deletionResults.iptv = {
                success: true,
                message: 'Skipped - local database only'
            };
            deletionResults.iptvEditor = {
                success: true,
                message: 'Skipped - local database only'
            };
        }

        // Update user - disable IPTV and IPTV Editor
        await connection.execute(`
            UPDATE users
            SET iptv_enabled = 0,
                iptv_editor_enabled = 0,
                iptv_panel_id = NULL,
                iptv_line_id = NULL,
                iptv_username = NULL,
                iptv_password = NULL,
                iptv_subscription_plan_id = NULL,
                iptv_channel_group_id = NULL,
                iptv_expiration_date = NULL,
                iptv_panel_package_id = NULL,
                updated_at = datetime('now')
            WHERE id = ?
        `, [id]);

        // Delete IPTV Editor user record
        await connection.execute(`
            DELETE FROM iptv_editor_users WHERE user_id = ?
        `, [id]);

        // Clean up any pending/verified IPTV service requests for this user
        // Since the service is now removed, these requests are no longer relevant
        await connection.execute(`
            DELETE FROM portal_service_requests
            WHERE user_id = ? AND service_type = 'iptv' AND payment_status IN ('pending', 'submitted', 'verified')
        `, [id]);

        // Remove IPTV-related auto-assigned tags
        // These are tags with auto_assign_enabled that are linked to IPTV panels
        await connection.execute(`
            DELETE FROM user_tags
            WHERE user_id = ?
            AND tag_id IN (
                SELECT DISTINCT t.id
                FROM tags t
                INNER JOIN tag_iptv_panels tip ON t.id = tip.tag_id
                WHERE t.auto_assign_enabled = 1
            )
        `, [id]);

        await connection.commit();

        res.json({
            success: true,
            message: 'IPTV access removed successfully',
            results: deletionResults
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error removing IPTV access:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to remove IPTV access'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// DELETE /api/v2/users/:id/iptv-editor - Remove only IPTV Editor access from user
router.delete('/:id/iptv-editor', async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.params;
        // Check if we should also delete from IPTV Editor service (default: true for backwards compatibility)
        const deleteFromService = req.query.delete_from_service !== 'false';

        console.log(`🗑️ Removing IPTV Editor access for user ${id} (delete from service: ${deleteFromService})`);

        // Get user details
        const [users] = await connection.execute(`
            SELECT * FROM users
            WHERE id = ? AND iptv_editor_enabled = 1
        `, [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found or does not have IPTV Editor access'
            });
        }

        const user = users[0];
        const deletionResults = {
            iptvEditor: null
        };

        // Delete from IPTV Editor (only if deleteFromService is true)
        if (deleteFromService) {
            try {
                console.log(`🗑️ Deleting user from IPTV Editor...`);

                const [editorUsers] = await connection.execute(`
                    SELECT
                        edu.iptv_editor_id,
                        edu.iptv_editor_playlist_id,
                        iep.playlist_id as actual_playlist_id
                    FROM iptv_editor_users edu
                    LEFT JOIN iptv_editor_playlists iep ON edu.iptv_editor_playlist_id = iep.id
                    WHERE edu.user_id = ?
                    LIMIT 1
                `, [user.id]);

                if (editorUsers.length > 0) {
                    const editorUser = editorUsers[0];
                    const playlistId = editorUser.actual_playlist_id || editorUser.iptv_editor_playlist_id;

                    console.log(`📡 Deleting IPTV Editor user ${editorUser.iptv_editor_id} from playlist ${playlistId}`);

                    const editorService = new IPTVEditorService();
                    await editorService.initialize();

                    await editorService.deleteUser(
                        editorUser.iptv_editor_id,
                        playlistId
                    );

                    deletionResults.iptvEditor = {
                        success: true,
                        message: 'User deleted from IPTV Editor'
                    };

                    console.log(`✅ Successfully deleted user from IPTV Editor`);
                } else {
                    deletionResults.iptvEditor = {
                        success: true,
                        message: 'No IPTV Editor user found'
                    };
                }
            } catch (error) {
                console.error(`❌ Failed to delete user from IPTV Editor:`, error);
                deletionResults.iptvEditor = {
                    success: false,
                    error: error.message
                };
            }
        } else {
            console.log(`📋 Skipping IPTV Editor service deletion (local only)`);
            deletionResults.iptvEditor = {
                success: true,
                message: 'Skipped - local database only'
            };
        }

        // Update user - disable IPTV Editor only
        await connection.execute(`
            UPDATE users
            SET iptv_editor_enabled = 0,
                updated_at = datetime('now')
            WHERE id = ?
        `, [id]);

        // Delete IPTV Editor user record
        await connection.execute(`
            DELETE FROM iptv_editor_users WHERE user_id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'IPTV Editor access removed successfully',
            results: deletionResults
        });

    } catch (error) {
        console.error('Error removing IPTV Editor access:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to remove IPTV Editor access'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

module.exports = router;
