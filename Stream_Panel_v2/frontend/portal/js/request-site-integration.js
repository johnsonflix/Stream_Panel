/**
 * Request Site Backend Integration
 * Overrides/enhances request2.html functions to connect to the backend API
 */

// Override the submit request function to use correct API
window.submitRequestFromDetailsOriginal = window.submitRequestFromDetails;

window.submitRequestFromDetails = async function() {
    if (!currentMedia) {
        alert('No media selected');
        return;
    }

    if (!currentUser) {
        alert('Please log in to submit a request');
        window.location.href = '/login.html';
        return;
    }

    const btn = document.getElementById('details-request-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    let seasons = null;
    if (currentMedia.mediaType === 'tv') {
        // For TV shows, show season selection modal
        showSeasonSelectionModal();
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Request';
        return;
    }

    try {
        const response = await fetch('/api/v2/request-site-api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                tmdbId: currentMedia.id,
                mediaType: currentMedia.mediaType,
                is4k: false,
                seasons: seasons
            })
        });

        const result = await response.json();

        if (response.ok) {
            const statusText = result.autoApproved ? 'Auto-Approved' : 'Pending Approval';
            btn.innerHTML = `<i class="fas fa-check"></i> ${statusText}`;
            btn.style.background = result.autoApproved ? '#22c55e' : '#f59e0b';
            currentMedia.request = { status: result.status, requestId: result.requestId };

            const message = result.autoApproved
                ? `Request submitted and auto-approved! "${result.mediaTitle}" has been sent for download.`
                : `Request submitted! "${result.mediaTitle}" is pending admin approval.`;

            alert(message);
            setTimeout(() => closeMovieDetails(), 2000);
        } else {
            alert(result.message || 'Failed to submit request');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Request';
        }
    } catch (error) {
        console.error('Request failed:', error);
        alert('Failed to submit request. Please try again.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Request';
    }
};

// Function to submit TV show request with seasons
window.submitTVRequest = async function(selectedSeasons) {
    if (!currentMedia || currentMedia.mediaType !== 'tv') {
        alert('Invalid media selected');
        return;
    }

    try {
        const response = await fetch('/api/v2/request-site-api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                tmdbId: currentMedia.id,
                mediaType: 'tv',
                is4k: false,
                seasons: selectedSeasons === 'all' ? 'all' : JSON.stringify(selectedSeasons)
            })
        });

        const result = await response.json();

        if (response.ok) {
            const statusText = result.autoApproved ? 'Auto-Approved' : 'Pending Approval';
            alert(`Request submitted! ${statusText}`);
            closeMovieDetails();
        } else {
            alert(result.message || 'Failed to submit request');
        }
    } catch (error) {
        console.error('Request failed:', error);
        alert('Failed to submit request. Please try again.');
    }
};

// Check media availability and request status
window.checkMediaStatus = async function(tmdbId, mediaType) {
    try {
        const response = await fetch(`/api/v2/request-site-api/media/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                tmdbIds: [tmdbId],
                mediaType: mediaType
            })
        });

        if (response.ok) {
            const result = await response.json();
            return result.availability[tmdbId];
        }
    } catch (error) {
        console.error('Failed to check media status:', error);
    }
    return null;
};

// Get user permissions and quotas
window.getUserPermissions = async function() {
    try {
        const response = await fetch('/api/v2/request-site-api/auth/me', {
            credentials: 'include'
        });

        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Failed to get user permissions:', error);
    }
    return null;
};

console.log('Request Site backend integration loaded');
