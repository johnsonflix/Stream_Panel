/**
 * Portal Admin Routes
 *
 * Admin routes for managing portal announcements, messages, and settings.
 */

const express = require('express');
const { query } = require('../database-config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// ============================================
// ICON UPLOAD CONFIGURATION
// ============================================

const iconStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads/icons');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `icon-${Date.now()}${ext}`);
    }
});

const iconUpload = multer({
    storage: iconStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, svg, webp)'));
        }
    }
});

// ============================================
// GUIDE IMAGE UPLOAD CONFIGURATION
// ============================================

const guideImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads/guide-images');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Clean filename and add timestamp
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `guide-${Date.now()}-${cleanName}`);
    }
});

const guideImageUpload = multer({
    storage: guideImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});

/**
 * POST /api/v2/admin/portal/upload-icon
 * Upload an icon image and return the URL
 */
router.post('/upload-icon', iconUpload.single('icon'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const iconUrl = `/uploads/icons/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Icon uploaded successfully',
            url: iconUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Error uploading icon:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload icon'
        });
    }
});

// ============================================
// ANNOUNCEMENTS MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/announcements
 * Get all announcements (admin view)
 */
router.get('/announcements', async (req, res) => {
    try {
        const announcements = await query(`
            SELECT a.*, u.name as created_by_name
            FROM portal_announcements a
            LEFT JOIN users u ON a.created_by = u.id
            ORDER BY a.priority DESC, a.created_at DESC
        `);

        res.json({
            success: true,
            announcements
        });

    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch announcements'
        });
    }
});

/**
 * POST /api/v2/admin/portal/announcements
 * Create a new announcement
 */
router.post('/announcements', async (req, res) => {
    try {
        const {
            title,
            message,
            type = 'info',
            target_audience = 'all',
            is_dismissible = true,
            priority = 0,
            starts_at,
            expires_at
        } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const validTypes = ['info', 'warning', 'success', 'error'];
        const validAudiences = ['all', 'plex', 'iptv', 'plex_only', 'iptv_only'];

        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid announcement type'
            });
        }

        if (!validAudiences.includes(target_audience)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid target audience'
            });
        }

        // Get admin user ID from session (if available)
        const createdBy = req.session?.userId || null;

        const result = await query(`
            INSERT INTO portal_announcements
            (title, message, type, target_audience, is_dismissible, priority, starts_at, expires_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title,
            message,
            type,
            target_audience,
            is_dismissible ? 1 : 0,
            priority,
            starts_at || null,
            expires_at || null,
            createdBy
        ]);

        res.json({
            success: true,
            message: 'Announcement created successfully',
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create announcement'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/announcements/:id
 * Update an announcement
 */
router.put('/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            message,
            type,
            target_audience,
            is_active,
            is_dismissible,
            priority,
            starts_at,
            expires_at
        } = req.body;

        // Build dynamic update query
        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (message !== undefined) {
            updates.push('message = ?');
            values.push(message);
        }
        if (type !== undefined) {
            updates.push('type = ?');
            values.push(type);
        }
        if (target_audience !== undefined) {
            updates.push('target_audience = ?');
            values.push(target_audience);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (is_dismissible !== undefined) {
            updates.push('is_dismissible = ?');
            values.push(is_dismissible ? 1 : 0);
        }
        if (priority !== undefined) {
            updates.push('priority = ?');
            values.push(priority);
        }
        if (starts_at !== undefined) {
            updates.push('starts_at = ?');
            values.push(starts_at || null);
        }
        if (expires_at !== undefined) {
            updates.push('expires_at = ?');
            values.push(expires_at || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_announcements
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Announcement updated successfully'
        });

    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update announcement'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/announcements/:id
 * Delete an announcement
 */
router.delete('/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await query('DELETE FROM portal_announcements WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Announcement deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete announcement'
        });
    }
});

// ============================================
// MESSAGES MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/messages
 * Get all user messages (admin view)
 */
