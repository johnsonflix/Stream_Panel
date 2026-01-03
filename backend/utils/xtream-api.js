/**
 * Xtream Codes API Utility
 *
 * Provides methods to interact with Xtream Codes compatible IPTV panels.
 * Used for fetching categories, channels, and EPG data for the TV Guide.
 */

const axios = require('axios');
const https = require('https');

// Create an https agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Make an Xtream API request
 * @param {string} baseUrl - Panel base URL (e.g., https://panel.example.com:8080)
 * @param {string} username - API username
 * @param {string} password - API password
 * @param {string} action - API action (e.g., get_live_categories, get_live_streams)
 * @param {Object} params - Additional query parameters
 * @returns {Promise<Object>} API response data
 */
async function xtreamRequest(baseUrl, username, password, action, params = {}) {
    // Ensure baseUrl doesn't have trailing slash
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

    const url = new URL(`${cleanBaseUrl}/player_api.php`);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    url.searchParams.set('action', action);

    // Add any additional params
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
        }
    });

    try {
        const response = await axios.get(url.toString(), {
            timeout: 30000,
            headers: {
                'User-Agent': 'StreamPanel/2.0'
            },
            httpsAgent: httpsAgent
        });

        return response.data;
    } catch (error) {
        console.error(`Xtream API error (${action}):`, error.message);
        throw new Error(`Xtream API error: ${error.message}`);
    }
}

/**
 * Get server info and authenticate
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Server info and user info
 */
async function getServerInfo(baseUrl, username, password) {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/player_api.php?username=${username}&password=${password}`;

    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'StreamPanel/2.0' },
            httpsAgent: httpsAgent
        });

        return response.data;
    } catch (error) {
        console.error('Xtream server info error:', error.message);
        throw new Error(`Failed to connect: ${error.message}`);
    }
}

/**
 * Get live TV categories
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Array>} Array of category objects
 */
async function getLiveCategories(baseUrl, username, password) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_live_categories');

    // Ensure we return an array
    if (!Array.isArray(data)) {
        console.warn('get_live_categories did not return an array:', typeof data);
        return [];
    }

    // Normalize category data
    return data.map(cat => ({
        category_id: String(cat.category_id),
        category_name: cat.category_name || 'Unknown',
        parent_id: cat.parent_id || 0
    }));
}

/**
 * Get live TV streams (channels)
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|null} categoryId - Optional category ID to filter
 * @returns {Promise<Array>} Array of stream objects
 */
async function getLiveStreams(baseUrl, username, password, categoryId = null) {
    const params = {};
    if (categoryId) {
        params.category_id = categoryId;
    }

    const data = await xtreamRequest(baseUrl, username, password, 'get_live_streams', params);

    // Ensure we return an array
    if (!Array.isArray(data)) {
        console.warn('get_live_streams did not return an array:', typeof data);
        return [];
    }

    // Normalize stream data
    return data.map(stream => ({
        stream_id: stream.stream_id || stream.num,
        name: stream.name || 'Unknown Channel',
        stream_icon: stream.stream_icon || null,
        epg_channel_id: stream.epg_channel_id || null,
        category_id: String(stream.category_id || ''),
        is_adult: stream.is_adult === '1' || stream.is_adult === 1,
        custom_sid: stream.custom_sid || null,
        tv_archive: stream.tv_archive === 1,
        direct_source: stream.direct_source || null
    }));
}

/**
 * Get short EPG for a stream (current and next programs)
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|number} streamId - Stream ID
 * @returns {Promise<Object>} EPG data with listings
 */
async function getShortEPG(baseUrl, username, password, streamId) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_short_epg', {
        stream_id: streamId
    });

    return {
        epg_listings: data.epg_listings || []
    };
}

/**
 * Get full EPG for a stream
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|number} streamId - Stream ID
 * @returns {Promise<Object>} Full EPG data
 */
async function getFullEPG(baseUrl, username, password, streamId) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_simple_data_table', {
        stream_id: streamId
    });

    return data;
}

/**
 * Build stream URL for a live channel
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @param {string|number} streamId - Stream ID
 * @param {string} extension - File extension (ts, m3u8)
 * @returns {string} Full stream URL
 */
function buildStreamUrl(baseUrl, username, password, streamId, extension = 'ts') {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${cleanBaseUrl}/live/${username}/${password}/${streamId}.${extension}`;
}

/**
 * Build stream URL for a VOD movie
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @param {string|number} streamId - Stream ID
 * @param {string} extension - File extension (mp4, mkv, etc.)
 * @returns {string} Full stream URL
 */
