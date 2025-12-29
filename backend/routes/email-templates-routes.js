/**
 * Email Templates Routes
 *
 * CRUD operations for email templates and metadata endpoints
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database-config');

// Available template variables that can be used in templates
const TEMPLATE_VARIABLES = {
    user: {
        name: 'User\'s display name',
        username: 'Username',
        email: 'User\'s email address',
        owner_name: 'Owner/reseller name'
    },
    iptv_panel: {
        iptv_username: 'IPTV panel username',
        iptv_password: 'IPTV panel password',
        iptv_m3u_url: 'IPTV panel M3U URL',
        iptv_expiration_date: 'IPTV panel expiration date',
        iptv_connections: 'Number of IPTV connections allowed',
        iptv_panel_name: 'IPTV panel name'
    },
    iptv_editor: {
        iptv_editor_dns: 'IPTV Editor DNS/Xtream API URL (global setting)',
        iptv_editor_username: 'IPTV Editor username',
        iptv_editor_password: 'IPTV Editor password',
        iptv_editor_m3u_url: 'IPTV Editor M3U URL',
        iptv_editor_epg_url: 'IPTV Editor EPG URL',
        iptv_editor_expiration_date: 'IPTV Editor expiration date',
        iptv_provider_base_url: 'Customer streaming URL (from Editor playlist or Panel)',
        iptv_dns: 'Dynamic DNS: Uses Editor DNS if user has Editor, otherwise Panel DNS',
        iptv_panel_dns: 'IPTV Panel DNS/Provider URL',
        iptv_creds_username: 'Dynamic username: Editor username if has Editor, else Panel username',
        iptv_creds_password: 'Dynamic password: Editor password if has Editor, else Panel password'
    },
    plex: {
        plex_email: 'User\'s Plex email',
        plex_expiration_date: 'Plex subscription expiration date',
        plex_server_name: 'Plex server name',
        plex_request_site: 'Plex request site URL (Overseerr/Jellyseerr)',
        plex_libraries: 'Accessible Plex libraries'
    },
    system: {
        app_name: 'Application name',
        app_url: 'Application URL (Admin panel)',
        portal_url: 'End user portal URL',
        current_date: 'Current date',
        current_year: 'Current year'
    }
};

// Handlebars helpers available in templates
const TEMPLATE_HELPERS = {
    formatDate: 'Format a date (e.g., {{formatDate subscription_end "MMM D, YYYY"}})',
    uppercase: 'Convert text to uppercase',
    lowercase: 'Convert text to lowercase',
    pluralize: 'Pluralize a word based on count',
    ifEquals: 'Conditional check for equality',
    ifGreater: 'Conditional check for greater than'
};

// GET /api/v2/email-templates/meta/variables - Get available template variables
// IMPORTANT: This route must come BEFORE /:id to avoid matching "meta" as an id
router.get('/meta/variables', (req, res) => {
    res.json({
        success: true,
        data: TEMPLATE_VARIABLES
    });
});

// GET /api/v2/email-templates/meta/helpers - Get available template helpers
router.get('/meta/helpers', (req, res) => {
    res.json({
        success: true,
        data: TEMPLATE_HELPERS
    });
});

// GET /api/v2/email-templates - List all templates
router.get('/', async (req, res) => {
    try {
        const templates = await query(`
            SELECT
                id, name, subject, body, template_type, category,
                is_system, owner_id, variables_used, custom_message,
                created_at, updated_at
            FROM email_templates
            ORDER BY category, name
        `);

        res.json({
            success: true,
            templates: templates,
            data: templates // For backward compatibility
        });
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email templates',
            error: error.message
        });
    }
});

// GET /api/v2/email-templates/:id - Get single template
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const templates = await query(`
            SELECT * FROM email_templates WHERE id = ?
        `, [id]);

        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        res.json({
            success: true,
            template: templates[0]
        });
    } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template',
            error: error.message
        });
    }
});

// POST /api/v2/email-templates - Create new template
router.post('/', async (req, res) => {
    try {
        const { name, subject, body, template_type, category, owner_id, variables_used, custom_message } = req.body;

        if (!name || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'Name, subject, and body are required'
            });
        }

        const result = await query(`
            INSERT INTO email_templates (name, subject, body, template_type, category, owner_id, variables_used, custom_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, subject, body, template_type || 'custom', category || 'custom', owner_id || null, variables_used || null, custom_message || '']);

        res.json({
            success: true,
            message: 'Template created successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create template',
            error: error.message
        });
    }
});

// PUT /api/v2/email-templates/:id - Update template
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subject, body, template_type, category, owner_id, variables_used, custom_message } = req.body;

        // Check if template exists
        const existing = await query('SELECT id, is_system FROM email_templates WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        await query(`
            UPDATE email_templates
            SET name = ?, subject = ?, body = ?, template_type = ?, category = ?,
                owner_id = ?, variables_used = ?, custom_message = ?, updated_at = datetime('now')
            WHERE id = ?
        `, [name, subject, body, template_type, category, owner_id, variables_used, custom_message || '', id]);

        res.json({
            success: true,
            message: 'Template updated successfully'
        });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template',
            error: error.message
        });
    }
});

// DELETE /api/v2/email-templates/:id - Delete template
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if template exists and is not a system template
        const existing = await query('SELECT id, is_system FROM email_templates WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        if (existing[0].is_system) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete system templates'
            });
        }

        await query('DELETE FROM email_templates WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template',
            error: error.message
        });
    }
});

// POST /api/v2/email-templates/:id/preview - Preview template with sample data
router.post('/:id/preview', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, userId } = req.body;  // Support both user_id and userId
        const actualUserId = user_id || userId;

        // Get template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [id]);
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        const template = templates[0];
        let userData = {};

        // If user_id provided, get actual user data
        if (actualUserId) {
            const users = await query(`
                SELECT u.*, o.name as owner_name
                FROM users u
                LEFT JOIN owners o ON u.owner_id = o.id
                WHERE u.id = ?
            `, [actualUserId]);

            if (users.length > 0) {
                userData = users[0];
            }
        }

        // Get system settings for preview
        const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
        const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

        const portalUrlResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'portal_url'`);
        const portalUrl = portalUrlResult.length > 0 ? portalUrlResult[0].setting_value : '';

        const editorDnsResult = await query(`SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'`);
        const iptvEditorDns = editorDnsResult.length > 0 ? editorDnsResult[0].setting_value : '';

        // Get IPTV provider base URL, dynamic DNS, and credentials if user provided
        let iptvProviderBaseUrl = '';
        let iptvDns = ''; // Dynamic DNS: Editor DNS if has Editor, else Panel DNS
        let iptvPanelDns = ''; // Panel DNS specifically
        let hasIptvEditor = false;

        // Dynamic credentials - uses Editor credentials if has Editor, else Panel credentials
        let iptvCredsUsername = '';
        let iptvCredsPassword = '';
        let iptvEditorUsername = '';
        let iptvEditorPassword = '';
        let iptvPanelUsername = '';
        let iptvPanelPassword = '';

        if (actualUserId) {
            // First try IPTV Editor - get playlist info AND credentials
            const editorResult = await query(`
                SELECT ieu.iptv_editor_username, ieu.iptv_editor_password, iep.provider_base_url
                FROM iptv_editor_users ieu
                JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                WHERE ieu.user_id = ?
                LIMIT 1
            `, [actualUserId]);
            if (editorResult.length > 0) {
                if (editorResult[0].provider_base_url) {
                    iptvProviderBaseUrl = editorResult[0].provider_base_url;
                }
                iptvEditorUsername = editorResult[0].iptv_editor_username || '';
                iptvEditorPassword = editorResult[0].iptv_editor_password || '';
                hasIptvEditor = true;
            }

            // Also get IPTV Panel DNS and credentials
            const panelResult = await query(`
                SELECT ip.provider_base_url, uis.iptv_username, uis.iptv_password
                FROM user_iptv_subscriptions uis
                JOIN iptv_panels ip ON uis.iptv_panel_id = ip.id
                WHERE uis.user_id = ?
                LIMIT 1
            `, [actualUserId]);
            if (panelResult.length > 0) {
                iptvPanelDns = panelResult[0].provider_base_url || '';
                iptvPanelUsername = panelResult[0].iptv_username || '';
                iptvPanelPassword = panelResult[0].iptv_password || '';
                // If no Editor provider URL, use Panel
                if (!iptvProviderBaseUrl) {
                    iptvProviderBaseUrl = panelResult[0].provider_base_url || '';
                }
            }

            // Dynamic IPTV DNS: Use Editor DNS if user has Editor, otherwise use Panel DNS
            iptvDns = hasIptvEditor ? iptvEditorDns : iptvPanelDns;

            // Dynamic credentials: Use Editor if has Editor, else Panel
            iptvCredsUsername = hasIptvEditor ? iptvEditorUsername : iptvPanelUsername;
            iptvCredsPassword = hasIptvEditor ? iptvEditorPassword : iptvPanelPassword;
        }

        // Get IPTV Editor user data if available
        let editorUserData = {};
        if (actualUserId) {
            const editorUsers = await query(`
                SELECT ieu.*, iep.name as playlist_name
                FROM iptv_editor_users ieu
                LEFT JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                WHERE ieu.user_id = ?
                LIMIT 1
            `, [actualUserId]);
            if (editorUsers.length > 0) {
                editorUserData = editorUsers[0];
            }
        }

        // Format dates for display (handles timezone correctly)
        const formatDate = (dateStr) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                // If it's a date-only string (YYYY-MM-DD), parse it as local date
                if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    const date = new Date(year, month - 1, day); // month is 0-indexed
                    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                }
                const date = new Date(dateStr);
                // Use UTC methods to avoid timezone shift
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
            } catch {
                return dateStr;
            }
        };

        // Build full replacement map
        const customMessage = template.custom_message || '';
        const replacements = {
            // User variables
            '{{name}}': userData.name || 'User',
            '{{username}}': userData.username || '',
            '{{email}}': userData.email || '',
            '{{owner_name}}': userData.owner_name || 'Admin',

            // IPTV Panel variables
            '{{iptv_username}}': userData.iptv_username || '',
            '{{iptv_password}}': userData.iptv_password || '',
            '{{iptv_m3u_url}}': userData.iptv_m3u_url || '',
            '{{iptv_expiration_date}}': formatDate(userData.iptv_expiration || userData.iptv_expiration_date),
            '{{iptv_connections}}': userData.iptv_connections || '',
            '{{iptv_panel_name}}': userData.iptv_panel_name || '',

            // IPTV Editor variables
            '{{iptv_editor_dns}}': iptvEditorDns,
            '{{iptv_editor_username}}': editorUserData.iptv_editor_username || userData.iptv_editor_username || '',
            '{{iptv_editor_password}}': editorUserData.iptv_editor_password || userData.iptv_editor_password || '',
            '{{iptv_editor_m3u_url}}': userData.iptv_editor_m3u_url || '',
            '{{iptv_editor_epg_url}}': userData.iptv_editor_epg_url || '',
            '{{iptv_editor_expiration_date}}': formatDate(editorUserData.expiry_date || userData.iptv_expiration),
            '{{iptv_provider_base_url}}': iptvProviderBaseUrl,

            // Dynamic IPTV DNS (uses Editor DNS if user has Editor, else Panel DNS)
            '{{iptv_dns}}': iptvDns,
            '{{iptv_panel_dns}}': iptvPanelDns,

            // Dynamic IPTV credentials (uses Editor if has Editor, else Panel)
            '{{iptv_creds_username}}': iptvCredsUsername,
            '{{iptv_creds_password}}': iptvCredsPassword,

            // Plex variables
            '{{plex_email}}': userData.plex_email || userData.email || '',
            '{{plex_expiration_date}}': formatDate(userData.plex_expiration),
            '{{plex_server_name}}': '',
            '{{plex_request_site}}': '',
            '{{plex_libraries}}': '',

            // System variables
            '{{app_name}}': appName,
            '{{app_url}}': '',
            '{{portal_url}}': portalUrl,
            '{{current_date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            '{{current_year}}': new Date().getFullYear().toString(),

            // Custom message
            '{{custom_message}}': customMessage
        };

        // Process conditional blocks in body
        let processedBody = template.body;
        let processedSubject = template.subject;

        processedBody = processedBody.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
            const varKey = `{{${variable}}}`;
            const value = replacements[varKey];
            if (value && value.toString().trim() !== '' && value !== 'N/A') {
                return content;
            }
            return '';
        });

        // Replace all variables in body and subject
        for (const [placeholder, value] of Object.entries(replacements)) {
            const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
            processedBody = processedBody.replace(regex, value);
            processedSubject = processedSubject.replace(regex, value);
        }

        res.json({
            success: true,
            preview: {
                subject: processedSubject,
                body: processedBody,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${processedBody}</div>`
            },
            userData: userData
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate preview',
            error: error.message
        });
    }
});

// POST /api/v2/email-templates/:id/duplicate - Duplicate a template
router.post('/:id/duplicate', async (req, res) => {
    try {
        const { id } = req.params;

        // Get original template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [id]);
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        const original = templates[0];

        // Create duplicate with modified name
        const result = await query(`
            INSERT INTO email_templates (name, subject, body, template_type, category, owner_id, variables_used, custom_message, is_system)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `, [
            `${original.name} (Copy)`,
            original.subject,
            original.body,
            original.template_type || 'custom',
            original.category || 'custom',
            original.owner_id,
            original.variables_used,
            original.custom_message || ''
        ]);

        res.json({
            success: true,
            message: 'Template duplicated successfully',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error duplicating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to duplicate template',
            error: error.message
        });
    }
});

module.exports = router;
