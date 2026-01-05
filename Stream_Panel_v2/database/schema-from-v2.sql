CREATE TABLE admin_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_read INTEGER DEFAULT 0,
                read_at DATETIME,
                read_by INTEGER
            , related_message_id INTEGER);
CREATE TABLE dashboard_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                cache_data TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
CREATE TABLE dashboard_cached_stats (
                stat_key TEXT PRIMARY KEY,
                stat_value TEXT NOT NULL,
                stat_type TEXT DEFAULT 'number',
                updated_at DATETIME DEFAULT (datetime('now'))
            );
CREATE TABLE dashboard_library_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plex_server_id INTEGER NOT NULL,
            library_key TEXT NOT NULL,
            library_title TEXT NOT NULL,
            library_type TEXT NOT NULL,
            display_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),

            FOREIGN KEY (plex_server_id) REFERENCES plex_servers(id) ON DELETE CASCADE,
            UNIQUE (plex_server_id, library_key)
        );
CREATE TABLE email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('sent', 'failed', 'pending')),
  error_message TEXT,
  sent_at TEXT DEFAULT (datetime('now')), template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL, schedule_id INTEGER REFERENCES email_schedules(id) ON DELETE SET NULL, send_type TEXT DEFAULT 'manual' CHECK(send_type IN ('manual', 'scheduled', 'triggered')), cc TEXT, bcc TEXT, metadata TEXT DEFAULT '{}',

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE email_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            template_id INTEGER NOT NULL,

            -- Schedule configuration
            schedule_type TEXT NOT NULL CHECK(schedule_type IN ('expiration_reminder', 'specific_date', 'recurring', 'lifecycle_event')),
            days_before_expiration INTEGER,
            scheduled_date TEXT,
            scheduled_time TEXT DEFAULT '12:00',
            recurrence_pattern TEXT,
            lifecycle_event TEXT,

            -- Filtering (JSON stored as TEXT in SQLite)
            filter_conditions TEXT DEFAULT '{"mode":"AND","conditions":[]}',

            -- Status and tracking
            is_active INTEGER DEFAULT 1,
            next_run TEXT,
            last_run TEXT,
            run_count INTEGER DEFAULT 0,
            last_run_user_count INTEGER DEFAULT 0,
            last_run_status TEXT,

            -- Timestamps
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')), service_type TEXT DEFAULT 'both',

            FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE
        );
CREATE TABLE email_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                template_type TEXT,
                category TEXT DEFAULT 'custom',
                is_system INTEGER DEFAULT 0,
                owner_id INTEGER DEFAULT NULL REFERENCES owners(id) ON DELETE CASCADE,
                variables_used TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            , custom_message TEXT DEFAULT '');
CREATE TABLE guide_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL CHECK(source_type IN ('panel', 'playlist')),
                    source_id INTEGER NOT NULL,
                    categories_json TEXT,
                    channels_json TEXT,
                    total_categories INTEGER DEFAULT 0,
                    total_channels INTEGER DEFAULT 0,
                    last_updated DATETIME,
                    last_error TEXT,
                    created_at DATETIME DEFAULT (datetime('now')), epg_json TEXT, epg_channel_count INTEGER DEFAULT 0, epg_program_count INTEGER DEFAULT 0, epg_last_updated DATETIME,
                    UNIQUE(source_type, source_id)
                );
CREATE TABLE iptv_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iptv_panel_id INTEGER,
  user_id INTEGER,
  line_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('create_trial', 'create_paid', 'extend', 'sync', 'delete', 'error')),
  package_id TEXT,
  credits_used INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  api_response TEXT,  -- JSON stored as TEXT
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE iptv_bouquets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iptv_panel_id INTEGER NOT NULL,
  bouquet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  is_active INTEGER DEFAULT 1,
  synced_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE CASCADE,
  UNIQUE (iptv_panel_id, bouquet_id)
);
CREATE TABLE "iptv_channel_groups" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                iptv_panel_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                bouquet_ids TEXT NOT NULL,

                -- IPTV Editor Integration Fields
                editor_channel_ids TEXT DEFAULT '[]',
                editor_movie_ids TEXT DEFAULT '[]',
                editor_series_ids TEXT DEFAULT '[]',

                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),

                FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE CASCADE
            );
CREATE TABLE iptv_editor_playlist_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            channel_data TEXT NOT NULL,
            channel_count INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE
        );
