/**
 * Media Managers Routes
 *
 * CRUD operations for media manager tools (Sonarr, Radarr, qBittorrent, SABnzbd)
 * and proxy endpoints to access these tools without CORS issues.
 */

const express = require('express');
const axios = require('axios');
const { query } = require('../database-config');

const router = express.Router();

// Session storage for qBittorrent (in-memory, keyed by manager ID)
const qbSessions = new Map();

// Default icons for known tool types (official logos from CDN)
const DEFAULT_ICONS = {
    sonarr: 'https://raw.githubusercontent.com/Sonarr/Sonarr/develop/Logo/256.png',
    radarr: 'https://raw.githubusercontent.com/Radarr/Radarr/develop/Logo/256.png',
    qbittorrent: 'https://raw.githubusercontent.com/qbittorrent/qBittorrent/master/src/icons/qbittorrent-tray.svg',
    sabnzbd: 'https://raw.githubusercontent.com/sabnzbd/sabnzbd/develop/icons/logo-full.svg',
    other_arr: null,  // No default - user should provide custom icon
    other: null       // No default - user should provide custom icon
};

// ============ Auth Middleware ============

async function requireAdmin(req, res, next) {
    try {
        // Accept token from Authorization header OR query param (for iframes)
        // Handle case where token could be an array (from multiple query params)
        let queryToken = req.query.token;
        if (Array.isArray(queryToken)) {
            queryToken = queryToken[0]; // Use first token if multiple provided
        }
        const sessionToken = req.headers.authorization?.replace('Bearer ', '') || queryToken;

        if (!sessionToken) {
            return res.status(401).json({ error: 'No session token provided' });
        }

        const sessions = await query(
            `SELECT * FROM sessions WHERE session_token = ? AND datetime(expires_at) > datetime('now')`,
            [sessionToken]
        );

        if (sessions.length === 0) {
            return res.status(401).json({ error: 'Session expired or invalid' });
        }

        const users = await query('SELECT * FROM users WHERE id = ?', [sessions[0].user_id]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        console.error('[Media Managers] Auth error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
}

// ============ CRUD Endpoints ============

// GET /api/v2/media-managers - List all media managers
router.get('/', requireAdmin, async (req, res) => {
    try {
        const managers = await query(
            'SELECT id, name, type, url, icon_url, connection_mode, is_enabled, display_order, show_in_dropdown, created_at FROM media_managers ORDER BY display_order ASC, name ASC'
        );
        // Add effective_icon (custom or default) to each manager
        const managersWithIcons = managers.map(m => ({
            ...m,
            show_in_dropdown: m.show_in_dropdown !== 0, // Convert to boolean
            effective_icon: m.icon_url || DEFAULT_ICONS[m.type] || null
        }));
        res.json({ managers: managersWithIcons });
    } catch (error) {
        console.error('[Media Managers] Error listing managers:', error);
        res.status(500).json({ error: 'Failed to list media managers' });
    }
});

// PUT /api/v2/media-managers/reorder - Reorder media managers (MUST be before /:id routes)
router.put('/reorder', requireAdmin, async (req, res) => {
    try {
        const { order } = req.body;

        if (!Array.isArray(order) || order.length === 0) {
            return res.status(400).json({ error: 'Order array is required' });
        }

        // Update display_order for each manager
        for (let i = 0; i < order.length; i++) {
            await query(
                'UPDATE media_managers SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [i, order[i]]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Media Managers] Error reordering managers:', error);
        res.status(500).json({ error: 'Failed to reorder media managers' });
    }
});

// GET /api/v2/media-managers/:id - Get single media manager (with credentials for edit)
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        const manager = managers[0];
        manager.effective_icon = manager.icon_url || DEFAULT_ICONS[manager.type] || null;

        res.json({ manager });
    } catch (error) {
        console.error('[Media Managers] Error getting manager:', error);
        res.status(500).json({ error: 'Failed to get media manager' });
    }
});

// POST /api/v2/media-managers - Create new media manager
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { name, type, url, api_key, username, password, connection_mode, is_enabled, display_order, icon_url, show_in_dropdown } = req.body;

        if (!name || !type || !url) {
            return res.status(400).json({ error: 'Name, type, and URL are required' });
        }

        const validTypes = ['sonarr', 'radarr', 'qbittorrent', 'sabnzbd', 'other_arr', 'other'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Must be: sonarr, radarr, qbittorrent, sabnzbd, other_arr, or other' });
        }

        const result = await query(
            `INSERT INTO media_managers (name, type, url, api_key, username, password, connection_mode, is_enabled, display_order, icon_url, show_in_dropdown)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                type,
                url.replace(/\/$/, ''), // Remove trailing slash
                api_key || null,
                username || null,
                password || null,
                connection_mode || 'proxy',
                is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1,
                display_order || 0,
                icon_url || null,
                show_in_dropdown !== undefined ? (show_in_dropdown ? 1 : 0) : 1
            ]
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('[Media Managers] Error creating manager:', error);
        res.status(500).json({ error: 'Failed to create media manager' });
    }
});

// PUT /api/v2/media-managers/:id - Update media manager
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { name, type, url, api_key, username, password, connection_mode, is_enabled, display_order, icon_url, show_in_dropdown } = req.body;

        const existing = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        await query(
            `UPDATE media_managers SET
                name = ?,
                type = ?,
                url = ?,
                api_key = ?,
                username = ?,
                password = ?,
                connection_mode = ?,
                is_enabled = ?,
                display_order = ?,
                icon_url = ?,
                show_in_dropdown = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                name || existing[0].name,
                type || existing[0].type,
                url ? url.replace(/\/$/, '') : existing[0].url,
                api_key !== undefined ? api_key : existing[0].api_key,
                username !== undefined ? username : existing[0].username,
                password !== undefined ? password : existing[0].password,
                connection_mode || existing[0].connection_mode,
                is_enabled !== undefined ? (is_enabled ? 1 : 0) : existing[0].is_enabled,
                display_order !== undefined ? display_order : existing[0].display_order,
                icon_url !== undefined ? icon_url : existing[0].icon_url,
                show_in_dropdown !== undefined ? (show_in_dropdown ? 1 : 0) : existing[0].show_in_dropdown,
                req.params.id
            ]
        );

        // Clear qBittorrent session cache if credentials changed
        if (type === 'qbittorrent' || existing[0].type === 'qbittorrent') {
            qbSessions.delete(parseInt(req.params.id));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Media Managers] Error updating manager:', error);
        res.status(500).json({ error: 'Failed to update media manager' });
    }
});