router.get('/messages', async (req, res) => {
    try {
        const { status, category, limit = 50 } = req.query;

        let whereConditions = [];
        let params = [];

        if (status) {
            whereConditions.push('m.status = ?');
            params.push(status);
        }

        if (category) {
            whereConditions.push('m.category = ?');
            params.push(category);
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        params.push(parseInt(limit));

        const messagesQuery = `
            SELECT m.*, u.name as user_name, u.email as user_email
            FROM portal_messages m
            JOIN users u ON m.user_id = u.id
            ${whereClause}
            ORDER BY
                CASE m.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                CASE m.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                m.created_at DESC
            LIMIT ?
        `;
        console.log('Messages query:', messagesQuery, 'Params:', params);
        const messages = await query(messagesQuery, params);

        res.json({
            success: true,
            messages
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/admin/portal/messages/:id
 * Get a specific message
 */
router.get('/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const messages = await query(`
            SELECT m.*, u.name as user_name, u.email as user_email,
                   au.name as assigned_to_name
            FROM portal_messages m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN users au ON m.assigned_to = au.id AND au.is_app_user = 1
            WHERE m.id = ?
        `, [id]);

        if (messages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        res.json({
            success: true,
            message: messages[0]
        });

    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch message'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/messages/:id
 * Update a message (status, notes, assignment)
 */
router.put('/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority, assigned_to, admin_notes } = req.body;

        const updates = [];
        const values = [];

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);

            if (status === 'resolved' || status === 'closed') {
                updates.push(`resolved_at = datetime('now')`);
            }
        }
        if (priority !== undefined) {
            updates.push('priority = ?');
            values.push(priority);
        }
        if (assigned_to !== undefined) {
            updates.push('assigned_to = ?');
            values.push(assigned_to || null);
        }
        if (admin_notes !== undefined) {
            updates.push('admin_notes = ?');
            values.push(admin_notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_messages
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Message updated successfully'
        });

    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update message'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/messages/:id
 * Delete a support message
 */
router.delete('/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Also delete any related admin notifications
        await query(`
            DELETE FROM admin_notifications
            WHERE related_message_id = ?
        `, [id]);

        // Delete the message
        await query(`
            DELETE FROM portal_messages
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message'
        });
    }
});

// ============================================
// SERVICE REQUESTS MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/service-requests
 * Get all service requests (admin view)
 */
router.get('/service-requests', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        let whereClause = '';
        let params = [];

        if (status) {
            whereClause = 'WHERE r.status = ?';
            params.push(status);
        }

        params.push(parseInt(limit));

        const requests = await query(`
            SELECT r.*, u.name as user_name, u.email as user_email,
                   handler.name as handled_by_name
            FROM portal_service_requests r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN users handler ON r.handled_by = handler.id
            ${whereClause}
            ORDER BY
                CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
                r.created_at DESC
            LIMIT ?
        `, params);

        res.json({
            success: true,
            requests
        });

    } catch (error) {
        console.error('Error fetching service requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service requests'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/service-requests/:id
 * Update a service request (approve/reject)
 */
router.put('/service-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;

        const validStatuses = ['pending', 'approved', 'rejected', 'completed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const updates = [];
        const values = [];

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);

            if (status !== 'pending') {
                updates.push(`handled_at = datetime('now')`);
                // Would set handled_by from session if available
            }
        }
        if (admin_notes !== undefined) {
            updates.push('admin_notes = ?');
            values.push(admin_notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_service_requests
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Service request updated successfully'
        });

    } catch (error) {
        console.error('Error updating service request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update service request'
        });
    }
});

// ============================================
// PORTAL STATISTICS
// ============================================

/**
 * GET /api/v2/admin/portal/stats
 * Get portal statistics
 */