CREATE TABLE "iptv_editor_playlists" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            playlist_id TEXT UNIQUE NOT NULL,
            bearer_token TEXT,
            token_expires TEXT,
            max_users INTEGER,
            current_user_count INTEGER DEFAULT 0,
            playlist_settings TEXT,
            is_active INTEGER DEFAULT 1,
            last_sync TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            provider_base_url TEXT DEFAULT '',
            provider_username TEXT DEFAULT '',
            provider_password TEXT DEFAULT '',
            auto_updater_enabled INTEGER DEFAULT 0,
            auto_updater_schedule_hours INTEGER DEFAULT 24,
            last_auto_updater_run TEXT,
            auto_updater_status TEXT DEFAULT 'idle',
            username TEXT,
            password TEXT,
            m3u_code TEXT,
            epg_code TEXT,
            expiry_date TEXT,
            max_connections INTEGER DEFAULT 1,
            customer_count INTEGER DEFAULT 0,
            channel_count INTEGER DEFAULT 0,
            movie_count INTEGER DEFAULT 0,
            series_count INTEGER DEFAULT 0,
            patterns TEXT DEFAULT '[]',
            last_synced TEXT
        , guide_m3u_url TEXT, guide_username TEXT, guide_password TEXT);
CREATE TABLE iptv_editor_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT,
            setting_type TEXT DEFAULT 'string',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
CREATE TABLE iptv_editor_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              iptv_editor_playlist_id INTEGER NOT NULL,

              -- Editor Account Details
              iptv_editor_id INTEGER,
              iptv_editor_username TEXT,
              iptv_editor_password TEXT,

              -- Streaming URLs
              m3u_code TEXT,
              epg_code TEXT,

              -- Sync Status
              expiry_date TEXT,
              max_connections INTEGER DEFAULT 1,
              sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'error')),
              last_sync_time TEXT,

              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now')),

              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (iptv_editor_playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE CASCADE,
              UNIQUE (user_id, iptv_editor_playlist_id)
            );
CREATE TABLE iptv_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iptv_panel_id INTEGER NOT NULL,
  package_id TEXT NOT NULL,
  name TEXT NOT NULL,
  connections INTEGER NOT NULL,
  duration_months INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  package_type TEXT NOT NULL CHECK(package_type IN ('trial', 'basic', 'full', 'live_tv')),
  is_active INTEGER DEFAULT 1,
  synced_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE CASCADE,
  UNIQUE (iptv_panel_id, package_id)
);
CREATE TABLE iptv_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,

  -- Panel Type
  panel_type TEXT NOT NULL CHECK(panel_type IN ('nxt_dash', 'xui_one', 'one_stream', 'xtream_ui', 'midnight_streamer')),

  -- Connection Details
  base_url TEXT NOT NULL,
  login_url TEXT,
  provider_base_url TEXT,

  -- Credentials (JSON stored as TEXT)
  credentials TEXT NOT NULL,

  -- Panel-Specific Settings (JSON stored as TEXT)
  panel_settings TEXT,

  -- Cost Tracking
  credit_cost_per_connection REAL,
  credit_cost_per_month REAL,
  current_credit_balance INTEGER DEFAULT 0,

  -- Authentication Cache
  auth_token TEXT,
  auth_expires TEXT,
  session_data TEXT,  -- JSON stored as TEXT

  -- Status
  is_active INTEGER DEFAULT 1,
  last_sync TEXT,
  health_status TEXT DEFAULT 'online' CHECK(health_status IN ('online', 'offline', 'error')),

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, last_health_check TEXT, m3u_url TEXT DEFAULT NULL, m3u_last_sync TEXT DEFAULT NULL, m3u_channel_count INTEGER DEFAULT 0, m3u_movie_count INTEGER DEFAULT 0, m3u_series_count INTEGER DEFAULT 0, iptv_editor_playlist_id TEXT, notes TEXT, user_count INTEGER DEFAULT 0, active_user_count INTEGER DEFAULT 0, live_connection_count INTEGER DEFAULT 0, last_stats_update TEXT DEFAULT NULL, m3u_channel_logos TEXT DEFAULT NULL);
CREATE TABLE iptv_sync_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sync_type TEXT NOT NULL,
              user_id INTEGER,
              iptv_editor_playlist_id INTEGER,
              status TEXT NOT NULL CHECK(status IN ('success', 'error')),
              request_data TEXT,  -- JSON stored as TEXT
              response_data TEXT,  -- JSON stored as TEXT
              error_message TEXT,
              duration_ms INTEGER,
              created_at TEXT DEFAULT (datetime('now')),

              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
              FOREIGN KEY (iptv_editor_playlist_id) REFERENCES iptv_editor_playlists(id) ON DELETE SET NULL
            );
