/**
 * API Client for StreamPanel
 */

const API_BASE = '/api/v2';

class API {
    /**
     * Get session token from localStorage
     */
    static getSessionToken() {
        return localStorage.getItem('sessionToken');
    }

    /**
     * Get current user from localStorage
     */
    static getCurrentUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    }

    /**
     * Check if user is authenticated
     */
    static isAuthenticated() {
        return !!this.getSessionToken();
    }

    /**
     * Get authorization headers for fetch requests
     */
    static getAuthHeaders() {
        const sessionToken = this.getSessionToken();
        return {
            'Content-Type': 'application/json',
            ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {})
        };
    }

    /**
     * Logout user
     */
    static logout() {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }

    /**
     * Make HTTP request
     */
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const sessionToken = this.getSessionToken();

        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // Add session token to headers if available
        if (sessionToken && !options.skipAuth) {
            config.headers['Authorization'] = `Bearer ${sessionToken}`;
        }

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            // Handle unauthorized responses
            if (response.status === 401) {
                // Don't auto-logout if skipAutoLogout is set (for preferences)
                if (!options.skipAutoLogout) {
                    // Session expired or invalid, redirect to login
                    this.logout();
                    return;
                }
            }

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            // Only log errors if not suppressed
            if (!options.suppressErrorLog) {
                console.error('API Error:', error);
            }
            throw error;
        }
    }

    // ============ Authentication ============
    static async login(email, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: { email, password },
            skipAuth: true
        });
    }

    static async logoutAPI() {
        try {
            await this.request('/auth/logout', {
                method: 'POST'
            });
        } finally {
            this.logout();
        }
    }

    static async getCurrentUserAPI() {
        return this.request('/auth/me');
    }

    static async changePassword(currentPassword, newPassword) {
        return this.request('/auth/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword }
        });
    }

    /**
     * Get admin's portal credentials (IPTV/Plex for accessing the end user portal)
     */
    static async getPortalCredentials() {
        return this.request('/auth/portal-credentials');
    }

    /**
     * Update admin's portal credentials
     */
    static async updatePortalCredentials(credentials) {
        return this.request('/auth/portal-credentials', {
            method: 'PUT',
            body: credentials
        });
    }

    // ============ App Users (Login Accounts) ============
    static async getAppUsers() {
        return this.request('/app-users');
    }

    static async getAppUser(id) {
        return this.request(`/app-users/${id}`);
    }

    static async createAppUser(data) {
        return this.request('/app-users', {
            method: 'POST',
            body: data
        });
    }

    static async updateAppUser(id, data) {
        return this.request(`/app-users/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteAppUser(id) {
        return this.request(`/app-users/${id}`, {
            method: 'DELETE'
        });
    }

    static async getUserPreferences() {
        return this.request('/app-users/me/preferences', {
            skipAutoLogout: true
        });
    }

    static async saveUserPreferences(preferences) {
        return this.request('/app-users/me/preferences', {
            method: 'PUT',
            body: { preferences },
            skipAutoLogout: true
        });
    }

    // ============ Dashboard ============
    static async getDashboardQuickStats() {
        // INSTANT database-only stats (no slow API calls)
        return this.request('/dashboard/quick-stats');
    }

    static async getDashboardStats(force = false) {
        const url = force ? '/dashboard/stats?force=true' : '/dashboard/stats';
        return this.request(url);
    }

    static async getDashboardWatchStats(force = false) {
        const url = force ? '/dashboard/watch-stats?force=true' : '/dashboard/watch-stats';
        return this.request(url);
    }

    static async getDashboardIPTVPanels() {
        return this.request('/dashboard/iptv-panels');
    }

    static async getDashboardLiveStats() {
        return this.request('/dashboard/live-stats');
    }

    // ============ Plex Servers ============
    static async getPlexServers(includeInactive = false) {
        return this.request(`/plex-servers?include_inactive=${includeInactive}`);
    }

    static async getPlexServer(id) {
        return this.request(`/plex-servers/${id}`);
    }

    static async createPlexServer(data) {
        return this.request('/plex-servers', {
            method: 'POST',
            body: data
        });
    }

    static async updatePlexServer(id, data) {
        return this.request(`/plex-servers/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePlexServer(id) {
        return this.request(`/plex-servers/${id}`, {
            method: 'DELETE'
        });
    }

    static async syncPlexLibraries(id) {
        return this.request(`/plex-servers/${id}/sync-libraries`, {
            method: 'POST'
        });
    }

    static async getPlexServerStats(id) {
        return this.request(`/plex-servers/${id}/stats`);
    }

    static async getPlexServerUsers(id) {
        return this.request(`/plex-servers/${id}/users`);
    }

    static async getPlexServerUsersWithActivity(id) {
        return this.request(`/plex-servers/${id}/users-with-activity`);
    }

    static async getPlexServerPendingInvites(id) {
        return this.request(`/plex-servers/${id}/pending-invites`);
    }

    static async testPlexConnection(id) {
        return this.request(`/plex-servers/${id}/test-connection`, {
            method: 'POST'
        });
    }

    static async searchPlexServers(email) {
        return this.request('/plex-servers/search', {
            method: 'POST',
            body: { email }
        });
    }

    static async checkPlexUserInfo(userEmail, serverId) {
        return this.request(`/plex-servers/${serverId}/check-user`, {
            method: 'POST',
            body: { user_email: userEmail }
        });
    }

    static async syncPlexActivity() {
        return this.request('/plex-servers/sync-activity', {
            method: 'POST'
        });
    }

    static async getPlexLibraries() {
        return this.request('/plex/libraries');
    }

    static async getPlexActivitySyncStatus() {
        return this.request('/plex-servers/sync-activity/status');
    }

    // ============ Plex Packages ============
    static async getPlexPackages(includeInactive = false) {
        return this.request(`/plex-packages?include_inactive=${includeInactive}`);
    }

    static async getPlexPackage(id) {
        return this.request(`/plex-packages/${id}`);
    }

    static async getPlexPackagePreview(id) {
        return this.request(`/plex-packages/${id}/preview`);
    }

    static async createPlexPackage(data) {
        return this.request('/plex-packages', {
            method: 'POST',
            body: data
        });
    }

    static async updatePlexPackage(id, data) {
        return this.request(`/plex-packages/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePlexPackage(id) {
        return this.request(`/plex-packages/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ IPTV Panels ============
    static async getIPTVPanels(includeInactive = false) {
        return this.request(`/iptv-panels?include_inactive=${includeInactive}`);
    }

    static async getIPTVPanel(id) {
        return this.request(`/iptv-panels/${id}`);
    }

    static async getIPTVPanelEditorLink(id) {
        return this.request(`/iptv-panels/${id}/editor-link`);
    }

    static async searchIPTVPanelsForUser(username) {
        return this.request('/iptv-panels/search-user', {
            method: 'POST',
            body: { username }
        });
    }

    static async searchIPTVEditorForUser(username, iptvEditorPlaylistId) {
        return this.request('/iptv-editor/search-user', {
            method: 'POST',
            body: {
                username,
                iptv_editor_playlist_id: iptvEditorPlaylistId
            }
        });
    }

    static async createIPTVEditorUser(userData) {
        return this.request('/iptv-editor/create-user', {
            method: 'POST',
            body: userData
        });
    }

    static async createIPTVEditorUserForExistingUser(userId, data) {
        return this.request(`/users/${userId}/iptv-editor/create`, {
            method: 'POST',
            body: data
        });
    }

    static async linkIPTVEditorUserForExistingUser(userId, data) {
        return this.request(`/users/${userId}/iptv-editor/link`, {
            method: 'POST',
            body: data
        });
    }

    static async forceSyncIPTVEditorUser(playlistId, userId) {
        return this.request(`/iptv-playlists/${playlistId}/force-sync-user`, {
            method: 'POST',
            body: { user_id: userId }
        });
    }

    static async syncIPTVPanelExpiration(userId) {
        return this.request(`/users/${userId}/iptv-panel/sync-expiration`, {
            method: 'POST'
        });
    }

    static async createIPTVPanel(data) {
        return this.request('/iptv-panels', {
            method: 'POST',
            body: data
        });
    }

    static async updateIPTVPanel(id, data) {
        return this.request(`/iptv-panels/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteIPTVPanel(id) {
        return this.request(`/iptv-panels/${id}`, {
            method: 'DELETE'
        });
    }

    static async testIPTVPanelConnection(idOrData) {
        // Support both old format (data object) and new format (panel ID)
        if (typeof idOrData === 'object') {
            return this.request('/iptv-panels/test-connection', {
                method: 'POST',
                body: idOrData
            });
        } else {
            return this.request(`/iptv-panels/${idOrData}/test-connection`, {
                method: 'POST'
            });
        }
    }

    static async fetchIPTVPanelPackages(id) {
        return this.request(`/iptv-panels/${id}/fetch-packages`, {
            method: 'POST'
        });
    }

    static async fetchIPTVPanelBouquets(id, packageId) {
        return this.request(`/iptv-panels/${id}/fetch-bouquets`, {
            method: 'POST',
            body: { package_id: packageId }
        });
    }

    static async syncIPTVPanelPackages(id) {
        return this.request(`/iptv-panels/${id}/sync-packages`, {
            method: 'POST'
        });
    }

    static async getIPTVPackages(id) {
        return this.request(`/iptv-panels/${id}/packages`, {
            method: 'GET'
        });
    }

    static async syncIPTVPanelBouquets(id, packageId) {
        return this.request(`/iptv-panels/${id}/sync-bouquets`, {
            method: 'POST',
            body: { package_id: packageId }
        });
    }

    static async getIPTVPanelBouquets(id) {
        return this.request(`/iptv-panels/${id}/bouquets`, {
            method: 'GET'
        });
    }

    static async getIPTVPanelChannelGroups(id) {
        return this.request(`/iptv-panels/${id}/channel-groups`, {
            method: 'GET'
        });
    }

    static async updateIPTVPanelSettings(id, selectedPackageId) {
        return this.request(`/iptv-panels/${id}/settings`, {
            method: 'PATCH',
            body: { selected_package_id: selectedPackageId }
        });
    }

    // Channel Groups / Packages
    static async getChannelGroups(panelId) {
        return this.request(`/iptv-panels/${panelId}/channel-groups`, {
            method: 'GET'
        });
    }

    static async createChannelGroup(panelId, name, description, bouquetIds, editorChannelIds = [], editorMovieIds = [], editorSeriesIds = []) {
        return this.request(`/iptv-panels/${panelId}/channel-groups`, {
            method: 'POST',
            body: {
                name,
                description,
                bouquet_ids: bouquetIds,
                editor_channel_ids: editorChannelIds,
                editor_movie_ids: editorMovieIds,
                editor_series_ids: editorSeriesIds
            }
        });
    }

    static async updateChannelGroup(panelId, groupId, data) {
        return this.request(`/iptv-panels/${panelId}/channel-groups/${groupId}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteChannelGroup(panelId, groupId) {
        return this.request(`/iptv-panels/${panelId}/channel-groups/${groupId}`, {
            method: 'DELETE'
        });
    }

    static async searchIPTVPanels(searchType, searchValue) {
        return this.request('/iptv-panels/search', {
            method: 'POST',
            body: { search_type: searchType, search_value: searchValue }
        });
    }

    // ============ IPTV Playlists ============
    static async getIPTVPlaylists(includeInactive = false) {
        return this.request(`/iptv-playlists?include_inactive=${includeInactive}`);
    }

    static async getIPTVPlaylist(id) {
        return this.request(`/iptv-playlists/${id}`);
    }

    static async getIPTVPlaylistUsers(id) {
        return this.request(`/iptv-playlists/${id}/users`);
    }

    static async createIPTVPlaylist(data) {
        return this.request('/iptv-playlists', {
            method: 'POST',
            body: data
        });
    }

    static async updateIPTVPlaylist(id, data) {
        return this.request(`/iptv-playlists/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteIPTVPlaylist(id) {
        return this.request(`/iptv-playlists/${id}`, {
            method: 'DELETE'
        });
    }

    static async searchIPTVPlaylists(username) {
        return this.request('/iptv-playlists/search', {
            method: 'POST',
            body: { username }
        });
    }

    // ============ Owners (now same as App Users) ============
    // Owners/Resellers are now consolidated into App Users
    static async getOwners() {
        // Return app users as owners for backward compatibility
        const response = await this.request('/app-users');
        return {
            success: response.success,
            data: response.users || [],
            owners: response.users || []
        };
    }

    static async getOwner(id) {
        // Get app user as owner for backward compatibility
        return this.request(`/app-users/${id}`);
    }

    static async createOwner(data) {
        // Create app user as owner for backward compatibility
        return this.request('/app-users', {
            method: 'POST',
            body: data
        });
    }

    static async updateOwner(id, data) {
        // Update app user as owner for backward compatibility
        return this.request(`/app-users/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteOwner(id) {
        // Delete app user (owner) for backward compatibility
        return this.request(`/app-users/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Tags ============
    static async getTags() {
        return this.request('/tags');
    }

    static async getTag(id) {
        return this.request(`/tags/${id}`);
    }

    static async getTagUsers(id) {
        return this.request(`/tags/${id}/users`);
    }

    static async createTag(data) {
        return this.request('/tags', {
            method: 'POST',
            body: data
        });
    }

    static async updateTag(id, data) {
        return this.request(`/tags/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteTag(id) {
        return this.request(`/tags/${id}`, {
            method: 'DELETE'
        });
    }

    static async assignTag(tagId, userId, options = {}) {
        try {
            return await this.request(`/tags/${tagId}/assign`, {
                method: 'POST',
                body: { user_id: userId },
                suppressErrorLog: options.silent  // Don't log expected errors in silent mode
            });
        } catch (error) {
            // Silently handle "already assigned" errors - end result is the same
            if (options.silent && error.message?.includes('already assigned')) {
                return { success: true, skipped: true };
            }
            throw error;
        }
    }

    static async unassignTag(tagId, userId, options = {}) {
        try {
            return await this.request(`/tags/${tagId}/unassign`, {
                method: 'DELETE',
                body: { user_id: userId },
                suppressErrorLog: options.silent  // Don't log expected errors in silent mode
            });
        } catch (error) {
            // Silently handle "not found" errors - end result is the same
            if (options.silent && error.message?.includes('not found')) {
                return { success: true, skipped: true };
            }
            throw error;
        }
    }

    static async runTagAutoAssignment() {
        return this.request('/tags/auto-assign', {
            method: 'POST'
        });
    }

    // ============ Email Templates ============
    static async getEmailTemplates(category = null) {
        const url = category ? `/email-templates?category=${category}` : '/email-templates';
        return this.request(url);
    }

    static async getEmailTemplate(id) {
        return this.request(`/email-templates/${id}`);
    }

    static async createEmailTemplate(data) {
        return this.request('/email-templates', {
            method: 'POST',
            body: data
        });
    }

    static async updateEmailTemplate(id, data) {
        return this.request(`/email-templates/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteEmailTemplate(id) {
        return this.request(`/email-templates/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Users ============
    static async getUsers(search = '', includeInactive = false, ownerId = null, tagId = null, expiringSoon = '') {
        let url = `/users?search=${encodeURIComponent(search)}&include_inactive=${includeInactive}`;
        if (ownerId) url += `&owner_id=${ownerId}`;
        if (tagId) url += `&tag_id=${tagId}`;
        if (expiringSoon) url += `&expiring_soon=${encodeURIComponent(expiringSoon)}`;
        return this.request(url);
    }

    static async getUser(id) {
        return this.request(`/users/${id}`);
    }

    static async createUser(data) {
        return this.request('/users', {
            method: 'POST',
            body: data
        });
    }

    static async updateUser(id, data) {
        return this.request(`/users/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteUser(id, deleteFromPlex = false, deleteFromIPTV = false) {
        return this.request(`/users/${id}`, {
            method: 'DELETE',
            body: {
                delete_from_plex: deleteFromPlex,
                delete_from_iptv: deleteFromIPTV
            }
        });
    }

    static async deletePlexAccess(id, deleteFromServers = true) {
        return this.request(`/users/${id}/plex?delete_from_servers=${deleteFromServers}`, {
            method: 'DELETE'
        });
    }

    static async deleteIPTVAccess(id, deleteFromPanel = true) {
        return this.request(`/users/${id}/iptv?delete_from_panel=${deleteFromPanel}`, {
            method: 'DELETE'
        });
    }

    static async deleteIPTVEditorAccess(id, deleteFromService = true) {
        return this.request(`/users/${id}/iptv-editor?delete_from_service=${deleteFromService}`, {
            method: 'DELETE'
        });
    }

    static async extendPlexSubscription(id, months) {
        return this.request(`/users/${id}/extend-plex`, {
            method: 'POST',
            body: { months }
        });
    }

    static async updatePlexLibraries(id, plex_server_library_selections) {
        return this.request(`/users/${id}/update-plex-libraries`, {
            method: 'POST',
            body: { plex_server_library_selections }
        });
    }

    static async extendIPTVSubscription(id, months) {
        return this.request(`/users/${id}/extend-iptv`, {
            method: 'POST',
            body: { months }
        });
    }

    static async getRenewalPackages(id) {
        return this.request(`/users/${id}/renewal-packages`);
    }

    static async renewIPTVSubscription(id, packageId = null, bouquetSyncMode = null) {
        const body = {};
        // Debug logging to trace the issue
        console.log('[API.renewIPTVSubscription] Called with:', { id, packageId, bouquetSyncMode });

        // Handle various falsy/undefined cases
        if (packageId && packageId !== 'undefined' && packageId !== '' && packageId !== 'null') {
            body.package_id = packageId;
        }
        if (bouquetSyncMode && bouquetSyncMode !== 'undefined' && bouquetSyncMode !== '') {
            body.bouquet_sync_mode = bouquetSyncMode;
        }

        console.log('[API.renewIPTVSubscription] Sending body:', JSON.stringify(body));

        return this.request(`/users/${id}/renew-iptv`, {
            method: 'POST',
            body: body
        });
    }

    // ============ CSV Import ============
    static async uploadCSV(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        const response = await fetch(`${API_BASE}/csv-import`, {
            method: 'POST',
            body: formData
        });

        return response.json();
    }

    static async validateCSV(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        const response = await fetch(`${API_BASE}/csv-import/validate`, {
            method: 'POST',
            body: formData
        });

        return response.json();
    }

    static getCSVTemplateURL() {
        return `${API_BASE}/csv-import/template`;
    }

    // ============ IPTV Editor Integration ============
    static async getIPTVEditorSettings() {
        return this.request('/iptv-editor/settings', {
            method: 'GET'
        });
    }

    static async updateIPTVEditorSettings(settings) {
        return this.request('/iptv-editor/settings', {
            method: 'PUT',
            body: settings
        });
    }

    static async testIPTVEditorConnection() {
        return this.request('/iptv-editor/test-connection', {
            method: 'POST'
        });
    }

    static async syncIPTVEditorPlaylists() {
        return this.request('/iptv-editor/sync-playlists', {
            method: 'POST'
        });
    }

    static async getIPTVEditorPlaylists() {
        return this.request('/iptv-editor/playlists', {
            method: 'GET'
        });
    }

    static async runAutoUpdater() {
        return this.request('/iptv-editor/run-auto-updater', {
            method: 'POST'
        });
    }

    static async updatePlaylistSettings(playlistId, settings) {
        return this.request(`/iptv-editor/playlists/${playlistId}/settings`, {
            method: 'PATCH',
            body: settings
        });
    }

    static async runPlaylistAutoUpdater(playlistId) {
        return this.request(`/iptv-editor/playlists/${playlistId}/run-auto-updater`, {
            method: 'POST'
        });
    }

    static async getIPTVEditorChannelCategories(playlistId) {
        return this.request(`/iptv-editor/categories/channels/${playlistId}`, {
            method: 'GET'
        });
    }

    static async getIPTVEditorMovieCategories(playlistId) {
        return this.request(`/iptv-editor/categories/movies/${playlistId}`, {
            method: 'GET'
        });
    }

    static async getIPTVEditorSeriesCategories(playlistId) {
        return this.request(`/iptv-editor/categories/series/${playlistId}`, {
            method: 'GET'
        });
    }

    // OBSOLETE - Use linkPanelToPlaylist instead (relationship direction reversed)
    static async linkPlaylistToPanel(playlistId, iptvPanelId) {
        return this.request(`/iptv-editor/playlists/${playlistId}/link-panel`, {
            method: 'PATCH',
            body: { iptv_panel_id: iptvPanelId }
        });
    }

    // NEW: Link panel to playlist (correct relationship direction)
    static async linkPanelToPlaylist(panelId, playlistId) {
        return this.request(`/iptv-panels/${panelId}/playlist-link`, {
            method: 'PUT',
            body: { iptv_editor_playlist_id: playlistId }
        });
    }

    // ============ Subscription Plans ============
    static async getSubscriptionPlans(includeInactive = false) {
        return this.request(`/subscription-plans?include_inactive=${includeInactive}`);
    }

    static async getSubscriptionPlan(id) {
        return this.request(`/subscription-plans/${id}`);
    }

    static async createSubscriptionPlan(data) {
        return this.request('/subscription-plans', {
            method: 'POST',
            body: data
        });
    }

    static async updateSubscriptionPlan(id, data) {
        return this.request(`/subscription-plans/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteSubscriptionPlan(id) {
        return this.request(`/subscription-plans/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Payment Providers ============
    static async getPaymentProviders(includeInactive = false) {
        return this.request(`/payment-providers?include_inactive=${includeInactive}`);
    }

    static async getPaymentProvider(id) {
        return this.request(`/payment-providers/${id}`);
    }

    static async createPaymentProvider(data) {
        return this.request('/payment-providers', {
            method: 'POST',
            body: data
        });
    }

    static async updatePaymentProvider(id, data) {
        return this.request(`/payment-providers/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePaymentProvider(id) {
        return this.request(`/payment-providers/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Settings ============
    static async getAllSettings() {
        return this.request('/settings');
    }

    static async getSetting(key) {
        return this.request(`/settings/${key}`);
    }

    static async updateSetting(key, value, type = 'string', description = null) {
        return this.request(`/settings/${key}`, {
            method: 'PUT',
            body: { value, type, description }
        });
    }

    static async uploadBrandingFile(file, fileType) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileType', fileType);

        const response = await fetch(`${API_BASE}/settings/upload-branding`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        return response.json();
    }

    static async sendTestEmail(email) {
        return this.request('/settings/test-email', {
            method: 'POST',
            body: { email }
        });
    }

    // ============ Plex Access Check ============
    static async checkPlexAccess(data) {
        return this.request('/plex-servers/check-access', {
            method: 'POST',
            body: data
        });
    }

    // ============ IPTV Channel Packages ============
    static async getIPTVChannelPackages(panelId) {
        // Alias for getIPTVPanelBouquets - channel packages are bouquets
        return this.getIPTVPanelBouquets(panelId);
    }

    // ============ User Creation Job Status ============
    static async getUserCreationStatus(jobId) {
        return this.request(`/users/creation-status/${jobId}`, {
            method: 'GET'
        });
    }

    // ============ Service Requests ============
    static async getServiceRequests(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.service_type) params.append('service_type', filters.service_type);
        if (filters.request_type) params.append('request_type', filters.request_type);
        if (filters.owner_id) params.append('owner_id', filters.owner_id);
        if (filters.limit) params.append('limit', filters.limit);
        if (filters.offset) params.append('offset', filters.offset);
        const queryString = params.toString();
        return this.request(`/service-requests${queryString ? '?' + queryString : ''}`);
    }

    static async getPendingServiceRequests() {
        return this.request('/service-requests/pending');
    }

    static async getServiceRequest(id) {
        return this.request(`/service-requests/${id}`);
    }

    static async updateServiceRequest(id, data) {
        return this.request(`/service-requests/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deleteServiceRequest(id) {
        return this.request(`/service-requests/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Portal Apps ============
    static async getPortalApps() {
        return this.request('/admin/portal/apps');
    }

    static async getPortalApp(id) {
        return this.request(`/admin/portal/apps/${id}`);
    }

    static async createPortalApp(data) {
        return this.request('/admin/portal/apps', {
            method: 'POST',
            body: data
        });
    }

    static async updatePortalApp(id, data) {
        return this.request(`/admin/portal/apps/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePortalApp(id) {
        return this.request(`/admin/portal/apps/${id}`, {
            method: 'DELETE'
        });
    }

    static async reorderPortalApps(appIds) {
        return this.request('/admin/portal/apps/reorder', {
            method: 'POST',
            body: { app_ids: appIds }
        });
    }

    // ============ Portal Guides ============
    static async getPortalGuides() {
        return this.request('/admin/portal/guides');
    }

    static async getPortalGuide(id) {
        return this.request(`/admin/portal/guides/${id}`);
    }

    static async createPortalGuide(data) {
        return this.request('/admin/portal/guides', {
            method: 'POST',
            body: data
        });
    }

    static async updatePortalGuide(id, data) {
        return this.request(`/admin/portal/guides/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePortalGuide(id) {
        return this.request(`/admin/portal/guides/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Portal Quick Actions ============
    static async getPortalQuickActions() {
        return this.request('/admin/portal/quick-actions');
    }

    static async getPortalQuickAction(id) {
        return this.request(`/admin/portal/quick-actions/${id}`);
    }

    static async createPortalQuickAction(data) {
        return this.request('/admin/portal/quick-actions', {
            method: 'POST',
            body: data
        });
    }

    static async updatePortalQuickAction(id, data) {
        return this.request(`/admin/portal/quick-actions/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePortalQuickAction(id) {
        return this.request(`/admin/portal/quick-actions/${id}`, {
            method: 'DELETE'
        });
    }

    // ============ Portal Support Messages ============
    static async getPortalMessages(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.category) params.append('category', filters.category);
        if (filters.limit) params.append('limit', filters.limit);
        const queryString = params.toString();
        return this.request(`/admin/portal/messages${queryString ? '?' + queryString : ''}`);
    }

    static async getPortalMessage(id) {
        return this.request(`/admin/portal/messages/${id}`);
    }

    static async updatePortalMessage(id, data) {
        return this.request(`/admin/portal/messages/${id}`, {
            method: 'PUT',
            body: data
        });
    }

    static async deletePortalMessage(id) {
        return this.request(`/admin/portal/messages/${id}`, {
            method: 'DELETE'
        });
    }
}
