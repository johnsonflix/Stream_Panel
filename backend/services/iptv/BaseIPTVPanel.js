/**
 * BaseIPTVPanel - Abstract Class
 *
 * Defines the interface that all IPTV panel implementations must follow.
 * Each panel type (NXT Dash, XUI One, etc.) extends this class and implements
 * all abstract methods according to their specific API requirements.
 */

class BaseIPTVPanel {
    /**
     * @param {Object} panelConfig - Panel configuration from database
     * @param {Number} panelConfig.id - Panel ID
     * @param {String} panelConfig.name - Panel name
     * @param {String} panelConfig.panel_type - Panel type identifier
     * @param {String} panelConfig.base_url - Base URL for panel API
     * @param {String} panelConfig.login_url - Login endpoint URL (if separate)
     * @param {String} panelConfig.provider_base_url - User-facing streaming URL
     * @param {Object} panelConfig.credentials - Authentication credentials
     * @param {Object} panelConfig.panel_settings - Type-specific settings
     * @param {Object} db - Database connection
     */
    constructor(panelConfig, db) {
        if (this.constructor === BaseIPTVPanel) {
            throw new Error('BaseIPTVPanel is an abstract class and cannot be instantiated directly');
        }

        this.id = panelConfig.id;
        this.name = panelConfig.name;
        this.panelType = panelConfig.panel_type;
        this.baseURL = panelConfig.base_url;
        this.loginURL = panelConfig.login_url || panelConfig.base_url;
        this.providerBaseURL = panelConfig.provider_base_url;
        this.m3uURL = panelConfig.m3u_url || null;
        this.credentials = panelConfig.credentials;
        this.panelSettings = panelConfig.panel_settings || {};
        this.db = db;

        // Authentication state
        this.authToken = panelConfig.auth_token || null;
        this.authExpires = panelConfig.auth_expires ? new Date(panelConfig.auth_expires) : null;
        this.sessionData = panelConfig.session_data || {};

        // Rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // 1 second between requests
    }

    // ==============================================
    // ABSTRACT METHODS - Must be implemented by subclasses
    // ==============================================

    /**
     * Authenticate with the panel
     * @returns {Promise<Object>} Authentication result with token/session data
     * @throws {Error} If authentication fails
     */
    async authenticate() {
        throw new Error('authenticate() must be implemented by subclass');
    }

    /**
     * Test connection to panel
     * @returns {Promise<Boolean>} True if connection successful
     */
    async testConnection() {
        throw new Error('testConnection() must be implemented by subclass');
    }

    /**
     * Create a new user account on the panel
     * @param {String} username - Username for the account
     * @param {String} password - Password for the account
     * @param {Object} packageData - Package details (connections, duration, credits, etc.)
     * @param {Array<String>} bouquetIds - Array of bouquet IDs to assign
     * @param {Boolean} isTrial - Whether this is a trial account
     * @returns {Promise<Object>} Created user data including line_id, expiration, etc.
     */
    async createUser(username, password, packageData, bouquetIds, isTrial = false) {
        throw new Error('createUser() must be implemented by subclass');
    }

    /**
     * Extend an existing user's subscription
     * @param {String} lineId - User's line ID on the panel
     * @param {Object} packageData - Package details for extension
     * @param {Array<String>} bouquetIds - Array of bouquet IDs to assign
     * @returns {Promise<Object>} Updated user data including new expiration
     */
    async extendUser(lineId, packageData, bouquetIds) {
        throw new Error('extendUser() must be implemented by subclass');
    }

    /**
     * Delete a user account from the panel
     * @param {String} lineId - User's line ID on the panel
     * @returns {Promise<Boolean>} True if deletion successful
     */
    async deleteUser(lineId) {
        throw new Error('deleteUser() must be implemented by subclass');
    }

    /**
     * Get currently active streams on the panel
     * @returns {Promise<Array>} Array of active stream objects
     */
    async getActiveStreams() {
        throw new Error('getActiveStreams() must be implemented by subclass');
    }

    /**
     * Sync available packages from the panel
     * @returns {Promise<Array>} Array of package objects
     */
    async syncPackages() {
        throw new Error('syncPackages() must be implemented by subclass');
    }

    /**
     * Sync available bouquets (channel groups) from the panel
     * @returns {Promise<Array>} Array of bouquet objects
     */
    async syncBouquets() {
        throw new Error('syncBouquets() must be implemented by subclass');
    }

    /**
     * Get current credit balance
     * @returns {Promise<Number>} Current credit balance
     */
    async getCreditBalance() {
        throw new Error('getCreditBalance() must be implemented by subclass');
    }

    /**
     * Get all users from the panel
     * @param {Number} limit - Maximum number of users to fetch
     * @param {Number} offset - Offset for pagination
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsers(limit = 10000, offset = 0) {
        throw new Error('getAllUsers() must be implemented by subclass');
    }

    /**
     * Find a specific user by username
     * @param {String} username - Username to search for
     * @returns {Promise<Object|null>} User object or null if not found
     */
    async findUserByUsername(username) {
        throw new Error('findUserByUsername() must be implemented by subclass');
    }

    // ==============================================
    // COMMON UTILITY METHODS - Provided by base class
    // ==============================================

