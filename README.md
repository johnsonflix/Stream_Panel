# Stream Panel

A comprehensive subscription and user management platform for Plex and IPTV services.

## Features

- **User Management**: Create, manage, and track subscribers with detailed profiles
- **Plex Integration**: Manage Plex server access, libraries, and user provisioning
- **IPTV Panel Support**: Connect to IPTV panels (XUI, Xtream UI, NXTDash, OneStream) for automated line management
- **Subscription Plans**: Create flexible subscription plans with multiple service combinations
- **Dashboard Analytics**: Real-time statistics and insights on your subscriber base
- **Email System**: Built-in email templates and scheduling for subscriber communications
- **Customer Portal**: Self-service portal for subscribers to manage their accounts
- **Auto-Sync**: Automatic synchronization with Plex servers and IPTV panels
- **Watch Statistics**: Track viewing activity and engagement metrics

## Requirements

- Docker & Docker Compose
- Git (for updates)

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/johnsonflix/Stream_Panel.git
   cd Stream_Panel
   ```

2. Start the application:
   ```bash
   docker compose build
   docker compose up -d
   ```

3. Access the application at `http://localhost:3080`

4. Complete the setup wizard to configure your admin account and services

## Configuration

The application runs on port **3080** by default. Configuration is handled through the web interface after initial setup.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3050 | Internal application port |
| `NODE_ENV` | production | Environment mode |
| `TZ` | America/Chicago | Timezone |
| `DB_PATH` | /app/data/subsapp_v2.db | Database file path |

### Docker Volumes

| Volume | Purpose |
|--------|---------|
| `./data` | SQLite database persistence |
| `./uploads` | Branding and uploaded files |
| `./logs` | Application logs |

## Updating

Stream Panel includes a built-in update system accessible from **Settings > Updates** in the admin panel. You can:

- Check for available updates
- View changelog and version history
- Apply updates with one click

## Project Structure

```
Stream_Panel/
├── backend/           # Node.js Express API
│   ├── routes/        # API endpoints
│   ├── services/      # Business logic
│   ├── middleware/    # Auth and validation
│   ├── migrations/    # Database migrations
│   └── utils/         # Helper functions
├── frontend/          # Web interface
│   ├── admin/         # Admin panel pages
│   ├── portal/        # Customer portal
│   └── js/            # JavaScript modules
├── database/          # SQL schema files
├── docker-compose.yml # Docker configuration
├── Dockerfile         # Container build
└── version.json       # Current version info
```

## Version

Current version: **1.0.0**

## License

Private - All rights reserved

## Support

For issues and feature requests, please use the GitHub Issues page.
