/**
 * Migration: Add custom_name column to iptv_bouquets table
 *
 * Allows users to manually set custom names for bouquets
 * when the API doesn't provide bouquet names (like 1-Stream)
 */

const db = require('../database-config');

async function migrate() {
    console.log('Starting migration: add-bouquet-custom-name');

    try {
        // Check if column already exists
        const result = await db.query("PRAGMA table_info(iptv_bouquets)");
        const columns = Array.isArray(result) ? result : [];
        const hasCustomName = columns.some(col => col.name === 'custom_name');

        if (hasCustomName) {
            console.log('Column custom_name already exists, skipping migration');
            process.exit(0);
        }

        // Add custom_name column
        await db.query(`
            ALTER TABLE iptv_bouquets
            ADD COLUMN custom_name TEXT DEFAULT NULL
        `);

        console.log('Successfully added custom_name column to iptv_bouquets');
        process.exit(0);

    } catch (error) {
        // If error is about column already existing, that's fine
        if (error.message && error.message.includes('duplicate column')) {
            console.log('Column custom_name already exists, skipping migration');
            process.exit(0);
        }
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
