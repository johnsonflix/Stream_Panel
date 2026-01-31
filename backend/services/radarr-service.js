/**
 * Radarr Service
 *
 * Handles all interactions with Radarr API for movie management
 * Used by the Request Site to add movies to Radarr
 */

const axios = require('axios');

class RadarrService {
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
     * Test connection to Radarr
     */
    async testConnection() {
        try {
            const response = await this.client.get('/system/status');
            return {
                success: true,
                version: response.data.version,
                appName: response.data.appName || 'Radarr'
            };
        } catch (error) {
            console.error('[Radarr] Connection test failed:', error.message);
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
            console.error('[Radarr] Failed to get quality profiles:', error.message);
            throw error;
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
            console.error('[Radarr] Failed to get root folders:', error.message);
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
            console.error('[Radarr] Failed to get tags:', error.message);
            throw error;
        }
    }

    /**
     * Lookup movie by TMDB ID
     */
    async lookupByTmdbId(tmdbId) {
        try {
            const response = await this.client.get('/movie/lookup', {
                params: { term: `tmdb:${tmdbId}` }
            });
            return response.data[0] || null;
        } catch (error) {
            console.error('[Radarr] Failed to lookup movie:', error.message);
            throw error;
        }
    }

    /**
     * Lookup movie by IMDb ID
     */
    async lookupByImdbId(imdbId) {
        try {
            const response = await this.client.get('/movie/lookup', {
                params: { term: `imdb:${imdbId}` }
            });
            return response.data[0] || null;
        } catch (error) {
            console.error('[Radarr] Failed to lookup movie by IMDb:', error.message);
            throw error;
        }
    }

    /**
     * Search movies by title
     */
    async searchMovies(query) {
        try {
            const response = await this.client.get('/movie/lookup', {
                params: { term: query }
            });
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to search movies:', error.message);
            throw error;
        }
    }

    /**
     * Get all movies in library
     */
    async getMovies() {
        try {
            const response = await this.client.get('/movie');
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to get movies:', error.message);
            throw error;
        }
    }

    /**
     * Get movie by ID
     */
    async getMovie(id) {
        try {
            const response = await this.client.get(`/movie/${id}`);
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to get movie:', error.message);
            throw error;
        }
    }

    /**
     * Check if movie exists in library by TMDB ID
     */
    async movieExistsByTmdbId(tmdbId) {
        try {
            const movies = await this.getMovies();
            return movies.find(m => m.tmdbId === tmdbId) || null;
        } catch (error) {
            console.error('[Radarr] Failed to check movie existence:', error.message);
            return null;
        }
    }

    /**
     * Add movie to Radarr
     */
    async addMovie(options) {
        try {
            // First lookup the movie to get all required data
            const lookupResult = await this.lookupByTmdbId(options.tmdbId);

            if (!lookupResult) {
                throw new Error('Movie not found in TMDB');
            }

            // Check if already exists
            const existing = await this.movieExistsByTmdbId(options.tmdbId);
            console.log(`[Radarr] Movie exists check: ${existing ? `YES (id=${existing.id}, monitored=${existing.monitored}, hasFile=${existing.hasFile})` : 'NO'}`);
            if (existing) {
                if (existing.hasFile) {
                    return {
                        success: true,
                        alreadyExists: true,
                        hasFile: true,
                        movie: existing
                    };
                }

                // Movie exists but not downloaded - update and monitor
                if (!existing.monitored) {
                    const updated = await this.updateMovie({
                        ...existing,
                        monitored: true,
                        qualityProfileId: options.qualityProfileId || existing.qualityProfileId
                    });

                    if (options.searchNow) {
                        await this.searchMovie(existing.id);
                    }

                    return {
                        success: true,
                        alreadyExists: true,
                        wasUpdated: true,
                        movie: updated
                    };
                }

                return {
                    success: true,
                    alreadyExists: true,
                    movie: existing
                };
            }

            // Add new movie
            const movieData = {
                title: lookupResult.title,
                titleSlug: lookupResult.titleSlug,
                tmdbId: lookupResult.tmdbId,
                year: lookupResult.year,
                qualityProfileId: options.qualityProfileId,
                rootFolderPath: options.rootFolderPath,
                minimumAvailability: options.minimumAvailability || 'announced',
                monitored: options.monitored !== false,
                tags: options.tags || [],
                addOptions: {
                    searchForMovie: options.searchNow !== false
                },
                images: lookupResult.images || []
            };

            console.log(`[Radarr] Adding movie: tmdbId=${movieData.tmdbId}, title=${movieData.title}, qualityProfileId=${movieData.qualityProfileId}, rootFolder=${movieData.rootFolderPath}, searchForMovie=${movieData.addOptions.searchForMovie}`);
            const response = await this.client.post('/movie', movieData);
            console.log(`[Radarr] Movie added successfully: id=${response.data?.id}, title=${response.data?.title}`);

            return {
                success: true,
                movie: response.data
            };
        } catch (error) {
            console.error('[Radarr] Failed to add movie:', error.message);
            if (error.response?.data) {
                console.error('[Radarr] Error response:', JSON.stringify(error.response.data).substring(0, 500));
            }
            return {
                success: false,
                error: error.response?.data?.message || error.response?.data?.[0]?.errorMessage || error.message
            };
        }
    }

    /**
     * Update movie
     */
    async updateMovie(movie) {
        try {
            const response = await this.client.put('/movie', movie);
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to update movie:', error.message);
            throw error;
        }
    }

    /**
     * Delete movie
     */
    async deleteMovie(id, deleteFiles = false) {
        try {
            await this.client.delete(`/movie/${id}`, {
                params: {
                    deleteFiles,
                    addImportExclusion: false
                }
            });
            return { success: true };
        } catch (error) {
            console.error('[Radarr] Failed to delete movie:', error.message);
            throw error;
        }
    }

    /**
     * Trigger search for a movie
     */
    async searchMovie(movieId) {
        try {
            const response = await this.client.post('/command', {
                name: 'MoviesSearch',
                movieIds: [movieId]
            });
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to trigger movie search:', error.message);
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
                    includeUnknownMovieItems: false
                }
            });
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to get queue:', error.message);
            throw error;
        }
    }

    /**
     * Get calendar (upcoming movies)
     */
    async getCalendar(start, end) {
        try {
            const response = await this.client.get('/calendar', {
                params: {
                    start: start || new Date().toISOString(),
                    end: end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    unmonitored: false
                }
            });
            return response.data;
        } catch (error) {
            console.error('[Radarr] Failed to get calendar:', error.message);
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
            console.error('[Radarr] Failed to get disk space:', error.message);
            throw error;
        }
    }
}

module.exports = RadarrService;
