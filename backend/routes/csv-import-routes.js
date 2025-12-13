/**
 * CSV Import API Routes
 *
 * Bulk user import from CSV files
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const db = require('../database-config');
const PlexServiceManager = require('../services/plex/PlexServiceManager');
const IPTVServiceManager = require('../services/iptv/IPTVServiceManager');

/**
 * Convert a Date object to YYYY-MM-DD format using local timezone
 */
function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Configure multer for file upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// Initialize service managers
let plexManager;
let iptvManager;

(async () => {
    try {
        plexManager = new PlexServiceManager(db);
        await plexManager.initialize();

        iptvManager = new IPTVServiceManager(db);
        await iptvManager.initialize();

        console.log('CSV Import: Service managers initialized');
    } catch (error) {
        console.error('CSV Import: Failed to initialize service managers:', error);
    }
})();

/**
 * CSV Format:
 * name,email,account_type,plex_enabled,plex_package_id,plex_email,plex_duration_months,iptv_enabled,iptv_panel_id,iptv_username,iptv_password,iptv_package_id,iptv_duration_months,iptv_is_trial,notes
 *
 * Example:
 * John Doe,john@example.com,standard,true,1,john@example.com,12,true,2,john123,pass123,34,12,false,VIP customer
 *
 * Note: IPTV Editor accounts NOT created via CSV - must be linked manually after import
 */

// POST /api/v2/csv-import - Import users from CSV
router.post('/', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No CSV file uploaded'
        });
    }

    const results = {
        total_rows: 0,
        successful: 0,
        failed: 0,
        errors: [],
        created_users: []
    };

    const rows = [];

    try {
        // Parse CSV from buffer
        const stream = Readable.from(req.file.buffer.toString());

        await new Promise((resolve, reject) => {
            stream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim().toLowerCase()
                }))
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        results.total_rows = rows.length;

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2; // +2 because row 1 is headers and arrays are 0-indexed

            try {
                // Validate required fields
                if (!row.name || !row.email) {
                    throw new Error('Missing required fields: name and email');
                }

                // Parse boolean values
                const plex_enabled = row.plex_enabled === 'true' || row.plex_enabled === '1';
                const iptv_enabled = row.iptv_enabled === 'true' || row.iptv_enabled === '1';
                const iptv_is_trial = row.iptv_is_trial === 'true' || row.iptv_is_trial === '1';

                // Parse numeric values
                const plex_package_id = row.plex_package_id ? parseInt(row.plex_package_id) : null;
                const plex_duration_months = row.plex_duration_months ? parseInt(row.plex_duration_months) : null;
                const iptv_panel_id = row.iptv_panel_id ? parseInt(row.iptv_panel_id) : null;
                const iptv_package_id = row.iptv_package_id ? parseInt(row.iptv_package_id) : null;
                const iptv_duration_months = row.iptv_duration_months ? parseInt(row.iptv_duration_months) : null;

                // Check for duplicate email
                const existingUsers = await db.query(
                    'SELECT id FROM users WHERE email = ?',
                    [row.email]
                );

                if (existingUsers.length > 0) {
                    throw new Error(`User with email ${row.email} already exists`);
                }

                // Calculate expiration dates using local timezone
                let plexExpirationDate = null;
                if (plex_enabled && plex_duration_months) {
                    const date = new Date();
                    date.setMonth(date.getMonth() + parseInt(plex_duration_months));
                    plexExpirationDate = toLocalDateString(date);
                }

                let iptvExpirationDate = null;
                if (iptv_enabled && iptv_duration_months) {
                    const date = new Date();
                    date.setMonth(date.getMonth() + parseInt(iptv_duration_months));
                    iptvExpirationDate = toLocalDateString(date);
                }

                // Insert user (convert booleans to 1/0 for SQLite)
                const userResult = await db.query(`
                    INSERT INTO users (
                        name, email, account_type, notes,
                        plex_enabled, plex_package_id, plex_email, plex_expiration_date,
                        iptv_enabled, iptv_panel_id, iptv_username, iptv_password,
                        iptv_package_id, iptv_expiration_date, iptv_editor_enabled,
                        is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
                `, [
                    row.name,
                    row.email,
                    row.account_type || 'standard',
                    row.notes || null,
                    plex_enabled ? 1 : 0,
                    plex_package_id,
                    row.plex_email || row.email,
                    plexExpirationDate,
                    iptv_enabled ? 1 : 0,
                    iptv_panel_id,
                    row.iptv_username || null,
                    row.iptv_password || null,
                    iptv_package_id,
                    iptvExpirationDate
                ]);

                const userId = userResult.insertId;

                const userResult_details = {
                    user_id: userId,
                    name: row.name,
                    email: row.email,
                    plex_created: false,
                    iptv_created: false
                };

                // Create Plex account if enabled
                if (plex_enabled && plex_package_id) {
                    try {
                        const plexResult = await plexManager.shareLibrariesByPackage(
                            row.plex_email || row.email,
                            plex_package_id,
                            userId
                        );

                        userResult_details.plex_created = plexResult.allSuccess;

                        if (!plexResult.allSuccess) {
                            console.warn(`Row ${rowNumber}: Plex sharing partially failed for ${row.email}`);
                        }
                    } catch (plexError) {
                        console.error(`Row ${rowNumber}: Plex error for ${row.email}:`, plexError);
                        userResult_details.plex_error = plexError.message;
                    }
                }

                // Create IPTV account if enabled
                if (iptv_enabled && iptv_panel_id && row.iptv_username && row.iptv_password) {
                    try {
                        // Get package data
                        const packageRows = await db.query(
                            'SELECT panel_package_id, package_name, credit_cost FROM iptv_packages WHERE id = ?',
                            [iptv_package_id]
                        );

                        if (packageRows.length === 0) {
                            throw new Error('IPTV package not found');
                        }

                        const packageData = packageRows[0];

                        // Parse bouquet IDs if provided in CSV (comma-separated)
                        const bouquetIds = row.iptv_bouquet_ids ?
                            row.iptv_bouquet_ids.split(',').map(id => parseInt(id.trim())) :
                            [];

                        const iptvResult = await iptvManager.createUserOnPanel(
                            iptv_panel_id,
                            row.iptv_username,
                            row.iptv_password,
                            packageData,
                            bouquetIds,
                            iptv_is_trial,
                            ''  // No notes for CSV import
                        );

                        // Update user with line details
                        await db.query(`
                            UPDATE users
                            SET iptv_line_id = ?, iptv_m3u_url = ?, iptv_epg_url = ?
                            WHERE id = ?
                        `, [
                            iptvResult.line_id,
                            iptvResult.m3u_url,
                            iptvResult.epg_url,
                            userId
                        ]);

                        userResult_details.iptv_created = true;
                        userResult_details.iptv_line_id = iptvResult.line_id;

                    } catch (iptvError) {
                        console.error(`Row ${rowNumber}: IPTV error for ${row.email}:`, iptvError);
                        userResult_details.iptv_error = iptvError.message;
                    }
                }

                results.successful++;
                results.created_users.push(userResult_details);

            } catch (rowError) {
                results.failed++;
                results.errors.push({
                    row: rowNumber,
                    email: row.email || 'N/A',
                    error: rowError.message
                });
                console.error(`Row ${rowNumber} error:`, rowError);
            }
        }

        res.json({
            success: true,
            message: `CSV import completed: ${results.successful} successful, ${results.failed} failed`,
            results
        });

    } catch (error) {
        console.error('CSV import error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process CSV file',
            error: error.message,
            results
        });
    }
});

