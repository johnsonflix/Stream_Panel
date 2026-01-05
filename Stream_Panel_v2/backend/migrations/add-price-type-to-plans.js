/**
 * Migration: Add price_type column to subscription_plans
 *
 * Adds support for:
 * - 'fixed' - Regular fixed price
 * - 'free' - Free/no cost
 * - 'donation' - Donation-based (price is suggested amount)
 */

const dbConfig = require('../database-config');

async function migrate() {
    console.log('🔄 Adding price_type column to subscription_plans...');

    try {
        // Check if column already exists using raw db
        const tableInfo = dbConfig.db.prepare("PRAGMA table_info(subscription_plans)").all();
        const hasColumn = tableInfo.some(col => col.name === 'price_type');

        if (hasColumn) {
            console.log('✓ price_type column already exists, skipping...');
            process.exit(0);
            return;
        }

        dbConfig.db.prepare('BEGIN TRANSACTION').run();

        // Add price_type column with default 'fixed'
        dbConfig.db.prepare(`
            ALTER TABLE subscription_plans
            ADD COLUMN price_type TEXT DEFAULT 'fixed'
        `).run();

        console.log('✓ Added price_type column');

        // Update existing plans: if price is 0, set to 'free'
        dbConfig.db.prepare(`
            UPDATE subscription_plans
            SET price_type = 'free'
            WHERE price = 0 OR price IS NULL
        `).run();

        console.log('✓ Updated existing plans with price_type');

        dbConfig.db.prepare('COMMIT').run();

        console.log('✅ Migration completed successfully!');
        console.log('');
        console.log('📋 Summary:');
        console.log('   - Added price_type column (fixed, free, donation)');
        console.log('   - Default value: fixed');
        console.log('');

        process.exit(0);

    } catch (error) {
        try {
            dbConfig.db.prepare('ROLLBACK').run();
        } catch (e) {
            // Ignore rollback errors
        }
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
