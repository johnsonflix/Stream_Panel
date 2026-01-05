/**
 * Settings API Routes
 *
 * Global application settings management (key-value store)
 */

const express = require('express');
const router = express.Router();
const db = require('../database-config');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { requireAuth } = require('../middleware/auth-middleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads/branding');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const fileType = req.body.fileType || 'logo'; // 'logo' or 'favicon'
        const ext = path.extname(file.originalname);
        cb(null, `${fileType}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|ico/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, ico)'));
        }
    }
});

// GET /api/v2/settings/:key - Get a specific setting
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;

        const settings = await db.query(
            'SELECT * FROM settings WHERE setting_key = ?',
            [key]
        );

        if (settings.length === 0) {
            // Return default value for known settings
            let defaultValue = null;

            if (key === 'iptv_editor_create_by_default') {
                defaultValue = 'false';
            }

            return res.json({
                success: true,
                key,
                value: defaultValue,
                type: 'boolean'
            });
        }

        const setting = settings[0];

        res.json({
            success: true,
            key: setting.setting_key,
            value: setting.setting_value,
            type: setting.setting_type,
            description: setting.description
        });

    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch setting',
            error: error.message
        });
    }
});

// PUT /api/v2/settings/:key - Update or create a setting
router.put('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value, type, description } = req.body;

        if (value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Setting value is required'
            });
        }

        // Check if setting exists
        const existing = await db.query(
            'SELECT id FROM settings WHERE setting_key = ?',
            [key]
        );

        if (existing.length > 0) {
            // Update existing setting
            await db.query(`
                UPDATE settings
                SET setting_value = ?,
                    setting_type = COALESCE(?, setting_type),
                    description = COALESCE(?, description)
                WHERE setting_key = ?
            `, [value, type, description, key]);
        } else {
            // Create new setting
            await db.query(`
                INSERT INTO settings (setting_key, setting_value, setting_type, description)
                VALUES (?, ?, ?, ?)
            `, [key, value, type || 'string', description || null]);
        }

        res.json({
            success: true,
            message: 'Setting updated successfully',
            key,
            value
        });

    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update setting',
            error: error.message
        });
    }
});

// GET /api/v2/settings - Get all settings
router.get('/', async (req, res) => {
    try {
        const settings = await db.query('SELECT * FROM settings ORDER BY setting_key');

        const settingsObject = {};
        settings.forEach(setting => {
            settingsObject[setting.setting_key] = {
                value: setting.setting_value,
                type: setting.setting_type,
                description: setting.description
            };
        });

        res.json({
            success: true,
            settings: settingsObject,
            count: settings.length
        });

    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings',
            error: error.message
        });
    }
});

// POST /api/v2/settings/upload-branding - Upload logo or favicon
router.post('/upload-branding', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileType = req.body.fileType || 'logo'; // 'logo', 'logo-dark', or 'favicon'
        const filePath = `/uploads/branding/${req.file.filename}`;

        // Update the corresponding setting in the database
        let settingKey;
        if (fileType === 'logo') {
            settingKey = 'app_logo';
        } else if (fileType === 'logo-dark') {
            settingKey = 'app_logo_dark';
        } else if (fileType === 'favicon-dark') {
            settingKey = 'app_favicon_dark';
        } else {
            settingKey = 'app_favicon';
        }

        // Check if setting exists
        const existing = await db.query(
            'SELECT id, setting_value FROM settings WHERE setting_key = ?',
            [settingKey]
        );

        // Delete old file if it exists
        if (existing.length > 0 && existing[0].setting_value) {
            const oldFilePath = path.join(__dirname, '..', existing[0].setting_value);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
        }

        if (existing.length > 0) {
            // Update existing setting
            await db.query(
                'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
                [filePath, settingKey]
            );
        } else {
            // Create new setting
            await db.query(
                'INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
                [settingKey, filePath, 'string', `Path to application ${fileType}`]
            );
        }

        res.json({
            success: true,
            message: `${fileType} uploaded successfully`,
            filePath,
            settingKey
        });

    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
            error: error.message
        });
    }
});

// POST /api/v2/settings/test-email - Send test email
router.post('/test-email', requireAuth, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Get SMTP settings from database
        const smtpSettings = await db.query(`
            SELECT setting_key, setting_value
            FROM settings
            WHERE setting_key IN ('smtp_host', 'smtp_port', 'smtp_secure', 'smtp_username', 'smtp_password', 'sender_name', 'sender_email')
        `);

        // Convert array to object
        const settings = {};
        smtpSettings.forEach(setting => {
            settings[setting.setting_key] = setting.setting_value;
        });

        // Validate required settings
        if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
            return res.status(400).json({
                success: false,
                message: 'SMTP settings are not configured. Please configure email server settings first.'
            });
        }

        // Configure transporter
        const transportConfig = {
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port) || 587,
            secure: settings.smtp_secure === 'ssl',
            auth: {
                user: settings.smtp_username,
                pass: settings.smtp_password
            }
        };

        // For TLS, add additional options
        if (settings.smtp_secure === 'tls') {
            transportConfig.requireTLS = true;
        }

        const transporter = nodemailer.createTransport(transportConfig);

        // Send test email
        const info = await transporter.sendMail({
            from: `"${settings.sender_name || 'System'}" <${settings.sender_email || settings.smtp_username}>`,
            to: email,
            subject: 'Test Email - Email Configuration Successful',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2c3e50;">Email Configuration Test</h2>
                    <p>This is a test email to verify that your email server configuration is working correctly.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>SMTP Host:</strong> ${settings.smtp_host}</p>
                        <p style="margin: 5px 0;"><strong>SMTP Port:</strong> ${settings.smtp_port}</p>
                        <p style="margin: 5px 0;"><strong>Security:</strong> ${settings.smtp_secure?.toUpperCase() || 'None'}</p>
                        <p style="margin: 5px 0;"><strong>Username:</strong> ${settings.smtp_username}</p>
                    </div>
                    <p style="color: #27ae60; font-weight: bold;">✓ Your email configuration is working correctly!</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="font-size: 12px; color: #7f8c8d;">
                        This is an automated test email. If you did not request this test, please contact your system administrator.
                    </p>
                </div>
            `,
            text: `
Email Configuration Test

This is a test email to verify that your email server configuration is working correctly.

Configuration Details:
- SMTP Host: ${settings.smtp_host}
- SMTP Port: ${settings.smtp_port}
- Security: ${settings.smtp_secure?.toUpperCase() || 'None'}
- Username: ${settings.smtp_username}

✓ Your email configuration is working correctly!

This is an automated test email. If you did not request this test, please contact your system administrator.
            `
        });

        console.log('Test email sent:', info.messageId);

        res.json({
            success: true,
            message: `Test email sent successfully to ${email}`,
            messageId: info.messageId
        });

    } catch (error) {
        console.error('Error sending test email:', error);

        // Provide more specific error messages
        let errorMessage = 'Failed to send test email';
        if (error.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Please check your SMTP username and password.';
        } else if (error.code === 'ESOCKET') {
            errorMessage = 'Connection failed. Please check your SMTP host and port.';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Connection timed out. Please check your SMTP host and port.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.code || 'UNKNOWN'
        });
    }
});

module.exports = router;
