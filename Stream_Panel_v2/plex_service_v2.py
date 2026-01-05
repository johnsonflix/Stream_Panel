#!/usr/bin/env python3
"""
V2 Python Plex Service - Compatible with v2 Node.js API
Accepts individual server configs instead of hardcoded server groups
"""

import sys
import json
import signal
import platform
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from plexapi.myplex import MyPlexAccount
from plexapi.exceptions import PlexApiException, NotFound

# Timeout handler (Unix only - Windows doesn't support SIGALRM)
class TimeoutError(Exception):
    pass

# Only set up signal handlers on Unix systems
IS_UNIX = platform.system() != 'Windows'

if IS_UNIX:
    def timeout_handler(signum, frame):
        raise TimeoutError("Operation timed out")
    signal.signal(signal.SIGALRM, timeout_handler)

def set_timeout(seconds):
    """Set timeout (Unix only)"""
    if IS_UNIX:
        signal.alarm(seconds)

def clear_timeout():
    """Clear timeout (Unix only)"""
    if IS_UNIX:
        signal.alarm(0)

def log_error(message):
    """Log errors to stderr for Node.js to capture"""
    print(f"ERROR: {message}", file=sys.stderr)

def log_info(message):
    """Log info to stderr for Node.js to capture"""
    print(f"INFO: {message}", file=sys.stderr)

