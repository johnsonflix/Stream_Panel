/**
 * Migration: Add last_recent_scan column to plex_servers
 *
 * This column tracks when the most recent items scan was performed
 * (as opposed to full library scans tracked by last_scan)
 */

module.exports = {
    name: 'add-plex-server-last-recent-scan',

    async up(db) {
        console.log('[Migration] Adding last_recent_scan column to plex_servers...');

        // Check if column already exists
        const checkResult = await db.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'plex_servers' AND column_name = 'last_recent_scan'
        `);

        if (checkResult.length > 0) {
            console.log('[Migration] Column last_recent_scan already exists, skipping');
            return;
        }

        // Add the column
        await db.query(`
            ALTER TABLE plex_servers
            ADD COLUMN last_recent_scan TIMESTAMP
        `);

        console.log('[Migration] Added last_recent_scan column to plex_servers');
    },

    async down(db) {
        await db.query(`
            ALTER TABLE plex_servers
            DROP COLUMN IF EXISTS last_recent_scan
        `);
        console.log('[Migration] Removed last_recent_scan column from plex_servers');
    }
};