CREATE TABLE owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
, password TEXT DEFAULT NULL, password_reset_token TEXT DEFAULT NULL, password_reset_expires DATETIME DEFAULT NULL, is_first_login INTEGER DEFAULT 1, telegram_username TEXT DEFAULT NULL, whatsapp_username TEXT DEFAULT NULL, discord_username TEXT DEFAULT NULL, venmo_username TEXT DEFAULT NULL, paypal_username TEXT DEFAULT NULL, cashapp_username TEXT DEFAULT NULL, googlepay_username TEXT DEFAULT NULL, applecash_username TEXT DEFAULT NULL);
CREATE TABLE payment_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                payment_url TEXT NOT NULL,
                qr_code_data TEXT,
                is_active INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
CREATE TABLE plex_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,

  -- Pricing
  price REAL,
  duration_months INTEGER NOT NULL,

  -- Server + Library Mapping (JSON stored as TEXT)
  server_library_mappings TEXT NOT NULL,

  -- Status
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE "plex_servers" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                server_id TEXT NOT NULL,
                token TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                libraries TEXT,
                last_library_sync TEXT,
                sync_schedule TEXT DEFAULT 'manual',
                last_health_check TEXT,
                health_status TEXT DEFAULT 'online',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            , request_site_url TEXT DEFAULT NULL);
CREATE TABLE plex_user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plex_server_id INTEGER NOT NULL,
                plex_user_email TEXT NOT NULL,
                plex_username TEXT,
                user_id INTEGER,
                last_seen_at TEXT,
                days_since_last_activity INTEGER,
                is_pending_invite INTEGER DEFAULT 0,
                is_active_friend INTEGER DEFAULT 0,
                synced_at TEXT DEFAULT (datetime('now')),
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (plex_server_id) REFERENCES plex_servers(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE(plex_server_id, plex_user_email)
            );
CREATE TABLE portal_announcement_dismissals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                announcement_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (announcement_id) REFERENCES portal_announcements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(announcement_id, user_id)
            );
CREATE TABLE portal_announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'error')),
                target_audience TEXT NOT NULL DEFAULT 'all' CHECK(target_audience IN ('all', 'plex', 'iptv', 'plex_only', 'iptv_only')),
                is_active INTEGER DEFAULT 1,
                is_dismissible INTEGER DEFAULT 1,
                priority INTEGER DEFAULT 0,
                starts_at DATETIME,
                expires_at DATETIME,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES owners(id) ON DELETE SET NULL
            );
CREATE TABLE portal_app_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            guide_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (app_id) REFERENCES portal_apps(id) ON DELETE CASCADE,
            FOREIGN KEY (guide_id) REFERENCES portal_guides(id) ON DELETE CASCADE,
            UNIQUE(app_id, guide_id)
        );
CREATE TABLE "portal_apps" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            icon_url TEXT,
            icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),
            platform_category TEXT CHECK(platform_category IN (
                'tv', 'mobile', 'desktop', 'web',
                'android_tv', 'android_mobile', 'ios',
                'windows', 'macos', 'roku', 'firestick', 'apple_tv'
            )),
            app_type TEXT CHECK(app_type IN (
                'downloader_code', 'store_link', 'direct_url', 'apk', 'web_player',
                'play_store', 'mobile_store', 'roku_store', 'appletv_store',
                'windows_store', 'windows_download', 'mac_store', 'mac_download'
            )),
            downloader_code TEXT,
            store_url_ios TEXT,
            store_url_android TEXT,
            store_url_windows TEXT,
            store_url_mac TEXT,
            direct_url TEXT,
            apk_url TEXT,
            web_player_url TEXT,
            instructions TEXT,
            display_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            store_url_roku TEXT,
            store_url_appletv TEXT
        );
CREATE TABLE portal_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            icon TEXT,
            icon_type TEXT DEFAULT 'emoji',
            service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both', 'general')) DEFAULT 'general',
            category TEXT CHECK(category IN ('setup', 'troubleshooting', 'support', 'faq', 'other')) DEFAULT 'setup',
            short_description TEXT,
            content TEXT,
            content_type TEXT CHECK(content_type IN ('html', 'markdown')) DEFAULT 'markdown',
            is_public INTEGER DEFAULT 1,
            is_visible INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        , icon_url TEXT);
CREATE TABLE portal_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general', 'billing', 'technical', 'cancel_request', 'add_service')),
                status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'read', 'in_progress', 'resolved', 'closed')),
                priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
                assigned_to INTEGER,
                admin_notes TEXT,
                resolved_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_to) REFERENCES owners(id) ON DELETE SET NULL
            );