    /**
     * Ensure authentication is valid, refresh if needed
     * @returns {Promise<Boolean>} True if authenticated
     */
    async ensureAuthenticated() {
        // Check if we have a valid token
        if (this.authToken && this.authExpires && this.authExpires > new Date()) {
            console.log(`✓ Panel ${this.name} authentication still valid`);
            return true;
        }

        console.log(`🔄 Panel ${this.name} authentication expired or missing, re-authenticating...`);
        const authResult = await this.authenticate();

        // Update database with new auth data
        await this.saveAuthToDatabase();

        return true;
    }

    /**
     * Save authentication data to database
     * @private
     */
    async saveAuthToDatabase() {
        try {
            // Convert authExpires to ISO string if it's a Date object
            const authExpiresStr = this.authExpires instanceof Date
                ? this.authExpires.toISOString()
                : this.authExpires;

            // Ensure sessionData is properly serialized (handle circular refs, etc.)
            let sessionDataStr = null;
            try {
                sessionDataStr = this.sessionData ? JSON.stringify(this.sessionData) : null;
            } catch (jsonError) {
                console.warn('Could not serialize sessionData:', jsonError.message);
                sessionDataStr = null;
            }

            await this.db.query(`
                UPDATE iptv_panels
                SET auth_token = ?,
                    auth_expires = ?,
                    session_data = ?
                WHERE id = ?
            `, [this.authToken, authExpiresStr, sessionDataStr, this.id]);
        } catch (error) {
            console.error('Failed to save auth data to database:', error.message);
        }
    }

    /**
     * Rate limit requests to panel
     * @private
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Generate M3U Plus URL for user
     * @param {String} username - User's username
     * @param {String} password - User's password
     * @returns {String|null} M3U Plus URL or null if not configured
     */
    generateM3UPlusURL(username, password) {
        // Only generate M3U URL if panel has a custom M3U URL template configured
        if (!this.m3uURL) {
            return null;
        }

        try {
            // Replace various placeholder formats with actual credentials
            let url = this.m3uURL
                // Replace {USERNAME} and {PASSWORD} (case-insensitive)
                .replace(/\{username\}/gi, username)
                .replace(/\{password\}/gi, password)
                // Also support {{USERNAME}} and {{PASSWORD}}
                .replace(/\{\{username\}\}/gi, username)
                .replace(/\{\{password\}\}/gi, password);

            // Fix duplicate protocol prefix (https://https:// or http://http://)
            url = url.replace(/^(https?:\/\/)(https?:\/\/)/, '$1');

            return url;
        } catch (error) {
            console.warn(`⚠️ Failed to process M3U URL template for panel ${this.name}:`, error.message);
            return null;
        }
    }

    /**
     * Generate all stream URLs for user
     * @param {String} username - User's username
     * @param {String} password - User's password
     * @returns {Object} Object containing all stream URLs
     */
    generateStreamURLs(username, password) {
        const baseURL = this.providerBaseURL.replace(/\/$/, '');

        return {
            m3u: `${baseURL}/get.php?username=${username}&password=${password}&type=m3u&output=ts`,
            m3u_plus: `${baseURL}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`,
            xmltv: `${baseURL}/xmltv.php?username=${username}&password=${password}`,
            player_api: `${baseURL}/player_api.php?username=${username}&password=${password}`,
            portal: `${baseURL}/c`
        };
    }

    /**
     * Generate iMPlayer code
     * @param {String} username - User's username
     * @param {String} password - User's password
     * @returns {String} iMPlayer code
     */
    generateiMPlayerCode(username, password) {
        const baseURL = this.providerBaseURL.replace(/\/$/, '');
        return `${baseURL}|${username}|${password}`;
    }

    /**
     * Log activity to database
     * @param {Number} userId - User ID (null if not applicable)
     * @param {String} lineId - Panel line ID (null if not applicable)
     * @param {String} action - Action type
     * @param {String} packageId - Package ID (null if not applicable)
     * @param {Number} creditsUsed - Credits used (0 if not applicable)
     * @param {Boolean} success - Whether action was successful
     * @param {String} errorMessage - Error message (null if successful)
     * @param {Object} apiResponse - API response object (null if not applicable)
     */
    async logActivity(userId, lineId, action, packageId, creditsUsed, success, errorMessage = null, apiResponse = null) {
        try {
            await this.db.query(`
                INSERT INTO iptv_activity_log
                (iptv_panel_id, user_id, line_id, action, package_id, credits_used, success, error_message, api_response)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                this.id,
                userId,
                lineId,
                action,
                packageId,
                creditsUsed,
                success,
                errorMessage,
                apiResponse ? JSON.stringify(apiResponse) : null
            ]);
        } catch (error) {
            console.error('Failed to log activity to database:', error.message);
        }
    }

    /**
     * Update panel health status in database
     * @param {String} status - 'online', 'offline', or 'error'
     */
    async updateHealthStatus(status) {
        try {
            await this.db.query(`
                UPDATE iptv_panels
                SET health_status = ?,
                    last_sync = datetime('now')
                WHERE id = ?
            `, [status, this.id]);
        } catch (error) {
            console.error('Failed to update health status:', error.message);
        }
    }

    /**
     * Get panel information
     * @returns {Object} Panel configuration object
     */
    getPanelInfo() {
        return {
            id: this.id,
            name: this.name,
            panelType: this.panelType,
            baseURL: this.baseURL,
            providerBaseURL: this.providerBaseURL,
            isAuthenticated: this.authToken && this.authExpires && this.authExpires > new Date()
        };
    }
}

module.exports = BaseIPTVPanel;