def share_libraries_on_server(user_email, server_config, library_ids):
    """
    Share specific libraries with a user on a single Plex server

    Args:
        user_email: User's email address
        server_config: {name, server_id, token}
        library_ids: Array of library IDs to share (as strings)

    Returns:
        {success, message, details}
    """
    try:
        log_info(f"Connecting to {server_config['name']} (server_id: {server_config['server_id']})...")

        # Set 60 second timeout for Plex API operations
        set_timeout(60)

        # Connect to MyPlex account
        account = MyPlexAccount(token=server_config['token'])
        log_info(f"Connected to Plex account: {account.username}")

        # Find the server resource
        server_resource = None
        for resource in account.resources():
            if resource.clientIdentifier == server_config['server_id']:
                server_resource = resource
                break

        if not server_resource:
            clear_timeout()
            return {
                "success": False,
                "message": f"Server {server_config['server_id']} not found",
                "server": server_config['name']
            }

        # Connect to the server
        server = server_resource.connect()
        log_info(f"Connected to server: {server.friendlyName}")

        # Get all libraries on this server
        all_sections = server.library.sections()
        section_map = {str(section.key): section for section in all_sections}

        log_info(f"Available libraries: {[f'{s.key}:{s.title}' for s in all_sections]}")
        log_info(f"Requested library IDs: {library_ids}")

        # Handle empty library_ids as "remove all access from this server"
        if not library_ids or len(library_ids) == 0:
            log_info(f"Empty library_ids - removing all library access from server {server_config['name']}")

            # Check if user exists
            try:
                existing_user = account.user(user_email)
                log_info(f"Found user {existing_user.username} - checking server access...")

                # Check if user has access to this specific server
                has_server_access = False
                for server_access in existing_user.servers:
                    if server_access.machineIdentifier == server_config['server_id']:
                        has_server_access = True
                        break

                if not has_server_access:
                    log_info(f"User {existing_user.username} does not have access to this server - nothing to remove")
                    clear_timeout()
                    return {
                        "success": True,
                        "message": f"User has no access to {server_config['name']} - nothing to remove",
                        "server": server_config['name'],
                        "libraries_shared": 0
                    }

                log_info(f"User has access to server - removing library access...")

                # Update with empty sections to remove all library access
                try:
                    account.updateFriend(
                        user=existing_user,
                        server=server,
                        sections=[],
                        allowSync=False,
                        allowCameraUpload=False,
                        allowChannels=False,
                        filterMovies=None,
                        filterTelevision=None,
                        filterMusic=None
                    )
                    log_info(f"Successfully removed library access")
                except PlexApiException as update_error:
                    if "404" in str(update_error):
                        # updateFriend with empty sections fails with 404
                        # Use DELETE shared_servers API to remove just this server's share
                        log_info(f"updateFriend failed with 404, using DELETE shared_servers API...")
                        try:
                            # Get the shared_servers list for this server
                            import xml.etree.ElementTree as ET
                            headers = {"X-Plex-Token": server_config['token']}
                            shared_response = requests.get(
                                f"https://plex.tv/api/servers/{server.machineIdentifier}/shared_servers",
                                headers=headers
                            )

                            if shared_response.status_code == 200:
                                root = ET.fromstring(shared_response.text)
                                target_share_id = None

                                for shared_server in root.findall('SharedServer'):
                                    email = shared_server.get('email')
                                    username = shared_server.get('username')
                                    if email == user_email or username == existing_user.username:
                                        target_share_id = shared_server.get('id')
                                        log_info(f"Found share ID {target_share_id} for user {username}")
                                        break

                                if target_share_id:
                                    delete_url = f"https://plex.tv/api/servers/{server.machineIdentifier}/shared_servers/{target_share_id}"
                                    delete_response = requests.delete(delete_url, headers=headers)
                                    if delete_response.status_code == 200:
                                        log_info(f"Successfully deleted share ID {target_share_id}")
                                    else:
                                        log_info(f"Failed to delete share: {delete_response.status_code}")
                                else:
                                    log_info(f"User's share not found in shared_servers list")
                            else:
                                log_info(f"Failed to get shared_servers: {shared_response.status_code}")
                        except Exception as delete_error:
                            log_info(f"Error during share deletion: {delete_error}")
                    else:
                        raise

                clear_timeout()
                return {
                    "success": True,
                    "message": f"Removed all library access for {user_email} on {server_config['name']}",
                    "server": server_config['name'],
                    "libraries_shared": 0,
                    "library_details": []
                }
            except NotFound:
                log_info(f"User {user_email} not found on Plex - nothing to remove")
                clear_timeout()
                return {
                    "success": True,
                    "message": f"User {user_email} not found - no action needed",
                    "server": server_config['name'],
                    "libraries_shared": 0
                }
            except PlexApiException as e:
                if "404" in str(e):
                    log_info(f"Received 404 error during removal, likely already removed: {e}")
                    clear_timeout()
                    return {
                        "success": True,
                        "message": f"Library access removed (404 ignored)",
                        "server": server_config['name'],
                        "libraries_shared": 0,
                        "warning": "404 error ignored - verify manually if needed"
                    }
                else:
                    raise

        # Validate requested library IDs
        valid_library_ids = []
        for lib_id in library_ids:
            lib_id_str = str(lib_id)
            if lib_id_str in section_map:
                valid_library_ids.append(section_map[lib_id_str])
            else:
                log_error(f"Library ID {lib_id} not found on server")

        if not valid_library_ids:
            clear_timeout()
            return {
                "success": False,
                "message": "No valid library IDs provided",
                "server": server_config['name']
            }

        # Check if user already exists
        existing_user = None
        try:
            existing_user = account.user(user_email)
            log_info(f"Found existing user: {existing_user.username}")
        except NotFound:
            log_info(f"User {user_email} not found - will invite")

        # Share libraries with user
        if existing_user:
            # Update existing user
            log_info(f"Updating library access for existing user...")
            try:
                account.updateFriend(
                    user=existing_user,
                    server=server,
                    sections=valid_library_ids,
                    allowSync=False,
                    allowCameraUpload=False,
                    allowChannels=False,
                    filterMovies=None,
                    filterTelevision=None,
                    filterMusic=None
                )
                clear_timeout()
                return {
                    "success": True,
                    "message": f"Updated library access for {user_email}",
                    "server": server_config['name'],
                    "libraries_shared": len(valid_library_ids),
                    "library_details": [{"id": str(lib.key), "name": lib.title} for lib in valid_library_ids]
                }
            except PlexApiException as e:
                # Check if it's a 404 error - these often succeed despite the error
                if "404" in str(e):
                    log_info(f"Received 404 error, but operation likely succeeded: {e}")
                    clear_timeout()
                    return {
                        "success": True,
                        "message": f"Library access updated (404 ignored)",
                        "server": server_config['name'],
                        "libraries_shared": len(valid_library_ids),
                        "library_details": [{"id": str(lib.key), "name": lib.title} for lib in valid_library_ids],
                        "warning": "404 error ignored - verify manually if needed"
                    }
                else:
                    raise
        else:
            # Invite new user
            log_info(f"Inviting new user {user_email}...")
            account.inviteFriend(
                user=user_email,
                server=server,
                sections=valid_library_ids,
                allowSync=False,
                allowCameraUpload=False,
                allowChannels=False
            )

            log_info(f"Invite sent for {user_email}")
            clear_timeout()
            return {
                "success": True,
                "message": f"Invited {user_email} to server",
                "server": server_config['name'],
                "libraries_shared": len(valid_library_ids),
                "library_details": [{"id": str(lib.key), "name": lib.title} for lib in valid_library_ids],
                "invite_sent": True
            }

    except TimeoutError:
        clear_timeout()
        log_error("Operation timed out (>60s)")
        return {
            "success": False,
            "message": "Operation timed out",
            "server": server_config.get('name', 'unknown')
        }
    except Exception as e:
        clear_timeout()
        log_error(f"Error sharing libraries: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "server": server_config.get('name', 'unknown')
        }

