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
     * Parse date string robustly - handles both SQLite and PostgreSQL formats
     * SQLite: "2026-01-07 00:00:00" (no timezone)
     * PostgreSQL: "2026-01-07T00:00:00.000Z" (already has timezone)
     */
    parseDate(dateString) {
        if (!dateString) return null;

        // If it's already a Date object, return it
        if (dateString instanceof Date) return dateString;

        // Convert to string if needed
        let str = String(dateString);

        // Check if it already has timezone info (Z or +/- offset)
        const hasTimezone = /[Z]$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str);

        if (!hasTimezone) {
            // Replace space with T for ISO format compatibility
            str = str.replace(' ', 'T');
            // Add Z to treat as UTC
            str += 'Z';
        }

        return new Date(str);
    },

    /**
     * Format date
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = this.parseDate(dateString);
        if (!date || isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format datetime
     */
    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = this.parseDate(dateString);
        if (!date || isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Check if date is expiring soon (within 7 days)
     */
    isExpiringSoon(dateString) {
        if (!dateString) return false;
        const date = this.parseDate(dateString);
        if (!date || isNaN(date.getTime())) return false;
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
        const date = this.parseDate(dateString);
        if (!date || isNaN(date.getTime())) return false;
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
    createModal({ title, body, buttons = [], size = 'medium' }) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = `modal modal-${size}`;

        modal.innerHTML = `
            <div class="modal-header">
                <div class="modal-title">${title}</div>
                <button class="modal-close" onclick="Utils.closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                ${body}
            </div>
            <div class="modal-footer">
                ${buttons.map((btn, idx) => `
                    <button class="btn ${btn.class}" ${btn.id ? `id="${btn.id}"` : ''} data-btn-index="${idx}">
                        ${btn.text}
                    </button>
                `).join('')}
            </div>
        `;

        overlay.appendChild(modal);

        // Attach button event listeners
        buttons.forEach((btn, idx) => {
            const btnElement = modal.querySelector(`[data-btn-index="${idx}"]`);
            if (btnElement && btn.onClick) {
                btnElement.addEventListener('click', btn.onClick);
            }
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeModal();
            }
        });

        return overlay;
    },

    /**
     * Close modal
     */
    closeModal() {
        const container = document.getElementById('modal-container');
        container.innerHTML = '';

        // Unlock body scroll
        document.body.classList.remove('modal-open');
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
    }
};
