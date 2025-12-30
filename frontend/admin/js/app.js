/**
 * Main Application Initializer for StreamPanel
 */

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('StreamPanel - Frontend Initialized');

    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        // Redirect to login page (don't show content)
        window.location.href = '/login.html';
        return;
    }

    // Show content now that auth is verified
    document.body.classList.remove('auth-pending');
    document.body.style.display = '';

    // Load and apply branding (app name, logo, etc.)
    await loadBrandingSettings();

    // Load and apply global theme first
    await loadGlobalTheme();

    // Add logout button to nav if needed
    addLogoutButton();

    // Initialize mobile menu toggle
    initMobileMenu();

    // Initialize router
    Router.init();

    // Check API health
    checkAPIHealth();

    // Load pending service requests notification badge
    loadPendingRequestsBadge();
    // Refresh every 60 seconds
    setInterval(loadPendingRequestsBadge, 60000);

    // Initialize admin notifications system
    initAdminNotifications();

    // Load Tools dropdown (Media Managers)
    loadToolsDropdown();
});

/**
 * Check if user is authenticated
 */
async function checkAuthentication() {
    const sessionToken = API.getSessionToken();

    if (!sessionToken) {
        console.log('No session token found');
        return false;
    }

    try {
        // Verify session token with API
        const response = await API.getCurrentUserAPI();

        if (response && response.success && response.user) {
            console.log('User authenticated:', response.user.name || response.user.email);
            // Update stored user data
            localStorage.setItem('user', JSON.stringify(response.user));
            return true;
        }

        console.log('Invalid session response');
        return false;

    } catch (error) {
        console.error('Authentication check failed:', error);
        // Clear invalid session
        API.logout();
        return false;
    }
}

/**
 * Add logout button to navigation
 */
