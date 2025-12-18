/**
 * NXTDashPanel - Pink Pony / NXT Dash Panel Implementation
 *
 * Implements BaseIPTVPanel for NXT Dash panel type (Pink Pony provider).
 * Handles CSRF-based authentication, user management, and panel operations.
 */

const axios = require('axios');
const BaseIPTVPanel = require('../BaseIPTVPanel');

class NXTDashPanel extends BaseIPTVPanel {
    constructor(panelConfig, db) {
        super(panelConfig, db);

        // NXT Dash specific settings
        // Package ID must be selected via UI - no hardcoded defaults
        this.packageIdForBouquets = panelConfig.panel_settings?.selected_package_id || null;
        this.minLoginInterval = 5000; // 5 seconds between logins
        this.lastLoginTime = null;
    }

    /**
     * Test connection to panel by actually authenticating
     */
    async testConnection() {
        try {
            // Try to authenticate - this is a real test
            await this.authenticate();
            return true;
        } catch (error) {
            console.error(`❌ NXT Dash panel ${this.name} connection test failed:`, error.message);
            return false;
        }
    }

    /**
     * Authenticate with NXT Dash panel
     * Multi-step process: Get CSRF token → Login with credentials
     */
    async authenticate() {
        try {
            // Rate limiting
            if (this.lastLoginTime && (Date.now() - this.lastLoginTime) < this.minLoginInterval) {
                const waitTime = this.minLoginInterval - (Date.now() - this.lastLoginTime);
                console.log(`⏳ Rate limiting: waiting ${waitTime}ms before login`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            console.log(`🔑 Authenticating with NXT Dash panel: ${this.name}`);

            // Step 1: Get CSRF token and initial cookies
            const csrfData = await this.getCSRFTokenAndCookies();

            // Step 2: Login with credentials
            await this.loginToPanel(csrfData.csrfToken, csrfData.cookies);

            this.lastLoginTime = Date.now();

            console.log(`✅ NXT Dash panel ${this.name} authenticated successfully`);
            return true;

        } catch (error) {
            console.error(`❌ NXT Dash panel ${this.name} authentication failed:`, error.message);
            await this.updateHealthStatus('error');
            throw error;
        }
    }

    /**
     * Step 1: Get CSRF token from login page
     */
    async getCSRFTokenAndCookies() {
        try {
            const response = await axios({
                method: 'GET',
                url: this.loginURL,
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            const responseText = response.data;

            // Extract CSRF token using multiple patterns
            let csrfToken = null;

            // Pattern 1: name="_token" value="TOKEN"
            const tokenMatch = responseText.match(/name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']/);
            if (tokenMatch) {
                csrfToken = tokenMatch[1];
            }

            // Pattern 2: name="csrf-token" content="TOKEN"
            const metaMatch = responseText.match(/name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']/);
            if (metaMatch) {
                csrfToken = metaMatch[1];
            }

            if (!csrfToken) {
                throw new Error('CSRF token not found in login page');
            }

            // Extract cookies
            const setCookieHeaders = response.headers['set-cookie'] || [];
            const cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');

            console.log(`✅ CSRF token obtained: ${csrfToken.substring(0, 20)}...`);

            return { csrfToken, cookies };

        } catch (error) {
            throw new Error(`Failed to get CSRF token: ${error.message}`);
        }
    }

    /**
     * Step 2: Login with credentials
     */
    async loginToPanel(csrfToken, initialCookies) {
        try {
            const loginData = new URLSearchParams({
                username: this.credentials.username,
                password: this.credentials.password,
                _token: csrfToken
            });

            const response = await axios({
                method: 'POST',
                url: this.loginURL,
                data: loginData.toString(),
                timeout: 15000,
                maxRedirects: 0,  // Don't follow redirects
                validateStatus: (status) => status < 400,  // Accept redirects
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': csrfToken,
                    'Cookie': initialCookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml'
                }
            });

            // Update session cookies from response - MERGE with initial cookies
            const setCookieHeaders = response.headers['set-cookie'] || [];
            let mergedCookies = initialCookies;

            // Merge cookies from login response (update/add specific ones)
            setCookieHeaders.forEach(cookie => {
                const cookiePart = cookie.split(';')[0];
                if (cookiePart.includes('XSRF-TOKEN')) {
                    // Replace or add XSRF-TOKEN
                    mergedCookies = mergedCookies.replace(/XSRF-TOKEN=[^;]*;?\s*/, '');
                    mergedCookies += cookiePart + '; ';
                } else if (cookiePart.includes('management_session')) {
                    // Replace or add management_session
                    mergedCookies = mergedCookies.replace(/management_session=[^;]*;?\s*/, '');
                    mergedCookies += cookiePart + '; ';
                } else if (cookiePart.includes('laravel_session')) {
                    // Replace or add laravel_session
                    mergedCookies = mergedCookies.replace(/laravel_session=[^;]*;?\s*/, '');
                    mergedCookies += cookiePart + '; ';
                }
            });

            // Store authentication data
            this.authToken = csrfToken;
            this.sessionCookies = mergedCookies.trim();
            this.sessionData = { initialCookies, mergedCookies };
            this.authExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            console.log(`✅ Login successful, session cookies merged`);

            return true;

        } catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * Create a new user on the panel
     */
    async createUser(username, password, packageData, bouquetIds, isTrial = false, notes = '') {
        // Always re-authenticate for each operation to ensure fresh session
        await this.authenticate();
        await this.rateLimit();

        try {
            // Check if BOTH credentials are empty (panel will auto-generate both)
            const usernameProvided = username && username.trim() !== '';
            const passwordProvided = password && password.trim() !== '';
            const willAutoGenerateBoth = !usernameProvided && !passwordProvided;

            // If auto-generating BOTH, get user list before creation to compare after
            let usersBefore = [];
            if (willAutoGenerateBoth) {
                console.log('📝 Both credentials empty - panel will auto-generate. Getting user list before creation...');
                usersBefore = await this.getAllUsers();
            } else if (usernameProvided && !passwordProvided) {
                console.log(`📝 Username provided (${username}), password will be auto-generated by panel`);
            } else if (!usernameProvided && passwordProvided) {
                console.log(`📝 Password provided, username will be auto-generated by panel`);
            } else {
                console.log(`📝 Both username and password provided: ${username}`);
            }

            const endpoint = isTrial ?
                `${this.baseURL}/lines/create/1` :  // Trial endpoint
                `${this.baseURL}/lines/create/0`;   // Paid endpoint

            const formData = new URLSearchParams({
                _token: this.authToken,
                line_type: 'line',
                username: username || '',
                password: password || '',
                mac: '',
                forced_country: '',
                package: packageData.panel_package_id,
                current_bouquets: bouquetIds.join(','),
                q: '',
                description: notes || ''
            });

            const response = await axios({
                method: 'POST',
                url: endpoint,
                data: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': this.authToken,
                    'Cookie': this.sessionCookies,
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Referer': `${this.baseURL}/lines/create/${isTrial ? '1' : '0'}/line`
                },
                timeout: 30000
            });

            // Log the response to see what the panel returned
            console.log('📝 Panel API response:', JSON.stringify(response.data, null, 2));

            // Check if the panel returned an explicit error
            if (response.data && response.data.error) {
                throw new Error(`Panel API error: ${response.data.error}`);
            }

            // Check if the panel returned a redirect
            // NOTE: NXT Dash panel returns {"redirect": "/lines"} on successful user creation
            // This is NOT an error - the user was created successfully
            let redirectReceived = false;
            if (response.data && response.data.redirect) {
                console.log(`✅ Panel returned redirect to ${response.data.redirect} - user created successfully`);
                redirectReceived = true;
            }

            // ALWAYS query the panel to get actual user credentials (username/password may be auto-generated)
            // Use retry logic with 3 attempts and increasing delays (matching old code behavior)
            let actualUsername = username;
            let actualPassword = password;
            let panelUser = null;

            if (willAutoGenerateBoth || redirectReceived || !usernameProvided || !passwordProvided) {
                const maxRetries = 3;
                const delays = [3000, 5000, 7000]; // 3s, 5s, 7s

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    console.log(`🔄 Attempt ${attempt}/${maxRetries}: Waiting ${delays[attempt - 1] / 1000}s before fetching user data...`);
                    await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));

                    console.log(`🔍 Attempt ${attempt}/${maxRetries}: Fetching user data from panel...`);
                    const usersAfter = await this.getAllUsers();

                    // Find the new user using different strategies
                    if (usernameProvided) {
                        // Username provided: Search by username directly (even if password was auto-generated)
                        console.log(`🔍 Searching for user by provided username: ${username}`);
                        panelUser = usersAfter.find(user => user.username === username);
                    } else if (willAutoGenerateBoth) {
                        // Both auto-generated: Compare before/after lists to find new user by ID difference
                        console.log(`🔍 Searching for auto-generated user by comparing lists...`);
                        panelUser = usersAfter.find(after =>
                            !usersBefore.some(before => before.id === after.id)
                        );
                    } else {
                        // Fallback: try to find by comparing lists
                        console.log(`🔍 Fallback: Searching by comparing user lists...`);
                        const usersBefore = await this.getAllUsers();
                        panelUser = usersAfter.find(after =>
                            !usersBefore.some(before => before.id === after.id)
                        );
                    }

                    if (panelUser) {
                        console.log(`✅ User found on attempt ${attempt}`);
                        actualUsername = panelUser.username;
                        actualPassword = panelUser.password;
                        console.log(`✅ Retrieved actual credentials from panel: ${actualUsername} / ${actualPassword}`);
                        console.log(`   Line ID: ${panelUser.id}, Expiration: ${panelUser.exp_date}`);
                        break;
                    } else {
                        console.warn(`⚠️ User not found on attempt ${attempt}/${maxRetries}`);
                    }
                }

                if (!panelUser) {
                    // After all retries failed, throw an error instead of returning incomplete data
                    console.error(`❌ User created on panel but could not be retrieved after ${maxRetries} attempts`);
                    throw new Error(`User '${username}' was created on the panel but could not be retrieved. Please check the panel manually and try syncing the user data.`);
                }

                // Parse expiration date from panel format (DD-MM-YYYY HH:mm) to Unix timestamp
                let expirationTimestamp = null;
                if (panelUser.exp_date && panelUser.exp_date.includes('-')) {
                    try {
                        const datePart = panelUser.exp_date.split(' ')[0]; // Get "13-07-2025"
                        const [day, month, year] = datePart.split('-'); // Split DD-MM-YYYY
                        const isoDateString = `${year}-${month}-${day}`;
                        const expirationDate = new Date(isoDateString + 'T00:00:00Z'); // Use UTC to avoid timezone shifts
                        expirationTimestamp = Math.floor(expirationDate.getTime() / 1000);
                        console.log(`📅 Parsed expiration: ${panelUser.exp_date} → ${expirationTimestamp} (${expirationDate.toISOString()})`);
                    } catch (error) {
                        console.error('❌ Failed to parse expiration date:', error);
                    }
                }

                // Log activity
                await this.logActivity(
                    null,
                    panelUser.id,
                    isTrial ? 'create_trial' : 'create_paid',
                    packageData.package_id,
                    isTrial ? 0 : packageData.credits,
                    true,
                    null,
                    response.data
                );

                // Return full user data directly
                return {
                    username: actualUsername,
                    password: actualPassword,
                    line_id: panelUser.id,
                    expiration: expirationTimestamp,
                    connections: panelUser.user_connection || panelUser.connections,
                    package_id: packageData.package_id,
                    is_trial: isTrial,
                    created: true,
                    auto_generated: true,
                    full_user_data: panelUser
                };
            }

            console.log(`✅ User ${actualUsername} created successfully (trial: ${isTrial})`);

            // Log activity
            await this.logActivity(
                null,
                null,
                isTrial ? 'create_trial' : 'create_paid',
                packageData.package_id,
                isTrial ? 0 : packageData.credits,
                true,
                null,
                response.data
            );

            // This path should rarely be hit since we always have willAutoGenerate or redirectReceived
            // But if we do hit it, we don't have full data - just return what we have
            return {
                username: actualUsername,
                password: actualPassword,
                package_id: packageData.package_id,
                is_trial: isTrial,
                created: true,
                auto_generated: false
            };

        } catch (error) {
            console.error(`❌ Failed to create user ${username}:`, error.message);

            await this.logActivity(
                null,
                null,
                isTrial ? 'create_trial' : 'create_paid',
                packageData.package_id,
                0,
                false,
                error.message,
                null
            );

            throw error;
        }
    }

    /**
     * Get available extension/renewal packages for a user
     * Parses the HTML response from GET /lines/extend/{lineId}
     */
    async getExtensionPackages(lineId) {
        // Always re-authenticate for each operation to ensure fresh session
        await this.authenticate();
        await this.rateLimit();

        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/lines/extend/${lineId}`,
                headers: {
                    'Cookie': this.sessionCookies,
                    'Accept': 'text/html'
                },
                timeout: 30000
            });

            const html = response.data;
            const packages = [];

            // Parse the HTML to extract package options
            // Looking for: <option value="34" data-credits="1" data-duration="1" data-duration-in="months" data-connections="2">Name</option>
            const optionRegex = /<option\s+value="(\d+)"\s+data-credits="(\d+)"\s+data-duration="(\d+)"\s+data-duration-in="(\w+)"\s+data-connections="(\d+)">\s*([\s\S]*?)\s*<\/option>/gi;

            let match;
            while ((match = optionRegex.exec(html)) !== null) {
                const [, packageId, credits, duration, durationIn, connections, rawName] = match;
                // Clean up the name - remove extra whitespace and newlines
                const name = rawName.replace(/\s+/g, ' ').trim();

                // Build duration text for UI display
                const durationNum = parseInt(duration);
                const durationText = `${durationNum} ${durationIn}`;

                packages.push({
                    id: packageId.toString(),  // Standardized field name for frontend compatibility
                    package_id: parseInt(packageId),  // Keep for backwards compatibility
                    credits: parseInt(credits),
                    duration: durationNum,
                    duration_in: durationIn,
                    duration_text: durationText,  // Add for frontend display
                    connections: parseInt(connections),
                    name: name
                });
            }

            console.log(`📦 Found ${packages.length} extension packages for line ${lineId}`);
            return packages;

        } catch (error) {
            console.error(`❌ Failed to get extension packages for line ${lineId}:`, error.message);
            throw error;
        }
    }

    /**
     * Extend user's subscription
     */
    async extendUser(lineId, packageData, bouquetIds) {
        // Always re-authenticate for each operation to ensure fresh session
        await this.authenticate();
        await this.rateLimit();

        try {
            // Use panel_package_id which is the actual NXT Dash panel package ID
            // (package_id is the database row id, which may be null for unsync'd packages)
            const panelPackageId = packageData.panel_package_id || packageData.package_id;

            const formData = new URLSearchParams({
                _token: this.authToken,
                package: panelPackageId,
                current_bouquets: bouquetIds.join(',')
            });

            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}/lines/extend/${lineId}`,
                data: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': this.authToken,
                    'Cookie': this.sessionCookies,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 30000
            });

            console.log('📝 Panel API response:', JSON.stringify(response.data, null, 2));

            // Check if the panel returned a redirect
            if (response.data && response.data.redirect) {
                const redirectUrl = response.data.redirect.toLowerCase();
                // Redirect to /lines is SUCCESS - panel processed the renewal and redirects to lines list
                if (redirectUrl.includes('/lines') || redirectUrl.endsWith('/lines')) {
                    console.log(`✅ Panel redirected to ${response.data.redirect} - this indicates success`);
                } else if (redirectUrl.includes('login') || redirectUrl.includes('auth') || redirectUrl === '/') {
                    // Redirect to login page is auth failure
                    throw new Error(`Panel returned redirect to ${response.data.redirect}. This may indicate authentication failure or session expiry. Please try again manually.`);
                } else {
                    // Unknown redirect - log but continue (assume success)
                    console.log(`⚠️ Panel redirected to ${response.data.redirect} - unknown redirect, assuming success`);
                }
            }

            // Check if the panel returned an error
            if (response.data && response.data.error) {
                throw new Error(`Panel API error: ${response.data.error}`);
            }

            console.log(`✅ User ${lineId} extended successfully with package ${panelPackageId}`);

            // Fetch updated user info from panel to get new expiration date
            console.log(`🔄 Fetching updated user info after renewal...`);
            let updatedUserInfo = null;
            try {
                updatedUserInfo = await this.getUserInfo(lineId);
                console.log(`📅 Updated expiration: ${updatedUserInfo?.expiration_date || 'unknown'}`);
            } catch (fetchError) {
                console.warn(`⚠️ Failed to fetch updated user info (non-critical):`, fetchError.message);
            }

            await this.logActivity(
                null,
                lineId,
                'extend',
                panelPackageId,
                packageData.credits,
                true,
                null,
                response.data
            );

            // Return updated user info along with response data
            return {
                ...response.data,
                updated_user_info: updatedUserInfo
            };

        } catch (error) {
            const errorPackageId = packageData.panel_package_id || packageData.package_id;
            console.error(`❌ Failed to extend user ${lineId} with package ${errorPackageId}:`, error.message);

            await this.logActivity(
                null,
                lineId,
                'extend',
                errorPackageId,
                0,
                false,
                error.message,
                null
            );

            throw error;
        }
    }

    /**
     * Delete user from panel
     */
    async deleteUser(lineId) {
        // Always re-authenticate for each operation to ensure fresh session
        await this.authenticate();
        await this.rateLimit();

        try {
            const formData = new URLSearchParams({
                _token: this.authToken
            });

            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}/lines/delete/${lineId}`,
                data: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': this.authToken,
                    'Cookie': this.sessionCookies,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 30000
            });

            console.log('📝 Panel API response:', JSON.stringify(response.data, null, 2));

            // Check if the panel returned a redirect
            if (response.data && response.data.redirect) {
                const redirectUrl = response.data.redirect.toLowerCase();
                // Redirect to /lines is SUCCESS - panel processed the deletion and redirects to lines list
                if (redirectUrl.includes('/lines') || redirectUrl.endsWith('/lines')) {
                    console.log(`✅ Panel redirected to ${response.data.redirect} - this indicates success`);
                } else if (redirectUrl.includes('login') || redirectUrl.includes('auth') || redirectUrl === '/') {
                    // Redirect to login page is auth failure
                    throw new Error(`Panel returned redirect to ${response.data.redirect}. This may indicate authentication failure or session expiry. Please try again manually.`);
                } else {
                    // Unknown redirect - log but continue (assume success)
                    console.log(`⚠️ Panel redirected to ${response.data.redirect} - unknown redirect, assuming success`);
                }
            }

            // Check if the panel returned an error
            if (response.data && response.data.error) {
                throw new Error(`Panel API error: ${response.data.error}`);
            }

            console.log(`✅ User ${lineId} deleted successfully`);

            await this.logActivity(
                null,
                lineId,
                'delete',
                null,
                0,
                true,
                null,
                response.data
            );

            return true;

        } catch (error) {
            console.error(`❌ Failed to delete user ${lineId}:`, error.message);

            await this.logActivity(
                null,
                lineId,
                'delete',
                null,
                0,
                false,
                error.message,
                null
            );

            throw error;
        }
    }

    /**
     * Get all users from panel
     */
    async getAllUsers(limit = 10000, offset = 0) {
        // Always re-authenticate to get fresh CSRF token (Laravel invalidates tokens server-side)
        await this.authenticate();

        try {
            const formData = {
                draw: 1,
                start: offset,
                length: limit,
                'search[value]': '',
                'search[regex]': false
            };

            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}/lines/data`,
                data: formData,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': this.authToken,
                    'Cookie': this.sessionCookies,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 60000
            });

            const users = response.data.data || response.data.aaData || [];
            console.log(`✅ Fetched ${users.length} users from panel ${this.name}`);

            return users;

        } catch (error) {
            console.error(`❌ Failed to get users from panel ${this.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Find user by username
     */
    async findUserByUsername(username) {
        if (!username) {
            return null;
        }
        const allUsers = await this.getAllUsers();
        const user = allUsers.find(u => u.username && u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
            return null;
        }

        // Parse expiration date from panel format (DD-MM-YYYY HH:mm) to YYYY-MM-DD string
        // Store as string to avoid timezone conversion issues
        let expirationDateString = null;
        if (user.exp_date && typeof user.exp_date === 'string' && user.exp_date.includes('-')) {
            try {
                const datePart = user.exp_date.split(' ')[0]; // Get "07-03-2026"
                const [day, month, year] = datePart.split('-'); // Split DD-MM-YYYY
                expirationDateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; // YYYY-MM-DD
                console.log(`📅 [findUserByUsername] Parsed expiration: ${user.exp_date} → ${expirationDateString}`);
            } catch (error) {
                console.error('❌ [findUserByUsername] Failed to parse expiration date:', error);
            }
        }

        // Return user with parsed expiration date string (no timestamp conversion)
        return {
            ...user,
            expiration_date: expirationDateString,  // YYYY-MM-DD string for direct storage
            expiry_date: user.exp_date              // Keep original string for reference
        };
    }

    /**
     * Get user info by line ID
     * Used for linking existing IPTV panel users
     */
    async getUserInfo(lineId) {
        if (!lineId) {
            throw new Error('Line ID is required');
        }

        console.log(`🔍 Getting user info for line ID ${lineId} from panel ${this.name}...`);

        // Fetch all users and find the one with matching ID
        const allUsers = await this.getAllUsers();
        const user = allUsers.find(u => u.id && u.id.toString() === lineId.toString());

        if (!user) {
            throw new Error(`User with line ID ${lineId} not found on panel ${this.name}`);
        }

        console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);

        // Parse expiration date from panel format (DD-MM-YYYY HH:mm) to YYYY-MM-DD string
        // Store as string to avoid timezone conversion issues
        let expirationDateString = null;
        if (user.exp_date && user.exp_date.includes('-')) {
            try {
                const datePart = user.exp_date.split(' ')[0]; // Get "13-07-2025"
                const [day, month, year] = datePart.split('-'); // Split DD-MM-YYYY
                expirationDateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; // YYYY-MM-DD
                console.log(`📅 Parsed expiration: ${user.exp_date} → ${expirationDateString}`);
            } catch (error) {
                console.error('❌ Failed to parse expiration date:', error);
            }
        }

        // Build M3U URL with panel's base M3U URL if available
        let m3uUrl = null;
        if (this.panelConfig && this.panelConfig.m3u_url) {
            try {
                const url = new URL(this.panelConfig.m3u_url);
                url.searchParams.set('username', user.username);
                url.searchParams.set('password', user.password);
                m3uUrl = url.toString();
                console.log(`✅ Built M3U URL with user credentials`);
            } catch (error) {
                console.error('❌ Failed to build M3U URL:', error.message);
            }
        }

        // Return user information in expected format
        return {
            line_id: user.id,
            username: user.username,
            password: user.password,
            expiration_date: expirationDateString,  // YYYY-MM-DD string for direct storage
            expiry_date: user.exp_date,             // Keep original string for reference
            connections: user.user_connection || user.max_connections || null,
            max_connections: user.user_connection || user.max_connections || null,
            active_connections: user.active_connections || 0,
            status: user.status || 'unknown',
            m3u_url: m3uUrl
        };
    }

    /**
     * Sync packages from panel
     */
    async syncPackages() {
        // Always re-authenticate to get fresh CSRF token (Laravel invalidates tokens server-side)
        await this.authenticate();

        try {
            const packages = [];
            const optionRegex = /<option value="(\d+)"[^>]*data-credits="(\d+)"[^>]*data-duration="(\d+)"[^>]*data-duration-in="(\w+)"[^>]*data-connections="(\d+)"[^>]*>([^<]+)<\/option>/g;

            // Fetch paid packages from endpoint 0
            console.log(`📦 Fetching paid packages from panel ${this.name}...`);
            const paidResponse = await axios({
                method: 'GET',
                url: `${this.baseURL}/lines/create/0/line`,
                headers: {
                    'Cookie': this.sessionCookies,
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 30000
            });

            let match;
            let html = paidResponse.data;

            while ((match = optionRegex.exec(html)) !== null) {
                const [, packageId, credits, duration, durationUnit, connections, name] = match;

                // Determine package type based on ID ranges
                let packageType = 'basic';
                const id = parseInt(packageId);
                if (id >= 150 && id <= 161) packageType = 'full';
                else if (id >= 175 && id <= 186) packageType = 'live_tv';

                packages.push({
                    panel_id: this.id,
                    package_id: packageId,
                    name: name.trim(),
                    connections: parseInt(connections),
                    duration_months: durationUnit === 'months' ? parseInt(duration) : Math.round(parseInt(duration) / 30),
                    credits: parseInt(credits),
                    package_type: packageType
                });
            }

            console.log(`✅ Found ${packages.length} paid packages`);

            // Fetch trial packages from endpoint 1
            console.log(`📦 Fetching trial packages from panel ${this.name}...`);
            try {
                const trialResponse = await axios({
                    method: 'GET',
                    url: `${this.baseURL}/lines/create/1/line`,
                    headers: {
                        'Cookie': this.sessionCookies,
                        'User-Agent': 'Mozilla/5.0'
                    },
                    timeout: 30000
                });

                html = trialResponse.data;
                optionRegex.lastIndex = 0; // Reset regex

                while ((match = optionRegex.exec(html)) !== null) {
                    const [, packageId, credits, duration, durationUnit, connections, name] = match;

                    packages.push({
                        panel_id: this.id,
                        package_id: packageId,
                        name: name.trim(),
                        connections: parseInt(connections),
                        duration_months: durationUnit === 'months' ? parseInt(duration) : Math.round(parseInt(duration) / 30),
                        credits: parseInt(credits),
                        package_type: 'trial'
                    });
                }

                console.log(`✅ Found ${packages.filter(p => p.package_type === 'trial').length} trial packages`);
            } catch (trialError) {
                console.warn(`⚠️ Could not fetch trial packages: ${trialError.message}`);
            }

            console.log(`✅ Synced ${packages.length} total packages from panel ${this.name}`);

            // Upsert to database
            for (const pkg of packages) {
                await this.db.query(`
                    INSERT INTO iptv_packages
                    (iptv_panel_id, package_id, name, connections, duration_months, credits, package_type, synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    ON CONFLICT (iptv_panel_id, package_id) DO UPDATE SET
                    name = excluded.name,
                    connections = excluded.connections,
                    duration_months = excluded.duration_months,
                    credits = excluded.credits,
                    package_type = excluded.package_type,
                    synced_at = datetime('now')
                `, [this.id, pkg.package_id, pkg.name, pkg.connections, pkg.duration_months, pkg.credits, pkg.package_type]);
            }

            await this.updateHealthStatus('online');
            return packages;

        } catch (error) {
            console.error(`❌ Failed to sync packages from panel ${this.name}:`, error.message);
            await this.updateHealthStatus('error');
            throw error;
        }
    }

    /**
     * No categorization - categorization will be managed in the channel groups feature
     */
    categorizeBouquet(name) {
        return null;
    }

    /**
     * Sync bouquets from panel (based on old working code)
     */
    async syncBouquets() {
        // Always re-authenticate to get fresh CSRF token (Laravel invalidates tokens server-side)
        await this.authenticate();

        try {
            // Validate that a package has been selected
            if (!this.packageIdForBouquets) {
                throw new Error('Please select a package from the panel settings before syncing bouquets');
            }

            console.log(`🔄 Syncing bouquets from panel ${this.name} using package ${this.packageIdForBouquets}...`);

            // Add delay to ensure session is ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            const formData = new URLSearchParams({
                _token: this.authToken,
                package_id: this.packageIdForBouquets,
                trial: '0'
            });

            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}/lines/packages`,
                data: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-TOKEN': this.authToken,
                    'Cookie': this.sessionCookies,
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Origin': this.baseURL,
                    'Referer': this.baseURL + '/lines/create/0/line'
                },
                timeout: 30000
            });

            const bouquets = response.data.bouquets || [];
            console.log(`✅ Got ${bouquets.length} bouquets from panel API`);

            if (bouquets.length === 0) {
                console.warn('⚠️ No bouquets returned from panel API');
                return [];
            }

            let insertedCount = 0;

            // Upsert to database with categorization
            for (const bouquet of bouquets) {
                try {
                    const category = this.categorizeBouquet(bouquet.bouquet_name);

                    await this.db.query(`
                        INSERT INTO iptv_bouquets
                        (iptv_panel_id, bouquet_id, name, category, synced_at)
                        VALUES (?, ?, ?, ?, datetime('now'))
                        ON CONFLICT (iptv_panel_id, bouquet_id) DO UPDATE SET
                        name = excluded.name,
                        category = excluded.category,
                        synced_at = datetime('now')
                    `, [this.id, bouquet.id, bouquet.bouquet_name, category]);

                    insertedCount++;

                    if (insertedCount % 20 === 0) {
                        console.log(`📝 Inserted ${insertedCount}/${bouquets.length} bouquets...`);
                    }
                } catch (insertError) {
                    console.error(`❌ Failed to insert bouquet ${bouquet.id}:`, insertError.message);
                }
            }

            console.log(`✅ Successfully synced ${insertedCount} bouquets from panel ${this.name}`);

            await this.updateHealthStatus('online');

            // Return bouquets with category info
            return bouquets.map(b => ({
                id: b.id,
                bouquet_name: b.bouquet_name,
                category: this.categorizeBouquet(b.bouquet_name)
            }));

        } catch (error) {
            console.error(`❌ Failed to sync bouquets from panel ${this.name}:`, error.message);
            await this.updateHealthStatus('error');
            throw error;
        }
    }


    /**
     * Get credit balance
     */
    async getCreditBalance() {
        // Always re-authenticate to get fresh CSRF token (Laravel invalidates tokens server-side)
        await this.authenticate();

        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/rlogs/credits`,
                headers: {
                    'Cookie': this.sessionCookies,
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 15000
            });

            const html = response.data;
            const creditMatch = html.match(/Credits:\s*(\d+)/i);

            if (creditMatch) {
                const credits = parseInt(creditMatch[1]);
                console.log(`✅ Panel ${this.name} credit balance: ${credits}`);

                // Update in database
                await this.db.query(`
                    UPDATE iptv_panels
                    SET current_credit_balance = ?
                    WHERE id = ?
                `, [credits, this.id]);

                return credits;
            }

            throw new Error('Credit balance not found in response');

        } catch (error) {
            console.error(`❌ Failed to get credit balance from panel ${this.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Get live connections with user data
     * Fetches from /rconnections/data and /lines/data, then merges
     */
    async getLiveConnections() {
        await this.ensureAuthenticated();

        try {
            console.log(`🔍 Fetching live connections from panel ${this.name}...`);

            // Fetch connections and users in parallel
            const [connectionsResponse, usersResponse] = await Promise.allSettled([
                axios({
                    method: 'POST',
                    url: `${this.baseURL}/rconnections/data`,
                    data: {
                        draw: 1,
                        start: 0,
                        length: 1000,
                        'search[value]': '',
                        'search[regex]': false
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-TOKEN': this.authToken,
                        'Cookie': this.sessionCookies,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 30000
                }),
                axios({
                    method: 'POST',
                    url: `${this.baseURL}/lines/data`,
                    data: {
                        draw: 1,
                        start: 0,
                        length: 10000,
                        'search[value]': '',
                        'search[regex]': false
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-TOKEN': this.authToken,
                        'Cookie': this.sessionCookies,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 60000
                })
            ]);

            // Extract data from responses
            const connectionsData = connectionsResponse.status === 'fulfilled' ?
                (connectionsResponse.value.data.data || connectionsResponse.value.data.aaData || []) : [];
            const usersData = usersResponse.status === 'fulfilled' ?
                (usersResponse.value.data.data || usersResponse.value.data.aaData || []) : [];

            console.log(`✅ Got ${connectionsData.length} connections and ${usersData.length} users`);

            // Create user lookup for connection limits and expiry
            const userLookup = {};
            usersData.forEach(user => {
                userLookup[user.username] = {
                    maxConnections: parseInt(user.user_connection) || 0,
                    activeConnections: parseInt(user.active_connections) || 0,
                    expireDate: user.exp_date || null,
                    status: user.status || 'unknown'
                };
            });

            // Log first connection to see field names (for debugging)
            if (connectionsData.length > 0) {
                console.log(`🔍 NXTDash first connection fields:`, Object.keys(connectionsData[0]));
            }

            // Group connections by username
            const userConnections = {};
            connectionsData.forEach(conn => {
                const username = conn.username;
                if (!userConnections[username]) {
                    const userData = userLookup[username] || { maxConnections: 0, activeConnections: 0 };
                    userConnections[username] = {
                        username: username,
                        connections: [],
                        activeConnections: userData.activeConnections,
                        maxConnections: userData.maxConnections,
                        expireDate: userData.expireDate,
                        status: userData.status,
                        panel_id: this.id,
                        panel_name: this.name
                    };
                }

                // Parse date - NXTDash may use different field names
                let dateStart = null;
                // Try different possible date field names
                const rawDate = conn.date_start || conn.started || conn.start_date || conn.created_at || conn.time_start;

                if (rawDate) {
                    if (typeof rawDate === 'number') {
                        // Unix timestamp (seconds)
                        dateStart = new Date(rawDate * 1000).toISOString();
                    } else if (typeof rawDate === 'string') {
                        // Strip any HTML tags that might be present
                        const cleanDate = rawDate.replace(/<[^>]*>/g, '').trim();
                        if (cleanDate) {
                            // Try parsing as-is first
                            const parsed = new Date(cleanDate);
                            if (!isNaN(parsed.getTime())) {
                                dateStart = parsed.toISOString();
                            } else {
                                // Try MySQL format "YYYY-MM-DD HH:mm:ss"
                                const mysqlMatch = cleanDate.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
                                if (mysqlMatch) {
                                    dateStart = new Date(cleanDate.replace(' ', 'T') + 'Z').toISOString();
                                }
                            }
                        }
                    }
                }

                // Strip HTML from IP address (NXTDash may return IP as anchor link)
                let ipAddress = conn.ip || 'Unknown';
                if (typeof ipAddress === 'string' && ipAddress.includes('<')) {
                    // Extract IP from HTML like <a href="...">192.168.1.1</a>
                    const ipMatch = ipAddress.match(/>([^<]+)</);
                    if (ipMatch) {
                        ipAddress = ipMatch[1].trim();
                    } else {
                        // Fallback: strip all HTML tags
                        ipAddress = ipAddress.replace(/<[^>]*>/g, '').trim();
                    }
                }

                userConnections[username].connections.push({
                    streamName: conn.stream_display_name || 'Unknown',
                    ip: ipAddress,
                    userAgent: conn.user_agent || 'Unknown',
                    dateStart: dateStart
                });
            });

            // Convert to array
            const liveViewers = Object.values(userConnections);

            console.log(`✅ Panel ${this.name} has ${liveViewers.length} users with active streams`);

            return liveViewers;

        } catch (error) {
            console.error(`❌ Failed to get live connections from panel ${this.name}:`, error.message);
            return []; // Return empty array on error
        }
    }

    /**
     * Get dashboard statistics
     * Aggregates credits, user counts, content counts, and live viewers
     */
    async getDashboardStatistics() {
        try {
            console.log(`📊 Gathering dashboard statistics for panel ${this.name}...`);

            // Fetch panel data to check for M3U URL and get cached logos
            const [panelData] = await this.db.query(`
                SELECT m3u_url, m3u_channel_count, m3u_movie_count, m3u_series_count, m3u_last_sync, m3u_channel_logos
                FROM iptv_panels
                WHERE id = ?
            `, [this.id]);

            // Fetch all data in parallel
            const [creditsResult, usersResult, liveResult] = await Promise.allSettled([
                this.getCreditBalance(),
                this.getAllUsers(10000, 0),
                this.getLiveConnections()
            ]);

            // Extract results
            const credits = creditsResult.status === 'fulfilled' ? creditsResult.value : 0;
            const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
            let liveViewers = liveResult.status === 'fulfilled' ? liveResult.value : [];

            // Parse channel logos if available and enrich live connections
            if (panelData?.m3u_channel_logos && liveViewers.length > 0) {
                try {
                    const channelLogos = JSON.parse(panelData.m3u_channel_logos);
                    const { findLogoForStream } = require('../../../utils/m3u-parser');

                    // Enrich each viewer's connections with logo info
                    liveViewers = liveViewers.map(viewer => ({
                        ...viewer,
                        connections: viewer.connections.map(conn => {
                            const logoInfo = findLogoForStream(conn.streamName, channelLogos);
                            return {
                                ...conn,
                                logo: logoInfo?.logo || null,
                                category: logoInfo?.group || null
                            };
                        })
                    }));

                    console.log(`🖼️ Enriched ${liveViewers.length} live viewers with channel logos`);
                } catch (parseError) {
                    console.warn(`⚠️ Failed to parse channel logos for panel ${this.name}:`, parseError.message);
                }
            }

            // Determine content counts
            let liveChannels = 0;
            let vodMovies = 0;
            let vodSeries = 0;
            let contentStatus = 'configured';

            // Check if M3U URL is configured
            if (panelData && panelData.m3u_url) {
                // Use M3U parsed counts
                liveChannels = panelData.m3u_channel_count || 0;
                vodMovies = panelData.m3u_movie_count || 0;
                vodSeries = panelData.m3u_series_count || 0;
                contentStatus = 'configured';
                console.log(`✅ Using M3U counts for panel ${this.name} (last sync: ${panelData.m3u_last_sync || 'never'})`);
            } else {
                // No M3U URL configured - show "needs configured"
                contentStatus = 'needs_configured';
                console.log(`⚠️ Panel ${this.name} has no M3U URL configured`);
            }

            // Count active users (those not expired)
            const now = new Date();
            const activeUsers = users.filter(user => {
                if (!user.exp_date) return false;
                const expireDate = new Date(user.exp_date);
                return expireDate > now;
            }).length;

            const stats = {
                panel_id: this.id,
                panel_name: this.name,
                panel_type: this.type,
                credits: credits,
                content: {
                    liveChannels: liveChannels,
                    vodMovies: vodMovies,
                    vodSeries: vodSeries,
                    status: contentStatus,  // 'configured' or 'needs_configured'
                    m3u_url: panelData?.m3u_url || null,
                    m3u_last_sync: panelData?.m3u_last_sync || null
                },
                users: {
                    total: users.length,
                    active: activeUsers,
                    liveNow: liveViewers.length
                },
                liveViewers: liveViewers,
                lastUpdate: new Date().toISOString()
            };

            console.log(`✅ Dashboard statistics for ${this.name}:`, {
                credits: stats.credits,
                content: stats.content,
                users: stats.users,
                liveViewers: stats.liveViewers.length
            });

            // Update database with cached statistics for fast dashboard loading
            try {
                await this.db.query(`
                    UPDATE iptv_panels
                    SET
                        user_count = ?,
                        active_user_count = ?,
                        live_connection_count = ?,
                        current_credit_balance = ?,
                        last_stats_update = ?
                    WHERE id = ?
                `, [
                    users.length,
                    activeUsers,
                    liveViewers.length,
                    credits,
                    new Date().toISOString(),
                    this.id
                ]);
                console.log(`💾 Cached statistics saved to database for panel ${this.name}`);
            } catch (dbError) {
                console.error(`⚠️ Failed to cache statistics in database for panel ${this.name}:`, dbError.message);
                // Don't throw - we still want to return the stats even if caching fails
            }

            return stats;

        } catch (error) {
            console.error(`❌ Failed to get dashboard statistics from panel ${this.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Sync M3U playlist and update content counts
     */
    async syncM3UPlaylist() {
        try {
            // Get M3U URL from database
            const [panelData] = await this.db.query(`
                SELECT m3u_url FROM iptv_panels WHERE id = ?
            `, [this.id]);

            if (!panelData || !panelData.m3u_url) {
                throw new Error('No M3U URL configured for this panel');
            }

            console.log(`🔄 Syncing M3U playlist for panel ${this.name}...`);

            // Parse the M3U playlist (with logo extraction enabled)
            const { parseM3UPlaylist } = require('../../../utils/m3u-parser');
            const result = await parseM3UPlaylist(panelData.m3u_url, true);

            // Serialize channel logos to JSON for storage
            const logosJson = result.channelLogos ? JSON.stringify(result.channelLogos) : null;
            const logoCount = result.channelLogos ? Object.keys(result.channelLogos).length : 0;

            // Update database with counts and logos
            await this.db.query(`
                UPDATE iptv_panels
                SET m3u_channel_count = ?,
                    m3u_movie_count = ?,
                    m3u_series_count = ?,
                    m3u_channel_logos = ?,
                    m3u_last_sync = datetime('now')
                WHERE id = ?
            `, [result.liveChannels, result.vodMovies, result.vodSeries, logosJson, this.id]);

            console.log(`✅ M3U playlist synced for panel ${this.name}:`);
            console.log(`   - Live channels: ${result.liveChannels}`);
            console.log(`   - VOD movies: ${result.vodMovies}`);
            console.log(`   - VOD series: ${result.vodSeries}`);
            console.log(`   - Channel logos cached: ${logoCount}`);

            return {
                success: true,
                counts: {
                    liveChannels: result.liveChannels,
                    vodMovies: result.vodMovies,
                    vodSeries: result.vodSeries,
                    logosCached: logoCount
                },
                lastSync: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Failed to sync M3U playlist for panel ${this.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Fetch available packages from panel
     * Returns array of {id, name} objects
     */
    async fetchAvailablePackages() {
        // Always re-authenticate to get fresh CSRF token (Laravel invalidates tokens server-side)
        await this.authenticate();

        try {
            console.log(`📦 Fetching available packages from panel ${this.name}...`);

            // Get packages from create line page
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/lines/create/0/line`,
                headers: {
                    'Cookie': this.sessionCookies,
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 30000
            });

            const html = response.data;
            const packages = [];

            // Parse package options from HTML
            // Looking for: <option value="PACKAGE_ID" data-credits="..." data-duration="..." ...>PACKAGE_NAME</option>
            const optionRegex = /<option value="(\d+)"[^>]*data-credits="(\d+)"[^>]*data-duration="(\d+)"[^>]*data-duration-in="(\w+)"[^>]*data-connections="(\d+)"[^>]*>([^<]+)<\/option>/g;
            let match;

            while ((match = optionRegex.exec(html)) !== null) {
                const [, packageId, credits, duration, durationUnit, connections, name] = match;

                packages.push({
                    id: packageId,
                    name: name.trim(),
                    credits: parseInt(credits),
                    duration: parseInt(duration),
                    duration_unit: durationUnit,
                    connections: parseInt(connections)
                });
            }

            console.log(`✅ Found ${packages.length} packages from panel ${this.name}`);

            return packages;

        } catch (error) {
            console.error(`❌ Failed to fetch packages from panel ${this.name}:`, error.message);
            throw error;
        }
    }
}

module.exports = NXTDashPanel;
