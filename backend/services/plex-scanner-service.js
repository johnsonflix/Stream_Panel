/**
 * Plex Scanner Service - Seerr-Style Implementation
 *
 * Handles library scanning with:
 * - Full scan and Recently Added scan modes
 * - GUID caching for TMDB lookups
 * - Episode-level availability tracking
 * - 4K detection
 * - Async locking to prevent race conditions
 */

const axios = require('axios');
const db = require('../database-config');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

// Media status enum (matches Seerr)
const MediaStatus = {
    UNKNOWN: 0,
    PENDING: 1,
    PROCESSING: 2,
    PARTIALLY_AVAILABLE: 3,
    AVAILABLE: 4,
    DELETED: 5
};

// GUID regex patterns (matches Seerr)
// Supports both NEW agent format (Guid array) and OLD agent format (guid string)
const GUID_PATTERNS = {
    // New agent format patterns
    plex: /plex:\/\//,
    tmdb: /tmdb:\/\/(\d+)/,
    imdb: /imdb:\/\/(tt\d+)/,
    tvdb: /tvdb:\/\/(\d+)/,
    thetvdb: /thetvdb:\/\/(\d+)/,

    // Old agent format patterns (e.g., com.plexapp.agents.thetvdb://350028?lang=en)
    oldAgentTvdb: /com\.plexapp\.agents\.thetvdb:\/\/(\d+)/,
    oldAgentImdb: /com\.plexapp\.agents\.imdb:\/\/(tt\d+)/,
    oldAgentTmdb: /com\.plexapp\.agents\.themoviedb:\/\/(\d+)/,
    oldAgentHamaTvdb: /com\.plexapp\.agents\.hama:\/\/tvdb-(\d+)/,
    oldAgentHamaAnidb: /com\.plexapp\.agents\.hama:\/\/anidb-(\d+)/
};

class PlexScannerService {
    constructor() {
        this.asyncLocks = new Map(); // Prevent race conditions on same TMDB ID
        this.scanResults = {
            totalMovies: 0,
            totalTVShows: 0,
            totalEpisodes: 0,
            newlyAdded: 0,
            errors: []
        };
    }

    /**
     * Main scan entry point
     * @param {Object} options - Scan options
     * @param {number[]} options.serverIds - Server IDs to scan (optional, scans all if empty)
     * @param {boolean} options.recentOnly - If true, only scan recently added content
     * @param {Function} options.onProgress - Progress callback
     */
    async scan(options = {}) {
        const { serverIds, recentOnly = false, onProgress } = options;

        this.scanResults = {
            totalMovies: 0,
            totalTVShows: 0,
            totalEpisodes: 0,
            newlyAdded: 0,
            errors: [],
            servers: []
        };

        // Get Plex servers
        let servers;
        if (serverIds && serverIds.length > 0) {
            servers = await db.query(`SELECT * FROM plex_servers WHERE id = ANY($1::integer[]) AND is_active = 1`, [serverIds]);
        } else {
            servers = await db.query('SELECT * FROM plex_servers WHERE is_active = 1');
        }

        if (servers.length === 0) {
            throw new Error('No active Plex servers found');
        }

        console.log(`[Plex Scanner] Starting ${recentOnly ? 'RECENTLY ADDED' : 'FULL'} scan of ${servers.length} servers...`);

        for (const server of servers) {
            try {
                await this.scanServer(server, recentOnly, onProgress);
            } catch (error) {
                console.error(`[Plex Scanner] Error scanning server ${server.name}:`, error.message);
                this.scanResults.errors.push({
                    server: server.name,
                    error: error.message
                });
            }
        }

        console.log(`[Plex Scanner] Scan complete:`, this.scanResults);
        return this.scanResults;
    }

