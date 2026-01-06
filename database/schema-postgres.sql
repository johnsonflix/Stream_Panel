-- StreamPanel v2 Database Schema (PostgreSQL)-- Converted from SQLite schema-- Tables

CREATE TABLE IF NOT EXISTS admin_notifications (    id SERIAL PRIMARY KEY,    message TEXT NOT NULL,    created_by TEXT,    created_at TIMESTAMP DEFAULT NOW(),    is_read INTEGER DEFAULT 0,    read_at TIMESTAMP,    read_by INTEGER,    related_message_id INTEGER);



CREATE TABLE IF NOT EXISTS dashboard_cache (    id INTEGER PRIMARY KEY CHECK (id = 1),    cache_data TEXT NOT NULL,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS dashboard_cached_stats (    stat_key TEXT PRIMARY KEY,    stat_value TEXT NOT NULL,    stat_type TEXT DEFAULT 'number',    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS dashboard_library_preferences (    id SERIAL PRIMARY KEY,    plex_server_id INTEGER NOT NULL,    library_key TEXT NOT NULL,    library_title TEXT NOT NULL,    library_type TEXT NOT NULL,    display_order INTEGER DEFAULT 0,    is_active INTEGER DEFAULT 1,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE (plex_server_id, library_key));



CREATE TABLE IF NOT EXISTS owners (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    email TEXT UNIQUE NOT NULL,    created_at TIMESTAMP DEFAULT NOW(),    password TEXT DEFAULT NULL,    password_reset_token TEXT DEFAULT NULL,    password_reset_expires TIMESTAMP DEFAULT NULL,    is_first_login INTEGER DEFAULT 1,    telegram_username TEXT DEFAULT NULL,    whatsapp_username TEXT DEFAULT NULL,    discord_username TEXT DEFAULT NULL,    venmo_username TEXT DEFAULT NULL,    paypal_username TEXT DEFAULT NULL,    cashapp_username TEXT DEFAULT NULL,    googlepay_username TEXT DEFAULT NULL,    applecash_username TEXT DEFAULT NULL);



CREATE TABLE IF NOT EXISTS plex_servers (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    url TEXT NOT NULL,    server_id TEXT NOT NULL,    token TEXT NOT NULL,    is_active INTEGER DEFAULT 1,    libraries TEXT,    last_library_sync TEXT,    sync_schedule TEXT DEFAULT 'manual',    last_health_check TEXT,    health_status TEXT DEFAULT 'online',    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    request_site_url TEXT DEFAULT NULL,    last_activity_sync TIMESTAMP,    enable_auto_scan INTEGER DEFAULT 1, last_scan TIMESTAMP);



CREATE TABLE IF NOT EXISTS iptv_panels (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    panel_type TEXT NOT NULL CHECK(panel_type IN ('nxt_dash', 'xui_one', 'one_stream', 'xtream_ui', 'midnight_streamer')),    base_url TEXT NOT NULL,    login_url TEXT,    provider_base_url TEXT,    credentials TEXT NOT NULL,    panel_settings TEXT,    credit_cost_per_connection REAL,    credit_cost_per_month REAL,    current_credit_balance INTEGER DEFAULT 0,    auth_token TEXT,    auth_expires TEXT,    session_data TEXT,    is_active INTEGER DEFAULT 1,    last_sync TEXT,    health_status TEXT DEFAULT 'online' CHECK(health_status IN ('online', 'offline', 'error')),    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    last_health_check TEXT,    m3u_url TEXT DEFAULT NULL,    m3u_last_sync TEXT DEFAULT NULL,    m3u_channel_count INTEGER DEFAULT 0,    m3u_movie_count INTEGER DEFAULT 0,    m3u_series_count INTEGER DEFAULT 0,    iptv_editor_playlist_id INTEGER,    notes TEXT,    user_count INTEGER DEFAULT 0,    active_user_count INTEGER DEFAULT 0,    live_connection_count INTEGER DEFAULT 0,    last_stats_update TEXT DEFAULT NULL,    m3u_channel_logos TEXT DEFAULT NULL);



CREATE TABLE IF NOT EXISTS tags (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL UNIQUE,    color TEXT DEFAULT '#3498db',    auto_assign_enabled INTEGER DEFAULT 0,    auto_assign_rules TEXT,    assignable_to TEXT DEFAULT 'both' CHECK(assignable_to IN ('plex_server', 'iptv_panel', 'both')),    linked_server_id INTEGER REFERENCES plex_servers(id) ON DELETE SET NULL,    linked_panel_id INTEGER REFERENCES iptv_panels(id) ON DELETE SET NULL,    display_order INTEGER DEFAULT 0,    is_active INTEGER DEFAULT 1,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS plex_packages (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    description TEXT,    price REAL,    duration_months INTEGER NOT NULL,    server_library_mappings TEXT NOT NULL,    is_active INTEGER DEFAULT 1,    display_order INTEGER DEFAULT 0,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS iptv_packages (    id SERIAL PRIMARY KEY,    iptv_panel_id INTEGER NOT NULL REFERENCES iptv_panels(id) ON DELETE CASCADE,    package_id TEXT NOT NULL,    name TEXT NOT NULL,    connections INTEGER NOT NULL,    duration_months INTEGER NOT NULL,    credits INTEGER NOT NULL,    package_type TEXT NOT NULL CHECK(package_type IN ('trial', 'basic', 'full', 'live_tv')),    is_active INTEGER DEFAULT 1,    synced_at TIMESTAMP DEFAULT NOW(),    UNIQUE (iptv_panel_id, package_id));



CREATE TABLE IF NOT EXISTS subscription_plans (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    description TEXT,    service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv', 'emby', 'jellyfin', 'combo')),    price REAL NOT NULL DEFAULT 0,    currency TEXT DEFAULT 'USD',    duration_months INTEGER NOT NULL DEFAULT 1,    iptv_connections INTEGER DEFAULT NULL,    iptv_panel_id INTEGER REFERENCES iptv_panels(id) ON DELETE SET NULL,    plex_package_id INTEGER REFERENCES plex_packages(id) ON DELETE SET NULL,    features TEXT DEFAULT '[]',    is_active INTEGER DEFAULT 1,    display_order INTEGER DEFAULT 0,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    price_type TEXT DEFAULT 'fixed',    show_on_portal INTEGER DEFAULT 1,    portal_display_order INTEGER DEFAULT 0,    is_portal_default INTEGER DEFAULT 0,    portal_description TEXT,    iptv_package_id INTEGER REFERENCES iptv_packages(id) ON DELETE SET NULL);



CREATE TABLE IF NOT EXISTS users (    id SERIAL PRIMARY KEY,    name TEXT,    email TEXT,    plex_email TEXT,    plex_package_id INTEGER,    plex_expiration TEXT,    plex_status TEXT,    pending_plex_invites TEXT,    iptv_panel_id INTEGER REFERENCES iptv_panels(id) ON DELETE SET NULL,    iptv_username TEXT,    iptv_password TEXT,    iptv_line_id TEXT,    iptv_package_id INTEGER REFERENCES iptv_packages(id) ON DELETE SET NULL,    iptv_package_name TEXT,    iptv_expiration TEXT,    iptv_connections INTEGER,    iptv_is_trial INTEGER,    iptv_m3u_url TEXT,    iptv_credits_used INTEGER,    iptv_editor_enabled INTEGER,    iptv_editor_m3u_url TEXT,    iptv_editor_epg_url TEXT,    implayer_code TEXT,    device_count INTEGER,    owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL,    notes TEXT,    is_active INTEGER,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    account_type TEXT,    plex_enabled INTEGER,    plex_expiration_date TIMESTAMP,    iptv_enabled INTEGER,    iptv_expiration_date TIMESTAMP,    iptv_duration_months INTEGER,    password_hash TEXT,    role TEXT,    last_login TIMESTAMP,    login_attempts INTEGER,    first_failed_attempt_at TIMESTAMP,    account_locked_until TIMESTAMP,    is_app_user INTEGER,    preferences TEXT,    password_reset_token TEXT,    password_reset_expires TIMESTAMP,    is_first_login INTEGER,    telegram_username TEXT,    whatsapp_username TEXT,    discord_username TEXT,    venmo_username TEXT,    paypal_username TEXT,    cashapp_username TEXT,    google_pay_username TEXT,    apple_cash_username TEXT,    plex_username TEXT,    iptv_email TEXT,    exclude_from_bulk_emails INTEGER,    bcc_owner_on_renewal INTEGER,    plex_last_activity_date TEXT,    plex_days_since_last_activity INTEGER,    plex_activity_sync_timestamp TEXT,    iptv_editor_id TEXT,    iptv_editor_username TEXT,    iptv_editor_password TEXT,    iptv_channel_group_id INTEGER DEFAULT NULL,    iptv_panel_package_id TEXT DEFAULT NULL,    iptv_subscription_plan_id INTEGER DEFAULT NULL,    exclude_from_automated_emails INTEGER DEFAULT 0,    plex_subscription_plan_id INTEGER REFERENCES subscription_plans(id),    plex_sso_enabled INTEGER DEFAULT 0,    plex_sso_server_ids TEXT DEFAULT NULL,    plex_sso_email TEXT DEFAULT NULL,    plex_sso_username TEXT DEFAULT NULL,    plex_sso_thumb TEXT DEFAULT NULL,    plex_sso_last_verified TEXT DEFAULT NULL,    payment_preference TEXT DEFAULT 'global',    custom_payment_methods TEXT DEFAULT '[]',    plex_cancelled_at TEXT DEFAULT NULL,    plex_scheduled_deletion TEXT DEFAULT NULL,    iptv_cancelled_at TEXT DEFAULT NULL,    iptv_scheduled_deletion TEXT DEFAULT NULL,    plex_cancellation_reason TEXT DEFAULT NULL,    iptv_cancellation_reason TEXT DEFAULT NULL,    last_iptv_activity TIMESTAMP,    plex_sso_required INTEGER DEFAULT 0,    rs_has_access INTEGER DEFAULT 1);



CREATE TABLE IF NOT EXISTS email_templates (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL UNIQUE,    subject TEXT NOT NULL,    body TEXT NOT NULL,    template_type TEXT,    category TEXT DEFAULT 'custom',    is_system INTEGER DEFAULT 0,    owner_id INTEGER DEFAULT NULL REFERENCES owners(id) ON DELETE CASCADE,    variables_used TEXT,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    custom_message TEXT DEFAULT '');



CREATE TABLE IF NOT EXISTS email_schedules (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    description TEXT,    template_id INTEGER NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,    schedule_type TEXT NOT NULL CHECK(schedule_type IN ('expiration_reminder', 'specific_date', 'recurring', 'lifecycle_event')),    days_before_expiration INTEGER,    scheduled_date TEXT,    scheduled_time TEXT DEFAULT '12:00',    recurrence_pattern TEXT,    lifecycle_event TEXT,    filter_conditions TEXT DEFAULT '{"mode":"AND","conditions":[]}',    is_active INTEGER DEFAULT 1,    next_run TEXT,    last_run TEXT,    run_count INTEGER DEFAULT 0,    last_run_user_count INTEGER DEFAULT 0,    last_run_status TEXT,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    service_type TEXT DEFAULT 'both');



CREATE TABLE IF NOT EXISTS email_logs (    id SERIAL PRIMARY KEY,    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,    recipient_email TEXT NOT NULL,    subject TEXT NOT NULL,    body TEXT NOT NULL,    status TEXT DEFAULT 'pending' CHECK(status IN ('sent', 'failed', 'pending')),    error_message TEXT,    sent_at TIMESTAMP DEFAULT NOW(),    template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,    schedule_id INTEGER REFERENCES email_schedules(id) ON DELETE SET NULL,    send_type TEXT DEFAULT 'manual' CHECK(send_type IN ('manual', 'scheduled', 'triggered')),    cc TEXT,    bcc TEXT,    metadata TEXT DEFAULT '{}');



CREATE TABLE IF NOT EXISTS guide_cache (    id SERIAL PRIMARY KEY,    source_type TEXT NOT NULL CHECK(source_type IN ('panel', 'playlist')),    source_id INTEGER NOT NULL,    categories_json TEXT,    channels_json TEXT,    total_categories INTEGER DEFAULT 0,    total_channels INTEGER DEFAULT 0,    last_updated TIMESTAMP,    last_error TEXT,    created_at TIMESTAMP DEFAULT NOW(),    epg_json TEXT,    epg_channel_count INTEGER DEFAULT 0,    epg_program_count INTEGER DEFAULT 0,    epg_last_updated TIMESTAMP,    UNIQUE(source_type, source_id));



CREATE TABLE IF NOT EXISTS iptv_activity_log (    id SERIAL PRIMARY KEY,    iptv_panel_id INTEGER REFERENCES iptv_panels(id) ON DELETE SET NULL,    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,    line_id TEXT,    action TEXT NOT NULL CHECK(action IN ('create_trial', 'create_paid', 'extend', 'sync', 'delete', 'error')),    package_id TEXT,    credits_used INTEGER DEFAULT 0,    success INTEGER DEFAULT 1,    error_message TEXT,    api_response TEXT,    created_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS iptv_bouquets (    id SERIAL PRIMARY KEY,    iptv_panel_id INTEGER NOT NULL REFERENCES iptv_panels(id) ON DELETE CASCADE,    bouquet_id TEXT NOT NULL,    name TEXT NOT NULL,    custom_name TEXT,    category TEXT,    is_active INTEGER DEFAULT 1,    synced_at TIMESTAMP DEFAULT NOW(),    UNIQUE (iptv_panel_id, bouquet_id));



CREATE TABLE IF NOT EXISTS iptv_channel_groups (    id SERIAL PRIMARY KEY,    iptv_panel_id INTEGER NOT NULL REFERENCES iptv_panels(id) ON DELETE CASCADE,    name TEXT NOT NULL,    description TEXT,    bouquet_ids TEXT NOT NULL,    editor_channel_ids TEXT DEFAULT '[]',    editor_movie_ids TEXT DEFAULT '[]',    editor_series_ids TEXT DEFAULT '[]',    is_active INTEGER DEFAULT 1,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS iptv_editor_playlists (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    playlist_id TEXT UNIQUE NOT NULL,    bearer_token TEXT,    token_expires TEXT,    max_users INTEGER,    current_user_count INTEGER DEFAULT 0,    playlist_settings TEXT,    is_active INTEGER DEFAULT 1,    last_sync TEXT,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    provider_base_url TEXT DEFAULT '',    provider_username TEXT DEFAULT '',    provider_password TEXT DEFAULT '',    auto_updater_enabled INTEGER DEFAULT 0,    auto_updater_schedule_hours INTEGER DEFAULT 24,    last_auto_updater_run TEXT,    auto_updater_status TEXT DEFAULT 'idle',    username TEXT,    password TEXT,    m3u_code TEXT,    epg_code TEXT,    expiry_date TEXT,    max_connections INTEGER DEFAULT 1,    customer_count INTEGER DEFAULT 0,    channel_count INTEGER DEFAULT 0,    movie_count INTEGER DEFAULT 0,    series_count INTEGER DEFAULT 0,    patterns TEXT DEFAULT '[]',    last_synced TEXT,    guide_m3u_url TEXT,    guide_username TEXT,    guide_password TEXT);



CREATE TABLE IF NOT EXISTS iptv_editor_playlist_channels (    id SERIAL PRIMARY KEY,    playlist_id INTEGER NOT NULL REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE,    channel_data TEXT NOT NULL,    channel_count INTEGER DEFAULT 0,    last_updated TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS iptv_editor_settings (    setting_key TEXT PRIMARY KEY,    setting_value TEXT,    setting_type TEXT DEFAULT 'string',    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS iptv_editor_users (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    iptv_editor_playlist_id INTEGER NOT NULL REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE,    iptv_editor_id INTEGER,    iptv_editor_username TEXT,    iptv_editor_password TEXT,    m3u_code TEXT,    epg_code TEXT,    expiry_date TEXT,    max_connections INTEGER DEFAULT 1,    sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'error')),    last_sync_time TEXT,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE (user_id, iptv_editor_playlist_id));



CREATE TABLE IF NOT EXISTS iptv_sync_logs (    id SERIAL PRIMARY KEY,    sync_type TEXT NOT NULL,    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,    iptv_editor_playlist_id INTEGER REFERENCES iptv_editor_playlists(id) ON DELETE SET NULL,    status TEXT NOT NULL CHECK(status IN ('success', 'error')),    request_data TEXT,    response_data TEXT,    error_message TEXT,    duration_ms INTEGER,    created_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS payment_providers (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    payment_url TEXT NOT NULL,    qr_code_data TEXT,    is_active INTEGER DEFAULT 1,    display_order INTEGER DEFAULT 0,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS plex_user_activity (    id SERIAL PRIMARY KEY,    plex_server_id INTEGER NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,    plex_user_email TEXT NOT NULL,    plex_username TEXT,    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,    last_seen_at TEXT,    days_since_last_activity INTEGER,    is_pending_invite INTEGER DEFAULT 0,    is_active_friend INTEGER DEFAULT 0,    synced_at TIMESTAMP DEFAULT NOW(),    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(plex_server_id, plex_user_email));



CREATE TABLE IF NOT EXISTS portal_announcements (    id SERIAL PRIMARY KEY,    title TEXT NOT NULL,    message TEXT NOT NULL,    type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'error')),    target_audience TEXT NOT NULL DEFAULT 'all' CHECK(target_audience IN ('all', 'plex', 'iptv', 'plex_only', 'iptv_only')),    is_active INTEGER DEFAULT 1,    is_dismissible INTEGER DEFAULT 1,    priority INTEGER DEFAULT 0,    starts_at TIMESTAMP,    expires_at TIMESTAMP,    created_by INTEGER REFERENCES owners(id) ON DELETE SET NULL,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS portal_announcement_dismissals (    id SERIAL PRIMARY KEY,    announcement_id INTEGER NOT NULL REFERENCES portal_announcements(id) ON DELETE CASCADE,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    dismissed_at TIMESTAMP DEFAULT NOW(),    UNIQUE(announcement_id, user_id));



CREATE TABLE IF NOT EXISTS portal_guides (    id SERIAL PRIMARY KEY,    slug TEXT UNIQUE NOT NULL,    title TEXT NOT NULL,    icon TEXT,    icon_type TEXT DEFAULT 'emoji',    service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both', 'general')) DEFAULT 'general',    category TEXT CHECK(category IN ('setup', 'troubleshooting', 'support', 'faq', 'other')) DEFAULT 'setup',    short_description TEXT,    content TEXT,    content_type TEXT CHECK(content_type IN ('html', 'markdown')) DEFAULT 'markdown',    is_public INTEGER DEFAULT 1,    is_visible INTEGER DEFAULT 1,    display_order INTEGER DEFAULT 0,    views INTEGER DEFAULT 0,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    icon_url TEXT);



CREATE TABLE IF NOT EXISTS portal_apps (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    description TEXT,    icon TEXT,    icon_url TEXT,    icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),    service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),    platform_category TEXT CHECK(platform_category IN (        'tv', 'mobile', 'desktop', 'web',        'android_tv', 'android_mobile', 'ios',        'windows', 'macos', 'roku', 'firestick', 'apple_tv'    )),    app_type TEXT CHECK(app_type IN (        'downloader_code', 'store_link', 'direct_url', 'apk', 'web_player',        'play_store', 'mobile_store', 'roku_store', 'appletv_store',        'windows_store', 'windows_download', 'mac_store', 'mac_download'    )),    downloader_code TEXT,    store_url_ios TEXT,    store_url_android TEXT,    store_url_windows TEXT,    store_url_mac TEXT,    direct_url TEXT,    apk_url TEXT,    web_player_url TEXT,    instructions TEXT,    display_order INTEGER DEFAULT 0,    is_active INTEGER DEFAULT 1,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    store_url_roku TEXT,    store_url_appletv TEXT);



CREATE TABLE IF NOT EXISTS portal_app_guides (    id SERIAL PRIMARY KEY,    app_id INTEGER NOT NULL REFERENCES portal_apps(id) ON DELETE CASCADE,    guide_id INTEGER NOT NULL REFERENCES portal_guides(id) ON DELETE CASCADE,    display_order INTEGER DEFAULT 0,    UNIQUE(app_id, guide_id));



CREATE TABLE IF NOT EXISTS portal_messages (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    subject TEXT NOT NULL,    message TEXT NOT NULL,    category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general', 'billing', 'technical', 'cancel_request', 'add_service')),    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'read', 'in_progress', 'resolved', 'closed')),    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),    assigned_to INTEGER REFERENCES owners(id) ON DELETE SET NULL,    admin_notes TEXT,    resolved_at TIMESTAMP,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS portal_quick_actions (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    description TEXT,    icon TEXT,    icon_url TEXT,    icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),    service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),    action_type TEXT CHECK(action_type IN (        'link', 'internal', 'plex_web', 'request_site',        'tv_guide', 'web_player', 'external_url', 'internal_page', 'dynamic'    )),    url TEXT,    dynamic_field TEXT,    button_style TEXT,    display_order INTEGER DEFAULT 0,    is_active INTEGER DEFAULT 1,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS portal_service_requests (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    request_type TEXT NOT NULL CHECK(request_type IN ('add_plex', 'add_iptv', 'cancel_plex', 'cancel_iptv', 'upgrade', 'downgrade')),    service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv')),    details TEXT,    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,    handled_at TIMESTAMP,    admin_notes TEXT,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    subscription_plan_id INTEGER,    payment_status TEXT DEFAULT 'pending',    transaction_reference TEXT,    user_notes TEXT,    processed_at TIMESTAMP,    processed_by INTEGER,    notified_at TIMESTAMP,    provisioning_status TEXT DEFAULT NULL,    provisioned_at TIMESTAMP);



CREATE TABLE IF NOT EXISTS portal_sessions (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    token TEXT NOT NULL UNIQUE,    login_method TEXT NOT NULL DEFAULT 'iptv',    plex_token TEXT,    ip_address TEXT,    user_agent TEXT,    created_at TIMESTAMP DEFAULT NOW(),    expires_at TIMESTAMP NOT NULL,    last_activity TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS sessions (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    session_token TEXT UNIQUE NOT NULL,    ip_address TEXT,    user_agent TEXT,    created_at TIMESTAMP DEFAULT NOW(),    expires_at TIMESTAMP NOT NULL);



CREATE TABLE IF NOT EXISTS settings (    id SERIAL PRIMARY KEY,    setting_key TEXT NOT NULL UNIQUE,    setting_value TEXT,    setting_type TEXT DEFAULT 'string' CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),    description TEXT,    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS subscription_types (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    type TEXT NOT NULL CHECK(type IN ('plex', 'iptv')),    duration_months INTEGER NOT NULL,    number_of_streams INTEGER,    price REAL,    is_active INTEGER DEFAULT 1,    plex_package_id INTEGER REFERENCES plex_packages(id) ON DELETE SET NULL,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS subscriptions (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    subscription_type_id INTEGER REFERENCES subscription_types(id) ON DELETE SET NULL,    start_date TEXT NOT NULL,    expiration_date TEXT,    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled')),    created_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS tag_iptv_panels (    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,    iptv_panel_id INTEGER NOT NULL REFERENCES iptv_panels(id) ON DELETE CASCADE,    created_at TIMESTAMP DEFAULT NOW(),    PRIMARY KEY (tag_id, iptv_panel_id));



CREATE TABLE IF NOT EXISTS tag_plex_servers (    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,    plex_server_id INTEGER NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,    created_at TIMESTAMP DEFAULT NOW(),    PRIMARY KEY (tag_id, plex_server_id));



CREATE TABLE IF NOT EXISTS user_creation_jobs (    id SERIAL PRIMARY KEY,    job_id TEXT UNIQUE NOT NULL,    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,    status TEXT NOT NULL DEFAULT 'pending',    created_at TIMESTAMP NOT NULL DEFAULT NOW(),    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),    user_job_status TEXT DEFAULT 'pending',    user_job_message TEXT,    user_job_error TEXT,    plex_job_status TEXT DEFAULT 'pending',    plex_job_message TEXT,    plex_job_error TEXT,    plex_job_details TEXT,    iptv_job_status TEXT DEFAULT 'pending',    iptv_job_message TEXT,    iptv_job_error TEXT,    iptv_job_details TEXT,    iptv_editor_job_status TEXT DEFAULT 'pending',    iptv_editor_job_message TEXT,    iptv_editor_job_error TEXT,    iptv_editor_job_details TEXT);



CREATE TABLE IF NOT EXISTS user_plex_shares (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    plex_server_id INTEGER NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,    library_ids TEXT,    share_status TEXT DEFAULT 'pending' CHECK(share_status IN ('pending', 'active', 'removed')),    shared_at TIMESTAMP DEFAULT NOW(),    removed_at TEXT,    created_at TEXT,    updated_at TEXT,    UNIQUE (user_id, plex_server_id));



CREATE TABLE IF NOT EXISTS user_preferences (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    preference_key TEXT NOT NULL,    preference_value TEXT,    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(user_id, preference_key));



CREATE TABLE IF NOT EXISTS user_tags (    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,    assigned_at TIMESTAMP DEFAULT NOW(),    assigned_by TEXT DEFAULT 'manual' CHECK(assigned_by IN ('manual', 'auto')),    PRIMARY KEY (user_id, tag_id));

-- Request Site tables

CREATE TABLE IF NOT EXISTS request_site_settings (    id SERIAL PRIMARY KEY,    key TEXT UNIQUE NOT NULL,    value TEXT);

CREATE TABLE IF NOT EXISTS request_settings (    id SERIAL PRIMARY KEY,    setting_key TEXT UNIQUE NOT NULL,    setting_value TEXT,    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS request_site_media (    id SERIAL PRIMARY KEY,    tmdb_id INTEGER NOT NULL,    tvdb_id INTEGER,    imdb_id TEXT,    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),    title TEXT,    overview TEXT,    poster_path TEXT,    backdrop_path TEXT,    release_date TEXT,    vote_average REAL,    genres TEXT,    status TEXT DEFAULT 'unknown',    status_4k TEXT DEFAULT 'unknown',    plex_rating_key TEXT,    plex_rating_key_4k TEXT,    plex_server_id INTEGER,    radarr_id INTEGER,    sonarr_id INTEGER,    media_added_at TIMESTAMP,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(tmdb_id, media_type));



CREATE TABLE IF NOT EXISTS request_site_requests (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    media_id INTEGER NOT NULL REFERENCES request_site_media(id) ON DELETE CASCADE,    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'declined', 'available', 'partially_available', 'processing')),    is_4k INTEGER DEFAULT 0,    requested_at TIMESTAMP DEFAULT NOW(),    processed_at TIMESTAMP,    processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,    notes TEXT);



CREATE TABLE IF NOT EXISTS request_site_seasons (    id SERIAL PRIMARY KEY,    request_id INTEGER NOT NULL REFERENCES request_site_requests(id) ON DELETE CASCADE,    season_number INTEGER NOT NULL,    status TEXT DEFAULT 'pending',    UNIQUE(request_id, season_number));



CREATE TABLE IF NOT EXISTS request_site_blacklist (    id SERIAL PRIMARY KEY,    tmdb_id INTEGER NOT NULL,    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),    title TEXT,    reason TEXT,    blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,    blocked_at TIMESTAMP DEFAULT NOW(),    UNIQUE(tmdb_id, media_type));



CREATE TABLE IF NOT EXISTS request_default_permissions (    id INTEGER PRIMARY KEY CHECK (id = 1),    can_request INTEGER DEFAULT 1,    can_request_4k INTEGER DEFAULT 0,    auto_approve INTEGER DEFAULT 0,    auto_approve_4k INTEGER DEFAULT 0,    auto_approve_movies INTEGER DEFAULT 0,    auto_approve_tv INTEGER DEFAULT 0,    request_limit INTEGER DEFAULT 10,    request_limit_4k INTEGER DEFAULT 5,    request_limit_days INTEGER DEFAULT 7,    request_limit_4k_days INTEGER DEFAULT 7,    movie_limit_per_week INTEGER DEFAULT 5,    movie_limit_days INTEGER DEFAULT 7,    tv_limit_per_week INTEGER DEFAULT 5,    tv_limit_days INTEGER DEFAULT 7,    tv_show_limit INTEGER DEFAULT 5,    tv_show_limit_days INTEGER DEFAULT 7,    tv_season_limit INTEGER DEFAULT 3,    tv_season_limit_days INTEGER DEFAULT 7,    can_request_movies INTEGER DEFAULT 1,    can_request_tv INTEGER DEFAULT 1,    can_request_4k_movie INTEGER DEFAULT 0,    can_request_4k_tv INTEGER DEFAULT 0,    can_approve INTEGER DEFAULT 0,    can_approve_movies INTEGER DEFAULT 0,    can_approve_tv INTEGER DEFAULT 0,    can_approve_4k_movies INTEGER DEFAULT 0,    can_approve_4k_tv INTEGER DEFAULT 0,    movie_4k_limit INTEGER DEFAULT 2,    movie_4k_limit_days INTEGER DEFAULT 7,    tv_show_4k_limit INTEGER DEFAULT 2,    tv_show_4k_limit_days INTEGER DEFAULT 7,    tv_season_4k_limit INTEGER DEFAULT 2,    tv_season_4k_limit_days INTEGER DEFAULT 7);



CREATE TABLE IF NOT EXISTS request_user_permissions (    id SERIAL PRIMARY KEY,    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,    has_custom_permissions INTEGER DEFAULT 0,    can_request INTEGER,    can_request_4k INTEGER,    auto_approve INTEGER,    auto_approve_4k INTEGER,    auto_approve_movies INTEGER,    auto_approve_tv INTEGER,    request_limit INTEGER,    request_limit_4k INTEGER,    request_limit_days INTEGER,    request_limit_4k_days INTEGER,    movie_limit_per_week INTEGER,    movie_limit_days INTEGER,    tv_limit_per_week INTEGER,    tv_limit_days INTEGER,    tv_show_limit INTEGER,    tv_show_limit_days INTEGER,    tv_season_limit INTEGER,    tv_season_limit_days INTEGER,    can_request_movies INTEGER,    can_request_tv INTEGER,    can_request_4k_movie INTEGER,    can_request_4k_tv INTEGER,    can_approve INTEGER,    can_approve_movies INTEGER,    can_approve_tv INTEGER,    can_approve_4k_movies INTEGER,    can_approve_4k_tv INTEGER,    movie_4k_limit INTEGER,    movie_4k_limit_days INTEGER,    tv_show_4k_limit INTEGER,    tv_show_4k_limit_days INTEGER,    tv_season_4k_limit INTEGER,    tv_season_4k_limit_days INTEGER,    updated_at TIMESTAMP DEFAULT NOW());



CREATE TABLE IF NOT EXISTS blocked_media (    id SERIAL PRIMARY KEY,    tmdb_id INTEGER NOT NULL,    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),    title TEXT,    poster_path TEXT,    blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,    blocked_reason TEXT,    created_at TIMESTAMP DEFAULT NOW(),    UNIQUE(tmdb_id, media_type));



CREATE TABLE IF NOT EXISTS media_managers (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    type TEXT NOT NULL CHECK(type IN ('sonarr', 'radarr', 'qbittorrent', 'sabnzbd', 'prowlarr', 'other_arr', 'other')),    url TEXT NOT NULL,    api_key TEXT,    username TEXT,    password TEXT,    is_active INTEGER DEFAULT 1,    is_enabled INTEGER DEFAULT 1,    connection_mode TEXT DEFAULT 'direct',    display_order INTEGER DEFAULT 0,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    icon_url TEXT,    show_in_dropdown INTEGER DEFAULT 1);



CREATE TABLE IF NOT EXISTS request_site_notification_settings (    id SERIAL PRIMARY KEY,    notification_type TEXT NOT NULL,    platform TEXT NOT NULL CHECK(platform IN ('discord', 'telegram', 'webhook', 'email', 'webpush')),    is_enabled INTEGER DEFAULT 0,    config TEXT DEFAULT '{}',    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(notification_type, platform));



CREATE TABLE IF NOT EXISTS request_site_notification_templates (    id SERIAL PRIMARY KEY,    notification_type TEXT NOT NULL,    platform TEXT NOT NULL,    title_template TEXT,    body_template TEXT NOT NULL,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(notification_type, platform));



CREATE TABLE IF NOT EXISTS webpush_subscriptions (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,    endpoint TEXT NOT NULL,    p256dh TEXT NOT NULL,    auth TEXT NOT NULL,    created_at TIMESTAMP DEFAULT NOW(),    UNIQUE(user_id, endpoint));



CREATE TABLE IF NOT EXISTS request_site_webpush_subscriptions (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL,    endpoint TEXT NOT NULL,    p256dh TEXT NOT NULL,    auth TEXT NOT NULL,    user_agent TEXT,    created_at TIMESTAMP DEFAULT NOW(),    UNIQUE(user_id, endpoint));

-- Request Site: Server configurations (Radarr/Sonarr instances)

CREATE TABLE IF NOT EXISTS request_servers (    id SERIAL PRIMARY KEY,    name TEXT NOT NULL,    type TEXT NOT NULL CHECK(type IN ('radarr', 'sonarr')),    url TEXT NOT NULL,    api_key TEXT NOT NULL,    is_default INTEGER DEFAULT 0,    is_4k INTEGER DEFAULT 0,    quality_profile_id INTEGER,    quality_profile_name TEXT,    root_folder_path TEXT,    language_profile_id INTEGER,    tags TEXT DEFAULT '[]',    minimum_availability TEXT DEFAULT 'announced',    search_on_add INTEGER DEFAULT 1,    is_active INTEGER DEFAULT 1,    last_library_sync TIMESTAMP,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW());

-- Request Site: User media requests

CREATE TABLE IF NOT EXISTS media_requests (    id SERIAL PRIMARY KEY,    user_id INTEGER NOT NULL,    tmdb_id INTEGER NOT NULL,    tvdb_id INTEGER,    imdb_id TEXT,    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),    title TEXT NOT NULL,    poster_path TEXT,    backdrop_path TEXT,    overview TEXT,    release_date TEXT,    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'processing', 'available', 'declined', 'failed')),    server_id INTEGER REFERENCES request_servers(id) ON DELETE SET NULL,    external_id INTEGER,    seasons TEXT,    is_4k INTEGER DEFAULT 0,    requested_by TEXT,    approved_by INTEGER,    requested_at TIMESTAMP DEFAULT NOW(),    processed_at TIMESTAMP,    available_at TIMESTAMP,    notes TEXT);

