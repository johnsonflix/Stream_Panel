const { query } = require('../database-config');

async function up() {
    console.log('Adding plex_sso_required column to users table...');

    try {
        // Try to add the column - will fail if it already exists
        await query(`ALTER TABLE users ADD COLUMN plex_sso_required INTEGER DEFAULT 0`);
        console.log('✅ Added plex_sso_required column to users table');
    } catch (error) {
        if (error.message && error.message.includes('duplicate column')) {
            console.log('ℹ️ plex_sso_required column already exists');
        } else {
            console.error('Error in migration:', error);
            throw error;
        }
    }
}

async function down() {
    console.log('Note: SQLite does not support dropping columns easily.');
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
