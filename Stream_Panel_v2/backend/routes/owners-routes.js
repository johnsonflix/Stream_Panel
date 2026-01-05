/**
 * Owners/Resellers Routes
 *
 * CRUD operations for owner/reseller management
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database-config');

// GET /api/v2/owners - List all owners
router.get('/', async (req, res) => {
    try {
        const owners = await query(`
            SELECT id, name, email, created_at,
                   telegram_username, whatsapp_username, discord_username,
                   venmo_username, paypal_username, cashapp_username,
                   googlepay_username, applecash_username
            FROM owners
            ORDER BY name
        `);

        res.json({
            success: true,
            data: owners,
            owners: owners // for backward compatibility
        });
    } catch (error) {
        console.error('Error fetching owners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owners',
            error: error.message
        });
    }
});

// GET /api/v2/owners/:id - Get single owner
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const owners = await query('SELECT * FROM owners WHERE id = ?', [id]);

        if (owners.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }

        res.json({
            success: true,
            owner: owners[0]
        });
    } catch (error) {
        console.error('Error fetching owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owner',
            error: error.message
        });
    }
});

// POST /api/v2/owners - Create new owner
router.post('/', async (req, res) => {
    try {
        const {
            name,
            email,
            telegram_username,
            whatsapp_username,
            discord_username,
            venmo_username,
            paypal_username,
            cashapp_username,
            googlepay_username,
            applecash_username
        } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }

        const result = await query(`
            INSERT INTO owners (
                name, email,
                telegram_username, whatsapp_username, discord_username,
                venmo_username, paypal_username, cashapp_username,
                googlepay_username, applecash_username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            email || null,
            telegram_username || null,
            whatsapp_username || null,
            discord_username || null,
            venmo_username || null,
            paypal_username || null,
            cashapp_username || null,
            googlepay_username || null,
            applecash_username || null
        ]);

        res.json({
            success: true,
            message: 'Owner created successfully',
            owner_id: result.lastID
        });
    } catch (error) {
        console.error('Error creating owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create owner',
            error: error.message
        });
    }
});

// PUT /api/v2/owners/:id - Update owner
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            email,
            telegram_username,
            whatsapp_username,
            discord_username,
            venmo_username,
            paypal_username,
            cashapp_username,
            googlepay_username,
            applecash_username
        } = req.body;

        // Check if owner exists
        const existing = await query('SELECT id FROM owners WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }

        // Build dynamic update query
        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (email !== undefined) { updates.push('email = ?'); values.push(email); }
        if (telegram_username !== undefined) { updates.push('telegram_username = ?'); values.push(telegram_username); }
        if (whatsapp_username !== undefined) { updates.push('whatsapp_username = ?'); values.push(whatsapp_username); }
        if (discord_username !== undefined) { updates.push('discord_username = ?'); values.push(discord_username); }
        if (venmo_username !== undefined) { updates.push('venmo_username = ?'); values.push(venmo_username); }
        if (paypal_username !== undefined) { updates.push('paypal_username = ?'); values.push(paypal_username); }
        if (cashapp_username !== undefined) { updates.push('cashapp_username = ?'); values.push(cashapp_username); }
        if (googlepay_username !== undefined) { updates.push('googlepay_username = ?'); values.push(googlepay_username); }
        if (applecash_username !== undefined) { updates.push('applecash_username = ?'); values.push(applecash_username); }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(id);
        await query(`UPDATE owners SET ${updates.join(', ')} WHERE id = ?`, values);

        res.json({
            success: true,
            message: 'Owner updated successfully'
        });
    } catch (error) {
        console.error('Error updating owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update owner',
            error: error.message
        });
    }
});

// DELETE /api/v2/owners/:id - Delete owner
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if owner exists
        const existing = await query('SELECT id, name FROM owners WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Owner not found'
            });
        }

        // Check if any users are assigned to this owner
        const usersWithOwner = await query('SELECT COUNT(*) as count FROM users WHERE owner_id = ?', [id]);
        if (usersWithOwner[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete owner: ${usersWithOwner[0].count} user(s) are still assigned to this owner`
            });
        }

        await query('DELETE FROM owners WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Owner deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete owner',
            error: error.message
        });
    }
});

module.exports = router;
