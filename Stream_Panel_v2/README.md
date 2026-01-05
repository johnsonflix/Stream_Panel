# Stream Panel v2 (PostgreSQL Edition)

This is the PostgreSQL version of Stream Panel, migrated from SQLite for better performance and scalability.

## Quick Start (New Installation)

```bash
# 1. Clone just this folder or download it
cd Stream_Panel_v2

# 2. Create required directories
mkdir -p data uploads backups logs

# 3. Start the containers
docker compose up -d

# 4. Access the app
# Admin: http://localhost:3080
# Portal: http://localhost:3080/portal
```

## Migration from SQLite (Existing Installation)

### Step 1: Backup Your SQLite Database

From your **existing** Stream Panel installation, copy the SQLite database file:
- The file is typically named `subsapp_v2.db` or `database.sqlite`
- Location varies but usually in `/app/data/` or `/app/backend/`

```bash
# From your existing container
docker cp your-container-name:/app/backend/subsapp_v2.db ./backups/database.sqlite
# OR
docker cp your-container-name:/app/data/database.sqlite ./backups/database.sqlite
```

### Step 2: Start the New PostgreSQL Stack

```bash
cd Stream_Panel_v2
mkdir -p data uploads backups logs

# Place your SQLite backup in the backups folder
cp /path/to/your/database.sqlite ./backups/

# Start the containers
docker compose up -d
```

### Step 3: Run the Migration

```bash
# Copy SQLite file into the container
docker cp ./backups/database.sqlite streampanel-v2-app:/app/backups/

# Install sqlite3 module (required for migration)
docker exec streampanel-v2-app npm install sqlite3 --save

# Run the migration script
docker exec streampanel-v2-app node /app/backend/migrations/sqlite-to-postgres.js /app/backups/database.sqlite
```

### Step 4: Verify Migration

```bash
# Check the logs
docker logs streampanel-v2-app

# Connect to PostgreSQL and verify data
docker exec streampanel-v2-postgres psql -U streampanel -d streampanel -c "SELECT COUNT(*) FROM users;"
```

## Environment Variables

The following environment variables can be configured in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `streampanel` | Database name |
| `DB_USER` | `streampanel` | Database user |
| `DB_PASSWORD` | `streampanel_secure_password` | Database password |
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `3080` | Application port |

## Folder Structure

```
Stream_Panel_v2/
├── backend/           # Node.js backend with PostgreSQL support
│   ├── migrations/    # Database migrations including sqlite-to-postgres.js
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   └── ...
├── frontend/          # Web frontend
│   ├── admin/         # Admin dashboard
│   ├── portal/        # User portal
│   └── ...
├── database/          # Database schemas
│   └── schema-postgres.sql  # PostgreSQL schema
├── docker-compose.yml # Docker configuration
├── Dockerfile         # Container build instructions
├── entrypoint.sh      # Container startup script
└── README.md          # This file
```

## Troubleshooting

### Migration Errors

If you encounter errors during migration:

1. **"Column X does not exist"** - The schema might need updating:
   ```bash
   docker exec streampanel-v2-postgres psql -U streampanel -d streampanel -c "ALTER TABLE table_name ADD COLUMN column_name TYPE;"
   ```

2. **"sqlite3 module not found"** - Install it:
   ```bash
   docker exec streampanel-v2-app npm install sqlite3 --save
   ```

3. **Connection refused** - Wait for PostgreSQL to be ready:
   ```bash
   docker exec streampanel-v2-postgres pg_isready -U streampanel
   ```

### Database Access

```bash
# Connect to PostgreSQL CLI
docker exec -it streampanel-v2-postgres psql -U streampanel -d streampanel

# Useful commands inside psql:
\dt                    # List tables
\d table_name          # Describe table
SELECT * FROM users;   # Query data
\q                     # Exit
```

### Logs

```bash
# Application logs
docker logs streampanel-v2-app

# PostgreSQL logs
docker logs streampanel-v2-postgres
```

## Upgrading

To upgrade to a newer version:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose build --no-cache
docker compose down
docker compose up -d
```

## Support

For issues and feature requests, visit: https://github.com/johnsonflix/Stream_Panel
