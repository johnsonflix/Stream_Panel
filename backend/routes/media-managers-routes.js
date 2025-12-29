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
            'SELECT id, name, type, url, connection_mode, is_enabled, display_order, created_at FROM media_managers ORDER BY display_order ASC, name ASC'
        );
        res.json({ managers });
    } catch (error) {
        console.error('[Media Managers] Error listing managers:', error);
        res.status(500).json({ error: 'Failed to list media managers' });
    }
});

// GET /api/v2/media-managers/:id - Get single media manager (with credentials for edit)
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const managers = await query('SELECT * FROM media_managers WHERE id = ?', [req.params.id]);

        if (managers.length === 0) {
            return res.status(404).json({ error: 'Media manager not found' });
        }

        res.json({ manager: managers[0] });
    } catch (error) {
        console.error('[Media Managers] Error getting manager:', error);
        res.status(500).json({ error: 'Failed to get media manager' });
    }
});

// POST /api/v2/media-managers - Create new media manager
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { name, type, url, api_key, username, password, connection_mode, is_enabled, display_order } = req.body;

        if (!name || !type || !url) {
            return res.status(400).json({ error: 'Name, type, and URL are required' });
        }

        const validTypes = ['sonarr', 'radarr', 'qbittorrent', 'sabnzbd'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Must be: sonarr, radarr, qbittorrent, or sabnzbd' });
        }

        const result = await query(
            `INSERT INTO media_managers (name, type, url, api_key, username, password, connection_mode, is_enabled, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                type,
                url.replace(/\/$/, ''), // Remove trailing slash
                api_key || null,
                username || null,
                password || null,
                connection_mode || 'proxy',
                is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1,
                display_order || 0
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
        const { name, type, url, api_key, username, password, connection_mode, is_enabled, display_order } = req.body;

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
                // Test using queue endpoint with API key
                const response = await axios.get(`${url}/api`, {
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

            // Inject comprehensive interceptor script BEFORE other scripts
            // This intercepts fetch/XHR, dynamic script/link loading, AND external image URLs
            const interceptorScript = `
<script>
(function() {
    const PROXY_BASE = '${proxyBase}';
    const EXTERNAL_PROXY = '/api/v2/media-managers/external-proxy';
    const TOKEN = '${token}';
    const CURRENT_ORIGIN = window.location.origin;

    // FIX FOR REACT ROUTER: Change the URL to the app path using history.replaceState
    // This runs AFTER __webpack_public_path__ is set (in the script before this one),
    // so webpack will still load chunks from the proxy path.
    (function fixRouterPath() {
        try {
            // Helper to extract the virtual path from a proxy URL
            function getVirtualPath(pathname) {
                const proxyMatch = pathname.match(/\\/api\\/v2\\/media-managers\\/\\d+\\/proxy(\\/.*)?/);
                if (proxyMatch) {
                    return proxyMatch[1] || '/';
                }
                return null;
            }

            // Check if we're in a proxy context
            const initialPath = window.location.pathname;
            const virtualPath = getVirtualPath(initialPath);
            if (!virtualPath) {
                return; // Not a proxy URL, nothing to do
            }

            // APPROACH: Use history.replaceState to change the URL to the app path
            // This happens AFTER __webpack_public_path__ is set, so:
            // - React Router sees location.pathname = "/movie" and routes correctly
            // - Webpack uses __webpack_public_path__ for chunk loading (already set to proxy path)
            console.log('[StreamPanel Proxy] Changing URL from', initialPath, 'to', virtualPath);
            history.replaceState(null, '', virtualPath);
            console.log('[StreamPanel Proxy] URL changed, location.pathname is now:', window.location.pathname);

            // Patch history.pushState to convert app paths back to proxy paths
            // This ensures browser history entries point to the proxy URLs
            const originalPushState = history.pushState.bind(history);
            const originalReplaceState = history.replaceState.bind(history);

            history.pushState = function(state, title, url) {
                // Only intercept app paths, not already-proxied paths
                if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('/api/v2/media-managers')) {
                    // For pushState, we DON'T rewrite to proxy path - we keep the app path visible
                    // This way React Router continues to see clean URLs
                    console.log('[StreamPanel Proxy] pushState (keeping app path):', url);
                    return originalPushState(state, title, url);
                }
                return originalPushState(state, title, url);
            };

            history.replaceState = function(state, title, url) {
                if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('/api/v2/media-managers')) {
                    console.log('[StreamPanel Proxy] replaceState (keeping app path):', url);
                    return originalReplaceState(state, title, url);
                }
                return originalReplaceState(state, title, url);
            };

            console.log('[StreamPanel Proxy] Router fix applied - pathname is now:', window.location.pathname);
        } catch (e) {
            console.error('[StreamPanel Proxy] Failed to fix router path:', e);
        }
    })();

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

            // CRITICAL: Inject webpack public path BEFORE any other scripts
            // This must run before webpack initializes to ensure chunks load from proxy path
            const webpackScript = `<script>window.__webpack_public_path__='${proxyBase}/';</script>`;

            // Inject webpack script first, then our interceptor right after <head> tag
            html = html.replace(/<head[^>]*>/i, '$&' + webpackScript + interceptorScript);

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

module.exports = router;
