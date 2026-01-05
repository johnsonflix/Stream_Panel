/**
 * Sonarr API Client
 *
 * Handles communication with Sonarr v3+ API
 */

const axios = require('axios');

class SonarrAPI {
    constructor(config) {
        this.baseUrl = config.url;
        this.apiKey = config.apiKey;

        if (!this.baseUrl || !this.apiKey) {
            throw new Error('Sonarr API requires url and apiKey');
        }

        // Ensure baseUrl ends with /api/v3
        if (!this.baseUrl.endsWith('/api/v3')) {
            this.baseUrl = this.baseUrl.replace(/\/$/, '') + '/api/v3';
        }
    }

    /**
     * Make a GET request to Sonarr API
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
            console.error(`[Sonarr API] GET ${endpoint} failed:`, error.message);
            throw error;
        }
    }

    /**
     * Make a POST request to Sonarr API
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
            console.error(`[Sonarr API] POST ${endpoint} failed:`, error.message);
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
            includeUnknownSeriesItems: false
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
     * Get language profiles (v3 only)
     */
    async getLanguageProfiles() {
        try {
            return await this.get('/languageprofile');
        } catch (error) {
            // v4 doesn't have language profiles
            return [];
        }
    }

    /**
     * Add a TV series to Sonarr
     */
    async addSeries(options) {
        const {
            tvdbId,
            title,
            year,
            qualityProfileId,
            rootFolderPath,
            languageProfileId = 1,
            tags = [],
            seasonFolder = true,
            monitored = true,
            searchForMissingEpisodes = true,
            seasons = [] // Array of season objects: [{ seasonNumber: 1, monitored: true }]
        } = options;

        const payload = {
            tvdbId,
            title,
            year,
            qualityProfileId,
            languageProfileId,
            rootFolderPath,
            tags,
            seasonFolder,
            monitored,
            seasons,
            addOptions: {
                searchForMissingEpisodes
            }
        };

        return await this.post('/series', payload);
    }

    /**
     * Get series by TVDB ID
     */
    async getSeriesByTvdbId(tvdbId) {
        const series = await this.get('/series', { tvdbId });
        return series.length > 0 ? series[0] : null;
    }

    /**
     * Lookup series by term (for searching before adding)
     */
    async lookupSeries(term) {
        return await this.get('/series/lookup', { term });
    }

    /**
     * Test connection to Sonarr
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

module.exports = SonarrAPI;