def remove_user(user_identifier, server_config):
    """
    Remove a user's access from a Plex server

    Args:
        user_identifier: User's email, username, or Plex username
        server_config: {name, server_id, token}

    Returns:
        {success, message}
    """
    try:
        log_info(f"Removing user '{user_identifier}' from {server_config['name']} (server_id: {server_config['server_id']})...")

        # Set 60 second timeout
        set_timeout(60)

        # Connect to MyPlex account
        account = MyPlexAccount(token=server_config['token'])
        log_info(f"Connected to Plex account: {account.username}")

        # Try to find the user - first direct lookup, then search through friends
        existing_user = None

        # Try direct lookup by email/username
        try:
            existing_user = account.user(user_identifier)
            log_info(f"Found user via direct lookup: {existing_user.username} (ID: {existing_user.id})")
        except NotFound:
            log_info(f"Direct lookup failed for '{user_identifier}', searching through friends list...")

            # Search through all friends for a match
            friends = account.users()
            user_identifier_lower = user_identifier.lower()

            for friend in friends:
                # Check if username matches
                if friend.username and friend.username.lower() == user_identifier_lower:
                    existing_user = friend
                    log_info(f"Found user by username match: {friend.username}")
                    break
                # Check if email matches
                if friend.email and friend.email.lower() == user_identifier_lower:
                    existing_user = friend
                    log_info(f"Found user by email match: {friend.username} ({friend.email})")
                    break
                # Check if title matches (sometimes displayed name)
                if hasattr(friend, 'title') and friend.title and friend.title.lower() == user_identifier_lower:
                    existing_user = friend
                    log_info(f"Found user by title match: {friend.title}")
                    break

        if existing_user:
            log_info(f"Removing user: {existing_user.username} (ID: {existing_user.id})")
            account.removeFriend(existing_user)
            log_info(f"Successfully removed '{user_identifier}' from account")

            clear_timeout()
            return {
                "success": True,
                "message": f"Successfully removed {user_identifier}",
                "server": server_config['name']
            }
        else:
            log_info(f"User '{user_identifier}' not found in friends list")

            # Check if there's a pending invite to cancel
            log_info("Checking for pending invites to cancel...")
            pending = account.pendingInvites(includeSent=True)
            invite_found = False

            for invite in pending:
                # Check both email and username for pending invites
                invite_email = invite.email.lower() if invite.email else ''
                invite_username = invite.username.lower() if hasattr(invite, 'username') and invite.username else ''

                if invite_email == user_identifier.lower() or invite_username == user_identifier.lower():
                    log_info(f"Found pending invite for {user_identifier}, canceling...")
                    account.cancelInvite(invite)
                    invite_found = True
                    log_info(f"Canceled pending invite for {user_identifier}")
                    break

            clear_timeout()
            if invite_found:
                return {
                    "success": True,
                    "message": f"Canceled pending invite for {user_identifier}",
                    "server": server_config['name']
                }
            else:
                return {
                    "success": True,
                    "message": f"User {user_identifier} not found on server (already removed or never invited)",
                    "server": server_config['name']
                }

    except TimeoutError:
        clear_timeout()
        log_error("Operation timed out (>60s)")
        return {
            "success": False,
            "message": "Operation timed out",
            "server": server_config.get('name', 'unknown')
        }
    except Exception as e:
        clear_timeout()
        log_error(f"Error removing user: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "server": server_config.get('name', 'unknown')
        }

