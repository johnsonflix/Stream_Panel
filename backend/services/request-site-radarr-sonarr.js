/**
 * Request Site - Radarr/Sonarr Integration Service
 *
 * Handles submitting approved requests to Radarr/Sonarr
 */

const { query } = require('../database-config');
const RadarrAPI = require('../utils/radarr-api');
const SonarrAPI = require('../utils/sonarr-api');
const axios = require('axios');

/**
 * Get Radarr server configuration
 */
async function getRadarrServer(is4k = false) {
    try {
        const settingKey = is4k ? 'default_radarr_4k_server' : 'default_radarr_server';
        const settings = await query('SELECT value FROM request_site_settings WHERE key = ?', [settingKey]);

        if (settings.length === 0 || settings[0].value === 'null') {
            return null;
        }

        const serverId = JSON.parse(settings[0].value);

        // TODO: In the future, fetch server config from a radarr_servers table
        // For now, return placeholder
        return {
            id: serverId,
            url: process.env.RADARR_URL || 'http://localhost:7878',
            apiKey: process.env.RADARR_API_KEY || '',
            qualityProfileId: parseInt(process.env.RADARR_QUALITY_PROFILE || '1'),
            rootFolderPath: process.env.RADARR_ROOT_FOLDER || '/movies',
            minimumAvailability: 'announced',
            searchOnAdd: true
        };
    } catch (error) {
        console.error('[Radarr/Sonarr] Error getting Radarr server:', error);
        return null;
    }
}

/**
 * Get Sonarr server configuration
 */
async function getSonarrServer(is4k = false) {
    try {
        const settingKey = is4k ? 'default_sonarr_4k_server' : 'default_sonarr_server';
        const settings = await query('SELECT value FROM request_site_settings WHERE key = ?', [settingKey]);

        if (settings.length === 0 || settings[0].value === 'null') {
            return null;
        }

        const serverId = JSON.parse(settings[0].value);

        // TODO: In the future, fetch server config from a sonarr_servers table
        // For now, return placeholder
        return {
            id: serverId,
            url: process.env.SONARR_URL || 'http://localhost:8989',
            apiKey: process.env.SONARR_API_KEY || '',
            qualityProfileId: parseInt(process.env.SONARR_QUALITY_PROFILE || '1'),
            rootFolderPath: process.env.SONARR_ROOT_FOLDER || '/tv',
            languageProfileId: 1,
            searchOnAdd: true
        };
    } catch (error) {
        console.error('[Radarr/Sonarr] Error getting Sonarr server:', error);
        return null;
    }
}

/**
 * Get TVDB ID from TMDB ID
 */
async function getTvdbIdFromTmdb(tmdbId) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY || '';
        if (!tmdbApiKey) {
            console.error('[Radarr/Sonarr] TMDB API key not configured');
            return null;
        }

        const response = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`, {
            params: { api_key: tmdbApiKey },
            timeout: 5000
        });

        return response.data.tvdb_id || null;
    } catch (error) {
        console.error('[Radarr/Sonarr] Error getting TVDB ID:', error);
        return null;
    }
}

/**
 * Get media title and year from TMDB
 */
async function getMediaInfoFromTmdb(tmdbId, mediaType) {
    try {
        const tmdbApiKey = process.env.TMDB_API_KEY || '';
        if (!tmdbApiKey) {
            console.error('[Radarr/Sonarr] TMDB API key not configured');
            return null;
        }

        const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
        const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}`, {
            params: { api_key: tmdbApiKey },
            timeout: 5000
        });

        const data = response.data;

        return {
            title: data.title || data.name,
            year: data.release_date ? parseInt(data.release_date.slice(0, 4)) : (data.first_air_date ? parseInt(data.first_air_date.slice(0, 4)) : null),
            overview: data.overview
        };
    } catch (error) {
        console.error('[Radarr/Sonarr] Error getting media info from TMDB:', error);
        return null;
    }
}

/**
 * Submit movie request to Radarr
 */
