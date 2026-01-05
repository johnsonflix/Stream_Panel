/**
 * Migration: Create Payment Providers System
 *
 * Creates payment providers table for storing payment methods
 * with name, URL, and QR code support
 */

const db = require('../database-config');

async function migrate() {
    console.log('🔄 Creating payment providers system...');

    try {
        await db.query('BEGIN TRANSACTION');

        // Create payment_providers table
        await db.query(`
            CREATE TABLE IF NOT EXISTS payment_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                payment_url TEXT NOT NULL,
                qr_code_data TEXT,
                is_active INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        console.log('✓ Created payment_providers table');

        // Create indexes
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_payment_providers_active
            ON payment_providers(is_active)
        `);

        console.log('✓ Created indexes');

        // Create trigger for updated_at
        await db.query(`
            CREATE TRIGGER IF NOT EXISTS update_payment_providers_timestamp
            AFTER UPDATE ON payment_providers
            FOR EACH ROW
            BEGIN
                UPDATE payment_providers
                SET updated_at = datetime('now')
                WHERE id = NEW.id;
            END
        `);

        console.log('✓ Created triggers');

        await db.query('COMMIT');

        console.log('✅ Payment providers system created successfully!');
        console.log('');
        console.log('📋 Summary:');
        console.log('   - Created payment_providers table');
        console.log('   - Supports name, URL, and QR code');
        console.log('   - Added indexes for performance');
        console.log('   - Added update timestamp trigger');
        console.log('');

        process.exit(0);

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
