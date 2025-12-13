/**
 * Migration: Add User Payment Preference
 *
 * Adds payment_preference and custom_payment_methods columns to users table
 * - payment_preference: 'global' (default), 'owner', or 'custom'
 * - custom_payment_methods: JSON array of payment provider IDs when preference is 'custom'
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding user payment preference columns...');

    try {
        // Check existing columns
        const tableInfo = db.pragma('table_info(users)');
        const existingColumns = tableInfo.map(col => col.name);

        // Add payment_preference column if it doesn't exist
        if (!existingColumns.includes('payment_preference')) {
            db.exec(`
                ALTER TABLE users
                ADD COLUMN payment_preference TEXT DEFAULT 'global'
            `);
            console.log('  Added payment_preference column');
        } else {
            console.log('  payment_preference column already exists');
        }

        // Add custom_payment_methods column if it doesn't exist
        if (!existingColumns.includes('custom_payment_methods')) {
            db.exec(`
                ALTER TABLE users
                ADD COLUMN custom_payment_methods TEXT DEFAULT '[]'
            `);
            console.log('  Added custom_payment_methods column');
        } else {
            console.log('  custom_payment_methods column already exists');
        }

        db.close();

        console.log('');
        console.log('Migration completed successfully!');
        console.log('');
        console.log('Summary:');
        console.log('  - payment_preference: global, owner, or custom');
        console.log('  - custom_payment_methods: JSON array of provider IDs');
        console.log('');

    } catch (error) {
        console.error('Migration failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
