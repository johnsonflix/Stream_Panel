/**
 * Plex Packages API Routes
 *
 * CRUD operations for Plex packages (server + library bundles)
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');

// GET /api/v2/plex-packages - Get all Plex packages
router.get('/', async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';

        let sql = `
            SELECT
                id,
                name,
                description,
                price,
                duration_months,
                server_library_mappings,
                is_active,
                display_order,
                created_at,
                updated_at
            FROM plex_packages
        `;

        if (!includeInactive) {
            sql += ' WHERE is_active = TRUE';
        }

        sql += ' ORDER BY display_order, name';

        const packages = await db.query(sql);

        // Parse JSON fields and generate billing_interval from duration_months
        const parsedPackages = packages.map(pkg => {
            // Generate billing_interval string from duration_months
            let billingInterval = '';
            if (pkg.duration_months === 1) {
                billingInterval = '1 Month';
            } else if (pkg.duration_months > 0) {
                billingInterval = `${pkg.duration_months} Months`;
            } else {
                billingInterval = 'Custom'; // For trial or special packages
            }

            return {
                ...pkg,
                server_library_mappings: JSON.parse(pkg.server_library_mappings),
                billing_interval: billingInterval
            };
        });

        res.json({
            success: true,
            packages: parsedPackages,
            count: parsedPackages.length
        });

    } catch (error) {
        console.error('Error fetching Plex packages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex packages',
            error: error.message
        });
    }
});

// GET /api/v2/plex-packages/:id - Get single Plex package
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const packages = await db.query(`
            SELECT * FROM plex_packages WHERE id = ?
        `, [id]);

        if (packages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex package not found'
            });
        }

        const pkg = packages[0];
        pkg.server_library_mappings = JSON.parse(pkg.server_library_mappings);

        res.json({
            success: true,
            package: pkg
        });

    } catch (error) {
        console.error('Error fetching Plex package:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Plex package',
            error: error.message
        });
    }
});

// GET /api/v2/plex-packages/:id/preview - Get package preview with server/library details
router.get('/:id/preview', async (req, res) => {
    try {
        const { id } = req.params;

        // Get package
        const packages = await db.query(`
            SELECT * FROM plex_packages WHERE id = ?
        `, [id]);

        if (packages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex package not found'
            });
        }

        const pkg = packages[0];
        const mappings = JSON.parse(pkg.server_library_mappings);

        // Get server details for each mapping
        const servers = [];
        let totalLibraries = 0;

        for (const mapping of mappings) {
            const serverRows = await db.query(`
                SELECT id, name, libraries
                FROM plex_servers
                WHERE id = ? AND is_active = TRUE
            `, [mapping.server_id]);

            if (serverRows.length === 0) {
                console.warn(`Server ${mapping.server_id} not found or inactive`);
                continue;
            }

            const server = serverRows[0];
            const allLibraries = server.libraries ? JSON.parse(server.libraries) : [];

            // Filter libraries to only those included in package
            const includedLibraries = allLibraries.filter(lib =>
                mapping.library_ids.includes(lib.id)
            );

            servers.push({
                server_id: server.id,
                server_name: server.name,
                libraries: includedLibraries
            });

            totalLibraries += includedLibraries.length;
        }

        res.json({
            success: true,
            package_id: pkg.id,
            package_name: pkg.name,
            description: pkg.description,
            price: pkg.price,
            duration_months: pkg.duration_months,
            servers,
            total_libraries: totalLibraries,
            total_servers: servers.length
        });

    } catch (error) {
        console.error('Error fetching package preview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch package preview',
            error: error.message
        });
    }
});

// POST /api/v2/plex-packages - Create new Plex package
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            duration_months,
            server_library_mappings,
            display_order
        } = req.body;

        // Validation
        if (!name || !duration_months || !server_library_mappings) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, duration_months, server_library_mappings'
            });
        }

        // Validate server_library_mappings structure
        if (!Array.isArray(server_library_mappings) || server_library_mappings.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'server_library_mappings must be a non-empty array'
            });
        }

        // Validate each mapping has server_id and library_ids
        for (const mapping of server_library_mappings) {
            if (!mapping.server_id || !Array.isArray(mapping.library_ids)) {
                return res.status(400).json({
                    success: false,
                    message: 'Each mapping must have server_id and library_ids array'
                });
            }
        }

        // Insert package
        const result = await db.query(`
            INSERT INTO plex_packages
            (name, description, price, duration_months, server_library_mappings, display_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `, [
            name,
            description,
            price,
            duration_months,
            JSON.stringify(server_library_mappings),
            display_order || 0
        ]);

        res.status(201).json({
            success: true,
            message: 'Plex package created successfully',
            package_id: result.insertId
        });

    } catch (error) {
        console.error('Error creating Plex package:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create Plex package',
            error: error.message
        });
    }
});

// PUT /api/v2/plex-packages/:id - Update Plex package
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            price,
            duration_months,
            server_library_mappings,
            is_active,
            display_order
        } = req.body;

        // Check if package exists
        const existing = await db.query(`
            SELECT id FROM plex_packages WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex package not found'
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
        if (price !== undefined) {
            updates.push('price = ?');
            values.push(price);
        }
        if (duration_months !== undefined) {
            updates.push('duration_months = ?');
            values.push(duration_months);
        }
        if (server_library_mappings !== undefined) {
            // Validate structure
            if (!Array.isArray(server_library_mappings)) {
                return res.status(400).json({
                    success: false,
                    message: 'server_library_mappings must be an array'
                });
            }
            updates.push('server_library_mappings = ?');
            values.push(JSON.stringify(server_library_mappings));
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(is_active);
        }
        if (display_order !== undefined) {
            updates.push('display_order = ?');
            values.push(display_order);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await db.query(`
            UPDATE plex_packages
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);

        res.json({
            success: true,
            message: 'Plex package updated successfully'
        });

    } catch (error) {
        console.error('Error updating Plex package:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update Plex package',
            error: error.message
        });
    }
});

// DELETE /api/v2/plex-packages/:id - Delete Plex package
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if package is used by any users
        const usersUsing = await db.query(`
            SELECT COUNT(*) as count
            FROM users
            WHERE plex_package_id = ?
        `, [id]);

        if (usersUsing[0].count > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete package: It is assigned to ${usersUsing[0].count} user(s)`,
                users_count: usersUsing[0].count
            });
        }

        // Delete package
        const result = await db.query(`
            DELETE FROM plex_packages WHERE id = ?
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plex package not found'
            });
        }

        res.json({
            success: true,
            message: 'Plex package deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting Plex package:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete Plex package',
            error: error.message
        });
    }
});

module.exports = router;
