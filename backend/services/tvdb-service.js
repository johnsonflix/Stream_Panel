/**
 * TVDB Service
 *
 * Handles interactions with TheTVDB API v4
 * Used to supplement TMDB data with more complete season information
 */

const axios = require('axios');

const TVDB_API_URL = 'https://api4.thetvdb.com/v4';

class TVDBService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.token = null;
        this.tokenExpiry = null;

        this.client = axios.create({
            baseURL: TVDB_API_URL,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Get authentication token from TVDB
     */
    async getToken() {
        // Return cached token if still valid (with 1 hour buffer)
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry - 3600000) {
            return this.token;
        }

        try {
            const response = await this.client.post('/login', {
                apikey: this.apiKey
            });

            if (response.data.status === 'success' && response.data.data?.token) {
                this.token = response.data.data.token;
                // TVDB tokens are valid for 1 month, we'll refresh after 25 days
                this.tokenExpiry = Date.now() + (25 * 24 * 60 * 60 * 1000);
                return this.token;
            } else {
                throw new Error('Invalid response from TVDB login');
            }
        } catch (error) {
            this.token = null;
            this.tokenExpiry = null;
            throw error;
        }
    }

    /**
     * Make authenticated request to TVDB API
     */
    async request(endpoint, params = {}) {
        const token = await this.getToken();

        try {
            const response = await this.client.get(endpoint, {
                params,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data;
        } catch (error) {
            // If token expired, clear cache and retry once
            if (error.response?.status === 401) {
                this.token = null;
                this.tokenExpiry = null;
                const newToken = await this.getToken();
                const retryResponse = await this.client.get(endpoint, {
                    params,
                    headers: {
                        'Authorization': `Bearer ${newToken}`
                    }
                });
                return retryResponse.data;
            }
            throw error;
        }
    }

    /**
     * Get series by TVDB ID with episodes included
     */
    async getSeries(tvdbId) {
        try {
            // Request extended info with episodes metadata
            const response = await this.request(`/series/${tvdbId}/extended`, { meta: 'episodes' });
            if (response.status === 'success' && response.data) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error(`[TVDB] Failed to get series ${tvdbId}:`, error.message);
            return null;
        }
    }

    /**
     * Get seasons for a series with episode counts
     */
    async getSeasons(tvdbId) {
        try {
            const series = await this.getSeries(tvdbId);
            if (!series || !series.seasons) {
                return [];
            }

            // Filter to "Aired Order" seasons (type.id === 1) which is the default ordering
            // This matches how Sonarr and most media managers organize content
            const airedSeasons = series.seasons.filter(s =>
                s.type?.id === 1 || s.type?.type === 'official' || !s.type
            );

            // Count episodes per season from the episodes array
            const episodeCountBySeasonNumber = {};
            if (series.episodes && Array.isArray(series.episodes)) {
                for (const ep of series.episodes) {
                    const seasonNum = ep.seasonNumber;
                    if (seasonNum !== undefined) {
                        episodeCountBySeasonNumber[seasonNum] = (episodeCountBySeasonNumber[seasonNum] || 0) + 1;
                    }
                }
            }

            return airedSeasons.map(season => ({
                season_number: season.number,
                name: season.name || `Season ${season.number}`,
                // Use counted episodes, fallback to API's episodeCount, fallback to 0
                episode_count: episodeCountBySeasonNumber[season.number] || season.episodeCount || 0,
                air_date: season.aired || null,
                tvdb_id: season.id,
                overview: season.overview || null,
                poster_path: season.image || null
            }));
        } catch (error) {
            console.error(`[TVDB] Failed to get seasons for ${tvdbId}:`, error.message);
            return [];
        }
    }

    /**
     * Test connection to TVDB
     */
    async testConnection() {
        try {
            await this.getToken();
            return { success: true, message: 'Connected to TVDB API' };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = TVDBService;