def check_user_info(user_email, server_config):
    """
    Quickly verify if a user has been shared with (exists or has pending invite)

    Args:
        user_email: User's email address
        server_config: {name, server_id, token}

    Returns:
        {success, user_info, server}
    """
    try:
        log_info(f"Verifying user share status for {user_email}...")

        # Set 15 second timeout (reduced from 60s since we're doing less work)
        set_timeout(15)

        # Connect to MyPlex account
        account = MyPlexAccount(token=server_config['token'])
        log_info(f"Connected to Plex account: {account.username}")

        # Check if user exists or has pending invite
        user_info = {
            "email": user_email,
            "exists": False,
            "pending_invite": False,
            "username": None,
            "user_id": None
        }

        # Try to find existing user
        try:
            existing_user = account.user(user_email)
            log_info(f"✅ User exists: {existing_user.username} (ID: {existing_user.id})")

            user_info["exists"] = True
            user_info["username"] = existing_user.username
            user_info["user_id"] = str(existing_user.id)

            # Quick check if user has access to this specific server
            has_server_access = False
            for server_access in existing_user.servers:
                if server_access.machineIdentifier == server_config['server_id']:
                    has_server_access = True
                    log_info(f"✅ User has access to server {server_config['name']}")
                    break

            if not has_server_access:
                log_info(f"⚠️ User exists but no access to server {server_config['name']}")

        except NotFound:
            log_info(f"User {user_email} not found in friends list, checking pending invites...")

            # Check pending invites
            pending = account.pendingInvites(includeSent=True)
            for invite in pending:
                if invite.email.lower() == user_email.lower():
                    log_info(f"✅ Found pending invite for {user_email}")
                    user_info["pending_invite"] = True
                    break

            if not user_info["pending_invite"]:
                log_info(f"❌ No pending invite found for {user_email}")

        clear_timeout()
        return {
            "success": True,
            "server": server_config['name'],
            "server_id": server_config['server_id'],
            "user_info": user_info
        }

    except TimeoutError:
        clear_timeout()
        log_error("Verification timed out (>15s)")
        return {
            "success": False,
            "message": "Verification timed out",
            "server": server_config.get('name', 'unknown')
        }
    except Exception as e:
        clear_timeout()
        log_error(f"Error verifying user: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "server": server_config.get('name', 'unknown')
        }

