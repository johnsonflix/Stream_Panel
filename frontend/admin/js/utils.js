/**
 * Utility Functions for StreamPanel
 */

const Utils = {
    /**
     * Show loading overlay
     */
    showLoading() {
        document.getElementById('loading-overlay').style.display = 'flex';
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    },

    /**
     * Show toast notification
     */
    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${iconMap[type]}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(400px)';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    },

    /**
     * Format date
     * For date-only strings (YYYY-MM-DD), parse without timezone conversion
     * For datetime strings, add 'Z' to parse as UTC
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';

        // Check if it's a date-only string (no time component)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            // Parse as local date to avoid timezone shift
            const [year, month, day] = dateString.split('-');
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        // Has time component - parse directly (already ISO format with Z or timezone)
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format datetime
     * For date-only strings, parse as local date
     * For datetime strings, parse directly (already ISO format)
     */
    formatDateTime(dateString) {
        if (!dateString) return 'N/A';

        // Check if it's a date-only string (no time component)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            // Parse as local date
            const [year, month, day] = dateString.split('-');
            const date = new Date(year, month - 1, day);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Has time component - parse directly (already ISO format with Z or timezone)
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Format file size in human-readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0 || bytes === undefined || bytes === null) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Check if date is expiring soon (within 7 days)
     */
    isExpiringSoon(dateString) {
        if (!dateString) return false;

        let date;
        // Check if it's a date-only string
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-');
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(dateString + 'Z');
        }

        const now = new Date();
        const diffTime = date - now;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
    },

    /**
     * Check if date is expired
     */
    isExpired(dateString) {
        if (!dateString) return false;

        let date;
        // Check if it's a date-only string
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-');
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(dateString + 'Z');
        }

        return date < new Date();
    },

    /**
     * Get status badge for expiration date
     * @param {string} dateString - The expiration date
     * @param {string} priceType - Optional price type ('free', 'paid', etc.)
     */
    getExpirationBadge(dateString, priceType) {
        // Free plans show "Free" badge instead of expiration
        if (priceType === 'free') {
            return '<span class="badge badge-info">Free</span>';
        }

        if (!dateString) {
            return '<span class="badge badge-secondary">No Expiration</span>';
        }

        if (this.isExpired(dateString)) {
            return `<span class="badge badge-danger">Expired ${this.formatDate(dateString)}</span>`;
        }

        if (this.isExpiringSoon(dateString)) {
            return `<span class="badge badge-warning">Expires ${this.formatDate(dateString)}</span>`;
        }

        return `<span class="badge badge-success">Expires ${this.formatDate(dateString)}</span>`;
    },

    /**
     * Get status badge for boolean
     */
    getStatusBadge(isActive, activeLabel = 'Active', inactiveLabel = 'Inactive') {
        if (isActive) {
            return `<span class="badge badge-success">${activeLabel}</span>`;
        } else {
            return `<span class="badge badge-secondary">${inactiveLabel}</span>`;
        }
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Confirm action
     */
    async confirm(title, message) {
        return new Promise((resolve) => {
            const modal = this.createModal({
                title,
                body: `<p>${message}</p>`,
                buttons: [
                    {
                        text: 'Cancel',
                        class: 'btn-outline',
                        onClick: () => {
                            this.closeModal();
                            resolve(false);
                        }
                    },
                    {
                        text: 'Confirm',
                        class: 'btn-danger',
                        onClick: () => {
                            this.closeModal();
                            resolve(true);
                        }
                    }
                ]
            });

            document.getElementById('modal-container').appendChild(modal);
        });
    },

    /**
     * Create modal
     */
    createModal({ title, body, content, buttons = [], size = 'medium', hideButtons = false }) {
        // Support both 'body' and 'content' parameter names
        const modalContent = content || body || '';

        const overlay = document.createElement('div');
        overlay.className = size === 'xlarge' ? 'modal-overlay modal-overlay-xlarge' : 'modal-overlay';

        // Force full height styles for xlarge modals via setProperty with !important
        if (size === 'xlarge') {
            overlay.style.setProperty('padding', '0.5rem', 'important');
            overlay.style.setProperty('align-items', 'center', 'important');
        }

        const modal = document.createElement('div');
        modal.className = `modal modal-${size}`;

        // Build inline styles for modal
        const modalStyles = size === 'xlarge'
            ? 'height: calc(100vh - 1rem); max-height: calc(100vh - 1rem); margin: 0.5rem auto; display: flex; flex-direction: column;'
            : '';

        // Build inline styles for modal-body
        const bodyStyles = size === 'xlarge'
            ? 'flex: 1 1 auto; overflow-y: auto; min-height: 0;'
            : '';

        if (modalStyles) {
            modal.setAttribute('style', modalStyles);
        }

        modal.innerHTML = `
            <div class="modal-header">
                <div class="modal-title">${title}</div>
                <button class="modal-close" onclick="Utils.closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" ${bodyStyles ? `style="${bodyStyles}"` : ''}>
                ${modalContent}
            </div>
            ${!hideButtons ? `
                <div class="modal-footer">
                    ${buttons.map((btn, idx) => `
                        <button class="btn ${btn.class}" ${btn.id ? `id="${btn.id}"` : ''} data-btn-index="${idx}">
                            ${btn.text}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        `;

        overlay.appendChild(modal);

        // Attach button event listeners
        buttons.forEach((btn, idx) => {
            const btnElement = modal.querySelector(`[data-btn-index="${idx}"]`);
            // Support both onClick and onclick
            const clickHandler = btn.onClick || btn.onclick;
            if (btnElement && clickHandler) {
                btnElement.addEventListener('click', clickHandler);
            }
        });

        // Prevent closing on overlay click to avoid accidental data loss
        // Users must use Cancel button or X button to close
        // overlay.addEventListener('click', (e) => {
        //     if (e.target === overlay) {
        //         this.closeModal();
        //     }
        // });

        return overlay;
    },

    /**
     * Close modal (only closes the topmost modal if multiple are stacked)
     */
    closeModal() {
        const container = document.getElementById('modal-container');
        const modals = container.querySelectorAll('.modal-overlay');

        if (modals.length === 0) return;

        // Remove only the last (topmost) modal
        const lastModal = modals[modals.length - 1];
        lastModal.remove();

        // Call onClose callback if it exists and this was the last modal
        if (modals.length === 1 && this._modalOnCloseCallback) {
            this._modalOnCloseCallback();
            this._modalOnCloseCallback = null;
        }

        // Only unlock body scroll if no more modals remain
        if (modals.length === 1) {
            document.body.classList.remove('modal-open');
        }
    },

    /**
     * Set onClose callback for modal
     */
    setModalOnClose(callback) {
        this._modalOnCloseCallback = callback;
    },

    /**
     * Show modal with content
     */
    showModal(options) {
        const modal = this.createModal(options);
        document.getElementById('modal-container').appendChild(modal);

        // Lock body scroll when modal opens
        document.body.classList.add('modal-open');
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Generate random color
     */
    randomColor() {
        const colors = [
            '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
            '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    /**
     * Format panel type
     */
    formatPanelType(type) {
        const types = {
            'nxt_dash': 'NXT Dash',
            'xui_one': 'XUI One',
            'one_stream': '1-Stream',
            'xtream_ui': 'Xtream UI',
            'midnight_streamer': 'Midnight Streamer'
        };
        return types[type] || type;
    },

    /**
     * Format server type
     */
    formatServerType(type) {
        const types = {
            'regular': 'Regular',
            '4k': '4K'
        };
        return types[type] || type;
    },

    /**
     * Format account type
     */
    formatAccountType(type) {
        if (!type) {
            return 'Standard';
        }
        const types = {
            'standard': 'Standard',
            'premium': 'Premium',
            'vip': 'VIP'
        };
        return types[type] || type;
    },

    /**
     * Copy to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied!', 'Text copied to clipboard', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            this.showToast('Error', 'Failed to copy to clipboard', 'error');
        }
    },

    /**
     * Download file
     */
    downloadFile(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Convert file to base64 string
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }
};
