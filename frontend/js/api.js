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
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
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

    static async assignTag(tagId, userId) {
        return this.request(`/tags/${tagId}/assign`, {
            method: 'POST',
            body: { user_id: userId }
        });
    }

    static async unassignTag(tagId, userId) {
        return this.request(`/tags/${tagId}/unassign`, {
            method: 'DELETE',
            body: { user_id: userId }
        });
    }

    static async runTagAutoAssignment() {
        return this.request('/tags/auto-assign', {
            method: 'POST'
        });
    }

    // ============ Users ============
    static async getUsers(search = '', includeInactive = false) {
        return this.request(`/users?search=${encodeURIComponent(search)}&include_inactive=${includeInactive}`);
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

    static async deleteUser(id) {
        return this.request(`/users/${id}`, {
            method: 'DELETE'
        });
    }

    static async extendPlexSubscription(id, months) {
        return this.request(`/users/${id}/extend-plex`, {
            method: 'POST',
            body: { months }
        });
    }

    static async extendIPTVSubscription(id, months) {
        return this.request(`/users/${id}/extend-iptv`, {
            method: 'POST',
            body: { months }
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
}