// DELETE /api/v2/media-managers/:id - Delete media manager
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const result = await query('DELETE FROM media_managers WHERE id = ?', [req.params.id]);

        // Clear any cached sessions
        qbSessions.delete(parseInt(req.params.id));

        res.json({ success: true });
    } catch (error) {
        console.error('[Media Managers] Error deleting manager:', error);
        res.status(500).json({ error: 'Failed to delete media manager' });
    }
});

// POST /api/v2/media-managers/test-config - Test connection without saving to DB
router.post('/test-config', requireAdmin, async (req, res) => {
    try {
        const { type, url, api_key, username, password } = req.body;

        if (!type || !url) {
            return res.status(400).json({ success: false, error: 'Type and URL are required' });
        }

        const testResult = await testConnection({ type, url, api_key, username, password });
        res.json(testResult);
    } catch (error) {
        console.error('[Media Managers] Error testing config:', error);
        res.status(500).json({ success: false, error: error.message || 'Connection test failed' });
    }
});

// POST /api/v2/media-managers/:id/test - Test connection to media manager
router.post('/:id/test', requireAdmin, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        const manager = managers[0];
        const testResult = await testConnection(manager);

        res.json(testResult);
    } catch (error) {
        console.error('[Media Managers] Error testing connection:', error);
        res.status(500).json({ success: false, error: error.message || 'Connection test failed' });
    }
});

// ============ Connection Testing ============

