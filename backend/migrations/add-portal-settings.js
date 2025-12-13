/**
 * Migration: Add portal settings
 *
 * Adds default settings for the end-user portal.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Adding portal settings...');

    try {
        // Settings to add
        const portalSettings = [
            { key: 'user_portal_enabled', value: 'true', description: 'Enable the end-user portal' },
            { key: 'portal_title', value: '', description: 'Portal title (leave empty to use app title)' },
            { key: 'portal_logo', value: '', description: 'Portal logo path (leave empty to use app logo)' },
            { key: 'portal_plex_enabled', value: 'true', description: 'Enable Plex login option in portal' },
            { key: 'portal_iptv_enabled', value: 'true', description: 'Enable IPTV login option in portal' }
        ];

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO settings (setting_key, setting_value)
            VALUES (?, ?)
        `);

        for (const setting of portalSettings) {
            const result = insertStmt.run(setting.key, setting.value);
            if (result.changes > 0) {
                console.log(`  Added setting: ${setting.key} = ${setting.value}`);
            } else {
                console.log(`  Setting already exists: ${setting.key}`);
            }
        }

        db.close();
        console.log('Portal settings migration completed successfully!');

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
