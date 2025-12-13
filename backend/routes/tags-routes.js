/**
 * Tags API Routes
 *
 * CRUD operations for tags and tag assignment (manual + automatic)
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');

// GET /api/v2/tags - Get all tags
router.get('/', async (req, res) => {
    try {
        const tags = await db.query(`
            SELECT
                t.id,
                t.name,
                t.color,
                t.auto_assign_enabled,
                t.linked_server_id,
                t.linked_panel_id,
                t.created_at,
                t.updated_at,
                COUNT(DISTINCT ut.user_id) as user_count
            FROM tags t
            LEFT JOIN user_tags ut ON t.id = ut.tag_id
            GROUP BY t.id
            ORDER BY t.name
        `);

        // Fetch linked servers and panels for each tag
        for (const tag of tags) {
            // Get linked Plex servers
            const linkedServers = await db.query(`
                SELECT ps.id, ps.name
                FROM tag_plex_servers tps
                INNER JOIN plex_servers ps ON tps.plex_server_id = ps.id
                WHERE tps.tag_id = ?
            `, [tag.id]);
            tag.linked_servers = linkedServers;

            // Get linked IPTV panels
            const linkedPanels = await db.query(`
                SELECT ip.id, ip.name, ip.panel_type
                FROM tag_iptv_panels tip
                INNER JOIN iptv_panels ip ON tip.iptv_panel_id = ip.id
                WHERE tip.tag_id = ?
            `, [tag.id]);
            tag.linked_panels = linkedPanels;
        }

        res.json({
            success: true,
            data: tags,
            count: tags.length
        });

    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tags',
            error: error.message
        });
    }
});

// GET /api/v2/tags/:id - Get single tag
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const tags = await db.query(`
            SELECT t.*
            FROM tags t
            WHERE t.id = ?
        `, [id]);

        if (tags.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag not found'
            });
        }

        const tag = tags[0];

        // Get linked Plex servers
        const linkedServers = await db.query(`
            SELECT ps.id, ps.name
            FROM tag_plex_servers tps
            INNER JOIN plex_servers ps ON tps.plex_server_id = ps.id
            WHERE tps.tag_id = ?
        `, [id]);
        tag.linked_servers = linkedServers;
        tag.linked_server_ids = linkedServers.map(s => s.id);

        // Get linked IPTV panels
        const linkedPanels = await db.query(`
            SELECT ip.id, ip.name, ip.panel_type
            FROM tag_iptv_panels tip
            INNER JOIN iptv_panels ip ON tip.iptv_panel_id = ip.id
            WHERE tip.tag_id = ?
        `, [id]);
        tag.linked_panels = linkedPanels;
        tag.linked_panel_ids = linkedPanels.map(p => p.id);

        // Get user count
        const userCount = await db.query(`
            SELECT COUNT(*) as count FROM user_tags WHERE tag_id = ?
        `, [id]);

        tag.user_count = userCount[0].count;

        res.json({
            success: true,
            tag
        });

    } catch (error) {
        console.error('Error fetching tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tag',
            error: error.message
        });
    }
});

// GET /api/v2/tags/:id/users - Get all users with this tag
router.get('/:id/users', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if tag exists
        const tags = await db.query(`
            SELECT id, name FROM tags WHERE id = ?
        `, [id]);

        if (tags.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag not found'
            });
        }

        // Get all users with this tag
        const users = await db.query(`
            SELECT
                u.id,
                u.name,
                u.email,
                u.account_type,
                ut.assigned_by,
                ut.assigned_at
            FROM user_tags ut
            INNER JOIN users u ON ut.user_id = u.id
            WHERE ut.tag_id = ?
            ORDER BY u.name
        `, [id]);

        res.json({
            success: true,
            tag_id: id,
            tag_name: tags[0].name,
            users,
            count: users.length
        });

    } catch (error) {
        console.error('Error fetching tag users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tag users',
            error: error.message
        });
    }
});

// POST /api/v2/tags - Create new tag
router.post('/', async (req, res) => {
    try {
        const {
            name,
            color,
            auto_assign_enabled,
            linked_server_ids,  // Now accepts array
            linked_panel_ids,   // Now accepts array
            // Keep backward compatibility
            linked_server_id,
            linked_panel_id
        } = req.body;

        // Validation
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Tag name is required'
            });
        }

        // Check for duplicate name
        const existing = await db.query(`
            SELECT id FROM tags WHERE name = ?
        `, [name]);

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A tag with this name already exists'
            });
        }

        // Normalize to arrays (support both old and new API)
        let serverIds = [];
        let panelIds = [];

        if (linked_server_ids && Array.isArray(linked_server_ids)) {
            serverIds = linked_server_ids.filter(id => id != null);
        } else if (linked_server_id) {
            serverIds = [linked_server_id];
        }

        if (linked_panel_ids && Array.isArray(linked_panel_ids)) {
            panelIds = linked_panel_ids.filter(id => id != null);
        } else if (linked_panel_id) {
            panelIds = [linked_panel_id];
        }

        // Validate all server IDs
        for (const serverId of serverIds) {
            const servers = await db.query(`
                SELECT id FROM plex_servers WHERE id = ?
            `, [serverId]);

            if (servers.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `Plex server with ID ${serverId} not found`
                });
            }
        }

        // Validate all panel IDs
        for (const panelId of panelIds) {
            const panels = await db.query(`
                SELECT id FROM iptv_panels WHERE id = ?
            `, [panelId]);

            if (panels.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `IPTV panel with ID ${panelId} not found`
                });
            }
        }

        // Insert tag
        const result = await db.query(`
            INSERT INTO tags
            (name, color, auto_assign_enabled, linked_server_id, linked_panel_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            name,
            color || '#3b82f6',
            auto_assign_enabled ? 1 : 0,
            serverIds.length > 0 ? serverIds[0] : null,  // Keep first for backward compat
            panelIds.length > 0 ? panelIds[0] : null     // Keep first for backward compat
        ]);

        const tagId = result.insertId;

        // Insert into junction tables
        for (const serverId of serverIds) {
            await db.query(`
                INSERT INTO tag_plex_servers (tag_id, plex_server_id)
                VALUES (?, ?)
            `, [tagId, serverId]);
        }

        for (const panelId of panelIds) {
            await db.query(`
                INSERT INTO tag_iptv_panels (tag_id, iptv_panel_id)
                VALUES (?, ?)
            `, [tagId, panelId]);
        }

        res.status(201).json({
            success: true,
            message: 'Tag created successfully',
            tag_id: tagId
        });

    } catch (error) {
        console.error('Error creating tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create tag',
            error: error.message
        });
    }
});

// PUT /api/v2/tags/:id - Update tag
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            color,
            auto_assign_enabled,
            linked_server_ids,  // Now accepts array
            linked_panel_ids,   // Now accepts array
            // Keep backward compatibility
            linked_server_id,
            linked_panel_id
        } = req.body;

        // Check if tag exists
        const existing = await db.query(`
            SELECT id FROM tags WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag not found'
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            // Check for duplicate name
            const duplicate = await db.query(`
                SELECT id FROM tags WHERE name = ? AND id != ?
            `, [name, id]);

            if (duplicate.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'A tag with this name already exists'
                });
            }

            updates.push('name = ?');
            values.push(name);
        }

        if (color !== undefined) {
            updates.push('color = ?');
            values.push(color);
        }

        if (auto_assign_enabled !== undefined) {
            updates.push('auto_assign_enabled = ?');
            values.push(auto_assign_enabled ? 1 : 0);
        }

        // Handle server/panel links
        let serverIds = null;
        let panelIds = null;

        if (linked_server_ids !== undefined) {
            serverIds = Array.isArray(linked_server_ids)
                ? linked_server_ids.filter(sid => sid != null)
                : [];
        } else if (linked_server_id !== undefined) {
            serverIds = linked_server_id ? [linked_server_id] : [];
        }

        if (linked_panel_ids !== undefined) {
            panelIds = Array.isArray(linked_panel_ids)
                ? linked_panel_ids.filter(pid => pid != null)
                : [];
        } else if (linked_panel_id !== undefined) {
            panelIds = linked_panel_id ? [linked_panel_id] : [];
        }

        // Validate server IDs
        if (serverIds !== null) {
            for (const serverId of serverIds) {
                const servers = await db.query(`
                    SELECT id FROM plex_servers WHERE id = ?
                `, [serverId]);

                if (servers.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `Plex server with ID ${serverId} not found`
                    });
                }
            }

            // Update backward compatibility column
            updates.push('linked_server_id = ?');
            values.push(serverIds.length > 0 ? serverIds[0] : null);
        }

        // Validate panel IDs
        if (panelIds !== null) {
            for (const panelId of panelIds) {
                const panels = await db.query(`
                    SELECT id FROM iptv_panels WHERE id = ?
                `, [panelId]);

                if (panels.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `IPTV panel with ID ${panelId} not found`
                    });
                }
            }

            // Update backward compatibility column
            updates.push('linked_panel_id = ?');
            values.push(panelIds.length > 0 ? panelIds[0] : null);
        }

        // Update tag metadata if needed
        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(id);

            await db.query(`
                UPDATE tags
                SET ${updates.join(', ')}
                WHERE id = ?
            `, values);
        }

        // Update server links if provided
        if (serverIds !== null) {
            // Delete existing links
            await db.query(`DELETE FROM tag_plex_servers WHERE tag_id = ?`, [id]);

            // Insert new links
            for (const serverId of serverIds) {
                await db.query(`
                    INSERT INTO tag_plex_servers (tag_id, plex_server_id)
                    VALUES (?, ?)
                `, [id, serverId]);
            }
        }

        // Update panel links if provided
        if (panelIds !== null) {
            // Delete existing links
            await db.query(`DELETE FROM tag_iptv_panels WHERE tag_id = ?`, [id]);

            // Insert new links
            for (const panelId of panelIds) {
                await db.query(`
                    INSERT INTO tag_iptv_panels (tag_id, iptv_panel_id)
                    VALUES (?, ?)
                `, [id, panelId]);
            }
        }

        res.json({
            success: true,
            message: 'Tag updated successfully'
        });

    } catch (error) {
        console.error('Error updating tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tag',
            error: error.message
        });
    }
});

// DELETE /api/v2/tags/:id - Delete tag
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if tag exists
        const existing = await db.query(`
            SELECT id FROM tags WHERE id = ?
        `, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag not found'
            });
        }

        // Delete tag (cascades to user_tags via ON DELETE CASCADE)
        await db.query(`DELETE FROM tags WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Tag deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete tag',
            error: error.message
        });
    }
});

// POST /api/v2/tags/:id/assign - Manually assign tag to user
router.post('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required'
            });
        }

        // Check if tag exists
        const tags = await db.query(`
            SELECT id FROM tags WHERE id = ?
        `, [id]);

        if (tags.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag not found'
            });
        }

        // Check if user exists
        const users = await db.query(`
            SELECT id FROM users WHERE id = ?
        `, [user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already assigned
        const existing = await db.query(`
            SELECT * FROM user_tags WHERE tag_id = ? AND user_id = ?
        `, [id, user_id]);

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Tag is already assigned to this user'
            });
        }

        // Assign tag
        await db.query(`
            INSERT INTO user_tags (user_id, tag_id, assigned_by)
            VALUES (?, ?, 'manual')
        `, [user_id, id]);

        res.status(201).json({
            success: true,
            message: 'Tag assigned successfully'
        });

    } catch (error) {
        console.error('Error assigning tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign tag',
            error: error.message
        });
    }
});

// DELETE /api/v2/tags/:id/unassign - Unassign tag from user
router.delete('/:id/unassign', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required'
            });
        }

        // Check if assignment exists
        const existing = await db.query(`
            SELECT * FROM user_tags WHERE tag_id = ? AND user_id = ?
        `, [id, user_id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tag assignment not found'
            });
        }

        // Delete assignment
        await db.query(`
            DELETE FROM user_tags WHERE tag_id = ? AND user_id = ?
        `, [id, user_id]);

        res.json({
            success: true,
            message: 'Tag unassigned successfully'
        });

    } catch (error) {
        console.error('Error unassigning tag:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unassign tag',
            error: error.message
        });
    }
});

// POST /api/v2/tags/auto-assign - Run auto-assignment for all tags (background job)
router.post('/auto-assign', async (req, res) => {
    try {
        const results = {
            processed_tags: 0,
            assigned_count: 0,
            unassigned_count: 0,
            errors: []
        };

        // Get all tags with auto-assignment enabled
        const autoTags = await db.query(`
            SELECT * FROM tags WHERE auto_assign_enabled = 1
        `);

        results.processed_tags = autoTags.length;

        for (const tag of autoTags) {
            try {
                let eligibleUserIds = [];

                // Get all linked servers for this tag
                const linkedServers = await db.query(`
                    SELECT plex_server_id FROM tag_plex_servers WHERE tag_id = ?
                `, [tag.id]);

                // Get all linked panels for this tag
                const linkedPanels = await db.query(`
                    SELECT iptv_panel_id FROM tag_iptv_panels WHERE tag_id = ?
                `, [tag.id]);

                // Case 1: Tag linked to Plex server(s)
                if (linkedServers.length > 0) {
                    const serverIds = linkedServers.map(s => s.plex_server_id);
                    // Find all users with active shares to ANY of these Plex servers
                    const placeholders = serverIds.map(() => '?').join(',');
                    const usersWithServer = await db.query(`
                        SELECT DISTINCT ups.user_id as id
                        FROM user_plex_shares ups
                        INNER JOIN users u ON ups.user_id = u.id
                        WHERE ups.plex_server_id IN (${placeholders})
                          AND ups.removed_at IS NULL
                          AND u.plex_enabled = 1
                    `, serverIds);

                    eligibleUserIds = [...new Set([...eligibleUserIds, ...usersWithServer.map(u => u.id)])];
                }

                // Case 2: Tag linked to IPTV panel(s)
                if (linkedPanels.length > 0) {
                    const panelIds = linkedPanels.map(p => p.iptv_panel_id);
                    // Find all users with active subscriptions to ANY of these panels
                    const placeholders = panelIds.map(() => '?').join(',');
                    const usersWithPanel = await db.query(`
                        SELECT DISTINCT u.id
                        FROM users u
                        WHERE u.iptv_enabled = 1
                          AND u.iptv_panel_id IN (${placeholders})
                    `, panelIds);

                    eligibleUserIds = [...new Set([...eligibleUserIds, ...usersWithPanel.map(u => u.id)])];
                }

                // Case 3: Tag not linked to anything - skip
                if (linkedServers.length === 0 && linkedPanels.length === 0) {
                    console.warn(`Tag ${tag.id} (${tag.name}) has auto-assign enabled but no server/panel link`);
                    continue;
                }

                // Get currently assigned users for this tag
                const currentAssignments = await db.query(`
                    SELECT user_id FROM user_tags WHERE tag_id = ?
                `, [tag.id]);

                const currentUserIds = currentAssignments.map(a => a.user_id);

                // Find users to add (eligible but not currently assigned)
                const usersToAdd = eligibleUserIds.filter(uid => !currentUserIds.includes(uid));

                // Find users to remove (currently assigned but no longer eligible)
                const usersToRemove = currentUserIds.filter(uid => !eligibleUserIds.includes(uid));

                // Assign tag to new users
                for (const userId of usersToAdd) {
                    await db.query(`
                        INSERT OR REPLACE INTO user_tags (user_id, tag_id, assigned_by, assigned_at)
                        VALUES (?, ?, 'auto', datetime('now'))
                    `, [userId, tag.id]);

                    results.assigned_count++;
                }

                // Remove tag from users who no longer qualify
                // But only if they were auto-assigned (preserve manual assignments)
                for (const userId of usersToRemove) {
                    await db.query(`
                        DELETE FROM user_tags
                        WHERE user_id = ? AND tag_id = ? AND assigned_by = 'auto'
                    `, [userId, tag.id]);

                    results.unassigned_count++;
                }

            } catch (tagError) {
                console.error(`Error processing tag ${tag.id}:`, tagError);
                results.errors.push({
                    tag_id: tag.id,
                    tag_name: tag.name,
                    error: tagError.message
                });
            }
        }

        res.json({
            success: true,
            message: 'Auto-assignment completed',
            results
        });

    } catch (error) {
        console.error('Error running auto-assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to run auto-assignment',
            error: error.message
        });
    }
});

/**
 * Helper function to auto-assign tags for a specific user
 * Called after user creation/update to immediately assign relevant tags
 */
