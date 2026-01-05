/**
 * Client-side Router for StreamPanel
 */

const Router = {
    currentPage: null,

    /**
     * Initialize router
     */
    init() {
        // Handle navigation clicks
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigate(page);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.loadPage(e.state.page, false);
            }
        });

        // Handle hash changes from anchor clicks (e.g., <a href="#edit-user/123">)
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash && hash !== this.currentPage) {
                this.loadPage(hash);
            }
        });

        // Load initial page from URL hash or default to dashboard
        const hash = window.location.hash.slice(1);
        const initialPage = hash || 'dashboard';
        this.navigate(initialPage, true);
    },

    /**
     * Navigate to a page
     */
    navigate(page, replace = false) {
        // Update URL
        if (replace) {
            history.replaceState({ page }, '', `#${page}`);
        } else {
            history.pushState({ page }, '', `#${page}`);
        }

        // Load page
        this.loadPage(page);
    },

    /**
     * Load page content
     */
    async loadPage(page, updateNav = true) {
        // Cleanup previous page
        if (this.currentPage && this.currentPage !== page) {
            // Stop dashboard auto-refresh when navigating away from dashboard
            if (this.currentPage === 'dashboard') {
                Dashboard.stopAutoRefresh();
            }
        }

        // Parse page and parameters (e.g., "edit-user/123")
        const parts = page.split('/');
        const pageName = parts[0];
        const params = parts.slice(1);

        // Update active nav link
        if (updateNav) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                // Match based on page name (not full route with params)
                const linkPage = link.getAttribute('data-page');
                if (linkPage === pageName || (pageName === 'edit-user' && linkPage === 'users')) {
                    link.classList.add('active');
                }
            });
        }

        this.currentPage = page;

        // Get page content
        const contentDiv = document.getElementById('page-content');

        try {
            switch (pageName) {
                case 'dashboard':
                    await Dashboard.render(contentDiv);
                    break;
                case 'users':
                    await Users.render(contentDiv);
                    break;
                case 'edit-user':
                    // Edit user page with user ID parameter
                    if (params.length > 0 && params[0]) {
                        const userId = parseInt(params[0]);
                        await EditUser.render(contentDiv, userId);
                    } else {
                        contentDiv.innerHTML = `
                            <div class="card text-center">
                                <h2>Invalid User</h2>
                                <p>No user ID specified.</p>
                                <button class="btn btn-primary" onclick="Router.navigate('users')">
                                    Back to Users
                                </button>
                            </div>
                        `;
                    }
                    break;
                case 'email':
                    await EmailComposer.render(contentDiv, params);
                    break;
                case 'settings':
                    await Settings.render(contentDiv);
                    break;
                default:
                    contentDiv.innerHTML = `
                        <div class="card text-center">
                            <h2>404 - Page Not Found</h2>
                            <p>The page "${page}" does not exist.</p>
                            <button class="btn btn-primary" onclick="Router.navigate('dashboard')">
                                Go to Dashboard
                            </button>
                        </div>
                    `;
            }
        } catch (error) {
            console.error('Error loading page:', error);
            contentDiv.innerHTML = `
                <div class="card text-center">
                    <h2>Error Loading Page</h2>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="Router.navigate('dashboard')">
                        Go to Dashboard
                    </button>
                </div>
            `;
        }
    },

    /**
     * Reload current page
     */
    reload() {
        this.loadPage(this.currentPage);
    }
};
