/**
 * Subscription Plans API Routes
 *
 * Unified subscription plan management for Plex, IPTV, and future services
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');

/**
 * GET /api/v2/subscription-plans
 * List all subscription plans
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 Loading subscription plans...');

        const includeInactive = req.query.include_inactive === 'true';

        let query = `
            SELECT
                sp.*,
                ip.name as iptv_panel_name,
                pp.name as plex_package_name
            FROM subscription_plans sp
            LEFT JOIN iptv_panels ip ON sp.iptv_panel_id = ip.id
            LEFT JOIN plex_packages pp ON sp.plex_package_id = pp.id
        `;

        if (!includeInactive) {
            query += ' WHERE sp.is_active = TRUE';
        }

        query += ' ORDER BY sp.display_order, sp.name';

        const plans = await db.query(query);

        // Parse JSON fields and add billing_interval
        const parsedPlans = plans.map(plan => {
            // Generate billing_interval from duration_months
            let billingInterval = '';
            if (plan.duration_months === 0 || plan.duration_months === null) {
                billingInterval = 'Unlimited';
            } else if (plan.duration_months === 1) {
                billingInterval = '1 Month';
            } else if (plan.duration_months > 0) {
                billingInterval = `${plan.duration_months} Months`;
            } else {
                billingInterval = 'Custom';
            }

            return {
                ...plan,
                features: plan.features ? JSON.parse(plan.features) : [],
                billing_interval: billingInterval
            };
        });

        res.json({
            success: true,
            plans: parsedPlans,
            count: parsedPlans.length
        });

    } catch (error) {
        console.error('❌ Error loading subscription plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load subscription plans',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/subscription-plans/:id
 * Get single subscription plan details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 Loading subscription plan ${id}...`);

        const plans = await db.query(`
            SELECT
                sp.*,
                ip.name as iptv_panel_name,
                pp.name as plex_package_name
            FROM subscription_plans sp
            LEFT JOIN iptv_panels ip ON sp.iptv_panel_id = ip.id
            LEFT JOIN plex_packages pp ON sp.plex_package_id = pp.id
            WHERE sp.id = ?
        `, [id]);

        if (!plans || plans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Subscription plan not found'
            });
        }

        const plan = {
            ...plans[0],
            features: plans[0].features ? JSON.parse(plans[0].features) : []
        };

        res.json({
            success: true,
            plan
        });

    } catch (error) {
        console.error('❌ Error loading subscription plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load subscription plan',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/subscription-plans
 * Create new subscription plan
 */
