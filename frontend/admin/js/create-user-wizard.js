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
            exclude_from_bulk_emails: false,
            bcc_owner_on_renewal: false,
            exclude_from_automated_emails: false
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
            notes: '',
            create_iptv_editor: false,
            send_welcome_email: false
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
        selectedPanelCredits: 0,
        emailTemplates: []
    },

    // Job tracking for results page
    jobResults: {
        jobId: null,
        userId: null, // The actual user ID for navigation
        status: 'pending', // pending, processing, completed, error
        jobs: {
            user: { status: 'pending', message: '', details: null },
            plex: { status: 'pending', message: '', details: null },
            iptv: { status: 'pending', message: '', details: null },
            iptvEditor: { status: 'pending', message: '', details: null }
        }
    },

    // Mode: 'create' for new user, 'add_plex' or 'add_iptv' for adding service to existing user
    mode: 'create',

    // Existing user data when adding a service
    existingUser: null,

    // Service request ID when provisioning from portal request
    serviceRequestId: null,

    /**
     * Initialize the wizard for creating a new user
     */
    async init() {
        // Reset mode to create
        this.mode = 'create';
        this.existingUser = null;
        console.log('Initializing Create User Wizard (V2 - Full Featured)');

        // Reset form data
        this.resetFormData();

        // Load dropdown data
        await this.loadDropdownData();

        // Start at step 1
        this.currentStep = 1;

        // Set modal close callback to refresh users list
        Utils.setModalOnClose(() => {
            console.log('User creation wizard closed - refreshing users list');
            if (typeof Users !== 'undefined' && typeof Users.loadUsers === 'function') {
                Users.loadUsers();
            }
        });
    },

    /**
     * Initialize the wizard for adding a service to an existing user
     * @param {Object} user - The existing user object
     * @param {string} serviceType - 'plex' or 'iptv'
     * @param {Object} subscriptionPlanData - Optional subscription plan data from service request
     */
    async initAddService(user, serviceType, subscriptionPlanData = null) {
        console.log(`Initializing Add Service Wizard - Adding ${serviceType} to user ${user.id} (${user.name})`);
        if (subscriptionPlanData) {
            console.log('Subscription plan data provided:', subscriptionPlanData);
        }

        // Set mode and store existing user
        this.mode = serviceType === 'plex' ? 'add_plex' : 'add_iptv';
        this.existingUser = user;

        // Reset form data
        this.resetFormData();

        // Pre-populate basic info from existing user
        this.formData.basic = {
            name: user.name || '',
            email: user.email || '',
            owner_id: user.owner_id || null,
            notes: user.notes || '',
            account_type: user.account_type || 'standard',
            tag_ids: user.tag_ids || [],
            exclude_from_bulk_emails: user.exclude_from_bulk_emails || false,
            bcc_owner_on_renewal: user.bcc_owner_on_renewal || false,
            exclude_from_automated_emails: user.exclude_from_automated_emails || false
        };

        // Set the appropriate service as enabled
        if (serviceType === 'plex') {
            this.formData.services.plex = true;
            this.formData.services.iptv = false;
            // Pre-populate plex email from user email
            this.formData.plex.email = user.email || '';
            // Pre-populate from subscription plan if provided
            if (subscriptionPlanData) {
                if (subscriptionPlanData.plex_package_id) {
                    this.formData.plex.package_id = subscriptionPlanData.plex_package_id;
                }
                if (subscriptionPlanData.duration_months) {
                    this.formData.plex.duration_months = subscriptionPlanData.duration_months;
                }
            }
        } else if (serviceType === 'iptv') {
            this.formData.services.plex = false;
            this.formData.services.iptv = true;
            // Pre-populate iptv email from user email
            this.formData.iptv.email = user.email || '';
            // Pre-populate from subscription plan if provided
            if (subscriptionPlanData) {
                if (subscriptionPlanData.iptv_panel_id) {
                    this.formData.iptv.panel_id = subscriptionPlanData.iptv_panel_id;
                }
                if (subscriptionPlanData.iptv_package_id) {
                    this.formData.iptv.package_id = subscriptionPlanData.iptv_package_id;
                    console.log('Pre-populated IPTV package_id from subscription plan:', subscriptionPlanData.iptv_package_id);
                }
                if (subscriptionPlanData.duration_months) {
                    this.formData.iptv.duration_months = subscriptionPlanData.duration_months;
                }
                if (subscriptionPlanData.plan_id) {
                    this.formData.iptv.subscription_plan_id = subscriptionPlanData.plan_id;
                }
            }
        }

        // Load dropdown data
        await this.loadDropdownData();

        // Start at the service step (step 1 in add service mode)
        this.currentStep = 1;

        // Set modal close callback
        Utils.setModalOnClose(() => {
            console.log('Add service wizard closed - refreshing user data');
            // Refresh the edit user page by navigating to the same user
            if (typeof Router !== 'undefined' && typeof Router.navigate === 'function') {
                Router.navigate(`edit-user/${user.id}`);
            }
        });
    },

    /**
     * Reset form data to defaults
     */
    resetFormData() {
        const today = new Date();
        const oneMonthLater = new Date(today);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        // Format date in local time (avoid UTC timezone shift from toISOString)
        const formatLocal = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const defaultExpiration = formatLocal(oneMonthLater);

        this.formData = {
            basic: {
                name: '',
                email: '',
                owner_id: null,
                notes: '',
                account_type: 'standard',
                tag_ids: [],
                exclude_from_bulk_emails: false,
                bcc_owner_on_renewal: false
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
                expiration_date: defaultExpiration,
                send_welcome_email: false,
                welcome_email_template_id: null
            },
            iptv: {
                panel_id: null,
                username: '',
                password: '',
                email: '',
                package_id: null,
                subscription_plan_id: null,
                channel_package_ids: [],
                is_trial: false,
                duration_months: 1,
                expiration_date: defaultExpiration,
                notes: '',
                create_iptv_editor: false,
                send_welcome_email: false,
                welcome_email_template_id: null
            }
        };

        this.cache.plexAccessResults = null;
        this.cache.originalPlexAccess = null;  // Clear original Plex access for comparison
        this.cache.iptvUserSearchResults = null;
        this.cache.linkedIPTVUser = null;
        this.cache.selectedPanelCredits = 0;
    },

    /**
     * Load all dropdown data from API
     */
    async loadDropdownData() {
        try {
            Utils.showLoading();

            // Load all data in parallel
            const [appUsersRes, tagsRes, subscriptionPlansRes, plexServersRes, iptvPanelsRes, emailTemplatesRes] = await Promise.all([
                API.getAppUsers().catch(() => ({ app_users: [] })),
                API.getTags().catch(() => ({ tags: [] })),
                API.getSubscriptionPlans().catch(() => ({ plans: [] })),
                API.getPlexServers().catch(() => ({ servers: [] })),
                API.getIPTVPanels().catch(() => ({ panels: [] })),
                API.getEmailTemplates('welcome').catch(() => ({ templates: [] }))
            ]);

            // Store in cache
            this.cache.appUsers = appUsersRes?.users || appUsersRes?.app_users || [];
            this.cache.tags = tagsRes?.tags || [];
            this.cache.emailTemplates = emailTemplatesRes?.templates || [];

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
                iptvPanels: this.cache.iptvPanels.length,
                emailTemplates: this.cache.emailTemplates.length
            });
        } catch (error) {
            console.error('Error loading dropdown data:', error);
            Utils.showToast('Error', 'Failed to load form data', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Get active steps based on enabled services and mode
     */
    getActiveSteps() {
        // Add Service Mode: Service Step → Review → Results
        if (this.mode === 'add_plex') {
            return [
                { id: 1, key: 'plex', name: 'Plex', icon: 'fa-film' },
                { id: 2, key: 'review', name: 'Review', icon: 'fa-check-circle' },
                { id: 3, key: 'results', name: 'Results', icon: 'fa-tasks' }
            ];
        }

        if (this.mode === 'add_iptv') {
            return [
                { id: 1, key: 'iptv', name: 'IPTV', icon: 'fa-broadcast-tower' },
                { id: 2, key: 'review', name: 'Review', icon: 'fa-check-circle' },
                { id: 3, key: 'results', name: 'Results', icon: 'fa-tasks' }
            ];
        }

        // Create Mode: Full wizard flow
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
     * Get owner's welcome email template options
     * Auto-selects owner's template if they have one
     */
    getOwnerWelcomeTemplateOptions(selectedTemplateId = null) {
        // Find owner's default welcome template
        const ownerId = this.formData.basic.owner_id;
        let ownerDefaultTemplateId = selectedTemplateId;

        if (!ownerDefaultTemplateId && ownerId) {
            // Find the owner's welcome template
            const ownerTemplate = this.cache.emailTemplates.find(t =>
                t.category === 'welcome' && t.owner_id === ownerId
            );
            if (ownerTemplate) {
                ownerDefaultTemplateId = ownerTemplate.id;
            }
        }

        // Generate options
        return this.cache.emailTemplates
            .filter(t => t.category === 'welcome')
            .map(template => {
                const isSelected = template.id === ownerDefaultTemplateId;
                const ownerLabel = template.owner_id ?
                    `(${this.cache.appUsers.find(u => u.id === template.owner_id)?.name || 'Owner'})` :
                    '(System)';
                return `<option value="${template.id}" ${isSelected ? 'selected' : ''}>
                    ${Utils.escapeHtml(template.name)} ${ownerLabel}
                </option>`;
            }).join('');
    },

    /**
     * Render the wizard in the specified container
     */
    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            // Modal was closed - silently return
            return;
        }

        const steps = this.getActiveSteps();
        const currentStepDef = this.getCurrentStepDef();
        const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';

        // Determine button text based on mode
        const submitButtonText = isAddServiceMode ? 'Add Service' : 'Create User';
        const submitButtonIcon = isAddServiceMode ? 'fa-plus' : 'fa-check';

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
                                <i class="fas ${submitButtonIcon}"></i> ${submitButtonText}
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
        const { name, email, owner_id, notes, tag_ids, exclude_from_bulk_emails, bcc_owner_on_renewal, exclude_from_automated_emails } = this.formData.basic;

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
                        <small class="form-text">Manually assign a tag to categorize this user. Note: Some tags (like server and panel membership) are automatically assigned based on the user's access.</small>
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

                <hr style="margin: 20px 0;">

                <h4 style="margin-bottom: 15px;">Email Preferences</h4>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="wizard-exclude-bulk-emails"
                            ${exclude_from_bulk_emails ? 'checked' : ''}
                        />
                        <span>Exclude from Bulk Emails</span>
                    </label>
                    <small class="form-text">When checked, this user will NOT receive bulk emails sent by tag or server. They will only receive emails sent directly to them or to their owner group.</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="wizard-bcc-owner"
                            ${bcc_owner_on_renewal ? 'checked' : ''}
                        />
                        <span>BCC Owner on Renewal Emails</span>
                    </label>
                    <small class="form-text">When checked, the owner will be automatically BCC'd on all renewal emails sent to this user.</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            id="wizard-exclude-automated-emails"
                            ${exclude_from_automated_emails ? 'checked' : ''}
                        />
                        <span>Exclude from Automated Emails</span>
                    </label>
                    <small class="form-text">When checked, this user will NOT receive any automated emails (renewal reminders, scheduled emails, recurring emails). They will only receive manually sent emails.</small>
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
        const { email, servers, package_id, expiration_date, send_welcome_email, welcome_email_template_id } = this.formData.plex;
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
                            ${this.cache.plexPackages.map(pkg => {
                                const duration = pkg.duration_months === 0 || pkg.duration_months === null ? 'Unlimited' : `${pkg.duration_months} month(s)`;
                                const price = pkg.price ? `$${pkg.price}` : 'Free';
                                return `
                                <option value="${pkg.id}" ${pkg.id === package_id ? 'selected' : ''}
                                    data-duration="${pkg.duration_months ?? 0}"
                                    data-price="${pkg.price || 0}">
                                    ${Utils.escapeHtml(pkg.name)} - ${duration} - ${price}
                                </option>
                            `}).join('')}
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

                <!-- Welcome Email Template Selection -->
                <div class="form-group" id="plex-template-selection" style="display: ${send_welcome_email ? 'block' : 'none'};">
                    <label for="wizard-plex-welcome-template">
                        Welcome Email Template
                    </label>
                    <select id="wizard-plex-welcome-template" class="form-control">
                        <option value="">-- Select Template --</option>
                        ${this.getOwnerWelcomeTemplateOptions(welcome_email_template_id)}
                    </select>
                    <small class="form-text">Select the welcome email template to send. Owner's template is pre-selected if available.</small>
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
                        ${server.libraries && server.libraries.length > 0 ? `
                            <div style="padding: 0.5rem 1rem; border-bottom: 1px solid #e0e0e0;">
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-primary plex-select-all-btn"
                                    data-server-id="${server.id}"
                                    style="font-size: 0.875rem; padding: 0.25rem 0.75rem;"
                                >
                                    <i class="fas fa-check-double"></i> Select All
                                </button>
                            </div>
                            ${server.libraries.map(lib => {
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
                        }).join('')}` : '<p class="text-muted" style="padding: 1rem;">No libraries available</p>'}
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
     * Render IPTV user search results
     */
    renderIPTVUserSearchResults() {
        const results = this.cache.iptvUserSearchResults;
        if (!results) return '';

        if (!results.found) {
            return `
                <div class="alert alert-info" style="margin-top: 10px;">
                    <i class="fas fa-info-circle"></i> User not found on any IPTV panels. You can create a new user below.
                </div>
            `;
        }

        // User found on one or more panels
        const panelsHTML = results.results.map(result => {
            const userData = result.user_data;

            // Handle different expiration field names and formats
            let expirationDate = 'N/A';
            if (userData.expire_at) {
                // 1-Stream format: ISO date string "2026-11-21T04:38:35+00:00"
                expirationDate = new Date(userData.expire_at).toLocaleDateString();
            } else if (userData.expire_date) {
                // NXT Dash format: Unix timestamp
                expirationDate = new Date(userData.expire_date * 1000).toLocaleDateString();
            } else if (userData.exp_date && typeof userData.exp_date === 'string') {
                // NXT Dash format: Already formatted string "26-04-2026 10:32"
                expirationDate = userData.exp_date;
            } else if (userData.exp_date) {
                // Fallback: Try as unix timestamp
                expirationDate = new Date(userData.exp_date * 1000).toLocaleDateString();
            }

            // Handle different status field names and types
            let isActive = false;
            if (userData.is_enabled === true || userData.is_enabled === 'true') {
                // 1-Stream format: boolean
                isActive = true;
            } else if (userData.enabled === 1 || userData.enabled === '1') {
                // NXT Dash format: numeric
                isActive = true;
            }

            // Get line ID (could be 'id', 'line_id', or 'user_id')
            const lineId = userData.line_id || userData.id || userData.user_id;

            return `
                <div class="card" style="margin-bottom: 10px;">
                    <div class="card-body">
                        <h6 class="card-title">
                            <i class="fas fa-tv"></i> Found on ${result.panel_name}
                        </h6>
                        <div style="margin-top: 10px;">
                            <strong>Username:</strong> ${userData.username || 'N/A'}<br>
                            <strong>Expiration:</strong> ${expirationDate}<br>
                            <strong>Status:</strong> ${isActive ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>'}
                        </div>
                        <div style="margin-top: 10px;">
                            <button type="button" class="btn btn-success btn-sm link-iptv-user-btn"
                                    data-panel-id="${result.panel_id}"
                                    data-panel-name="${result.panel_name}"
                                    data-line-id="${lineId}"
                                    data-username="${userData.username}"
                                    data-editor-username="${userData.username}">
                                <i class="fas fa-link"></i> Link This User
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="alert alert-warning" style="margin-top: 10px;">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Existing user found on ${results.found_on_panel_count} panel(s)!</strong>
                <p style="margin-top: 5px; margin-bottom: 0;">Select a panel below to link the existing user instead of creating a new one.</p>
            </div>
            ${panelsHTML}
        `;
    },

    /**
     * Render linked IPTV user status message
     */
    renderLinkedIPTVUserStatus() {
        const linkedUser = this.cache.linkedIPTVUser;
        if (!linkedUser) return '';

        let editorStatus = '';
        if (linkedUser.iptv_editor_found === true) {
            editorStatus = '<br><small><i class="fas fa-check-circle" style="color: green;"></i> Also found in IPTV Editor</small>';
        } else if (linkedUser.iptv_editor_found === false) {
            editorStatus = '<br><small><i class="fas fa-times-circle" style="color: orange;"></i> Not found in IPTV Editor</small>';
        }

        return `
            <div class="alert alert-success" style="margin-top: 10px;">
                <i class="fas fa-link"></i>
                <strong>Linked to existing IPTV user!</strong>
                <p style="margin-top: 5px; margin-bottom: 0;">
                    Username: <strong>${linkedUser.username}</strong> on panel <strong>${linkedUser.panel_name}</strong>
                    ${editorStatus}
                    <br><small>No new account will be created. The system will only gather existing user information.</small>
                </p>
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
                <!-- IPTV User Search -->
                <div class="form-group">
                    <label for="wizard-iptv-search-username">
                        Search for Existing IPTV User
                    </label>
                    <div class="input-group">
                        <input
                            type="text"
                            id="wizard-iptv-search-username"
                            class="form-control"
                            placeholder="Enter username to search across all IPTV panels"
                        />
                        <button type="button" class="btn btn-info" id="search-iptv-user-btn">
                            <i class="fas fa-search"></i> Search for Existing User
                        </button>
                    </div>
                    <small class="form-text">Search for an existing user across all IPTV panels to link them instead of creating a new account</small>
                </div>

                <!-- IPTV User Search Results -->
                <div id="iptv-user-search-results">
                    ${this.cache.iptvUserSearchResults ? this.renderIPTVUserSearchResults() : ''}
                </div>

                <!-- Linked IPTV User Status -->
                ${this.cache.linkedIPTVUser ? this.renderLinkedIPTVUserStatus() : ''}

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
                    ${this.cache.linkedIPTVUser ? '<small class="form-text text-info"><i class="fas fa-link"></i> Panel auto-selected from linked user</small>' : ''}
                </div>

                <!-- Available Credits Display -->
                ${panel_id ? `
                    <div class="alert ${this.cache.selectedPanelCredits > 0 ? 'alert-success' : 'alert-warning'}" style="margin-bottom: 12px;">
                        <strong><i class="fas fa-coins"></i> Available Credits:</strong> ${this.cache.selectedPanelCredits}
                    </div>
                ` : ''}

                <!-- Create IPTV Editor User (conditional) - only show if user exists on panel but NOT in IPTV Editor -->
                ${showIPTVEditor && this.cache.linkedIPTVUser && !this.cache.linkedIPTVUser.iptv_editor_found ? `
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="wizard-create-iptv-editor" ${create_iptv_editor ? 'checked' : ''}/>
                            Create IPTV Editor user
                        </label>
                        <small class="form-text">User exists on panel but not in IPTV Editor. Check to create them.</small>
                    </div>
                ` : ''}
                ${showIPTVEditor && !this.cache.linkedIPTVUser ? `
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="wizard-create-iptv-editor" ${create_iptv_editor ? 'checked' : ''}/>
                            Create IPTV Editor user
                        </label>
                        <small class="form-text">Automatically create an IPTV Editor account for this user</small>
                    </div>
                ` : ''}

                <!-- Trial vs Paid (hidden when linking) -->
                ${!this.cache.linkedIPTVUser ? `
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
                ` : ''}

                <!-- IPTV Package (hidden when linking) -->
                ${!this.cache.linkedIPTVUser ? `
                    <div class="form-group">
                        <label for="wizard-iptv-package">
                            IPTV Package <span class="required">*</span>
                        </label>
                        <select id="wizard-iptv-package" class="form-control" required>
                            <option value="">-- Select Panel First --</option>
                        </select>
                        <small class="form-text">Filtered by subscription type (trial/paid)</small>
                    </div>
                ` : ''}

                <!-- Channel Packages (shown when creating new user OR when linked user + creating IPTV Editor) -->
                <div class="form-group" id="wizard-iptv-channel-package-group" style="${this.cache.linkedIPTVUser ? 'display: none;' : ''}">
                    <label for="wizard-iptv-channel-packages">
                        Channel Package / Bouquet <span class="required">*</span>
                    </label>
                    <select id="wizard-iptv-channel-packages" class="form-control" ${!this.cache.linkedIPTVUser ? 'required' : ''}>
                        <option value="">-- Select Panel First --</option>
                    </select>
                    <small class="form-text">Select a channel package${this.cache.linkedIPTVUser ? ' for IPTV Editor' : ''}</small>
                </div>

                <!-- Username (hidden when linking existing user) -->
                ${!this.cache.linkedIPTVUser ? `
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
                ` : ''}

                <!-- Password (hidden when linking existing user) -->
                ${!this.cache.linkedIPTVUser ? `
                    <div class="form-group">
                        <label for="wizard-iptv-password">
                            IPTV Password
                        </label>
                        <div class="input-group">
                            <input
                                type="password"
                                id="wizard-iptv-password"
                                class="form-control"
                                value="${Utils.escapeHtml(password)}"
                                placeholder="Leave blank to auto-generate"
                            />
                            <button type="button" class="btn btn-secondary" id="toggle-iptv-password-btn">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                        <small class="form-text">Leave blank to auto-generate a password</small>
                    </div>
                ` : ''}

                <!-- Email (hidden when linking) -->
                ${!this.cache.linkedIPTVUser ? `
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
                ` : ''}

                <!-- IPTV Panel Notes (hidden when linking) -->
                ${!this.cache.linkedIPTVUser ? `
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
                ` : ''}

                <!-- Welcome Email -->
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="wizard-iptv-welcome-email" ${this.formData.iptv.send_welcome_email ? 'checked' : ''}/>
                        Send welcome email on completion
                    </label>
                    <small class="form-text">If checked, user will receive a welcome email after IPTV access is granted</small>
                </div>

                <!-- Welcome Email Template Selection -->
                <div class="form-group" id="iptv-template-selection" style="display: ${this.formData.iptv.send_welcome_email ? 'block' : 'none'};">
                    <label for="wizard-iptv-welcome-template">
                        Welcome Email Template
                    </label>
                    <select id="wizard-iptv-welcome-template" class="form-control">
                        <option value="">-- Select Template --</option>
                        ${this.getOwnerWelcomeTemplateOptions(this.formData.iptv.welcome_email_template_id)}
                    </select>
                    <small class="form-text">Select the welcome email template to send. Owner's template is pre-selected if available.</small>
                </div>

                <!-- Subscription Plan & Expiration -->
                <div class="form-row">
                    <div class="form-group">
                        <label for="wizard-iptv-subscription-plan">
                            IPTV Subscription Plan <span class="required">*</span>
                        </label>
                        <select id="wizard-iptv-subscription-plan" class="form-control" required>
                            <option value="">-- Select Plan --</option>
                            ${this.cache.iptvSubscriptionPlans ? this.cache.iptvSubscriptionPlans.map(plan => {
                                const duration = plan.duration_months === 0 || plan.duration_months === null ? 'Unlimited' : `${plan.duration_months} month(s)`;
                                const price = plan.price ? `$${plan.price}` : 'Free';
                                return `
                                <option value="${plan.id}" ${plan.id === this.formData.iptv.subscription_plan_id ? 'selected' : ''}
                                    data-duration="${plan.duration_months ?? 0}"
                                    data-price="${plan.price || 0}">
                                    ${Utils.escapeHtml(plan.name)} - ${duration} - ${price}
                                </option>
                            `}).join('') : ''}
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
        const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';
        const serviceType = this.mode === 'add_plex' ? 'Plex' : 'IPTV';

        let html = `
            <div class="review-container">
                ${isAddServiceMode ? `
                    <!-- Add Service Mode Header -->
                    <div class="review-section add-service-header">
                        <h3><i class="fas fa-plus-circle"></i> Adding ${serviceType} Service</h3>
                        <div class="review-grid">
                            <div class="review-item">
                                <span class="review-label">User:</span>
                                <span class="review-value">${Utils.escapeHtml(basic.name)}</span>
                            </div>
                            <div class="review-item">
                                <span class="review-label">Email:</span>
                                <span class="review-value">${Utils.escapeHtml(basic.email)}</span>
                            </div>
                        </div>
                    </div>
                ` : `
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
                `}

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
                    // Match using same logic as checkbox creation: lib.key || lib.id, compared as strings
                    const lib = server.libraries.find(l => String(l.key || l.id) === String(libId));
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
        const iptvPackage = this.cache.iptvPackages.find(p => p.id == iptv.package_id);

        const channelPackageNames = iptv.channel_package_ids.map(id => {
            const cp = this.cache.iptvChannelGroups.find(c => c.id === id);
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
                        <span class="review-value">${Utils.escapeHtml(iptvPackage?.name || 'None')}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Username:</span>
                        <span class="review-value">${Utils.escapeHtml(iptv.username)}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Password:</span>
                        <span class="review-value">${Utils.escapeHtml(iptv.password || '•••••••••')}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Email:</span>
                        <span class="review-value">${Utils.escapeHtml(iptv.email)}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Expiration:</span>
                        <span class="review-value">Will be set by panel</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Create IPTV Editor:</span>
                        <span class="review-value">${iptv.create_iptv_editor ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="review-item">
                        <span class="review-label">Send Welcome Email:</span>
                        <span class="review-value">${iptv.send_welcome_email ? 'Yes' : 'No'}</span>
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
        const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';
        const serviceType = this.mode === 'add_plex' ? 'Plex' : 'IPTV';

        // Determine header text based on mode
        let headerText;
        if (isAddServiceMode) {
            headerText = status === 'completed' ? `${serviceType} Service Added Successfully!` :
                         status === 'error' ? `Error Adding ${serviceType} Service` :
                         `Adding ${serviceType} Service...`;
        } else {
            headerText = status === 'completed' ? 'User Created Successfully!' :
                         status === 'error' ? 'Error Creating User' :
                         'Creating User Account...';
        }

        return `
            <div class="results-container">
                <div class="results-header">
                    <h2>
                        ${status === 'completed' ? '<i class="fas fa-check-circle text-success"></i>' :
                          status === 'error' ? '<i class="fas fa-times-circle text-danger"></i>' :
                          '<i class="fas fa-spinner fa-spin"></i>'}
                        ${headerText}
                    </h2>
                    <p class="user-details">${Utils.escapeHtml(basic.name)} (${Utils.escapeHtml(basic.email)})</p>
                </div>

                <div class="jobs-list">
                    ${!isAddServiceMode ? this.renderJobItem('Base User Creation', jobs.user) : ''}
                    ${this.formData.services.plex ? this.renderJobItem('Plex Provisioning', jobs.plex) : ''}
                    ${this.formData.services.iptv ? this.renderJobItem('IPTV Provisioning', jobs.iptv) : ''}
                    ${this.formData.iptv.create_iptv_editor ? this.renderJobItem('IPTV Editor Provisioning', jobs.iptvEditor) : ''}
                </div>

                ${status === 'completed' || status === 'error' ? `
                    <div class="results-actions">
                        <button type="button" class="btn btn-primary" id="view-user-btn">
                            <i class="fas fa-user"></i> View User
                        </button>
                        ${!isAddServiceMode ? `
                            <button type="button" class="btn btn-secondary" id="create-another-btn">
                                <i class="fas fa-plus"></i> Create Another User
                            </button>
                        ` : `
                            <button type="button" class="btn btn-secondary" id="close-wizard-btn">
                                <i class="fas fa-times"></i> Close
                            </button>
                        `}
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

        // Check if this is IPTV job with provisioning data
        const isIPTVJob = jobName === 'IPTV Provisioning';
        const hasIPTVData = isIPTVJob && status === 'completed' && details;

        // Don't show Plex details (it's just internal data)
        const isPlexJob = jobName === 'Plex Provisioning';

        return `
            <div class="job-item ${statusClass}">
                <div class="job-header">
                    <span class="job-icon">${iconHtml}</span>
                    <span class="job-name">${jobName}</span>
                    <span class="job-status">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </div>
                ${message ? `<div class="job-message">${Utils.escapeHtml(message)}</div>` : ''}
                ${hasIPTVData ? this.renderIPTVDetails(details) : ''}
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
     * Render IPTV provisioning details
     */
    renderIPTVDetails(iptvData) {
        if (!iptvData) return '';

        // Format expiration date
        const formatExpiration = (timestamp) => {
            if (!timestamp) return 'N/A';
            const date = new Date(parseInt(timestamp) * 1000);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        return `
            <div class="iptv-provisioning-details">
                <div class="provisioning-header">
                    <i class="fas fa-tv"></i>
                    <strong>IPTV Account Details</strong>
                </div>

                <div class="provisioning-info">
                    ${iptvData.line_id ? `
                        <div class="info-row">
                            <span class="info-label">Line ID:</span>
                            <span class="info-value">${Utils.escapeHtml(iptvData.line_id.toString())}</span>
                        </div>
                    ` : ''}

                    <div class="info-row">
                        <span class="info-label">Username:</span>
                        <div class="info-value-with-action">
                            <span class="info-value">${Utils.escapeHtml(iptvData.username)}</span>
                            <button type="button" class="btn-copy" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(iptvData.username)}').then(() => Utils.showToast('Copied', 'Username copied to clipboard', 'success'))" title="Copy username">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Password:</span>
                        <div class="info-value-with-action">
                            <span class="info-value password-field" id="iptv-password-${iptvData.line_id || 'temp'}">••••••••</span>
                            <button type="button" class="btn-toggle-password" onclick="CreateUserWizard.toggleIPTVPassword('${iptvData.line_id || 'temp'}', '${Utils.escapeHtml(iptvData.password)}')" title="Show/hide password">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button type="button" class="btn-copy" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(iptvData.password)}').then(() => Utils.showToast('Copied', 'Password copied to clipboard', 'success'))" title="Copy password">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>

                    ${iptvData.expiration ? `
                        <div class="info-row">
                            <span class="info-label">Expires:</span>
                            <span class="info-value">${formatExpiration(iptvData.expiration)}</span>
                        </div>
                    ` : ''}

                    ${iptvData.m3u_url ? `
                        <div class="info-row info-row-url">
                            <span class="info-label">M3U URL:</span>
                            <div class="info-value-with-action">
                                <span class="info-value info-value-url">${Utils.escapeHtml(iptvData.m3u_url)}</span>
                                <button type="button" class="btn-copy" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(iptvData.m3u_url)}').then(() => Utils.showToast('Copied', 'M3U URL copied to clipboard', 'success'))" title="Copy M3U URL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Toggle IPTV password visibility
     */
    toggleIPTVPassword(lineId, password) {
        const passwordField = document.getElementById(`iptv-password-${lineId}`);
        const toggleBtn = passwordField.parentElement.querySelector('.btn-toggle-password i');

        if (passwordField.textContent === '••••••••') {
            passwordField.textContent = password;
            toggleBtn.classList.remove('fa-eye');
            toggleBtn.classList.add('fa-eye-slash');
        } else {
            passwordField.textContent = '••••••••';
            toggleBtn.classList.remove('fa-eye-slash');
            toggleBtn.classList.add('fa-eye');
        }
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

        const closeWizardBtn = document.getElementById('close-wizard-btn');
        if (closeWizardBtn) closeWizardBtn.addEventListener('click', () => Utils.closeModal());

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
        const fields = ['name', 'email', 'owner', 'notes', 'tags', 'exclude-bulk-emails', 'bcc-owner'];
        fields.forEach(field => {
            const el = document.getElementById(`wizard-${field}`);
            if (el) {
                el.addEventListener('change', () => this.saveBasicStepData());
                el.addEventListener('input', () => this.saveBasicStepData());
            }
        });
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

        // Select All buttons
        document.querySelectorAll('.plex-select-all-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const serverId = parseInt(e.currentTarget.dataset.serverId);
                const serverCard = e.currentTarget.closest('.plex-server-card');
                const checkboxes = serverCard.querySelectorAll('.plex-library-checkbox');

                // Check if all are currently checked
                const allChecked = Array.from(checkboxes).every(cb => cb.checked);

                // Toggle: if all checked, uncheck all; otherwise check all
                const shouldCheck = !allChecked;

                let serverData = this.formData.plex.servers.find(s => s.server_id === serverId);
                if (!serverData) {
                    serverData = { server_id: serverId, library_ids: [] };
                    this.formData.plex.servers.push(serverData);
                }

                checkboxes.forEach(checkbox => {
                    const libraryId = String(checkbox.dataset.libraryId);
                    checkbox.checked = shouldCheck;

                    if (shouldCheck && !serverData.library_ids.includes(libraryId)) {
                        serverData.library_ids.push(libraryId);
                    } else if (!shouldCheck && serverData.library_ids.includes(libraryId)) {
                        serverData.library_ids = serverData.library_ids.filter(id => id !== libraryId);
                    }
                });

                // Update button text
                e.currentTarget.innerHTML = shouldCheck ?
                    '<i class="fas fa-minus-square"></i> Deselect All' :
                    '<i class="fas fa-check-double"></i> Select All';
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

        // Package selection - auto-calculate expiration date and update duration
        const packageSelect = document.getElementById('wizard-plex-package');
        if (packageSelect) {
            packageSelect.addEventListener('change', (e) => {
                const option = e.target.selectedOptions[0];
                if (option && option.dataset.duration) {
                    const duration = parseInt(option.dataset.duration);

                    // Update formData with the package duration
                    this.formData.plex.duration_months = duration;

                    const expiration = this.calculateExpirationDate(duration);
                    const expirationInput = document.getElementById('wizard-plex-expiration');
                    if (expirationInput) {
                        expirationInput.value = expiration;
                    }
                }
            });
        }

        // Welcome email checkbox - show/hide template dropdown
        const welcomeEmailCheckbox = document.getElementById('wizard-plex-welcome-email');
        const templateSelection = document.getElementById('plex-template-selection');
        if (welcomeEmailCheckbox && templateSelection) {
            welcomeEmailCheckbox.addEventListener('change', (e) => {
                templateSelection.style.display = e.target.checked ? 'block' : 'none';
            });
        }
    },

    /**
     * Attach listeners for IPTV step
     */
    attachIPTVStepListeners() {
        // Search IPTV User button
        const searchIPTVUserBtn = document.getElementById('search-iptv-user-btn');
        if (searchIPTVUserBtn) {
            searchIPTVUserBtn.addEventListener('click', () => this.searchIPTVUser());
        }

        // Link IPTV User buttons (from search results)
        document.querySelectorAll('.link-iptv-user-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const panelId = parseInt(e.currentTarget.dataset.panelId);
                const panelName = e.currentTarget.dataset.panelName;
                const lineId = e.currentTarget.dataset.lineId;
                const username = e.currentTarget.dataset.username;
                const editorUsername = e.currentTarget.dataset.editorUsername;

                this.linkExistingIPTVUser(panelId, panelName, lineId, username, editorUsername);
            });
        });

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
                // Clear package selection when switching between trial/paid
                this.formData.iptv.package_id = null;
                this.filterIPTVPackagesByTrial();
            });
        });

        // IPTV Package dropdown - capture selection
        const packageSelect = document.getElementById('wizard-iptv-package');
        if (packageSelect) {
            // Capture initial value if already selected
            if (packageSelect.value) {
                this.formData.iptv.package_id = parseInt(packageSelect.value);
                console.log('📦 Initial IPTV package_id captured:', this.formData.iptv.package_id);
            }

            // Listen for changes
            packageSelect.addEventListener('change', (e) => {
                this.formData.iptv.package_id = e.target.value ? parseInt(e.target.value) : null;
                console.log('📦 IPTV package_id changed to:', this.formData.iptv.package_id);
            });
        }

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

        // Subscription plan dropdown - save selection and auto-calculate expiration
        const subscriptionPlanSelect = document.getElementById('wizard-iptv-subscription-plan');
        if (subscriptionPlanSelect) {
            // Capture initial value
            if (subscriptionPlanSelect.value) {
                const planId = parseInt(subscriptionPlanSelect.value);
                this.formData.iptv.subscription_plan_id = planId;
                console.log('📋 Initial IPTV subscription plan captured:', planId);
            }

            // Listen for changes
            subscriptionPlanSelect.addEventListener('change', (e) => {
                // Save the selected subscription plan ID
                const planId = e.target.value ? parseInt(e.target.value) : null;
                this.formData.iptv.subscription_plan_id = planId;
                console.log('📋 IPTV subscription plan changed to:', planId);

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

        // Welcome email checkbox - show/hide template dropdown
        const welcomeEmailCheckbox = document.getElementById('wizard-iptv-welcome-email');
        const templateSelection = document.getElementById('iptv-template-selection');
        if (welcomeEmailCheckbox && templateSelection) {
            welcomeEmailCheckbox.addEventListener('change', (e) => {
                templateSelection.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Create IPTV Editor checkbox - show/hide channel package field when linked user
        const createEditorCheckbox = document.getElementById('wizard-create-iptv-editor');
        const channelPackageGroup = document.getElementById('wizard-iptv-channel-package-group');
        if (createEditorCheckbox && channelPackageGroup && this.cache.linkedIPTVUser) {
            createEditorCheckbox.addEventListener('change', (e) => {
                // Show channel package field when checkbox is checked (for IPTV Editor creation)
                channelPackageGroup.style.display = e.target.checked ? 'block' : 'none';
                const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
                if (channelPackageSelect) {
                    // Toggle required attribute
                    if (e.target.checked) {
                        channelPackageSelect.setAttribute('required', 'required');
                    } else {
                        channelPackageSelect.removeAttribute('required');
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

                // Store original access for later comparison (to skip provisioning if unchanged)
                this.cache.originalPlexAccess = [];

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

                        // Store original access for comparison
                        this.cache.originalPlexAccess.push({
                            server_id: serverAccess.server_id,
                            library_ids: [...libraryIds].sort() // Sorted copy for comparison
                        });
                    }
                });
                console.log('📦 Final formData.plex.servers:', this.formData.plex.servers);
                console.log('📦 Original Plex access stored:', this.cache.originalPlexAccess);
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
     * Search for existing IPTV user across all panels
     */
    async searchIPTVUser() {
        try {
            const usernameInput = document.getElementById('wizard-iptv-search-username');
            const username = usernameInput?.value.trim();

            if (!username) {
                Utils.showToast('Validation Error', 'Please enter a username to search', 'error');
                return;
            }

            Utils.showLoading();

            // Search across all IPTV panels
            const response = await API.searchIPTVPanelsForUser(username);
            this.cache.iptvUserSearchResults = response;

            // Re-render to show results
            await this.render('wizard-modal-content');

            if (response.found) {
                Utils.showToast('Success', `Found user "${username}" on ${response.found_on_panel_count} panel(s)`, 'success');
            } else {
                Utils.showToast('Not Found', `User "${username}" not found on any IPTV panels`, 'info');
            }

        } catch (error) {
            console.error('Error searching IPTV user:', error);
            Utils.showToast('Error', 'Failed to search for IPTV user', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * Link existing IPTV user instead of creating new one
     */
    async linkExistingIPTVUser(panelId, panelName, lineId, username, editorUsername) {
        try {
            Utils.showLoading();

            // Store linked user information in cache
            this.cache.linkedIPTVUser = {
                panel_id: panelId,
                panel_name: panelName,
                line_id: lineId,
                username: username,
                is_existing: true
            };

            // Clear search results
            this.cache.iptvUserSearchResults = null;

            // Update form data to use the selected panel
            this.formData.iptv.panel_id = panelId;

            // Load panel data
            await this.loadIPTVDataForPanel(panelId);

            // Check if this panel has a linked IPTV Editor playlist
            const selectedPanel = this.cache.iptvPanels.find(p => p.id === panelId);
            if (selectedPanel && selectedPanel.linked_playlist_id && editorUsername) {
                console.log(`📡 Panel ${panelName} has linked IPTV Editor playlist ${selectedPanel.linked_playlist_id}. Searching for user...`);

                try {
                    const editorResponse = await API.searchIPTVEditorForUser(editorUsername, selectedPanel.linked_playlist_id);

                    if (editorResponse.found) {
                        console.log(`✅ Found user "${username}" in IPTV Editor playlist ${selectedPanel.linked_playlist_id}`);
                        this.cache.linkedIPTVUser.iptv_editor_found = true;
                        this.cache.linkedIPTVUser.iptv_editor_data = editorResponse.user_data;
                        this.cache.linkedIPTVUser.iptv_editor_playlist_id = selectedPanel.linked_playlist_id;
                    } else {
                        console.log(`❌ User "${username}" not found in IPTV Editor`);
                        this.cache.linkedIPTVUser.iptv_editor_found = false;
                    }
                } catch (editorError) {
                    console.error('Error checking IPTV Editor:', editorError);
                    this.cache.linkedIPTVUser.iptv_editor_found = false;
                    this.cache.linkedIPTVUser.iptv_editor_error = editorError.message;
                }
            }

            // Re-render to show linked user status
            await this.render('wizard-modal-content');

            let message = `Linked to existing user "${username}" on ${panelName}`;
            if (this.cache.linkedIPTVUser.iptv_editor_found) {
                message += ` (also found in IPTV Editor)`;
            } else if (selectedPanel && selectedPanel.linked_playlist_id && this.cache.linkedIPTVUser.iptv_editor_found === false) {
                message += ` (not found in IPTV Editor)`;
            }

            Utils.showToast('Success', message, 'success');

        } catch (error) {
            console.error('Error linking IPTV user:', error);
            Utils.showToast('Error', 'Failed to link IPTV user', 'error');
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
     * Format a date as YYYY-MM-DD in local time (avoids UTC timezone shift)
     */
    formatDateLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Calculate expiration date from duration in months
     */
    calculateExpirationDate(months) {
        const date = new Date();
        date.setMonth(date.getMonth() + months);
        return this.formatDateLocal(date);
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
     * Check if Plex library access has changed from the original access
     * Returns true if user already has this exact access (no provisioning needed)
     */
    isPlexAccessUnchanged() {
        const originalAccess = this.cache.originalPlexAccess;
        const currentServers = this.formData.plex.servers;

        // If no original access was recorded, provisioning is needed
        if (!originalAccess || originalAccess.length === 0) {
            console.log('🔍 No original Plex access - provisioning needed');
            return false;
        }

        // Build current access map for comparison
        const currentAccessMap = {};
        for (const server of currentServers) {
            if (server.library_ids && server.library_ids.length > 0) {
                currentAccessMap[server.server_id] = [...server.library_ids].sort();
            }
        }

        // Build original access map
        const originalAccessMap = {};
        for (const server of originalAccess) {
            originalAccessMap[server.server_id] = server.library_ids; // Already sorted
        }

        // Compare server counts
        const currentServerIds = Object.keys(currentAccessMap);
        const originalServerIds = Object.keys(originalAccessMap);

        if (currentServerIds.length !== originalServerIds.length) {
            console.log('🔍 Plex server count changed - provisioning needed');
            return false;
        }

        // Compare each server's libraries
        for (const serverId of currentServerIds) {
            const currentLibs = currentAccessMap[serverId];
            const originalLibs = originalAccessMap[serverId];

            if (!originalLibs) {
                console.log(`🔍 New server ${serverId} added - provisioning needed`);
                return false;
            }

            if (currentLibs.length !== originalLibs.length) {
                console.log(`🔍 Library count changed for server ${serverId} - provisioning needed`);
                return false;
            }

            // Compare sorted library arrays
            for (let i = 0; i < currentLibs.length; i++) {
                if (currentLibs[i] !== originalLibs[i]) {
                    console.log(`🔍 Library access changed for server ${serverId} - provisioning needed`);
                    return false;
                }
            }
        }

        console.log('✅ Plex access unchanged from original - skipping provisioning');
        return true;
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
        const subscriptionPlanId = document.getElementById('wizard-iptv-subscription-plan')?.value;

        // Check if we're linking an existing user
        const isLinkingExistingUser = !!this.cache.linkedIPTVUser;

        if (!panelId) {
            Utils.showToast('Validation Error', 'Please select an IPTV panel', 'error');
            return false;
        }

        if (!subscriptionPlanId) {
            Utils.showToast('Validation Error', 'Please select a subscription plan', 'error');
            return false;
        }

        // If linking an existing user, check if we need to create IPTV Editor user
        if (isLinkingExistingUser) {
            console.log('Validating IPTV step - Linking existing user');

            // If creating IPTV Editor user, we need channel package
            const createEditorCheckbox = document.getElementById('wizard-create-iptv-editor');
            if (createEditorCheckbox && createEditorCheckbox.checked) {
                const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
                if (!channelPackageSelect || !channelPackageSelect.value) {
                    Utils.showToast('Validation Error', 'Please select a channel package for IPTV Editor', 'error');
                    return false;
                }
                console.log('Validating IPTV step - Creating IPTV Editor user, channel package selected');
            }

            return true;
        }

        // For new users, validate all required fields
        const packageId = document.getElementById('wizard-iptv-package')?.value;
        const username = document.getElementById('wizard-iptv-username')?.value.trim();
        const password = document.getElementById('wizard-iptv-password')?.value.trim();
        const email = document.getElementById('wizard-iptv-email')?.value.trim();
        const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');

        // Check if selected panel is NxtDash
        const selectedPanel = this.cache.iptvPanels.find(p => p.id === parseInt(panelId));
        const isNxtDash = selectedPanel && selectedPanel.panel_type === 'nxt_dash';

        console.log('Validating IPTV step - Panel:', selectedPanel?.name, 'Type:', selectedPanel?.panel_type, 'IsNxtDash:', isNxtDash);

        if (!packageId) {
            Utils.showToast('Validation Error', 'Please select an IPTV package', 'error');
            return false;
        }

        // Check channel package selection (single-select dropdown)
        if (!channelPackageSelect || !channelPackageSelect.value) {
            Utils.showToast('Validation Error', 'Please select at least one channel package', 'error');
            return false;
        }

        // Username and password are both optional for all panels - if blank, they will be auto-generated by the panel
        // Password is optional for all panels - if blank, it will be auto-generated
        // If provided, validate minimum length
        if (password && password.length > 0 && password.length < 8) {
            Utils.showToast('Validation Error', 'IPTV password must be at least 8 characters (or leave blank to auto-generate)', 'error');
            return false;
        }

        if (!email) {
            Utils.showToast('Validation Error', 'Email is required', 'error');
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

        // Email preferences
        this.formData.basic.exclude_from_bulk_emails = document.getElementById('wizard-exclude-bulk-emails')?.checked || false;
        this.formData.basic.bcc_owner_on_renewal = document.getElementById('wizard-bcc-owner')?.checked || false;
        this.formData.basic.exclude_from_automated_emails = document.getElementById('wizard-exclude-automated-emails')?.checked || false;
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

        const packageSelect = document.getElementById('wizard-plex-package');
        const packageId = packageSelect?.value;
        this.formData.plex.package_id = packageId ? parseInt(packageId) : null;

        // Get duration from selected package
        const selectedOption = packageSelect?.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.duration) {
            this.formData.plex.duration_months = parseInt(selectedOption.dataset.duration);
        }

        this.formData.plex.expiration_date = document.getElementById('wizard-plex-expiration')?.value || '';

        this.formData.plex.send_welcome_email = document.getElementById('wizard-plex-welcome-email')?.checked || false;

        const templateId = document.getElementById('wizard-plex-welcome-template')?.value;
        this.formData.plex.welcome_email_template_id = templateId ? parseInt(templateId) : null;

        // Servers are already being tracked via checkboxes
    },

    /**
     * Save IPTV step data
     */
    saveIPTVStepData() {
        const panelId = document.getElementById('wizard-iptv-panel')?.value;
        this.formData.iptv.panel_id = panelId ? parseInt(panelId) : null;

        const subscriptionPlanId = document.getElementById('wizard-iptv-subscription-plan')?.value;
        const duration = document.getElementById('wizard-iptv-duration')?.value;
        this.formData.iptv.duration_months = duration ? parseInt(duration) : 1;
        this.formData.iptv.expiration_date = document.getElementById('wizard-iptv-expiration')?.value || '';

        // Check if we're linking an existing user
        if (this.cache.linkedIPTVUser) {
            console.log('Saving linked IPTV user data:', this.cache.linkedIPTVUser);

            // Use data from the linked user for fields that exist on the panel/IPTV Editor
            this.formData.iptv.username = this.cache.linkedIPTVUser.panel_username || '';
            this.formData.iptv.password = this.cache.linkedIPTVUser.panel_password || '';
            this.formData.iptv.email = this.cache.linkedIPTVUser.email || '';

            // Mark that this is a linked user (not creating new)
            this.formData.iptv.is_linked_user = true;
            this.formData.iptv.linked_iptv_panel_user_id = this.cache.linkedIPTVUser.line_id || null;

            // Enable IPTV service for linked users
            this.formData.services.iptv = true;

            // If found in IPTV Editor, save that info too
            if (this.cache.linkedIPTVUser.iptv_editor_found && this.cache.linkedIPTVUser.iptv_editor_user_id) {
                this.formData.iptv.linked_iptv_editor_user_id = this.cache.linkedIPTVUser.iptv_editor_user_id;
            }

            // Package/channel info will be pulled from the panel by backend
            this.formData.iptv.package_id = null;
            this.formData.iptv.is_trial = false; // Will be determined by backend from panel data
            this.formData.iptv.notes = '';

            // Check if we should create IPTV Editor user (only if user exists on panel but NOT in editor)
            this.formData.iptv.create_iptv_editor = document.getElementById('wizard-create-iptv-editor')?.checked || false;

            // If creating IPTV Editor user, we need the channel package selection
            if (this.formData.iptv.create_iptv_editor) {
                const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
                if (channelPackageSelect && channelPackageSelect.value) {
                    this.formData.iptv.channel_package_ids = [parseInt(channelPackageSelect.value)];
                } else {
                    this.formData.iptv.channel_package_ids = [];
                }
            } else {
                this.formData.iptv.channel_package_ids = [];
            }

        } else {
            // Creating new user - get data from form fields
            const packageId = document.getElementById('wizard-iptv-package')?.value;
            this.formData.iptv.package_id = packageId ? parseInt(packageId) : null;

            this.formData.iptv.username = document.getElementById('wizard-iptv-username')?.value.trim() || '';
            this.formData.iptv.password = document.getElementById('wizard-iptv-password')?.value.trim() || '';
            this.formData.iptv.email = document.getElementById('wizard-iptv-email')?.value.trim() || '';
            this.formData.iptv.notes = document.getElementById('wizard-iptv-notes')?.value.trim() || '';

            // Handle channel package selection (single-select dropdown)
            const channelPackageSelect = document.getElementById('wizard-iptv-channel-packages');
            if (channelPackageSelect && channelPackageSelect.value) {
                this.formData.iptv.channel_package_ids = [parseInt(channelPackageSelect.value)];
            } else {
                this.formData.iptv.channel_package_ids = [];
            }

            const trialRadio = document.querySelector('input[name="iptv-trial"]:checked');
            this.formData.iptv.is_trial = trialRadio ? (trialRadio.value === 'trial') : false;

            this.formData.iptv.is_linked_user = false;
            this.formData.iptv.create_iptv_editor = document.getElementById('wizard-create-iptv-editor')?.checked || false;
        }

        this.formData.iptv.send_welcome_email = document.getElementById('wizard-iptv-welcome-email')?.checked || false;

        const iptvTemplateId = document.getElementById('wizard-iptv-welcome-template')?.value;
        this.formData.iptv.welcome_email_template_id = iptvTemplateId ? parseInt(iptvTemplateId) : null;
    },

    /**
     * Submit the user creation or service addition
     */
    async submitUser() {
        try {
            const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';

            // For add-service modes, we need to save current step data before submission
            // since there's only one step and user doesn't navigate away (DOM elements exist)
            // For create mode, we DON'T call saveCurrentStepData() because DOM elements
            // may not exist after wizard navigation, potentially overwriting values
            // captured by event listeners
            if (isAddServiceMode) {
                this.saveCurrentStepData();
            }

            // Build user data object
            const userData = {
                // Basic info (only for create mode, or minimal for add service mode)
                ...(isAddServiceMode ? {} : {
                    name: this.formData.basic.name,
                    email: this.formData.basic.email,
                    owner_id: this.formData.basic.owner_id,
                    notes: this.formData.basic.notes,
                    account_type: this.formData.basic.account_type,
                    tag_ids: this.formData.basic.tag_ids,
                    exclude_from_bulk_emails: this.formData.basic.exclude_from_bulk_emails,
                    bcc_owner_on_renewal: this.formData.basic.bcc_owner_on_renewal,
                }),

                // Plex configuration
                plex_enabled: this.formData.services.plex,
                ...(this.formData.services.plex && {
                    plex_email: this.formData.plex.email,
                    plex_server_library_selections: this.formData.plex.servers,
                    plex_package_id: this.formData.plex.package_id,
                    plex_duration_months: this.formData.plex.duration_months,
                    plex_expiration_date: this.formData.plex.expiration_date,
                    plex_send_welcome_email: this.formData.plex.send_welcome_email,
                    plex_welcome_email_template_id: this.formData.plex.welcome_email_template_id,
                    // Skip provisioning if linking existing user with unchanged access
                    plex_skip_provisioning: this.isPlexAccessUnchanged()
                }),

                // IPTV configuration
                iptv_enabled: this.formData.services.iptv,
                ...(this.formData.services.iptv && {
                    iptv_panel_id: this.formData.iptv.panel_id,
                    iptv_username: this.formData.iptv.username,
                    iptv_password: this.formData.iptv.password,
                    iptv_email: this.formData.iptv.email,
                    iptv_package_id: this.formData.iptv.package_id,  // Panel package ID for provisioning
                    iptv_subscription_plan_id: this.formData.iptv.subscription_plan_id,  // Subscription plan choice (saved to DB only)
                    // Channel group ID
                    iptv_channel_group_id: this.formData.iptv.channel_package_ids?.[0] || null,
                    iptv_is_trial: this.formData.iptv.is_trial,
                    iptv_duration_months: this.formData.iptv.duration_months,
                    iptv_expiration_date: this.formData.iptv.expiration_date,
                    iptv_notes: this.formData.iptv.notes,
                    create_on_iptv_editor: this.formData.iptv.create_iptv_editor,
                    iptv_send_welcome_email: this.formData.iptv.send_welcome_email,
                    iptv_welcome_email_template_id: this.formData.iptv.welcome_email_template_id,
                    // Linked user fields
                    iptv_is_linked_user: this.formData.iptv.is_linked_user || false,
                    iptv_linked_panel_user_id: this.formData.iptv.linked_iptv_panel_user_id || null,
                    iptv_linked_editor_user_id: this.formData.iptv.linked_iptv_editor_user_id || null
                })
            };

            // COMPREHENSIVE LOGGING - See exactly what's being sent
            console.log('==================================================');
            console.log('SUBMITTING USER DATA TO API');
            console.log('==================================================');
            console.log('Full userData object:', JSON.stringify(userData, null, 2));
            console.log('--------------------------------------------------');
            console.log('IPTV SPECIFIC FIELDS:');
            console.log('  iptv_enabled:', userData.iptv_enabled);
            console.log('  iptv_panel_id:', userData.iptv_panel_id);
            console.log('  iptv_username:', userData.iptv_username);
            console.log('  iptv_package_id:', userData.iptv_package_id);
            console.log('  iptv_subscription_plan_id:', userData.iptv_subscription_plan_id);
            console.log('  iptv_duration_months:', userData.iptv_duration_months);
            console.log('  iptv_is_trial:', userData.iptv_is_trial);
            console.log('  iptv_email:', userData.iptv_email);
            console.log('  iptv_channel_group_id:', userData.iptv_channel_group_id);
            console.log('--------------------------------------------------');
            console.log('formData.iptv object:', JSON.stringify(this.formData.iptv, null, 2));
            console.log('==================================================');

            // Initialize job tracking
            this.jobResults = {
                jobId: isAddServiceMode ? this.existingUser.id : null,
                status: 'processing',
                jobs: {
                    user: { status: isAddServiceMode ? 'completed' : 'processing', message: isAddServiceMode ? '' : 'Creating user record...', details: null },
                    plex: { status: 'pending', message: '', details: null },
                    iptv: { status: 'pending', message: '', details: null },
                    iptvEditor: { status: 'pending', message: '', details: null }
                }
            };

            // Navigate to results page
            const steps = this.getActiveSteps();
            this.currentStep = steps[steps.length - 1].id; // Results page
            await this.render('wizard-modal-content');

            // Mark user creation as processing (only in create mode)
            if (!isAddServiceMode) {
                this.jobResults.jobs.user.status = 'processing';
                this.jobResults.jobs.user.message = 'Creating user record...';
            }

            // Mark ALL enabled services as processing BEFORE API call so user can see when each starts
            if (this.formData.services.plex) {
                this.jobResults.jobs.plex.status = 'processing';
                this.jobResults.jobs.plex.message = isAddServiceMode ? 'Adding Plex access...' : 'Waiting to provision Plex access...';
            }

            if (this.formData.services.iptv) {
                this.jobResults.jobs.iptv.status = 'processing';
                this.jobResults.jobs.iptv.message = isAddServiceMode ? 'Adding IPTV account...' : 'Waiting to create IPTV account...';

                if (this.formData.iptv.create_iptv_editor) {
                    this.jobResults.jobs.iptvEditor.status = 'processing';
                    this.jobResults.jobs.iptvEditor.message = isAddServiceMode ? 'Adding IPTV Editor account...' : 'Waiting to create IPTV Editor account...';
                }
            }

            await this.render('wizard-modal-content');

            // Call API to create user or add service to existing user
            let response;
            if (isAddServiceMode) {
                // Add service mode: call createUser with existing_user_id to trigger provisioning
                console.log(`📝 Add Service Mode: Adding ${this.mode === 'add_plex' ? 'Plex' : 'IPTV'} service to user ${this.existingUser.id}`);
                const addServiceData = {
                    ...userData,
                    existing_user_id: this.existingUser.id,
                    name: this.existingUser.name,
                    email: this.existingUser.email
                };
                response = await API.createUser(addServiceData);
            } else {
                response = await API.createUser(userData);
            }

            if (response.success) {
                // Update job results - User created/updated
                this.jobResults.jobId = response.job_id || (isAddServiceMode ? this.existingUser.id : response.user_id);
                this.jobResults.userId = isAddServiceMode ? this.existingUser.id : response.user_id;

                if (!isAddServiceMode) {
                    this.jobResults.jobs.user.status = 'completed';
                    this.jobResults.jobs.user.message = 'User created successfully';
                    this.jobResults.jobs.user.details = [];
                }
                await this.render('wizard-modal-content');

                // Start polling for background jobs if job_id provided
                if (response.job_id) {
                    this.pollJobStatus(response.job_id);
                } else {
                    // Mark Plex as in_progress first
                    if (this.formData.services.plex) {
                        this.jobResults.jobs.plex.status = 'in_progress';
                        this.jobResults.jobs.plex.message = 'Provisioning Plex access...';
                        await this.render('wizard-modal-content');
                    }

                    // Mark IPTV as in_progress first
                    if (this.formData.services.iptv) {
                        this.jobResults.jobs.iptv.status = 'in_progress';
                        this.jobResults.jobs.iptv.message = 'Creating IPTV account...';
                        await this.render('wizard-modal-content');
                    }

                    // Mark IPTV Editor as in_progress if applicable
                    if (this.formData.services.iptv && this.formData.iptv.create_iptv_editor) {
                        this.jobResults.jobs.iptvEditor.status = 'in_progress';
                        this.jobResults.jobs.iptvEditor.message = 'Creating IPTV Editor account...';
                        await this.render('wizard-modal-content');
                    }

                    // Process Plex result
                    if (this.formData.services.plex) {
                        this.jobResults.jobs.plex.status = 'completed';
                        this.jobResults.jobs.plex.message = 'Plex access provisioned';
                        await this.render('wizard-modal-content');
                    }

                    // Process IPTV result
                    if (this.formData.services.iptv) {
                        // Check if IPTV creation actually succeeded
                        if (response.results && response.results.iptv_result) {
                            if (response.results.iptv_result.success) {
                                this.jobResults.jobs.iptv.status = 'completed';
                                this.jobResults.jobs.iptv.message = 'IPTV account created';
                                // Store full IPTV result data for display
                                this.jobResults.jobs.iptv.details = response.results.iptv_result;
                            } else {
                                // IPTV creation failed - show error
                                this.jobResults.jobs.iptv.status = 'error';
                                this.jobResults.jobs.iptv.message = response.results.iptv_result.error || 'Failed to create IPTV account';
                                this.jobResults.status = 'error';
                                Utils.showToast('IPTV Error', response.results.iptv_result.error || 'Failed to create IPTV account', 'error');
                            }
                        } else {
                            this.jobResults.jobs.iptv.status = 'completed';
                            this.jobResults.jobs.iptv.message = 'IPTV account created';
                        }
                        await this.render('wizard-modal-content');

                        // Check IPTV Editor result
                        if (this.formData.iptv.create_iptv_editor) {
                            if (response.results && response.results.iptv_editor_result) {
                                if (response.results.iptv_editor_result.success) {
                                    this.jobResults.jobs.iptvEditor.status = 'completed';
                                    this.jobResults.jobs.iptvEditor.message = 'IPTV Editor account created';
                                } else {
                                    this.jobResults.jobs.iptvEditor.status = 'error';
                                    this.jobResults.jobs.iptvEditor.message = response.results.iptv_editor_result.error || 'Failed to create IPTV Editor account';
                                    this.jobResults.status = 'error';
                                    Utils.showToast('IPTV Editor Error', response.results.iptv_editor_result.error || 'Failed to create IPTV Editor account', 'error');
                                }
                            } else {
                                this.jobResults.jobs.iptvEditor.status = 'completed';
                                this.jobResults.jobs.iptvEditor.message = 'IPTV Editor account created';
                            }
                            await this.render('wizard-modal-content');
                        }
                    }

                    // Mark overall status as completed
                    this.jobResults.status = 'completed';

                    // Mark service request provisioning as complete if applicable
                    await this.markProvisioningComplete();
                }

                    console.log('✅ User creation completed! Checking modal state...');

                    // Check if modal is still open
                    const modalContainer = document.getElementById('wizard-modal-content');
                    console.log('Modal container exists:', !!modalContainer);
                    console.log('Job results:', this.jobResults);

                    if (modalContainer) {
                        // Modal still open - render results
                        console.log('Modal is open - rendering results in modal');
                        await this.render('wizard-modal-content');
                    } else {
                        // Modal was closed - show toast notification
                        console.log('Modal is closed - showing notification');
                        this.showCompletionNotification();
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
        }
    },

    /**
     * Poll job status for background jobs
     */
    async pollJobStatus(jobId) {
        const pollInterval = 2000; // 2 seconds
        const maxPolls = 60; // 2 minutes max
        let pollCount = 0;
        let notificationShown = false; // Track if we've shown the notification

        const poll = async () => {
            try {
                const response = await API.getUserCreationStatus(jobId);

                // Update job statuses
                if (response.user_job) {
                    this.jobResults.jobs.user = response.user_job;
                }
                if (response.plex_job) {
                    this.jobResults.jobs.plex = response.plex_job;
                }
                if (response.iptv_job) {
                    this.jobResults.jobs.iptv = response.iptv_job;
                }
                if (response.iptv_editor_job) {
                    this.jobResults.jobs.iptvEditor = response.iptv_editor_job;
                }

                // Check if all jobs are complete
                const allJobs = Object.values(this.jobResults.jobs);
                const completedJobs = allJobs.filter(j => j.status !== 'pending');
                const allComplete = completedJobs.length > 0 &&
                    completedJobs.every(j => j.status === 'completed' || j.status === 'error');

                if (allComplete) {
                    this.jobResults.status = allComplete ? 'completed' : 'error';

                    // Mark provisioning complete if applicable
                    await this.markProvisioningComplete();

                    // Check if modal is still open
                    const modalContainer = document.getElementById('wizard-modal-content');
                    if (!modalContainer && !notificationShown) {
                        // Modal is closed - show toast notification
                        this.showCompletionNotification();
                        notificationShown = true;
                        // Stop polling after notification is shown
                        return;
                    } else if (modalContainer) {
                        // Modal still open - continue polling to detect when it closes
                        // Use a lighter poll interval after completion
                        pollCount++;
                        if (pollCount < maxPolls) {
                            setTimeout(poll, pollInterval);
                        }
                    } else {
                        // Notification already shown, stop polling
                        return;
                    }
                } else {
                    // Jobs not complete - continue polling normally
                    pollCount++;
                    if (pollCount < maxPolls) {
                        setTimeout(poll, pollInterval);
                    }
                }

                // Re-render to show updated status (only if modal is still open)
                const modalContainer = document.getElementById('wizard-modal-content');
                if (modalContainer) {
                    await this.render('wizard-modal-content');
                }

            } catch (error) {
                console.error('Error polling job status:', error);
                this.jobResults.status = 'error';

                // Try to render error, but don't fail if modal is closed
                const modalContainer = document.getElementById('wizard-modal-content');
                if (modalContainer) {
                    await this.render('wizard-modal-content');
                } else if (!notificationShown) {
                    // Modal is closed - show toast notification
                    Utils.showToast('Error', 'Failed to complete user creation jobs', 'error');
                    notificationShown = true;
                }
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
        if (!this.serviceRequestId) {
            console.log('No service request to mark as complete');
            return;
        }

        try {
            console.log('Marking provisioning complete for service request:', this.serviceRequestId);
            await API.updateServiceRequest(this.serviceRequestId, {
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
     * Show completion notification when modal is closed
     */
    showCompletionNotification() {
        console.log('📢 showCompletionNotification() called');
        console.log('Current job results:', this.jobResults);

        // Count completed and failed jobs
        const jobsArray = Object.entries(this.jobResults.jobs)
            .filter(([name, job]) => job.status !== 'pending')
            .map(([name, job]) => ({ name, ...job }));

        const completed = jobsArray.filter(j => j.status === 'completed');
        const failed = jobsArray.filter(j => j.status === 'error');

        if (failed.length > 0) {
            // Show error notification with details
            if (failed.length === 1) {
                // Single failure - show specific error message
                const job = failed[0];
                let serviceName = job.name;
                if (job.name === 'iptvEditor') serviceName = 'IPTV Editor';
                if (job.name === 'iptv') serviceName = 'IPTV';
                if (job.name === 'plex') serviceName = 'Plex';
                if (job.name === 'user') serviceName = 'User';

                Utils.showToast(
                    `${serviceName} Error`,
                    job.message || 'Provisioning failed',
                    'error'
                );
            } else {
                // Multiple failures - show list with error messages
                const failedList = failed.map(j => {
                    let serviceName = j.name;
                    if (j.name === 'iptvEditor') serviceName = 'IPTV Editor';
                    if (j.name === 'iptv') serviceName = 'IPTV';
                    if (j.name === 'plex') serviceName = 'Plex';
                    if (j.name === 'user') serviceName = 'User';
                    return `${serviceName}: ${j.message || 'Failed'}`;
                }).join('; ');

                Utils.showToast(
                    'User Creation Incomplete',
                    failedList,
                    'warning'
                );
            }
        } else {
            // All jobs completed successfully
            const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';
            const serviceName = this.mode === 'add_plex' ? 'Plex' : 'IPTV';

            if (isAddServiceMode) {
                Utils.showToast(
                    'Service Added Successfully',
                    `${serviceName} service has been added to the user`,
                    'success'
                );
            } else {
                Utils.showToast(
                    'User Created Successfully',
                    'User provisioning completed',
                    'success'
                );
            }
        }

        // Refresh appropriate page based on mode
        const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';
        if (isAddServiceMode && this.existingUser) {
            // Reload the edit-user page to show updated data
            setTimeout(() => {
                if (typeof EditUser !== 'undefined' && typeof EditUser.loadUser === 'function') {
                    EditUser.loadUser(this.existingUser.id);
                } else if (typeof Router !== 'undefined') {
                    // Force page reload by navigating to the same page
                    Router.navigate(`edit-user/${this.existingUser.id}`);
                }
            }, 500);
        } else if (typeof Users !== 'undefined' && typeof Users.loadUsers === 'function') {
            // Refresh users list if on users page
            setTimeout(() => Users.loadUsers(), 500);
        }
    },

    /**
     * View the created user
     */
    viewCreatedUser() {
        Utils.closeModal();

        const isAddServiceMode = this.mode === 'add_plex' || this.mode === 'add_iptv';
        const userId = isAddServiceMode ? this.existingUser.id : this.jobResults.userId;

        // If we have a specific user ID, navigate to that user
        if (userId && typeof Router !== 'undefined' && typeof Router.navigate === 'function') {
            Router.navigate(`edit-user/${userId}`);
        } else if (typeof Users !== 'undefined' && typeof Users.loadUsers === 'function') {
            // Navigate to users page if not already there
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