router.get('/stats', async (req, res) => {
    try {
        // Active sessions
        const sessions = await query(`
            SELECT COUNT(*) as count
            FROM portal_sessions
            WHERE datetime(expires_at) > datetime('now')
        `);

        // New messages
        const newMessages = await query(`
            SELECT COUNT(*) as count
            FROM portal_messages
            WHERE status = 'new'
        `);

        // Pending service requests
        const pendingRequests = await query(`
            SELECT COUNT(*) as count
            FROM portal_service_requests
            WHERE status = 'pending'
        `);

        // Active announcements
        const activeAnnouncements = await query(`
            SELECT COUNT(*) as count
            FROM portal_announcements
            WHERE is_active = 1
            AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
            AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        `);

        res.json({
            success: true,
            stats: {
                active_sessions: sessions[0]?.count || 0,
                new_messages: newMessages[0]?.count || 0,
                pending_requests: pendingRequests[0]?.count || 0,
                active_announcements: activeAnnouncements[0]?.count || 0
            }
        });

    } catch (error) {
        console.error('Error fetching portal stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

// ============================================
// PORTAL NOTICES (Static bulletin board)
// ============================================

/**
 * GET /api/v2/admin/portal/notices
 * Get all portal notice settings
 */
router.get('/notices', async (req, res) => {
    try {
        const noticeKeys = [
            'portal_notice_everyone',
            'portal_notice_plex',
            'portal_notice_iptv'
        ];

        const notices = {};

        for (const key of noticeKeys) {
            const result = await query(
                'SELECT setting_value FROM settings WHERE setting_key = ?',
                [key]
            );
            const shortKey = key.replace('portal_notice_', '');
            notices[shortKey] = result.length > 0 ? result[0].setting_value : '';
        }

        res.json({
            success: true,
            notices
        });

    } catch (error) {
        console.error('Error fetching portal notices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal notices'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/notices
 * Update portal notice settings
 */
router.put('/notices', async (req, res) => {
    try {
        const { everyone, plex, iptv } = req.body;

        const updates = [
            { key: 'portal_notice_everyone', value: everyone || '' },
            { key: 'portal_notice_plex', value: plex || '' },
            { key: 'portal_notice_iptv', value: iptv || '' }
        ];

        for (const { key, value } of updates) {
            // Check if setting exists
            const existing = await query(
                'SELECT id FROM settings WHERE setting_key = ?',
                [key]
            );

            if (existing.length > 0) {
                await query(
                    "UPDATE settings SET setting_value = ?, updated_at = datetime('now') WHERE setting_key = ?",
                    [value, key]
                );
            } else {
                await query(
                    'INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
                    [key, value, 'string', `Portal notice for ${key.replace('portal_notice_', '')} users`]
                );
            }
        }

        res.json({
            success: true,
            message: 'Portal notices updated successfully'
        });

    } catch (error) {
        console.error('Error updating portal notices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update portal notices'
        });
    }
});

// ============================================
// ADMIN NOTIFICATIONS (One-time notifications for admins)
// ============================================

/**
 * GET /api/v2/admin/portal/admin-notifications
 * Get unread admin notifications
 * For support message notifications, only show if the message is still 'new'
 */
router.get('/admin-notifications', async (req, res) => {
    try {
        // Get notifications, but filter out support message ones where the message is no longer 'new'
        const notifications = await query(`
            SELECT n.*
            FROM admin_notifications n
            LEFT JOIN portal_messages pm ON n.related_message_id = pm.id
            WHERE n.is_read = 0
            AND (
                n.related_message_id IS NULL
                OR pm.status = 'new'
            )
            ORDER BY n.created_at DESC
        `);

        // Auto-mark as read any notifications for messages that are no longer 'new'
        await query(`
            UPDATE admin_notifications
            SET is_read = 1, read_at = datetime('now')
            WHERE is_read = 0
            AND related_message_id IS NOT NULL
            AND related_message_id NOT IN (
                SELECT id FROM portal_messages WHERE status = 'new'
            )
        `);

        res.json({
            success: true,
            notifications
        });

    } catch (error) {
        console.error('Error fetching admin notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch admin notifications'
        });
    }
});

/**
 * GET /api/v2/admin/portal/admin-notifications/count
 * Get count of unread admin notifications
 */
router.get('/admin-notifications/count', async (req, res) => {
    try {
        const result = await query(`
            SELECT COUNT(*) as count
            FROM admin_notifications
            WHERE is_read = 0
        `);

        res.json({
            success: true,
            count: result[0]?.count || 0
        });

    } catch (error) {
        console.error('Error fetching admin notification count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification count'
        });
    }
});

/**
 * POST /api/v2/admin/portal/admin-notifications
 * Create a new admin notification (from portal or system)
 */
router.post('/admin-notifications', async (req, res) => {
    try {
        const { message, created_by } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Notification message is required'
            });
        }

        const result = await query(`
            INSERT INTO admin_notifications (message, created_by)
            VALUES (?, ?)
        `, [message.trim(), created_by || 'System']);

        res.json({
            success: true,
            message: 'Admin notification created successfully',
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error('Error creating admin notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create admin notification'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/admin-notifications/:id/read
 * Mark an admin notification as read
 * For support message notifications (with related_message_id), only dismiss locally -
 * they'll stay visible for other admins until the message status changes
 */
router.put('/admin-notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if this is a support message notification
        const notification = await query(`
            SELECT related_message_id FROM admin_notifications WHERE id = ?
        `, [id]);

        if (notification.length > 0 && notification[0].related_message_id) {
            // Support message notification - don't mark as read, just return success
            // Frontend will hide it for this session only
            res.json({
                success: true,
                message: 'Notification dismissed for this session',
                sessionOnly: true
            });
        } else {
            // Regular notification - mark as read permanently
            await query(`
                UPDATE admin_notifications
                SET is_read = 1, read_at = datetime('now')
                WHERE id = ?
            `, [id]);

            res.json({
                success: true,
                message: 'Notification marked as read'
            });
        }

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/admin-notifications/read-all
 * Mark all admin notifications as read
 */
router.put('/admin-notifications/read-all', async (req, res) => {
    try {
        await query(`
            UPDATE admin_notifications
            SET is_read = 1, read_at = datetime('now')
            WHERE is_read = 0
        `);

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notifications as read'
        });
    }
});

// ============================================
// PORTAL APPS MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/apps
 * Get all portal apps
 */
router.get('/apps', async (req, res) => {
    try {
        const apps = await query(`
            SELECT * FROM portal_apps
            ORDER BY platform_category, display_order, name
        `);

        res.json({
            success: true,
            apps
        });

    } catch (error) {
        console.error('Error fetching portal apps:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal apps'
        });
    }
});

/**
 * GET /api/v2/admin/portal/apps/:id
 * Get a specific portal app
 */
router.get('/apps/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const apps = await query('SELECT * FROM portal_apps WHERE id = ?', [id]);

        if (apps.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'App not found'
            });
        }

        res.json({
            success: true,
            app: apps[0]
        });

    } catch (error) {
        console.error('Error fetching portal app:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal app'
        });
    }
});

/**
 * POST /api/v2/admin/portal/apps
 * Create a new portal app
 */
router.post('/apps', async (req, res) => {
    try {
        const {
            name,
            description,
            icon,
            icon_url,
            icon_type = 'emoji',
            service_type = 'both',
            platform_category,
            app_type,
            downloader_code,
            store_url_ios,
            store_url_android,
            store_url_windows,
            store_url_mac,
            store_url_roku,
            store_url_appletv,
            direct_url,
            apk_url,
            web_player_url,
            instructions,
            display_order = 0,
            is_visible = true,
            is_active = true
        } = req.body;

        if (!name || !platform_category || !app_type) {
            return res.status(400).json({
                success: false,
                message: 'Name, platform category, and app type are required'
            });
        }

        const result = await query(`
            INSERT INTO portal_apps (
                name, description, icon, icon_url, icon_type, service_type, platform_category,
                app_type, downloader_code, store_url_ios, store_url_android,
                store_url_windows, store_url_mac, store_url_roku, store_url_appletv,
                direct_url, apk_url, web_player_url, instructions, display_order, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, description || null, icon || null, icon_url || null, icon_type, service_type,
            platform_category, app_type, downloader_code || null,
            store_url_ios || null, store_url_android || null,
            store_url_windows || null, store_url_mac || null,
            store_url_roku || null, store_url_appletv || null,
            direct_url || null, apk_url || null, web_player_url || null,
            instructions || null, display_order, (is_visible !== false && is_active !== false) ? 1 : 0
        ]);

        res.json({
            success: true,
            message: 'App created successfully',
            id: result.insertId
        });

    } catch (error) {
        console.error('Error creating portal app:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create portal app'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/apps/:id
 * Update a portal app
 */
router.put('/apps/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, description, icon, icon_url, icon_type, service_type, platform_category,
            app_type, downloader_code, store_url_ios, store_url_android,
            store_url_windows, store_url_mac, store_url_roku, store_url_appletv,
            direct_url, apk_url, web_player_url,
            instructions, display_order, is_visible, is_active
        } = req.body;

        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
        if (icon_url !== undefined) { updates.push('icon_url = ?'); values.push(icon_url); }
        if (icon_type !== undefined) { updates.push('icon_type = ?'); values.push(icon_type); }
        if (service_type !== undefined) { updates.push('service_type = ?'); values.push(service_type); }
        if (platform_category !== undefined) { updates.push('platform_category = ?'); values.push(platform_category); }
        if (app_type !== undefined) { updates.push('app_type = ?'); values.push(app_type); }
        if (downloader_code !== undefined) { updates.push('downloader_code = ?'); values.push(downloader_code); }
        if (store_url_ios !== undefined) { updates.push('store_url_ios = ?'); values.push(store_url_ios); }
        if (store_url_android !== undefined) { updates.push('store_url_android = ?'); values.push(store_url_android); }
        if (store_url_windows !== undefined) { updates.push('store_url_windows = ?'); values.push(store_url_windows); }
        if (store_url_mac !== undefined) { updates.push('store_url_mac = ?'); values.push(store_url_mac); }
        if (store_url_roku !== undefined) { updates.push('store_url_roku = ?'); values.push(store_url_roku); }
        if (store_url_appletv !== undefined) { updates.push('store_url_appletv = ?'); values.push(store_url_appletv); }
        if (direct_url !== undefined) { updates.push('direct_url = ?'); values.push(direct_url); }
        if (apk_url !== undefined) { updates.push('apk_url = ?'); values.push(apk_url); }
        if (web_player_url !== undefined) { updates.push('web_player_url = ?'); values.push(web_player_url); }
        if (instructions !== undefined) { updates.push('instructions = ?'); values.push(instructions); }
        if (display_order !== undefined) { updates.push('display_order = ?'); values.push(display_order); }
        // Handle both is_visible and is_active for backwards compatibility
        if (is_visible !== undefined) { updates.push('is_active = ?'); values.push(is_visible ? 1 : 0); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_apps
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'App updated successfully'
        });

    } catch (error) {
        console.error('Error updating portal app:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update portal app'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/apps/:id
 * Delete a portal app
 */
router.delete('/apps/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await query('DELETE FROM portal_apps WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'App deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting portal app:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete portal app'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/apps/reorder
 * Reorder portal apps
 */
router.post('/apps/reorder', async (req, res) => {
    try {
        const { app_ids } = req.body; // Array of app IDs in desired order

        if (!Array.isArray(app_ids)) {
            return res.status(400).json({
                success: false,
                message: 'app_ids array is required'
            });
        }

        // Update display_order based on array index
        for (let i = 0; i < app_ids.length; i++) {
            await query(
                `UPDATE portal_apps SET display_order = ?, updated_at = datetime('now') WHERE id = ?`,
                [i, app_ids[i]]
            );
        }

        res.json({
            success: true,
            message: 'Apps reordered successfully'
        });

    } catch (error) {
        console.error('Error reordering portal apps:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder portal apps'
        });
    }
});

// ============================================
// PORTAL GUIDES MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/guides
 * Get all portal guides
 */
router.get('/guides', async (req, res) => {
    try {
        const guides = await query(`
            SELECT * FROM portal_guides
            ORDER BY display_order, title
        `);

        res.json({
            success: true,
            guides
        });

    } catch (error) {
        console.error('Error fetching portal guides:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal guides'
        });
    }
});

/**
 * GET /api/v2/admin/portal/guides/:id
 * Get a specific portal guide
 */
router.get('/guides/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const guides = await query('SELECT * FROM portal_guides WHERE id = ?', [id]);

        if (guides.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guide not found'
            });
        }

        res.json({
            success: true,
            guide: guides[0]
        });

    } catch (error) {
        console.error('Error fetching portal guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal guide'
        });
    }
});

/**
 * POST /api/v2/admin/portal/guides
 * Create a new portal guide
 */
router.post('/guides', async (req, res) => {
    try {
        const {
            slug,
            title,
            icon,
            icon_url,
            icon_type = 'emoji',
            service_type = 'general',
            category = 'setup',
            short_description,
            content,
            content_type = 'markdown',
            is_public = true,
            is_visible = true,
            display_order = 0
        } = req.body;

        if (!slug || !title) {
            return res.status(400).json({
                success: false,
                message: 'Slug and title are required'
            });
        }

        // Check if slug already exists
        const existing = await query('SELECT id FROM portal_guides WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A guide with this slug already exists'
            });
        }

        const result = await query(`
            INSERT INTO portal_guides (
                slug, title, icon, icon_url, icon_type, service_type, category,
                short_description, content, content_type, is_public, is_visible, display_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            slug, title, icon || null, icon_url || null, icon_type, service_type, category,
            short_description || null, content || null, content_type,
            is_public ? 1 : 0, is_visible ? 1 : 0, display_order
        ]);

        res.json({
            success: true,
            message: 'Guide created successfully',
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error('Error creating portal guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create portal guide'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/guides/:id
 * Update a portal guide
 */
router.put('/guides/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            slug, title, icon, icon_url, icon_type, service_type, category,
            short_description, content, content_type, is_public, is_visible, display_order
        } = req.body;

        const updates = [];
        const values = [];

        if (slug !== undefined) {
            // Check if new slug conflicts with another guide
            const existing = await query(
                'SELECT id FROM portal_guides WHERE slug = ? AND id != ?',
                [slug, id]
            );
            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'A guide with this slug already exists'
                });
            }
            updates.push('slug = ?');
            values.push(slug);
        }
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
        if (icon_url !== undefined) { updates.push('icon_url = ?'); values.push(icon_url); }
        if (icon_type !== undefined) { updates.push('icon_type = ?'); values.push(icon_type); }
        if (service_type !== undefined) { updates.push('service_type = ?'); values.push(service_type); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (short_description !== undefined) { updates.push('short_description = ?'); values.push(short_description); }
        if (content !== undefined) { updates.push('content = ?'); values.push(content); }
        if (content_type !== undefined) { updates.push('content_type = ?'); values.push(content_type); }
        if (is_public !== undefined) { updates.push('is_public = ?'); values.push(is_public ? 1 : 0); }
        if (is_visible !== undefined) { updates.push('is_visible = ?'); values.push(is_visible ? 1 : 0); }
        if (display_order !== undefined) { updates.push('display_order = ?'); values.push(display_order); }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_guides
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Guide updated successfully'
        });

    } catch (error) {
        console.error('Error updating portal guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update portal guide'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/guides/:id
 * Delete a portal guide
 */
router.delete('/guides/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await query('DELETE FROM portal_guides WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Guide deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting portal guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete portal guide'
        });
    }
});

