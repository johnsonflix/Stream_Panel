/**
 * Sonarr Service
 *
 * Handles all interactions with Sonarr API for TV show management
 * Used by the Request Site to add TV shows to Sonarr
 */

const axios = require('axios');

class SonarrService {
    constructor(config) {
        this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = config.apiKey;
        this.timeout = config.timeout || 10000;

        this.client = axios.create({
            baseURL: `${this.url}/api/v3`,
            timeout: this.timeout,
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Test connection to Sonarr
     */
    async testConnection() {
        try {
            const response = await this.client.get('/system/status');
            return {
                success: true,
                version: response.data.version,
                appName: response.data.appName || 'Sonarr'
            };
        } catch (error) {
            console.error('[Sonarr] Connection test failed:', error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Get all quality profiles
     */
    async getQualityProfiles() {
        try {
            const response = await this.client.get('/qualityprofile');
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get quality profiles:', error.message);
            throw error;
        }
    }

    /**
     * Get all language profiles
     */
    async getLanguageProfiles() {
        try {
            const response = await this.client.get('/languageprofile');
            return response.data;
        } catch (error) {
            // Sonarr v4 doesn't have separate language profiles
            console.log('[Sonarr] Language profiles not available (Sonarr v4+)');
            return [];
        }
    }

    /**
     * Get all root folders
     */
    async getRootFolders() {
        try {
            const response = await this.client.get('/rootfolder');
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get root folders:', error.message);
            throw error;
        }
    }

    /**
     * Get all tags
     */
    async getTags() {
        try {
            const response = await this.client.get('/tag');
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get tags:', error.message);
            throw error;
        }
    }

    /**
     * Lookup series by TVDB ID
     */
    async lookupByTvdbId(tvdbId) {
        try {
            const response = await this.client.get('/series/lookup', {
                params: { term: `tvdb:${tvdbId}` }
            });
            return response.data[0] || null;
        } catch (error) {
            console.error('[Sonarr] Failed to lookup series by TVDB:', error.message);
            throw error;
        }
    }

    /**
     * Lookup series by TMDB ID (via TVDB lookup)
     */
    async lookupByTmdbId(tmdbId) {
        try {
            // First try direct TMDB lookup (Sonarr v4+)
            const response = await this.client.get('/series/lookup', {
                params: { term: `tmdb:${tmdbId}` }
            });
            return response.data[0] || null;
        } catch (error) {
            console.error('[Sonarr] Failed to lookup series by TMDB:', error.message);
            return null;
        }
    }

    /**
     * Search series by title
     */
    async searchSeries(query) {
        try {
            const response = await this.client.get('/series/lookup', {
                params: { term: query }
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to search series:', error.message);
            throw error;
        }
    }

    /**
     * Get all series in library
     */
    async getSeries() {
        try {
            const response = await this.client.get('/series');
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get series:', error.message);
            throw error;
        }
    }

    /**
     * Get series by ID
     */
    async getSeriesById(id) {
        try {
            const response = await this.client.get(`/series/${id}`);
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get series:', error.message);
            throw error;
        }
    }

    /**
     * Check if series exists in library by TVDB ID
     */
    async seriesExistsByTvdbId(tvdbId) {
        try {
            const series = await this.getSeries();
            return series.find(s => s.tvdbId === tvdbId) || null;
        } catch (error) {
            console.error('[Sonarr] Failed to check series existence:', error.message);
            return null;
        }
    }

    /**
     * Add series to Sonarr
     */
    async addSeries(options) {
        try {
            // First lookup the series to get all required data
            let lookupResult = null;

            if (options.tvdbId) {
                lookupResult = await this.lookupByTvdbId(options.tvdbId);
            } else if (options.tmdbId) {
                lookupResult = await this.lookupByTmdbId(options.tmdbId);
            }

            if (!lookupResult) {
                throw new Error('Series not found');
            }

            // Check if already exists
            const existing = await this.seriesExistsByTvdbId(lookupResult.tvdbId);
            if (existing) {
                // Series exists - check if we need to add more seasons
                let needsUpdate = false;
                const updatedSeasons = [...existing.seasons];

                if (options.seasons && options.seasons.length > 0) {
                    for (const seasonNum of options.seasons) {
                        const season = updatedSeasons.find(s => s.seasonNumber === seasonNum);
                        if (season && !season.monitored) {
                            season.monitored = true;
                            needsUpdate = true;
                        }
                    }
                }

                if (needsUpdate) {
                    existing.seasons = updatedSeasons;
                    const updated = await this.updateSeries(existing);

                    if (options.searchNow && options.seasons) {
                        for (const seasonNum of options.seasons) {
                            await this.searchSeason(existing.id, seasonNum);
                        }
                    }

                    return {
                        success: true,
                        alreadyExists: true,
                        wasUpdated: true,
                        series: updated
                    };
                }

                return {
                    success: true,
                    alreadyExists: true,
                    series: existing
                };
            }

            // Configure seasons to monitor
            const seasons = lookupResult.seasons.map(season => ({
                ...season,
                monitored: options.seasons
                    ? options.seasons.includes(season.seasonNumber)
                    : options.monitorAllSeasons !== false && season.seasonNumber !== 0
            }));

            // Add new series
            const seriesData = {
                title: lookupResult.title,
                titleSlug: lookupResult.titleSlug,
                tvdbId: lookupResult.tvdbId,
                year: lookupResult.year,
                qualityProfileId: options.qualityProfileId,
                languageProfileId: options.languageProfileId,
                rootFolderPath: options.rootFolderPath,
                seriesType: options.seriesType || 'standard',
                seasonFolder: options.seasonFolder !== false,
                monitored: true,
                tags: options.tags || [],
                seasons,
                addOptions: {
                    searchForMissingEpisodes: options.searchNow !== false,
                    searchForCutoffUnmetEpisodes: false,
                    ignoreEpisodesWithFiles: true,
                    ignoreEpisodesWithoutFiles: false
                },
                images: lookupResult.images || []
            };

            const response = await this.client.post('/series', seriesData);

            return {
                success: true,
                series: response.data
            };
        } catch (error) {
            console.error('[Sonarr] Failed to add series:', error.message);
            return {
                success: false,
                error: error.response?.data?.[0]?.errorMessage || error.response?.data?.message || error.message
            };
        }
    }

    /**
     * Update series
     */
    async updateSeries(series) {
        try {
            const response = await this.client.put(`/series/${series.id}`, series);
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to update series:', error.message);
            throw error;
        }
    }

    /**
     * Delete series
     */
    async deleteSeries(id, deleteFiles = false) {
        try {
            await this.client.delete(`/series/${id}`, {
                params: {
                    deleteFiles,
                    addImportListExclusion: false
                }
            });
            return { success: true };
        } catch (error) {
            console.error('[Sonarr] Failed to delete series:', error.message);
            throw error;
        }
    }

    /**
     * Trigger search for entire series
     */
    async searchSeries(seriesId) {
        try {
            const response = await this.client.post('/command', {
                name: 'SeriesSearch',
                seriesId
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to trigger series search:', error.message);
            throw error;
        }
    }

    /**
     * Trigger search for a specific season
     */
    async searchSeason(seriesId, seasonNumber) {
        try {
            const response = await this.client.post('/command', {
                name: 'SeasonSearch',
                seriesId,
                seasonNumber
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to trigger season search:', error.message);
            throw error;
        }
    }

    /**
     * Get episodes for a series
     */
    async getEpisodes(seriesId) {
        try {
            const response = await this.client.get('/episode', {
                params: { seriesId }
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get episodes:', error.message);
            throw error;
        }
    }

    /**
     * Get queue (downloads in progress)
     */
    async getQueue() {
        try {
            const response = await this.client.get('/queue', {
                params: {
                    page: 1,
                    pageSize: 100,
                    includeUnknownSeriesItems: false
                }
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get queue:', error.message);
            throw error;
        }
    }

    /**
     * Get calendar (upcoming episodes)
     */
    async getCalendar(start, end) {
        try {
            const response = await this.client.get('/calendar', {
                params: {
                    start: start || new Date().toISOString(),
                    end: end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    unmonitored: false
                }
            });
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get calendar:', error.message);
            throw error;
        }
    }

    /**
     * Get disk space
     */
    async getDiskSpace() {
        try {
            const response = await this.client.get('/diskspace');
            return response.data;
        } catch (error) {
            console.error('[Sonarr] Failed to get disk space:', error.message);
            throw error;
        }
    }
}

module.exports = SonarrService;