-- Arr library cache tables (for syncing with Radarr/Sonarr)

CREATE TABLE IF NOT EXISTS radarr_library_cache (    id SERIAL PRIMARY KEY,    server_id INTEGER NOT NULL REFERENCES request_servers(id) ON DELETE CASCADE,    radarr_id INTEGER NOT NULL,    tmdb_id INTEGER NOT NULL,    imdb_id TEXT,    title TEXT NOT NULL,    year INTEGER,    has_file INTEGER DEFAULT 0,    monitored INTEGER DEFAULT 1,    quality_profile_id INTEGER,    path TEXT,    size_on_disk BIGINT DEFAULT 0,    added_at TIMESTAMP,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(server_id, tmdb_id));



CREATE TABLE IF NOT EXISTS sonarr_library_cache (    id SERIAL PRIMARY KEY,    server_id INTEGER NOT NULL REFERENCES request_servers(id) ON DELETE CASCADE,    sonarr_id INTEGER NOT NULL,    tvdb_id INTEGER,    tmdb_id INTEGER,    imdb_id TEXT,    title TEXT NOT NULL,    year INTEGER,    total_episodes INTEGER DEFAULT 0,    episode_file_count INTEGER DEFAULT 0,    monitored INTEGER DEFAULT 1,    quality_profile_id INTEGER,    path TEXT,    size_on_disk BIGINT DEFAULT 0,    added_at TIMESTAMP,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(server_id, tvdb_id));