CREATE TABLE "portal_quick_actions" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    icon TEXT,
                    icon_url TEXT,
                    icon_type TEXT DEFAULT 'emoji' CHECK(icon_type IN ('emoji', 'image', 'url')),
                    service_type TEXT CHECK(service_type IN ('plex', 'iptv', 'both')),
                    action_type TEXT CHECK(action_type IN (
                        'link', 'internal', 'plex_web', 'request_site',
                        'tv_guide', 'web_player', 'external_url', 'internal_page', 'dynamic'
                    )),
                    url TEXT,
                    dynamic_field TEXT,
                    button_style TEXT,
                    display_order INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );
CREATE TABLE portal_service_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                request_type TEXT NOT NULL CHECK(request_type IN ('add_plex', 'add_iptv', 'cancel_plex', 'cancel_iptv', 'upgrade', 'downgrade')),
                service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv')),
                details TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
                handled_by INTEGER,
                handled_at DATETIME,
                admin_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, subscription_plan_id INTEGER, payment_status TEXT DEFAULT 'pending', transaction_reference TEXT, user_notes TEXT, processed_at DATETIME, processed_by INTEGER, notified_at DATETIME, provisioning_status TEXT DEFAULT NULL, provisioned_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
            );
CREATE TABLE portal_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                login_method TEXT NOT NULL DEFAULT 'iptv',
                plex_token TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT DEFAULT 'string' CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE subscription_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,

                -- Service type
                service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv', 'emby', 'jellyfin', 'combo')),

                -- Pricing
                price REAL NOT NULL DEFAULT 0,
                currency TEXT DEFAULT 'USD',

                -- Duration
                duration_months INTEGER NOT NULL DEFAULT 1,

                -- IPTV specific fields
                iptv_connections INTEGER DEFAULT NULL,
                iptv_panel_id INTEGER DEFAULT NULL,

                -- Plex specific fields
                plex_package_id INTEGER DEFAULT NULL,

                -- Features (JSON array for extensibility)
                features TEXT DEFAULT '[]',

                -- Display & Status
                is_active INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,

                -- Timestamps
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')), price_type TEXT DEFAULT 'fixed', show_on_portal INTEGER DEFAULT 1, portal_display_order INTEGER DEFAULT 0, is_portal_default INTEGER DEFAULT 0, portal_description TEXT, iptv_package_id INTEGER DEFAULT NULL
            REFERENCES iptv_packages(id) ON DELETE SET NULL,

                -- Foreign Keys
                FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL,
                FOREIGN KEY (plex_package_id) REFERENCES plex_packages(id) ON DELETE SET NULL
            );
CREATE TABLE subscription_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('plex', 'iptv')),
  duration_months INTEGER NOT NULL,
  number_of_streams INTEGER,
  price REAL,
  is_active INTEGER DEFAULT 1,

  -- Link to plex_packages
  plex_package_id INTEGER,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (plex_package_id) REFERENCES plex_packages(id) ON DELETE SET NULL
);
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_type_id INTEGER,
  start_date TEXT NOT NULL,
  expiration_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_type_id) REFERENCES subscription_types(id) ON DELETE SET NULL
);
CREATE TABLE tag_iptv_panels (
                tag_id INTEGER NOT NULL,
                iptv_panel_id INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),

                PRIMARY KEY (tag_id, iptv_panel_id),
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE CASCADE
            );
CREATE TABLE tag_plex_servers (
                tag_id INTEGER NOT NULL,
                plex_server_id INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),

                PRIMARY KEY (tag_id, plex_server_id),
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                FOREIGN KEY (plex_server_id) REFERENCES plex_servers(id) ON DELETE CASCADE
            );
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3498db',

  -- Auto-Assignment Rules (JSON stored as TEXT)
  auto_assign_enabled INTEGER DEFAULT 0,
  auto_assign_rules TEXT,

  -- Scope
  assignable_to TEXT DEFAULT 'both' CHECK(assignable_to IN ('plex_server', 'iptv_panel', 'both')),
  linked_server_id INTEGER,
  linked_panel_id INTEGER,

  -- Display
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (linked_server_id) REFERENCES plex_servers(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL
);
CREATE TABLE user_creation_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),

            -- Job results
            user_job_status TEXT DEFAULT 'pending',
            user_job_message TEXT,
            user_job_error TEXT,

            plex_job_status TEXT DEFAULT 'pending',
            plex_job_message TEXT,
            plex_job_error TEXT,
            plex_job_details TEXT,

            iptv_job_status TEXT DEFAULT 'pending',
            iptv_job_message TEXT,
            iptv_job_error TEXT,
            iptv_job_details TEXT,

            iptv_editor_job_status TEXT DEFAULT 'pending',
            iptv_editor_job_message TEXT,
            iptv_editor_job_error TEXT,
            iptv_editor_job_details TEXT,

            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
