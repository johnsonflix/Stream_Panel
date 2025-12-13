/**
 * Portal Public Routes
 *
 * Public routes for the portal that don't require authentication.
 * Includes shareable guide URLs and public resources.
 */

const express = require('express');
const { query } = require('../database-config');

const router = express.Router();

// ============================================
// PUBLIC GUIDES (Shareable URLs)
// ============================================

/**
 * GET /api/v2/public/guides
 * Get list of public guides
 */
router.get('/guides', async (req, res) => {
    try {
        const guides = await query(`
            SELECT id, slug, title, icon, icon_type, service_type, category, short_description
            FROM portal_guides
            WHERE is_public = 1 AND is_visible = 1
            ORDER BY display_order, title
        `);

        res.json({
            success: true,
            guides
        });

    } catch (error) {
        console.error('Error fetching public guides:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch guides'
        });
    }
});

/**
 * GET /api/v2/public/guides/:slug
 * Get a specific public guide by slug
 */
router.get('/guides/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const guides = await query(`
            SELECT * FROM portal_guides
            WHERE slug = ? AND is_public = 1 AND is_visible = 1
        `, [slug]);

        if (guides.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guide not found'
            });
        }

        // Increment view count
        await query(
            'UPDATE portal_guides SET views = views + 1 WHERE id = ?',
            [guides[0].id]
        );

        res.json({
            success: true,
            guide: guides[0]
        });

    } catch (error) {
        console.error('Error fetching public guide:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch guide'
        });
    }
});

// ============================================
// PORTAL BRANDING (Public)
// ============================================

/**
 * GET /api/v2/public/branding
 * Get portal branding settings
 */
router.get('/branding', async (req, res) => {
    try {
        const brandingKeys = [
            'portal_name',
            'portal_logo',
            'portal_favicon',
            'portal_primary_color',
            'portal_secondary_color'
        ];

        const branding = {};

        for (const key of brandingKeys) {
            const result = await query(
                'SELECT setting_value FROM settings WHERE setting_key = ?',
                [key]
            );
            const shortKey = key.replace('portal_', '');
            branding[shortKey] = result.length > 0 ? result[0].setting_value : null;
        }

        // Set defaults if not configured
        if (!branding.name) branding.name = 'User Portal';
        if (!branding.primary_color) branding.primary_color = '#3b82f6';
        if (!branding.secondary_color) branding.secondary_color = '#8b5cf6';

        res.json({
            success: true,
            branding
        });

    } catch (error) {
        console.error('Error fetching portal branding:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch branding'
        });
    }
});

module.exports = router;
