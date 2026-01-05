/**
 * Sonarr/Radarr Library Sync Job
 *
 * Periodically syncs Sonarr/Radarr library data to local cache.
 * This enables fast status lookups without hitting the *arr APIs every time.
 *
 * Runs: Every 15 minutes by default
 */

const db = require('../database-config');

class ArrLibrarySyncJob {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
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
            // Get all active Radarr and Sonarr servers
            const servers = await db.query(`
                SELECT * FROM request_servers WHERE is_active = 1
            `);

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
            // Get all processing/approved requests
            const pendingRequests = await db.query(`
                SELECT id, tmdb_id, media_type, title, status
                FROM media_requests
                WHERE status IN ('processing', 'approved')
            `);

            if (pendingRequests.length === 0) {
                return 0;
            }

            let updated = 0;

            for (const request of pendingRequests) {
                let isAvailable = false;

                if (request.media_type === 'movie') {
                    // Check Radarr cache for downloaded movie
                    const radarrEntries = await db.query(
                        'SELECT * FROM radarr_library_cache WHERE tmdb_id = $1 AND has_file = 1',
                        [request.tmdb_id]
                    );
                    isAvailable = radarrEntries.length > 0;
                } else if (request.media_type === 'tv') {
                    // Check Sonarr cache for TV episodes
                    const sonarrEntries = await db.query(
                        'SELECT * FROM sonarr_library_cache WHERE tmdb_id = $1 AND episode_file_count > 0',
                        [request.tmdb_id]
                    );
                    isAvailable = sonarrEntries.length > 0;
                }

                if (isAvailable) {
                    // Update media_requests status
                    await db.query(`
                        UPDATE media_requests
                        SET status = 'available', available_at = NOW()
                        WHERE id = $1
                    `, [request.id]);

                    // Also update or insert request_site_media to ensure Recently Added shows content
                    const existing = await db.query(
                        'SELECT id FROM request_site_media WHERE tmdb_id = $1 AND media_type = $2',
                        [request.tmdb_id, request.media_type]
                    );

                    if (existing.length > 0) {
                        await db.query(`
                            UPDATE request_site_media
                            SET status = 'available', media_added_at = COALESCE(media_added_at, NOW()), updated_at = NOW()
                            WHERE id = $1
                        `, [existing[0].id]);
                    } else {
                        await db.query(`
                            INSERT INTO request_site_media (tmdb_id, media_type, status, media_added_at, created_at, updated_at)
                            VALUES ($1, $2, 'available', NOW(), NOW(), NOW())
                        `, [request.tmdb_id, request.media_type]);
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

        const movies = await radarr.getMovies();

        console.log(`[Arr Sync] Syncing ${movies.length} movies from Radarr: ${server.name}`);

        // Use a transaction for better performance
        const client = await db.getConnection();
        try {
            await client.query('BEGIN');

            for (const movie of movies) {
                await client.query(`
                    INSERT INTO radarr_library_cache (
                        server_id, radarr_id, tmdb_id, imdb_id, title, year,
                        has_file, monitored, quality_profile_id, path, size_on_disk, added_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                    ON CONFLICT(server_id, tmdb_id) DO UPDATE SET
                        radarr_id = EXCLUDED.radarr_id,
                        imdb_id = EXCLUDED.imdb_id,
                        title = EXCLUDED.title,
                        year = EXCLUDED.year,
                        has_file = EXCLUDED.has_file,
                        monitored = EXCLUDED.monitored,
                        quality_profile_id = EXCLUDED.quality_profile_id,
                        path = EXCLUDED.path,
                        size_on_disk = EXCLUDED.size_on_disk,
                        added_at = EXCLUDED.added_at,
                        updated_at = NOW()
                `, [
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
                ]);
            }

            // Remove stale entries (movies deleted from Radarr)
            const currentTmdbIds = movies.map(m => m.tmdbId).filter(id => id != null);
            if (currentTmdbIds.length > 0) {
                // Delete cache entries for this server that are no longer in Radarr
                const deleteResult = await client.query(`
                    DELETE FROM radarr_library_cache
                    WHERE server_id = $1 AND tmdb_id != ALL($2::integer[])
                `, [server.id, currentTmdbIds]);

                if (deleteResult.rowCount > 0) {
                    console.log(`[Arr Sync] Removed ${deleteResult.rowCount} stale entries from Radarr cache for ${server.name}`);
                }
            }

            // Update last sync time
            await client.query(`
                UPDATE request_servers SET last_library_sync = NOW() WHERE id = $1
            `, [server.id]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

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

        const series = await sonarr.getSeries();

        console.log(`[Arr Sync] Syncing ${series.length} series from Sonarr: ${server.name}`);

        // Use a transaction for better performance
        const client = await db.getConnection();
        try {
            await client.query('BEGIN');

            for (const show of series) {
                // Skip shows without tvdbId
                if (!show.tvdbId) continue;

                await client.query(`
                    INSERT INTO sonarr_library_cache (
                        server_id, sonarr_id, tvdb_id, tmdb_id, imdb_id, title, year,
                        total_episodes, episode_file_count, monitored, quality_profile_id,
                        path, size_on_disk, added_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                    ON CONFLICT(server_id, tvdb_id) DO UPDATE SET
                        sonarr_id = EXCLUDED.sonarr_id,
                        tmdb_id = EXCLUDED.tmdb_id,
                        imdb_id = EXCLUDED.imdb_id,
                        title = EXCLUDED.title,
                        year = EXCLUDED.year,
                        total_episodes = EXCLUDED.total_episodes,
                        episode_file_count = EXCLUDED.episode_file_count,
                        monitored = EXCLUDED.monitored,
                        quality_profile_id = EXCLUDED.quality_profile_id,
                        path = EXCLUDED.path,
                        size_on_disk = EXCLUDED.size_on_disk,
                        added_at = EXCLUDED.added_at,
                        updated_at = NOW()
                `, [
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
                ]);
            }

            // Remove stale entries (series deleted from Sonarr)
            const currentTvdbIds = series.map(s => s.tvdbId).filter(id => id != null);
            if (currentTvdbIds.length > 0) {
                // Delete cache entries for this server that are no longer in Sonarr
                const deleteResult = await client.query(`
                    DELETE FROM sonarr_library_cache
                    WHERE server_id = $1 AND tvdb_id != ALL($2::integer[])
                `, [server.id, currentTvdbIds]);

                if (deleteResult.rowCount > 0) {
                    console.log(`[Arr Sync] Removed ${deleteResult.rowCount} stale entries from Sonarr cache for ${server.name}`);
                }
            }

            // Update last sync time
            await client.query(`
                UPDATE request_servers SET last_library_sync = NOW() WHERE id = $1
            `, [server.id]);

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        return series.length;
    }

    /**
     * Force sync a specific server
     */
    async syncServer(serverId) {
        const servers = await db.query('SELECT * FROM request_servers WHERE id = $1', [serverId]);

        if (servers.length === 0) {
            throw new Error('Server not found');
        }

        const server = servers[0];

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
    async getRadarrMovie(tmdbId) {
        const results = await db.query(`
            SELECT * FROM radarr_library_cache WHERE tmdb_id = $1 ORDER BY has_file DESC LIMIT 1
        `, [tmdbId]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Check if a series is in Sonarr (from cache)
     * Can lookup by tmdbId or tvdbId
     * @returns {Object|null} Cache entry if found
     */
    async getSonarrSeries(tmdbId, tvdbId = null) {
        // Try TMDB ID first
        if (tmdbId) {
            const results = await db.query(`
                SELECT * FROM sonarr_library_cache WHERE tmdb_id = $1 ORDER BY episode_file_count DESC LIMIT 1
            `, [tmdbId]);
            if (results.length > 0) return results[0];
        }

        // Fall back to TVDB ID
        if (tvdbId) {
            const results = await db.query(`
                SELECT * FROM sonarr_library_cache WHERE tvdb_id = $1 ORDER BY episode_file_count DESC LIMIT 1
            `, [tvdbId]);
            if (results.length > 0) return results[0];
        }

        return null;
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        const radarrCount = await db.query('SELECT COUNT(*) as count FROM radarr_library_cache');
        const sonarrCount = await db.query('SELECT COUNT(*) as count FROM sonarr_library_cache');

        const radarrWithFile = await db.query('SELECT COUNT(*) as count FROM radarr_library_cache WHERE has_file = 1');
        const sonarrWithEpisodes = await db.query('SELECT COUNT(*) as count FROM sonarr_library_cache WHERE episode_file_count > 0');

        return {
            radarr: {
                total: parseInt(radarrCount[0].count),
                withFiles: parseInt(radarrWithFile[0].count),
                processing: parseInt(radarrCount[0].count) - parseInt(radarrWithFile[0].count)
            },
            sonarr: {
                total: parseInt(sonarrCount[0].count),
                withEpisodes: parseInt(sonarrWithEpisodes[0].count),
                processing: parseInt(sonarrCount[0].count) - parseInt(sonarrWithEpisodes[0].count)
            }
        };
    }

    /**
     * Close - no-op for PostgreSQL (pool handles connections)
     */
    close() {
        this.stop();
    }
}

// Export singleton instance
const arrLibrarySyncJob = new ArrLibrarySyncJob();

module.exports = { ArrLibrarySyncJob, arrLibrarySyncJob };
