# Stream Panel - Claude Code Instructions

## Project Context

This is **Stream Panel**, a subscription management platform for Plex and IPTV services.

**GitHub:** https://github.com/johnsonflix/Stream_Panel
**Current Version:** Check `version.json`

---

## Development Workflow

### IMPORTANT: Two-Folder Structure

1. **Development/Testing Folder** (make changes here first):
   ```
   c:\Users\AndrewJohnson\Documents\GitHub\subsapp\v2\Production App\
   ```
   - This runs in local Docker on port 3080
   - Test all changes here FIRST

2. **GitHub Repository Folder** (copy after testing):
   ```
   c:\Users\AndrewJohnson\Documents\GitHub\subsapp\v2\Production App\Stream_Panel\
   ```
   - Copy confirmed working changes here
   - Update version.json
   - Commit and push

### Workflow Steps

1. Make code changes in `Production App/` folder
2. Rebuild local Docker: `docker compose build && docker compose up -d`
3. Test at http://localhost:3080
4. Once confirmed working, copy files to `Stream_Panel/` folder
5. Update `version.json` with new version number
6. Commit with message: `vX.Y.Z - Description`
7. Push to GitHub

---

## Remote Production Server

**Host:** 192.168.10.92
**Path:** /srv/config/streampanel
**SSH:** johnsonflix / Gunshy@1
**URL:** http://192.168.10.92:3080

The remote server has a built-in update system:
- Go to Settings > Updates
- Click "Check for Updates"
- Click "Update Now" to pull from GitHub
- Click "Restart" to apply

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/app.js` | Main Express app, route registration |
| `backend/routes/*.js` | API endpoints |
| `frontend/admin/js/settings.js` | All settings tabs UI |
| `frontend/admin/js/users.js` | User management UI |
| `version.json` | Current version info |
| `docker-compose.yml` | Docker configuration |
| `entrypoint.sh` | Container startup script |

---

## Version Updates

When releasing a new version:

1. Update `version.json`:
```json
{
  "version": "X.Y.Z",
  "name": "Stream Panel",
  "releaseDate": "YYYY-MM-DD",
  "description": "What changed"
}
```

2. Commit with version in message:
```bash
git add -A
git commit -m "vX.Y.Z - Brief description"
git push origin main
```

---

## Common Locations

- **Settings tabs:** `frontend/admin/js/settings.js` (search for `switchTab`)
- **API routes:** `backend/routes/` and registered in `backend/app.js`
- **IPTV panels:** `backend/services/iptv/panels/`
- **Plex services:** `backend/services/plex/`
- **Database migrations:** `backend/migrations/`

---

## See Also

Full documentation: `c:\Users\AndrewJohnson\Documents\GitHub\subsapp\.claude\STREAM_PANEL_GUIDE.md`
