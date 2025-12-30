/**
 * Email Service
 *
 * Handles sending emails for authentication and notifications
 */

const nodemailer = require('nodemailer');
const { query } = require('../database-config');

/**
 * Extract base URL from Express request
 * Supports reverse proxy headers (X-Forwarded-Proto, X-Forwarded-Host)
 * @param {Object} req - Express request object
 * @returns {string} Base URL (e.g., "https://yourdomain.com" or "http://10.0.1.160:3051")
 */
function getBaseUrlFromRequest(req) {
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    console.log(`[Email Service] Extracting base URL from request: ${baseUrl}`);
    console.log(`[Email Service] Headers - Host: ${req.headers.host}, X-Forwarded-Host: ${req.headers['x-forwarded-host']}, X-Forwarded-Proto: ${req.headers['x-forwarded-proto']}, Secure: ${req.secure}`);
    return baseUrl;
}

/**
 * Get email configuration from settings
 */
async function getEmailConfig() {
    try {
        const settings = await query(`
            SELECT setting_key, setting_value
            FROM settings
            WHERE setting_key LIKE 'smtp_%' OR setting_key LIKE 'sender_%'
        `);

        const config = {};
        settings.forEach(s => {
            config[s.setting_key] = s.setting_value;
        });

        return config;
    } catch (error) {
        console.error('Failed to load email configuration:', error);
        throw new Error('Email configuration not available');
    }
}

/**
 * Create email transporter
 */
async function createTransporter() {
    const config = await getEmailConfig();

    if (!config.smtp_host || !config.smtp_port) {
        throw new Error('Email SMTP settings not configured');
    }

    const transportConfig = {
        host: config.smtp_host,
        port: parseInt(config.smtp_port),
        secure: config.smtp_secure === 'true' || config.smtp_secure === true, // use smtp_secure setting
    };

    // Add authentication if provided (check both smtp_user and smtp_username)
    const username = config.smtp_username || config.smtp_user;
    if (username && config.smtp_password) {
        transportConfig.auth = {
            user: username,
            pass: config.smtp_password
        };
    }

    return nodemailer.createTransport(transportConfig);
}

/**
 * Send welcome email with password setup link
 * @param {string} email - User's email address
 * @param {string} name - User's name
 * @param {string} token - Password reset token
 * @param {string} baseUrl - Optional base URL (from request)
 */
