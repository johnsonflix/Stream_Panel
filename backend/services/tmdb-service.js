/**
 * TMDB Service
 *
 * Handles all interactions with The Movie Database (TMDB) API
 * Used for searching and getting details for movies and TV shows
 */

const axios = require('axios');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Default API key (from Jellyseerr - can be overridden in settings)
const DEFAULT_API_KEY = '431a8708161bcd1f1fbe7536137e61ed';

// In-memory cache for movie/TV details (TTL: 5 minutes)
// This prevents duplicate API calls when loading movie/TV pages
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const detailsCache = new Map();

// Clean up expired cache entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of detailsCache) {
        if (now - value.timestamp > CACHE_TTL) {
            detailsCache.delete(key);
        }
    }
}, 60 * 1000);

class TMDBService {
    constructor(apiKey = null) {
        this.apiKey = apiKey || DEFAULT_API_KEY;
        this.language = 'en-US';
        this.region = 'US';
    }

    /**
     * Get cached data or null if not found/expired
     */
    _getFromCache(key) {
        const cached = detailsCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }
        if (cached) {
            detailsCache.delete(key);
        }
        return null;
    }

    /**
     * Store data in cache
     */
    _setCache(key, data) {
        detailsCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Set custom API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Set language for results
     */
    setLanguage(language) {
        this.language = language;
    }

    /**
     * Set region for results
     */
    setRegion(region) {
        this.region = region;
    }

    /**
     * Make API request to TMDB
     */
    async request(endpoint, params = {}) {
        try {
            const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
                params: {
                    api_key: this.apiKey,
                    language: this.language,
                    ...params
                },
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            console.error(`[TMDB] API Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search for movies and TV shows (multi-search)
     */
    async searchMulti(query, page = 1, includeAdult = false) {
        return this.request('/search/multi', {
            query,
            page,
            include_adult: includeAdult
        });
    }

    /**
     * Search for movies only
     */
    async searchMovies(query, page = 1, year = null) {
        const params = { query, page };
        if (year) params.primary_release_year = year;
        return this.request('/search/movie', params);
    }

    /**
     * Search for TV shows only
     */
    async searchTv(query, page = 1, year = null) {
        const params = { query, page };
        if (year) params.first_air_date_year = year;
        return this.request('/search/tv', params);
    }

    /**
     * Search for keywords
     */
    async searchKeyword(query, page = 1) {
        return this.request('/search/keyword', { query, page });
    }

    /**
     * Search for companies (studios/production companies)
     */
    async searchCompany(query, page = 1) {
        return this.request('/search/company', { query, page });
    }

    /**
     * Get movie details by ID (with caching)
     */
    async getMovie(movieId, appendToResponse = 'credits,external_ids,videos,recommendations,similar,watch/providers,release_dates,keywords') {
        const cacheKey = `movie:${movieId}:${this.language}`;
        const cached = this._getFromCache(cacheKey);
        if (cached) {
            return cached;
        }

        const data = await this.request(`/movie/${movieId}`, {
            append_to_response: appendToResponse
        });

        this._setCache(cacheKey, data);
        return data;
    }

    /**
     * Get TV show details by ID (with caching)
     */
    async getTvShow(tvId, appendToResponse = 'credits,external_ids,videos,recommendations,similar,watch/providers,content_ratings,keywords') {
        const cacheKey = `tv:${tvId}:${this.language}`;
        const cached = this._getFromCache(cacheKey);
        if (cached) {
            return cached;
        }

        const data = await this.request(`/tv/${tvId}`, {
            append_to_response: appendToResponse
        });

        this._setCache(cacheKey, data);
        return data;
    }

    /**
     * Get TV season details
     */
    async getTvSeason(tvId, seasonNumber) {
        return this.request(`/tv/${tvId}/season/${seasonNumber}`);
    }

    /**
     * Get similar movies with language filtering
     * NOTE: Using discover endpoint to filter by original language (English only)
     */
    async getSimilarMovies(movieId, page = 1, originalLanguage = 'en') {
        // First get the movie to find its genres
        const movie = await this.request(`/movie/${movieId}`);

        // Use discover endpoint with genre filter and language filter
        return this.request('/discover/movie', {
            page,
            with_genres: movie.genres?.map(g => g.id).slice(0, 3).join(',') || '',
            with_original_language: originalLanguage,
            sort_by: 'popularity.desc'
        });
    }

    /**
     * Get movie recommendations with language filtering
     * NOTE: Using discover endpoint to filter by original language (English only)
     */
    async getMovieRecommendations(movieId, page = 1, originalLanguage = 'en') {
        // Use TMDB's recommendations endpoint but filter by language
        const recs = await this.request(`/movie/${movieId}/recommendations`, { page });

        // Filter to only include movies with the specified original language
        if (originalLanguage && originalLanguage !== 'all') {
            recs.results = recs.results.filter(m => m.original_language === originalLanguage);
        }

        return recs;
    }

    /**
     * Get similar TV shows with language filtering
     */
    async getSimilarTv(tvId, page = 1, originalLanguage = 'en') {
        // First get the show to find its genres
        const show = await this.request(`/tv/${tvId}`);

        // Use discover endpoint with genre filter and language filter
        return this.request('/discover/tv', {
            page,
            with_genres: show.genres?.map(g => g.id).slice(0, 3).join(',') || '',
            with_original_language: originalLanguage,
            sort_by: 'popularity.desc'
        });
    }

    /**
     * Get TV recommendations with language filtering
     */
    async getTvRecommendations(tvId, page = 1, originalLanguage = 'en') {
        // Use TMDB's recommendations endpoint but filter by language
        const recs = await this.request(`/tv/${tvId}/recommendations`, { page });

        // Filter to only include shows with the specified original language
        if (originalLanguage && originalLanguage !== 'all') {
            recs.results = recs.results.filter(s => s.original_language === originalLanguage);
        }

        return recs;
    }

    /**
     * Get trending movies and TV shows
     */
    async getTrending(mediaType = 'all', timeWindow = 'week', page = 1) {
        return this.request(`/trending/${mediaType}/${timeWindow}`, { page });
    }

    /**
     * Get popular movies
     */
    async getPopularMovies(page = 1) {
        return this.request('/movie/popular', { page, region: this.region });
    }

    /**
     * Get popular TV shows
     */
    async getPopularTv(page = 1) {
        return this.request('/tv/popular', { page });
    }

    /**
     * Get upcoming movies
     */
    async getUpcomingMovies(page = 1) {
        return this.request('/movie/upcoming', { page, region: this.region });
    }

    /**
     * Get now playing movies
     */
    async getNowPlayingMovies(page = 1) {
        return this.request('/movie/now_playing', { page, region: this.region });
    }

    /**
     * Get top rated movies
     */
    async getTopRatedMovies(page = 1) {
        return this.request('/movie/top_rated', { page, region: this.region });
    }

    /**
     * Get top rated TV shows
     */
    async getTopRatedTv(page = 1) {
        return this.request('/tv/top_rated', { page });
    }

    /**
     * Get on the air TV shows
     */
    async getOnTheAirTv(page = 1) {
        return this.request('/tv/on_the_air', { page });
    }

    /**
     * Get airing today TV shows
     */
    async getAiringTodayTv(page = 1) {
        return this.request('/tv/airing_today', { page });
    }

    /**
     * Discover movies with filters
     * IMPORTANT: Matches Seerr's exact implementation for consistent results
     */
    async discoverMovies(options = {}) {
        const params = {
            page: options.page || 1,
            sort_by: options.sortBy || 'popularity.desc',
            include_adult: options.includeAdult || false,
            include_video: false,
            with_watch_monetization_types: 'flatrate'
        };

        // CRITICAL: Add language filter like Seerr does (defaults to English)
        if (options.originalLanguage) {
            params.with_original_language = options.originalLanguage;
        } else if (options.originalLanguage !== 'all') {
            // Default to English unless explicitly set to 'all'
            params.with_original_language = 'en';
        }

        if (options.genres) params.with_genres = options.genres;
        if (options.year) params.primary_release_year = options.year;
        if (options.minRating) params['vote_average.gte'] = options.minRating;
        if (options.maxRating) params['vote_average.lte'] = options.maxRating;
        if (options.releaseDateGte) params['primary_release_date.gte'] = options.releaseDateGte;
        if (options.releaseDateLte) params['primary_release_date.lte'] = options.releaseDateLte;
        if (options.voteCountGte) params['vote_count.gte'] = options.voteCountGte;
        if (options.watchProviders) params.with_watch_providers = options.watchProviders;
        if (options.watchRegion) params.watch_region = options.watchRegion;
        if (options.studios) params.with_companies = options.studios;

        return this.request('/discover/movie', params);
    }

    /**
     * Discover TV shows with filters
     * IMPORTANT: Matches Seerr's exact implementation for consistent results
     */
    async discoverTv(options = {}) {
        const params = {
            page: options.page || 1,
            sort_by: options.sortBy || 'popularity.desc',
            include_null_first_air_dates: false
        };

        // CRITICAL: Add language filter like Seerr does (defaults to English)
        if (options.originalLanguage) {
            params.with_original_language = options.originalLanguage;
        } else if (options.originalLanguage !== 'all') {
            // Default to English unless explicitly set to 'all'
            params.with_original_language = 'en';
        }

        if (options.genres) params.with_genres = options.genres;
        if (options.year) params.first_air_date_year = options.year;
        if (options.minRating) params['vote_average.gte'] = options.minRating;
        if (options.maxRating) params['vote_average.lte'] = options.maxRating;
        if (options.airDateGte) params['first_air_date.gte'] = options.airDateGte;
        if (options.airDateLte) params['first_air_date.lte'] = options.airDateLte;
        if (options.voteCountGte) params['vote_count.gte'] = options.voteCountGte;
        if (options.networks) params.with_networks = options.networks;
        if (options.watchProviders) params.with_watch_providers = options.watchProviders;
        if (options.watchRegion) params.watch_region = options.watchRegion;
        if (options.status) params.with_status = options.status;

        return this.request('/discover/tv', params);
    }

    /**
     * Get genre list for movies
     */
    async getMovieGenres() {
        return this.request('/genre/movie/list');
    }

    /**
     * Get genre list for TV shows
     */
    async getTvGenres() {
        return this.request('/genre/tv/list');
    }

    /**
     * Get available watch providers (streaming services) for a region
     */
    async getWatchProviders(mediaType = 'movie', region = 'US') {
        return this.request(`/watch/providers/${mediaType}`, { watch_region: region });
    }

    /**
     * Get person details
     */
    async getPerson(personId, appendToResponse = 'combined_credits,external_ids,images') {
        return this.request(`/person/${personId}`, {
            append_to_response: appendToResponse
        });
    }

    /**
     * Get collection details
     */
    async getCollection(collectionId) {
        return this.request(`/collection/${collectionId}`);
    }

    /**
     * Get watch providers for a movie
     */
    async getMovieWatchProviders(movieId) {
        return this.request(`/movie/${movieId}/watch/providers`);
    }

    /**
     * Get watch providers for a TV show
     */
    async getTvWatchProviders(tvId) {
        return this.request(`/tv/${tvId}/watch/providers`);
    }

    /**
     * Get external IDs for a movie
     */
    async getMovieExternalIds(movieId) {
        return this.request(`/movie/${movieId}/external_ids`);
    }

    /**
     * Get external IDs for a TV show
     */
    async getTvExternalIds(tvId) {
        return this.request(`/tv/${tvId}/external_ids`);
    }

    /**
     * Find media by external ID (IMDb, TVDB, etc.)
     */
    async findByExternalId(externalId, externalSource) {
        return this.request(`/find/${externalId}`, {
            external_source: externalSource
        });
    }

    /**
     * Get configuration (image sizes, etc.)
     */
    async getConfiguration() {
        return this.request('/configuration');
    }

    /**
     * Discover movies by studio (company)
     */
    async discoverMoviesByStudio(studioId, page = 1) {
        return this.request('/discover/movie', {
            with_companies: studioId,
            page,
            sort_by: 'popularity.desc'
        });
    }

    /**
     * Discover TV shows by network
     */
    async discoverTvByNetwork(networkId, page = 1) {
        return this.request('/discover/tv', {
            with_networks: networkId,
            page,
            sort_by: 'popularity.desc'
        });
    }

    /**
     * Get company details (studio)
     */
    async getCompany(companyId) {
        return this.request(`/company/${companyId}`);
    }

    /**
     * Get network details
     */
    async getNetwork(networkId) {
        return this.request(`/network/${networkId}`);
    }

    // ============ Static Helper Methods ============

    /**
     * Get poster URL
     */
    static getPosterUrl(posterPath, size = 'w500') {
        if (!posterPath) return null;
        return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
    }

    /**
     * Get backdrop URL
     */
    static getBackdropUrl(backdropPath, size = 'w1280') {
        if (!backdropPath) return null;
        return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`;
    }

    /**
     * Get profile image URL
     */
    static getProfileUrl(profilePath, size = 'w185') {
        if (!profilePath) return null;
        return `${TMDB_IMAGE_BASE}/${size}${profilePath}`;
    }

    /**
     * Get still image URL (for episodes)
     */
    static getStillUrl(stillPath, size = 'w300') {
        if (!stillPath) return null;
        return `${TMDB_IMAGE_BASE}/${size}${stillPath}`;
    }

    /**
     * Get logo URL
     */
    static getLogoUrl(logoPath, size = 'w300') {
        if (!logoPath) return null;
        return `${TMDB_IMAGE_BASE}/${size}${logoPath}`;
    }

    /**
     * Format runtime to human-readable string
     */
    static formatRuntime(minutes) {
        if (!minutes) return null;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}m`;
    }

    /**
     * Get year from date string
     */
    static getYear(dateString) {
        if (!dateString) return null;
        return dateString.substring(0, 4);
    }

    /**
     * Format vote average to percentage
     */
    static formatRating(voteAverage) {
        if (!voteAverage) return null;
        return Math.round(voteAverage * 10);
    }
}

module.exports = TMDBService;
