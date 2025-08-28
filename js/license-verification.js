import licenseSystem from './license-system.js';

class LicenseVerificationManager {
    constructor() {
        this.init();
    }

    init() {
        // Set up form submission
        const licenseForm = document.getElementById('license-form');
        if (licenseForm) {
            licenseForm.addEventListener('submit', this.handleLicenseVerification.bind(this));
        }

        // Check if already has a valid license
        this.checkExistingLicense();
    }

    async checkExistingLicense() {
        const storedKey = licenseSystem.getStoredLicenseKey();
        if (storedKey) {
            this.showLoading(true);
            const result = await licenseSystem.verifyLicense(storedKey);
            this.showLoading(false);

            if (result.valid) {
                // Check if user came from admin panel, redirect back there
                const urlParams = new URLSearchParams(window.location.search);
                const returnTo = urlParams.get('returnTo') || 'dashboard.html';
                window.location.href = returnTo;
                return;
            } else {
                // Clear invalid stored key
                licenseSystem.clearStoredLicenseKey();
            }
        }
    }

    async handleLicenseVerification(e) {
        e.preventDefault();
        
        const licenseKey = document.getElementById('license-key').value.trim();
        const errorElement = document.getElementById('license-error');
        const successElement = document.getElementById('license-success');
        
        if (!licenseKey) {
            this.showError('Please enter a license key');
            return;
        }

        try {
            this.showLoading(true);
            this.clearMessages();

            const result = await licenseSystem.verifyLicense(licenseKey);
            
            if (result.valid) {
                // Store the valid license key
                licenseSystem.storeLicenseKey(licenseKey);
                
                this.showSuccess(`License verified successfully! Valid until ${result.expiresAt}`);
                
                // Redirect back to original page or dashboard after a short delay
                setTimeout(() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const returnTo = urlParams.get('returnTo') || 'dashboard.html';
                    window.location.href = returnTo;
                }, 1500);
            } else {
                this.showError(result.reason || 'Invalid license key');
            }
        } catch (error) {
            console.error('License verification error:', error);
            this.showError('Verification failed. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('license-error');
        const successElement = document.getElementById('license-success');
        
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        if (successElement) {
            successElement.style.display = 'none';
        }
    }

    showSuccess(message) {
        const errorElement = document.getElementById('license-error');
        const successElement = document.getElementById('license-success');
        
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
        }
        
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    clearMessages() {
        const errorElement = document.getElementById('license-error');
        const successElement = document.getElementById('license-success');
        
        if (errorElement) {
            errorElement.style.display = 'none';
            errorElement.textContent = '';
        }
        
        if (successElement) {
            successElement.style.display = 'none';
            successElement.textContent = '';
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const submitBtn = document.querySelector('#license-form button[type="submit"]');
        
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
        
        if (submitBtn) {
            submitBtn.disabled = show;
            submitBtn.innerHTML = show ? 
                '<i data-feather="loader"></i><span>Verifying...</span>' : 
                '<i data-feather="key"></i><span>Verify License</span>';
            
            // Re-initialize feather icons
            if (window.feather) {
                window.feather.replace();
            }
        }
    }
}

// Initialize the license verification manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LicenseVerificationManager();
});