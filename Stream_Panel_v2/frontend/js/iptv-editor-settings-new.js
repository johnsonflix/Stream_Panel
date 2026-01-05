/**
 * New IPTV Editor Settings Implementation
 * Per-playlist settings with queue management
 */

// This will replace the loadIPTVEditor method in settings.js
async function loadIPTVEditor() {
    const container = document.getElementById('iptv-editor');

    try {
        Utils.showLoading();

        // Fetch settings and playlists
        const [settingsRes, playlistsRes] = await Promise.all([
            API.getIPTVEditorSettings(),
            API.getIPTVEditorPlaylists()
        ]);

        const settings = settingsRes.settings || {};
        const playlists = playlistsRes.playlists || [];

        // Store globally for access in other functions
        window._iptvEditorPlaylists = playlists;

        Utils.hideLoading();

        container.innerHTML = `
            <div style="padding: 1.5rem; max-width: 900px;">
                <h2 style="color: var(--success-color); margin-bottom: 0.5rem;">
                    <i class="fas fa-edit"></i> IPTV Editor Integration
                </h2>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 2rem;">
                    Configure IPTV panels for multi-provider management
                </p>

                <!-- Bearer Token Section -->
                <div class="card mb-3">
                    <h4 style="margin-bottom: 1rem;">Bearer Token *</h4>
                    <textarea
                        class="form-input"
                        id="iptv-editor-bearer-token"
                        rows="3"
                        placeholder="Paste your IPTV Editor bearer token here"
                        style="font-family: monospace; font-size: 0.875rem;">${settings.bearer_token || ''}</textarea>
                    <small class="form-help">
                        <strong>Note:</strong> You can extract the bearer token from your web browser using developer tools (expires monthly).
                        Alternatively, open a support ticket with IPTV Editor to request a token valid for the length of your plan.
                    </small>

                    <div style="margin-top: 1rem; display: flex; gap: 0.75rem;">
                        <button class="btn btn-warning" onclick="Settings.testIPTVEditorConnection()" style="flex: 0 0 auto;">
                            <i class="fas fa-wifi"></i> Test Connection
                        </button>
                        <button class="btn btn-secondary" onclick="Settings.syncIPTVEditorPlaylists()" style="flex: 0 0 auto;">
                            <i class="fas fa-sync"></i> Sync Playlists
                        </button>
                        <button class="btn btn-primary" onclick="Settings.saveIPTVEditorBearerToken()" style="flex: 0 0 auto;">
                            <i class="fas fa-save"></i> Save Token
                        </button>
                    </div>
                </div>

                <!-- Playlists Section -->
                <div class="card">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-list"></i> IPTV Editor Playlists (${playlists.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure provider settings and auto-updater for each playlist
                            </p>
                        </div>
                    </div>

                    ${playlists.length === 0 ? `
                        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                            <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                            <p>No playlists synced yet</p>
                            <p style="font-size: 0.875rem;">Click "Sync Playlists" to fetch playlists from IPTV Editor</p>
                        </div>
                    ` : `
                        <div id="playlists-list">
                            ${playlists.map(playlist => this.renderPlaylistCard(playlist)).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

    } catch (error) {
        Utils.hideLoading();
        console.error('Error loading IPTV Editor:', error);
        container.innerHTML = `
            <div style="padding: 1.5rem;">
                <div class="alert alert-error">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to load IPTV Editor settings: ${error.message}
                </div>
            </div>
        `;
    }
}

// Render individual playlist card
function renderPlaylistCard(playlist) {
    const isExpanded = window._expandedPlaylists?.includes(playlist.id) || false;
    const hasSettings = playlist.provider_base_url && playlist.provider_username && playlist.provider_password;
    const autoUpdaterEnabled = playlist.auto_updater_enabled === 1;
    // SQLite stores timestamps in UTC - add 'Z' to parse correctly
    const lastRun = playlist.last_auto_updater_run ? new Date(playlist.last_auto_updater_run + 'Z').toLocaleString() : 'Never';
    const status = playlist.auto_updater_status || 'idle';

    return `
        <div class="card mb-2" style="border-left: 4px solid var(--${hasSettings ? 'success' : 'warning'}-color);">
            <div class="flex justify-between items-center" style="cursor: pointer;" onclick="Settings.togglePlaylistExpand(${playlist.id})">
                <div style="flex: 1;">
                    <h4 style="margin: 0; color: var(--text-primary);">
                        <i class="fas fa-${hasSettings ? 'check-circle' : 'exclamation-triangle'}"></i>
                        ${Utils.escapeHtml(playlist.name)}
                    </h4>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">
                        ${playlist.customer_count || 0} users | ${playlist.channel_count || 0} channels | ${playlist.movie_count || 0} movies | ${playlist.series_count || 0} series
                        ${hasSettings ? `| Auto-updater: ${autoUpdaterEnabled ? '<span style="color: var(--success-color);">ON</span>' : '<span style="color: var(--text-secondary);">OFF</span>'}` : ''}
                    </p>
                </div>
                <div>
                    <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                </div>
            </div>

            ${isExpanded ? `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                    <!-- Provider Settings -->
                    <div style="margin-bottom: 1.5rem;">
                        <h5 style="color: var(--primary-color); margin-bottom: 1rem;">
                            <i class="fas fa-cog"></i> Provider Settings
                        </h5>

                        <div class="form-group">
                            <label class="form-label required">Provider Base URL *</label>
                            <input
                                type="text"
                                class="form-input"
                                id="playlist-${playlist.id}-provider-url"
                                value="${Utils.escapeHtml(playlist.provider_base_url || '')}"
                                placeholder="https://example-provider.com">
                            <small class="form-help">The user-facing streaming URL</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Provider Username *</label>
                            <input
                                type="text"
                                class="form-input"
                                id="playlist-${playlist.id}-provider-username"
                                value="${Utils.escapeHtml(playlist.provider_username || '')}"
                                placeholder="your_provider_username">
                            <small class="form-help">Provider account username for auto-updater</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Provider Password *</label>
                            <input
                                type="password"
                                class="form-input"
                                id="playlist-${playlist.id}-provider-password"
                                value="${Utils.escapeHtml(playlist.provider_password || '')}"
                                placeholder="••••••••">
                            <small class="form-help">Provider account password for auto-updater</small>
                        </div>

                    </div>

                    <!-- IPTV Editor Playlist Credentials -->
                    <div style="margin-bottom: 1.5rem;">
                        <h5 style="color: var(--info-color); margin-bottom: 1rem;">
                            <i class="fas fa-key"></i> IPTV Editor Playlist Credentials
                        </h5>
                        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
                            Credentials for this playlist on the IPTV Editor DNS. Used for TV Guide caching.
                        </p>

                        <div class="form-group">
                            <label class="form-label">Playlist Username</label>
                            <input
                                type="text"
                                class="form-input"
                                id="playlist-${playlist.id}-guide-username"
                                value="${Utils.escapeHtml(playlist.guide_username || '')}"
                                placeholder="playlist_username">
                            <small class="form-help">Username for this playlist on the IPTV Editor</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Playlist Password</label>
                            <input
                                type="password"
                                class="form-input"
                                id="playlist-${playlist.id}-guide-password"
                                value="${Utils.escapeHtml(playlist.guide_password || '')}"
                                placeholder="••••••••">
                            <small class="form-help">Password for this playlist on the IPTV Editor</small>
                        </div>
                    </div>

                    <!-- Auto-Updater Settings -->
                    <div style="margin-bottom: 1.5rem;">
                        <h5 style="color: var(--warning-color); margin-bottom: 1rem;">
                            <i class="fas fa-clock"></i> Auto-Updater
                        </h5>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input
                                    type="checkbox"
                                    id="playlist-${playlist.id}-auto-updater-enabled"
                                    ${autoUpdaterEnabled ? 'checked' : ''}>
                                <span>Enable automatic playlist updates</span>
                            </label>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Update Schedule</label>
                            <select class="form-input" id="playlist-${playlist.id}-schedule">
                                <option value="1" ${playlist.auto_updater_schedule_hours === 1 ? 'selected' : ''}>Every hour</option>
                                <option value="2" ${playlist.auto_updater_schedule_hours === 2 ? 'selected' : ''}>Every 2 hours</option>
                                <option value="4" ${playlist.auto_updater_schedule_hours === 4 ? 'selected' : ''}>Every 4 hours</option>
                                <option value="6" ${playlist.auto_updater_schedule_hours === 6 ? 'selected' : ''}>Every 6 hours</option>
                                <option value="12" ${playlist.auto_updater_schedule_hours === 12 ? 'selected' : ''}>Every 12 hours</option>
                                <option value="24" ${playlist.auto_updater_schedule_hours === 24 || !playlist.auto_updater_schedule_hours ? 'selected' : ''}>Every 24 hours</option>
                            </select>
                        </div>

                        <div style="background: var(--bg-secondary); padding: 0.75rem; border-radius: 4px; margin-top: 1rem;">
                            <p style="font-size: 0.875rem; margin: 0;">
                                <strong>Status:</strong> <span style="color: var(--${status === 'running' ? 'warning' : 'success'}-color);">${status.toUpperCase()}</span><br>
                                <strong>Last Run:</strong> ${lastRun}
                            </p>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <button class="btn btn-primary" onclick="Settings.savePlaylistSettings(${playlist.id})">
                            <i class="fas fa-save"></i> Save Settings
                        </button>
                        <button class="btn btn-warning" onclick="Settings.runPlaylistAutoUpdater(${playlist.id})" ${status === 'running' ? 'disabled' : ''}>
                            <i class="fas fa-play"></i> Run Auto-Updater Now
                        </button>
                        <button class="btn btn-secondary" onclick="Settings.refreshPlaylistGuideCache(${playlist.id})" title="Refresh channel & EPG data for this playlist">
                            <i class="fas fa-sync"></i> Refresh Guide Cache
                        </button>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Toggle playlist expand/collapse
function togglePlaylistExpand(playlistId) {
    if (!window._expandedPlaylists) {
        window._expandedPlaylists = [];
    }

    const index = window._expandedPlaylists.indexOf(playlistId);
    if (index > -1) {
        window._expandedPlaylists.splice(index, 1);
    } else {
        window._expandedPlaylists.push(playlistId);
    }

    // Reload the section
    Settings.loadIPTVEditor();
}

// Save bearer token
async function saveIPTVEditorBearerToken() {
    try {
        const bearerToken = document.getElementById('iptv-editor-bearer-token').value.trim();

        if (!bearerToken) {
            Utils.showToast('Error', 'Bearer token is required', 'error');
            return;
        }

        Utils.showLoading('Saving bearer token...');

        await API.updateIPTVEditorSettings({
            bearer_token: bearerToken
        });

        Utils.hideLoading();
        Utils.showToast('Success', 'Bearer token saved successfully', 'success');

    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Error', error.message || 'Failed to save bearer token', 'error');
    }
}

// Save playlist settings
async function savePlaylistSettings(playlistId) {
    try {
        const providerUrl = document.getElementById(`playlist-${playlistId}-provider-url`).value.trim();
        const providerUsername = document.getElementById(`playlist-${playlistId}-provider-username`).value.trim();
        const providerPassword = document.getElementById(`playlist-${playlistId}-provider-password`).value.trim();
        const autoUpdaterEnabled = document.getElementById(`playlist-${playlistId}-auto-updater-enabled`).checked;
        const schedule = parseInt(document.getElementById(`playlist-${playlistId}-schedule`).value);
        const guideUsername = document.getElementById(`playlist-${playlistId}-guide-username`).value.trim();
        const guidePassword = document.getElementById(`playlist-${playlistId}-guide-password`).value.trim();

        if (!providerUrl || !providerUsername || !providerPassword) {
            Utils.showToast('Error', 'All provider fields are required', 'error');
            return;
        }

        Utils.showLoading('Saving playlist settings...');

        await API.updatePlaylistSettings(playlistId, {
            provider_base_url: providerUrl,
            provider_username: providerUsername,
            provider_password: providerPassword,
            auto_updater_enabled: autoUpdaterEnabled,
            auto_updater_schedule_hours: schedule,
            guide_username: guideUsername || null,
            guide_password: guidePassword || null
        });

        Utils.hideLoading();
        Utils.showToast('Success', 'Playlist settings saved successfully', 'success');

        // Reload to show updated status
        await Settings.loadIPTVEditor();

    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Error', error.message || 'Failed to save playlist settings', 'error');
    }
}

// Run auto-updater for specific playlist
async function runPlaylistAutoUpdater(playlistId) {
    try {
        Utils.showLoading('Running auto-updater...');

        const response = await API.runPlaylistAutoUpdater(playlistId);

        Utils.hideLoading();
        Utils.showToast('Success', response.message || 'Auto-updater completed successfully', 'success');

        // Reload to show updated status
        await Settings.loadIPTVEditor();

    } catch (error) {
        Utils.hideLoading();
        const message = error.message || 'Auto-updater failed';

        // Check if it's a queue conflict
        if (message.includes('currently running')) {
            Utils.showToast('Queue Conflict', message, 'warning');
        } else {
            Utils.showToast('Error', message, 'error');
        }
    }
}

// Refresh guide cache for specific playlist
async function refreshPlaylistGuideCache(playlistId) {
    try {
        Utils.showLoading('Refreshing guide cache...');

        const response = await fetch(`/api/v2/iptv-editor/playlists/${playlistId}/refresh-guide-cache`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();
        Utils.hideLoading();

        if (data.success) {
            Utils.showToast('Success', `Guide cache refreshed for ${data.playlist_name}: ${data.channels || 0} channels, ${data.epgPrograms || 0} EPG programs`, 'success');
        } else {
            Utils.showToast('Error', data.message || 'Failed to refresh guide cache', 'error');
        }

    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Error', error.message || 'Failed to refresh guide cache', 'error');
    }
}

// Test connection (existing method - keep as is)
async function testIPTVEditorConnection() {
    try {
        const bearerToken = document.getElementById('iptv-editor-bearer-token').value.trim();

        if (!bearerToken) {
            Utils.showToast('Error', 'Please enter a bearer token first', 'error');
            return;
        }

        Utils.showLoading('Testing connection...');

        // Save token first
        await API.updateIPTVEditorSettings({ bearer_token: bearerToken });

        // Test connection
        const response = await API.testIPTVEditorConnection();

        Utils.hideLoading();

        if (response.success) {
            Utils.showToast('Success', `Connected successfully! Found ${response.data?.length || 0} playlists`, 'success');
        } else {
            Utils.showToast('Error', response.message || 'Connection failed', 'error');
        }

    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Error', error.message || 'Connection test failed', 'error');
    }
}

// NOTE: linkPlaylistToPanel() function removed - relationship direction reversed
// Panels now link to playlists (not vice versa). Use IPTV Panels page to manage links.

// Sync playlists (existing method - keep as is)
async function syncIPTVEditorPlaylists() {
    try {
        const bearerToken = document.getElementById('iptv-editor-bearer-token').value.trim();

        if (!bearerToken) {
            Utils.showToast('Error', 'Please enter and save bearer token first', 'error');
            return;
        }

        Utils.showLoading('Syncing playlists from IPTV Editor...');

        // Save token first
        await API.updateIPTVEditorSettings({ bearer_token: bearerToken });

        // Sync playlists
        const response = await API.syncIPTVEditorPlaylists();

        Utils.hideLoading();

        if (response.success) {
            Utils.showToast('Success', `Synced ${response.data?.length || 0} playlists successfully`, 'success');
            // Reload to show synced playlists
            await Settings.loadIPTVEditor();
        } else {
            Utils.showToast('Error', response.message || 'Sync failed', 'error');
        }

    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Error', error.message || 'Failed to sync playlists', 'error');
    }
}
