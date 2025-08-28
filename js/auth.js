import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import licenseSystem from './license-system.js';

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Listen for auth state changes
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            this.handleAuthStateChange(user);
        });

        // Set up login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Set up logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogout.bind(this));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('login-error');
        
        try {
            this.showLoading(true);
            await signInWithEmailAndPassword(auth, email, password);
            errorElement.textContent = '';
        } catch (error) {
            console.error('Login error:', error);
            errorElement.textContent = this.getErrorMessage(error.code);
        } finally {
            this.showLoading(false);
        }
    }

    async handleLogout() {
        try {
            // Clear license data before signing out
            licenseSystem.clearStoredLicenseKey();
            licenseSystem.stopAutoVerification();
            
            await signOut(auth);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    async handleAuthStateChange(user) {
        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.getElementById('app');
        const adminEmail = document.getElementById('admin-email');
        const currentPage = window.location.pathname;

        if (user) {
            // User is signed in
            if (adminEmail) {
                adminEmail.textContent = user.email;
            }
            
            // Check if we're on an exempt page that doesn't require license verification
            const exemptPages = [
                '/license-verification.html',
                '/admin-license.html',
                '/index.html',
                '/'
            ];
            
            const isExemptPage = exemptPages.some(page => 
                currentPage.endsWith(page) || currentPage === page
            );
            
            if (!isExemptPage) {
                // For protected pages, verify license first
                await this.checkLicenseAndProceed(user, loginScreen, appContainer, currentPage);
            } else {
                // For exempt pages, proceed normally
                this.showUserInterface(user, loginScreen, appContainer, currentPage);
            }
        } else {
            // User is signed out - clear license and redirect to login
            licenseSystem.clearStoredLicenseKey();
            licenseSystem.stopAutoVerification();
            
            if (currentPage !== '/' && currentPage !== '/index.html' && !currentPage.endsWith('index.html')) {
                // If not on login page, redirect to login
                window.location.href = 'index.html';
            } else {
                // Show login screen
                if (loginScreen) {
                    loginScreen.style.display = 'flex';
                }
                if (appContainer) {
                    appContainer.style.display = 'none';
                }
            }
        }
    }

    async checkLicenseAndProceed(user, loginScreen, appContainer, currentPage) {
        const storedLicenseKey = licenseSystem.getStoredLicenseKey();
        
        if (!storedLicenseKey) {
            // No license key stored, redirect to license verification
            window.location.href = 'license-verification.html';
            return;
        }

        // Verify the license
        const result = await licenseSystem.verifyLicense(storedLicenseKey);
        
        if (!result.valid) {
            // License is invalid, clear it and redirect to verification
            licenseSystem.clearStoredLicenseKey();
            window.location.href = 'license-verification.html';
            return;
        }

        // License is valid, proceed with normal interface
        this.showUserInterface(user, loginScreen, appContainer, currentPage);
        
        // Start auto license verification for protected pages
        licenseSystem.startAutoVerification();
    }

    showUserInterface(user, loginScreen, appContainer, currentPage) {
        // If we're on the login page (index.html), redirect to dashboard
        if (currentPage === '/' || currentPage === '/index.html' || currentPage.endsWith('index.html')) {
            if (loginScreen) {
                loginScreen.style.display = 'none';
            }
            if (appContainer) {
                appContainer.style.display = 'grid';
            }
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 100);
        } else {
            // We're on another page, show the app container
            if (loginScreen) {
                loginScreen.style.display = 'none';
            }
            if (appContainer) {
                appContainer.style.display = 'grid';
            }
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }

    getErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/user-not-found':
                return 'No user found with this email address.';
            case 'auth/wrong-password':
                return 'Incorrect password.';
            case 'auth/invalid-email':
                return 'Invalid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/too-many-requests':
                return 'Too many failed login attempts. Please try again later.';
            default:
                return 'Login failed. Please check your credentials and try again.';
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();

export default window.authManager;