function buildVodStreamUrl(baseUrl, username, password, streamId, extension = 'mp4') {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${cleanBaseUrl}/movie/${username}/${password}/${streamId}.${extension}`;
}

/**
 * Build stream URL for a series episode
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @param {string|number} streamId - Episode stream ID
 * @param {string} extension - File extension (mp4, mkv, etc.)
 * @returns {string} Full stream URL
 */
function buildSeriesStreamUrl(baseUrl, username, password, streamId, extension = 'mp4') {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${cleanBaseUrl}/series/${username}/${password}/${streamId}.${extension}`;
}

// ============================================================================
// VOD (Movies) API Methods
// ============================================================================

/**
 * Get VOD (movie) categories
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Array>} Array of category objects
 */
async function getVodCategories(baseUrl, username, password) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_vod_categories');

    if (!Array.isArray(data)) {
        console.warn('get_vod_categories did not return an array:', typeof data);
        return [];
    }

    return data.map(cat => ({
        category_id: String(cat.category_id),
        category_name: cat.category_name || 'Unknown',
        parent_id: cat.parent_id || 0
    }));
}

/**
 * Get VOD (movie) streams
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|null} categoryId - Optional category ID to filter
 * @returns {Promise<Array>} Array of movie objects
 */
async function getVodStreams(baseUrl, username, password, categoryId = null) {
    const params = {};
    if (categoryId) {
        params.category_id = categoryId;
    }

    const data = await xtreamRequest(baseUrl, username, password, 'get_vod_streams', params);

    if (!Array.isArray(data)) {
        console.warn('get_vod_streams did not return an array:', typeof data);
        return [];
    }

    return data.map(movie => ({
        stream_id: movie.stream_id || movie.num,
        name: movie.name || 'Unknown Movie',
        stream_icon: movie.stream_icon || null,
        category_id: String(movie.category_id || ''),
        container_extension: movie.container_extension || 'mp4',
        rating: movie.rating || null,
        rating_5based: movie.rating_5based || null,
        added: movie.added || null,
        plot: movie.plot || null,
        cast: movie.cast || null,
        director: movie.director || null,
        genre: movie.genre || null,
        releaseDate: movie.releaseDate || movie.release_date || null,
        year: movie.year || null,
        duration: movie.duration || null,
        duration_secs: movie.duration_secs || null,
        tmdb_id: movie.tmdb_id || null
    }));
}

/**
 * Get detailed info for a specific VOD movie
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|number} vodId - VOD stream ID
 * @returns {Promise<Object>} Movie info with full details
 */
async function getVodInfo(baseUrl, username, password, vodId) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_vod_info', {
        vod_id: vodId
    });

    if (!data || !data.info) {
        return null;
    }

    const info = data.info;
    const movieData = data.movie_data || {};

    return {
        info: {
            tmdb_id: info.tmdb_id || null,
            name: info.name || info.title || 'Unknown',
            title: info.title || info.name || 'Unknown',
            year: info.year || null,
            cover: info.cover || info.movie_image || null,
            cover_big: info.cover_big || info.cover || null,
            plot: info.plot || info.description || null,
            cast: info.cast || null,
            director: info.director || null,
            genre: info.genre || null,
            releaseDate: info.releaseDate || info.release_date || null,
            rating: info.rating || null,
            rating_5based: info.rating_5based || null,
            duration: info.duration || null,
            duration_secs: info.duration_secs || null,
            backdrop_path: info.backdrop_path || null,
            youtube_trailer: info.youtube_trailer || null,
            country: info.country || null
        },
        movie_data: {
            stream_id: movieData.stream_id || null,
            container_extension: movieData.container_extension || 'mp4',
            added: movieData.added || null
        }
    };
}

// ============================================================================
// Series (TV Shows) API Methods
// ============================================================================

/**
 * Get series categories
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Array>} Array of category objects
 */
async function getSeriesCategories(baseUrl, username, password) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_series_categories');

    if (!Array.isArray(data)) {
        console.warn('get_series_categories did not return an array:', typeof data);
        return [];
    }

    return data.map(cat => ({
        category_id: String(cat.category_id),
        category_name: cat.category_name || 'Unknown',
        parent_id: cat.parent_id || 0
    }));
}

/**
 * Get series list
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|null} categoryId - Optional category ID to filter
 * @returns {Promise<Array>} Array of series objects
 */
