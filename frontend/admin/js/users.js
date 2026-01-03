/**
 * Users Page for StreamPanel
 */

const Users = {
    currentUsers: [],
    currentFilters: {
        search: '',
        ownerId: null,
        tagId: null,
        expiringSoon: '',
        sortBy: 'created_at',
        sortDir: 'desc'
    },
    owners: [],
    tags: [],
    selectedUsers: new Set(), // Track selected user IDs for bulk actions
    userPreferences: {
        columnsVisible: {
            checkbox: true,
            name: true,
            email: true,
            owner: true,
            plex: true,
            iptv: true,
            iptvEditor: true,
            tags: true,
            created: true,
            actions: true
        },
        columnOrder: ['checkbox', 'name', 'email', 'owner', 'plex', 'iptv', 'iptvEditor', 'tags', 'created', 'actions'],
        columnWidths: {} // Stores custom widths per column, e.g., { name: 150, email: 200 }
    },

    // Column resize state
    _resizing: {
        active: false,
        column: null,
        startX: 0,
        startWidth: 0
    },

    /**
     * Initialize user preferences from localStorage
     */
    initPreferences() {
        const saved = localStorage.getItem('usersPagePreferences');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                //Clean up deprecated columns and add new columns from saved preferences
                if (parsed.columnOrder) {
                    // Keep only valid columns from saved order
                    const savedValidColumns = parsed.columnOrder.filter(col =>
                        this.userPreferences.columnOrder.includes(col)
                    );

                    // Add any new columns that exist in default but not in saved
                    const newColumns = this.userPreferences.columnOrder.filter(col =>
                        !parsed.columnOrder.includes(col)
                    );

                    // Merge: keep saved order + append new columns
                    this.userPreferences.columnOrder = [...savedValidColumns, ...newColumns];
                }

                if (parsed.columnsVisible) {
                    // Remove any columns that don't exist in our default config
                    const validColumnsVisible = {};
                    Object.keys(parsed.columnsVisible).forEach(col => {
                        if (this.userPreferences.columnsVisible.hasOwnProperty(col)) {
                            validColumnsVisible[col] = parsed.columnsVisible[col];
                        }
                    });
                    this.userPreferences.columnsVisible = { ...this.userPreferences.columnsVisible, ...validColumnsVisible };
                }

                // Load saved column widths
                if (parsed.columnWidths) {
                    this.userPreferences.columnWidths = { ...parsed.columnWidths };
                }
            } catch (error) {
                console.error('Failed to parse user preferences:', error);
            }
        }
    },

    /**
     * Save user preferences to localStorage
     */
    savePreferences() {
        localStorage.setItem('usersPagePreferences', JSON.stringify(this.userPreferences));
    },

    /**
     * Get column width style string
     */
    getColumnWidthStyle(columnKey) {
        const width = this.userPreferences.columnWidths[columnKey];
        return width ? `width: ${width}px; min-width: ${width}px; max-width: ${width}px;` : '';
    },

    /**
     * Initialize column resize handlers
     */
    initColumnResize() {
        const table = document.querySelector('.users-desktop-view table');
        if (!table) return;

        // Add resize handles to all th elements
        const headers = table.querySelectorAll('thead th');
        headers.forEach((th, index) => {
            // Skip checkbox and actions columns for resize handles
            const colKey = this.getColumnKeyFromIndex(index);
            if (colKey === 'checkbox' || colKey === 'actions') return;

            // Add resize handle
            const handle = document.createElement('div');
            handle.className = 'column-resize-handle';
            handle.dataset.column = colKey;
            handle.addEventListener('mousedown', (e) => this.startColumnResize(e, colKey, th, handle));

            // Make th position relative for handle positioning
            th.style.position = 'relative';
            th.appendChild(handle);
        });

        // Global mouse events for resize
        document.addEventListener('mousemove', (e) => this.handleColumnResize(e));
        document.addEventListener('mouseup', () => this.endColumnResize());
    },

    /**
     * Get column key from header index
     */
    getColumnKeyFromIndex(index) {
        const visibleColumns = this.userPreferences.columnOrder.filter(
            col => this.userPreferences.columnsVisible[col]
        );
        return visibleColumns[index] || null;
    },

    /**
     * Start column resize
     */
    startColumnResize(e, columnKey, th, handle) {
        e.preventDefault();
        e.stopPropagation();

        this._resizing.active = true;
        this._resizing.column = columnKey;
        this._resizing.startX = e.pageX;
        this._resizing.startWidth = th.offsetWidth;
        this._resizing.handle = handle;
        this._resizing.th = th;

        // Add visual feedback
        handle.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    },

    /**
     * Handle column resize movement
     */
    handleColumnResize(e) {
        if (!this._resizing.active) return;

        const diff = e.pageX - this._resizing.startX;
        const newWidth = Math.max(60, this._resizing.startWidth + diff); // Min 60px

        // Update the th element directly (stored in _resizing)
        const th = this._resizing.th;
        if (th) {
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
        }
    },

    /**
     * End column resize
     */
    endColumnResize() {
        if (!this._resizing.active) return;

        // Save final width
        const th = this._resizing.th;
        if (th) {
            const finalWidth = th.offsetWidth;
            this.userPreferences.columnWidths[this._resizing.column] = finalWidth;
            this.savePreferences();
        }

        // Remove visual feedback
        if (this._resizing.handle) {
            this._resizing.handle.classList.remove('resizing');
        }

        // Reset state
        this._resizing.active = false;
        this._resizing.column = null;
        this._resizing.handle = null;
        this._resizing.th = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    },

    /**
     * Apply saved column widths to table
     */
    applyColumnWidths() {
        const table = document.querySelector('.users-desktop-view table');
        if (!table) return;

        const visibleColumns = this.userPreferences.columnOrder.filter(
            col => this.userPreferences.columnsVisible[col]
        );

        visibleColumns.forEach((colKey, index) => {
            const width = this.userPreferences.columnWidths[colKey];
            if (width) {
                const th = table.querySelectorAll('thead th')[index];
                if (th) {
                    th.style.width = `${width}px`;
                    th.style.minWidth = `${width}px`;
                }
            }
        });
    },

    /**
     * Reset column widths to default
     */
    resetColumnWidths() {
        this.userPreferences.columnWidths = {};
        this.savePreferences();
        this.loadUsers(); // Reload to apply
    },

    /**
     * Render users page
     */
    async render(container) {
        // Check if we have saved filters (from returning from edit-user page)
        const savedFilters = sessionStorage.getItem('usersPageFilters');
        if (savedFilters) {
            try {
                this.currentFilters = JSON.parse(savedFilters);
            } catch (e) {
                // Invalid JSON, reset to defaults
                this.currentFilters = {
                    search: '',
                    ownerId: null,
                    tagId: null,
                    sortBy: 'created_at',
                    sortDir: 'desc'
                };
            }
            // Clear saved filters after restoring (one-time restore)
            sessionStorage.removeItem('usersPageFilters');
        } else {
            // Reset filters when page is rendered from other pages
            // This ensures clean state when coming from Settings, Email, etc.
            this.currentFilters = {
                search: '',
                ownerId: null,
                tagId: null,
                expiringSoon: '',
                sortBy: 'created_at',
                sortDir: 'desc'
            };
        }
        this.selectedUsers.clear();

        this.initPreferences();

        container.innerHTML = `
            <div id="pending-requests-banner"></div>
            <div id="new-support-messages-banner"></div>
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-users"></i>
                        Users
                    </h2>
                    <div class="flex gap-2 users-header-actions">
                        <button class="btn btn-secondary btn-sm" onclick="Users.showCustomizeModal()" title="Customize Columns">
                            <i class="fas fa-cog"></i><span class="btn-text-desktop"> Customize</span>
                        </button>
                        <button class="btn btn-secondary" onclick="Users.showAnnouncementsModal()" title="Portal Announcements">
                            <i class="fas fa-bullhorn"></i><span class="btn-text-desktop"> Announcements</span>
                        </button>
                        <button class="btn btn-secondary" onclick="Users.showManageRequestsModal()" title="Support Requests & Messages">
                            <i class="fas fa-headset"></i><span class="btn-text-desktop"> Support</span>
                        </button>
                        <div class="dropdown" style="position: relative; display: inline-block;">
                            <button class="btn btn-primary" onclick="Users.toggleAddUserDropdown(event)">
                                <i class="fas fa-user-plus"></i><span class="btn-text-desktop"> Add User</span>
                                <i class="fas fa-caret-down" style="margin-left: 6px;"></i>
                            </button>
                            <div class="dropdown-menu" id="add-user-dropdown" style="display: none; position: absolute; right: 0; top: 100%; margin-top: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 180px; z-index: 1000;">
                                <a href="#" class="dropdown-item" onclick="event.preventDefault(); Users.hideAddUserDropdown(); Users.showAddUserModal();" style="display: block; padding: 10px 16px; color: var(--text-primary); text-decoration: none; font-size: 14px;">
                                    <i class="fas fa-user-plus" style="margin-right: 8px; color: var(--primary-color);"></i> New User Wizard
                                </a>
                                <a href="#" class="dropdown-item" onclick="event.preventDefault(); Users.hideAddUserDropdown(); Users.showCSVImportModal();" style="display: block; padding: 10px 16px; color: var(--text-primary); text-decoration: none; font-size: 14px; border-top: 1px solid var(--border-color);">
                                    <i class="fas fa-file-csv" style="margin-right: 8px; color: var(--success-color);"></i> Import from CSV
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="users-filters" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
                    <div style="flex: 1; min-width: 200px;">
                        <input type="search" id="user-search" class="form-input" placeholder="Search users (name, email, plex email, plex username, iptv username)...">
                    </div>
                    <div style="min-width: 150px;">
                        <select id="owner-filter" class="form-input">
                            <option value="">All Owners</option>
                        </select>
                    </div>
                    <div style="min-width: 150px;">
                        <select id="tag-filter" class="form-input">
                            <option value="">All Tags</option>
                        </select>
                    </div>
                    <div style="min-width: 150px;">
                        <select id="expiring-filter" class="form-input">
                            <option value="">All Expirations</option>
                            <option value="plex">Plex Expiring Soon</option>
                            <option value="iptv">IPTV Expiring Soon</option>
                            <option value="any">Any Expiring Soon</option>
                        </select>
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

        // Setup search with debounce
        const searchInput = document.getElementById('user-search');
        searchInput.addEventListener('input', Utils.debounce((e) => {
            this.currentFilters.search = e.target.value;
            this.loadUsers();
        }, 500));
        // Restore search value if we have saved filters
        if (this.currentFilters.search) {
            searchInput.value = this.currentFilters.search;
        }

        // Setup owner filter
        const ownerFilter = document.getElementById('owner-filter');
        ownerFilter.addEventListener('change', (e) => {
            this.currentFilters.ownerId = e.target.value || null;
            this.loadUsers();
        });

        // Setup tag filter
        const tagFilter = document.getElementById('tag-filter');
        tagFilter.addEventListener('change', (e) => {
            this.currentFilters.tagId = e.target.value || null;
            this.loadUsers();
        });

        // Setup expiring soon filter
        const expiringFilter = document.getElementById('expiring-filter');
        expiringFilter.addEventListener('change', (e) => {
            this.currentFilters.expiringSoon = e.target.value || '';
            this.loadUsers();
        });

        // Load filter data and users
        await Promise.all([
            this.loadOwners(),
            this.loadTags()
        ]);

        // Restore dropdown values after options are loaded
        if (this.currentFilters.ownerId) {
            ownerFilter.value = this.currentFilters.ownerId;
        }
        if (this.currentFilters.tagId) {
            tagFilter.value = this.currentFilters.tagId;
        }
        if (this.currentFilters.expiringSoon) {
            expiringFilter.value = this.currentFilters.expiringSoon;
        }

        await this.loadUsers();

        // Load pending service requests banner
        await this.loadPendingRequestsBanner();

        // Load new support messages banner
        await this.loadNewSupportMessagesBanner();
    },

    /**
     * Load owners for filter dropdown
     */
    async loadOwners() {
        try {
            const response = await API.getOwners();
            this.owners = response.data || [];

            const ownerFilter = document.getElementById('owner-filter');
            if (ownerFilter) {
                this.owners.forEach(owner => {
                    const option = document.createElement('option');
                    option.value = owner.id;
                    option.textContent = owner.name;
                    ownerFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading owners:', error);
        }
    },

    /**
     * Load tags for filter dropdown
     */
    async loadTags() {
        try {
            const response = await API.getTags();
            this.tags = response.data || [];

            const tagFilter = document.getElementById('tag-filter');
            if (tagFilter) {
                this.tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.id;
                    option.textContent = tag.name;
                    tagFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    },

    /**
     * Load users with current filters
     */
    async loadUsers() {
        const container = document.getElementById('users-list');

        try {
            const response = await API.getUsers(
                this.currentFilters.search,
                false,
                this.currentFilters.ownerId,
                this.currentFilters.tagId,
                this.currentFilters.expiringSoon
            );
            let users = response.users;

            // Apply client-side sorting
            users = this.sortUsers(users);
            this.currentUsers = users;

            // Build empty state message based on filters
            const hasFilters = this.currentFilters.search || this.currentFilters.ownerId || this.currentFilters.tagId || this.currentFilters.expiringSoon;
            let emptyMessage = 'No users yet';
            if (this.currentFilters.expiringSoon && !this.currentFilters.search && !this.currentFilters.ownerId && !this.currentFilters.tagId) {
                const filterLabels = { plex: 'Plex', iptv: 'IPTV', any: 'any service' };
                emptyMessage = `No users with ${filterLabels[this.currentFilters.expiringSoon] || ''} subscriptions expiring within 7 days`;
            } else if (hasFilters) {
                emptyMessage = 'No users found matching your filters';
            }

            if (users.length === 0) {
                container.innerHTML = `
                    <div class="text-center mt-4 mb-4">
                        <i class="fas fa-users" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.3;"></i>
                        <p class="mt-2" style="color: var(--text-secondary);">
                            ${emptyMessage}
                        </p>
                        ${!hasFilters ? `
                            <button class="btn btn-primary mt-2" onclick="Users.showAddUserModal()">
                                <i class="fas fa-user-plus"></i> Add Your First User
                            </button>
                        ` : ''}
                    </div>
                `;
                return;
            }

            // Render desktop table and mobile cards
            container.innerHTML = `
                ${this.renderDesktopTable(users)}
                ${this.renderMobileCards(users)}
            `;

            // Initialize column resize functionality and apply saved widths
            this.initColumnResize();
            this.applyColumnWidths();

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
     * Sort users based on current sort settings
     */
    sortUsers(users) {
        const { sortBy, sortDir } = this.currentFilters;

        return users.sort((a, b) => {
            let aVal, bVal;

            switch (sortBy) {
                case 'name':
                    aVal = (a.name || '').toLowerCase();
                    bVal = (b.name || '').toLowerCase();
                    break;
                case 'email':
                    aVal = (a.email || '').toLowerCase();
                    bVal = (b.email || '').toLowerCase();
                    break;
                case 'plex':
                    aVal = a.plex_expiration_date || '';
                    bVal = b.plex_expiration_date || '';
                    break;
                case 'iptv':
                    aVal = a.iptv_expiration_date || '';
                    bVal = b.iptv_expiration_date || '';
                    break;
                case 'created_at':
                default:
                    aVal = a.created_at || '';
                    bVal = b.created_at || '';
                    break;
            }

            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    },

    /**
     * Toggle sort direction for a column
     */
    toggleSort(column) {
        if (this.currentFilters.sortBy === column) {
            this.currentFilters.sortDir = this.currentFilters.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentFilters.sortBy = column;
            this.currentFilters.sortDir = 'asc';
        }
        this.loadUsers();
    },

    /**
     * Get sort icon for a column
     */
    getSortIcon(column) {
        if (this.currentFilters.sortBy !== column) {
            return '<i class="fas fa-sort" style="opacity: 0.3; margin-left: 0.25rem;"></i>';
        }
        const icon = this.currentFilters.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
        return `<i class="fas ${icon}" style="margin-left: 0.25rem;"></i>`;
    },

    /**
     * Render desktop table view
     */
    renderDesktopTable(users) {
        const { columnsVisible, columnOrder } = this.userPreferences;

        // Define column configurations
        const columnConfig = {
            checkbox: {
                label: '',
                sortable: false,
                hideInCustomize: true, // Don't show in customize modal
                renderHeader: () => `<th style="width: 40px; text-align: center;">
                    <input type="checkbox" id="select-all-users" onclick="Users.toggleSelectAll(this)"
                           style="width: 18px; height: 18px; cursor: pointer;"
                           ${this.selectedUsers.size === users.length && users.length > 0 ? 'checked' : ''}>
                </th>`,
                renderCell: (user) => `<td style="text-align: center;">
                    <input type="checkbox" class="user-checkbox" data-user-id="${user.id}"
                           onclick="Users.toggleUserSelection(${user.id}, this)"
                           style="width: 18px; height: 18px; cursor: pointer;"
                           ${this.selectedUsers.has(user.id) ? 'checked' : ''}>
                </td>`
            },
            name: {
                label: 'Name',
                sortable: true,
                sortKey: 'name',
                renderHeader: () => `<th onclick="Users.toggleSort('name')" style="cursor: pointer;">Name ${this.getSortIcon('name')}</th>`,
                renderCell: (user) => `<td><strong>${Utils.escapeHtml(user.name)}</strong></td>`
            },
            email: {
                label: 'Email',
                sortable: true,
                sortKey: 'email',
                renderHeader: () => `<th onclick="Users.toggleSort('email')" style="cursor: pointer;">Email ${this.getSortIcon('email')}</th>`,
                renderCell: (user) => `<td><a href="mailto:${Utils.escapeHtml(user.email)}" style="color: inherit; text-decoration: none;" title="Click to email, right-click for options">${Utils.escapeHtml(user.email)}</a></td>`
            },
            owner: {
                label: 'Owner',
                sortable: false,
                renderHeader: () => `<th>Owner</th>`,
                renderCell: (user) => {
                    if (!user.owner_id) {
                        return `<td></td>`;
                    }
                    const owner = this.owners.find(o => o.id === user.owner_id);
                    return `<td>${owner ? Utils.escapeHtml(owner.name) : ''}</td>`;
                }
            },
            plex: {
                label: 'Plex',
                sortable: true,
                sortKey: 'plex',
                renderHeader: () => `<th onclick="Users.toggleSort('plex')" style="cursor: pointer;">Plex ${this.getSortIcon('plex')}</th>`,
                renderCell: (user) => `<td>
                    ${user.plex_enabled ? `
                        <div>
                            ${Utils.getExpirationBadge(user.plex_expiration_date)}
                            ${user.plex_cancelled_at ?
                                `<br><small style="color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</small>` :
                                (user.plex_package_name ? `<br><small>${user.plex_package_name}</small>` : '')}
                        </div>
                    ` : ''}
                </td>`
            },
            iptv: {
                label: 'IPTV',
                sortable: true,
                sortKey: 'iptv',
                renderHeader: () => `<th onclick="Users.toggleSort('iptv')" style="cursor: pointer;">IPTV ${this.getSortIcon('iptv')}</th>`,
                renderCell: (user) => `<td>
                    ${user.iptv_enabled ? `
                        <div>
                            ${Utils.getExpirationBadge(user.iptv_expiration_date)}
                            ${user.iptv_cancelled_at ?
                                `<br><small style="color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</small>` :
                                (user.iptv_panel_name ? `<br><small>${user.iptv_panel_name}</small>` : '')}
                        </div>
                    ` : ''}
                </td>`
            },
            iptvEditor: {
                label: 'IPTV Editor',
                sortable: false,
                renderHeader: () => `<th>IPTV Editor</th>`,
                renderCell: (user) => `<td>${Utils.getStatusBadge(user.iptv_editor_enabled, 'Enabled', 'Disabled')}</td>`
            },
            tags: {
                label: 'Tags',
                sortable: false,
                renderHeader: () => `<th>Tags</th>`,
                renderCell: (user) => `<td>
                    ${user.tags && user.tags.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                            ${user.tags.map(tag => `
                                <span class="badge" style="background-color: ${tag.color}; color: white; font-size: 0.7rem;">
                                    ${Utils.escapeHtml(tag.name)}
                                </span>
                            `).join('')}
                        </div>
                    ` : '<span class="badge badge-secondary" style="font-size: 0.7rem;">No tags</span>'}
                </td>`
            },
            created: {
                label: 'Created',
                sortable: true,
                sortKey: 'created_at',
                renderHeader: () => `<th onclick="Users.toggleSort('created_at')" style="cursor: pointer;">Created ${this.getSortIcon('created_at')}</th>`,
                renderCell: (user) => `<td>${Utils.formatDate(user.created_at)}</td>`
            },
            actions: {
                label: 'Actions',
                sortable: false,
                renderHeader: () => `<th>Actions</th>`,
                renderCell: (user) => `<td>
                    <a href="#email/${user.id}" class="btn btn-sm btn-outline" title="Send Email (right-click for new tab)">
                        <i class="fas fa-envelope"></i>
                    </a>
                    <button class="btn btn-sm btn-outline" onclick="Users.viewUser(${user.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="#edit-user/${user.id}" class="btn btn-sm btn-outline" title="Edit (right-click for new tab)" onclick="sessionStorage.setItem('usersPageFilters', JSON.stringify(Users.currentFilters))">
                        <i class="fas fa-edit"></i>
                    </a>
                    <button class="btn btn-sm btn-outline" onclick="Users.signInAsUser(${user.id}, '${Utils.escapeHtml(user.name || user.email)}')" title="Sign in as this user">
                        <i class="fas fa-user-secret"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="Users.deleteUser(${user.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>`
            }
        };

        // Clean up deprecated columns from columnOrder and save if any were removed
        const validColumnOrder = columnOrder.filter(col => columnConfig.hasOwnProperty(col));
        if (validColumnOrder.length !== columnOrder.length) {
            // Deprecated columns detected - update and save preferences
            this.userPreferences.columnOrder = validColumnOrder;
            this.savePreferences();
            console.log('Removed deprecated columns from preferences:',
                columnOrder.filter(col => !columnConfig.hasOwnProperty(col)));
        }

        // Build visible columns based on order and visibility settings
        const visibleColumns = validColumnOrder.filter(col => columnsVisible[col] && columnConfig[col]);

        // Build table headers
        const headers = visibleColumns.map(col => columnConfig[col].renderHeader()).join('');

        // Build table rows
        const rows = users.map(user => {
            const cells = visibleColumns.map(col => columnConfig[col].renderCell(user)).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
            ${this.renderBulkActionsBar()}
            <div class="users-desktop-view" style="padding: 1.5rem; display: block;">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>${headers}</tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /**
     * Render mobile card view
     */
    renderMobileCards(users) {
        return `
            <div class="users-mobile-view" style="padding: 1rem; display: none;">
                ${users.map(user => `
                    <div class="user-card" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                        <div class="user-card-header" onclick="Users.toggleMobileCard(${user.id})" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">
                                    ${Utils.escapeHtml(user.name)}
                                </div>
                                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                                    <a href="mailto:${Utils.escapeHtml(user.email)}" style="color: inherit; text-decoration: none;">${Utils.escapeHtml(user.email)}</a>
                                </div>
                                ${user.tags && user.tags.length > 0 ? `
                                    <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                                        ${user.tags.map(tag => `
                                            <span class="badge" style="background-color: ${tag.color}; color: white; font-size: 0.7rem;">
                                                ${Utils.escapeHtml(tag.name)}
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                            <i class="fas fa-chevron-down" id="card-icon-${user.id}" style="transition: transform 0.2s;"></i>
                        </div>
                        <div class="user-card-body" id="card-body-${user.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                            <div style="display: grid; gap: 0.75rem;">
                                ${user.plex_enabled ? `
                                    <div>
                                        <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Plex</div>
                                        ${Utils.getExpirationBadge(user.plex_expiration_date)}
                                        ${user.plex_cancelled_at ?
                                            `<div style="font-size: 0.875rem; margin-top: 0.25rem; color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</div>` :
                                            (user.plex_package_name ? `<div style="font-size: 0.875rem; margin-top: 0.25rem;">${user.plex_package_name}</div>` : '')}
                                    </div>
                                ` : ''}
                                ${user.iptv_enabled ? `
                                    <div>
                                        <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">IPTV</div>
                                        ${Utils.getExpirationBadge(user.iptv_expiration_date)}
                                        ${user.iptv_cancelled_at ?
                                            `<div style="font-size: 0.875rem; margin-top: 0.25rem; color: var(--warning-color);"><i class="fas fa-clock"></i> Cancelled</div>` :
                                            (user.iptv_panel_name ? `<div style="font-size: 0.875rem; margin-top: 0.25rem;">${user.iptv_panel_name}</div>` : '')}
                                    </div>
                                ` : ''}
                                ${user.iptv_editor_enabled ? `
                                    <div>
                                        <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">IPTV Editor</div>
                                        ${Utils.getStatusBadge(user.iptv_editor_enabled, 'Enabled', 'Disabled')}
                                    </div>
                                ` : ''}
                                <div>
                                    <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Created</div>
                                    <div style="font-size: 0.875rem;">${Utils.formatDate(user.created_at)}</div>
                                </div>
                                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                                    <button class="btn btn-sm btn-outline" onclick="Users.viewUser(${user.id})" style="flex: 1; min-width: 70px;">
                                        <i class="fas fa-eye"></i> View
                                    </button>
                                    <a href="#edit-user/${user.id}" class="btn btn-sm btn-outline" style="flex: 1; min-width: 70px; text-align: center;" onclick="sessionStorage.setItem('usersPageFilters', JSON.stringify(Users.currentFilters))">
                                        <i class="fas fa-edit"></i> Edit
                                    </a>
                                    <button class="btn btn-sm btn-outline" onclick="Users.signInAsUser(${user.id}, '${Utils.escapeHtml(user.name || user.email).replace(/'/g, "\\'")}')" style="flex: 1; min-width: 90px;">
                                        <i class="fas fa-user-secret"></i> Sign In
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="Users.deleteUser(${user.id})" style="flex: 1; min-width: 70px;">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Toggle mobile card expansion
     */
    toggleMobileCard(userId) {
        const cardBody = document.getElementById(`card-body-${userId}`);
        const cardIcon = document.getElementById(`card-icon-${userId}`);

        if (cardBody && cardIcon) {
            const isExpanded = cardBody.style.display !== 'none';
            cardBody.style.display = isExpanded ? 'none' : 'block';
            cardIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    },

    // ============================================
    // BULK SELECTION & ACTIONS
    // ============================================

    /**
     * Render bulk actions bar (shown when users are selected)
     */
    renderBulkActionsBar() {
        if (this.selectedUsers.size === 0) {
            return '';
        }

        return `
            <div id="bulk-actions-bar" style="
                background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                padding: 12px 24px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 12px;
            ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="color: white; font-weight: 600;">
                        <i class="fas fa-check-square"></i>
                        ${this.selectedUsers.size} user${this.selectedUsers.size !== 1 ? 's' : ''} selected
                    </span>
                    <button class="btn btn-sm" onclick="Users.clearSelection()" style="background: rgba(255,255,255,0.2); color: white; border: none;">
                        <i class="fas fa-times"></i> Clear
                    </button>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-sm" onclick="Users.showBulkEditTagsModal()" style="background: rgba(255,255,255,0.9); color: var(--primary-color);">
                        <i class="fas fa-tags"></i> Edit Tags
                    </button>
                    <button class="btn btn-sm" onclick="Users.showBulkEditOwnerModal()" style="background: rgba(255,255,255,0.9); color: var(--primary-color);">
                        <i class="fas fa-user-tie"></i> Change Owner
                    </button>
                    <button class="btn btn-sm" onclick="Users.exportSelectedUsers()" style="background: rgba(255,255,255,0.9); color: var(--primary-color);">
                        <i class="fas fa-file-export"></i> Export CSV
                    </button>
                    <button class="btn btn-sm" onclick="Users.showBulkDeleteModal()" style="background: #ef4444; color: white; border: none;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Toggle selection of a single user
     */
    toggleUserSelection(userId, checkbox) {
        if (checkbox.checked) {
            this.selectedUsers.add(userId);
        } else {
            this.selectedUsers.delete(userId);
        }
        this.updateBulkActionsBar();
        this.updateSelectAllCheckbox();
    },

    /**
     * Toggle select all users
     */
    toggleSelectAll(checkbox) {
        if (checkbox.checked) {
            // Select all current users
            this.currentUsers.forEach(user => this.selectedUsers.add(user.id));
        } else {
            // Deselect all
            this.selectedUsers.clear();
        }
        // Update all checkboxes
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.checked = checkbox.checked;
        });
        this.updateBulkActionsBar();
    },

    /**
     * Update select all checkbox state based on individual selections
     */
    updateSelectAllCheckbox() {
        const selectAll = document.getElementById('select-all-users');
        if (selectAll) {
            const allSelected = this.currentUsers.length > 0 &&
                this.currentUsers.every(user => this.selectedUsers.has(user.id));
            selectAll.checked = allSelected;
        }
    },

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedUsers.clear();
        document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
        const selectAll = document.getElementById('select-all-users');
        if (selectAll) selectAll.checked = false;
        this.updateBulkActionsBar();
    },

    /**
     * Update the bulk actions bar without full re-render
     */
    updateBulkActionsBar() {
        const existingBar = document.getElementById('bulk-actions-bar');
        const newBarHtml = this.renderBulkActionsBar();

        if (this.selectedUsers.size === 0) {
            // Remove bar if no selections
            if (existingBar) existingBar.remove();
        } else if (existingBar) {
            // Update existing bar
            existingBar.outerHTML = newBarHtml;
        } else {
            // Insert bar at top of users list
            const usersDesktop = document.querySelector('.users-desktop-view');
            if (usersDesktop) {
                usersDesktop.insertAdjacentHTML('beforebegin', newBarHtml);
            }
        }
    },

    /**
     * Show bulk edit tags modal
     */
    showBulkEditTagsModal() {
        const selectedCount = this.selectedUsers.size;

        // Build tags checkboxes
        const tagsHtml = this.tags.map(tag => `
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 6px; background: var(--bg-secondary); margin-bottom: 6px;">
                <input type="checkbox" value="${tag.id}" class="bulk-tag-checkbox">
                <span class="badge" style="background-color: ${tag.color}; color: white;">${Utils.escapeHtml(tag.name)}</span>
            </label>
        `).join('');

        Utils.showModal({
            title: `Edit Tags for ${selectedCount} User${selectedCount !== 1 ? 's' : ''}`,
            size: 'medium',
            body: `
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; gap: 16px; margin-bottom: 12px;">
                        <label class="radio-label">
                            <input type="radio" name="bulk-tag-action" value="add" checked> Add tags
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="bulk-tag-action" value="remove"> Remove tags
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="bulk-tag-action" value="replace"> Replace all tags
                        </label>
                    </label>
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${tagsHtml || '<p style="color: var(--text-secondary);">No tags defined. Create tags in Settings first.</p>'}
                </div>
            `,
            buttons: [
                { text: 'Cancel', class: 'btn-outline', onclick: () => Utils.closeModal() },
                {
                    text: 'Apply Changes',
                    class: 'btn-primary',
                    onclick: () => this.executeBulkTagEdit()
                }
            ]
        });
    },

    /**
     * Execute bulk tag edit
     */
    async executeBulkTagEdit() {
        const action = document.querySelector('input[name="bulk-tag-action"]:checked')?.value;
        const selectedTagIds = Array.from(document.querySelectorAll('.bulk-tag-checkbox:checked')).map(cb => parseInt(cb.value));

        if (selectedTagIds.length === 0 && action !== 'replace') {
            Utils.showToast('Please select at least one tag', 'warning');
            return;
        }

        Utils.closeModal();
        Utils.showLoading('Updating tags...');

        try {
            const userIds = Array.from(this.selectedUsers);
            let successCount = 0;

            for (const userId of userIds) {
                try {
                    const user = this.currentUsers.find(u => u.id === userId);
                    let newTagIds = [];

                    if (action === 'add') {
                        // Add to existing tags
                        const existingTagIds = (user.tags || []).map(t => t.id);
                        newTagIds = [...new Set([...existingTagIds, ...selectedTagIds])];
                    } else if (action === 'remove') {
                        // Remove from existing tags
                        const existingTagIds = (user.tags || []).map(t => t.id);
                        newTagIds = existingTagIds.filter(id => !selectedTagIds.includes(id));
                    } else if (action === 'replace') {
                        // Replace all tags
                        newTagIds = selectedTagIds;
                    }

                    await API.updateUser(userId, { tag_ids: newTagIds });
                    successCount++;
                } catch (err) {
                    console.error(`Failed to update tags for user ${userId}:`, err);
                }
            }

            Utils.hideLoading();
            Utils.showToast(`Updated tags for ${successCount} of ${userIds.length} users`, 'success');
            this.clearSelection();
            await this.loadUsers();
        } catch (error) {
            Utils.hideLoading();
            console.error('Bulk tag edit error:', error);
            Utils.showToast('Failed to update tags', 'error');
        }
    },

    /**
     * Show bulk edit owner modal
     */
    showBulkEditOwnerModal() {
        const selectedCount = this.selectedUsers.size;

        // Build owner options
        const ownerOptions = this.owners.map(owner =>
            `<option value="${owner.id}">${Utils.escapeHtml(owner.name)}</option>`
        ).join('');

        Utils.showModal({
            title: `Change Owner for ${selectedCount} User${selectedCount !== 1 ? 's' : ''}`,
            size: 'small',
            body: `
                <div class="form-group">
                    <label class="form-label">Select Owner</label>
                    <select id="bulk-owner-select" class="form-input">
                        <option value="">No Owner</option>
                        ${ownerOptions}
                    </select>
                </div>
            `,
            buttons: [
                { text: 'Cancel', class: 'btn-outline', onclick: () => Utils.closeModal() },
                {
                    text: 'Apply Changes',
                    class: 'btn-primary',
                    onclick: () => this.executeBulkOwnerEdit()
                }
            ]
        });
    },

    /**
     * Execute bulk owner edit
     */
    async executeBulkOwnerEdit() {
        const ownerId = document.getElementById('bulk-owner-select')?.value || null;

        Utils.closeModal();
        Utils.showLoading('Updating owner...');

        try {
            const userIds = Array.from(this.selectedUsers);
            let successCount = 0;

            for (const userId of userIds) {
                try {
                    await API.updateUser(userId, { owner_id: ownerId || null });
                    successCount++;
                } catch (err) {
                    console.error(`Failed to update owner for user ${userId}:`, err);
                }
            }

            Utils.hideLoading();
            Utils.showToast(`Updated owner for ${successCount} of ${userIds.length} users`, 'success');
            this.clearSelection();
            await this.loadUsers();
        } catch (error) {
            Utils.hideLoading();
            console.error('Bulk owner edit error:', error);
            Utils.showToast('Failed to update owner', 'error');
        }
    },

    /**
     * Show bulk delete confirmation modal
     */
    showBulkDeleteModal() {
        const selectedCount = this.selectedUsers.size;

        Utils.showModal({
            title: `Delete ${selectedCount} User${selectedCount !== 1 ? 's' : ''}?`,
            size: 'small',
            body: `
                <div style="text-align: center; padding: 20px 0;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger-color); margin-bottom: 16px;"></i>
                    <p style="font-size: 16px; margin-bottom: 12px;">
                        Are you sure you want to delete <strong>${selectedCount}</strong> user${selectedCount !== 1 ? 's' : ''}?
                    </p>
                    <p style="color: var(--text-secondary);">
                        This action cannot be undone.
                    </p>
                </div>
                <div class="form-group" style="margin-top: 16px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="bulk-delete-from-plex">
                        Also remove from Plex servers
                    </label>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="bulk-delete-from-iptv">
                        Also remove from IPTV panels
                    </label>
                </div>
            `,
            buttons: [
                { text: 'Cancel', class: 'btn-outline', onclick: () => Utils.closeModal() },
                {
                    text: 'Delete Users',
                    class: 'btn-danger',
                    onclick: () => this.executeBulkDelete()
                }
            ]
        });
    },

    /**
     * Execute bulk delete
     */
    async executeBulkDelete() {
        const deleteFromPlex = document.getElementById('bulk-delete-from-plex')?.checked || false;
        const deleteFromIPTV = document.getElementById('bulk-delete-from-iptv')?.checked || false;

        Utils.closeModal();
        Utils.showLoading('Deleting users...');

        try {
            const userIds = Array.from(this.selectedUsers);
            let successCount = 0;
            let failedCount = 0;

            for (const userId of userIds) {
                try {
                    await API.deleteUser(userId, deleteFromPlex, deleteFromIPTV);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to delete user ${userId}:`, err);
                    failedCount++;
                }
            }

            Utils.hideLoading();

            if (failedCount > 0) {
                Utils.showToast(`Deleted ${successCount} users. ${failedCount} failed.`, 'warning');
            } else {
                Utils.showToast(`Successfully deleted ${successCount} users`, 'success');
            }

            this.clearSelection();
            await this.loadUsers();
        } catch (error) {
            Utils.hideLoading();
            console.error('Bulk delete error:', error);
            Utils.showToast('Failed to delete users', 'error');
        }
    },

    /**
     * Export selected users to CSV (matching import format)
     */
    exportSelectedUsers() {
        const userIds = Array.from(this.selectedUsers);
        const selectedUsers = this.currentUsers.filter(u => userIds.includes(u.id));

        if (selectedUsers.length === 0) {
            Utils.showToast('No users selected', 'error');
            return;
        }

        // CSV header - matches import format
        const headers = [
            'name',
            'email',
            'account_type',
            'owner_name',
            'plex_enabled',
            'plex_package_id',
            'plex_email',
            'plex_duration_months',
            'iptv_enabled',
            'iptv_panel_id',
            'iptv_username',
            'iptv_password',
            'iptv_package_id',
            'iptv_duration_months',
            'iptv_is_trial',
            'iptv_bouquet_ids',
            'notes'
        ];

        // Helper to escape CSV values
        const escapeCSV = (value) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        // Helper to calculate remaining months from expiration date
        const calculateRemainingMonths = (expirationDate) => {
            if (!expirationDate) return '';
            const now = new Date();
            const exp = new Date(expirationDate);
            const months = Math.max(0, Math.round((exp - now) / (30.44 * 24 * 60 * 60 * 1000)));
            return months;
        };

        // Build CSV rows
        const rows = [headers.join(',')];

        for (const user of selectedUsers) {
            // Look up owner name from owners list
            const owner = user.owner_id ? this.owners.find(o => o.id === user.owner_id) : null;
            const ownerName = owner ? owner.name : '';

            const row = [
                escapeCSV(user.name),
                escapeCSV(user.email),
                escapeCSV(user.account_type || 'standard'),
                escapeCSV(ownerName),
                user.plex_enabled ? 'true' : 'false',
                escapeCSV(user.plex_package_id || ''),
                escapeCSV(user.plex_email || user.email),
                calculateRemainingMonths(user.plex_expiration_date),
                user.iptv_enabled ? 'true' : 'false',
                escapeCSV(user.iptv_panel_id || ''),
                escapeCSV(user.iptv_username || ''),
                escapeCSV(user.iptv_password || ''),
                escapeCSV(user.iptv_package_id || ''),
                calculateRemainingMonths(user.iptv_expiration_date),
                'false', // iptv_is_trial - not tracked on user, default to false
                '', // iptv_bouquet_ids - not easily accessible from user object
                escapeCSV(user.notes || '')
            ];
            rows.push(row.join(','));
        }

        const csvContent = rows.join('\n');

        // Create download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Utils.showToast(`Exported ${selectedUsers.length} users to CSV`, 'success');
    },

    // ============================================
    // END BULK ACTIONS
    // ============================================

    /**
     * Show customize columns modal
     */
    showCustomizeModal() {
        const { columnsVisible, columnOrder } = this.userPreferences;

        // Define column labels
        const columnLabels = {
            name: 'Name',
            email: 'Email',
            owner: 'Owner',
            plex: 'Plex',
            iptv: 'IPTV',
            iptvEditor: 'IPTV Editor',
            tags: 'Tags',
            created: 'Created Date',
            actions: 'Actions'
        };

        // Build column order list (excluding checkbox and actions which are fixed positions)
        const reorderableColumns = columnOrder.filter(col => col !== 'actions' && col !== 'checkbox');
        const columnListHTML = reorderableColumns.map((col, index) => `
            <div class="column-item" draggable="true" data-column="${col}" data-index="${index}" style="
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 0.5rem;
                padding: 0.75rem;
                margin-bottom: 0.5rem;
                cursor: move;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                transition: all 0.2s;
            ">
                <i class="fas fa-grip-vertical" style="color: var(--text-secondary);"></i>
                <label class="checkbox-label" style="flex: 1; margin: 0; cursor: move;">
                    <input type="checkbox" id="col-${col}" ${columnsVisible[col] ? 'checked' : ''} onclick="event.stopPropagation();">
                    ${columnLabels[col]}
                </label>
            </div>
        `).join('');

        Utils.showModal({
            title: 'Customize Columns',
            size: 'medium',
            body: `
                <div>
                    <h4 style="margin-bottom: 0.5rem;">Column Visibility & Order</h4>
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                        Check/uncheck to show/hide columns. Drag to reorder.
                    </p>

                    <div id="column-order-list" style="user-select: none;">
                        ${columnListHTML}
                    </div>

                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                        <i class="fas fa-info-circle"></i> The Actions column is always shown last.
                    </p>

                    <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 0.5rem;">Column Widths</h4>
                        <p style="color: var(--text-secondary); margin-bottom: 0.75rem; font-size: 0.875rem;">
                            Drag column borders in the table to resize. Widths are saved automatically.
                        </p>
                        <button class="btn btn-sm btn-outline" onclick="Users.resetColumnWidths(); Utils.closeModal();">
                            <i class="fas fa-undo"></i> Reset to Default Widths
                        </button>
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
                    text: 'Save',
                    class: 'btn-primary',
                    onClick: () => {
                        // Get new column order from DOM
                        const columnItems = document.querySelectorAll('.column-item');
                        const newOrder = ['checkbox']; // Always add checkbox first
                        newOrder.push(...Array.from(columnItems).map(item => item.dataset.column));
                        newOrder.push('actions'); // Always add actions at the end

                        // Get visibility settings
                        const newVisible = { checkbox: true }; // Checkbox always visible
                        reorderableColumns.forEach(col => {
                            newVisible[col] = document.getElementById(`col-${col}`).checked;
                        });
                        newVisible.actions = true; // Actions always visible

                        // Save preferences
                        this.userPreferences.columnOrder = newOrder;
                        this.userPreferences.columnsVisible = newVisible;
                        this.savePreferences();
                        Utils.closeModal();
                        this.loadUsers();
                    }
                }
            ]
        });

        // Setup drag and drop after modal is rendered
        setTimeout(() => this.setupDragAndDrop(), 100);
    },

    /**
     * Setup drag and drop for column reordering
     */
    setupDragAndDrop() {
        const columnList = document.getElementById('column-order-list');
        if (!columnList) return;

        let draggedElement = null;

        columnList.querySelectorAll('.column-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedElement = item;
                item.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', (e) => {
                item.style.opacity = '1';
                // Remove all drag-over classes
                columnList.querySelectorAll('.column-item').forEach(el => {
                    el.style.borderColor = 'var(--border-color)';
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                if (draggedElement !== item) {
                    item.style.borderColor = 'var(--primary-color)';
                }
            });

            item.addEventListener('dragleave', (e) => {
                item.style.borderColor = 'var(--border-color)';
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.style.borderColor = 'var(--border-color)';

                if (draggedElement !== item) {
                    // Get all items
                    const allItems = Array.from(columnList.querySelectorAll('.column-item'));
                    const draggedIndex = allItems.indexOf(draggedElement);
                    const targetIndex = allItems.indexOf(item);

                    // Reorder in DOM
                    if (draggedIndex < targetIndex) {
                        item.after(draggedElement);
                    } else {
                        item.before(draggedElement);
                    }
                }
            });
        });
    },

    /**
     * Show add user wizard (using multi-step wizard)
     */
    async showAddUserModal() {
        try {
            // Initialize wizard
            await CreateUserWizard.init();

            // Show wizard in modal - use large size with explicit height
            Utils.showModal({
                title: 'Create New User',
                size: 'large',
                body: `<div id="wizard-modal-content" style="min-height: calc(100vh - 200px); display: flex; flex-direction: column;"></div>`,
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
     * Show portal announcements modal
     */
    async showAnnouncementsModal() {
        // Fetch current notices
        let notices = { everyone: '', plex: '', iptv: '' };
        try {
            const data = await API.request('/admin/portal/notices');
            if (data.success) {
                notices = data.notices;
            }
        } catch (error) {
            console.error('Error fetching notices:', error);
        }

        Utils.showModal({
            title: '<i class="fas fa-bullhorn"></i> Portal Announcements',
            size: 'large',
            body: `
                <div class="announcements-config">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        Configure static notices that appear on the user portal. Each notice type is shown to users with that service.<br>
                        <small>HTML is supported for formatting.</small>
                    </p>

                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label class="form-label"><i class="fas fa-globe" style="color: var(--primary-color);"></i> Everyone Notice</label>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Shown to all portal users regardless of their services.
                        </p>
                        <textarea id="notice-everyone" class="form-input" rows="4" placeholder="Enter a notice for all users...">${Utils.escapeHtml(notices.everyone || '')}</textarea>
                    </div>

                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label class="form-label"><i class="fas fa-film" style="color: #e5a00d;"></i> Plex Notice</label>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Shown only to users with Plex service enabled.
                        </p>
                        <textarea id="notice-plex" class="form-input" rows="4" placeholder="Enter a notice for Plex users...">${Utils.escapeHtml(notices.plex || '')}</textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-tv" style="color: #6366f1;"></i> IPTV Notice</label>
                        <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Shown only to users with IPTV service enabled.
                        </p>
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
                        Send a one-time notification that will appear as a banner for admins when they are active in the admin area.
                        This is useful for quick reminders or alerts.
                    </p>

                    <div class="form-group">
                        <label class="form-label">
                            <i class="fas fa-comment-alt" style="color: var(--primary-color);"></i>
                            Notification Message
                        </label>
                        <textarea id="admin-notification-message" class="form-input" rows="4" placeholder="Enter your notification message..." maxlength="500"></textarea>
                        <p style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 0.5rem;">Max 500 characters. This will be shown as a dismissible banner notification.</p>
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

        try {
            const user = API.getCurrentUser();
            const data = await API.request('/admin/portal/admin-notifications', {
                method: 'POST',
                body: {
                    message,
                    created_by: user?.name || user?.username || 'Admin'
                }
            });

            if (data.success) {
                Utils.closeModal();
                Utils.showToast('Success', 'Admin notification sent successfully', 'success');
                // Trigger immediate check for notifications
                if (window.loadAdminNotifications) {
                    window.loadAdminNotifications();
                }
            } else {
                Utils.showToast('Error', data.message || 'Failed to send notification', 'error');
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            Utils.showToast('Error', 'Failed to send notification', 'error');
        }
    },

    /**
     * Save portal notices
     */
    async savePortalNotices() {
        const everyone = document.getElementById('notice-everyone').value;
        const plex = document.getElementById('notice-plex').value;
        const iptv = document.getElementById('notice-iptv').value;

        try {
            const data = await API.request('/admin/portal/notices', {
                method: 'PUT',
                body: { everyone, plex, iptv }
            });

            if (data.success) {
                Utils.showToast('Success', 'Portal notices updated successfully', 'success');
                Utils.closeModal();
            } else {
                Utils.showToast('Error', data.message || 'Failed to save notices', 'error');
            }
        } catch (error) {
            console.error('Error saving notices:', error);
            Utils.showToast('Error', 'Failed to save notices', 'error');
        }
    },

    // ============ Add User Dropdown Functions ============

    /**
     * Toggle the Add User dropdown menu
     */
    toggleAddUserDropdown(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('add-user-dropdown');
        if (!dropdown) return;

        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';

        // Close dropdown when clicking outside
        if (!isVisible) {
            const closeHandler = (e) => {
                if (!dropdown.contains(e.target) && !e.target.closest('.dropdown')) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    },

    /**
     * Hide the Add User dropdown
     */
    hideAddUserDropdown() {
        const dropdown = document.getElementById('add-user-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    },

    // ============ Manage Requests Functions ============

    _manageRequestsFilter: 'all',

    /**
     * Show modal to manage all service requests and support messages
     */
    async showManageRequestsModal(openTab = 'service') {
        // Reset the loaded flag so support messages will reload
        this._supportMessagesLoaded = false;

        Utils.showModal({
            title: '<i class="fas fa-headset"></i> Support',
            body: `
                <div class="tabs" style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-primary tab-btn active" onclick="Users.switchRequestsTab('service')" data-tab="service" style="flex: 1; padding: 0.75rem 1rem; border-radius: 8px;">
                        <i class="fas fa-shopping-cart"></i> Service Requests
                    </button>
                    <button class="btn btn-secondary tab-btn" onclick="Users.switchRequestsTab('support')" data-tab="support" style="flex: 1; padding: 0.75rem 1rem; border-radius: 8px;">
                        <i class="fas fa-envelope"></i> Support Messages
                    </button>
                </div>

                <!-- Service Requests Tab -->
                <div id="service-requests-tab" class="tab-content">
                    <div style="margin-bottom: 1rem;">
                        <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                            View and manage all service requests. You can delete old verified or rejected requests to clean up.
                        </p>
                        <div class="btn-group" id="service-requests-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-sm btn-primary" onclick="Users.loadManageRequests('all')">All</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadManageRequests('verified')">Verified</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadManageRequests('rejected')">Rejected</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadManageRequests('pending')">Pending</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadManageRequests('submitted')">Submitted</button>
                        </div>
                    </div>
                    <div id="manage-requests-list">
                        <div class="text-center"><div class="spinner"></div></div>
                    </div>
                </div>

                <!-- Support Messages Tab -->
                <div id="support-messages-tab" class="tab-content" style="display: none;">
                    <div style="margin-bottom: 1rem;">
                        <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                            View and respond to support messages from users.
                        </p>
                        <div class="btn-group" id="support-messages-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-sm btn-primary" onclick="Users.loadSupportMessages('all')">All</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadSupportMessages('new')">New</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadSupportMessages('in_progress')">In Progress</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadSupportMessages('resolved')">Resolved</button>
                            <button class="btn btn-sm btn-secondary" onclick="Users.loadSupportMessages('closed')">Closed</button>
                        </div>
                    </div>
                    <div id="support-messages-list">
                        <div class="text-center"><div class="spinner"></div></div>
                    </div>
                </div>
            `,
            size: 'large'
        });

        // Open the specified tab
        if (openTab === 'support') {
            this.switchRequestsTab('support');
        } else {
            await this.loadManageRequests('all');
        }
    },

    /**
     * Switch between Service Requests and Support Messages tabs
     */
    switchRequestsTab(tab) {
        // Update tab buttons - toggle between primary and secondary styles
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                btn.classList.add('active');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
                btn.classList.remove('active');
            }
        });

        // Show/hide tab content
        document.getElementById('service-requests-tab').style.display = tab === 'service' ? 'block' : 'none';
        document.getElementById('support-messages-tab').style.display = tab === 'support' ? 'block' : 'none';

        // Load data for the selected tab if not already loaded
        if (tab === 'support' && !this._supportMessagesLoaded) {
            this.loadSupportMessages('all');
        }
    },

    /**
     * Load requests for the manage requests modal
     */
    async loadManageRequests(filter) {
        this._manageRequestsFilter = filter;
        const container = document.getElementById('manage-requests-list');
        if (!container) return;

        // Update button styles
        const btnGroup = container.parentElement.querySelector('.btn-group');
        if (btnGroup) {
            btnGroup.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            });
            const activeBtn = btnGroup.querySelector(`[onclick*="'${filter}'"]`);
            if (activeBtn) {
                activeBtn.classList.remove('btn-secondary');
                activeBtn.classList.add('btn-primary');
            }
        }

        try {
            const response = await API.getServiceRequests({});
            if (!response.success) {
                container.innerHTML = '<p class="text-danger">Failed to load requests</p>';
                return;
            }

            let requests = response.requests || [];

            // Filter by status
            if (filter !== 'all') {
                requests = requests.filter(r => r.payment_status === filter);
            }

            if (requests.length === 0) {
                container.innerHTML = '<p class="text-muted text-center">No requests found</p>';
                return;
            }

            container.innerHTML = `
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Service</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${requests.map(r => `
                                <tr id="request-row-${r.id}">
                                    <td>
                                        <strong>${Utils.escapeHtml(r.user_name)}</strong><br>
                                        <small class="text-muted">${Utils.escapeHtml(r.user_email)}</small>
                                    </td>
                                    <td>
                                        <span class="badge ${r.service_type === 'plex' ? 'badge-warning' : 'badge-purple'}">
                                            <i class="fas ${r.service_type === 'plex' ? 'fa-film' : 'fa-tv'}"></i>
                                            ${r.service_type === 'plex' ? 'Plex' : 'IPTV'}
                                        </span>
                                    </td>
                                    <td>${Utils.escapeHtml(r.plan_name || 'N/A')}</td>
                                    <td>
                                        <span class="badge ${
                                            r.payment_status === 'submitted' ? 'badge-info' :
                                            r.payment_status === 'verified' ? 'badge-success' :
                                            r.payment_status === 'rejected' ? 'badge-danger' :
                                            'badge-warning'
                                        }">
                                            ${r.payment_status}
                                        </span>
                                    </td>
                                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button class="btn btn-sm btn-danger" onclick="Users.deleteServiceRequest(${r.id})" title="Delete Request">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <span class="text-muted">Showing ${requests.length} request(s)</span>
                    ${filter === 'verified' || filter === 'rejected' ? `
                        <button class="btn btn-sm btn-danger" onclick="Users.deleteAllFilteredRequests('${filter}')">
                            <i class="fas fa-trash"></i> Delete All ${filter === 'verified' ? 'Verified' : 'Rejected'}
                        </button>
                    ` : ''}
                </div>
            `;

        } catch (error) {
            console.error('Error loading manage requests:', error);
            container.innerHTML = '<p class="text-danger">Error loading requests</p>';
        }
    },

    /**
     * Delete a single service request
     */
    async deleteServiceRequest(requestId) {
        if (!confirm('Are you sure you want to delete this service request? This cannot be undone.')) return;

        try {
            const response = await API.deleteServiceRequest(requestId);

            if (response.success) {
                // Remove the row from the table
                const row = document.getElementById(`request-row-${requestId}`);
                if (row) row.remove();

                Utils.showToast('Success', 'Service request deleted', 'success');

                // Refresh the appropriate list based on which view is open
                const serviceRequestsList = document.getElementById('service-requests-list');
                const manageRequestsContainer = document.getElementById('manage-requests-container');

                if (serviceRequestsList) {
                    // We're in the Service Requests modal
                    await this.filterServiceRequests(this._requestFilter || 'all');
                } else if (manageRequestsContainer) {
                    // We're in the Manage Requests view
                    await this.loadManageRequests(this._manageRequestsFilter);
                }

                // Refresh pending requests banner
                await this.loadPendingRequestsBanner();

                // Refresh nav badge
                if (window.loadPendingRequestsBadge) window.loadPendingRequestsBadge();
            } else {
                Utils.showToast('Error', response.message || 'Failed to delete request', 'error');
            }
        } catch (error) {
            console.error('Error deleting service request:', error);
            Utils.showToast('Error', 'Failed to delete request', 'error');
        }
    },

    /**
     * Delete all requests with a specific status
     */
    async deleteAllFilteredRequests(status) {
        const statusLabel = status === 'verified' ? 'verified' : 'rejected';
        if (!confirm(`Are you sure you want to delete ALL ${statusLabel} service requests? This cannot be undone.`)) return;

        try {
            Utils.showLoading();

            // Get all requests with this status
            const response = await API.getServiceRequests({});
            if (!response.success) {
                Utils.hideLoading();
                Utils.showToast('Error', 'Failed to load requests', 'error');
                return;
            }

            const requestsToDelete = response.requests.filter(r => r.payment_status === status);

            if (requestsToDelete.length === 0) {
                Utils.hideLoading();
                Utils.showToast('Info', 'No requests to delete', 'info');
                return;
            }

            // Delete each request
            let successCount = 0;
            for (const request of requestsToDelete) {
                try {
                    const deleteResponse = await API.deleteServiceRequest(request.id);
                    if (deleteResponse.success) successCount++;
                } catch (e) {
                    console.error('Error deleting request:', request.id, e);
                }
            }

            Utils.hideLoading();
            Utils.showToast('Success', `Deleted ${successCount} of ${requestsToDelete.length} requests`, 'success');

            // Refresh the list
            await this.loadManageRequests(this._manageRequestsFilter);

            // Refresh nav badge
            if (window.loadPendingRequestsBadge) window.loadPendingRequestsBadge();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error deleting all requests:', error);
            Utils.showToast('Error', 'Failed to delete requests', 'error');
        }
    },

    // ============ Support Messages Functions ============

    _supportMessagesFilter: 'all',
    _supportMessagesLoaded: false,

    /**
     * Load support messages for the support messages tab
     */
    async loadSupportMessages(filter) {
        this._supportMessagesFilter = filter;
        this._supportMessagesLoaded = true;
        const container = document.getElementById('support-messages-list');
        if (!container) return;

        // Update button styles
        const btnGroup = document.getElementById('support-messages-filters');
        if (btnGroup) {
            btnGroup.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            });
            const filterValue = filter === 'all' ? 'all' : filter;
            const activeBtn = btnGroup.querySelector(`[onclick*="'${filterValue}'"]`);
            if (activeBtn) {
                activeBtn.classList.remove('btn-secondary');
                activeBtn.classList.add('btn-primary');
            }
        }

        container.innerHTML = '<div class="text-center"><div class="spinner"></div></div>';

        try {
            const params = filter !== 'all' ? { status: filter } : {};
            const response = await API.getPortalMessages(params);

            if (!response.success) {
                container.innerHTML = `<p class="text-danger">Failed to load messages: ${response.error || response.message || 'Unknown error'}</p>`;
                return;
            }

            let messages = response.messages || [];

            if (messages.length === 0) {
                container.innerHTML = '<p class="text-muted text-center">No support messages found</p>';
                return;
            }

            const categoryLabels = {
                'general': 'General',
                'billing': 'Billing',
                'technical': 'Technical',
                'cancel_request': 'Cancellation',
                'add_service': 'Add Service'
            };

            const statusBadgeClass = (status) => {
                switch(status) {
                    case 'new': return 'badge-danger';
                    case 'read': return 'badge-info';
                    case 'in_progress': return 'badge-warning';
                    case 'resolved': return 'badge-success';
                    case 'closed': return 'badge-secondary';
                    default: return 'badge-secondary';
                }
            };

            const priorityBadgeClass = (priority) => {
                switch(priority) {
                    case 'urgent': return 'badge-danger';
                    case 'high': return 'badge-warning';
                    case 'normal': return 'badge-info';
                    case 'low': return 'badge-secondary';
                    default: return 'badge-secondary';
                }
            };

            container.innerHTML = `
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Subject</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${messages.map(m => `
                                <tr id="message-row-${m.id}" style="${m.status === 'new' ? 'background-color: rgba(239, 68, 68, 0.1);' : ''}">
                                    <td>
                                        <strong>${Utils.escapeHtml(m.user_name || 'Unknown')}</strong><br>
                                        <small class="text-muted">${Utils.escapeHtml(m.user_email || '')}</small>
                                    </td>
                                    <td>
                                        <a href="#" onclick="Users.showMessageDetail(${m.id}); return false;" style="color: var(--primary-color); text-decoration: none;">
                                            ${Utils.escapeHtml(m.subject)}
                                        </a>
                                        ${m.priority && m.priority !== 'normal' ? `<span class="badge ${priorityBadgeClass(m.priority)}" style="margin-left: 0.5rem; font-size: 0.7rem;">${m.priority}</span>` : ''}
                                    </td>
                                    <td>
                                        <span class="badge badge-outline">${categoryLabels[m.category] || m.category}</span>
                                    </td>
                                    <td>
                                        <span class="badge ${statusBadgeClass(m.status)}">${m.status.replace('_', ' ')}</span>
                                    </td>
                                    <td>${new Date(m.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="Users.showMessageDetail(${m.id})" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        ${m.status === 'new' ? `
                                            <button class="btn btn-sm btn-success" onclick="Users.updateMessageStatus(${m.id}, 'in_progress')" title="Mark In Progress">
                                                <i class="fas fa-play"></i>
                                            </button>
                                        ` : ''}
                                        ${m.status === 'in_progress' ? `
                                            <button class="btn btn-sm btn-success" onclick="Users.updateMessageStatus(${m.id}, 'resolved')" title="Mark Resolved">
                                                <i class="fas fa-check"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-danger" onclick="Users.deleteSupportMessage(${m.id})" title="Delete Message">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                    <span class="text-muted">Showing ${messages.length} message(s)</span>
                </div>
            `;

        } catch (error) {
            console.error('Error loading support messages:', error);
            container.innerHTML = '<p class="text-danger">Error loading messages</p>';
        }
    },

    /**
     * Show message detail modal
     */
    async showMessageDetail(messageId) {
        try {
            const response = await API.getPortalMessage(messageId);
            if (!response.success) {
                Utils.showToast('Error', 'Failed to load message', 'error');
                return;
            }

            const m = response.message;

            const categoryLabels = {
                'general': 'General',
                'billing': 'Billing',
                'technical': 'Technical Support',
                'cancel_request': 'Cancellation Request',
                'add_service': 'Add Service'
            };

            // Mark as read if it's new
            if (m.status === 'new') {
                await API.updatePortalMessage(messageId, { status: 'read' });
                // Update the row in the background
                const row = document.getElementById(`message-row-${messageId}`);
                if (row) row.style.backgroundColor = '';
            }

            Utils.showModal({
                title: `<i class="fas fa-envelope-open"></i> ${Utils.escapeHtml(m.subject)}`,
                body: `
                    <div style="margin-bottom: 1.5rem;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">From</label>
                                <p style="margin: 0.25rem 0 0 0;">${Utils.escapeHtml(m.user_name || 'Unknown')} <small class="text-muted">(${Utils.escapeHtml(m.user_email || 'No email')})</small></p>
                            </div>
                            <div>
                                <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">Category</label>
                                <p style="margin: 0.25rem 0 0 0;">${categoryLabels[m.category] || m.category}</p>
                            </div>
                            <div>
                                <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">Date</label>
                                <p style="margin: 0.25rem 0 0 0;">${new Date(m.created_at).toLocaleString()}</p>
                            </div>
                            <div>
                                <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">Status</label>
                                <p style="margin: 0.25rem 0 0 0;">
                                    <select id="message-status-select" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.9rem;">
                                        <option value="new" ${m.status === 'new' ? 'selected' : ''}>New</option>
                                        <option value="read" ${m.status === 'read' ? 'selected' : ''}>Read</option>
                                        <option value="in_progress" ${m.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                        <option value="resolved" ${m.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                        <option value="closed" ${m.status === 'closed' ? 'selected' : ''}>Closed</option>
                                    </select>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">Message</label>
                        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-top: 0.5rem; white-space: pre-wrap;">${Utils.escapeHtml(m.message)}</div>
                    </div>

                    <div>
                        <label style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">Admin Notes (internal)</label>
                        <textarea id="message-admin-notes" class="form-input" rows="3" style="margin-top: 0.5rem;" placeholder="Add internal notes...">${Utils.escapeHtml(m.admin_notes || '')}</textarea>
                    </div>

                    ${m.user_email ? `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                            <a href="mailto:${Utils.escapeHtml(m.user_email)}?subject=Re: ${encodeURIComponent(m.subject)}" class="btn btn-outline btn-sm">
                                <i class="fas fa-reply"></i> Reply via Email
                            </a>
                        </div>
                    ` : ''}
                `,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => Utils.closeModal()
                    },
                    {
                        text: 'Save Changes',
                        class: 'btn-primary',
                        onClick: async () => {
                            const status = document.getElementById('message-status-select').value;
                            const adminNotes = document.getElementById('message-admin-notes').value;

                            try {
                                const updateResponse = await API.updatePortalMessage(messageId, {
                                    status,
                                    admin_notes: adminNotes
                                });

                                if (updateResponse.success) {
                                    Utils.showToast('Success', 'Message updated', 'success');
                                    Utils.closeModal();
                                    await Users.loadSupportMessages(Users._supportMessagesFilter);
                                    // Refresh banner
                                    await Users.loadNewSupportMessagesBanner();
                                } else {
                                    Utils.showToast('Error', updateResponse.message || 'Failed to update', 'error');
                                }
                            } catch (error) {
                                console.error('Error updating message:', error);
                                Utils.showToast('Error', 'Failed to update message', 'error');
                            }
                        }
                    }
                ]
            });

        } catch (error) {
            console.error('Error loading message detail:', error);
            Utils.showToast('Error', 'Failed to load message', 'error');
        }
    },

    /**
     * Quick update message status
     */
    async updateMessageStatus(messageId, status) {
        try {
            const response = await API.updatePortalMessage(messageId, { status });

            if (response.success) {
                Utils.showToast('Success', `Message marked as ${status.replace('_', ' ')}`, 'success');
                await this.loadSupportMessages(this._supportMessagesFilter);
                // Refresh banner
                await this.loadNewSupportMessagesBanner();
            } else {
                Utils.showToast('Error', response.message || 'Failed to update', 'error');
            }
        } catch (error) {
            console.error('Error updating message status:', error);
            Utils.showToast('Error', 'Failed to update status', 'error');
        }
    },

    /**
     * Delete a support message
     */
    async deleteSupportMessage(messageId) {
        if (!confirm('Are you sure you want to delete this support message? This cannot be undone.')) {
            return;
        }

        try {
            const response = await API.deletePortalMessage(messageId);

            if (response.success) {
                Utils.showToast('Success', 'Message deleted', 'success');
                await this.loadSupportMessages(this._supportMessagesFilter);
                // Refresh banner
                await this.loadNewSupportMessagesBanner();
            } else {
                Utils.showToast('Error', response.message || 'Failed to delete', 'error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            Utils.showToast('Error', 'Failed to delete message', 'error');
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
     * View user details - comprehensive modal with all user information
     */
    async viewUser(userId) {
        Utils.showLoading();
        try {
            // Fetch user data, libraries, and IPTV Editor settings in parallel
            const [userResponse, librariesResponse, iptvEditorSettingsRes] = await Promise.all([
                API.getUser(userId),
                API.getPlexLibraries().catch(() => ({ success: false, servers: [] })),
                API.getIPTVEditorSettings().catch(() => ({ settings: {} }))
            ]);
            const user = userResponse.user;
            const iptvEditorSettings = iptvEditorSettingsRes?.settings || {};

            // Build a library map for looking up library names: { server_id: { library_key: library_name } }
            const libraryMap = {};
            if (librariesResponse.success && librariesResponse.servers) {
                librariesResponse.servers.forEach(server => {
                    libraryMap[server.server_id] = {};
                    server.libraries.forEach(lib => {
                        libraryMap[server.server_id][lib.key] = lib.title;
                    });
                });
            }

            Utils.hideLoading();

            // Helper functions
            const formatDate = (dateStr) => {
                if (!dateStr || dateStr === 'FREE') return 'N/A';
                try {
                    // Append T00:00:00 to force local time parsing (avoids UTC timezone shift)
                    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
                    return date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                } catch (error) {
                    return dateStr;
                }
            };

            const isDateExpired = (dateString) => {
                if (!dateString || dateString === 'FREE') return false;
                // Append T00:00:00 to force local time parsing (avoids UTC timezone shift)
                const expirationDate = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return expirationDate < today;
            };

            const getDaysLeft = (dateString) => {
                if (!dateString) return null;
                // Append T00:00:00 to force local time parsing (avoids UTC timezone shift)
                const expDate = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            };

            const getDaysLeftClass = (daysLeft) => {
                if (daysLeft === null) return '';
                if (daysLeft < 0) return 'expired';
                if (daysLeft <= 7) return 'warning';
                return 'good';
            };

            // Get owner name
            const owner = this.owners.find(o => o.id === user.owner_id);
            const ownerName = owner ? owner.name : 'N/A';

            // Format tags
            const tagsHtml = user.tags && user.tags.length > 0
                ? user.tags.map(tag => `
                    <span class="badge" style="background-color: ${tag.color}; color: white; font-size: 0.7rem;">
                        ${Utils.escapeHtml(tag.name)}
                    </span>
                `).join('')
                : '<span class="status-indicator status-disabled">No tags</span>';

            // Check email preferences
            const bulkEmailStatus = user.exclude_bulk_emails ? 'Excluded' : 'Included';
            const automatedEmailStatus = user.exclude_automated_emails ? 'Excluded' : 'Included';
            const bccOwnerStatus = user.bcc_owner_renewal ? 'Enabled' : 'Disabled';

            // Calculate IPTV days left
            const iptvDaysLeft = getDaysLeft(user.iptv_expiration_date);
            const iptvDaysClass = getDaysLeftClass(iptvDaysLeft);
            const iptvDaysDisplay = iptvDaysLeft === null ? 'N/A' : (iptvDaysLeft < 0 ? 'EXPIRED' : `${iptvDaysLeft} days`);

            // Build contact info section
            const hasContactInfo = user.telegram_username || user.whatsapp_username || user.discord_username ||
                user.venmo_username || user.paypal_username || user.cashapp_username ||
                user.apple_cash_username;

            const contactItemsHtml = hasContactInfo ? `
                ${user.telegram_username ? `<div class="contact-item"><i class="fab fa-telegram"></i><span class="contact-value">${Utils.escapeHtml(user.telegram_username)}</span></div>` : ''}
                ${user.whatsapp_username ? `<div class="contact-item"><i class="fab fa-whatsapp"></i><span class="contact-value">${Utils.escapeHtml(user.whatsapp_username)}</span></div>` : ''}
                ${user.discord_username ? `<div class="contact-item"><i class="fab fa-discord"></i><span class="contact-value">${Utils.escapeHtml(user.discord_username)}</span></div>` : ''}
                ${user.venmo_username ? `<div class="contact-item"><i class="fas fa-dollar-sign" style="color: #008CFF;"></i><span class="contact-value">${Utils.escapeHtml(user.venmo_username)}</span></div>` : ''}
                ${user.paypal_username ? `<div class="contact-item"><i class="fab fa-paypal"></i><span class="contact-value">${Utils.escapeHtml(user.paypal_username)}</span></div>` : ''}
                ${user.cashapp_username ? `<div class="contact-item"><i class="fas fa-money-bill-wave" style="color: #00D632;"></i><span class="contact-value">${Utils.escapeHtml(user.cashapp_username)}</span></div>` : ''}
                ${user.apple_cash_username ? `<div class="contact-item"><i class="fab fa-apple" style="color: var(--text-primary);"></i><span class="contact-value">${Utils.escapeHtml(user.apple_cash_username)}</span></div>` : ''}
            ` : '';

            // Build Plex shares section with library names
            const plexSharesHtml = user.plex_shares && user.plex_shares.length > 0
                ? user.plex_shares.map(share => {
                    // Get library names from the map
                    const serverLibs = libraryMap[share.plex_server_id] || {};
                    const libraryNames = share.library_ids
                        ? share.library_ids.map(libId => serverLibs[libId] || `Library ${libId}`).filter(Boolean)
                        : [];
                    const librariesDisplay = libraryNames.length > 0
                        ? libraryNames.join(', ')
                        : 'All libraries';

                    return `
                        <div class="plex-share-item">
                            <div class="plex-share-header">
                                <span class="plex-share-server">
                                    <i class="fas fa-server" style="margin-right: 0.5rem; color: var(--warning-color);"></i>
                                    ${Utils.escapeHtml(share.server_name)}
                                </span>
                                <span class="plex-share-status">
                                    ${share.accepted
                                        ? '<span class="status-indicator status-enabled"><i class="fas fa-check"></i> Accepted</span>'
                                        : '<span class="status-indicator status-warning"><i class="fas fa-clock"></i> Pending</span>'
                                    }
                                </span>
                            </div>
                            <div class="plex-share-libraries">
                                <i class="fas fa-film" style="margin-right: 0.5rem; color: var(--text-secondary);"></i>
                                <span class="libraries-list">${Utils.escapeHtml(librariesDisplay)}</span>
                            </div>
                        </div>
                    `;
                }).join('')
                : `<div class="no-access-message">
                    <i class="fas fa-ban"></i>
                    <div>No Plex access configured</div>
                </div>`;

            // Check for pending invites
            const hasPendingInvites = user.plex_shares && user.plex_shares.some(share => !share.accepted);

            const modalBody = `
                <div class="user-details-container">
                    <div class="user-info-grid">
                        <!-- Basic Information -->
                        <div class="user-info-section">
                            <div class="section-title">
                                <i class="fas fa-user"></i>
                                Basic Information
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-id-card"></i>
                                    Name
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.name)}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-envelope"></i>
                                    Email
                                </div>
                                <div class="info-value email">${Utils.escapeHtml(user.email)}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-user-tie"></i>
                                    Owner
                                </div>
                                <div class="info-value">${Utils.escapeHtml(ownerName)}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-tags"></i>
                                    Tags
                                </div>
                                <div class="info-value tag-list">${tagsHtml}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-calendar-plus"></i>
                                    Created
                                </div>
                                <div class="info-value">${Utils.formatDateTime(user.created_at)}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-sign-in-alt"></i>
                                    Last Portal Login
                                </div>
                                <div class="info-value">${user.last_portal_login ? Utils.formatDateTime(user.last_portal_login) : '<span style="color: var(--text-secondary);">Never</span>'}</div>
                            </div>
                        </div>

                        <!-- Service Credentials -->
                        <div class="user-info-section">
                            <div class="section-title">
                                <i class="fas fa-key"></i>
                                Service Credentials
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-play"></i>
                                    Plex Email
                                </div>
                                <div class="info-value email">${Utils.escapeHtml(user.plex_email || user.email || 'N/A')}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-user"></i>
                                    Plex Username
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.plex_username || 'Not found')}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-tv"></i>
                                    IPTV Username
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.iptv_username || 'N/A')}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-lock"></i>
                                    IPTV Password
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.iptv_password || 'N/A')}</div>
                            </div>
                        </div>

                        <!-- Plex Subscription -->
                        <div class="user-info-section">
                            <div class="section-title">
                                <i class="fas fa-play-circle"></i>
                                Plex Subscription
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-bookmark"></i>
                                    Package
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.plex_package_name || 'N/A')}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-clock"></i>
                                    Days Since Activity
                                </div>
                                <div class="info-value">
                                    ${user.plex_enabled
                                        ? (user.plex_days_since_last_activity !== null && user.plex_days_since_last_activity !== undefined
                                            ? `<span class="status-indicator ${user.plex_days_since_last_activity > 30 ? 'status-warning' : 'status-enabled'}">${user.plex_days_since_last_activity} days</span>`
                                            : '<span class="status-indicator status-disabled">No activity data</span>')
                                        : '<span class="status-indicator status-disabled">Disabled</span>'
                                    }
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-calendar-alt"></i>
                                    Expiration
                                </div>
                                <div class="info-value">
                                    ${user.plex_expiration_date === 'FREE'
                                        ? '<span class="status-indicator status-enabled">FREE</span>'
                                        : user.plex_expiration_date
                                            ? (isDateExpired(user.plex_expiration_date)
                                                ? `<span class="status-indicator status-danger">${formatDate(user.plex_expiration_date)} (Expired)</span>`
                                                : `<span class="status-indicator status-enabled">${formatDate(user.plex_expiration_date)}</span>`)
                                            : 'N/A'
                                    }
                                </div>
                            </div>
                        </div>

                        <!-- IPTV Subscription -->
                        <div class="user-info-section">
                            <div class="section-title">
                                <i class="fas fa-tv"></i>
                                IPTV Subscription
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-server"></i>
                                    Panel
                                </div>
                                <div class="info-value">${Utils.escapeHtml(user.iptv_panel_name || 'N/A')}</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-edit"></i>
                                    IPTV Editor
                                </div>
                                <div class="info-value">
                                    ${user.iptv_editor_enabled
                                        ? '<span class="status-indicator status-enabled">Enabled</span>'
                                        : '<span class="status-indicator status-disabled">Disabled</span>'
                                    }
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">
                                    <i class="fas fa-calendar-alt"></i>
                                    Expiration
                                </div>
                                <div class="info-value">
                                    ${user.iptv_expiration_date === 'FREE'
                                        ? '<span class="status-indicator status-enabled">FREE</span>'
                                        : user.iptv_expiration_date
                                            ? (isDateExpired(user.iptv_expiration_date)
                                                ? `<span class="status-indicator status-danger">${formatDate(user.iptv_expiration_date)} (Expired)</span>`
                                                : `<span class="status-indicator status-enabled">${formatDate(user.iptv_expiration_date)}</span>`)
                                            : 'N/A'
                                    }
                                </div>
                            </div>
                        </div>

                        <!-- Email Preferences Section -->
                        <div class="user-info-section full-width">
                            <div class="section-title">
                                <i class="fas fa-mail-bulk"></i>
                                Email Preferences
                            </div>
                            <div class="preference-grid">
                                <div class="preference-item">
                                    <div class="preference-icon">
                                        <i class="fas fa-${user.exclude_bulk_emails ? 'ban' : 'check'}"
                                           style="color: ${user.exclude_bulk_emails ? 'var(--warning-color)' : 'var(--success-color)'}"></i>
                                    </div>
                                    <div class="preference-info">
                                        <div class="preference-title">Bulk Emails</div>
                                        <div class="preference-description">${bulkEmailStatus} from group emails</div>
                                    </div>
                                </div>

                                <div class="preference-item">
                                    <div class="preference-icon">
                                        <i class="fas fa-${user.exclude_automated_emails ? 'ban' : 'check'}"
                                           style="color: ${user.exclude_automated_emails ? 'var(--warning-color)' : 'var(--success-color)'}"></i>
                                    </div>
                                    <div class="preference-info">
                                        <div class="preference-title">Automated Emails</div>
                                        <div class="preference-description">${automatedEmailStatus} from renewal reminders</div>
                                    </div>
                                </div>

                                <div class="preference-item">
                                    <div class="preference-icon">
                                        <i class="fas fa-${user.bcc_owner_renewal ? 'user-check' : 'user-times'}"
                                           style="color: ${user.bcc_owner_renewal ? 'var(--success-color)' : 'var(--text-secondary)'}"></i>
                                    </div>
                                    <div class="preference-info">
                                        <div class="preference-title">Owner BCC</div>
                                        <div class="preference-description">Owner ${bccOwnerStatus.toLowerCase()} on renewals</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- IPTV Status Section -->
                        <div class="user-info-section full-width iptv-status-section">
                            <div class="section-title">
                                <i class="fas fa-satellite-dish"></i>
                                Current IPTV Status
                            </div>
                            <div class="iptv-info-grid">
                                ${user.iptv_username ? `
                                    <div class="iptv-credential-item">
                                        <div class="iptv-credential-label">IPTV Username</div>
                                        <div class="iptv-credential-value">
                                            ${Utils.escapeHtml(user.iptv_username)}
                                            <button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(user.iptv_username)}').then(() => Utils.showToast('Copied', 'Username copied to clipboard', 'success'))" title="Copy username">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="iptv-credential-item">
                                        <div class="iptv-credential-label">IPTV Password</div>
                                        <div class="iptv-credential-value">
                                            ${Utils.escapeHtml(user.iptv_password || 'N/A')}
                                            ${user.iptv_password ? `<button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(user.iptv_password)}').then(() => Utils.showToast('Copied', 'Password copied to clipboard', 'success'))" title="Copy password">
                                                <i class="fas fa-copy"></i>
                                            </button>` : ''}
                                        </div>
                                    </div>
                                    <div class="iptv-credential-item">
                                        <div class="iptv-credential-label">Max Connections</div>
                                        <div class="iptv-credential-value">0/${user.iptv_subscription_connections || 'N/A'}</div>
                                    </div>
                                    <div class="iptv-credential-item">
                                        <div class="iptv-credential-label">Days Left</div>
                                        <div class="iptv-credential-value ${iptvDaysClass}">${iptvDaysDisplay}</div>
                                    </div>
                                    <div class="iptv-credential-item">
                                        <div class="iptv-credential-label">Expiration</div>
                                        <div class="iptv-credential-value ${iptvDaysLeft !== null && iptvDaysLeft < 0 ? 'expired' : ''}">${formatDate(user.iptv_expiration_date)}</div>
                                    </div>
                                    ${user.iptv_m3u_url ? `
                                        <div class="iptv-url-item">
                                            <div class="iptv-credential-label">M3U Plus URL</div>
                                            <div class="iptv-url-value">
                                                <input type="text" value="${Utils.escapeHtml(user.iptv_m3u_url)}" readonly onclick="this.select()">
                                                <button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(user.iptv_m3u_url)}').then(() => Utils.showToast('Copied', 'M3U URL copied to clipboard', 'success'))" title="Copy M3U URL">
                                                    <i class="fas fa-copy"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ` : ''}
                                    ${user.iptv_editor_enabled && user.iptv_editor_accounts && user.iptv_editor_accounts.length > 0 ? `
                                        <div class="iptv-editor-section">
                                            <div class="iptv-editor-header">
                                                <i class="fas fa-edit"></i>
                                                IPTV Editor Integration
                                            </div>
                                            ${user.iptv_editor_accounts.map(account => `
                                                <div class="iptv-editor-status">
                                                    <div class="iptv-credential-item">
                                                        <div class="iptv-credential-label">Playlist</div>
                                                        <div class="iptv-credential-value">${Utils.escapeHtml(account.playlist_name || 'N/A')}</div>
                                                    </div>
                                                    <div class="iptv-credential-item">
                                                        <div class="iptv-credential-label">Username</div>
                                                        <div class="iptv-credential-value">
                                                            ${Utils.escapeHtml(account.iptv_editor_username || 'N/A')}
                                                            ${account.iptv_editor_username ? `<button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(account.iptv_editor_username)}').then(() => Utils.showToast('Copied', 'Username copied to clipboard', 'success'))" title="Copy username">
                                                                <i class="fas fa-copy"></i>
                                                            </button>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="iptv-credential-item">
                                                        <div class="iptv-credential-label">Password</div>
                                                        <div class="iptv-credential-value">
                                                            ${Utils.escapeHtml(account.iptv_editor_password || 'N/A')}
                                                            ${account.iptv_editor_password ? `<button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(account.iptv_editor_password)}').then(() => Utils.showToast('Copied', 'Password copied to clipboard', 'success'))" title="Copy password">
                                                                <i class="fas fa-copy"></i>
                                                            </button>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="iptv-credential-item">
                                                        <div class="iptv-credential-label">Expiration</div>
                                                        <div class="iptv-credential-value">${formatDate(account.expiry_date || user.iptv_expiration_date)}</div>
                                                    </div>
                                                    ${iptvEditorSettings.editor_dns && account.iptv_editor_username && account.iptv_editor_password ? `
                                                        <div class="iptv-url-item">
                                                            <div class="iptv-credential-label">IPTV Editor M3U URL</div>
                                                            <div class="iptv-url-value">
                                                                <input type="text" value="${Utils.escapeHtml(iptvEditorSettings.editor_dns)}/get.php?username=${Utils.escapeHtml(account.iptv_editor_username)}&password=${Utils.escapeHtml(account.iptv_editor_password)}&type=m3u_plus&output=ts" readonly onclick="this.select()">
                                                                <button class="copy-btn" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(iptvEditorSettings.editor_dns)}/get.php?username=${Utils.escapeHtml(account.iptv_editor_username)}&password=${Utils.escapeHtml(account.iptv_editor_password)}&type=m3u_plus&output=ts').then(() => Utils.showToast('Copied', 'M3U URL copied to clipboard', 'success'))" title="Copy M3U URL">
                                                                    <i class="fas fa-copy"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : (user.iptv_editor_enabled ? `
                                        <div class="iptv-editor-section">
                                            <div class="iptv-editor-header">
                                                <i class="fas fa-edit"></i>
                                                IPTV Editor Integration
                                            </div>
                                            <div class="iptv-editor-status">
                                                <div class="iptv-credential-item">
                                                    <div class="iptv-credential-label">Status</div>
                                                    <div class="iptv-credential-value enabled">Enabled (no account data)</div>
                                                </div>
                                            </div>
                                        </div>
                                    ` : '')}
                                ` : `
                                    <div class="no-iptv-access">
                                        <i class="fas fa-ban"></i>
                                        <div>No IPTV access configured</div>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- Plex Server Access Section -->
                        <div class="user-info-section full-width plex-shares-section">
                            <div class="section-title">
                                <i class="fas fa-server"></i>
                                Plex Server Access
                            </div>
                            ${plexSharesHtml}
                            ${hasPendingInvites ? `
                                <div class="invite-warning">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <div>
                                        <strong>Pending Plex Invitations</strong>
                                        <small>User must accept these invites in their Plex app before library access will work.</small>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        ${hasContactInfo ? `
                            <!-- Contact & Payment Information -->
                            <div class="user-info-section full-width">
                                <div class="section-title">
                                    <i class="fas fa-address-card"></i>
                                    Contact & Payment Information
                                </div>
                                <div class="contact-payment-grid">
                                    ${contactItemsHtml}
                                </div>
                            </div>
                        ` : ''}

                        ${user.notes ? `
                            <!-- Notes Section -->
                            <div class="user-info-section full-width">
                                <div class="section-title">
                                    <i class="fas fa-sticky-note"></i>
                                    Notes
                                </div>
                                <div class="notes-content">${Utils.escapeHtml(user.notes)}</div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Action Buttons -->
                    <div class="view-modal-actions">
                        <button class="btn btn-outline" onclick="Users.emailUser(${user.id}); Utils.closeModal();">
                            <i class="fas fa-envelope"></i> Send Email
                        </button>
                        <button class="btn btn-outline" onclick="Users.signInAsUser(${user.id}, '${Utils.escapeHtml(user.name || user.email).replace(/'/g, "\\'")}'); Utils.closeModal();">
                            <i class="fas fa-user-secret"></i> Sign In As
                        </button>
                        <button class="btn btn-primary" onclick="Users.editUser(${user.id}); Utils.closeModal();">
                            <i class="fas fa-edit"></i> Edit User
                        </button>
                    </div>
                </div>
            `;

            Utils.showModal({
                title: `User Details: ${Utils.escapeHtml(user.name)}`,
                size: 'xlarge',
                body: modalBody,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-secondary',
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
        Utils.showLoading();

        try {
            // First, get user details to see which services they have
            const response = await API.getUser(userId);
            const user = response.user;
            Utils.hideLoading();

            // Check if user has Plex or IPTV
            const hasPlex = user.plex_enabled && (user.plex_shares || []).length > 0;
            const hasIPTV = user.iptv_enabled;

            if (hasPlex || hasIPTV) {
                // User has services - show custom modal with options
                return this.showDeleteUserWithServicesModal(userId, user);
            } else {
                // No services - simple confirmation
                const confirmed = await Utils.confirm(
                    'Delete User',
                    'Are you sure you want to delete this user? This action cannot be undone.'
                );

                if (!confirmed) return;

                Utils.showLoading();
                await API.deleteUser(userId, false, false);
                Utils.hideLoading();
                Utils.showToast('Success', 'User deleted successfully', 'success');
                await this.loadUsers();
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error', error.message, 'error');
        }
    },

    /**
     * Show delete user modal with service-specific deletion options
     */
    showDeleteUserWithServicesModal(userId, user) {
        const hasPlex = user.plex_enabled && (user.plex_shares || []).length > 0;
        const hasIPTV = user.iptv_enabled;
        const hasIPTVEditor = user.iptv_editor_enabled;

        // Build service info sections
        let servicesInfo = '';

        if (hasPlex) {
            const plexServers = user.plex_shares || [];
            const serverList = plexServers.map(s => `<li><strong>${Utils.escapeHtml(s.server_name)}</strong></li>`).join('');
            servicesInfo += `
                <div class="service-section" style="margin-bottom: 1rem;">
                    <p class="mt-2"><strong>Plex Servers:</strong></p>
                    <ul style="margin-top: 0.5rem; margin-bottom: 0.5rem; padding-left: 1.5rem;">
                        ${serverList}
                    </ul>
                    <label class="checkbox-label" style="margin-top: 0.5rem;">
                        <input type="checkbox" id="delete-from-plex" checked />
                        Also remove from Plex servers (revokes library access)
                    </label>
                </div>
            `;
        }

        if (hasIPTV) {
            const iptvInfo = hasIPTVEditor
                ? 'IPTV Panel and IPTV Editor'
                : 'IPTV Panel';
            const iptvNote = hasIPTVEditor
                ? 'This will delete the user from both the IPTV panel and IPTV Editor'
                : 'This will delete the user from the IPTV panel';

            servicesInfo += `
                <div class="service-section" style="margin-bottom: 1rem;">
                    <p class="mt-2"><strong>IPTV Service:</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem;">
                        User has access to ${iptvInfo}
                    </p>
                    <label class="checkbox-label" style="margin-top: 0.5rem;">
                        <input type="checkbox" id="delete-from-iptv" checked />
                        Also remove from ${iptvInfo} (revokes streaming access)
                    </label>
                    ${hasIPTVEditor ? `<p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem; margin-left: 1.5rem;">
                        <i class="fas fa-info-circle"></i> ${iptvNote}
                    </p>` : ''}
                </div>
            `;
        }

        Utils.showModal({
            title: 'Delete User',
            size: 'medium',
            body: `
                <div id="delete-modal-content">
                    <p><strong>Are you sure you want to delete ${Utils.escapeHtml(user.name)}?</strong></p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                        This user will be deleted from your local database. You can also choose to remove them from external services:
                    </p>
                    <div style="margin-top: 1rem;">
                        ${servicesInfo}
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
                    text: 'Delete User',
                    class: 'btn-danger',
                    onClick: async () => {
                        const deleteFromPlex = document.getElementById('delete-from-plex')?.checked || false;
                        const deleteFromIPTV = document.getElementById('delete-from-iptv')?.checked || false;
                        await this.confirmAndDeleteUser(userId, deleteFromPlex, deleteFromIPTV, user);
                    }
                }
            ]
        });
    },

    /**
     * Delete user with options to also delete from Plex and/or IPTV
     */
    async confirmAndDeleteUser(userId, deleteFromPlex, deleteFromIPTV, user) {
        const modalContent = document.getElementById('delete-modal-content');
        const modalFooter = document.querySelector('.modal-footer');

        if (!modalContent || !modalFooter) {
            Utils.showToast('Error', 'Modal not found', 'error');
            return;
        }

        try {
            // Show loading state
            modalFooter.style.display = 'none';

            // Build deletion message
            let deletionMessage = 'Deleting user from database';
            if (deleteFromPlex && deleteFromIPTV) {
                deletionMessage += ', Plex, and IPTV';
            } else if (deleteFromPlex) {
                deletionMessage += ' and Plex';
            } else if (deleteFromIPTV) {
                deletionMessage += ' and IPTV';
            }

            modalContent.innerHTML = `
                <div style="text-align: center; padding: 2rem 0;">
                    <div class="spinner" style="margin: 0 auto 1rem;"></div>
                    <p><strong>${deletionMessage}...</strong></p>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">
                        This may take a moment. Please wait.
                    </p>
                </div>
            `;

            // Delete user with specified options
            const result = await API.deleteUser(userId, deleteFromPlex, deleteFromIPTV);

            // Build success message based on results
            let successDetails = '<ul style="text-align: left; margin: 1rem auto; max-width: 400px; padding-left: 1.5rem;">';
            successDetails += '<li><i class="fas fa-check-circle" style="color: var(--success);"></i> Deleted from local database</li>';

            if (result.results?.plex) {
                const plexIcon = result.results.plex.success ? 'fa-check-circle" style="color: var(--success);' : 'fa-times-circle" style="color: var(--danger);';
                const plexStatus = result.results.plex.success ? 'Removed from Plex servers' : `Failed to remove from Plex: ${result.results.plex.error}`;
                successDetails += `<li><i class="fas ${plexIcon}"></i> ${plexStatus}</li>`;
            }

            if (result.results?.iptv) {
                const iptvIcon = result.results.iptv.success ? 'fa-check-circle" style="color: var(--success);' : 'fa-times-circle" style="color: var(--danger);';
                const iptvStatus = result.results.iptv.success ? 'Removed from IPTV panel' : `Failed to remove from IPTV: ${result.results.iptv.error}`;
                successDetails += `<li><i class="fas ${iptvIcon}"></i> ${iptvStatus}</li>`;
            }

            if (result.results?.iptvEditor) {
                const editorIcon = result.results.iptvEditor.success ? 'fa-check-circle" style="color: var(--success);' : 'fa-times-circle" style="color: var(--danger);';
                const editorStatus = result.results.iptvEditor.success ? 'Removed from IPTV Editor' : `Failed to remove from IPTV Editor: ${result.results.iptvEditor.error}`;
                successDetails += `<li><i class="fas ${editorIcon}"></i> ${editorStatus}</li>`;
            }

            successDetails += '</ul>';

            // Show success
            modalContent.innerHTML = `
                <div style="text-align: center; padding: 2rem 0;">
                    <div style="font-size: 3rem; color: var(--success); margin-bottom: 1rem;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <p><strong>User deletion complete!</strong></p>
                    ${successDetails}
                </div>
            `;

            // Reload users list
            this.loadUsers();

        } catch (error) {
            // Show error in modal
            modalContent.innerHTML = `
                <div style="text-align: center; padding: 2rem 0;">
                    <div style="font-size: 3rem; color: var(--danger); margin-bottom: 1rem;">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <p><strong>Deletion failed</strong></p>
                    <p style="color: var(--text-secondary); margin-top: 1rem;">
                        ${Utils.escapeHtml(error.message)}
                    </p>
                </div>
            `;
        }
    },

    /**
     * Edit user - navigate to edit page
     */
    async editUser(userId) {
        // Save current filters so they persist when returning from edit page
        sessionStorage.setItem('usersPageFilters', JSON.stringify(this.currentFilters));
        Router.navigate(`edit-user/${userId}`);
    },

    /**
     * Navigate to email composer with user preselected
     */
    emailUser(userId) {
        // Store user ID in sessionStorage to be picked up by email composer
        sessionStorage.setItem('emailPreselectedUserId', userId);

        // Navigate to email composer page
        Router.navigate('email');
    },

    /**
     * Sign in as a user - opens portal in new tab as that user
     */
    async signInAsUser(userId, userName) {
        try {
            // Show confirmation dialog
            const confirmed = await Utils.confirm(
                'Sign in as User',
                `Are you sure you want to sign into the portal as <strong>${Utils.escapeHtml(userName)}</strong>?<br><br>This will open the End User Portal in a new tab, logged in as this user.`,
                'Sign In',
                'Cancel'
            );

            if (!confirmed) return;

            // Show loading toast
            Utils.showToast('Loading', 'Opening portal...', 'info');

            // Call the sign-in-as-user endpoint
            const response = await API.request('/auth/sign-in-as-user', {
                method: 'POST',
                body: { userId }
            });

            if (response.success) {
                // Store the portal session in localStorage for the portal
                // Must use snake_case keys to match what portal expects
                localStorage.setItem('portal_token', response.token);
                localStorage.setItem('portal_user', JSON.stringify(response.user));

                // Open the portal in a new tab
                window.open('/portal/', '_blank');

                Utils.showToast('Success', `Signed in as ${userName}`, 'success');
            } else {
                Utils.showToast('Error', response.message || 'Failed to sign in as user', 'error');
            }
        } catch (error) {
            console.error('Sign in as user error:', error);
            Utils.showToast('Error', error.message || 'Failed to sign in as user', 'error');
        }
    },

    // ============ Service Requests Functions ============

    _requestFilter: 'all',

    /**
     * Load and display pending service requests banner
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
            const needsProvisioningCount = requests.filter(r => r.payment_status === 'verified' && (r.provisioning_status === 'pending' || r.provisioning_status === null)).length;

            container.innerHTML = `
                <div class="card" style="background: linear-gradient(135deg, var(--primary-color), var(--primary-hover)); color: white; margin-bottom: 1.5rem;">
                    <div style="padding: 1rem 1.5rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="fas fa-bell" style="font-size: 1.5rem;"></i>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.1rem;">Service Requests Pending</h3>
                                    <p style="margin: 0.25rem 0 0 0; opacity: 0.9; font-size: 0.9rem;">
                                        ${needsProvisioningCount > 0 ? `<strong style="color: #ffd700;">${needsProvisioningCount} needs provisioning</strong>` : ''}
                                        ${needsProvisioningCount > 0 && submittedCount > 0 ? ' • ' : ''}
                                        ${submittedCount > 0 ? `<strong>${submittedCount} payment${submittedCount !== 1 ? 's' : ''} submitted</strong> for verification` : ''}
                                        ${(needsProvisioningCount > 0 || submittedCount > 0) && pendingCount > 0 ? ' • ' : ''}
                                        ${pendingCount > 0 ? `${pendingCount} awaiting payment` : ''}
                                    </p>
                                </div>
                            </div>
                            <button class="btn" style="background: white; color: var(--primary-color);" onclick="Users.showServiceRequestsModal()">
                                <i class="fas fa-list"></i> View Requests
                            </button>
                        </div>
                        ${needsProvisioningCount > 0 ? `
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2);">
                                <p style="margin: 0 0 0.5rem 0; font-size: 0.85rem; opacity: 0.9;"><strong style="color: #ffd700;">Needs provisioning (wizard incomplete):</strong></p>
                                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                    ${requests.filter(r => r.payment_status === 'verified' && (r.provisioning_status === 'pending' || r.provisioning_status === null)).slice(0, 5).map(r => `
                                        <span style="background: rgba(255,215,0,0.3); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; cursor: pointer;" onclick="Users.resumeProvisioning(${r.id})">
                                            <i class="fas fa-play-circle"></i> ${Utils.escapeHtml(r.user_name)} - ${r.service_type === 'plex' ? 'Plex' : 'IPTV'}
                                        </span>
                                    `).join('')}
                                    ${requests.filter(r => r.payment_status === 'verified' && (r.provisioning_status === 'pending' || r.provisioning_status === null)).length > 5 ? `
                                        <span style="opacity: 0.8; font-size: 0.85rem;">+${requests.filter(r => r.payment_status === 'verified' && (r.provisioning_status === 'pending' || r.provisioning_status === null)).length - 5} more</span>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
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
     * Load and display new support messages banner
     */
    async loadNewSupportMessagesBanner() {
        const container = document.getElementById('new-support-messages-banner');
        if (!container) return;

        try {
            const response = await API.getPortalMessages({ status: 'new' });
            if (!response.success || !response.messages || response.messages.length === 0) {
                container.innerHTML = '';
                return;
            }

            const messages = response.messages;
            const count = messages.length;

            container.innerHTML = `
                <div class="card" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; margin-bottom: 1.5rem;">
                    <div style="padding: 1rem 1.5rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="fas fa-envelope" style="font-size: 1.5rem;"></i>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.1rem;">New Support Messages</h3>
                                    <p style="margin: 0.25rem 0 0 0; opacity: 0.9; font-size: 0.9rem;">
                                        <strong>${count} new message${count !== 1 ? 's' : ''}</strong> from users awaiting response
                                    </p>
                                </div>
                            </div>
                            <button class="btn" style="background: white; color: #7c3aed;" onclick="Users.showManageRequestsModal('support')">
                                <i class="fas fa-envelope-open"></i> View Messages
                            </button>
                        </div>
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2);">
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                                ${messages.slice(0, 5).map(m => `
                                    <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; cursor: pointer;" onclick="Users.showManageRequestsModal('support')">
                                        <i class="fas fa-user"></i> ${Utils.escapeHtml(m.user_name || 'Unknown')}: ${Utils.escapeHtml(m.subject.substring(0, 30))}${m.subject.length > 30 ? '...' : ''}
                                    </span>
                                `).join('')}
                                ${messages.length > 5 ? `
                                    <span style="opacity: 0.8; font-size: 0.85rem;">+${messages.length - 5} more</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading new support messages:', error);
            container.innerHTML = '';
        }
    },

    /**
     * Show service requests modal with list of all requests
     */
    async showServiceRequestsModal() {
        Utils.showModal({
            title: 'Service Requests',
            body: `
                <div style="margin-bottom: 1rem;">
                    <div class="btn-group" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-sm ${this._requestFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="Users.filterServiceRequests('all')">All</button>
                        <button class="btn btn-sm ${this._requestFilter === 'submitted' ? 'btn-primary' : 'btn-secondary'}" onclick="Users.filterServiceRequests('submitted')">Payment Submitted</button>
                        <button class="btn btn-sm ${this._requestFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" onclick="Users.filterServiceRequests('pending')">Awaiting Payment</button>
                        <button class="btn btn-sm ${this._requestFilter === 'verified' ? 'btn-primary' : 'btn-secondary'}" onclick="Users.filterServiceRequests('verified')">Verified</button>
                        <button class="btn btn-sm ${this._requestFilter === 'rejected' ? 'btn-primary' : 'btn-secondary'}" onclick="Users.filterServiceRequests('rejected')">Rejected</button>
                    </div>
                </div>
                <div id="service-requests-list">
                    <div class="text-center"><div class="spinner"></div></div>
                </div>
            `,
            size: 'large'
        });

        await this.filterServiceRequests(this._requestFilter);
    },

    /**
     * Filter service requests list
     */
    async filterServiceRequests(filter) {
        this._requestFilter = filter;
        const container = document.getElementById('service-requests-list');
        if (!container) return;

        // Update button styles
        document.querySelectorAll('.btn-group .btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        });
        const activeBtn = document.querySelector(`.btn-group .btn[onclick*="'${filter}'"]`);
        if (activeBtn) {
            activeBtn.classList.remove('btn-secondary');
            activeBtn.classList.add('btn-primary');
        }

        try {
            const response = await API.getServiceRequests({});

            // Filter results based on selected tab
            let filteredRequests = response.requests || [];
            if (filter === 'all') {
                // "All" tab shows only pending and submitted (not verified/rejected)
                filteredRequests = filteredRequests.filter(r =>
                    r.payment_status === 'pending' || r.payment_status === 'submitted'
                );
            } else {
                // Other tabs filter by specific status
                filteredRequests = filteredRequests.filter(r => r.payment_status === filter);
            }
            if (!response.success) {
                container.innerHTML = '<p class="text-danger">Failed to load requests</p>';
                return;
            }

            if (filteredRequests.length === 0) {
                container.innerHTML = '<p class="text-muted text-center">No requests found</p>';
                return;
            }

            container.innerHTML = `
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
                            ${filteredRequests.map(r => `
                                <tr>
                                    <td>
                                        <strong>${Utils.escapeHtml(r.user_name)}</strong><br>
                                        <small class="text-muted">${Utils.escapeHtml(r.user_email)}</small>
                                    </td>
                                    <td>
                                        <span class="badge ${r.service_type === 'plex' ? 'badge-warning' : 'badge-purple'}">
                                            <i class="fas ${r.service_type === 'plex' ? 'fa-film' : 'fa-tv'}"></i>
                                            ${r.service_type === 'plex' ? 'Plex' : 'IPTV'}
                                        </span>
                                    </td>
                                    <td>${Utils.escapeHtml(r.plan_name || 'N/A')}</td>
                                    <td>
                                        <span class="badge ${
                                            r.payment_status === 'submitted' ? 'badge-info' :
                                            r.payment_status === 'verified' ? 'badge-success' :
                                            r.payment_status === 'rejected' ? 'badge-danger' :
                                            'badge-warning'
                                        }">
                                            ${r.payment_status === 'submitted' ? 'Payment Submitted' :
                                              r.payment_status === 'verified' ? 'Verified' :
                                              r.payment_status === 'rejected' ? 'Rejected' :
                                              'Awaiting Payment'}
                                        </span>
                                    </td>
                                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="Users.showServiceRequestDetail(${r.id})" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        ${r.payment_status === 'submitted' ? `
                                            <button class="btn btn-sm btn-success" onclick="Users.verifyPayment(${r.id})" title="Verify Payment">
                                                <i class="fas fa-check"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="Users.rejectRequest(${r.id})" title="Reject">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        ` : ''}
                                        ${r.payment_status === 'pending' || r.payment_status === 'verified' || r.payment_status === 'rejected' ? `
                                            <button class="btn btn-sm btn-danger" onclick="Users.deleteServiceRequest(${r.id})" title="Delete Request">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

        } catch (error) {
            console.error('Error filtering requests:', error);
            container.innerHTML = '<p class="text-danger">Error loading requests</p>';
        }
    },

    /**
     * Show details for a single service request
     */
    async showServiceRequestDetail(requestId) {
        try {
            Utils.showLoading();
            const response = await API.getServiceRequest(requestId);
            Utils.hideLoading();

            if (!response.success) {
                Utils.showToast('Error', 'Failed to load request details', 'error');
                return;
            }

            const r = response.request;

            Utils.showModal({
                title: 'Service Request Details',
                body: `
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <!-- User Info Header -->
                        <div style="display: flex; align-items: center; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                            <div style="width: 48px; height: 48px; background: var(--bg-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-user" style="font-size: 1.25rem; opacity: 0.6;"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 1.1rem;">${Utils.escapeHtml(r.user_name)}</div>
                                <div style="color: var(--text-muted); font-size: 0.9rem;">${Utils.escapeHtml(r.user_email)}</div>
                            </div>
                            <span class="badge ${r.service_type === 'plex' ? 'badge-warning' : 'badge-purple'}" style="font-size: 0.9rem; padding: 0.4rem 0.75rem;">
                                ${r.service_type === 'plex' ? 'Plex' : 'IPTV'}
                            </span>
                        </div>

                        <!-- Plan Details Card -->
                        <div style="background: var(--bg-secondary); border-radius: 8px; padding: 1rem;">
                            <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Plan Details</div>
                            <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <span style="font-size: 1.25rem; font-weight: 600;">${Utils.escapeHtml(r.plan_name || 'N/A')}</span>
                                <span style="color: var(--success-color); font-weight: 600;">
                                    ${r.price ? `${r.currency || '$'}${r.price}${r.price_type === 'recurring' ? '/mo' : ''}` : ''}
                                </span>
                            </div>
                            <div style="display: flex; gap: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">
                                <span><i class="fas fa-calendar" style="margin-right: 0.4rem;"></i>${r.duration_months || 0} ${r.duration_months === 1 ? 'month' : 'months'}</span>
                                ${r.service_type === 'iptv' ? `<span><i class="fas fa-plug" style="margin-right: 0.4rem;"></i>${r.iptv_connections || 1} ${r.iptv_connections === 1 ? 'connection' : 'connections'}</span>` : ''}
                            </div>
                        </div>

                        <!-- Status & Meta Info -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                            <div>
                                <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Status</div>
                                <span class="badge ${
                                    r.payment_status === 'submitted' ? 'badge-info' :
                                    r.payment_status === 'verified' ? 'badge-success' :
                                    r.payment_status === 'rejected' ? 'badge-danger' :
                                    'badge-warning'
                                }">${r.payment_status}</span>
                            </div>
                            <div>
                                <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Request Type</div>
                                <div>${r.request_type === 'new_service' ? 'New Service' : r.request_type === 'renewal' ? 'Renewal' : r.request_type}</div>
                            </div>
                            <div>
                                <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Owner</div>
                                <div>${Utils.escapeHtml(r.owner_name || 'None')}</div>
                            </div>
                        </div>

                        ${r.transaction_reference ? `
                        <!-- Transaction Reference -->
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Transaction Reference</div>
                            <code style="display: block; background: var(--bg-secondary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.9rem;">${Utils.escapeHtml(r.transaction_reference)}</code>
                        </div>
                        ` : ''}

                        ${r.user_notes ? `
                        <!-- User Notes -->
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">User Notes</div>
                            <div style="background: var(--bg-secondary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.9rem;">${Utils.escapeHtml(r.user_notes)}</div>
                        </div>
                        ` : ''}

                        <!-- Created Date -->
                        <div style="color: var(--text-muted); font-size: 0.85rem;">
                            <i class="fas fa-clock" style="margin-right: 0.4rem;"></i>Created ${new Date(r.created_at).toLocaleString()}
                        </div>

                        ${r.payment_status === 'submitted' ? `
                        <!-- Action Buttons -->
                        <div style="display: flex; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                            <button class="btn btn-success" style="flex: 1;" onclick="Users.verifyPayment(${r.id})">
                                <i class="fas fa-check"></i> Verify Payment
                            </button>
                            <button class="btn btn-danger" onclick="Users.rejectRequest(${r.id})">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        </div>
                        ` : ''}

                        ${r.payment_status === 'verified' && (r.provisioning_status === 'pending' || r.provisioning_status === null) ? `
                        <!-- Resume Provisioning -->
                        <div style="display: flex; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                            <button class="btn btn-primary" style="flex: 1;" onclick="Users.launchProvisioningWizard(${r.id})">
                                <i class="fas fa-play-circle"></i> Continue Service Setup
                            </button>
                        </div>
                        ` : ''}
                    </div>
                `
            });

        } catch (error) {
            Utils.hideLoading();
            console.error('Error loading request details:', error);
            Utils.showToast('Error', 'Failed to load request details', 'error');
        }
    },

    /**
     * Verify a payment for a service request
     */
    async verifyPayment(requestId) {
        try {
            Utils.showLoading();

            // First get the request details to know user_id and service_type
            const requestDetails = await API.getServiceRequest(requestId);
            if (!requestDetails.success) {
                Utils.hideLoading();
                Utils.showToast('Error', 'Failed to fetch request details', 'error');
                return;
            }

            const request = requestDetails.request;
            const userId = request.user_id;
            const serviceType = request.service_type;

            // Verify the payment
            const response = await API.updateServiceRequest(requestId, {
                payment_status: 'verified'
            });

            if (!response.success) {
                Utils.hideLoading();
                Utils.showToast('Error', response.message || 'Failed to verify payment', 'error');
                return;
            }

            // Close any open modals
            Utils.closeModal();
            Utils.showToast('Success', 'Payment verified! Opening service setup wizard...', 'success');
            await this.loadPendingRequestsBanner();

            // Refresh nav badge
            if (window.loadPendingRequestsBadge) window.loadPendingRequestsBadge();

            // Fetch user data for the wizard
            const userResponse = await API.getUser(userId);
            Utils.hideLoading();

            if (!userResponse.success) {
                Utils.showToast('Error', 'Failed to load user data for wizard. Please add the service manually.', 'error');
                Router.navigate(`edit-user/${userId}`);
                return;
            }

            const userData = userResponse.user;

            // Open the service wizard for the appropriate service type
            if (typeof CreateUserWizard !== 'undefined') {
                await CreateUserWizard.initAddService(userData, serviceType);
                Utils.showModal({
                    title: `Add ${serviceType === 'plex' ? 'Plex' : 'IPTV'} Service`,
                    size: 'xlarge',
                    body: `<div id="wizard-modal-content" style="min-height: 500px;"></div>`,
                    hideButtons: true
                });
                await CreateUserWizard.render('wizard-modal-content');
            } else {
                // Fallback: navigate to edit user page
                Router.navigate(`edit-user/${userId}`);
            }
        } catch (error) {
            Utils.hideLoading();
            console.error('Error verifying payment:', error);
            Utils.showToast('Error', 'Failed to verify payment', 'error');
        }
    },

    /**
     * Resume provisioning for a verified but incomplete request
     * This allows admin to reopen the wizard if they closed it accidentally
     */
    async resumeProvisioning(requestId) {
        // Show the service request details modal first so admin can review the request
        // From there, they can click "Continue Service Setup" to launch the wizard
        await this.showServiceRequestDetail(requestId);
    },

    /**
     * Actually launch the provisioning wizard for a verified service request
     */
    async launchProvisioningWizard(requestId) {
        try {
            Utils.showLoading();

            // Fetch the service request details
            const requestResponse = await API.getServiceRequest(requestId);
            if (!requestResponse.success) {
                throw new Error(requestResponse.message || 'Failed to fetch request');
            }

            const request = requestResponse.request;

            // Verify this is a verified request with pending provisioning (accept null or 'pending')
            if (request.payment_status !== 'verified' || (request.provisioning_status !== 'pending' && request.provisioning_status !== null)) {
                Utils.hideLoading();
                Utils.showToast('Info', 'This request does not need provisioning', 'info');
                return;
            }

            const userId = request.user_id;
            const serviceType = request.service_type;

            // Fetch user details
            const userResponse = await API.getUser(userId);
            Utils.hideLoading();

            if (!userResponse.success) {
                throw new Error(userResponse.message || 'Failed to fetch user');
            }

            const user = userResponse.user;

            // Close any open modals
            Utils.closeModal();

            // Initialize the wizard using initAddService (skips to service step)
            // This is the same pattern used by edit-user.js showAddIPTVModal/showAddPlexModal
            // Pass subscription plan data from service request so wizard can pre-populate package_id
            const subscriptionPlanData = {
                plan_id: request.subscription_plan_id,
                plan_name: request.plan_name,
                iptv_panel_id: request.iptv_panel_id,
                iptv_package_id: request.iptv_package_id,
                iptv_connections: request.iptv_connections,
                plex_package_id: request.plex_package_id,
                duration_months: request.duration_months,
                price: request.price
            };
            await CreateUserWizard.initAddService(user, serviceType, subscriptionPlanData);

            // Store the service request ID so wizard can mark it completed
            CreateUserWizard.serviceRequestId = requestId;

            // Override the modal close callback for provisioning flow
            // (initAddService sets it to navigate to edit-user, we want to stay on users page)
            Utils.setModalOnClose(async () => {
                console.log('Provisioning wizard closed - refreshing users list');
                // Refresh the users list
                if (typeof Users !== 'undefined' && typeof Users.loadUsers === 'function') {
                    await Users.loadUsers();
                }
            });

            // Show modal with wizard container
            Utils.showModal({
                title: `Add ${serviceType === 'plex' ? 'Plex' : 'IPTV'} Service`,
                size: 'xlarge',
                body: `<div id="wizard-modal-content" style="min-height: 500px;"></div>`,
                hideButtons: true
            });

            // Render the wizard
            await CreateUserWizard.render('wizard-modal-content');

        } catch (error) {
            Utils.hideLoading();
            console.error('Error launching provisioning wizard:', error);
            Utils.showToast('Error', 'Failed to launch wizard: ' + error.message, 'error');
        }
    },

    /**
     * Reject a service request
     */
    async rejectRequest(requestId) {
        if (!confirm('Reject this request? The user will be notified.')) return;

        try {
            Utils.showLoading();
            const response = await API.updateServiceRequest(requestId, {
                payment_status: 'rejected'
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
            console.error('Error rejecting request:', error);
            Utils.showToast('Error', 'Failed to reject request', 'error');
        }
    }
};