def get_all_users_with_activity(server_config):
    """
    Get all users on a server with their watch activity (last seen date)
    Uses the fast Plex Users API approach

    Args:
        server_config: {name, url, server_id, token}

    Returns:
        {success, users: [{email, username, user_id, last_seen_at, days_since_last_activity}], pending_invites}
    """
    try:
        log_info(f"Fetching all users and activity for {server_config['name']}...")

        # Set 90 second timeout
        set_timeout(90)

        users_list = []
        pending_invites_list = []

        # Step 1: Get users with active shares using the Shared Servers API (only users with library access)
        log_info(f"Calling Plex Shared Servers API...")
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers?X-Plex-Token={server_config['token']}"
        headers = {'Accept': 'application/xml'}

        response = requests.get(url, headers=headers, timeout=30)

        if response.status_code != 200:
            log_error(f"Shared Servers API failed: HTTP {response.status_code}")
            return {
                "success": False,
                "message": f"Shared Servers API returned HTTP {response.status_code}",
                "server": server_config['name']
            }

        # Parse XML response
        root = ET.fromstring(response.text)
        all_users = []
        pending_users = []

        for shared_server in root.findall('.//SharedServer'):
            user_id = shared_server.get('userID')
            username = shared_server.get('username')
            email = shared_server.get('email')
            accepted_at = shared_server.get('acceptedAt')
            invited_at = shared_server.get('invitedAt')

            if email and username and user_id:
                user_data = {
                    'email': email.lower(),
                    'username': username,
                    'account_id': int(user_id)
                }

                # Separate accepted shares from pending invites
                if accepted_at:
                    all_users.append(user_data)
                elif invited_at:
                    pending_users.append(user_data)

        log_info(f"Found {len(all_users)} active users and {len(pending_users)} pending invites from Shared Servers API")

        # Step 2: Connect to Plex server once
        try:
            from plexapi.server import PlexServer
            plex = PlexServer(server_config['url'], server_config['token'], timeout=30)
            log_info(f"Connected to Plex server: {server_config['name']}")
        except Exception as e:
            log_error(f"Failed to connect to Plex server: {e}")
            # Return users without watch history
            for user in all_users:
                users_list.append({
                    "email": user['email'],
                    "username": user['username'],
                    "user_id": str(user['account_id']),
                    "last_seen_at": None,
                    "days_since_last_activity": None,
                    "is_pending_invite": False,
                    "is_active_friend": True
                })

            return {
                "success": True,
                "server": server_config['name'],
                "server_id": server_config['server_id'],
                "users": users_list,
                "pending_invites": pending_invites_list,
                "total_users": len(users_list),
                "total_pending": 0
            }

        # Step 3: Get watch history for each user
        for i, user in enumerate(all_users, 1):
            email = user['email']
            username = user['username']
            account_id = user['account_id']

            user_data = {
                "email": email,
                "username": username,
                "user_id": str(account_id),
                "last_seen_at": None,
                "days_since_last_activity": None,
                "is_pending_invite": False,
                "is_active_friend": True
            }

            # Get last watched for this user
            try:
                history = plex.history(accountID=account_id, maxresults=1)

                if history and len(history) > 0:
                    latest_item = history[0]
                    viewed_at = getattr(latest_item, 'viewedAt', None) or getattr(latest_item, 'lastViewedAt', None)

                    if viewed_at:
                        # Calculate days since last activity
                        now = datetime.now(timezone.utc)
                        if viewed_at.tzinfo is None:
                            viewed_at = viewed_at.replace(tzinfo=timezone.utc)
                        days_diff = (now - viewed_at).days

                        user_data["last_seen_at"] = viewed_at.isoformat()
                        user_data["days_since_last_activity"] = days_diff

                        if i <= 5:  # Log first 5 users
                            log_info(f"  → {username}: {days_diff} days ago")
                else:
                    if i <= 5:
                        log_info(f"  → {username}: No watch history")

            except Exception as e:
                if i <= 5:
                    log_info(f"  → {username}: Could not fetch history - {str(e)}")

            users_list.append(user_data)

            # Progress update every 20 users
            if i % 20 == 0:
                log_info(f"Processed {i}/{len(all_users)} users")

        # Step 4: Process pending invites (users with pending shares from Shared Servers API)
        for pending_user in pending_users:
            invite_data = {
                "email": pending_user['email'],
                "username": pending_user['username'],
                "user_id": str(pending_user['account_id']),
                "last_seen_at": None,
                "days_since_last_activity": None,
                "is_pending_invite": True,
                "is_active_friend": False
            }
            pending_invites_list.append(invite_data)

        clear_timeout()

        log_info(f"✅ Retrieved {len(users_list)} active users and {len(pending_invites_list)} pending invites")

        return {
            "success": True,
            "server": server_config['name'],
            "server_id": server_config['server_id'],
            "users": users_list,
            "pending_invites": pending_invites_list,
            "total_users": len(users_list),
            "total_pending": len(pending_invites_list)
        }

    except TimeoutError:
        clear_timeout()
        log_error("Operation timed out (>90s)")
        return {
            "success": False,
            "message": "Operation timed out",
            "server": server_config.get('name', 'unknown')
        }
    except Exception as e:
        clear_timeout()
        log_error(f"Error fetching users and activity: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": str(e),
            "server": server_config.get('name', 'unknown')
        }