-- Plex GUID cache for TMDB lookups

CREATE TABLE IF NOT EXISTS plex_guid_cache (    id SERIAL PRIMARY KEY,    plex_rating_key TEXT NOT NULL,    plex_server_id INTEGER NOT NULL,    tmdb_id INTEGER,    tvdb_id INTEGER,    imdb_id TEXT,    media_type TEXT,    title TEXT,    year INTEGER,    created_at TIMESTAMP DEFAULT NOW(),    updated_at TIMESTAMP DEFAULT NOW(),    UNIQUE(plex_rating_key, plex_server_id));

-- Migration tracking table

CREATE TABLE IF NOT EXISTS migration_history (    id SERIAL PRIMARY KEY,    migration_name TEXT UNIQUE NOT NULL,    applied_at TIMESTAMP DEFAULT NOW());

-- Indexes

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read);



CREATE INDEX IF NOT EXISTS idx_channel_groups_active ON iptv_channel_groups(is_active);



CREATE INDEX IF NOT EXISTS idx_channel_groups_panel ON iptv_channel_groups(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_dashboard_cached_stats_updated ON dashboard_cached_stats(updated_at);



CREATE INDEX IF NOT EXISTS idx_dashboard_library_prefs_active ON dashboard_library_preferences(is_active);



CREATE INDEX IF NOT EXISTS idx_dashboard_library_prefs_server ON dashboard_library_preferences(plex_server_id);



CREATE INDEX IF NOT EXISTS idx_email_logs_schedule ON email_logs(schedule_id);



CREATE INDEX IF NOT EXISTS idx_email_logs_sent ON email_logs(sent_at);



CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);



CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template_id);



CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(send_type);



CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);



CREATE INDEX IF NOT EXISTS idx_email_logs_user_status ON email_logs(user_id, status);



CREATE INDEX IF NOT EXISTS idx_email_schedules_active ON email_schedules(is_active);



CREATE INDEX IF NOT EXISTS idx_email_schedules_next_run ON email_schedules(next_run);



CREATE INDEX IF NOT EXISTS idx_email_schedules_type ON email_schedules(schedule_type);



CREATE INDEX IF NOT EXISTS idx_email_templates_owner ON email_templates(owner_id);



CREATE INDEX IF NOT EXISTS idx_guide_cache_source ON guide_cache(source_type, source_id);



CREATE INDEX IF NOT EXISTS idx_iptv_activity_log_action ON iptv_activity_log(action);



CREATE INDEX IF NOT EXISTS idx_iptv_activity_log_created ON iptv_activity_log(created_at);



CREATE INDEX IF NOT EXISTS idx_iptv_activity_log_panel ON iptv_activity_log(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_iptv_activity_log_user ON iptv_activity_log(user_id);



CREATE INDEX IF NOT EXISTS idx_iptv_activity_panel_created ON iptv_activity_log(iptv_panel_id, created_at);



CREATE INDEX IF NOT EXISTS idx_iptv_bouquets_category ON iptv_bouquets(category);



CREATE INDEX IF NOT EXISTS idx_iptv_bouquets_panel ON iptv_bouquets(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_iptv_editor_playlist_id ON iptv_editor_playlists(playlist_id);



CREATE INDEX IF NOT EXISTS idx_iptv_packages_panel ON iptv_packages(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_iptv_panels_active ON iptv_panels(is_active);



CREATE INDEX IF NOT EXISTS idx_iptv_panels_panel_type ON iptv_panels(panel_type);



CREATE INDEX IF NOT EXISTS idx_payment_providers_active ON payment_providers(is_active);



CREATE INDEX IF NOT EXISTS idx_playlist_channels_playlist_id ON iptv_editor_playlist_channels(playlist_id);



CREATE INDEX IF NOT EXISTS idx_plex_activity_days_since ON plex_user_activity(days_since_last_activity);



CREATE INDEX IF NOT EXISTS idx_plex_activity_server_email ON plex_user_activity(plex_server_id, plex_user_email);



CREATE INDEX IF NOT EXISTS idx_plex_activity_user_id ON plex_user_activity(user_id);



CREATE INDEX IF NOT EXISTS idx_plex_packages_active ON plex_packages(is_active);



CREATE INDEX IF NOT EXISTS idx_plex_servers_is_active ON plex_servers(is_active);



CREATE INDEX IF NOT EXISTS idx_plex_servers_server_id ON plex_servers(server_id);



CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON portal_sessions(expires_at);



CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(token);



CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(user_id);



CREATE INDEX IF NOT EXISTS idx_service_requests_provisioning ON portal_service_requests(provisioning_status);



CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON portal_service_requests(user_id);



CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);



CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);



CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);



