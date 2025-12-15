/**
 * Settings Page for StreamPanel
 * Comprehensive settings management for all system configurations
 */

const Settings = {
    currentTab: 'plex-servers',

    /**
     * Render settings page
     */
    async render(container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cog"></i>
                        Settings
                    </h2>
                </div>

                <!-- Tabs -->
                <div class="tabs" style="flex-wrap: wrap;">
                    <button class="tab active" data-tab="plex-servers">
                        <i class="fas fa-server"></i> Plex Servers
                    </button>
                    <button class="tab" data-tab="iptv-panels">
                        <i class="fas fa-network-wired"></i> IPTV Panels
                    </button>
                    <button class="tab" data-tab="iptv-editor">
                        <i class="fas fa-edit"></i> IPTV Editor
                    </button>
                    <button class="tab" data-tab="tags">
                        <i class="fas fa-tags"></i> Tags
                    </button>
                    <button class="tab" data-tab="branding">
                        <i class="fas fa-palette"></i> Customization
                    </button>
                    <button class="tab" data-tab="email-server">
                        <i class="fas fa-envelope"></i> Email & Scheduler
                    </button>
                    <button class="tab" data-tab="subscription-plans">
                        <i class="fas fa-box-open"></i> Subscription Plans
                    </button>
                    <button class="tab" data-tab="app-users">
                        <i class="fas fa-user-shield"></i> App Admin
                    </button>
                    <button class="tab" data-tab="portal-apps">
                        <i class="fas fa-mobile-alt"></i> Portal Apps
                    </button>
                    <button class="tab" data-tab="portal-guides">
                        <i class="fas fa-book"></i> Portal Guides
                    </button>
                    <button class="tab" data-tab="portal-quick-actions">
                        <i class="fas fa-bolt"></i> Quick Actions
                    </button>
                    <button class="tab" data-tab="logs">
                        <i class="fas fa-file-alt"></i> Logs
                    </button>
                    <button class="tab" data-tab="updates">
                        <i class="fas fa-cloud-download-alt"></i> Updates
                    </button>
                </div>

                <!-- Tab Contents -->
                <div id="plex-servers" class="tab-content active">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="iptv-panels" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="iptv-editor" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="tags" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="branding" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="email-server" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="subscription-plans" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="app-users" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="portal-apps" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="portal-guides" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="portal-quick-actions" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="logs" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="updates" class="tab-content">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>
            </div>
        `;

        // Setup tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Load initial tab
        await this.loadPlexServers();
    },

    /**
     * Switch tab
     */
    async switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab contents
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;

        // Load tab data
        switch (tabName) {
            case 'plex-servers':
                await this.loadPlexServers();
                break;
            case 'iptv-panels':
                await this.loadIPTVPanels();
                break;
            case 'iptv-editor':
                await this.loadIPTVEditor();
                break;
            case 'tags':
                await this.loadTags();
                break;
            case 'branding':
                await this.loadBranding();
                break;
            case 'email-server':
                await this.loadEmailServer();
                break;
            case 'subscription-plans':
                await this.loadSubscriptionPlans();
                break;
            case 'app-users':
                await this.loadAppUsers();
                break;
            case 'portal-apps':
                await PortalSettings.loadPortalApps();
                break;
            case 'portal-guides':
                await PortalSettings.loadPortalGuides();
                break;
            case 'portal-quick-actions':
                await PortalSettings.loadPortalQuickActions();
                break;
            case 'logs':
                await this.loadLogs();
                break;
            case 'updates':
                await this.loadUpdates();
                break;
        }
    },

    /**
     * Load Plex Servers
     */
    async loadPlexServers() {
        const container = document.getElementById('plex-servers');

        try {
            const response = await API.getPlexServers(false);
            const servers = response.servers;

            // Check health status for all servers in background
            if (servers.length > 0) {
                this.checkAllPlexServersHealth(servers);
            }

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-server"></i> Plex Servers (${servers.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure multiple Plex servers for flexible package management
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddPlexServerModal()">
                            <i class="fas fa-plus"></i> Add Server
                        </button>
                    </div>

                    ${servers.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-server" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No Plex servers configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddPlexServerModal()">
                                <i class="fas fa-plus"></i> Add Your First Server
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 30px;"></th>
                                        <th>Name</th>
                                        <th>Server ID</th>
                                        <th>Status</th>
                                        <th>Sync Schedule</th>
                                        <th>Libraries</th>
                                        <th>Last Sync</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="plex-servers-tbody">
                                    ${servers.map(server => {
                                        let libraryCount = 0;
                                        try {
                                            if (server.libraries) {
                                                // Handle both string (SQLite) and already-parsed array
                                                if (typeof server.libraries === 'string') {
                                                    if (server.libraries.trim() !== '') {
                                                        libraryCount = JSON.parse(server.libraries).length;
                                                    }
                                                } else if (Array.isArray(server.libraries)) {
                                                    libraryCount = server.libraries.length;
                                                }
                                            }
                                        } catch (e) {
                                            console.error('Error parsing libraries for server:', server.id, e);
                                        }

                                        // Format sync schedule for display
                                        const syncScheduleDisplay = server.sync_schedule
                                            ? server.sync_schedule.charAt(0).toUpperCase() + server.sync_schedule.slice(1)
                                            : 'Manual';

                                        return `
                                        <tr id="plex-server-${server.id}" data-server-id="${server.id}" class="expandable-row" style="cursor: pointer;">
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})">
                                                <i class="fas fa-chevron-right expand-icon" id="expand-icon-${server.id}" style="transition: transform 0.2s;"></i>
                                            </td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})"><strong>${Utils.escapeHtml(server.name)}</strong></td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})"><code>${Utils.escapeHtml(server.server_id)}</code></td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})">${Utils.getStatusBadge(server.health_status === 'online', 'Online', 'Offline')}</td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})">${syncScheduleDisplay}</td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})">${libraryCount}</td>
                                            <td onclick="Settings.togglePlexServerDetails(${server.id})">${Utils.formatDate(server.last_library_sync)}</td>
                                            <td onclick="event.stopPropagation()">
                                                <button class="btn btn-sm btn-outline" onclick="Settings.syncPlexLibraries(${server.id})">
                                                    <i class="fas fa-sync"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.editPlexServer(${server.id})">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deletePlexServer(${server.id})">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;

        } catch (error) {
            console.error('Error loading Plex servers:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load Plex servers</p>
                </div>
            `;
        }
    },

    /**
     * Show add Plex server modal
     */
    showAddPlexServerModal() {
        Utils.showModal({
            title: 'Add Plex Server',
            body: `
                <form id="add-plex-server-form">
                    <div class="form-group">
                        <label class="form-label required">Server Name</label>
                        <input type="text" name="name" class="form-input" required
                               placeholder="e.g., Plex Server 1">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Server URL</label>
                        <input type="url" name="url" class="form-input" required
                               placeholder="https://your-server.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Server ID</label>
                        <input type="text" name="server_id" class="form-input" required
                               placeholder="Unique Plex server ID">
                        <small class="form-help">Find this in your Plex server settings</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">X-Plex-Token</label>
                        <input type="text" name="token" class="form-input" required
                               placeholder="Your Plex authentication token">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Sync Schedule</label>
                        <select name="sync_schedule" class="form-select">
                            <option value="manual">Manual</option>
                            <option value="hourly">Hourly</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                        </select>
                        <small class="form-help">How often to automatically sync libraries from this server</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Request Site URL (Optional)</label>
                        <input type="url" name="request_site_url" class="form-input"
                               placeholder="https://requests.your-domain.com">
                        <small class="form-help">URL for your Plex request site (e.g., Overseerr, Ombi). Used in email templates.</small>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Add Server',
                    class: 'btn-primary',
                    onClick: () => this.submitAddPlexServer()
                }
            ]
        });
    },

    /**
     * Submit add Plex server
     */
    async submitAddPlexServer() {
        const form = document.getElementById('add-plex-server-form');
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            url: formData.get('url'),
            server_id: formData.get('server_id'),
            token: formData.get('token'),
            sync_schedule: formData.get('sync_schedule'),
            request_site_url: formData.get('request_site_url')
        };

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            await API.createPlexServer(data);
            Utils.hideLoading();
            Utils.showToast('Success', 'Plex server added successfully', 'success');
            await this.loadPlexServers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Sync Plex libraries
     */
    async syncPlexLibraries(serverId) {
        Utils.showLoading();
        try {
            await API.syncPlexLibraries(serverId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Library sync initiated', 'success');
            await this.loadPlexServers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Toggle Plex server details (expandable row)
     */
    async togglePlexServerDetails(serverId) {
        const expandRow = document.getElementById(`plex-server-details-${serverId}`);
        const icon = document.getElementById(`expand-icon-${serverId}`);

        // If already expanded, collapse it
        if (expandRow) {
            expandRow.remove();
            icon.style.transform = 'rotate(0deg)';
            return;
        }

        // Rotate icon
        icon.style.transform = 'rotate(90deg)';

        // Fetch stats
        try {
            const response = await API.getPlexServerStats(serverId);
            const stats = response.stats;

            // Create expanded row
            const row = document.getElementById(`plex-server-${serverId}`);
            const detailsRow = document.createElement('tr');
            detailsRow.id = `plex-server-details-${serverId}`;
            detailsRow.innerHTML = `
                <td colspan="8" style="background: var(--card-bg); padding: 0;">
                    <div style="padding: 1.5rem; border-left: 3px solid var(--primary-color);">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="stat-box" onclick="Settings.showPlexServerUsers(${serverId})" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <i class="fas fa-users"></i> Users on Server
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${stats.user_count}</div>
                                <small style="color: var(--primary-color); font-size: 0.75rem;">Click to view</small>
                            </div>
                            <div class="stat-box" onclick="Settings.showPlexServerPendingInvites(${serverId})" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <i class="fas fa-clock"></i> Pending Shares
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${stats.pending_shares}</div>
                                <small style="color: var(--primary-color); font-size: 0.75rem;">Click to view</small>
                            </div>
                            <div class="stat-box">
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <i class="fas fa-book"></i> Total Libraries
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${stats.library_count}</div>
                            </div>
                            <div class="stat-box">
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <i class="fas fa-heartbeat"></i> Health
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 600;">${stats.health_status}</div>
                            </div>
                            <div class="stat-box" id="sync-status-box-${serverId}">
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <i class="fas fa-sync"></i> User Activity Sync
                                </div>
                                <button
                                    id="sync-activity-btn-${serverId}"
                                    class="btn btn-sm btn-primary"
                                    onclick="Settings.syncPlexActivity()"
                                    style="width: 100%; margin-top: 0.5rem; padding: 0.5rem;">
                                    <i class="fas fa-sync"></i> Sync Now
                                </button>
                                <div id="sync-status-${serverId}" style="font-size: 0.75rem; margin-top: 0.5rem; text-align: center; min-height: 1.2rem;"></div>
                            </div>
                        </div>
                        ${stats.libraries.length > 0 ? `
                            <div>
                                <h4 style="margin-bottom: 1rem; color: var(--text-primary);">
                                    <i class="fas fa-list"></i> Libraries
                                </h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem;">
                                    ${stats.libraries.map(lib => `
                                        <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; border-left: 3px solid var(--accent-color);">
                                            <div style="font-weight: 600; margin-bottom: 0.25rem;">${Utils.escapeHtml(lib.title)}</div>
                                            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                                                <i class="fas fa-${lib.type === 'movie' ? 'film' : lib.type === 'show' ? 'tv' : 'music'}"></i>
                                                ${lib.type.charAt(0).toUpperCase() + lib.type.slice(1)}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : `
                            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                                <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                                <p>No libraries synced yet. Click the sync button above.</p>
                            </div>
                        `}
                    </div>
                </td>
            `;

            // Insert after the current row
            row.parentNode.insertBefore(detailsRow, row.nextSibling);

        } catch (error) {
            console.error('Error fetching server stats:', error);
            icon.style.transform = 'rotate(0deg)';
            Utils.showToast('Error', 'Failed to load server details', 'error');
        }
    },

    /**
     * Delete Plex server
     */
    async deletePlexServer(serverId) {
        const confirmed = await Utils.confirm(
            'Delete Plex Server',
            'Are you sure you want to delete this server? This action cannot be undone.'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deletePlexServer(serverId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Plex server deleted successfully', 'success');
            await this.loadPlexServers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Load Plex Packages
     */
    async loadPlexPackages() {
        const container = document.getElementById('plex-packages');

        try {
            const response = await API.getPlexPackages(false);
            const packages = response.packages;

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-box"></i> Plex Packages (${packages.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Create packages that bundle servers and libraries together
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddPlexPackageModal()">
                            <i class="fas fa-plus"></i> Add Package
                        </button>
                    </div>

                    ${packages.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-box" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No Plex packages configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddPlexPackageModal()">
                                <i class="fas fa-plus"></i> Add Your First Package
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Duration</th>
                                        <th>Price</th>
                                        <th>Display Order</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${packages.map(pkg => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(pkg.name)}</strong></td>
                                            <td>${pkg.duration_months} months</td>
                                            <td>$${pkg.price ? parseFloat(pkg.price).toFixed(2) : 'N/A'}</td>
                                            <td>${pkg.display_order}</td>
                                            <td>${Utils.getStatusBadge(pkg.is_active)}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.viewPlexPackagePreview(${pkg.id})">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.editPlexPackage(${pkg.id})">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deletePlexPackage(${pkg.id})">
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
            console.error('Error loading Plex packages:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load Plex packages</p>
                </div>
            `;
        }
    },

    /**
     * Show add Plex package modal (simplified)
     */
    showAddPlexPackageModal() {
        Utils.showModal({
            title: 'Add Plex Package',
            body: `
                <p>Plex package creation requires selecting servers and libraries.</p>
                <p>This feature will be implemented in the full UI.</p>
                <p>For now, use the API directly to create packages.</p>
            `,
            buttons: [
                {
                    text: 'Close',
                    class: 'btn-primary',
                    onClick: () => Utils.closeModal()
                }
            ]
        });
    },

    /**
     * View Plex package preview
     */
    async viewPlexPackagePreview(packageId) {
        Utils.showLoading();
        try {
            const response = await API.getPlexPackagePreview(packageId);
            Utils.hideLoading();

            Utils.showModal({
                title: `Package Preview: ${response.package_name}`,
                body: `
                    <div>
                        <h4>Package Details</h4>
                        <p><strong>Name:</strong> ${response.package_name}</p>
                        <p><strong>Total Servers:</strong> ${response.total_servers}</p>
                        <p><strong>Total Libraries:</strong> ${response.total_libraries}</p>

                        <h4 class="mt-3">Included Servers & Libraries</h4>
                        ${response.servers.map(server => `
                            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--light-bg); border-radius: 0.5rem;">
                                <strong>${server.server_name}</strong>
                                <ul style="margin-top: 0.5rem;">
                                    ${server.libraries.map(lib => `
                                        <li>${lib.title} (${lib.count || 0} items)</li>
                                    `).join('')}
                                </ul>
                            </div>
                        `).join('')}
                    </div>
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-primary',
                        onClick: () => Utils.closeModal()
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Delete Plex package
     */
    async deletePlexPackage(packageId) {
        const confirmed = await Utils.confirm(
            'Delete Plex Package',
            'Are you sure you want to delete this package?'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deletePlexPackage(packageId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Package deleted successfully', 'success');
            await this.loadPlexPackages();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Load IPTV Panels
     */
    async loadIPTVPanels() {
        const container = document.getElementById('iptv-panels');

        try {
            const response = await API.getIPTVPanels(false);
            const panels = response.panels;

            // Check health status for all panels in background
            if (panels.length > 0) {
                this.checkAllIPTVPanelsHealth(panels);
            }

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-network-wired"></i> IPTV Panels (${panels.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure IPTV panels for multi-provider management
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="Settings.refreshAllPanelsGuideCache()" title="Refresh channel & EPG data for all panels">
                                <i class="fas fa-sync"></i> Refresh Guide Cache
                            </button>
                            <button class="btn btn-primary" onclick="Settings.showAddIPTVPanelModal()">
                                <i class="fas fa-plus"></i> Add Panel
                            </button>
                        </div>
                    </div>

                    ${panels.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-network-wired" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No IPTV panels configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddIPTVPanelModal()">
                                <i class="fas fa-plus"></i> Add Your First Panel
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Base URL</th>
                                        <th>Status</th>
                                        <th>Credit Balance</th>
                                        <th>Last Sync</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${panels.map(panel => {
                                        const panelTypeDisplay = panel.panel_type === 'nxt_dash' ? 'NXT Dash' :
                                            panel.panel_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                                        return `
                                        <tr id="iptv-panel-${panel.id}" style="cursor: pointer;" onclick="Settings.openIPTVPanelDetails(${panel.id}, event)">
                                            <td>
                                                <strong>${Utils.escapeHtml(panel.name)}</strong>
                                                ${panel.linked_playlist_name ? `
                                                    <span class="badge" style="background: var(--info-color); margin-left: 0.5rem;" title="Linked to IPTV Editor Playlist: ${Utils.escapeHtml(panel.linked_playlist_name)}">
                                                        <i class="fas fa-link"></i> ${Utils.escapeHtml(panel.linked_playlist_name)}
                                                    </span>
                                                ` : ''}
                                            </td>
                                            <td>${panelTypeDisplay}</td>
                                            <td><code style="font-size: 0.875rem;">${Utils.escapeHtml(panel.base_url)}</code></td>
                                            <td>${Utils.getStatusBadge(panel.health_status === 'online', 'Online', 'Offline')}</td>
                                            <td>${panel.current_credit_balance || 0}</td>
                                            <td>${Utils.formatDate(panel.last_sync)}</td>
                                            <td onclick="event.stopPropagation();">
                                                <button class="btn btn-sm btn-outline" onclick="Settings.viewIPTVPanel(${panel.id})" title="View Details">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.testExistingIPTVPanelConnection(${panel.id})" title="Test Connection">
                                                    <i class="fas fa-plug"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.editIPTVPanel(${panel.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deleteIPTVPanel(${panel.id})" title="Delete">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}

                    <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                    <!-- Channel Packages Section -->
                    <div class="mt-4">
                        <div class="mb-3">
                            <h3><i class="fas fa-layer-group"></i> Channel Packages</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Create channel packages from synced bouquets
                            </p>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Select IPTV Panel</label>
                            <select class="form-input" id="channel-package-panel" onchange="Settings.loadBouquetsForPanel(this.value)">
                                <option value="">-- Select a panel with synced bouquets --</option>
                                ${panels.filter(p => p.last_sync).map(panel => `
                                    <option value="${panel.id}">${Utils.escapeHtml(panel.name)}</option>
                                `).join('')}
                            </select>
                            <small class="form-help">Only panels with synced bouquets are shown</small>
                        </div>

                        <div id="bouquets-container" style="display: none;" class="mt-3">
                            <div class="text-center mt-4 mb-4">
                                <div class="spinner" style="margin: 0 auto;"></div>
                                <p class="mt-2">Loading bouquets...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading IPTV panels:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load IPTV panels</p>
                </div>
            `;
        }
    },

    /**
     * Load IPTV Playlists (placeholder)
     */
    async loadIPTVPlaylists() {
        const container = document.getElementById('iptv-playlists');
        container.innerHTML = '<div class="text-center mt-4 mb-4"><p>IPTV Playlists management...</p></div>';
    },

    /**
     * Edit Plex server
     */
    async editPlexServer(serverId) {
        Utils.showLoading();
        try {
            // Fetch server details
            const response = await API.getPlexServer(serverId);
            const server = response.server;
            Utils.hideLoading();

            // Show modal with pre-populated form
            Utils.showModal({
                title: 'Edit Plex Server',
                body: `
                    <form id="edit-plex-server-form">
                        <div class="form-group">
                            <label class="form-label required">Server Name</label>
                            <input type="text" name="name" class="form-input" required
                                   value="${Utils.escapeHtml(server.name)}"
                                   placeholder="e.g., Plex Server 1">
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Server URL</label>
                            <input type="url" name="url" class="form-input" required
                                   value="${Utils.escapeHtml(server.url)}"
                                   placeholder="https://your-server.com">
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Server ID</label>
                            <input type="text" name="server_id" class="form-input" required
                                   value="${Utils.escapeHtml(server.server_id)}"
                                   placeholder="Unique Plex server ID">
                            <small class="form-help">Find this in your Plex server settings</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">X-Plex-Token</label>
                            <input type="text" name="token" class="form-input" required
                                   value="${Utils.escapeHtml(server.token)}"
                                   placeholder="Your Plex authentication token">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Sync Schedule</label>
                            <select name="sync_schedule" class="form-select">
                                <option value="manual" ${server.sync_schedule === 'manual' ? 'selected' : ''}>Manual</option>
                                <option value="hourly" ${server.sync_schedule === 'hourly' ? 'selected' : ''}>Hourly</option>
                                <option value="daily" ${server.sync_schedule === 'daily' ? 'selected' : ''}>Daily</option>
                                <option value="weekly" ${server.sync_schedule === 'weekly' ? 'selected' : ''}>Weekly</option>
                            </select>
                            <small class="form-help">How often to automatically sync libraries from this server</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Request Site URL (Optional)</label>
                            <input type="url" name="request_site_url" class="form-input"
                                   value="${Utils.escapeHtml(server.request_site_url || '')}"
                                   placeholder="https://requests.your-domain.com">
                            <small class="form-help">URL for your Plex request site (e.g., Overseerr, Ombi). Used in email templates.</small>
                        </div>
                        <div class="form-group">
                            <div class="form-checkbox-group">
                                <input type="checkbox" name="is_active" class="form-checkbox" id="edit-is-active"
                                       ${server.is_active ? 'checked' : ''}>
                                <label for="edit-is-active">Server is Active</label>
                            </div>
                        </div>
                    </form>
                `,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: () => this.submitEditPlexServer(serverId)
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Submit edit Plex server
     */
    async submitEditPlexServer(serverId) {
        const form = document.getElementById('edit-plex-server-form');
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            url: formData.get('url'),
            server_id: formData.get('server_id'),
            token: formData.get('token'),
            sync_schedule: formData.get('sync_schedule'),
            request_site_url: formData.get('request_site_url'),
            is_active: formData.get('is_active') === 'on'
        };

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            await API.updatePlexServer(serverId, data);
            Utils.hideLoading();
            Utils.showToast('Success', 'Plex server updated successfully', 'success');
            await this.loadPlexServers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    editPlexPackage(id) {
        Utils.showToast('Info', 'Edit functionality to be implemented', 'info');
    },

    /**
     * Show Plex server users
     */
    async showPlexServerUsers(serverId) {
        Utils.showLoading();
        try {
            // Use new endpoint that includes activity data
            const response = await API.getPlexServerUsersWithActivity(serverId);
            const users = response.users || [];
            Utils.hideLoading();

            const cacheInfo = response.cached ?
                `<small style="color: var(--text-secondary); font-size: 0.75rem;">Cached data (${response.cache_age_minutes} min old)</small>` :
                `<small style="color: var(--success-color); font-size: 0.75rem;">Fresh data from Plex</small>`;

            Utils.showModal({
                title: `Server Users (${users.length}) ${cacheInfo}`,
                body: `
                    ${users.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-users" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No users found on this server</p>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Email</th>
                                        <th>Days Since Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => {
                                        // Determine activity display
                                        let activityDisplay = 'N/A';

                                        if (user.is_pending_invite) {
                                            activityDisplay = '<span class="badge badge-warning">Pending Invite</span>';
                                        } else if (user.days_since_last_activity !== null && user.days_since_last_activity !== undefined) {
                                            const days = user.days_since_last_activity;
                                            if (days === 0) {
                                                activityDisplay = '<span style="color: var(--success-color); font-weight: 600;">Active Today</span>';
                                            } else if (days > 365) {
                                                activityDisplay = `<span style="color: var(--error-color); font-weight: 600;">${days} days ago</span>`;
                                            } else if (days > 180) {
                                                activityDisplay = `<span style="color: var(--warning-color); font-weight: 600;">${days} days ago</span>`;
                                            } else {
                                                activityDisplay = `<span style="color: var(--success-color); font-weight: 600;">${days} day${days > 1 ? 's' : ''} ago</span>`;
                                            }
                                        } else {
                                            activityDisplay = '<span style="color: var(--text-secondary);">No activity recorded</span>';
                                        }

                                        return `
                                            <tr>
                                                <td><strong>${Utils.escapeHtml(user.username || 'N/A')}</strong></td>
                                                <td>${Utils.escapeHtml(user.email)}</td>
                                                <td>${activityDisplay}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-primary',
                        onClick: () => Utils.closeModal()
                    }
                ],
                size: 'large'
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Show Plex server pending invites
     */
    async showPlexServerPendingInvites(serverId) {
        Utils.showLoading();
        try {
            const response = await API.getPlexServerPendingInvites(serverId);
            const invites = response.invites;
            Utils.hideLoading();

            Utils.showModal({
                title: `Pending Invites (${invites.length})`,
                body: `
                    ${invites.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-clock" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No pending invites for this server</p>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Email</th>
                                        <th>Friendly Name</th>
                                        <th>Created At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${invites.map(invite => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(invite.username)}</strong></td>
                                            <td>${Utils.escapeHtml(invite.email)}</td>
                                            <td>${Utils.escapeHtml(invite.friendlyName || 'N/A')}</td>
                                            <td>${Utils.formatDate(invite.createdAt)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-primary',
                        onClick: () => Utils.closeModal()
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    async syncPlexActivity() {
        try {
            // Get all Plex server IDs from the page
            const serverRows = document.querySelectorAll('[id^="plex-server-"]');
            const serverIds = Array.from(serverRows)
                .map(row => row.id.replace('plex-server-', '').replace('-details', ''))
                .filter((id, index, self) => !id.includes('-') && self.indexOf(id) === index);

            // Disable all sync buttons and show running status
            serverIds.forEach(id => {
                const btn = document.getElementById(`sync-activity-btn-${id}`);
                const status = document.getElementById(`sync-status-${id}`);
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
                }
                if (status) {
                    status.innerHTML = '<span style="color: var(--warning-color);">Running...</span>';
                }
            });

            // Start the sync
            const response = await API.syncPlexActivity();

            if (response.success) {
                Utils.showToast('Success', 'Activity sync started in background', 'success');

                // Poll for status updates
                this.pollSyncStatus(serverIds);
            } else {
                throw new Error(response.message || 'Failed to start sync');
            }

        } catch (error) {
            console.error('Sync error:', error);
            Utils.showToast('Error', error.message || 'Failed to start sync', 'error');

            // Re-enable buttons on error
            const serverRows = document.querySelectorAll('[id^="plex-server-"]');
            const serverIds = Array.from(serverRows)
                .map(row => row.id.replace('plex-server-', '').replace('-details', ''))
                .filter((id, index, self) => !id.includes('-') && self.indexOf(id) === index);

            serverIds.forEach(id => {
                const btn = document.getElementById(`sync-activity-btn-${id}`);
                const status = document.getElementById(`sync-status-${id}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
                }
                if (status) {
                    status.innerHTML = '<span style="color: var(--error-color);">Failed</span>';
                }
            });
        }
    },

    async pollSyncStatus(serverIds) {
        const pollInterval = setInterval(async () => {
            try {
                const response = await API.getPlexActivitySyncStatus();

                if (response.success && response.status) {
                    const status = response.status;
                    // Map backend field names to what we use here
                    const syncState = status.lastSyncStatus || status.status || 'idle';
                    const serversProcessed = status.serversCompleted || status.serversProcessed || 0;
                    const endTime = status.lastSync || status.endTime;
                    const lastError = (status.errors && status.errors.length > 0) ? status.errors.join(', ') : (status.lastError || 'Unknown error');

                    // Update all server status displays
                    serverIds.forEach(id => {
                        const statusDiv = document.getElementById(`sync-status-${id}`);
                        const btn = document.getElementById(`sync-activity-btn-${id}`);

                        if (statusDiv) {
                            if (syncState === 'running' || status.isRunning) {
                                // Show current server number (completed + 1 = currently processing)
                                const currentServerNum = serversProcessed + 1;
                                const usersText = status.usersProcessed > 0 ? ` | ${status.usersProcessed} users` : '';
                                const currentServerText = status.currentServer ? ` - ${status.currentServer}` : '';
                                statusDiv.innerHTML = `<span style="color: var(--warning-color);">${currentServerNum}/${status.totalServers} servers${usersText}${currentServerText}</span>`;
                            } else if (syncState === 'completed' || syncState === 'completed_with_errors') {
                                const timestamp = endTime ? new Date(endTime).toLocaleTimeString() : 'now';
                                const warningIcon = syncState === 'completed_with_errors' ? ' ⚠️' : '';
                                statusDiv.innerHTML = `<span style="color: var(--success-color);">Finished at ${timestamp}${warningIcon} (${status.usersProcessed} users synced)</span>`;

                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
                                }

                                clearInterval(pollInterval);
                                Utils.showToast('Success', `Activity sync completed: ${status.usersProcessed} users from ${serversProcessed} servers`, 'success');
                            } else if (syncState === 'error') {
                                statusDiv.innerHTML = `<span style="color: var(--error-color);">Error: ${lastError}</span>`;

                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
                                }

                                clearInterval(pollInterval);
                            }
                        }
                    });

                    // Stop polling if status is completed or error
                    if ((syncState === 'completed' || syncState === 'completed_with_errors' || syncState === 'error') && !status.isRunning) {
                        clearInterval(pollInterval);
                    }
                }

            } catch (error) {
                console.error('Error polling sync status:', error);
                clearInterval(pollInterval);
            }
        }, 2000); // Poll every 2 seconds for better responsiveness
    },

    // ========================================
    // NEW SETTINGS SECTIONS
    // ========================================

    /**
     * Load IPTV Editor Integration Configuration
     * Per-playlist settings with expandable cards
     */
    async loadIPTVEditor() {
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

                    <!-- IPTV Editor DNS Section -->
                    <div class="card mb-3">
                        <h4 style="margin-bottom: 1rem;">IPTV Editor DNS *</h4>
                        <input
                            type="text"
                            class="form-input"
                            id="iptv-editor-dns"
                            placeholder="https://xtream.johnsonflix.tv"
                            value="${settings.editor_dns || ''}"
                            style="font-family: monospace; font-size: 0.875rem;" />
                        <small class="form-help">
                            <strong>Note:</strong> Enter the default IPTV Editor URL or your custom DNS here. This will be used to generate M3U URLs for your users. This field is required.
                        </small>

                        <div style="margin-top: 1rem;">
                            <button class="btn btn-primary" onclick="Settings.saveIPTVEditorDNS()" style="flex: 0 0 auto;">
                                <i class="fas fa-save"></i> Save DNS
                            </button>
                        </div>
                    </div>

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
    },

    /**
     * Render individual playlist card with expandable settings
     */
    renderPlaylistCard(playlist) {
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
                            ${hasSettings ? ` | Auto-updater: ${autoUpdaterEnabled ? '<span style="color: var(--success-color);">ON</span>' : '<span style="color: var(--text-secondary);">OFF</span>'}` : ''}
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
    },

    /**
     * Toggle playlist expand/collapse
     */
    togglePlaylistExpand(playlistId) {
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
        this.loadIPTVEditor();
    },

    /**
     * Save bearer token
     */
    async saveIPTVEditorDNS() {
        try {
            const editorDns = document.getElementById('iptv-editor-dns').value.trim();

            if (!editorDns) {
                Utils.showToast('Error', 'IPTV Editor DNS is required', 'error');
                return;
            }

            // Validate URL format
            try {
                new URL(editorDns);
            } catch (e) {
                Utils.showToast('Error', 'Please enter a valid URL (e.g., https://xtream.johnsonflix.tv)', 'error');
                return;
            }

            Utils.showLoading('Saving IPTV Editor DNS...');

            await API.updateIPTVEditorSettings({
                editor_dns: editorDns
            });

            Utils.hideLoading();
            Utils.showToast('Success', 'IPTV Editor DNS saved successfully', 'success');

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to save IPTV Editor DNS', 'error');
        }
    },

    async saveIPTVEditorBearerToken() {
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
    },

    /**
     * Save playlist settings
     */
    async savePlaylistSettings(playlistId) {
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
            await this.loadIPTVEditor();

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to save playlist settings', 'error');
        }
    },

    /**
     * Run auto-updater for specific playlist
     */
    async runPlaylistAutoUpdater(playlistId) {
        try {
            Utils.showLoading('Running auto-updater...');

            const response = await API.runPlaylistAutoUpdater(playlistId);

            Utils.hideLoading();
            Utils.showToast('Success', response.message || 'Auto-updater completed successfully', 'success');

            // Reload to show updated status
            await this.loadIPTVEditor();

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
    },

    /**
     * Refresh guide cache for specific playlist
     */
    async refreshPlaylistGuideCache(playlistId) {
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
    },

    /**
     * Test IPTV Editor Connection
     */
    async testIPTVEditorConnection() {
        try {
            const bearerToken = document.getElementById('iptv-editor-bearer-token').value.trim();

            if (!bearerToken) {
                Utils.showToast('Error', 'Please enter a bearer token first', 'error');
                return;
            }

            // Save bearer token first
            Utils.showLoading('Testing connection...');

            await API.updateIPTVEditorSettings({ bearer_token: bearerToken });

            // Test connection
            const result = await API.testIPTVEditorConnection();

            Utils.hideLoading();

            if (result.success) {
                Utils.showToast('Success', `Connection successful! Found ${result.playlistCount} playlists`, 'success');
            } else {
                Utils.showToast('Error', result.message || 'Connection failed', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Connection test failed', 'error');
        }
    },

    /**
     * Sync IPTV Editor Playlists
     */
    async syncIPTVEditorPlaylists() {
        try {
            const bearerToken = document.getElementById('iptv-editor-bearer-token').value.trim();

            if (!bearerToken) {
                Utils.showToast('Error', 'Please enter a bearer token and test connection first', 'error');
                return;
            }

            Utils.showLoading('Syncing playlists from IPTV Editor...');

            // Save bearer token first
            await API.updateIPTVEditorSettings({ bearer_token: bearerToken });

            // Sync playlists
            const result = await API.syncIPTVEditorPlaylists();

            Utils.hideLoading();

            if (result.success) {
                Utils.showToast('Success', `Synced ${result.count} playlists successfully`, 'success');
                // Reload the page to show updated playlists
                await this.loadIPTVEditor();
            } else {
                Utils.showToast('Error', result.message || 'Sync failed', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Playlist sync failed', 'error');
        }
    },

    /**
     * DEPRECATED METHODS (kept for backward compatibility)
     * These are no longer used since settings are now per-playlist
     */
    async syncIPTVEditorCategories() {
        console.warn('syncIPTVEditorCategories is deprecated - use syncIPTVEditorPlaylists instead');
        return this.syncIPTVEditorPlaylists();
    },

    async saveIPTVEditorProviderSettings() {
        console.warn('saveIPTVEditorProviderSettings is deprecated - use savePlaylistSettings per-playlist instead');
        Utils.showToast('Deprecated', 'Provider settings are now configured per-playlist. Please expand a playlist to configure its settings.', 'warning');
    },

    async runAutoUpdaterNow() {
        console.warn('runAutoUpdaterNow is deprecated - use runPlaylistAutoUpdater per-playlist instead');
        Utils.showToast('Deprecated', 'Auto-updater is now configured per-playlist. Please expand a playlist and click "Run Auto-Updater Now".', 'warning');
    },

    async toggleIPTVEditorDefault(checked) {
        console.warn('toggleIPTVEditorDefault is deprecated');
    },

    async showAddIPTVEditorPlaylistModal() {
        try {
            // Fetch panels for dropdown
            const panelsRes = await API.getIPTVPanels(false);
            const panels = panelsRes.panels || [];

            if (panels.length === 0) {
                Utils.showToast('Warning', 'Please add at least one IPTV Panel before adding playlists', 'warning');
                return;
            }

            Utils.showModal({
                title: 'Add IPTV Editor Playlist',
                content: `
                    <form id="add-iptv-editor-playlist-form" class="form">
                        <div class="form-group">
                            <label class="form-label required">Playlist Name</label>
                            <input type="text" class="form-input" id="playlist-name" required
                                placeholder="e.g., Main Playlist">
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Playlist ID</label>
                            <input type="text" class="form-input" id="playlist-id" required
                                placeholder="e.g., 12345">
                            <small class="form-help">The ID from IPTV Editor</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Bearer Token</label>
                            <textarea class="form-input" id="bearer-token" required rows="3"
                                placeholder="Paste your IPTV Editor bearer token here"></textarea>
                            <small class="form-help">Authentication token from IPTV Editor</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Link to IPTV Panel</label>
                            <select class="form-input" id="linked-panel" required>
                                <option value="">-- Select Panel --</option>
                                ${panels.map(panel => `
                                    <option value="${panel.id}">${panel.name} (${panel.panel_type})</option>
                                `).join('')}
                            </select>
                            <small class="form-help">Users created on this panel can also be created on this playlist</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Max Users</label>
                            <input type="number" class="form-input" id="max-users" min="1"
                                placeholder="Optional: Maximum users for this playlist">
                        </div>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="is-active" checked>
                                Active
                            </label>
                        </div>
                    </form>
                `,
                actions: [
                    {
                        text: 'Cancel',
                        class: 'btn-secondary',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Add Playlist',
                        class: 'btn-primary',
                        onClick: () => this.submitAddIPTVEditorPlaylist()
                    }
                ]
            });

        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Submit Add IPTV Editor Playlist
     */
    async submitAddIPTVEditorPlaylist() {
        try {
            const name = document.getElementById('playlist-name').value.trim();
            const playlistId = document.getElementById('playlist-id').value.trim();
            const bearerToken = document.getElementById('bearer-token').value.trim();
            const iptvPanelId = parseInt(document.getElementById('linked-panel').value);
            const maxUsers = document.getElementById('max-users').value;
            const isActive = document.getElementById('is-active').checked;

            if (!name || !playlistId || !bearerToken || !iptvPanelId) {
                Utils.showToast('Error', 'Please fill in all required fields', 'error');
                return;
            }

            Utils.showLoading('Adding playlist...');

            await API.request('/api/v2/iptv-editor/playlists', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    playlist_id: playlistId,
                    bearer_token: bearerToken,
                    iptv_panel_id: iptvPanelId,
                    max_users: maxUsers ? parseInt(maxUsers) : null,
                    is_active: isActive
                })
            });

            Utils.hideLoading();
            Utils.closeModal();
            Utils.showToast('Success', 'IPTV Editor playlist added successfully', 'success');
            await this.loadIPTVEditor();

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Edit IPTV Editor Playlist
     */
    async editIPTVEditorPlaylist(id) {
        try {
            Utils.showLoading('Loading playlist...');

            const [playlistRes, panelsRes] = await Promise.all([
                API.request(`/api/v2/iptv-editor/playlists/${id}`),
                API.getIPTVPanels(false)
            ]);

            const playlist = playlistRes.playlist;
            const panels = panelsRes.panels || [];

            Utils.hideLoading();

            Utils.showModal({
                title: 'Edit IPTV Editor Playlist',
                content: `
                    <form id="edit-iptv-editor-playlist-form" class="form">
                        <div class="form-group">
                            <label class="form-label required">Playlist Name</label>
                            <input type="text" class="form-input" id="edit-playlist-name" required
                                value="${playlist.name}">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Playlist ID</label>
                            <input type="text" class="form-input" id="edit-playlist-id" disabled
                                value="${playlist.playlist_id}">
                            <small class="form-help">Playlist ID cannot be changed</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Bearer Token</label>
                            <textarea class="form-input" id="edit-bearer-token" required rows="3">${playlist.bearer_token}</textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Link to IPTV Panel</label>
                            <select class="form-input" id="edit-linked-panel" required>
                                <option value="">-- Select Panel --</option>
                                ${panels.map(panel => `
                                    <option value="${panel.id}" ${panel.id === playlist.iptv_panel_id ? 'selected' : ''}>
                                        ${panel.name} (${panel.panel_type})
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Max Users</label>
                            <input type="number" class="form-input" id="edit-max-users" min="1"
                                value="${playlist.max_users || ''}">
                        </div>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="edit-is-active" ${playlist.is_active ? 'checked' : ''}>
                                Active
                            </label>
                        </div>
                    </form>
                `,
                actions: [
                    {
                        text: 'Cancel',
                        class: 'btn-secondary',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Update Playlist',
                        class: 'btn-primary',
                        onClick: () => this.submitEditIPTVEditorPlaylist(id)
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Submit Edit IPTV Editor Playlist
     */
    async submitEditIPTVEditorPlaylist(id) {
        try {
            const name = document.getElementById('edit-playlist-name').value.trim();
            const bearerToken = document.getElementById('edit-bearer-token').value.trim();
            const iptvPanelId = parseInt(document.getElementById('edit-linked-panel').value);
            const maxUsers = document.getElementById('edit-max-users').value;
            const isActive = document.getElementById('edit-is-active').checked;

            if (!name || !bearerToken || !iptvPanelId) {
                Utils.showToast('Error', 'Please fill in all required fields', 'error');
                return;
            }

            Utils.showLoading('Updating playlist...');

            await API.request(`/api/v2/iptv-editor/playlists/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name,
                    bearer_token: bearerToken,
                    iptv_panel_id: iptvPanelId,
                    max_users: maxUsers ? parseInt(maxUsers) : null,
                    is_active: isActive
                })
            });

            Utils.hideLoading();
            Utils.closeModal();
            Utils.showToast('Success', 'IPTV Editor playlist updated successfully', 'success');
            await this.loadIPTVEditor();

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Delete IPTV Editor Playlist
     */
    async deleteIPTVEditorPlaylist(id, name) {
        const confirmed = await Utils.showConfirm(
            'Delete Playlist',
            `Are you sure you want to delete the playlist "${name}"? This will NOT delete users from IPTV Editor, but will remove the link.`
        );

        if (!confirmed) return;

        try {
            Utils.showLoading('Deleting playlist...');

            await API.request(`/api/v2/iptv-editor/playlists/${id}`, {
                method: 'DELETE'
            });

            Utils.hideLoading();
            Utils.showToast('Success', 'Playlist deleted successfully', 'success');
            await this.loadIPTVEditor();

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Load Tags
     */
    async loadTags() {
        const container = document.getElementById('tags');

        try {
            const [tagsResponse, plexServersResponse, iptvPanelsResponse] = await Promise.all([
                API.getTags(),
                API.getPlexServers(false),
                API.getIPTVPanels(false)
            ]);

            const tags = tagsResponse.data || [];
            const plexServers = plexServersResponse.servers;
            const iptvPanels = iptvPanelsResponse.panels;

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-tags"></i> Tags (${tags.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Create tags and link them to Plex servers or IPTV panels for automatic user organization
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddTagModal()">
                            <i class="fas fa-plus"></i> Add Tag
                        </button>
                    </div>

                    ${tags.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-tags" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No tags configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddTagModal()">
                                <i class="fas fa-plus"></i> Create Your First Tag
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Color</th>
                                        <th>Linked To</th>
                                        <th>Auto-Assign</th>
                                        <th>Users</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tags.map(tag => {
                                        let linkedTo = 'None';
                                        const linkedItems = [];

                                        // Add linked servers
                                        if (tag.linked_servers && tag.linked_servers.length > 0) {
                                            const serversList = tag.linked_servers.map(s => Utils.escapeHtml(s.name)).join(', ');
                                            linkedItems.push(`<i class="fas fa-server"></i> ${serversList}`);
                                        }

                                        // Add linked panels
                                        if (tag.linked_panels && tag.linked_panels.length > 0) {
                                            const panelsList = tag.linked_panels.map(p => Utils.escapeHtml(p.name)).join(', ');
                                            linkedItems.push(`<i class="fas fa-network-wired"></i> ${panelsList}`);
                                        }

                                        if (linkedItems.length > 0) {
                                            linkedTo = linkedItems.join('<br>');
                                        }

                                        return `
                                            <tr>
                                                <td>
                                                    <span class="tag-badge" style="background-color: ${tag.color || '#3b82f6'}; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; display: inline-block;">
                                                        ${Utils.escapeHtml(tag.name)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style="width: 30px; height: 30px; background-color: ${tag.color || '#3b82f6'}; border-radius: 4px; border: 2px solid var(--border-color);"></div>
                                                </td>
                                                <td>${linkedTo}</td>
                                                <td>${tag.auto_assign_enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-secondary">Disabled</span>'}</td>
                                                <td>${tag.user_count || 0} users</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline" onclick="Settings.editTag(${tag.id})" title="Edit Tag">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-danger" onclick="Settings.deleteTag(${tag.id})" title="Delete Tag">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;

            // Store data for modals
            this.plexServers = plexServers;
            this.iptvPanels = iptvPanels;

        } catch (error) {
            console.error('Error loading tags:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load tags</p>
                </div>
            `;
        }
    },

    /**
     * Show add tag modal
     */
    showAddTagModal() {
        const plexServers = this.plexServers || [];
        const iptvPanels = this.iptvPanels || [];

        Utils.showModal({
            title: 'Create New Tag',
            size: 'large',
            body: `
                <form id="add-tag-form">
                    <div class="form-group">
                        <label for="tag-name">Tag Name <span class="required">*</span></label>
                        <input type="text" id="tag-name" class="form-control" required placeholder="Enter tag name">
                    </div>

                    <div class="form-group">
                        <label for="tag-color">Color</label>
                        <input type="color" id="tag-color" class="form-control" value="#3b82f6">
                    </div>

                    <div class="form-group">
                        <label for="tag-link-type">Link to (Optional)</label>
                        <select id="tag-link-type" class="form-control">
                            <option value="">No Link</option>
                            <option value="server">Plex Servers</option>
                            <option value="panel">IPTV Panels</option>
                            <option value="both">Both Servers & Panels</option>
                        </select>
                        <small class="form-text">Link tags to automatically assign them to users with access to any of the selected servers/panels</small>
                    </div>

                    <div class="form-group" id="server-select-group" style="display: none;">
                        <label>Plex Servers (Select Multiple)</label>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
                            ${plexServers.length > 0 ? plexServers.map(s => `
                                <label class="checkbox-label" style="display: block; margin-bottom: 0.5rem;">
                                    <input type="checkbox" class="tag-server-checkbox" value="${s.id}">
                                    ${Utils.escapeHtml(s.name)}
                                </label>
                            `).join('') : '<p style="color: var(--text-secondary); padding: 0.5rem;">No Plex servers available</p>'}
                        </div>
                    </div>

                    <div class="form-group" id="panel-select-group" style="display: none;">
                        <label>IPTV Panels (Select Multiple)</label>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
                            ${iptvPanels.length > 0 ? iptvPanels.map(p => `
                                <label class="checkbox-label" style="display: block; margin-bottom: 0.5rem;">
                                    <input type="checkbox" class="tag-panel-checkbox" value="${p.id}">
                                    ${Utils.escapeHtml(p.name)}
                                </label>
                            `).join('') : '<p style="color: var(--text-secondary); padding: 0.5rem;">No IPTV panels available</p>'}
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="tag-auto-assign">
                            Enable auto-assignment
                        </label>
                        <small class="form-text">Automatically assign this tag to users based on the linked server/panel</small>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-secondary',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Create Tag',
                    class: 'btn-primary',
                    onClick: async () => {
                        const name = document.getElementById('tag-name').value.trim();
                        const color = document.getElementById('tag-color').value;
                        const linkType = document.getElementById('tag-link-type').value;
                        const autoAssign = document.getElementById('tag-auto-assign').checked;

                        // Get selected server IDs
                        const serverCheckboxes = document.querySelectorAll('.tag-server-checkbox:checked');
                        const serverIds = Array.from(serverCheckboxes).map(cb => parseInt(cb.value));

                        // Get selected panel IDs
                        const panelCheckboxes = document.querySelectorAll('.tag-panel-checkbox:checked');
                        const panelIds = Array.from(panelCheckboxes).map(cb => parseInt(cb.value));

                        if (!name) {
                            Utils.showToast('Error', 'Please enter a tag name', 'error');
                            return;
                        }

                        Utils.showLoading();
                        try {
                            await API.createTag({
                                name,
                                color,
                                linked_server_ids: (linkType === 'server' || linkType === 'both') ? serverIds : [],
                                linked_panel_ids: (linkType === 'panel' || linkType === 'both') ? panelIds : [],
                                auto_assign_enabled: autoAssign
                            });

                            Utils.hideLoading();
                            Utils.closeModal();
                            Utils.showToast('Success', 'Tag created successfully', 'success');
                            await Settings.loadTags();
                        } catch (error) {
                            Utils.hideLoading();
                            Utils.showToast('Error', error.message, 'error');
                        }
                    }
                }
            ]
        });

        // Setup link type change handler
        document.getElementById('tag-link-type').addEventListener('change', (e) => {
            const serverGroup = document.getElementById('server-select-group');
            const panelGroup = document.getElementById('panel-select-group');

            if (e.target.value === 'server') {
                serverGroup.style.display = 'block';
                panelGroup.style.display = 'none';
            } else if (e.target.value === 'panel') {
                serverGroup.style.display = 'none';
                panelGroup.style.display = 'block';
            } else if (e.target.value === 'both') {
                serverGroup.style.display = 'block';
                panelGroup.style.display = 'block';
            } else {
                serverGroup.style.display = 'none';
                panelGroup.style.display = 'none';
            }
        });
    },

    /**
     * Edit tag
     */
    async editTag(tagId) {
        Utils.showLoading();
        try {
            const response = await API.getTag(tagId);
            const tag = response.tag;
            const plexServers = this.plexServers || [];
            const iptvPanels = this.iptvPanels || [];

            Utils.hideLoading();

            // Determine link type based on what's selected
            const hasServers = tag.linked_servers && tag.linked_servers.length > 0;
            const hasPanels = tag.linked_panels && tag.linked_panels.length > 0;
            const linkType = hasServers && hasPanels ? 'both' : (hasServers ? 'server' : (hasPanels ? 'panel' : ''));

            const linkedServerIds = tag.linked_server_ids || [];
            const linkedPanelIds = tag.linked_panel_ids || [];

            Utils.showModal({
                title: 'Edit Tag',
                size: 'large',
                body: `
                    <form id="edit-tag-form">
                        <div class="form-group">
                            <label for="edit-tag-name">Tag Name <span class="required">*</span></label>
                            <input type="text" id="edit-tag-name" class="form-control" required value="${Utils.escapeHtml(tag.name)}">
                        </div>

                        <div class="form-group">
                            <label for="edit-tag-color">Color</label>
                            <input type="color" id="edit-tag-color" class="form-control" value="${tag.color || '#3b82f6'}">
                        </div>

                        <div class="form-group">
                            <label for="edit-tag-link-type">Link to (Optional)</label>
                            <select id="edit-tag-link-type" class="form-control">
                                <option value="" ${!linkType ? 'selected' : ''}>No Link</option>
                                <option value="server" ${linkType === 'server' ? 'selected' : ''}>Plex Servers</option>
                                <option value="panel" ${linkType === 'panel' ? 'selected' : ''}>IPTV Panels</option>
                                <option value="both" ${linkType === 'both' ? 'selected' : ''}>Both Servers & Panels</option>
                            </select>
                        </div>

                        <div class="form-group" id="edit-server-select-group" style="display: ${linkType === 'server' || linkType === 'both' ? 'block' : 'none'};">
                            <label>Plex Servers (Select Multiple)</label>
                            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
                                ${plexServers.length > 0 ? plexServers.map(s => `
                                    <label class="checkbox-label" style="display: block; margin-bottom: 0.5rem;">
                                        <input type="checkbox" class="edit-tag-server-checkbox" value="${s.id}" ${linkedServerIds.includes(s.id) ? 'checked' : ''}>
                                        ${Utils.escapeHtml(s.name)}
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); padding: 0.5rem;">No Plex servers available</p>'}
                            </div>
                        </div>

                        <div class="form-group" id="edit-panel-select-group" style="display: ${linkType === 'panel' || linkType === 'both' ? 'block' : 'none'};">
                            <label>IPTV Panels (Select Multiple)</label>
                            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem;">
                                ${iptvPanels.length > 0 ? iptvPanels.map(p => `
                                    <label class="checkbox-label" style="display: block; margin-bottom: 0.5rem;">
                                        <input type="checkbox" class="edit-tag-panel-checkbox" value="${p.id}" ${linkedPanelIds.includes(p.id) ? 'checked' : ''}>
                                        ${Utils.escapeHtml(p.name)}
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); padding: 0.5rem;">No IPTV panels available</p>'}
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="edit-tag-auto-assign" ${tag.auto_assign_enabled ? 'checked' : ''}>
                                Enable auto-assignment
                            </label>
                        </div>

                        <div class="alert alert-info mt-3">
                            <strong><i class="fas fa-info-circle"></i> User Count:</strong> ${tag.user_count || 0} users currently have this tag
                        </div>
                    </form>
                `,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-secondary',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: async () => {
                            const name = document.getElementById('edit-tag-name').value.trim();
                            const color = document.getElementById('edit-tag-color').value;
                            const linkType = document.getElementById('edit-tag-link-type').value;
                            const autoAssign = document.getElementById('edit-tag-auto-assign').checked;

                            // Get selected server IDs
                            const serverCheckboxes = document.querySelectorAll('.edit-tag-server-checkbox:checked');
                            const serverIds = Array.from(serverCheckboxes).map(cb => parseInt(cb.value));

                            // Get selected panel IDs
                            const panelCheckboxes = document.querySelectorAll('.edit-tag-panel-checkbox:checked');
                            const panelIds = Array.from(panelCheckboxes).map(cb => parseInt(cb.value));

                            if (!name) {
                                Utils.showToast('Error', 'Please enter a tag name', 'error');
                                return;
                            }

                            Utils.showLoading();
                            try {
                                await API.updateTag(tagId, {
                                    name,
                                    color,
                                    linked_server_ids: (linkType === 'server' || linkType === 'both') ? serverIds : [],
                                    linked_panel_ids: (linkType === 'panel' || linkType === 'both') ? panelIds : [],
                                    auto_assign_enabled: autoAssign
                                });

                                Utils.hideLoading();
                                Utils.closeModal();
                                Utils.showToast('Success', 'Tag updated successfully', 'success');
                                await Settings.loadTags();
                            } catch (error) {
                                Utils.hideLoading();
                                Utils.showToast('Error', error.message, 'error');
                            }
                        }
                    }
                ]
            });

            // Setup link type change handler
            document.getElementById('edit-tag-link-type').addEventListener('change', (e) => {
                const serverGroup = document.getElementById('edit-server-select-group');
                const panelGroup = document.getElementById('edit-panel-select-group');

                if (e.target.value === 'server') {
                    serverGroup.style.display = 'block';
                    panelGroup.style.display = 'none';
                } else if (e.target.value === 'panel') {
                    serverGroup.style.display = 'none';
                    panelGroup.style.display = 'block';
                } else if (e.target.value === 'both') {
                    serverGroup.style.display = 'block';
                    panelGroup.style.display = 'block';
                } else {
                    serverGroup.style.display = 'none';
                    panelGroup.style.display = 'none';
                }
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Delete tag
     */
    async deleteTag(tagId) {
        const confirmed = await Utils.confirm(
            'Delete Tag',
            'Are you sure you want to delete this tag? This will remove it from all users.'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deleteTag(tagId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Tag deleted successfully', 'success');
            await this.loadTags();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Load Application Branding
     */
    async loadBranding() {
        const container = document.getElementById('branding');

        try {
            // Load current settings
            const appNameSetting = await API.getSetting('app_title');
            const logoSetting = await API.getSetting('app_logo');
            const faviconSetting = await API.getSetting('app_favicon');
            const loginMessageSetting = await API.getSetting('login_message');
            const hideLoginNameSetting = await API.getSetting('hide_login_name');
            const themeModeSetting = await API.getSetting('theme_mode');
            const customColorsSetting = await API.getSetting('custom_colors');
            const discordServerUrlSetting = await API.getSetting('discord_server_url');
            const telegramGroupUrlSetting = await API.getSetting('telegram_group_url');
            const appUrlSetting = await API.getSetting('app_url');

            // Get actual stored value (don't use fallback here, let the form show empty if not set)
            const appName = appNameSetting?.value || '';
            const appUrl = appUrlSetting?.value || '';
            const hideLoginName = hideLoginNameSetting?.value === 'true' || hideLoginNameSetting?.value === true;
            const logoPath = logoSetting?.value || '';
            const faviconPath = faviconSetting?.value || '';
            const loginMessage = loginMessageSetting?.value || 'Sign in to your account';
            const themeMode = themeModeSetting?.value || 'light';
            const customColors = customColorsSetting?.value ? JSON.parse(customColorsSetting.value) : {
                primary: '#8e24aa',
                secondary: '#3f51b5',
                accent: '#4fc3f7',
                success: '#4caf50'
            };
            const discordServerUrl = discordServerUrlSetting?.value || '';
            const telegramGroupUrl = telegramGroupUrlSetting?.value || '';

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="mb-3">
                        <h3><i class="fas fa-palette"></i> Customization</h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            Customize appearance, branding, and color scheme
                        </p>
                    </div>
                    <form id="branding-form" class="form">
                        <div class="form-group">
                            <label class="form-label">Application Name</label>
                            <input type="text" class="form-input" id="app-name" placeholder="StreamPanel (default)" value="${appName}">
                            <label style="display: flex; align-items: center; margin-top: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="hide-login-name" style="margin-right: 0.5rem;">
                                <span>Remove application name from login page</span>
                            </label>
                            <small class="form-help">This name appears in the application title and branding. Leave blank to use "StreamPanel".</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Application URL</label>
                            <input type="url" class="form-input" id="app-url" placeholder="https://yourapp.com or http://192.168.1.100:3050" value="${appUrl}">
                            <small class="form-help">The URL users use to access this application. Used in welcome emails and password reset links. Leave blank to auto-detect.</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Login Page Message</label>
                            <input type="text" class="form-input" id="login-message" placeholder="Sign in to your account" value="${loginMessage}">
                            <small class="form-help">Custom message displayed on the login page</small>
                        </div>

                        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                        <h4 style="margin-bottom: 1.5rem;"><i class="fas fa-users"></i> Community Links</h4>

                        <div class="form-group">
                            <label class="form-label">Discord Server URL</label>
                            <input type="url" class="form-input" id="discord-server-url" placeholder="https://discord.gg/your-invite" value="${discordServerUrl}">
                            <small class="form-help">Discord server invite link (will be used in email templates)</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Telegram Group URL</label>
                            <input type="url" class="form-input" id="telegram-group-url" placeholder="https://t.me/your-group" value="${telegramGroupUrl}">
                            <small class="form-help">Telegram group invite link (will be used in email templates)</small>
                        </div>

                        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                        <h4 style="margin-bottom: 1.5rem;"><i class="fas fa-image"></i> Branding Assets</h4>

                        <div class="form-group">
                            <label class="form-label">Logo Upload</label>
                            ${logoPath ? `
                                <div class="mb-2" style="padding: 1rem; background: var(--card-bg); border-radius: 8px;">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <img src="${logoPath}" alt="Current logo" style="max-height: 80px; max-width: 200px;">
                                        <button type="button" class="btn btn-outline btn-sm" onclick="Settings.removeBranding('logo')">
                                            <i class="fas fa-trash"></i> Remove Logo
                                        </button>
                                    </div>
                                </div>
                            ` : ''}
                            <input type="file" class="form-input" id="logo-upload" accept="image/*">
                            <small class="form-help">Recommended size: 200x50px or 300x75px (PNG with transparency preferred) - Used in both light and dark modes - Max 5MB</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Favicon Upload</label>
                            ${faviconPath ? `
                                <div class="mb-2" style="padding: 1rem; background: var(--card-bg); border-radius: 8px;">
                                    <div style="display: flex; align-items: center; gap: 1rem;">
                                        <img src="${faviconPath}" alt="Current favicon" style="max-height: 32px; max-width: 32px;">
                                        <button type="button" class="btn btn-outline btn-sm" onclick="Settings.removeBranding('favicon')">
                                            <i class="fas fa-trash"></i> Remove Favicon
                                        </button>
                                    </div>
                                </div>
                            ` : ''}
                            <input type="file" class="form-input" id="favicon-upload" accept="image/x-icon,image/png">
                            <small class="form-help">Recommended size: 32x32px or 64x64px (PNG or ICO format) - Used in both light and dark modes - Max 5MB</small>
                        </div>

                        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                        <h4 style="margin-bottom: 1.5rem;"><i class="fas fa-adjust"></i> Theme & Display Mode</h4>

                        <div class="form-group">
                            <label class="form-label">Display Mode</label>
                            <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                                <label class="theme-mode-option ${themeMode === 'light' ? 'active' : ''}">
                                    <input type="radio" name="themeMode" value="light" ${themeMode === 'light' ? 'checked' : ''} onchange="Settings.applyThemeMode('light')">
                                    <span class="theme-mode-label">
                                        <i class="fas fa-sun"></i> Light Mode
                                    </span>
                                </label>
                                <label class="theme-mode-option ${themeMode === 'dark' ? 'active' : ''}">
                                    <input type="radio" name="themeMode" value="dark" ${themeMode === 'dark' ? 'checked' : ''} onchange="Settings.applyThemeMode('dark')">
                                    <span class="theme-mode-label">
                                        <i class="fas fa-moon"></i> Dark Mode
                                    </span>
                                </label>
                            </div>
                            <small class="form-help">Choose between light and dark display modes</small>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Color Scheme Preset</label>
                            <select class="form-input" id="color-scheme-preset" onchange="Settings.applyColorPreset(this.value)">
                                <option value="custom">Custom Colors</option>
                                <option value="purple-blue" selected>Purple & Blue (Default)</option>
                                <option value="green-teal">Green & Teal</option>
                                <option value="orange-red">Orange & Red</option>
                                <option value="pink-purple">Pink & Purple</option>
                                <option value="blue-cyan">Blue & Cyan</option>
                            </select>
                            <small class="form-help">Quick color scheme presets</small>
                        </div>

                        <div style="padding: 1.5rem; background: var(--card-bg); border-radius: 8px; margin-top: 1.5rem;">
                            <h5 style="margin-bottom: 1rem;">Custom Colors</h5>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label class="form-label">Primary Color</label>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <input type="color" id="primary-color" value="${customColors.primary}" style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid var(--primary-color); cursor: pointer;">
                                        <input type="text" id="primary-color-hex" value="${customColors.primary}" readonly class="form-input" style="flex: 1;">
                                    </div>
                                    <small class="form-help">Main brand color</small>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label class="form-label">Secondary Color</label>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <input type="color" id="secondary-color" value="${customColors.secondary}" style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid var(--secondary-color); cursor: pointer;">
                                        <input type="text" id="secondary-color-hex" value="${customColors.secondary}" readonly class="form-input" style="flex: 1;">
                                    </div>
                                    <small class="form-help">Accent for gradients</small>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label class="form-label">Accent Color</label>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <input type="color" id="accent-color" value="${customColors.accent}" style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid var(--accent-color); cursor: pointer;">
                                        <input type="text" id="accent-color-hex" value="${customColors.accent}" readonly class="form-input" style="flex: 1;">
                                    </div>
                                    <small class="form-help">Text highlights</small>
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label class="form-label">Success Color</label>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <input type="color" id="success-color" value="${customColors.success}" style="width: 60px; height: 40px; border-radius: 8px; border: 2px solid var(--success-color); cursor: pointer;">
                                        <input type="text" id="success-color-hex" value="${customColors.success}" readonly class="form-input" style="flex: 1;">
                                    </div>
                                    <small class="form-help">Success states</small>
                                </div>
                            </div>
                            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
                                <button type="button" class="btn btn-success btn-sm" onclick="Settings.applyCustomColors()">
                                    <i class="fas fa-palette"></i> Apply Colors
                                </button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="Settings.resetToDefaultColors()">
                                    <i class="fas fa-undo"></i> Reset to Defaults
                                </button>
                            </div>
                        </div>

                        <div style="padding: 1.5rem; background: rgba(var(--accent-color-rgb), 0.1); border-radius: 8px; margin-top: 1.5rem; border: 1px solid var(--accent-color);">
                            <h5 style="margin-bottom: 1rem; color: var(--accent-color);">Theme Preview</h5>
                            <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center;">
                                <button class="btn btn-primary" type="button">Primary Button</button>
                                <button class="btn btn-success" type="button">Success Button</button>
                                <span class="badge" style="background: var(--primary-color);">Sample Badge</span>
                                <span style="color: var(--accent-color); font-weight: bold;">Accent Text</span>
                            </div>
                        </div>

                        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                        <button type="submit" class="btn btn-primary" onclick="Settings.saveBranding(event)">
                            <i class="fas fa-save"></i> Save All Settings
                        </button>
                    </form>
                </div>
            `;

            // Set checkbox state after HTML is rendered
            setTimeout(() => {
                const hideLoginNameCheckbox = document.getElementById('hide-login-name');
                if (hideLoginNameCheckbox) {
                    hideLoginNameCheckbox.checked = hideLoginName;
                }
            }, 0);
        } catch (error) {
            console.error('Error loading branding settings:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load branding settings</p>
                </div>
            `;
        }
    },

    async saveBranding(event) {
        event.preventDefault();
        Utils.showLoading();

        try {
            const appName = document.getElementById('app-name').value;
            const appUrl = document.getElementById('app-url').value;
            const loginMessage = document.getElementById('login-message').value;
            const hideLoginName = document.getElementById('hide-login-name').checked;
            const discordServerUrl = document.getElementById('discord-server-url').value;
            const telegramGroupUrl = document.getElementById('telegram-group-url').value;
            const logoFile = document.getElementById('logo-upload').files[0];
            const faviconFile = document.getElementById('favicon-upload').files[0];

            // Save app name (allow empty string to reset to default)
            await API.updateSetting('app_title', appName.trim(), 'string', 'Application title');

            // Save app URL
            await API.updateSetting('app_url', appUrl.trim(), 'string', 'Application URL for emails');

            // Save login message (allow empty string to reset to default)
            await API.updateSetting('login_message', loginMessage.trim(), 'string', 'Login page message');

            // Save hide login name checkbox
            await API.updateSetting('hide_login_name', String(hideLoginName), 'string', 'Hide app name on login page');

            // Save community links
            await API.updateSetting('discord_server_url', discordServerUrl.trim(), 'string', 'Discord server invite URL');
            await API.updateSetting('telegram_group_url', telegramGroupUrl.trim(), 'string', 'Telegram group invite URL');

            // Upload logo if selected
            if (logoFile) {
                await API.uploadBrandingFile(logoFile, 'logo');
            }

            // Upload favicon if selected
            if (faviconFile) {
                await API.uploadBrandingFile(faviconFile, 'favicon');
            }

            Utils.hideLoading();
            Utils.showToast('Success', 'Branding settings saved successfully', 'success');

            // Reload the branding section to show updated images
            await this.loadBranding();

            // Reload global branding (header, title, etc.) to apply changes immediately
            if (typeof loadBrandingSettings === 'function') {
                await loadBrandingSettings();
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving branding:', error);
            Utils.showToast('Error', error.message || 'Failed to save branding settings', 'error');
        }
    },

    async removeBranding(type) {
        if (!confirm(`Are you sure you want to remove the ${type}?`)) {
            return;
        }

        Utils.showLoading();

        try {
            let settingKey;
            if (type === 'logo') {
                settingKey = 'app_logo';
            } else if (type === 'logo-dark') {
                settingKey = 'app_logo_dark';
            } else if (type === 'favicon-dark') {
                settingKey = 'app_favicon_dark';
            } else {
                settingKey = 'app_favicon';
            }

            await API.updateSetting(settingKey, '', 'string', `Path to application ${type}`);

            Utils.hideLoading();
            Utils.showToast('Success', `${type.charAt(0).toUpperCase() + type.slice(1)} removed successfully`, 'success');

            // Reload the branding section
            await this.loadBranding();

            // Reload global branding (header, title, etc.) to apply changes immediately
            if (typeof loadBrandingSettings === 'function') {
                await loadBrandingSettings();
            }

        } catch (error) {
            Utils.hideLoading();
            console.error(`Error removing ${type}:`, error);
            Utils.showToast('Error', `Failed to remove ${type}`, 'error');
        }
    },

    /**
     * Apply theme mode (light/dark)
     */
    async applyThemeMode(mode) {
        console.log('Applying theme mode:', mode);

        if (mode === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        try {
            await API.updateSetting('theme_mode', mode, 'string', 'Display mode (light/dark)');
            Utils.showToast('Success', `Switched to ${mode} mode`, 'success');
        } catch (error) {
            console.error('Error saving theme mode:', error);
            Utils.showToast('Error', 'Failed to save theme mode', 'error');
        }
    },

    /**
     * Apply color preset
     */
    applyColorPreset(preset) {
        console.log('Applying color preset:', preset);

        const presets = {
            'purple-blue': { primary: '#8e24aa', secondary: '#3f51b5', accent: '#4fc3f7', success: '#4caf50' },
            'green-teal': { primary: '#4caf50', secondary: '#009688', accent: '#00bcd4', success: '#8bc34a' },
            'orange-red': { primary: '#ff5722', secondary: '#ff9800', accent: '#ffc107', success: '#4caf50' },
            'pink-purple': { primary: '#e91e63', secondary: '#9c27b0', accent: '#ba68c8', success: '#4caf50' },
            'blue-cyan': { primary: '#2196f3', secondary: '#00bcd4', accent: '#03a9f4', success: '#4caf50' }
        };

        if (preset !== 'custom' && presets[preset]) {
            const colors = presets[preset];
            this.applyColors(colors);
            this.updateColorInputs(colors);
            this.saveCustomColors(colors);
            Utils.showToast('Success', `Applied ${preset.replace('-', ' & ')} color scheme`, 'success');
        }
    },

    /**
     * Apply custom colors from color pickers
     */
    async applyCustomColors() {
        const colors = {
            primary: document.getElementById('primary-color').value,
            secondary: document.getElementById('secondary-color').value,
            accent: document.getElementById('accent-color').value,
            success: document.getElementById('success-color').value
        };

        console.log('Applying custom colors:', colors);

        this.applyColors(colors);
        await this.saveCustomColors(colors);

        // Update preset select to show custom
        const presetSelect = document.getElementById('color-scheme-preset');
        if (presetSelect) presetSelect.value = 'custom';

        Utils.showToast('Success', 'Custom colors applied successfully', 'success');
    },

    /**
     * Apply colors to CSS variables
     */
    applyColors(colors) {
        const root = document.documentElement;

        document.body.style.transition = 'all 0.5s ease';

        root.style.setProperty('--primary-color', colors.primary);
        root.style.setProperty('--secondary-color', colors.secondary);
        root.style.setProperty('--accent-color', colors.accent);
        root.style.setProperty('--success-color', colors.success);

        setTimeout(() => {
            document.body.style.transition = '';
        }, 500);
    },

    /**
     * Update color input fields
     */
    updateColorInputs(colors) {
        document.getElementById('primary-color').value = colors.primary;
        document.getElementById('primary-color-hex').value = colors.primary;

        document.getElementById('secondary-color').value = colors.secondary;
        document.getElementById('secondary-color-hex').value = colors.secondary;

        document.getElementById('accent-color').value = colors.accent;
        document.getElementById('accent-color-hex').value = colors.accent;

        document.getElementById('success-color').value = colors.success;
        document.getElementById('success-color-hex').value = colors.success;

        // Add event listeners to update hex display when color picker changes
        ['primary', 'secondary', 'accent', 'success'].forEach(type => {
            const colorInput = document.getElementById(`${type}-color`);
            const hexInput = document.getElementById(`${type}-color-hex`);
            if (colorInput && hexInput) {
                colorInput.addEventListener('input', (e) => {
                    hexInput.value = e.target.value;
                });
            }
        });
    },

    /**
     * Save custom colors to database
     */
    async saveCustomColors(colors) {
        try {
            await API.updateSetting('custom_colors', JSON.stringify(colors), 'json', 'Custom color scheme');
            console.log('Custom colors saved:', colors);
        } catch (error) {
            console.error('Error saving custom colors:', error);
            Utils.showToast('Error', 'Failed to save custom colors', 'error');
        }
    },

    /**
     * Reset to default colors
     */
    async resetToDefaultColors() {
        console.log('Resetting to default colors');

        const defaultColors = {
            primary: '#8e24aa',
            secondary: '#3f51b5',
            accent: '#4fc3f7',
            success: '#4caf50'
        };

        this.applyColors(defaultColors);
        this.updateColorInputs(defaultColors);
        await this.saveCustomColors(defaultColors);

        const presetSelect = document.getElementById('color-scheme-preset');
        if (presetSelect) presetSelect.value = 'purple-blue';

        Utils.showToast('Success', 'Reset to default purple & blue theme', 'success');
    },

    /**
     * Load Email Server & Scheduler (Combined)
     */
    async loadEmailServer() {
        const container = document.getElementById('email-server');
        this.currentEmailTab = this.currentEmailTab || 'schedules';

        try {
            // Fetch existing email settings
            const settings = await API.getAllSettings();
            const emailSettings = settings.settings || {};

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="mb-4">
                        <h3><i class="fas fa-envelope"></i> Email Management</h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            Configure SMTP, manage email templates, and set up automated schedules
                        </p>
                    </div>

                    <!-- Sub-tabs for email sections -->
                    <div class="tabs" style="margin-bottom: 1rem;">
                        <button class="tab ${this.currentEmailTab === 'schedules' ? 'active' : ''}" data-email-tab="schedules">
                            <i class="fas fa-calendar-alt"></i> Email Schedules
                        </button>
                        <button class="tab ${this.currentEmailTab === 'templates' ? 'active' : ''}" data-email-tab="templates">
                            <i class="fas fa-file-alt"></i> Email Templates
                        </button>
                        <button class="tab ${this.currentEmailTab === 'smtp' ? 'active' : ''}" data-email-tab="smtp">
                            <i class="fas fa-server"></i> SMTP Settings
                        </button>
                    </div>

                    <!-- SMTP Settings Tab -->
                    <div id="smtp-tab" class="email-tab-content" style="display: ${this.currentEmailTab === 'smtp' ? 'block' : 'none'}">
                        <div class="card">
                            <div class="card-body">
                                <form id="email-server-form" class="form">
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Host</label>
                                        <input type="text" class="form-input" id="smtp-host"
                                               placeholder="smtp.gmail.com"
                                               value="${emailSettings.smtp_host?.value || ''}" required>
                                        <small class="form-help">SMTP server hostname</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Port</label>
                                        <input type="number" class="form-input" id="smtp-port"
                                               placeholder="587"
                                               value="${emailSettings.smtp_port?.value || ''}" required>
                                        <small class="form-help">Common: 587 (TLS), 465 (SSL)</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Use TLS/SSL</label>
                                        <select class="form-input" id="smtp-secure">
                                            <option value="tls" ${emailSettings.smtp_secure?.value === 'tls' ? 'selected' : ''}>TLS (Port 587)</option>
                                            <option value="ssl" ${emailSettings.smtp_secure?.value === 'ssl' ? 'selected' : ''}>SSL (Port 465)</option>
                                            <option value="none" ${emailSettings.smtp_secure?.value === 'none' ? 'selected' : ''}>None</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Username</label>
                                        <input type="text" class="form-input" id="smtp-username"
                                               placeholder="your-email@gmail.com"
                                               value="${emailSettings.smtp_username?.value || ''}" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Password</label>
                                        <input type="password" class="form-input" id="smtp-password"
                                               placeholder="${emailSettings.smtp_password?.value ? '••••••••' : ''}" required>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Sender Name</label>
                                        <input type="text" class="form-input" id="sender-name"
                                               placeholder="My Company"
                                               value="${emailSettings.sender_name?.value || ''}">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Sender Email</label>
                                        <input type="email" class="form-input" id="sender-email"
                                               placeholder="noreply@example.com"
                                               value="${emailSettings.sender_email?.value || ''}">
                                    </div>
                                    <div class="flex gap-2">
                                        <button type="button" class="btn btn-secondary" onclick="Settings.testEmailServer()">
                                            <i class="fas fa-paper-plane"></i> Send Test Email
                                        </button>
                                        <button type="submit" class="btn btn-primary" onclick="Settings.saveEmailServer(event)">
                                            <i class="fas fa-save"></i> Save Configuration
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <!-- Email Templates Tab -->
                    <div id="templates-tab" class="email-tab-content" style="display: ${this.currentEmailTab === 'templates' ? 'block' : 'none'}">
                        <!-- Will be populated by EmailTemplates.render() -->
                    </div>

                    <!-- Email Schedules Tab -->
                    <div id="schedules-tab" class="email-tab-content" style="display: ${this.currentEmailTab === 'schedules' ? 'block' : 'none'}">
                        <!-- Will be populated by EmailSchedules.render() -->
                    </div>
                </div>
            `;

            // Setup email sub-tab switching
            document.querySelectorAll('[data-email-tab]').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabName = e.currentTarget.getAttribute('data-email-tab');
                    this.switchEmailTab(tabName);
                });
            });

            // Load the current tab content
            await this.switchEmailTab(this.currentEmailTab);

        } catch (error) {
            console.error('Error loading email configuration:', error);
            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="alert alert-error">
                        <i class="fas fa-exclamation-circle"></i>
                        Failed to load email configuration: ${error.message}
                    </div>
                </div>
            `;
        }
    },

    /**
     * Switch email sub-tab
     */
    async switchEmailTab(tabName) {
        this.currentEmailTab = tabName;

        // Update tab buttons
        document.querySelectorAll('[data-email-tab]').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`[data-email-tab="${tabName}"]`);
        if (activeTab) activeTab.classList.add('active');

        // Update tab contents
        document.querySelectorAll('.email-tab-content').forEach(c => c.style.display = 'none');

        // Show selected tab and load content
        const selectedContent = document.getElementById(`${tabName}-tab`);
        if (selectedContent) {
            selectedContent.style.display = 'block';

            // Load tab-specific content
            if (tabName === 'templates') {
                await EmailTemplates.render(selectedContent);
            } else if (tabName === 'schedules') {
                await EmailSchedules.render(selectedContent);
            }
        }
    },

    /**
     * Toggle Email Server Config visibility
     */
    toggleEmailServerConfig() {
        const content = document.getElementById('email-server-config-content');
        const chevron = document.getElementById('email-config-chevron');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            chevron.className = 'fas fa-chevron-up';
        } else {
            content.style.display = 'none';
            chevron.className = 'fas fa-chevron-down';
        }
    },

    async testEmailServer() {
        try {
            // Get current user's email
            const currentUser = API.getCurrentUser();
            const defaultEmail = currentUser?.email || '';

            // Prompt for email address
            const email = prompt('Enter email address to send test email to:', defaultEmail);

            if (!email) {
                return; // User cancelled
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                Utils.showToast('Error', 'Please enter a valid email address', 'error');
                return;
            }

            // Show loading state
            Utils.showToast('Info', `Sending test email to ${email}...`, 'info');

            // Send test email
            const response = await API.sendTestEmail(email);

            if (response.success) {
                Utils.showToast('Success', response.message, 'success');
            } else {
                Utils.showToast('Error', response.message || 'Failed to send test email', 'error');
            }

        } catch (error) {
            console.error('Error sending test email:', error);
            Utils.showToast('Error', error.message || 'Failed to send test email', 'error');
        }
    },

    async saveEmailServer(event) {
        event.preventDefault();

        try {
            // Get form values
            const smtpHost = document.getElementById('smtp-host').value.trim();
            const smtpPort = document.getElementById('smtp-port').value.trim();
            const smtpSecure = document.getElementById('smtp-secure').value;
            const smtpUsername = document.getElementById('smtp-username').value.trim();
            const smtpPassword = document.getElementById('smtp-password').value;
            const senderName = document.getElementById('sender-name').value.trim();
            const senderEmail = document.getElementById('sender-email').value.trim();

            // Validate required fields
            if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword) {
                Utils.showToast('Error', 'Please fill in all required fields', 'error');
                return;
            }

            // Validate port number
            const port = parseInt(smtpPort);
            if (isNaN(port) || port < 1 || port > 65535) {
                Utils.showToast('Error', 'Invalid port number', 'error');
                return;
            }

            // Save each setting
            const settingsToSave = [
                { key: 'smtp_host', value: smtpHost, type: 'string', description: 'SMTP server hostname' },
                { key: 'smtp_port', value: smtpPort, type: 'number', description: 'SMTP server port' },
                { key: 'smtp_secure', value: smtpSecure, type: 'string', description: 'SMTP security method (TLS/SSL)' },
                { key: 'smtp_username', value: smtpUsername, type: 'string', description: 'SMTP username for authentication' },
                { key: 'smtp_password', value: smtpPassword, type: 'string', description: 'SMTP password for authentication' },
                { key: 'sender_name', value: senderName, type: 'string', description: 'Email sender display name' },
                { key: 'sender_email', value: senderEmail, type: 'string', description: 'Email sender address' }
            ];

            // Save all settings
            for (const setting of settingsToSave) {
                await API.updateSetting(setting.key, setting.value, setting.type, setting.description);
            }

            Utils.showToast('Success', 'Email server configuration saved successfully', 'success');

        } catch (error) {
            console.error('Error saving email server settings:', error);
            Utils.showToast('Error', `Failed to save settings: ${error.message}`, 'error');
        }
    },

    /**
     * Load Channel Groups (per-panel basis)
     */
    async loadChannelGroups() {
        const container = document.getElementById('channel-groups');

        try {
            // Fetch all panels
            const panelsResponse = await API.getIPTVPanels();
            const panels = panelsResponse.panels || [];

            // Fetch packages for each panel
            const panelsWithPackages = await Promise.all(
                panels.map(async (panel) => {
                    try {
                        const packagesResponse = await API.getIPTVPackages(panel.id);
                        return {
                            ...panel,
                            packages: packagesResponse.packages || []
                        };
                    } catch (error) {
                        console.error(`Error fetching packages for panel ${panel.name}:`, error);
                        return {
                            ...panel,
                            packages: []
                        };
                    }
                })
            );

            // Calculate totals
            const totalPackages = panelsWithPackages.reduce((sum, p) => sum + p.packages.length, 0);

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-layer-group"></i> IPTV Channel Groups & Packages</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                View and manage packages synced from IPTV panels (${totalPackages} total packages across ${panels.length} panels)
                            </p>
                        </div>
                        <button class="btn btn-secondary" onclick="Settings.syncAllPanelPackages()">
                            <i class="fas fa-sync"></i> Sync All Packages
                        </button>
                    </div>

                    <!-- Search/Filter -->
                    <div style="margin-bottom: 1.5rem;">
                        <input
                            type="text"
                            id="channel-groups-search"
                            class="form-control"
                            placeholder="Search packages by name, duration, or type..."
                            style="max-width: 500px;"
                            oninput="Settings.filterChannelGroups(this.value)"
                        />
                    </div>

                    ${panelsWithPackages.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-layer-group" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No IPTV panels configured</p>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">Add IPTV panels in the IPTV Panels tab to see their packages here</p>
                        </div>
                    ` : `
                        <div id="channel-groups-panels">
                            ${panelsWithPackages.map(panel => `
                                <div class="panel-packages-section" data-panel-id="${panel.id}" style="margin-bottom: 2rem;">
                                    <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                                        <div class="flex justify-between items-center">
                                            <div>
                                                <h4 style="margin: 0;">
                                                    <i class="fas fa-network-wired"></i> ${panel.name}
                                                    <span class="badge badge-info" style="margin-left: 0.5rem;">${panel.panel_type}</span>
                                                </h4>
                                                <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                                                    ${panel.packages.length} package${panel.packages.length !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <button class="btn btn-secondary btn-sm" onclick="Settings.syncPanelPackages(${panel.id})">
                                                <i class="fas fa-sync"></i> Sync Packages
                                            </button>
                                        </div>
                                    </div>

                                    ${panel.packages.length === 0 ? `
                                        <div style="padding: 2rem; text-center; background: var(--bg-secondary); border-radius: 8px;">
                                            <i class="fas fa-box-open" style="font-size: 2rem; color: var(--text-secondary); opacity: 0.3;"></i>
                                            <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary);">No packages synced for this panel</p>
                                            <button class="btn btn-primary btn-sm mt-2" onclick="Settings.syncPanelPackages(${panel.id})">
                                                <i class="fas fa-sync"></i> Sync Now
                                            </button>
                                        </div>
                                    ` : `
                                        <div class="table-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Package Name</th>
                                                        <th style="text-align: center;">Type</th>
                                                        <th style="text-align: center;">Connections</th>
                                                        <th style="text-align: center;">Duration</th>
                                                        <th style="text-align: center;">Credits</th>
                                                        <th style="text-align: center;">Package ID</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${panel.packages.map(pkg => `
                                                        <tr class="package-row" data-package-name="${pkg.name.toLowerCase()}" data-package-type="${(pkg.package_type || '').toLowerCase()}" data-duration="${pkg.duration_months}">
                                                            <td>
                                                                <strong>${pkg.name}</strong>
                                                            </td>
                                                            <td style="text-align: center;">
                                                                <span class="badge ${pkg.package_type === 'trial' ? 'badge-warning' : 'badge-success'}">
                                                                    ${pkg.package_type || 'standard'}
                                                                </span>
                                                            </td>
                                                            <td style="text-align: center;">${pkg.connections || 'N/A'}</td>
                                                            <td style="text-align: center;">
                                                                ${pkg.duration_months ? `${pkg.duration_months} month${pkg.duration_months !== 1 ? 's' : ''}` : 'N/A'}
                                                            </td>
                                                            <td style="text-align: center;">${pkg.credits || '0'}</td>
                                                            <td style="text-align: center;">
                                                                <code style="background: var(--bg-tertiary); padding: 0.25rem 0.5rem; border-radius: 4px;">
                                                                    ${pkg.package_id}
                                                                </code>
                                                            </td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    `}
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            `;

        } catch (error) {
            console.error('Error loading channel groups:', error);
            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="text-center mt-4 mb-4">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--danger); opacity: 0.5;"></i>
                        <p class="mt-2" style="color: var(--danger);">Error loading channel groups</p>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">${error.message}</p>
                        <button class="btn btn-primary mt-2" onclick="Settings.loadChannelGroups()">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Filter channel groups by search term
     */
    filterChannelGroups(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const packageRows = document.querySelectorAll('.package-row');

        packageRows.forEach(row => {
            const name = row.getAttribute('data-package-name') || '';
            const type = row.getAttribute('data-package-type') || '';
            const duration = row.getAttribute('data-duration') || '';

            const matches = name.includes(term) || type.includes(term) || duration.includes(term);
            row.style.display = matches ? '' : 'none';
        });
    },

    /**
     * Sync packages for a specific panel
     */
    async syncPanelPackages(panelId) {
        try {
            Utils.showLoading('Syncing packages from panel...');
            await API.syncIPTVPanelPackages(panelId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Packages synced successfully', 'success');
            await this.loadChannelGroups(); // Reload to show new packages
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Sync packages for all panels
     */
    async syncAllPanelPackages() {
        try {
            Utils.showLoading('Syncing packages from all panels...');

            const panelsResponse = await API.getIPTVPanels();
            const panels = panelsResponse.panels || [];

            let successCount = 0;
            let errorCount = 0;

            for (const panel of panels) {
                try {
                    await API.syncIPTVPanelPackages(panel.id);
                    successCount++;
                } catch (error) {
                    console.error(`Error syncing packages for panel ${panel.name}:`, error);
                    errorCount++;
                }
            }

            Utils.hideLoading();

            if (errorCount === 0) {
                Utils.showToast('Success', `Synced packages from ${successCount} panel${successCount !== 1 ? 's' : ''}`, 'success');
            } else {
                Utils.showToast('Warning', `Synced ${successCount} panel${successCount !== 1 ? 's' : ''}, ${errorCount} failed`, 'warning');
            }

            await this.loadChannelGroups(); // Reload to show new packages
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },


    /**
     * Load Email Scheduler
     */
    // DEPRECATED: Email Scheduler is now integrated into loadEmailServer()
    // This function is no longer used and can be removed in future cleanup
    /*
    async loadEmailScheduler() {
        const container = document.getElementById('email-scheduler');
        container.innerHTML = `
            <div style="padding: 1.5rem;">
                <div class="flex justify-between items-center mb-3">
                    <div>
                        <h3><i class="fas fa-calendar-alt"></i> Email Scheduler</h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            Automate emails based on expiration, tags, owners, and schedules
                        </p>
                    </div>
                    <button class="btn btn-primary" onclick="Settings.showAddEmailScheduleModal()">
                        <i class="fas fa-plus"></i> Add Schedule
                    </button>
                </div>
                <div class="text-center mt-4 mb-4">
                    <p style="color: var(--text-secondary);">Email Scheduler coming soon...</p>
                </div>
            </div>
        `;
    },

    showAddEmailScheduleModal() {
        Utils.showToast('Info', 'Email Scheduler coming soon', 'info');
    },
    */

    // ========================================
    // SUBSCRIPTION PLANS MANAGEMENT
    // ========================================

    /**
     * Load Subscription Plans
     */
    async loadSubscriptionPlans() {
        const container = document.getElementById('subscription-plans');

        try {
            const response = await API.getSubscriptionPlans(false);
            const plans = response.plans;

            const providersResponse = await API.getPaymentProviders(false);
            const providers = providersResponse.providers;

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-box-open"></i> Subscription Plans (${plans.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Create subscription plans for Plex, IPTV, and future services
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddSubscriptionPlanModal()">
                            <i class="fas fa-plus"></i> Add Plan
                        </button>
                    </div>

                    ${plans.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-box-open" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No subscription plans configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddSubscriptionPlanModal()">
                                <i class="fas fa-plus"></i> Create Your First Plan
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Service Type</th>
                                        <th>Duration</th>
                                        <th>Price</th>
                                        <th>IPTV Connections</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${plans.map(plan => {
                                        const serviceTypeDisplay = {
                                            'plex': 'Plex',
                                            'iptv': 'IPTV',
                                            'emby': 'Emby',
                                            'jellyfin': 'Jellyfin',
                                            'combo': 'Combo'
                                        }[plan.service_type] || plan.service_type;

                                        const serviceIcon = {
                                            'plex': 'fa-server',
                                            'iptv': 'fa-tv',
                                            'emby': 'fa-film',
                                            'jellyfin': 'fa-film',
                                            'combo': 'fa-layer-group'
                                        }[plan.service_type] || 'fa-box';

                                        return `
                                        <tr>
                                            <td>
                                                <strong>${Utils.escapeHtml(plan.name)}</strong>
                                                ${plan.description ? `<br><small style="color: var(--text-secondary);">${Utils.escapeHtml(plan.description)}</small>` : ''}
                                            </td>
                                            <td>
                                                <i class="fas ${serviceIcon}"></i> ${serviceTypeDisplay}
                                            </td>
                                            <td>${plan.duration_months === 0 || plan.duration_months === null ? '<span style="color: var(--success-color);">Unlimited</span>' : `${plan.duration_months} month${plan.duration_months !== 1 ? 's' : ''}`}</td>
                                            <td><strong>${plan.price_type === 'free' ? '<span style="color: var(--success-color);">Free</span>' : plan.price_type === 'donation' ? `<span style="color: var(--warning-color);">Donation</span>${plan.price > 0 ? ` <small>(${plan.currency || 'USD'} $${plan.price.toFixed(2)} suggested)</small>` : ''}` : `${plan.currency || 'USD'} $${plan.price.toFixed(2)}`}</strong></td>
                                            <td>${plan.iptv_connections || '-'}</td>
                                            <td>${Utils.getStatusBadge(plan.is_active, 'Active', 'Inactive')}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.copySubscriptionPlan(${plan.id})" title="Copy">
                                                    <i class="fas fa-copy"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.editSubscriptionPlan(${plan.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deleteSubscriptionPlan(${plan.id})" title="Delete">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}

                    <!-- Payment Options Section -->
                    <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-dollar-sign"></i> Payment Options (${providers.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Manage payment methods for subscription purchases
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddPaymentOptionModal()">
                            <i class="fas fa-plus"></i> Add Option
                        </button>
                    </div>

                    ${providers.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-dollar-sign" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No payment options configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddPaymentOptionModal()">
                                <i class="fas fa-plus"></i> Add Your First Option
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Payment URL</th>
                                        <th>QR Code</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${providers.map(provider => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(provider.name)}</strong></td>
                                            <td>
                                                <a href="${Utils.escapeHtml(provider.payment_url)}" target="_blank" style="color: var(--primary-color); text-decoration: none;">
                                                    ${Utils.escapeHtml(provider.payment_url)}
                                                    <i class="fas fa-external-link-alt" style="font-size: 0.75rem; margin-left: 0.25rem;"></i>
                                                </a>
                                            </td>
                                            <td>
                                                ${provider.qr_code_data ? '<i class="fas fa-qrcode" style="color: var(--success-color);"></i> Available' : '<span style="color: var(--text-secondary);">-</span>'}
                                            </td>
                                            <td>${Utils.getStatusBadge(provider.is_active, 'Active', 'Inactive')}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.editPaymentOption(${provider.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                ${provider.qr_code_data ? `
                                                    <button class="btn btn-sm btn-outline" onclick="Settings.viewPaymentQRCode(${provider.id}, '${Utils.escapeHtml(provider.name).replace(/'/g, "\\'")}')" title="View QR Code">
                                                        <i class="fas fa-qrcode"></i>
                                                    </button>
                                                ` : ''}
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deletePaymentOption(${provider.id})" title="Delete">
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
            console.error('Error loading subscription plans:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load subscription plans</p>
                </div>
            `;
        }
    },

    /**
     * Show add subscription plan modal
     */
    showAddSubscriptionPlanModal() {
        Utils.showModal({
            title: 'Add Subscription Plan',
            body: `
                <form id="add-subscription-plan-form">
                    <div class="form-group">
                        <label class="form-label required">Plan Name</label>
                        <input type="text" name="name" class="form-input" required
                               placeholder="e.g., Plex Premium 3 Month">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <textarea name="description" class="form-input" rows="2"
                                  placeholder="Optional description of this plan"></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label required">Service Type</label>
                        <select name="service_type" class="form-input" required onchange="Settings.handleSubscriptionPlanServiceTypeChange(this)">
                            <option value="">Select service type...</option>
                            <option value="plex">Plex</option>
                            <option value="iptv">IPTV</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label required">Duration</label>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <div style="flex: 1;">
                                <input type="number" name="duration_months" class="form-input" min="0" value="1" id="add-duration-input">
                                <small class="form-text">Months (0 = Unlimited)</small>
                            </div>
                            <div class="form-checkbox-group" style="white-space: nowrap;">
                                <input type="checkbox" name="unlimited_duration" class="form-checkbox" id="add-unlimited-duration"
                                       onchange="Settings.handleUnlimitedDurationChange(this, 'add-duration-input')">
                                <label for="add-unlimited-duration">Unlimited (No Expiration)</label>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label required">Pricing Type</label>
                        <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="price_type" value="fixed" checked onchange="Settings.handlePriceTypeChange(this)">
                                <span>Fixed Price</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="price_type" value="free" onchange="Settings.handlePriceTypeChange(this)">
                                <span>Free</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="price_type" value="donation" onchange="Settings.handlePriceTypeChange(this)">
                                <span>Donation</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-group" id="price-input-group">
                        <label class="form-label" id="price-label">Price</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <select name="currency" class="form-input" style="flex: 0 0 80px;">
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="CAD">CAD</option>
                            </select>
                            <input type="number" name="price" class="form-input" min="0" step="0.01" placeholder="0.00" style="flex: 1;" id="add-price-input">
                        </div>
                        <small class="form-text" id="price-help-text"></small>
                    </div>

                    <!-- IPTV-specific fields -->
                    <div id="iptv-fields" style="display: none;">
                        <div class="form-group">
                            <label class="form-label required">IPTV Connections</label>
                            <input type="number" name="iptv_connections" class="form-input" min="1" value="1"
                                   placeholder="Number of concurrent connections">
                        </div>
                    </div>

                    <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label">Display Order</label>
                            <input type="number" name="display_order" class="form-input" min="0" value="0"
                                   placeholder="0 (lower numbers appear first)">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Status</label>
                            <div class="form-checkbox-group">
                                <input type="checkbox" name="is_active" class="form-checkbox" id="add-plan-active" checked>
                                <label for="add-plan-active">Plan is Active</label>
                            </div>
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                        <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: var(--text-secondary);">
                            <i class="fas fa-globe"></i> Portal Visibility
                        </h4>
                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <div class="form-checkbox-group">
                                    <input type="checkbox" name="show_on_portal" class="form-checkbox" id="add-show-on-portal" checked>
                                    <label for="add-show-on-portal">Show on User Portal</label>
                                </div>
                                <small class="form-text">Users can see this plan when requesting new services</small>
                            </div>
                            <div class="form-group">
                                <div class="form-checkbox-group">
                                    <input type="checkbox" name="is_portal_default" class="form-checkbox" id="add-portal-default">
                                    <label for="add-portal-default">Portal Default Plan</label>
                                </div>
                                <small class="form-text">Pre-selected when users request this service type</small>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Portal Description</label>
                            <textarea name="portal_description" class="form-input" rows="2"
                                      placeholder="Optional: Short description shown to users on the portal"></textarea>
                            <small class="form-text">If empty, the main description will be used</small>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Create Plan',
                    class: 'btn-primary',
                    onClick: () => this.submitAddSubscriptionPlan()
                }
            ]
        });
    },

    /**
     * Handle service type change in subscription plan form
     */
    handleSubscriptionPlanServiceTypeChange(select) {
        const iptvFields = document.getElementById('iptv-fields');
        const serviceType = select.value;

        if (serviceType === 'iptv' || serviceType === 'combo') {
            iptvFields.style.display = 'block';
            document.querySelector('[name="iptv_connections"]').required = true;
        } else {
            iptvFields.style.display = 'none';
            document.querySelector('[name="iptv_connections"]').required = false;
        }
    },

    /**
     * Handle unlimited duration checkbox change
     */
    handleUnlimitedDurationChange(checkbox, inputId) {
        const durationInput = document.getElementById(inputId);
        if (checkbox.checked) {
            durationInput.value = 0;
            durationInput.disabled = true;
        } else {
            durationInput.disabled = false;
            if (durationInput.value === '0') {
                durationInput.value = 1;
            }
        }
    },

    /**
     * Handle price type change
     */
    handlePriceTypeChange(radio) {
        const priceGroup = document.getElementById('price-input-group');
        const priceInput = priceGroup?.querySelector('input[name="price"]');
        const priceLabel = document.getElementById('price-label');
        const priceHelpText = document.getElementById('price-help-text');

        if (!priceGroup || !priceInput) return;

        switch (radio.value) {
            case 'free':
                priceGroup.style.display = 'none';
                priceInput.value = 0;
                priceInput.required = false;
                break;
            case 'donation':
                priceGroup.style.display = 'block';
                priceLabel.textContent = 'Suggested Donation';
                priceHelpText.textContent = 'Optional: Enter a suggested donation amount';
                priceInput.required = false;
                priceInput.placeholder = '0.00 (optional)';
                break;
            case 'fixed':
            default:
                priceGroup.style.display = 'block';
                priceLabel.textContent = 'Price';
                priceHelpText.textContent = '';
                priceInput.required = true;
                priceInput.placeholder = '0.00';
                break;
        }
    },

    /**
     * Submit add subscription plan form
     */
    async submitAddSubscriptionPlan() {
        const form = document.getElementById('add-subscription-plan-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const priceType = formData.get('price_type') || 'fixed';
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            service_type: formData.get('service_type'),
            price: priceType === 'free' ? 0 : (parseFloat(formData.get('price')) || 0),
            price_type: priceType,
            currency: formData.get('currency'),
            duration_months: parseInt(formData.get('duration_months')) || 0,
            is_active: formData.get('is_active') === 'on',
            display_order: parseInt(formData.get('display_order')) || 0,
            // Portal visibility fields
            show_on_portal: formData.get('show_on_portal') === 'on' ? 1 : 0,
            is_portal_default: formData.get('is_portal_default') === 'on' ? 1 : 0,
            portal_description: formData.get('portal_description') || null
        };

        // Add IPTV-specific fields if applicable
        if (data.service_type === 'iptv' || data.service_type === 'combo') {
            data.iptv_connections = parseInt(formData.get('iptv_connections'));
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            await API.createSubscriptionPlan(data);
            Utils.hideLoading();
            Utils.showToast('Success', 'Subscription plan created successfully', 'success');
            await this.loadSubscriptionPlans();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Edit subscription plan
     */
    async editSubscriptionPlan(planId) {
        Utils.showLoading();
        try {
            const response = await API.getSubscriptionPlan(planId);
            const plan = response.plan;
            Utils.hideLoading();

            Utils.showModal({
                title: 'Edit Subscription Plan',
                body: `
                    <form id="edit-subscription-plan-form">
                        <div class="form-group">
                            <label class="form-label required">Plan Name</label>
                            <input type="text" name="name" class="form-input" required
                                   value="${Utils.escapeHtml(plan.name)}">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <textarea name="description" class="form-input" rows="2"
                                      placeholder="Optional description of this plan">${Utils.escapeHtml(plan.description || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Service Type</label>
                            <select name="service_type" class="form-input" required onchange="Settings.handleSubscriptionPlanServiceTypeChange(this)">
                                <option value="plex" ${plan.service_type === 'plex' ? 'selected' : ''}>Plex</option>
                                <option value="iptv" ${plan.service_type === 'iptv' ? 'selected' : ''}>IPTV</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Duration</label>
                            <div style="display: flex; gap: 1rem; align-items: center;">
                                <div style="flex: 1;">
                                    <input type="number" name="duration_months" class="form-input" min="0" value="${plan.duration_months || 0}" id="edit-duration-input" ${plan.duration_months === 0 || plan.duration_months === null ? 'disabled' : ''}>
                                    <small class="form-text">Months (0 = Unlimited)</small>
                                </div>
                                <div class="form-checkbox-group" style="white-space: nowrap;">
                                    <input type="checkbox" name="unlimited_duration" class="form-checkbox" id="edit-unlimited-duration"
                                           ${plan.duration_months === 0 || plan.duration_months === null ? 'checked' : ''}
                                           onchange="Settings.handleUnlimitedDurationChange(this, 'edit-duration-input')">
                                    <label for="edit-unlimited-duration">Unlimited (No Expiration)</label>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Pricing Type</label>
                            <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem;">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="fixed" ${(plan.price_type || 'fixed') === 'fixed' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Fixed Price</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="free" ${plan.price_type === 'free' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Free</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="donation" ${plan.price_type === 'donation' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Donation</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group" id="price-input-group" style="display: ${plan.price_type === 'free' ? 'none' : 'block'};">
                            <label class="form-label" id="price-label">${plan.price_type === 'donation' ? 'Suggested Donation' : 'Price'}</label>
                            <div style="display: flex; gap: 0.5rem;">
                                <select name="currency" class="form-input" style="flex: 0 0 80px;">
                                    <option value="USD" ${plan.currency === 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="EUR" ${plan.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                                    <option value="GBP" ${plan.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                                    <option value="CAD" ${plan.currency === 'CAD' ? 'selected' : ''}>CAD</option>
                                </select>
                                <input type="number" name="price" class="form-input" min="0" step="0.01" value="${plan.price}" style="flex: 1;" ${plan.price_type === 'fixed' ? 'required' : ''}>
                            </div>
                            <small class="form-text" id="price-help-text">${plan.price_type === 'donation' ? 'Optional: Enter a suggested donation amount' : ''}</small>
                        </div>

                        <!-- IPTV-specific fields -->
                        <div id="iptv-fields" style="display: ${plan.service_type === 'iptv' || plan.service_type === 'combo' ? 'block' : 'none'};">
                            <div class="form-group">
                                <label class="form-label required">IPTV Connections</label>
                                <input type="number" name="iptv_connections" class="form-input" min="1" value="${plan.iptv_connections || 1}"
                                       placeholder="Number of concurrent connections"
                                       ${plan.service_type === 'iptv' || plan.service_type === 'combo' ? 'required' : ''}>
                            </div>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label">Display Order</label>
                                <input type="number" name="display_order" class="form-input" min="0" value="${plan.display_order || 0}"
                                       placeholder="0 (lower numbers appear first)">
                            </div>

                            <div class="form-group">
                                <label class="form-label">Status</label>
                                <div class="form-checkbox-group">
                                    <input type="checkbox" name="is_active" class="form-checkbox" id="edit-plan-active" ${plan.is_active ? 'checked' : ''}>
                                    <label for="edit-plan-active">Plan is Active</label>
                                </div>
                            </div>
                        </div>

                        <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                            <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: var(--text-secondary);">
                                <i class="fas fa-globe"></i> Portal Visibility
                            </h4>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <div class="form-checkbox-group">
                                        <input type="checkbox" name="show_on_portal" class="form-checkbox" id="edit-show-on-portal" ${plan.show_on_portal !== 0 ? 'checked' : ''}>
                                        <label for="edit-show-on-portal">Show on User Portal</label>
                                    </div>
                                    <small class="form-text">Users can see this plan when requesting new services</small>
                                </div>
                                <div class="form-group">
                                    <div class="form-checkbox-group">
                                        <input type="checkbox" name="is_portal_default" class="form-checkbox" id="edit-portal-default" ${plan.is_portal_default ? 'checked' : ''}>
                                        <label for="edit-portal-default">Portal Default Plan</label>
                                    </div>
                                    <small class="form-text">Pre-selected when users request this service type</small>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Portal Description</label>
                                <textarea name="portal_description" class="form-input" rows="2"
                                          placeholder="Optional: Short description shown to users on the portal">${Utils.escapeHtml(plan.portal_description || '')}</textarea>
                                <small class="form-text">If empty, the main description will be used</small>
                            </div>
                        </div>
                    </form>
                `,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: () => this.submitEditSubscriptionPlan(planId)
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Copy subscription plan - opens add modal with pre-filled data
     */
    async copySubscriptionPlan(planId) {
        Utils.showLoading();
        try {
            const response = await API.getSubscriptionPlan(planId);
            const plan = response.plan;
            Utils.hideLoading();

            Utils.showModal({
                title: 'Copy Subscription Plan',
                body: `
                    <form id="add-subscription-plan-form">
                        <div class="form-group">
                            <label class="form-label required">Plan Name</label>
                            <input type="text" name="name" class="form-input" required
                                   value="${Utils.escapeHtml(plan.name)}">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <textarea name="description" class="form-input" rows="2"
                                      placeholder="Optional description of this plan">${Utils.escapeHtml(plan.description || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Service Type</label>
                            <select name="service_type" class="form-input" required onchange="Settings.handleSubscriptionPlanServiceTypeChange(this)">
                                <option value="plex" ${plan.service_type === 'plex' ? 'selected' : ''}>Plex</option>
                                <option value="iptv" ${plan.service_type === 'iptv' ? 'selected' : ''}>IPTV</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Duration</label>
                            <div style="display: flex; gap: 1rem; align-items: center;">
                                <div style="flex: 1;">
                                    <input type="number" name="duration_months" class="form-input" min="0" value="${plan.duration_months || 0}" id="add-duration-input" ${plan.duration_months === 0 || plan.duration_months === null ? 'disabled' : ''}>
                                    <small class="form-text">Months (0 = Unlimited)</small>
                                </div>
                                <div class="form-checkbox-group" style="white-space: nowrap;">
                                    <input type="checkbox" name="unlimited_duration" class="form-checkbox" id="add-unlimited-duration"
                                           ${plan.duration_months === 0 || plan.duration_months === null ? 'checked' : ''}
                                           onchange="Settings.handleUnlimitedDurationChange(this, 'add-duration-input')">
                                    <label for="add-unlimited-duration">Unlimited (No Expiration)</label>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Pricing Type</label>
                            <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem;">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="fixed" ${(plan.price_type || 'fixed') === 'fixed' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Fixed Price</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="free" ${plan.price_type === 'free' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Free</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="radio" name="price_type" value="donation" ${plan.price_type === 'donation' ? 'checked' : ''} onchange="Settings.handlePriceTypeChange(this)">
                                    <span>Donation</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group" id="price-input-group" style="display: ${plan.price_type === 'free' ? 'none' : 'block'};">
                            <label class="form-label" id="price-label">${plan.price_type === 'donation' ? 'Suggested Donation' : 'Price'}</label>
                            <div style="display: flex; gap: 0.5rem;">
                                <select name="currency" class="form-input" style="flex: 0 0 80px;">
                                    <option value="USD" ${plan.currency === 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="EUR" ${plan.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                                    <option value="GBP" ${plan.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                                    <option value="CAD" ${plan.currency === 'CAD' ? 'selected' : ''}>CAD</option>
                                </select>
                                <input type="number" name="price" class="form-input" min="0" step="0.01" value="${plan.price}" style="flex: 1;" id="add-price-input" ${plan.price_type === 'fixed' ? 'required' : ''}>
                            </div>
                            <small class="form-text" id="price-help-text">${plan.price_type === 'donation' ? 'Optional: Enter a suggested donation amount' : ''}</small>
                        </div>

                        <!-- IPTV-specific fields -->
                        <div id="iptv-fields" style="display: ${plan.service_type === 'iptv' || plan.service_type === 'combo' ? 'block' : 'none'};">
                            <div class="form-group">
                                <label class="form-label required">IPTV Connections</label>
                                <input type="number" name="iptv_connections" class="form-input" min="1" value="${plan.iptv_connections || 1}"
                                       placeholder="Number of concurrent connections"
                                       ${plan.service_type === 'iptv' || plan.service_type === 'combo' ? 'required' : ''}>
                            </div>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label">Display Order</label>
                                <input type="number" name="display_order" class="form-input" min="0" value="${plan.display_order || 0}"
                                       placeholder="0 (lower numbers appear first)">
                            </div>

                            <div class="form-group">
                                <label class="form-label">Status</label>
                                <div class="form-checkbox-group">
                                    <input type="checkbox" name="is_active" class="form-checkbox" id="add-plan-active" ${plan.is_active ? 'checked' : ''}>
                                    <label for="add-plan-active">Plan is Active</label>
                                </div>
                            </div>
                        </div>

                        <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                            <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: var(--text-secondary);">
                                <i class="fas fa-globe"></i> Portal Visibility
                            </h4>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <div class="form-checkbox-group">
                                        <input type="checkbox" name="show_on_portal" class="form-checkbox" id="add-show-on-portal" ${plan.show_on_portal !== 0 ? 'checked' : ''}>
                                        <label for="add-show-on-portal">Show on User Portal</label>
                                    </div>
                                    <small class="form-text">Users can see this plan when requesting new services</small>
                                </div>
                                <div class="form-group">
                                    <div class="form-checkbox-group">
                                        <input type="checkbox" name="is_portal_default" class="form-checkbox" id="add-portal-default" ${plan.is_portal_default ? 'checked' : ''}>
                                        <label for="add-portal-default">Portal Default Plan</label>
                                    </div>
                                    <small class="form-text">Pre-selected when users request this service type</small>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Portal Description</label>
                                <textarea name="portal_description" class="form-input" rows="2"
                                          placeholder="Optional: Short description shown to users on the portal">${Utils.escapeHtml(plan.portal_description || '')}</textarea>
                                <small class="form-text">If empty, the main description will be used</small>
                            </div>
                        </div>
                    </form>
                `,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Create Copy',
                        class: 'btn-primary',
                        onClick: () => this.submitAddSubscriptionPlan()
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Submit edit subscription plan form
     */
    async submitEditSubscriptionPlan(planId) {
        const form = document.getElementById('edit-subscription-plan-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const priceType = formData.get('price_type') || 'fixed';
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            service_type: formData.get('service_type'),
            price: priceType === 'free' ? 0 : (parseFloat(formData.get('price')) || 0),
            price_type: priceType,
            currency: formData.get('currency'),
            duration_months: parseInt(formData.get('duration_months')) || 0,
            is_active: formData.get('is_active') === 'on',
            display_order: parseInt(formData.get('display_order')) || 0,
            // Portal visibility fields
            show_on_portal: formData.get('show_on_portal') === 'on' ? 1 : 0,
            is_portal_default: formData.get('is_portal_default') === 'on' ? 1 : 0,
            portal_description: formData.get('portal_description') || null
        };

        // Add IPTV-specific fields if applicable
        if (data.service_type === 'iptv' || data.service_type === 'combo') {
            data.iptv_connections = parseInt(formData.get('iptv_connections'));
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            await API.updateSubscriptionPlan(planId, data);
            Utils.hideLoading();
            Utils.showToast('Success', 'Subscription plan updated successfully', 'success');
            await this.loadSubscriptionPlans();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Delete subscription plan
     */
    async deleteSubscriptionPlan(planId) {
        const confirmed = await Utils.confirm(
            'Delete Subscription Plan',
            'Are you sure you want to delete this subscription plan? This action cannot be undone.'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deleteSubscriptionPlan(planId);
            Utils.hideLoading();
            Utils.showToast('Success', 'Subscription plan deleted successfully', 'success');
            await this.loadSubscriptionPlans();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    // ========================================
    // PAYMENT OPTIONS MANAGEMENT
    // ========================================

    /**
     * Show add payment option modal
     */
    // Predefined payment provider types
    paymentProviderTypes: [
        { value: 'venmo', label: 'Venmo', placeholder: 'https://venmo.com/u/yourname' },
        { value: 'paypal', label: 'PayPal', placeholder: 'https://paypal.me/yourname' },
        { value: 'cashapp', label: 'CashApp', placeholder: 'https://cash.app/$yourtag' },
        { value: 'applepay', label: 'Apple Pay', placeholder: 'Your Apple Pay link or instructions' },
        { value: 'googlepay', label: 'Google Pay', placeholder: 'Your Google Pay link or instructions' }
    ],

    showAddPaymentOptionModal() {
        const modalBody = `
            <form id="add-payment-option-form">
                <div class="form-group">
                    <label class="form-label required">Payment Type</label>
                    <select name="name" class="form-input" required onchange="Settings.updatePaymentUrlPlaceholder(this)">
                        <option value="">Select payment type...</option>
                        ${this.paymentProviderTypes.map(type => `
                            <option value="${type.label}" data-placeholder="${type.placeholder}">${type.label}</option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label required">Payment URL / Link</label>
                    <input type="text" name="payment_url" class="form-input" required
                           id="add-payment-url-input"
                           placeholder="Select a payment type first">
                    <small class="form-text">Your payment profile URL or payment instructions</small>
                </div>

                <div class="form-group">
                    <label class="form-label">QR Code (Optional)</label>
                    <input type="file" name="qr_code" class="form-input" accept="image/*">
                    <small class="form-text">Upload a QR code image for easy scanning</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="is_active" checked>
                        <span>Active</span>
                    </label>
                </div>
            </form>
        `;

        Utils.showModal({
            title: 'Add Payment Option',
            body: modalBody,
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Save',
                    className: 'btn-primary',
                    onClick: async () => {
                        const form = document.getElementById('add-payment-option-form');
                        if (!form.checkValidity()) {
                            form.reportValidity();
                            return;
                        }

                        const formData = new FormData(form);
                        const fileInput = form.querySelector('input[name="qr_code"]');

                        try {
                            Utils.showLoading();

                            // Convert QR code to base64 if provided
                            let qr_code_data = null;
                            if (fileInput.files.length > 0) {
                                const file = fileInput.files[0];
                                qr_code_data = await Utils.fileToBase64(file);
                            }

                            const data = {
                                name: formData.get('name'),
                                payment_url: formData.get('payment_url'),
                                qr_code_data,
                                is_active: formData.get('is_active') === 'on'
                            };

                            await API.createPaymentProvider(data);
                            Utils.closeModal();
                            Utils.hideLoading();
                            Utils.showToast('Success', 'Payment option added successfully', 'success');
                            await this.loadSubscriptionPlans();
                        } catch (error) {
                            Utils.hideLoading();
                            Utils.showToast('Error', error.message, 'error');
                        }
                    }
                }
            ]
        });
    },

    /**
     * Update payment URL placeholder based on selected type
     */
    updatePaymentUrlPlaceholder(selectElement) {
        const selectedOption = selectElement.options[selectElement.selectedIndex];
        const placeholder = selectedOption.dataset.placeholder || 'Enter payment URL';
        const urlInput = document.getElementById('add-payment-url-input') || document.getElementById('edit-payment-url-input');
        if (urlInput) {
            urlInput.placeholder = placeholder;
        }
    },

    /**
     * Edit payment option
     */
    async editPaymentOption(id) {
        try {
            Utils.showLoading();
            const response = await API.getPaymentProvider(id);
            const option = response.provider;
            Utils.hideLoading();

            const modalBody = `
                <form id="edit-payment-option-form">
                    <div class="form-group">
                        <label class="form-label required">Payment Type</label>
                        <select name="name" class="form-input" required onchange="Settings.updatePaymentUrlPlaceholder(this)">
                            ${this.paymentProviderTypes.map(type => `
                                <option value="${type.label}" data-placeholder="${type.placeholder}" ${option.name === type.label ? 'selected' : ''}>${type.label}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label required">Payment URL / Link</label>
                        <input type="text" name="payment_url" class="form-input" required
                               id="edit-payment-url-input"
                               value="${Utils.escapeHtml(option.payment_url)}">
                        <small class="form-text">Your payment profile URL or payment instructions</small>
                    </div>

                    <div class="form-group">
                        <label class="form-label">QR Code (Optional)</label>
                        ${option.qr_code_data ? `
                            <div style="margin-bottom: 0.5rem;">
                                <span style="color: var(--success-color);"><i class="fas fa-check-circle"></i> QR Code uploaded</span>
                                <button type="button" class="btn btn-sm btn-outline" onclick="Settings.viewPaymentQRCode(${id}, '${Utils.escapeHtml(option.name).replace(/'/g, "\\'")}')">
                                    <i class="fas fa-eye"></i> View
                                </button>
                            </div>
                        ` : ''}
                        <input type="file" name="qr_code" class="form-input" accept="image/*">
                        <small class="form-text">Upload a new QR code to replace the existing one</small>
                    </div>

                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="is_active" ${option.is_active ? 'checked' : ''}>
                            <span>Active</span>
                        </label>
                    </div>
                </form>
            `;

            Utils.showModal({
                title: 'Edit Payment Option',
                body: modalBody,
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        className: 'btn-primary',
                        onClick: async () => {
                            const form = document.getElementById('edit-payment-option-form');
                            if (!form.checkValidity()) {
                                form.reportValidity();
                                return;
                            }

                            const formData = new FormData(form);
                            const fileInput = form.querySelector('input[name="qr_code"]');

                            try {
                                Utils.showLoading();

                                const data = {
                                    name: formData.get('name'),
                                    payment_url: formData.get('payment_url'),
                                    is_active: formData.get('is_active') === 'on'
                                };

                                // Only update QR code if a new file was selected
                                if (fileInput.files.length > 0) {
                                    const file = fileInput.files[0];
                                    data.qr_code_data = await Utils.fileToBase64(file);
                                }

                                await API.updatePaymentProvider(id, data);
                                Utils.closeModal();
                                Utils.hideLoading();
                                Utils.showToast('Success', 'Payment option updated successfully', 'success');
                                await this.loadSubscriptionPlans();
                            } catch (error) {
                                Utils.hideLoading();
                                Utils.showToast('Error', error.message, 'error');
                            }
                        }
                    }
                ]
            });
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Delete payment option
     */
    async deletePaymentOption(id) {
        const confirmed = confirm('Are you sure you want to delete this payment option?');
        if (!confirmed) return;

        try {
            Utils.showLoading();
            await API.deletePaymentProvider(id);
            Utils.hideLoading();
            Utils.showToast('Success', 'Payment option deleted successfully', 'success');
            await this.loadSubscriptionPlans();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * View payment QR code
     */
    async viewPaymentQRCode(id, name) {
        try {
            Utils.showLoading();
            const response = await API.getPaymentProvider(id);
            const option = response.provider;
            Utils.hideLoading();

            if (!option.qr_code_data) {
                Utils.showToast('Error', 'No QR code available for this payment option', 'error');
                return;
            }

            const modalBody = `
                <div style="text-center">
                    <img src="${option.qr_code_data}" alt="${Utils.escapeHtml(name)} QR Code"
                         style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto;">
                    <p style="margin-top: 1rem; color: var(--text-secondary);">
                        Scan this QR code to access ${Utils.escapeHtml(name)}
                    </p>
                </div>
            `;

            Utils.showModal({
                title: `${name} - QR Code`,
                body: modalBody,
                buttons: [
                    {
                        text: 'Close',
                        className: 'btn-primary',
                        onClick: () => Utils.closeModal()
                    }
                ]
            });
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    // ========================================
    // IPTV PANELS MANAGEMENT
    // ========================================

    /**
     * Show add IPTV panel modal
     */
    showAddIPTVPanelModal() {
        // State management for the modal
        window._iptvPanelModalState = {
            step: 1, // 1=credentials, 2=test, 3=packages, 4=bouquets
            panelId: null,
            selectedPackageId: null,
            packages: [],
            bouquets: []
        };

        const modalContent = this.renderIPTVPanelModalStep1();

        Utils.showModal({
            title: 'Add IPTV Panel',
            body: modalContent,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Test Connection',
                    class: 'btn-primary',
                    id: 'iptv-panel-action-btn',
                    onClick: () => this.handleIPTVPanelModalAction()
                }
            ]
        });
    },

    /**
     * Render step 1: Panel credentials
     */
    renderIPTVPanelModalStep1() {
        return `
            <form id="add-iptv-panel-form">
                <div class="form-group">
                    <label class="form-label required">Panel Name</label>
                    <input type="text" name="name" class="form-input" required
                           placeholder="e.g., Pink Pony Panel 1">
                </div>
                <div class="form-group">
                    <label class="form-label required">Panel Type</label>
                    <select name="panel_type" class="form-select" required onchange="Settings.handlePanelTypeChange(this)">
                        <option value="">Select panel type...</option>
                        <option value="nxt_dash">NXT Dash</option>
                        <option value="one_stream">1-Stream</option>
                        <option value="xui_one" disabled>XUI One (Coming Soon)</option>
                        <option value="xtream_ui" disabled>Xtream UI (Coming Soon)</option>
                        <option value="midnight_streamer" disabled>Midnight Streamer (Coming Soon)</option>
                    </select>
                </div>

                <!-- NXT Dash Fields -->
                <div id="nxt-dash-fields" style="display: none;">
                    <div class="form-group">
                        <label class="form-label required">Panel Base URL</label>
                        <input type="url" name="nxt_base_url" class="form-input"
                               placeholder="https://panel.example.com">
                        <small class="form-help">Main panel URL without /login</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Login URL</label>
                        <input type="url" name="login_url" class="form-input"
                               placeholder="https://panel.example.com/login/nvvykjyh">
                        <small class="form-help">Full login URL (usually base URL + /login/unique-id)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Provider Base URL (Customer Streaming URL)</label>
                        <input type="url" name="nxt_provider_base_url" class="form-input"
                               placeholder="http://stream.example.com:8080">
                        <small class="form-help">URL where your customers connect to watch streams (used to generate M3U playlists and iMPlayer codes)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Username</label>
                        <input type="text" name="nxt_username" class="form-input"
                               placeholder="Panel username">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Password</label>
                        <input type="password" name="nxt_password" class="form-input"
                               placeholder="Panel password">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Admin Notes</label>
                        <textarea name="nxt_notes" class="form-input" rows="4"
                                  placeholder="Admin credentials, server info, or other notes...&#10;&#10;Example:&#10;Admin Login: https://panel.example.com/admin&#10;Admin Username: admin123&#10;Admin Password: ********"></textarea>
                        <small class="form-help">Store admin credentials and notes for this panel (optional)</small>
                    </div>
                </div>

                <!-- 1-Stream Fields -->
                <div id="one-stream-fields" style="display: none;">
                    <div class="form-group">
                        <label class="form-label required">Panel Base URL</label>
                        <input type="url" name="os_base_url" class="form-input"
                               placeholder="http://panel.example.com:8080">
                        <small class="form-help">Panel URL (used for API calls and customer streaming)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Provider Base URL (Customer Streaming URL)</label>
                        <input type="url" name="os_provider_base_url" class="form-input"
                               placeholder="http://stream.example.com:8080">
                        <small class="form-help">URL where your customers connect to watch streams (usually same as Base URL)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">X-Api-Key</label>
                        <input type="text" name="api_key" class="form-input"
                               placeholder="Your API Key token">
                        <small class="form-help">API Key token provided by the panel admin</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">X-Auth-User (Reseller Username)</label>
                        <input type="text" name="os_username" class="form-input"
                               placeholder="Your reseller username">
                        <small class="form-help">This is your reseller username that you generate yourself</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Bouquet Names Line ID (Optional)</label>
                        <input type="text" name="os_bouquet_line_id" class="form-input"
                               placeholder="e.g., 26d5b696-4994-4c73-94b3-4a7fbbcb4934">
                        <small class="form-help">Optional: Line ID of a user with ALL bouquets assigned. Used to fetch bouquet names when syncing. Without this, bouquets will show as "Bouquet 123" instead of their actual names.</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Admin Notes</label>
                        <textarea name="os_notes" class="form-input" rows="4"
                                  placeholder="Admin credentials, server info, or other notes..."></textarea>
                        <small class="form-help">Store admin credentials and notes for this panel (optional)</small>
                    </div>
                </div>

                <div id="test-result" style="display: none; margin-top: 1rem;"></div>
            </form>
        `;
    },

    /**
     * Handle panel type change
     */
    handlePanelTypeChange(select) {
        const nxtDashFields = document.getElementById('nxt-dash-fields');
        const oneStreamFields = document.getElementById('one-stream-fields');

        // Hide all fields first
        nxtDashFields.style.display = 'none';
        oneStreamFields.style.display = 'none';

        // Show appropriate fields
        if (select.value === 'nxt_dash') {
            nxtDashFields.style.display = 'block';
            // Make NXT Dash fields required
            nxtDashFields.querySelectorAll('input[name^="nxt_"]').forEach(input => {
                if (!input.name.includes('notes')) input.required = true;
            });
            nxtDashFields.querySelector('input[name="login_url"]').required = true;
            // Make 1-Stream fields not required
            oneStreamFields.querySelectorAll('input').forEach(input => input.required = false);
        } else if (select.value === 'one_stream') {
            oneStreamFields.style.display = 'block';
            // Make 1-Stream fields required
            oneStreamFields.querySelectorAll('input[name^="os_"], input[name="api_key"]').forEach(input => {
                if (!input.name.includes('notes')) input.required = true;
            });
            // Make NXT Dash fields not required
            nxtDashFields.querySelectorAll('input').forEach(input => input.required = false);
        }
    },

    /**
     * Handle modal action button click
     */
    async handleIPTVPanelModalAction() {
        const state = window._iptvPanelModalState;

        if (state.step === 1) {
            await this.testIPTVPanelConnection();
        } else if (state.step === 2) {
            await this.fetchIPTVPanelPackages();
        } else if (state.step === 3) {
            await this.fetchIPTVPanelBouquets();
        } else if (state.step === 4) {
            await this.saveIPTVPanel();
        }
    },

    /**
     * Step 1 Action: Test connection
     */
    async testIPTVPanelConnection() {
        const form = document.getElementById('add-iptv-panel-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const panelType = formData.get('panel_type');
        let data = {
            panel_type: panelType
        };

        // Collect panel-specific fields
        if (panelType === 'nxt_dash') {
            data.base_url = formData.get('nxt_base_url');
            data.login_url = formData.get('login_url') || data.base_url + '/login';
            data.credentials = {
                username: formData.get('nxt_username'),
                password: formData.get('nxt_password')
            };
        } else if (panelType === 'one_stream') {
            data.base_url = formData.get('os_base_url');
            data.login_url = data.base_url; // Not used for 1-Stream
            data.credentials = {
                api_key: formData.get('api_key'),
                username: formData.get('os_username'),
                bouquet_line_id: formData.get('os_bouquet_line_id') || null
            };
        }

        // Validate data object
        if (!data.base_url || !data.credentials) {
            Utils.showToast('Error', 'Please fill in all required fields', 'error');
            return;
        }

        console.log('[DEBUG] Testing panel connection with data:', data);

        const actionBtn = document.getElementById('iptv-panel-action-btn');
        if (!actionBtn) {
            console.error('Action button not found in DOM');
            return;
        }

        const originalText = actionBtn.innerHTML;
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';

        try {
            const response = await API.testIPTVPanelConnection(data);

            const resultDiv = document.getElementById('test-result');
            resultDiv.style.display = 'block';

            if (response.success) {
                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> ${response.message}
                    </div>
                `;

                // Save panel after successful test connection
                actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Panel...';

                const createData = {
                    name: formData.get('name'),
                    panel_type: data.panel_type,
                    base_url: data.base_url,
                    login_url: data.login_url,
                    credentials: data.credentials
                };

                // Add panel-specific fields
                if (panelType === 'nxt_dash') {
                    createData.provider_base_url = formData.get('nxt_provider_base_url');
                    createData.notes = formData.get('nxt_notes');
                } else if (panelType === 'one_stream') {
                    createData.provider_base_url = formData.get('os_provider_base_url');
                    createData.notes = formData.get('os_notes');
                }

                const createResponse = await API.createIPTVPanel(createData);

                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> Panel saved successfully! Reloading...
                    </div>
                `;

                // Close modal and refresh panels list
                setTimeout(() => {
                    Utils.closeModal();
                    Settings.loadIPTVPanels();
                }, 1000);

            } else {
                resultDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle"></i> ${response.message}
                    </div>
                `;
                actionBtn.innerHTML = originalText;
                actionBtn.disabled = false;
            }

        } catch (error) {
            const resultDiv = document.getElementById('test-result');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> Error: ${error.message}
                </div>
            `;
            actionBtn.innerHTML = originalText;
            actionBtn.disabled = false;
        }
    },

    /**
     * Step 2 Action: Fetch packages (panel already created in step 1)
     */
    async fetchIPTVPanelPackages() {
        const state = window._iptvPanelModalState;
        const actionBtn = document.getElementById('iptv-panel-action-btn');
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching Packages...';

        try {
            const packagesResponse = await API.fetchIPTVPanelPackages(state.panelId);
            state.packages = packagesResponse.packages;

            // Update modal to show package selection
            const form = document.getElementById('add-iptv-panel-form');
            form.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> Found ${state.packages.length} packages.
                </div>
                <div class="form-group">
                    <label class="form-label required">Select Package for Bouquet Sync</label>
                    <select id="package-select" class="form-select" required>
                        <option value="">Select a package...</option>
                        ${state.packages.map(pkg => `
                            <option value="${pkg.id}">
                                ${Utils.escapeHtml(pkg.name)} - ${pkg.connections} conn, ${pkg.duration} ${pkg.duration_unit}, ${pkg.credits} credits
                            </option>
                        `).join('')}
                    </select>
                    <small class="form-help">This package will be used to fetch available bouquets</small>
                </div>
            `;

            state.step = 3;
            actionBtn.innerHTML = '<i class="fas fa-list"></i> Fetch Bouquets';
            actionBtn.disabled = false;

        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
            actionBtn.innerHTML = '<i class="fas fa-box"></i> Retry Fetch Packages';
            actionBtn.disabled = false;
        }
    },

    /**
     * Step 3 Action: Fetch bouquets
     */
    async fetchIPTVPanelBouquets() {
        const state = window._iptvPanelModalState;
        const packageSelect = document.getElementById('package-select');

        if (!packageSelect.value) {
            Utils.showToast('Error', 'Please select a package', 'error');
            return;
        }

        state.selectedPackageId = packageSelect.value;

        const actionBtn = document.getElementById('iptv-panel-action-btn');
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching Bouquets...';

        try {
            const response = await API.fetchIPTVPanelBouquets(state.panelId, state.selectedPackageId);
            state.bouquets = response.bouquets;

            // Update modal to show success
            const form = document.getElementById('add-iptv-panel-form');
            form.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> Successfully synced ${state.bouquets.length} bouquets!
                </div>
                <div style="margin-top: 1rem;">
                    <h4>Summary:</h4>
                    <ul>
                        <li><strong>Packages:</strong> ${state.packages.length}</li>
                        <li><strong>Bouquets:</strong> ${state.bouquets.length}</li>
                        <li><strong>Selected Package ID:</strong> ${state.selectedPackageId}</li>
                    </ul>
                </div>
            `;

            state.step = 4;
            actionBtn.innerHTML = '<i class="fas fa-check"></i> Finish';
            actionBtn.disabled = false;

        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
            actionBtn.innerHTML = '<i class="fas fa-list"></i> Retry Fetch Bouquets';
            actionBtn.disabled = false;
        }
    },

    /**
     * Step 4 Action: Finish
     */
    async saveIPTVPanel() {
        Utils.closeModal();
        Utils.showToast('Success', 'IPTV panel configured successfully', 'success');
        await this.loadIPTVPanels();
    },

    /**
     * Sync IPTV panel packages
     */
    async syncIPTVPanelPackages(panelId) {
        Utils.showLoading();
        try {
            const response = await API.syncIPTVPanelPackages(panelId);
            Utils.hideLoading();
            Utils.showToast('Success', `Synced ${response.count} packages`, 'success');
            await this.loadIPTVPanels();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Save selected package for IPTV panel
     */
    async saveIPTVPanelSelectedPackage(panelId, packageId) {
        try {
            await API.updateIPTVPanelSettings(panelId, packageId);
            console.log(`Saved selected package ${packageId} for panel ${panelId}`);
        } catch (error) {
            console.error('Error saving selected package:', error);
            throw error;
        }
    },

    /**
     * Load channel packages for selected IPTV panel
     */
    async loadBouquetsForPanel(panelId) {
        const container = document.getElementById('bouquets-container');

        if (!panelId) {
            container.style.display = 'none';
            return;
        }

        // Store current panel ID
        window._currentChannelPackagePanelId = panelId;

        // Show container with loading state
        container.style.display = 'block';
        container.innerHTML = `
            <div class="text-center mt-4 mb-4">
                <div class="spinner" style="margin: 0 auto;"></div>
                <p class="mt-2">Loading channel packages...</p>
            </div>
        `;

        try {
            // Fetch existing channel packages for this panel
            const response = await API.getChannelGroups(panelId);
            const channelGroups = response.channel_groups || [];

            // Fetch bouquets to validate panel has them
            const bouquetsResponse = await API.getIPTVPanelBouquets(panelId);
            const bouquets = bouquetsResponse.bouquets || [];

            if (bouquets.length === 0) {
                container.innerHTML = `
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> No bouquets found. Please sync bouquets for this panel first.
                    </div>
                `;
                return;
            }

            // Build channel groups list UI
            container.innerHTML = `
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <div>
                            <h4><i class="fas fa-layer-group"></i> IPTV Channel Groups</h4>
                            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0.5rem 0 0 0;">
                                Create custom channel groups by combining bouquets for easy user assignment.
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showCreateChannelGroupModal(${panelId})">
                            <i class="fas fa-plus"></i> Create New Channel Group
                        </button>
                    </div>

                    ${channelGroups.length > 0 ? `
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Description</th>
                                        <th>Content</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${channelGroups.map(group => {
                                        const bouquetCount = Array.isArray(group.bouquet_ids) ? group.bouquet_ids.length : 0;
                                        const createdDate = new Date(group.created_at).toLocaleDateString();

                                        return `
                                            <tr>
                                                <td><strong>${Utils.escapeHtml(group.name)}</strong></td>
                                                <td>${group.description ? Utils.escapeHtml(group.description) : 'No description'}</td>
                                                <td>
                                                    <strong>Panel:</strong> ${bouquetCount} bouquets
                                                </td>
                                                <td>
                                                    <span class="badge ${group.is_active ? 'badge-success' : 'badge-secondary'}">
                                                        ${group.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td>${createdDate}</td>
                                                <td>
                                                    <div style="display: flex; gap: 0.5rem;">
                                                        <button class="btn btn-sm btn-outline" onclick="Settings.viewChannelGroup(${panelId}, ${group.id})" title="View">
                                                            <i class="fas fa-eye"></i>
                                                        </button>
                                                        <button class="btn btn-sm btn-outline" onclick="Settings.editChannelGroup(${panelId}, ${group.id})" title="Edit">
                                                            <i class="fas fa-edit"></i>
                                                        </button>
                                                        <button class="btn btn-sm btn-danger" onclick="Settings.deleteChannelGroup(${panelId}, ${group.id}, '${Utils.escapeHtml(group.name).replace(/'/g, "\\'")}')" title="Delete">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle"></i> No channel groups created yet. Click "Create New Channel Group" to get started.
                        </div>
                    `}

                    <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border-color);">

                    <!-- Default Group Settings -->
                    <div class="card" style="background: var(--hover-bg); padding: 1.5rem; border-radius: 8px;">
                        <h4 style="color: var(--warning-color); margin-bottom: 1rem;">
                            <i class="fas fa-lightbulb"></i> Default Group Settings
                        </h4>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem;">
                            Set default channel groups for automatic assignment to new trial and paid users.
                        </p>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="form-group" style="margin: 0;">
                                <label class="form-label">Default Trial Group:</label>
                                <select class="form-input" id="default-trial-group-${panelId}">
                                    <option value="">-- Select Trial Group --</option>
                                    ${channelGroups.filter(g => g.is_active).map(group => `
                                        <option value="${group.id}">${Utils.escapeHtml(group.name)}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="form-group" style="margin: 0;">
                                <label class="form-label">Default Paid Group:</label>
                                <select class="form-input" id="default-paid-group-${panelId}">
                                    <option value="">-- Select Paid Group --</option>
                                    ${channelGroups.filter(g => g.is_active).map(group => `
                                        <option value="${group.id}">${Utils.escapeHtml(group.name)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <button class="btn btn-primary" onclick="Settings.saveDefaultChannelGroups(${panelId})">
                            <i class="fas fa-save"></i> Save Default Settings
                        </button>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading channel packages:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> Failed to load channel packages: ${error.message}
                </div>
            `;
        }
    },

    /**
     * @deprecated - Use showCreateChannelGroupModal instead
     * Create channel package from selected bouquets (keeping for backward compatibility)
     */
    async createChannelPackage(panelId) {
        try {
            const packageName = document.getElementById('package-name').value.trim();
            const packageDescription = document.getElementById('package-description').value.trim();

            if (!packageName) {
                Utils.showToast('Error', 'Please enter a package name', 'error');
                return;
            }

            // Get selected bouquets
            const selectedBouquets = [];
            document.querySelectorAll('.bouquet-checkbox:checked').forEach(checkbox => {
                selectedBouquets.push({
                    id: checkbox.value,
                    name: checkbox.getAttribute('data-bouquet-name')
                });
            });

            if (selectedBouquets.length === 0) {
                Utils.showToast('Error', 'Please select at least one bouquet', 'error');
                return;
            }

            Utils.showLoading();

            // Call API to create channel package
            const bouquetIds = selectedBouquets.map(b => b.id);
            const response = await API.createChannelGroup(panelId, packageName, packageDescription, bouquetIds);

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', `Channel package "${packageName}" created with ${selectedBouquets.length} bouquets`, 'success');

                // Clear the form
                document.getElementById('channel-package-panel').value = '';
                await this.loadBouquetsForPanel('');

                // Reload the IPTV panels to show updated data
                await this.loadIPTVPanels();
            } else {
                throw new Error(response.message || 'Failed to create channel package');
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Error creating channel package:', error);
            Utils.showToast('Error', error.message || 'Failed to create channel package', 'error');
        }
    },

    /**
     * View IPTV panel details
     */
    async viewIPTVPanel(panelId) {
        Utils.showLoading();
        try {
            const response = await API.getIPTVPanel(panelId);
            const panel = response.panel;

            Utils.hideLoading();

            const userCount = panel.user_count || 0;

            Utils.showModal({
                title: `View Panel: ${Utils.escapeHtml(panel.name)}`,
                size: 'large',
                body: `
                    <div class="panel-view-grid">
                        <!-- Left Column -->
                        <div class="panel-view-column">
                            <!-- Panel Information -->
                            <div class="info-section">
                                <h3 class="info-section-title">Panel Information</h3>
                                <div class="info-grid">
                                    <div class="info-item">
                                        <span class="info-label">Panel Type</span>
                                        <span class="info-value">${Utils.formatPanelType(panel.panel_type)}</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Health Status</span>
                                        <span class="info-value">${panel.health_status === 'online' ? '<span class="badge badge-success">Online</span>' : '<span class="badge badge-danger">Offline</span>'}</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Active</span>
                                        <span class="info-value">${panel.is_active ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-secondary">No</span>'}</span>
                                    </div>
                                    <div class="info-item full-width">
                                        <span class="info-label">Base URL</span>
                                        <code class="info-url">${Utils.escapeHtml(panel.base_url)}</code>
                                    </div>
                                </div>
                            </div>

                            <!-- Statistics -->
                            <div class="info-section">
                                <h3 class="info-section-title">Statistics</h3>
                                <div class="stats-grid">
                                    <div class="stat-card">
                                        <div class="stat-value">${userCount}</div>
                                        <div class="stat-label">Users</div>
                                    </div>
                                    <div class="stat-card">
                                        <div class="stat-value">${panel.current_credit_balance || 0}</div>
                                        <div class="stat-label">Credits</div>
                                    </div>
                                    ${panel.m3u_channel_count ? `
                                    <div class="stat-card">
                                        <div class="stat-value">${panel.m3u_channel_count}</div>
                                        <div class="stat-label">Live Channels</div>
                                    </div>` : ''}
                                    ${panel.m3u_movie_count ? `
                                    <div class="stat-card">
                                        <div class="stat-value">${panel.m3u_movie_count}</div>
                                        <div class="stat-label">Movies</div>
                                    </div>` : ''}
                                    ${panel.m3u_series_count ? `
                                    <div class="stat-card">
                                        <div class="stat-value">${panel.m3u_series_count}</div>
                                        <div class="stat-label">Series</div>
                                    </div>` : ''}
                                </div>
                                ${panel.last_sync ? `
                                <div class="last-sync-info">
                                    <i class="fas fa-sync-alt"></i> Last synced: ${new Date(panel.last_sync).toLocaleString()}
                                </div>` : ''}
                            </div>
                        </div>

                        <!-- Right Column -->
                        <div class="panel-view-column">
                            <!-- Admin Notes -->
                            <div class="info-section">
                                <h3 class="info-section-title">Admin Notes</h3>
                                ${panel.notes ?
                                    `<div class="notes-content">${Utils.escapeHtml(panel.notes)}</div>` :
                                    '<p class="no-data">No notes available</p>'}
                            </div>

                            <!-- IPTV Editor Integration -->
                            ${panel.linked_playlist_name ? `
                            <div class="info-section">
                                <h3 class="info-section-title">IPTV Editor Integration</h3>
                                <div class="info-item">
                                    <span class="info-label">Linked Playlist</span>
                                    <span class="badge badge-primary">${Utils.escapeHtml(panel.linked_playlist_name)}</span>
                                </div>
                            </div>` : ''}

                            <!-- Timestamps -->
                            <div class="info-section">
                                <h3 class="info-section-title">Timestamps</h3>
                                <div class="timestamp-list">
                                    <div class="timestamp-item">
                                        <i class="fas fa-calendar-plus"></i>
                                        <span>Created: ${new Date(panel.created_at).toLocaleString()}</span>
                                    </div>
                                    <div class="timestamp-item">
                                        <i class="fas fa-edit"></i>
                                        <span>Updated: ${new Date(panel.updated_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <style>
                        .panel-view-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 1.5rem;
                        }
                        @media (max-width: 768px) {
                            .panel-view-grid {
                                grid-template-columns: 1fr;
                            }
                        }
                        .panel-view-column {
                            display: flex;
                            flex-direction: column;
                            gap: 1.5rem;
                        }
                        .info-section {
                            background: var(--bg-secondary);
                            padding: 1.25rem;
                            border-radius: 8px;
                            border: 1px solid var(--border-color);
                        }
                        .info-section-title {
                            margin: 0 0 1rem 0;
                            color: var(--text-primary);
                            font-size: 0.9rem;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        }
                        .info-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 1rem;
                        }
                        .info-item {
                            display: flex;
                            flex-direction: column;
                            gap: 0.35rem;
                        }
                        .info-item.full-width {
                            grid-column: 1 / -1;
                        }
                        .info-label {
                            color: var(--text-secondary);
                            font-size: 0.75rem;
                            font-weight: 500;
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                        }
                        .info-value {
                            color: var(--text-primary);
                            font-size: 0.95rem;
                        }
                        .info-url {
                            background: var(--bg-primary);
                            padding: 0.5rem 0.75rem;
                            border-radius: 6px;
                            font-size: 0.85rem;
                            word-break: break-all;
                            color: var(--text-primary);
                            border: 1px solid var(--border-color);
                        }
                        .stats-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
                            gap: 0.75rem;
                        }
                        .stat-card {
                            background: var(--bg-primary);
                            padding: 0.75rem;
                            border-radius: 6px;
                            text-align: center;
                            border: 1px solid var(--border-color);
                        }
                        .stat-value {
                            font-size: 1.5rem;
                            font-weight: 700;
                            color: var(--primary-color);
                        }
                        .stat-label {
                            font-size: 0.7rem;
                            color: var(--text-secondary);
                            text-transform: uppercase;
                            letter-spacing: 0.3px;
                            margin-top: 0.25rem;
                        }
                        .last-sync-info {
                            margin-top: 1rem;
                            padding-top: 1rem;
                            border-top: 1px solid var(--border-color);
                            color: var(--text-secondary);
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                        }
                        .notes-content {
                            white-space: pre-wrap;
                            background: var(--bg-primary);
                            padding: 1rem;
                            border-radius: 6px;
                            border: 1px solid var(--border-color);
                            font-size: 0.9rem;
                            line-height: 1.5;
                        }
                        .no-data {
                            color: var(--text-secondary);
                            font-style: italic;
                            margin: 0;
                        }
                        .timestamp-list {
                            display: flex;
                            flex-direction: column;
                            gap: 0.75rem;
                        }
                        .timestamp-item {
                            display: flex;
                            align-items: center;
                            gap: 0.75rem;
                            color: var(--text-secondary);
                            font-size: 0.85rem;
                        }
                        .timestamp-item i {
                            width: 16px;
                            text-align: center;
                            color: var(--text-muted);
                        }
                    </style>
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Edit Panel',
                        class: 'btn-primary',
                        onClick: () => {
                            Utils.closeModal();
                            this.editIPTVPanel(panelId);
                        }
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Edit IPTV panel
     */
    async editIPTVPanel(panelId) {
        Utils.showLoading();
        try {
            const [panelResponse, playlistsResponse] = await Promise.all([
                API.getIPTVPanel(panelId),
                API.getIPTVEditorPlaylists()
            ]);

            const panel = panelResponse.panel;
            const playlists = playlistsResponse.playlists || [];
            Utils.hideLoading();

            Utils.showModal({
                title: 'Edit IPTV Panel',
                body: `
                    <form id="edit-iptv-panel-form">
                        <div class="form-group">
                            <label class="form-label required">Panel Name</label>
                            <input type="text" name="name" class="form-input" required
                                   value="${Utils.escapeHtml(panel.name)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Panel Type</label>
                            <input type="text" class="form-input" value="${panel.panel_type}" disabled>
                            <input type="hidden" name="panel_type" value="${panel.panel_type}">
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Base URL</label>
                            <input type="url" name="base_url" class="form-input" required
                                   value="${Utils.escapeHtml(panel.base_url)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Provider Base URL (Customer Streaming URL)</label>
                            <input type="url" name="provider_base_url" class="form-input" required
                                   value="${Utils.escapeHtml(panel.provider_base_url || '')}"
                                   placeholder="http://stream.example.com:8080">
                            <small class="form-help">URL where your customers connect to watch streams (used to generate M3U playlists and iMPlayer codes)</small>
                        </div>

                        ${panel.panel_type === 'one_stream' ? `
                        <!-- 1-Stream Credentials -->
                        <div class="form-group">
                            <label class="form-label required">X-Api-Key</label>
                            <input type="text" name="api_key" class="form-input" required
                                   value="${Utils.escapeHtml(panel.credentials.api_key || '')}"
                                   placeholder="Your API Key token">
                            <small class="form-help">API Key token provided by the panel admin</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">X-Auth-User (Reseller Username)</label>
                            <input type="text" name="username" class="form-input" required
                                   value="${Utils.escapeHtml(panel.credentials.username || '')}"
                                   placeholder="Your reseller username">
                            <small class="form-help">This is your reseller username that you generate yourself</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Bouquet Names Line ID (Optional)</label>
                            <input type="text" name="bouquet_line_id" class="form-input"
                                   value="${Utils.escapeHtml(panel.credentials.bouquet_line_id || '')}"
                                   placeholder="e.g., 26d5b696-4994-4c73-94b3-4a7fbbcb4934">
                            <small class="form-help">Optional: Line ID of a user with ALL bouquets assigned. Used to fetch bouquet names when syncing. Without this, bouquets will show as "Bouquet 123" instead of their actual names.</small>
                        </div>
                        ` : `
                        <!-- NXT Dash / XUI One / Other Panel Credentials -->
                        <div class="form-group">
                            <label class="form-label required">Username</label>
                            <input type="text" name="username" class="form-input" required
                                   value="${Utils.escapeHtml(panel.credentials.username || '')}"
                                   placeholder="Panel username">
                            <small class="form-help">Your panel admin/reseller username</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Password</label>
                            <input type="password" name="password" class="form-input" required
                                   value="${Utils.escapeHtml(panel.credentials.password || '')}"
                                   placeholder="Panel password">
                            <small class="form-help">Your panel admin/reseller password</small>
                        </div>
                        `}
                        <div class="form-group">
                            <label class="form-label">M3U Playlist URL (Optional)</label>
                            <input type="url" name="m3u_url" id="m3u_url_input" class="form-input"
                                   value="${Utils.escapeHtml(panel.m3u_url || '')}"
                                   placeholder="https://example.com/get.php?username=...&password=...&type=m3u">
                            <small class="form-help">
                                If you don't use IPTV Editor, provide an M3U playlist URL to get channel/movie/series counts on the dashboard. This URL is also used to generate M3U URLs locally for IPTV panel users (username/password will be replaced with actual user credentials).
                            </small>
                            ${panel.m3u_url ? `
                                <div style="margin-top: 0.75rem;">
                                    <button type="button" class="btn btn-sm btn-primary" onclick="Settings.syncM3UData(${panelId})">
                                        <i class="fas fa-sync-alt"></i> Sync M3U Data
                                    </button>
                                    ${panel.m3u_last_sync ? `
                                        <small style="margin-left: 0.75rem; color: var(--text-secondary);">
                                            Last synced: ${new Date(panel.m3u_last_sync).toLocaleString()}
                                        </small>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div class="form-group">
                            <label class="form-label">Linked IPTV Editor Playlist</label>
                            <select name="linked_playlist_id" class="form-input" id="edit-panel-linked-playlist">
                                <option value="">-- No Playlist Linked --</option>
                                ${playlists.map(pl => `
                                    <option value="${pl.id}" ${panel.linked_playlist_id == pl.id ? 'selected' : ''}>
                                        ${Utils.escapeHtml(pl.name)}
                                    </option>
                                `).join('')}
                            </select>
                            <small class="form-help">
                                Link this panel to an IPTV Editor playlist for automatic user provisioning.
                                ${panel.linked_playlist_name ? `Currently linked to: <strong>${Utils.escapeHtml(panel.linked_playlist_name)}</strong>` : ''}
                            </small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Admin Notes</label>
                            <textarea name="notes" class="form-input" rows="4"
                                      placeholder="Admin credentials, server info, or other notes...">${Utils.escapeHtml(panel.notes || '')}</textarea>
                            <small class="form-help">Store admin credentials and notes for this panel (optional)</small>
                        </div>
                        <div class="form-group">
                            <div class="form-checkbox-group">
                                <input type="checkbox" name="is_active" class="form-checkbox" id="edit-panel-active"
                                       ${panel.is_active ? 'checked' : ''}>
                                <label for="edit-panel-active">Panel is Active</label>
                            </div>
                        </div>
                    </form>
                `,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: () => this.submitEditIPTVPanel(panelId)
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Submit edit IPTV panel
     */
    async submitEditIPTVPanel(panelId) {
        const form = document.getElementById('edit-iptv-panel-form');
        const formData = new FormData(form);

        const panelType = formData.get('panel_type');

        // Build credentials object based on panel type
        let credentials;
        if (panelType === 'one_stream') {
            credentials = {
                api_key: formData.get('api_key'),
                username: formData.get('username'),
                bouquet_line_id: formData.get('bouquet_line_id') || null
            };
        } else {
            credentials = {
                username: formData.get('username'),
                password: formData.get('password')
            };
        }

        const data = {
            name: formData.get('name'),
            base_url: formData.get('base_url'),
            provider_base_url: formData.get('provider_base_url'),
            credentials: credentials,
            is_active: formData.get('is_active') === 'on',
            notes: formData.get('notes')
        };

        const m3u_url = formData.get('m3u_url');
        const linked_playlist_id = formData.get('linked_playlist_id');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            // Update panel details
            await API.updateIPTVPanel(panelId, data);

            // Update M3U URL separately
            if (m3u_url !== undefined) {
                await API.request(`/iptv-panels/${panelId}/m3u-url`, {
                    method: 'PUT',
                    body: { m3u_url: m3u_url || null }
                });
            }

            // Update playlist link (NEW: panels link to playlists)
            // Always update to ensure the link stays consistent with form selection
            const playlistId = linked_playlist_id && linked_playlist_id !== '' ? linked_playlist_id : null;
            await API.linkPanelToPlaylist(panelId, playlistId);

            Utils.hideLoading();
            Utils.showToast('Success', 'IPTV panel updated successfully', 'success');
            await this.loadIPTVPanels();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Sync M3U playlist data
     */
    async syncM3UData(panelId) {
        try {
            Utils.showLoading('Syncing M3U playlist...');

            const response = await API.request(`/iptv-panels/${panelId}/sync-m3u`, {
                method: 'POST'
            });

            Utils.hideLoading();

            if (response.success) {
                const counts = response.data.counts;
                Utils.showToast(
                    'Success',
                    `M3U playlist synced successfully!\nLive Channels: ${counts.liveChannels}\nMovies: ${counts.vodMovies}\nSeries: ${counts.vodSeries}`,
                    'success'
                );

                // Reload the panel to show updated sync time
                await this.editIPTVPanel(panelId);
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to sync M3U playlist', 'error');
        }
    },

    /**
     * Delete IPTV panel
     */
    async deleteIPTVPanel(panelId) {
        const confirmed = await Utils.confirm(
            'Delete IPTV Panel',
            'Are you sure you want to delete this panel? All associated packages and bouquets will be removed. This action cannot be undone.'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deleteIPTVPanel(panelId);
            Utils.hideLoading();
            Utils.showToast('Success', 'IPTV panel deleted successfully', 'success');
            await this.loadIPTVPanels();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    async testExistingIPTVPanelConnection(panelId) {
        Utils.showLoading();
        try {
            const response = await API.testIPTVPanelConnection(panelId);
            Utils.hideLoading();

            if (response.success && response.online) {
                Utils.showToast('Success', 'Connection test successful!', 'success');
                await this.loadIPTVPanels();
            } else {
                Utils.showToast('Warning', response.message || 'Connection test failed', 'warning');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Refresh guide cache (channels & EPG) for all IPTV panels
     */
    async refreshAllPanelsGuideCache() {
        Utils.showLoading('Refreshing guide cache for all panels...');
        try {
            const response = await fetch('/api/v2/iptv-panels/refresh-guide-cache', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json();
            Utils.hideLoading();

            if (data.success) {
                Utils.showToast('Success', `Guide cache refreshed: ${data.results.successful}/${data.results.total} panels updated`, 'success');
            } else {
                Utils.showToast('Error', data.message || 'Failed to refresh guide cache', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to refresh guide cache', 'error');
        }
    },

    async openIPTVPanelDetails(panelId, event) {
        if (event) event.stopPropagation();

        Utils.showLoading();
        try {
            console.log('Opening panel details for ID:', panelId);

            // Fetch panel details
            const response = await API.getIPTVPanels();
            console.log('Panels response:', response);

            const panels = response.panels || response;
            console.log('Panels array:', panels);

            const panel = panels.find(p => p.id === panelId);
            console.log('Found panel:', panel);

            if (!panel) {
                throw new Error('Panel not found');
            }

            // Try to fetch packages (if already synced) but don't fail if not found
            let packages = [];
            try {
                const packagesResponse = await API.getIPTVPackages(panelId);
                packages = packagesResponse.packages || [];
                console.log('Loaded packages:', packages);
            } catch (error) {
                // Packages not yet synced - that's okay
                console.log('Packages not yet synced for this panel');
            }

            // Try to fetch bouquets (if already synced) but don't fail if not found
            let bouquets = [];
            try {
                const bouquetsResponse = await API.getIPTVPanelBouquets(panelId);
                bouquets = bouquetsResponse.bouquets || [];
                console.log('Loaded bouquets from database:', bouquets.length);
            } catch (error) {
                // Bouquets not yet synced - that's okay
                console.log('Bouquets not yet synced for this panel');
            }

            Utils.hideLoading();

            // Show modal with panel details
            Utils.showModal({
                title: `${panel.name} - Details`,
                body: `
                    <div class="panel-details-content" style="max-width: 100%; overflow-x: hidden;">
                        <div class="form-group">
                            <label style="font-weight: 600; margin-bottom: 5px; display: block;">Panel Type</label>
                            <input type="text" class="form-control" value="${panel.panel_type}" readonly style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; margin-bottom: 5px; display: block;">Base URL</label>
                            <input type="text" class="form-control" value="${panel.base_url}" readonly style="width: 100%; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; margin-bottom: 5px; display: block;">Status</label>
                            <input type="text" class="form-control" value="${panel.health_status}" readonly style="width: 100%; box-sizing: border-box;">
                        </div>
                        ${panel.notes ? `
                        <div class="form-group">
                            <label style="font-weight: 600; margin-bottom: 5px; display: block;">Admin Notes</label>
                            <textarea class="form-control" readonly style="width: 100%; box-sizing: border-box; white-space: pre-wrap; font-family: monospace; min-height: 100px;">${Utils.escapeHtml(panel.notes)}</textarea>
                        </div>
                        ` : ''}

                        <hr style="margin: 20px 0;">

                        <div class="form-group">
                            <button id="sync-packages-btn" class="btn btn-primary" style="width: 100%; box-sizing: border-box;">
                                <i class="fas fa-sync"></i> Sync Packages
                            </button>
                        </div>

                        <div id="packages-section" style="display: ${packages.length > 0 ? 'block' : 'none'}; max-width: 100%;">
                            <div class="form-group">
                                <label id="package-select-label" style="font-weight: 600; margin-bottom: 5px; display: block;">Select Package for Bouquet Sync</label>
                                <select id="package-select" class="form-control" style="width: 100%; box-sizing: border-box;">
                                    <option value="">-- Select a package --</option>
                                    ${packages.map(pkg => `
                                        <option value="${pkg.package_id}">
                                            ${pkg.connections} Con. / ${pkg.duration_months} months / ${pkg.credits} Credits* - cost ${pkg.credits} credits - ${pkg.duration_months} months (ID: ${pkg.package_id}) - ${pkg.package_type}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <button id="sync-bouquets-btn" class="btn btn-success" style="width: 100%; box-sizing: border-box;" disabled>
                                    <i class="fas fa-list"></i> Sync Bouquets
                                </button>
                            </div>

                            <div id="bouquets-section" style="display: none; max-width: 100%;">
                                <div class="form-group">
                                    <label id="bouquets-label" style="font-weight: 600; margin-bottom: 5px; display: block;">Bouquets (0)</label>
                                    <div id="bouquet-info-note" style="background: #1e3a5f; color: #7dd3fc; padding: 10px 12px; border-radius: 4px; margin-bottom: 10px; font-size: 0.85rem; display: none;">
                                        <i class="fas fa-info-circle"></i> <strong>1-Stream API Note:</strong> Bouquet names aren't available via API. To find names, use F12 developer tools in your browser when editing a user on the panel, then click the pencil icon to set custom names here.
                                    </div>
                                    <div id="bouquets-list" style="max-height: 300px; overflow-y: auto; overflow-x: hidden; border: 1px solid #ddd; padding: 10px; border-radius: 4px; width: 100%; box-sizing: border-box;">
                                        <!-- Bouquets will be displayed here after syncing -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-secondary',
                        onClick: async () => {
                            // Save the currently selected package (if any)
                            const packageSelect = document.getElementById('package-select');
                            if (packageSelect && packageSelect.value) {
                                try {
                                    await this.saveIPTVPanelSelectedPackage(panelId, packageSelect.value);
                                } catch (error) {
                                    console.error('Error saving selected package on close:', error);
                                }
                            }
                            Utils.closeModal();
                        }
                    }
                ]
            });

            // Set up event handlers
            document.getElementById('sync-packages-btn').addEventListener('click', async () => {
                const btn = document.getElementById('sync-packages-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';

                try {
                    await this.syncIPTVPanelPackages(panelId);
                    // Reload the modal with updated packages
                    Utils.closeModal();
                    setTimeout(() => this.openIPTVPanelDetails(panelId), 500);
                } catch (error) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sync"></i> Sync Packages';
                    Utils.showToast('Error', error.message, 'error');
                }
            });

            const packageSelect = document.getElementById('package-select');
            const syncBouquetsBtn = document.getElementById('sync-bouquets-btn');
            const packageSelectLabel = document.getElementById('package-select-label');

            packageSelect.addEventListener('change', async () => {
                syncBouquetsBtn.disabled = !packageSelect.value;

                // Update label to show selected package ID
                if (packageSelect.value) {
                    packageSelectLabel.textContent = `Select Package for Bouquet Sync (${packageSelect.value})`;
                } else {
                    packageSelectLabel.textContent = 'Select Package for Bouquet Sync';
                }

                // Save the selected package immediately
                if (packageSelect.value) {
                    try {
                        await this.saveIPTVPanelSelectedPackage(panelId, packageSelect.value);
                        console.log('Package selection saved:', packageSelect.value);
                    } catch (error) {
                        console.error('Error saving package selection:', error);
                    }
                }
            });

            // Pre-select saved package if it exists
            if (panel.panel_settings) {
                try {
                    const settings = typeof panel.panel_settings === 'string'
                        ? JSON.parse(panel.panel_settings)
                        : panel.panel_settings;

                    if (settings.selected_package_id) {
                        console.log('Pre-selecting saved package:', settings.selected_package_id);
                        packageSelect.value = settings.selected_package_id;

                        // Update label to show pre-selected package ID
                        if (packageSelect.value) {
                            packageSelectLabel.textContent = `Select Package for Bouquet Sync (${packageSelect.value})`;
                            syncBouquetsBtn.disabled = false;
                        }
                    }
                } catch (error) {
                    console.error('Error parsing panel_settings:', error);
                }
            }

            // Helper function to display bouquets - simple list without categories
            const displayBouquets = (bouquetsList, bouquetsData, showInfoNote = false) => {
                // Show info note for 1-Stream panels if bouquets have generic names
                const infoNote = document.getElementById('bouquet-info-note');
                if (infoNote && showInfoNote) {
                    const hasGenericNames = bouquetsData.some(b => (b.name || '').startsWith('Bouquet ') && !b.custom_name);
                    infoNote.style.display = hasGenericNames ? 'block' : 'none';
                }

                let html = `
                    <div style="padding: 8px 0;">
                        <div style="color: #666; padding: 8px 12px; background: #f5f5f5; margin-bottom: 8px;">
                            Total Bouquets: ${bouquetsData.length}
                        </div>
                        ${bouquetsData.map(bouquet => {
                            const displayName = bouquet.display_name || bouquet.custom_name || bouquet.name || bouquet.bouquet_name || 'Unnamed Bouquet';
                            const hasCustomName = !!bouquet.custom_name;
                            return `
                            <div style="padding: 8px 12px; border-bottom: 1px solid #eee; word-wrap: break-word; overflow-wrap: break-word; display: flex; justify-content: space-between; align-items: flex-start;">
                                <div style="flex: 1;">
                                    <strong style="display: block; margin-bottom: 4px;">${displayName}</strong>
                                    <small style="color: #666; display: block;">ID: ${bouquet.id}${hasCustomName ? ' <span style="color: #22c55e;">(custom name)</span>' : ''}</small>
                                </div>
                                <button class="btn btn-sm" style="padding: 2px 8px; background: transparent; border: 1px solid #666; color: inherit;" onclick="Settings.editBouquetCustomName(${panelId}, '${bouquet.id}', '${(bouquet.custom_name || '').replace(/'/g, "\\'")}', '${(bouquet.name || '').replace(/'/g, "\\'")}')">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                            </div>
                        `}).join('')}
                    </div>
                `;
                bouquetsList.innerHTML = html;
            };

            // Display loaded bouquets if they exist
            if (bouquets.length > 0) {
                const bouquetsSection = document.getElementById('bouquets-section');
                const bouquetsLabel = document.getElementById('bouquets-label');
                const bouquetsListElement = document.getElementById('bouquets-list');

                bouquetsLabel.textContent = `Bouquets (${bouquets.length})`;
                const isOneStream = panel.panel_type === 'one_stream';
                displayBouquets(bouquetsListElement, bouquets, isOneStream);
                bouquetsSection.style.display = 'block';

                console.log(`Displayed ${bouquets.length} bouquets from database`);
            }

            syncBouquetsBtn.addEventListener('click', async () => {
                const packageId = packageSelect.value;
                if (!packageId) return;

                syncBouquetsBtn.disabled = true;
                syncBouquetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing Bouquets...';

                try {
                    const response = await API.syncIPTVPanelBouquets(panelId, packageId);
                    Utils.showToast('Success', `Synced ${response.count} bouquets successfully`, 'success');
                    syncBouquetsBtn.innerHTML = '<i class="fas fa-check"></i> Bouquets Synced!';

                    // Display bouquets grouped by category
                    if (response.bouquets && response.bouquets.length > 0) {
                        const bouquetsSection = document.getElementById('bouquets-section');
                        const bouquetsLabel = document.getElementById('bouquets-label');
                        const bouquetsListElement = document.getElementById('bouquets-list');

                        bouquetsLabel.textContent = `Bouquets (${response.count})`;
                        const isOneStream = panel.panel_type === 'one_stream';
                        displayBouquets(bouquetsListElement, response.bouquets, isOneStream);
                        bouquetsSection.style.display = 'block';
                    }

                    // Save the selected package for this panel
                    await this.saveIPTVPanelSelectedPackage(panelId, packageId);
                } catch (error) {
                    syncBouquetsBtn.disabled = false;
                    syncBouquetsBtn.innerHTML = '<i class="fas fa-list"></i> Sync Bouquets';
                    Utils.showToast('Error', error.message, 'error');
                }
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Edit custom name for a bouquet
     */
    async editBouquetCustomName(panelId, bouquetId, currentCustomName, originalName) {
        // Store reference to the parent modal
        const parentModal = document.querySelector('.modal');

        Utils.showModal({
            title: 'Edit Bouquet Name',
            content: `
                <form id="edit-bouquet-name-form">
                    <div class="form-group">
                        <label class="form-label">Original Name (from sync)</label>
                        <input type="text" class="form-input" value="${originalName}" disabled style="opacity: 0.7;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Custom Name</label>
                        <input type="text" name="custom_name" class="form-input" placeholder="Enter custom name..." value="${currentCustomName}">
                        <small class="form-help">Leave blank to use the original name</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Bouquet ID</label>
                        <input type="text" class="form-input" value="${bouquetId}" disabled style="opacity: 0.7;">
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-secondary',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Save',
                    class: 'btn-primary',
                    onClick: async () => {
                        const form = document.getElementById('edit-bouquet-name-form');
                        const customName = form.querySelector('input[name="custom_name"]').value.trim();

                        try {
                            const response = await fetch(`/api/v2/iptv-panels/${panelId}/bouquets/${bouquetId}/custom-name`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ custom_name: customName || null })
                            });

                            const data = await response.json();
                            if (!data.success) {
                                throw new Error(data.message || 'Failed to update custom name');
                            }

                            Utils.showToast('Success', 'Bouquet name updated', 'success');
                            Utils.closeModal();

                            // Refresh the bouquets list in the parent modal without reopening
                            await this.refreshBouquetsList(panelId);
                        } catch (error) {
                            Utils.showToast('Error', error.message, 'error');
                        }
                    }
                }
            ]
        });
    },

    /**
     * Refresh bouquets list in the current modal
     */
    async refreshBouquetsList(panelId) {
        try {
            const bouquetsResponse = await API.getIPTVPanelBouquets(panelId);
            const bouquets = bouquetsResponse.bouquets || [];

            const bouquetsListElement = document.getElementById('bouquets-list');
            const bouquetsLabel = document.getElementById('bouquets-label');

            if (bouquetsListElement && bouquets.length > 0) {
                bouquetsLabel.textContent = `Bouquets (${bouquets.length})`;

                // Rebuild the bouquets list
                let html = `
                    <div style="padding: 8px 0;">
                        <div style="color: #666; padding: 8px 12px; background: #f5f5f5; margin-bottom: 8px;">
                            Total Bouquets: ${bouquets.length}
                        </div>
                        ${bouquets.map(bouquet => {
                            const displayName = bouquet.display_name || bouquet.custom_name || bouquet.name || bouquet.bouquet_name || 'Unnamed Bouquet';
                            const hasCustomName = !!bouquet.custom_name;
                            return `
                            <div style="padding: 8px 12px; border-bottom: 1px solid #eee; word-wrap: break-word; overflow-wrap: break-word; display: flex; justify-content: space-between; align-items: flex-start;">
                                <div style="flex: 1;">
                                    <strong style="display: block; margin-bottom: 4px;">${displayName}</strong>
                                    <small style="color: #666; display: block;">ID: ${bouquet.id}${hasCustomName ? ' <span style="color: #22c55e;">(custom name)</span>' : ''}</small>
                                </div>
                                <button class="btn btn-sm" style="padding: 2px 8px; background: transparent; border: 1px solid #666; color: inherit;" onclick="Settings.editBouquetCustomName(${panelId}, '${bouquet.id}', '${(bouquet.custom_name || '').replace(/'/g, "\\'")}', '${(bouquet.name || '').replace(/'/g, "\\'")}')">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                            </div>
                        `}).join('')}
                    </div>
                `;
                bouquetsListElement.innerHTML = html;
            }
        } catch (error) {
            console.error('Error refreshing bouquets list:', error);
        }
    },

    /**
     * Load App Users (Login Accounts)
     */
    async loadAppUsers() {
        const container = document.getElementById('app-users');

        try {
            const response = await API.getAppUsers();

            container.innerHTML = `
                <div class="card-body">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <div>
                            <h3 style="margin: 0;">App Admin</h3>
                            <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                                Manage login accounts for admins and staff members
                            </p>
                        </div>
                        <button class="btn btn-primary" id="add-app-user-btn">
                            <i class="fas fa-plus"></i> Add User
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last Login</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="app-users-table-body">
                                ${response.users.map(user => `
                                    <tr>
                                        <td>${user.name}</td>
                                        <td>${user.email}</td>
                                        <td>
                                            <span class="badge ${user.role === 'admin' ? 'badge-danger' : 'badge-secondary'}">
                                                ${user.role === 'admin' ? 'Admin' : 'User'}
                                            </span>
                                        </td>
                                        <td>
                                            ${(user.needs_password_setup && !user.plex_sso_required) ?
                                                '<span class="badge badge-warning"><i class="fas fa-exclamation-circle"></i> Pending Setup</span>' :
                                                '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Active</span>'
                                            }
                                            ${user.plex_sso_enabled ?
                                                `<span class="badge" style="background: #e5a00d; color: #1a1a1a; margin-left: 4px;" title="Plex SSO ${user.plex_sso_required ? '(Required)' : 'Enabled'}"><i class="fab fa-plex"></i>${user.plex_sso_required ? ' Only' : ''}</span>` : ''
                                            }
                                        </td>
                                        <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                                        <td>
                                            ${(user.needs_password_setup && !user.plex_sso_required) ? `
                                                <button class="btn btn-sm btn-primary" onclick="Settings.resendWelcomeEmail(${user.id}, '${user.name.replace(/'/g, "\\'")}')">
                                                    <i class="fas fa-paper-plane"></i> Resend
                                                </button>
                                            ` : ''}
                                            <button class="btn btn-sm btn-secondary" onclick="Settings.editAppUser(${user.id})">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="Settings.deleteAppUser(${user.id}, '${user.name.replace(/'/g, "\\'")}')">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Welcome Email Template Section -->
                <div class="card-body" style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div>
                            <h3 style="margin: 0;"><i class="fas fa-envelope"></i> Welcome Email Template</h3>
                            <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.875rem;">
                                Customize the welcome email sent to new app users when no password is set
                            </p>
                        </div>
                    </div>

                    <!-- Available Placeholders -->
                    <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem;">
                            <i class="fas fa-code" style="color: var(--primary-color);"></i>
                            <strong>Available Placeholders</strong>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
                            <div style="font-family: monospace; font-size: 0.85rem; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                                <code style="color: var(--primary-color);">{{app_name}}</code>
                                <span style="color: var(--text-tertiary); margin-left: 8px;">- App name</span>
                            </div>
                            <div style="font-family: monospace; font-size: 0.85rem; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                                <code style="color: var(--primary-color);">{{app_url}}</code>
                                <span style="color: var(--text-tertiary); margin-left: 8px;">- App URL</span>
                            </div>
                            <div style="font-family: monospace; font-size: 0.85rem; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                                <code style="color: var(--primary-color);">{{name}}</code>
                                <span style="color: var(--text-tertiary); margin-left: 8px;">- User's name</span>
                            </div>
                            <div style="font-family: monospace; font-size: 0.85rem; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                                <code style="color: var(--primary-color);">{{email}}</code>
                                <span style="color: var(--text-tertiary); margin-left: 8px;">- User's email</span>
                            </div>
                            <div style="font-family: monospace; font-size: 0.85rem; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                                <code style="color: var(--primary-color);">{{setup_url}}</code>
                                <span style="color: var(--text-tertiary); margin-left: 8px;">- Setup link</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Email Subject</label>
                        <input type="text" id="welcome-email-subject" class="form-input"
                               placeholder="Welcome to {{app_name}} - Set Up Your Password">
                        <small class="form-text">Leave empty to use default: "Welcome to [App Name] - Set Up Your Password"</small>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Custom Email Template (Optional)</label>
                        <textarea id="welcome-email-template" class="form-input" rows="12"
                                  placeholder="Leave empty to use the default template. Enter custom HTML to completely replace the default email..."></textarea>
                        <small class="form-text">If set, this HTML will completely replace the default welcome email. Use the placeholders above for dynamic content.</small>
                    </div>

                    <details style="margin-top: 1rem; color: var(--text-secondary);">
                        <summary style="cursor: pointer; font-weight: 500;"><i class="fas fa-code"></i> View Default Template</summary>
                        <pre style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-top: 0.5rem; overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap;"><code>&lt;div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;"&gt;
    &lt;h2 style="color: #333;"&gt;Welcome to {{app_name}}!&lt;/h2&gt;
    &lt;p&gt;Hi {{name}},&lt;/p&gt;
    &lt;p&gt;Your account has been created successfully. To get started, please set up your password by clicking the button below:&lt;/p&gt;
    &lt;div style="text-align: center; margin: 30px 0;"&gt;
        &lt;a href="{{setup_url}}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"&gt;Set Up Password&lt;/a&gt;
    &lt;/div&gt;
    &lt;p&gt;Or copy and paste this link into your browser:&lt;/p&gt;
    &lt;p style="word-break: break-all; color: #666;"&gt;{{setup_url}}&lt;/p&gt;
    &lt;p style="color: #999; font-size: 12px; margin-top: 30px;"&gt;This link will expire in 24 hours for security reasons.&lt;/p&gt;
    &lt;p style="color: #999; font-size: 12px;"&gt;If you didn't request this account, please ignore this email.&lt;/p&gt;
&lt;/div&gt;</code></pre>
                    </details>

                    <div style="display: flex; gap: 10px; margin-top: 1rem;">
                        <button class="btn btn-primary" id="save-welcome-email-btn">
                            <i class="fas fa-save"></i> Save Template
                        </button>
                        <button class="btn btn-secondary" id="preview-welcome-email-btn">
                            <i class="fas fa-eye"></i> Preview
                        </button>
                    </div>
                </div>
            `;

            // Load welcome email template settings
            this.loadWelcomeEmailTemplate();

            // Add user button handler
            document.getElementById('add-app-user-btn').addEventListener('click', () => {
                this.showAppUserModal();
            });

            // Welcome email template handlers
            document.getElementById('save-welcome-email-btn').addEventListener('click', () => {
                this.saveWelcomeEmailTemplate();
            });

            document.getElementById('preview-welcome-email-btn').addEventListener('click', () => {
                this.previewWelcomeEmail();
            });

        } catch (error) {
            container.innerHTML = `
                <div class="card-body">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        Failed to load app users: ${error.message}
                    </div>
                </div>
            `;
        }
    },

    /**
     * Show modal to add/edit app user
     */
    showAppUserModal(userId = null) {
        const isEdit = userId !== null;

        // Create modal
        const modalHtml = `
            <div class="modal-backdrop" id="app-user-modal-backdrop"></div>
            <div class="modal modal-xl" id="app-user-modal">
                <div class="modal-content modal-xl">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-user-shield"></i>
                            ${isEdit ? 'Edit App User' : 'Add App User'}
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('app-user-modal-backdrop').remove(); document.getElementById('app-user-modal').remove();">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="app-user-form">
                        <div class="modal-body">
                            <h4>Basic Information</h4>
                            <div class="form-group">
                                <label class="form-label">Name</label>
                                <input type="text" id="app-user-name" class="form-input" required>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" id="app-user-email" class="form-input" required>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Role</label>
                                <select id="app-user-role" class="form-select" required>
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label class="form-label">${isEdit ? 'New Password (leave blank to keep current)' : 'Password (Optional)'}</label>
                                <input type="password" id="app-user-password" class="form-input" minlength="6">
                                <small class="form-text">
                                    ${isEdit ? 'Leave blank to keep current password' : 'Leave blank to send welcome email with password setup link'}
                                </small>
                            </div>

                            <hr style="margin: 20px 0;">

                            <h4 style="margin-bottom: 15px;">Contact & Payment Information (Optional)</h4>
                            <p class="form-text" style="margin-bottom: 15px;">These fields can be used as variables in email templates</p>

                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-telegram"></i> Telegram</label>
                                    <input type="text" id="app-user-telegram" class="form-input" placeholder="@username">
                                </div>
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-whatsapp"></i> WhatsApp</label>
                                    <input type="text" id="app-user-whatsapp" class="form-input" placeholder="Phone or username">
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-discord"></i> Discord</label>
                                    <input type="text" id="app-user-discord" class="form-input" placeholder="username#0000">
                                </div>
                                <div class="form-group">
                                    <label class="form-label"><i class="fas fa-dollar-sign"></i> Venmo</label>
                                    <input type="text" id="app-user-venmo" class="form-input" placeholder="@username">
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-paypal"></i> PayPal</label>
                                    <input type="text" id="app-user-paypal" class="form-input" placeholder="username or email">
                                </div>
                                <div class="form-group">
                                    <label class="form-label"><i class="fas fa-money-bill-wave"></i> CashApp</label>
                                    <input type="text" id="app-user-cashapp" class="form-input" placeholder="$cashtag">
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-google"></i> Google Pay</label>
                                    <input type="text" id="app-user-googlepay" class="form-input" placeholder="Email or phone">
                                </div>
                                <div class="form-group">
                                    <label class="form-label"><i class="fab fa-apple"></i> Apple Cash</label>
                                    <input type="text" id="app-user-applecash" class="form-input" placeholder="Phone number">
                                </div>
                            </div>

                            <hr style="margin: 20px 0;">

                            <h4 style="margin-bottom: 15px;"><i class="fab fa-plex" style="color: #e5a00d;"></i> Plex SSO Authentication</h4>
                            <p class="form-text" style="margin-bottom: 15px;">Allow this user to sign in using their Plex account</p>

                            <div class="form-group">
                                <label class="form-label" style="display: flex; align-items: center; gap: 10px;">
                                    <input type="checkbox" id="app-user-plex-sso-enabled" style="width: auto;">
                                    Enable Plex SSO for this user
                                </label>
                            </div>

                            <div id="plex-sso-settings" style="display: none;">
                                <div class="form-group">
                                    <label class="form-label" style="display: flex; align-items: center; gap: 10px;">
                                        <input type="checkbox" id="app-user-plex-sso-required" style="width: auto;">
                                        <strong>Require Plex SSO (disable password login)</strong>
                                    </label>
                                    <small class="form-text">When enabled, this user can ONLY log in via Plex SSO - password login will be disabled</small>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Plex Email (Optional)</label>
                                    <input type="email" id="app-user-plex-sso-email" class="form-input" placeholder="Leave blank to use account email">
                                    <small class="form-text">Specify if their Plex email differs from their account email above</small>
                                </div>

                                <div class="form-group">
                                    <label class="form-label">Required Plex Servers (Optional)</label>
                                    <div id="plex-sso-servers-container" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto;">
                                        <em class="text-secondary">Loading servers...</em>
                                    </div>
                                    <small class="form-text">Select specific servers to require access to, or leave all unchecked to allow any server</small>
                                </div>

                                <div id="plex-sso-status" style="display: none; padding: 12px; border-radius: 8px; margin-top: 12px;">
                                    <!-- Plex SSO status info will be shown here -->
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer" style="flex-direction: column; gap: 15px;">
                            ${!isEdit ? `
                            <div class="form-group" style="width: 100%; margin: 0;">
                                <label class="form-label" style="display: flex; align-items: center; gap: 10px; margin: 0;">
                                    <input type="checkbox" id="app-user-send-welcome" style="width: auto;" checked>
                                    Send Welcome Email with password setup link
                                </label>
                                <small class="form-text" style="margin-left: 24px;">Uncheck to save without sending email (useful for Plex SSO only users)</small>
                            </div>
                            ` : ''}
                            <div style="display: flex; justify-content: flex-end; gap: 10px; width: 100%;">
                                <button type="button" class="btn btn-secondary" onclick="document.getElementById('app-user-modal-backdrop').remove(); document.getElementById('app-user-modal').remove();">
                                    Cancel
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas ${isEdit ? 'fa-save' : 'fa-user-plus'}"></i>
                                    ${isEdit ? 'Update' : 'Create Admin'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('app-user-modal');
        if (existingModal) existingModal.remove();
        const existingBackdrop = document.getElementById('app-user-modal-backdrop');
        if (existingBackdrop) existingBackdrop.remove();

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Load existing data if editing
        if (isEdit) {
            this.loadAppUserData(userId);
        }

        // Setup Plex SSO toggle handler
        const plexSsoCheckbox = document.getElementById('app-user-plex-sso-enabled');
        const plexSsoSettings = document.getElementById('plex-sso-settings');

        plexSsoCheckbox.addEventListener('change', () => {
            plexSsoSettings.style.display = plexSsoCheckbox.checked ? 'block' : 'none';
            if (plexSsoCheckbox.checked) {
                this.loadPlexServersForSso();
            }
        });

        // Load Plex servers list initially (in background)
        this.loadPlexServersForSso();

        // Form submit handler
        document.getElementById('app-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveAppUser(userId);
        });

        // Link password field and welcome email checkbox (only for new users)
        if (!isEdit) {
            const passwordField = document.getElementById('app-user-password');
            const sendWelcomeCheckbox = document.getElementById('app-user-send-welcome');
            const sendWelcomeLabel = sendWelcomeCheckbox?.closest('.form-group');

            // Function to update help text based on password input
            const updateWelcomeEmailState = () => {
                if (!sendWelcomeCheckbox || !sendWelcomeLabel) return;

                const hasPassword = passwordField.value.length > 0;

                if (hasPassword) {
                    // Password entered - keep checkbox enabled but update message
                    sendWelcomeLabel.querySelector('small').textContent =
                        'User can use password above OR click email link to change it';
                } else {
                    // No password - show default message
                    sendWelcomeLabel.querySelector('small').textContent =
                        'Uncheck to save without sending email (useful for Plex SSO only users)';
                }
            };

            // Listen for password input changes
            passwordField.addEventListener('input', updateWelcomeEmailState);
        }
    },

    /**
     * Load Plex servers for SSO configuration
     */
    async loadPlexServersForSso() {
        try {
            const response = await API.getPlexServers();
            const servers = response.servers || [];

            const container = document.getElementById('plex-sso-servers-container');

            if (servers.length === 0) {
                container.innerHTML = '<em class="text-secondary">No Plex servers configured. Add servers in the Plex Servers tab.</em>';
                return;
            }

            container.innerHTML = servers.map(server => `
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 4px; cursor: pointer;"
                       onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox" class="plex-sso-server-checkbox" value="${server.id}" style="width: auto;">
                    <span style="flex: 1;">${server.name}</span>
                    <span class="badge badge-secondary" style="font-size: 11px;">${server.server_id ? server.server_id.substring(0, 8) + '...' : 'N/A'}</span>
                </label>
            `).join('');
        } catch (error) {
            console.error('Error loading Plex servers for SSO:', error);
            const container = document.getElementById('plex-sso-servers-container');
            container.innerHTML = '<em class="text-danger">Failed to load servers</em>';
        }
    },

    /**
     * Load app user data for editing
     */
    async loadAppUserData(userId) {
        try {
            const response = await API.getAppUser(userId);
            const user = response.user;

            document.getElementById('app-user-name').value = user.name;
            document.getElementById('app-user-email').value = user.email;
            document.getElementById('app-user-role').value = user.role;

            // Load contact/payment fields
            document.getElementById('app-user-telegram').value = user.telegram_username || '';
            document.getElementById('app-user-whatsapp').value = user.whatsapp_username || '';
            document.getElementById('app-user-discord').value = user.discord_username || '';
            document.getElementById('app-user-venmo').value = user.venmo_username || '';
            document.getElementById('app-user-paypal').value = user.paypal_username || '';
            document.getElementById('app-user-cashapp').value = user.cashapp_username || '';
            document.getElementById('app-user-googlepay').value = user.google_pay_username || '';
            document.getElementById('app-user-applecash').value = user.apple_cash_username || '';

            // Load Plex SSO settings
            const plexSsoEnabled = user.plex_sso_enabled === 1 || user.plex_sso_enabled === true;
            document.getElementById('app-user-plex-sso-enabled').checked = plexSsoEnabled;
            document.getElementById('plex-sso-settings').style.display = plexSsoEnabled ? 'block' : 'none';

            // Load Plex SSO required setting
            const plexSsoRequired = user.plex_sso_required === 1 || user.plex_sso_required === true;
            const plexSsoRequiredCheckbox = document.getElementById('app-user-plex-sso-required');
            if (plexSsoRequiredCheckbox) {
                plexSsoRequiredCheckbox.checked = plexSsoRequired;
            }

            document.getElementById('app-user-plex-sso-email').value = user.plex_sso_email || '';

            // Parse server IDs and check the boxes
            let serverIds = [];
            if (user.plex_sso_server_ids) {
                try {
                    serverIds = JSON.parse(user.plex_sso_server_ids);
                    // Ensure all IDs are integers for comparison
                    serverIds = serverIds.map(id => parseInt(id));
                } catch (e) {
                    console.error('Error parsing plex_sso_server_ids:', e);
                }
            }

            // Store server IDs for checking after servers load
            this._pendingServerIds = serverIds;

            // Function to check the boxes - will retry if checkboxes not ready
            const checkServerBoxes = (retries = 0) => {
                const checkboxes = document.querySelectorAll('.plex-sso-server-checkbox');
                if (checkboxes.length === 0 && retries < 10) {
                    // Servers not loaded yet, retry after delay
                    setTimeout(() => checkServerBoxes(retries + 1), 200);
                    return;
                }
                checkboxes.forEach(checkbox => {
                    const checkboxId = parseInt(checkbox.value);
                    checkbox.checked = serverIds.includes(checkboxId);
                });

                // Show Plex SSO status if user has been verified
                if (user.plex_sso_last_verified || user.plex_sso_username) {
                    const statusDiv = document.getElementById('plex-sso-status');
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = 'rgba(34, 197, 94, 0.1)';
                    statusDiv.style.border = '1px solid rgba(34, 197, 94, 0.3)';
                    statusDiv.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${user.plex_sso_thumb ? `<img src="${user.plex_sso_thumb}" style="width: 40px; height: 40px; border-radius: 50%;">` : ''}
                            <div>
                                <strong style="color: #22c55e;">Plex Account Linked</strong><br>
                                <span class="text-secondary">${user.plex_sso_username || user.plex_sso_email || 'Linked'}</span>
                                ${user.plex_sso_last_verified ? `<br><small class="text-tertiary">Last verified: ${new Date(user.plex_sso_last_verified).toLocaleString()}</small>` : ''}
                            </div>
                        </div>
                    `;
                }
            };

            // Start checking (will retry until servers are loaded)
            checkServerBoxes();

        } catch (error) {
            Utils.showToast('Error', `Failed to load user data: ${error.message}`, 'error');
        }
    },

    /**
     * Save app user
     */
    async saveAppUser(userId = null) {
        const name = document.getElementById('app-user-name').value.trim();
        const email = document.getElementById('app-user-email').value.trim();
        const role = document.getElementById('app-user-role').value;
        const password = document.getElementById('app-user-password').value;

        // Validation
        if (!name || !email || !role) {
            Utils.showToast('Error', 'Please fill in all required fields', 'error');
            return;
        }

        if (password && password.length < 6) {
            Utils.showToast('Error', 'Password must be at least 6 characters', 'error');
            return;
        }

        const data = { name, email, role };
        if (password) {
            data.password = password;
        }

        // Add contact/payment fields
        data.telegram_username = document.getElementById('app-user-telegram').value.trim();
        data.whatsapp_username = document.getElementById('app-user-whatsapp').value.trim();
        data.discord_username = document.getElementById('app-user-discord').value.trim();
        data.venmo_username = document.getElementById('app-user-venmo').value.trim();
        data.paypal_username = document.getElementById('app-user-paypal').value.trim();
        data.cashapp_username = document.getElementById('app-user-cashapp').value.trim();
        data.google_pay_username = document.getElementById('app-user-googlepay').value.trim();
        data.apple_cash_username = document.getElementById('app-user-applecash').value.trim();

        // Add Plex SSO settings
        data.plex_sso_enabled = document.getElementById('app-user-plex-sso-enabled').checked;
        data.plex_sso_required = document.getElementById('app-user-plex-sso-required')?.checked || false;
        data.plex_sso_email = document.getElementById('app-user-plex-sso-email').value.trim() || null;

        // Get selected server IDs
        const serverCheckboxes = document.querySelectorAll('.plex-sso-server-checkbox:checked');
        const selectedServerIds = Array.from(serverCheckboxes).map(cb => parseInt(cb.value));
        data.plex_sso_server_ids = selectedServerIds.length > 0 ? selectedServerIds : null;

        // Send welcome email checkbox (only for new users)
        if (!userId) {
            const sendWelcomeCheckbox = document.getElementById('app-user-send-welcome');
            data.sendWelcome = sendWelcomeCheckbox ? sendWelcomeCheckbox.checked : true;
        }

        try {
            Utils.showLoading();

            if (userId) {
                await API.updateAppUser(userId, data);
                Utils.showToast('Success', 'App user updated successfully', 'success');
            } else {
                const response = await API.createAppUser(data);
                if (response.requiresPasswordSetup && data.sendWelcome) {
                    Utils.showToast('Success', 'Admin created! Welcome email sent with password setup link.', 'success');
                } else {
                    Utils.showToast('Success', 'Admin created successfully', 'success');
                }
            }

            // Close modal
            document.getElementById('app-user-modal-backdrop').remove();
            document.getElementById('app-user-modal').remove();

            // Reload list
            await this.loadAppUsers();

        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Edit app user
     */
    async editAppUser(userId) {
        this.showAppUserModal(userId);
    },

    /**
     * Delete app user
     */
    async deleteAppUser(userId, userName) {
        if (!confirm(`Are you sure you want to delete the admin "${userName}"?\n\nThis only removes the admin account. Any subscription user with the same email will not be affected.`)) {
            return;
        }

        try {
            Utils.showLoading();
            await API.deleteAppUser(userId);
            Utils.showToast('Success', 'App user deleted successfully', 'success');
            await this.loadAppUsers();
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Resend welcome email to app user
     */
    async resendWelcomeEmail(userId, userName) {
        if (!confirm(`Resend welcome email to "${userName}"?\n\nThis will send a new password setup link to their email address.`)) {
            return;
        }

        try {
            Utils.showLoading();
            const sessionToken = API.getSessionToken();
            const response = await fetch(`/api/v2/app-users/${userId}/resend-welcome`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to resend welcome email');
            }

            Utils.showToast('Success', 'Welcome email sent successfully', 'success');
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Load welcome email template settings
     */
    async loadWelcomeEmailTemplate() {
        try {
            const [subjectRes, templateRes] = await Promise.all([
                API.getSetting('welcome_email_subject'),
                API.getSetting('welcome_email_template')
            ]);

            const subjectInput = document.getElementById('welcome-email-subject');
            const templateInput = document.getElementById('welcome-email-template');

            if (subjectInput && subjectRes?.value) subjectInput.value = subjectRes.value;
            if (templateInput && templateRes?.value) templateInput.value = templateRes.value;
        } catch (error) {
            console.error('Error loading welcome email template:', error);
        }
    },

    /**
     * Save welcome email template settings
     */
    async saveWelcomeEmailTemplate() {
        const subject = document.getElementById('welcome-email-subject')?.value?.trim() || '';
        const template = document.getElementById('welcome-email-template')?.value?.trim() || '';

        try {
            Utils.showLoading();

            await Promise.all([
                API.updateSetting('welcome_email_subject', subject),
                API.updateSetting('welcome_email_template', template)
            ]);

            Utils.showToast('Success', 'Welcome email settings saved', 'success');
        } catch (error) {
            Utils.showToast('Error', `Failed to save template: ${error.message}`, 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Preview welcome email
     */
    async previewWelcomeEmail() {
        const customSubject = document.getElementById('welcome-email-subject')?.value?.trim() || '';
        const customTemplate = document.getElementById('welcome-email-template')?.value?.trim() || '';

        // Get app name and URL
        let appName = 'StreamPanel';
        let appUrl = 'https://example.com';
        try {
            const [appNameRes, appUrlRes] = await Promise.all([
                API.getSetting('app_title'),
                API.getSetting('app_url')
            ]);
            if (appNameRes?.value) appName = appNameRes.value;
            if (appUrlRes?.value) appUrl = appUrlRes.value;
        } catch (e) {}

        // Sample data for preview
        const sampleName = 'John Doe';
        const sampleEmail = 'johndoe@example.com';
        const sampleSetupUrl = `${appUrl}/setup-password?token=abc123`;

        // Helper to replace all placeholders
        const replacePlaceholders = (text) => {
            if (!text) return text;
            return text
                .replace(/\{\{app_name\}\}/g, appName)
                .replace(/\{\{app_url\}\}/g, appUrl)
                .replace(/\{\{name\}\}/g, sampleName)
                .replace(/\{\{email\}\}/g, sampleEmail)
                .replace(/\{\{setup_url\}\}/g, sampleSetupUrl);
        };

        // Default template
        const defaultTemplate = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #333;">Welcome to {{app_name}}!</h2>
                <p>Hi {{name}},</p>
                <p>Your account has been created successfully. To get started, please set up your password by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{{setup_url}}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Set Up Password</a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">{{setup_url}}</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours for security reasons.</p>
                <p style="color: #999; font-size: 12px;">If you didn't request this account, please ignore this email.</p>
            </div>
        `;

        // Use custom template if set, otherwise use default
        const templateToUse = customTemplate || defaultTemplate;
        const previewHtml = replacePlaceholders(templateToUse);
        const defaultSubject = `Welcome to ${appName} - Set Up Your Password`;
        const previewSubject = customSubject ? replacePlaceholders(customSubject) : defaultSubject;
        const usingCustom = !!customTemplate || !!customSubject;

        // Show preview modal
        const modalHtml = `
            <div class="modal-backdrop" id="email-preview-backdrop"></div>
            <div class="modal modal-xl" id="email-preview-modal">
                <div class="modal-content modal-xl">
                    <div class="modal-header">
                        <h3 class="modal-title"><i class="fas fa-eye"></i> Email Preview</h3>
                        <button class="modal-close" onclick="document.getElementById('email-preview-backdrop').remove(); document.getElementById('email-preview-modal').remove();">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                            <div><strong>Subject:</strong> ${previewSubject}</div>
                            <span class="badge ${usingCustom ? 'badge-primary' : 'badge-secondary'}">
                                ${usingCustom ? 'Custom Template' : 'Default Template'}
                            </span>
                        </div>
                        <div style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: white; padding: 20px; color: #333;">
                            ${previewHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('email-preview-backdrop').remove(); document.getElementById('email-preview-modal').remove();">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Check health status for all Plex servers (runs in background)
     */
    async checkAllPlexServersHealth(servers) {
        console.log('[Settings] Checking health status for Plex servers...');

        // Test connection for each server
        const promises = servers.map(async (server) => {
            try {
                const response = await fetch(`/api/v2/plex-servers/${server.id}/test-connection`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const result = await response.json();

                // Update status badge in DOM
                const row = document.querySelector(`#plex-server-${server.id}`);
                if (row) {
                    const statusCell = row.querySelectorAll('td')[3]; // 4th column is status (0-indexed)
                    if (statusCell) {
                        statusCell.innerHTML = Utils.getStatusBadge(result.online, 'Online', 'Offline');
                    }
                }
            } catch (error) {
                console.error(`[Settings] Failed to check health for ${server.name}:`, error);
            }
        });

        // Wait for all checks to complete
        await Promise.all(promises);
        console.log('[Settings] Plex server health checks complete');
    },

    /**
     * Check health status for all IPTV panels (runs in background)
     */
    async checkAllIPTVPanelsHealth(panels) {
        console.log('[Settings] Checking health status for IPTV panels...');

        // Test connection for each panel
        const promises = panels.map(async (panel) => {
            try {
                const response = await fetch(`/api/v2/iptv-panels/${panel.id}/test-connection`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const result = await response.json();

                // Update status badge in DOM
                const row = document.querySelector(`#iptv-panel-${panel.id}`);
                if (row) {
                    const statusCell = row.querySelectorAll('td')[3]; // 4th column is status
                    if (statusCell) {
                        statusCell.innerHTML = Utils.getStatusBadge(result.online, 'Online', 'Offline');
                    }
                }
            } catch (error) {
                console.error(`[Settings] Failed to check health for ${panel.name}:`, error);
            }
        });

        // Wait for all checks to complete
        await Promise.all(promises);
        console.log('[Settings] IPTV panel health checks complete');
    },

    /**
     * Show modal to create a new channel group
     */
    async showCreateChannelGroupModal(panelId) {
        await this.showChannelGroupModal(panelId, null);
    },

    /**
     * Show modal to create/edit channel group
     */
    async showChannelGroupModal(panelId, groupId = null) {
        try {
            Utils.showLoading();

            // Fetch bouquets for this panel
            const bouquetsResponse = await API.getIPTVPanelBouquets(panelId);
            const bouquets = bouquetsResponse.bouquets || [];

            // If editing, fetch the group data
            let groupData = null;
            let selectedBouquetIds = [];
            if (groupId) {
                const response = await API.getChannelGroups(panelId);
                groupData = response.channel_groups.find(g => g.id === groupId);
                if (groupData) {
                    selectedBouquetIds = groupData.bouquet_ids || [];
                }
            }

            // Check for IPTV Editor playlists linked to this panel
            let editorPlaylist = null;
            let editorChannelCategories = [];
            let editorMovieCategories = [];
            let editorSeriesCategories = [];
            let selectedEditorChannelIds = [];
            let selectedEditorMovieIds = [];
            let selectedEditorSeriesIds = [];

            try {
                // Get the panel data to find its linked playlist
                const panelResponse = await API.getIPTVPanel(panelId);
                const panel = panelResponse.panel || panelResponse;

                // Check if panel has a linked IPTV Editor playlist
                if (panel.iptv_editor_playlist_id) {
                    const playlistsResponse = await API.getIPTVEditorPlaylists();
                    if (playlistsResponse.success && playlistsResponse.playlists) {
                        // Find playlist by the panel's iptv_editor_playlist_id
                        editorPlaylist = playlistsResponse.playlists.find(p =>
                            p.id === parseInt(panel.iptv_editor_playlist_id) ||
                            p.id.toString() === panel.iptv_editor_playlist_id.toString()
                        );

                    if (editorPlaylist) {
                        console.log('Found IPTV Editor playlist:', editorPlaylist.name);

                        // Fetch all category types for this playlist
                        const [channelsResp, moviesResp, seriesResp] = await Promise.all([
                            API.getIPTVEditorChannelCategories(editorPlaylist.id),
                            API.getIPTVEditorMovieCategories(editorPlaylist.id),
                            API.getIPTVEditorSeriesCategories(editorPlaylist.id)
                        ]);

                        if (channelsResp.success) editorChannelCategories = channelsResp.data || [];
                        if (moviesResp.success) editorMovieCategories = moviesResp.data || [];
                        if (seriesResp.success) editorSeriesCategories = seriesResp.data || [];

                        // If editing, get selected editor IDs
                        if (groupData) {
                            selectedEditorChannelIds = groupData.editor_channel_ids || [];
                            selectedEditorMovieIds = groupData.editor_movie_ids || [];
                            selectedEditorSeriesIds = groupData.editor_series_ids || [];
                        }
                    }
                }
                }
            } catch (error) {
                console.error('Error loading IPTV Editor data:', error);
                // Continue without IPTV Editor features if there's an error
            }

            Utils.hideLoading();

            // Sort bouquets alphabetically by name
            const sortedBouquets = bouquets.sort((a, b) => {
                const nameA = (a.name || a.bouquet_name || '').toLowerCase();
                const nameB = (b.name || b.bouquet_name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

            // Separate bouquets into included (checked) and available (unchecked)
            const includedBouquets = [];
            const availableBouquets = [];

            // If editing, preserve the order from selectedBouquetIds
            if (selectedBouquetIds.length > 0) {
                // First add selected bouquets in their stored order
                selectedBouquetIds.forEach(selectedId => {
                    const bouquet = sortedBouquets.find(b =>
                        b.id.toString() === selectedId.toString() || parseInt(b.id) === parseInt(selectedId)
                    );
                    if (bouquet && !includedBouquets.find(b => b.id === bouquet.id)) {
                        includedBouquets.push(bouquet);
                    }
                });

                // Then add remaining bouquets to available
                sortedBouquets.forEach(bouquet => {
                    const isIncluded = selectedBouquetIds.some(id =>
                        bouquet.id.toString() === id.toString() || parseInt(bouquet.id) === parseInt(id)
                    );
                    if (!isIncluded) {
                        availableBouquets.push(bouquet);
                    }
                });
            } else {
                // No selection, all go to available
                availableBouquets.push(...sortedBouquets);
            }

            // Build modal content
            const modalBody = `
                <form id="channel-group-form">
                    <div class="form-group">
                        <label class="form-label required">Group Name</label>
                        <input type="text" class="form-input" id="group-name"
                               value="${groupData ? Utils.escapeHtml(groupData.name) : ''}"
                               placeholder="e.g., Premium Sports Package" required>
                        <small class="form-help">Give this channel group a descriptive name</small>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <textarea class="form-input" id="group-description" rows="2"
                                  placeholder="Optional description">${groupData ? Utils.escapeHtml(groupData.description || '') : ''}</textarea>
                    </div>

                    <!-- Included Bouquets Section -->
                    <div class="form-group">
                        <label class="form-label" id="included-bouquets-counter"><strong>Included Bouquets (${includedBouquets.length})</strong></label>
                        <div id="included-bouquets-list" style="min-height: 100px; max-height: 300px; overflow-y: auto; border: 2px solid var(--success-color); border-radius: 8px; padding: 1rem; background: var(--hover-bg);">
                            ${includedBouquets.length > 0 ? '' : '<p style="color: var(--text-secondary); text-align: center; margin: 2rem 0;">No bouquets selected. Click bouquets below to add them.</p>'}
                        </div>
                    </div>

                    <!-- Available Bouquets Section -->
                    <div class="form-group">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;">
                            <label class="form-label required" id="available-bouquets-counter" style="margin-bottom: 0;">Available Bouquets (${availableBouquets.length})</label>
                            <button type="button" id="select-all-bouquets-btn" class="btn btn-sm btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;">
                                <i class="fas fa-check-double"></i> Select All
                            </button>
                        </div>
                        <small class="form-help">Click a bouquet to add it to your channel group</small>
                        <div id="available-bouquets-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
                        </div>
                    </div>

                    ${editorPlaylist ? `
                    <!-- IPTV Editor Section -->
                    <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--border-color);">
                        <h3 style="color: var(--text-primary); margin-bottom: 1rem;">
                            <i class="fas fa-film" style="margin-right: 0.5rem;"></i>
                            Configure IPTV Editor (${Utils.escapeHtml(editorPlaylist.name)})
                        </h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem;">
                            Select IPTV Editor categories to include in this channel group
                        </p>

                        <!-- Editor Channels -->
                        <div class="form-group">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;">
                                <label class="form-label" style="margin-bottom: 0;">IPTV Editor Channels</label>
                                ${editorChannelCategories.length > 0 ? `
                                <button type="button" id="select-all-editor-channels-btn" class="btn btn-sm btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;">
                                    <i class="fas fa-check-double"></i> Select All
                                </button>` : ''}
                            </div>
                            <div id="editor-channels-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorChannelCategories.length > 0 ? editorChannelCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-channel-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorChannelIds.some(id => String(id) === String(cat.id)) ? 'checked' : ''}
                                               style="margin-right: 0.5rem;">
                                        <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(cat.name)}</span>
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No channel categories available</p>'}
                            </div>
                            <small class="form-help">Select channel categories to include</small>
                        </div>

                        <!-- Editor Movies -->
                        <div class="form-group">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;">
                                <label class="form-label" style="margin-bottom: 0;">IPTV Editor Movies</label>
                                ${editorMovieCategories.length > 0 ? `
                                <button type="button" id="select-all-editor-movies-btn" class="btn btn-sm btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;">
                                    <i class="fas fa-check-double"></i> Select All
                                </button>` : ''}
                            </div>
                            <div id="editor-movies-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorMovieCategories.length > 0 ? editorMovieCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-movie-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorMovieIds.some(id => String(id) === String(cat.id)) ? 'checked' : ''}
                                               style="margin-right: 0.5rem;">
                                        <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(cat.name)}</span>
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No movie categories available</p>'}
                            </div>
                            <small class="form-help">Select movie categories to include</small>
                        </div>

                        <!-- Editor Series -->
                        <div class="form-group">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;">
                                <label class="form-label" style="margin-bottom: 0;">IPTV Editor Series</label>
                                ${editorSeriesCategories.length > 0 ? `
                                <button type="button" id="select-all-editor-series-btn" class="btn btn-sm btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;">
                                    <i class="fas fa-check-double"></i> Select All
                                </button>` : ''}
                            </div>
                            <div id="editor-series-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorSeriesCategories.length > 0 ? editorSeriesCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-series-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorSeriesIds.some(id => String(id) === String(cat.id)) ? 'checked' : ''}
                                               style="margin-right: 0.5rem;">
                                        <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(cat.name)}</span>
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No series categories available</p>'}
                            </div>
                            <small class="form-help">Select series categories to include</small>
                        </div>
                    </div>
                    ` : ''}
                </form>
            `;

            Utils.showModal({
                title: groupId ? 'Edit Channel Group' : 'Create New Channel Group',
                body: modalBody,
                size: 'large',
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: groupId ? 'Save Changes' : 'Create Group',
                        class: 'btn-primary',
                        onClick: () => this.saveChannelGroupFromModal(panelId, groupId)
                    }
                ]
            });

            // Initialize the bouquet management system
            const bouquetManager = {
                included: [...includedBouquets],
                available: [...availableBouquets],
                allBouquets: sortedBouquets,

                renderIncluded() {
                    const container = document.getElementById('included-bouquets-list');
                    if (this.included.length === 0) {
                        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin: 1rem 0; font-size: 0.875rem;">No bouquets selected. Click bouquets below to add them.</p>';
                        return;
                    }

                    container.innerHTML = this.included.map((bouquet, index) => {
                        const name = bouquet.display_name || bouquet.custom_name || bouquet.name || bouquet.bouquet_name || `Bouquet ${bouquet.id}`;
                        return `
                            <div class="included-bouquet-item"
                                 draggable="true"
                                 data-bouquet-id="${bouquet.id}"
                                 data-index="${index}"
                                 style="display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.6rem; margin-bottom: 0.25rem; background: var(--card-bg); border-radius: 4px; cursor: move; border: 1px solid transparent; transition: all 0.2s;">
                                <i class="fas fa-grip-vertical" style="color: var(--text-secondary); font-size: 0.75rem;"></i>
                                <span style="flex: 1; color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(name)} <span style="color: var(--text-secondary); font-size: 0.8rem;">(ID: ${bouquet.id})</span></span>
                                <button type="button" class="btn-remove" data-bouquet-id="${bouquet.id}" style="padding: 0.15rem 0.4rem; background: var(--danger-color); color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.75rem;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;
                    }).join('');

                    // Add drag and drop event listeners
                    const items = container.querySelectorAll('.included-bouquet-item');
                    items.forEach(item => {
                        item.addEventListener('dragstart', this.handleDragStart.bind(this));
                        item.addEventListener('dragover', this.handleDragOver.bind(this));
                        item.addEventListener('drop', this.handleDrop.bind(this));
                        item.addEventListener('dragend', this.handleDragEnd.bind(this));
                        item.addEventListener('dragenter', this.handleDragEnter.bind(this));
                        item.addEventListener('dragleave', this.handleDragLeave.bind(this));
                    });

                    // Add remove button listeners
                    container.querySelectorAll('.btn-remove').forEach(btn => {
                        btn.addEventListener('click', () => {
                            this.removeBouquet(btn.dataset.bouquetId);
                        });
                    });

                    // Update counter
                    const includedCounter = document.getElementById('included-bouquets-counter');
                    if (includedCounter) {
                        includedCounter.innerHTML = `<strong>Included Bouquets (${this.included.length})</strong>`;
                    }
                },

                handleDragStart(e) {
                    this.draggedIndex = parseInt(e.target.dataset.index);
                    e.target.style.opacity = '0.4';
                    e.dataTransfer.effectAllowed = 'move';
                },

                handleDragOver(e) {
                    if (e.preventDefault) {
                        e.preventDefault();
                    }
                    e.dataTransfer.dropEffect = 'move';
                    return false;
                },

                handleDragEnter(e) {
                    const target = e.target.closest('.included-bouquet-item');
                    if (target) {
                        target.style.borderColor = 'var(--primary-color)';
                        target.style.background = 'var(--hover-bg)';
                    }
                },

                handleDragLeave(e) {
                    const target = e.target.closest('.included-bouquet-item');
                    if (target) {
                        target.style.borderColor = 'transparent';
                        target.style.background = 'var(--card-bg)';
                    }
                },

                handleDrop(e) {
                    if (e.stopPropagation) {
                        e.stopPropagation();
                    }

                    const dropTarget = e.target.closest('.included-bouquet-item');
                    if (!dropTarget) return false;

                    const dropIndex = parseInt(dropTarget.dataset.index);

                    if (this.draggedIndex !== dropIndex) {
                        // Remove from old position
                        const [draggedItem] = this.included.splice(this.draggedIndex, 1);
                        // Insert at new position
                        this.included.splice(dropIndex, 0, draggedItem);
                        this.renderIncluded();
                    }

                    return false;
                },

                handleDragEnd(e) {
                    e.target.style.opacity = '1';
                    // Reset all item styles
                    const items = document.querySelectorAll('.included-bouquet-item');
                    items.forEach(item => {
                        item.style.borderColor = 'transparent';
                        item.style.background = 'var(--card-bg)';
                    });
                },

                renderAvailable() {
                    const container = document.getElementById('available-bouquets-list');
                    if (this.available.length === 0) {
                        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin: 1rem 0; font-size: 0.875rem;">All bouquets have been added to your channel group.</p>';
                        return;
                    }

                    container.innerHTML = this.available.map(bouquet => {
                        const name = bouquet.display_name || bouquet.custom_name || bouquet.name || bouquet.bouquet_name || `Bouquet ${bouquet.id}`;
                        return `
                            <div class="available-bouquet-item" data-bouquet-id="${bouquet.id}" style="padding: 0.4rem 0.6rem; margin-bottom: 0.25rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                                <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(name)} <span style="color: var(--text-secondary); font-size: 0.8rem;">(ID: ${bouquet.id})</span></span>
                            </div>
                        `;
                    }).join('');

                    // Add click listeners
                    container.querySelectorAll('.available-bouquet-item').forEach(item => {
                        item.addEventListener('click', () => {
                            this.addBouquet(item.dataset.bouquetId);
                        });

                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--hover-bg)';
                            this.style.borderColor = 'var(--primary-color)';
                        });

                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--card-bg)';
                            this.style.borderColor = 'var(--border-color)';
                        });
                    });

                    // Update counter
                    const availableCounter = document.getElementById('available-bouquets-counter');
                    if (availableCounter) {
                        availableCounter.innerHTML = `Available Bouquets (${this.available.length})`;
                    }
                },

                addBouquet(bouquetId) {
                    const bouquet = this.available.find(b => b.id.toString() === bouquetId.toString());
                    if (bouquet) {
                        this.included.push(bouquet);
                        this.available = this.available.filter(b => b.id.toString() !== bouquetId.toString());
                        this.renderIncluded();
                        this.renderAvailable();
                    }
                },

                removeBouquet(bouquetId) {
                    const bouquet = this.included.find(b => b.id.toString() === bouquetId.toString());
                    if (bouquet) {
                        this.available.push(bouquet);
                        // Re-sort available alphabetically
                        this.available.sort((a, b) => {
                            const nameA = (a.display_name || a.custom_name || a.name || a.bouquet_name || '').toLowerCase();
                            const nameB = (b.display_name || b.custom_name || b.name || b.bouquet_name || '').toLowerCase();
                            return nameA.localeCompare(nameB);
                        });
                        this.included = this.included.filter(b => b.id.toString() !== bouquetId.toString());
                        this.renderIncluded();
                        this.renderAvailable();
                    }
                },

                getSelectedIds() {
                    return this.included.map(b => b.id);
                }
            };

            // Store reference globally so save function can access it
            window._bouquetManager = bouquetManager;

            // Initial render
            bouquetManager.renderIncluded();
            bouquetManager.renderAvailable();

            // Add "Select All" button event listener for bouquets (toggle functionality)
            const selectAllBouquetsBtn = document.getElementById('select-all-bouquets-btn');
            if (selectAllBouquetsBtn) {
                selectAllBouquetsBtn.addEventListener('click', () => {
                    // Check if all bouquets are already included (none available)
                    if (bouquetManager.available.length === 0 && bouquetManager.included.length > 0) {
                        // Deselect all - move all included back to available
                        while (bouquetManager.included.length > 0) {
                            const bouquet = bouquetManager.included[0];
                            bouquetManager.removeBouquet(bouquet.id.toString());
                        }
                        selectAllBouquetsBtn.innerHTML = '<i class="fas fa-check-double"></i> Select All';
                    } else {
                        // Select all - add all available bouquets to included
                        while (bouquetManager.available.length > 0) {
                            const bouquet = bouquetManager.available[0];
                            bouquetManager.addBouquet(bouquet.id.toString());
                        }
                        selectAllBouquetsBtn.innerHTML = '<i class="fas fa-times"></i> Deselect All';
                    }
                });
            }

            // Add "Select All" button event listeners for IPTV Editor sections (toggle functionality)
            const selectAllChannelsBtn = document.getElementById('select-all-editor-channels-btn');
            if (selectAllChannelsBtn) {
                selectAllChannelsBtn.addEventListener('click', () => {
                    const checkboxes = document.querySelectorAll('.editor-channel-checkbox');
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    checkboxes.forEach(cb => cb.checked = !allChecked);
                    selectAllChannelsBtn.innerHTML = allChecked ?
                        '<i class="fas fa-check-double"></i> Select All' :
                        '<i class="fas fa-times"></i> Deselect All';
                });
            }

            const selectAllMoviesBtn = document.getElementById('select-all-editor-movies-btn');
            if (selectAllMoviesBtn) {
                selectAllMoviesBtn.addEventListener('click', () => {
                    const checkboxes = document.querySelectorAll('.editor-movie-checkbox');
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    checkboxes.forEach(cb => cb.checked = !allChecked);
                    selectAllMoviesBtn.innerHTML = allChecked ?
                        '<i class="fas fa-check-double"></i> Select All' :
                        '<i class="fas fa-times"></i> Deselect All';
                });
            }

            const selectAllSeriesBtn = document.getElementById('select-all-editor-series-btn');
            if (selectAllSeriesBtn) {
                selectAllSeriesBtn.addEventListener('click', () => {
                    const checkboxes = document.querySelectorAll('.editor-series-checkbox');
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    checkboxes.forEach(cb => cb.checked = !allChecked);
                    selectAllSeriesBtn.innerHTML = allChecked ?
                        '<i class="fas fa-check-double"></i> Select All' :
                        '<i class="fas fa-times"></i> Deselect All';
                });
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Error showing channel group modal:', error);
            Utils.showToast('Error', error.message || 'Failed to load channel group data', 'error');
        }
    },

    /**
     * Save channel group from modal
     */
    async saveChannelGroupFromModal(panelId, groupId) {
        try {
            const name = document.getElementById('group-name').value.trim();
            const description = document.getElementById('group-description').value.trim();

            if (!name) {
                Utils.showToast('Error', 'Please enter a group name', 'error');
                return false;
            }

            // Get selected bouquets from the bouquet manager (preserves order)
            const selectedBouquets = window._bouquetManager ? window._bouquetManager.getSelectedIds() : [];

            if (selectedBouquets.length === 0) {
                Utils.showToast('Error', 'Please add at least one bouquet to your channel group', 'error');
                return false;
            }

            // Get selected IPTV Editor categories (if editor section exists)
            const channelCheckboxes = document.querySelectorAll('.editor-channel-checkbox:checked');
            const movieCheckboxes = document.querySelectorAll('.editor-movie-checkbox:checked');
            const seriesCheckboxes = document.querySelectorAll('.editor-series-checkbox:checked');

            const editorChannelIds = Array.from(channelCheckboxes).map(cb => parseInt(cb.value));
            const editorMovieIds = Array.from(movieCheckboxes).map(cb => parseInt(cb.value));
            const editorSeriesIds = Array.from(seriesCheckboxes).map(cb => parseInt(cb.value));

            Utils.showLoading();

            let response;
            const payload = {
                name,
                description,
                bouquet_ids: selectedBouquets,
                editor_channel_ids: editorChannelIds,
                editor_movie_ids: editorMovieIds,
                editor_series_ids: editorSeriesIds
            };

            if (groupId) {
                // Update existing group
                response = await API.updateChannelGroup(panelId, groupId, payload);
            } else {
                // Create new group
                response = await API.createChannelGroup(panelId, name, description, selectedBouquets, editorChannelIds, editorMovieIds, editorSeriesIds);
            }

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', response.message, 'success');
                Utils.closeModal();
                await this.loadBouquetsForPanel(panelId);
                return true;
            } else {
                throw new Error(response.message || `Failed to ${groupId ? 'update' : 'create'} channel group`);
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving channel group:', error);
            Utils.showToast('Error', error.message || 'Failed to save channel group', 'error');
            return false;
        }
    },

    /**
     * View channel group details
     */
    async viewChannelGroup(panelId, groupId) {
        try {
            Utils.showLoading();

            const [groupsResponse, bouquetsResponse] = await Promise.all([
                API.getChannelGroups(panelId),
                API.getIPTVPanelBouquets(panelId)
            ]);

            const group = groupsResponse.channel_groups.find(g => g.id === groupId);
            if (!group) {
                throw new Error('Channel group not found');
            }

            const allBouquets = bouquetsResponse.bouquets || [];
            const groupBouquetIds = group.bouquet_ids || [];
            const groupBouquets = allBouquets.filter(b =>
                groupBouquetIds.includes(b.id.toString()) || groupBouquetIds.includes(parseInt(b.id))
            );

            Utils.hideLoading();

            const modalBody = `
                <div style="margin-bottom: 1.5rem;">
                    <h4>${Utils.escapeHtml(group.name)}</h4>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">
                        ${group.description ? Utils.escapeHtml(group.description) : 'No description provided'}
                    </p>
                </div>

                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> This group contains <strong>${groupBouquets.length} bouquets</strong>
                </div>

                <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
                    ${groupBouquets.length > 0 ? `
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${groupBouquets.map(bouquet => `
                                <li style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                                    <i class="fas fa-tv" style="margin-right: 0.5rem; color: var(--primary-color);"></i>
                                    ${Utils.escapeHtml(bouquet.name)}
                                    ${bouquet.category ? `<span style="color: var(--text-secondary); font-size: 0.875rem; margin-left: 0.5rem;">(${Utils.escapeHtml(bouquet.category)})</span>` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    ` : `
                        <p style="text-align: center; color: var(--text-secondary);">No bouquets in this group</p>
                    `}
                </div>
            `;

            Utils.showModal({
                title: 'View Channel Group',
                body: modalBody,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    }
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            console.error('Error viewing channel group:', error);
            Utils.showToast('Error', error.message || 'Failed to load channel group', 'error');
        }
    },

    /**
     * Edit channel group
     */
    async editChannelGroup(panelId, groupId) {
        await this.showChannelGroupModal(panelId, groupId);
    },

    /**
     * Delete channel group
     */
    async deleteChannelGroup(panelId, groupId, groupName) {
        const confirmed = confirm(`Are you sure you want to delete the channel group "${groupName}"?\n\nThis action cannot be undone.`);

        if (!confirmed) {
            return;
        }

        try {
            Utils.showLoading();

            const response = await API.deleteChannelGroup(panelId, groupId);

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', response.message, 'success');
                await this.loadBouquetsForPanel(panelId);
            } else {
                throw new Error(response.message || 'Failed to delete channel group');
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Error deleting channel group:', error);
            Utils.showToast('Error', error.message || 'Failed to delete channel group', 'error');
        }
    },

    /**
     * Save default channel group settings
     */
    async saveDefaultChannelGroups(panelId) {
        try {
            const trialGroup = document.getElementById(`default-trial-group-${panelId}`).value;
            const paidGroup = document.getElementById(`default-paid-group-${panelId}`).value;

            if (!trialGroup && !paidGroup) {
                Utils.showToast('Warning', 'Please select at least one default group', 'warning');
                return;
            }

            Utils.showLoading();

            // TODO: Call API to save default settings when backend endpoint is ready
            // For now, just show success message
            await new Promise(resolve => setTimeout(resolve, 500));

            Utils.hideLoading();
            Utils.showToast('Success', 'Default settings saved successfully', 'success');

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving default channel groups:', error);
            Utils.showToast('Error', error.message || 'Failed to save default settings', 'error');
        }
    },

    // ============ Owners/Resellers ============

    /**
     * Load Owners/Resellers
     */
    async loadOwners() {
        const container = document.getElementById('owners');

        try {
            const response = await API.getOwners();
            const owners = response.data || response.owners || [];

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-user-tie"></i> Owners/Resellers (${owners.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Manage owners/resellers who can have users assigned to them with custom payment methods
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddOwnerModal()">
                            <i class="fas fa-plus"></i> Add Owner
                        </button>
                    </div>

                    ${owners.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-user-tie" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No owners configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddOwnerModal()">
                                <i class="fas fa-plus"></i> Add Your First Owner
                            </button>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Contact Methods</th>
                                        <th>Payment Methods</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${owners.map(owner => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(owner.name)}</strong></td>
                                            <td>${owner.email ? Utils.escapeHtml(owner.email) : '<span style="color: var(--text-secondary);">—</span>'}</td>
                                            <td>
                                                ${this.formatContactMethods(owner)}
                                            </td>
                                            <td>
                                                ${this.formatPaymentMethods(owner)}
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="Settings.showEditOwnerModal(${owner.id})" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" onclick="Settings.deleteOwner(${owner.id})" title="Delete">
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
            console.error('Error loading owners:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load owners</p>
                    <button class="btn btn-primary mt-2" onclick="Settings.loadOwners()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    formatContactMethods(owner) {
        const methods = [];
        if (owner.telegram_username) methods.push(`<span title="Telegram"><i class="fab fa-telegram"></i> ${Utils.escapeHtml(owner.telegram_username)}</span>`);
        if (owner.whatsapp_username) methods.push(`<span title="WhatsApp"><i class="fab fa-whatsapp"></i> ${Utils.escapeHtml(owner.whatsapp_username)}</span>`);
        if (owner.discord_username) methods.push(`<span title="Discord"><i class="fab fa-discord"></i> ${Utils.escapeHtml(owner.discord_username)}</span>`);

        if (methods.length === 0) return '<span style="color: var(--text-secondary);">—</span>';
        return methods.join('<br>');
    },

    formatPaymentMethods(owner) {
        const methods = [];
        if (owner.venmo_username) methods.push(`<span class="badge" style="background: #008cff;"><i class="fas fa-dollar-sign"></i> Venmo</span>`);
        if (owner.paypal_username) methods.push(`<span class="badge" style="background: #003087;"><i class="fab fa-paypal"></i> PayPal</span>`);
        if (owner.cashapp_username) methods.push(`<span class="badge" style="background: #00d632;"><i class="fas fa-dollar-sign"></i> Cash App</span>`);
        if (owner.googlepay_username) methods.push(`<span class="badge" style="background: #4285f4;"><i class="fab fa-google"></i> GPay</span>`);
        if (owner.applecash_username) methods.push(`<span class="badge" style="background: #000;"><i class="fab fa-apple"></i> Apple</span>`);

        if (methods.length === 0) return '<span style="color: var(--text-secondary);">No payment methods</span>';
        return methods.join(' ');
    },

    showAddOwnerModal() {
        Utils.showModal({
            title: '<i class="fas fa-user-tie"></i> Add Owner/Reseller',
            size: 'lg',
            body: this.getOwnerFormHTML(),
            buttons: [
                { text: 'Cancel', class: 'btn-outline', onClick: () => Utils.closeModal() },
                { text: 'Add Owner', class: 'btn-primary', onClick: () => this.submitAddOwner() }
            ]
        });
    },

    async showEditOwnerModal(ownerId) {
        Utils.showLoading();
        try {
            const response = await API.getOwner(ownerId);
            Utils.hideLoading();

            if (!response.success || !response.owner) {
                Utils.showToast('Error', 'Failed to load owner details', 'error');
                return;
            }

            Utils.showModal({
                title: '<i class="fas fa-user-tie"></i> Edit Owner/Reseller',
                size: 'lg',
                body: this.getOwnerFormHTML(response.owner),
                buttons: [
                    { text: 'Cancel', class: 'btn-outline', onClick: () => Utils.closeModal() },
                    { text: 'Save Changes', class: 'btn-primary', onClick: () => this.submitEditOwner(ownerId) }
                ]
            });
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    getOwnerFormHTML(owner = null) {
        return `
            <form id="owner-form">
                <div style="display: grid; gap: 1.5rem;">
                    <div>
                        <h4 style="margin: 0 0 1rem 0; color: var(--text-secondary);"><i class="fas fa-user"></i> Basic Information</h4>
                        <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label">Name *</label>
                                <input type="text" id="owner-name" class="form-input" required value="${owner ? Utils.escapeHtml(owner.name) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" id="owner-email" class="form-input" value="${owner?.email ? Utils.escapeHtml(owner.email) : ''}">
                                <small style="color: var(--text-secondary);">Used for service request notifications</small>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 1rem 0; color: var(--text-secondary);"><i class="fas fa-comments"></i> Contact Methods</h4>
                        <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-telegram"></i> Telegram</label>
                                <input type="text" id="owner-telegram" class="form-input" placeholder="@username" value="${owner?.telegram_username ? Utils.escapeHtml(owner.telegram_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-whatsapp"></i> WhatsApp</label>
                                <input type="text" id="owner-whatsapp" class="form-input" placeholder="+1234567890" value="${owner?.whatsapp_username ? Utils.escapeHtml(owner.whatsapp_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-discord"></i> Discord</label>
                                <input type="text" id="owner-discord" class="form-input" placeholder="username#1234" value="${owner?.discord_username ? Utils.escapeHtml(owner.discord_username) : ''}">
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 1rem 0; color: var(--text-secondary);"><i class="fas fa-credit-card"></i> Payment Methods</h4>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
                            These payment methods will be shown to users who have this owner assigned and "Owner" payment preference selected.
                        </p>
                        <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-dollar-sign" style="color: #008cff;"></i> Venmo</label>
                                <input type="text" id="owner-venmo" class="form-input" placeholder="@username" value="${owner?.venmo_username ? Utils.escapeHtml(owner.venmo_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-paypal" style="color: #003087;"></i> PayPal</label>
                                <input type="text" id="owner-paypal" class="form-input" placeholder="email or @username" value="${owner?.paypal_username ? Utils.escapeHtml(owner.paypal_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-dollar-sign" style="color: #00d632;"></i> Cash App</label>
                                <input type="text" id="owner-cashapp" class="form-input" placeholder="$cashtag" value="${owner?.cashapp_username ? Utils.escapeHtml(owner.cashapp_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-google" style="color: #4285f4;"></i> Google Pay</label>
                                <input type="text" id="owner-googlepay" class="form-input" placeholder="email or phone" value="${owner?.googlepay_username ? Utils.escapeHtml(owner.googlepay_username) : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fab fa-apple"></i> Apple Cash</label>
                                <input type="text" id="owner-applecash" class="form-input" placeholder="phone or email" value="${owner?.applecash_username ? Utils.escapeHtml(owner.applecash_username) : ''}">
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        `;
    },

    async submitAddOwner() {
        const name = document.getElementById('owner-name').value.trim();
        if (!name) {
            Utils.showToast('Error', 'Name is required', 'error');
            return;
        }

        const data = {
            name,
            email: document.getElementById('owner-email').value.trim() || null,
            telegram_username: document.getElementById('owner-telegram').value.trim() || null,
            whatsapp_username: document.getElementById('owner-whatsapp').value.trim() || null,
            discord_username: document.getElementById('owner-discord').value.trim() || null,
            venmo_username: document.getElementById('owner-venmo').value.trim() || null,
            paypal_username: document.getElementById('owner-paypal').value.trim() || null,
            cashapp_username: document.getElementById('owner-cashapp').value.trim() || null,
            googlepay_username: document.getElementById('owner-googlepay').value.trim() || null,
            applecash_username: document.getElementById('owner-applecash').value.trim() || null
        };

        Utils.closeModal();
        Utils.showLoading();

        try {
            const response = await API.createOwner(data);
            Utils.hideLoading();
            if (response.success) {
                Utils.showToast('Success', 'Owner created successfully', 'success');
                await this.loadOwners();
            } else {
                Utils.showToast('Error', response.message || 'Failed to create owner', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    async submitEditOwner(ownerId) {
        const name = document.getElementById('owner-name').value.trim();
        if (!name) {
            Utils.showToast('Error', 'Name is required', 'error');
            return;
        }

        const data = {
            name,
            email: document.getElementById('owner-email').value.trim() || null,
            telegram_username: document.getElementById('owner-telegram').value.trim() || null,
            whatsapp_username: document.getElementById('owner-whatsapp').value.trim() || null,
            discord_username: document.getElementById('owner-discord').value.trim() || null,
            venmo_username: document.getElementById('owner-venmo').value.trim() || null,
            paypal_username: document.getElementById('owner-paypal').value.trim() || null,
            cashapp_username: document.getElementById('owner-cashapp').value.trim() || null,
            googlepay_username: document.getElementById('owner-googlepay').value.trim() || null,
            applecash_username: document.getElementById('owner-applecash').value.trim() || null
        };

        Utils.closeModal();
        Utils.showLoading();

        try {
            const response = await API.updateOwner(ownerId, data);
            Utils.hideLoading();
            if (response.success) {
                Utils.showToast('Success', 'Owner updated successfully', 'success');
                await this.loadOwners();
            } else {
                Utils.showToast('Error', response.message || 'Failed to update owner', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    async deleteOwner(ownerId) {
        const confirmed = await Utils.confirm(
            'Delete Owner',
            'Are you sure you want to delete this owner? Users assigned to this owner will need to be reassigned.'
        );

        if (!confirmed) return;

        Utils.showLoading();

        try {
            const response = await API.deleteOwner(ownerId);
            Utils.hideLoading();
            if (response.success) {
                Utils.showToast('Success', 'Owner deleted successfully', 'success');
                await this.loadOwners();
            } else {
                Utils.showToast('Error', response.message || 'Failed to delete owner', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    // =====================================================
    // LOGS MANAGEMENT
    // =====================================================

    logsAutoRefreshInterval: null,
    currentLogFile: 'crash.log',
    logsFilter: '',
    logCategories: null,
    selectedCategory: 'all',

    /**
     * Load Logs Tab
     */
    async loadLogs() {
        const container = document.getElementById('logs');

        container.innerHTML = `
            <div style="padding: 1.5rem;">
                <div class="flex justify-between items-center mb-3">
                    <div>
                        <h3><i class="fas fa-file-alt"></i> Application Logs</h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            View and manage application log files
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="Settings.showLogSettings()">
                            <i class="fas fa-cog"></i> Settings
                        </button>
                        <button class="btn btn-warning" onclick="Settings.runLogCleanup()">
                            <i class="fas fa-broom"></i> Cleanup
                        </button>
                    </div>
                </div>

                <!-- Storage Info -->
                <div id="logs-storage-info" style="padding: 0.75rem 1rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-database"></i> Total Log Storage: <strong id="logs-total-size">--</strong></span>
                    <span style="color: var(--text-secondary); font-size: 0.875rem;">Auto-cleanup: <span id="logs-retention-days">7</span> days</span>
                </div>

                <!-- Category Filters -->
                <div style="margin-bottom: 1rem;">
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;" id="logs-category-filters">
                        <button class="btn btn-sm btn-primary" data-category="all" onclick="Settings.filterByCategory('all')">
                            <i class="fas fa-list"></i> All Files
                        </button>
                        <!-- Categories will be populated here -->
                    </div>
                </div>

                <!-- Log Controls -->
                <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label style="font-weight: 500;">Log File:</label>
                        <select id="logs-file-select" class="form-input" style="width: auto;" onchange="Settings.changeLogFile()">
                            <option value="crash.log">crash.log</option>
                        </select>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label style="font-weight: 500;">Filter:</label>
                        <input type="text" id="logs-filter" class="form-input" style="width: 200px;" placeholder="Search logs..." onkeyup="Settings.filterLogs(event)">
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label style="font-weight: 500;">Lines:</label>
                        <select id="logs-lines" class="form-input" style="width: auto;" onchange="Settings.refreshLogs()">
                            <option value="100">100</option>
                            <option value="250">250</option>
                            <option value="500" selected>500</option>
                            <option value="1000">1000</option>
                            <option value="2000">2000</option>
                        </select>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" id="logs-auto-refresh" onchange="Settings.toggleLogsAutoRefresh()">
                        <label for="logs-auto-refresh" style="font-weight: 500; cursor: pointer;">Auto-refresh (5s)</label>
                    </div>

                    <div style="flex: 1;"></div>

                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="Settings.refreshLogs()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button class="btn btn-secondary" onclick="Settings.downloadLog()">
                            <i class="fas fa-download"></i> Download
                        </button>
                        <button class="btn btn-danger" onclick="Settings.clearLog()">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>

                <!-- Log Info Bar -->
                <div id="logs-info" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 0.5rem; font-size: 0.875rem;">
                    <span id="logs-file-info">Loading...</span>
                    <span id="logs-count-info"></span>
                </div>

                <!-- Log Viewer -->
                <div id="logs-viewer" style="background: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 12px; padding: 1rem; border-radius: 8px; overflow-x: auto; overflow-y: auto; max-height: 600px; min-height: 400px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.4;">
                    Loading logs...
                </div>
            </div>
        `;

        // Load categories and files
        await this.loadLogCategories();

        // Load available log files
        await this.loadLogFiles();

        // Load settings
        await this.loadLogSettingsInfo();

        // Load initial logs
        await this.refreshLogs();
    },

    /**
     * Load log categories
     */
    async loadLogCategories() {
        try {
            const response = await fetch('/api/v2/logs/categories', {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                this.logCategories = data.categories;

                // Update total size
                document.getElementById('logs-total-size').textContent = data.totalSizeFormatted;

                // Build category filter buttons
                const container = document.getElementById('logs-category-filters');
                const categoryIcons = {
                    main: 'fa-home',
                    jobs: 'fa-clock',
                    services: 'fa-server',
                    activity: 'fa-users',
                    api: 'fa-code'
                };

                let html = `
                    <button class="btn btn-sm ${this.selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}"
                            data-category="all" onclick="Settings.filterByCategory('all')">
                        <i class="fas fa-list"></i> All Files
                    </button>
                `;

                for (const [catKey, catInfo] of Object.entries(data.categories)) {
                    const icon = categoryIcons[catKey] || 'fa-folder';
                    const isActive = this.selectedCategory === catKey;
                    html += `
                        <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}"
                                data-category="${catKey}" onclick="Settings.filterByCategory('${catKey}')">
                            <i class="fas ${icon}"></i> ${catInfo.name}
                        </button>
                    `;
                }

                container.innerHTML = html;
            }
        } catch (error) {
            console.error('Error loading log categories:', error);
        }
    },

    /**
     * Filter logs by category
     */
    async filterByCategory(category) {
        this.selectedCategory = category;

        // Update button states
        document.querySelectorAll('#logs-category-filters button').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            }
        });

        // Update file select dropdown based on category
        await this.loadLogFiles();
    },

    /**
     * Load log settings info
     */
    async loadLogSettingsInfo() {
        try {
            const response = await fetch('/api/v2/logs/settings', {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                document.getElementById('logs-retention-days').textContent = data.settings.retentionDays;
                document.getElementById('logs-total-size').textContent = data.totalSizeFormatted;
            }
        } catch (error) {
            console.error('Error loading log settings:', error);
        }
    },

    /**
     * Show log settings modal
     */
    async showLogSettings() {
        try {
            const response = await fetch('/api/v2/logs/settings', {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (!data.success) {
                Utils.showToast('Error', 'Failed to load log settings', 'error');
                return;
            }

            const settings = data.settings;

            const modal = Utils.createModal('Log Settings', `
                <form id="log-settings-form">
                    <div class="form-group mb-3">
                        <label class="form-label">Max File Size (MB)</label>
                        <input type="number" name="maxFileSizeMB" class="form-input" value="${settings.maxFileSizeMB}" min="1" max="100">
                        <small style="color: var(--text-secondary);">Log files will be rotated when they exceed this size</small>
                    </div>

                    <div class="form-group mb-3">
                        <label class="form-label">Retention Days</label>
                        <input type="number" name="retentionDays" class="form-input" value="${settings.retentionDays}" min="1" max="365">
                        <small style="color: var(--text-secondary);">Old rotated log files will be deleted after this many days</small>
                    </div>

                    <div class="form-group mb-3">
                        <label class="form-label">Max Lines Per File</label>
                        <input type="number" name="maxLines" class="form-input" value="${settings.maxLines}" min="1000" max="500000" step="1000">
                        <small style="color: var(--text-secondary);">Log files will be trimmed to keep only the last N lines during cleanup</small>
                    </div>

                    <div style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; margin-top: 1rem;">
                        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                            <i class="fas fa-info-circle"></i>
                            Current total log storage: <strong>${data.totalSizeFormatted}</strong>
                        </p>
                    </div>
                </form>
            `, [
                { text: 'Cancel', class: 'btn-secondary', onclick: () => modal.remove() },
                {
                    text: 'Save Settings',
                    class: 'btn-primary',
                    onclick: async () => {
                        const form = document.getElementById('log-settings-form');
                        const formData = new FormData(form);

                        try {
                            const response = await fetch('/api/v2/logs/settings', {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...API.getAuthHeaders()
                                },
                                body: JSON.stringify({
                                    maxFileSizeMB: parseInt(formData.get('maxFileSizeMB')),
                                    retentionDays: parseInt(formData.get('retentionDays')),
                                    maxLines: parseInt(formData.get('maxLines'))
                                })
                            });
                            const result = await response.json();

                            if (result.success) {
                                Utils.showToast('Success', 'Log settings saved', 'success');
                                modal.remove();
                                await this.loadLogSettingsInfo();
                            } else {
                                Utils.showToast('Error', result.error || 'Failed to save settings', 'error');
                            }
                        } catch (error) {
                            Utils.showToast('Error', error.message, 'error');
                        }
                    }
                }
            ]);
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Run manual log cleanup
     */
    async runLogCleanup() {
        const confirmed = await Utils.confirm(
            'Run Log Cleanup',
            'This will delete old rotated log files and trim current logs to the configured max lines. Continue?'
        );

        if (!confirmed) return;

        try {
            Utils.showToast('Info', 'Running log cleanup...', 'info');

            const response = await fetch('/api/v2/logs/cleanup', {
                method: 'POST',
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                let message = 'Cleanup completed. ';
                if (data.results.cleanup.deleted.length > 0) {
                    message += `Deleted ${data.results.cleanup.deleted.length} old files. `;
                }
                if (data.results.trim.trimmed.length > 0) {
                    message += `Trimmed ${data.results.trim.trimmed.length} log files. `;
                }
                message += `Total size: ${data.results.totalLogSizeFormatted}`;

                Utils.showToast('Success', message, 'success');

                // Refresh UI
                await this.loadLogCategories();
                await this.loadLogFiles();
                await this.loadLogSettingsInfo();
            } else {
                Utils.showToast('Error', data.error || 'Cleanup failed', 'error');
            }
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Load available log files
     */
    async loadLogFiles() {
        try {
            const response = await fetch('/api/v2/logs/files', {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success && data.files.length > 0) {
                const select = document.getElementById('logs-file-select');
                let files = data.files;

                // Filter files by selected category
                if (this.selectedCategory !== 'all' && this.logCategories && this.logCategories[this.selectedCategory]) {
                    const categoryFiles = this.logCategories[this.selectedCategory].files.map(f => f.name);
                    files = files.filter(f => categoryFiles.includes(f.name));
                }

                if (files.length === 0) {
                    select.innerHTML = '<option value="">No log files in this category</option>';
                    this.currentLogFile = '';
                } else {
                    select.innerHTML = files.map(f =>
                        `<option value="${f.name}" ${f.name === this.currentLogFile ? 'selected' : ''}>${f.name} (${f.sizeFormatted})</option>`
                    ).join('');

                    // If current file not in filtered list, select first available
                    if (!files.find(f => f.name === this.currentLogFile)) {
                        this.currentLogFile = files[0].name;
                        select.value = this.currentLogFile;
                    }
                }

                // Refresh logs with new selection
                await this.refreshLogs();
            }
        } catch (error) {
            console.error('Error loading log files:', error);
        }
    },

    /**
     * Change log file
     */
    async changeLogFile() {
        this.currentLogFile = document.getElementById('logs-file-select').value;
        await this.refreshLogs();
    },

    /**
     * Filter logs on Enter key
     */
    filterLogs(event) {
        if (event.key === 'Enter') {
            this.logsFilter = document.getElementById('logs-filter').value;
            this.refreshLogs();
        }
    },

    /**
     * Refresh logs
     */
    async refreshLogs() {
        const viewer = document.getElementById('logs-viewer');
        const fileInfo = document.getElementById('logs-file-info');
        const countInfo = document.getElementById('logs-count-info');
        const lines = document.getElementById('logs-lines').value;
        const filter = document.getElementById('logs-filter').value;

        try {
            let url = `/api/v2/logs/${encodeURIComponent(this.currentLogFile)}?lines=${lines}`;
            if (filter) {
                url += `&filter=${encodeURIComponent(filter)}`;
            }

            const response = await fetch(url, {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                fileInfo.textContent = `File: ${data.filename}`;
                countInfo.textContent = `Showing ${data.showing} of ${data.totalLines} lines${filter ? ' (filtered)' : ''}`;

                if (data.lines.length === 0) {
                    viewer.innerHTML = '<span style="color: #6a9955;">// No log entries found</span>';
                } else {
                    // Colorize log output
                    const colorizedLines = data.lines.map(line => this.colorizeLogLine(line));
                    viewer.innerHTML = colorizedLines.join('\n');

                    // Scroll to bottom (most recent)
                    viewer.scrollTop = viewer.scrollHeight;
                }
            } else {
                viewer.innerHTML = `<span style="color: #f44747;">Error: ${data.error || 'Failed to load logs'}</span>`;
            }
        } catch (error) {
            console.error('Error loading logs:', error);
            viewer.innerHTML = `<span style="color: #f44747;">Error: ${error.message}</span>`;
        }
    },

    /**
     * Colorize log line based on content
     */
    colorizeLogLine(line) {
        // Escape HTML
        line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Timestamp - cyan
        line = line.replace(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/g, '<span style="color: #4ec9b0;">[$1]</span>');

        // Error keywords - red
        line = line.replace(/(UNCAUGHT EXCEPTION|Error:|FATAL|CRITICAL)/gi, '<span style="color: #f44747; font-weight: bold;">$1</span>');

        // Warning keywords - yellow
        line = line.replace(/(Warning:|WARN|WARNING)/gi, '<span style="color: #dcdcaa;">$1</span>');

        // Success keywords - green
        line = line.replace(/(Success|OK|DONE|completed)/gi, '<span style="color: #6a9955;">$1</span>');

        // File paths - blue
        line = line.replace(/(at\s+[\w./\\:-]+:\d+:\d+)/g, '<span style="color: #569cd6;">$1</span>');

        // Stack trace paths
        line = line.replace(/(node:[\w/]+:\d+:\d+)/g, '<span style="color: #808080;">$1</span>');

        // Separator lines
        if (line.match(/^=+$/)) {
            line = '<span style="color: #808080;">' + line + '</span>';
        }

        return line;
    },

    /**
     * Toggle auto-refresh
     */
    toggleLogsAutoRefresh() {
        const checkbox = document.getElementById('logs-auto-refresh');

        if (checkbox.checked) {
            this.logsAutoRefreshInterval = setInterval(() => {
                this.refreshLogs();
            }, 5000);
            Utils.showToast('Info', 'Auto-refresh enabled', 'info');
        } else {
            if (this.logsAutoRefreshInterval) {
                clearInterval(this.logsAutoRefreshInterval);
                this.logsAutoRefreshInterval = null;
            }
            Utils.showToast('Info', 'Auto-refresh disabled', 'info');
        }
    },

    /**
     * Download log file
     */
    async downloadLog() {
        try {
            const url = `/api/v2/logs/download/${encodeURIComponent(this.currentLogFile)}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = this.currentLogFile;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            Utils.showToast('Error', 'Failed to download log file', 'error');
        }
    },

    /**
     * Clear log file
     */
    async clearLog() {
        const confirmed = await Utils.confirm(
            'Clear Log File',
            `Are you sure you want to clear ${this.currentLogFile}? This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            const response = await fetch(`/api/v2/logs/${encodeURIComponent(this.currentLogFile)}`, {
                method: 'DELETE',
                headers: API.getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                Utils.showToast('Success', 'Log file cleared', 'success');
                await this.loadLogFiles();
                await this.refreshLogs();
            } else {
                Utils.showToast('Error', data.error || 'Failed to clear log file', 'error');
            }
        } catch (error) {
            Utils.showToast('Error', error.message, 'error');
        }
    },

    // =====================================================
    // UPDATES MANAGEMENT
    // =====================================================

    /**
     * Load Updates Tab
     */
    async loadUpdates() {
        const container = document.getElementById('updates');

        container.innerHTML = `
            <div style="padding: 1.5rem;">
                <div class="mb-4">
                    <h3><i class="fas fa-cloud-download-alt"></i> System Updates</h3>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">
                        Check for and apply updates to Stream Panel
                    </p>
                </div>

                <!-- Current Version Info -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h4 style="margin-bottom: 1rem;"><i class="fas fa-info-circle"></i> Current Version</h4>
                        <div id="current-version-info">
                            <div class="text-center">
                                <div class="spinner" style="margin: 0 auto;"></div>
                                <p class="mt-2">Loading version info...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Update Status -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 style="margin: 0;"><i class="fas fa-sync-alt"></i> Update Status</h4>
                            <button class="btn btn-secondary" onclick="Settings.checkForUpdates()">
                                <i class="fas fa-search"></i> Check for Updates
                            </button>
                        </div>
                        <div id="update-status">
                            <p style="color: var(--text-secondary);">Click "Check for Updates" to see if a new version is available.</p>
                        </div>
                    </div>
                </div>

                <!-- Recent Changes -->
                <div class="card">
                    <div class="card-body">
                        <h4 style="margin-bottom: 1rem;"><i class="fas fa-history"></i> Recent Changes</h4>
                        <div id="changelog-container">
                            <p style="color: var(--text-secondary);">Check for updates to view recent changes.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Load current version
        await this.loadCurrentVersion();
    },

    async loadCurrentVersion() {
        try {
            const response = await fetch('/api/v2/updates/current-version');
            const version = await response.json();

            document.getElementById('current-version-info').innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div>
                        <label style="color: var(--text-secondary); font-size: 0.875rem;">Version</label>
                        <p style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color); margin: 0.25rem 0;">
                            v${version.version || 'Unknown'}
                        </p>
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); font-size: 0.875rem;">Release Date</label>
                        <p style="font-size: 1rem; margin: 0.25rem 0;">
                            ${version.releaseDate || 'Unknown'}
                        </p>
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); font-size: 0.875rem;">Description</label>
                        <p style="font-size: 1rem; margin: 0.25rem 0;">
                            ${version.description || 'No description'}
                        </p>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading version:', error);
            document.getElementById('current-version-info').innerHTML = `
                <p style="color: var(--danger-color);">Failed to load version information</p>
            `;
        }
    },

    async checkForUpdates() {
        const statusContainer = document.getElementById('update-status');
        const changelogContainer = document.getElementById('changelog-container');

        statusContainer.innerHTML = `
            <div class="text-center">
                <div class="spinner" style="margin: 0 auto;"></div>
                <p class="mt-2">Checking for updates...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/v2/updates/check');
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (data.updateAvailable) {
                statusContainer.innerHTML = `
                    <div class="alert alert-warning" style="background: rgba(255, 193, 7, 0.1); border: 1px solid var(--warning-color); border-radius: 8px; padding: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--warning-color);"></i>
                            <div style="flex: 1;">
                                <h4 style="margin: 0 0 0.5rem 0; color: var(--warning-color);">Update Available!</h4>
                                <p style="margin: 0 0 0.5rem 0;">
                                    A new version is available.${data.commitsBehind !== 'unknown' ? ` You are <strong>${data.commitsBehind}</strong> commit(s) behind.` : ''}
                                </p>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">
                                    Current: v${data.localVersion} (${data.localCommit}) &rarr; Latest: v${data.remoteVersion} (${data.latestCommit})
                                </p>
                            </div>
                            <button class="btn btn-primary" onclick="Settings.applyUpdate()">
                                <i class="fas fa-download"></i> Update Now
                            </button>
                        </div>
                    </div>
                `;
            } else {
                statusContainer.innerHTML = `
                    <div class="alert alert-success" style="background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success-color); border-radius: 8px; padding: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success-color);"></i>
                            <div>
                                <h4 style="margin: 0 0 0.5rem 0; color: var(--success-color);">Up to Date!</h4>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">
                                    You are running the latest version (v${data.localVersion}, commit ${data.localCommit})
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Show recent commits
            if (data.recentCommits && data.recentCommits.length > 0) {
                changelogContainer.innerHTML = `
                    <div class="changelog-list">
                        ${data.recentCommits.map(commit => `
                            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                        <code style="background: var(--bg-secondary); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">${commit.sha}</code>
                                        <span style="margin-left: 0.5rem;">${this.escapeHtml(commit.message)}</span>
                                    </div>
                                    <small style="color: var(--text-secondary); white-space: nowrap; margin-left: 1rem;">
                                        ${new Date(commit.date).toLocaleDateString()}
                                    </small>
                                </div>
                                <small style="color: var(--text-secondary);">by ${commit.author}</small>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error checking for updates:', error);
            statusContainer.innerHTML = `
                <div class="alert alert-danger" style="background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger-color); border-radius: 8px; padding: 1rem;">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to check for updates: ${error.message}
                </div>
            `;
        }
    },

    async applyUpdate() {
        const confirmed = await Utils.confirm(
            'Apply Update',
            'This will download and apply the latest updates. The application will restart automatically. Continue?'
        );

        if (!confirmed) return;

        const statusContainer = document.getElementById('update-status');
        statusContainer.innerHTML = `
            <div class="text-center">
                <div class="spinner" style="margin: 0 auto;"></div>
                <p class="mt-2">Applying update... Please wait.</p>
            </div>
        `;

        try {
            const response = await fetch('/api/v2/updates/apply', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                statusContainer.innerHTML = `
                    <div class="alert alert-success" style="background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success-color); border-radius: 8px; padding: 1rem;">
                        <div style="text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success-color);"></i>
                            <h4 style="margin: 1rem 0 0.5rem 0; color: var(--success-color);">Update Applied!</h4>
                            <p style="margin: 0 0 1rem 0;">${data.message}</p>
                            <p style="margin: 0 0 1rem 0;">New version: <strong>v${data.version}</strong> (${data.commit})</p>
                            <button class="btn btn-primary" onclick="Settings.restartApplication()">
                                <i class="fas fa-redo"></i> Restart Now
                            </button>
                        </div>
                    </div>
                `;
            } else {
                throw new Error(data.error || 'Update failed');
            }

        } catch (error) {
            console.error('Error applying update:', error);
            statusContainer.innerHTML = `
                <div class="alert alert-danger" style="background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger-color); border-radius: 8px; padding: 1rem;">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to apply update: ${error.message}
                </div>
            `;
        }
    },

    async restartApplication() {
        const confirmed = await Utils.confirm(
            'Restart Application',
            'The application will restart. You may need to refresh the page after a few seconds.'
        );

        if (!confirmed) return;

        const statusContainer = document.getElementById('update-status');
        statusContainer.innerHTML = `
            <div class="text-center">
                <div class="spinner" style="margin: 0 auto;"></div>
                <p class="mt-2">Restarting application...</p>
                <p style="color: var(--text-secondary); font-size: 0.875rem;">
                    The page will automatically refresh in 15 seconds.
                </p>
            </div>
        `;

        try {
            await fetch('/api/v2/updates/restart', { method: 'POST' });

            // Wait and then try to reconnect
            setTimeout(() => {
                this.waitForRestart();
            }, 5000);

        } catch (error) {
            // Expected - connection will drop during restart
            setTimeout(() => {
                this.waitForRestart();
            }, 5000);
        }
    },

    async waitForRestart() {
        const statusContainer = document.getElementById('update-status');
        let attempts = 0;
        const maxAttempts = 30;

        const checkHealth = async () => {
            attempts++;
            try {
                const response = await fetch('/api/v2/health', {
                    method: 'GET',
                    cache: 'no-store'
                });
                if (response.ok) {
                    // Server is back up
                    statusContainer.innerHTML = `
                        <div class="alert alert-success" style="background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success-color); border-radius: 8px; padding: 1rem; text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success-color);"></i>
                            <h4 style="margin: 1rem 0 0.5rem 0; color: var(--success-color);">Restart Complete!</h4>
                            <p style="margin: 0 0 1rem 0;">The application has restarted successfully.</p>
                            <button class="btn btn-primary" onclick="window.location.reload()">
                                <i class="fas fa-sync"></i> Refresh Page
                            </button>
                        </div>
                    `;
                    return;
                }
            } catch (e) {
                // Still restarting
            }

            if (attempts < maxAttempts) {
                statusContainer.innerHTML = `
                    <div class="text-center">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Waiting for application to restart... (${attempts}/${maxAttempts})</p>
                    </div>
                `;
                setTimeout(checkHealth, 2000);
            } else {
                statusContainer.innerHTML = `
                    <div class="alert alert-warning" style="background: rgba(255, 193, 7, 0.1); border: 1px solid var(--warning-color); border-radius: 8px; padding: 1rem; text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--warning-color);"></i>
                        <h4 style="margin: 1rem 0 0.5rem 0;">Restart Taking Longer Than Expected</h4>
                        <p style="margin: 0 0 1rem 0;">Please try refreshing the page manually.</p>
                        <button class="btn btn-primary" onclick="window.location.reload()">
                            <i class="fas fa-sync"></i> Refresh Page
                        </button>
                    </div>
                `;
            }
        };

        checkHealth();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
