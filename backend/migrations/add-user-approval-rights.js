/**
 * Migration: Add User Approval Rights
 *
 * Adds columns for per-user approval permissions:
 * - can_approve_movies: User can approve movie requests
 * - can_approve_tv: User can approve TV show requests
 * - can_approve_4k_movies: User can approve 4K movie requests
 * - can_approve_4k_tv: User can approve 4K TV show requests
 *
 * Users with any approval right can access the "Manage Requests" section.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

function migrate() {
    const db = new Database(DB_PATH);

    console.log('[Migration] Adding user approval rights columns...');

    // Add columns to request_user_permissions table
    const userTableInfo = db.prepare("PRAGMA table_info(request_user_permissions)").all();
    const userColumns = userTableInfo.map(col => col.name);

    const approvalColumns = [
        { name: 'can_approve_movies', default: 0 },
        { name: 'can_approve_tv', default: 0 },
        { name: 'can_approve_4k_movies', default: 0 },
        { name: 'can_approve_4k_tv', default: 0 }
    ];

    for (const col of approvalColumns) {
        if (!userColumns.includes(col.name)) {
            try {
                db.exec(`ALTER TABLE request_user_permissions ADD COLUMN ${col.name} INTEGER DEFAULT ${col.default}`);
                console.log(`[Migration] Added ${col.name} to request_user_permissions`);
            } catch (err) {
                if (!err.message.includes('duplicate column')) {
                    console.error(`[Migration] Error adding ${col.name}:`, err.message);
                }
            }
        }
    }

    db.close();
    console.log('[Migration] User approval rights migration complete!');
}

module.exports = { migrate };

// Run migration if executed directly
if (require.main === module) {
    migrate();
}