async function testConnection(manager) {
    const { type, url, api_key, username, password } = manager;

    try {
        switch (type) {
            case 'sonarr':
            case 'radarr': {
                // Test using system/status endpoint
                const response = await axios.get(`${url}/api/v3/system/status`, {
                    headers: { 'X-Api-Key': api_key },
                    timeout: 10000
                });
                return {
                    success: true,
                    version: response.data.version,
                    message: `Connected to ${type} v${response.data.version}`
                };
            }

            case 'qbittorrent': {
                // Test by logging in
                const loginResponse = await axios.post(
                    `${url}/api/v2/auth/login`,
                    `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
                    {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        timeout: 10000
                    }
                );

                if (loginResponse.data === 'Ok.' || loginResponse.status === 200) {
                    // Get version
                    const cookie = loginResponse.headers['set-cookie']?.[0]?.split(';')[0];
                    const versionResponse = await axios.get(`${url}/api/v2/app/version`, {
                        headers: { 'Cookie': cookie },
                        timeout: 10000
                    });
                    return {
                        success: true,
                        version: versionResponse.data,
                        message: `Connected to qBittorrent ${versionResponse.data}`
                    };
                }
                return { success: false, error: 'Login failed' };
            }

            case 'sabnzbd': {
                // Normalize URL (strip /login if present) so API call works correctly
                // Users may enter either base URL or full login URL
                const sabBaseUrl = url.replace(/\/login\/?$/, '');
                // Test using version endpoint with API key
                const response = await axios.get(`${sabBaseUrl}/api`, {
                    params: {
                        mode: 'version',
                        apikey: api_key,
                        output: 'json'
                    },
                    timeout: 10000
                });
                return {
                    success: true,
                    version: response.data.version,
                    message: `Connected to SABnzbd ${response.data.version}`
                };
            }

            case 'other_arr': {
                // Other *arr tools use different API versions:
                // - Prowlarr, Lidarr, Readarr use /api/v1/system/status
                // - Some may use /api/v3/system/status
                // Try v1 first (more common for other *arr tools), then v3
                const apiVersions = ['v1', 'v3'];
                for (const version of apiVersions) {
                    try {
                        const response = await axios.get(`${url}/api/${version}/system/status`, {
                            headers: { 'X-Api-Key': api_key },
                            timeout: 5000
                        });
                        return {
                            success: true,
                            version: response.data.version,
                            message: `Connected! Version: ${response.data.version}`
                        };
                    } catch (e) {
                        // Try next version
                        continue;
                    }
                }
                // If all API versions fail, throw error
                throw new Error('Could not connect to API (tried v1 and v3)');
            }

            case 'other': {
                // Generic tool - just test if URL is reachable
                const response = await axios.get(url, {
                    timeout: 10000,
                    validateStatus: () => true // Accept any status code
                });
                if (response.status >= 200 && response.status < 500) {
                    return {
                        success: true,
                        message: `URL reachable (HTTP ${response.status})`
                    };
                }
                return { success: false, error: `HTTP ${response.status}` };
            }

            default:
                return { success: false, error: 'Unknown manager type' };
        }
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message || 'Connection failed';
        return { success: false, error: errorMsg };
    }
}

// ============ Proxy Endpoints ============

// Static asset extensions that don't require auth (fonts, images, JS, CSS, etc.)
// These are non-sensitive resources - actual API data still requires auth
const STATIC_ASSET_EXTENSIONS = [
    // Fonts
    '.woff2', '.woff', '.ttf', '.eot', '.otf',
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    // Scripts and styles (webpack chunks, etc.)
    '.js', '.css',
    // Data files
    '.json',
    // Other static assets
    '.map' // Source maps
];

// Allowed external image domains that we'll proxy (for movie posters, etc.)
const ALLOWED_EXTERNAL_DOMAINS = [
    'image.tmdb.org',
    'artworks.thetvdb.com',
    'assets.fanart.tv',
    'fanart.tv',
    'thetvdb.com',
    'themoviedb.org'
];

function isStaticAsset(path) {
    const lowerPath = path.toLowerCase();
    return STATIC_ASSET_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

function isAllowedExternalDomain(url) {
    try {
        const urlObj = new URL(url);
        return ALLOWED_EXTERNAL_DOMAINS.some(domain =>
            urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

// Helper: Get qBittorrent session cookie
async function getQbSession(manager) {
    const managerId = manager.id;
    const cached = qbSessions.get(managerId);

    // Check if we have a valid cached session (cache for 30 minutes)
    if (cached && cached.timestamp > Date.now() - 30 * 60 * 1000) {
        return cached.cookie;
    }

    // Login to get new session
    const loginResponse = await axios.post(
        `${manager.url}/api/v2/auth/login`,
        `username=${encodeURIComponent(manager.username)}&password=${encodeURIComponent(manager.password)}`,
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        }
    );

    const cookie = loginResponse.headers['set-cookie']?.[0]?.split(';')[0];

    if (cookie) {
        qbSessions.set(managerId, { cookie, timestamp: Date.now() });
    }

    return cookie;
}

// GET /api/v2/media-managers/external-proxy - Proxy external image requests (TMDB, Fanart, etc.)
// This allows movie posters and other external images to load in the proxied iframe
router.get('/external-proxy', async (req, res) => {
    try {
        const externalUrl = req.query.url;

        if (!externalUrl) {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        // Validate this is an allowed external domain
        if (!isAllowedExternalDomain(externalUrl)) {
            return res.status(403).json({ error: 'Domain not allowed for external proxy' });
        }

        // Fetch the external resource
        const response = await axios.get(externalUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'StreamPanel/1.0',
                'Accept': req.headers['accept'] || 'image/*,*/*'
            },
            validateStatus: () => true
        });

        // Get content type
        const contentType = response.headers['content-type'] || 'application/octet-stream';

        // Cache for 1 day since movie posters don't change often
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('Content-Type', contentType);
        res.status(response.status);
        res.send(response.data);

    } catch (error) {
        console.error('[Media Managers] External proxy error:', error.message);
        res.status(502).json({ error: 'External proxy request failed', details: error.message });
    }
});

// GET /api/v2/media-managers/:id/proxy/* - Proxy requests to the media manager
// Static assets (fonts, images) don't require auth since they're non-sensitive
router.all('/:id/proxy/*', async (req, res, next) => {
    const targetPath = req.params[0] || '';

    // Skip auth for static assets (fonts, images, etc.)
    if (isStaticAsset(targetPath)) {
        return next();
    }

    // Require admin auth for all other requests
    return requireAdmin(req, res, next);
}, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        const manager = managers[0];

        // Get the path after /proxy/
        let targetPath = req.params[0] || '';

        // Build the target URL
        let targetUrl = `${manager.url}/${targetPath}`;

        // Preserve query string
        if (Object.keys(req.query).length > 0) {
            const queryString = new URLSearchParams(req.query).toString();
            targetUrl += `?${queryString}`;
        }

        // Build headers for the proxied request
        const headers = {};

        // Add authentication based on manager type
        switch (manager.type) {
            case 'sonarr':
            case 'radarr':
                headers['X-Api-Key'] = manager.api_key;
                break;

            case 'qbittorrent':
                const qbCookie = await getQbSession(manager);
                if (qbCookie) {
                    headers['Cookie'] = qbCookie;
                }
                break;

            case 'sabnzbd':
                // SABnzbd uses API key as query param, add it if not present
                if (!targetUrl.includes('apikey=')) {
                    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `apikey=${manager.api_key}`;
                }
                break;
        }

        // Forward certain headers from original request
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'];
        }
        if (req.headers['accept']) {
            headers['Accept'] = req.headers['accept'];
        }

        // Make the proxied request
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers,
            data: req.body,
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true // Don't throw on any status
        });

        // Get content type
        const contentType = response.headers['content-type'] || 'application/octet-stream';

        // Get token for URL rewriting (needed for subsequent iframe requests)
        // Handle case where token could be an array
        let token = req.query.token || '';
        if (Array.isArray(token)) {
            token = token[0];
        }
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        const tokenAmpParam = token ? `&token=${encodeURIComponent(token)}` : '';

        // For HTML responses, we need to rewrite URLs and inject fetch interceptor
        if (contentType.includes('text/html')) {
            let html = response.data.toString('utf-8');

            // Rewrite absolute URLs to go through our proxy
            const proxyBase = `/api/v2/media-managers/${manager.id}/proxy`;
            const externalProxy = '/api/v2/media-managers/external-proxy';

            // KEY FIX: Modify window.Radarr or window.Sonarr urlBase to our proxy path
            // This is the PROPER way to make these apps work behind a reverse proxy.
            // The apps read urlBase and use it for:
            // - React Router's basename (so /movie becomes /api/v2/media-managers/1/proxy/movie)
            // - __webpack_public_path__ for chunk loading
            // - API calls
            if (manager.type === 'radarr' || manager.type === 'sonarr') {
                const appName = manager.type === 'radarr' ? 'Radarr' : 'Sonarr';

                // Debug: Find all urlBase occurrences in the HTML
                const urlBaseMatches = html.match(/urlBase[^,}]*/g);
                console.log(`[Media Managers] Found urlBase patterns in HTML:`, urlBaseMatches);

                // Also log a snippet of the HTML around where window.Radarr/Sonarr is defined
                const configMatch = html.match(new RegExp(`window\\.${appName}\\s*=\\s*\\{[^}]{0,500}`, 'i'));
                if (configMatch) {
                    console.log(`[Media Managers] Config snippet: ${configMatch[0].substring(0, 200)}...`);
                }

                const originalHtml = html;
                let replacementCount = 0;

                // Replace ALL occurrences of urlBase regardless of quoting style
                // Pattern 1: Quoted property name "urlBase": "value" or 'urlBase': 'value'
                html = html.replace(/(["']urlBase["']\s*:\s*)(["'])([^"']*)(["'])/g, (match, prefix, q1, value, q2) => {
                    replacementCount++;
                    console.log(`[Media Managers] Replacing quoted urlBase #${replacementCount}: "${value}" -> "${proxyBase}"`);
                    return `${prefix}${q1}${proxyBase}${q2}`;
                });

                // Pattern 2: Unquoted property name urlBase: "value" (common in minified code)
                // Be careful not to re-match already replaced ones
                html = html.replace(/((?<!['"]))urlBase\s*:\s*(["'])([^"']*)(["'])/g, (match, lookbehind, q1, value, q2) => {
                    // Skip if already starts with proxy path (was replaced above)
                    if (value === proxyBase) return match;
                    replacementCount++;
                    console.log(`[Media Managers] Replacing unquoted urlBase #${replacementCount}: "${value}" -> "${proxyBase}"`);
                    return `urlBase:${q1}${proxyBase}${q2}`;
                });

                if (replacementCount > 0) {
                    console.log(`[Media Managers] Successfully modified ${replacementCount} urlBase occurrence(s) to: ${proxyBase}`);
                } else {
                    console.log(`[Media Managers] WARNING: Could not find urlBase in HTML for ${appName}`);
                }
            }

            // Rewrite href="/..." and src="/..." for internal paths
            html = html.replace(/((href|src|action)=["'])\//g, `$1${proxyBase}/`);

            // Rewrite url(/) in inline CSS
            html = html.replace(/url\(\s*["']?\//g, `url(${proxyBase}/`);

            // Rewrite external image URLs in img src attributes
            const allowedDomains = ['image.tmdb.org', 'artworks.thetvdb.com', 'assets.fanart.tv', 'fanart.tv', 'thetvdb.com', 'themoviedb.org'];
            html = html.replace(/(src=["'])(https?:\/\/[^"']+)(["'])/g, (match, prefix, url, suffix) => {
                try {
                    const urlObj = new URL(url);
                    if (allowedDomains.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d))) {
                        return `${prefix}${externalProxy}?url=${encodeURIComponent(url)}${suffix}`;
                    }
                } catch {}
                return match;
            });

            // Inject interceptor script for fetch/XHR/dynamic assets
            // Note: With urlBase properly set, we don't need to patch browser APIs for routing
            // We still need this for external image proxying and token injection
            const interceptorScript = `
<script>
(function() {
    const PROXY_BASE = '${proxyBase}';
    const EXTERNAL_PROXY = '/api/v2/media-managers/external-proxy';
    const TOKEN = '${token}';
    const CURRENT_ORIGIN = window.location.origin;

    console.log('[StreamPanel Proxy] Interceptor loaded, PROXY_BASE:', PROXY_BASE);

    // External image domains that should be proxied (for movie posters)
    const EXTERNAL_IMAGE_DOMAINS = [
        'image.tmdb.org',
        'artworks.thetvdb.com',
        'assets.fanart.tv',
        'fanart.tv',
        'thetvdb.com',
        'themoviedb.org'
    ];

    // Check if URL is from an allowed external image domain
    function isExternalImageDomain(url) {
        try {
            const urlObj = new URL(url);
            return EXTERNAL_IMAGE_DOMAINS.some(domain =>
                urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
            );
        } catch {
            return false;
        }
    }

    // Helper to check if our token param is already in URL
    // Must check for exact param name to avoid matching "access_token" etc
    function hasOurToken(url) {
        return url.includes('?token=') || url.includes('&token=');
    }

    // Rewrite image URLs - both external (TMDB) and internal (Radarr's own images)
    function rewriteExternalImageUrl(url) {
        if (!url) return url;
        let urlStr = url.toString();

        // Skip if already proxied
        if (urlStr.includes(EXTERNAL_PROXY) || urlStr.includes(PROXY_BASE)) return urlStr;

        // Skip data/blob URLs
        if (urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return urlStr;

        // Check if this is an external image domain we should proxy
        if (isExternalImageDomain(urlStr)) {
            return EXTERNAL_PROXY + '?url=' + encodeURIComponent(urlStr);
        }

        // Handle same-origin absolute URLs (React may normalize to full URL)
        if (urlStr.startsWith(CURRENT_ORIGIN + '/')) {
            let path = urlStr.substring(CURRENT_ORIGIN.length);
            let newUrl = PROXY_BASE + path;
            if (TOKEN && !hasOurToken(newUrl)) {
                newUrl += (newUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
            }
            return newUrl;
        }

        // Handle internal paths (Radarr's own images like logo, icons, etc.)
        if (urlStr.startsWith('/')) {
            let newUrl = PROXY_BASE + urlStr;
            if (TOKEN && !hasOurToken(newUrl)) {
                newUrl += (newUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
            }
            return newUrl;
        }

        return urlStr;
    }

    // Helper to rewrite URL (for internal requests)
    function rewriteUrl(url) {
        if (!url) return url;
        let urlStr = url.toString();

        // Skip if already proxied
        if (urlStr.includes(PROXY_BASE) || urlStr.includes(EXTERNAL_PROXY)) return urlStr;
        // Skip data/blob URLs
        if (urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return urlStr;

        // Check for same-origin absolute URLs (e.g., http://localhost:3080/signalr/...)
        // SignalR and other libs normalize URLs to absolute before fetch
        if (urlStr.startsWith(CURRENT_ORIGIN + '/')) {
            // Extract the path portion and rewrite through proxy
            let path = urlStr.substring(CURRENT_ORIGIN.length);
            let newUrl = PROXY_BASE + path;
            if (TOKEN && !hasOurToken(newUrl)) {
                newUrl += (newUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
            }
            return newUrl;
        }

        // For external URLs, check if they're image domains we should proxy
        if (urlStr.startsWith('http://') || urlStr.startsWith('https://') || urlStr.startsWith('//')) {
            // Check if it's an external image domain
            if (isExternalImageDomain(urlStr)) {
                return EXTERNAL_PROXY + '?url=' + encodeURIComponent(urlStr);
            }
            // Skip other external URLs
            return urlStr;
        }

        // Rewrite absolute paths
        if (urlStr.startsWith('/')) {
            let newUrl = PROXY_BASE + urlStr;
            // Add token (only if not already present)
            if (TOKEN && !hasOurToken(newUrl)) {
                newUrl += (newUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
            }
            return newUrl;
        }

        return urlStr;
    }

    // Override fetch
    const originalFetch = window.fetch;
    window.fetch = function(resource, init) {
        if (typeof resource === 'string') {
            resource = rewriteUrl(resource);
        } else if (resource instanceof Request) {
            resource = new Request(rewriteUrl(resource.url), resource);
        }
        return originalFetch.call(this, resource, init);
    };

    // Override XMLHttpRequest.open
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        return originalXHROpen.call(this, method, rewriteUrl(url), ...rest);
    };

    // Override createElement to catch dynamic script/link/img elements
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
        const element = originalCreateElement(tagName, options);
        const tag = tagName.toLowerCase();

        if (tag === 'script') {
            // Intercept src property setter
            const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            Object.defineProperty(element, 'src', {
                get: function() { return originalSrcDescriptor.get.call(this); },
                set: function(value) { originalSrcDescriptor.set.call(this, rewriteUrl(value)); },
                configurable: true
            });
        } else if (tag === 'link') {
            // Intercept href property setter
            const originalHrefDescriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
            Object.defineProperty(element, 'href', {
                get: function() { return originalHrefDescriptor.get.call(this); },
                set: function(value) { originalHrefDescriptor.set.call(this, rewriteUrl(value)); },
                configurable: true
            });
        } else if (tag === 'img') {
            // Intercept img src property setter for external images
            const originalImgSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            Object.defineProperty(element, 'src', {
                get: function() { return originalImgSrcDescriptor.get.call(this); },
                set: function(value) { originalImgSrcDescriptor.set.call(this, rewriteExternalImageUrl(value)); },
                configurable: true
            });
        }

        return element;
    };

    // Also override Image constructor for new Image() calls
    const OriginalImage = window.Image;
    window.Image = function(width, height) {
        const img = new OriginalImage(width, height);
        const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(img, 'src', {
            get: function() { return originalSrcDescriptor.get.call(this); },
            set: function(value) { originalSrcDescriptor.set.call(this, rewriteExternalImageUrl(value)); },
            configurable: true
        });
        return img;
    };
    window.Image.prototype = OriginalImage.prototype;

    // Override WebSocket for SignalR WebSocket connections
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        let rewrittenUrl = url;
        if (url) {
            let urlStr = url.toString();
            // Handle same-origin WebSocket URLs (ws://localhost:3080/... or wss://...)
            // Convert ws:// to http:// equivalent for origin checking
            let httpEquiv = urlStr.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
            if (httpEquiv.startsWith(CURRENT_ORIGIN + '/')) {
                // Extract path and rewrite through proxy (but keep ws:// protocol)
                let path = httpEquiv.substring(CURRENT_ORIGIN.length);
                // WebSocket through proxy - use same origin but proxied path
                let wsBase = CURRENT_ORIGIN.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
                rewrittenUrl = wsBase + PROXY_BASE + path;
                if (TOKEN && !hasOurToken(rewrittenUrl)) {
                    rewrittenUrl += (rewrittenUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
                }
                console.log('[StreamPanel Proxy] WebSocket rewritten:', urlStr, '->', rewrittenUrl);
            }
        }
        return new OriginalWebSocket(rewrittenUrl, protocols);
    };
    // Copy static properties
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // MutationObserver to catch images added to DOM after initial load (React/Vue apps)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Handle img elements
                    if (node.tagName === 'IMG' && node.src) {
                        const rewritten = rewriteExternalImageUrl(node.src);
                        if (rewritten !== node.src) {
                            node.src = rewritten;
                        }
                    }
                    // Handle elements with background-image style
                    if (node.style && node.style.backgroundImage) {
                        const bgUrl = node.style.backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/);
                        if (bgUrl && bgUrl[1] && isExternalImageDomain(bgUrl[1])) {
                            node.style.backgroundImage = 'url(' + EXTERNAL_PROXY + '?url=' + encodeURIComponent(bgUrl[1]) + ')';
                        }
                    }
                    // Also check child images
                    node.querySelectorAll && node.querySelectorAll('img[src]').forEach(function(img) {
                        const rewritten = rewriteExternalImageUrl(img.src);
                        if (rewritten !== img.src) {
                            img.src = rewritten;
                        }
                    });
                }
            });
            // Also handle attribute changes on images
            if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target.tagName === 'IMG') {
                const img = mutation.target;
                const rewritten = rewriteExternalImageUrl(img.src);
                if (rewritten !== img.src && !img.src.includes(EXTERNAL_PROXY)) {
                    img.src = rewritten;
                }
            }
        });
    });

    // Start observing once DOM is ready
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        });
    }

    console.log('[StreamPanel Proxy] Fetch/XHR/Script/Image/WebSocket interceptor installed');
})();
</script>`;

            // CRITICAL: Pre-define app config BEFORE Radarr/Sonarr's own scripts run
            // The problem: Radarr's inline script does `window.Radarr = { urlBase: '' }`
            // which OVERWRITES any pre-set value. We use Object.defineProperty to create
            // a smart property that preserves our urlBase even when the object is reassigned.
            const earlyConfigScript = manager.type === 'radarr'
                ? `<script>
(function() {
    var URL_BASE = '${proxyBase}';
    var radarrObj = { urlBase: URL_BASE };

    // Use defineProperty to intercept all assignments to window.Radarr
    // When Radarr's code does "window.Radarr = { urlBase: '' }", our setter:
    // 1. Copies all properties from the new object
    // 2. But PRESERVES our urlBase value
    Object.defineProperty(window, 'Radarr', {
        get: function() { return radarrObj; },
        set: function(newValue) {
            if (newValue && typeof newValue === 'object') {
                // Copy all properties from the new object
                Object.keys(newValue).forEach(function(key) {
                    // Preserve our urlBase, copy everything else
                    if (key !== 'urlBase') {
                        radarrObj[key] = newValue[key];
                    }
                });
            }
            // Always ensure urlBase stays as our proxy path
            radarrObj.urlBase = URL_BASE;
            console.log('[StreamPanel] Radarr assignment intercepted, urlBase preserved:', URL_BASE);
        },
        configurable: false,
        enumerable: true
    });

    window.__StreamPanelUrlBase = URL_BASE;
    console.log('[StreamPanel] Radarr urlBase protection installed:', URL_BASE);
})();
</script>`
                : manager.type === 'sonarr'
                ? `<script>
(function() {
    var URL_BASE = '${proxyBase}';
    var sonarrObj = { urlBase: URL_BASE };

    Object.defineProperty(window, 'Sonarr', {
        get: function() { return sonarrObj; },
        set: function(newValue) {
            if (newValue && typeof newValue === 'object') {
                Object.keys(newValue).forEach(function(key) {
                    if (key !== 'urlBase') {
                        sonarrObj[key] = newValue[key];
                    }
                });
            }
            sonarrObj.urlBase = URL_BASE;
            console.log('[StreamPanel] Sonarr assignment intercepted, urlBase preserved:', URL_BASE);
        },
        configurable: false,
        enumerable: true
    });

    window.__StreamPanelUrlBase = URL_BASE;
    console.log('[StreamPanel] Sonarr urlBase protection installed:', URL_BASE);
})();
</script>`
                : '';

            // CRITICAL: Inject webpack public path BEFORE any other scripts
            // This must run before webpack initializes to ensure chunks load from proxy path
            const webpackScript = `<script>window.__webpack_public_path__='${proxyBase}/';</script>`;

            // Debug script AND route fix - inject before </body>
            const debugScript = `
<script>
(function() {
    var PROXY_BASE = '${proxyBase}';

    // WORKAROUND: Force React Router to re-evaluate the route after initialization
    // React Router may have initialized before urlBase was properly set
    // By triggering a popstate event, we force it to re-read the URL with correct basename
    function forceRouteRefresh() {
        var appConfig = window.Radarr || window.Sonarr;

        // Log debug info
        console.log('[StreamPanel Debug] App config:', appConfig ? {
            urlBase: appConfig.urlBase,
            expectedUrlBase: PROXY_BASE,
            match: appConfig.urlBase === PROXY_BASE
        } : 'NOT FOUND');

        // Check if we're on the wrong route (404 page showing)
        // The 404 page has a specific element or the route isn't matching
        var isOn404 = document.querySelector('[class*="NotFound"]') ||
                      document.querySelector('[class*="not-found"]') ||
                      document.body.textContent.includes('nothing to see here');

        if (isOn404) {
            console.log('[StreamPanel Debug] Detected 404 page, attempting route refresh...');

            // Method 1: Trigger popstate to make React Router re-evaluate
            window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

            // Method 2: If that doesn't work, try re-pushing the current state
            setTimeout(function() {
                var stillOn404 = document.querySelector('[class*="NotFound"]') ||
                                 document.querySelector('[class*="not-found"]') ||
                                 document.body.textContent.includes('nothing to see here');
                if (stillOn404) {
                    console.log('[StreamPanel Debug] Still on 404, trying history push...');
                    // Extract the intended path from current URL
                    var pathname = window.location.pathname;
                    var intendedPath = pathname.replace(PROXY_BASE, '');
                    if (!intendedPath || intendedPath === '') intendedPath = '/';

                    // Use React Router's navigate if available
                    if (window.__REACT_ROUTER_NAVIGATE__) {
                        window.__REACT_ROUTER_NAVIGATE__(intendedPath);
                    } else {
                        // Force navigation by pushing then replacing
                        history.pushState(null, '', pathname);
                        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
                    }
                }
            }, 200);
        }
    }

    // Run after React has had time to initialize
    setTimeout(forceRouteRefresh, 150);

    // Also try on DOMContentLoaded in case timing is different
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(forceRouteRefresh, 100);
        });
    }
})();
</script>`;

            // Inject scripts right after <head> tag in this order:
            // 1. Early config (pre-define urlBase before any Radarr scripts)
            // 2. Webpack public path
            // 3. Interceptor for fetch/XHR/etc
            html = html.replace(/<head[^>]*>/i, '$&' + earlyConfigScript + webpackScript + interceptorScript);

            // Inject debug script before </body> to run after all other scripts
            html = html.replace(/<\/body>/i, debugScript + '$&');

            // Note: We intentionally DON'T add a <base> tag as it can confuse React Router

            // Note: We no longer need to inject tokens into static URLs in HTML
            // The interceptor script handles all dynamic requests
            // Static resources (fonts, images) are allowed through without auth

            res.set('Content-Type', contentType);
            return res.send(html);
        }

        // For CSS, rewrite url() paths
        if (contentType.includes('text/css')) {
            let css = response.data.toString('utf-8');
            const proxyBase = `/api/v2/media-managers/${manager.id}/proxy`;
            const externalProxy = '/api/v2/media-managers/external-proxy';

            // Rewrite absolute paths
            css = css.replace(/url\(\s*["']?\//g, `url(${proxyBase}/`);

            // Rewrite external image URLs (TMDB, Fanart, etc.)
            css = css.replace(/url\(\s*["']?(https?:\/\/[^"')]+)["']?\)/g, (match, url) => {
                try {
                    const urlObj = new URL(url);
                    const allowedDomains = ['image.tmdb.org', 'artworks.thetvdb.com', 'assets.fanart.tv', 'fanart.tv', 'thetvdb.com', 'themoviedb.org'];
                    if (allowedDomains.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d))) {
                        return `url(${externalProxy}?url=${encodeURIComponent(url)})`;
                    }
                } catch {}
                return match;
            });

            res.set('Content-Type', contentType);
            return res.send(css);
        }

        // For JS files, just pass through - the injected interceptor handles API rewrites
        // We only need to ensure it's served with correct content type
        if (contentType.includes('javascript')) {
            res.set('Content-Type', contentType);
            return res.send(response.data);
        }

        // Forward other response headers
        if (response.headers['content-disposition']) {
            res.set('Content-Disposition', response.headers['content-disposition']);
        }
        if (response.headers['cache-control']) {
            res.set('Cache-Control', response.headers['cache-control']);
        }

        // Send the response
        res.status(response.status);
        res.set('Content-Type', contentType);
        res.send(response.data);

    } catch (error) {
        console.error('[Media Managers] Proxy error:', error.message);
        res.status(502).json({ error: 'Proxy request failed', details: error.message });
    }
});

// GET /api/v2/media-managers/:id/open-url - Get the URL to open (for direct mode)
router.get('/:id/open-url', requireAdmin, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        const manager = managers[0];
        let openUrl = manager.url;

        // For direct mode with API key auth, append the key
        if (manager.connection_mode === 'direct') {
            switch (manager.type) {
                case 'sonarr':
                case 'radarr':
                    openUrl += `?apikey=${manager.api_key}`;
                    break;
                case 'sabnzbd':
                    openUrl += `?apikey=${manager.api_key}`;
                    break;
                // qBittorrent doesn't support API key in URL
            }
        }

        res.json({ url: openUrl, connection_mode: manager.connection_mode });
    } catch (error) {
        console.error('[Media Managers] Error getting open URL:', error);
        res.status(500).json({ error: 'Failed to get open URL' });
    }
});

// GET /api/v2/media-managers/:id/credentials - Get credentials for auto-login
// Used by tool-login.html to auto-submit login form to target server
router.get('/:id/credentials', requireAdmin, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        const manager = managers[0];

        // Return credentials for auto-login
        // Note: Only username/password are returned for form submission
        // API key is NOT exposed as it's not needed for web UI login
        res.json({
            id: manager.id,
            name: manager.name,
            type: manager.type,
            url: manager.url,
            username: manager.username || null,
            password: manager.password || null,
            connection_mode: manager.connection_mode
        });
    } catch (error) {
        console.error('[Media Managers] Error getting credentials:', error);
        res.status(500).json({ error: 'Failed to get credentials' });
    }
});

module.exports = router;