async function submitMovieToRadarr(tmdbId, is4k = false) {
    try {
        const server = await getRadarrServer(is4k);

        if (!server || !server.apiKey) {
            throw new Error('Radarr server not configured');
        }

        const radarr = new RadarrAPI({
            url: server.url,
            apiKey: server.apiKey
        });

        // First check if movie already exists in Radarr
        const existingMovie = await radarr.getMovieByTmdbId(tmdbId);

        if (existingMovie) {
            console.log(`[Radarr/Sonarr] Movie already in Radarr: ${existingMovie.title} (hasFile: ${existingMovie.hasFile})`);

            return {
                success: true,
                radarrId: existingMovie.id,
                serverId: server.id,
                alreadyExists: true,
                hasFile: existingMovie.hasFile || false
            };
        }

        // Get media info from TMDB
        const mediaInfo = await getMediaInfoFromTmdb(tmdbId, 'movie');

        if (!mediaInfo) {
            throw new Error('Could not fetch movie info from TMDB');
        }

        // Add movie to Radarr
        const result = await radarr.addMovie({
            tmdbId,
            title: mediaInfo.title,
            year: mediaInfo.year,
            qualityProfileId: server.qualityProfileId,
            rootFolderPath: server.rootFolderPath,
            monitored: true,
            searchForMovie: server.searchOnAdd
        });

        console.log(`[Radarr/Sonarr] Movie added to Radarr: ${mediaInfo.title} (TMDB: ${tmdbId})`);

        return {
            success: true,
            radarrId: result.id,
            serverId: server.id,
            alreadyExists: false,
            hasFile: false
        };
    } catch (error) {
        console.error('[Radarr/Sonarr] Error submitting movie to Radarr:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Submit TV show request to Sonarr
 */
async function submitTvShowToSonarr(tmdbId, seasons, is4k = false) {
    try {
        const server = await getSonarrServer(is4k);

        if (!server || !server.apiKey) {
            throw new Error('Sonarr server not configured');
        }

        const sonarr = new SonarrAPI({
            url: server.url,
            apiKey: server.apiKey
        });

        // Get TVDB ID from TMDB
        const tvdbId = await getTvdbIdFromTmdb(tmdbId);

        if (!tvdbId) {
            throw new Error('Could not find TVDB ID for this show');
        }

        // First check if series already exists in Sonarr
        const existingSeries = await sonarr.getSeriesByTvdbId(tvdbId);

        if (existingSeries) {
            // Check if it has any downloaded episodes
            const episodeFileCount = existingSeries.statistics?.episodeFileCount || 0;
            const totalEpisodeCount = existingSeries.statistics?.totalEpisodeCount || 0;
            const hasFiles = episodeFileCount > 0;
            const isFullyAvailable = episodeFileCount >= totalEpisodeCount && totalEpisodeCount > 0;

            console.log(`[Radarr/Sonarr] TV show already in Sonarr: ${existingSeries.title} (${episodeFileCount}/${totalEpisodeCount} episodes)`);

            return {
                success: true,
                sonarrId: existingSeries.id,
                serverId: server.id,
                tvdbId,
                alreadyExists: true,
                hasFiles,
                isFullyAvailable,
                episodeFileCount,
                totalEpisodeCount
            };
        }

        // Get media info from TMDB
        const mediaInfo = await getMediaInfoFromTmdb(tmdbId, 'tv');

        if (!mediaInfo) {
            throw new Error('Could not fetch TV show info from TMDB');
        }

        // Build season array for Sonarr
        let seasonArray = [];
        if (seasons === 'all' || !seasons) {
            // Monitor all seasons
            seasonArray = []; // Sonarr will auto-detect and monitor all
        } else {
            // Monitor specific seasons
            const requestedSeasons = JSON.parse(seasons);
            seasonArray = requestedSeasons.map(num => ({
                seasonNumber: num,
                monitored: true
            }));
        }

        // Add series to Sonarr
        const result = await sonarr.addSeries({
            tvdbId,
            title: mediaInfo.title,
            year: mediaInfo.year,
            qualityProfileId: server.qualityProfileId,
            languageProfileId: server.languageProfileId,
            rootFolderPath: server.rootFolderPath,
            seasons: seasonArray,
            monitored: true,
            searchForMissingEpisodes: server.searchOnAdd
        });

        console.log(`[Radarr/Sonarr] TV show added to Sonarr: ${mediaInfo.title} (TMDB: ${tmdbId}, TVDB: ${tvdbId})`);

        return {
            success: true,
            sonarrId: result.id,
            serverId: server.id,
            tvdbId,
            alreadyExists: false,
            hasFiles: false,
            isFullyAvailable: false
        };
    } catch (error) {
        console.error('[Radarr/Sonarr] Error submitting TV show to Sonarr:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Submit approved request to Radarr/Sonarr
 *
 * Media Status values:
 * - 2 = PROCESSING (downloading)
 * - 3 = PARTIALLY_AVAILABLE (some episodes downloaded)
 * - 4 = AVAILABLE (fully downloaded)
 */
async function submitRequest(requestId) {
    try {
        // Get request details
        const requests = await query(`
            SELECT r.*, m.tmdb_id, m.media_type
            FROM request_site_requests r
            JOIN request_site_media m ON r.media_id = m.id
            WHERE r.id = ?
        `, [requestId]);

        if (requests.length === 0) {
            throw new Error('Request not found');
        }

        const request = requests[0];

        let result;

        if (request.media_type === 'movie') {
            result = await submitMovieToRadarr(request.tmdb_id, request.is_4k === 1);

            if (result.success) {
                // Determine status: AVAILABLE (4) if hasFile, otherwise PROCESSING (2)
                const mediaStatus = result.hasFile ? 4 : 2;

                // Update media record with radarr_id
                const field = request.is_4k === 1 ? 'radarr_id_4k' : 'radarr_id';
                await query(
                    `UPDATE request_site_media SET ${field} = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [result.radarrId, mediaStatus, request.media_id]
                );

                // Update request with server assignment and status
                const requestStatus = result.hasFile ? 4 : 2; // 4 = AVAILABLE, 2 = PROCESSING
                await query(
                    'UPDATE request_site_requests SET radarr_server_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [result.serverId, requestStatus, requestId]
                );

                // Also update media_requests table if content is already available
                if (result.hasFile) {
                    await query(`
                        UPDATE media_requests
                        SET status = 'available', available_at = CURRENT_TIMESTAMP
                        WHERE tmdb_id = ? AND media_type = 'movie'
                    `, [request.tmdb_id]);

                    console.log(`[Radarr/Sonarr] Movie already downloaded - marked as AVAILABLE`);
                }

                // Pass hasFile info back to caller
                result.mediaStatus = mediaStatus;
            }
        } else if (request.media_type === 'tv') {
            result = await submitTvShowToSonarr(request.tmdb_id, request.seasons, request.is_4k === 1);

            if (result.success) {
                // Determine status based on episode availability
                let mediaStatus = 2; // PROCESSING
                if (result.isFullyAvailable) {
                    mediaStatus = 4; // AVAILABLE
                } else if (result.hasFiles) {
                    mediaStatus = 3; // PARTIALLY_AVAILABLE
                }

                // Update media record with sonarr_id and tvdb_id
                const field = request.is_4k === 1 ? 'sonarr_id_4k' : 'sonarr_id';
                await query(
                    `UPDATE request_site_media SET ${field} = ?, tvdb_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [result.sonarrId, result.tvdbId, mediaStatus, request.media_id]
                );

                // Update request with server assignment and status
                const requestStatus = result.isFullyAvailable ? 4 : (result.hasFiles ? 3 : 2);
                await query(
                    'UPDATE request_site_requests SET sonarr_server_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [result.serverId, requestStatus, requestId]
                );

                // Also update media_requests table if content has files
                if (result.hasFiles) {
                    const mrStatus = result.isFullyAvailable ? 'available' : 'processing';
                    await query(`
                        UPDATE media_requests
                        SET status = ?, ${result.isFullyAvailable ? 'available_at = CURRENT_TIMESTAMP,' : ''} updated_at = CURRENT_TIMESTAMP
                        WHERE tmdb_id = ? AND media_type = 'tv'
                    `.replace(', updated_at', ' updated_at'), [mrStatus, request.tmdb_id]);

                    console.log(`[Radarr/Sonarr] TV show has ${result.episodeFileCount}/${result.totalEpisodeCount} episodes - marked as ${mrStatus.toUpperCase()}`);
                }

                // Pass status info back to caller
                result.mediaStatus = mediaStatus;
            }
        }

        return result;
    } catch (error) {
        console.error('[Radarr/Sonarr] Error submitting request:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    submitMovieToRadarr,
    submitTvShowToSonarr,
    submitRequest,
    getMediaInfoFromTmdb
};
