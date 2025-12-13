#!/usr/bin/env python3
"""
Plex Watch Statistics Collector
Gets watch history and aggregates statistics across all Plex servers
"""

import json
import sys
import time
from collections import defaultdict
from plexapi.server import PlexServer

def get_watch_statistics(servers_config):
    """
    Get watch statistics from all Plex servers

    Args:
        servers_config: List of server configurations with url, token, name

    Returns:
        Dictionary with aggregated watch statistics
    """

    # Aggregation dictionaries
    movie_watch_counts = defaultdict(lambda: {'count': 0, 'users': set(), 'title': '', 'thumb': '', 'year': ''})
    show_watch_counts = defaultdict(lambda: {'count': 0, 'users': set(), 'title': '', 'thumb': '', 'year': ''})
    user_play_counts = defaultdict(int)
    user_play_counts_by_server = defaultdict(lambda: defaultdict(int))  # username -> {server_name: count}
    platform_counts = defaultdict(int)

    # Username cache: accountID -> username
    username_cache = {}

    print(f"[WATCH STATS] Processing {len(servers_config)} Plex servers...", file=sys.stderr)

    for server_config in servers_config:
        try:
            print(f"[WATCH STATS] Connecting to {server_config['name']}...", file=sys.stderr)
            plex = PlexServer(server_config['url'], server_config['token'], timeout=180)

            # Build username cache from server system accounts
            print(f"[WATCH STATS] Building username cache for {server_config['name']}...", file=sys.stderr)
            try:
                # Try to get system accounts (server-local account mapping)
                try:
                    system_accounts = plex.systemAccounts()
                    print(f"[WATCH STATS] Found {len(system_accounts)} system accounts", file=sys.stderr)

                    for account in system_accounts:
                        # system accounts have .id and .name
                        account_id = account.id
                        account_name = account.name
                        username_cache[account_id] = account_name
                        print(f"[WATCH STATS] Added system account: {account_id} -> {account_name}", file=sys.stderr)

                except AttributeError:
                    print(f"[WATCH STATS] systemAccounts() not available, trying myPlexAccount() fallback...", file=sys.stderr)
                    # Fallback to Plex.tv accounts if systemAccounts not available
                    plex_account = plex.myPlexAccount()
                    users = plex_account.users()

                    # Add owner account
                    username_cache[plex_account.id] = plex_account.username or plex_account.title or plex_account.email
                    print(f"[WATCH STATS] Added owner: {plex_account.id} -> {username_cache[plex_account.id]}", file=sys.stderr)

                    # Add shared users
                    for user in users:
                        username_cache[user.id] = user.username or user.title or user.email
                        print(f"[WATCH STATS] Added user: {user.id} -> {username_cache[user.id]}", file=sys.stderr)

                print(f"[WATCH STATS] Built username cache with {len(username_cache)} users", file=sys.stderr)
            except Exception as e:
                print(f"[WATCH STATS] Warning: Could not build username cache: {str(e)}", file=sys.stderr)

            # Get watch history (last 30 days) with retry logic
            print(f"[WATCH STATS] Fetching history for {server_config['name']}...", file=sys.stderr)
            from datetime import datetime, timedelta
            thirty_days_ago = datetime.now() - timedelta(days=30)

            history = None
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    history = plex.history(mindate=thirty_days_ago)
                    break
                except Exception as history_error:
                    if attempt < max_retries - 1:
                        print(f"[WATCH STATS] History fetch attempt {attempt + 1} failed, retrying in 5 seconds: {str(history_error)}", file=sys.stderr)
                        time.sleep(5)
                    else:
                        raise history_error

            if not history:
                print(f"[WATCH STATS] No history retrieved for {server_config['name']}, skipping", file=sys.stderr)
                continue

            print(f"[WATCH STATS] Processing {len(history)} history entries from {server_config['name']}...", file=sys.stderr)

            processed_count = 0
            for item in history:
                try:
                    # Get username from cache using accountID
                    username = None

                    if hasattr(item, 'accountID') and item.accountID:
                        # Look up username in cache
                        if item.accountID in username_cache:
                            username = username_cache[item.accountID]
                        else:
                            # Not in cache, use fallback
                            username = f"User-{item.accountID}"
                            # print(f"[WATCH STATS] Warning: accountID {item.accountID} not in cache, using fallback", file=sys.stderr)
                    else:
                        # No accountID available
                        username = 'Unknown User'

                    # Track user activity (total and per-server)
                    user_play_counts[username] += 1
                    user_play_counts_by_server[username][server_config['name']] += 1

                    # Track platform/player
                    if hasattr(item, 'player') and item.player:
                        platform = item.player.title if hasattr(item.player, 'title') else str(item.player)
                        platform_counts[platform] += 1

                    # Process based on type
                    if item.type == 'movie':
                        # Get the actual movie object for metadata with retry
                        movie_key = item.ratingKey
                        movie = None

                        for retry in range(2):
                            try:
                                movie = plex.fetchItem(movie_key)
                                break
                            except Exception as fetch_error:
                                if retry == 0 and 'Connection' in str(fetch_error):
                                    time.sleep(0.5)
                                else:
                                    raise fetch_error

                        if not movie:
                            raise Exception("Failed to fetch movie metadata")

                        # Use title as unique identifier
                        movie_title = movie.title

                        # Aggregate movie data
                        movie_watch_counts[movie_title]['count'] += 1
                        movie_watch_counts[movie_title]['users'].add(username)
                        movie_watch_counts[movie_title]['title'] = movie.title
                        movie_watch_counts[movie_title]['year'] = movie.year if hasattr(movie, 'year') else ''

                        # Get thumbnail URL
                        if hasattr(movie, 'thumb') and movie.thumb:
                            # Convert to full URL
                            thumb_url = plex.url(movie.thumb, includeToken=True)
                            movie_watch_counts[movie_title]['thumb'] = thumb_url

                    elif item.type == 'episode':
                        # For TV shows, aggregate at the show level with retry
                        episode_key = item.ratingKey
                        episode = None

                        for retry in range(2):
                            try:
                                episode = plex.fetchItem(episode_key)
                                break
                            except Exception as fetch_error:
                                if retry == 0 and 'Connection' in str(fetch_error):
                                    time.sleep(0.5)
                                else:
                                    raise fetch_error

                        if not episode:
                            raise Exception("Failed to fetch episode metadata")

                        # Get the show
                        show = episode.show()
                        show_title = show.title

                        # Aggregate show data
                        show_watch_counts[show_title]['count'] += 1
                        show_watch_counts[show_title]['users'].add(username)
                        show_watch_counts[show_title]['title'] = show.title
                        show_watch_counts[show_title]['year'] = show.year if hasattr(show, 'year') else ''

                        # Get thumbnail URL
                        if hasattr(show, 'thumb') and show.thumb:
                            thumb_url = plex.url(show.thumb, includeToken=True)
                            show_watch_counts[show_title]['thumb'] = thumb_url

                    # Track progress
                    processed_count += 1
                    if processed_count % 1000 == 0:
                        print(f"[WATCH STATS] Processed {processed_count}/{len(history)} items from {server_config['name']}...", file=sys.stderr)

                except Exception as item_error:
                    # Skip this individual item if there's an error, but continue processing the rest
                    # print(f"[WATCH STATS] Warning: Skipping item due to error: {str(item_error)}", file=sys.stderr)
                    continue

            print(f"[WATCH STATS] ✓ Completed processing {processed_count} items from {server_config['name']}", file=sys.stderr)

        except Exception as e:
            print(f"[WATCH STATS] ✗ Error processing {server_config['name']}: {str(e)}", file=sys.stderr)
            continue

    # Convert sets to counts and prepare final data
    movie_data = []
    for movie_title, data in movie_watch_counts.items():
        movie_data.append({
            'title': data['title'],
            'thumb': data['thumb'],
            'year': data['year'],
            'playCount': data['count'],
            'uniqueUsers': len(data['users'])
        })

    show_data = []
    for show_title, data in show_watch_counts.items():
        show_data.append({
            'title': data['title'],
            'thumb': data['thumb'],
            'year': data['year'],
            'playCount': data['count'],
            'uniqueUsers': len(data['users'])
        })

    # Sort and get top items
    most_popular_movies = sorted(movie_data, key=lambda x: x['uniqueUsers'], reverse=True)[:10]
    most_watched_movies = sorted(movie_data, key=lambda x: x['playCount'], reverse=True)[:10]
    most_popular_shows = sorted(show_data, key=lambda x: x['uniqueUsers'], reverse=True)[:10]
    most_watched_shows = sorted(show_data, key=lambda x: x['playCount'], reverse=True)[:10]

    # Get top users
    most_active_users = sorted(
        [{'username': user, 'playCount': count} for user, count in user_play_counts.items()],
        key=lambda x: x['playCount'],
        reverse=True
    )[:10]

    # Get top platforms
    most_active_platforms = sorted(
        [{'platform': platform, 'playCount': count} for platform, count in platform_counts.items()],
        key=lambda x: x['playCount'],
        reverse=True
    )[:10]

    stats = {
        'success': True,
        'stats': {
            'mostPopularMovies': most_popular_movies,
            'mostWatchedMovies': most_watched_movies,
            'mostPopularShows': most_popular_shows,
            'mostWatchedShows': most_watched_shows,
            'mostActiveUsers': most_active_users,
            'mostActivePlatforms': most_active_platforms
        }
    }

    print(f"[WATCH STATS] ✓ Aggregation complete:", file=sys.stderr)
    print(f"  - Top movies by popularity: {len(most_popular_movies)}", file=sys.stderr)
    print(f"  - Top movies by plays: {len(most_watched_movies)}", file=sys.stderr)
    print(f"  - Top shows by popularity: {len(most_popular_shows)}", file=sys.stderr)
    print(f"  - Top shows by plays: {len(most_watched_shows)}", file=sys.stderr)
    print(f"  - Active users: {len(most_active_users)}", file=sys.stderr)
    print(f"  - Platforms: {len(most_active_platforms)}", file=sys.stderr)

    return stats

def main():
    """Main function to collect and output watch statistics"""
    try:
        # Read server configurations from stdin (passed from Node.js)
        input_data = sys.stdin.read()
        servers_config = json.loads(input_data)

        print(f"[WATCH STATS] Starting watch statistics collection for {len(servers_config)} servers...", file=sys.stderr)

        # Get watch statistics
        stats = get_watch_statistics(servers_config)

        # Output JSON to stdout for Node.js to consume
        print(json.dumps(stats, indent=2))

    except Exception as e:
        print(f"[WATCH STATS] ✗ Fatal error: {str(e)}", file=sys.stderr)
        error_output = {'success': False, 'error': str(e)}
        print(json.dumps(error_output), file=sys.stdout)
        sys.exit(1)

if __name__ == '__main__':
    main()