async function autoAssignTagsForUser(userId) {
    try {
        // Get all tags with auto-assignment enabled
        const autoTags = await db.query(`
            SELECT * FROM tags WHERE auto_assign_enabled = 1
        `);

        let assignedCount = 0;
        let unassignedCount = 0;

        for (const tag of autoTags) {
            let isEligible = false;

            // Get all linked servers for this tag
            const linkedServers = await db.query(`
                SELECT plex_server_id FROM tag_plex_servers WHERE tag_id = ?
            `, [tag.id]);

            // Get all linked panels for this tag
            const linkedPanels = await db.query(`
                SELECT iptv_panel_id FROM tag_iptv_panels WHERE tag_id = ?
            `, [tag.id]);

            // Check if user is eligible for this tag based on Plex servers
            if (linkedServers.length > 0) {
                const serverIds = linkedServers.map(s => s.plex_server_id);
                const placeholders = serverIds.map(() => '?').join(',');
                const usersWithServer = await db.query(`
                    SELECT DISTINCT ups.user_id as id
                    FROM user_plex_shares ups
                    INNER JOIN users u ON ups.user_id = u.id
                    WHERE ups.plex_server_id IN (${placeholders})
                      AND ups.user_id = ?
                      AND ups.removed_at IS NULL
                      AND u.plex_enabled = 1
                `, [...serverIds, userId]);

                if (usersWithServer.length > 0) {
                    isEligible = true;
                }
            }

            // Check if user is eligible for this tag based on IPTV panels
            if (!isEligible && linkedPanels.length > 0) {
                const panelIds = linkedPanels.map(p => p.iptv_panel_id);
                const placeholders = panelIds.map(() => '?').join(',');
                const usersWithPanel = await db.query(`
                    SELECT DISTINCT u.id
                    FROM users u
                    WHERE u.iptv_enabled = 1
                      AND u.id = ?
                      AND u.iptv_panel_id IN (${placeholders})
                `, [userId, ...panelIds]);

                if (usersWithPanel.length > 0) {
                    isEligible = true;
                }
            }

            // Check current assignment status
            const currentAssignment = await db.query(`
                SELECT user_id, assigned_by FROM user_tags
                WHERE user_id = ? AND tag_id = ?
            `, [userId, tag.id]);

            const isCurrentlyAssigned = currentAssignment.length > 0;
            const isAutoAssigned = isCurrentlyAssigned && currentAssignment[0].assigned_by === 'auto';

            if (isEligible && !isCurrentlyAssigned) {
                // Assign tag
                await db.query(`
                    INSERT OR REPLACE INTO user_tags (user_id, tag_id, assigned_by, assigned_at)
                    VALUES (?, ?, 'auto', datetime('now'))
                `, [userId, tag.id]);
                assignedCount++;
            }
            else if (!isEligible && isAutoAssigned) {
                // Remove auto-assigned tag (preserve manual assignments)
                await db.query(`
                    DELETE FROM user_tags
                    WHERE user_id = ? AND tag_id = ? AND assigned_by = 'auto'
                `, [userId, tag.id]);
                unassignedCount++;
            }
        }

        return { assignedCount, unassignedCount };
    } catch (error) {
        console.error(`Error auto-assigning tags for user ${userId}:`, error);
        throw error;
    }
}

// Export the router and helper function
module.exports = router;
module.exports.autoAssignTagsForUser = autoAssignTagsForUser;