async function sendWelcomeEmail(email, name, token, baseUrl = null) {
    try {
        const config = await getEmailConfig();
        const transporter = await createTransporter();

        // Get app title from settings
        const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
        const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

        // Load custom welcome email subject and template if set
        let customSubject = null;
        let customTemplate = null;
        try {
            const [subjectResult, templateResult] = await Promise.all([
                query(`SELECT setting_value FROM settings WHERE setting_key = 'welcome_email_subject'`),
                query(`SELECT setting_value FROM settings WHERE setting_key = 'welcome_email_template'`)
            ]);
            if (subjectResult.length > 0 && subjectResult[0].setting_value && subjectResult[0].setting_value.trim()) {
                customSubject = subjectResult[0].setting_value;
                console.log('[Email Service] Using custom welcome email subject');
            }
            if (templateResult.length > 0 && templateResult[0].setting_value && templateResult[0].setting_value.trim()) {
                customTemplate = templateResult[0].setting_value;
                console.log('[Email Service] Using custom welcome email template');
            }
        } catch (templateError) {
            console.error('Error loading welcome email template settings:', templateError);
        }

        // Load app_url - prioritize the setting over request URL
        let appUrl = null;
        try {
            const appUrlResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_url'`);
            if (appUrlResult.length > 0 && appUrlResult[0].setting_value && appUrlResult[0].setting_value.trim()) {
                appUrl = appUrlResult[0].setting_value;
                console.log(`[Email Service] Using app_url from settings: ${appUrl}`);
            }
        } catch (e) {
            console.error('Error loading app_url setting:', e);
        }

        // Fall back to baseUrl from request, then config, then environment, then localhost
        if (!appUrl) {
            if (baseUrl) {
                appUrl = baseUrl;
                console.log(`[Email Service] Using baseUrl from request: ${appUrl}`);
            } else {
                const port = process.env.PORT || 3050;
                appUrl = config.base_url || process.env.BASE_URL || `http://localhost:${port}`;
                console.log(`[Email Service] Using fallback URL: ${appUrl}`);
            }
        }

        // Remove trailing slash if present
        appUrl = appUrl.replace(/\/$/, '');

        const setupUrl = `${appUrl}/setup-password?token=${token}&email=${encodeURIComponent(email)}`;
        console.log(`[Email Service] Generated setup URL: ${setupUrl}`);

        // Helper function to replace all placeholders
        const replacePlaceholders = (text) => {
            if (!text) return text;
            return text
                .replace(/\{\{app_name\}\}/g, appName)
                .replace(/\{\{app_url\}\}/g, appUrl)
                .replace(/\{\{name\}\}/g, name)
                .replace(/\{\{email\}\}/g, email)
                .replace(/\{\{setup_url\}\}/g, setupUrl);
        };

        // Default email template
        const defaultTemplate = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #333;">Welcome to {{app_name}}!</h2>
                <p>Hi {{name}},</p>
                <p>Your account has been created successfully. To get started, please set up your password by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{{setup_url}}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Set Up Password</a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">{{setup_url}}</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours for security reasons.</p>
                <p style="color: #999; font-size: 12px;">If you didn't request this account, please ignore this email.</p>
            </div>
        `;

        // Use custom template if set, otherwise use default
        const templateToUse = customTemplate || defaultTemplate;
        const emailHtml = replacePlaceholders(templateToUse);

        // Use custom subject if set, otherwise use default
        const defaultSubject = `Welcome to ${appName} - Set Up Your Password`;
        const emailSubject = customSubject ? replacePlaceholders(customSubject) : defaultSubject;

        const mailOptions = {
            from: config.smtp_from || config.sender_email || 'noreply@subsapp.local',
            to: email,
            subject: emailSubject,
            html: emailHtml
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Welcome email sent to ${email}${customTemplate ? ' (custom template)' : ' (default template)'}`);
        return true;
    } catch (error) {
        console.error('Failed to send welcome email:', error);
        throw error;
    }
}

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} name - User's name
 * @param {string} token - Password reset token
 * @param {string} baseUrl - Optional base URL (from request)
 */
