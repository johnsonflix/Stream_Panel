/**
 * Plex Availability Sync Job
 *
 * Periodically checks if media marked as available on Plex still exists.
 * Marks removed content with DELETED status.
 *
 * Runs: Every 6 hours by default
 *
 * This job complements the Plex scanner by:
 * 1. Detecting when content is removed from Plex
 * 2. Updating media status to reflect current availability
 * 3. Allowing users to re-request previously available content
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

// Media status enum (matches Seerr)
const MediaStatus = {
    UNKNOWN: 0,
    PENDING: 1,
    PROCESSING: 2,
    PARTIALLY_AVAILABLE: 3,
    AVAILABLE: 4,
    DELETED: 5
};

class PlexAvailabilitySyncJob {
    constructor() {
        this.db = null;
        this.isRunning = false;
        this.intervalId = null;
    }

    getDb() {
        if (!this.db) {
            this.db = new Database(DB_PATH);
            this.db.pragma('journal_mode = WAL');
        }
        return this.db;
    }

    /**
     * Start the scheduled job
     * @param {number} intervalMs - Interval in milliseconds (default: 6 hours)
     */
    start(intervalMs = 6 * 60 * 60 * 1000) {
        if (this.intervalId) {
            console.log('[Availability Sync Job] Job already running');
            return;
        }

        console.log(`[Availability Sync Job] Starting scheduled job (every ${intervalMs / 1000 / 60} minutes)`);

        // Run immediately on start, then at intervals
        this.run();

        this.intervalId = setInterval(() => {
            this.run();
        }, intervalMs);
    }

    /**
     * Stop the scheduled job
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[Availability Sync Job] Stopped');
        }
    }

    /**
     * Run the availability sync
     */
    async run() {
        if (this.isRunning) {
            console.log('[Availability Sync Job] Previous run still in progress, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            const db = this.getDb();
            let removedCount = 0;
            let checkedCount = 0;
            let errorCount = 0;

            // Get all media marked as available with Plex rating keys
            const availableMedia = db.prepare(`
                SELECT m.id, m.tmdb_id, m.media_type, m.plex_rating_key, m.plex_server_id, s.url, s.token, s.name as server_name
                FROM request_site_media m
                JOIN plex_servers s ON m.plex_server_id = s.id
                WHERE m.status >= ? AND m.plex_rating_key IS NOT NULL AND s.is_active = 1
            `).all(MediaStatus.PARTIALLY_AVAILABLE);

            console.log(`[Availability Sync Job] Checking ${availableMedia.length} items...`);

            // Process in batches to avoid overwhelming the server
            const batchSize = 20;
            for (let i = 0; i < availableMedia.length; i += batchSize) {
                const batch = availableMedia.slice(i, i + batchSize);

                const promises = batch.map(async (item) => {
                    try {
                        // Check if item still exists on Plex
                        const metadataUrl = `${item.url}/library/metadata/${item.plex_rating_key}`;
                        await axios.get(metadataUrl, {
                            headers: {
                                'X-Plex-Token': item.token,
                                'Accept': 'application/json'
                            },
                            timeout: 5000
                        });

                        // Item still exists, update last check time
                        db.prepare(`
                            UPDATE request_site_media SET last_availability_check = CURRENT_TIMESTAMP WHERE id = ?
                        `).run(item.id);

                        return { status: 'exists' };

                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            // Item no longer exists on Plex
                            return { status: 'removed', item };
                        }
                        // Other errors (network, timeout, etc.)
                        return { status: 'error', error: error.message };
                    }
                });

                const results = await Promise.allSettled(promises);

                for (const result of results) {
                    checkedCount++;
                    if (result.status === 'fulfilled') {
                        if (result.value.status === 'removed') {
                            const item = result.value.item;
                            console.log(`[Availability Sync Job] Marking as removed: TMDB ${item.tmdb_id} (${item.media_type}) from ${item.server_name}`);

                            db.prepare(`
                                UPDATE request_site_media
                                SET status = ?, plex_rating_key = NULL, last_availability_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            `).run(MediaStatus.DELETED, item.id);

                            removedCount++;
                        } else if (result.value.status === 'error') {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }
                }

                // Small delay between batches
                if (i + batchSize < availableMedia.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`[Availability Sync Job] Complete in ${duration}s: ${checkedCount} checked, ${removedCount} removed, ${errorCount} errors`);

            // Store last run stats
            db.prepare(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('availability_sync_last_run', datetime('now'), CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = datetime('now'),
                    updated_at = CURRENT_TIMESTAMP
            `).run();

            db.prepare(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('availability_sync_stats', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = ?,
                    updated_at = CURRENT_TIMESTAMP
            `).run(
                JSON.stringify({ checked: checkedCount, removed: removedCount, errors: errorCount, duration }),
                JSON.stringify({ checked: checkedCount, removed: removedCount, errors: errorCount, duration })
            );

        } catch (error) {
            console.error('[Availability Sync Job] Failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Close database connection
     */
    close() {
        this.stop();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Export singleton instance
const availabilitySyncJob = new PlexAvailabilitySyncJob();

module.exports = { PlexAvailabilitySyncJob, availabilitySyncJob };
