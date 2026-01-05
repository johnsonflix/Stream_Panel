/**
 * Service Worker for Web Push Notifications
 * Handles push events and notification display for the Request Site
 */

// Handle push events
self.addEventListener('push', function(event) {
    console.log('[SW] Push received:', event);

    let data = {
        title: 'Stream Panel',
        body: 'You have a new notification',
        icon: '/assets/logo-icon.png',
        badge: '/assets/logo-icon.png',
        data: {}
    };

    try {
        if (event.data) {
            const payload = event.data.json();
            data.title = payload.title || data.title;
            data.body = payload.body || data.body;
            data.data = payload.data || {};
        }
    } catch (e) {
        console.error('[SW] Error parsing push data:', e);
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
            { action: 'open', title: 'View' },
            { action: 'close', title: 'Dismiss' }
        ],
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification click:', event);
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Determine URL based on notification type
    const notifData = event.notification.data || {};
    let url = '/portal/request2.html#requests'; // Default to requests section

    // For pending requests (admin), go to manage requests
    // For user notifications (approved/declined/available), go to my requests
    if (notifData.type === 'media_pending') {
        url = '/portal/request2.html#requests';
    } else if (['media_approved', 'media_declined', 'media_available'].includes(notifData.type)) {
        url = '/portal/request2.html#myrequests';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Check if there's already a request2.html window open
            for (const client of clientList) {
                if (client.url.includes('/portal/request2.html') && 'focus' in client) {
                    // Navigate existing window to the right section
                    client.navigate(url);
                    return client.focus();
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

// Handle service worker activation
self.addEventListener('activate', function(event) {
    console.log('[SW] Activated');
    event.waitUntil(self.clients.claim());
});

// Handle service worker install
self.addEventListener('install', function(event) {
    console.log('[SW] Installed');
    self.skipWaiting();
});