CREATE TABLE user_plex_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plex_server_id INTEGER NOT NULL,
  library_ids TEXT,  -- JSON stored as TEXT
  share_status TEXT DEFAULT 'pending' CHECK(share_status IN ('pending', 'active', 'removed')),
  shared_at TEXT DEFAULT (datetime('now')),
  removed_at TEXT, created_at TEXT, updated_at TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plex_server_id) REFERENCES plex_servers(id) ON DELETE CASCADE,
  UNIQUE (user_id, plex_server_id)
);
CREATE TABLE user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, preference_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
CREATE TABLE user_tags (
  user_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  assigned_by TEXT DEFAULT 'manual' CHECK(assigned_by IN ('manual', 'auto')),

  PRIMARY KEY (user_id, tag_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE "users" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            plex_email TEXT,
            plex_package_id INTEGER,
            plex_expiration TEXT,
            plex_status TEXT,
            pending_plex_invites TEXT,
            iptv_panel_id INTEGER,
            iptv_username TEXT,
            iptv_password TEXT,
            iptv_line_id TEXT,
            iptv_package_id TEXT,
            iptv_package_name TEXT,
            iptv_expiration TEXT,
            iptv_connections INTEGER,
            iptv_is_trial INTEGER,
            iptv_m3u_url TEXT,
            iptv_credits_used INTEGER,
            iptv_editor_enabled INTEGER,
            iptv_editor_m3u_url TEXT,
            iptv_editor_epg_url TEXT,
            implayer_code TEXT,
            device_count INTEGER,
            owner_id INTEGER,
            notes TEXT,
            is_active INTEGER,
            created_at TEXT,
            updated_at TEXT,
            account_type TEXT,
            plex_enabled INTEGER,
            plex_expiration_date TEXT,
            iptv_enabled INTEGER,
            iptv_expiration_date TEXT,
            iptv_duration_months INTEGER,
            password_hash TEXT,
            role TEXT,
            last_login TEXT,
            login_attempts INTEGER,
            account_locked_until TEXT,
            is_app_user INTEGER,
            preferences TEXT,
            password_reset_token TEXT,
            password_reset_expires DATETIME,
            is_first_login INTEGER,
            telegram_username TEXT,
            whatsapp_username TEXT,
            discord_username TEXT,
            venmo_username TEXT,
            paypal_username TEXT,
            cashapp_username TEXT,
            google_pay_username TEXT,
            apple_cash_username TEXT,
            plex_username TEXT,
            iptv_email TEXT,
            exclude_from_bulk_emails INTEGER,
            bcc_owner_on_renewal INTEGER,
            plex_last_activity_date TEXT,
            plex_days_since_last_activity INTEGER,
            plex_activity_sync_timestamp TEXT,
            iptv_editor_id TEXT,
            iptv_editor_username TEXT,
            iptv_editor_password TEXT, iptv_channel_group_id INTEGER DEFAULT NULL, iptv_panel_package_id TEXT DEFAULT NULL, iptv_subscription_plan_id INTEGER DEFAULT NULL, exclude_from_automated_emails INTEGER DEFAULT 0, plex_subscription_plan_id INTEGER REFERENCES subscription_plans(id), plex_sso_enabled INTEGER DEFAULT 0, plex_sso_server_ids TEXT DEFAULT NULL, plex_sso_email TEXT DEFAULT NULL, plex_sso_username TEXT DEFAULT NULL, plex_sso_thumb TEXT DEFAULT NULL, plex_sso_last_verified TEXT DEFAULT NULL, payment_preference TEXT DEFAULT 'global', custom_payment_methods TEXT DEFAULT '[]', plex_cancelled_at TEXT DEFAULT NULL, plex_scheduled_deletion TEXT DEFAULT NULL, iptv_cancelled_at TEXT DEFAULT NULL, iptv_scheduled_deletion TEXT DEFAULT NULL, plex_cancellation_reason TEXT DEFAULT NULL, iptv_cancellation_reason TEXT DEFAULT NULL, last_iptv_activity DATETIME,

            -- Foreign Keys (only the ones we want to keep)
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL,
            FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL
        );
