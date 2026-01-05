/**
 * Radarr API Client
 *
 * Handles communication with Radarr v3+ API
 */

const axios = require('axios');

class RadarrAPI {
    constructor(config) {
        this.baseUrl = config.url;
        this.apiKey = config.apiKey;

        if (!this.baseUrl || !this.apiKey) {
            throw new Error('Radarr API requires url and apiKey');
        }

        // Ensure baseUrl ends with /api/v3
        if (!this.baseUrl.endsWith('/api/v3')) {
            this.baseUrl = this.baseUrl.replace(/\/$/, '') + '/api/v3';
        }
    }

    /**
     * Make a GET request to Radarr API
     */
    async get(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'X-Api-Key': this.apiKey
                },
                params,
                timeout: 30000
            });
            return response.data;
        } catch (error) {
            console.error(`[Radarr API] GET ${endpoint} failed:`, error.message);
            throw error;
        }
    }

    /**
     * Make a POST request to Radarr API
     */
    async post(endpoint, data = {}) {
        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
                headers: {
                    'X-Api-Key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            return response.data;
        } catch (error) {
            console.error(`[Radarr API] POST ${endpoint} failed:`, error.message);
            throw error;
        }
    }

    /**
     * Get download queue
     * Returns: Array of queue items with download progress
     */
    async getQueue() {
        const data = await this.get('/queue', {
            pageSize: 10000,
            includeUnknownMovieItems: false
        });

        return data.records || [];
    }

    /**
     * Get quality profiles
     */
    async getProfiles() {
        return await this.get('/qualityprofile');
    }

    /**
     * Get root folders
     */
    async getRootFolders() {
        return await this.get('/rootfolder');
    }

    /**
     * Get tags
     */
    async getTags() {
        return await this.get('/tag');
    }

    /**
     * Add a movie to Radarr
     */
    async addMovie(options) {
        const {
            tmdbId,
            title,
            year,
            qualityProfileId,
            rootFolderPath,
            tags = [],
            monitored = true,
            searchForMovie = true
        } = options;

        const payload = {
            tmdbId,
            title,
            year,
            qualityProfileId,
            rootFolderPath,
            tags,
            monitored,
            addOptions: {
                searchForMovie
            }
        };

        return await this.post('/movie', payload);
    }

    /**
     * Get movie by TMDB ID
     */
    async getMovieByTmdbId(tmdbId) {
        const movies = await this.get('/movie', { tmdbId });
        return movies.length > 0 ? movies[0] : null;
    }

    /**
     * Test connection to Radarr
     */
    async testConnection() {
        try {
            await this.get('/system/status');
            return true;
        } catch (error) {
            return false;
        }
    }
}

module.exports = RadarrAPI;
