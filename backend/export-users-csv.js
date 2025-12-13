/**
 * Export Users to CSV
 *
 * Standalone script to export all users from the SQLite database to CSV format.
 *
 * Usage: node export-users-csv.js [output-file]
 * Default output: ./users_export.csv
 */

const fs = require('fs');
const path = require('path');
const { query } = require('./database-config');

async function exportUsersToCSV(outputPath) {
    console.log('Starting user export...');

    try {
        // Get all users with related data
        const users = await query(`
            SELECT
                u.id,
                u.name,
                u.username,
                u.email,
                u.plex_email,
                u.plex_enabled,
                u.plex_expiration_date,
                u.iptv_enabled,
                u.iptv_expiration_date,
                u.iptv_username,
                u.is_active,
                u.is_admin,
                u.is_app_user,
                u.created_at,
                u.updated_at,
                o.name as owner_name,
                pp.name as plex_package_name,
                sp.name as iptv_plan_name
            FROM users u
            LEFT JOIN owners o ON u.owner_id = o.id
            LEFT JOIN plex_packages pp ON u.plex_package_id = pp.id
            LEFT JOIN subscription_plans sp ON u.iptv_subscription_plan_id = sp.id
            ORDER BY u.name
        `);

        console.log(`Found ${users.length} users`);

        if (users.length === 0) {
            console.log('No users to export');
            return;
        }

        // Define CSV columns
        const columns = [
            'id',
            'name',
            'username',
            'email',
            'plex_email',
            'plex_enabled',
            'plex_expiration_date',
            'plex_package_name',
            'iptv_enabled',
            'iptv_expiration_date',
            'iptv_username',
            'iptv_plan_name',
            'is_active',
            'is_admin',
            'is_app_user',
            'owner_name',
            'created_at',
            'updated_at'
        ];

        // Create CSV header
        let csv = columns.join(',') + '\n';

        // Add data rows
        for (const user of users) {
            const row = columns.map(col => {
                let value = user[col];

                // Handle null/undefined
                if (value === null || value === undefined) {
                    value = '';
                }

                // Convert booleans/numbers
                if (typeof value === 'boolean') {
                    value = value ? '1' : '0';
                } else if (typeof value === 'number') {
                    value = String(value);
                } else {
                    value = String(value);
                }

                // Escape quotes and wrap in quotes if contains comma, quote, or newline
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = '"' + value.replace(/"/g, '""') + '"';
                }

                return value;
            });

            csv += row.join(',') + '\n';
        }

        // Write to file
        fs.writeFileSync(outputPath, csv, 'utf8');
        console.log(`CSV exported successfully to: ${outputPath}`);
        console.log(`Total users exported: ${users.length}`);

    } catch (error) {
        console.error('Export failed:', error.message);
        throw error;
    }
}

// Get output path from command line or use default
const outputPath = process.argv[2] || path.join(__dirname, 'users_export.csv');

exportUsersToCSV(outputPath)
    .then(() => {
        console.log('Export complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
