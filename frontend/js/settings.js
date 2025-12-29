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
                    <button class="tab" data-tab="media-managers">
                        <i class="fas fa-tools"></i> Media Managers
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
                        <i class="fas fa-user-shield"></i> App Users
                    </button>
                </div>

                <!-- Tab Contents -->
                <div id="plex-servers" class="tab-content active">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading...</p>
                    </div>
                </div>

                <div id="media-managers" class="tab-content">
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
            case 'media-managers':
                await this.loadMediaManagers();
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
            sync_schedule: formData.get('sync_schedule')
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

    // ============ Media Managers ============

    mediaManagers: [],
    managerIcons: {
        sonarr: { icon: 'fa-tv', color: '#3b82f6' },
        radarr: { icon: 'fa-film', color: '#f59e0b' },
        qbittorrent: { icon: 'fa-magnet', color: '#a855f7' },
        sabnzbd: { icon: 'fa-download', color: '#f97316' },
        other_arr: { icon: 'fa-cube', color: '#10b981' },
        other: { icon: 'fa-cog', color: '#6b7280' }
    },

    /**
     * Load Media Managers
     */
    async loadMediaManagers() {
        const container = document.getElementById('media-managers');

        try {
            const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');
            const response = await fetch('/api/v2/media-managers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            this.mediaManagers = data.managers || [];

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <h3><i class="fas fa-tools"></i> Media Managers (${this.mediaManagers.length})</h3>
                            <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                Configure Sonarr, Radarr, qBittorrent, SABnzbd, and other tools for quick access
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Settings.showAddMediaManagerModal()">
                            <i class="fas fa-plus"></i> Add Tool
                        </button>
                    </div>

                    ${this.mediaManagers.length === 0 ? `
                        <div class="text-center mt-4 mb-4">
                            <i class="fas fa-tools" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                            <p class="mt-2" style="color: var(--text-secondary);">No media managers configured</p>
                            <button class="btn btn-primary mt-2" onclick="Settings.showAddMediaManagerModal()">
                                <i class="fas fa-plus"></i> Add Your First Tool
                            </button>
                        </div>
                    ` : `
                        <div class="data-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tool</th>
                                        <th>Type</th>
                                        <th>URL</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.mediaManagers.map(m => this.renderMediaManagerRow(m)).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;

            // Check statuses
            this.mediaManagers.forEach(m => this.checkMediaManagerStatus(m.id));
        } catch (error) {
            console.error('Failed to load media managers:', error);
            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="text-center mt-4 mb-4" style="color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                        <p class="mt-2">Failed to load media managers</p>
                    </div>
                </div>
            `;
        }
    },

    renderMediaManagerRow(manager) {
        const iconInfo = this.managerIcons[manager.type] || { icon: 'fa-server', color: '#6b7280' };
        const hasImage = !!manager.effective_icon;

        return `
            <tr data-manager-id="${manager.id}">
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; ${hasImage ? 'background: transparent;' : `background: linear-gradient(135deg, ${iconInfo.color} 0%, ${this.adjustColor(iconInfo.color, -20)} 100%);`}">
                            ${hasImage ?
                                `<img src="${Utils.escapeHtml(manager.effective_icon)}" style="width: 32px; height: 32px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'; this.parentElement.style.background='linear-gradient(135deg, ${iconInfo.color} 0%, ${this.adjustColor(iconInfo.color, -20)} 100%)';">
                                 <i class="fas ${iconInfo.icon}" style="display: none; color: white; font-size: 16px;"></i>` :
                                `<i class="fas ${iconInfo.icon}" style="color: white; font-size: 16px;"></i>`
                            }
                        </div>
                        <div>
                            <strong>${Utils.escapeHtml(manager.name)}</strong>
                            ${!manager.is_enabled ? '<span class="badge" style="background: var(--danger); color: white; font-size: 10px; margin-left: 8px;">Disabled</span>' : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge" style="background: rgba(99, 102, 241, 0.2); color: #818cf8;">${manager.type}</span>
                    <span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #94a3b8; margin-left: 4px;">${manager.connection_mode}</span>
                </td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${Utils.escapeHtml(manager.url)}">${Utils.escapeHtml(manager.url)}</td>
                <td id="mm-status-${manager.id}">
                    <span style="color: var(--text-secondary);"><i class="fas fa-circle" style="font-size: 8px;"></i> Checking...</span>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm" onclick="Settings.openMediaManager(${manager.id})" title="Open">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="btn btn-sm" onclick="Settings.showCredentials(${manager.id})" title="Credentials">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn btn-sm" onclick="Settings.editMediaManager(${manager.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="Settings.deleteMediaManager(${manager.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    adjustColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
        return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
    },

    async checkMediaManagerStatus(managerId) {
        const statusEl = document.getElementById(`mm-status-${managerId}`);
        if (!statusEl) return;

        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');
        try {
            const response = await fetch(`/api/v2/media-managers/${managerId}/test`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success) {
                statusEl.innerHTML = `<span style="color: var(--success);"><i class="fas fa-circle" style="font-size: 8px;"></i> ${result.version || 'Online'}</span>`;
            } else {
                statusEl.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-circle" style="font-size: 8px;"></i> Offline</span>`;
            }
        } catch (error) {
            statusEl.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-circle" style="font-size: 8px;"></i> Error</span>`;
        }
    },

    openMediaManager(managerId) {
        const manager = this.mediaManagers.find(m => m.id === managerId);
        if (!manager) return;

        // Open tool-login.html for auto-login
        window.open(`/admin/tool-login.html?id=${managerId}`, '_blank');
    },

    async showCredentials(managerId) {
        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');

        try {
            const response = await fetch(`/api/v2/media-managers/${managerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const manager = data.manager;

            const showApiKey = ['sonarr', 'radarr', 'sabnzbd', 'other_arr'].includes(manager.type) && manager.api_key;
            const showUsername = !!manager.username;
            const showPassword = !!manager.password;

            if (!showApiKey && !showUsername && !showPassword) {
                Utils.showToast('Info', 'No credentials configured for this tool', 'info');
                return;
            }

            let content = '<div style="display: flex; flex-direction: column; gap: 16px;">';

            if (showApiKey) {
                content += `
                    <div>
                        <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">API Key</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="password" id="cred-apikey" value="${Utils.escapeHtml(manager.api_key)}" readonly class="form-control" style="flex: 1; font-family: monospace;">
                            <button class="btn btn-sm" onclick="Settings.toggleCredVisibility('cred-apikey', this)"><i class="fas fa-eye"></i></button>
                            <button class="btn btn-sm btn-primary" onclick="Settings.copyCredValue('cred-apikey')"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                `;
            }

            if (showUsername) {
                content += `
                    <div>
                        <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Username</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="text" id="cred-username" value="${Utils.escapeHtml(manager.username)}" readonly class="form-control" style="flex: 1; font-family: monospace;">
                            <button class="btn btn-sm btn-primary" onclick="Settings.copyCredValue('cred-username')"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                `;
            }

            if (showPassword) {
                content += `
                    <div>
                        <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Password</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="password" id="cred-password" value="${Utils.escapeHtml(manager.password)}" readonly class="form-control" style="flex: 1; font-family: monospace;">
                            <button class="btn btn-sm" onclick="Settings.toggleCredVisibility('cred-password', this)"><i class="fas fa-eye"></i></button>
                            <button class="btn btn-sm btn-primary" onclick="Settings.copyCredValue('cred-password')"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>
                `;
            }

            content += '</div>';

            Utils.showModal(`Credentials - ${manager.name}`, content, [
                { text: 'Close', class: 'btn btn-secondary', onclick: 'Utils.hideModal()' }
            ]);
        } catch (error) {
            Utils.showToast('Error', 'Failed to load credentials', 'error');
        }
    },

    toggleCredVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;

        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    },

    copyCredValue(inputId) {
        const input = document.getElementById(inputId);
        if (!input || !input.value) return;

        navigator.clipboard.writeText(input.value).then(() => {
            Utils.showToast('Success', 'Copied to clipboard', 'success');
        }).catch(() => {
            Utils.showToast('Error', 'Failed to copy', 'error');
        });
    },

    showAddMediaManagerModal() {
        const modalHtml = `
            <form id="media-manager-form" onsubmit="Settings.saveMediaManager(event)">
                <input type="hidden" id="mm-id">
                <div class="form-group">
                    <label for="mm-type">Type <span class="required">*</span></label>
                    <select id="mm-type" class="form-control" required onchange="Settings.onManagerTypeChange()">
                        <option value="">Select type...</option>
                        <option value="sonarr">Sonarr (TV Shows)</option>
                        <option value="radarr">Radarr (Movies)</option>
                        <option value="qbittorrent">qBittorrent</option>
                        <option value="sabnzbd">SABnzbd</option>
                        <option value="other_arr">Other *Arr (Prowlarr, Lidarr, etc.)</option>
                        <option value="other">Other Tool</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="mm-name">Name <span class="required">*</span></label>
                    <input type="text" id="mm-name" class="form-control" placeholder="e.g., My Sonarr" required>
                </div>
                <div class="form-group">
                    <label for="mm-url">URL <span class="required">*</span></label>
                    <input type="url" id="mm-url" class="form-control" placeholder="http://192.168.1.100:8989" required>
                </div>
                <div id="mm-apikey-group" class="form-group">
                    <label for="mm-apikey">API Key</label>
                    <input type="password" id="mm-apikey" class="form-control" placeholder="Enter API key">
                </div>
                <div id="mm-creds-group" class="form-group" style="display: none;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label for="mm-username">Username</label>
                            <input type="text" id="mm-username" class="form-control" placeholder="Username">
                        </div>
                        <div>
                            <label for="mm-password">Password</label>
                            <input type="password" id="mm-password" class="form-control" placeholder="Password">
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="mm-icon">Custom Icon URL</label>
                    <input type="url" id="mm-icon" class="form-control" placeholder="https://example.com/icon.png (optional)">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="mm-enabled" checked>
                        <span>Enabled</span>
                    </label>
                </div>
            </form>
        `;

        Utils.showModal('Add Media Manager', modalHtml, [
            { text: 'Test Connection', class: 'btn btn-secondary', onclick: 'Settings.testMediaManagerConnection()' },
            { text: 'Cancel', class: 'btn btn-secondary', onclick: 'Utils.hideModal()' },
            { text: 'Save', class: 'btn btn-primary', onclick: 'Settings.saveMediaManager(event)' }
        ]);

        this.onManagerTypeChange();
    },

    onManagerTypeChange() {
        const type = document.getElementById('mm-type')?.value;
        const apikeyGroup = document.getElementById('mm-apikey-group');
        const credsGroup = document.getElementById('mm-creds-group');

        if (!apikeyGroup || !credsGroup) return;

        // qBittorrent uses username/password only
        // SABnzbd uses API key + optional username/password
        // Sonarr/Radarr/other_arr use API key + username/password for web login
        // Other uses username/password only

        if (type === 'qbittorrent' || type === 'other') {
            apikeyGroup.style.display = 'none';
            credsGroup.style.display = 'block';
        } else if (type === 'sabnzbd' || type === 'sonarr' || type === 'radarr' || type === 'other_arr') {
            apikeyGroup.style.display = 'block';
            credsGroup.style.display = 'block';
        } else {
            apikeyGroup.style.display = 'block';
            credsGroup.style.display = 'none';
        }
    },

    async editMediaManager(managerId) {
        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');

        try {
            const response = await fetch(`/api/v2/media-managers/${managerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const manager = data.manager;

            this.showAddMediaManagerModal();

            // Populate form
            document.getElementById('mm-id').value = manager.id;
            document.getElementById('mm-type').value = manager.type;
            document.getElementById('mm-name').value = manager.name;
            document.getElementById('mm-url').value = manager.url;
            document.getElementById('mm-apikey').value = manager.api_key || '';
            document.getElementById('mm-username').value = manager.username || '';
            document.getElementById('mm-password').value = manager.password || '';
            document.getElementById('mm-icon').value = manager.icon_url || '';
            document.getElementById('mm-enabled').checked = manager.is_enabled;

            this.onManagerTypeChange();

            // Update modal title
            document.querySelector('.modal-header h3').textContent = 'Edit Media Manager';
        } catch (error) {
            Utils.showToast('Error', 'Failed to load tool details', 'error');
        }
    },

    async saveMediaManager(event) {
        if (event) event.preventDefault();

        const id = document.getElementById('mm-id')?.value;
        const type = document.getElementById('mm-type').value;
        const name = document.getElementById('mm-name').value;
        const url = document.getElementById('mm-url').value;
        const apiKey = document.getElementById('mm-apikey')?.value;
        const username = document.getElementById('mm-username')?.value;
        const password = document.getElementById('mm-password')?.value;
        const iconUrl = document.getElementById('mm-icon')?.value;
        const enabled = document.getElementById('mm-enabled')?.checked;

        if (!type || !name || !url) {
            Utils.showToast('Error', 'Please fill in required fields', 'error');
            return;
        }

        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');

        try {
            Utils.showLoading('Saving...');
            const method = id ? 'PUT' : 'POST';
            const endpoint = id ? `/api/v2/media-managers/${id}` : '/api/v2/media-managers';

            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    name,
                    url,
                    api_key: apiKey || null,
                    username: username || null,
                    password: password || null,
                    icon_url: iconUrl || null,
                    is_enabled: enabled,
                    connection_mode: 'proxy'
                })
            });

            Utils.hideLoading();

            if (response.ok) {
                Utils.hideModal();
                Utils.showToast('Success', `Tool ${id ? 'updated' : 'added'} successfully`, 'success');
                await this.loadMediaManagers();
            } else {
                const error = await response.json();
                Utils.showToast('Error', error.error || 'Failed to save tool', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', 'Failed to save tool', 'error');
        }
    },

    async deleteMediaManager(managerId) {
        if (!confirm('Are you sure you want to delete this tool?')) return;

        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');

        try {
            Utils.showLoading('Deleting...');
            const response = await fetch(`/api/v2/media-managers/${managerId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            Utils.hideLoading();

            if (response.ok) {
                Utils.showToast('Success', 'Tool deleted successfully', 'success');
                await this.loadMediaManagers();
            } else {
                Utils.showToast('Error', 'Failed to delete tool', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', 'Failed to delete tool', 'error');
        }
    },

    async testMediaManagerConnection() {
        const type = document.getElementById('mm-type').value;
        const url = document.getElementById('mm-url').value;
        const apiKey = document.getElementById('mm-apikey')?.value;
        const username = document.getElementById('mm-username')?.value;
        const password = document.getElementById('mm-password')?.value;

        if (!type || !url) {
            Utils.showToast('Error', 'Please fill in type and URL', 'error');
            return;
        }

        const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');

        try {
            Utils.showLoading('Testing connection...');
            const response = await fetch('/api/v2/media-managers/test-connection', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type, url, api_key: apiKey, username, password })
            });

            Utils.hideLoading();
            const result = await response.json();

            if (result.success) {
                Utils.showToast('Success', result.message || 'Connection successful!', 'success');
            } else {
                Utils.showToast('Error', result.error || 'Connection failed', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', 'Connection test failed', 'error');
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
                        <button class="btn btn-primary" onclick="Settings.showAddIPTVPanelModal()">
                            <i class="fas fa-plus"></i> Add Panel
                        </button>
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
                                        <tr style="cursor: pointer;" onclick="Settings.openIPTVPanelDetails(${panel.id}, event)">
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
                                                <button class="btn btn-sm btn-outline" onclick="Settings.testIPTVPanelConnection(${panel.id})" title="Test Connection">
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
            const response = await API.getPlexServerUsers(serverId);
            const users = response.users;
            Utils.hideLoading();

            Utils.showModal({
                title: `Server Users (${users.length})`,
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
                                        <th>Status</th>
                                        <th>Accepted At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(user => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(user.username)}</strong></td>
                                            <td>${Utils.escapeHtml(user.email)}</td>
                                            <td>${user.status === 'accepted' ? '<span class="badge badge-success">Accepted</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
                                            <td>${user.acceptedAt ? Utils.formatDate(user.acceptedAt) : 'N/A'}</td>
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

            const tags = tagsResponse.tags;
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
                                        if (tag.linked_server_name) {
                                            linkedTo = `<i class="fas fa-server"></i> ${Utils.escapeHtml(tag.linked_server_name)}`;
                                        } else if (tag.linked_panel_name) {
                                            linkedTo = `<i class="fas fa-network-wired"></i> ${Utils.escapeHtml(tag.linked_panel_name)}`;
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
                            <option value="server">Plex Server</option>
                            <option value="panel">IPTV Panel</option>
                        </select>
                        <small class="form-text">Link tags to automatically assign them to users with access</small>
                    </div>

                    <div class="form-group" id="server-select-group" style="display: none;">
                        <label for="tag-server">Plex Server</label>
                        <select id="tag-server" class="form-control">
                            <option value="">-- Select Server --</option>
                            ${plexServers.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group" id="panel-select-group" style="display: none;">
                        <label for="tag-panel">IPTV Panel</label>
                        <select id="tag-panel" class="form-control">
                            <option value="">-- Select Panel --</option>
                            ${iptvPanels.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('')}
                        </select>
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
                        const serverId = document.getElementById('tag-server').value;
                        const panelId = document.getElementById('tag-panel').value;
                        const autoAssign = document.getElementById('tag-auto-assign').checked;

                        if (!name) {
                            Utils.showToast('Error', 'Please enter a tag name', 'error');
                            return;
                        }

                        Utils.showLoading();
                        try {
                            await API.createTag({
                                name,
                                color,
                                linked_server_id: linkType === 'server' ? (serverId || null) : null,
                                linked_panel_id: linkType === 'panel' ? (panelId || null) : null,
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

            const linkType = tag.linked_server_id ? 'server' : (tag.linked_panel_id ? 'panel' : '');

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
                                <option value="server" ${linkType === 'server' ? 'selected' : ''}>Plex Server</option>
                                <option value="panel" ${linkType === 'panel' ? 'selected' : ''}>IPTV Panel</option>
                            </select>
                        </div>

                        <div class="form-group" id="edit-server-select-group" style="display: ${linkType === 'server' ? 'block' : 'none'};">
                            <label for="edit-tag-server">Plex Server</label>
                            <select id="edit-tag-server" class="form-control">
                                <option value="">-- Select Server --</option>
                                ${plexServers.map(s => `<option value="${s.id}" ${s.id === tag.linked_server_id ? 'selected' : ''}>${Utils.escapeHtml(s.name)}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group" id="edit-panel-select-group" style="display: ${linkType === 'panel' ? 'block' : 'none'};">
                            <label for="edit-tag-panel">IPTV Panel</label>
                            <select id="edit-tag-panel" class="form-control">
                                <option value="">-- Select Panel --</option>
                                ${iptvPanels.map(p => `<option value="${p.id}" ${p.id === tag.linked_panel_id ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
                            </select>
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
                            const serverId = document.getElementById('edit-tag-server').value;
                            const panelId = document.getElementById('edit-tag-panel').value;
                            const autoAssign = document.getElementById('edit-tag-auto-assign').checked;

                            if (!name) {
                                Utils.showToast('Error', 'Please enter a tag name', 'error');
                                return;
                            }

                            Utils.showLoading();
                            try {
                                await API.updateTag(tagId, {
                                    name,
                                    color,
                                    linked_server_id: linkType === 'server' ? (serverId || null) : null,
                                    linked_panel_id: linkType === 'panel' ? (panelId || null) : null,
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

            // Get actual stored value (don't use fallback here, let the form show empty if not set)
            const appName = appNameSetting?.value || '';
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
                            <label class="form-label">Login Page Message</label>
                            <input type="text" class="form-input" id="login-message" placeholder="Sign in to your account" value="${loginMessage}">
                            <small class="form-help">Custom message displayed on the login page</small>
                        </div>
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
            const loginMessage = document.getElementById('login-message').value;
            const hideLoginName = document.getElementById('hide-login-name').checked;
            const logoFile = document.getElementById('logo-upload').files[0];
            const faviconFile = document.getElementById('favicon-upload').files[0];

            // Save app name (allow empty string to reset to default)
            await API.updateSetting('app_title', appName.trim(), 'string', 'Application title');

            // Save login message (allow empty string to reset to default)
            await API.updateSetting('login_message', loginMessage.trim(), 'string', 'Login page message');

            // Save hide login name checkbox
            await API.updateSetting('hide_login_name', String(hideLoginName), 'string', 'Hide app name on login page');

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

        try {
            // Fetch existing email settings
            const settings = await API.getAllSettings();
            const emailSettings = settings.settings || {};

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="mb-4">
                        <h3><i class="fas fa-envelope"></i> Email Configuration & Scheduler</h3>
                        <p style="color: var(--text-secondary); font-size: 0.875rem;">
                            Configure SMTP settings and manage email schedules
                        </p>
                    </div>

                    <!-- Email Server Configuration (Collapsible, Collapsed by Default) -->
                    <div class="card mb-4">
                        <div class="card-header" style="cursor: pointer; user-select: none;" onclick="Settings.toggleEmailServerConfig()">
                            <div class="flex justify-between items-center">
                                <h4 style="margin: 0;">
                                    <i class="fas fa-server"></i> SMTP Server Configuration
                                </h4>
                                <i class="fas fa-chevron-down" id="email-config-chevron"></i>
                            </div>
                        </div>
                        <div id="email-server-config-content" style="display: none;">
                            <div class="card-body">
                                <form id="email-server-form" class="form">
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Host</label>
                                        <input type="text" class="form-input" id="smtp-host"
                                               placeholder="smtp.gmail.com"
                                               value="${emailSettings.smtp_host?.value || ''}" required>
                                        <small class="form-help">SMTP server hostname (e.g., smtp.gmail.com, smtp.office365.com)</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Port</label>
                                        <input type="number" class="form-input" id="smtp-port"
                                               placeholder="587"
                                               value="${emailSettings.smtp_port?.value || ''}" required>
                                        <small class="form-help">Common ports: 587 (TLS), 465 (SSL), 25 (insecure)</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Use TLS/SSL</label>
                                        <select class="form-input" id="smtp-secure">
                                            <option value="tls" ${emailSettings.smtp_secure?.value === 'tls' ? 'selected' : ''}>TLS (Port 587)</option>
                                            <option value="ssl" ${emailSettings.smtp_secure?.value === 'ssl' ? 'selected' : ''}>SSL (Port 465)</option>
                                            <option value="none" ${emailSettings.smtp_secure?.value === 'none' ? 'selected' : ''}>None</option>
                                        </select>
                                        <small class="form-help">Encryption method for secure connection</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Username</label>
                                        <input type="text" class="form-input" id="smtp-username"
                                               placeholder="your-email@gmail.com"
                                               value="${emailSettings.smtp_username?.value || ''}" required>
                                        <small class="form-help">Email account for authentication</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label required">SMTP Password</label>
                                        <input type="password" class="form-input" id="smtp-password"
                                               placeholder="${emailSettings.smtp_password?.value ? '••••••••' : ''}" required>
                                        <small class="form-help">App password or account password</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Sender Name</label>
                                        <input type="text" class="form-input" id="sender-name"
                                               placeholder="My Company"
                                               value="${emailSettings.sender_name?.value || ''}">
                                        <small class="form-help">Display name in outgoing emails</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Sender Email</label>
                                        <input type="email" class="form-input" id="sender-email"
                                               placeholder="noreply@example.com"
                                               value="${emailSettings.sender_email?.value || ''}">
                                        <small class="form-help">From address in outgoing emails</small>
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

                    <!-- Email Scheduler Section (Always Visible) -->
                    <div class="card">
                        <div class="card-header">
                            <h4 style="margin: 0;">
                                <i class="fas fa-calendar-alt"></i> Email Scheduler
                            </h4>
                        </div>
                        <div class="card-body">
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle"></i>
                                <strong>Coming Soon:</strong> Email scheduler functionality will be implemented here to automate reminder emails, subscription notifications, and custom scheduled campaigns.
                            </div>

                            <div class="text-center mt-4 mb-4" style="padding: 2rem;">
                                <i class="fas fa-calendar-check" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                                <p class="mt-2" style="color: var(--text-secondary);">No scheduled emails configured yet</p>
                                <p style="color: var(--text-secondary); font-size: 0.875rem;">
                                    Future features: Expiration reminders, welcome emails, renewal notifications
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

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
                                            <td>${plan.duration_months} month${plan.duration_months !== 1 ? 's' : ''}</td>
                                            <td><strong>${plan.currency || 'USD'} $${plan.price.toFixed(2)}</strong></td>
                                            <td>${plan.iptv_connections || '-'}</td>
                                            <td>${Utils.getStatusBadge(plan.is_active, 'Active', 'Inactive')}</td>
                                            <td>
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

                    <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label required">Duration (Months)</label>
                            <input type="number" name="duration_months" class="form-input" required min="1" value="1">
                        </div>

                        <div class="form-group">
                            <label class="form-label required">Price</label>
                            <div style="display: flex; gap: 0.5rem;">
                                <select name="currency" class="form-input" style="flex: 0 0 80px;">
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                    <option value="CAD">CAD</option>
                                </select>
                                <input type="number" name="price" class="form-input" required min="0" step="0.01" placeholder="0.00" style="flex: 1;">
                            </div>
                        </div>
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
     * Submit add subscription plan form
     */
    async submitAddSubscriptionPlan() {
        const form = document.getElementById('add-subscription-plan-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            service_type: formData.get('service_type'),
            price: parseFloat(formData.get('price')),
            currency: formData.get('currency'),
            duration_months: parseInt(formData.get('duration_months')),
            is_active: formData.get('is_active') === 'on',
            display_order: parseInt(formData.get('display_order')) || 0
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

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label required">Duration (Months)</label>
                                <input type="number" name="duration_months" class="form-input" required min="1" value="${plan.duration_months}">
                            </div>

                            <div class="form-group">
                                <label class="form-label required">Price</label>
                                <div style="display: flex; gap: 0.5rem;">
                                    <select name="currency" class="form-input" style="flex: 0 0 80px;">
                                        <option value="USD" ${plan.currency === 'USD' ? 'selected' : ''}>USD</option>
                                        <option value="EUR" ${plan.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                                        <option value="GBP" ${plan.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                                        <option value="CAD" ${plan.currency === 'CAD' ? 'selected' : ''}>CAD</option>
                                    </select>
                                    <input type="number" name="price" class="form-input" required min="0" step="0.01" value="${plan.price}" style="flex: 1;">
                                </div>
                            </div>
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
     * Submit edit subscription plan form
     */
    async submitEditSubscriptionPlan(planId) {
        const form = document.getElementById('edit-subscription-plan-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            service_type: formData.get('service_type'),
            price: parseFloat(formData.get('price')),
            currency: formData.get('currency'),
            duration_months: parseInt(formData.get('duration_months')),
            is_active: formData.get('is_active') === 'on',
            display_order: parseInt(formData.get('display_order')) || 0
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
    showAddPaymentOptionModal() {
        const modalBody = `
            <form id="add-payment-option-form">
                <div class="form-group">
                    <label class="form-label required">Name</label>
                    <input type="text" name="name" class="form-input" required
                           placeholder="e.g. PayPal, CashApp, Bitcoin">
                </div>

                <div class="form-group">
                    <label class="form-label required">Payment URL</label>
                    <input type="url" name="payment_url" class="form-input" required
                           placeholder="https://paypal.me/yourname">
                    <small class="form-text">URL to your payment profile or checkout page</small>
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
                        <label class="form-label required">Name</label>
                        <input type="text" name="name" class="form-input" required
                               value="${Utils.escapeHtml(option.name)}">
                    </div>

                    <div class="form-group">
                        <label class="form-label required">Payment URL</label>
                        <input type="url" name="payment_url" class="form-input" required
                               value="${Utils.escapeHtml(option.payment_url)}">
                        <small class="form-text">URL to your payment profile or checkout page</small>
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
                        <option value="xui_one" disabled>XUI One (Coming Soon)</option>
                        <option value="one_stream" disabled>1-Stream (Coming Soon)</option>
                        <option value="xtream_ui" disabled>Xtream UI (Coming Soon)</option>
                        <option value="midnight_streamer" disabled>Midnight Streamer (Coming Soon)</option>
                    </select>
                </div>

                <div id="panel-type-fields" style="display: none;">
                    <!-- NXT Dash Fields -->
                    <div class="form-group">
                        <label class="form-label required">Panel Base URL</label>
                        <input type="url" name="base_url" class="form-input" required
                               placeholder="https://panel.example.com">
                        <small class="form-help">Main panel URL without /login</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Login URL</label>
                        <input type="url" name="login_url" class="form-input" required
                               placeholder="https://panel.example.com/login/nvvykjyh">
                        <small class="form-help">Full login URL (usually base URL + /login/unique-id)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Provider Base URL</label>
                        <input type="url" name="provider_base_url" class="form-input" required
                               placeholder="http://provider.example.com:8080">
                        <small class="form-help">Stream provider URL (usually includes port)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Username</label>
                        <input type="text" name="username" class="form-input" required
                               placeholder="Panel username">
                    </div>
                    <div class="form-group">
                        <label class="form-label required">Password</label>
                        <input type="password" name="password" class="form-input" required
                               placeholder="Panel password">
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
        const fieldsContainer = document.getElementById('panel-type-fields');
        if (select.value === 'nxt_dash') {
            fieldsContainer.style.display = 'block';
        } else {
            fieldsContainer.style.display = 'none';
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
        const data = {
            panel_type: formData.get('panel_type'),
            base_url: formData.get('base_url'),
            login_url: formData.get('login_url') || formData.get('base_url') + '/login',
            credentials: {
                username: formData.get('username'),
                password: formData.get('password')
            }
        };

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
                    provider_base_url: formData.get('provider_base_url'),
                    credentials: data.credentials
                };

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
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Base URL</label>
                            <input type="url" name="base_url" class="form-input" required
                                   value="${Utils.escapeHtml(panel.base_url)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Provider Base URL</label>
                            <input type="url" name="provider_base_url" class="form-input"
                                   value="${Utils.escapeHtml(panel.provider_base_url || '')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">M3U Playlist URL (Optional)</label>
                            <input type="url" name="m3u_url" id="m3u_url_input" class="form-input"
                                   value="${Utils.escapeHtml(panel.m3u_url || '')}"
                                   placeholder="https://example.com/get.php?username=...&password=...&type=m3u">
                            <small class="form-help">
                                If you don't use IPTV Editor, provide an M3U playlist URL to get channel/movie/series counts on the dashboard
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
        const data = {
            name: formData.get('name'),
            base_url: formData.get('base_url'),
            provider_base_url: formData.get('provider_base_url'),
            is_active: formData.get('is_active') === 'on'
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

            // Update playlist link if changed (NEW: panels link to playlists)
            if (linked_playlist_id !== undefined && linked_playlist_id !== null) {
                const playlistId = linked_playlist_id || null;
                await API.linkPanelToPlaylist(panelId, playlistId);
            }

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

    async testIPTVPanelConnection(panelId) {
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
            const displayBouquets = (bouquetsList, bouquetsData) => {
                let html = `
                    <div style="padding: 8px 0;">
                        <div style="color: #666; padding: 8px 12px; background: #f5f5f5; margin-bottom: 8px;">
                            Total Bouquets: ${bouquetsData.length}
                        </div>
                        ${bouquetsData.map(bouquet => `
                            <div style="padding: 8px 12px; border-bottom: 1px solid #eee; word-wrap: break-word; overflow-wrap: break-word;">
                                <strong style="display: block; margin-bottom: 4px;">${bouquet.name || bouquet.bouquet_name || 'Unnamed Bouquet'}</strong>
                                <small style="color: #666; display: block;">ID: ${bouquet.id}</small>
                            </div>
                        `).join('')}
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
                displayBouquets(bouquetsListElement, bouquets);
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
                        displayBouquets(bouquetsListElement, response.bouquets);
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
                            <h3 style="margin: 0;">App Users</h3>
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
                                            ${user.needs_password_setup ?
                                                '<span class="badge badge-warning"><i class="fas fa-exclamation-circle"></i> Pending Setup</span>' :
                                                '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Active</span>'
                                            }
                                        </td>
                                        <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                                        <td>
                                            ${user.needs_password_setup ? `
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
            `;

            // Add user button handler
            document.getElementById('add-app-user-btn').addEventListener('click', () => {
                this.showAppUserModal();
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
            <div class="modal" id="app-user-modal">
                <div class="modal-content" style="max-width: 500px;">
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
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('app-user-modal-backdrop').remove(); document.getElementById('app-user-modal').remove();">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas ${isEdit ? 'fa-save' : 'fa-paper-plane'}"></i>
                                ${isEdit ? 'Update' : 'Create & Send Welcome Email'}
                            </button>
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

        // Form submit handler
        document.getElementById('app-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveAppUser(userId);
        });
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

        try {
            Utils.showLoading();

            if (userId) {
                await API.updateAppUser(userId, data);
                Utils.showToast('Success', 'App user updated successfully', 'success');
            } else {
                const response = await API.createAppUser(data);
                if (response.requiresPasswordSetup) {
                    Utils.showToast('Success', 'App user created! Welcome email sent with password setup link.', 'success');
                } else {
                    Utils.showToast('Success', 'App user created successfully', 'success');
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
        if (!confirm(`Are you sure you want to delete the app user "${userName}"?\n\nThis will permanently remove their login account and all active sessions.`)) {
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
                    const statusCell = row.querySelectorAll('td')[4]; // 5th column is status
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
                        <label class="form-label required" id="available-bouquets-counter">Available Bouquets (${availableBouquets.length})</label>
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
                            <label class="form-label">IPTV Editor Channels</label>
                            <div id="editor-channels-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorChannelCategories.length > 0 ? editorChannelCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-channel-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorChannelIds.includes(cat.id) ? 'checked' : ''}
                                               style="margin-right: 0.5rem;">
                                        <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(cat.name)}</span>
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No channel categories available</p>'}
                            </div>
                            <small class="form-help">Select channel categories to include</small>
                        </div>

                        <!-- Editor Movies -->
                        <div class="form-group">
                            <label class="form-label">IPTV Editor Movies</label>
                            <div id="editor-movies-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorMovieCategories.length > 0 ? editorMovieCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-movie-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorMovieIds.includes(cat.id) ? 'checked' : ''}
                                               style="margin-right: 0.5rem;">
                                        <span style="color: var(--text-primary); font-size: 0.875rem;">${Utils.escapeHtml(cat.name)}</span>
                                    </label>
                                `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No movie categories available</p>'}
                            </div>
                            <small class="form-help">Select movie categories to include</small>
                        </div>

                        <!-- Editor Series -->
                        <div class="form-group">
                            <label class="form-label">IPTV Editor Series</label>
                            <div id="editor-series-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.5rem; background: var(--input-bg);">
                                ${editorSeriesCategories.length > 0 ? editorSeriesCategories.map(cat => `
                                    <label style="display: flex; align-items: center; padding: 0.4rem; margin: 0.2rem 0; cursor: pointer; border-radius: 3px; transition: background 0.2s;"
                                           onmouseover="this.style.background='var(--hover-bg)'"
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox"
                                               class="editor-series-checkbox"
                                               value="${cat.id}"
                                               ${selectedEditorSeriesIds.includes(cat.id) ? 'checked' : ''}
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
                        const name = bouquet.name || bouquet.bouquet_name || `Bouquet ${bouquet.id}`;
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
                        const name = bouquet.name || bouquet.bouquet_name || `Bouquet ${bouquet.id}`;
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
                            const nameA = (a.name || a.bouquet_name || '').toLowerCase();
                            const nameB = (b.name || b.bouquet_name || '').toLowerCase();
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
    }
};
