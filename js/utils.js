/**
 * Shared Utility Functions for Interactive Map Application
 * Reduces code duplication across all pages
 */

// ===== UI UTILITIES =====

/**
 * Show or hide the loading overlay
 * @param {boolean} show - Whether to show (true) or hide (false) the loading overlay
 */
export function showLoading(show = true) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.toggle('active', show);
    }
}

/**
 * Show a message to the user
 * @param {string} text - The message text to display
 * @param {string} type - The message type: 'success', 'error', 'info', or 'warning'
 * @param {number} duration - How long to show the message in milliseconds (0 = don't auto-hide)
 */
export function showMessage(text, type = 'info', duration = 5000) {
    const messageEl = document.getElementById('message');
    if (!messageEl) {
        console.warn('Message element not found');
        return;
    }
    
    messageEl.textContent = text;
    messageEl.className = `message ${type} active`;
    
    // Auto-hide after duration (if duration > 0)
    if (duration > 0) {
        setTimeout(() => {
            hideMessage();
        }, duration);
    }
}

/**
 * Hide the message element
 */
export function hideMessage() {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.classList.remove('active', 'success', 'error', 'info', 'warning');
    }
}

/**
 * Show a success message
 * @param {string} text - The success message text
 * @param {number} duration - How long to show the message in milliseconds
 */
export function showSuccess(text, duration = 5000) {
    showMessage(text, 'success', duration);
}

/**
 * Show an error message
 * @param {string} text - The error message text
 * @param {number} duration - How long to show the message in milliseconds
 */
export function showError(text, duration = 5000) {
    showMessage(text, 'error', duration);
}

/**
 * Show an info message
 * @param {string} text - The info message text
 * @param {number} duration - How long to show the message in milliseconds
 */
export function showInfo(text, duration = 5000) {
    showMessage(text, 'info', duration);
}

// ===== DATE UTILITIES =====

/**
 * Format a date object into a readable string
 * @param {Date} date - The date to format
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export function formatDate(date, includeTime = true) {
    if (!date || !(date instanceof Date)) {
        return 'Invalid Date';
    }
    
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    };
    
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    
    try {
        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid Date';
    }
}

/**
 * Convert Firestore Timestamp to formatted date string
 * @param {object} timestamp - Firestore Timestamp object
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export function formatFirestoreDate(timestamp, includeTime = true) {
    if (!timestamp) {
        return 'Recently';
    }
    
    try {
        // Check if it's a Firestore Timestamp object
        if (timestamp.toDate && typeof timestamp.toDate === 'function') {
            const date = timestamp.toDate();
            return formatDate(date, includeTime);
        } else if (timestamp instanceof Date) {
            return formatDate(timestamp, includeTime);
        } else {
            return 'Recently';
        }
    } catch (error) {
        console.error('Error formatting Firestore date:', error);
        return 'Recently';
    }
}

// ===== ERROR HANDLING =====

/**
 * Get user-friendly error message from Firebase error
 * @param {object} error - Firebase error object
 * @param {string} context - Context of the error (e.g., 'login', 'signup')
 * @returns {string} User-friendly error message
 */
export function getFirebaseErrorMessage(error, context = '') {
    const errorCode = error.code || '';
    
    // Authentication errors
    if (errorCode.startsWith('auth/')) {
        switch (errorCode) {
            case 'auth/invalid-credential':
                return 'Invalid email or password. Please try again.';
            case 'auth/user-not-found':
                return 'No account found with this email.';
            case 'auth/wrong-password':
                return 'Incorrect password.';
            case 'auth/invalid-email':
                return 'Invalid email address.';
            case 'auth/email-already-in-use':
                return 'An account with this email already exists.';
            case 'auth/weak-password':
                return 'Password is too weak. Use at least 6 characters.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later.';
            case 'auth/popup-closed-by-user':
                return ''; // Don't show error for user-cancelled popup
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection.';
            default:
                return `Authentication error: ${error.message}`;
        }
    }
    
    // Firestore errors
    if (errorCode.startsWith('firestore/')) {
        switch (errorCode) {
            case 'firestore/permission-denied':
                return 'You do not have permission to perform this action.';
            case 'firestore/not-found':
                return 'The requested data was not found.';
            case 'firestore/already-exists':
                return 'This data already exists.';
            default:
                return `Database error: ${error.message}`;
        }
    }
    
    // Generic error
    return error.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Handle and display error to user
 * @param {object} error - Error object
 * @param {string} context - Context of the error
 * @param {boolean} logToConsole - Whether to log to console
 */
export function handleError(error, context = '', logToConsole = true) {
    if (logToConsole) {
        console.error(`[${context}]`, error);
    }
    
    const userMessage = getFirebaseErrorMessage(error, context);
    if (userMessage) {
        showError(userMessage);
    }
}
