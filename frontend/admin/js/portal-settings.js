/**
 * Portal Settings Extension for StreamPanel
 * Manages Portal Apps, Guides, and Quick Actions
 */

const PortalSettings = {
    apps: [],
    guides: [],
    quickActions: [],

    /**
     * Load Portal Apps tab
     */
    async loadPortalApps() {
        const container = document.getElementById('portal-apps');

        try {
            const response = await API.getPortalApps();
            this.apps = response.apps || [];

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-mobile-alt"></i> Portal Apps (${this.apps.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure apps shown to users in the portal by service and platform
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="PortalSettings.showAddAppModal()">
                            <i class="fas fa-plus"></i> Add App
                        </button>
                    </div>

                    ${this.apps.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-mobile-alt" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No portal apps configured</p>
                            <button class="btn btn-primary mt-2" onclick="PortalSettings.showAddAppModal()">
                                <i class="fas fa-plus"></i> Add Your First App
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 60px;">Order</th>
                                        <th>App</th>
                                        <th>Service</th>
                                        <th>Platform</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.apps.map((app, index) => `
                                        <tr>
                                            <td>
                                                <div style="display: flex; gap: 4px;">
                                                    ${index > 0 ? `<button class="btn btn-sm btn-outline" onclick="PortalSettings.moveApp(${app.id}, 'up')" title="Move up"><i class="fas fa-chevron-up"></i></button>` : ''}
                                                    ${index < this.apps.length - 1 ? `<button class="btn btn-sm btn-outline" onclick="PortalSettings.moveApp(${app.id}, 'down')" title="Move down"><i class="fas fa-chevron-down"></i></button>` : ''}
                                                </div>
                                            </td>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 10px;">
                                                    ${app.icon_url ? `<img src="${Utils.escapeHtml(app.icon_url)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain;">` : `<span style="font-size: 1.5rem;">${app.icon || '📱'}</span>`}
                                                    <div>
                                                        <strong>${Utils.escapeHtml(app.name)}</strong>
                                                        ${app.description ? `<br><small style="color: var(--text-secondary);">${Utils.escapeHtml(app.description.substring(0, 50))}${app.description.length > 50 ? '...' : ''}</small>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge ${app.service_type === 'plex' ? 'badge-warning' : app.service_type === 'iptv' ? 'badge-info' : 'badge-secondary'}">
                                                    ${app.service_type === 'both' ? 'Both' : app.service_type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge badge-secondary">
                                                    <i class="fas fa-${this.getPlatformIcon(app.platform_category)}"></i>
                                                    ${this.formatPlatform(app.platform_category)}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge badge-secondary">
                                                    ${this.formatAppType(app.app_type)}
                                                </span>
                                            </td>
                                            <td>
                                                ${Utils.getStatusBadge(app.is_active, 'Active', 'Inactive')}
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="PortalSettings.showEditAppModal(${app.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="PortalSettings.deleteApp(${app.id})" title="Delete">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
        } catch (error) {
            console.error('Error loading portal apps:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <p class="text-danger">Error loading portal apps: ${error.message}</p>
                    <button class="btn btn-primary mt-2" onclick="PortalSettings.loadPortalApps()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    getPlatformIcon(platform) {
        const icons = {
            tv: 'tv', android_tv: 'tv', firestick: 'fire', roku: 'tv', apple_tv: 'tv',
            mobile: 'mobile-alt', ios: 'apple', android_mobile: 'mobile-alt',
            desktop: 'desktop', windows: 'windows', macos: 'apple',
            web: 'globe'
        };
        return icons[platform] || 'question';
    },

    formatPlatform(platform) {
        const labels = {
            tv: 'TV', android_tv: 'Android TV', firestick: 'Fire TV', roku: 'Roku', apple_tv: 'Apple TV',
            mobile: 'Mobile', ios: 'iOS', android_mobile: 'Android',
            desktop: 'Desktop', windows: 'Windows', macos: 'macOS',
            web: 'Web'
        };
        return labels[platform] || platform;
    },

    formatAppType(type) {
        const labels = {
            downloader_code: 'Downloader Code',
            store_link: 'Store Link',
            direct_url: 'Direct URL',
            apk: 'APK Download',
            web_player: 'Web Player'
        };
        return labels[type] || type;
    },

    /**
     * Show Add App Modal
     */
    showAddAppModal() {
        Utils.showModal({
            title: 'Add Portal App',
            size: 'large',
            body: this.getAppFormHtml(),
            buttons: [
                { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                {
                    text: 'Create App',
                    class: 'btn-primary',
                    onClick: async () => {
                        const data = this.getAppFormData();
                        if (!this.validateAppForm(data)) return;

                        Utils.showLoading();
                        try {
                            await API.createPortalApp(data);
                            Utils.closeModal();
                            Utils.showToast('Success', 'App created successfully', 'success');
                            await this.loadPortalApps();
                        } catch (error) {
                            Utils.showToast('Error', error.message, 'error');
                        } finally {
                            Utils.hideLoading();
                        }
                    }
                }
            ]
        });

        this.setupAppFormListeners();
    },

    /**
     * Show Edit App Modal
     */
    async showEditAppModal(id) {
        Utils.showLoading();
        try {
            const response = await API.getPortalApp(id);
            const app = response.app;

            Utils.showModal({
                title: 'Edit Portal App',
                size: 'large',
                body: this.getAppFormHtml(app),
                buttons: [
                    { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: async () => {
                            const data = this.getAppFormData();
                            if (!this.validateAppForm(data)) return;

                            Utils.showLoading();
                            try {
                                await API.updatePortalApp(id, data);
                                Utils.closeModal();
                                Utils.showToast('Success', 'App updated successfully', 'success');
                                await this.loadPortalApps();
                            } catch (error) {
                                Utils.showToast('Error', error.message, 'error');
                            } finally {
                                Utils.hideLoading();
                            }
                        }
                    }
                ]
            });

            this.setupAppFormListeners();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    getAppFormHtml(app = {}) {
        return `
            <form id="app-form">
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="app-name">App Name <span class="required">*</span></label>
                        <input type="text" id="app-name" class="form-control" required value="${Utils.escapeHtml(app.name || '')}" placeholder="e.g., TiviMate">
                    </div>
                    <div class="form-group" style="width: 100px;">
                        <label for="app-icon">Icon</label>
                        <input type="text" id="app-icon" class="form-control" value="${app.icon || ''}" placeholder="📱">
                        <small class="form-text">Emoji</small>
                    </div>
                </div>

                <div class="form-group">
                    <label>Custom Icon (Optional)</label>
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="flex: 1;">
                            <input type="url" id="app-icon-url" class="form-control" value="${Utils.escapeHtml(app.icon_url || '')}" placeholder="https://example.com/icon.png" onchange="PortalSettings.updateIconPreview('app')">
                            <small class="form-text">Paste URL or upload image below</small>
                            <div style="margin-top: 8px;">
                                <input type="file" id="app-icon-file" accept="image/*" style="display: none;" onchange="PortalSettings.handleIconUpload('app', this)">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('app-icon-file').click()">
                                    <i class="fas fa-upload"></i> Upload Icon
                                </button>
                            </div>
                        </div>
                        <div id="app-icon-preview" style="width: 60px; height: 60px; border: 1px dashed var(--border-color); border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary);">
                            ${app.icon_url ? `<img src="${Utils.escapeHtml(app.icon_url)}" style="max-width: 100%; max-height: 100%; border-radius: 6px;">` : '<i class="fas fa-image" style="color: var(--text-tertiary);"></i>'}
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="app-description">Description</label>
                    <textarea id="app-description" class="form-control" rows="2" placeholder="Brief description of the app">${Utils.escapeHtml(app.description || '')}</textarea>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="app-service-type">Service Type <span class="required">*</span></label>
                        <select id="app-service-type" class="form-control" required>
                            <option value="iptv" ${app.service_type === 'iptv' ? 'selected' : ''}>IPTV Only</option>
                            <option value="plex" ${app.service_type === 'plex' ? 'selected' : ''}>Plex Only</option>
                            <option value="both" ${app.service_type === 'both' ? 'selected' : ''}>Both Services</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label for="app-platform">Platform <span class="required">*</span></label>
                        <select id="app-platform" class="form-control" required onchange="PortalSettings.updateAppTypeOptions()">
                            <optgroup label="TV Devices">
                                <option value="android_tv" ${app.platform_category === 'android_tv' || app.platform_category === 'tv' ? 'selected' : ''}>Android TV / Fire TV</option>
                                <option value="roku" ${app.platform_category === 'roku' ? 'selected' : ''}>Roku</option>
                                <option value="apple_tv" ${app.platform_category === 'apple_tv' ? 'selected' : ''}>Apple TV</option>
                            </optgroup>
                            <optgroup label="Mobile">
                                <option value="mobile" ${app.platform_category === 'mobile' || app.platform_category === 'ios' || app.platform_category === 'android_mobile' ? 'selected' : ''}>Mobile (iOS & Android)</option>
                            </optgroup>
                            <optgroup label="Desktop">
                                <option value="windows" ${app.platform_category === 'windows' ? 'selected' : ''}>Windows</option>
                                <option value="macos" ${app.platform_category === 'macos' || app.platform_category === 'desktop' ? 'selected' : ''}>macOS</option>
                            </optgroup>
                            <optgroup label="Other">
                                <option value="web" ${app.platform_category === 'web' ? 'selected' : ''}>Web Browser</option>
                            </optgroup>
                        </select>
                    </div>
                </div>

                <div class="form-group" id="app-type-group">
                    <label for="app-type">App Type <span class="required">*</span></label>
                    <select id="app-type" class="form-control" required>
                        <!-- Options populated dynamically based on platform -->
                    </select>
                </div>

                <!-- Dynamic fields based on platform and app type -->
                <div id="downloader-code-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-downloader-code">Downloader Code <span class="required">*</span></label>
                        <input type="text" id="app-downloader-code" class="form-control" value="${Utils.escapeHtml(app.downloader_code || '')}" placeholder="e.g., 12345">
                        <small class="form-text">Code for Downloader app on Fire TV / Android TV</small>
                    </div>
                </div>

                <div id="play-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-android">Google Play Store URL <span class="required">*</span></label>
                        <input type="url" id="app-store-android" class="form-control" value="${Utils.escapeHtml(app.store_url_android || '')}" placeholder="https://play.google.com/store/apps/details?id=...">
                    </div>
                </div>

                <div id="apk-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-apk-url">APK Download URL <span class="required">*</span></label>
                        <input type="url" id="app-apk-url" class="form-control" value="${Utils.escapeHtml(app.apk_url || '')}" placeholder="https://example.com/app.apk">
                    </div>
                </div>

                <div id="roku-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-roku">Roku Channel Store URL <span class="required">*</span></label>
                        <input type="url" id="app-store-roku" class="form-control" value="${Utils.escapeHtml(app.store_url_roku || '')}" placeholder="https://channelstore.roku.com/details/...">
                    </div>
                </div>

                <div id="appletv-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-appletv">Apple TV App Store URL <span class="required">*</span></label>
                        <input type="url" id="app-store-appletv" class="form-control" value="${Utils.escapeHtml(app.store_url_appletv || '')}" placeholder="https://apps.apple.com/app/...">
                    </div>
                </div>

                <div id="mobile-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-ios">iOS App Store URL</label>
                        <input type="url" id="app-store-ios" class="form-control" value="${Utils.escapeHtml(app.store_url_ios || '')}" placeholder="https://apps.apple.com/app/...">
                        <small class="form-text">Leave empty if not available on iOS</small>
                    </div>
                    <div class="form-group">
                        <label for="app-store-android-mobile">Google Play Store URL</label>
                        <input type="url" id="app-store-android-mobile" class="form-control" value="${Utils.escapeHtml(app.store_url_android || '')}" placeholder="https://play.google.com/store/apps/details?id=...">
                        <small class="form-text">Leave empty if not available on Android</small>
                    </div>
                </div>

                <div id="windows-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-windows">Microsoft Store URL <span class="required">*</span></label>
                        <input type="url" id="app-store-windows" class="form-control" value="${Utils.escapeHtml(app.store_url_windows || '')}" placeholder="https://apps.microsoft.com/store/detail/...">
                    </div>
                </div>

                <div id="windows-download-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-direct-url-windows">Windows Installer URL <span class="required">*</span></label>
                        <input type="url" id="app-direct-url-windows" class="form-control" value="${Utils.escapeHtml(app.direct_url || '')}" placeholder="https://example.com/setup.exe">
                    </div>
                </div>

                <div id="mac-store-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-store-mac">Mac App Store URL <span class="required">*</span></label>
                        <input type="url" id="app-store-mac" class="form-control" value="${Utils.escapeHtml(app.store_url_mac || '')}" placeholder="https://apps.apple.com/app/...">
                    </div>
                </div>

                <div id="mac-download-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-direct-url-mac">Mac Installer URL <span class="required">*</span></label>
                        <input type="url" id="app-direct-url-mac" class="form-control" value="${Utils.escapeHtml(app.direct_url || '')}" placeholder="https://example.com/app.dmg">
                    </div>
                </div>

                <div id="web-player-fields" class="app-fields" style="display: none;">
                    <div class="form-group">
                        <label for="app-web-url">Web Player URL <span class="required">*</span></label>
                        <input type="text" id="app-web-url" class="form-control" value="${Utils.escapeHtml(app.web_player_url || '')}" placeholder="/portal/player.html or https://...">
                        <small class="form-text">Use relative path like <code>/portal/player.html</code> or full URL</small>
                    </div>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="app-active" ${app.is_active !== false ? 'checked' : ''}>
                        Active
                    </label>
                    <small class="form-text">Inactive apps won't be shown in the portal</small>
                </div>
            </form>
        `;
    },

    setupAppFormListeners() {
        const platformSelect = document.getElementById('app-platform');
        const typeSelect = document.getElementById('app-type');
        if (platformSelect && typeSelect) {
            platformSelect.addEventListener('change', () => this.updateAppTypeOptions());
            typeSelect.addEventListener('change', () => this.toggleAppTypeFields());
            // Initialize on load
            this.updateAppTypeOptions();
        }
    },

    // Platform-specific app type options
    platformAppTypes: {
        android_tv: [
            { value: 'play_store', label: 'Google Play Store Link' },
            { value: 'downloader_code', label: 'Downloader Code' },
            { value: 'apk', label: 'APK Download' }
        ],
        roku: [
            { value: 'roku_store', label: 'Roku Channel Store Link' }
        ],
        apple_tv: [
            { value: 'appletv_store', label: 'Apple TV App Store Link' }
        ],
        mobile: [
            { value: 'mobile_store', label: 'App Store Links (iOS & Android)' }
        ],
        windows: [
            { value: 'windows_store', label: 'Microsoft Store Link' },
            { value: 'windows_download', label: 'Direct Download (Installer)' }
        ],
        macos: [
            { value: 'mac_store', label: 'Mac App Store Link' },
            { value: 'mac_download', label: 'Direct Download (Installer)' }
        ],
        web: [
            { value: 'web_player', label: 'Web Player URL' }
        ]
    },

    updateAppTypeOptions() {
        const platform = document.getElementById('app-platform').value;
        const typeSelect = document.getElementById('app-type');
        const typeGroup = document.getElementById('app-type-group');
        const currentType = typeSelect.value;

        const options = this.platformAppTypes[platform] || [];

        // If only one option, hide the dropdown and auto-select
        if (options.length === 1) {
            typeGroup.style.display = 'none';
            typeSelect.innerHTML = `<option value="${options[0].value}" selected>${options[0].label}</option>`;
        } else {
            typeGroup.style.display = 'block';
            typeSelect.innerHTML = options.map(opt =>
                `<option value="${opt.value}" ${opt.value === currentType ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
        }

        this.toggleAppTypeFields();
    },

    toggleAppTypeFields() {
        const type = document.getElementById('app-type').value;

        // Hide all field groups first
        document.querySelectorAll('.app-fields').forEach(el => el.style.display = 'none');

        // Show relevant fields based on app type
        const fieldMap = {
            'downloader_code': 'downloader-code-fields',
            'play_store': 'play-store-fields',
            'apk': 'apk-fields',
            'roku_store': 'roku-store-fields',
            'appletv_store': 'appletv-store-fields',
            'mobile_store': 'mobile-store-fields',
            'windows_store': 'windows-store-fields',
            'windows_download': 'windows-download-fields',
            'mac_store': 'mac-store-fields',
            'mac_download': 'mac-download-fields',
            'web_player': 'web-player-fields'
        };

        if (fieldMap[type]) {
            document.getElementById(fieldMap[type]).style.display = 'block';
        }
    },

    getAppFormData() {
        const appType = document.getElementById('app-type').value;
        const platform = document.getElementById('app-platform').value;

        // Build data object based on platform and app type
        const data = {
            name: document.getElementById('app-name').value.trim(),
            icon: document.getElementById('app-icon').value.trim() || null,
            icon_url: document.getElementById('app-icon-url').value.trim() || null,
            description: document.getElementById('app-description').value.trim() || null,
            service_type: document.getElementById('app-service-type').value,
            platform_category: platform,
            app_type: appType,
            is_active: document.getElementById('app-active').checked,
            // Reset all URL fields
            downloader_code: null,
            store_url_ios: null,
            store_url_android: null,
            store_url_windows: null,
            store_url_mac: null,
            store_url_roku: null,
            store_url_appletv: null,
            direct_url: null,
            apk_url: null,
            web_player_url: null
        };

        // Set specific fields based on app type
        switch (appType) {
            case 'downloader_code':
                data.downloader_code = document.getElementById('app-downloader-code').value.trim() || null;
                break;
            case 'play_store':
                data.store_url_android = document.getElementById('app-store-android').value.trim() || null;
                break;
            case 'apk':
                data.apk_url = document.getElementById('app-apk-url').value.trim() || null;
                break;
            case 'roku_store':
                data.store_url_roku = document.getElementById('app-store-roku').value.trim() || null;
                break;
            case 'appletv_store':
                data.store_url_appletv = document.getElementById('app-store-appletv').value.trim() || null;
                break;
            case 'mobile_store':
                data.store_url_ios = document.getElementById('app-store-ios').value.trim() || null;
                data.store_url_android = document.getElementById('app-store-android-mobile').value.trim() || null;
                break;
            case 'windows_store':
                data.store_url_windows = document.getElementById('app-store-windows').value.trim() || null;
                break;
            case 'windows_download':
                data.direct_url = document.getElementById('app-direct-url-windows').value.trim() || null;
                break;
            case 'mac_store':
                data.store_url_mac = document.getElementById('app-store-mac').value.trim() || null;
                break;
            case 'mac_download':
                data.direct_url = document.getElementById('app-direct-url-mac').value.trim() || null;
                break;
            case 'web_player':
                data.web_player_url = document.getElementById('app-web-url').value.trim() || null;
                break;
        }

        return data;
    },

    validateAppForm(data) {
        if (!data.name) {
            Utils.showToast('Error', 'App name is required', 'error');
            return false;
        }

        // Validate based on app type
        const validations = {
            'downloader_code': { field: 'downloader_code', message: 'Downloader code is required' },
            'play_store': { field: 'store_url_android', message: 'Google Play Store URL is required' },
            'apk': { field: 'apk_url', message: 'APK URL is required' },
            'roku_store': { field: 'store_url_roku', message: 'Roku Channel Store URL is required' },
            'appletv_store': { field: 'store_url_appletv', message: 'Apple TV App Store URL is required' },
            'windows_store': { field: 'store_url_windows', message: 'Microsoft Store URL is required' },
            'windows_download': { field: 'direct_url', message: 'Windows installer URL is required' },
            'mac_store': { field: 'store_url_mac', message: 'Mac App Store URL is required' },
            'mac_download': { field: 'direct_url', message: 'Mac installer URL is required' },
            'web_player': { field: 'web_player_url', message: 'Web player URL is required' }
        };

        // Mobile store requires at least one URL
        if (data.app_type === 'mobile_store') {
            if (!data.store_url_ios && !data.store_url_android) {
                Utils.showToast('Error', 'At least one store URL (iOS or Android) is required', 'error');
                return false;
            }
            return true;
        }

        const validation = validations[data.app_type];
        if (validation && !data[validation.field]) {
            Utils.showToast('Error', validation.message, 'error');
            return false;
        }

        return true;
    },

    async moveApp(id, direction) {
        const currentIndex = this.apps.findIndex(a => a.id === id);
        if (currentIndex === -1) return;

        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= this.apps.length) return;

        // Swap
        const newApps = [...this.apps];
        [newApps[currentIndex], newApps[newIndex]] = [newApps[newIndex], newApps[currentIndex]];

        Utils.showLoading();
        try {
            await API.reorderPortalApps(newApps.map(a => a.id));
            await this.loadPortalApps();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    async deleteApp(id) {
        if (!confirm('Are you sure you want to delete this app?')) return;

        Utils.showLoading();
        try {
            await API.deletePortalApp(id);
            Utils.showToast('Success', 'App deleted', 'success');
            await this.loadPortalApps();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    // ============ Guides ============

    async loadPortalGuides() {
        const container = document.getElementById('portal-guides');

        try {
            const response = await API.getPortalGuides();
            this.guides = response.guides || [];

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-book"></i> Portal Guides (${this.guides.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Create how-to guides and documentation for your users
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="PortalSettings.showAddGuideModal()">
                            <i class="fas fa-plus"></i> Add Guide
                        </button>
                    </div>

                    ${this.guides.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-book" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No guides created yet</p>
                            <button class="btn btn-primary mt-2" onclick="PortalSettings.showAddGuideModal()">
                                <i class="fas fa-plus"></i> Create Your First Guide
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Guide</th>
                                        <th>Service</th>
                                        <th>Category</th>
                                        <th>Public</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.guides.map(guide => `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 10px;">
                                                    ${guide.icon_url ? `<img src="${Utils.escapeHtml(guide.icon_url)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain;">` : `<span style="font-size: 1.5rem;">${guide.icon || '📖'}</span>`}
                                                    <div>
                                                        <strong>${Utils.escapeHtml(guide.title)}</strong>
                                                        ${guide.slug ? `<br><small style="color: var(--text-secondary);"><code>/portal/guide-viewer.html?slug=${guide.slug}</code></small>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge ${guide.service_type === 'plex' ? 'badge-warning' : guide.service_type === 'iptv' ? 'badge-info' : 'badge-secondary'}">
                                                    ${guide.service_type === 'both' ? 'Both' : (guide.service_type || 'General').toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge badge-secondary">${Utils.escapeHtml(guide.category || 'General')}</span>
                                            </td>
                                            <td>
                                                ${guide.is_public ? '<span class="badge badge-success"><i class="fas fa-globe"></i> Public</span>' : '<span class="badge badge-secondary"><i class="fas fa-lock"></i> Private</span>'}
                                            </td>
                                            <td>
                                                ${Utils.getStatusBadge(guide.is_active, 'Active', 'Inactive')}
                                            </td>
                                            <td>
                                                ${guide.is_public && guide.slug ? `<button class="btn btn-sm btn-outline" onclick="window.open('/portal/guide-viewer.html?slug=${guide.slug}', '_blank')" title="View Public Link"><i class="fas fa-external-link-alt"></i></button>` : ''}
                                                <button class="btn btn-sm btn-outline" onclick="PortalSettings.showEditGuideModal(${guide.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="PortalSettings.deleteGuide(${guide.id})" title="Delete">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
        } catch (error) {
            console.error('Error loading portal guides:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <p class="text-danger">Error loading guides: ${error.message}</p>
                    <button class="btn btn-primary mt-2" onclick="PortalSettings.loadPortalGuides()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    showAddGuideModal() {
        Utils.showModal({
            title: 'Create Guide',
            size: 'xlarge',
            body: this.getGuideFormHtml(),
            buttons: [
                { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                {
                    text: 'Create Guide',
                    class: 'btn-primary',
                    onClick: async () => {
                        const data = this.getGuideFormData();
                        if (!this.validateGuideForm(data)) return;

                        Utils.showLoading();
                        try {
                            await API.createPortalGuide(data);
                            Utils.closeModal();
                            Utils.showToast('Success', 'Guide created successfully', 'success');
                            await this.loadPortalGuides();
                        } catch (error) {
                            Utils.showToast('Error', error.message, 'error');
                        } finally {
                            Utils.hideLoading();
                        }
                    }
                }
            ]
        });
    },

    async showEditGuideModal(id) {
        Utils.showLoading();
        try {
            const response = await API.getPortalGuide(id);
            const guide = response.guide;

            Utils.showModal({
                title: 'Edit Guide',
                size: 'xlarge',
                body: this.getGuideFormHtml(guide),
                buttons: [
                    { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: async () => {
                            const data = this.getGuideFormData();
                            if (!this.validateGuideForm(data)) return;

                            Utils.showLoading();
                            try {
                                await API.updatePortalGuide(id, data);
                                Utils.closeModal();
                                Utils.showToast('Success', 'Guide updated successfully', 'success');
                                await this.loadPortalGuides();
                            } catch (error) {
                                Utils.showToast('Error', error.message, 'error');
                            } finally {
                                Utils.hideLoading();
                            }
                        }
                    }
                ]
            });
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    getGuideFormHtml(guide = {}) {
        return `
            <form id="guide-form">
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="guide-title">Title <span class="required">*</span></label>
                        <input type="text" id="guide-title" class="form-control" required value="${Utils.escapeHtml(guide.title || '')}" placeholder="e.g., Getting Started with TiviMate">
                    </div>
                    <div class="form-group" style="width: 100px;">
                        <label for="guide-icon">Icon</label>
                        <input type="text" id="guide-icon" class="form-control" value="${guide.icon || ''}" placeholder="📖">
                    </div>
                </div>

                <div class="form-group">
                    <label>Custom Icon (Optional)</label>
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="flex: 1;">
                            <input type="url" id="guide-icon-url" class="form-control" value="${Utils.escapeHtml(guide.icon_url || '')}" placeholder="https://example.com/icon.png" onchange="PortalSettings.updateIconPreview('guide')">
                            <small class="form-text">Paste URL or upload image below</small>
                            <div style="margin-top: 8px;">
                                <input type="file" id="guide-icon-file" accept="image/*" style="display: none;" onchange="PortalSettings.handleIconUpload('guide', this)">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('guide-icon-file').click()">
                                    <i class="fas fa-upload"></i> Upload Icon
                                </button>
                            </div>
                        </div>
                        <div id="guide-icon-preview" style="width: 60px; height: 60px; border: 1px dashed var(--border-color); border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary);">
                            ${guide.icon_url ? `<img src="${Utils.escapeHtml(guide.icon_url)}" style="max-width: 100%; max-height: 100%; border-radius: 6px;">` : '<i class="fas fa-image" style="color: var(--text-tertiary);"></i>'}
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="guide-slug">URL Slug</label>
                        <input type="text" id="guide-slug" class="form-control" value="${Utils.escapeHtml(guide.slug || '')}" placeholder="getting-started-tivimate">
                        <small class="form-text">Used for public URL: /portal/guide-viewer.html?slug=<strong>your-slug</strong></small>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label for="guide-category">Category</label>
                        <input type="text" id="guide-category" class="form-control" value="${Utils.escapeHtml(guide.category || '')}" placeholder="e.g., Setup, Troubleshooting">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="guide-service-type">Service Type</label>
                        <select id="guide-service-type" class="form-control">
                            <option value="" ${!guide.service_type ? 'selected' : ''}>General (All Users)</option>
                            <option value="iptv" ${guide.service_type === 'iptv' ? 'selected' : ''}>IPTV Only</option>
                            <option value="plex" ${guide.service_type === 'plex' ? 'selected' : ''}>Plex Only</option>
                            <option value="both" ${guide.service_type === 'both' ? 'selected' : ''}>Both Services</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label for="guide-content-type">Content Type</label>
                        <select id="guide-content-type" class="form-control">
                            <option value="markdown" ${guide.content_type === 'markdown' || !guide.content_type ? 'selected' : ''}>Markdown</option>
                            <option value="html" ${guide.content_type === 'html' ? 'selected' : ''}>HTML</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="guide-content">Content <span class="required">*</span></label>
                    <textarea id="guide-content" class="form-control" rows="15" style="font-family: monospace; font-size: 13px;" placeholder="# Guide Title

Write your guide content here using Markdown...

## Section 1
- Step 1
- Step 2

## Section 2
More content...">${Utils.escapeHtml(guide.content || '')}</textarea>
                    <small class="form-text">Supports Markdown formatting (headers, lists, links, code blocks, etc.)</small>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label class="checkbox-label">
                            <input type="checkbox" id="guide-public" ${guide.is_public ? 'checked' : ''}>
                            Make Public
                        </label>
                        <small class="form-text">Public guides can be viewed without logging in via the slug URL</small>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label class="checkbox-label">
                            <input type="checkbox" id="guide-active" ${guide.is_active !== false ? 'checked' : ''}>
                            Active
                        </label>
                        <small class="form-text">Inactive guides won't be shown in the portal</small>
                    </div>
                </div>
            </form>
        `;
    },

    getGuideFormData() {
        return {
            title: document.getElementById('guide-title').value.trim(),
            icon: document.getElementById('guide-icon').value.trim() || null,
            icon_url: document.getElementById('guide-icon-url').value.trim() || null,
            slug: document.getElementById('guide-slug').value.trim() || null,
            category: document.getElementById('guide-category').value.trim() || null,
            service_type: document.getElementById('guide-service-type').value || null,
            content_type: document.getElementById('guide-content-type').value,
            content: document.getElementById('guide-content').value,
            is_public: document.getElementById('guide-public').checked,
            is_active: document.getElementById('guide-active').checked
        };
    },

    validateGuideForm(data) {
        if (!data.title) {
            Utils.showToast('Error', 'Guide title is required', 'error');
            return false;
        }
        if (!data.content) {
            Utils.showToast('Error', 'Guide content is required', 'error');
            return false;
        }
        return true;
    },

    async deleteGuide(id) {
        if (!confirm('Are you sure you want to delete this guide?')) return;

        Utils.showLoading();
        try {
            await API.deletePortalGuide(id);
            Utils.showToast('Success', 'Guide deleted', 'success');
            await this.loadPortalGuides();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    // ============ Quick Actions ============

    async loadPortalQuickActions() {
        const container = document.getElementById('portal-quick-actions');

        try {
            const response = await API.getPortalQuickActions();
            this.quickActions = response.actions || [];

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-bolt"></i> Quick Actions (${this.quickActions.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure quick action cards shown in the portal (Web Player, TV Guide, Request Site, etc.)
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="PortalSettings.showAddQuickActionModal()">
                            <i class="fas fa-plus"></i> Add Quick Action
                        </button>
                    </div>

                    ${this.quickActions.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-bolt" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No quick actions configured</p>
                            <button class="btn btn-primary mt-2" onclick="PortalSettings.showAddQuickActionModal()">
                                <i class="fas fa-plus"></i> Add Your First Quick Action
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Action</th>
                                        <th>Service</th>
                                        <th>Type</th>
                                        <th>URL / Action</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.quickActions.map(action => `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 10px;">
                                                    ${action.icon_url ? `<img src="${Utils.escapeHtml(action.icon_url)}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: contain;">` : `<span style="font-size: 1.5rem;">${action.icon || '⚡'}</span>`}
                                                    <div>
                                                        <strong>${Utils.escapeHtml(action.name)}</strong>
                                                        ${action.description ? `<br><small style="color: var(--text-secondary);">${Utils.escapeHtml(action.description.substring(0, 40))}${action.description.length > 40 ? '...' : ''}</small>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge ${action.service_type === 'plex' ? 'badge-warning' : action.service_type === 'iptv' ? 'badge-info' : 'badge-secondary'}">
                                                    ${action.service_type === 'both' ? 'Both' : action.service_type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge badge-secondary">${this.formatActionType(action.action_type)}</span>
                                            </td>
                                            <td>
                                                <code style="font-size: 0.875rem;">${Utils.escapeHtml((action.url || action.action_type || '').substring(0, 40))}${(action.url || '').length > 40 ? '...' : ''}</code>
                                            </td>
                                            <td>
                                                ${Utils.getStatusBadge(action.is_active, 'Active', 'Inactive')}
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="PortalSettings.showEditQuickActionModal(${action.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                ${action.action_type === 'internal' && action.service_type === 'iptv' ? `
                                                    <span class="badge badge-secondary" title="System action - cannot be deleted">
                                                        <i class="fas fa-lock"></i> System
                                                    </span>
                                                ` : `
                                                    <button class="btn btn-sm btn-danger" onclick="PortalSettings.deleteQuickAction(${action.id})" title="Delete">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                `}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
        } catch (error) {
            console.error('Error loading quick actions:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <p class="text-danger">Error loading quick actions: ${error.message}</p>
                    <button class="btn btn-primary mt-2" onclick="PortalSettings.loadPortalQuickActions()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    formatActionType(type) {
        const labels = {
            link: 'External Link',
            internal: 'Internal Page',
            plex_web: 'Plex Web App',
            request_site: 'Request Site',
            tv_guide: 'TV Guide',
            web_player: 'Web Player'
        };
        return labels[type] || type;
    },

    showAddQuickActionModal() {
        Utils.showModal({
            title: 'Add Quick Action',
            size: 'large',
            body: this.getQuickActionFormHtml(),
            buttons: [
                { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                {
                    text: 'Create Action',
                    class: 'btn-primary',
                    onClick: async () => {
                        const data = this.getQuickActionFormData();
                        if (!this.validateQuickActionForm(data)) return;

                        Utils.showLoading();
                        try {
                            await API.createPortalQuickAction(data);
                            Utils.closeModal();
                            Utils.showToast('Success', 'Quick action created successfully', 'success');
                            await this.loadPortalQuickActions();
                        } catch (error) {
                            Utils.showToast('Error', error.message, 'error');
                        } finally {
                            Utils.hideLoading();
                        }
                    }
                }
            ]
        });

        this.setupQuickActionFormListeners();
    },

    async showEditQuickActionModal(id) {
        Utils.showLoading();
        try {
            const response = await API.getPortalQuickAction(id);
            const action = response.action;

            Utils.showModal({
                title: 'Edit Quick Action',
                size: 'large',
                body: this.getQuickActionFormHtml(action),
                buttons: [
                    { text: 'Cancel', class: 'btn-secondary', onClick: () => Utils.closeModal() },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: async () => {
                            const data = this.getQuickActionFormData();
                            if (!this.validateQuickActionForm(data)) return;

                            Utils.showLoading();
                            try {
                                await API.updatePortalQuickAction(id, data);
                                Utils.closeModal();
                                Utils.showToast('Success', 'Quick action updated successfully', 'success');
                                await this.loadPortalQuickActions();
                            } catch (error) {
                                Utils.showToast('Error', error.message, 'error');
                            } finally {
                                Utils.hideLoading();
                            }
                        }
                    }
                ]
            });

            this.setupQuickActionFormListeners();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    getQuickActionFormHtml(action = {}) {
        return `
            <form id="quick-action-form">
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="action-name">Name <span class="required">*</span></label>
                        <input type="text" id="action-name" class="form-control" required value="${Utils.escapeHtml(action.name || '')}" placeholder="e.g., Web Player">
                    </div>
                    <div class="form-group" style="width: 100px;">
                        <label for="action-icon">Icon</label>
                        <input type="text" id="action-icon" class="form-control" value="${action.icon || ''}" placeholder="🎬">
                    </div>
                </div>

                <div class="form-group">
                    <label>Custom Icon (Optional)</label>
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="flex: 1;">
                            <input type="url" id="action-icon-url" class="form-control" value="${Utils.escapeHtml(action.icon_url || '')}" placeholder="https://example.com/icon.png" onchange="PortalSettings.updateIconPreview('action')">
                            <small class="form-text">Paste URL or upload image below</small>
                            <div style="margin-top: 8px;">
                                <input type="file" id="action-icon-file" accept="image/*" style="display: none;" onchange="PortalSettings.handleIconUpload('action', this)">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('action-icon-file').click()">
                                    <i class="fas fa-upload"></i> Upload Icon
                                </button>
                            </div>
                        </div>
                        <div id="action-icon-preview" style="width: 60px; height: 60px; border: 1px dashed var(--border-color); border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary);">
                            ${action.icon_url ? `<img src="${Utils.escapeHtml(action.icon_url)}" style="max-width: 100%; max-height: 100%; border-radius: 6px;">` : '<i class="fas fa-image" style="color: var(--text-tertiary);"></i>'}
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="action-description">Description</label>
                    <input type="text" id="action-description" class="form-control" value="${Utils.escapeHtml(action.description || '')}" placeholder="Brief description">
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label for="action-service-type">Service Type <span class="required">*</span></label>
                        <select id="action-service-type" class="form-control" required>
                            <option value="iptv" ${action.service_type === 'iptv' ? 'selected' : ''}>IPTV Only</option>
                            <option value="plex" ${action.service_type === 'plex' ? 'selected' : ''}>Plex Only</option>
                            <option value="both" ${action.service_type === 'both' ? 'selected' : ''}>Both Services</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label for="action-type">Action Type <span class="required">*</span></label>
                        <select id="action-type" class="form-control" required>
                            <option value="link" ${action.action_type === 'link' ? 'selected' : ''}>External Link</option>
                            <option value="internal" ${action.action_type === 'internal' ? 'selected' : ''}>Internal Page</option>
                            <option value="plex_web" ${action.action_type === 'plex_web' ? 'selected' : ''}>Plex Web App (auto-resolves URL)</option>
                            <option value="request_site" ${action.action_type === 'request_site' ? 'selected' : ''}>Request Site (auto-resolves URL)</option>
                            <option value="tv_guide" ${action.action_type === 'tv_guide' ? 'selected' : ''}>TV Guide</option>
                            <option value="web_player" ${action.action_type === 'web_player' ? 'selected' : ''}>Web Player</option>
                        </select>
                    </div>
                </div>

                <div id="action-url-field">
                    <div class="form-group">
                        <label for="action-url">URL</label>
                        <input type="text" id="action-url" class="form-control" value="${Utils.escapeHtml(action.url || '')}" placeholder="https://... or /portal/...">
                        <small class="form-text">Leave empty for auto-resolved actions (Plex Web, Request Site, TV Guide, Web Player)</small>
                    </div>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="action-active" ${action.is_active !== false ? 'checked' : ''}>
                        Active
                    </label>
                </div>
            </form>
        `;
    },

    setupQuickActionFormListeners() {
        const typeSelect = document.getElementById('action-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => this.toggleQuickActionUrlField());
            this.toggleQuickActionUrlField();
        }
    },

    toggleQuickActionUrlField() {
        const type = document.getElementById('action-type').value;
        const urlField = document.getElementById('action-url-field');
        const autoTypes = ['plex_web', 'request_site', 'tv_guide', 'web_player'];

        if (autoTypes.includes(type)) {
            urlField.style.opacity = '0.5';
            document.getElementById('action-url').placeholder = 'Auto-resolved based on action type';
        } else {
            urlField.style.opacity = '1';
            document.getElementById('action-url').placeholder = 'https://... or /portal/...';
        }
    },

    getQuickActionFormData() {
        return {
            name: document.getElementById('action-name').value.trim(),
            icon: document.getElementById('action-icon').value.trim() || null,
            icon_url: document.getElementById('action-icon-url').value.trim() || null,
            description: document.getElementById('action-description').value.trim() || null,
            service_type: document.getElementById('action-service-type').value,
            action_type: document.getElementById('action-type').value,
            url: document.getElementById('action-url').value.trim() || null,
            is_active: document.getElementById('action-active').checked
        };
    },

    validateQuickActionForm(data) {
        if (!data.name) {
            Utils.showToast('Error', 'Action name is required', 'error');
            return false;
        }
        const autoTypes = ['plex_web', 'request_site', 'tv_guide', 'web_player'];
        if (!autoTypes.includes(data.action_type) && !data.url) {
            Utils.showToast('Error', 'URL is required for this action type', 'error');
            return false;
        }
        return true;
    },

    async deleteQuickAction(id) {
        if (!confirm('Are you sure you want to delete this quick action?')) return;

        Utils.showLoading();
        try {
            await API.deletePortalQuickAction(id);
            Utils.showToast('Success', 'Quick action deleted', 'success');
            await this.loadPortalQuickActions();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    // ============ Icon Upload Helpers ============

    /**
     * Update icon preview when URL changes
     */
    updateIconPreview(type) {
        const urlInput = document.getElementById(`${type}-icon-url`);
        const preview = document.getElementById(`${type}-icon-preview`);
        const url = urlInput.value.trim();

        if (url) {
            preview.innerHTML = `<img src="${Utils.escapeHtml(url)}" style="max-width: 100%; max-height: 100%; border-radius: 6px;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-exclamation-triangle\\' style=\\'color: var(--error-color);\\'></i>'">`;
        } else {
            preview.innerHTML = '<i class="fas fa-image" style="color: var(--text-tertiary);"></i>';
        }
    },

    /**
     * Handle icon file upload
     */
    async handleIconUpload(type, input) {
        const file = input.files[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            Utils.showToast('Error', 'Only image files are allowed (JPEG, PNG, GIF, SVG, WebP)', 'error');
            input.value = '';
            return;
        }

        // Validate file size (2MB)
        if (file.size > 2 * 1024 * 1024) {
            Utils.showToast('Error', 'File size must be less than 2MB', 'error');
            input.value = '';
            return;
        }

        // Show preview immediately (local preview)
        const preview = document.getElementById(`${type}-icon-preview`);
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 100%; border-radius: 6px;">`;
        };
        reader.readAsDataURL(file);

        // Upload to server
        try {
            const formData = new FormData();
            formData.append('icon', file);

            const response = await fetch('/api/v2/admin/portal/upload-icon', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Update the URL input with the uploaded file URL
                const urlInput = document.getElementById(`${type}-icon-url`);
                urlInput.value = result.url;
                Utils.showToast('Success', 'Icon uploaded successfully', 'success');
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Icon upload error:', error);
            Utils.showToast('Error', error.message || 'Failed to upload icon', 'error');
            // Revert preview
            preview.innerHTML = '<i class="fas fa-image" style="color: var(--text-tertiary);"></i>';
        }

        // Clear file input
        input.value = '';
    }
};
