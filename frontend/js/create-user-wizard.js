/**
 * Create User Wizard - Multi-step wizard for creating subscription users
 * V2 - Complete implementation with all features
 *
 * Features:
 * - Owner assignment
 * - Plex access checking
 * - IPTV credits and trial/paid filtering
 * - Duration + Expiration date support
 * - Background job results tracking
 */

const CreateUserWizard = {
    // Current wizard state
    currentStep: 1,

    // Form data storage
    formData: {
        basic: {
            name: '',
            email: '',
            owner_id: null,
            notes: '',
            account_type: 'standard',
            tag_ids: [],
            rs_has_access: null  // null = auto (Plex=yes, IPTV-only=no), true = enabled, false = disabled
        },
        services: {
            plex: false,
            iptv: false
        },
        plex: {
            email: '',
            servers: [], // { server_id, library_ids[] }
            package_id: null,
            duration_months: 1,
            expiration_date: '',
            send_welcome_email: false
        },
        iptv: {
            panel_id: null,
            username: '',
            password: '',
            email: '',
            package_id: null,
            channel_package_ids: [],
            is_trial: false,
            duration_months: 1,
            expiration_date: '',
            notes: '',
            create_iptv_editor: false
        }
    },

    // Cache for dropdown data
    cache: {
        appUsers: [],
        tags: [],
        plexPackages: [],
        plexServers: [],
        plexAccessResults: null,
        iptvPanels: [],
        iptvPackages: [],
        iptvChannelPackages: [],
        selectedPanelCredits: 0
    },

    // Job tracking for results page
    jobResults: {
        jobId: null,
        status: 'pending', // pending, processing, completed, error
        jobs: {
            user: { status: 'pending', message: '', details: null },
            plex: { status: 'pending', message: '', details: null },
            iptv: { status: 'pending', message: '', details: null },
            iptvEditor: { status: 'pending', message: '', details: null }
        }
    },

    // Options passed during initialization
    options: {
        mode: 'new', // 'new', 'add_plex', 'add_iptv'
        existingUser: null,
        serviceRequestId: null, // Track which service request we're provisioning
        preselectedPlanId: null // Pre-select a subscription plan
    },

    /**
     * Initialize the wizard
     * @param {Object} opts - Options for initialization
     * @param {string} opts.mode - 'new', 'add_plex', 'add_iptv'
     * @param {Object} opts.existingUser - Existing user object when adding services
     * @param {number} opts.serviceRequestId - ID of service request being provisioned
     * @param {number} opts.preselectedPlanId - ID of subscription plan to pre-select
     */
    async init(opts = {}) {
        console.log('Initializing Create User Wizard (V2 - Full Featured)', opts);

        // Store options
        this.options = {
            mode: opts.mode || 'new',
            existingUser: opts.existingUser || null,
            serviceRequestId: opts.serviceRequestId || null,
            preselectedPlanId: opts.preselectedPlanId || null
        };

        // Reset form data
        this.resetFormData();

        // Load dropdown data
        await this.loadDropdownData();

        // Start at step 1
        this.currentStep = 1;
    },

    /**
     * Reset form data to defaults
     */
    resetFormData() {
        const today = new Date();
        const oneMonthLater = new Date(today);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        this.formData = {
            basic: {
                name: '',
                email: '',
                owner_id: null,
                notes: '',
                account_type: 'standard',
                tag_ids: [],
                rs_has_access: null  // null = auto (Plex=yes, IPTV-only=no)
            },
            services: {
                plex: false,
                iptv: false
            },
            plex: {
                email: '',
                servers: [],
                package_id: null,
                duration_months: 1,
                expiration_date: oneMonthLater.toISOString().split('T')[0],
                send_welcome_email: false
            },
            iptv: {
                panel_id: null,
                username: '',
                password: '',
                email: '',
                package_id: null,
                channel_package_ids: [],
                is_trial: false,
                duration_months: 1,
                expiration_date: oneMonthLater.toISOString().split('T')[0],
                notes: '',
                create_iptv_editor: false
            }
        };

        this.cache.plexAccessResults = null;
        this.cache.selectedPanelCredits = 0;
    },

    /**
     * Load all dropdown data from API
     */
    async loadDropdownData() {
        try {
            Utils.showLoading();

            // Load all data in parallel
            const [appUsersRes, tagsRes, subscriptionPlansRes, plexServersRes, iptvPanelsRes] = await Promise.all([
                API.getAppUsers().catch(() => ({ app_users: [] })),
                API.getTags().catch(() => ({ data: [] })),
                API.getSubscriptionPlans().catch(() => ({ plans: [] })),
                API.getPlexServers().catch(() => ({ servers: [] })),
                API.getIPTVPanels().catch(() => ({ panels: [] }))
            ]);

            // Store in cache
            this.cache.appUsers = appUsersRes?.users || appUsersRes?.app_users || [];
            this.cache.tags = tagsRes?.data || tagsRes?.tags || [];

            // Filter subscription plans by service type
            const allPlans = subscriptionPlansRes?.plans || [];
            this.cache.plexPackages = allPlans.filter(plan => plan.service_type === 'plex');
            this.cache.iptvSubscriptionPlans = allPlans.filter(plan => plan.service_type === 'iptv');
            this.cache.iptvPackages = []; // Will be loaded per-panel

            this.cache.plexServers = plexServersRes?.servers || [];
            this.cache.iptvPanels = iptvPanelsRes?.panels || [];

            console.log('Dropdown data loaded successfully:', {
                appUsers: this.cache.appUsers.length,
                tags: this.cache.tags.length,
                plexPlans: this.cache.plexPackages.length,
                iptvSubscriptionPlans: this.cache.iptvSubscriptionPlans.length,
                plexServers: this.cache.plexServers.length,
                iptvPanels: this.cache.iptvPanels.length
            });
        } catch (error) {
            console.error('Error loading dropdown data:', error);
            Utils.showToast('Error', 'Failed to load form data', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Get active steps based on enabled services
     */
    getActiveSteps() {
        const steps = [
            { id: 1, key: 'basic', name: 'Basic Info', icon: 'fa-user' },
            { id: 2, key: 'services', name: 'Services', icon: 'fa-server' }
        ];

        let nextId = 3;

        if (this.formData.services.plex) {
            steps.push({ id: nextId++, key: 'plex', name: 'Plex', icon: 'fa-film' });
        }

        if (this.formData.services.iptv) {
            steps.push({ id: nextId++, key: 'iptv', name: 'IPTV', icon: 'fa-broadcast-tower' });
        }

        steps.push({ id: nextId++, key: 'review', name: 'Review', icon: 'fa-check-circle' });
        steps.push({ id: nextId, key: 'results', name: 'Results', icon: 'fa-tasks' });

        return steps;
    },

    /**
     * Get current step definition
     */
    getCurrentStepDef() {
        const steps = this.getActiveSteps();
        return steps.find(s => s.id === this.currentStep);
    },

    /**
     * Render the wizard in the specified container
     */
    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        const steps = this.getActiveSteps();
        const currentStepDef = this.getCurrentStepDef();

        // Build wizard HTML
        const wizardHTML = `
            <div class="wizard-container">
                <!-- Progress Bar -->
                <div class="wizard-progress">
                    ${this.renderProgressBar(steps)}
                </div>

                <!-- Step Content -->
                <div class="wizard-content">
                    ${currentStepDef.key !== 'results' ? `
                        <div class="wizard-step-header">
                            <h2><i class="fas ${currentStepDef.icon}"></i> ${currentStepDef.name}</h2>
                            <p class="step-indicator">Step ${this.currentStep} of ${steps.length}</p>
                        </div>
                    ` : ''}

                    <div class="wizard-step-body">
                        ${await this.renderStepContent(currentStepDef.key)}
                    </div>
                </div>

                <!-- Navigation Buttons -->
                ${currentStepDef.key !== 'results' ? `
                    <div class="wizard-navigation">
                        ${this.currentStep > 1 && currentStepDef.key !== 'review' ? `
                            <button type="button" class="btn btn-secondary" id="wizard-prev-btn">
                                <i class="fas fa-arrow-left"></i> Previous
                            </button>
                        ` : ''}

                        <div style="flex: 1;"></div>

                        ${currentStepDef.key === 'review' ? `
                            <button type="button" class="btn btn-secondary" id="wizard-edit-btn" style="margin-right: 10px;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button type="button" class="btn btn-success" id="wizard-submit-btn">
                                <i class="fas fa-check"></i> Create User
                            </button>
                        ` : `
                            <button type="button" class="btn btn-primary" id="wizard-next-btn">
                                Next <i class="fas fa-arrow-right"></i>
                            </button>
                        `}
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = wizardHTML;

        // Attach event listeners
        this.attachEventListeners();
    },

    /**
     * Render progress bar
     */
    renderProgressBar(steps) {
        // Don't show results step in progress bar
        const visibleSteps = steps.filter(s => s.key !== 'results');

        return visibleSteps.map((step, index) => {
            const isActive = step.id === this.currentStep;
            const isCompleted = step.id < this.currentStep;
            const statusClass = isCompleted ? 'completed' : (isActive ? 'active' : 'pending');

            return `
                <div class="wizard-progress-step ${statusClass}">
                    <div class="step-circle">
                        ${isCompleted ? '<i class="fas fa-check"></i>' : step.id}
                    </div>
                    <div class="step-label">${step.name}</div>
                </div>
                ${index < visibleSteps.length - 1 ? '<div class="progress-line"></div>' : ''}
            `;
        }).join('');
    },

    /**
     * Render content for a specific step
     */
    async renderStepContent(stepKey) {
        switch (stepKey) {
            case 'basic':
                return this.renderBasicInfoStep();
            case 'services':
                return this.renderServicesStep();
            case 'plex':
                return this.renderPlexStep();
            case 'iptv':
                return this.renderIPTVStep();
            case 'review':
                return this.renderReviewStep();
            case 'results':
                return this.renderResultsStep();
            default:
                return '<p>Unknown step</p>';
        }
    },

    /**
     * STEP 1: Basic Information
     */
    renderBasicInfoStep() {
        const { name, email, owner_id, notes, tag_ids } = this.formData.basic;

        return `
            <div class="form-section">
                <div class="form-row">
                    <div class="form-group">
                        <label for="wizard-name">
                            Name <span class="required">*</span>
                        </label>
                        <input
                            type="text"
                            id="wizard-name"
                            class="form-control"
                            value="${Utils.escapeHtml(name)}"
                            placeholder="Enter user's full name"
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="wizard-email">
                            Email Address <span class="required">*</span>
                        </label>
                        <input
                            type="email"
                            id="wizard-email"
                            class="form-control"
                            value="${Utils.escapeHtml(email)}"
                            placeholder="user@example.com"
                            required
                        />
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="wizard-owner">
                            Owner (Optional)
                        </label>
                        <select id="wizard-owner" class="form-control">
                            <option value="">-- Select Owner --</option>
                            ${this.cache.appUsers.map(user => `
                                <option value="${user.id}" ${user.id === owner_id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(user.name || user.email || `User #${user.id}`)}
                                </option>
                            `).join('')}
                        </select>
                        <small class="form-text">The app user who owns this subscription user</small>
                    </div>

                    <div class="form-group">
                        <label for="wizard-tags">
                            Tags (Optional)
                        </label>
                        <select id="wizard-tags" class="form-control">
                            <option value="">-- Select Tag --</option>
                            ${this.cache.tags.map(tag => `
                                <option value="${tag.id}" ${tag_ids.includes(tag.id) ? 'selected' : ''}>
                                    ${Utils.escapeHtml(tag.name)}
                                </option>
                            `).join('')}
                        </select>
                        <small class="form-text">Assign a tag to categorize this user</small>
                    </div>
                </div>

                <div class="form-group">
                    <label for="wizard-notes">
                        Notes (Optional)
                    </label>
                    <textarea
                        id="wizard-notes"
                        class="form-control"
                        rows="3"
                        maxlength="1000"
                        placeholder="Internal notes about this user..."
                    >${Utils.escapeHtml(notes)}</textarea>
                    <small class="form-text">Max 1000 characters</small>
                </div>

                <!-- Request Site Access Toggle -->
                <div class="form-group" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <i class="fas fa-film"></i> Request Site Access
                    </label>
                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 10px;">
                        <input
                            type="checkbox"
                            id="wizard-rs-has-access"
                            ${this.formData.basic.rs_has_access === true || this.formData.basic.rs_has_access === null ? 'checked' : ''}
                        />
                        <span>Allow Request Site Access</span>
                    </label>
                    <small class="form-text" style="margin-top: 5px; color: var(--text-muted);">
                        Allows user to browse and request movies/TV shows through the Discover section. Typically enabled for Plex users.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * STEP 2: Services Selection
     */
    renderServicesStep() {
        const { plex, iptv } = this.formData.services;

        return `
            <div class="form-section">
                <p class="section-description">
                    Select which services this user will have access to. You'll configure each service in the following steps.
                </p>

                <div class="service-selection-grid">
                    <div class="service-card ${plex ? 'selected' : ''}" id="service-card-plex">
                        <label for="wizard-service-plex">
                            <div class="service-checkbox">
                                <input
                                    type="checkbox"
                                    id="wizard-service-plex"
                                    ${plex ? 'checked' : ''}
                                />
                            </div>
                            <div class="service-icon">
                                <i class="fas fa-film"></i>
                            </div>
                            <div class="service-info">
                                <h3>Plex Media Server</h3>
                                <p>Share your Plex media library</p>
                            </div>
                        </label>
                    </div>

                    <div class="service-card ${iptv ? 'selected' : ''}" id="service-card-iptv">
                        <label for="wizard-service-iptv">
                            <div class="service-checkbox">
                                <input
                                    type="checkbox"
                                    id="wizard-service-iptv"
                                    ${iptv ? 'checked' : ''}
                                />
                            </div>
                            <div class="service-icon">
                                <i class="fas fa-broadcast-tower"></i>
                            </div>
                            <div class="service-info">
                                <h3>IPTV Service</h3>
                                <p>Provide IPTV access and credentials</p>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="alert alert-info" style="margin-top: 20px;">
                    <i class="fas fa-info-circle"></i>
                    <strong>Note:</strong> You must select at least one service to continue.
                </div>
            </div>
        `;
    },

    /**
     * STEP 3: Plex Configuration (Conditional)
     */
    renderPlexStep() {
        const { email, servers, package_id, expiration_date, send_welcome_email } = this.formData.plex;
        const defaultEmail = email || this.formData.basic.email;

        return `
            <div class="form-section">
                <!-- Plex Email -->
                <div class="form-group">
                    <label for="wizard-plex-email">
                        Plex Email <span class="required">*</span>
                    </label>
                    <div class="input-group">
                        <input
                            type="email"
                            id="wizard-plex-email"
                            class="form-control"
                            value="${Utils.escapeHtml(defaultEmail)}"
                            placeholder="user@plex.tv"
                            required
                        />
                        <button type="button" class="btn btn-info" id="check-plex-access-btn">
                            <i class="fas fa-search"></i> Check for Plex Access
                        </button>
                    </div>
                    <small class="form-text">Email address associated with the user's Plex account</small>
                </div>

                <!-- Plex Access Results -->
                <div id="plex-access-results" style="margin-bottom: 20px;">
                    ${this.cache.plexAccessResults ? this.renderPlexAccessResults() : ''}
                </div>

                <!-- Server & Library Selection -->
                <div class="form-group">
                    <label>
                        Servers & Libraries <span class="required">*</span>
                    </label>
                    <div id="plex-server-library-selection" class="server-library-selection">
                        ${this.renderServerLibrarySelection()}
                    </div>
                    <small class="form-text">Select which servers and libraries to share with this user</small>
                </div>

                <!-- Plex Package & Expiration -->
                <div class="form-row">
                    <div class="form-group">
                        <label for="wizard-plex-package">
                            Plex Subscription Package <span class="required">*</span>
                        </label>
                        <select id="wizard-plex-package" class="form-control" required>
                            <option value="">-- Select Package --</option>
                            ${this.cache.plexPackages.map(pkg => `
                                <option value="${pkg.id}" ${pkg.id === package_id ? 'selected' : ''}
                                    data-duration="${pkg.duration_months || 1}"
                                    data-price="${pkg.price || 0}">
                                    ${Utils.escapeHtml(pkg.name)} - ${pkg.duration_months || 1} month(s) - $${pkg.price || 0}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="wizard-plex-expiration">
                            Expiration Date <span class="required">*</span>
                        </label>
                        <input
                            type="date"
                            id="wizard-plex-expiration"
                            class="form-control"
                            value="${expiration_date}"
                            required
                        />
                        <small class="form-text">Auto-calculated from package, can be manually adjusted</small>
                    </div>
                </div>

                <!-- Welcome Email -->
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="wizard-plex-welcome-email" ${send_welcome_email ? 'checked' : ''}/>
                        Send welcome email on completion
                    </label>
                    <small class="form-text">If checked, user will receive a welcome email after Plex access is granted</small>
                </div>
            </div>
        `;
    },

    /**
     * Render Server & Library Selection
     */
    renderServerLibrarySelection() {
        if (!this.cache.plexServers || this.cache.plexServers.length === 0) {
            return '<p class="text-muted">No Plex servers configured</p>';
        }

        // Get user's existing access from check results
        const existingAccess = this.cache.plexAccessResults?.access || [];

        return this.cache.plexServers.map(server => {
            // Check if user already has access to this server
            const serverAccess = existingAccess.find(a => a.server_id === server.id && a.has_access);
            const accessibleLibraryIds = serverAccess?.libraries.map(l => String(l.id)) || [];

            // Get currently selected libraries
            const serverData = this.formData.plex.servers.find(s => s.server_id === server.id) || {};
            // Use formData if it has libraries, otherwise use accessible libraries from access check
            const selectedLibraries = (serverData.library_ids && serverData.library_ids.length > 0)
                ? serverData.library_ids
                : accessibleLibraryIds;
            const isExpanded = serverData.expanded !== undefined ? serverData.expanded : (accessibleLibraryIds.length > 0);

            console.log(`🎨 Rendering server ${server.id} (${server.name}):`, {
                serverData,
                selectedLibraries,
                accessibleLibraryIds,
                isExpanded
            });

            const libraryCount = server.libraries?.length || 0;
            const userCount = server.shared_user_count || 0;

            return `
                <div class="plex-server-card" data-server-id="${server.id}">
                    <div class="server-card-header" onclick="CreateUserWizard.toggleServerExpand(${server.id})">
                        <div class="server-card-icon">
                            <i class="fas fa-server"></i>
                            <span class="server-status ${server.health_status === 'online' ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="server-card-info">
                            <h4>${Utils.escapeHtml(server.name)}</h4>
                            <p>${libraryCount} Libraries • ${userCount} Users</p>
                        </div>
                        <div class="server-card-toggle">
                            <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                        </div>
                    </div>
                    <div class="server-card-body" style="display: ${isExpanded ? 'block' : 'none'};">
                        ${server.libraries && server.libraries.length > 0 ? server.libraries.map(lib => {
                            const libKey = String(lib.key || lib.id);
                            const isPreselected = accessibleLibraryIds.includes(libKey);
                            const isChecked = selectedLibraries.includes(libKey);

                            return `
                                <label class="library-checkbox-item ${isPreselected ? 'preselected' : ''}">
                                    <input
                                        type="checkbox"
                                        class="plex-library-checkbox"
                                        data-server-id="${server.id}"
                                        data-library-id="${libKey}"
                                        ${isChecked ? 'checked' : ''}
                                    />
                                    <span class="library-name">${Utils.escapeHtml(lib.title || lib.name)}</span>
                                    ${isPreselected ? '<span class="badge badge-success">Access</span>' : ''}
                                </label>
                            `;
                        }).join('') : '<p class="text-muted" style="padding: 1rem;">No libraries available</p>'}
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render Plex Access Results
     */
    renderPlexAccessResults() {
        const results = this.cache.plexAccessResults;
        if (!results) return '';

        if (!results.found) {
            return `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> No existing Plex access found. Ready to invite user.
                </div>
            `;
        }

        // Check if there are any pending invites
        const hasPending = results.access.some(s => s.has_access && s.status === 'pending');

        return `
            <div class="alert alert-warning">
                <i class="fas fa-info-circle"></i>
                <strong>User already has Plex server access. Currently access prepopulated below.</strong>
                ${hasPending ? '<br><em>Note: Some invites are still pending acceptance.</em>' : ''}
            </div>
        `;
    },

    /**
     * STEP 4: IPTV Configuration (Conditional)
     */
    renderIPTVStep() {
        const { panel_id, username, password, email, package_id, channel_package_ids,
                is_trial, duration_months, expiration_date, notes, create_iptv_editor } = this.formData.iptv;
        const defaultEmail = email || this.formData.basic.email;

        const selectedPanel = this.cache.iptvPanels.find(p => p.id === panel_id);
        const showIPTVEditor = selectedPanel && selectedPanel.linked_playlist_id;

        // Always update credits when panel is selected (use current_credit_balance field)
        if (selectedPanel) {
            this.cache.selectedPanelCredits = selectedPanel.current_credit_balance || selectedPanel.available_credits || 0;
            console.log(`💰 Panel credits set to: ${this.cache.selectedPanelCredits} from panel:`, selectedPanel.name);
        }

        return `
            <style>
                .form-section .form-group { margin-bottom: 12px; }
                .form-section .form-row { margin-bottom: 12px; }
            </style>
            <div class="form-section">
                <!-- IPTV Panel Selection -->
                <div class="form-group">
                    <label for="wizard-iptv-panel">
                        IPTV Panel <span class="required">*</span>
                    </label>
                    <select id="wizard-iptv-panel" class="form-control" required>
                        <option value="">-- Select Panel --</option>
                        ${this.cache.iptvPanels.map(panel => `
                            <option value="${panel.id}"
                                ${panel.id === panel_id ? 'selected' : ''}
                                data-credits="${panel.available_credits || 0}"
                                data-has-editor="${panel.has_iptv_editor_playlist || false}">
                                ${Utils.escapeHtml(panel.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <!-- Available Credits Display -->
                ${panel_id ? `
                    <div class="alert ${this.cache.selectedPanelCredits > 0 ? 'alert-success' : 'alert-warning'}" style="margin-bottom: 12px;">
                        <strong><i class="fas fa-coins"></i> Available Credits:</strong> ${this.cache.selectedPanelCredits}
                    </div>
                ` : ''}

                <!-- Create IPTV Editor User (conditional) - moved to top -->
                ${showIPTVEditor ? `
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="wizard-create-iptv-editor" ${create_iptv_editor ? 'checked' : ''}/>
                            Create IPTV Editor user
                        </label>
                        <small class="form-text">Automatically create an IPTV Editor account for this user</small>
                    </div>
                ` : ''}

                <!-- Trial vs Paid -->
                <div class="form-group">
                    <label>Subscription Type <span class="required">*</span></label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="iptv-trial" value="paid" ${!is_trial ? 'checked' : ''}/>
                            Paid Subscription
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="iptv-trial" value="trial" ${is_trial ? 'checked' : ''}/>
                            Trial Subscription
                        </label>
                    </div>
                </div>

                <!-- IPTV Package -->
                <div class="form-group">
                    <label for="wizard-iptv-package">
                        IPTV Package <span class="required">*</span>
                    </label>
                    <select id="wizard-iptv-package" class="form-control" required>
                        <option value="">-- Select Panel First --</option>
                    </select>
                    <small class="form-text">Filtered by subscription type (trial/paid)</small>
                </div>

                <!-- Channel Packages - changed to single-select -->
                <div class="form-group">
                    <label for="wizard-iptv-channel-packages">
                        Channel Package / Bouquet <span class="required">*</span>
                    </label>
                    <select id="wizard-iptv-channel-packages" class="form-control" required>
                        <option value="">-- Select Panel First --</option>
                    </select>
                    <small class="form-text">Select a channel package</small>
                </div>

                <!-- Username -->
                <div class="form-group">
                    <label for="wizard-iptv-username">
                        IPTV Username ${selectedPanel && selectedPanel.panel_type === 'nxt_dash' ? '' : '<span class="required">*</span>'}
                    </label>
                    <input
                        type="text"
                        id="wizard-iptv-username"
                        class="form-control"
                        value="${Utils.escapeHtml(username)}"
                        placeholder="Leave blank to auto-generate"
                        ${selectedPanel && selectedPanel.panel_type === 'nxt_dash' ? '' : 'required'}
                    />
                </div>

                <!-- Password -->
                <div class="form-group">
                    <label for="wizard-iptv-password">
                        IPTV Password ${selectedPanel && selectedPanel.panel_type === 'nxt_dash' ? '' : '<span class="required">*</span>'}
                    </label>
                    <div class="input-group">
                        <input
                            type="password"
                            id="wizard-iptv-password"
                            class="form-control"
                            value="${Utils.escapeHtml(password)}"
                            placeholder="Leave blank to auto-generate"
                            ${selectedPanel && selectedPanel.panel_type === 'nxt_dash' ? '' : 'required'}
                        />
                        <button type="button" class="btn btn-secondary" id="toggle-iptv-password-btn">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    ${selectedPanel && selectedPanel.panel_type === 'nxt_dash' ? '<small class="form-text">If left blank password will be auto generated</small>' : ''}
                </div>

                <!-- Email -->
                <div class="form-group">
                    <label for="wizard-iptv-email">
                        Email <span class="required">*</span>
                    </label>
                    <input
                        type="email"
                        id="wizard-iptv-email"
                        class="form-control"
                        value="${Utils.escapeHtml(defaultEmail)}"
                        placeholder="user@example.com"
                        required
                    />
                    <small class="form-text">Pre-populated from basic info, can be changed</small>
                </div>

                <!-- IPTV Panel Notes -->
                <div class="form-group">
                    <label for="wizard-iptv-notes">
                        IPTV Panel Notes (Optional)
                    </label>
                    <textarea
                        id="wizard-iptv-notes"
                        class="form-control"
                        rows="3"
                        maxlength="500"
                        placeholder="Notes specific to this IPTV subscription..."
                    >${Utils.escapeHtml(notes)}</textarea>
                    <small class="form-text">Max 500 characters</small>
                </div>

                <!-- Subscription Plan & Expiration -->
                <div class="form-row">
                    <div class="form-group">
                        <label for="wizard-iptv-subscription-plan">
                            IPTV Subscription Plan <span class="required">*</span>
                        </label>
                        <select id="wizard-iptv-subscription-plan" class="form-control" required>
                            <option value="">-- Select Plan --</option>
                            ${this.cache.iptvSubscriptionPlans ? this.cache.iptvSubscriptionPlans.map(plan => `
                                <option value="${plan.id}" ${plan.id === this.formData.iptv.subscription_plan_id ? 'selected' : ''}
                                    data-duration="${plan.duration_months || 1}"
                                    data-price="${plan.price || 0}">
                                    ${Utils.escapeHtml(plan.name)} - ${plan.duration_months || 1} month(s) - $${plan.price || 0}
                                </option>
                            `).join('') : ''}
                        </select>
                        <small class="form-text">Select subscription plan to auto-calculate expiration</small>
                    </div>

                    <div class="form-group">
                        <label for="wizard-iptv-expiration">
                            Expiration Date <span class="required">*</span>
                        </label>
                        <input
                            type="date"
                            id="wizard-iptv-expiration"
                            class="form-control"
                            value="${expiration_date}"
                            required
                        />
                        <small class="form-text">Auto-calculated from plan, can be manually adjusted</small>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * STEP 5: Review & Create
     */
    renderReviewStep() {
        const { basic, services, plex, iptv } = this.formData;
        const owner = this.cache.appUsers.find(u => u.id === basic.owner_id);

        let html = `
            <div class="review-container">
                <!-- Basic Info -->
                <div class="review-section">
                    <h3><i class="fas fa-user"></i> Basic Information</h3>
                    <div class="review-grid">
                        <div class="review-item">
                            <span class="review-label">Name:</span>
                            <span class="review-value">${Utils.escapeHtml(basic.name)}</span>
                        </div>
                        <div class="review-item">
                            <span class="review-label">Email:</span>
                            <span class="review-value">${Utils.escapeHtml(basic.email)}</span>
                        </div>
                        <div class="review-item">
                            <span class="review-label">Owner:</span>
                            <span class="review-value">${Utils.escapeHtml(owner?.username || owner?.email || 'None')}</span>
                        </div>
                        ${basic.notes ? `
                            <div class="review-item full-width">
                                <span class="review-label">Notes:</span>
                                <span class="review-value">${Utils.escapeHtml(basic.notes)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Plex Section -->
                ${services.plex ? this.renderPlexReview() : ''}

                <!-- IPTV Section -->
                ${services.iptv ? this.renderIPTVReview() : ''}
            </div>
        `;

        return html;
    },

    /**
     * Render Plex Review Section
     */
    renderPlexReview() {
        const { plex } = this.formData;
        const plexPackage = this.cache.plexPackages.find(p => p.id === plex.package_id);

        let serversSummary = '';
        plex.servers.forEach(serverData => {
            const server = this.cache.plexServers.find(s => s.id === serverData.server_id);
            if (server) {
                const libraries = serverData.library_ids.map(libId => {
                    const lib = server.libraries.find(l => l.id === libId);
                    return lib ? lib.title || lib.name : `Library #${libId}`;
                });
                serversSummary += `<li><strong>${server.name}:</strong> ${libraries.join(', ')}</li>`;
            }
        });

        return `
            <div class="review-section">
                <h3><i class="fas fa-film"></i> Plex Configuration</h3>
                <div class="review-grid">
                    <div class="review-item">
                        <span class="review-label">Plex Email:</span>
                        <span class="review-value">${Utils.escapeHtml(plex.email)}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Package:</span>
                        <span class="review-value">${Utils.escapeHtml(plexPackage?.name || 'None')}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Duration:</span>
                        <span class="review-value">${plex.duration_months} month(s)</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Expiration:</span>
                        <span class="review-value">${plex.expiration_date}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Send Welcome Email:</span>
                        <span class="review-value">${plex.send_welcome_email ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="review-item full-width">
                        <span class="review-label">Servers & Libraries:</span>
                        <ul style="margin: 5px 0 0 20px;">${serversSummary}</ul>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render IPTV Review Section
     */
    renderIPTVReview() {
        const { iptv } = this.formData;
        const panel = this.cache.iptvPanels.find(p => p.id === iptv.panel_id);
        const iptvPackage = this.cache.iptvPackages.find(p => p.id === iptv.package_id);

        const channelPackageNames = iptv.channel_package_ids.map(id => {
            const cp = this.cache.iptvChannelPackages.find(c => c.id === id);
            return cp ? cp.name : `Package #${id}`;
        }).join(', ');

        return `
            <div class="review-section">
                <h3><i class="fas fa-broadcast-tower"></i> IPTV Configuration</h3>
                <div class="review-grid">
                    <div class="review-item">
                        <span class="review-label">Panel:</span>
                        <span class="review-value">${Utils.escapeHtml(panel?.name || 'Unknown')}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Subscription Type:</span>
                        <span class="review-value">${iptv.is_trial ? 'Trial' : 'Paid'}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Package:</span>
                        <span class="review-value">${Utils.escapeHtml(iptvPackage?.package_name || 'None')}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Username:</span>
                        <span class="review-value">${Utils.escapeHtml(iptv.username)}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Password:</span>
                        <span class="review-value">•••••••••</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Email:</span>
                        <span class="review-value">${Utils.escapeHtml(iptv.email)}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Duration:</span>
                        <span class="review-value">${iptv.duration_months} month(s)</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Expiration:</span>
                        <span class="review-value">${iptv.expiration_date}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Create IPTV Editor:</span>
                        <span class="review-value">${iptv.create_iptv_editor ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="review-item full-width">
                        <span class="review-label">Channel Packages:</span>
                        <span class="review-value">${channelPackageNames || 'None'}</span>
                    </div>
                    ${iptv.notes ? `
                        <div class="review-item full-width">
                            <span class="review-label">Notes:</span>
                            <span class="review-value">${Utils.escapeHtml(iptv.notes)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * STEP 6: Results Page
     */
    renderResultsStep() {
        const { jobs, status } = this.jobResults;
        const { basic } = this.formData;

        return `
            <div class="results-container">
                <div class="results-header">
                    <h2>
                        ${status === 'completed' ? '<i class="fas fa-check-circle text-success"></i>' :
                          status === 'error' ? '<i class="fas fa-times-circle text-danger"></i>' :
                          '<i class="fas fa-spinner fa-spin"></i>'}
                        ${status === 'completed' ? 'User Created Successfully!' :
                          status === 'error' ? 'Error Creating User' :
                          'Creating User Account...'}
                    </h2>
                    <p class="user-details">${Utils.escapeHtml(basic.name)} (${Utils.escapeHtml(basic.email)})</p>
                </div>

                <div class="jobs-list">
                    ${this.renderJobItem('Base User Creation', jobs.user)}
                    ${this.formData.services.plex ? this.renderJobItem('Plex Provisioning', jobs.plex) : ''}
                    ${this.formData.services.iptv ? this.renderJobItem('IPTV Provisioning', jobs.iptv) : ''}
                    ${this.formData.iptv.create_iptv_editor ? this.renderJobItem('IPTV Editor Provisioning', jobs.iptvEditor) : ''}
                </div>

                ${status === 'completed' || status === 'error' ? `
                    <div class="results-actions">
                        <button type="button" class="btn btn-primary" id="view-user-btn">
                            <i class="fas fa-user"></i> View User
                        </button>
                        <button type="button" class="btn btn-secondary" id="create-another-btn">
                            <i class="fas fa-plus"></i> Create Another User
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render individual job item
     */
    renderJobItem(jobName, jobData) {
        const { status, message, details } = jobData;

        let iconHtml = '';
        let statusClass = '';

        switch (status) {
            case 'pending':
                iconHtml = '<i class="fas fa-clock text-muted"></i>';
                statusClass = 'job-pending';
                break;
            case 'processing':
                iconHtml = '<i class="fas fa-spinner fa-spin text-primary"></i>';
                statusClass = 'job-processing';
                break;
            case 'completed':
                iconHtml = '<i class="fas fa-check-circle text-success"></i>';
                statusClass = 'job-completed';
                break;
            case 'error':
                iconHtml = '<i class="fas fa-times-circle text-danger"></i>';
                statusClass = 'job-error';
                break;
        }

        return `
            <div class="job-item ${statusClass}">
                <div class="job-header">
                    <span class="job-icon">${iconHtml}</span>
                    <span class="job-name">${jobName}</span>
                    <span class="job-status">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </div>
                ${message ? `<div class="job-message">${Utils.escapeHtml(message)}</div>` : ''}
                ${details ? `<div class="job-details">${this.renderJobDetails(details)}</div>` : ''}
            </div>
        `;
    },

    /**
     * Render job details
     */
    renderJobDetails(details) {
        if (typeof details === 'string') {
            return Utils.escapeHtml(details);
        }

        if (Array.isArray(details)) {
            return `<ul>${details.map(d => `<li>${Utils.escapeHtml(d)}</li>`).join('')}</ul>`;
        }

        return '';
    },

    /**
     * Attach event listeners to wizard elements
     */
    attachEventListeners() {
        // Navigation buttons
        const prevBtn = document.getElementById('wizard-prev-btn');
        if (prevBtn) prevBtn.addEventListener('click', () => this.previousStep());

        const nextBtn = document.getElementById('wizard-next-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextStep());

        const submitBtn = document.getElementById('wizard-submit-btn');
        if (submitBtn) submitBtn.addEventListener('click', () => this.submitUser());

        const editBtn = document.getElementById('wizard-edit-btn');
        if (editBtn) editBtn.addEventListener('click', () => this.goToStep(1));

        // Results page buttons
        const viewUserBtn = document.getElementById('view-user-btn');
        if (viewUserBtn) viewUserBtn.addEventListener('click', () => this.viewCreatedUser());

        const createAnotherBtn = document.getElementById('create-another-btn');
        if (createAnotherBtn) createAnotherBtn.addEventListener('click', () => this.createAnotherUser());

        // Attach step-specific listeners
        this.attachStepListeners();
    },

    /**
     * Attach listeners specific to the current step
     */
    attachStepListeners() {
        const currentStepDef = this.getCurrentStepDef();

        switch (currentStepDef.key) {
            case 'basic':
                this.attachBasicStepListeners();
                break;
            case 'services':
                this.attachServicesStepListeners();
                break;
            case 'plex':
                this.attachPlexStepListeners();
                break;
            case 'iptv':
                this.attachIPTVStepListeners();
                break;
        }
    },

    /**
     * Attach listeners for Basic Info step
     */
    attachBasicStepListeners() {
        // Auto-save on input
        const fields = ['name', 'email', 'owner', 'notes', 'tags'];
        fields.forEach(field => {
            const el = document.getElementById(`wizard-${field}`);
            if (el) {
                el.addEventListener('change', () => this.saveBasicStepData());
                el.addEventListener('input', () => this.saveBasicStepData());
            }
        });

        // Request Site Access checkbox
        const rsCheckbox = document.getElementById('wizard-rs-has-access');
        if (rsCheckbox) {
            rsCheckbox.addEventListener('change', () => this.saveBasicStepData());
        }
    },

    /**
     * Attach listeners for Services step
     */
    attachServicesStepListeners() {
        ['plex', 'iptv'].forEach(service => {
            const checkbox = document.getElementById(`wizard-service-${service}`);
            const card = document.getElementById(`service-card-${service}`);

            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.formData.services[service] = e.target.checked;
                    if (card) {
                        card.classList.toggle('selected', e.target.checked);
                    }
                });
            }
        });
    },

    /**
     * Attach listeners for Plex step
     */
    attachPlexStepListeners() {
        // Check Plex Access button
        const checkAccessBtn = document.getElementById('check-plex-access-btn');
        if (checkAccessBtn) {
            checkAccessBtn.addEventListener('click', () => this.checkPlexAccess());
        }

        // Server checkboxes
        document.querySelectorAll('.plex-server-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = parseInt(e.target.dataset.serverId);
                const serverData = this.formData.plex.servers.find(s => s.server_id === serverId);

                if (e.target.checked && !serverData) {
                    this.formData.plex.servers.push({ server_id: serverId, library_ids: [] });
                } else if (!e.target.checked && serverData) {
                    this.formData.plex.servers = this.formData.plex.servers.filter(s => s.server_id !== serverId);
                }
            });
        });

        // Library checkboxes
        document.querySelectorAll('.plex-library-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = parseInt(e.target.dataset.serverId);
                const libraryId = String(e.target.dataset.libraryId); // Keep as string for consistent comparison

                let serverData = this.formData.plex.servers.find(s => s.server_id === serverId);
                if (!serverData) {
                    serverData = { server_id: serverId, library_ids: [] };
                    this.formData.plex.servers.push(serverData);
                }

                if (e.target.checked && !serverData.library_ids.includes(libraryId)) {
                    serverData.library_ids.push(libraryId);
                } else if (!e.target.checked) {
                    serverData.library_ids = serverData.library_ids.filter(id => id !== libraryId);
                }
            });
        });

        // Duration/Expiration auto-calculation
        const durationInput = document.getElementById('wizard-plex-duration');
        const expirationInput = document.getElementById('wizard-plex-expiration');

        if (durationInput) {
            durationInput.addEventListener('change', (e) => {
                const months = parseInt(e.target.value);
                const expiration = this.calculateExpirationDate(months);
                if (expirationInput) {
                    expirationInput.value = expiration;
                }
            });
        }

        if (expirationInput) {
            expirationInput.addEventListener('change', (e) => {
                const duration = this.calculateDurationMonths(e.target.value);
                if (durationInput) {
                    durationInput.value = duration;
                }
            });
        }

        // Package selection - auto-calculate expiration date
        const packageSelect = document.getElementById('wizard-plex-package');
        if (packageSelect) {
            packageSelect.addEventListener('change', (e) => {
                const option = e.target.selectedOptions[0];
                if (option && option.dataset.duration) {
                    const duration = parseInt(option.dataset.duration);
                    const expiration = this.calculateExpirationDate(duration);
                    const expirationInput = document.getElementById('wizard-plex-expiration');
                    if (expirationInput) {
                        expirationInput.value = expiration;
                    }
                }
            });
        }
    },

    /**
     * Attach listeners for IPTV step
     */
    attachIPTVStepListeners() {
        // Panel selection
        const panelSelect = document.getElementById('wizard-iptv-panel');
        if (panelSelect) {
            panelSelect.addEventListener('change', async (e) => {
                const panelId = parseInt(e.target.value);
                if (panelId) {
                    const option = e.target.selectedOptions[0];
                    this.cache.selectedPanelCredits = parseInt(option.dataset.credits) || 0;

                    // Store panel ID in formData before re-rendering
                    this.formData.iptv.panel_id = panelId;

                    await this.loadIPTVDataForPanel(panelId);
                    await this.render('wizard-modal-content');

                    // After re-render, re-attach listeners
                    this.attachIPTVStepListeners();
                }
            });

            // Load data if panel already selected
            if (panelSelect.value) {
                this.loadIPTVDataForPanel(parseInt(panelSelect.value));
            }
        }

        // Trial/Paid radio buttons
        document.querySelectorAll('input[name="iptv-trial"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.formData.iptv.is_trial = (e.target.value === 'trial');
                this.filterIPTVPackagesByTrial();
            });
        });

        // Password toggle
        const togglePasswordBtn = document.getElementById('toggle-iptv-password-btn');
        const passwordInput = document.getElementById('wizard-iptv-password');
        if (togglePasswordBtn && passwordInput) {
            togglePasswordBtn.addEventListener('click', () => {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                togglePasswordBtn.querySelector('i').className = `fas fa-eye${isPassword ? '-slash' : ''}`;
            });
        }

        // Subscription plan dropdown - auto-calculate expiration
        const subscriptionPlanSelect = document.getElementById('wizard-iptv-subscription-plan');
        if (subscriptionPlanSelect) {
            subscriptionPlanSelect.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                if (selectedOption && selectedOption.dataset.duration) {
                    const duration = parseInt(selectedOption.dataset.duration);
                    const expiration = this.calculateExpirationDate(duration);
                    const expirationInput = document.getElementById('wizard-iptv-expiration');
                    if (expirationInput) {
                        expirationInput.value = expiration;
                    }
                }
            });
        }
    },

    /**
     * Check Plex Access for given email
     */
    async checkPlexAccess() {
        try {
            const emailInput = document.getElementById('wizard-plex-email');
            const email = emailInput?.value.trim();

            if (!email) {
                Utils.showToast('Validation Error', 'Please enter a Plex email first', 'error');
                return;
            }

            Utils.showLoading();

            const response = await API.checkPlexAccess({ email });
            this.cache.plexAccessResults = response;

            // Auto-populate formData with existing access
            if (response.found && response.access) {
                console.log('🔍 Processing access results:', response.access);
                response.access.forEach(serverAccess => {
                    console.log(`📊 Server ${serverAccess.server_id}: has_access=${serverAccess.has_access}, libraries=${serverAccess.libraries?.length}`);
                    if (serverAccess.has_access && serverAccess.libraries?.length > 0) {
                        // Find or create server entry in formData
                        let serverData = this.formData.plex.servers.find(s => s.server_id === serverAccess.server_id);

                        if (!serverData) {
                            serverData = {
                                server_id: serverAccess.server_id,
                                library_ids: [],
                                expanded: true
                            };
                            this.formData.plex.servers.push(serverData);
                            console.log(`✨ Created new server entry for server_id=${serverAccess.server_id}`);
                        }

                        // Set library IDs from existing access (convert to strings for consistent comparison)
                        const libraryIds = serverAccess.libraries.map(lib => String(lib.id));
                        serverData.library_ids = libraryIds;
                        serverData.expanded = true;
                        console.log(`✅ Set ${libraryIds.length} libraries for server ${serverAccess.server_id}:`, libraryIds);
                    }
                });
                console.log('📦 Final formData.plex.servers:', this.formData.plex.servers);
            }

            // Re-render to show results and pre-selected libraries
            await this.render('wizard-modal-content');

            Utils.showToast('Success', 'Plex access check completed', 'success');

        } catch (error) {
            console.error('Error checking Plex access:', error);
            Utils.showToast('Error', 'Failed to check Plex access', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Load IPTV packages and channel packages for selected panel
     */
    async loadIPTVDataForPanel(panelId) {
        try {
            const [packagesRes, channelGroupsRes] = await Promise.all([
                API.getIPTVPackages(panelId),
                API.getIPTVPanelChannelGroups(panelId)
            ]);

            this.cache.iptvPackages = packagesRes?.packages || [];
            this.cache.iptvChannelGroups = channelGroupsRes?.channel_groups || [];

            // Populate package dropdown
            this.filterIPTVPackagesByTrial();

            // Populate channel groups dropdown (single-select)
            const channelSelect = document.getElementById('wizard-iptv-channel-packages');
            if (channelSelect) {
                // Get the single selected channel package ID (support both old array format and new single ID)
                const selectedChannelPackageId = Array.isArray(this.formData.iptv.channel_package_ids)
                    ? this.formData.iptv.channel_package_ids[0]
                    : this.formData.iptv.channel_package_ids;

                channelSelect.innerHTML = `
                    <option value="">-- Select Channel Package --</option>
                    ${this.cache.iptvChannelGroups.map(group => `
                        <option value="${group.id}" ${group.id === selectedChannelPackageId ? 'selected' : ''}>
                            ${Utils.escapeHtml(group.name)}
                        </option>
                    `).join('')}
                `;
            }

        } catch (error) {
            console.error('Error loading IPTV data:', error);
            Utils.showToast('Error', 'Failed to load IPTV data for panel', 'error');
        }
    },

    /**
     * Filter IPTV packages by trial/paid status
     */
    filterIPTVPackagesByTrial() {
        const packageSelect = document.getElementById('wizard-iptv-package');
        if (!packageSelect) return;

        const isTrial = this.formData.iptv.is_trial;

        // Filter by package_type: 'trial' for trial packages, anything else for paid
        const filteredPackages = this.cache.iptvPackages.filter(pkg => {
            if (isTrial) {
                return pkg.package_type === 'trial';
            } else {
                return pkg.package_type !== 'trial';
            }
        });

        packageSelect.innerHTML = `
            <option value="">-- Select Package --</option>
            ${filteredPackages.map(pkg => `
                <option value="${pkg.id}" ${pkg.id === this.formData.iptv.package_id ? 'selected' : ''}>
                    ${Utils.escapeHtml(pkg.name)} - ${pkg.connections || 1} connection(s) - ${pkg.duration_months || 1} month(s)
                </option>
            `).join('')}
        `;
    },

    /**
     * Calculate expiration date from duration in months
     */
    calculateExpirationDate(months) {
        const date = new Date();
        date.setMonth(date.getMonth() + months);
        return date.toISOString().split('T')[0];
    },

    /**
     * Calculate duration in months from expiration date
     */
    calculateDurationMonths(expirationDate) {
        const today = new Date();
        // Append T00:00:00 to force local time parsing (avoids UTC timezone shift)
        const expiration = new Date(expirationDate.includes('T') ? expirationDate : expirationDate + 'T00:00:00');
        const diffTime = expiration - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(1, Math.round(diffDays / 30));
    },

    /**
     * Generate random username
     */
    generateUsername() {
        const name = this.formData.basic.name.toLowerCase().replace(/\s+/g, '_');
        const random = Math.floor(Math.random() * 10000);
        return `${name}_${random}`;
    },

    /**
     * Generate random secure password
     */
    generatePassword() {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    },

    /**
     * Toggle server card expand/collapse (called from HTML onclick)
     */
    toggleServerExpand(serverId) {
        const card = document.querySelector(`.plex-server-card[data-server-id="${serverId}"]`);
        if (!card) return;

        const body = card.querySelector('.server-card-body');
        const chevron = card.querySelector('.server-card-toggle i');

        if (!body || !chevron) return;

        const isExpanded = body.style.display === 'block';

        // Toggle display
        body.style.display = isExpanded ? 'none' : 'block';

        // Update chevron direction
        chevron.className = `fas fa-chevron-${isExpanded ? 'down' : 'up'}`;

        // Save state in formData
        if (CreateUserWizard.formData && CreateUserWizard.formData.plex) {
            let serverData = CreateUserWizard.formData.plex.servers.find(s => s.server_id === serverId);
            if (serverData) {
                serverData.expanded = !isExpanded;
            }
        }
    },

    /**
     * Navigate to specific step
     */
    async goToStep(stepNumber) {
        this.currentStep = stepNumber;
        await this.render('wizard-modal-content');
    },

    /**
     * Go to next step
     */
    async nextStep() {
        if (!await this.validateCurrentStep()) {
            return;
        }

        this.saveCurrentStepData();

        const steps = this.getActiveSteps();
        if (this.currentStep < steps.length - 1) { // -1 to exclude results page
            this.currentStep++;
            await this.render('wizard-modal-content');

            // Scroll modal to top after rendering new step
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) {
                modalBody.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    },

    /**
     * Go to previous step
     */
    async previousStep() {
        this.saveCurrentStepData();

        if (this.currentStep > 1) {
            this.currentStep--;
            await this.render('wizard-modal-content');

            // Scroll modal to top after rendering previous step
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) {
                modalBody.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    },

    /**
     * Validate current step
     */
    async validateCurrentStep() {
        const currentStepDef = this.getCurrentStepDef();

        switch (currentStepDef.key) {
            case 'basic':
                return this.validateBasicStep();
            case 'services':
                return this.validateServicesStep();
            case 'plex':
                return this.validatePlexStep();
            case 'iptv':
                return this.validateIPTVStep();
            default:
                return true;
        }
    },

    /**
     * Validate Basic Info step
     */
    validateBasicStep() {
        const name = document.getElementById('wizard-name')?.value.trim();
        const email = document.getElementById('wizard-email')?.value.trim();

        if (!name || name.length < 2) {
            Utils.showToast('Validation Error', 'Name must be at least 2 characters', 'error');
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            Utils.showToast('Validation Error', 'Please enter a valid email address', 'error');
            return false;
        }

        return true;
    },

    /**
     * Validate Services step
     */
    validateServicesStep() {
        if (!this.formData.services.plex && !this.formData.services.iptv) {
            Utils.showToast('Validation Error', 'Please select at least one service', 'error');
            return false;
        }
        return true;
    },

    /**
     * Validate Plex step
     */
    validatePlexStep() {
        const email = document.getElementById('wizard-plex-email')?.value.trim();
        const packageId = document.getElementById('wizard-plex-package')?.value;
        const expirationDate = document.getElementById('wizard-plex-expiration')?.value;

        if (!email) {
            Utils.showToast('Validation Error', 'Plex email is required', 'error');
            return false;
        }

        if (this.formData.plex.servers.length === 0) {
            Utils.showToast('Validation Error', 'Please select at least one Plex server and library', 'error');
            return false;
        }

        // Check that each selected server has at least one library
        for (const serverData of this.formData.plex.servers) {
            if (!serverData.library_ids || serverData.library_ids.length === 0) {
                Utils.showToast('Validation Error', 'Each selected server must have at least one library selected', 'error');
                return false;
            }
        }

        if (!packageId) {
            Utils.showToast('Validation Error', 'Please select a Plex package', 'error');
            return false;
        }

        if (!expirationDate) {
            Utils.showToast('Validation Error', 'Please set an expiration date', 'error');
            return false;
        }

        return true;
    },

    /**
     * Validate IPTV step
     */
    validateIPTVStep() {
        const panelId = document.getElementById('wizard-iptv-panel')?.value;
        const packageId = document.getElementById('wizard-iptv-package')?.value;
        const username = document.getElementById('wizard-iptv-username')?.value.trim();
        const password = document.getElementById('wizard-iptv-password')?.value.trim();
        const email = document.getElementById('wizard-iptv-email')?.value.trim();
        const subscriptionPlanId = document.getElementById('wizard-iptv-subscription-plan')?.value;

        const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
        const selectedChannelPackages = channelPackageSelect ?
            Array.from(channelPackageSelect.selectedOptions).map(opt => parseInt(opt.value)) : [];

        if (!panelId) {
            Utils.showToast('Validation Error', 'Please select an IPTV panel', 'error');
            return false;
        }

        // Check if selected panel is NxtDash
        const selectedPanel = this.cache.iptvPanels.find(p => p.id === parseInt(panelId));
        const isNxtDash = selectedPanel && selectedPanel.panel_type === 'nxt_dash';

        console.log('Validating IPTV step - Panel:', selectedPanel?.name, 'Type:', selectedPanel?.panel_type, 'IsNxtDash:', isNxtDash);

        if (!packageId) {
            Utils.showToast('Validation Error', 'Please select an IPTV package', 'error');
            return false;
        }

        if (selectedChannelPackages.length === 0) {
            Utils.showToast('Validation Error', 'Please select at least one channel package', 'error');
            return false;
        }

        // Only require username/password for non-NxtDash panels
        if (!isNxtDash && !username) {
            Utils.showToast('Validation Error', 'IPTV username is required', 'error');
            return false;
        }

        if (!isNxtDash && (!password || password.length < 8)) {
            Utils.showToast('Validation Error', 'IPTV password must be at least 8 characters', 'error');
            return false;
        }

        if (!email) {
            Utils.showToast('Validation Error', 'Email is required', 'error');
            return false;
        }

        if (!subscriptionPlanId) {
            Utils.showToast('Validation Error', 'Please select a subscription plan', 'error');
            return false;
        }

        return true;
    },

    /**
     * Save current step data to formData
     */
    saveCurrentStepData() {
        const currentStepDef = this.getCurrentStepDef();

        switch (currentStepDef.key) {
            case 'basic':
                this.saveBasicStepData();
                break;
            case 'services':
                this.saveServicesStepData();
                break;
            case 'plex':
                this.savePlexStepData();
                break;
            case 'iptv':
                this.saveIPTVStepData();
                break;
        }
    },

    /**
     * Save Basic Info step data
     */
    saveBasicStepData() {
        this.formData.basic.name = document.getElementById('wizard-name')?.value.trim() || '';
        this.formData.basic.email = document.getElementById('wizard-email')?.value.trim() || '';

        const ownerId = document.getElementById('wizard-owner')?.value;
        this.formData.basic.owner_id = ownerId ? parseInt(ownerId) : null;

        this.formData.basic.notes = document.getElementById('wizard-notes')?.value.trim() || '';

        const tagId = document.getElementById('wizard-tags')?.value;
        this.formData.basic.tag_ids = tagId && tagId !== '' ? [parseInt(tagId)] : [];

        // Save Request Site Access
        const rsCheckbox = document.getElementById('wizard-rs-has-access');
        if (rsCheckbox) {
            this.formData.basic.rs_has_access = rsCheckbox.checked;
        }
    },

    /**
     * Save Services step data
     */
    saveServicesStepData() {
        this.formData.services.plex = document.getElementById('wizard-service-plex')?.checked || false;
        this.formData.services.iptv = document.getElementById('wizard-service-iptv')?.checked || false;
    },

    /**
     * Save Plex step data
     */
    savePlexStepData() {
        this.formData.plex.email = document.getElementById('wizard-plex-email')?.value.trim() || '';

        const packageId = document.getElementById('wizard-plex-package')?.value;
        this.formData.plex.package_id = packageId ? parseInt(packageId) : null;

        this.formData.plex.expiration_date = document.getElementById('wizard-plex-expiration')?.value || '';

        this.formData.plex.send_welcome_email = document.getElementById('wizard-plex-welcome-email')?.checked || false;

        // Servers are already being tracked via checkboxes
    },

    /**
     * Save IPTV step data
     */
    saveIPTVStepData() {
        const panelId = document.getElementById('wizard-iptv-panel')?.value;
        this.formData.iptv.panel_id = panelId ? parseInt(panelId) : null;

        const packageId = document.getElementById('wizard-iptv-package')?.value;
        this.formData.iptv.package_id = packageId ? parseInt(packageId) : null;

        this.formData.iptv.username = document.getElementById('wizard-iptv-username')?.value.trim() || '';
        this.formData.iptv.password = document.getElementById('wizard-iptv-password')?.value.trim() || '';
        this.formData.iptv.email = document.getElementById('wizard-iptv-email')?.value.trim() || '';
        this.formData.iptv.notes = document.getElementById('wizard-iptv-notes')?.value.trim() || '';

        const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
        this.formData.iptv.channel_package_ids = channelPackageSelect
            ? Array.from(channelPackageSelect.selectedOptions).map(opt => parseInt(opt.value))
            : [];

        const trialRadio = document.querySelector('input[name="iptv-trial"]:checked');
        this.formData.iptv.is_trial = trialRadio ? (trialRadio.value === 'trial') : false;

        const duration = document.getElementById('wizard-iptv-duration')?.value;
        this.formData.iptv.duration_months = duration ? parseInt(duration) : 1;

        this.formData.iptv.expiration_date = document.getElementById('wizard-iptv-expiration')?.value || '';

        this.formData.iptv.create_iptv_editor = document.getElementById('wizard-create-iptv-editor')?.checked || false;
    },

    /**
     * Submit the user creation
     */
    async submitUser() {
        try {
            Utils.showLoading();

            // Save final step data
            this.saveCurrentStepData();

            // Build user data object
            const userData = {
                // Basic info
                name: this.formData.basic.name,
                email: this.formData.basic.email,
                owner_id: this.formData.basic.owner_id,
                notes: this.formData.basic.notes,
                account_type: this.formData.basic.account_type,
                tag_ids: this.formData.basic.tag_ids,

                // Request Site Access
                rs_has_access: this.formData.basic.rs_has_access,

                // Plex configuration
                plex_enabled: this.formData.services.plex,
                ...(this.formData.services.plex && {
                    plex_email: this.formData.plex.email,
                    plex_server_library_selections: this.formData.plex.servers,
                    plex_package_id: this.formData.plex.package_id,
                    plex_duration_months: this.formData.plex.duration_months,
                    plex_expiration_date: this.formData.plex.expiration_date,
                    plex_send_welcome_email: this.formData.plex.send_welcome_email
                }),

                // IPTV configuration
                iptv_enabled: this.formData.services.iptv,
                ...(this.formData.services.iptv && {
                    iptv_panel_id: this.formData.iptv.panel_id,
                    iptv_username: this.formData.iptv.username,
                    iptv_password: this.formData.iptv.password,
                    iptv_email: this.formData.iptv.email,
                    iptv_package_id: this.formData.iptv.package_id,
                    iptv_channel_package_ids: this.formData.iptv.channel_package_ids,
                    iptv_is_trial: this.formData.iptv.is_trial,
                    iptv_duration_months: this.formData.iptv.duration_months,
                    iptv_expiration_date: this.formData.iptv.expiration_date,
                    iptv_notes: this.formData.iptv.notes,
                    create_on_iptv_editor: this.formData.iptv.create_iptv_editor
                })
            };

            console.log('Submitting user data:', userData);

            // Initialize job tracking
            this.jobResults = {
                jobId: null,
                status: 'processing',
                jobs: {
                    user: { status: 'processing', message: 'Creating user record...', details: null },
                    plex: { status: 'pending', message: '', details: null },
                    iptv: { status: 'pending', message: '', details: null },
                    iptvEditor: { status: 'pending', message: '', details: null }
                }
            };

            // Navigate to results page
            const steps = this.getActiveSteps();
            this.currentStep = steps[steps.length - 1].id; // Results page
            await this.render('wizard-modal-content');

            // Call API to create user
            const response = await API.createUser(userData);

            if (response.success) {
                // Update job results
                this.jobResults.jobId = response.user_id || response.id;
                this.jobResults.jobs.user.status = 'completed';
                this.jobResults.jobs.user.message = 'User created successfully';
                this.jobResults.jobs.user.details = [`User ID: ${response.user_id || response.id}`];

                // Start polling for background jobs if job_id provided
                if (response.job_id) {
                    this.pollJobStatus(response.job_id);
                } else {
                    // Mark all as completed if no background jobs
                    this.jobResults.status = 'completed';
                    if (this.formData.services.plex) {
                        this.jobResults.jobs.plex.status = 'completed';
                        this.jobResults.jobs.plex.message = 'Plex access provisioned';
                    }
                    if (this.formData.services.iptv) {
                        this.jobResults.jobs.iptv.status = 'completed';
                        this.jobResults.jobs.iptv.message = 'IPTV account created';
                        if (this.formData.iptv.create_iptv_editor) {
                            this.jobResults.jobs.iptvEditor.status = 'completed';
                            this.jobResults.jobs.iptvEditor.message = 'IPTV Editor account created';
                        }
                    }

                    // Mark service request provisioning as complete
                    await this.markProvisioningComplete();

                    await this.render('wizard-modal-content');
                }
            } else {
                throw new Error(response.message || 'Failed to create user');
            }

        } catch (error) {
            console.error('Error creating user:', error);

            this.jobResults.status = 'error';
            this.jobResults.jobs.user.status = 'error';
            this.jobResults.jobs.user.message = error.message || 'Failed to create user';

            await this.render('wizard-modal-content');
            Utils.showToast('Error', error.message || 'Failed to create user', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Poll job status for background jobs
     */
    async pollJobStatus(jobId) {
        const pollInterval = 2000; // 2 seconds
        const maxPolls = 60; // 2 minutes max
        let pollCount = 0;

        const poll = async () => {
            try {
                const response = await API.getUserCreationStatus(jobId);

                // Update job statuses - map from response.stages to jobResults.jobs
                // Backend returns: response.stages.user, response.stages.plex, etc.
                if (response.stages) {
                    if (response.stages.user) {
                        this.jobResults.jobs.user = response.stages.user;
                    }
                    if (response.stages.plex) {
                        this.jobResults.jobs.plex = response.stages.plex;
                    }
                    if (response.stages.iptv) {
                        this.jobResults.jobs.iptv = response.stages.iptv;
                    }
                    if (response.stages.iptvEditor) {
                        this.jobResults.jobs.iptvEditor = response.stages.iptvEditor;
                    }
                }

                // Check if overall job is complete using response.status
                const jobComplete = response.status === 'completed' || response.status === 'failed';

                // Alternatively check individual stages
                const allComplete = jobComplete || Object.values(this.jobResults.jobs)
                    .filter(j => j.status !== 'pending')
                    .every(j => j.status === 'completed' || j.status === 'error' || j.status === 'failed');

                if (allComplete || pollCount >= maxPolls) {
                    // Use the backend status if available, or derive from allComplete
                    if (response.status === 'failed') {
                        this.jobResults.status = 'error';
                    } else {
                        this.jobResults.status = allComplete ? 'completed' : 'error';
                    }

                    // Mark service request provisioning as complete
                    if (this.jobResults.status === 'completed') {
                        await this.markProvisioningComplete();
                    }
                } else {
                    pollCount++;
                    setTimeout(poll, pollInterval);
                }

                // Re-render to show updated status
                await this.render('wizard-modal-content');

            } catch (error) {
                console.error('Error polling job status:', error);
                this.jobResults.status = 'error';
                await this.render('wizard-modal-content');
            }
        };

        // Start polling
        poll();
    },

    /**
     * Mark the service request provisioning as complete
     * Called after wizard successfully finishes
     */
    async markProvisioningComplete() {
        if (!this.options.serviceRequestId) {
            console.log('No service request to mark as complete');
            return;
        }

        try {
            console.log('Marking provisioning complete for service request:', this.options.serviceRequestId);
            await API.updateServiceRequest(this.options.serviceRequestId, {
                provisioning_status: 'completed'
            });
            console.log('Provisioning marked as complete');

            // Refresh the pending requests banner and badge
            if (typeof Users !== 'undefined') {
                if (typeof Users.loadPendingRequestsBanner === 'function') {
                    Users.loadPendingRequestsBanner();
                }
            }
            if (window.loadPendingRequestsBadge) {
                window.loadPendingRequestsBadge();
            }
        } catch (error) {
            console.error('Failed to mark provisioning complete:', error);
            // Don't throw - this is not critical for the wizard
        }
    },

    /**
     * View the created user
     */
    viewCreatedUser() {
        Utils.closeModal();

        // Navigate to users page if not already there
        if (typeof Users !== 'undefined' && typeof Users.loadUsers === 'function') {
            Users.loadUsers();
        }
    },

    /**
     * Create another user (reset wizard)
     */
    async createAnotherUser() {
        await this.init();
        await this.render('wizard-modal-content');
    }
};

// Make globally accessible
window.CreateUserWizard = CreateUserWizard;