async function sendPasswordResetEmail(email, name, token, baseUrl = null) {
    try {
        const config = await getEmailConfig();
        const transporter = await createTransporter();

        // Get app title from settings
        const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
        const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

        // Use provided baseUrl, or fall back to config, then environment
        if (!baseUrl) {
            const port = process.env.PORT || 3050;
            baseUrl = config.base_url || process.env.BASE_URL || `http://localhost:${port}`;
            console.log(`[Email Service] No baseUrl provided, using fallback: ${baseUrl}`);
        } else {
            console.log(`[Email Service] Using provided baseUrl: ${baseUrl}`);
        }
        const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
        console.log(`[Email Service] Generated reset URL: ${resetUrl}`);

        const mailOptions = {
            from: config.smtp_from || config.sender_email || 'noreply@subsapp.local',
            to: email,
            subject: `${appName} - Password Reset Request`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>Hi ${name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
                    </div>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #666;">${resetUrl}</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 1 hour for security reasons.</p>
                    <p style="color: #999; font-size: 12px;">If you didn't request this password reset, please ignore this email or contact support if you're concerned.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Password reset email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Failed to send password reset email:', error);
        throw error;
    }
}

/**
 * Test email configuration
 */
async function testEmailConfig() {
    try {
        const transporter = await createTransporter();
        await transporter.verify();
        console.log('✅ Email configuration is valid');
        return true;
    } catch (error) {
        console.error('❌ Email configuration test failed:', error.message);
        return false;
    }
}

/**
 * Send a generic email
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body (optional)
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @param {string} [options.replyTo] - Reply-To address
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(options) {
    try {
        const config = await getEmailConfig();
        const transporter = await createTransporter();

        const mailOptions = {
            from: config.smtp_from || config.sender_email || 'noreply@subsapp.local',
            to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
            subject: options.subject,
            html: options.html
        };

        if (options.text) {
            mailOptions.text = options.text;
        }

        if (options.cc) {
            mailOptions.cc = Array.isArray(options.cc) ? options.cc.join(', ') : options.cc;
        }

        if (options.bcc) {
            mailOptions.bcc = Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc;
        }

        if (options.replyTo) {
            mailOptions.replyTo = options.replyTo;
        }

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${mailOptions.to} - Message ID: ${result.messageId}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email using a template
 * @param {Object} options - Email options
 * @param {number} options.templateId - Template ID
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {Object} [options.userData] - User data for template variables
 * @param {string} [options.customMessage] - Custom message to include
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendTemplateEmail(options) {
    try {
        // Get template
        const templates = await query('SELECT * FROM email_templates WHERE id = ?', [options.templateId]);
        if (templates.length === 0) {
            return { success: false, error: 'Template not found' };
        }

        const template = templates[0];
        const userData = options.userData || {};

        // Get app settings for placeholders
        const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
        const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

        const appUrlResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_url'`);
        const appUrl = appUrlResult.length > 0 ? appUrlResult[0].setting_value : '';

        // portal_url defaults to app_url if not separately configured
        const portalUrlResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'portal_url'`);
        const portalUrl = (portalUrlResult.length > 0 && portalUrlResult[0].setting_value) ? portalUrlResult[0].setting_value : appUrl;

        // Get IPTV Editor DNS from iptv_editor_settings
        const editorDnsResult = await query(`SELECT setting_value FROM iptv_editor_settings WHERE setting_key = 'editor_dns'`);
        const iptvEditorDns = editorDnsResult.length > 0 ? editorDnsResult[0].setting_value : '';

        // Get IPTV Provider Base URL (streaming URL for customers)
        // Also determine dynamic IPTV DNS - uses Editor DNS if user has Editor, else Panel DNS
        // And fetch IPTV credentials for dynamic credential variables
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

        if (userData.id) {
            // First try IPTV Editor - get playlist info AND credentials
            const editorResult = await query(`
                SELECT ieu.iptv_editor_username, ieu.iptv_editor_password, iep.provider_base_url
                FROM iptv_editor_users ieu
                JOIN iptv_editor_playlists iep ON ieu.iptv_editor_playlist_id = iep.id
                WHERE ieu.user_id = ?
                LIMIT 1
            `, [userData.id]);
            if (editorResult.length > 0) {
                if (editorResult[0].provider_base_url) {
                    iptvProviderBaseUrl = editorResult[0].provider_base_url;
                }
                iptvEditorUsername = editorResult[0].iptv_editor_username || '';
                iptvEditorPassword = editorResult[0].iptv_editor_password || '';
                hasIptvEditor = true;
            }

            // Also get IPTV Panel DNS and credentials from users table
            const panelResult = await query(`
                SELECT ip.provider_base_url, u.iptv_username, u.iptv_password
                FROM users u
                JOIN iptv_panels ip ON u.iptv_panel_id = ip.id
                WHERE u.id = ?
                LIMIT 1
            `, [userData.id]);
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

        // Get Plex request site URL if user has plex server assignments
        let plexRequestSite = '';
        let plexServerName = '';
        if (userData.id) {
            const plexServerResult = await query(`
                SELECT ps.name, ps.request_site_url
                FROM user_plex_shares ups
                JOIN plex_servers ps ON ups.plex_server_id = ps.id
                WHERE ups.user_id = ?
                LIMIT 1
            `, [userData.id]);
            if (plexServerResult.length > 0) {
                plexServerName = plexServerResult[0].name || '';
                plexRequestSite = plexServerResult[0].request_site_url || '';
            }
        }

        // Get payment options based on user's payment preference
        // Build both individual links (for backwards compatibility) and dynamic HTML
        let paypalLink = '';
        let venmoLink = '';
        let cashappLink = '';
        let applepayLink = '';
        let paymentOptions = []; // Array of {name, url, color} for dynamic rendering

        // Color mapping for payment providers
        const paymentColors = {
            'paypal': '#0070ba',
            'venmo': '#3d95ce',
            'cashapp': '#00d632',
            'cash app': '#00d632',
            'apple': '#000000',
            'applepay': '#000000',
            'zelle': '#6d1ed4',
            'stripe': '#635bff',
            'square': '#3e4348'
        };

        const getPaymentColor = (name) => {
            const nameLower = name.toLowerCase();
            for (const [key, color] of Object.entries(paymentColors)) {
                if (nameLower.includes(key)) return color;
            }
            return '#667eea'; // Default purple
        };

        if (userData.id) {
            const preference = userData.payment_preference || 'global';

            if (preference === 'owner' && userData.owner_id) {
                // Get payment links from owner (app_user)
                const ownerResult = await query(`
                    SELECT venmo_username, paypal_username, cashapp_username,
                           google_pay_username, apple_cash_username
                    FROM users WHERE id = ? AND is_app_user = 1
                `, [userData.owner_id]);
                if (ownerResult.length > 0) {
                    const owner = ownerResult[0];
                    if (owner.paypal_username) {
                        paypalLink = `https://paypal.me/${owner.paypal_username}`;
                        paymentOptions.push({ name: 'PayPal', url: paypalLink, color: '#0070ba' });
                    }
                    if (owner.venmo_username) {
                        venmoLink = `https://venmo.com/u/${owner.venmo_username}`;
                        paymentOptions.push({ name: 'Venmo', url: venmoLink, color: '#3d95ce' });
                    }
                    if (owner.cashapp_username) {
                        cashappLink = `https://cash.app/${owner.cashapp_username}`;
                        paymentOptions.push({ name: 'CashApp', url: cashappLink, color: '#00d632' });
                    }
                    if (owner.apple_cash_username) {
                        // Format as sms: link for Apple Cash (opens iMessage for Apple Pay)
                        const acVal = owner.apple_cash_username;
                        // Clean phone number - remove non-digits except +
                        const cleanPhone = acVal.replace(/[^\d+]/g, '');
                        applepayLink = cleanPhone ? `sms:${cleanPhone}` : acVal;
                        paymentOptions.push({ name: 'Apple Cash', url: applepayLink, color: '#000000' });
                    }
                }
            } else {
                // Get global payment providers
                const providers = await query(`
                    SELECT name, payment_url FROM payment_providers
                    WHERE is_active = 1 ORDER BY display_order
                `);
                for (const p of providers) {
                    const nameLower = p.name.toLowerCase();
                    // Add to payment options array
                    paymentOptions.push({
                        name: p.name,
                        url: p.payment_url,
                        color: getPaymentColor(p.name)
                    });
                    // Also set individual variables for backwards compatibility
                    if (nameLower.includes('paypal') && !paypalLink) paypalLink = p.payment_url;
                    else if (nameLower.includes('venmo') && !venmoLink) venmoLink = p.payment_url;
                    else if (nameLower.includes('cashapp') || nameLower.includes('cash app') && !cashappLink) cashappLink = p.payment_url;
                    else if (nameLower.includes('apple') && !applepayLink) applepayLink = p.payment_url;
                }
            }
        }

        // Build dynamic payment buttons HTML
        let paymentButtonsHtml = '';
        for (const opt of paymentOptions) {
            paymentButtonsHtml += `<a href="${opt.url}" style="display: inline-block; background: ${opt.color}; color: white; padding: 8px 16px; text-decoration: none; font-size: 12px; font-weight: 600; border-radius: 6px; margin: 3px;">${opt.name}</a>`;
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

        // Get custom message - priority: options > template > empty
        const customMessage = options.customMessage || template.custom_message || '';

        // Build replacement map for template variables
        const replacements = {
            // User variables
            '{{name}}': userData.name || 'User',
            '{{username}}': userData.username || '',
            '{{email}}': userData.email || '',
            '{{owner_name}}': userData.owner_name || 'Admin',

            // IPTV Panel variables
            '{{iptv_username}}': iptvPanelUsername || userData.iptv_username || '',
            '{{iptv_password}}': iptvPanelPassword || userData.iptv_password || '',
            '{{iptv_m3u_url}}': userData.iptv_m3u_url || '',
            '{{iptv_expiration_date}}': formatDate(userData.iptv_expiration_date),
            '{{iptv_connections}}': userData.iptv_connections || userData.iptv_subscription_connections || '',
            '{{iptv_panel_name}}': userData.iptv_panel_name || '',

            // IPTV Editor variables
            '{{iptv_editor_dns}}': iptvEditorDns,
            '{{iptv_editor_username}}': iptvEditorUsername || userData.iptv_editor_username || '',
            '{{iptv_editor_password}}': iptvEditorPassword || userData.iptv_editor_password || '',
            '{{iptv_editor_m3u_url}}': userData.iptv_editor_m3u_url || '',
            '{{iptv_editor_epg_url}}': userData.iptv_editor_epg_url || '',
            '{{iptv_editor_expiration_date}}': formatDate(userData.iptv_editor_expiration_date || userData.iptv_expiration_date),

            // IPTV Provider Base URL (streaming URL for customers)
            '{{iptv_provider_base_url}}': iptvProviderBaseUrl,

            // Dynamic IPTV DNS (uses Editor DNS if user has Editor, else Panel DNS)
            '{{iptv_dns}}': iptvDns,
            '{{iptv_panel_dns}}': iptvPanelDns,

            // Dynamic IPTV credentials (uses Editor if has Editor, else Panel)
            '{{iptv_creds_username}}': iptvCredsUsername,
            '{{iptv_creds_password}}': iptvCredsPassword,

            // Dot notation aliases (for UI compatibility)
            '{{iptv.username}}': iptvCredsUsername,
            '{{iptv.password}}': iptvCredsPassword,
            '{{iptv.dns}}': iptvDns,
            '{{iptv.expiration}}': formatDate(userData.iptv_expiration_date),
            '{{iptv.connections}}': userData.iptv_connections || userData.iptv_subscription_connections || '',
            '{{iptv.panel_name}}': userData.iptv_panel_name || '',

            // Plex variables
            '{{plex_email}}': userData.plex_email || userData.email || '',
            '{{plex_expiration_date}}': formatDate(userData.plex_expiration_date),
            '{{plex_server_name}}': plexServerName || userData.plex_server_name || '',
            '{{plex_request_site}}': plexRequestSite || userData.plex_request_site || '',
            '{{plex_libraries}}': userData.plex_libraries || '',

            // System variables
            '{{app_name}}': appName,
            '{{app_url}}': appUrl,
            '{{portal_url}}': portalUrl,
            '{{current_date}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            '{{current_year}}': new Date().getFullYear().toString(),

            // Custom message
            '{{custom_message}}': customMessage,

            // Payment links (individual for backwards compatibility)
            '{{paypal_link}}': paypalLink,
            '{{venmo_link}}': venmoLink,
            '{{cashapp_link}}': cashappLink,
            '{{applepay_link}}': applepayLink,
            // Dynamic payment buttons (renders all available payment options)
            '{{payment_buttons_html}}': paymentButtonsHtml,

            // Renewal cost (placeholder - can be set via custom_message for now)
            '{{iptv_renewal_cost}}': '',

            // Legacy/compatibility
            '{{subscription_end}}': formatDate(userData.subscription_end || userData.plex_expiration_date || userData.iptv_expiration_date),
            '{{subscription_plan_name}}': userData.subscription_plan_name || 'N/A'
        };

        // Replace placeholders in subject and body
        let subject = template.subject;
        let body = template.body;

        // Handle conditional blocks: {{#if variable}}...{{/if}}
        // This is a simple implementation - removes block if variable is empty
        body = body.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
            const varKey = `{{${variable}}}`;
            const value = replacements[varKey];
            // Show content only if value exists and is not empty
            if (value && value.toString().trim() !== '' && value !== 'N/A') {
                return content;
            }
            return '';
        });

        // Replace all simple placeholders
        for (const [placeholder, value] of Object.entries(replacements)) {
            const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
            subject = subject.replace(regex, value);
            body = body.replace(regex, value);
        }

        // Wrap body in basic HTML structure if not already wrapped
        let htmlBody = body;
        if (!body.toLowerCase().includes('<html') && !body.toLowerCase().includes('<!doctype')) {
            htmlBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${body}</div>`;
        }

        return await sendEmail({
            to: options.to,
            subject: subject,
            html: htmlBody,
            cc: options.cc,
            bcc: options.bcc
        });
    } catch (error) {
        console.error('Failed to send template email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send IPTV login credentials email
 * @param {string} email - User's email address
 * @param {string} name - User's name
 * @param {string} iptvUsername - IPTV username
 * @param {string} iptvPassword - IPTV password
 * @param {string} editorUsername - IPTV Editor username (optional)
 * @param {string} editorPassword - IPTV Editor password (optional)
 * @param {boolean} hasPlexAccess - Whether user has Plex access (optional)
 */
async function sendIPTVCredentialsEmail(email, name, iptvUsername, iptvPassword, editorUsername, editorPassword, hasPlexAccess = false) {
    try {
        const config = await getEmailConfig();
        const transporter = await createTransporter();

        // Get app title from settings
        const appTitleResult = await query(`SELECT setting_value FROM settings WHERE setting_key = 'app_title'`);
        const appName = appTitleResult.length > 0 ? appTitleResult[0].setting_value : 'StreamPanel';

        // Prioritize IPTV Editor credentials if available, otherwise use regular IPTV credentials
        let username, password;
        if (editorUsername && editorPassword) {
            username = editorUsername;
            password = editorPassword;
        } else {
            username = iptvUsername;
            password = iptvPassword;
        }

        // Build credentials HTML
        const credentialsHtml = `
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Your Login Credentials</h3>
                <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
            </div>
        `;

        // Plex login note if user has Plex access
        const plexNote = hasPlexAccess ? `
            <p style="color: #666; font-size: 13px; margin-top: 20px; padding: 12px; background-color: #fff3cd; border-radius: 6px; border-left: 4px solid #e5a00d;">
                <strong>Tip:</strong> You can also sign in using the "Login with Plex" option on the login page if you prefer.
            </p>
        ` : '';

        const mailOptions = {
            from: config.smtp_from || config.sender_email || 'noreply@subsapp.local',
            to: email,
            subject: `${appName} - Your Login Credentials`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #333;">Your Login Credentials</h2>
                    <p>Hi ${name},</p>
                    <p>You requested your login credentials. Here they are:</p>
                    ${credentialsHtml}
                    ${plexNote}
                    <p style="color: #666; font-size: 13px; margin-top: 20px;">
                        Please keep these credentials safe and do not share them with anyone.
                    </p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">
                        If you did not request this email, please contact support immediately.
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[Email Service] IPTV credentials email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Failed to send IPTV credentials email:', error);
        throw error;
    }
}

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    testEmailConfig,
    getEmailConfig,
    getBaseUrlFromRequest,
    createTransporter,
    sendEmail,
    sendTemplateEmail,
    sendIPTVCredentialsEmail
};
