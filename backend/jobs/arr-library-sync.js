/**
 * Sonarr/Radarr Library Sync Job
 *
 * Periodically syncs Sonarr/Radarr library data to local cache.
 * This enables fast status lookups without hitting the *arr APIs every time.
 *
 * Runs: Every 15 minutes by default
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'subsapp_v2.db');

class ArrLibrarySyncJob {
    constructor() {
        this.db = null;
        this.isRunning = false;
        this.intervalId = null;
    }

    getDb() {
        if (!this.db) {
            this.db = new Database(DB_PATH);
            this.db.pragma('journal_mode = WAL');
            // CRITICAL: Set busy_timeout to wait for locks instead of failing immediately
            this.db.pragma('busy_timeout = 10000'); // Wait up to 10 seconds for locks
        }
        return this.db;
    }

    /**
     * Start the scheduled sync job
     * @param {number} intervalMs - Interval in milliseconds (default: 15 minutes)
     */
    start(intervalMs = 15 * 60 * 1000) {
        if (this.intervalId) {
            console.log('[Arr Sync] Job already running');
            return;
        }

        console.log(`[Arr Sync] Starting scheduled job (every ${intervalMs / 1000 / 60} minutes)`);

        // Run immediately on start
        this.run();

        // Then run periodically
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
            console.log('[Arr Sync] Stopped');
        }
    }

    /**
     * Run the sync for all configured servers
     */
    async run() {
        if (this.isRunning) {
            console.log('[Arr Sync] Previous sync still in progress, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            const db = this.getDb();

            // Get all active Radarr and Sonarr servers
            const servers = db.prepare(`
                SELECT * FROM request_servers WHERE is_active = 1
            `).all();

            const radarrServers = servers.filter(s => s.type === 'radarr');
            const sonarrServers = servers.filter(s => s.type === 'sonarr');

            console.log(`[Arr Sync] Starting sync: ${radarrServers.length} Radarr, ${sonarrServers.length} Sonarr servers`);

            let totalRadarr = 0;
            let totalSonarr = 0;

            // Sync Radarr servers
            for (const server of radarrServers) {
                try {
                    const count = await this.syncRadarrServer(server);
                    totalRadarr += count;
                } catch (error) {
                    console.error(`[Arr Sync] Error syncing Radarr ${server.name}:`, error.message);
                }
            }

            // Sync Sonarr servers
            for (const server of sonarrServers) {
                try {
                    const count = await this.syncSonarrServer(server);
                    totalSonarr += count;
                } catch (error) {
                    console.error(`[Arr Sync] Error syncing Sonarr ${server.name}:`, error.message);
                }
            }

            // After syncing cache, update any stuck media_requests to 'available' if they have files
            const requestsUpdated = await this.syncMediaRequestsStatus();

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log(`[Arr Sync] Complete in ${duration}s: ${totalRadarr} movies, ${totalSonarr} series cached, ${requestsUpdated} requests updated`);

        } catch (error) {
            console.error('[Arr Sync] Failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Sync media_requests status based on *arr library cache
     * Updates any processing/approved requests to 'available' if the content has been downloaded
     */
    async syncMediaRequestsStatus() {
        try {
            const db = this.getDb();

            // Get all processing/approved requests
            const pendingRequests = db.prepare(`
                SELECT id, tmdb_id, media_type, title, status
                FROM media_requests
                WHERE status IN ('processing', 'approved')
            `).all();

            if (pendingRequests.length === 0) {
                return 0;
            }

            let updated = 0;

            for (const request of pendingRequests) {
                let isAvailable = false;

                if (request.media_type === 'movie') {
                    // Check Radarr cache for downloaded movie
                    const radarrEntry = db.prepare(
                        'SELECT * FROM radarr_library_cache WHERE tmdb_id = ? AND has_file = 1'
                    ).get(request.tmdb_id);
                    isAvailable = !!radarrEntry;
                } else if (request.media_type === 'tv') {
                    // Check Sonarr cache for TV episodes
                    const sonarrEntry = db.prepare(
                        'SELECT * FROM sonarr_library_cache WHERE tmdb_id = ? AND episode_file_count > 0'
                    ).get(request.tmdb_id);
                    isAvailable = !!sonarrEntry;
                }

                if (isAvailable) {
                    // Update media_requests status
                    db.prepare(`
                        UPDATE media_requests
                        SET status = 'available', available_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(request.id);

                    // Also update or insert request_site_media to ensure Recently Added shows content
                    const existing = db.prepare(
                        'SELECT id FROM request_site_media WHERE tmdb_id = ? AND media_type = ?'
                    ).get(request.tmdb_id, request.media_type);

                    if (existing) {
                        db.prepare(`
                            UPDATE request_site_media
                            SET status = 4, media_added_at = COALESCE(media_added_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(existing.id);
                    } else {
                        db.prepare(`
                            INSERT INTO request_site_media (tmdb_id, media_type, status, media_added_at, created_at, updated_at)
                            VALUES (?, ?, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        `).run(request.tmdb_id, request.media_type);
                    }

                    updated++;
                    console.log(`[Arr Sync] ✅ Request "${request.title}" (TMDB ${request.tmdb_id}) marked as available`);
                }
            }

            return updated;
        } catch (error) {
            console.error('[Arr Sync] Error syncing media_requests status:', error);
            return 0;
        }
    }

    /**
     * Sync a single Radarr server's library
     */
    async syncRadarrServer(server) {
        const RadarrService = require('../services/radarr-service');
        const radarr = new RadarrService({
            url: server.url,
            apiKey: server.api_key
        });

        const db = this.getDb();
        const movies = await radarr.getMovies();

        console.log(`[Arr Sync] Syncing ${movies.length} movies from Radarr: ${server.name}`);

        // Use a transaction for better performance
        const insertStmt = db.prepare(`
            INSERT INTO radarr_library_cache (
                server_id, radarr_id, tmdb_id, imdb_id, title, year,
                has_file, monitored, quality_profile_id, path, size_on_disk, added_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(server_id, tmdb_id) DO UPDATE SET
                radarr_id = excluded.radarr_id,
                imdb_id = excluded.imdb_id,
                title = excluded.title,
                year = excluded.year,
                has_file = excluded.has_file,
                monitored = excluded.monitored,
                quality_profile_id = excluded.quality_profile_id,
                path = excluded.path,
                size_on_disk = excluded.size_on_disk,
                added_at = excluded.added_at,
                updated_at = CURRENT_TIMESTAMP
        `);

        const insertMany = db.transaction((movies) => {
            for (const movie of movies) {
                insertStmt.run(
                    server.id,
                    movie.id,
                    movie.tmdbId,
                    movie.imdbId || null,
                    movie.title,
                    movie.year || null,
                    movie.hasFile ? 1 : 0,
                    movie.monitored ? 1 : 0,
                    movie.qualityProfileId || null,
                    movie.path || null,
                    movie.sizeOnDisk || 0,
                    movie.added || null
                );
            }
        });

        insertMany(movies);

        // Remove stale entries (movies deleted from Radarr)
        const currentTmdbIds = movies.map(m => m.tmdbId).filter(id => id != null);
        if (currentTmdbIds.length > 0) {
            // Delete cache entries for this server that are no longer in Radarr
            const placeholders = currentTmdbIds.map(() => '?').join(',');
            const deleteResult = db.prepare(`
                DELETE FROM radarr_library_cache
                WHERE server_id = ? AND tmdb_id NOT IN (${placeholders})
            `).run(server.id, ...currentTmdbIds);

            if (deleteResult.changes > 0) {
                console.log(`[Arr Sync] Removed ${deleteResult.changes} stale entries from Radarr cache for ${server.name}`);
            }
        }

        // Update last sync time
        db.prepare(`
            UPDATE request_servers SET last_library_sync = CURRENT_TIMESTAMP WHERE id = ?
        `).run(server.id);

        return movies.length;
    }

    /**
     * Sync a single Sonarr server's library
     */
    async syncSonarrServer(server) {
        const SonarrService = require('../services/sonarr-service');
        const sonarr = new SonarrService({
            url: server.url,
            apiKey: server.api_key
        });

        const db = this.getDb();
        const series = await sonarr.getSeries();

        console.log(`[Arr Sync] Syncing ${series.length} series from Sonarr: ${server.name}`);

        // Use a transaction for better performance
        const insertStmt = db.prepare(`
            INSERT INTO sonarr_library_cache (
                server_id, sonarr_id, tvdb_id, tmdb_id, imdb_id, title, year,
                total_episodes, episode_file_count, monitored, quality_profile_id,
                path, size_on_disk, added_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(server_id, tvdb_id) DO UPDATE SET
                sonarr_id = excluded.sonarr_id,
                tmdb_id = excluded.tmdb_id,
                imdb_id = excluded.imdb_id,
                title = excluded.title,
                year = excluded.year,
                total_episodes = excluded.total_episodes,
                episode_file_count = excluded.episode_file_count,
                monitored = excluded.monitored,
                quality_profile_id = excluded.quality_profile_id,
                path = excluded.path,
                size_on_disk = excluded.size_on_disk,
                added_at = excluded.added_at,
                updated_at = CURRENT_TIMESTAMP
        `);

        const insertMany = db.transaction((seriesList) => {
            for (const show of seriesList) {
                // Skip shows without tvdbId
                if (!show.tvdbId) continue;

                insertStmt.run(
                    server.id,
                    show.id,
                    show.tvdbId,
                    show.tmdbId || null,
                    show.imdbId || null,
                    show.title,
                    show.year || null,
                    show.statistics?.totalEpisodeCount || 0,
                    show.statistics?.episodeFileCount || 0,
                    show.monitored ? 1 : 0,
                    show.qualityProfileId || null,
                    show.path || null,
                    show.statistics?.sizeOnDisk || 0,
                    show.added || null
                );
            }
        });

        insertMany(series);

        // Remove stale entries (series deleted from Sonarr)
        const currentTvdbIds = series.map(s => s.tvdbId).filter(id => id != null);
        if (currentTvdbIds.length > 0) {
            // Delete cache entries for this server that are no longer in Sonarr
            const placeholders = currentTvdbIds.map(() => '?').join(',');
            const deleteResult = db.prepare(`
                DELETE FROM sonarr_library_cache
                WHERE server_id = ? AND tvdb_id NOT IN (${placeholders})
            `).run(server.id, ...currentTvdbIds);

            if (deleteResult.changes > 0) {
                console.log(`[Arr Sync] Removed ${deleteResult.changes} stale entries from Sonarr cache for ${server.name}`);
            }
        }

        // Update last sync time
        db.prepare(`
            UPDATE request_servers SET last_library_sync = CURRENT_TIMESTAMP WHERE id = ?
        `).run(server.id);

        return series.length;
    }

    /**
     * Force sync a specific server
     */
    async syncServer(serverId) {
        const db = this.getDb();
        const server = db.prepare('SELECT * FROM request_servers WHERE id = ?').get(serverId);

        if (!server) {
            throw new Error('Server not found');
        }

        if (server.type === 'radarr') {
            return await this.syncRadarrServer(server);
        } else if (server.type === 'sonarr') {
            return await this.syncSonarrServer(server);
        }

        return 0;
    }

    /**
     * Check if a movie is in Radarr (from cache)
     * @returns {Object|null} Cache entry if found
     */
    getRadarrMovie(tmdbId) {
        const db = this.getDb();
        return db.prepare(`
            SELECT * FROM radarr_library_cache WHERE tmdb_id = ? ORDER BY has_file DESC LIMIT 1
        `).get(tmdbId);
    }

    /**
     * Check if a series is in Sonarr (from cache)
     * Can lookup by tmdbId or tvdbId
     * @returns {Object|null} Cache entry if found
     */
    getSonarrSeries(tmdbId, tvdbId = null) {
        const db = this.getDb();

        // Try TMDB ID first
        if (tmdbId) {
            const result = db.prepare(`
                SELECT * FROM sonarr_library_cache WHERE tmdb_id = ? ORDER BY episode_file_count DESC LIMIT 1
            `).get(tmdbId);
            if (result) return result;
        }

        // Fall back to TVDB ID
        if (tvdbId) {
            return db.prepare(`
                SELECT * FROM sonarr_library_cache WHERE tvdb_id = ? ORDER BY episode_file_count DESC LIMIT 1
            `).get(tvdbId);
        }

        return null;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const db = this.getDb();

        const radarrCount = db.prepare('SELECT COUNT(*) as count FROM radarr_library_cache').get().count;
        const sonarrCount = db.prepare('SELECT COUNT(*) as count FROM sonarr_library_cache').get().count;

        const radarrWithFile = db.prepare('SELECT COUNT(*) as count FROM radarr_library_cache WHERE has_file = 1').get().count;
        const sonarrWithEpisodes = db.prepare('SELECT COUNT(*) as count FROM sonarr_library_cache WHERE episode_file_count > 0').get().count;

        return {
            radarr: {
                total: radarrCount,
                withFiles: radarrWithFile,
                processing: radarrCount - radarrWithFile
            },
            sonarr: {
                total: sonarrCount,
                withEpisodes: sonarrWithEpisodes,
                processing: sonarrCount - sonarrWithEpisodes
            }
        };
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
const arrLibrarySyncJob = new ArrLibrarySyncJob();

module.exports = { ArrLibrarySyncJob, arrLibrarySyncJob };
