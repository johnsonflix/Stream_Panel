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
        // Update active nav link
        if (updateNav) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('data-page') === page) {
                    link.classList.add('active');
                }
            });
        }

        this.currentPage = page;

        // Get page content
        const contentDiv = document.getElementById('page-content');

        try {
            switch (page) {
                case 'dashboard':
                    await Dashboard.render(contentDiv);
                    break;
                case 'users':
                    await Users.render(contentDiv);
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
