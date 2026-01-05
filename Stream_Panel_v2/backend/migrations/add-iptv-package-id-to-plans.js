/**
 * Migration: Add iptv_package_id to subscription_plans
 *
 * This links IPTV subscription plans directly to IPTV packages
 * so when provisioning from a portal service request, the wizard
 * knows which IPTV package to use.
 */

const db = require('../database-config');

async function migrate() {
    console.log('Adding iptv_package_id column to subscription_plans...');

    try {
        // Try to add the column - will fail if it already exists
        await db.query(`
            ALTER TABLE subscription_plans
            ADD COLUMN iptv_package_id INTEGER DEFAULT NULL
            REFERENCES iptv_packages(id) ON DELETE SET NULL
        `);

        console.log('Added iptv_package_id column');

        // Create index for performance
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_subscription_plans_iptv_package
            ON subscription_plans(iptv_package_id)
        `);

        console.log('Created index');

        console.log('Migration completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Go to Subscription Plans settings in the admin panel');
        console.log('2. Edit each IPTV subscription plan');
        console.log('3. Set the "IPTV Package" dropdown to link to the correct iptv_packages entry');

        process.exit(0);

    } catch (error) {
        if (error.message && error.message.includes('duplicate column name')) {
            console.log('Column iptv_package_id already exists, skipping...');
            process.exit(0);
        } else {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    }
}

migrate();