async function getSeries(baseUrl, username, password, categoryId = null) {
    const params = {};
    if (categoryId) {
        params.category_id = categoryId;
    }

    const data = await xtreamRequest(baseUrl, username, password, 'get_series', params);

    if (!Array.isArray(data)) {
        console.warn('get_series did not return an array:', typeof data);
        return [];
    }

    return data.map(series => ({
        series_id: series.series_id || series.id,
        name: series.name || series.title || 'Unknown Series',
        cover: series.cover || null,
        plot: series.plot || null,
        cast: series.cast || null,
        director: series.director || null,
        genre: series.genre || null,
        releaseDate: series.releaseDate || series.release_date || null,
        last_modified: series.last_modified || null,
        rating: series.rating || null,
        rating_5based: series.rating_5based || null,
        year: series.year || null,
        category_id: String(series.category_id || ''),
        backdrop_path: series.backdrop_path || null,
        youtube_trailer: series.youtube_trailer || null,
        episode_run_time: series.episode_run_time || null,
        tmdb_id: series.tmdb_id || null
    }));
}

/**
 * Get detailed info for a specific series including seasons and episodes
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string|number} seriesId - Series ID
 * @returns {Promise<Object>} Series info with seasons and episodes
 */
async function getSeriesInfo(baseUrl, username, password, seriesId) {
    const data = await xtreamRequest(baseUrl, username, password, 'get_series_info', {
        series_id: seriesId
    });

    if (!data) {
        return null;
    }

    const info = data.info || {};
    const episodes = data.episodes || {};
    const seasons = data.seasons || [];

    // Process episodes by season
    const episodesBySeason = {};
    for (const [seasonNum, seasonEpisodes] of Object.entries(episodes)) {
        if (Array.isArray(seasonEpisodes)) {
            episodesBySeason[seasonNum] = seasonEpisodes.map(ep => ({
                id: ep.id,
                episode_num: ep.episode_num || ep.episode_number,
                title: ep.title || `Episode ${ep.episode_num}`,
                container_extension: ep.container_extension || 'mp4',
                info: {
                    plot: ep.info?.plot || ep.plot || null,
                    duration: ep.info?.duration || ep.duration || null,
                    duration_secs: ep.info?.duration_secs || ep.duration_secs || null,
                    movie_image: ep.info?.movie_image || ep.movie_image || null,
                    rating: ep.info?.rating || ep.rating || null,
                    releaseDate: ep.info?.releaseDate || ep.releaseDate || null
                },
                added: ep.added || null,
                season: parseInt(seasonNum),
                direct_source: ep.direct_source || null
            }));
        }
    }

    return {
        info: {
            name: info.name || info.title || 'Unknown',
            title: info.title || info.name || 'Unknown',
            year: info.year || null,
            cover: info.cover || null,
            cover_big: info.cover_big || info.cover || null,
            plot: info.plot || null,
            cast: info.cast || null,
            director: info.director || null,
            genre: info.genre || null,
            releaseDate: info.releaseDate || info.release_date || null,
            rating: info.rating || null,
            rating_5based: info.rating_5based || null,
            backdrop_path: info.backdrop_path || null,
            youtube_trailer: info.youtube_trailer || null,
            episode_run_time: info.episode_run_time || null,
            category_id: info.category_id || null,
            tmdb_id: info.tmdb_id || null
        },
        seasons: seasons.map(s => ({
            season_number: s.season_number || s.season,
            name: s.name || `Season ${s.season_number || s.season}`,
            cover: s.cover || s.cover_big || null,
            air_date: s.air_date || null,
            episode_count: s.episode_count || (episodesBySeason[s.season_number || s.season]?.length || 0)
        })),
        episodes: episodesBySeason,
        totalSeasons: Object.keys(episodesBySeason).length,
        totalEpisodes: Object.values(episodesBySeason).reduce((sum, eps) => sum + eps.length, 0)
    };
}

/**
 * Fetch and cache all guide data for a panel/playlist
 * Returns categories and all channels organized by category
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Admin/provider username
 * @param {string} password - Admin/provider password
 * @returns {Promise<Object>} Complete guide data
 */