// GET /api/v2/csv-import/template - Download CSV template
router.get('/template', (req, res) => {
    const csvTemplate = `name,email,account_type,plex_enabled,plex_package_id,plex_email,plex_duration_months,iptv_enabled,iptv_panel_id,iptv_username,iptv_password,iptv_package_id,iptv_duration_months,iptv_is_trial,iptv_bouquet_ids,notes
John Doe,john@example.com,standard,true,1,john@example.com,12,true,2,john123,pass123,34,12,false,"1,3,5",VIP customer
Jane Smith,jane@example.com,premium,true,2,,6,false,,,,,,,"Premium package"`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users_import_template.csv');
    res.send(csvTemplate);
});

// POST /api/v2/csv-import/validate - Validate CSV before import
router.post('/validate', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No CSV file uploaded'
        });
    }

    const validationResults = {
        total_rows: 0,
        valid_rows: 0,
        invalid_rows: 0,
        warnings: [],
        errors: []
    };

    const rows = [];

    try {
        // Parse CSV from buffer
        const stream = Readable.from(req.file.buffer.toString());

        await new Promise((resolve, reject) => {
            stream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim().toLowerCase()
                }))
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        validationResults.total_rows = rows.length;

        // Validate each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2;

            let isValid = true;

            // Check required fields
            if (!row.name || !row.email) {
                validationResults.errors.push({
                    row: rowNumber,
                    field: 'name/email',
                    error: 'Missing required fields'
                });
                isValid = false;
            }

            // Check email format
            if (row.email && !row.email.includes('@')) {
                validationResults.errors.push({
                    row: rowNumber,
                    field: 'email',
                    error: 'Invalid email format'
                });
                isValid = false;
            }

            // Check for duplicate email in database
            if (row.email) {
                const existing = await db.query(
                    'SELECT id FROM users WHERE email = ?',
                    [row.email]
                );

                if (existing.length > 0) {
                    validationResults.errors.push({
                        row: rowNumber,
                        field: 'email',
                        error: `Email already exists in database`
                    });
                    isValid = false;
                }
            }

            // Validate Plex configuration
            if (row.plex_enabled === 'true' || row.plex_enabled === '1') {
                if (!row.plex_package_id) {
                    validationResults.warnings.push({
                        row: rowNumber,
                        field: 'plex_package_id',
                        warning: 'Plex enabled but no package ID provided'
                    });
                }
            }

            // Validate IPTV configuration
            if (row.iptv_enabled === 'true' || row.iptv_enabled === '1') {
                if (!row.iptv_panel_id || !row.iptv_username || !row.iptv_password) {
                    validationResults.errors.push({
                        row: rowNumber,
                        field: 'iptv',
                        error: 'IPTV enabled but missing panel_id, username, or password'
                    });
                    isValid = false;
                }
            }

            if (isValid) {
                validationResults.valid_rows++;
            } else {
                validationResults.invalid_rows++;
            }
        }

        res.json({
            success: true,
            message: `Validation complete: ${validationResults.valid_rows} valid, ${validationResults.invalid_rows} invalid`,
            validation: validationResults,
            can_proceed: validationResults.invalid_rows === 0
        });

    } catch (error) {
        console.error('CSV validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate CSV file',
            error: error.message
        });
    }
});

module.exports = router;