function addLogoutButton() {
    const navMenu = document.getElementById('nav-menu');
    const user = API.getCurrentUser();

    if (!navMenu) return;

    // Check if logout button already exists
    if (document.getElementById('logout-nav-item')) return;

    // Create user info and logout item
    const userInfo = document.createElement('li');
    userInfo.id = 'logout-nav-item';
    userInfo.style.marginLeft = 'auto';
    userInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="color: var(--text-secondary); font-size: 14px;">
                <i class="fas fa-user"></i> ${user?.name || user?.email || 'User'}
            </span>
            <a href="#" class="nav-link" id="logout-btn">
                <i class="fas fa-sign-out-alt"></i> Logout
            </a>
        </div>
    `;

    navMenu.appendChild(userInfo);

    // Add logout event handler
    document.getElementById('logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();

        if (confirm('Are you sure you want to logout?')) {
            try {
                await API.logoutAPI();
            } catch (error) {
                console.error('Logout error:', error);
                // Logout anyway
                API.logout();
            }
        }
    });
}

/**
 * Initialize mobile menu toggle
 */
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navMenu = document.getElementById('nav-menu');

    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');

            // Change icon between bars and times (X)
            const icon = mobileMenuToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });

        // Close menu when clicking on a nav link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                const icon = mobileMenuToggle.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            });
        });
    }
}

/**
 * Load and apply branding settings (app name, logo, favicon)
 * Made globally accessible so it can be called from settings page
 */
async function loadBrandingSettings() {
    try {
        console.log('Loading branding settings...');

        // Fetch branding settings from API
        const [appNameRes, logoRes, faviconRes] = await Promise.all([
            API.getSetting('app_title'),
            API.getSetting('app_logo'),
            API.getSetting('app_favicon')
        ]);

        // Apply app name to header and title
        const appName = appNameRes?.value || 'StreamPanel';

        // Update page title
        document.title = `${appName} - Subscription Management`;

        // Update nav brand text
        const navBrandSpan = document.querySelector('.nav-brand span');
        if (navBrandSpan) {
            navBrandSpan.textContent = appName;
        }

        // Apply logo if set, otherwise show icon
        const navBrand = document.querySelector('.nav-brand');
        if (navBrand) {
            const logoPath = logoRes?.value;
            const icon = navBrand.querySelector('i.fa-tv');
            let logoImg = navBrand.querySelector('img.nav-logo');

            if (logoPath) {
                // Hide icon and show logo
                if (icon) {
                    icon.style.display = 'none';
                }

                // Create or update logo image
                if (!logoImg) {
                    logoImg = document.createElement('img');
                    logoImg.className = 'nav-logo';
                    logoImg.style.cssText = 'max-height: 32px; max-width: 120px; object-fit: contain; margin-right: 8px;';

                    // Add error handler to fallback to icon if logo fails to load
                    logoImg.onerror = function() {
                        console.warn('Failed to load logo, showing icon instead');
                        this.style.display = 'none';
                        if (icon) icon.style.display = 'inline-block';
                    };

                    navBrand.insertBefore(logoImg, navBrand.firstChild);
                }
                logoImg.src = logoPath;
                logoImg.alt = appName;
                logoImg.style.display = 'block';
            } else {
                // No logo - show icon and hide logo image
                if (icon) {
                    icon.style.display = 'inline-block';
                }
                if (logoImg) {
                    logoImg.style.display = 'none';
                }
            }
        }

        // Apply favicon
        const faviconPath = faviconRes?.value;

        if (faviconPath) {
            let link = document.querySelector("link[rel*='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = faviconPath;
        }

        console.log(`Branding loaded: ${appName}`);
    } catch (error) {
        console.error('Error loading branding settings:', error);
        // Continue with defaults
    }
}

// Make loadBrandingSettings globally accessible for settings page
window.loadBrandingSettings = loadBrandingSettings;

/**
 * Load and apply global theme settings
 */
async function loadGlobalTheme() {
    try {
        console.log('Loading global theme settings...');

        // Fetch theme settings from API
        const themeModeSetting = await API.getSetting('theme_mode');
        const customColorsSetting = await API.getSetting('custom_colors');

        // Apply theme mode (light/dark)
        const themeMode = themeModeSetting?.value || 'light';
        if (themeMode === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // Apply custom colors if set
        if (customColorsSetting?.value) {
            try {
                const colors = JSON.parse(customColorsSetting.value);
                const root = document.documentElement;

                if (colors.primary) root.style.setProperty('--primary-color', colors.primary);
                if (colors.secondary) root.style.setProperty('--secondary-color', colors.secondary);
                if (colors.accent) root.style.setProperty('--accent-color', colors.accent);
                if (colors.success) root.style.setProperty('--success-color', colors.success);

                console.log('Custom theme colors applied:', colors);
            } catch (error) {
                console.error('Error parsing custom colors:', error);
            }
        }

        console.log(`Theme loaded: ${themeMode} mode`);
    } catch (error) {
        console.error('Error loading global theme:', error);
        // Continue with default light theme
    }
}

/**
 * Check API health
 */
async function checkAPIHealth() {
    try {
        const response = await fetch('/api/v2/health');
        const data = await response.json();

        if (data.success) {
            console.log('API Health Check:', data.message, data.version);
        } else {
            console.warn('API health check failed');
            Utils.showToast('Warning', 'API connection may be unstable', 'warning');
        }
    } catch (error) {
        console.error('API health check failed:', error);
        Utils.showToast('Error', 'Cannot connect to backend API', 'error');
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

/**
 * Load pending service requests badge on Users nav link
 */
async function loadPendingRequestsBadge() {
    try {
        const response = await API.getPendingServiceRequests();
        if (!response.success) return;

        const count = response.count || 0;
        const usersLink = document.querySelector('a.nav-link[data-page="users"]');

        if (!usersLink) return;

        // Remove existing badge
        const existingBadge = usersLink.querySelector('.nav-badge');
        if (existingBadge) existingBadge.remove();

        // Add badge if there are pending requests
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'nav-badge';
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.cssText = `
                background: var(--danger-color, #dc3545);
                color: white;
                font-size: 10px;
                font-weight: 600;
                padding: 2px 6px;
                border-radius: 10px;
                margin-left: 6px;
                min-width: 18px;
                text-align: center;
            `;
            usersLink.appendChild(badge);
        }
    } catch (error) {
        console.error('Error loading pending requests badge:', error);
    }
}

// Make globally accessible for manual refresh
window.loadPendingRequestsBadge = loadPendingRequestsBadge;

// ============================================
// ADMIN NOTIFICATIONS SYSTEM (Banner Style)
// ============================================

let adminNotifications = [];
let currentNotificationId = null;
let notificationCheckInterval = null;

/**
 * Initialize admin notifications system
 */
function initAdminNotifications() {
    const banner = document.getElementById('admin-notification-banner');
    const dismissBtn = document.getElementById('notification-banner-dismiss');

    if (!banner) {
        console.warn('Notification banner element not found');
        return;
    }

    // Dismiss button click
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            dismissCurrentNotification();
        });
    }

    // Load notifications initially
    loadAdminNotifications();

    // Check for new notifications every 30 seconds
    notificationCheckInterval = setInterval(loadAdminNotifications, 30000);
}

/**
 * Get dismissed notification IDs from sessionStorage
 */
function getDismissedNotificationIds() {
    try {
        const dismissed = sessionStorage.getItem('dismissedNotifications');
        return dismissed ? JSON.parse(dismissed) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Add notification ID to dismissed list in sessionStorage
 */
function addDismissedNotificationId(id) {
    const dismissed = getDismissedNotificationIds();
    if (!dismissed.includes(id)) {
        dismissed.push(id);
        sessionStorage.setItem('dismissedNotifications', JSON.stringify(dismissed));
    }
}

/**
 * Load admin notifications from API
 */
async function loadAdminNotifications() {
    try {
        const response = await fetch('/api/v2/admin/portal/admin-notifications', {
            headers: API.getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            let newNotifications = data.notifications || [];

            // Filter out notifications dismissed in this session
            const dismissedIds = getDismissedNotificationIds();
            newNotifications = newNotifications.filter(n => !dismissedIds.includes(n.id));

            // Check if we have new notifications to show
            if (newNotifications.length > 0 && !currentNotificationId) {
                adminNotifications = newNotifications;
                showNextNotification();
            } else if (newNotifications.length > adminNotifications.length) {
                // New notification came in, update the list
                adminNotifications = newNotifications;
                // If no banner is showing, show the new one
                if (!currentNotificationId) {
                    showNextNotification();
                }
            } else {
                adminNotifications = newNotifications;
            }
        }
    } catch (error) {
        console.error('Error loading admin notifications:', error);
    }
}

/**
 * Show the next notification in the banner
 */
function showNextNotification() {
    if (adminNotifications.length === 0) {
        hideBanner();
        return;
    }

    const notification = adminNotifications[0];
    currentNotificationId = notification.id;

    const banner = document.getElementById('admin-notification-banner');
    const messageEl = document.getElementById('notification-banner-message');
    const fromEl = document.getElementById('notification-banner-from');

    if (!banner || !messageEl) return;

    // Format as "Name says:"
    if (fromEl) {
        fromEl.textContent = `${notification.created_by || 'System'} says:`;
    }

    // Message in quotes
    messageEl.textContent = `"${notification.message}"`;

    // Show the banner with animation
    banner.classList.remove('hiding');
    banner.style.display = 'flex';
}

/**
 * Hide the notification banner
 */
function hideBanner() {
    const banner = document.getElementById('admin-notification-banner');
    if (!banner) return;

    banner.classList.add('hiding');
    setTimeout(() => {
        banner.style.display = 'none';
        banner.classList.remove('hiding');
        currentNotificationId = null;
    }, 300);
}

/**
 * Dismiss the current notification
 */
async function dismissCurrentNotification() {
    if (!currentNotificationId) return;

    const idToDismiss = currentNotificationId;

    try {
        const response = await fetch(`/api/v2/admin/portal/admin-notifications/${idToDismiss}/read`, {
            method: 'PUT',
            headers: API.getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            // If sessionOnly, add to sessionStorage so other admins still see it
            // but it won't show again for this admin in this session
            if (data.sessionOnly) {
                addDismissedNotificationId(idToDismiss);
            }

            // Remove from local array
            adminNotifications = adminNotifications.filter(n => n.id !== idToDismiss);
            currentNotificationId = null;

            // Hide current and show next (if any)
            const banner = document.getElementById('admin-notification-banner');
            if (banner) {
                banner.classList.add('hiding');
                setTimeout(() => {
                    banner.style.display = 'none';
                    banner.classList.remove('hiding');

                    // Show next notification if there are more
                    if (adminNotifications.length > 0) {
                        setTimeout(() => showNextNotification(), 200);
                    }
                }, 300);
            }
        }
    } catch (error) {
        console.error('Error dismissing notification:', error);
    }
}

/**
 * Format time ago string
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ============ Tools Dropdown ============

const toolIcons = {
    sonarr: 'fa-tv',
    radarr: 'fa-film',
    qbittorrent: 'fa-magnet',
    sabnzbd: 'fa-download',
    other_arr: 'fa-database',
    other: 'fa-server'
};

/**
 * Load and populate the Tools dropdown menu with configured media managers
 */
async function loadToolsDropdown() {
    const container = document.getElementById('tools-dropdown-container');
    const menu = document.getElementById('tools-dropdown-menu');
    const toggle = document.getElementById('tools-dropdown-toggle');

    if (!container || !menu || !toggle) return;

    try {
        const response = await API.request('/media-managers');
        const managers = response.managers || [];

        // Filter to only enabled managers
        const enabledManagers = managers.filter(m => m.is_enabled);

        if (enabledManagers.length === 0) {
            container.style.display = 'none';
            return;
        }

        // Show the dropdown container
        container.style.display = '';

        // Build menu items
        let menuHtml = enabledManagers.map(manager => {
            // Check for custom icon_url, otherwise use FontAwesome fallback
            const iconHtml = manager.icon_url
                ? `<img src="${escapeHtml(manager.icon_url)}" alt="${escapeHtml(manager.name)}">`
                : `<i class="fas ${toolIcons[manager.type] || 'fa-server'}"></i>`;
            const noImageClass = manager.icon_url ? '' : 'no-image';

            return `
            <li>
                <a href="#" onclick="openMediaManager(${manager.id}); return false;">
                    <span class="tool-icon ${manager.type} ${noImageClass}">
                        ${iconHtml}
                    </span>
                    ${escapeHtml(manager.name)}
                </a>
            </li>`;
        }).join('');

        // Add "Manage Tools" link at bottom
        menuHtml += `
            <li class="dropdown-footer">
                <a href="../portal/request2.html?admin=1&settingsTab=managers#settings">
                    <i class="fas fa-cog"></i> Manage Tools
                </a>
            </li>
        `;

        menu.innerHTML = menuHtml;

        // Setup toggle click handler
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
            }
        });

    } catch (error) {
        console.error('Failed to load tools dropdown:', error);
        container.style.display = 'none';
    }
}

/**
 * Open a media manager tool
 */
async function openMediaManager(managerId) {
    // Close the dropdown
    document.getElementById('tools-dropdown-container')?.classList.remove('open');

    try {
        const response = await API.request(`/media-managers/${managerId}/open-url`);

        if (response.connection_mode === 'proxy') {
            // Open proxy viewer in new tab
            window.open(`/admin/tool-proxy.html?id=${managerId}`, '_blank');
        } else {
            // Open direct URL
            window.open(response.url, '_blank');
        }
    } catch (error) {
        console.error('Failed to open manager:', error);
        showToast('Failed to open tool', 'error');
    }
}

// Make functions globally accessible
window.loadAdminNotifications = loadAdminNotifications;
window.openMediaManager = openMediaManager;
