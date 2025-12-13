/**
 * Email Schedules Management
 * For use in Settings page
 */

const EmailSchedules = {
    schedules: [],
    templates: [],
    tags: [],
    currentSchedule: null,
    filterConditions: { mode: 'AND', conditions: [] },

    /**
     * Render schedules section
     */
    async render(container) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h2><i class="fas fa-calendar-alt"></i> Email Schedules</h2>
                    <button class="btn btn-primary" onclick="EmailSchedules.showCreateModal()">
                        <i class="fas fa-plus"></i> Create Schedule
                    </button>
                </div>

                <div class="schedules-table-container">
                    <table class="table" id="schedules-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Template</th>
                                <th>Next Run</th>
                                <th>Status</th>
                                <th>Last Run</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="schedules-tbody">
                            <tr>
                                <td colspan="7" class="text-center">
                                    <div class="loading-spinner">Loading schedules...</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        await this.loadData();
    },

    /**
     * Load data
     */
    async loadData() {
        try {
            const [schedulesResp, templatesResp, tagsResp, appUsersResp, plansResp] = await Promise.all([
                API.request('/email-schedules', { method: 'GET' }),
                API.request('/email-templates', { method: 'GET' }),
                API.request('/tags', { method: 'GET' }),
                API.request('/app-users', { method: 'GET' }),
                API.request('/subscription-plans', { method: 'GET' })
            ]);

            this.schedules = schedulesResp.data || schedulesResp.schedules || [];
            this.templates = templatesResp.data || templatesResp.templates || [];
            this.tags = tagsResp.data || tagsResp.tags || [];
            this.owners = appUsersResp.data || appUsersResp.users || [];
            this.subscriptionPlans = plansResp.data || plansResp.plans || [];

            this.renderSchedules();

        } catch (error) {
            console.error('Error loading schedules:', error);
            Utils.showToast('Error', 'Failed to load schedules', 'error');
        }
    },

    /**
     * Render schedules table
     */
    renderSchedules() {
        const tbody = document.getElementById('schedules-tbody');

        if (this.schedules.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        No schedules configured. Create your first schedule to automate email sending.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.schedules.map(s => `
            <tr>
                <td>
                    <strong>${Utils.escapeHtml(s.name)}</strong>
                    ${s.description ? `<br><small class="text-muted">${Utils.escapeHtml(s.description)}</small>` : ''}
                </td>
                <td>
                    <span class="badge badge-${this.getScheduleTypeBadge(s.schedule_type)}">
                        ${this.getScheduleTypeLabel(s.schedule_type)}
                    </span>
                    ${s.days_before_expiration ? `<br><small>${s.days_before_expiration} days before</small>` : ''}
                </td>
                <td>${Utils.escapeHtml(s.template_name)}</td>
                <td>${s.next_run ? this.formatDateTime(s.next_run) : '<em>N/A</em>'}</td>
                <td>
                    <button class="btn btn-sm ${s.is_active ? 'btn-success' : 'btn-secondary'}"
                            onclick="EmailSchedules.toggleSchedule(${s.id})">
                        <i class="fas fa-${s.is_active ? 'check' : 'pause'}-circle"></i>
                        ${s.is_active ? 'Active' : 'Paused'}
                    </button>
                </td>
                <td>
                    ${s.last_run ? `
                        ${this.formatDateTime(s.last_run)}<br>
                        <small>${s.last_run_user_count || 0} user(s)</small>
                    ` : '<em>Never</em>'}
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="EmailSchedules.previewTargets(${s.id})"
                                title="Preview Target Users">
                            <i class="fas fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="EmailSchedules.editSchedule(${s.id})"
                                title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="EmailSchedules.triggerSchedule(${s.id})"
                                title="Run Now">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="EmailSchedules.deleteSchedule(${s.id})"
                                title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Show create modal
     */
    showCreateModal() {
        this.currentSchedule = null;
        this.filterConditions = { mode: 'AND', conditions: [] };
        this.showEditorModal();
    },

    /**
     * Edit schedule
     */
    async editSchedule(id) {
        try {
            const response = await API.request(`/email-schedules/${id}`, { method: 'GET' });
            this.currentSchedule = response.data;
            this.filterConditions = this.currentSchedule.filter_conditions || { mode: 'AND', conditions: [] };
            this.showEditorModal();
        } catch (error) {
            console.error('Error loading schedule:', error);
            Utils.showToast('Error', 'Failed to load schedule', 'error');
        }
    },

    /**
     * Show editor modal
     */
    showEditorModal() {
        const isEdit = this.currentSchedule !== null;

        Utils.showModal({
            title: isEdit ? 'Edit Schedule' : 'Create Schedule',
            size: 'xl',
            content: `
                <div class="schedule-editor">
                    <div class="form-group">
                        <label>Schedule Name *</label>
                        <input type="text" id="schedule-name" class="form-control"
                               value="${isEdit ? Utils.escapeHtml(this.currentSchedule.name) : ''}"
                               placeholder="e.g., 7 Day Renewal Reminder">
                    </div>

                    <div class="form-group">
                        <label>Description</label>
                        <input type="text" id="schedule-description" class="form-control"
                               value="${isEdit ? Utils.escapeHtml(this.currentSchedule.description || '') : ''}"
                               placeholder="Optional description">
                    </div>

                    <div class="form-group">
                        <label>Email Template *</label>
                        <select id="schedule-template" class="form-control">
                            <option value="">Select template...</option>
                            ${(this.templates || []).map(t => `
                                <option value="${t.id}" ${isEdit && this.currentSchedule.template_id == t.id ? 'selected' : ''}>
                                    ${Utils.escapeHtml(t.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Schedule Type Container -->
                    <div class="schedule-type-container" style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label>Schedule Type *</label>
                            <select id="schedule-type" class="form-control" onchange="EmailSchedules.onScheduleTypeChange()">
                                <option value="expiration_reminder">Expiration Reminder</option>
                                <option value="specific_date">Specific Date</option>
                                <option value="recurring">Recurring</option>
                            </select>
                        </div>

                        <!-- Expiration Reminder Options -->
                        <div id="expiration-options" class="schedule-type-options" style="display: none;">
                            <div class="form-group">
                                <label>Service Type *</label>
                                <select id="expiration-service-type" class="form-control">
                                    <option value="both">Both (Plex & IPTV)</option>
                                    <option value="plex">Plex Only</option>
                                    <option value="iptv">IPTV Only</option>
                                </select>
                                <small class="form-text text-muted">Which service expirations to check</small>
                            </div>
                            <div class="form-group">
                                <label>Days Before Expiration *</label>
                                <input type="number" id="days-before-expiration" class="form-control" min="0" value="7">
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label>Send Time</label>
                                <input type="time" id="schedule-time-exp" class="form-control" value="12:00">
                            </div>
                        </div>

                        <!-- Specific Date Options -->
                        <div id="specific-date-options" class="schedule-type-options" style="display: none;">
                            <div class="form-row">
                                <div class="form-group col-md-6">
                                    <label>Date *</label>
                                    <input type="date" id="scheduled-date" class="form-control">
                                </div>
                                <div class="form-group col-md-6" style="margin-bottom: 0;">
                                    <label>Time</label>
                                    <input type="time" id="scheduled-time" class="form-control" value="12:00">
                                </div>
                            </div>
                        </div>

                        <!-- Recurring Options -->
                        <div id="recurring-options" class="schedule-type-options" style="display: none;">
                            <div class="form-row">
                                <div class="form-group col-md-6">
                                    <label>Recurrence Pattern</label>
                                    <select id="recurrence-pattern" class="form-control">
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                <div class="form-group col-md-6" style="margin-bottom: 0;">
                                    <label>Send Time</label>
                                    <input type="time" id="schedule-time-rec" class="form-control" value="12:00">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Filter Builder -->
                    <div class="form-group">
                        <label>Target Users (Filters)</label>
                        <div class="filter-builder">
                            <div class="filter-mode">
                                <label>Filter Mode:</label>
                                <select id="filter-mode" class="form-control" style="width: auto; display: inline-block;">
                                    <option value="AND">Match ALL conditions (AND)</option>
                                    <option value="OR">Match ANY condition (OR)</option>
                                </select>
                            </div>

                            <div id="filter-conditions-container"></div>

                            <button type="button" class="btn btn-sm btn-secondary" onclick="EmailSchedules.addFilterCondition()">
                                <i class="fas fa-plus"></i> Add Filter
                            </button>
                            <button type="button" class="btn btn-sm btn-primary" onclick="EmailSchedules.previewFilteredUsers()">
                                <i class="fas fa-eye"></i> Preview Target Users
                            </button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="is-active" ${!isEdit || this.currentSchedule.is_active ? 'checked' : ''}>
                            <span>Active (schedule will run automatically)</span>
                        </label>
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
                    text: isEdit ? 'Update Schedule' : 'Create Schedule',
                    class: 'btn-primary',
                    onclick: () => this.saveSchedule()
                }
            ]
        });

        // Set initial values (wait for modal DOM to be ready)
        setTimeout(() => {
            if (isEdit) {
                const scheduleTypeEl = document.getElementById('schedule-type');
                if (scheduleTypeEl) {
                    scheduleTypeEl.value = this.currentSchedule.schedule_type;
                    this.onScheduleTypeChange();
                }

                if (this.currentSchedule.days_before_expiration) {
                    const daysEl = document.getElementById('days-before-expiration');
                    if (daysEl) daysEl.value = this.currentSchedule.days_before_expiration;
                }
                if (this.currentSchedule.service_type) {
                    const serviceTypeEl = document.getElementById('expiration-service-type');
                    if (serviceTypeEl) serviceTypeEl.value = this.currentSchedule.service_type;
                }
                if (this.currentSchedule.scheduled_date) {
                    const dateEl = document.getElementById('scheduled-date');
                    if (dateEl) dateEl.value = this.currentSchedule.scheduled_date;
                }
                if (this.currentSchedule.scheduled_time) {
                    const timeInputs = document.querySelectorAll('[id^="schedule-time"], [id="scheduled-time"]');
                    timeInputs.forEach(input => input.value = this.currentSchedule.scheduled_time);
                }
                if (this.currentSchedule.recurrence_pattern) {
                    const patternEl = document.getElementById('recurrence-pattern');
                    if (patternEl) patternEl.value = this.currentSchedule.recurrence_pattern;
                }
            } else {
                this.onScheduleTypeChange();
            }

            // Set filter mode
            const filterModeEl = document.getElementById('filter-mode');
            if (filterModeEl) filterModeEl.value = this.filterConditions.mode;

            // Render existing filters
            this.renderFilterConditions();
        }, 50);
    },

    /**
     * Handle schedule type change
     */
    onScheduleTypeChange() {
        const scheduleTypeEl = document.getElementById('schedule-type');
        if (!scheduleTypeEl) return;

        const type = scheduleTypeEl.value;

        document.querySelectorAll('.schedule-type-options').forEach(el => {
            el.style.display = 'none';
        });

        if (type === 'expiration_reminder') {
            const expirationEl = document.getElementById('expiration-options');
            if (expirationEl) expirationEl.style.display = 'block';
        } else if (type === 'specific_date') {
            const specificDateEl = document.getElementById('specific-date-options');
            if (specificDateEl) specificDateEl.style.display = 'block';
        } else if (type === 'recurring') {
            const recurringEl = document.getElementById('recurring-options');
            if (recurringEl) recurringEl.style.display = 'block';
        }
    },

    /**
     * Add filter condition
     */
    addFilterCondition() {
        this.filterConditions.conditions.push({
            field: 'tags',
            operator: 'contains_any',
            value: []
        });
        this.renderFilterConditions();
    },

    /**
     * Render filter conditions
     */
    renderFilterConditions() {
        const container = document.getElementById('filter-conditions-container');

        if (this.filterConditions.conditions.length === 0) {
            container.innerHTML = '<p class="text-muted"><small>No filters added. All users will be targeted.</small></p>';
            return;
        }

        container.innerHTML = this.filterConditions.conditions.map((condition, index) => `
            <div class="filter-condition-row" data-index="${index}">
                <select class="form-control" onchange="EmailSchedules.updateConditionField(${index}, this.value)">
                    <option value="tags" ${condition.field === 'tags' ? 'selected' : ''}>Tags</option>
                    <option value="platform" ${condition.field === 'platform' ? 'selected' : ''}>Platform</option>
                    <option value="owner_id" ${condition.field === 'owner_id' ? 'selected' : ''}>Owner</option>
                    <option value="subscription_plan_id" ${condition.field === 'subscription_plan_id' ? 'selected' : ''}>Subscription Plan</option>
                    <option value="days_until_expiration" ${condition.field === 'days_until_expiration' ? 'selected' : ''}>Days Until Expiration</option>
                    <option value="is_active" ${condition.field === 'is_active' ? 'selected' : ''}>Is Active</option>
                </select>

                <select class="form-control" onchange="EmailSchedules.updateConditionOperator(${index}, this.value)">
                    ${this.getOperatorsForField(condition.field).map(op => `
                        <option value="${op.value}" ${condition.operator === op.value ? 'selected' : ''}>${op.label}</option>
                    `).join('')}
                </select>

                ${this.renderConditionValue(condition, index)}

                <button class="btn btn-sm btn-danger" onclick="EmailSchedules.removeFilterCondition(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },

    /**
     * Render condition value input
     */
    renderConditionValue(condition, index) {
        if (condition.field === 'tags') {
            const selectedTags = condition.value || [];
            const selectedCount = selectedTags.length;
            const displayText = selectedCount === 0 ? 'Select tags...' : `${selectedCount} tag(s) selected`;

            return `
                <div class="checkbox-dropdown" data-index="${index}" data-field="tags">
                    <div class="checkbox-dropdown-toggle form-control" onclick="EmailSchedules.toggleCheckboxDropdown(this)">
                        <span class="dropdown-display-text">${displayText}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="checkbox-dropdown-menu">
                        ${(this.tags || []).map(tag => `
                            <label class="checkbox-dropdown-item">
                                <input type="checkbox" value="${Utils.escapeHtml(tag.name)}"
                                       ${selectedTags.includes(tag.name) ? 'checked' : ''}
                                       onchange="EmailSchedules.updateCheckboxSelection(${index}, 'tags')">
                                <span>${Utils.escapeHtml(tag.name)}</span>
                            </label>
                        `).join('')}
                        ${(this.tags || []).length === 0 ? '<div class="text-muted p-2">No tags available</div>' : ''}
                    </div>
                </div>
            `;
        } else if (condition.field === 'owner_id') {
            const selectedOwners = Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : []);
            const selectedCount = selectedOwners.length;
            const displayText = selectedCount === 0 ? 'Select owners...' : `${selectedCount} owner(s) selected`;

            return `
                <div class="checkbox-dropdown" data-index="${index}" data-field="owner_id">
                    <div class="checkbox-dropdown-toggle form-control" onclick="EmailSchedules.toggleCheckboxDropdown(this)">
                        <span class="dropdown-display-text">${displayText}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="checkbox-dropdown-menu">
                        ${(this.owners || []).map(owner => `
                            <label class="checkbox-dropdown-item">
                                <input type="checkbox" value="${owner.id}"
                                       ${selectedOwners.includes(owner.id) || selectedOwners.includes(String(owner.id)) ? 'checked' : ''}
                                       onchange="EmailSchedules.updateCheckboxSelection(${index}, 'owner_id')">
                                <span>${Utils.escapeHtml(owner.name)}</span>
                            </label>
                        `).join('')}
                        ${(this.owners || []).length === 0 ? '<div class="text-muted p-2">No owners available</div>' : ''}
                    </div>
                </div>
            `;
        } else if (condition.field === 'subscription_plan_id') {
            const selectedPlans = Array.isArray(condition.value) ? condition.value : (condition.value ? [condition.value] : []);
            const selectedCount = selectedPlans.length;
            const displayText = selectedCount === 0 ? 'Select plans...' : `${selectedCount} plan(s) selected`;

            return `
                <div class="checkbox-dropdown" data-index="${index}" data-field="subscription_plan_id">
                    <div class="checkbox-dropdown-toggle form-control" onclick="EmailSchedules.toggleCheckboxDropdown(this)">
                        <span class="dropdown-display-text">${displayText}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="checkbox-dropdown-menu">
                        ${(this.subscriptionPlans || []).map(plan => `
                            <label class="checkbox-dropdown-item">
                                <input type="checkbox" value="${plan.id}"
                                       ${selectedPlans.includes(plan.id) || selectedPlans.includes(String(plan.id)) ? 'checked' : ''}
                                       onchange="EmailSchedules.updateCheckboxSelection(${index}, 'subscription_plan_id')">
                                <span>${Utils.escapeHtml(plan.name)}</span>
                            </label>
                        `).join('')}
                        ${(this.subscriptionPlans || []).length === 0 ? '<div class="text-muted p-2">No subscription plans available</div>' : ''}
                    </div>
                </div>
            `;
        } else if (condition.field === 'platform') {
            return `
                <select class="form-control" onchange="EmailSchedules.updateConditionValue(${index}, this.value)">
                    <option value="plex" ${condition.value === 'plex' ? 'selected' : ''}>Plex</option>
                    <option value="iptv" ${condition.value === 'iptv' ? 'selected' : ''}>IPTV</option>
                </select>
            `;
        } else if (condition.field === 'is_active') {
            return `
                <select class="form-control" onchange="EmailSchedules.updateConditionValue(${index}, this.value === 'true')">
                    <option value="true" ${condition.value === true ? 'selected' : ''}>Active</option>
                    <option value="false" ${condition.value === false ? 'selected' : ''}>Inactive</option>
                </select>
            `;
        } else {
            return `
                <input type="text" class="form-control" value="${condition.value || ''}"
                       onchange="EmailSchedules.updateConditionValue(${index}, this.value)">
            `;
        }
    },

    /**
     * Toggle checkbox dropdown visibility
     */
    toggleCheckboxDropdown(toggleElement) {
        const dropdown = toggleElement.closest('.checkbox-dropdown');
        const menu = dropdown.querySelector('.checkbox-dropdown-menu');
        const isOpen = menu.classList.contains('show');

        // Close all other dropdowns first
        document.querySelectorAll('.checkbox-dropdown-menu.show').forEach(m => {
            m.classList.remove('show');
        });

        // Toggle this dropdown
        if (!isOpen) {
            menu.classList.add('show');

            // Add click outside handler
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (!dropdown.contains(e.target)) {
                        menu.classList.remove('show');
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 0);
        }
    },

    /**
     * Update checkbox selection for tags, owners, or subscription plans
     */
    updateCheckboxSelection(index, field) {
        const dropdown = document.querySelector(`.checkbox-dropdown[data-index="${index}"][data-field="${field}"]`);
        if (!dropdown) return;

        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
        const values = Array.from(checkboxes).map(cb => {
            // For owner_id and subscription_plan_id, convert to integer
            return (field === 'owner_id' || field === 'subscription_plan_id') ? parseInt(cb.value, 10) : cb.value;
        });

        // Update the condition value
        this.filterConditions.conditions[index].value = values;

        // Update display text
        const displayText = dropdown.querySelector('.dropdown-display-text');
        const fieldLabels = {
            'tags': { empty: 'Select tags...', label: 'tag' },
            'owner_id': { empty: 'Select owners...', label: 'owner' },
            'subscription_plan_id': { empty: 'Select plans...', label: 'plan' }
        };
        const labelInfo = fieldLabels[field] || { empty: 'Select...', label: 'item' };

        if (values.length === 0) {
            displayText.textContent = labelInfo.empty;
        } else {
            displayText.textContent = `${values.length} ${labelInfo.label}(s) selected`;
        }
    },

    /**
     * Get operators for field
     */
    getOperatorsForField(field) {
        const operators = {
            tags: [
                { value: 'contains_any', label: 'Contains Any' },
                { value: 'contains_all', label: 'Contains All' }
            ],
            platform: [
                { value: 'equals', label: 'Equals' }
            ],
            owner_id: [
                { value: 'equals', label: 'Equals' },
                { value: 'in', label: 'In List' }
            ],
            subscription_plan_id: [
                { value: 'equals', label: 'Equals' },
                { value: 'in', label: 'In List' }
            ],
            days_until_expiration: [
                { value: 'equals', label: 'Equals' },
                { value: 'lt', label: 'Less Than' },
                { value: 'lte', label: 'Less Than or Equal' },
                { value: 'gt', label: 'Greater Than' },
                { value: 'gte', label: 'Greater Than or Equal' }
            ],
            is_active: [
                { value: 'equals', label: 'Equals' }
            ]
        };
        return operators[field] || [{ value: 'equals', label: 'Equals' }];
    },

    /**
     * Update condition field
     */
    updateConditionField(index, field) {
        this.filterConditions.conditions[index].field = field;
        this.filterConditions.conditions[index].operator = this.getOperatorsForField(field)[0].value;
        this.filterConditions.conditions[index].value = field === 'tags' ? [] : '';
        this.renderFilterConditions();
    },

    /**
     * Update condition operator
     */
    updateConditionOperator(index, operator) {
        this.filterConditions.conditions[index].operator = operator;
    },

    /**
     * Update condition value
     */
    updateConditionValue(index, value) {
        this.filterConditions.conditions[index].value = value;
    },

    /**
     * Remove filter condition
     */
    removeFilterCondition(index) {
        this.filterConditions.conditions.splice(index, 1);
        this.renderFilterConditions();
    },

    /**
     * Preview filtered users
     */
    async previewFilteredUsers() {
        try {
            // Update filter mode
            this.filterConditions.mode = document.getElementById('filter-mode').value;

            Utils.showLoading();

            // Get schedule type and config
            const scheduleType = document.getElementById('schedule-type').value;
            const scheduleConfig = { schedule_type: scheduleType };

            if (scheduleType === 'expiration_reminder') {
                scheduleConfig.days_before_expiration = parseInt(document.getElementById('days-before-expiration').value);
                scheduleConfig.service_type = document.getElementById('expiration-service-type').value;
            }

            const response = await API.request('/email-schedules/preview-users', {
                method: 'POST',
                body: {
                    filter_conditions: this.filterConditions,
                    schedule_config: scheduleConfig
                }
            });

            Utils.hideLoading();

            const users = response.data;

            Utils.showModal({
                title: 'Target Users Preview',
                size: 'md',
                content: `
                    <div class="preview-users">
                        <p><strong>${users.length}</strong> user(s) match your filters</p>
                        ${users.length > 0 ? `
                            <ul class="user-list">
                                ${users.slice(0, 50).map(u => `
                                    <li>${Utils.escapeHtml(u.name)} - ${Utils.escapeHtml(u.email)}</li>
                                `).join('')}
                                ${users.length > 50 ? `<li><em>...and ${users.length - 50} more</em></li>` : ''}
                            </ul>
                        ` : '<p class="text-muted">No users match the current filters.</p>'}
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

        } catch (error) {
            Utils.hideLoading();
            console.error('Error previewing users:', error);
            Utils.showToast('Error', 'Failed to preview users', 'error');
        }
    },

    /**
     * Save schedule
     */
    async saveSchedule() {
        const name = document.getElementById('schedule-name').value.trim();
        const description = document.getElementById('schedule-description').value.trim();
        const template_id = document.getElementById('schedule-template').value;
        const schedule_type = document.getElementById('schedule-type').value;
        const is_active = document.getElementById('is-active').checked;

        if (!name || !template_id) {
            Utils.showToast('Error', 'Please fill in all required fields', 'error');
            return;
        }

        // Get type-specific fields
        let days_before_expiration = null;
        let scheduled_date = null;
        let scheduled_time = '12:00';
        let recurrence_pattern = null;
        let service_type = 'both';

        if (schedule_type === 'expiration_reminder') {
            days_before_expiration = parseInt(document.getElementById('days-before-expiration').value);
            scheduled_time = document.getElementById('schedule-time-exp').value;
            service_type = document.getElementById('expiration-service-type').value;
        } else if (schedule_type === 'specific_date') {
            scheduled_date = document.getElementById('scheduled-date').value;
            scheduled_time = document.getElementById('scheduled-time').value;

            if (!scheduled_date) {
                Utils.showToast('Error', 'Please enter a scheduled date', 'error');
                return;
            }
        } else if (schedule_type === 'recurring') {
            recurrence_pattern = document.getElementById('recurrence-pattern').value;
            scheduled_time = document.getElementById('schedule-time-rec').value;
        }

        // Update filter mode
        this.filterConditions.mode = document.getElementById('filter-mode').value;

        const data = {
            name,
            description,
            template_id: parseInt(template_id),
            schedule_type,
            days_before_expiration,
            scheduled_date,
            scheduled_time,
            recurrence_pattern,
            filter_conditions: this.filterConditions,
            is_active,
            service_type
        };

        try {
            Utils.showLoading();

            if (this.currentSchedule) {
                await API.request(`/email-schedules/${this.currentSchedule.id}`, {
                    method: 'PUT',
                    body: data
                });
                Utils.showToast('Success', 'Schedule updated successfully', 'success');
            } else {
                await API.request('/email-schedules', {
                    method: 'POST',
                    body: data
                });
                Utils.showToast('Success', 'Schedule created successfully', 'success');
            }

            Utils.closeModal();
            await this.loadData();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error saving schedule:', error);
            Utils.showToast('Error', error.message || 'Failed to save schedule', 'error');
        }
    },

    /**
     * Toggle schedule
     */
    async toggleSchedule(id) {
        try {
            await API.request(`/email-schedules/${id}/toggle`, { method: 'PATCH' });
            await this.loadData();
            Utils.showToast('Success', 'Schedule status updated', 'success');
        } catch (error) {
            console.error('Error toggling schedule:', error);
            Utils.showToast('Error', 'Failed to update schedule status', 'error');
        }
    },

    /**
     * Preview target users for schedule
     */
    async previewTargets(id) {
        try {
            Utils.showLoading();

            const response = await API.request(`/email-schedules/${id}/target-users`, { method: 'GET' });
            const users = response.data;

            Utils.hideLoading();

            Utils.showModal({
                title: 'Target Users',
                size: 'md',
                content: `
                    <div class="preview-users">
                        <p><strong>${users.length}</strong> user(s) will receive this email</p>
                        ${users.length > 0 ? `
                            <ul class="user-list">
                                ${users.slice(0, 50).map(u => `
                                    <li>${Utils.escapeHtml(u.name)} - ${Utils.escapeHtml(u.email)}</li>
                                `).join('')}
                                ${users.length > 50 ? `<li><em>...and ${users.length - 50} more</em></li>` : ''}
                            </ul>
                        ` : '<p class="text-muted">No users currently match this schedule.</p>'}
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

        } catch (error) {
            Utils.hideLoading();
            console.error('Error loading targets:', error);
            Utils.showToast('Error', 'Failed to load target users', 'error');
        }
    },

    /**
     * Trigger schedule manually
     */
    async triggerSchedule(id) {
        const confirmed = confirm('Run this schedule now? Emails will be sent immediately to all target users.');
        if (!confirmed) return;

        try {
            Utils.showLoading();

            await API.request(`/email-schedules/${id}/trigger`, {
                method: 'POST',
                body: {}
            });

            Utils.showToast('Success', 'Schedule executed successfully!', 'success');
            await this.loadData();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error triggering schedule:', error);
            Utils.showToast('Error', error.message || 'Failed to run schedule', 'error');
        }
    },

    /**
     * Delete schedule
     */
    async deleteSchedule(id) {
        const confirmed = confirm('Are you sure you want to delete this schedule? This action cannot be undone.');
        if (!confirmed) return;

        try {
            Utils.showLoading();

            await API.request(`/email-schedules/${id}`, { method: 'DELETE' });

            Utils.showToast('Success', 'Schedule deleted successfully', 'success');
            await this.loadData();
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            console.error('Error deleting schedule:', error);
            Utils.showToast('Error', 'Failed to delete schedule', 'error');
        }
    },

    /**
     * Get schedule type label
     */
    getScheduleTypeLabel(type) {
        const labels = {
            expiration_reminder: 'Expiration Reminder',
            specific_date: 'Specific Date',
            recurring: 'Recurring',
            lifecycle_event: 'Lifecycle Event'
        };
        return labels[type] || type;
    },

    /**
     * Get schedule type badge color
     */
    getScheduleTypeBadge(type) {
        const badges = {
            expiration_reminder: 'warning',
            specific_date: 'primary',
            recurring: 'info',
            lifecycle_event: 'secondary'
        };
        return badges[type] || 'secondary';
    },

    /**
     * Format date/time
     */
    formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString();
    }
};