CREATE INDEX IF NOT EXISTS idx_subscription_plans_iptv_package ON subscription_plans(iptv_package_id);



CREATE INDEX IF NOT EXISTS idx_subscription_plans_service_type ON subscription_plans(service_type);



CREATE INDEX IF NOT EXISTS idx_subscription_types_active ON subscription_types(is_active);



CREATE INDEX IF NOT EXISTS idx_subscription_types_type ON subscription_types(type);



CREATE INDEX IF NOT EXISTS idx_subscriptions_expiration ON subscriptions(expiration_date);



CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);



CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);



CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);



CREATE INDEX IF NOT EXISTS idx_tag_iptv_panels_panel_id ON tag_iptv_panels(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_tag_iptv_panels_tag_id ON tag_iptv_panels(tag_id);



CREATE INDEX IF NOT EXISTS idx_tag_plex_servers_server_id ON tag_plex_servers(plex_server_id);



CREATE INDEX IF NOT EXISTS idx_tag_plex_servers_tag_id ON tag_plex_servers(tag_id);



CREATE INDEX IF NOT EXISTS idx_tags_active ON tags(is_active);



CREATE INDEX IF NOT EXISTS idx_user_jobs_job_id ON user_creation_jobs(job_id);



CREATE INDEX IF NOT EXISTS idx_user_jobs_status ON user_creation_jobs(status);



CREATE INDEX IF NOT EXISTS idx_user_jobs_user_id ON user_creation_jobs(user_id);



CREATE INDEX IF NOT EXISTS idx_user_plex_shares_server ON user_plex_shares(plex_server_id);



CREATE INDEX IF NOT EXISTS idx_user_plex_shares_user ON user_plex_shares(user_id);



CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id);



CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag_id);



CREATE INDEX IF NOT EXISTS idx_user_tags_user ON user_tags(user_id);



CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);



CREATE INDEX IF NOT EXISTS idx_users_iptv_channel_group ON users(iptv_channel_group_id);



CREATE INDEX IF NOT EXISTS idx_users_iptv_enabled ON users(iptv_enabled);



CREATE INDEX IF NOT EXISTS idx_users_iptv_panel ON users(iptv_panel_id);



CREATE INDEX IF NOT EXISTS idx_users_iptv_panel_package ON users(iptv_panel_package_id);



CREATE INDEX IF NOT EXISTS idx_users_plex_enabled ON users(plex_enabled);

-- Trigger functions for updated_at timestamps

CREATE OR REPLACE FUNCTION update_updated_at_column()RETURNS TRIGGER AS $$BEGIN    NEW.updated_at = NOW();    RETURN NEW;END;$$ language 'plpgsql';

-- Apply triggersCREATE TRIGGER update_dashboard_library_preferences_updated_at BEFORE UPDATE ON dashboard_library_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_iptv_panels_updated_at BEFORE UPDATE ON iptv_panels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plex_packages_updated_at BEFORE UPDATE ON plex_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_types_updated_at BEFORE UPDATE ON subscription_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_providers_updated_at BEFORE UPDATE ON payment_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default permissions if not exists

INSERT INTO request_default_permissions (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Migration: Add has_custom_permissions column to request_user_permissions if missing

DO $$ BEGIN    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'request_user_permissions' AND column_name = 'has_custom_permissions') THEN        ALTER TABLE request_user_permissions ADD COLUMN has_custom_permissions INTEGER DEFAULT 0;    END IF;END $$;