def get_all_users_with_library_access(server_config):
    """
    Get all users with their library access from a Plex server.
    Uses the shared_servers API for friends AND Plex Home API for home users.

    Args:
        server_config: {name, url, server_id, token}

    Returns:
        {success, users: [{email, username, library_ids: [1,2,3], is_pending_invite}]}
    """
    try:
        log_info(f"Fetching users with library access for {server_config['name']}...")

        set_timeout(60)

        users_list = []
        seen_emails = set()

        # ==========================================
        # PART 1: Get friends from shared_servers API
        # ==========================================
        url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers?X-Plex-Token={server_config['token']}"
        headers = {'Accept': 'application/xml'}

        response = requests.get(url, headers=headers, timeout=30)

        if response.status_code == 200:
            # Parse XML response
            root = ET.fromstring(response.text)

            for shared_server in root.findall('.//SharedServer'):
                user_id = shared_server.get('userID')
                username = shared_server.get('username')
                email = shared_server.get('email')
                accepted_at = shared_server.get('acceptedAt')
                invited_at = shared_server.get('invitedAt')

                if email and username and user_id:
                    # Extract library/section IDs that are shared with this user
                    # Use 'key' (the actual library section ID) not 'id' (shared section record ID)
                    library_ids = []
                    for section in shared_server.findall('.//Section'):
                        section_id = section.get('key') or section.get('id')
                        shared = section.get('shared')
                        if section_id and shared == '1':
                            library_ids.append(str(section_id))

                    is_pending = not bool(accepted_at) and bool(invited_at)
                    email_lower = email.lower()
                    seen_emails.add(email_lower)

                    users_list.append({
                        'email': email_lower,
                        'username': username,
                        'plex_user_id': int(user_id),
                        'library_ids': library_ids,
                        'is_pending_invite': is_pending,
                        'is_active_friend': bool(accepted_at),
                        'is_home_user': False
                    })

            log_info(f"Found {len(users_list)} friends from shared_servers API")
        else:
            log_error(f"Shared Servers API returned HTTP {response.status_code}")

        # ==========================================
        # PART 2: Get Plex Home users
        # ==========================================
        try:
            log_info("Fetching Plex Home users...")

            # Get all libraries on this server first (for home users with full access)
            all_library_ids = []
            try:
                lib_url = f"{server_config['url']}/library/sections?X-Plex-Token={server_config['token']}"
                lib_response = requests.get(lib_url, headers={'Accept': 'application/xml'}, timeout=10)
                if lib_response.status_code == 200:
                    lib_root = ET.fromstring(lib_response.text)
                    for directory in lib_root.findall('.//Directory'):
                        lib_key = directory.get('key')
                        if lib_key:
                            all_library_ids.append(str(lib_key))
                    log_info(f"Server has {len(all_library_ids)} libraries: {all_library_ids}")
            except Exception as lib_err:
                log_error(f"Error fetching server libraries: {lib_err}")

            # Get Plex Home users
            home_url = f"https://plex.tv/api/home/users?X-Plex-Token={server_config['token']}"
            home_response = requests.get(home_url, headers={'Accept': 'application/xml'}, timeout=30)

            if home_response.status_code == 200:
                home_root = ET.fromstring(home_response.text)
                home_users_count = 0

                for user in home_root.findall('.//User'):
                    user_id = user.get('id')
                    username = user.get('title') or user.get('username')
                    email = user.get('email')
                    is_admin = user.get('admin') == '1'
                    is_restricted = user.get('restricted') == '1'

                    # Skip the admin/owner user and users without email
                    if is_admin or not email:
                        continue

                    email_lower = email.lower()

                    # Skip if we already have this user from friends list
                    if email_lower in seen_emails:
                        continue

                    # For home users, we need to get their library restrictions for THIS specific server
                    # Check if this home user is actually shared on this server
                    library_ids = []
                    try:
                        # First check if user appears in the shared_servers list for THIS server
                        # The shared_servers API is server-specific
                        sharing_url = f"https://plex.tv/api/servers/{server_config['server_id']}/shared_servers/{user_id}?X-Plex-Token={server_config['token']}"
                        sharing_response = requests.get(sharing_url, headers={'Accept': 'application/xml'}, timeout=10)

                        if sharing_response.status_code == 200:
                            sharing_root = ET.fromstring(sharing_response.text)
                            for section in sharing_root.findall('.//Section'):
                                section_id = section.get('key') or section.get('id')
                                shared = section.get('shared')
                                if section_id and shared == '1':
                                    library_ids.append(str(section_id))

                            # If restricted home user has no specific library shares, they have no access to this server
                            if is_restricted and not library_ids:
                                log_info(f"  Home user {email} is restricted and has no library access on this server")
                            elif not is_restricted and not library_ids:
                                # Unrestricted home user with no specific shares = full access to all libraries
                                library_ids = all_library_ids.copy()
                                log_info(f"  Home user {email} is unrestricted, granting access to all {len(library_ids)} libraries")
                        else:
                            # User not found in shared_servers for this server = NO access to this server
                            # This is the key fix - don't assume full access!
                            log_info(f"  Home user {email} not shared on this server (HTTP {sharing_response.status_code})")
                            library_ids = []
                    except Exception as share_err:
                        log_error(f"Error getting home user restrictions: {share_err}")
                        # On error, assume NO access (safer than assuming full access)
                        library_ids = []

                    if library_ids:  # Only add if user has some library access
                        seen_emails.add(email_lower)
                        users_list.append({
                            'email': email_lower,
                            'username': username,
                            'plex_user_id': int(user_id) if user_id else 0,
                            'library_ids': library_ids,
                            'is_pending_invite': False,
                            'is_active_friend': False,
                            'is_home_user': True
                        })
                        home_users_count += 1

                log_info(f"Found {home_users_count} Plex Home users with library access")
            else:
                log_info(f"Plex Home API returned HTTP {home_response.status_code} (may not be a Plex Home)")

        except Exception as home_err:
            log_error(f"Error fetching Plex Home users: {home_err}")

        active_count = sum(1 for u in users_list if not u.get('is_pending_invite', False))
        pending_count = sum(1 for u in users_list if u.get('is_pending_invite', False))
        home_count = sum(1 for u in users_list if u.get('is_home_user', False))

        log_info(f"✅ Total: {active_count} active users ({home_count} home users), {pending_count} pending invites")

        clear_timeout()

        return {
            "success": True,
            "server": server_config['name'],
            "server_id": server_config['server_id'],
            "users": users_list,
            "active_count": active_count,
            "pending_count": pending_count,
            "home_users_count": home_count
        }

    except TimeoutError:
        clear_timeout()
        log_error("Operation timed out (>60s)")
        return {
            "success": False,
            "message": "Operation timed out",
            "server": server_config.get('name', 'unknown')
        }
    except Exception as e:
        clear_timeout()
        log_error(f"Error fetching users with library access: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": str(e),
            "server": server_config.get('name', 'unknown')
        }


