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

// ============================================
// WEB APP MANIFEST (For Add to Home Screen)
// ============================================

/**
 * GET /api/v2/public/manifest.json
 * Generate web app manifest for home screen icons
 */
router.get('/manifest.json', async (req, res) => {
    try {
        // Get portal branding
        const nameResult = await query(
            "SELECT setting_value FROM settings WHERE setting_key = 'portal_name'"
        );
        const logoResult = await query(
            "SELECT setting_value FROM settings WHERE setting_key = 'portal_logo'"
        );
        const colorResult = await query(
            "SELECT setting_value FROM settings WHERE setting_key = 'portal_primary_color'"
        );

        const appName = nameResult.length > 0 ? nameResult[0].setting_value : 'Stream Panel';
        const appLogo = logoResult.length > 0 ? logoResult[0].setting_value : '/api/v2/settings/app_logo';
        const themeColor = colorResult.length > 0 ? colorResult[0].setting_value : '#8b5cf6';

        const manifest = {
            name: appName,
            short_name: appName.substring(0, 12),
            description: 'Stream your content anywhere',
            start_url: '/portal/',
            display: 'standalone',
            orientation: 'any',
            background_color: '#0f0f0f',
            theme_color: themeColor,
            icons: [
                {
                    src: appLogo,
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any maskable'
                },
                {
                    src: appLogo,
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable'
                }
            ]
        };

        res.setHeader('Content-Type', 'application/manifest+json');
        res.json(manifest);

    } catch (error) {
        console.error('Error generating manifest:', error);
        // Return a default manifest on error
        res.setHeader('Content-Type', 'application/manifest+json');
        res.json({
            name: 'Stream Panel',
            short_name: 'Stream',
            start_url: '/portal/',
            display: 'standalone',
            background_color: '#0f0f0f',
            theme_color: '#8b5cf6'
        });
    }
});

module.exports = router;
