/**
 * Edit User Page
 * Comprehensive user editing with service management
 */

const EditUser = {
    userId: null,
    userData: null,
    originalData: null, // For change tracking
    hasUnsavedChanges: false,

    // Cache for dropdown data
    cache: {
        appUsers: [],
        tags: [],
        plexServers: [],
        plexPackages: [],
        iptvPanels: [],
        iptvPackages: [],
        iptvChannelGroups: [],
        emailTemplates: [],
        iptvEditorSettings: null
    },

    /**
     * Initialize and render the edit user page
     */
    async render(container, userId) {
        this.userId = userId;
        this.hasUnsavedChanges = false;

        // Show loading state
        container.innerHTML = `
            <div class="text-center mt-4 mb-4">
                <div class="spinner" style="margin: 0 auto;"></div>
                <p class="mt-2">Loading user data...</p>
            </div>
        `;

        try {
            // Load user data first, then dropdown options (need user data for channel groups)
            await this.loadUserData();
            await this.loadDropdownData();

            // Store original data for change tracking
            this.originalData = JSON.parse(JSON.stringify(this.userData));

            // Render the edit form
            this.renderEditForm(container);

        } catch (error) {
            console.error('Error loading edit user page:', error);
            container.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-exclamation-triangle"></i>
                            Error
                        </h2>
                    </div>
                    <div class="card-body">
                        <p class="text-danger">Failed to load user data: ${Utils.escapeHtml(error.message)}</p>
                        <button class="btn btn-primary mt-3" onclick="Router.navigate('users')">
                            <i class="fas fa-arrow-left"></i> Back to Users
                        </button>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Load user data from API
     */
    async loadUserData() {
        const response = await API.getUser(this.userId);
        this.userData = response.user;
        console.log('Loaded user data:', this.userData);
    },

    /**
     * Load dropdown data from API
     */
    async loadDropdownData() {
        try {
            const [appUsersRes, tagsRes, subscriptionPlansRes, plexServersRes, iptvPanelsRes, emailTemplatesRes, iptvEditorSettingsRes] = await Promise.all([
                API.getAppUsers().catch(() => ({ app_users: [] })),
                API.getTags().catch(() => ({ tags: [] })),
                API.getSubscriptionPlans().catch(() => ({ plans: [] })),
                API.getPlexServers().catch(() => ({ servers: [] })),
                API.getIPTVPanels().catch(() => ({ panels: [] })),
                API.getEmailTemplates('welcome').catch(() => ({ templates: [] })),
                API.getIPTVEditorSettings().catch(() => ({ settings: {} }))
            ]);

            this.cache.appUsers = appUsersRes?.users || appUsersRes?.app_users || [];
            this.cache.tags = tagsRes?.data || [];
            this.cache.plexServers = plexServersRes?.servers || [];
            this.cache.iptvPanels = iptvPanelsRes?.panels || [];
            this.cache.emailTemplates = emailTemplatesRes?.templates || [];
            this.cache.iptvEditorSettings = iptvEditorSettingsRes?.settings || {};

            const allPlans = subscriptionPlansRes?.plans || [];
            this.cache.plexPackages = allPlans.filter(plan => plan.service_type === 'plex');
            this.cache.iptvSubscriptionPlans = allPlans.filter(plan => plan.service_type === 'iptv');

            // Load IPTV packages and channel groups for user's IPTV panel if they have one
            if (this.userData?.iptv_panel_id) {
                console.log(`🔍 Loading IPTV data for panel ID: ${this.userData.iptv_panel_id}`);

                const [packagesRes, channelGroupsRes] = await Promise.all([
                    API.getIPTVPackages(this.userData.iptv_panel_id).catch((err) => {
                        console.error('❌ Failed to load IPTV packages:', err);
                        return { packages: [] };
                    }),
                    API.getIPTVPanelChannelGroups(this.userData.iptv_panel_id).catch((err) => {
                        console.error('❌ Failed to load channel groups:', err);
                        return { channel_groups: [] };
                    })
                ]);

                this.cache.iptvPackages = packagesRes?.packages || [];
                this.cache.iptvChannelGroups = channelGroupsRes?.channel_groups || [];

                console.log(`✓ Loaded ${this.cache.iptvPackages.length} IPTV packages:`, this.cache.iptvPackages);
                console.log(`✓ Loaded ${this.cache.iptvChannelGroups.length} channel groups:`, this.cache.iptvChannelGroups);
            } else {
                console.log('⚠️ User has no iptv_panel_id, skipping IPTV data load');
                this.cache.iptvPackages = [];
                this.cache.iptvChannelGroups = [];
            }

            console.log('Dropdown data loaded:', this.cache);
        } catch (error) {
            console.error('Error loading dropdown data:', error);
        }
    },

    /**
     * Render the main edit form
     */
    renderEditForm(container) {
        const user = this.userData;

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-user-edit"></i>
                        Edit User: ${Utils.escapeHtml(user.name)}
                    </h2>
                    <div class="flex gap-2">
                        <button class="btn btn-outline" onclick="EditUser.handleClose()">
                            <i class="fas fa-times"></i><span class="btn-text-desktop"> Close</span>
                        </button>
                        <button class="btn btn-success" onclick="EditUser.handleSave()">
                            <i class="fas fa-save"></i><span class="btn-text-desktop"> Save</span>
                        </button>
                    </div>
                </div>

                <div class="card-body" style="max-width: 1200px; margin: 0 auto;">
                    <!-- Basic Information -->
                    ${this.renderBasicInfoSection()}

                    <!-- Plex Section -->
                    ${user.plex_enabled ? this.renderPlexSection() : ''}

                    <!-- IPTV Section -->
                    ${user.iptv_enabled ? this.renderIPTVSection() : ''}

                    <!-- Add Services Section (if not all services are enabled) -->
                    ${!user.plex_enabled || !user.iptv_enabled ? this.renderAddServicesSection() : ''}

                    <!-- Bottom Action Buttons -->
                    <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; gap: 1rem;">
                        <button class="btn btn-outline" onclick="EditUser.handleClose()">
                            <i class="fas fa-times"></i> Close
                        </button>
                        <button class="btn btn-success" onclick="EditUser.handleSave()">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners for change tracking
        this.attachChangeListeners();

        // Attach package change listeners for auto-calculating expiration dates
        this.attachPackageChangeListeners();

        // Attach tag dropdown listener
        this.attachTagDropdownListener();

        // Load custom payment methods if user has custom preference
        if (this.userData.payment_preference === 'custom') {
            this.loadCustomPaymentMethods();
        }
    },

    /**
     * Render basic information section
     */
    renderBasicInfoSection() {
        const user = this.userData;

        return `
            <section class="edit-section">
                <h3><i class="fas fa-user"></i> Basic Information</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-name">Name <span class="required">*</span></label>
                        <input
                            type="text"
                            id="edit-name"
                            class="form-input"
                            value="${Utils.escapeHtml(user.name)}"
                            required
                            data-track-changes
                        />
                    </div>

                    <div class="form-group">
                        <label for="edit-email">Email <span class="required">*</span></label>
                        <input
                            type="email"
                            id="edit-email"
                            class="form-input"
                            value="${Utils.escapeHtml(user.email)}"
                            required
                            data-track-changes
                        />
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-owner">Owner</label>
                        <select id="edit-owner" class="form-input" data-track-changes>
                            <option value="">-- No Owner --</option>
                            ${this.cache.appUsers.map(owner => `
                                <option value="${owner.id}" ${owner.id === user.owner_id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(owner.name || owner.email || `User #${owner.id}`)}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="edit-notes">Notes</label>
                        <textarea
                            id="edit-notes"
                            class="form-input"
                            rows="2"
                            maxlength="1000"
                            data-track-changes
                        >${Utils.escapeHtml(user.notes || '')}</textarea>
                    </div>
                </div>

                <div class="form-group">
                    <label for="edit-tags-dropdown">Tags</label>
                    <select id="edit-tags-dropdown" class="form-input">
                        <option value="">-- Add Tag --</option>
                        ${this.cache.tags.map(tag => `
                            <option value="${tag.id}" data-color="${tag.color}">
                                ${Utils.escapeHtml(tag.name)}
                            </option>
                        `).join('')}
                    </select>
                    <div id="selected-tags-display" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem;">
                        ${(user.tags || []).map(tag => `
                            <span class="tag-badge" data-tag-id="${tag.id}" style="background-color: ${tag.color}; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
                                ${Utils.escapeHtml(tag.name)}
                                <i class="fas fa-times" onclick="EditUser.removeTag(${tag.id})" style="cursor: pointer; font-size: 0.75rem;"></i>
                            </span>
                        `).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="edit-exclude-bulk-emails"
                            ${user.exclude_from_bulk_emails ? 'checked' : ''}
                            data-track-changes
                        />
                        <span>Exclude from Bulk Emails</span>
                    </label>
                    <small class="form-hint">User will not receive manually sent bulk emails</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="edit-exclude-automated-emails"
                            ${user.exclude_from_automated_emails ? 'checked' : ''}
                            data-track-changes
                        />
                        <span>Exclude from Automated Emails</span>
                    </label>
                    <small class="form-hint">User will not receive scheduled emails (renewals, reminders, etc.)</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="edit-bcc-owner"
                            ${user.bcc_owner_on_renewal ? 'checked' : ''}
                            data-track-changes
                        />
                        <span>BCC Owner on Renewal Emails</span>
                    </label>
                    <small class="form-hint">Owner will receive a copy of renewal-related emails sent to this user</small>
                </div>

                <!-- Request Site Access -->
                <div class="form-group" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                    <label class="form-label"><i class="fas fa-film"></i> Request Site Access</label>
                    <select id="edit-rs-has-access" class="form-input" data-track-changes>
                        <option value="auto" ${user.rs_has_access === null || user.rs_has_access === undefined ? 'selected' : ''}>Auto (Plex=Yes, IPTV-only=No)</option>
                        <option value="enabled" ${user.rs_has_access === 1 ? 'selected' : ''}>Enabled</option>
                        <option value="disabled" ${user.rs_has_access === 0 ? 'selected' : ''}>Disabled</option>
                    </select>
                    <small class="form-hint">Controls access to the Discover/Request sections in the user portal</small>
                </div>

                <!-- Payment Preference Section -->
                <div class="form-group" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                    <label class="form-label"><i class="fas fa-credit-card"></i> Payment Preference</label>
                    <select id="edit-payment-preference" class="form-input" data-track-changes onchange="EditUser.handlePaymentPreferenceChange()">
                        <option value="global" ${(!user.payment_preference || user.payment_preference === 'global') ? 'selected' : ''}>Global (Use system payment options)</option>
                        <option value="owner" ${user.payment_preference === 'owner' ? 'selected' : ''}>Owner (Use owner's payment methods)</option>
                        <option value="custom" ${user.payment_preference === 'custom' ? 'selected' : ''}>Custom (Configure specific methods for this user)</option>
                    </select>
                    <small class="form-hint">Determines which payment methods are shown to this user on the portal</small>
                </div>

                <!-- Custom Payment Methods (shown when payment_preference is 'custom') -->
                <div id="custom-payment-methods-section" class="form-group" style="display: ${user.payment_preference === 'custom' ? 'block' : 'none'};">
                    <label class="form-label">Custom Payment Methods</label>
                    <div id="custom-payment-methods-list" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; background: var(--bg-tertiary);">
                        <!-- Payment methods will be loaded here -->
                        <div class="text-center" style="color: var(--text-secondary);">
                            <i class="fas fa-spinner fa-spin"></i> Loading payment methods...
                        </div>
                    </div>
                    <small class="form-hint">Select which payment methods this user can see on the portal</small>
                </div>
            </section>
        `;
    },

    /**
     * Render Plex section
     */
    renderPlexSection() {
        const user = this.userData;
        const plexShares = user.plex_shares || [];

        console.log('Rendering Plex section:', { plexShares, plexServers: this.cache.plexServers });

        // Build enriched servers with user's library access
        // Iterate over ALL available servers, not just those the user currently has shares for
        const enrichedServers = (this.cache.plexServers || []).map(server => {
            // Find if user has a share for this server
            const userShare = plexShares.find(share => share.plex_server_id === server.id);

            // If user has a share, use their library IDs; otherwise, empty array (all unchecked)
            const selectedLibraryIds = userShare
                ? (Array.isArray(userShare.library_ids) ? userShare.library_ids : [])
                : [];

            return {
                server_id: server.id,
                server_name: server.name,
                all_libraries: server.libraries || [],
                selected_library_ids: selectedLibraryIds
            };
        });

        // Format days since last activity
        const daysActivity = user.plex_days_since_last_activity;
        let activityText = 'Never';
        let activityColor = 'var(--text-secondary)';
        if (daysActivity !== null && daysActivity !== undefined) {
            if (daysActivity === 0) {
                activityText = 'Today';
                activityColor = 'var(--success-color)';
            } else if (daysActivity === 1) {
                activityText = 'Yesterday';
                activityColor = 'var(--success-color)';
            } else if (daysActivity <= 7) {
                activityText = `${daysActivity} days ago`;
                activityColor = 'var(--success-color)';
            } else if (daysActivity <= 30) {
                activityText = `${daysActivity} days ago`;
                activityColor = 'var(--warning-color)';
            } else {
                activityText = `${daysActivity} days ago`;
                activityColor = 'var(--error-color)';
            }
        }

        return `
            <section class="edit-section">
                <h3 style="display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fas fa-film"></i> Plex Access</span>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-sm btn-secondary" onclick="EditUser.syncPlexLibraries()" title="Sync library access from Plex servers">
                            <i class="fas fa-sync"></i> Sync Libraries
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="EditUser.deletePlexAccess()" title="Delete Plex Access">
                            <i class="fas fa-trash"></i> Delete Plex
                        </button>
                    </div>
                </h3>

                <!-- Plex User Info -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Plex Username:</div>
                        <div style="font-weight: 600;">${user.plex_username ? Utils.escapeHtml(user.plex_username) : '<span style="color: var(--text-secondary);">Not synced</span>'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Last Activity:</div>
                        <div style="font-weight: 600; color: ${activityColor};">${activityText}</div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Current Subscription</label>
                        <div style="padding: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 4px; font-weight: 500; color: ${user.plex_package_name ? 'var(--primary-color)' : 'var(--text-secondary)'};">
                            <i class="fas fa-box"></i> ${user.plex_package_name ? Utils.escapeHtml(user.plex_package_name) : 'No Subscription'}
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Current Expiration</label>
                        <div style="padding: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 4px; font-weight: 500;">
                            ${Utils.getExpirationBadge(user.plex_expiration_date, user.plex_price_type)}
                        </div>
                    </div>
                </div>

                ${user.plex_cancelled_at ? `
                <div style="padding: 0.75rem; margin-bottom: 1rem; background: rgba(245, 158, 11, 0.15); border: 1px solid var(--warning-color); border-radius: 6px; color: var(--warning-color); font-weight: 500;">
                    <i class="fas fa-clock"></i> Pending Cancellation - Service will be removed on ${user.plex_expiration_date ? (() => { const [y,m,d] = user.plex_expiration_date.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}`; })() : 'expiration'}
                </div>
                ` : ''}

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-plex-email">Plex Email</label>
                        <input
                            type="email"
                            id="edit-plex-email"
                            class="form-input"
                            value="${Utils.escapeHtml(user.plex_email || user.email)}"
                            data-track-changes
                        />
                    </div>

                    <div class="form-group">
                        <label for="edit-plex-package">Change Subscription</label>
                        <select id="edit-plex-package" class="form-input" data-track-changes>
                            <option value="">-- No Subscription --</option>
                            ${this.cache.plexPackages.map(pkg => `
                                <option value="${pkg.id}" data-billing-interval="${Utils.escapeHtml(pkg.billing_interval)}" ${pkg.id === user.plex_package_id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(pkg.name)} - $${pkg.price}/${pkg.billing_interval}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-plex-expiration">New Expiration Date</label>
                        <input
                            type="date"
                            id="edit-plex-expiration"
                            class="form-input"
                            value="${user.plex_expiration_date ? user.plex_expiration_date.split('T')[0] : ''}"
                            data-track-changes
                        />
                    </div>
                </div>

                <div class="form-group">
                    <label><strong>Server & Library Access</strong></label>
                    <div style="border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; background: var(--card-bg);">
                        ${enrichedServers.length > 0 ? enrichedServers.map(server => {
                            // Check if server has any selected libraries (collapse if none selected)
                            const hasSelectedLibraries = server.selected_library_ids && server.selected_library_ids.length > 0;
                            const isExpanded = hasSelectedLibraries;

                            return `
                                <div class="plex-server-item" style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                                    <h4 style="margin-bottom: 0.75rem; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" onclick="EditUser.toggleServerLibraries(${server.server_id})">
                                        <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}" id="server-toggle-${server.server_id}" style="font-size: 0.75rem; color: var(--text-secondary);"></i>
                                        <i class="fas fa-server" style="color: var(--primary-color);"></i>
                                        <span>${Utils.escapeHtml(server.server_name)}</span>
                                        ${hasSelectedLibraries ? `<span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">(${server.selected_library_ids.length} ${server.selected_library_ids.length === 1 ? 'library' : 'libraries'})</span>` : ''}
                                    </h4>
                                    ${server.all_libraries && server.all_libraries.length > 0 ? `
                                        <div id="server-libraries-${server.server_id}" class="library-checkboxes" style="display: ${isExpanded ? 'grid' : 'none'}; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; margin-left: 1.5rem;">
                                            ${server.all_libraries.map(lib => {
                                                // Convert both to strings for comparison (database stores as strings)
                                                const isChecked = server.selected_library_ids.map(String).includes(String(lib.key));
                                                return `
                                                    <label class="checkbox-label" style="margin: 0;">
                                                        <input
                                                            type="checkbox"
                                                            class="plex-library-checkbox"
                                                            data-server-id="${server.server_id}"
                                                            data-library-id="${lib.key}"
                                                            data-library-name="${Utils.escapeHtml(lib.title)}"
                                                            ${isChecked ? 'checked' : ''}
                                                            data-track-changes
                                                        />
                                                        <span>${Utils.escapeHtml(lib.title)}</span>
                                                    </label>
                                                `;
                                            }).join('')}
                                        </div>
                                    ` : '<p style="margin-left: 1.5rem; color: var(--text-secondary); font-size: 0.875rem;">No libraries available</p>'}
                                </div>
                            `;
                        }).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">User has no Plex server access</p>'}
                    </div>
                    <small class="form-text">Select the libraries this user should have access to on each server</small>
                </div>
            </section>
        `;
    },

    /**
     * Render IPTV section
     */
    renderIPTVSection() {
        const user = this.userData;
        const panel = this.cache.iptvPanels.find(p => p.id === user.iptv_panel_id);
        const panelM3U = panel ? this.generateIPTVM3U(panel, user.iptv_username, user.iptv_password) : '';

        // Get panel account data for actual expiration and connections
        const panelAccount = user.iptv_accounts?.[0] || null;

        // Use stored expiration date first (already calculated in local timezone by sync)
        // Only fall back to panel data conversion if no stored date
        let actualExpiration = user.iptv_expiration_date;

        // If no stored date, try to get from panel account
        if (!actualExpiration) {
            if (panelAccount && panelAccount.expire_at) {
                // OneStream format - extract date directly from string
                actualExpiration = panelAccount.expire_at.split('T')[0].split(' ')[0];
            } else if (panelAccount && panelAccount.exp_date) {
                // Convert Unix timestamp to date - use local timezone
                if (typeof panelAccount.exp_date === 'number' || !isNaN(panelAccount.exp_date)) {
                    const d = new Date(parseInt(panelAccount.exp_date) * 1000);
                    actualExpiration = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                } else {
                    actualExpiration = panelAccount.exp_date;
                }
            }
        }

        // Calculate days left using actual expiration
        const daysLeft = actualExpiration
            ? Math.ceil((new Date(actualExpiration) - new Date()) / (1000 * 60 * 60 * 24))
            : 0;

        // Get max connections from panel account or package
        const maxConnections = panelAccount?.max_connections || user.iptv_connections || 0;
        const activeConnections = panelAccount?.active_cons || 0;

        // Find the IPTV technical package from stored panel_package_id (saved during user creation)
        // First try the database field, then fall back to panel account data
        const panelPackageId = user.iptv_panel_package_id || panelAccount?.package_id;
        const panelPackage = panelPackageId
            ? this.cache.iptvPackages.find(pkg => pkg.id == panelPackageId)
            : null;

        return `
            <section class="edit-section" id="iptv-panel-section">
                <h3 style="display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fas fa-broadcast-tower"></i> IPTV Panel Access</span>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-sm btn-primary" onclick="EditUser.renewIPTVSubscription()" title="Renew IPTV Subscription on Panel">
                            <i class="fas fa-sync-alt" style="color: #ff6b6b;"></i> Renew
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="EditUser.deleteIPTVAccess()" title="Delete IPTV Access (includes IPTV Editor)">
                            <i class="fas fa-trash"></i> Delete IPTV
                        </button>
                    </div>
                </h3>

                <!-- Current IPTV Status (Compact Display) -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Line ID:</div>
                        <div style="font-weight: 600;">${Utils.escapeHtml(user.iptv_line_id || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Connections:</div>
                        <div style="font-weight: 600;">${activeConnections}/${maxConnections}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Days Left:</div>
                        <div style="font-weight: 600; color: ${daysLeft > 30 ? 'var(--success-color)' : daysLeft > 7 ? 'var(--warning-color)' : 'var(--error-color)'};">${daysLeft} days</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Expiration:</div>
                        <div style="font-weight: 600;">${actualExpiration ? (() => { const [y,m,d] = actualExpiration.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}`; })() : 'Not Set'}</div>
                    </div>
                </div>

                ${user.iptv_cancelled_at ? `
                <div style="padding: 0.75rem; margin-bottom: 1rem; background: rgba(245, 158, 11, 0.15); border: 1px solid var(--warning-color); border-radius: 6px; color: var(--warning-color); font-weight: 500;">
                    <i class="fas fa-clock"></i> Pending Cancellation - Service will be removed on ${user.iptv_expiration_date ? (() => { const [y,m,d] = user.iptv_expiration_date.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}`; })() : 'expiration'}
                </div>
                ` : ''}

                <!-- IPTV Username and Password -->
                <div class="form-row" style="margin-bottom: 1rem;">
                    <div class="form-group">
                        <label for="edit-iptv-username">Username:</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input
                                type="text"
                                id="edit-iptv-username"
                                class="form-input"
                                value="${user.iptv_username || ''}"
                                readonly
                                style="flex: 1; font-family: monospace;"
                            />
                            <button class="btn btn-sm btn-outline" onclick="EditUser.copyToClipboard('${user.iptv_username || ''}', 'Username')" title="Copy">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="edit-iptv-password">Password:</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input
                                type="text"
                                id="edit-iptv-password"
                                class="form-input"
                                value="${user.iptv_password || ''}"
                                readonly
                                style="flex: 1; font-family: monospace;"
                            />
                            <button class="btn btn-sm btn-outline" onclick="EditUser.copyToClipboard('${user.iptv_password || ''}', 'Password')" title="Copy">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                </div>

                <!-- M3U Plus URL -->
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label for="edit-iptv-m3u">M3U Plus URL:</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input
                            type="text"
                            id="edit-iptv-m3u"
                            class="form-input"
                            value="${panelM3U}"
                            readonly
                            style="flex: 1; font-size: 0.875rem; font-family: monospace;"
                        />
                        <button class="btn btn-sm btn-outline" onclick="EditUser.copyToClipboard('${panelM3U}', 'M3U URL')" title="Copy">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>

                <!-- Two Dropdowns: Subscription and Channel Package -->
                <div class="form-row" style="margin-bottom: 1rem;">
                    <div class="form-group">
                        <label for="edit-iptv-subscription">Subscription Plan</label>
                        <select id="edit-iptv-subscription" class="form-input" data-track-changes>
                            <option value="">-- Select Subscription --</option>
                            ${(this.cache.iptvSubscriptionPlans || []).map(plan => `
                                <option value="${plan.id}" data-duration="${plan.duration_months}" ${plan.id == user.iptv_subscription_plan_id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(plan.name)} - ${plan.duration_months} Month${plan.duration_months > 1 ? 's' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="edit-iptv-channel-group">Channel Package / Bouquet</label>
                        <select id="edit-iptv-channel-group" class="form-input" data-track-changes>
                            <option value="">-- Select Channel Package --</option>
                            ${(this.cache.iptvChannelGroups || []).map(group => `
                                <option value="${group.id}" ${group.id == user.iptv_channel_group_id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(group.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Expiration Date (editable) with Sync Button -->
                <div class="form-row" style="margin-bottom: 1.5rem;">
                    <div class="form-group">
                        <label for="edit-iptv-expiration">Expiration Date</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input
                                type="date"
                                id="edit-iptv-expiration"
                                class="form-input"
                                value="${actualExpiration ? actualExpiration.split('T')[0] : ''}"
                                data-track-changes
                                style="flex: 1;"
                            />
                            <button class="btn btn-sm btn-outline" onclick="EditUser.syncIPTVPanelUser()" title="Sync user data from IPTV Panel (expiration, connections, etc.)">
                                <i class="fas fa-sync-alt"></i> Sync Panel
                            </button>
                        </div>
                        <small class="form-text">Auto-calculated when subscription is selected, or set manually</small>
                    </div>
                </div>

                <!-- VOD Visibility Settings -->
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="margin-bottom: 0.75rem; display: block;">VOD Access (Portal)</label>
                    <div style="display: flex; gap: 2rem; padding: 0.75rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin: 0;">
                            <input
                                type="checkbox"
                                id="edit-iptv-show-movies"
                                ${user.show_iptv_movies !== 0 ? 'checked' : ''}
                                data-track-changes
                            />
                            <i class="fas fa-film" style="color: var(--primary-color);"></i>
                            <span>Show Movies</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin: 0;">
                            <input
                                type="checkbox"
                                id="edit-iptv-show-series"
                                ${user.show_iptv_series !== 0 ? 'checked' : ''}
                                data-track-changes
                            />
                            <i class="fas fa-tv" style="color: var(--primary-color);"></i>
                            <span>Show TV Shows</span>
                        </label>
                    </div>
                    <small class="form-text">Control which VOD buttons appear in the portal for this user</small>
                </div>

                ${this.renderIPTVEditorSubsection()}
            </section>
        `;
    },

    /**
     * Render IPTV Editor subsection
     */
    renderIPTVEditorSubsection() {
        const user = this.userData;
        const panel = this.cache.iptvPanels.find(p => p.id === user.iptv_panel_id);

        // The API returns the field as 'linked_playlist_id' (alias for iptv_editor_playlist_id)
        const hasEditorPlaylist = panel && (
            panel.linked_playlist_id ||
            panel.iptv_editor_playlist_id ||
            panel.linked_iptv_editor_playlist_id ||
            panel.playlist_id
        );

        const playlistId = panel?.linked_playlist_id || panel?.iptv_editor_playlist_id || panel?.linked_iptv_editor_playlist_id || panel?.playlist_id;

        console.log('IPTV Editor Check:', {
            panelId: user.iptv_panel_id,
            panel: !!panel,
            hasEditorPlaylist,
            playlistId,
            panelFields: panel ? {
                linked_playlist_id: panel.linked_playlist_id,
                iptv_editor_playlist_id: panel.iptv_editor_playlist_id,
                linked_iptv_editor_playlist_id: panel.linked_iptv_editor_playlist_id,
                playlist_id: panel.playlist_id
            } : null
        });

        if (user.iptv_editor_enabled) {
            // User has IPTV Editor - show details
            // Get editor account details from the accounts array
            const editorAccount = user.iptv_editor_accounts && user.iptv_editor_accounts.length > 0
                ? user.iptv_editor_accounts[0]
                : null;

            // Get the panel to find the provider base URL
            const panel = this.cache.iptvPanels?.find(p => p.id === user.iptv_panel_id);
            // Build M3U URL using DNS from settings
            let editorM3U = 'Not available';
            const editorDns = this.cache.iptvEditorSettings?.editor_dns;
            if (editorAccount && editorAccount.iptv_editor_username && editorAccount.iptv_editor_password && editorDns) {
                editorM3U = `${editorDns}/get.php?username=${editorAccount.iptv_editor_username}&password=${editorAccount.iptv_editor_password}&type=m3u_plus&output=ts`;
            }

            const editorId = editorAccount?.iptv_editor_id || editorAccount?.id || 'N/A';
            const editorUsername = editorAccount?.iptv_editor_username || 'N/A';
            const editorPassword = editorAccount?.iptv_editor_password || 'N/A';

            // Get expiration date from the IPTV Editor user data if available
            // Otherwise fall back to the panel expiration (from iptv_accounts) or database
            const panelAccount = user.iptv_accounts?.[0] || null;
            let expirationDate = editorAccount?.expiry_date || user.iptv_expiration_date;

            console.log('IPTV Editor Expiration Debug:', {
                editorAccount_expiry_date: editorAccount?.expiry_date,
                user_iptv_expiration_date: user.iptv_expiration_date,
                panelAccount: panelAccount,
                panelAccount_exp_date: panelAccount?.exp_date,
                expirationDate_before_fallback: expirationDate
            });

            // If still no expiration, try to get it from the panel account (real-time panel data)
            if (!expirationDate && panelAccount && panelAccount.exp_date) {
                if (typeof panelAccount.exp_date === 'number' || !isNaN(panelAccount.exp_date)) {
                    // Use local timezone to match IPTV Panel display
                    const d = new Date(parseInt(panelAccount.exp_date) * 1000);
                    expirationDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                } else {
                    expirationDate = panelAccount.exp_date;
                }
            }
            console.log('IPTV Editor Expiration Final:', expirationDate);

            return `
                <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid var(--border-color);">
                    <h4 style="margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fas fa-edit" style="color: var(--primary-color);"></i> IPTV Editor</span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-sm btn-danger" onclick="EditUser.deleteIPTVEditorAccess()" title="Delete IPTV Editor Access">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="EditUser.syncIPTVEditor()" title="Force Sync">
                                <i class="fas fa-sync-alt"></i> Sync
                            </button>
                        </div>
                    </h4>

                    <!-- Compact IPTV Editor Info -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;">
                        <div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">ID:</div>
                            <div style="font-weight: 600;">${Utils.escapeHtml(String(editorId))}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Username:</div>
                            <div style="font-weight: 600;">${Utils.escapeHtml(editorUsername)}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Password:</div>
                            <div style="font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                                ${Utils.escapeHtml(editorPassword)}
                                ${editorPassword !== 'N/A' ? `
                                    <button class="btn btn-sm btn-outline" onclick="EditUser.copyToClipboard('${Utils.escapeHtml(editorPassword)}', 'Password')" title="Copy" style="padding: 0.125rem 0.375rem; font-size: 0.75rem;">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Expiration:</div>
                            <div style="font-weight: 600;">${expirationDate ? new Date(expirationDate).toLocaleDateString() : 'N/A'}</div>
                        </div>
                    </div>

                    <!-- M3U URL -->
                    <div class="form-group">
                        <label for="edit-iptv-editor-m3u">M3U URL:</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input
                                type="text"
                                id="edit-iptv-editor-m3u"
                                class="form-input"
                                value="${editorM3U}"
                                readonly
                                style="flex: 1; font-size: 0.875rem; font-family: monospace;"
                            />
                            ${editorM3U !== 'Not available' ? `
                                <button class="btn btn-sm btn-outline" onclick="EditUser.copyToClipboard('${editorM3U}', 'M3U URL')" title="Copy">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // User doesn't have IPTV Editor - show create/search options
            return `
                <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid var(--border-color);">
                    <h4 style="margin-bottom: 1rem;">
                        <i class="fas fa-edit" style="color: var(--text-secondary);"></i> IPTV Editor Access
                    </h4>
                    <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.875rem;">
                        This user does not have IPTV Editor access.
                    </p>
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        ${hasEditorPlaylist ? `
                            <button class="btn btn-primary" onclick="EditUser.createIPTVEditor()">
                                <i class="fas fa-plus-circle"></i> Create IPTV Editor User
                            </button>
                        ` : `
                            <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem; border: 1px solid var(--border-color); font-size: 0.875rem;">
                                <i class="fas fa-info-circle"></i> Panel has no linked IPTV Editor playlist
                            </div>
                        `}
                        <button class="btn btn-outline" onclick="EditUser.searchIPTVEditor()">
                            <i class="fas fa-search"></i> Search & Link Existing User
                        </button>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Render add services section
     */
    renderAddServicesSection() {
        const user = this.userData;
        const needsPlex = !user.plex_enabled;
        const needsIPTV = !user.iptv_enabled;

        return `
            <section class="edit-section">
                <h3><i class="fas fa-plus-circle"></i> Add Services</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    Grant this user access to additional services.
                </p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    ${needsPlex ? `
                        <button class="btn btn-primary" onclick="EditUser.showAddPlexModal()">
                            <i class="fas fa-film"></i> Add Plex Access
                        </button>
                    ` : ''}
                    ${needsIPTV ? `
                        <button class="btn btn-primary" onclick="EditUser.showAddIPTVModal()">
                            <i class="fas fa-broadcast-tower"></i> Add IPTV Access
                        </button>
                    ` : ''}
                    ${!needsPlex && !needsIPTV ? `
                        <p style="color: var(--text-secondary);">
                            <i class="fas fa-check-circle"></i> User has access to all available services
                        </p>
                    ` : ''}
                </div>
            </section>
        `;
    },

    /**
     * Attach change listeners to track unsaved changes
     */
    attachChangeListeners() {
        const inputs = document.querySelectorAll('[data-track-changes]');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.hasUnsavedChanges = true;
            });
        });
    },

    /**
     * Attach package change listeners to auto-calculate expiration dates
     */
    attachPackageChangeListeners() {
        const plexPackageSelect = document.getElementById('edit-plex-package');
        const iptvPackageSelect = document.getElementById('edit-iptv-package');

        if (plexPackageSelect) {
            plexPackageSelect.addEventListener('change', (e) => {
                this.calculateExpirationDate('plex', e.target);
            });
        }

        if (iptvPackageSelect) {
            iptvPackageSelect.addEventListener('change', (e) => {
                this.calculateExpirationDate('iptv', e.target);
            });
        }
    },

    /**
     * Calculate and set expiration date based on selected package
     */
    calculateExpirationDate(type, selectElement) {
        const selectedOption = selectElement.options[selectElement.selectedIndex];
        const billingInterval = selectedOption.dataset.billingInterval;

        if (!billingInterval || !selectElement.value) {
            return;
        }

        // Parse billing interval (e.g., "1 Month", "3 Months", "12 Months")
        const match = billingInterval.match(/(\d+)\s*(Month|Year|Day|Week)s?/i);
        if (!match) {
            console.warn('Unable to parse billing interval:', billingInterval);
            return;
        }

        const quantity = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        // Calculate expiration date
        const today = new Date();
        let expirationDate = new Date(today);

        switch (unit) {
            case 'day':
                expirationDate.setDate(today.getDate() + quantity);
                break;
            case 'week':
                expirationDate.setDate(today.getDate() + (quantity * 7));
                break;
            case 'month':
                expirationDate.setMonth(today.getMonth() + quantity);
                break;
            case 'year':
                expirationDate.setFullYear(today.getFullYear() + quantity);
                break;
            default:
                console.warn('Unknown billing interval unit:', unit);
                return;
        }

        // Format date as YYYY-MM-DD for input field
        const formattedDate = expirationDate.toISOString().split('T')[0];

        // Set the expiration date field
        const expirationInput = document.getElementById(`edit-${type}-expiration`);
        if (expirationInput) {
            expirationInput.value = formattedDate;
            this.hasUnsavedChanges = true;
        }
    },

    /**
     * Handle close button - check for unsaved changes
     */
    async handleClose() {
        if (this.hasUnsavedChanges) {
            const shouldDiscard = await Utils.confirm(
                'Unsaved Changes',
                'You have unsaved changes. Are you sure you want to discard them?'
            );

            if (!shouldDiscard) {
                return; // User cancelled, stay on page
            }
        }

        // Navigate back to users page
        Router.navigate('users');
    },

    /**
     * Handle save button - save all changes
     */
    async handleSave() {
        try {
            Utils.showLoading();

            // Collect form data
            const updates = this.collectFormData();

            // Validate required fields
            if (!updates.basic.name || !updates.basic.email) {
                Utils.hideLoading();
                Utils.showToast('Error', 'Name and email are required', 'error');
                return;
            }

            // Save basic user info (includes Plex and IPTV updates)
            await API.updateUser(this.userId, updates.basic);

            // Handle tags separately
            if (updates.tagsChanged) {
                await this.updateUserTags(updates.basic.tag_ids);
            }

            Utils.hideLoading();
            Utils.showToast('Success', 'User updated successfully', 'success');

            // Update Plex library access if libraries were changed (non-blocking)
            if (this.userData.plex_enabled && updates.plex.librariesChanged) {
                Utils.showToast(
                    'Updating Plex Libraries',
                    'Updating Plex library access in background...',
                    'info',
                    3000
                );

                // Run in background without blocking
                (async () => {
                    try {
                        console.log('Updating Plex library access...', updates.plex.servers);
                        await API.updatePlexLibraries(this.userId, updates.plex.servers);
                        Utils.showToast(
                            'Plex Library Update Complete',
                            'Plex library access has been updated successfully',
                            'success',
                            3000
                        );
                        // Reload user data to reflect changes
                        await this.loadUserData();
                        this.originalData = JSON.parse(JSON.stringify(this.userData));

                        // Re-render the Plex section to show updated checkboxes
                        const plexSection = document.querySelector('.edit-section:has(h3 i.fa-film)');
                        if (plexSection) {
                            const plexSectionHTML = this.renderPlexSection();
                            plexSection.outerHTML = plexSectionHTML;
                            // Re-attach package change listeners after re-rendering
                            this.attachPackageChangeListeners();
                        }
                    } catch (error) {
                        console.error('Failed to update Plex library access:', error);
                        Utils.showToast(
                            'Plex Library Update Failed',
                            error.message || 'Failed to update Plex library access',
                            'error',
                            5000
                        );
                    }
                })();
            }

            // Mark as saved
            this.hasUnsavedChanges = false;

            // Reload user data to reflect changes
            await this.loadUserData();
            this.originalData = JSON.parse(JSON.stringify(this.userData));

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving user:', error);
            Utils.showToast('Error', error.message || 'Failed to save user', 'error');
        }
    },

    /**
     * Collect form data
     */
    collectFormData() {
        const user = this.userData;

        // Basic info
        const paymentPreference = document.getElementById('edit-payment-preference').value;
        const basicUpdates = {
            name: document.getElementById('edit-name').value.trim(),
            email: document.getElementById('edit-email').value.trim(),
            owner_id: document.getElementById('edit-owner').value || null,
            notes: document.getElementById('edit-notes').value.trim(),
            exclude_from_bulk_emails: document.getElementById('edit-exclude-bulk-emails').checked,
            exclude_from_automated_emails: document.getElementById('edit-exclude-automated-emails').checked,
            bcc_owner_on_renewal: document.getElementById('edit-bcc-owner').checked,
            payment_preference: paymentPreference,
            custom_payment_methods: paymentPreference === 'custom' ? this.getSelectedCustomPaymentMethods() : []
        };

        // Tags (collect from badge display)
        const tagBadges = document.querySelectorAll('.tag-badge');
        const selectedTagIds = Array.from(tagBadges).map(badge => parseInt(badge.dataset.tagId));
        const originalTagIds = (user.tags || []).map(t => t.id).sort();
        const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds);
        basicUpdates.tag_ids = selectedTagIds;

        // Request Site Access (auto/enabled/disabled -> null/1/0)
        const rsHasAccessValue = document.getElementById('edit-rs-has-access').value;
        basicUpdates.rs_has_access = rsHasAccessValue === 'auto' ? null : (rsHasAccessValue === 'enabled' ? 1 : 0);

        // Plex updates
        let plexUpdates = {
            librariesChanged: false,
            servers: []
        };

        if (user.plex_enabled) {
            plexUpdates.email = document.getElementById('edit-plex-email').value.trim();
            plexUpdates.package_id = document.getElementById('edit-plex-package').value || null;
            const plexExpirationValue = document.getElementById('edit-plex-expiration').value;
            if (plexExpirationValue) {
                plexUpdates.expiration_date = plexExpirationValue;
            }

            // Check if libraries changed
            const libraryCheckboxes = document.querySelectorAll('.plex-library-checkbox');
            const newLibraries = {};

            libraryCheckboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    const serverId = parseInt(checkbox.dataset.serverId);
                    const libraryId = checkbox.dataset.libraryId;
                    const libraryName = checkbox.dataset.libraryName;

                    if (!newLibraries[serverId]) {
                        newLibraries[serverId] = [];
                    }
                    newLibraries[serverId].push({ library_id: libraryId, library_name: libraryName });
                }
            });

            // Convert to array format - include servers that have checkboxes in the UI
            // Capture ALL unique server IDs from the library checkboxes (checked or not)
            const allServerIds = new Set();

            // Add servers from all library checkboxes displayed in the UI
            // This captures servers that may have been checked and are now unchecked
            libraryCheckboxes.forEach(checkbox => {
                const serverId = parseInt(checkbox.dataset.serverId);
                if (serverId) allServerIds.add(serverId);
            });

            // Also include servers from existing shares (in case checkboxes weren't rendered for some reason)
            (user.plex_shares || []).forEach(share => allServerIds.add(share.plex_server_id));

            plexUpdates.servers = Array.from(allServerIds).map(serverId => ({
                server_id: serverId,
                library_ids: newLibraries[serverId]
                    ? newLibraries[serverId].map(l => l.library_id)
                    : []
            }));

            // Determine if libraries actually changed
            // Build original state from database shares
            const originalLibraries = {};
            (user.plex_shares || []).forEach(share => {
                const libraryIds = Array.isArray(share.library_ids) ? share.library_ids : [];
                originalLibraries[share.plex_server_id] = libraryIds.map(id => String(id)).sort();
            });

            // Build new state from the servers array we're about to send
            const newLibrariesForComparison = {};
            plexUpdates.servers.forEach(server => {
                newLibrariesForComparison[server.server_id] = server.library_ids.map(id => String(id)).sort();
            });

            console.log('Library Change Detection:', {
                original: originalLibraries,
                new: newLibrariesForComparison
            });

            // Compare each server in either original or new
            let librariesChanged = false;
            for (const serverId of allServerIds) {
                const originalLibs = originalLibraries[serverId] || [];
                const newLibs = newLibrariesForComparison[serverId] || [];
                if (JSON.stringify(originalLibs) !== JSON.stringify(newLibs)) {
                    librariesChanged = true;
                    console.log(`Libraries changed for server ${serverId}:`, { original: originalLibs, new: newLibs });
                    break;
                }
            }

            if (librariesChanged) {
                plexUpdates.librariesChanged = true;
                console.log('Libraries changed detected!');
            } else {
                console.log('No library changes detected');
            }

            // Add plex updates to basic updates
            basicUpdates.plex_email = plexUpdates.email;
            basicUpdates.plex_package_id = plexUpdates.package_id;
            // Only include expiration date if it was set
            if (plexUpdates.expiration_date !== undefined) {
                basicUpdates.plex_expiration_date = plexUpdates.expiration_date;
            }
        }

        // IPTV updates
        let iptvUpdates = {
            changed: false
        };

        if (user.iptv_enabled) {
            const newSubscriptionPlanId = document.getElementById('edit-iptv-subscription')?.value || null;
            const newChannelGroupId = document.getElementById('edit-iptv-channel-group')?.value || null;
            const iptvExpirationValue = document.getElementById('edit-iptv-expiration')?.value;

            // Get username and password from the form (may have been updated via sync)
            const iptvUsername = document.getElementById('edit-iptv-username')?.value || null;
            const iptvPassword = document.getElementById('edit-iptv-password')?.value || null;

            iptvUpdates.subscription_plan_id = newSubscriptionPlanId;
            iptvUpdates.channel_group_id = newChannelGroupId;
            iptvUpdates.username = iptvUsername;
            iptvUpdates.password = iptvPassword;
            if (iptvExpirationValue) {
                iptvUpdates.expiration_date = iptvExpirationValue;
            }

            // Check if changed
            const originalExpDate = user.iptv_expiration_date ? user.iptv_expiration_date.split('T')[0] : null;
            if (newSubscriptionPlanId != user.iptv_subscription_plan_id || newChannelGroupId != user.iptv_channel_group_id || (iptvExpirationValue && iptvExpirationValue != originalExpDate)) {
                iptvUpdates.changed = true;
            }

            // Add to basic updates
            basicUpdates.iptv_subscription_plan_id = iptvUpdates.subscription_plan_id;
            basicUpdates.iptv_channel_group_id = iptvUpdates.channel_group_id;
            // Include username and password so they persist after sync
            basicUpdates.iptv_username = iptvUpdates.username;
            basicUpdates.iptv_password = iptvUpdates.password;
            // Only include expiration date if it was set
            if (iptvUpdates.expiration_date !== undefined) {
                basicUpdates.iptv_expiration_date = iptvUpdates.expiration_date;
            }

            // VOD visibility settings
            basicUpdates.show_iptv_movies = document.getElementById('edit-iptv-show-movies')?.checked ? 1 : 0;
            basicUpdates.show_iptv_series = document.getElementById('edit-iptv-show-series')?.checked ? 1 : 0;
        }

        return {
            basic: basicUpdates,
            plex: plexUpdates,
            iptv: iptvUpdates,
            tagsChanged
        };
    },

    /**
     * Update user tags
     */
    async updateUserTags(tagIds) {
        const user = this.userData;
        // Ensure consistent integer types for comparison
        const originalTagIds = (user.tags || []).map(t => parseInt(t.id));
        const newTagIds = tagIds.map(id => parseInt(id));

        // Determine which tags to add and remove
        const tagsToAdd = newTagIds.filter(id => !originalTagIds.includes(id));
        const tagsToRemove = originalTagIds.filter(id => !newTagIds.includes(id));

        // Add new tags (silent mode handles "already assigned" gracefully without console errors)
        for (const tagId of tagsToAdd) {
            await API.assignTag(tagId, this.userId, { silent: true });
        }

        // Remove old tags (silent mode handles "not found" gracefully without console errors)
        for (const tagId of tagsToRemove) {
            await API.unassignTag(tagId, this.userId, { silent: true });
        }

        console.log('Tags updated successfully');
    },

    /**
     * Show modal to add Plex access
     */
    async showAddPlexModal() {
        // Open the wizard in add_plex mode
        if (typeof CreateUserWizard !== 'undefined') {
            await CreateUserWizard.initAddService(this.userData, 'plex');
            Utils.showModal({
                title: 'Add Plex Service',
                size: 'xlarge',
                body: `<div id="wizard-modal-content" style="min-height: 500px;"></div>`,
                hideButtons: true
            });
            await CreateUserWizard.render('wizard-modal-content');
        } else {
            Utils.showToast('Error', 'Wizard component not available', 'error');
        }
    },

    /**
     * Show modal to add IPTV access
     */
    async showAddIPTVModal() {
        // Open the wizard in add_iptv mode
        if (typeof CreateUserWizard !== 'undefined') {
            await CreateUserWizard.initAddService(this.userData, 'iptv');
            Utils.showModal({
                title: 'Add IPTV Service',
                size: 'xlarge',
                body: `<div id="wizard-modal-content" style="min-height: 500px;"></div>`,
                hideButtons: true
            });
            await CreateUserWizard.render('wizard-modal-content');
        } else {
            Utils.showToast('Error', 'Wizard component not available', 'error');
        }
    },

    /**
     * Attach tag dropdown listener
     */
    attachTagDropdownListener() {
        const tagDropdown = document.getElementById('edit-tags-dropdown');
        if (tagDropdown) {
            tagDropdown.addEventListener('change', (e) => {
                const tagId = parseInt(e.target.value);
                if (tagId) {
                    this.addTag(tagId);
                    e.target.value = ''; // Reset dropdown
                }
            });
        }
    },

    /**
     * Add tag to user
     */
    addTag(tagId) {
        const tag = this.cache.tags.find(t => t.id === tagId);
        if (!tag) return;

        // Check if tag already added
        const display = document.getElementById('selected-tags-display');
        if (display.querySelector(`[data-tag-id="${tagId}"]`)) {
            return; // Already added
        }

        // Add tag badge
        const tagBadge = document.createElement('span');
        tagBadge.className = 'tag-badge';
        tagBadge.setAttribute('data-tag-id', tagId);
        tagBadge.style.cssText = `background-color: ${tag.color}; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;`;
        tagBadge.innerHTML = `
            ${Utils.escapeHtml(tag.name)}
            <i class="fas fa-times" onclick="EditUser.removeTag(${tagId})" style="cursor: pointer; font-size: 0.75rem;"></i>
        `;
        display.appendChild(tagBadge);

        this.hasUnsavedChanges = true;
    },

    /**
     * Remove tag from user
     */
    removeTag(tagId) {
        const tagBadge = document.querySelector(`[data-tag-id="${tagId}"]`);
        if (tagBadge) {
            tagBadge.remove();
            this.hasUnsavedChanges = true;
        }
    },

    /**
     * Handle payment preference change
     */
    handlePaymentPreferenceChange() {
        const preference = document.getElementById('edit-payment-preference').value;
        const customSection = document.getElementById('custom-payment-methods-section');

        if (preference === 'custom') {
            customSection.style.display = 'block';
            this.loadCustomPaymentMethods();
        } else {
            customSection.style.display = 'none';
        }

        this.hasUnsavedChanges = true;
    },

    /**
     * Load available payment methods for custom selection
     */
    async loadCustomPaymentMethods() {
        const container = document.getElementById('custom-payment-methods-list');

        try {
            const response = await API.getPaymentProviders(false);
            const providers = response.providers || [];

            // Get user's current custom payment methods
            const userCustomMethods = this.userData.custom_payment_methods || [];
            const selectedMethodIds = Array.isArray(userCustomMethods)
                ? userCustomMethods.map(m => typeof m === 'object' ? m.id : m)
                : [];

            if (providers.length === 0) {
                container.innerHTML = `
                    <div class="text-center" style="color: var(--text-secondary); padding: 1rem;">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>No payment providers configured. Add payment options in Settings > Subscription Plans.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div style="display: grid; gap: 0.5rem;">
                    ${providers.filter(p => p.is_active).map(provider => `
                        <label class="checkbox-label" style="display: flex; align-items: center; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px; cursor: pointer;">
                            <input
                                type="checkbox"
                                class="custom-payment-checkbox"
                                value="${provider.id}"
                                data-name="${Utils.escapeHtml(provider.name)}"
                                data-url="${Utils.escapeHtml(provider.payment_url)}"
                                ${selectedMethodIds.includes(provider.id) ? 'checked' : ''}
                                onchange="EditUser.hasUnsavedChanges = true"
                            />
                            <span style="margin-left: 0.5rem; flex: 1;">
                                <strong>${Utils.escapeHtml(provider.name)}</strong>
                                <small style="display: block; color: var(--text-secondary);">${Utils.escapeHtml(provider.payment_url)}</small>
                            </span>
                            ${provider.qr_code_data ? '<i class="fas fa-qrcode" style="color: var(--success-color); margin-left: 0.5rem;" title="Has QR Code"></i>' : ''}
                        </label>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Error loading payment providers:', error);
            container.innerHTML = `
                <div class="text-center" style="color: var(--danger-color); padding: 1rem;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load payment providers</p>
                </div>
            `;
        }
    },

    /**
     * Get selected custom payment method IDs
     */
    getSelectedCustomPaymentMethods() {
        const checkboxes = document.querySelectorAll('.custom-payment-checkbox:checked');
        return Array.from(checkboxes).map(cb => parseInt(cb.value));
    },

    /**
     * Generate IPTV M3U URL
     */
    generateIPTVM3U(panel, username, password) {
        if (!panel || !username || !password) {
            console.log('Missing data for M3U generation:', { panel: !!panel, username, password: !!password });
            return '';
        }

        // If panel already has m3u_url stored, use it
        if (panel.m3u_url) {
            console.log('Using stored M3U URL from panel:', panel.m3u_url);
            return panel.m3u_url;
        }

        // Otherwise generate from base_url or provider_base_url
        const baseUrl = panel.provider_base_url || panel.base_url || panel.login_url;

        if (!baseUrl) {
            console.log('No base URL found on panel:', panel);
            return '';
        }

        // Remove trailing /panel or /panel/ and trailing slashes
        const cleanUrl = baseUrl.replace(/\/panel\/?$/, '').replace(/\/$/, '');

        const m3uUrl = `${cleanUrl}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
        console.log('Generated M3U URL:', m3uUrl);
        return m3uUrl;
    },

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text, label = 'Text') {
        try {
            await navigator.clipboard.writeText(text);
            Utils.showToast('Copied', `${label} copied to clipboard`, 'success');
        } catch (error) {
            console.error('Failed to copy:', error);
            Utils.showToast('Error', 'Failed to copy to clipboard', 'error');
        }
    },

    /**
     * Regenerate IPTV M3U
     */
    async regenerateIPTVM3U() {
        const user = this.userData;
        const panel = this.cache.iptvPanels.find(p => p.id === user.iptv_panel_id);

        if (!panel) {
            Utils.showToast('Error', 'Panel not found', 'error');
            return;
        }

        // Generate new M3U (password stays the same, just regenerate the URL)
        const newM3U = this.generateIPTVM3U(panel, user.iptv_username, user.iptv_password);

        // Update the input field
        const m3uInput = document.getElementById('edit-iptv-m3u');
        if (m3uInput) {
            m3uInput.value = newM3U;
        }

        Utils.showToast('Success', 'M3U URL regenerated', 'success');
    },

    /**
     * Create IPTV Editor user
     */
    async createIPTVEditor() {
        const confirmed = await Utils.confirm(
            'Create IPTV Editor User',
            'This will create a new IPTV Editor user. Continue?'
        );

        if (!confirmed) return;

        try {
            Utils.showLoading();

            const user = this.userData;
            const panel = this.cache.iptvPanels.find(p => p.id === user.iptv_panel_id);
            const playlistId = panel?.linked_playlist_id || panel?.iptv_editor_playlist_id || panel?.linked_iptv_editor_playlist_id;

            if (!panel || !playlistId) {
                throw new Error('Panel has no linked IPTV Editor playlist');
            }

            // Get selected channel package/bouquet from dropdown
            const channelGroupId = document.getElementById('edit-iptv-channel-group')?.value;

            // Call endpoint that handles everything (backend will look up category IDs from the channel group)
            const response = await API.createIPTVEditorUserForExistingUser(this.userId, {
                iptv_editor_playlist_id: playlistId,
                iptv_channel_group_id: channelGroupId ? parseInt(channelGroupId) : null
            });

            // Log the full response including debug data
            console.log('========== IPTV EDITOR CREATION RESPONSE ==========');
            console.log('Full API Response:', response);
            if (response.debug) {
                console.log('\n📤 CREATE USER REQUEST:', response.debug.createUserRequest);
                console.log('\n📥 CREATE USER RESPONSE:', response.debug.createUserResponse);
                console.log('\n📤 GET-DATA REQUEST:', response.debug.getDataRequest);
                console.log('\n📥 GET-DATA RESPONSE:', response.debug.getDataResponse);
                console.log('\n🔍 EXTRACTION RESULTS:', response.debug.extraction);
            }
            console.log('==================================================\n');

            if (response.success) {
                Utils.hideLoading();

                // Show created credentials
                const editorUser = response.editorUser || response.data?.editorUser;
                let message = 'IPTV Editor user created successfully';
                if (editorUser) {
                    message += `\n\nUsername: ${editorUser.username || 'N/A'}`;
                    message += `\nPassword: ${editorUser.password || 'N/A'}`;
                    if (editorUser.expiration_date) {
                        message += `\nExpiration: ${new Date(editorUser.expiration_date).toLocaleDateString()}`;
                    }
                }

                Utils.showToast('Success', message, 'success');

                // Reload user data and re-render
                await this.loadUserData();
                const contentDiv = document.getElementById('page-content');
                this.renderEditForm(contentDiv);
            } else {
                throw new Error(response.message || 'Failed to create IPTV Editor user');
            }

        } catch (error) {
            Utils.hideLoading();
            console.error('Create IPTV Editor error:', error);
            Utils.showToast('Error', error.message || 'Failed to create IPTV Editor user', 'error');
        }
    },

    /**
     * Search and link existing IPTV Editor user
     */
    async searchIPTVEditor() {
        const panel = this.cache.iptvPanels.find(p => p.id === this.userData.iptv_panel_id);
        const playlistId = panel?.linked_playlist_id || panel?.iptv_editor_playlist_id || panel?.linked_iptv_editor_playlist_id;

        if (!panel || !playlistId) {
            Utils.showToast('Error', 'Panel has no linked IPTV Editor playlist', 'error');
            return;
        }

        // Show search modal
        Utils.showModal({
            title: 'Search IPTV Editor User',
            size: 'medium',
            body: `
                <div class="form-group">
                    <label for="iptv-editor-search">Search IPTV Editor Users</label>
                    <input
                        type="text"
                        id="iptv-editor-search"
                        class="form-input"
                        placeholder="Search by username or name..."
                        autofocus
                    />
                </div>
                <div id="iptv-editor-search-results" style="margin-top: 1rem;"></div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Search',
                    class: 'btn-primary',
                    onClick: () => this.performIPTVEditorSearch(playlistId)
                }
            ]
        });
    },

    /**
     * Perform IPTV Editor search
     */
    async performIPTVEditorSearch(playlistId) {
        const searchInput = document.getElementById('iptv-editor-search');
        const username = searchInput.value.trim();

        if (!username) {
            Utils.showToast('Error', 'Please enter a username', 'error');
            return;
        }

        try {
            const resultsDiv = document.getElementById('iptv-editor-search-results');
            resultsDiv.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';

            // Search for IPTV Editor user
            const response = await API.searchIPTVEditorForUser(username, playlistId);

            if (response.users && response.users.length > 0) {
                resultsDiv.innerHTML = `
                    <div style="border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; background: var(--bg-secondary);">
                        <h4 style="margin-bottom: 0.75rem;">Found ${response.users.length} user(s):</h4>
                        ${response.users.map(user => `
                            <div style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; margin-bottom: 0.5rem; background: var(--card-bg);">
                                <strong>${Utils.escapeHtml(user.name || user.username)}</strong>
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
                                    Username: ${Utils.escapeHtml(user.username)} | ID: ${user.id} | Expires: ${user.exp_date || 'N/A'}
                                </div>
                                <button class="btn btn-sm btn-primary" onclick="EditUser.linkIPTVEditorUser(${user.id}, '${Utils.escapeHtml(user.username)}', '${Utils.escapeHtml(user.password)}')" style="margin-top: 0.5rem;">
                                    Link This User
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                resultsDiv.innerHTML = `
                    <div style="padding: 1rem; text-align: center; color: var(--text-secondary);">
                        No users found matching "${Utils.escapeHtml(username)}"
                    </div>
                `;
            }
        } catch (error) {
            const resultsDiv = document.getElementById('iptv-editor-search-results');
            resultsDiv.innerHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--danger-color);">
                    Error: ${Utils.escapeHtml(error.message)}
                </div>
            `;
        }
    },

    /**
     * Link IPTV Editor user
     */
    async linkIPTVEditorUser(editorId, username, password) {
        try {
            Utils.showLoading();

            const user = this.userData;
            const panel = this.cache.iptvPanels.find(p => p.id === user.iptv_panel_id);
            const playlistId = panel?.linked_playlist_id || panel?.iptv_editor_playlist_id || panel?.linked_iptv_editor_playlist_id;

            if (!panel || !playlistId) {
                throw new Error('Panel has no linked IPTV Editor playlist');
            }

            // Call new endpoint that handles everything
            const response = await API.linkIPTVEditorUserForExistingUser(this.userId, {
                iptv_editor_playlist_id: playlistId,
                iptv_editor_username: username,
                iptv_editor_password: password
            });

            if (response.success) {
                Utils.hideLoading();
                Utils.closeModal();
                Utils.showToast('Success', 'IPTV Editor user linked successfully', 'success');

                // Reload user data
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to link IPTV Editor user');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to link IPTV Editor user', 'error');
        }
    },

    /**
     * Sync IPTV Editor user
     */
    async syncIPTVEditor() {
        const confirmed = await Utils.confirm(
            'Sync IPTV Editor',
            'This will force a sync of this IPTV Editor user from the IPTV Editor service. This will update the expiration date and other details. Continue?'
        );

        if (!confirmed) return;

        try {
            Utils.showLoading();

            // Get the playlist ID from the editor account
            const editorAccount = this.userData.iptv_editor_accounts && this.userData.iptv_editor_accounts.length > 0
                ? this.userData.iptv_editor_accounts[0]
                : null;

            if (!editorAccount || !editorAccount.iptv_editor_playlist_id) {
                throw new Error('No IPTV Editor account found for this user');
            }

            // Call the force-sync API
            const response = await API.forceSyncIPTVEditorUser(
                editorAccount.iptv_editor_playlist_id,
                this.userId
            );

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', 'IPTV Editor user synced successfully', 'success');

                // Reload user data to show updated information
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to sync IPTV Editor user');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to sync IPTV Editor user', 'error');
        }
    },

    /**
     * Toggle server libraries visibility
     */
    toggleServerLibraries(serverId) {
        const librariesDiv = document.getElementById(`server-libraries-${serverId}`);
        const toggleIcon = document.getElementById(`server-toggle-${serverId}`);

        if (librariesDiv && toggleIcon) {
            const isCurrentlyVisible = librariesDiv.style.display !== 'none';

            if (isCurrentlyVisible) {
                librariesDiv.style.display = 'none';
                toggleIcon.className = 'fas fa-chevron-right';
            } else {
                librariesDiv.style.display = 'grid';
                toggleIcon.className = 'fas fa-chevron-down';
            }
        }
    },

    /**
     * Sync Plex library access from all Plex servers
     */
    async syncPlexLibraries() {
        const btn = event.target.closest('button');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        btn.disabled = true;

        try {
            const response = await API.request(`/users/${this.userId}/sync-plex-libraries`, { method: 'POST' });

            if (response.success) {
                // Build result message
                let message = response.message;
                if (response.results && response.results.length > 0) {
                    const details = response.results.map(r =>
                        `${r.server_name}: ${r.success ? `${r.libraries_found} libraries` : r.message}`
                    ).join('\n');
                    message += '\n\n' + details;
                }

                Utils.showToast(message, 'success');

                // Reload user data to refresh the checkboxes
                await this.loadUserData();
                this.originalData = JSON.parse(JSON.stringify(this.userData));

                // Re-render the Plex section
                const plexSection = document.querySelector('.edit-section:has(h3 i.fa-film)');
                if (plexSection) {
                    plexSection.outerHTML = this.renderPlexSection();
                    this.attachPackageChangeListeners();
                }
            } else {
                Utils.showToast(response.message || 'Failed to sync libraries', 'error');
            }
        } catch (error) {
            console.error('Error syncing Plex libraries:', error);
            Utils.showToast('Error syncing Plex libraries: ' + error.message, 'error');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    },

    /**
     * Delete Plex access for this user - show modal with options
     */
    async deletePlexAccess() {
        const user = this.userData;
        const plexServers = user.plex_shares || [];
        const serverList = plexServers.length > 0
            ? plexServers.map(s => `<li>${Utils.escapeHtml(s.server_name)}</li>`).join('')
            : '<li>No servers</li>';

        Utils.showModal({
            title: 'Delete Plex Access',
            size: 'medium',
            body: `
                <div id="delete-plex-modal-content">
                    <p><strong>Delete Plex access for ${Utils.escapeHtml(user.name)}?</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        This will remove Plex access from your local database.
                    </p>

                    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem;">
                        ${plexServers.length > 0 ? `
                            <p><strong>Plex Servers:</strong></p>
                            <ul style="margin-top: 0.5rem; margin-bottom: 0.5rem; padding-left: 1.5rem;">
                                ${serverList}
                            </ul>
                        ` : `
                            <p><strong>Plex Email:</strong> ${Utils.escapeHtml(user.plex_email || user.email || 'N/A')}</p>
                        `}

                        <label class="checkbox-label" style="margin-top: 0.75rem;">
                            <input type="checkbox" id="delete-from-plex-servers" checked />
                            Also remove from Plex servers (revokes library access)
                        </label>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem; margin-left: 1.5rem;">
                            <i class="fas fa-info-circle"></i> Uncheck to only remove from local database
                        </p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Delete Plex Access',
                    class: 'btn-danger',
                    onClick: () => this.confirmDeletePlexAccess()
                }
            ]
        });
    },

    /**
     * Confirm and execute Plex access deletion
     */
    async confirmDeletePlexAccess() {
        const deleteFromServers = document.getElementById('delete-from-plex-servers')?.checked ?? true;
        const modalContent = document.getElementById('delete-plex-modal-content');

        try {
            // Show loading in modal
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        <p><strong>Deleting Plex access${deleteFromServers ? ' and removing from servers' : ''}...</strong></p>
                    </div>
                `;
            }

            const response = await API.deletePlexAccess(this.userId, deleteFromServers);

            if (response.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Plex access deleted successfully', 'success');

                // Reload user data and re-render
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to delete Plex access');
            }
        } catch (error) {
            Utils.closeModal();
            console.error('Delete Plex access error:', error);
            Utils.showToast('Error', error.message || 'Failed to delete Plex access', 'error');
        }
    },

    /**
     * Sync IPTV Panel user data - fetches fresh info from the panel
     * Syncs: username, password, expiration, connections
     */
    async syncIPTVPanelUser() {
        const user = this.userData;

        if (!user.iptv_username) {
            Utils.showToast('Error', 'No IPTV username found for this user', 'error');
            return;
        }

        try {
            Utils.showLoading();

            // Call the search API to get fresh data from the panel
            const response = await API.searchIPTVPanelsForUser(user.iptv_username);

            Utils.hideLoading();

            if (response.success && response.found && response.results && response.results.length > 0) {
                // Get the first result (user's panel data)
                const panelResult = response.results[0];
                const userData = panelResult.user_data;

                if (userData) {
                    // Get expiration date string directly (no timestamp conversion to avoid timezone issues)
                    // Panel returns expiration_date as YYYY-MM-DD string, or expire_at for OneStream
                    let expDateString = null;

                    if (userData.expiration_date) {
                        // YYYY-MM-DD string from NXTDashPanel (preferred - no conversion needed)
                        expDateString = userData.expiration_date;
                        console.log(`📅 Using expiration_date directly: ${expDateString}`);
                    } else if (userData.expire_at) {
                        // ISO date string (OneStream format) - extract just YYYY-MM-DD
                        expDateString = userData.expire_at.split('T')[0].split(' ')[0];
                        console.log(`📅 Extracted date from expire_at: ${expDateString}`);
                    }

                    // Update in-memory user data with panel data
                    this.userData.iptv_accounts = [userData];

                    // Also update username, password, and expiration in the main user data
                    if (userData.username) {
                        this.userData.iptv_username = userData.username;
                    }
                    if (userData.password) {
                        this.userData.iptv_password = userData.password;
                    }
                    // Update expiration date using the string directly (no timezone conversion)
                    let expDisplay = 'N/A';
                    if (expDateString) {
                        console.log('📅 Sync expiration update:', {
                            oldValue: this.userData.iptv_expiration_date,
                            newValue: expDateString
                        });
                        this.userData.iptv_expiration_date = expDateString;
                        // Format for display: parse YYYY-MM-DD and display in local format
                        const [year, month, day] = expDateString.split('-');
                        expDisplay = `${parseInt(month)}/${parseInt(day)}/${year}`;
                    }

                    // Re-render the IPTV section to show updated data
                    console.log('📅 About to render with iptv_expiration_date:', this.userData.iptv_expiration_date);
                    const iptvSection = document.getElementById('iptv-panel-section');
                    if (iptvSection) {
                        iptvSection.outerHTML = this.renderIPTVSection();
                    }

                    Utils.showToast('Success', `IPTV data synced from ${panelResult.panel_name || 'panel'}. Username: ${userData.username || 'N/A'}, Connections: ${userData.max_connections || 'N/A'}, Expiration: ${expDisplay}`, 'success');
                } else {
                    Utils.showToast('Warning', 'User found but no detailed data returned', 'warning');
                }
            } else {
                Utils.showToast('Warning', response.message || 'User not found on any IPTV panel', 'warning');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message || 'Failed to sync IPTV panel user', 'error');
        }
    },

    /**
     * Renew IPTV subscription on the panel for this user
     */
    async renewIPTVSubscription() {
        const user = this.userData;
        const panelName = user.iptv_panel_name || 'IPTV Panel';
        const currentExpiration = user.iptv_expiration ? Utils.formatDate(user.iptv_expiration) : 'Unknown';

        // Show loading modal first
        Utils.showModal({
            title: 'Renew IPTV Subscription',
            size: 'medium',
            body: `
                <div id="renew-iptv-modal-content">
                    <div style="text-align: center; padding: 2rem 0;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        <p><strong>Loading available packages...</strong></p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                }
            ]
        });

        try {
            // Fetch available renewal packages
            const response = await API.getRenewalPackages(this.userId);
            const packages = response.packages || [];
            const currentPackageId = response.current_package_id;
            const panelType = response.panel_type; // 'one_stream', 'nxt_dash', etc.

            // Build package options HTML
            let packageOptionsHtml = '';
            if (packages.length > 0) {
                packageOptionsHtml = `
                    <div class="form-group" style="margin-top: 1rem;">
                        <label for="renewal-package-select"><strong>Select Package:</strong></label>
                        <select id="renewal-package-select" class="form-control" style="margin-top: 0.5rem;">
                            ${packages.map(pkg => {
                                // Use 'id' from renewal-packages API (which is the panel's package ID)
                                const pkgId = pkg.id;
                                const isCurrentPkg = pkgId == currentPackageId;
                                // Use duration_text from renewal-packages API, or fall back to duration/duration_in format
                                const durationText = pkg.duration_text || (pkg.duration && pkg.duration_in ? `${pkg.duration} ${pkg.duration_in}` : '');
                                const connectionsText = pkg.connections ? `${pkg.connections} connection${pkg.connections > 1 ? 's' : ''}` : '';
                                const creditsText = pkg.credits ? `${pkg.credits} credits` : '';
                                const details = [durationText, connectionsText, creditsText].filter(Boolean).join(' - ');
                                console.log('[renewIPTVSubscription] Generating option for package:', { pkgId, name: pkg.name, isCurrentPkg });
                                return `<option value="${pkgId}" ${isCurrentPkg ? 'selected' : ''}>${Utils.escapeHtml(pkg.name)}${details ? ` (${details})` : ''}${isCurrentPkg ? ' [Current]' : ''}</option>`;
                            }).join('')}
                        </select>
                    </div>
                `;
            } else {
                packageOptionsHtml = `
                    <p style="color: var(--warning-color); margin-top: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i> No packages available. Will use current package for renewal.
                    </p>
                `;
            }

            // Build bouquet sync dropdown for 1-Stream panels
            let bouquetSyncHtml = '';
            if (panelType === 'one_stream') {
                bouquetSyncHtml = `
                    <div class="form-group" style="margin-top: 1rem;">
                        <label for="bouquet-sync-select"><strong>Bouquet Sync Mode:</strong></label>
                        <select id="bouquet-sync-select" class="form-control" style="margin-top: 0.5rem;">
                            <option value="no_change" selected>No Change</option>
                            <option value="sync_all">Sync All</option>
                            <option value="sync_added">Sync Added</option>
                            <option value="sync_removed">Sync Removed</option>
                        </select>
                        <div style="margin-top: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 0.5rem; font-size: 0.85rem;">
                            <p style="color: var(--text-secondary); margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> <strong>Bouquet Sync Mode Options:</strong></p>
                            <ul style="color: var(--text-secondary); margin: 0; padding-left: 1.25rem; line-height: 1.6;">
                                <li><strong>No Change</strong> - The line bouquets list will not be changed.</li>
                                <li><strong>Sync All</strong> - All of the current line bouquets will be removed and only those in the selected package will be added to the line.</li>
                                <li><strong>Sync Added</strong> - Keep all of the current line bouquets and add any new bouquets from the renew package.</li>
                                <li><strong>Sync Removed</strong> - Any bouquets that are not in the renew package will be removed from the line (except those manually added by admin). No new bouquets will be added to the line.</li>
                            </ul>
                        </div>
                    </div>
                `;
            }

            // Update modal content with package selection
            const modalContent = document.getElementById('renew-iptv-modal-content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <p><strong>Renew IPTV subscription for ${Utils.escapeHtml(user.name)}?</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        Select a package to extend the IPTV subscription.
                    </p>

                    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem;">
                        <p><strong>Panel:</strong> ${Utils.escapeHtml(panelName)}</p>
                        <p style="margin-top: 0.25rem;"><strong>Current Expiration:</strong> ${currentExpiration}</p>
                        ${user.iptv_username ? `<p style="margin-top: 0.25rem;"><strong>Username:</strong> ${Utils.escapeHtml(user.iptv_username)}</p>` : ''}
                    </div>

                    ${packageOptionsHtml}
                    ${bouquetSyncHtml}

                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 1rem;">
                        <i class="fas fa-info-circle"></i> The new expiration will be calculated based on the package duration.
                    </p>
                `;

                // Add the Renew button now that content is loaded
                const modalFooter = document.querySelector('.modal-footer');
                if (modalFooter) {
                    const renewBtn = document.createElement('button');
                    renewBtn.className = 'btn btn-primary';
                    renewBtn.textContent = 'Renew Subscription';
                    renewBtn.onclick = () => this.confirmRenewIPTVSubscription();
                    modalFooter.appendChild(renewBtn);
                }
            }
        } catch (error) {
            console.error('Error fetching renewal packages:', error);
            // Show error in modal
            const modalContent = document.getElementById('renew-iptv-modal-content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--danger-color);"></i>
                        <p style="margin-top: 1rem;"><strong>Failed to load packages</strong></p>
                        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                            ${Utils.escapeHtml(error.message || 'Unable to fetch renewal packages from the panel.')}
                        </p>
                    </div>
                `;
            }
        }
    },

    /**
     * Confirm and execute IPTV subscription renewal
     */
    async confirmRenewIPTVSubscription() {
        const modalContent = document.getElementById('renew-iptv-modal-content');

        // Get selected package from dropdown
        const packageSelect = document.getElementById('renewal-package-select');
        const selectedPackageId = packageSelect ? packageSelect.value : null;

        // Debug logging
        console.log('[confirmRenewIPTVSubscription] packageSelect:', packageSelect);
        console.log('[confirmRenewIPTVSubscription] selectedPackageId:', selectedPackageId);
        console.log('[confirmRenewIPTVSubscription] packageSelect.options:', packageSelect ? Array.from(packageSelect.options).map(o => ({ value: o.value, text: o.text })) : null);

        // Get bouquet sync mode (for 1-Stream panels)
        const bouquetSyncSelect = document.getElementById('bouquet-sync-select');
        const bouquetSyncMode = bouquetSyncSelect ? bouquetSyncSelect.value : null;

        try {
            // Show loading in modal
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        <p><strong>Renewing IPTV subscription...</strong></p>
                        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                            Communicating with the IPTV panel...
                        </p>
                    </div>
                `;
            }

            const response = await API.renewIPTVSubscription(this.userId, selectedPackageId, bouquetSyncMode);

            if (response.success) {
                Utils.closeModal();
                const newExpiration = response.newExpiration ? Utils.formatDate(response.newExpiration) : 'Extended';
                Utils.showToast('Success', `IPTV subscription renewed! New expiration: ${newExpiration}`, 'success');

                // Reload user data and re-render
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to renew IPTV subscription');
            }
        } catch (error) {
            Utils.closeModal();
            console.error('Renew IPTV subscription error:', error);
            Utils.showToast('Error', error.message || 'Failed to renew IPTV subscription', 'error');
        }
    },

    /**
     * Delete IPTV access (and IPTV Editor if enabled) for this user
     */
    async deleteIPTVAccess() {
        const user = this.userData;
        const panelName = user.iptv_panel_name || 'IPTV Panel';
        const hasIPTVEditor = user.iptv_editor_enabled;

        Utils.showModal({
            title: 'Delete IPTV Access',
            size: 'medium',
            body: `
                <div id="delete-iptv-modal-content">
                    <p><strong>Delete IPTV access for ${Utils.escapeHtml(user.name)}?</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        This will remove IPTV access from your local database.
                        ${hasIPTVEditor ? '<br><em>This will also delete their IPTV Editor access.</em>' : ''}
                    </p>

                    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem;">
                        <p><strong>Panel:</strong> ${Utils.escapeHtml(panelName)}</p>
                        ${user.iptv_username ? `<p style="margin-top: 0.25rem;"><strong>Username:</strong> ${Utils.escapeHtml(user.iptv_username)}</p>` : ''}

                        <label class="checkbox-label" style="margin-top: 0.75rem;">
                            <input type="checkbox" id="delete-from-iptv-panel" checked />
                            Also remove from IPTV panel (deletes the line/user)
                        </label>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem; margin-left: 1.5rem;">
                            <i class="fas fa-info-circle"></i> Uncheck to only remove from local database
                        </p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Delete IPTV Access',
                    class: 'btn-danger',
                    onClick: () => this.confirmDeleteIPTVAccess()
                }
            ]
        });
    },

    /**
     * Confirm and execute IPTV access deletion
     */
    async confirmDeleteIPTVAccess() {
        const deleteFromPanel = document.getElementById('delete-from-iptv-panel')?.checked ?? true;
        const modalContent = document.getElementById('delete-iptv-modal-content');

        try {
            // Show loading in modal
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        <p><strong>Deleting IPTV access${deleteFromPanel ? ' and removing from panel' : ''}...</strong></p>
                    </div>
                `;
            }

            const response = await API.deleteIPTVAccess(this.userId, deleteFromPanel);

            if (response.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'IPTV access deleted successfully', 'success');

                // Reload user data and re-render
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to delete IPTV access');
            }
        } catch (error) {
            Utils.closeModal();
            console.error('Delete IPTV access error:', error);
            Utils.showToast('Error', error.message || 'Failed to delete IPTV access', 'error');
        }
    },

    /**
     * Delete IPTV Editor access only (keeping IPTV panel access)
     */
    async deleteIPTVEditorAccess() {
        const user = this.userData;

        Utils.showModal({
            title: 'Delete IPTV Editor Access',
            size: 'medium',
            body: `
                <div id="delete-iptv-editor-modal-content">
                    <p><strong>Delete IPTV Editor access for ${Utils.escapeHtml(user.name)}?</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        This will remove IPTV Editor access from your local database.
                        <br><em>Note: This will keep their IPTV panel access intact.</em>
                    </p>

                    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem;">
                        ${user.iptv_editor_username ? `<p><strong>IPTV Editor Username:</strong> ${Utils.escapeHtml(user.iptv_editor_username)}</p>` : ''}

                        <label class="checkbox-label" style="margin-top: 0.75rem;">
                            <input type="checkbox" id="delete-from-iptv-editor" checked />
                            Also remove from IPTV Editor service (deletes the user)
                        </label>
                        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem; margin-left: 1.5rem;">
                            <i class="fas fa-info-circle"></i> Uncheck to only remove from local database
                        </p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Delete IPTV Editor Access',
                    class: 'btn-danger',
                    onClick: () => this.confirmDeleteIPTVEditorAccess()
                }
            ]
        });
    },

    /**
     * Confirm and execute IPTV Editor access deletion
     */
    async confirmDeleteIPTVEditorAccess() {
        const deleteFromService = document.getElementById('delete-from-iptv-editor')?.checked ?? true;
        const modalContent = document.getElementById('delete-iptv-editor-modal-content');

        try {
            // Show loading in modal
            if (modalContent) {
                modalContent.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <div class="spinner" style="margin: 0 auto 1rem;"></div>
                        <p><strong>Deleting IPTV Editor access${deleteFromService ? ' and removing from service' : ''}...</strong></p>
                    </div>
                `;
            }

            const response = await API.deleteIPTVEditorAccess(this.userId, deleteFromService);

            if (response.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'IPTV Editor access deleted successfully', 'success');

                // Reload user data and re-render
                await this.loadUserData();
                this.renderEditForm(document.getElementById('page-content'));
            } else {
                throw new Error(response.message || 'Failed to delete IPTV Editor access');
            }
        } catch (error) {
            Utils.closeModal();
            console.error('Delete IPTV Editor access error:', error);
            Utils.showToast('Error', error.message || 'Failed to delete IPTV Editor access', 'error');
        }
    }
};