def main():
    """Main CLI interface"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        return

    command = sys.argv[1]

    # Set global timeout for entire operation - 2 minutes max
    set_timeout(120)

    try:
        if command == "share_libraries" and len(sys.argv) >= 5:
            user_email = sys.argv[2]
            server_config = json.loads(sys.argv[3])
            library_ids = json.loads(sys.argv[4])

            log_info(f"Command: share_libraries")
            log_info(f"User: {user_email}")
            log_info(f"Server: {server_config.get('name', 'unknown')}")
            log_info(f"Libraries: {library_ids}")

            result = share_libraries_on_server(user_email, server_config, library_ids)
            print(json.dumps(result, indent=2))

        elif command == "check_user_info" and len(sys.argv) >= 4:
            user_email = sys.argv[2]
            server_config = json.loads(sys.argv[3])

            log_info(f"Command: check_user_info")
            log_info(f"User: {user_email}")
            log_info(f"Server: {server_config.get('name', 'unknown')}")

            result = check_user_info(user_email, server_config)
            print(json.dumps(result, indent=2))

        elif command == "remove_user" and len(sys.argv) >= 4:
            user_email = sys.argv[2]
            server_config = json.loads(sys.argv[3])

            log_info(f"Command: remove_user")
            log_info(f"User: {user_email}")
            log_info(f"Server: {server_config.get('name', 'unknown')}")

            result = remove_user(user_email, server_config)
            print(json.dumps(result, indent=2))

        elif command == "get_all_users_with_activity" and len(sys.argv) >= 3:
            server_config = json.loads(sys.argv[2])

            log_info(f"Command: get_all_users_with_activity")
            log_info(f"Server: {server_config.get('name', 'unknown')}")

            result = get_all_users_with_activity(server_config)
            print(json.dumps(result, indent=2))

        elif command == "get_all_users_with_library_access" and len(sys.argv) >= 3:
            server_config = json.loads(sys.argv[2])

            log_info(f"Command: get_all_users_with_library_access")
            log_info(f"Server: {server_config.get('name', 'unknown')}")

            result = get_all_users_with_library_access(server_config)
            print(json.dumps(result, indent=2))

        else:
            print(json.dumps({
                "error": "Invalid command or arguments",
                "usage": {
                    "share_libraries": "python plex_service_v2.py share_libraries user@email.com '{\"name\":\"...\",\"server_id\":\"...\",\"token\":\"...\"}' '[\"1\",\"2\"]'",
                    "check_user_info": "python plex_service_v2.py check_user_info user@email.com '{\"name\":\"...\",\"server_id\":\"...\",\"token\":\"...\"}}'",
                    "remove_user": "python plex_service_v2.py remove_user user@email.com '{\"name\":\"...\",\"server_id\":\"...\",\"token\":\"...\"}}'",
                    "get_all_users_with_activity": "python plex_service_v2.py get_all_users_with_activity '{\"name\":\"...\",\"server_id\":\"...\",\"token\":\"...\"}}'",
                    "get_all_users_with_library_access": "python plex_service_v2.py get_all_users_with_library_access '{\"name\":\"...\",\"server_id\":\"...\",\"token\":\"...\"}'"
                }
            }))

    except TimeoutError:
        print(json.dumps({
            "error": "Operation timed out after 2 minutes",
            "success": False
        }))
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in arguments: {str(e)}"}))
    except Exception as e:
        log_error(f"Unexpected error: {str(e)}")
        print(json.dumps({"error": str(e), "success": False}))
    finally:
        clear_timeout()

if __name__ == "__main__":
    main()
