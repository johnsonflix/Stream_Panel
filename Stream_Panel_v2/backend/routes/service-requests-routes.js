/**
 * Service Requests Routes (Admin)
 *
 * Admin API routes for managing portal service requests
 */

const express = require('express');
const { query } = require('../database-config');

const router = express.Router();

/**
 * GET /api/v2/service-requests
 * Get all service requests with filtering
 */
router.get('/', async (req, res) => {
    try {
        const {
            status,
            service_type,
            request_type,
            owner_id,
            limit = 50,
            offset = 0
        } = req.query;

        let sql = `
            SELECT
                psr.*,
                u.name as user_name,
                u.email as user_email,
                u.owner_id,
                owner.name as owner_name,
                sp.name as plan_name,
                sp.price,
                sp.currency,
                sp.price_type,
                sp.duration_months,
                sp.iptv_connections,
                sp.iptv_panel_id,
                sp.iptv_package_id,
                sp.plex_package_id
            FROM portal_service_requests psr
            JOIN users u ON psr.user_id = u.id
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            LEFT JOIN subscription_plans sp ON psr.subscription_plan_id = sp.id
            WHERE 1=1
        `;

        const params = [];

        if (status) {
            sql += ` AND psr.payment_status = ?`;
            params.push(status);
        }

        if (service_type) {
            sql += ` AND psr.service_type = ?`;
            params.push(service_type);
        }

        if (request_type) {
            sql += ` AND psr.request_type = ?`;
            params.push(request_type);
        }

        if (owner_id) {
            sql += ` AND u.owner_id = ?`;
            params.push(owner_id);
        }

        sql += ` ORDER BY psr.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const requests = await query(sql, params);

        // Get count for pagination
        let countSql = `
            SELECT COUNT(*) as total
            FROM portal_service_requests psr
            JOIN users u ON psr.user_id = u.id
            WHERE 1=1
        `;
        const countParams = [];

        if (status) {
            countSql += ` AND psr.payment_status = ?`;
            countParams.push(status);
        }
        if (service_type) {
            countSql += ` AND psr.service_type = ?`;
            countParams.push(service_type);
        }
        if (request_type) {
            countSql += ` AND psr.request_type = ?`;
            countParams.push(request_type);
        }
        if (owner_id) {
            countSql += ` AND u.owner_id = ?`;
            countParams.push(owner_id);
        }

        const countResult = await query(countSql, countParams);
        const total = countResult[0]?.total || 0;

        res.json({
            success: true,
            requests,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching service requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service requests',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/service-requests/pending
 * Get pending service requests for dashboard banner
 * Includes: submitted payments waiting for verification AND verified payments waiting for provisioning
 */
router.get('/pending', async (req, res) => {
    try {
        const requests = await query(`
            SELECT
                psr.*,
                u.name as user_name,
                u.email as user_email,
                u.owner_id,
                owner.name as owner_name,
                sp.name as plan_name,
                sp.price,
                sp.currency,
                sp.price_type,
                sp.duration_months,
                sp.iptv_connections,
                sp.iptv_panel_id,
                sp.iptv_package_id,
                sp.plex_package_id
            FROM portal_service_requests psr
            JOIN users u ON psr.user_id = u.id
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            LEFT JOIN subscription_plans sp ON psr.subscription_plan_id = sp.id
            WHERE psr.payment_status IN ('pending', 'submitted')
               OR (psr.payment_status = 'verified' AND (psr.provisioning_status IS NULL OR psr.provisioning_status = 'pending'))
            ORDER BY
                CASE
                    WHEN psr.payment_status = 'verified' AND (psr.provisioning_status IS NULL OR psr.provisioning_status = 'pending') THEN 0
                    WHEN psr.payment_status = 'submitted' THEN 1
                    ELSE 2
                END,
                psr.created_at DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            requests,
            count: requests.length
        });

    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending requests'
        });
    }
});

/**
 * GET /api/v2/service-requests/:id
 * Get single service request details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const requests = await query(`
            SELECT
                psr.*,
                u.name as user_name,
                u.email as user_email,
                u.owner_id,
                u.plex_enabled,
                u.iptv_enabled,
                owner.name as owner_name,
                owner.email as owner_email,
                sp.name as plan_name,
                sp.price,
                sp.currency,
                sp.price_type,
                sp.duration_months,
                sp.iptv_connections,
                sp.iptv_panel_id,
                sp.iptv_package_id,
                sp.plex_package_id
            FROM portal_service_requests psr
            JOIN users u ON psr.user_id = u.id
            LEFT JOIN users owner ON u.owner_id = owner.id AND owner.is_app_user = 1
            LEFT JOIN subscription_plans sp ON psr.subscription_plan_id = sp.id
            WHERE psr.id = ?
        `, [id]);

        if (requests.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }

        res.json({
            success: true,
            request: requests[0]
        });

    } catch (error) {
        console.error('Error fetching service request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service request'
        });
    }
});

/**
 * PUT /api/v2/service-requests/:id
 * Update service request (change status, add notes)
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            payment_status,
            provisioning_status,
            admin_notes,
            processed_by
        } = req.body;

        // Get current request
        const requests = await query('SELECT * FROM portal_service_requests WHERE id = ?', [id]);
        if (requests.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }

        const updates = [];
        const params = [];

        if (payment_status !== undefined) {
            const validStatuses = ['pending', 'submitted', 'verified', 'rejected', 'cancelled'];
            if (!validStatuses.includes(payment_status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment status'
                });
            }

            // If rejecting, just delete the request - user doesn't need to see it
            if (payment_status === 'rejected') {
                await query('DELETE FROM portal_service_requests WHERE id = ?', [id]);
                return res.json({
                    success: true,
                    message: 'Service request rejected and removed'
                });
            }

            updates.push('payment_status = ?');
            params.push(payment_status);

            // If marking as verified, set processed_at and provisioning_status
            if (payment_status === 'verified') {
                updates.push("processed_at = datetime('now')");
                updates.push("provisioning_status = 'pending'");
                if (processed_by) {
                    updates.push('processed_by = ?');
                    params.push(processed_by);
                }
            }
        }

        // Allow updating provisioning_status directly (for wizard completion)
        if (provisioning_status !== undefined) {
            const validProvisioningStatuses = ['pending', 'completed'];
            if (!validProvisioningStatuses.includes(provisioning_status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid provisioning status'
                });
            }
            updates.push('provisioning_status = ?');
            params.push(provisioning_status);

            // If marking as completed, set provisioned_at
            if (provisioning_status === 'completed') {
                updates.push("provisioned_at = datetime('now')");
            }
        }

        if (admin_notes !== undefined) {
            updates.push('admin_notes = ?');
            params.push(admin_notes);
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            params.push(id);

            await query(`
                UPDATE portal_service_requests
                SET ${updates.join(', ')}
                WHERE id = ?
            `, params);
        }

        // Get updated request
        const updatedRequests = await query(`
            SELECT psr.*, u.name as user_name, u.email as user_email
            FROM portal_service_requests psr
            JOIN users u ON psr.user_id = u.id
            WHERE psr.id = ?
        `, [id]);

        res.json({
            success: true,
            request: updatedRequests[0],
            message: 'Service request updated'
        });

    } catch (error) {
        console.error('Error updating service request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update service request'
        });
    }
});

/**
 * DELETE /api/v2/service-requests/:id
 * Delete a service request
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query('DELETE FROM portal_service_requests WHERE id = ?', [id]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service request not found'
            });
        }

        res.json({
            success: true,
            message: 'Service request deleted'
        });

    } catch (error) {
        console.error('Error deleting service request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete service request'
        });
    }
});

module.exports = router;
