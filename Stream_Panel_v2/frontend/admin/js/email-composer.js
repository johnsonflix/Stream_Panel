/**
 * Email Composer - On-Demand Email Sending
 *
 * Features:
 * - Template selection and preview
 * - Recipient management (search, tags, manual entry)
 * - CC/BCC support
 * - Live preview
 * - Individual and bulk send modes
 */

const EmailComposer = {
    templates: [],
    selectedTemplate: null,
    recipients: [],
    ccRecipients: [],
    bccRecipients: [],
    availableTags: [],
    owners: [],
    sendMode: 'normal', // 'normal' or 'bulk'
    selectedToUser: null, // Store selected user in normal mode

    /**
     * Render email composer page
     * @param {HTMLElement} container - The container element
     * @param {Array} params - URL parameters (e.g., [userId] from #email/123)
     */
    async render(container, params = []) {
        this.urlParams = params; // Store params for checkPreselectedUser
        container.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-envelope"></i> Send Email</h1>
                <p>Compose and send emails to your users</p>
            </div>

            <!-- Send Mode Toggle -->
            <div class="send-mode-toggle card" style="margin-bottom: 20px; padding: 15px;">
                <div class="mode-switch">
                    <label class="switch-label">
                        <input type="radio" name="send-mode" value="normal" checked>
                        <span><i class="fas fa-user"></i> Normal Send</span>
                        <small>Send to a single user with personalized content</small>
                    </label>
                    <label class="switch-label">
                        <input type="radio" name="send-mode" value="bulk">
                        <span><i class="fas fa-users"></i> Bulk Send</span>
                        <small>Send to multiple users via BCC by tag or owner</small>
                    </label>
                </div>
            </div>

            <div class="email-composer-container">
                <div class="composer-grid">
                    <!-- Left Column: Composer -->
                    <div class="composer-panel card">
                        <h2>Compose Email</h2>

                        <!-- Template Selection -->
                        <div class="form-group">
                            <label for="template-select">
                                <i class="fas fa-file-alt"></i> Email Template
                            </label>
                            <div class="template-select-group">
                                <select id="template-select" class="form-control">
                                    <option value="">Select a template...</option>
                                </select>
                                <button type="button" class="btn btn-sm btn-secondary" id="preview-template-btn" disabled>
                                    <i class="fas fa-eye"></i> Preview
                                </button>
                            </div>
                        </div>

                        <!-- To Recipients -->
                        <div class="form-group">
                            <label for="recipients-input">
                                <i class="fas fa-user"></i> To
                                <span class="recipient-count" id="to-count"></span>
                            </label>

                            <!-- Normal Mode: User Search -->
                            <div id="to-normal-mode">
                                <div class="recipient-input-group">
                                    <input
                                        type="text"
                                        id="recipients-input"
                                        class="form-control"
                                        placeholder="Search for a user by name or email..."
                                        autocomplete="off"
                                        name="to-recipient-search"
                                    >
                                    <div class="recipient-suggestions" id="recipient-suggestions" style="display: none;"></div>
                                </div>
                                <div class="selected-recipients" id="selected-recipients"></div>
                            </div>

                            <!-- Bulk Mode: Manual Email Entry -->
                            <div id="to-bulk-mode" style="display: none;">
                                <input
                                    type="email"
                                    id="bulk-to-email"
                                    class="form-control"
                                    placeholder="Enter single email address..."
                                    autocomplete="section-bulkto email"
                                    name="bulk-to-email-field"
                                >
                                <small class="form-text text-muted">Enter one email address for the To field. Use BCC to send to multiple users.</small>
                            </div>
                        </div>

                        <!-- CC Recipients -->
                        <div class="form-group">
                            <label>
                                <i class="fas fa-copy"></i> CC (Optional)
                                <span class="recipient-count" id="cc-count">(0)</span>
                            </label>
                            <div class="recipient-builder">
                                <div class="recipient-input-group">
                                    <input
                                        type="text"
                                        id="cc-input"
                                        class="form-control"
                                        placeholder="Search for a user by name or email, or enter email addresses..."
                                        autocomplete="section-cc email"
                                        name="cc-recipient-search"
                                    >
                                    <div class="recipient-suggestions" id="cc-suggestions" style="display: none;"></div>
                                </div>
                                <!-- Add Owner Button (Normal Mode Only) -->
                                <div class="recipient-quick-actions" id="cc-owner-action" style="display: none;">
                                    <button type="button" class="btn btn-sm btn-outline-primary" id="cc-add-owner-btn">
                                        <i class="fas fa-user-tie"></i> Add Owner
                                    </button>
                                    <small class="text-muted">Adds the owner's email of the selected recipient in To field</small>
                                </div>
                                <div class="selected-recipients" id="selected-cc"></div>
                            </div>
                        </div>

                        <!-- BCC Recipients -->
                        <div class="form-group">
                            <label>
                                <i class="fas fa-eye-slash"></i> BCC (Optional)
                                <span class="recipient-count" id="bcc-count">(0)</span>
                            </label>
                            <div class="recipient-builder">
                                <div class="recipient-input-group">
                                    <input
                                        type="text"
                                        id="bcc-input"
                                        class="form-control"
                                        placeholder="Search for a user by name or email, or enter email addresses..."
                                        autocomplete="section-bcc email"
                                        name="bcc-recipient-search"
                                    >
                                    <div class="recipient-suggestions" id="bcc-suggestions" style="display: none;"></div>
                                </div>

                                <!-- Normal Mode: Add Owner -->
                                <div class="recipient-quick-actions" id="bcc-owner-action" style="display: none;">
                                    <button type="button" class="btn btn-sm btn-outline-primary" id="bcc-add-owner-btn">
                                        <i class="fas fa-user-tie"></i> Add Owner
                                    </button>
                                    <small class="text-muted">Adds the owner's email of the selected recipient in To field</small>
                                </div>

                                <!-- Bulk Mode: Add by Tag/Owner -->
                                <div id="bcc-bulk-actions" style="display: none;">
                                    <div class="recipient-quick-actions">
                                        <button type="button" class="btn btn-sm btn-outline-primary" id="bcc-by-tag-btn">
                                            <i class="fas fa-tag"></i> Add by Tag
                                        </button>
                                        <button type="button" class="btn btn-sm btn-outline-primary" id="bcc-by-owner-btn">
                                            <i class="fas fa-user-tie"></i> Add by Owner
                                        </button>
                                    </div>
                                    <div class="alert alert-info" style="margin-top: 10px; font-size: 0.9em;">
                                        <i class="fas fa-info-circle"></i> <strong>Bulk Mode:</strong> Selected tags/owners will BCC all users with those tags/owners.
                                    </div>
                                </div>

                                <div class="selected-recipients" id="selected-bcc"></div>
                            </div>
                        </div>


                        <!-- Actions -->
                        <div class="composer-actions">
                            <button type="button" class="btn btn-success btn-lg" id="send-email-btn" disabled>
                                <i class="fas fa-paper-plane"></i> Send Email
                            </button>
                        </div>
                    </div>

                    <!-- Right Column: Manual Subject + Body + Preview -->
                    <div class="preview-panel card">
                        <!-- Manual Email Subject -->
                        <div class="form-group">
                            <label for="manual-email-subject">
                                <i class="fas fa-heading"></i> Custom Email Subject
                            </label>
                            <input
                                type="text"
                                id="manual-email-subject"
                                class="form-control"
                                placeholder="Enter email subject..."
                                autocomplete="on"
                                name="email-subject-field"
                            />
                            <small class="form-text text-muted">
                                <strong>Without template:</strong> This will be the email subject.<br>
                                <strong>With template:</strong> This is ignored (template subject is used instead).
                            </small>
                        </div>

                        <!-- Manual Email Body -->
                        <div class="form-group">
                            <label for="manual-email-body">
                                <i class="fas fa-pencil-alt"></i> Custom Email Body
                            </label>
                            <textarea
                                id="manual-email-body"
                                class="form-control auto-expand-textarea"
                                placeholder="Type your custom email message here..."
                                rows="1"
                                autocomplete="on"
                                name="email-body-field"
                            ></textarea>
                            <small class="form-text text-muted">
                                <strong>Without template:</strong> This will be the entire email body.<br>
                                <strong>With template:</strong> This is ignored (template is used instead).
                            </small>
                        </div>

                        <h2><i class="fas fa-eye"></i> Preview</h2>
                        <div id="email-preview-container">
                            <div class="preview-placeholder">
                                <i class="fas fa-envelope-open-text fa-3x"></i>
                                <p>Select a template to preview</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add by Tag Modal -->
            <div id="add-by-tag-modal" class="modal" style="display: none;">
                <div class="modal-content modal-md">
                    <div class="modal-header">
                        <h3>Add Recipients by Tag</h3>
                        <button class="modal-close" onclick="EmailComposer.closeTagModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Select Tag</label>
                            <select id="tag-select" class="form-control">
                                <option value="">Loading tags...</option>
                            </select>
                        </div>
                        <div id="tag-user-preview"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="EmailComposer.closeTagModal()">Cancel</button>
                        <button class="btn btn-primary" id="confirm-tag-add-btn">Add Selected Tag</button>
                    </div>
                </div>
            </div>

            <!-- Template Preview Modal -->
            <div id="template-preview-modal" class="modal" style="display: none;">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3>Template Preview</h3>
                        <button class="modal-close" onclick="EmailComposer.closePreviewModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="full-template-preview"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="EmailComposer.closePreviewModal()">Close</button>
                    </div>
                </div>
            </div>
        `;

        // Initialize
        await this.initialize();
    },

    /**
     * Initialize composer
     */
    async initialize() {
        try {
            // Load templates and tags
            await Promise.all([
                this.loadTemplates(),
                this.loadTags()
            ]);

            // Setup event listeners
            this.setupEventListeners();

            // Initialize send mode to normal (shows owner buttons)
            this.switchSendMode('normal');

            // Check if a user was preselected from another page
            await this.checkPreselectedUser();

        } catch (error) {
            console.error('Error initializing email composer:', error);
            Utils.showToast('Error', 'Failed to initialize email composer', 'error');
        }
    },

    /**
     * Load email templates
     */
    async loadTemplates() {
        try {
            const response = await API.request('/email-templates', { method: 'GET' });
            this.templates = response.templates || response.data || [];

            // Filter templates based on current mode
            this.filterTemplatesByMode();

        } catch (error) {
            console.error('Error loading templates:', error);
            Utils.showToast('Error', 'Failed to load email templates', 'error');
        }
    },

    /**
     * Load tags
     */
    async loadTags() {
        try {
            const response = await API.request('/tags', { method: 'GET' });
            // Handle both old 'tags' field and new 'data' field for backward compatibility
            this.availableTags = response.data || response.tags || [];
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Send mode toggle
        document.querySelectorAll('input[name="send-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchSendMode(e.target.value);
            });
        });

        // Template selection
        document.getElementById('template-select').addEventListener('change', (e) => {
            this.onTemplateChange(e.target.value);
        });

        document.getElementById('preview-template-btn').addEventListener('click', () => {
            this.showFullPreview();
        });

        // Recipient search (To field)
        const recipientsInput = document.getElementById('recipients-input');
        recipientsInput.addEventListener('input', debounce((e) => {
            this.searchUsers(e.target.value, 'to');
        }, 300));

        recipientsInput.addEventListener('focus', () => {
            if (recipientsInput.value) {
                this.searchUsers(recipientsInput.value, 'to');
            }
        });

        // CC field user search
        const ccInput = document.getElementById('cc-input');
        ccInput.addEventListener('input', debounce((e) => {
            this.searchUsers(e.target.value, 'cc');
        }, 300));

        ccInput.addEventListener('focus', () => {
            if (ccInput.value) {
                this.searchUsers(ccInput.value, 'cc');
            }
        });

        ccInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addCC();
            }
        });

        // BCC field user search
        const bccInput = document.getElementById('bcc-input');
        bccInput.addEventListener('input', debounce((e) => {
            this.searchUsers(e.target.value, 'bcc');
        }, 300));

        bccInput.addEventListener('focus', () => {
            if (bccInput.value) {
                this.searchUsers(bccInput.value, 'bcc');
            }
        });

        bccInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addBCC();
            }
        });

        // Owner buttons (Normal Mode)
        document.getElementById('cc-add-owner-btn').addEventListener('click', () => {
            this.addOwnerToCC();
        });

        document.getElementById('bcc-add-owner-btn').addEventListener('click', () => {
            this.addOwnerToBCC();
        });

        // Bulk mode BCC buttons
        document.getElementById('bcc-by-tag-btn').addEventListener('click', () => {
            this.showTagModal('bcc');
        });

        document.getElementById('bcc-by-owner-btn').addEventListener('click', () => {
            this.showOwnerModal();
        });

        // Send button
        document.getElementById('send-email-btn').addEventListener('click', () => {
            this.sendEmail();
        });

        // Custom subject field - update preview when changed
        const manualSubjectInput = document.getElementById('manual-email-subject');
        if (manualSubjectInput) {
            manualSubjectInput.addEventListener('input', debounce(() => {
                // Update send button state
                this.updateSendButton();
                // Refresh preview
                this.loadPreview();
            }, 500));
        }

        // Auto-expanding textarea for manual email body
        const manualBodyTextarea = document.getElementById('manual-email-body');
        if (manualBodyTextarea) {
            manualBodyTextarea.addEventListener('input', debounce(() => {
                this.autoExpandTextarea(manualBodyTextarea);
                // Update send button state
                this.updateSendButton();
                // Refresh preview
                this.loadPreview();
            }, 500));
            // Initialize height
            this.autoExpandTextarea(manualBodyTextarea);
        }

        // Click outside to close suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.recipient-input-group')) {
                this.hideSuggestions();
            }
        });
    },

    /**
     * Auto-expand textarea based on content
     */
    autoExpandTextarea(textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';

        // Set the height to match the content, with min and max constraints
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 300);
        textarea.style.height = newHeight + 'px';
    },

    /**
     * Switch between normal and bulk send modes
     */
    switchSendMode(mode) {
        this.sendMode = mode;

        // Toggle To field UI
        const toNormal = document.getElementById('to-normal-mode');
        const toBulk = document.getElementById('to-bulk-mode');
        const ccOwnerAction = document.getElementById('cc-owner-action');
        const bccOwnerAction = document.getElementById('bcc-owner-action');
        const bccBulkActions = document.getElementById('bcc-bulk-actions');

        if (mode === 'bulk') {
            // Bulk mode
            toNormal.style.display = 'none';
            toBulk.style.display = 'block';
            ccOwnerAction.style.display = 'none';
            bccOwnerAction.style.display = 'none';
            bccBulkActions.style.display = 'block';

            // Clear normal mode recipients
            this.recipients = [];
            this.selectedToUser = null;
            this.renderRecipients();
        } else {
            // Normal mode
            toNormal.style.display = 'block';
            toBulk.style.display = 'none';
            ccOwnerAction.style.display = 'block';
            bccOwnerAction.style.display = 'block';
            bccBulkActions.style.display = 'none';

            // Clear bulk mode email
            document.getElementById('bulk-to-email').value = '';
        }

        // Clear CC/BCC
        this.ccRecipients = [];
        this.bccRecipients = [];
        this.renderCC();
        this.renderBCC();

        // Filter templates based on mode
        this.filterTemplatesByMode();
    },

    /**
     * Filter templates based on send mode
     */
    filterTemplatesByMode() {
        const select = document.getElementById('template-select');
        const currentValue = select.value;

        // Clear options except first
        select.innerHTML = '<option value="">Select a template...</option>';

        this.templates.forEach(template => {
            const category = template.category || 'custom';
            let shouldShow = false;

            if (this.sendMode === 'bulk') {
                // Bulk mode: only bulk, announcement, and custom
                shouldShow = ['bulk', 'announcement', 'custom'].includes(category);
            } else {
                // Normal mode: all except bulk
                shouldShow = category !== 'bulk';
            }

            if (shouldShow) {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                select.appendChild(option);
            }
        });

        // Try to restore selection if still valid
        if (currentValue) {
            const stillExists = Array.from(select.options).some(opt => opt.value === currentValue);
            if (stillExists) {
                select.value = currentValue;
            } else {
                this.onTemplateChange('');
            }
        }
    },

    /**
     * Add owner email to CC
     */
    addOwnerToCC() {
        if (!this.selectedToUser || !this.selectedToUser.owner_email) {
            Utils.showToast('Error', 'Selected user has no owner email', 'error');
            return;
        }

        const ownerEmail = this.selectedToUser.owner_email;
        const ownerName = this.selectedToUser.owner_name || 'Owner';
        if (!this.ccRecipients.some(r => r.email === ownerEmail)) {
            // In normal mode, add owner as a plain email (not bulk owner type)
            this.ccRecipients.push({
                email: ownerEmail,
                name: `${ownerName} (Owner)`,
                type: 'owner-email'  // Distinguishes from bulk 'owner' type
            });
            this.renderCC();
            this.updateSendButton();
        }
    },

    /**
     * Add owner email to BCC
     */
    addOwnerToBCC() {
        if (!this.selectedToUser || !this.selectedToUser.owner_email) {
            Utils.showToast('Error', 'Selected user has no owner email', 'error');
            return;
        }

        const ownerEmail = this.selectedToUser.owner_email;
        const ownerName = this.selectedToUser.owner_name || 'Owner';
        if (!this.bccRecipients.some(r => r.email === ownerEmail)) {
            // In normal mode, add owner as a plain email (not bulk owner type)
            this.bccRecipients.push({
                email: ownerEmail,
                name: `${ownerName} (Owner)`,
                type: 'owner-email'  // Distinguishes from bulk 'owner' type
            });
            this.renderBCC();
            this.updateSendButton();
        }
    },

    /**
     * Show owner modal for bulk BCC - shows all app users with their subscriber counts
     */
    async showOwnerModal() {
        try {
            // Load all app users
            const response = await API.request('/app-users', { method: 'GET' });
            console.log('Owner modal - API response:', response);
            const appUsers = response.users || response.data || [];

            if (appUsers.length === 0) {
                console.warn('No app users returned from /app-users endpoint');
                Utils.showToast('Info', 'No app users found in database', 'info');
                return;
            }

            // Fetch user counts for each owner
            const ownerCounts = await Promise.all(
                appUsers.map(async (user) => {
                    try {
                        const countResp = await API.request(`/email/send/users-by-owner/${user.id}`, { method: 'GET' });
                        return {
                            ...user,
                            userCount: countResp.count || (countResp.data ? countResp.data.length : 0),
                            users: countResp.data || []
                        };
                    } catch (err) {
                        console.warn(`Failed to get count for owner ${user.id}:`, err);
                        return { ...user, userCount: 0, users: [] };
                    }
                })
            );

            const modalContent = `
                <div class="owner-selector">
                    <p>Select owners to BCC all their associated subscriber users:</p>
                    <div class="owner-list">
                        ${ownerCounts.map(user => `
                            <label class="owner-item">
                                <input type="checkbox" value="${user.id}"
                                    data-name="${Utils.escapeHtml(user.name)}"
                                    data-email="${Utils.escapeHtml(user.email)}"
                                    data-count="${user.userCount}"
                                    data-users='${JSON.stringify(user.users).replace(/'/g, "&apos;")}'>
                                <span>${Utils.escapeHtml(user.name)}</span>
                                <span class="owner-user-count" style="margin-left: auto; background: var(--primary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85em;">${user.userCount} user${user.userCount !== 1 ? 's' : ''}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;

            // Store owner data for later use
            this.ownerData = ownerCounts;

            Utils.showModal({
                title: 'Select Owners for BCC',
                content: modalContent,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-secondary',
                        onclick: () => Utils.closeModal()
                    },
                    {
                        text: 'Add to BCC',
                        class: 'btn-primary',
                        onclick: () => {
                            const checkboxes = document.querySelectorAll('.owner-item input:checked');
                            checkboxes.forEach(cb => {
                                const ownerId = cb.value;
                                const ownerName = cb.dataset.name;
                                const userCount = parseInt(cb.dataset.count) || 0;
                                let users = [];
                                try {
                                    users = JSON.parse(cb.dataset.users);
                                } catch (e) {
                                    console.warn('Failed to parse users data');
                                }

                                if (!this.bccRecipients.some(r => r.type === 'owner' && r.id === ownerId)) {
                                    this.bccRecipients.push({
                                        type: 'owner',
                                        id: ownerId,
                                        name: ownerName,
                                        userCount: userCount,
                                        users: users
                                    });
                                }
                            });
                            this.renderBCC();
                            this.updateSendButton();
                            Utils.closeModal();
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error loading app users:', error);
            Utils.showToast('Error', 'Failed to load app users', 'error');
        }
    },

    /**
     * Handle template selection change
     */
    async onTemplateChange(templateId) {
        if (!templateId) {
            this.selectedTemplate = null;
            document.getElementById('preview-template-btn').disabled = true;
            document.getElementById('email-preview-container').innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-envelope-open-text fa-3x"></i>
                    <p>Select a template to preview</p>
                </div>
            `;
            this.updateSendButton();
            return;
        }

        this.selectedTemplate = this.templates.find(t => t.id == templateId);
        document.getElementById('preview-template-btn').disabled = false;

        // Load preview
        await this.loadPreview();
        this.updateSendButton();
    },

    /**
     * Load template preview
     */
    async loadPreview() {
        const previewContainer = document.getElementById('email-preview-container');
        const customSubject = document.getElementById('manual-email-subject')?.value.trim() || '';
        const customBody = document.getElementById('manual-email-body')?.value.trim() || '';

        // NO TEMPLATE: Show custom subject and body preview
        if (!this.selectedTemplate) {
            if (!customBody && !customSubject) {
                previewContainer.innerHTML = `
                    <div class="preview-placeholder">
                        <i class="fas fa-envelope-open-text fa-3x"></i>
                        <p>Select a template or enter a custom message to preview</p>
                    </div>
                `;
                return;
            }

            // Show custom subject and body preview
            const displaySubject = customSubject || 'Message from StreamPanel';
            const formattedBody = customBody.replace(/\n/g, '<br>') || '<em>(No body text)</em>';
            previewContainer.innerHTML = `
                <div class="email-preview">
                    <div class="preview-subject">
                        <strong>Subject:</strong> ${Utils.escapeHtml(displaySubject)}
                    </div>
                    <div class="preview-body">
                        <div style="padding: 20px; font-family: Arial, sans-serif;">
                            ${formattedBody}
                        </div>
                    </div>
                    <div class="preview-note">
                        <i class="fas fa-info-circle"></i>
                        Custom email preview (no template selected).
                    </div>
                </div>
            `;
            return;
        }

        // TEMPLATE: Show template preview (ignore custom body)
        try {
            // Build request body with userId if recipients are selected
            const requestBody = {
                customMessage: this.selectedTemplate.custom_message || ''
            };

            // Use first recipient's data if available for preview
            // Only pass userId if it's a valid database user (not a manual email recipient)
            if (this.recipients && this.recipients.length > 0 && this.recipients[0].id) {
                requestBody.userId = this.recipients[0].id;
                console.log('[DEBUG] Preview - First recipient:', this.recipients[0]);
                console.log('[DEBUG] Preview - Sending userId:', requestBody.userId);
            } else {
                console.log('[DEBUG] Preview - No valid recipient, using sample data');
            }

            const response = await API.request(`/email-templates/${this.selectedTemplate.id}/preview`, {
                method: 'POST',
                body: requestBody
            });

            // Handle both response.preview (new format) and response.data (legacy format)
            const previewData = response.preview || response.data || {};
            const bodyContent = previewData.body || previewData.html || '';
            const subjectContent = previewData.subject || '';

            // Escape only double quotes for the srcdoc attribute, keep HTML intact
            const escapedBody = bodyContent.replace(/"/g, '&quot;');

            // Determine if we're using real or sample data
            const previewNote = requestBody.userId
                ? `Preview using data from: ${Utils.escapeHtml(this.recipients[0].email || this.recipients[0].name)}`
                : 'Preview uses sample data. Actual emails will be personalized with recipient data.';

            previewContainer.innerHTML = `
                <div class="email-preview">
                    <div class="preview-subject">
                        <strong>Subject:</strong> ${Utils.escapeHtml(subjectContent)}
                    </div>
                    <div class="preview-body">
                        <iframe srcdoc="${escapedBody}"
                                sandbox="allow-same-origin"
                                style="width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 4px;">
                        </iframe>
                    </div>
                    <div class="preview-note">
                        <i class="fas fa-info-circle"></i>
                        ${previewNote}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading preview:', error);
            Utils.showToast('Error', 'Failed to load template preview', 'error');
        }
    },

    /**
     * Show full preview modal
     */
    showFullPreview() {
        const modal = document.getElementById('template-preview-modal');
        const previewDiv = document.getElementById('full-template-preview');

        const currentPreview = document.querySelector('#email-preview-container .email-preview');
        if (currentPreview) {
            previewDiv.innerHTML = currentPreview.innerHTML;
            modal.style.display = 'flex';
        }
    },

    closePreviewModal() {
        document.getElementById('template-preview-modal').style.display = 'none';
    },

    /**
     * Search users
     * @param {string} query - Search query
     * @param {string} field - Target field: 'to', 'cc', or 'bcc'
     */
    async searchUsers(query, field = 'to') {
        console.log('searchUsers called:', query, field);
        if (!query || query.length < 2) {
            this.hideSuggestions(field);
            return;
        }

        try {
            console.log('Making API request for:', query);
            const response = await API.request(`/email/send/search-users?query=${encodeURIComponent(query)}&limit=10`, { method: 'GET' });
            console.log('API response:', response);
            this.showSuggestions(response.data, field);
        } catch (error) {
            console.error('Error searching users:', error);
        }
    },

    /**
     * Show user suggestions
     * @param {Array} users - List of users
     * @param {string} field - Target field: 'to', 'cc', or 'bcc'
     */
    showSuggestions(users, field = 'to') {
        console.log('showSuggestions called with', users.length, 'users for field:', field);
        const suggestionsId = field === 'to' ? 'recipient-suggestions' :
                             field === 'cc' ? 'cc-suggestions' :
                             'bcc-suggestions';
        const inputId = field === 'to' ? 'recipients-input' :
                       field === 'cc' ? 'cc-input' :
                       'bcc-input';

        console.log('Looking for element:', suggestionsId);
        const suggestionsDiv = document.getElementById(suggestionsId);
        console.log('Found element:', suggestionsDiv);

        if (users.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        suggestionsDiv.innerHTML = users.map(user => `
            <div class="suggestion-item"
                 data-user='${JSON.stringify(user).replace(/'/g, "&apos;")}'
                 data-field="${field}">
                <i class="fas fa-user${user.is_admin ? '-shield' : ''}"></i>
                <span class="suggestion-name">${Utils.escapeHtml(user.name)}${user.is_admin ? ' <span class="admin-badge">Admin</span>' : ''}</span>
                <span class="suggestion-email">${Utils.escapeHtml(user.email || user.plex_email || '')}</span>
            </div>
        `).join('');

        suggestionsDiv.style.display = 'block';

        // Add click listeners
        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const userData = JSON.parse(item.dataset.user);
                const targetField = item.dataset.field;

                if (targetField === 'to') {
                    this.addRecipient(userData);
                } else if (targetField === 'cc') {
                    this.addCCUser(userData);
                } else if (targetField === 'bcc') {
                    this.addBCCUser(userData);
                }

                document.getElementById(inputId).value = '';
                this.hideSuggestions(targetField);
            });
        });
    },

    /**
     * Hide user suggestions
     * @param {string} field - Target field: 'to', 'cc', or 'bcc'
     */
    hideSuggestions(field = 'all') {
        const fields = field === 'all' ? ['recipient-suggestions', 'cc-suggestions', 'bcc-suggestions'] :
                      [field === 'to' ? 'recipient-suggestions' :
                       field === 'cc' ? 'cc-suggestions' :
                       'bcc-suggestions'];

        fields.forEach(id => {
            const suggestionsDiv = document.getElementById(id);
            if (suggestionsDiv) {
                suggestionsDiv.style.display = 'none';
            }
        });
    },

    /**
     * Add recipient
     */
    async addRecipient(user) {
        // In normal mode, only allow one recipient
        if (this.sendMode === 'normal') {
            this.recipients = [user];
            this.selectedToUser = user;
        } else {
            // Bulk mode - check if already added
            if (this.recipients.find(r => r.id === user.id)) {
                Utils.showToast('Warning', 'Recipient already added', 'warning');
                return;
            }
            this.recipients.push(user);
        }

        this.renderRecipients();
        this.updateSendButton();

        // Update preview with new recipient's data if a template is selected
        if (this.selectedTemplate) {
            await this.loadPreview();
        }
    },

    /**
     * Add manual recipient
     */
    addManualRecipient() {
        const input = document.getElementById('recipients-input');
        const email = input.value.trim();

        if (!email) return;

        if (!this.isValidEmail(email)) {
            Utils.showToast('Error', 'Please enter a valid email address', 'error');
            return;
        }

        // Check if already added
        if (this.recipients.find(r => r.email === email)) {
            Utils.showToast('Warning', 'Recipient already added', 'warning');
            return;
        }

        this.recipients.push({
            id: null,
            email: email,
            name: email
        });

        input.value = '';
        this.renderRecipients();
        this.updateSendButton();
    },

    /**
     * Render recipients
     */
    renderRecipients() {
        const container = document.getElementById('selected-recipients');

        if (this.recipients.length === 0) {
            container.innerHTML = '<div class="no-recipients">No recipients added</div>';
        } else {
            container.innerHTML = this.recipients.map((recipient, index) => `
                <div class="recipient-chip">
                    <i class="fas fa-user"></i>
                    <span>${Utils.escapeHtml(recipient.name)}</span>
                    ${recipient.email !== recipient.name ? `<small>${Utils.escapeHtml(recipient.email)}</small>` : ''}
                    <button class="chip-remove" onclick="EmailComposer.removeRecipient(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }

        document.getElementById('to-count').textContent = `(${this.recipients.length})`;
    },

    /**
     * Remove recipient
     */
    async removeRecipient(index) {
        this.recipients.splice(index, 1);
        this.renderRecipients();
        this.updateSendButton();

        // Update preview - will show next recipient's data or fall back to sample data
        if (this.selectedTemplate) {
            await this.loadPreview();
        }
    },

    /**
     * Add CC from user selection
     */
    addCCUser(user) {
        const email = user.email;
        if (!this.ccRecipients.some(r => (typeof r === 'string' ? r : r.email) === email)) {
            this.ccRecipients.push({
                email: email,
                name: user.name || user.username,
                type: 'user'
            });
            this.renderCC();
        }
    },

    /**
     * Add CC from manual entry
     */
    addCC() {
        const input = document.getElementById('cc-input');
        const emails = input.value.split(',').map(e => e.trim()).filter(e => e);

        emails.forEach(email => {
            if (this.isValidEmail(email) && !this.ccRecipients.some(r => (typeof r === 'string' ? r : r.email) === email)) {
                this.ccRecipients.push(email);
            }
        });

        input.value = '';
        this.renderCC();
    },

    renderCC() {
        const container = document.getElementById('selected-cc');

        if (this.ccRecipients.length === 0) {
            container.innerHTML = '';
        } else {
            container.innerHTML = this.ccRecipients.map((item, index) => {
                const display = typeof item === 'string' ? item : (item.name || item.email);
                // Use owner icon for owner-email type, envelope for others
                const icon = (item && item.type === 'owner-email') ? 'fa-user-tie' : 'fa-envelope';
                return `
                    <div class="recipient-chip">
                        <i class="fas ${icon}"></i>
                        <span>${Utils.escapeHtml(display)}</span>
                        <button class="chip-remove" onclick="EmailComposer.removeCC(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('cc-count').textContent = `(${this.ccRecipients.length})`;
    },

    removeCC(index) {
        this.ccRecipients.splice(index, 1);
        this.renderCC();
    },

    /**
     * Add BCC from user selection
     */
    addBCCUser(user) {
        const email = user.email;
        if (!this.bccRecipients.some(r => (typeof r === 'string' ? r : r.email) === email)) {
            this.bccRecipients.push({
                email: email,
                name: user.name || user.username,
                type: 'user'
            });
            this.renderBCC();
            this.updateSendButton();
        }
    },

    /**
     * Add BCC from manual entry
     */
    addBCC() {
        const input = document.getElementById('bcc-input');
        const emails = input.value.split(',').map(e => e.trim()).filter(e => e);

        emails.forEach(email => {
            if (this.isValidEmail(email) && !this.bccRecipients.some(r => (typeof r === 'string' ? r : r.email) === email)) {
                this.bccRecipients.push(email);
            }
        });

        input.value = '';
        this.renderBCC();
        this.updateSendButton();
    },

    renderBCC() {
        const container = document.getElementById('selected-bcc');

        if (this.bccRecipients.length === 0) {
            container.innerHTML = '';
        } else {
            container.innerHTML = this.bccRecipients.map((item, index) => {
                let icon, display, chipClass = '';

                if (typeof item === 'string') {
                    // Plain email string
                    icon = 'fa-envelope';
                    display = item;
                } else if (item.type === 'tag') {
                    // Tag with user count
                    icon = 'fa-tag';
                    chipClass = 'tag-chip';
                    display = `${item.name} <span class="chip-count">${item.userCount} user${item.userCount !== 1 ? 's' : ''}</span>`;
                } else if (item.type === 'owner') {
                    // Owner - will BCC all their subscribers (bulk mode)
                    icon = 'fa-user-tie';
                    chipClass = 'owner-chip';
                    const userCount = item.userCount || 0;
                    display = `${item.name} <span class="chip-count">${userCount} user${userCount !== 1 ? 's' : ''}</span>`;
                } else if (item.type === 'owner-email') {
                    // Owner email only - single email, not bulk (normal mode)
                    icon = 'fa-user-tie';
                    display = Utils.escapeHtml(item.name || item.email);
                } else if (item.type === 'user-bulk') {
                    // User from "Add by Owner" (old, shouldn't happen anymore)
                    icon = 'fa-user-tie';
                    display = Utils.escapeHtml(item.name || item.email);
                } else {
                    // User from typeahead
                    icon = 'fa-user';
                    display = Utils.escapeHtml(item.name || item.email);
                }

                return `
                    <div class="recipient-chip ${chipClass}">
                        <i class="fas ${icon}"></i>
                        <span>${item.type === 'tag' || item.type === 'owner' ? display : Utils.escapeHtml(display)}</span>
                        <button class="chip-remove" onclick="EmailComposer.removeBCC(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('bcc-count').textContent = `(${this.bccRecipients.length})`;
    },

    removeBCC(index) {
        this.bccRecipients.splice(index, 1);
        this.renderBCC();
    },

    /**
     * Show tag modal - displays all tags with user counts like the owner modal
     */
    async showTagModal(targetField) {
        this.tagTargetField = targetField;

        // Load tags if not already loaded
        if (!this.availableTags || this.availableTags.length === 0) {
            await this.loadTags();
        }

        if (!this.availableTags || this.availableTags.length === 0) {
            Utils.showToast('Info', 'No tags found', 'info');
            return;
        }

        // Fetch user counts for each tag
        const tagCounts = await Promise.all(
            this.availableTags.map(async (tag) => {
                try {
                    const response = await API.request(`/email/send/users-by-tag/${encodeURIComponent(tag.name)}`, { method: 'GET' });
                    return {
                        ...tag,
                        userCount: response.count || (response.data ? response.data.length : 0),
                        users: response.data || []
                    };
                } catch (err) {
                    console.warn(`Failed to get count for tag ${tag.name}:`, err);
                    return { ...tag, userCount: 0, users: [] };
                }
            })
        );

        // Store tag data for later use
        this.tagData = tagCounts;

        const modalContent = `
            <div class="tag-selector">
                <p>Select tags to ${targetField === 'bcc' ? 'BCC' : 'add'} all users with those tags:</p>
                <div class="tag-list" style="max-height: 300px; overflow-y: auto;">
                    ${tagCounts.map(tag => `
                        <label class="tag-item" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer;">
                            <input type="checkbox" value="${Utils.escapeHtml(tag.name)}"
                                data-name="${Utils.escapeHtml(tag.name)}"
                                data-count="${tag.userCount}"
                                data-users='${JSON.stringify(tag.users).replace(/'/g, "&apos;")}'>
                            <span style="margin-left: 10px;">${Utils.escapeHtml(tag.name)}</span>
                            <span class="tag-user-count" style="margin-left: auto; background: var(--primary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85em;">${tag.userCount} user${tag.userCount !== 1 ? 's' : ''}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;

        Utils.showModal({
            title: `Select Tags for ${targetField === 'bcc' ? 'BCC' : 'Recipients'}`,
            content: modalContent,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-secondary',
                    onclick: () => Utils.closeModal()
                },
                {
                    text: targetField === 'bcc' ? 'Add to BCC' : 'Add Selected Tags',
                    class: 'btn-primary',
                    onclick: () => {
                        this.addSelectedTags(targetField);
                        Utils.closeModal();
                    }
                }
            ]
        });
    },

    /**
     * Add selected tags from the modal
     */
    addSelectedTags(targetField) {
        const checkboxes = document.querySelectorAll('.tag-item input:checked');

        checkboxes.forEach(cb => {
            const tagName = cb.value;
            const userCount = parseInt(cb.dataset.count) || 0;
            let users = [];
            try {
                users = JSON.parse(cb.dataset.users);
            } catch (e) {
                console.warn('Failed to parse users data');
            }

            if (targetField === 'to') {
                users.forEach(user => {
                    if (!this.recipients.find(r => r.id === user.id)) {
                        this.recipients.push(user);
                    }
                });
            } else if (targetField === 'bcc') {
                if (!this.bccRecipients.some(r => r.type === 'tag' && r.name === tagName)) {
                    this.bccRecipients.push({
                        type: 'tag',
                        name: tagName,
                        users: users,
                        userCount: userCount
                    });
                }
            }
        });

        if (targetField === 'to') {
            this.renderRecipients();
        } else if (targetField === 'bcc') {
            this.renderBCC();
        }

        this.updateSendButton();
        Utils.showToast('Success', 'Tags added successfully', 'success');
    },

    closeTagModal() {
        // Legacy function - now using Utils.closeModal()
        Utils.closeModal();
    },

    /**
     * Preview users for selected tag (legacy - kept for compatibility)
     */
    async previewTagUsers(tagName) {
        try {
            const response = await API.request(`/email/send/users-by-tag/${encodeURIComponent(tagName)}`, { method: 'GET' });
            this.tagUsers = response.data;
        } catch (error) {
            console.error('Error loading tag users:', error);
        }
    },

    /**
     * Add users by tag (legacy - kept for compatibility)
     */
    addByTag() {
        // This is now handled by addSelectedTags
        const tagName = document.getElementById('tag-select')?.value;
        if (!tagName || !this.tagUsers) return;

        if (this.tagTargetField === 'to') {
            this.tagUsers.forEach(user => {
                if (!this.recipients.find(r => r.id === user.id)) {
                    this.recipients.push(user);
                }
            });
            this.renderRecipients();
        } else if (this.tagTargetField === 'bcc') {
            const userCount = this.tagUsers.length;
            if (!this.bccRecipients.some(r => r.type === 'tag' && r.name === tagName)) {
                this.bccRecipients.push({
                    type: 'tag',
                    name: tagName,
                    userCount: userCount,
                    users: this.tagUsers // Store user list for backend processing
                });
            }
            this.renderBCC();
        }

        Utils.showToast('Success', `Added tag "${tagName}" (${this.tagUsers.length} user${this.tagUsers.length !== 1 ? 's' : ''})`, 'success');
        this.closeTagModal();
        this.updateSendButton();
    },

    /**
     * Send email
     */
    async sendEmail() {
        // Check recipients based on mode
        const hasRecipients = this.sendMode === 'bulk'
            ? this.bccRecipients.length > 0
            : this.recipients.length > 0;

        if (!hasRecipients) {
            Utils.showToast('Error', 'Please add at least one recipient', 'error');
            return;
        }

        // Collect any unsaved CC/BCC emails from input fields
        const ccInput = document.getElementById('cc-input');
        if (ccInput && ccInput.value.trim()) {
            this.addCC();
        }

        const bccInput = document.getElementById('bcc-input');
        if (bccInput && bccInput.value.trim()) {
            this.addBCC();
        }

        // Get custom subject and body from form
        const customSubject = document.getElementById('manual-email-subject')?.value.trim() || null;
        const customBody = document.getElementById('manual-email-body')?.value.trim() || null;

        // Check if we have either template or custom body
        if (!this.selectedTemplate && !customBody) {
            Utils.showToast('Error', 'Please select a template or enter a custom email body', 'error');
            return;
        }

        const sendMode = document.querySelector('input[name="send-mode"]:checked').value;

        // Calculate recipient count based on mode
        let recipientCount = 0;
        if (sendMode === 'bulk') {
            // In bulk mode, count BCC recipients (from tags/owners)
            this.bccRecipients.forEach(item => {
                if (item.type === 'tag' && item.users) {
                    recipientCount += item.users.length;
                } else if (item.type === 'owner' && item.users) {
                    recipientCount += item.users.length;
                } else {
                    recipientCount += 1;
                }
            });
        } else {
            recipientCount = this.recipients.length;
        }

        const confirmed = confirm(
            `Send email to ${recipientCount} recipient(s) in ${sendMode} mode?\n\n` +
            `This will send emails immediately.`
        );

        if (!confirmed) return;

        try {
            Utils.showLoading();

            let response;

            // NO TEMPLATE: Send custom subject and body as the entire email
            if (!this.selectedTemplate && customBody) {
                const emails = this.recipients.map(r => r.email);
                const ccEmails = this.ccRecipients.map(r => typeof r === 'string' ? r : r.email).join(',') || null;
                const bccEmails = this.bccRecipients.map(r => typeof r === 'string' ? r : r.email).join(',') || null;

                response = await API.request('/email/send/custom', {
                    method: 'POST',
                    body: {
                        to: emails.join(','),
                        cc: ccEmails,
                        bcc: bccEmails,
                        subject: customSubject || 'Message from StreamPanel',
                        body: customBody.replace(/\n/g, '<br>')
                    }
                });

                Utils.showToast('Success', 'Custom email sent successfully!', 'success');

            // TEMPLATE: Use template (ignore custom body)
            } else if (this.selectedTemplate) {
                if (sendMode === 'bulk') {
                    // Send as bulk - ONE email with TO field + BCC all tag/owner users
                    // Get the TO email from bulk-to-email input
                    const bulkToEmail = document.getElementById('bulk-to-email')?.value.trim();

                    if (!bulkToEmail) {
                        Utils.showToast('Error', 'Please enter a "To" email address for bulk send', 'error');
                        Utils.hideLoading();
                        return;
                    }

                    // Collect all BCC email addresses from tags, owners, and individual emails
                    const bccEmails = [];
                    this.bccRecipients.forEach(item => {
                        if (item.type === 'tag' && item.users) {
                            // Extract emails from tag users (use email or plex_email)
                            item.users.forEach(user => {
                                const userEmail = user.email || user.plex_email;
                                if (userEmail) bccEmails.push(userEmail);
                            });
                        } else if (item.type === 'owner' && item.users) {
                            // Extract emails from owner's subscribers (use email or plex_email)
                            item.users.forEach(user => {
                                const userEmail = user.email || user.plex_email;
                                if (userEmail) bccEmails.push(userEmail);
                            });
                        } else if (typeof item === 'string') {
                            // Plain email string
                            bccEmails.push(item);
                        } else if (item.email || item.plex_email) {
                            // User object with email
                            bccEmails.push(item.email || item.plex_email);
                        }
                    });

                    const ccEmails = this.ccRecipients.map(r => typeof r === 'string' ? r : (r.email || r.plex_email)).filter(e => e).join(',') || null;

                    // Send ONE email with TO + BCC
                    response = await API.request('/email/send/bulk', {
                        method: 'POST',
                        body: {
                            to: bulkToEmail,
                            recipients: bccEmails, // These will be BCC'd
                            templateId: this.selectedTemplate.id,
                            cc: ccEmails
                        }
                    });

                    Utils.showToast('Success', `Bulk email sent to ${bulkToEmail} with ${bccEmails.length} BCC recipient(s)!`, 'success');

                } else {
                    // Send individually
                    const userIds = this.recipients.filter(r => r.id).map(r => r.id);
                    const ccEmails = this.ccRecipients.map(r => typeof r === 'string' ? r : (r.email || r.plex_email)).filter(e => e).join(',') || null;
                    const bccEmails = this.bccRecipients.map(r => typeof r === 'string' ? r : (r.email || r.plex_email)).filter(e => e).join(',') || null;
                    response = await API.request('/email/send/users', {
                        method: 'POST',
                        body: {
                            userIds: userIds,
                            templateId: this.selectedTemplate.id,
                            cc: ccEmails,
                            bcc: bccEmails
                        }
                    });

                    Utils.showToast(
                        response.failed > 0 ? 'Warning' : 'Success',
                        `Sent: ${response.sent}, Failed: ${response.failed}`,
                        response.failed > 0 ? 'warning' : 'success'
                    );
                }
            }

            Utils.hideLoading();

            // Reset form
            this.resetForm();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error sending email:', error);
            Utils.showToast('Error', error.message || 'Failed to send email', 'error');
        }
    },

    /**
     * Reset form
     */
    resetForm() {
        this.recipients = [];
        this.ccRecipients = [];
        this.bccRecipients = [];
        this.selectedTemplate = null;

        document.getElementById('template-select').value = '';
        document.getElementById('recipients-input').value = '';
        document.getElementById('cc-input').value = '';
        document.getElementById('bcc-input').value = '';

        // Clear manual email subject
        const manualSubject = document.getElementById('manual-email-subject');
        if (manualSubject) {
            manualSubject.value = '';
        }

        // Clear manual email body
        const manualBody = document.getElementById('manual-email-body');
        if (manualBody) {
            manualBody.value = '';
            this.autoExpandTextarea(manualBody);
        }

        this.renderRecipients();
        this.renderCC();
        this.renderBCC();
        this.onTemplateChange('');
    },

    /**
     * Update send button state
     */
    updateSendButton() {
        const sendBtn = document.getElementById('send-email-btn');
        const customBody = document.getElementById('manual-email-body')?.value.trim() || '';

        // Can send if we have recipients AND (template OR custom body)
        // In bulk mode, check BCC recipients; in normal mode, check recipients
        const hasRecipients = this.sendMode === 'bulk'
            ? this.bccRecipients.length > 0
            : this.recipients.length > 0;

        const canSend = hasRecipients && (this.selectedTemplate || customBody);
        sendBtn.disabled = !canSend;
    },

    /**
     * Check if a user was preselected from another page
     * Checks both URL params (for new tab/direct link) and sessionStorage (legacy)
     */
    async checkPreselectedUser() {
        try {
            // First check URL params (works with new tabs)
            let preselectedUserId = null;

            if (this.urlParams && this.urlParams.length > 0 && this.urlParams[0]) {
                preselectedUserId = this.urlParams[0];
            }

            // Fallback to sessionStorage (legacy, same-tab navigation)
            if (!preselectedUserId) {
                preselectedUserId = sessionStorage.getItem('emailPreselectedUserId');
                if (preselectedUserId) {
                    sessionStorage.removeItem('emailPreselectedUserId');
                }
            }

            if (preselectedUserId) {
                // Fetch user data
                const response = await API.request(`/users/${preselectedUserId}`, { method: 'GET' });

                if (response.success && response.user) {
                    // Add the user to recipients
                    await this.addRecipient(response.user);
                    Utils.showToast('Info', `User ${response.user.name} preselected`, 'info');
                }
            }
        } catch (error) {
            console.error('Error loading preselected user:', error);
            // Don't show error toast - this is a nice-to-have feature
        }
    },

    /**
     * Validate email
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
};

// Helper: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
