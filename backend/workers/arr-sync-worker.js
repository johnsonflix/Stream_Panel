/**
 * Sonarr/Radarr Sync Worker
 *
 * Runs *arr library syncs in a SEPARATE Node.js process to avoid blocking the main app.
 * Uses IPC messages to communicate progress back to the parent process.
 *
 * This ensures that Request Site API calls aren't blocked during sync operations.
 */

const path = require('path');
const Database = require('better-sqlite3');

// Set up paths relative to this worker file
const BACKEND_DIR = path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(BACKEND_DIR, 'data', 'subsapp_v2.db');

/**
 * Send progress update to parent process
 */
function sendProgress(type, data) {
    if (process.send) {
        process.send({ type, ...data });
    }
}

/**
 * Get database connection
 */
function getDb() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    return db;
}

/**
 * Sync all Radarr servers
 */
async function syncRadarr() {
    const RadarrService = require('../services/radarr-service');
    const db = getDb();

    const servers = db.prepare(`
        SELECT * FROM request_servers WHERE is_active = 1 AND type = 'radarr'
    `).all();

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
            totalMovies += movies.length;

            db.prepare(`
                UPDATE request_servers SET last_library_sync = CURRENT_TIMESTAMP WHERE id = ?
            `).run(server.id);

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

    db.close();
    return totalMovies;
}

/**
 * Sync all Sonarr servers
 */
async function syncSonarr() {
    const SonarrService = require('../services/sonarr-service');
    const db = getDb();

    const servers = db.prepare(`
        SELECT * FROM request_servers WHERE is_active = 1 AND type = 'sonarr'
    `).all();

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
            totalSeries += series.length;

            db.prepare(`
                UPDATE request_servers SET last_library_sync = CURRENT_TIMESTAMP WHERE id = ?
            `).run(server.id);

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

    db.close();
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