// ============================================
// GUIDE IMAGE MANAGEMENT
// ============================================

/**
 * POST /api/v2/admin/portal/guides/upload-image
 * Upload an image for use in guides
 */
router.post('/guides/upload-image', guideImageUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const imageUrl = `/uploads/guide-images/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            url: imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Error uploading guide image:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload image'
        });
    }
});

/**
 * GET /api/v2/admin/portal/guide-images
 * List all uploaded guide images
 */
router.get('/guide-images', async (req, res) => {
    try {
        const uploadPath = path.join(__dirname, '../uploads/guide-images');

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            return res.json({
                success: true,
                images: []
            });
        }

        // Read directory and get file info
        const files = fs.readdirSync(uploadPath);
        const images = files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => {
                const stats = fs.statSync(path.join(uploadPath, file));
                return {
                    filename: file,
                    url: `/uploads/guide-images/${file}`,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created)); // Newest first

        res.json({
            success: true,
            images
        });
    } catch (error) {
        console.error('Error listing guide images:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list images'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/guide-images/:filename
 * Delete a guide image
 */
router.delete('/guide-images/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Validate filename (prevent directory traversal)
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filename'
            });
        }

        const filePath = path.join(__dirname, '../uploads/guide-images', filename);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        // Delete the file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting guide image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete image'
        });
    }
});

// ============================================
// PORTAL QUICK ACTIONS MANAGEMENT
// ============================================

/**
 * GET /api/v2/admin/portal/quick-actions
 * Get all portal quick actions
 */
router.get('/quick-actions', async (req, res) => {
    try {
        const actions = await query(`
            SELECT * FROM portal_quick_actions
            ORDER BY service_type, display_order, name
        `);

        res.json({
            success: true,
            actions
        });

    } catch (error) {
        console.error('Error fetching portal quick actions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal quick actions'
        });
    }
});

/**
 * GET /api/v2/admin/portal/quick-actions/:id
 * Get a specific quick action
 */
router.get('/quick-actions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const actions = await query('SELECT * FROM portal_quick_actions WHERE id = ?', [id]);

        if (actions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quick action not found'
            });
        }

        res.json({
            success: true,
            action: actions[0]
        });

    } catch (error) {
        console.error('Error fetching portal quick action:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch portal quick action'
        });
    }
});

/**
 * POST /api/v2/admin/portal/quick-actions
 * Create a new quick action
 */
router.post('/quick-actions', async (req, res) => {
    try {
        const {
            name,
            description,
            icon,
            icon_url,
            icon_type = 'emoji',
            service_type = 'both',
            action_type,
            url,
            dynamic_field,
            button_style = 'primary',
            display_order = 0,
            is_visible = true
        } = req.body;

        if (!name || !action_type) {
            return res.status(400).json({
                success: false,
                message: 'Name and action type are required'
            });
        }

        const result = await query(`
            INSERT INTO portal_quick_actions (
                name, description, icon, icon_url, icon_type, service_type,
                action_type, url, dynamic_field, button_style, display_order, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, description || null, icon || null, icon_url || null, icon_type, service_type,
            action_type, url || null, dynamic_field || null, button_style,
            display_order, is_visible ? 1 : 0
        ]);

        res.json({
            success: true,
            message: 'Quick action created successfully',
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error('Error creating portal quick action:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create portal quick action'
        });
    }
});

