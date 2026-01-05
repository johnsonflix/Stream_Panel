/**
 * M3U Playlist Parser
 *
 * Parses M3U playlists to count channels, movies, and series
 * Also extracts channel logos for dashboard display
 */

const axios = require('axios');
const https = require('https');

// Create an https agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * Extract attribute value from #EXTINF line
 * @param {string} line - The #EXTINF line
 * @param {string} attr - Attribute name (e.g., 'tvg-logo', 'tvg-name')
 * @returns {string|null} Attribute value or null
 */
function extractAttribute(line, attr) {
    const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
    const match = line.match(regex);
    return match ? match[1] : null;
}

/**
 * Extract channel display name from #EXTINF line
 * The display name comes after the last comma
 * @param {string} line - The #EXTINF line
 * @returns {string|null} Channel name or null
 */
function extractChannelName(line) {
    // Format: #EXTINF:-1 tvg-id="..." tvg-name="..." ...,Channel Display Name
    const commaIndex = line.lastIndexOf(',');
    if (commaIndex !== -1 && commaIndex < line.length - 1) {
        return line.substring(commaIndex + 1).trim();
    }
    // Fallback to tvg-name attribute
    return extractAttribute(line, 'tvg-name');
}

/**
 * Normalize channel name for matching
 * Creates a simplified version for fuzzy matching
 * @param {string} name - Channel name
 * @returns {string} Normalized name
 */
function normalizeChannelName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/\s*(hd|sd|fhd|uhd|4k|hevc|h\.?265|h\.?264)\s*/gi, ' ')
        .replace(/\s*\([^)]*\)\s*/g, ' ')  // Remove parenthetical content
        .replace(/[^\w\s]/g, '')           // Remove special chars
        .replace(/\s+/g, ' ')              // Collapse whitespace
        .trim();
}

/**
 * Download and parse M3U playlist
 * @param {string} url - M3U playlist URL
 * @param {boolean} extractLogos - Whether to extract channel logos (default: true)
 * @returns {Promise<Object>} Counts of channels, movies, series, and optional logo map
 */
async function parseM3UPlaylist(url, extractLogos = true) {
    try {
        console.log(`📥 Downloading M3U playlist from: ${url}`);

        // Download playlist (allow self-signed certificates)
        const response = await axios.get(url, {
            timeout: 120000, // 120 second timeout for large playlists
            headers: {
                'User-Agent': 'StreamPanel/2.0'
            },
            maxContentLength: 100 * 1024 * 1024, // 100MB max
            httpsAgent: httpsAgent // Allow self-signed certificates
        });

        const content = response.data;

        console.log(`✅ Downloaded M3U playlist (${content.length} bytes)`);

        // Parse content
        const lines = content.split('\n');
        let liveChannels = 0;
        let vodMovies = 0;
        let vodSeries = 0;

        // Logo map: channelName -> logoUrl
        // Also store normalized name for fuzzy matching
        const channelLogos = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Look for #EXTINF lines (entry markers)
            if (line.startsWith('#EXTINF:')) {
                // Get the next line which should be the URL
                const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';

                if (nextLine && nextLine.length > 0 && !nextLine.startsWith('#')) {
                    // Check URL pattern to determine content type
                    // Movie URL pattern: .../movie/...
                    // Series URL pattern: .../series/...
                    // Live channel: everything else

                    if (nextLine.includes('/movie/')) {
                        vodMovies++;
                    }
                    else if (nextLine.includes('/series/')) {
                        vodSeries++;
                    }
                    else {
                        // Live channel - extract logo if enabled
                        liveChannels++;

                        if (extractLogos) {
                            const channelName = extractChannelName(line);
                            const logoUrl = extractAttribute(line, 'tvg-logo');
                            const groupTitle = extractAttribute(line, 'group-title');

                            if (channelName && logoUrl) {
                                const normalizedName = normalizeChannelName(channelName);
                                channelLogos[channelName] = {
                                    logo: logoUrl,
                                    normalized: normalizedName,
                                    group: groupTitle || 'Other'
                                };
                            }
                        }
                    }
                }
            }
        }

        const totalEntries = liveChannels + vodMovies + vodSeries;
        const logoCount = Object.keys(channelLogos).length;

        console.log(`✅ Parsed M3U playlist:`);
        console.log(`   - Total entries: ${totalEntries}`);
        console.log(`   - Live channels: ${liveChannels}`);
        console.log(`   - VOD movies: ${vodMovies}`);
        console.log(`   - VOD series: ${vodSeries}`);
        if (extractLogos) {
            console.log(`   - Channel logos extracted: ${logoCount}`);
        }

        return {
            liveChannels,
            vodMovies,
            vodSeries,
            total: totalEntries,
            channelLogos: extractLogos ? channelLogos : null
        };

    } catch (error) {
        console.error(`❌ Failed to parse M3U playlist:`, error.message);
        throw new Error(`Failed to parse M3U playlist: ${error.message}`);
    }
}

/**
 * Find logo for a stream name using fuzzy matching
 * @param {string} streamName - The stream name from live connection
 * @param {Object} channelLogos - The logo map from parseM3UPlaylist
 * @returns {Object|null} Logo info or null
 */
