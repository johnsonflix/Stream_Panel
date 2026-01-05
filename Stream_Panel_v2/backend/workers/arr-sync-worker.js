/**
 * Sonarr/Radarr Sync Worker
 *
 * Runs *arr library syncs in a SEPARATE Node.js process to avoid blocking the main app.
 * Uses IPC messages to communicate progress back to the parent process.
 *
 * This ensures that Request Site API calls aren't blocked during sync operations.
 */

const path = require('path');
const db = require('../database-config');

/**
 * Send progress update to parent process
 */
function sendProgress(type, data) {
    if (process.send) {
        process.send({ type, ...data });
    }
}

/**
 * Sync all Radarr servers
 */
async function syncRadarr() {
    const RadarrService = require('../services/radarr-service');

    const servers = await db.query(`
        SELECT * FROM request_servers WHERE is_active = 1 AND type = 'radarr'
    `);

    sendProgress('status', {
        status: 'running',
        message: `Syncing ${servers.length} Radarr servers...`
    });

    let totalMovies = 0;

    for (const server of servers) {
        try {
            const radarr = new RadarrService({
                url: server.url,
                apiKey: server.api_key
            });

            const movies = await radarr.getMovies();
            console.log(`[Arr Sync Worker] Syncing ${movies.length} movies from Radarr: ${server.name}`);

            // Use transaction for better performance
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                for (const movie of movies) {
                    await conn.execute(`
                        INSERT INTO radarr_library_cache (
                            server_id, radarr_id, tmdb_id, imdb_id, title, year,
                            has_file, monitored, quality_profile_id, path, size_on_disk, added_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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

                await conn.commit();
            } catch (txError) {
                await conn.rollback();
                throw txError;
            } finally {
                conn.release();
            }

            totalMovies += movies.length;

            await db.query(`
                UPDATE request_servers SET last_library_sync = NOW() WHERE id = ?
            `, [server.id]);

            sendProgress('progress', {
                stage: 'radarr',
                server: server.name,
                count: movies.length
            });

        } catch (error) {
            console.error(`[Arr Sync Worker] Error syncing Radarr ${server.name}:`, error.message);
            sendProgress('progress', {
                stage: 'radarr',
                server: server.name,
                error: error.message
            });
        }
    }

    return totalMovies;
}

/**
 * Sync all Sonarr servers
 */
async function syncSonarr() {
    const SonarrService = require('../services/sonarr-service');

    const servers = await db.query(`
        SELECT * FROM request_servers WHERE is_active = 1 AND type = 'sonarr'
    `);

    sendProgress('status', {
        status: 'running',
        message: `Syncing ${servers.length} Sonarr servers...`
    });

    let totalSeries = 0;

    for (const server of servers) {
        try {
            const sonarr = new SonarrService({
                url: server.url,
                apiKey: server.api_key
            });

            const series = await sonarr.getSeries();
            console.log(`[Arr Sync Worker] Syncing ${series.length} series from Sonarr: ${server.name}`);

            // Use transaction for better performance
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                for (const show of series) {
                    if (!show.tvdbId) continue;

                    await conn.execute(`
                        INSERT INTO sonarr_library_cache (
                            server_id, sonarr_id, tvdb_id, tmdb_id, imdb_id, title, year,
                            total_episodes, episode_file_count, monitored, quality_profile_id,
                            path, size_on_disk, added_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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

                await conn.commit();
            } catch (txError) {
                await conn.rollback();
                throw txError;
            } finally {
                conn.release();
            }

            totalSeries += series.length;

            await db.query(`
                UPDATE request_servers SET last_library_sync = NOW() WHERE id = ?
            `, [server.id]);

            sendProgress('progress', {
                stage: 'sonarr',
                server: server.name,
                count: series.length
            });

        } catch (error) {
            console.error(`[Arr Sync Worker] Error syncing Sonarr ${server.name}:`, error.message);
            sendProgress('progress', {
                stage: 'sonarr',
                server: server.name,
                error: error.message
            });
        }
    }

    return totalSeries;
}

/**
 * Run full sync for all servers
 */
async function runFullSync() {
    sendProgress('status', {
        status: 'running',
        message: 'Starting full Sonarr/Radarr library sync...'
    });

    try {
        const radarrCount = await syncRadarr();
        const sonarrCount = await syncSonarr();

        sendProgress('complete', {
            success: true,
            results: {
                radarr: radarrCount,
                sonarr: sonarrCount
            },
            message: `Sync completed: ${radarrCount} movies, ${sonarrCount} series cached`
        });

        return { radarr: radarrCount, sonarr: sonarrCount };

    } catch (error) {
        sendProgress('error', {
            success: false,
            error: error.message,
            message: `Sync failed: ${error.message}`
        });
        throw error;
    }
}

// Handle messages from parent process
process.on('message', async (msg) => {
    console.log(`[Arr Sync Worker] Received command: ${msg.command}`);

    try {
        switch (msg.command) {
            case 'fullSync':
                await runFullSync();
                break;

            case 'syncRadarr':
                const radarrCount = await syncRadarr();
                sendProgress('complete', {
                    success: true,
                    results: { radarr: radarrCount },
                    message: `Radarr sync completed: ${radarrCount} movies cached`
                });
                break;

            case 'syncSonarr':
                const sonarrCount = await syncSonarr();
                sendProgress('complete', {
                    success: true,
                    results: { sonarr: sonarrCount },
                    message: `Sonarr sync completed: ${sonarrCount} series cached`
                });
                break;

            default:
                sendProgress('error', {
                    success: false,
                    error: `Unknown command: ${msg.command}`
                });
        }
    } catch (error) {
        console.error(`[Arr Sync Worker] Error:`, error);
        // Error already sent via sendProgress
    }

    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Arr Sync Worker] Uncaught exception:', error);
    sendProgress('error', {
        success: false,
        error: error.message,
        message: `Worker crashed: ${error.message}`
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Arr Sync Worker] Unhandled rejection:', reason);
    sendProgress('error', {
        success: false,
        error: String(reason),
        message: `Worker promise rejection: ${reason}`
    });
    process.exit(1);
});

console.log('[Arr Sync Worker] Started and waiting for commands...');
sendProgress('ready', { message: 'Arr sync worker ready' });