async function fetchFullGuideData(baseUrl, username, password) {
    console.log(`📺 Fetching full guide data from: ${baseUrl}`);

    // Fetch categories
    const categories = await getLiveCategories(baseUrl, username, password);
    console.log(`   ✅ Found ${categories.length} categories`);

    // Fetch all streams (without category filter to get everything in one call)
    const allStreams = await getLiveStreams(baseUrl, username, password);
    console.log(`   ✅ Found ${allStreams.length} live channels`);

    // Organize streams by category
    const streamsByCategory = {};
    allStreams.forEach(stream => {
        const catId = stream.category_id || 'uncategorized';
        if (!streamsByCategory[catId]) {
            streamsByCategory[catId] = [];
        }
        streamsByCategory[catId].push(stream);
    });

    // Add channel count to categories
    const categoriesWithCount = categories.map(cat => ({
        ...cat,
        channel_count: (streamsByCategory[cat.category_id] || []).length
    }));

    // Add "All Channels" pseudo-category
    const allCategory = {
        category_id: 'all',
        category_name: 'All Channels',
        parent_id: 0,
        channel_count: allStreams.length
    };

    return {
        categories: [allCategory, ...categoriesWithCount],
        streams: allStreams,
        streamsByCategory,
        totalChannels: allStreams.length,
        fetchedAt: new Date().toISOString()
    };
}

/**
 * Test connection to an Xtream panel
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Connection test result
 */
async function testConnection(baseUrl, username, password) {
    try {
        const info = await getServerInfo(baseUrl, username, password);

        if (info.user_info && info.user_info.auth === 1) {
            return {
                success: true,
                serverInfo: info.server_info || {},
                userInfo: {
                    username: info.user_info.username,
                    status: info.user_info.status,
                    expDate: info.user_info.exp_date,
                    isTrial: info.user_info.is_trial === '1',
                    maxConnections: info.user_info.max_connections,
                    activeConnections: info.user_info.active_cons
                }
            };
        } else {
            return {
                success: false,
                message: 'Authentication failed'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Fetch XMLTV EPG data from the provider
 * The standard Xtream Codes XMLTV endpoint
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<string>} Raw XMLTV data
 */
async function fetchXMLTV(baseUrl, username, password) {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/xmltv.php?username=${username}&password=${password}`;

    try {
        const response = await axios.get(url, {
            timeout: 120000, // 2 minute timeout - XMLTV files can be large
            headers: { 'User-Agent': 'StreamPanel/2.0' },
            httpsAgent: httpsAgent,
            responseType: 'text',
            maxContentLength: 500 * 1024 * 1024 // 500MB max
        });

        return response.data;
    } catch (error) {
        console.error('XMLTV fetch error:', error.message);
        throw new Error(`Failed to fetch XMLTV: ${error.message}`);
    }
}

/**
 * Fetch short EPG for multiple streams (batch)
 * More efficient than calling getShortEPG for each stream
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {Array<number|string>} streamIds - Array of stream IDs
 * @param {number} limit - Max concurrent requests
 * @returns {Promise<Object>} EPG data keyed by stream_id
 */
async function getBatchShortEPG(baseUrl, username, password, streamIds, limit = 10) {
    const results = {};

    // Process in batches to avoid overwhelming the server
    for (let i = 0; i < streamIds.length; i += limit) {
        const batch = streamIds.slice(i, i + limit);

        const promises = batch.map(async (streamId) => {
            try {
                const data = await xtreamRequest(baseUrl, username, password, 'get_short_epg', {
                    stream_id: streamId
                });
                return { streamId, data: data.epg_listings || [] };
            } catch (error) {
                console.warn(`Failed to get EPG for stream ${streamId}:`, error.message);
                return { streamId, data: [] };
            }
        });

        const batchResults = await Promise.all(promises);
        batchResults.forEach(({ streamId, data }) => {
            results[streamId] = data;
        });

        // Small delay between batches
        if (i + limit < streamIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

/**
 * Fetch all EPG data using the get_all_epg action (Xtream extension)
 * Some panels support this for getting all EPG at once
 * @param {string} baseUrl - Panel base URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} EPG data for all channels
 */
async function getAllEPG(baseUrl, username, password) {
    try {
        const data = await xtreamRequest(baseUrl, username, password, 'get_all_epg');
        return data;
    } catch (error) {
        console.warn('get_all_epg not supported or failed:', error.message);
        return null;
    }
}

module.exports = {
    // Core
    xtreamRequest,
    getServerInfo,
    testConnection,

    // Live TV
    getLiveCategories,
    getLiveStreams,
    buildStreamUrl,

    // VOD (Movies)
    getVodCategories,
    getVodStreams,
    getVodInfo,
    buildVodStreamUrl,

    // Series (TV Shows)
    getSeriesCategories,
    getSeries,
    getSeriesInfo,
    buildSeriesStreamUrl,

    // EPG
    getShortEPG,
    getFullEPG,
    fetchXMLTV,
    getBatchShortEPG,
    getAllEPG,

    // Guide Data
    fetchFullGuideData
};
