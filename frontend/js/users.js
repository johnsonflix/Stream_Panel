/**
 * Users Page for StreamPanel
 */

const Users = {
    // Current filter state
    _expiringSoonFilter: '',
    _searchQuery: '',

    /**
     * Render users page
     */
    async render(container) {
        // Reset filters on page load
        this._expiringSoonFilter = '';
        this._searchQuery = '';

        container.innerHTML = `
            <div id="pending-requests-banner"></div>
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-users"></i>
                        Users
                    </h2>
                    <div class="flex gap-2 users-header-actions">
                        <input type="search" id="user-search" class="form-input users-search-input" placeholder="Search users...">
                        <button class="btn btn-secondary" onclick="Users.showAnnouncementsModal()">
                            <i class="fas fa-bullhorn"></i><span class="btn-text-desktop"> Announcements</span>
                        </button>
                        <button class="btn btn-secondary" onclick="Users.showCSVImportModal()">
                            <i class="fas fa-file-csv"></i><span class="btn-text-desktop"> CSV Import</span>
                        </button>
                        <button class="btn btn-primary" onclick="Users.showAddUserModal()">
                            <i class="fas fa-user-plus"></i><span class="btn-text-desktop"> Add User</span>
                        </button>
                    </div>
                </div>

                <!-- Expiring Soon Filter Buttons -->
                <div style="padding: 0 1.5rem; margin-bottom: 1rem;">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                        <span style="color: var(--text-secondary); font-size: 0.9rem; margin-right: 0.5rem;">
                            <i class="fas fa-filter"></i> Expiring Soon:
                        </span>
                        <button class="btn btn-sm btn-primary" id="filter-all" onclick="Users.setExpiringSoonFilter('')">
                            All Users
                        </button>
                        <button class="btn btn-sm btn-outline" id="filter-plex" onclick="Users.setExpiringSoonFilter('plex')">
                            <i class="fas fa-film" style="color: #e5a00d;"></i> Plex
                        </button>
                        <button class="btn btn-sm btn-outline" id="filter-iptv" onclick="Users.setExpiringSoonFilter('iptv')">
                            <i class="fas fa-tv" style="color: #6366f1;"></i> IPTV
                        </button>
                        <button class="btn btn-sm btn-outline" id="filter-any" onclick="Users.setExpiringSoonFilter('any')">
                            <i class="fas fa-clock" style="color: var(--warning-color);"></i> Any Service
                        </button>
                    </div>
                </div>

                <div id="users-list">
                    <div class="text-center mt-4 mb-4">
                        <div class="spinner" style="margin: 0 auto;"></div>
                        <p class="mt-2">Loading users...</p>
                    </div>
                </div>
            </div>
        `;

        // Setup search
        const searchInput = document.getElementById('user-search');
        searchInput.addEventListener('input', Utils.debounce((e) => {
            this._searchQuery = e.target.value;
            this.loadUsers();
        }, 500));

        // Load pending service requests banner
        await this.loadPendingRequestsBanner();

        // Load users
        await this.loadUsers();
    },

    /**
     * Set expiring soon filter and reload users
     */
    setExpiringSoonFilter(filter) {
        this._expiringSoonFilter = filter;

        // Update button styles
        document.querySelectorAll('[id^="filter-"]').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        });
        const activeBtn = document.getElementById(`filter-${filter || 'all'}`);
        if (activeBtn) {
            activeBtn.classList.remove('btn-outline');
            activeBtn.classList.add('btn-primary');
        }

        // Reload users with filter
        this.loadUsers();
    },

    /**
     * Load pending service requests banner
     */
    async loadPendingRequestsBanner() {
        const container = document.getElementById('pending-requests-banner');
        if (!container) return;

        try {
            const response = await API.getPendingServiceRequests();
            if (!response.success || response.count === 0) {
                container.innerHTML = '';
                return;
            }

            const requests = response.requests;
            const submittedCount = requests.filter(r => r.payment_status === 'submitted').length;
            const pendingCount = requests.filter(r => r.payment_status === 'pending').length;

            container.innerHTML = `
                <div class="card" style="background: linear-gradient(135deg, var(--primary-color), var(--primary-hover)); color: white; margin-bottom: 1.5rem;">
                    <div style="padding: 1rem 1.5rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="fas fa-bell" style="font-size: 1.5rem;"></i>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.1rem;">Service Requests Pending</h3>
                                    <p style="margin: 0.25rem 0 0 0; opacity: 0.9; font-size: 0.9rem;">
                                        ${submittedCount > 0 ? `<strong>${submittedCount} payment${submittedCount !== 1 ? 's' : ''} submitted</strong> for verification` : ''}
                                        ${submittedCount > 0 && pendingCount > 0 ? ' • ' : ''}
                                        ${pendingCount > 0 ? `${pendingCount} awaiting payment` : ''}
                                    </p>
                                </div>
                            </div>
                            <button class="btn" style="background: white; color: var(--primary-color);" onclick="Users.showServiceRequestsModal()">
                                <i class="fas fa-list"></i> View Requests
                            </button>
                        </div>
                        ${submittedCount > 0 ? `
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2);">
                                <p style="margin: 0 0 0.5rem 0; font-size: 0.85rem; opacity: 0.9;">Recent payments awaiting verification:</p>
                                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                    ${requests.filter(r => r.payment_status === 'submitted').slice(0, 5).map(r => `
                                        <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; cursor: pointer;" onclick="Users.showServiceRequestDetail(${r.id})">
                                            ${Utils.escapeHtml(r.user_name)} - ${r.service_type === 'plex' ? 'Plex' : 'IPTV'}
                                        </span>
                                    `).join('')}
                                    ${requests.filter(r => r.payment_status === 'submitted').length > 5 ? `
                                        <span style="opacity: 0.8; font-size: 0.85rem;">+${requests.filter(r => r.payment_status === 'submitted').length - 5} more</span>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading pending requests:', error);
            container.innerHTML = '';
        }
    },

    /**
     * Load users
     */
    async loadUsers() {
        const container = document.getElementById('users-list');
        const search = this._searchQuery || '';
        const expiringSoon = this._expiringSoonFilter || '';

        try {
            const response = await API.getUsers(search, false, expiringSoon);
            const users = response.users;

            // Build empty state message based on filters
            let emptyMessage = 'No users yet';
            if (search && expiringSoon) {
                emptyMessage = 'No users found matching your search with expiring subscriptions';
            } else if (search) {
                emptyMessage = 'No users found matching your search';
            } else if (expiringSoon) {
                const filterLabels = { plex: 'Plex', iptv: 'IPTV', any: 'any service' };
                emptyMessage = `No users with ${filterLabels[expiringSoon] || ''} subscriptions expiring within 7 days`;
            }

            if (users.length === 0) {
                container.innerHTML = `
                    <div class="text-center mt-4 mb-4">
                        <i class="fas fa-users" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                        <p class="mt-2" style="color: var(--text-secondary);">
                            ${emptyMessage}
                        </p>
                        ${!search && !expiringSoon ? `
                            <button class="btn btn-primary mt-2" onclick="Users.showAddUserModal()">
                                <i class="fas fa-user-plus"></i> Add Your First User
                            </button>
                        ` : ''}
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div style="padding: 1.5rem;">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Account Type</th>
                                    <th>Plex</th>
                                    <th>IPTV</th>
                                    <th>IPTV Editor</th>
                                    <th>Tags</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map(user => `
                                    <tr>
                                        <td><strong>${Utils.escapeHtml(user.name)}</strong></td>
                                        <td>${Utils.escapeHtml(user.email)}</td>
                                        <td>${Utils.formatAccountType(user.account_type)}</td>
                                        <td>
                                            ${user.plex_enabled ? `
                                                <div>
                                                    ${Utils.getExpirationBadge(user.plex_expiration_date, user.plex_price_type)}
                                                    ${user.plex_cancelled_at ?
                                                        `<br><small style="color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</small>` :
                                                        (user.plex_package_name ? `<br><small>${user.plex_package_name}</small>` : '')}
                                                </div>
                                            ` : '<span class="badge badge-secondary">Disabled</span>'}
                                        </td>
                                        <td>
                                            ${user.iptv_enabled ? `
                                                <div>
                                                    ${Utils.getExpirationBadge(user.iptv_expiration_date)}
                                                    ${user.iptv_cancelled_at ?
                                                        `<br><small style="color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</small>` :
                                                        (user.iptv_panel_name ? `<br><small>${user.iptv_panel_name}</small>` : '')}
                                                </div>
                                            ` : '<span class="badge badge-secondary">Disabled</span>'}
                                        </td>
                                        <td>${Utils.getStatusBadge(user.iptv_editor_enabled, 'Enabled', 'Disabled')}</td>
                                        <td>
                                            ${user.tags && user.tags.length > 0 ? `
                                                <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                                                    ${user.tags.map(tag => `
                                                        <span class="badge" style="background-color: ${tag.color}; color: white; font-size: 0.7rem;">
                                                            ${Utils.escapeHtml(tag.name)}
                                                        </span>
                                                    `).join('')}
                                                </div>
                                            ` : '<span class="badge badge-secondary" style="font-size: 0.7rem;">No tags</span>'}
                                        </td>
                                        <td>${Utils.formatDate(user.created_at)}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" onclick="Users.viewUser(${user.id})" title="View Details">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline" onclick="Users.editUser(${user.id})" title="Edit">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="Users.deleteUser(${user.id})" title="Delete">
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

        } catch (error) {
            console.error('Error loading users:', error);
            container.innerHTML = `
                <div class="text-center mt-4 mb-4">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger-color);"></i>
                    <p class="mt-2" style="color: var(--danger-color);">Failed to load users</p>
                </div>
            `;
        }
    },

    /**
     * Show add user wizard (using multi-step wizard)
     */
    async showAddUserModal() {
        try {
            // Initialize wizard
            await CreateUserWizard.init();

            // Show wizard in modal
            Utils.showModal({
                title: 'Create New User',
                size: 'xlarge',
                body: `<div id="wizard-modal-content" style="min-height: 500px;"></div>`,
                hideButtons: true // Wizard manages its own buttons
            });

            // Render wizard in the modal
            await CreateUserWizard.render('wizard-modal-content');

        } catch (error) {
            console.error('Error initializing wizard:', error);
            Utils.showToast('Error', 'Failed to load wizard', 'error');
        }
    },

    /**
     * Setup user form logic (checkbox behaviors)
     */
    setupUserFormLogic() {
        const plexCheck = document.getElementById('plex-enabled-check');
        const plexConfig = document.getElementById('plex-config');
        const iptvCheck = document.getElementById('iptv-enabled-check');
        const iptvConfig = document.getElementById('iptv-config');
        const iptvPanelSelect = document.getElementById('iptv-panel-select');
        const editorGroup = document.getElementById('iptv-editor-group');
        const editorCheck = document.getElementById('create-editor-check');
        const editorHelpText = document.getElementById('editor-help-text');

        // Plex checkbox toggle
        plexCheck.addEventListener('change', (e) => {
            plexConfig.style.display = e.target.checked ? 'block' : 'none';
        });

        // IPTV checkbox toggle
        iptvCheck.addEventListener('change', (e) => {
            iptvConfig.style.display = e.target.checked ? 'block' : 'none';
            if (!e.target.checked) {
                editorGroup.style.display = 'none';
            }
        });

        // IPTV panel selection - check editor link
        iptvPanelSelect.addEventListener('change', async (e) => {
            const panelId = e.target.value;

            if (!panelId) {
                editorGroup.style.display = 'none';
                return;
            }

            editorGroup.style.display = 'block';

            try {
                const response = await API.getIPTVPanelEditorLink(panelId);

                if (response.has_linked_playlist) {
                    // Enable checkbox
                    editorCheck.disabled = false;
                    editorCheck.checked = response.default_create_on_editor;
                    editorHelpText.textContent = `✓ Linked to playlist: ${response.playlist_name}`;
                    editorHelpText.style.color = 'var(--success-color)';
                } else {
                    // Disable checkbox
                    editorCheck.disabled = true;
                    editorCheck.checked = false;
                    editorHelpText.textContent = response.has_playlists_in_system ?
                        '⚠ This panel has no linked IPTV Editor playlist' :
                        'ℹ IPTV Editor not configured (optional)';
                    editorHelpText.style.color = 'var(--text-secondary)';
                }

            } catch (error) {
                console.error('Error checking editor link:', error);
                editorCheck.disabled = true;
                editorCheck.checked = false;
                editorHelpText.textContent = 'Error checking IPTV Editor link';
                editorHelpText.style.color = 'var(--danger-color)';
            }
        });
    },

    /**
     * Submit add user
     */
    async submitAddUser() {
        const form = document.getElementById('add-user-form');

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);

        // Build user data
        const userData = {
            name: formData.get('name'),
            email: formData.get('email'),
            account_type: formData.get('account_type'),
            notes: formData.get('notes'),
            plex_enabled: formData.get('plex_enabled') === 'on',
            iptv_enabled: formData.get('iptv_enabled') === 'on',
            create_on_iptv_editor: formData.get('create_on_iptv_editor') === 'on'
        };

        // Plex configuration
        if (userData.plex_enabled) {
            userData.plex_package_id = parseInt(formData.get('plex_package_id')) || null;
            userData.plex_email = formData.get('plex_email') || userData.email;
            userData.plex_duration_months = parseInt(formData.get('plex_duration_months')) || 12;
        }

        // IPTV configuration
        if (userData.iptv_enabled) {
            userData.iptv_panel_id = parseInt(formData.get('iptv_panel_id')) || null;
            userData.iptv_username = formData.get('iptv_username');
            userData.iptv_password = formData.get('iptv_password');
            userData.iptv_duration_months = parseInt(formData.get('iptv_duration_months')) || 12;
            userData.iptv_is_trial = formData.get('iptv_is_trial') === 'on';
        }

        // Tags
        const tagIds = formData.getAll('tag_ids').map(id => parseInt(id));
        if (tagIds.length > 0) {
            userData.tag_ids = tagIds;
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            const response = await API.createUser(userData);
            Utils.hideLoading();
            Utils.showToast('Success', 'User created successfully', 'success');

            // Show detailed results
            if (response.results) {
                const results = response.results;
                let message = 'User created';
                if (results.plex_result) {
                    message += results.plex_result.success ? ' ✓ Plex' : ' ✗ Plex';
                }
                if (results.iptv_result) {
                    message += results.iptv_result.success ? ' ✓ IPTV' : ' ✗ IPTV';
                }
                if (results.iptv_editor_result) {
                    message += results.iptv_editor_result.success ? ' ✓ IPTV Editor' : ' ✗ IPTV Editor';
                }
                Utils.showToast('User Created', message, 'success');
            }

            await this.loadUsers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Show portal announcements configuration modal
     */
    async showAnnouncementsModal() {
        // Fetch current notice settings
        let notices = { everyone: '', plex: '', iptv: '' };

        try {
            const response = await fetch(`${API_BASE}/admin/portal/notices`, {
                headers: API.getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                notices = data.notices;
            }
        } catch (error) {
            console.error('Error fetching notices:', error);
        }

        Utils.showModal({
            title: '<i class="fas fa-bullhorn"></i> Portal Announcements',
            body: `
                <div class="announcements-config">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        Configure static notices that appear on the user portal. These are displayed as a bulletin board above the services section.
                        <br><small>HTML is supported for formatting.</small>
                    </p>

                    <div class="form-group">
                        <label class="form-label">
                            <i class="fas fa-globe" style="color: var(--primary-color);"></i>
                            Everyone Notice
                        </label>
                        <p class="form-hint">Shown to all users at the top of the notice board</p>
                        <textarea id="notice-everyone" class="form-input" rows="4" placeholder="Enter a notice for all users...">${Utils.escapeHtml(notices.everyone || '')}</textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">
                            <i class="fas fa-film" style="color: #e5a00d;"></i>
                            Plex Notice
                        </label>
                        <p class="form-hint">Shown only to users with Plex access</p>
                        <textarea id="notice-plex" class="form-input" rows="4" placeholder="Enter a notice for Plex users...">${Utils.escapeHtml(notices.plex || '')}</textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">
                            <i class="fas fa-tv" style="color: #6366f1;"></i>
                            IPTV Notice
                        </label>
                        <p class="form-hint">Shown only to users with IPTV/Live TV access</p>
                        <textarea id="notice-iptv" class="form-input" rows="4" placeholder="Enter a notice for IPTV users...">${Utils.escapeHtml(notices.iptv || '')}</textarea>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: '<i class="fas fa-bell"></i> Notify Admin',
                    class: 'btn-warning',
                    onClick: () => this.showNotifyAdminModal()
                },
                {
                    text: 'Cancel',
                    class: 'btn-outline',
                    onClick: () => Utils.closeModal()
                },
                {
                    text: 'Save Notices',
                    class: 'btn-primary',
                    onClick: () => this.savePortalNotices()
                }
            ]
        });
    },

    /**
     * Show modal to send a one-time notification to admin
     */
    showNotifyAdminModal() {
        Utils.showModal({
            title: '<i class="fas fa-bell"></i> Notify Admin',
            body: `
                <div class="notify-admin-form">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        Send a one-time notification that will appear for admins when they are active in the admin area.
                        This is useful for quick reminders or alerts.
                    </p>

                    <div class="form-group">
                        <label class="form-label">
                            <i class="fas fa-comment-alt" style="color: var(--primary-color);"></i>
                            Notification Message
                        </label>
                        <textarea id="admin-notification-message" class="form-input" rows="4" placeholder="Enter your notification message..." maxlength="500"></textarea>
                        <p class="form-hint">Max 500 characters. This will be shown as a dismissible notification.</p>
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
                    text: '<i class="fas fa-paper-plane"></i> Send Notification',
                    class: 'btn-primary',
                    onClick: () => this.sendAdminNotification()
                }
            ]
        });
    },

    /**
     * Send admin notification
     */
    async sendAdminNotification() {
        const message = document.getElementById('admin-notification-message').value.trim();

        if (!message) {
            Utils.showToast('Error', 'Please enter a notification message', 'error');
            return;
        }

        Utils.showLoading();

        try {
            const response = await fetch(`${API_BASE}/admin/portal/admin-notifications`, {
                method: 'POST',
                headers: {
                    ...API.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    created_by: 'Admin User'
                })
            });

            const data = await response.json();
            Utils.hideLoading();

            if (data.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Admin notification sent successfully', 'success');
            } else {
                Utils.showToast('Error', data.message || 'Failed to send notification', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Save portal notices
     */
    async savePortalNotices() {
        const everyone = document.getElementById('notice-everyone').value;
        const plex = document.getElementById('notice-plex').value;
        const iptv = document.getElementById('notice-iptv').value;

        Utils.showLoading();

        try {
            const response = await fetch(`${API_BASE}/admin/portal/notices`, {
                method: 'PUT',
                headers: {
                    ...API.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ everyone, plex, iptv })
            });

            const data = await response.json();
            Utils.hideLoading();

            if (data.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Portal notices updated successfully', 'success');
            } else {
                Utils.showToast('Error', data.message || 'Failed to save notices', 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Show service requests management modal
     */
    async showServiceRequestsModal() {
        Utils.showLoading();

        try {
            const response = await API.getServiceRequests({ limit: 100 });
            Utils.hideLoading();

            if (!response.success) {
                Utils.showToast('Error', 'Failed to load service requests', 'error');
                return;
            }

            const requests = response.requests;

            Utils.showModal({
                title: '<i class="fas fa-list"></i> Service Requests',
                size: 'lg',
                body: `
                    <div style="margin-bottom: 1rem;">
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-sm ${!this._requestFilter ? 'btn-primary' : 'btn-outline'}" onclick="Users.filterServiceRequests('')">All</button>
                            <button class="btn btn-sm ${this._requestFilter === 'submitted' ? 'btn-primary' : 'btn-outline'}" onclick="Users.filterServiceRequests('submitted')">Submitted</button>
                            <button class="btn btn-sm ${this._requestFilter === 'pending' ? 'btn-primary' : 'btn-outline'}" onclick="Users.filterServiceRequests('pending')">Pending</button>
                            <button class="btn btn-sm ${this._requestFilter === 'verified' ? 'btn-primary' : 'btn-outline'}" onclick="Users.filterServiceRequests('verified')">Verified</button>
                            <button class="btn btn-sm ${this._requestFilter === 'rejected' ? 'btn-primary' : 'btn-outline'}" onclick="Users.filterServiceRequests('rejected')">Rejected</button>
                        </div>
                    </div>
                    <div id="service-requests-list">
                        ${this.renderServiceRequestsList(requests)}
                    </div>
                `,
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
            Utils.showToast('Error', error.message, 'error');
        }
    },

    _requestFilter: '',

    async filterServiceRequests(status) {
        this._requestFilter = status;
        const container = document.getElementById('service-requests-list');
        if (!container) return;

        try {
            const response = await API.getServiceRequests({ status: status || undefined, limit: 100 });
            if (response.success) {
                container.innerHTML = this.renderServiceRequestsList(response.requests);
            }
        } catch (error) {
            console.error('Error filtering requests:', error);
        }

        // Update filter buttons
        document.querySelectorAll('[onclick^="Users.filterServiceRequests"]').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        });
        const activeBtn = document.querySelector(`[onclick="Users.filterServiceRequests('${status}')"]`);
        if (activeBtn) {
            activeBtn.classList.remove('btn-outline');
            activeBtn.classList.add('btn-primary');
        }
    },

    renderServiceRequestsList(requests) {
        if (requests.length === 0) {
            return `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p style="margin-top: 0.5rem;">No service requests found</p>
                </div>
            `;
        }

        return `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Service</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${requests.map(r => `
                            <tr>
                                <td>
                                    <strong>${Utils.escapeHtml(r.user_name)}</strong>
                                    <br><small style="color: var(--text-secondary);">${Utils.escapeHtml(r.user_email)}</small>
                                </td>
                                <td>
                                    ${r.service_type === 'plex' ? '<span class="badge" style="background: #e5a00d; color: #000;">Plex</span>' : '<span class="badge" style="background: #6366f1; color: #fff;">IPTV</span>'}
                                </td>
                                <td>${r.plan_name ? Utils.escapeHtml(r.plan_name) : '-'}</td>
                                <td>${this.getStatusBadge(r.payment_status)}</td>
                                <td>${Utils.formatDate(r.created_at)}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline" onclick="Users.showServiceRequestDetail(${r.id})" title="View Details">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    ${r.payment_status === 'submitted' ? `
                                        <button class="btn btn-sm btn-success" onclick="Users.verifyServiceRequest(${r.id})" title="Verify Payment">
                                            <i class="fas fa-check"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="Users.rejectServiceRequest(${r.id})" title="Reject">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    ` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    getStatusBadge(status) {
        const badges = {
            pending: '<span class="badge badge-warning">Pending</span>',
            submitted: '<span class="badge badge-info">Payment Submitted</span>',
            verified: '<span class="badge badge-success">Verified</span>',
            rejected: '<span class="badge badge-danger">Rejected</span>',
            cancelled: '<span class="badge badge-secondary">Cancelled</span>'
        };
        return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
    },

    /**
     * Show service request detail modal
     */
    async showServiceRequestDetail(id) {
        Utils.showLoading();

        try {
            const response = await API.getServiceRequest(id);
            Utils.hideLoading();

            if (!response.success) {
                Utils.showToast('Error', 'Failed to load request details', 'error');
                return;
            }

            const r = response.request;

            Utils.showModal({
                title: '<i class="fas fa-file-alt"></i> Service Request Details',
                body: `
                    <div style="display: grid; gap: 1rem;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label">User</label>
                                <p><strong>${Utils.escapeHtml(r.user_name)}</strong><br><small>${Utils.escapeHtml(r.user_email)}</small></p>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Owner</label>
                                <p>${r.owner_name ? Utils.escapeHtml(r.owner_name) : '<span style="color: var(--text-secondary);">No owner assigned</span>'}</p>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label class="form-label">Service</label>
                                <p>${r.service_type === 'plex' ? '<span class="badge" style="background: #e5a00d; color: #000;">Plex</span>' : '<span class="badge" style="background: #6366f1; color: #fff;">IPTV</span>'} ${r.request_type === 'renewal' ? '(Renewal)' : '(New Service)'}</p>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Status</label>
                                <p>${this.getStatusBadge(r.payment_status)}</p>
                            </div>
                        </div>

                        ${r.plan_name ? `
                            <div class="form-group">
                                <label class="form-label">Selected Plan</label>
                                <p>
                                    <strong>${Utils.escapeHtml(r.plan_name)}</strong>
                                    ${r.price ? `<br><span style="color: var(--primary-color);">${r.currency || '$'}${r.price}${r.price_type === 'per_month' ? '/mo' : r.price_type === 'one_time' ? ' one-time' : ''}</span>` : ''}
                                    ${r.duration_months ? `<br><small>${r.duration_months} month${r.duration_months !== 1 ? 's' : ''}</small>` : ''}
                                </p>
                            </div>
                        ` : ''}

                        ${r.transaction_reference ? `
                            <div class="form-group">
                                <label class="form-label">Transaction Reference</label>
                                <p style="font-family: monospace; background: var(--background-color); padding: 0.5rem; border-radius: 4px;">${Utils.escapeHtml(r.transaction_reference)}</p>
                            </div>
                        ` : ''}

                        ${r.user_notes ? `
                            <div class="form-group">
                                <label class="form-label">User Notes</label>
                                <p style="background: var(--background-color); padding: 0.5rem; border-radius: 4px;">${Utils.escapeHtml(r.user_notes)}</p>
                            </div>
                        ` : ''}

                        <div class="form-group">
                            <label class="form-label">Admin Notes</label>
                            <textarea id="admin-notes-input" class="form-input" rows="3" placeholder="Add notes about this request...">${r.admin_notes || ''}</textarea>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
                            <div>Created: ${Utils.formatDate(r.created_at)}</div>
                            <div>${r.processed_at ? `Processed: ${Utils.formatDate(r.processed_at)}${r.processed_by_name ? ` by ${r.processed_by_name}` : ''}` : ''}</div>
                        </div>
                    </div>
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    ...(r.payment_status === 'submitted' ? [
                        {
                            text: '<i class="fas fa-times"></i> Reject',
                            class: 'btn-danger',
                            onClick: () => this.rejectServiceRequest(r.id)
                        },
                        {
                            text: '<i class="fas fa-check"></i> Verify & Provision',
                            class: 'btn-success',
                            onClick: () => this.verifyServiceRequest(r.id)
                        }
                    ] : [
                        {
                            text: 'Save Notes',
                            class: 'btn-primary',
                            onClick: () => this.saveServiceRequestNotes(r.id)
                        }
                    ])
                ]
            });

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Verify service request payment
     */
    async verifyServiceRequest(id) {
        if (!confirm('Verify this payment and provision the service?')) return;

        Utils.showLoading();

        try {
            const adminNotes = document.getElementById('admin-notes-input')?.value || '';
            const user = API.getCurrentUser();

            const response = await API.updateServiceRequest(id, {
                payment_status: 'verified',
                admin_notes: adminNotes,
                processed_by: user?.id
            });

            Utils.hideLoading();

            if (response.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Payment verified! Now provision the service for this user.', 'success');
                await this.loadPendingRequestsBanner();
                // Refresh nav badge
                if (window.loadPendingRequestsBadge) window.loadPendingRequestsBadge();

                // Refresh the requests list if modal is open
                const listContainer = document.getElementById('service-requests-list');
                if (listContainer) {
                    this.filterServiceRequests(this._requestFilter);
                }
            } else {
                Utils.showToast('Error', response.message || 'Failed to verify payment', 'error');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Reject service request
     */
    async rejectServiceRequest(id) {
        const reason = prompt('Enter rejection reason (optional):');
        if (reason === null) return; // Cancelled

        Utils.showLoading();

        try {
            const user = API.getCurrentUser();
            const existingNotes = document.getElementById('admin-notes-input')?.value || '';
            const adminNotes = reason ? `${existingNotes}\nRejected: ${reason}`.trim() : existingNotes;

            const response = await API.updateServiceRequest(id, {
                payment_status: 'rejected',
                admin_notes: adminNotes,
                processed_by: user?.id
            });

            Utils.hideLoading();

            if (response.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Request rejected', 'success');
                await this.loadPendingRequestsBanner();
                // Refresh nav badge
                if (window.loadPendingRequestsBadge) window.loadPendingRequestsBadge();

                // Refresh the requests list if modal is open
                const listContainer = document.getElementById('service-requests-list');
                if (listContainer) {
                    this.filterServiceRequests(this._requestFilter);
                }
            } else {
                Utils.showToast('Error', response.message || 'Failed to reject request', 'error');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Save admin notes on service request
     */
    async saveServiceRequestNotes(id) {
        const adminNotes = document.getElementById('admin-notes-input')?.value || '';

        Utils.showLoading();

        try {
            const response = await API.updateServiceRequest(id, {
                admin_notes: adminNotes
            });

            Utils.hideLoading();

            if (response.success) {
                Utils.showToast('Success', 'Notes saved', 'success');
            } else {
                Utils.showToast('Error', response.message || 'Failed to save notes', 'error');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Show CSV import modal
     */
    showCSVImportModal() {
        Utils.showModal({
            title: 'CSV Bulk Import',
            body: `
                <div>
                    <p>Import multiple users from a CSV file.</p>
                    <p><strong>Note:</strong> IPTV Editor accounts are NOT created via CSV. Use manual search to link after import.</p>

                    <div class="form-group mt-3">
                        <label class="form-label">CSV File</label>
                        <input type="file" id="csv-file-input" accept=".csv" class="form-input">
                    </div>

                    <div class="mt-3">
                        <a href="${API.getCSVTemplateURL()}" class="btn btn-outline btn-sm">
                            <i class="fas fa-download"></i> Download Template
                        </a>
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
                    text: 'Import',
                    class: 'btn-primary',
                    onClick: () => this.submitCSVImport()
                }
            ]
        });
    },

    /**
     * Submit CSV import
     */
    async submitCSVImport() {
        const fileInput = document.getElementById('csv-file-input');
        const file = fileInput.files[0];

        if (!file) {
            Utils.showToast('Error', 'Please select a CSV file', 'error');
            return;
        }

        Utils.closeModal();
        Utils.showLoading();

        try {
            const response = await API.uploadCSV(file);
            Utils.hideLoading();

            if (response.success) {
                Utils.showToast(
                    'Import Complete',
                    `${response.results.successful} successful, ${response.results.failed} failed`,
                    'success'
                );
                await this.loadUsers();
            } else {
                Utils.showToast('Import Failed', response.message, 'error');
            }
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * View user details
     */
    async viewUser(userId) {
        Utils.showLoading();
        try {
            const response = await API.getUser(userId);
            const user = response.user;
            Utils.hideLoading();

            Utils.showModal({
                title: `User Details: ${user.name}`,
                size: 'large',
                body: `
                    <div>
                        <h4>Basic Information</h4>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Account Type:</strong> ${Utils.formatAccountType(user.account_type)}</p>
                        <p><strong>Created:</strong> ${Utils.formatDateTime(user.created_at)}</p>
                        <p><strong>Last Portal Login:</strong> ${user.last_portal_login ? Utils.formatDateTime(user.last_portal_login) : '<span style="color: var(--text-secondary);">Never</span>'}</p>

                        ${user.plex_enabled ? `
                            <h4 class="mt-3">Plex Subscription</h4>
                            <p><strong>Package:</strong> ${user.plex_package_name || 'N/A'}</p>
                            <p><strong>Status:</strong> ${Utils.getExpirationBadge(user.plex_expiration_date, user.plex_price_type)}</p>
                        ` : ''}

                        ${user.iptv_enabled ? `
                            <h4 class="mt-3">IPTV Subscription</h4>
                            <p><strong>Panel:</strong> ${user.iptv_panel_name || 'N/A'}</p>
                            <p><strong>Username:</strong> ${user.iptv_username || 'N/A'}</p>
                            <p><strong>Status:</strong> ${Utils.getExpirationBadge(user.iptv_expiration_date)}</p>
                            <p><strong>IPTV Editor:</strong> ${Utils.getStatusBadge(user.iptv_editor_enabled)}</p>
                        ` : ''}

                        ${user.tags && user.tags.length > 0 ? `
                            <h4 class="mt-3">Tags</h4>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                ${user.tags.map(tag => `
                                    <span class="badge" style="background-color: ${tag.color}; color: white;">
                                        ${Utils.escapeHtml(tag.name)} (${tag.assigned_by})
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${user.notes ? `
                            <h4 class="mt-3">Notes</h4>
                            <p>${Utils.escapeHtml(user.notes)}</p>
                        ` : ''}
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
     * Delete user
     */
    async deleteUser(userId) {
        const confirmed = await Utils.confirm(
            'Delete User',
            'Are you sure you want to delete this user? This action cannot be undone.'
        );

        if (!confirmed) return;

        Utils.showLoading();
        try {
            await API.deleteUser(userId);
            Utils.hideLoading();
            Utils.showToast('Success', 'User deleted successfully', 'success');
            await this.loadUsers();
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    // Placeholder for edit
    editUser(userId) {
        Utils.showToast('Info', 'Edit functionality to be implemented', 'info');
    }
};
