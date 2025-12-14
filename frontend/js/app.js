/**
 * Main Application Initializer for StreamPanel
 */

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('StreamPanel - Frontend Initialized');

    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        // Redirect to login page
        window.location.href = '/login.html';
        return;
    }

    // Show the body now that auth is verified
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