    /**
     * Scan a single Plex server
     */
    async scanServer(server, recentOnly, onProgress) {
        const serverResult = {
            name: server.name,
            movies: 0,
            tvShows: 0,
            episodes: 0
        };

        console.log(`[Plex Scanner] Scanning server: ${server.name} (${recentOnly ? 'recent only' : 'full scan'})`);

        // Get libraries
        const libraries = await this.getLibraries(server);
        console.log(`[Plex Scanner] Found ${libraries.length} libraries`);

        for (const library of libraries) {
            if (library.type !== 'movie' && library.type !== 'show') {
                continue; // Skip non-media libraries
            }

            const mediaType = library.type === 'movie' ? 'movie' : 'tv';
            console.log(`[Plex Scanner] Processing library: ${library.title} (${mediaType})`);

            let items;
            if (recentOnly && server.last_scan) {
                // Recently added mode - only get content added since last scan (with 10-min buffer)
                const addedAfter = Math.floor((server.last_scan - 600000) / 1000); // 10-min buffer
                items = await this.getRecentlyAdded(server, library.key, mediaType, addedAfter);
                console.log(`[Plex Scanner] Found ${items.length} recently added items since ${new Date(addedAfter * 1000).toISOString()}`);
            } else {
                // Full scan mode
                items = await this.getLibraryContents(server, library.key);
                console.log(`[Plex Scanner] Found ${items.length} total items`);
            }

            // Process items in batches
            const batchSize = 50;
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);

                for (const item of batch) {
                    try {
                        if (mediaType === 'movie') {
                            await this.processMovie(server, item);
                            serverResult.movies++;
                        } else {
                            const episodeCount = await this.processShow(server, item);
                            serverResult.tvShows++;
                            serverResult.episodes += episodeCount;
                        }
                    } catch (error) {
                        console.error(`[Plex Scanner] Error processing ${item.title}:`, error.message);
                    }
                }

                if (onProgress) {
                    onProgress({
                        current: Math.min(i + batchSize, items.length),
                        total: items.length,
                        library: library.title
                    });
                }

                // Rate limiting - small delay between batches
                await this.delay(100);
            }
        }

        // Update last_scan timestamp
        await db.query('UPDATE plex_servers SET last_scan = $1 WHERE id = $2', [new Date().toISOString(), server.id]);

        this.scanResults.totalMovies += serverResult.movies;
        this.scanResults.totalTVShows += serverResult.tvShows;
        this.scanResults.totalEpisodes += serverResult.episodes;
        this.scanResults.servers.push(serverResult);
    }

    /**
     * Get all libraries from a Plex server
     */
    async getLibraries(server) {
        const response = await axios.get(`${server.url}/library/sections`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            timeout: 30000
        });
        return response.data?.MediaContainer?.Directory || [];
    }

    /**
     * Get all content from a library (paginated)
     */
    async getLibraryContents(server, libraryKey, offset = 0, allItems = []) {
        const pageSize = 50;

        const response = await axios.get(`${server.url}/library/sections/${libraryKey}/all`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json',
                'X-Plex-Container-Start': offset.toString(),
                'X-Plex-Container-Size': pageSize.toString()
            },
            params: {
                includeGuids: 1
            },
            timeout: 30000
        });

        const items = response.data?.MediaContainer?.Metadata || [];
        const totalSize = response.data?.MediaContainer?.totalSize || 0;
        allItems.push(...items);

        // Fetch more if there are more items
        if (offset + pageSize < totalSize) {
            await this.delay(100); // Rate limiting
            return this.getLibraryContents(server, libraryKey, offset + pageSize, allItems);
        }

        return allItems;
    }

    /**
     * Get recently added content from a library
     */
    async getRecentlyAdded(server, libraryKey, mediaType, addedAfter) {
        const typeNum = mediaType === 'movie' ? 1 : 2; // Plex type numbers

        const response = await axios.get(`${server.url}/library/sections/${libraryKey}/all`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            params: {
                type: typeNum,
                sort: 'addedAt:desc',
                'addedAt>>': addedAfter,
                includeGuids: 1
            },
            timeout: 30000
        });

        return response.data?.MediaContainer?.Metadata || [];
    }

    /**
     * Get detailed metadata for an item (including children for TV shows)
     */
    async getMetadata(server, ratingKey, includeChildren = false) {
        const response = await axios.get(`${server.url}/library/metadata/${ratingKey}`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            params: includeChildren ? { includeChildren: 1 } : {},
            timeout: 15000
        });

        return response.data?.MediaContainer?.Metadata?.[0];
    }

    /**
     * Get detailed metadata with GUIDs for an item
     */
    async getMetadataWithGuids(server, ratingKey) {
        const response = await axios.get(`${server.url}/library/metadata/${ratingKey}`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            params: { includeGuids: 1 },
            timeout: 15000
        });

        return response.data?.MediaContainer?.Metadata?.[0];
    }

    /**
     * Get children metadata (seasons for shows, episodes for seasons)
     */
    async getChildren(server, ratingKey) {
        const response = await axios.get(`${server.url}/library/metadata/${ratingKey}/children`, {
            headers: {
                'X-Plex-Token': server.token,
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        return response.data?.MediaContainer?.Metadata || [];
    }

    /**
     * Extract media IDs from Plex GUIDs
     * Uses caching to avoid redundant TMDB lookups
     */
    async getMediaIds(server, item) {
        const ratingKey = item.ratingKey;

        // Check cache first
        const cached = await db.query(`
            SELECT tmdb_id, tvdb_id, imdb_id, media_type
            FROM plex_guid_cache
            WHERE plex_rating_key = $1 AND plex_server_id = $2
        `, [ratingKey, server.id]);

        if (cached.length > 0 && cached[0].tmdb_id) {
            return {
                tmdbId: cached[0].tmdb_id,
                tvdbId: cached[0].tvdb_id,
                imdbId: cached[0].imdb_id,
                mediaType: cached[0].media_type
            };
        }

        // Extract IDs from GUIDs
        const mediaIds = {
            tmdbId: null,
            tvdbId: null,
            imdbId: null,
            mediaType: item.type === 'movie' ? 'movie' : 'tv'
        };

        // Check if using new Plex agent (has Guid array)
        // If item doesn't have Guid array, try to fetch full metadata
        let guids = item.Guid || [];

        if (guids.length === 0 && item.ratingKey) {
            // No GUIDs in list response - fetch full metadata
            try {
                const fullMetadata = await this.getMetadataWithGuids(server, item.ratingKey);
                if (fullMetadata && fullMetadata.Guid) {
                    guids = fullMetadata.Guid;
                    // Also get the old guid string if present
                    if (fullMetadata.guid && !item.guid) {
                        item.guid = fullMetadata.guid;
                    }
                }
            } catch (e) {
                console.log(`[Plex Scanner] Could not fetch full metadata for: ${item.title}`);
            }
        }

        for (const guid of guids) {
            const id = guid.id || '';

            const tmdbMatch = id.match(GUID_PATTERNS.tmdb);
            if (tmdbMatch) {
                mediaIds.tmdbId = parseInt(tmdbMatch[1]);
            }

            const imdbMatch = id.match(GUID_PATTERNS.imdb);
            if (imdbMatch) {
                mediaIds.imdbId = imdbMatch[1];
            }

            const tvdbMatch = id.match(GUID_PATTERNS.tvdb) || id.match(GUID_PATTERNS.thetvdb);
            if (tvdbMatch) {
                mediaIds.tvdbId = parseInt(tvdbMatch[1]);
            }
        }

        // Also check old Plex agent format (singular 'guid' field)
        // Format: com.plexapp.agents.thetvdb://350028?lang=en
        if (item.guid) {
            const oldGuid = item.guid;

            // Check for TMDB ID from old agent
            if (!mediaIds.tmdbId) {
                const oldTmdbMatch = oldGuid.match(GUID_PATTERNS.oldAgentTmdb);
                if (oldTmdbMatch) {
                    mediaIds.tmdbId = parseInt(oldTmdbMatch[1]);
                    console.log(`[Plex Scanner] Extracted TMDB ID ${mediaIds.tmdbId} from old agent format for: ${item.title}`);
                }
            }

            // Check for IMDB ID from old agent
            if (!mediaIds.imdbId) {
                const oldImdbMatch = oldGuid.match(GUID_PATTERNS.oldAgentImdb);
                if (oldImdbMatch) {
                    mediaIds.imdbId = oldImdbMatch[1];
                    console.log(`[Plex Scanner] Extracted IMDB ID ${mediaIds.imdbId} from old agent format for: ${item.title}`);
                }
            }

            // Check for TVDB ID from old agent (standard thetvdb agent)
            if (!mediaIds.tvdbId) {
                const oldTvdbMatch = oldGuid.match(GUID_PATTERNS.oldAgentTvdb);
                if (oldTvdbMatch) {
                    mediaIds.tvdbId = parseInt(oldTvdbMatch[1]);
                    console.log(`[Plex Scanner] Extracted TVDB ID ${mediaIds.tvdbId} from old agent format for: ${item.title}`);
                }
            }

            // Check for TVDB ID from Hama agent (anime agent)
            if (!mediaIds.tvdbId) {
                const hamaMatch = oldGuid.match(GUID_PATTERNS.oldAgentHamaTvdb);
                if (hamaMatch) {
                    mediaIds.tvdbId = parseInt(hamaMatch[1]);
                    console.log(`[Plex Scanner] Extracted TVDB ID ${mediaIds.tvdbId} from Hama agent format for: ${item.title}`);
                }
            }
        }

        // If no TMDB ID found, look it up from IMDB or TVDB
        if (!mediaIds.tmdbId) {
            mediaIds.tmdbId = await this.lookupTmdbId(mediaIds, item.title, item.year);
        }

        // Cache the result
        if (mediaIds.tmdbId) {
            await db.query(`
                INSERT INTO plex_guid_cache (plex_rating_key, plex_server_id, tmdb_id, tvdb_id, imdb_id, media_type, title, year)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT(plex_rating_key, plex_server_id) DO UPDATE SET
                    tmdb_id = EXCLUDED.tmdb_id,
                    tvdb_id = EXCLUDED.tvdb_id,
                    imdb_id = EXCLUDED.imdb_id,
                    updated_at = NOW()
            `, [ratingKey, server.id, mediaIds.tmdbId, mediaIds.tvdbId, mediaIds.imdbId, mediaIds.mediaType, item.title, item.year]);
        }

        return mediaIds;
    }

    /**
     * Look up TMDB ID from IMDB or TVDB
     */
    async lookupTmdbId(mediaIds, title, year) {
        try {
            // Try IMDB lookup first
            if (mediaIds.imdbId) {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/find/${mediaIds.imdbId}`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            external_source: 'imdb_id'
                        },
                        timeout: 10000
                    }
                );

                // Check both movie and TV results - Plex might classify differently than TMDB
                const movieResults = response.data?.movie_results || [];
                const tvResults = response.data?.tv_results || [];

                // Prefer the type Plex thinks it is, but fall back to the other
                if (mediaIds.mediaType === 'movie') {
                    if (movieResults.length > 0) {
                        console.log(`[Plex Scanner] Found TMDB ID ${movieResults[0].id} via IMDB for: ${title}`);
                        return movieResults[0].id;
                    }
                    if (tvResults.length > 0) {
                        console.log(`[Plex Scanner] Found TMDB ID ${tvResults[0].id} via IMDB (as TV) for: ${title}`);
                        return tvResults[0].id;
                    }
                } else {
                    if (tvResults.length > 0) {
                        console.log(`[Plex Scanner] Found TMDB ID ${tvResults[0].id} via IMDB for: ${title}`);
                        return tvResults[0].id;
                    }
                    if (movieResults.length > 0) {
                        console.log(`[Plex Scanner] Found TMDB ID ${movieResults[0].id} via IMDB (as movie) for: ${title}`);
                        return movieResults[0].id;
                    }
                }
            }

            // Try TVDB lookup (also check movies in case of misclassification)
            if (mediaIds.tvdbId) {
                const response = await axios.get(
                    `https://api.themoviedb.org/3/find/${mediaIds.tvdbId}`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            external_source: 'tvdb_id'
                        },
                        timeout: 10000
                    }
                );

                const tvResults = response.data?.tv_results || [];
                const movieResults = response.data?.movie_results || [];

                if (tvResults.length > 0) {
                    console.log(`[Plex Scanner] Found TMDB ID ${tvResults[0].id} via TVDB for: ${title}`);
                    return tvResults[0].id;
                }
                if (movieResults.length > 0) {
                    console.log(`[Plex Scanner] Found TMDB ID ${movieResults[0].id} via TVDB (as movie) for: ${title}`);
                    return movieResults[0].id;
                }
            }

            // Fallback: Title-based search on TMDB
            if (title) {
                const searchType = mediaIds.mediaType === 'movie' ? 'movie' : 'tv';
                const searchUrl = `https://api.themoviedb.org/3/search/${searchType}`;

                const searchParams = {
                    api_key: TMDB_API_KEY,
                    query: title,
                    include_adult: false
                };

                // Add year filter if available
                if (year && !isNaN(parseInt(year))) {
                    if (searchType === 'movie') {
                        searchParams.year = parseInt(year);
                    } else {
                        searchParams.first_air_date_year = parseInt(year);
                    }
                }

                const searchResponse = await axios.get(searchUrl, {
                    params: searchParams,
                    timeout: 10000
                });

                const searchResults = searchResponse.data?.results || [];

                if (searchResults.length > 0) {
                    // Find best match by title similarity
                    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '').trim();
                    let bestMatch = null;
                    let bestScore = 0;

                    for (const result of searchResults.slice(0, 5)) {
                        const resultTitle = (result.title || result.name || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
                        const resultYear = new Date(result.release_date || result.first_air_date || '').getFullYear();

                        // Calculate match score
                        let score = 0;

                        // Exact title match
                        if (resultTitle === normalizedTitle) {
                            score += 100;
                        } else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
                            score += 50;
                        }

                        // Year match
                        if (year && resultYear === parseInt(year)) {
                            score += 50;
                        } else if (year && Math.abs(resultYear - parseInt(year)) <= 1) {
                            score += 25;
                        }

                        // Popularity boost for equally scored items
                        score += (result.popularity || 0) / 100;

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = result;
                        }
                    }

                    // Only accept if we have a reasonable match (at least partial title match)
                    if (bestMatch && bestScore >= 50) {
                        console.log(`[Plex Scanner] Found TMDB ID ${bestMatch.id} via title search for: ${title} (${year}) [score: ${Math.round(bestScore)}]`);
                        return bestMatch.id;
                    }
                }
            }

            console.log(`[Plex Scanner] Could not find TMDB ID for: ${title} (${year})`);
            return null;
        } catch (error) {
            console.error(`[Plex Scanner] TMDB lookup error for ${title}:`, error.message);
            return null;
        }
    }

    /**
     * Process a movie item
     */
    async processMovie(server, item) {
        const mediaIds = await this.getMediaIds(server, item);

        if (!mediaIds.tmdbId) {
            console.log(`[Plex Scanner] Skipping movie without TMDB ID: ${item.title}`);
            return;
        }

        // Use async lock to prevent race conditions
        await this.withLock(`movie-${mediaIds.tmdbId}`, async () => {
            // Detect 4K
            const has4k = this.detect4k(item);
            const hasStandard = this.detectStandard(item);

            // Check if record exists
            const existing = await db.query(`
                SELECT id, status, status_4k FROM request_site_media
                WHERE tmdb_id = $1 AND media_type = 'movie'
            `, [mediaIds.tmdbId]);

            if (existing.length > 0) {
                // Update existing record
                const updates = [];
                const params = [];
                let paramIndex = 1;

                if (hasStandard && existing[0].status !== MediaStatus.AVAILABLE) {
                    updates.push(`status = $${paramIndex++}`);
                    params.push(MediaStatus.AVAILABLE);
                    updates.push(`plex_rating_key = $${paramIndex++}`);
                    params.push(item.ratingKey);
                }

                if (has4k && existing[0].status_4k !== MediaStatus.AVAILABLE) {
                    updates.push(`status_4k = $${paramIndex++}`);
                    params.push(MediaStatus.AVAILABLE);
                    updates.push(`plex_rating_key_4k = $${paramIndex++}`);
                    params.push(item.ratingKey);
                }

                // Always update media_added_at with actual Plex addedAt timestamp
                if (item.addedAt) {
                    const plexAddedAt = new Date(item.addedAt * 1000).toISOString();
                    updates.push(`media_added_at = $${paramIndex++}`);
                    params.push(plexAddedAt);
                }

                if (updates.length > 0) {
                    updates.push(`plex_server_id = $${paramIndex++}`);
                    params.push(server.id);
                    updates.push(`updated_at = NOW()`);
                    params.push(mediaIds.tmdbId);

                    await db.query(`
                        UPDATE request_site_media
                        SET ${updates.join(', ')}
                        WHERE tmdb_id = $${paramIndex} AND media_type = 'movie'
                    `, params);

                    this.scanResults.newlyAdded++;
                }
            } else {
                // Insert new record - use actual Plex addedAt timestamp
                const plexAddedAt = item.addedAt
                    ? new Date(item.addedAt * 1000).toISOString()
                    : new Date().toISOString();

                await db.query(`
                    INSERT INTO request_site_media (
                        tmdb_id, tvdb_id, imdb_id, media_type, status, status_4k,
                        plex_rating_key, plex_rating_key_4k, plex_server_id,
                        media_added_at, created_at, updated_at
                    ) VALUES ($1, $2, $3, 'movie', $4, $5, $6, $7, $8, $9, NOW(), NOW())
                `, [
                    mediaIds.tmdbId,
                    mediaIds.tvdbId,
                    mediaIds.imdbId,
                    hasStandard ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN,
                    has4k ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN,
                    hasStandard ? item.ratingKey : null,
                    has4k ? item.ratingKey : null,
                    server.id,
                    plexAddedAt
                ]);

                this.scanResults.newlyAdded++;
            }
        });
    }

    /**
     * Process a TV show item
     */
    async processShow(server, item) {
        const mediaIds = await this.getMediaIds(server, item);

        if (!mediaIds.tmdbId) {
            console.log(`[Plex Scanner] Skipping show without TMDB ID: ${item.title}`);
            return 0;
        }

        let totalEpisodes = 0;

        await this.withLock(`tv-${mediaIds.tmdbId}`, async () => {
            // Get seasons from Plex
            const plexSeasons = await this.getChildren(server, item.ratingKey);

            // Get expected seasons from TMDB
            let tmdbSeasons = [];
            try {
                const tmdbResponse = await axios.get(
                    `https://api.themoviedb.org/3/tv/${mediaIds.tmdbId}`,
                    {
                        params: { api_key: TMDB_API_KEY },
                        timeout: 10000
                    }
                );
                tmdbSeasons = tmdbResponse.data?.seasons || [];
            } catch (e) {
                console.log(`[Plex Scanner] Could not fetch TMDB data for ${item.title}`);
            }

            // Ensure media record exists
            let mediaRecord = await db.query(`
                SELECT id, status, status_4k FROM request_site_media
                WHERE tmdb_id = $1 AND media_type = 'tv'
            `, [mediaIds.tmdbId]);

            if (mediaRecord.length === 0) {
                // Use actual Plex addedAt timestamp
                const plexAddedAt = item.addedAt
                    ? new Date(item.addedAt * 1000).toISOString()
                    : new Date().toISOString();

                const insertResult = await db.query(`
                    INSERT INTO request_site_media (
                        tmdb_id, tvdb_id, imdb_id, media_type, status, status_4k,
                        plex_rating_key, plex_server_id, media_added_at,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, 'tv', $4, $5, $6, $7, $8, NOW(), NOW())
                    RETURNING id
                `, [
                    mediaIds.tmdbId, mediaIds.tvdbId, mediaIds.imdbId,
                    MediaStatus.UNKNOWN, MediaStatus.UNKNOWN,
                    item.ratingKey, server.id, plexAddedAt
                ]);

                mediaRecord = [{ id: insertResult[0].id }];

                this.scanResults.newlyAdded++;
            } else {
                // Update existing TV show with actual Plex addedAt timestamp
                if (item.addedAt) {
                    const plexAddedAt = new Date(item.addedAt * 1000).toISOString();
                    await db.query(`
                        UPDATE request_site_media
                        SET media_added_at = $1, plex_rating_key = $2, plex_server_id = $3, updated_at = NOW()
                        WHERE tmdb_id = $4 AND media_type = 'tv'
                    `, [plexAddedAt, item.ratingKey, server.id, mediaIds.tmdbId]);
                }
            }

            // Process each Plex season
            let showHasAllEpisodes = true;
            let showHasAllEpisodes4k = true;
            let hasAnyContent = false;
            let hasAny4kContent = false;

            for (const plexSeason of plexSeasons) {
                const seasonNumber = plexSeason.index;
                if (seasonNumber === 0) continue; // Skip specials

                // Get episodes from Plex
                const plexEpisodes = await this.getChildren(server, plexSeason.ratingKey);
                totalEpisodes += plexEpisodes.length;

                // Count standard and 4K episodes
                let standardCount = 0;
                let fourKCount = 0;

                for (const ep of plexEpisodes) {
                    if (this.detectStandard(ep)) {
                        standardCount++;
                        hasAnyContent = true;
                    }
                    if (this.detect4k(ep)) {
                        fourKCount++;
                        hasAny4kContent = true;
                    }
                }

                // Get expected episode count from TMDB (only aired episodes)
                const tmdbSeason = tmdbSeasons.find(s => s.season_number === seasonNumber);
                let expectedEpisodes = plexEpisodes.length;

                if (tmdbSeason) {
                    try {
                        const seasonDetails = await axios.get(
                            `https://api.themoviedb.org/3/tv/${mediaIds.tmdbId}/season/${seasonNumber}`,
                            {
                                params: { api_key: TMDB_API_KEY },
                                timeout: 10000
                            }
                        );

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const airedEpisodes = (seasonDetails.data?.episodes || []).filter(ep => {
                            if (!ep.air_date) return false;
                            return new Date(ep.air_date) <= today;
                        });

                        expectedEpisodes = airedEpisodes.length;
                    } catch (e) {
                        expectedEpisodes = tmdbSeason.episode_count;
                    }
                }

                // Determine season status
                let seasonStatus = MediaStatus.AVAILABLE;
                let seasonStatus4k = MediaStatus.UNKNOWN;

                if (standardCount < expectedEpisodes) {
                    seasonStatus = standardCount > 0 ? MediaStatus.PARTIALLY_AVAILABLE : MediaStatus.UNKNOWN;
                    showHasAllEpisodes = false;
                }

                if (fourKCount > 0) {
                    seasonStatus4k = fourKCount >= expectedEpisodes ? MediaStatus.AVAILABLE : MediaStatus.PARTIALLY_AVAILABLE;
                    if (fourKCount < expectedEpisodes) {
                        showHasAllEpisodes4k = false;
                    }
                } else {
                    showHasAllEpisodes4k = false;
                }

                // Update season record
                await db.query(`
                    INSERT INTO request_site_seasons (
                        media_id, season_number, status, status_4k, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, NOW(), NOW())
                    ON CONFLICT(media_id, season_number) DO UPDATE SET
                        status = GREATEST(request_site_seasons.status, EXCLUDED.status),
                        status_4k = GREATEST(request_site_seasons.status_4k, EXCLUDED.status_4k),
                        updated_at = NOW()
                `, [mediaRecord[0].id, seasonNumber, seasonStatus, seasonStatus4k]);
            }

            // Update show status
            let showStatus = MediaStatus.UNKNOWN;
            let showStatus4k = MediaStatus.UNKNOWN;

            if (hasAnyContent) {
                showStatus = showHasAllEpisodes ? MediaStatus.AVAILABLE : MediaStatus.PARTIALLY_AVAILABLE;
            }
            if (hasAny4kContent) {
                showStatus4k = showHasAllEpisodes4k ? MediaStatus.AVAILABLE : MediaStatus.PARTIALLY_AVAILABLE;
            }

            await db.query(`
                UPDATE request_site_media
                SET status = $1, status_4k = $2, plex_rating_key = $3, plex_server_id = $4, updated_at = NOW()
                WHERE id = $5
            `, [showStatus, showStatus4k, item.ratingKey, server.id, mediaRecord[0].id]);
        });

        return totalEpisodes;
    }

    /**
     * Detect if item has 4K quality
     */
    detect4k(item) {
        const media = item.Media || [];
        return media.some(m =>
            m.videoResolution === '4k' ||
            (m.width && m.width >= 3840)
        );
    }

    /**
     * Detect if item has standard (non-4K) quality
     */
    detectStandard(item) {
        const media = item.Media || [];
        return media.some(m =>
            m.videoResolution !== '4k' &&
            (!m.width || m.width < 3840)
        );
    }

    /**
     * Async lock helper
     */
    async withLock(key, fn) {
        while (this.asyncLocks.has(key)) {
            await this.delay(10);
        }
        this.asyncLocks.set(key, true);
        try {
            return await fn();
        } finally {
            this.asyncLocks.delete(key);
        }
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear GUID cache for a server
     */
    async clearCache(serverId) {
        await db.query('DELETE FROM plex_guid_cache WHERE plex_server_id = $1', [serverId]);
    }

    /**
     * Close - no-op for PostgreSQL (pool handles connections)
     */
    close() {
        // No-op
    }
}

module.exports = { PlexScannerService, MediaStatus };
