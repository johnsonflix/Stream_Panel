/**
 * Payment Providers API Routes
 *
 * Manages payment provider information for subscription plans
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');

/**
 * GET /api/v2/payment-providers
 * List all payment providers
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 Loading payment providers...');

        const includeInactive = req.query.include_inactive === 'true';

        let query = 'SELECT * FROM payment_providers';

        if (!includeInactive) {
            query += ' WHERE is_active = 1';
        }

        query += ' ORDER BY display_order, name';

        const providers = await db.query(query);

        res.json({
            success: true,
            providers,
            count: providers.length
        });

    } catch (error) {
        console.error('❌ Error loading payment providers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load payment providers',
            error: error.message
        });
    }
});

/**
 * GET /api/v2/payment-providers/:id
 * Get single payment provider details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 Loading payment provider ${id}...`);

        const providers = await db.query(
            'SELECT * FROM payment_providers WHERE id = ?',
            [id]
        );

        if (!providers || providers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment provider not found'
            });
        }

        res.json({
            success: true,
            provider: providers[0]
        });

    } catch (error) {
        console.error('❌ Error loading payment provider:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load payment provider',
            error: error.message
        });
    }
});

/**
 * POST /api/v2/payment-providers
 * Create new payment provider
 */
router.post('/', async (req, res) => {
    try {
        console.log('💾 Creating new payment provider...');

        const {
            name,
            payment_url,
            qr_code_data,
            is_active,
            display_order
        } = req.body;

        // Validation
        if (!name || !payment_url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, payment_url'
            });
        }

        // Insert provider
        const result = await db.query(`
            INSERT INTO payment_providers (
                name, payment_url, qr_code_data,
                is_active, display_order
            ) VALUES (?, ?, ?, ?, ?)
        `, [
            name,
            payment_url,
            qr_code_data || null,
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            display_order || 0
        ]);

        console.log(`✅ Created payment provider: ${name} (ID: ${result.lastID})`);

        res.json({
            success: true,
            message: 'Payment provider created successfully',
            provider_id: result.lastID
        });

    } catch (error) {
        console.error('❌ Error creating payment provider:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment provider',
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/payment-providers/:id
 * Update payment provider
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`💾 Updating payment provider ${id}...`);

        const {
            name,
            payment_url,
            qr_code_data,
            is_active,
            display_order
        } = req.body;

        // Check if provider exists
        const existingProviders = await db.query(
            'SELECT id FROM payment_providers WHERE id = ?',
            [id]
        );

        if (!existingProviders || existingProviders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment provider not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (payment_url !== undefined) {
            updates.push('payment_url = ?');
            values.push(payment_url);
        }
        if (qr_code_data !== undefined) {
            updates.push('qr_code_data = ?');
            values.push(qr_code_data);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active ? 1 : 0);
        }
        if (display_order !== undefined) {
            updates.push('display_order = ?');
            values.push(display_order);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update'
            });
        }

        values.push(id);

        await db.query(
            `UPDATE payment_providers SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        console.log(`✅ Updated payment provider ${id}`);

        res.json({
            success: true,
            message: 'Payment provider updated successfully'
        });

    } catch (error) {
        console.error('❌ Error updating payment provider:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update payment provider',
            error: error.message
        });
    }
});

/**
 * DELETE /api/v2/payment-providers/:id
 * Delete payment provider
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️  Deleting payment provider ${id}...`);

        // Check if provider exists
        const existingProviders = await db.query(
            'SELECT name FROM payment_providers WHERE id = ?',
            [id]
        );

        if (!existingProviders || existingProviders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment provider not found'
            });
        }

        await db.query('DELETE FROM payment_providers WHERE id = ?', [id]);

        console.log(`✅ Deleted payment provider: ${existingProviders[0].name}`);

        res.json({
            success: true,
            message: 'Payment provider deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting payment provider:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete payment provider',
            error: error.message
        });
    }
});

module.exports = router;
