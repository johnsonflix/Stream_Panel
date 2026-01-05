/**
 * Plex Recent Scan Job - Seerr-Style Implementation
 *
 * Periodically scans for recently added content on Plex servers.
 * Uses incremental scanning to only check content added since last scan.
 *
 * Like Seerr:
 * - Recent scan: Every 5 minutes (only recently added content)
 * - Full scan: Every 6 hours (complete library resync)
 *
 * Only scans servers with enable_auto_scan = 1
 */

const { PlexScannerService } = require('../services/plex-scanner-service');
const db = require('../database-config');

// Seerr-style intervals
const RECENT_SCAN_INTERVAL = 5 * 60 * 1000;    // 5 minutes
const FULL_SCAN_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

class PlexRecentScanJob {
    constructor() {
        this.scanner = null;
        this.isRunning = false;
        this.recentIntervalId = null;
        this.fullIntervalId = null;
    }

    getScanner() {
        if (!this.scanner) {
            this.scanner = new PlexScannerService();
        }
        return this.scanner;
    }

    /**
     * Get server IDs that have auto-scan enabled
     */
    async getAutoScanServerIds() {
        const servers = await db.query(`
            SELECT id FROM plex_servers
            WHERE is_active = 1 AND COALESCE(enable_auto_scan, 1) = 1
        `);
        return servers.map(s => s.id);
    }

    /**
     * Start the scheduled jobs (like Seerr)
     * - Recent scan: every 5 minutes
     * - Full scan: every 6 hours
     */
    start() {
        if (this.recentIntervalId) {
            console.log('[Plex Auto Scan] Jobs already running');
            return;
        }

        console.log(`[Plex Auto Scan] Starting Seerr-style scheduled scans:`);
        console.log(`[Plex Auto Scan]   - Recent scan: every ${RECENT_SCAN_INTERVAL / 60000} minutes`);
        console.log(`[Plex Auto Scan]   - Full scan: every ${FULL_SCAN_INTERVAL / 3600000} hours`);

        // Run initial recent scan after 2 minutes (give app time to fully start)
        setTimeout(() => {
            this.runRecentScan();
        }, 2 * 60 * 1000);

        // Schedule recurring recent scans (every 5 minutes)
        this.recentIntervalId = setInterval(() => {
            this.runRecentScan();
        }, RECENT_SCAN_INTERVAL);

        // Schedule recurring full scans (every 6 hours)
        this.fullIntervalId = setInterval(() => {
            this.runFullScan();
        }, FULL_SCAN_INTERVAL);
    }

    /**
     * Stop the scheduled jobs
     */
    stop() {
        if (this.recentIntervalId) {
            clearInterval(this.recentIntervalId);
            this.recentIntervalId = null;
        }
        if (this.fullIntervalId) {
            clearInterval(this.fullIntervalId);
            this.fullIntervalId = null;
        }
        console.log('[Plex Auto Scan] Stopped');
    }

    /**
     * Run the recent scan (incremental - only recently added content)
     */
    async runRecentScan() {
        if (this.isRunning) {
            console.log('[Plex Auto Scan] Previous scan still in progress, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            // Get servers with auto-scan enabled that have been scanned before
            const serverIds = await this.getAutoScanServerIds();
            if (serverIds.length === 0) {
                console.log('[Plex Auto Scan] No servers enabled for auto-scan');
                return;
            }

            // Check if any servers have been scanned before
            const serversWithScan = await db.query(`
                SELECT COUNT(*) as count FROM plex_servers
                WHERE id = ANY($1::integer[]) AND last_scan IS NOT NULL
            `, [serverIds]);

            if (parseInt(serversWithScan[0].count) === 0) {
                console.log('[Plex Auto Scan] No servers have been scanned yet. Please run a manual full scan first.');
                return;
            }

            console.log(`[Plex Auto Scan] Starting RECENT scan for ${serverIds.length} servers...`);

            const scanner = this.getScanner();
            const results = await scanner.scan({ serverIds, recentOnly: true });

            const duration = Math.round((Date.now() - startTime) / 1000);

            console.log(`[Plex Auto Scan] RECENT scan complete in ${duration}s: ${results.newlyAdded} new items (${results.totalMovies} movies, ${results.totalTVShows} shows)`);

            // Store last run stats
            await db.query(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('recent_scan_last_run', NOW()::text, NOW())
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = NOW()::text,
                    updated_at = NOW()
            `);

            const statsJson = JSON.stringify({
                newlyAdded: results.newlyAdded,
                movies: results.totalMovies,
                tvShows: results.totalTVShows,
                duration,
                scanType: 'recent'
            });

            await db.query(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('recent_scan_stats', $1, NOW())
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = $1,
                    updated_at = NOW()
            `, [statsJson]);

        } catch (error) {
            console.error('[Plex Auto Scan] Recent scan failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Run a full library scan (every 6 hours)
     */
    async runFullScan() {
        if (this.isRunning) {
            console.log('[Plex Auto Scan] Previous scan still in progress, skipping full scan');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            // Get servers with auto-scan enabled
            const serverIds = await this.getAutoScanServerIds();
            if (serverIds.length === 0) {
                console.log('[Plex Auto Scan] No servers enabled for auto-scan');
                return;
            }

            console.log(`[Plex Auto Scan] Starting FULL scan for ${serverIds.length} servers...`);

            const scanner = this.getScanner();
            const results = await scanner.scan({ serverIds, recentOnly: false });

            const duration = Math.round((Date.now() - startTime) / 1000);

            console.log(`[Plex Auto Scan] FULL scan complete in ${duration}s: ${results.totalMovies} movies, ${results.totalTVShows} shows`);

            // Store last full scan stats
            await db.query(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('full_scan_last_run', NOW()::text, NOW())
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = NOW()::text,
                    updated_at = NOW()
            `);

            const statsJson = JSON.stringify({
                movies: results.totalMovies,
                tvShows: results.totalTVShows,
                duration,
                scanType: 'full'
            });

            await db.query(`
                INSERT INTO request_settings (setting_key, setting_value, updated_at)
                VALUES ('full_scan_stats', $1, NOW())
                ON CONFLICT(setting_key) DO UPDATE SET
                    setting_value = $1,
                    updated_at = NOW()
            `, [statsJson]);

        } catch (error) {
            console.error('[Plex Auto Scan] Full scan failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Close - no-op for PostgreSQL (pool handles connections)
     */
    close() {
        this.stop();
        if (this.scanner) {
            this.scanner.close();
            this.scanner = null;
        }
    }
}

// Export singleton instance
const recentScanJob = new PlexRecentScanJob();

module.exports = { PlexRecentScanJob, recentScanJob };