function findLogoForStream(streamName, channelLogos) {
    if (!streamName || !channelLogos) return null;

    // First try exact match
    if (channelLogos[streamName]) {
        return channelLogos[streamName];
    }

    // Normalize the stream name for fuzzy matching
    const normalizedStream = normalizeChannelName(streamName);

    // Try to find a match by normalized name
    for (const [channelName, logoInfo] of Object.entries(channelLogos)) {
        if (logoInfo.normalized === normalizedStream) {
            return logoInfo;
        }
    }

    // Try partial match (stream name contains channel name or vice versa)
    for (const [channelName, logoInfo] of Object.entries(channelLogos)) {
        if (normalizedStream.includes(logoInfo.normalized) ||
            logoInfo.normalized.includes(normalizedStream)) {
            return logoInfo;
        }
    }

    return null;
}

/**
 * Validate M3U URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid M3U URL
 */
function isValidM3UUrl(url) {
    if (!url) return false;

    try {
        const parsedUrl = new URL(url);

        // Check if it's HTTP/HTTPS
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return false;
        }

        // Check if it ends with .m3u or .m3u8 or has get_
        const pathname = parsedUrl.pathname.toLowerCase();
        if (pathname.endsWith('.m3u') ||
            pathname.endsWith('.m3u8') ||
            pathname.includes('get_') ||
            parsedUrl.search.includes('type=m3u')) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Parse M3U playlist and return full channel list with stream URLs
 * @param {string} url - M3U playlist URL
 * @returns {Promise<Array>} Array of channel objects with name, logo, url, group, etc.
 */
async function parseM3UChannels(url) {
    try {
        console.log(`📥 Downloading M3U playlist for channel list from: ${url}`);

        // Download playlist (allow self-signed certificates)
        const response = await axios.get(url, {
            timeout: 120000,
            headers: {
                'User-Agent': 'StreamPanel/2.0'
            },
            maxContentLength: 100 * 1024 * 1024,
            httpsAgent: httpsAgent
        });

        const content = response.data;
        console.log(`✅ Downloaded M3U playlist (${content.length} bytes)`);

        const lines = content.split('\n');
        const channels = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF:')) {
                // Get the next line which should be the URL
                const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';

                if (nextLine && nextLine.length > 0 && !nextLine.startsWith('#')) {
                    // Only include live channels (not /movie/ or /series/)
                    if (!nextLine.includes('/movie/') && !nextLine.includes('/series/')) {
                        const channelName = extractChannelName(line);
                        const tvgId = extractAttribute(line, 'tvg-id');
                        const tvgName = extractAttribute(line, 'tvg-name');
                        const tvgLogo = extractAttribute(line, 'tvg-logo');
                        const groupTitle = extractAttribute(line, 'group-title');

                        channels.push({
                            id: tvgId || channelName || `ch_${channels.length}`,
                            name: channelName || tvgName || `Channel ${channels.length + 1}`,
                            tvg_name: tvgName,
                            logo: tvgLogo || null,
                            group: groupTitle || 'Other',
                            url: nextLine
                        });
                    }
                }
            }
        }

        console.log(`✅ Parsed ${channels.length} live channels from M3U`);
        return channels;

    } catch (error) {
        console.error(`❌ Failed to parse M3U channels:`, error.message);
        throw new Error(`Failed to parse M3U channels: ${error.message}`);
    }
}

/**
 * Inject user credentials into Xtream Codes style stream URL
 * Replaces the username and password in URLs like:
 * http://provider.com/live/ADMIN/ADMIN/12345.ts
 * http://provider.com/get.php?username=ADMIN&password=ADMIN&type=...
 *
 * @param {string} url - Original stream URL
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {string} URL with injected credentials
 */
function injectCredentials(url, username, password) {
    if (!url || !username || !password) return url;

    try {
        // Pattern 1: /live/USERNAME/PASSWORD/stream_id.ts
        // Pattern 2: /USERNAME/PASSWORD/stream_id.ts
        // Replace path-based credentials
        const pathPattern = /\/live\/[^\/]+\/[^\/]+\//;
        if (url.match(pathPattern)) {
            return url.replace(pathPattern, `/live/${username}/${password}/`);
        }

        // Pattern 3: Direct path without /live/
        const directPathPattern = /\/([^\/]+)\/([^\/]+)\/(\d+)\.(ts|m3u8)$/;
        const match = url.match(directPathPattern);
        if (match) {
            return url.replace(directPathPattern, `/${username}/${password}/${match[3]}.${match[4]}`);
        }

        // Pattern 4: Query string parameters
        const urlObj = new URL(url);
        if (urlObj.searchParams.has('username') || urlObj.searchParams.has('password')) {
            urlObj.searchParams.set('username', username);
            urlObj.searchParams.set('password', password);
            return urlObj.toString();
        }

        // No credentials found in URL, return as-is
        return url;
    } catch (e) {
        console.error('Error injecting credentials:', e);
        return url;
    }
}

module.exports = {
    parseM3UPlaylist,
    parseM3UChannels,
    injectCredentials,
    isValidM3UUrl,
    findLogoForStream,
    normalizeChannelName
};
