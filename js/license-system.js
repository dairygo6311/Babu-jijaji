import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    addDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc,
    query, 
    where, 
    orderBy,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class LicenseSystem {
    constructor() {
        this.currentLicense = null;
        this.verificationInterval = null;
        this.isVerifying = false;
    }

    // Generate a unique license key
    generateLicenseKey() {
        const prefix = 'SUDHA';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substr(2, 8).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    // Create a new license
    async createLicense(clientName, clientEmail, validityDays, notes = '') {
        try {
            console.log('Creating license with db:', db);
            
            if (!db) {
                throw new Error('Firestore database not initialized');
            }

            const licenseKey = this.generateLicenseKey();
            const createdAt = new Date();
            const expiresAt = new Date(createdAt.getTime() + (validityDays * 24 * 60 * 60 * 1000));

            const licenseData = {
                licenseKey,
                clientName,
                clientEmail,
                validityDays,
                notes,
                status: 'active',
                createdAt: serverTimestamp(),
                expiresAt: expiresAt,
                lastVerified: null,
                usageCount: 0
            };

            console.log('Attempting to create license with data:', licenseData);
            const docRef = await addDoc(collection(db, 'licenses'), licenseData);
            console.log('License created with ID:', docRef.id);

            return {
                success: true,
                licenseKey,
                docId: docRef.id,
                expiresAt: expiresAt.toLocaleDateString(),
                clientName,
                clientEmail
            };
        } catch (error) {
            console.error('Error creating license:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if license expires within specified days
    checkExpiryWarning(expiresAt, warningDays = 3) {
        if (!expiresAt) return null;
        
        const now = new Date();
        const expiryDate = new Date(expiresAt);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= warningDays && daysUntilExpiry > 0) {
            return {
                showWarning: true,
                daysRemaining: daysUntilExpiry,
                expiryDate: expiryDate.toLocaleDateString('hi-IN')
            };
        }
        
        return { showWarning: false };
    }

    // Show expiry warning modal
    showExpiryWarning(daysRemaining, expiryDate) {
        // Remove existing warning if any
        const existingWarning = document.getElementById('license-expiry-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        const warningHTML = `
            <div id="license-expiry-warning" class="license-warning-overlay">
                <div class="license-warning-modal">
                    <div class="warning-header">
                        <i data-feather="alert-triangle" class="warning-icon"></i>
                        <h3>लाइसेंस की अवधि समाप्त होने वाली है!</h3>
                    </div>
                    <div class="warning-content">
                        <p><strong>आपका लाइसेंस ${daysRemaining} दिन में समाप्त हो जाएगा</strong></p>
                        <p>समाप्ति की तारीख: <strong>${expiryDate}</strong></p>
                        <p>कृपया नया लाइसेंस खरीदने के लिए संपर्क करें:</p>
                        <div class="contact-info">
                            <a href="https://wa.me/918239913685" target="_blank" class="whatsapp-contact">
                                <i data-feather="phone"></i>
                                WhatsApp: +91 8239913685
                            </a>
                        </div>
                    </div>
                    <div class="warning-actions">
                        <button onclick="document.getElementById('license-expiry-warning').remove()" class="btn-secondary">
                            बाद में याद दिलाएं
                        </button>
                        <button onclick="window.open('https://wa.me/918239913685', '_blank')" class="btn-primary">
                            अभी संपर्क करें
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', warningHTML);
        
        // Initialize feather icons for the warning
        if (window.feather) {
            feather.replace();
        }
    }

    // Verify a license key
    async verifyLicense(licenseKey) {
        try {
            this.isVerifying = true;
            
            if (!licenseKey) {
                return { 
                    valid: false, 
                    reason: 'No license key provided',
                    action: 'redirect_to_verification'
                };
            }

            const q = query(
                collection(db, 'licenses'), 
                where('licenseKey', '==', licenseKey)
            );
            
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                return { 
                    valid: false, 
                    reason: 'Invalid license key',
                    action: 'redirect_to_verification'
                };
            }

            const licenseDoc = querySnapshot.docs[0];
            const licenseData = licenseDoc.data();
            
            // Check if license is deactivated
            if (licenseData.status === 'deactivated') {
                return { 
                    valid: false, 
                    reason: 'License has been deactivated',
                    action: 'redirect_to_verification'
                };
            }

            // Check if license has expired
            const now = new Date();
            const expiresAt = licenseData.expiresAt.toDate();
            
            if (now > expiresAt) {
                // Update status to expired
                await updateDoc(doc(db, 'licenses', licenseDoc.id), {
                    status: 'expired'
                });
                
                return { 
                    valid: false, 
                    reason: 'License has expired',
                    action: 'redirect_to_verification'
                };
            }

            // Update last verified timestamp and usage count
            await updateDoc(doc(db, 'licenses', licenseDoc.id), {
                lastVerified: serverTimestamp(),
                usageCount: (licenseData.usageCount || 0) + 1
            });

            this.currentLicense = {
                ...licenseData,
                docId: licenseDoc.id
            };

            // Check for expiry warning only on dashboard
            const currentPage = window.location.pathname;
            if (currentPage.includes('dashboard.html') || currentPage === '/') {
                const warningCheck = this.checkExpiryWarning(expiresAt);
                if (warningCheck && warningCheck.showWarning) {
                    // Show warning after a small delay to ensure page loads
                    setTimeout(() => {
                        this.showExpiryWarning(warningCheck.daysRemaining, warningCheck.expiryDate);
                    }, 1000);
                }
            }

            return { 
                valid: true, 
                license: this.currentLicense,
                expiresAt: expiresAt.toLocaleDateString()
            };
        } catch (error) {
            console.error('Error verifying license:', error);
            return { 
                valid: false, 
                reason: 'Verification failed: ' + error.message,
                action: 'redirect_to_verification'
            };
        } finally {
            this.isVerifying = false;
        }
    }

    // Get all licenses (for admin panel)
    async getAllLicenses() {
        try {
            const q = query(collection(db, 'licenses'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            const licenses = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                licenses.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate(),
                    expiresAt: data.expiresAt?.toDate(),
                    lastVerified: data.lastVerified?.toDate()
                });
            });
            
            return licenses;
        } catch (error) {
            console.error('Error getting licenses:', error);
            return [];
        }
    }

    // Deactivate a license
    async deactivateLicense(licenseId) {
        try {
            await updateDoc(doc(db, 'licenses', licenseId), {
                status: 'deactivated',
                deactivatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Error deactivating license:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete a license
    async deleteLicense(licenseId) {
        try {
            await deleteDoc(doc(db, 'licenses', licenseId));
            return { success: true };
        } catch (error) {
            console.error('Error deleting license:', error);
            return { success: false, error: error.message };
        }
    }

    // Get license statistics
    async getLicenseStats() {
        try {
            const licenses = await this.getAllLicenses();
            const now = new Date();
            
            let active = 0;
            let expired = 0;
            let deactivated = 0;
            
            licenses.forEach(license => {
                if (license.status === 'deactivated') {
                    deactivated++;
                } else if (license.expiresAt < now) {
                    expired++;
                } else {
                    active++;
                }
            });
            
            return { active, expired, deactivated };
        } catch (error) {
            console.error('Error getting license stats:', error);
            return { active: 0, expired: 0, deactivated: 0 };
        }
    }

    // Store license key in localStorage
    storeLicenseKey(licenseKey) {
        localStorage.setItem('sudha_license_key', licenseKey);
    }

    // Get license key from localStorage
    getStoredLicenseKey() {
        return localStorage.getItem('sudha_license_key');
    }

    // Clear stored license key
    clearStoredLicenseKey() {
        localStorage.removeItem('sudha_license_key');
    }

    // Start automatic license verification (every 5 minutes)
    startAutoVerification() {
        // Clear any existing interval
        if (this.verificationInterval) {
            clearInterval(this.verificationInterval);
        }

        // Verify immediately
        this.performAutoVerification();

        // Set up 5-minute interval
        this.verificationInterval = setInterval(() => {
            this.performAutoVerification();
        }, 5 * 60 * 1000); // 5 minutes
    }

    // Stop automatic verification
    stopAutoVerification() {
        if (this.verificationInterval) {
            clearInterval(this.verificationInterval);
            this.verificationInterval = null;
        }
    }

    // Perform automatic license verification
    async performAutoVerification() {
        if (this.isVerifying) return; // Prevent concurrent verifications

        const licenseKey = this.getStoredLicenseKey();
        if (!licenseKey) {
            this.redirectToLicenseVerification();
            return;
        }

        const result = await this.verifyLicense(licenseKey);
        if (!result.valid) {
            this.clearStoredLicenseKey();
            this.redirectToLicenseVerification();
        }
    }

    // Redirect to license verification page
    redirectToLicenseVerification() {
        // Only redirect if not already on the license verification page
        if (!window.location.pathname.includes('license-verification.html')) {
            this.stopAutoVerification();
            // Include current page as return parameter for protected pages
            const currentPage = window.location.pathname;
            const isProtectedPage = this.requiresLicenseVerification();
            
            if (isProtectedPage && currentPage !== '/') {
                window.location.href = `license-verification.html?returnTo=${encodeURIComponent(currentPage)}`;
            } else {
                window.location.href = 'license-verification.html';
            }
        }
    }

    // Check if current page requires license verification
    requiresLicenseVerification() {
        const currentPage = window.location.pathname;
        const exemptPages = [
            '/license-verification.html',
            '/admin-license.html',
            '/index.html',
            '/'
        ];
        
        return !exemptPages.some(page => currentPage.endsWith(page) || currentPage === page);
    }

    // Initialize license system for protected pages
    async initializeForProtectedPage() {
        if (!this.requiresLicenseVerification()) {
            return;
        }

        const licenseKey = this.getStoredLicenseKey();
        if (!licenseKey) {
            this.redirectToLicenseVerification();
            return;
        }

        const result = await this.verifyLicense(licenseKey);
        if (!result.valid) {
            this.clearStoredLicenseKey();
            this.redirectToLicenseVerification();
            return;
        }

        // Start auto verification for valid licenses
        this.startAutoVerification();
    }
}

// Create and export a singleton instance
const licenseSystem = new LicenseSystem();
export default licenseSystem;