/**
 * PUT /api/v2/admin/portal/quick-actions/:id
 * Update a quick action
 */
router.put('/quick-actions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, description, icon, icon_url, icon_type, service_type,
            action_type, url, dynamic_field, button_style, display_order, is_visible
        } = req.body;

        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
        if (icon_url !== undefined) { updates.push('icon_url = ?'); values.push(icon_url); }
        if (icon_type !== undefined) { updates.push('icon_type = ?'); values.push(icon_type); }
        if (service_type !== undefined) { updates.push('service_type = ?'); values.push(service_type); }
        if (action_type !== undefined) { updates.push('action_type = ?'); values.push(action_type); }
        if (url !== undefined) { updates.push('url = ?'); values.push(url); }
        if (dynamic_field !== undefined) { updates.push('dynamic_field = ?'); values.push(dynamic_field); }
        if (button_style !== undefined) { updates.push('button_style = ?'); values.push(button_style); }
        if (display_order !== undefined) { updates.push('display_order = ?'); values.push(display_order); }
        if (is_visible !== undefined) { updates.push('is_active = ?'); values.push(is_visible ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No updates provided'
            });
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(id);

        await query(`
            UPDATE portal_quick_actions
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Quick action updated successfully'
        });

    } catch (error) {
        console.error('Error updating portal quick action:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update portal quick action'
        });
    }
});

/**
 * DELETE /api/v2/admin/portal/quick-actions/:id
 * Delete a quick action
 */
router.delete('/quick-actions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if this is a system action (internal IPTV actions like Web Player and TV Guide)
        const actions = await query('SELECT * FROM portal_quick_actions WHERE id = ?', [id]);
        if (actions.length > 0) {
            const action = actions[0];
            // System actions are internal IPTV actions - these are built into the app
            if (action.action_type === 'internal' && action.service_type === 'iptv') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete system quick actions. You can disable or hide them instead.'
                });
            }
        }

        await query('DELETE FROM portal_quick_actions WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Quick action deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting portal quick action:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete portal quick action'
        });
    }
});

module.exports = router;
