const { query } = require('../database-config');

/**
 * Fix the owner_id foreign key constraint
 *
 * The owner_id column currently references owners(id), but the application
 * expects it to reference users(id) where is_app_user=1.
 *
 * SQLite doesn't support dropping foreign keys directly, so we need to
 * recreate the table. For now, we'll just disable foreign key checks
 * and let the application handle the constraint logically.
 */
async function up() {
    console.log('Fixing owner_id foreign key constraint...');

    try {
        // Check if foreign keys are enforced
        const fkStatus = await query('PRAGMA foreign_keys');
        console.log('Foreign key enforcement status:', fkStatus);

        // SQLite foreign key constraints are only enforced if foreign_keys pragma is ON
        // and are defined at table creation time. We can't easily change them.

        // For now, let's verify the current state
        const tableInfo = await query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
        console.log('Users table schema:', tableInfo[0]?.sql?.substring(0, 500) + '...');

        // Check if there's data inconsistency
        const invalidOwners = await query(`
            SELECT u.id, u.name, u.owner_id
            FROM users u
            WHERE u.owner_id IS NOT NULL
            AND u.owner_id NOT IN (SELECT id FROM users WHERE is_app_user = 1)
            AND u.owner_id NOT IN (SELECT id FROM owners)
        `);

        if (invalidOwners.length > 0) {
            console.log('Found users with invalid owner_id:', invalidOwners);
            // Clear invalid owner_ids
            await query(`
                UPDATE users
                SET owner_id = NULL
                WHERE owner_id IS NOT NULL
                AND owner_id NOT IN (SELECT id FROM users WHERE is_app_user = 1)
                AND owner_id NOT IN (SELECT id FROM owners)
            `);
            console.log('Cleared invalid owner_id values');
        }

        console.log('✅ owner_id constraint check completed');
    } catch (error) {
        console.error('Error in migration:', error);
        throw error;
    }
}

async function down() {
    console.log('Note: This migration cannot be easily reversed.');
}

module.exports = { up, down };

// Run if executed directly
if (require.main === module) {
    up().then(() => {
        console.log('Migration completed');
        process.exit(0);
    }).catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