router.post('/', async (req, res) => {
    try {
        console.log('💾 Creating new subscription plan...');

        const {
            name,
            description,
            service_type,
            price,
            price_type,
            currency,
            duration_months,
            iptv_connections,
            iptv_panel_id,
            plex_package_id,
            features,
            is_active,
            display_order,
            // Portal visibility fields
            show_on_portal,
            is_portal_default,
            portal_description
        } = req.body;

        // Validation - duration_months can be 0 for unlimited
        if (!name || !service_type || price === undefined || duration_months === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, service_type, price, duration_months'
            });
        }

        // Validate price_type
        const validPriceTypes = ['fixed', 'free', 'donation'];
        const finalPriceType = price_type && validPriceTypes.includes(price_type) ? price_type : 'fixed';

        // Validate service_type
        const validServiceTypes = ['plex', 'iptv'];
        if (!validServiceTypes.includes(service_type)) {
            return res.status(400).json({
                success: false,
                message: `Invalid service_type. Must be one of: ${validServiceTypes.join(', ')}`
            });
        }

        // IPTV-specific validation
        if (service_type === 'iptv') {
            if (!iptv_connections) {
                return res.status(400).json({
                    success: false,
                    message: 'iptv_connections is required for IPTV plans'
                });
            }
        }

        // Insert plan
        const result = await db.query(`
            INSERT INTO subscription_plans (
                name, description, service_type,
                price, price_type, currency, duration_months,
                iptv_connections, iptv_panel_id,
                plex_package_id, features,
                is_active, display_order,
                show_on_portal, is_portal_default, portal_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            description || null,
            service_type,
            price,
            finalPriceType,
            currency || 'USD',
            duration_months,
            iptv_connections || null,
            iptv_panel_id || null,
            plex_package_id || null,
            features ? JSON.stringify(features) : '[]',
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            display_order || 0,
            show_on_portal !== undefined ? (show_on_portal ? 1 : 0) : 1,
            is_portal_default ? 1 : 0,
            portal_description || null
        ]);

        console.log(`✅ Created subscription plan: ${name} (ID: ${result.lastID})`);

        res.json({
            success: true,
            message: 'Subscription plan created successfully',
            plan_id: result.lastID
        });

    } catch (error) {
        console.error('❌ Error creating subscription plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create subscription plan',
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/subscription-plans/:id
 * Update subscription plan
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`💾 Updating subscription plan ${id}...`);

        const {
            name,
            description,
            service_type,
            price,
            price_type,
            currency,
            duration_months,
            iptv_connections,
            iptv_panel_id,
            plex_package_id,
            features,
            is_active,
            display_order,
            // Portal visibility fields
            show_on_portal,
            is_portal_default,
            portal_description
        } = req.body;

        // Check if plan exists
        const existingPlans = await db.query('SELECT id FROM subscription_plans WHERE id = ?', [id]);
        if (!existingPlans || existingPlans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Subscription plan not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (service_type !== undefined) {
            updates.push('service_type = ?');
            values.push(service_type);
        }
        if (price !== undefined) {
            updates.push('price = ?');
            values.push(price);
        }
        if (price_type !== undefined) {
            const validPriceTypes = ['fixed', 'free', 'donation'];
            if (validPriceTypes.includes(price_type)) {
                updates.push('price_type = ?');
                values.push(price_type);
            }
        }
        if (currency !== undefined) {
            updates.push('currency = ?');
            values.push(currency);
        }
        if (duration_months !== undefined) {
            updates.push('duration_months = ?');
            values.push(duration_months);
        }
        if (iptv_connections !== undefined) {
            updates.push('iptv_connections = ?');
            values.push(iptv_connections);
        }
        if (iptv_panel_id !== undefined) {
            updates.push('iptv_panel_id = ?');
            values.push(iptv_panel_id);
        }
        if (plex_package_id !== undefined) {
            updates.push('plex_package_id = ?');
            values.push(plex_package_id);
        }
        if (features !== undefined) {
            updates.push('features = ?');
            values.push(JSON.stringify(features));
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (display_order !== undefined) {
            updates.push('display_order = ?');
            values.push(display_order);
        }
        // Portal visibility fields
        if (show_on_portal !== undefined) {
            updates.push('show_on_portal = ?');
            values.push(show_on_portal ? 1 : 0);
        }
        if (is_portal_default !== undefined) {
            updates.push('is_portal_default = ?');
            values.push(is_portal_default ? 1 : 0);
        }
        if (portal_description !== undefined) {
            updates.push('portal_description = ?');
            values.push(portal_description);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update'
            });
        }

        values.push(id);

        await db.query(
            `UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        console.log(`✅ Updated subscription plan ${id}`);

        res.json({
            success: true,
            message: 'Subscription plan updated successfully'
        });

    } catch (error) {
        console.error('❌ Error updating subscription plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update subscription plan',
            error: error.message
        });
    }
});

/**
 * DELETE /api/v2/subscription-plans/:id
 * Delete subscription plan
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️  Deleting subscription plan ${id}...`);

        // Check if plan exists
        const existingPlans = await db.query('SELECT name FROM subscription_plans WHERE id = ?', [id]);
        if (!existingPlans || existingPlans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Subscription plan not found'
            });
        }

        // TODO: Check if any users are assigned to this plan
        // For now, allow deletion

        await db.query('DELETE FROM subscription_plans WHERE id = ?', [id]);

        console.log(`✅ Deleted subscription plan: ${existingPlans[0].name}`);

        res.json({
            success: true,
            message: 'Subscription plan deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting subscription plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete subscription plan',
            error: error.message
        });
    }
});

module.exports = router;
