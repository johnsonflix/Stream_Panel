/**
 * Migration: Add authentication fields to owners table
 *
 * Adds password, password reset functionality, and first-time login tracking
 */

require('dotenv').config();
const db = require('../database-config');

async function migrate() {
    try {
        console.log('📂 Starting authentication fields migration...');

        // Check if password column exists
        const passwordColumn = db.db.prepare(`
            SELECT COUNT(*) as count
            FROM pragma_table_info('owners')
            WHERE name = 'password'
        `).get();

        if (passwordColumn.count === 0) {
            console.log('🔄 Adding password column...');
            db.db.exec(`
                ALTER TABLE owners
                ADD COLUMN password TEXT DEFAULT NULL
            `);
            console.log('✅ Added password column');
        } else {
            console.log('ℹ️ password column already exists');
        }

        // Check if password_reset_token column exists
        const tokenColumn = db.db.prepare(`
            SELECT COUNT(*) as count
            FROM pragma_table_info('owners')
            WHERE name = 'password_reset_token'
        `).get();

        if (tokenColumn.count === 0) {
            console.log('🔄 Adding password_reset_token column...');
            db.db.exec(`
                ALTER TABLE owners
                ADD COLUMN password_reset_token TEXT DEFAULT NULL
            `);
            console.log('✅ Added password_reset_token column');
        } else {
            console.log('ℹ️ password_reset_token column already exists');
        }

        // Check if password_reset_expires column exists
        const expiresColumn = db.db.prepare(`
            SELECT COUNT(*) as count
            FROM pragma_table_info('owners')
            WHERE name = 'password_reset_expires'
        `).get();

        if (expiresColumn.count === 0) {
            console.log('🔄 Adding password_reset_expires column...');
            db.db.exec(`
                ALTER TABLE owners
                ADD COLUMN password_reset_expires DATETIME DEFAULT NULL
            `);
            console.log('✅ Added password_reset_expires column');
        } else {
            console.log('ℹ️ password_reset_expires column already exists');
        }

        // Check if is_first_login column exists
        const firstLoginColumn = db.db.prepare(`
            SELECT COUNT(*) as count
            FROM pragma_table_info('owners')
            WHERE name = 'is_first_login'
        `).get();

        if (firstLoginColumn.count === 0) {
            console.log('🔄 Adding is_first_login column...');
            db.db.exec(`
                ALTER TABLE owners
                ADD COLUMN is_first_login INTEGER DEFAULT 1
            `);
            console.log('✅ Added is_first_login column');
        } else {
            console.log('ℹ️ is_first_login column already exists');
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
