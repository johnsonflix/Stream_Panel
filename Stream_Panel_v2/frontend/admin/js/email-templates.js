/**
 * Email Templates Management
 * For use in Settings page
 */

const EmailTemplates = {
    templates: [],
    currentTemplate: null,
    variables: {},
    helpers: {},
    owners: [],

    /**
     * Render templates section
     */
    async render(container) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h2><i class="fas fa-file-alt"></i> Email Templates</h2>
                    <button class="btn btn-primary" onclick="EmailTemplates.showCreateModal()">
                        <i class="fas fa-plus"></i> Create Template
                    </button>
                </div>

                <div class="templates-grid" id="templates-list">
                    <div class="loading-spinner">Loading templates...</div>
                </div>
            </div>
        `;

        await this.loadTemplates();
        await this.loadMetadata();
    },

    /**
     * Load templates
     */
    async loadTemplates() {
        try {
            const response = await API.request('/email-templates', { method: 'GET' });
            this.templates = response.templates || response.data || [];
            this.renderTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
            Utils.showToast('Error', 'Failed to load templates', 'error');
        }
    },

    /**
     * Load metadata (variables and helpers)
     */
    async loadMetadata() {
        try {
            const [varsResp, helpersResp] = await Promise.all([
                API.request('/email-templates/meta/variables', { method: 'GET' }),
                API.request('/email-templates/meta/helpers', { method: 'GET' })
            ]);
            this.variables = varsResp.data;
            this.helpers = helpersResp.data;
        } catch (error) {
            console.error('Error loading metadata:', error);
        }
    },

    /**
     * Render templates list
     */
    renderTemplates() {
        const container = document.getElementById('templates-list');

        if (this.templates.length === 0) {
            container.innerHTML = '<p class="text-muted">No templates found. Create your first template to get started.</p>';
            return;
        }

        // Group by category
        const grouped = {};
        this.templates.forEach(t => {
            const cat = t.category || 'custom';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(t);
        });

        container.innerHTML = Object.entries(grouped).map(([category, templates]) => `
            <div class="template-category">
                <h3 class="category-title">${this.getCategoryLabel(category)}</h3>
                <div class="template-cards">
                    ${templates.map(t => this.renderTemplateCard(t)).join('')}
                </div>
            </div>
        `).join('');
    },

    /**
     * Render single template card
     */
    renderTemplateCard(template) {
        const ownerName = template.owner_name || (template.owner_id ? `User ${template.owner_id}` : 'ALL');
        const ownerBadge = template.owner_id
            ? `<span class="badge badge-secondary"><i class="fas fa-user"></i> ${Utils.escapeHtml(ownerName)}</span>`
            : '<span class="badge badge-primary"><i class="fas fa-globe"></i> Global</span>';

        return `
            <div class="template-card ${template.is_system ? 'system-template' : ''}">
                <div class="template-header">
                    <h4>${Utils.escapeHtml(template.name)}</h4>
                    <div style="display: flex; gap: 0.5rem;">
                        ${template.is_system ? '<span class="badge badge-info">System</span>' : ''}
                        ${ownerBadge}
                    </div>
                </div>
                <div class="template-body">
                    <p class="template-subject"><strong>Subject:</strong> ${Utils.escapeHtml(template.subject)}</p>
                    <p class="template-type"><small><i class="fas fa-folder"></i> ${this.getCategoryLabel(template.category)}</small></p>
                </div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-secondary" onclick="EmailTemplates.previewTemplate(${template.id})">
                        <i class="fas fa-eye"></i> Preview
                    </button>
                    ${!template.is_system ? `
                        <button class="btn btn-sm btn-primary" onclick="EmailTemplates.editTemplate(${template.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="EmailTemplates.duplicateTemplate(${template.id})">
                            <i class="fas fa-copy"></i> Duplicate
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="EmailTemplates.deleteTemplate(${template.id})">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Show create template modal
     */
    showCreateModal() {
        this.currentTemplate = null;
        this.showEditorModal();
    },

    /**
     * Edit template
     */
    async editTemplate(id) {
        try {
            const response = await API.request(`/email-templates/${id}`, { method: 'GET' });
            // Handle different API response structures
            this.currentTemplate = response.template || response.data || response;

            // Validate we got a valid template object
            if (!this.currentTemplate || !this.currentTemplate.name) {
                throw new Error('Invalid template data received');
            }

            this.showEditorModal();
        } catch (error) {
            console.error('Error loading template:', error);
            Utils.showToast('Error', 'Failed to load template', 'error');
        }
    },

    /**
     * Show editor modal
     */
    showEditorModal() {
        const isEdit = this.currentTemplate !== null;

        Utils.showModal({
            title: isEdit ? 'Edit Template' : 'Create Template',
            size: 'email-editor',
            content: `
                <div class="template-editor">
                    <div class="editor-main">
                        <div class="form-group">
                            <label>Template Name *</label>
                            <input type="text" id="template-name" class="form-control"
                                   value="${isEdit ? Utils.escapeHtml(this.currentTemplate.name) : ''}"
                                   placeholder="e.g., Welcome Email">
                        </div>

                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label>Category</label>
                                <select id="template-category" class="form-control">
                                    <option value="welcome">Welcome</option>
                                    <option value="renewal">Renewal</option>
                                    <option value="bulk">Bulk</option>
                                    <option value="announcement">Announcement</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            <div class="form-group col-md-6">
                                <label>Owner</label>
                                <select id="template-owner" class="form-control">
                                    <option value="">ALL (Global Template)</option>
                                    <!-- Will be populated with owners -->
                                </select>
                                <small class="form-text text-muted">Choose "ALL" for global templates or select a specific owner</small>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Subject *</label>
                            <input type="text" id="template-subject" class="form-control"
                                   value="${isEdit ? Utils.escapeHtml(this.currentTemplate.subject) : ''}"
                                   placeholder="e.g., Welcome to {{app.name}}!">
                            <small class="form-text text-muted">You can use variables like {{app.name}}, {{user.name}}, etc.</small>
                        </div>

                        <div class="form-group">
                            <label>Body (HTML) *</label>
                            <div class="template-body-editor">
                                <div class="editor-container">
                                    <textarea id="template-body" class="form-control code-editor" rows="12">${isEdit ? Utils.escapeHtml(this.currentTemplate.body) : ''}</textarea>
                                    <small class="form-text text-muted">Use Handlebars syntax. Click variables on the right to insert them.</small>
                                </div>
                                <div class="variables-sidebar">
                                    <div class="variables-header">
                                        <strong>Quick Insert</strong>
                                        <small>Click to insert</small>
                                    </div>
                                    <div id="quick-variables-list" class="quick-variables-list">
                                        <div class="loading-spinner">Loading...</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="preview-custom-message">
                                <i class="fas fa-comment-alt"></i> Custom Message (For Preview Testing)
                            </label>
                            <textarea
                                id="preview-custom-message"
                                class="form-control"
                                rows="2"
                                placeholder="Type a test custom message to see how {{custom_message}} appears in the preview..."
                            ></textarea>
                            <small class="form-text text-muted">
                                Use this to test how {{custom_message}} will look in your template. This is only for preview - actual messages come from the email composer.
                            </small>
                        </div>

                        <div class="form-group">
                            <label>
                                Live Preview
                                <small class="text-muted">(Variables will show as placeholders)</small>
                            </label>
                            <div id="template-live-preview" class="template-live-preview">
                                <div class="preview-placeholder">
                                    <i class="fas fa-eye fa-3x"></i>
                                    <p>HTML preview will appear here as you type</p>
                                </div>
                            </div>
                        </div>

                        <div class="editor-actions">
                            <button class="btn btn-secondary" onclick="EmailTemplates.showVariableReference()">
                                <i class="fas fa-book"></i> Variable Reference
                            </button>
                            <button class="btn btn-primary" onclick="EmailTemplates.previewCurrentTemplate()">
                                <i class="fas fa-eye"></i> Full Preview
                            </button>
                        </div>
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-secondary',
                    onclick: () => Utils.closeModal()
                },
                {
                    text: isEdit ? 'Update Template' : 'Create Template',
                    class: 'btn-primary',
                    onclick: () => this.saveTemplate()
                }
            ]
        });

        // Set values if editing (wait for modal DOM to be ready)
        setTimeout(async () => {
            // Load owners into dropdown
            await this.loadOwners();

            if (isEdit) {
                const categoryEl = document.getElementById('template-category');
                const ownerEl = document.getElementById('template-owner');
                const customMessageEl = document.getElementById('preview-custom-message');
                if (categoryEl) categoryEl.value = this.currentTemplate.category;
                if (ownerEl) ownerEl.value = this.currentTemplate.owner_id || '';
                if (customMessageEl) customMessageEl.value = this.currentTemplate.custom_message || '';
            }

            // Setup live preview
            this.setupLivePreview();
        }, 50);
    },

    /**
     * Load owners/app users for template assignment
     */
    async loadOwners() {
        try {
            const response = await API.getAppUsers();
            this.owners = response.users || response.app_users || [];

            const ownerSelect = document.getElementById('template-owner');
            if (!ownerSelect) return;

            // Add owner options (skip the first option which is "ALL")
            this.owners.forEach(owner => {
                const option = document.createElement('option');
                option.value = owner.id;
                option.textContent = owner.name || `Owner ${owner.id}`;
                ownerSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading owners:', error);
        }
    },

    /**
     * Setup live preview for template body
     */
    setupLivePreview() {
        const bodyTextarea = document.getElementById('template-body');
        const previewContainer = document.getElementById('template-live-preview');
        const customMessageTextarea = document.getElementById('preview-custom-message');

        if (!bodyTextarea || !previewContainer) return;

        // Update preview function with debounce
        const updatePreview = Utils.debounce(() => {
            let html = bodyTextarea.value.trim();

            if (!html) {
                previewContainer.innerHTML = `
                    <div class="preview-placeholder">
                        <i class="fas fa-eye fa-3x"></i>
                        <p>HTML preview will appear here as you type</p>
                    </div>
                `;
                return;
            }

            // Get custom message value
            const customMessage = customMessageTextarea ? customMessageTextarea.value.trim() : '';

            // Process {{#if variable}}...{{/if}} conditional blocks
            // Handle {{#if custom_message}}...{{/if}} - remove block if empty, show content if has value
            html = html.replace(/\{\{#if\s+custom_message\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
                if (customMessage && customMessage.length > 0) {
                    return content; // Show the content inside the block
                }
                return ''; // Remove the entire block if no custom message
            });

            // For portal_url - show content (we assume portal_url will be set in production)
            html = html.replace(/\{\{#if\s+portal_url\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
                return content; // Always show portal section in preview
            });

            // For any other conditionals - show the content (assume they'll have values)
            html = html.replace(/\{\{#if\s+\w+\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
                return content;
            });

            // Replace {{custom_message}} with the actual value
            html = html.replace(/\{\{custom_message\}\}/g, customMessage);

            // Create iframe for safe HTML rendering
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-same-origin';
            iframe.style.cssText = 'width: 100%; min-height: 400px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; background: white;';

            previewContainer.innerHTML = '';
            previewContainer.appendChild(iframe);

            // Set iframe content
            iframe.srcdoc = html;
        }, 500);

        // Initial preview if editing
        if (bodyTextarea.value.trim()) {
            updatePreview();
        }

        // Listen for changes on body textarea
        bodyTextarea.addEventListener('input', updatePreview);
        bodyTextarea.addEventListener('change', updatePreview);

        // Listen for changes on custom message textarea
        if (customMessageTextarea) {
            customMessageTextarea.addEventListener('input', updatePreview);
            customMessageTextarea.addEventListener('change', updatePreview);
        }

        // Load quick variables
        this.loadQuickVariables();
    },

    /**
     * Load quick insert variables
     */
    loadQuickVariables() {
        const container = document.getElementById('quick-variables-list');
        if (!container) return;

        // Common variables organized by category
        const quickVars = [
            { category: 'Custom', vars: ['{{custom_message}}'] },
            { category: 'User', vars: ['{{user.name}}', '{{user.email}}'] },
            { category: 'App', vars: ['{{app.name}}', '{{app.support_email}}', '{{app.company_name}}'] },
            { category: 'Plex', vars: ['{{plex.email}}', '{{plex.server_name}}', '{{plex.subscription_type}}', '{{formatDate plex.expiration "long"}}'] },
            { category: 'IPTV', vars: ['{{iptv.username}}', '{{iptv.password}}', '{{iptv.panel_name}}', '{{iptv.subscription_type}}', '{{formatDate iptv.expiration "long"}}'] },
            { category: 'Helpers', vars: ['{{formatDate date "long"}}', '{{formatCurrency amount}}', '{{pluralize count "item" "items"}}'] }
        ];

        container.innerHTML = quickVars.map(group => `
            <div class="var-group">
                <div class="var-group-title">${group.category}</div>
                ${group.vars.map(v => `
                    <div class="var-item" onclick="EmailTemplates.insertVariable('${v.replace(/'/g, "\\'")}')">
                        <code>${Utils.escapeHtml(v)}</code>
                        <i class="fas fa-plus-circle"></i>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },

    /**
     * Insert variable at cursor position
     */
    insertVariable(variable) {
        const textarea = document.getElementById('template-body');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        // Insert variable at cursor position
        textarea.value = text.substring(0, start) + variable + text.substring(end);

        // Move cursor after inserted variable
        const newPos = start + variable.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();

        // Trigger change event to update preview
        textarea.dispatchEvent(new Event('input'));
    },

    /**
     * Save template
     */
    async saveTemplate() {
        const name = document.getElementById('template-name').value.trim();
        const category = document.getElementById('template-category').value;
        const owner_id = document.getElementById('template-owner').value || null;
        const subject = document.getElementById('template-subject').value.trim();
        const body = document.getElementById('template-body').value.trim();
        const custom_message = document.getElementById('preview-custom-message')?.value.trim() || '';

        if (!name || !subject || !body) {
            Utils.showToast('Error', 'Please fill in all required fields', 'error');
            return;
        }

        try {
            Utils.showLoading();

            if (this.currentTemplate) {
                // Update
                await API.request(`/email-templates/${this.currentTemplate.id}`, {
                    method: 'PUT',
                    body: { name, category, owner_id, subject, body, custom_message }
                });
                Utils.showToast('Success', 'Template updated successfully', 'success');
            } else {
                // Create
                await API.request('/email-templates', {
                    method: 'POST',
                    body: { name, category, owner_id, subject, body, custom_message }
                });
                Utils.showToast('Success', 'Template created successfully', 'success');
            }

            Utils.closeModal();
            await this.loadTemplates();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving template:', error);
            Utils.showToast('Error', error.message || 'Failed to save template', 'error');
        }
    },

    /**
     * Preview template
     */
    async previewTemplate(id) {
        try {
            Utils.showLoading();

            const response = await API.request(`/email-templates/${id}/preview`, {
                method: 'POST',
                body: {}
            });

            Utils.hideLoading();

            const previewData = response.preview || response.data || response;

            // Validate preview data
            if (!previewData || !previewData.subject) {
                throw new Error('Invalid preview data received');
            }

            Utils.showModal({
                title: 'Template Preview',
                size: 'email-preview',
                content: `
                    <div class="email-preview">
                        <div class="preview-subject">
                            <strong>Subject:</strong> ${Utils.escapeHtml(previewData.subject)}
                        </div>
                        <div class="preview-body" id="preview-iframe-container">
                        </div>
                        <div class="preview-note">
                            <i class="fas fa-info-circle"></i>
                            This preview uses sample data. Actual emails will use real recipient data.
                        </div>
                    </div>
                `,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-secondary',
                        onclick: () => Utils.closeModal()
                    }
                ]
            });

            // Create iframe after modal is shown
            setTimeout(() => {
                const container = document.getElementById('preview-iframe-container');
                if (container) {
                    const iframe = document.createElement('iframe');
                    iframe.sandbox = 'allow-same-origin';
                    iframe.style.cssText = 'width: 100%; height: 70vh; min-height: 400px; max-height: 600px; border: 1px solid #ddd; border-radius: 4px; background: white;';
                    iframe.srcdoc = previewData.body;
                    container.appendChild(iframe);
                }
            }, 0);

        } catch (error) {
            Utils.hideLoading();
            console.error('Error previewing template:', error);
            Utils.showToast('Error', 'Failed to load preview', 'error');
        }
    },

    /**
     * Preview current template being edited
     */
    async previewCurrentTemplate() {
        const subject = document.getElementById('template-subject').value;
        let body = document.getElementById('template-body').value;
        const customMessageTextarea = document.getElementById('preview-custom-message');

        if (!subject || !body) {
            Utils.showToast('Error', 'Please enter subject and body', 'error');
            return;
        }

        // Get custom message value from the test textarea
        const customMessage = customMessageTextarea ? customMessageTextarea.value.trim() : '';

        // Process {{#if variable}}...{{/if}} conditional blocks
        // For custom_message - show/hide based on whether we have a test value
        body = body.replace(/\{\{#if\s+custom_message\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
            if (customMessage && customMessage.length > 0) {
                return content;
            }
            return '';
        });

        // For portal_url - show content (we assume portal_url will be set in production)
        body = body.replace(/\{\{#if\s+portal_url\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
            return content; // Always show portal section in preview
        });

        // For any other conditionals - show the content (assume they'll have values)
        body = body.replace(/\{\{#if\s+\w+\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
            return content;
        });

        // Replace {{custom_message}} with the test value
        body = body.replace(/\{\{custom_message\}\}/g, customMessage);

        // Simple preview without API call - just show raw HTML
        Utils.showModal({
            title: 'Preview (Draft)',
            size: 'email-preview',
            content: `
                <div class="email-preview">
                    <div class="preview-subject">
                        <strong>Subject:</strong> ${Utils.escapeHtml(subject)}
                    </div>
                    <div class="preview-body" id="draft-preview-iframe-container">
                    </div>
                    <div class="preview-note">
                        <i class="fas fa-info-circle"></i>
                        This is a draft preview. Variables (except custom message) are not replaced.
                    </div>
                </div>
            `,
            buttons: [
                {
                    text: 'Close',
                    class: 'btn-secondary',
                    onclick: () => Utils.closeModal()
                }
            ]
        });

        // Create iframe after modal is shown
        setTimeout(() => {
            const container = document.getElementById('draft-preview-iframe-container');
            if (container) {
                const iframe = document.createElement('iframe');
                iframe.sandbox = 'allow-same-origin';
                iframe.style.cssText = 'width: 100%; height: 70vh; min-height: 400px; max-height: 600px; border: 1px solid #ddd; border-radius: 4px; background: white;';
                iframe.srcdoc = body;
                container.appendChild(iframe);
            }
        }, 0);
    },

    /**
     * Show variable reference
     */
    showVariableReference() {
        const content = `
            <div class="variable-reference" style="max-height: 70vh; overflow-y: auto;">
                <h4>User Variables</h4>
                <ul class="var-list">
                    <li><code>{{name}}</code> <span>User's display name</span></li>
                    <li><code>{{username}}</code> <span>Username</span></li>
                    <li><code>{{email}}</code> <span>User's email address</span></li>
                    <li><code>{{owner_name}}</code> <span>Owner/reseller name</span></li>
                </ul>

                <h4>IPTV Panel Variables</h4>
                <ul class="var-list">
                    <li><code>{{iptv_username}}</code> <span>IPTV panel username</span></li>
                    <li><code>{{iptv_password}}</code> <span>IPTV panel password</span></li>
                    <li><code>{{iptv_m3u_url}}</code> <span>IPTV panel M3U URL</span></li>
                    <li><code>{{iptv_expiration_date}}</code> <span>IPTV panel expiration date</span></li>
                    <li><code>{{iptv_connections}}</code> <span>Number of IPTV connections allowed</span></li>
                    <li><code>{{iptv_panel_name}}</code> <span>IPTV panel name</span></li>
                </ul>

                <h4>IPTV Editor Variables</h4>
                <ul class="var-list">
                    <li><code>{{iptv_editor_dns}}</code> <span>IPTV Editor DNS/Xtream API URL</span></li>
                    <li><code>{{iptv_editor_username}}</code> <span>IPTV Editor username</span></li>
                    <li><code>{{iptv_editor_password}}</code> <span>IPTV Editor password</span></li>
                    <li><code>{{iptv_editor_m3u_url}}</code> <span>IPTV Editor M3U URL</span></li>
                    <li><code>{{iptv_editor_epg_url}}</code> <span>IPTV Editor EPG URL</span></li>
                    <li><code>{{iptv_editor_expiration_date}}</code> <span>IPTV Editor expiration date</span></li>
                </ul>

                <h4>IPTV Provider URL</h4>
                <ul class="var-list">
                    <li><code>{{iptv_provider_base_url}}</code> <span>Customer streaming URL (from Editor playlist or Panel)</span></li>
                </ul>

                <h4>Plex Variables</h4>
                <ul class="var-list">
                    <li><code>{{plex_email}}</code> <span>User's Plex email</span></li>
                    <li><code>{{plex_expiration_date}}</code> <span>Plex subscription expiration date</span></li>
                    <li><code>{{plex_server_name}}</code> <span>Plex server name</span></li>
                    <li><code>{{plex_request_site}}</code> <span>Plex request site URL (Overseerr/Jellyseerr)</span></li>
                    <li><code>{{plex_libraries}}</code> <span>Accessible Plex libraries</span></li>
                </ul>

                <h4>System Variables</h4>
                <ul class="var-list">
                    <li><code>{{app_name}}</code> <span>Application name</span></li>
                    <li><code>{{app_url}}</code> <span>Application URL (Admin panel)</span></li>
                    <li><code>{{portal_url}}</code> <span>End user portal URL</span></li>
                    <li><code>{{current_date}}</code> <span>Current date</span></li>
                    <li><code>{{current_year}}</code> <span>Current year</span></li>
                </ul>

                <h4>Custom Message</h4>
                <ul class="var-list">
                    <li><code>{{custom_message}}</code> <span>Custom message (entered when sending email)</span></li>
                </ul>

                <h4 style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">Conditional Blocks</h4>
                <p style="color: #666; margin-bottom: 10px;">Use conditional blocks to show/hide content based on whether a variable has a value:</p>
                <ul class="var-list">
                    <li>
                        <code style="white-space: pre-wrap;">{{#if custom_message}}
  ...content here...
{{/if}}</code>
                        <span>Only shows content if custom_message has a value</span>
                    </li>
                    <li>
                        <code style="white-space: pre-wrap;">{{#if portal_url}}
  ...content here...
{{/if}}</code>
                        <span>Only shows content if portal_url is configured</span>
                    </li>
                    <li>
                        <code style="white-space: pre-wrap;">{{#if plex_request_site}}
  ...content here...
{{/if}}</code>
                        <span>Only shows content if user has a request site assigned</span>
                    </li>
                </ul>
                <p style="color: #888; font-size: 12px; margin-top: 10px;">
                    <i class="fas fa-info-circle"></i>
                    You can use <code>{{#if variable_name}}</code> with any variable. The block is removed if the variable is empty.
                </p>
            </div>
        `;

        Utils.showModal({
            title: 'Variable & Helper Reference',
            size: 'lg',
            content: content,
            buttons: [
                {
                    text: 'Close',
                    class: 'btn-secondary',
                    onclick: () => Utils.closeModal()
                }
            ]
        });
    },

    /**
     * Duplicate template
     */
    async duplicateTemplate(id) {
        try {
            Utils.showLoading();

            await API.request(`/email-templates/${id}/duplicate`, {
                method: 'POST',
                body: {}
            });

            Utils.showToast('Success', 'Template duplicated successfully', 'success');
            await this.loadTemplates();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error duplicating template:', error);
            Utils.showToast('Error', 'Failed to duplicate template', 'error');
        }
    },

    /**
     * Delete template
     */
    async deleteTemplate(id) {
        const confirmed = confirm('Are you sure you want to delete this template? This action cannot be undone.');
        if (!confirmed) return;

        try {
            Utils.showLoading();

            await API.request(`/email-templates/${id}`, { method: 'DELETE' });

            Utils.showToast('Success', 'Template deleted successfully', 'success');
            await this.loadTemplates();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error deleting template:', error);
            Utils.showToast('Error', error.message || 'Failed to delete template', 'error');
        }
    },

    /**
     * Get category label
     */
    getCategoryLabel(category) {
        const labels = {
            system: 'System Templates',
            custom: 'Custom Templates',
            welcome: 'Welcome Templates',
            renewal: 'Renewal Templates',
            announcement: 'Announcements'
        };
        return labels[category] || category.charAt(0).toUpperCase() + category.slice(1);
    }
};
