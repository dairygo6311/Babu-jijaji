import licenseSystem from './license-system.js';

// Ensure Firebase is properly initialized before using license system
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for Firebase to initialize
    setTimeout(() => {
        window.licenseManager = new LicenseManager();
    }, 100);
});

class LicenseManager {
    constructor() {
        this.licenses = [];
        this.filteredLicenses = [];
        this.init();
    }

    init() {
        // Admin panel doesn't need license verification since it's used to generate licenses
        // Initialize without license check for admin panel
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load licenses and stats
        this.loadLicenses();
        this.loadStats();
    }

    setupEventListeners() {
        // Generate license form
        const generateForm = document.getElementById('generate-license-form');
        if (generateForm) {
            generateForm.addEventListener('submit', this.handleGenerateLicense.bind(this));
        }

        // Refresh licenses button
        const refreshBtn = document.getElementById('refresh-licenses');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.loadLicenses.bind(this));
        }

        // Search functionality
        const searchInput = document.getElementById('license-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearch.bind(this));
        }

        // Filter functionality
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', this.handleFilter.bind(this));
        }

        // Modal event listeners
        this.setupModalListeners();
    }

    setupModalListeners() {
        // License key modal
        const licenseModal = document.getElementById('license-key-modal');
        const closeLicenseModal = document.getElementById('close-license-modal');
        const closeLicenseModalBtn = document.getElementById('close-license-modal-btn');
        const copyAndCloseBtn = document.getElementById('copy-and-close');
        const copyLicenseKeyBtn = document.getElementById('copy-license-key');

        [closeLicenseModal, closeLicenseModalBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.hideModal('license-key-modal'));
            }
        });

        if (copyAndCloseBtn) {
            copyAndCloseBtn.addEventListener('click', () => {
                this.copyLicenseKey();
                this.hideModal('license-key-modal');
            });
        }

        if (copyLicenseKeyBtn) {
            copyLicenseKeyBtn.addEventListener('click', this.copyLicenseKey.bind(this));
        }

        // Confirm deactivation modal
        const confirmModal = document.getElementById('confirm-deactivate-modal');
        const closeConfirmModal = document.getElementById('close-confirm-modal');
        const cancelDeactivate = document.getElementById('cancel-deactivate');
        const confirmDeactivate = document.getElementById('confirm-deactivate');

        [closeConfirmModal, cancelDeactivate].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.hideModal('confirm-deactivate-modal'));
            }
        });

        if (confirmDeactivate) {
            confirmDeactivate.addEventListener('click', this.confirmDeactivation.bind(this));
        }
    }

    async handleGenerateLicense(e) {
        e.preventDefault();
        
        const clientName = document.getElementById('client-name').value.trim();
        const clientEmail = document.getElementById('client-email').value.trim();
        const validityPeriod = parseInt(document.getElementById('validity-period').value);
        const notes = document.getElementById('license-notes').value.trim();

        if (!clientName || !clientEmail || !validityPeriod) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const result = await licenseSystem.createLicense(clientName, clientEmail, validityPeriod, notes);
            
            if (result.success) {
                // Show the license key modal
                this.showLicenseKeyModal(result);
                
                // Reset form
                e.target.reset();
                
                // Reload licenses and stats
                this.loadLicenses();
                this.loadStats();
                
                this.showToast('License generated successfully!', 'success');
            } else {
                this.showToast('Failed to generate license: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error generating license:', error);
            this.showToast('Failed to generate license', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showLicenseKeyModal(licenseData) {
        const modal = document.getElementById('license-key-modal');
        const generatedKey = document.getElementById('generated-key');
        const modalClientName = document.getElementById('modal-client-name');
        const modalClientEmail = document.getElementById('modal-client-email');
        const modalExpiryDate = document.getElementById('modal-expiry-date');

        if (generatedKey) generatedKey.value = licenseData.licenseKey;
        if (modalClientName) modalClientName.textContent = licenseData.clientName;
        if (modalClientEmail) modalClientEmail.textContent = licenseData.clientEmail;
        if (modalExpiryDate) modalExpiryDate.textContent = licenseData.expiresAt;

        this.showModal('license-key-modal');
    }

    async loadLicenses() {
        try {
            this.licenses = await licenseSystem.getAllLicenses();
            this.filteredLicenses = [...this.licenses];
            this.renderLicenses();
        } catch (error) {
            console.error('Error loading licenses:', error);
            this.showToast('Failed to load licenses', 'error');
        }
    }

    async loadStats() {
        try {
            const stats = await licenseSystem.getLicenseStats();
            
            const activeElement = document.getElementById('active-licenses');
            const expiredElement = document.getElementById('expired-licenses');
            
            if (activeElement) activeElement.textContent = stats.active;
            if (expiredElement) expiredElement.textContent = stats.expired;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    renderLicenses() {
        const tbody = document.getElementById('licenses-tbody');
        const noLicenses = document.getElementById('no-licenses');
        
        if (!tbody) return;

        if (this.filteredLicenses.length === 0) {
            tbody.innerHTML = '';
            if (noLicenses) noLicenses.style.display = 'block';
            return;
        }

        if (noLicenses) noLicenses.style.display = 'none';

        tbody.innerHTML = this.filteredLicenses.map(license => {
            const status = this.getLicenseStatus(license);
            const createdDate = license.createdAt ? license.createdAt.toLocaleDateString() : 'N/A';
            const expiryDate = license.expiresAt ? license.expiresAt.toLocaleDateString() : 'N/A';

            return `
                <tr>
                    <td>
                        <div>
                            <strong>${license.clientName}</strong>
                            <br>
                            <small>${license.clientEmail}</small>
                        </div>
                    </td>
                    <td>
                        <code>${license.licenseKey}</code>
                    </td>
                    <td>${createdDate}</td>
                    <td>${expiryDate}</td>
                    <td>
                        <span class="license-status ${status.toLowerCase()}">${status}</span>
                    </td>
                    <td>
                        <div class="license-actions">
                            ${status === 'Active' ? `
                                <button class="btn btn-danger btn-sm" onclick="licenseManager.showDeactivateModal('${license.id}', '${license.clientName}', '${license.licenseKey}')">
                                    <i data-feather="shield-off"></i>
                                    Deactivate
                                </button>
                            ` : ''}
                            <button class="btn btn-secondary btn-sm" onclick="licenseManager.deleteLicense('${license.id}')">
                                <i data-feather="trash-2"></i>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Re-initialize feather icons
        if (window.feather) {
            window.feather.replace();
        }
    }

    getLicenseStatus(license) {
        if (license.status === 'deactivated') {
            return 'Deactivated';
        }
        
        const now = new Date();
        if (license.expiresAt && now > license.expiresAt) {
            return 'Expired';
        }
        
        return 'Active';
    }

    handleSearch() {
        const searchTerm = document.getElementById('license-search').value.toLowerCase();
        
        this.filteredLicenses = this.licenses.filter(license => 
            license.clientName.toLowerCase().includes(searchTerm) ||
            license.clientEmail.toLowerCase().includes(searchTerm) ||
            license.licenseKey.toLowerCase().includes(searchTerm)
        );
        
        this.applyStatusFilter();
    }

    handleFilter() {
        this.applyStatusFilter();
    }

    applyStatusFilter() {
        const statusFilter = document.getElementById('status-filter').value;
        
        if (statusFilter === 'all') {
            // Keep current filtered licenses (from search)
        } else {
            this.filteredLicenses = this.filteredLicenses.filter(license => {
                const status = this.getLicenseStatus(license).toLowerCase();
                return status === statusFilter;
            });
        }
        
        this.renderLicenses();
    }

    showDeactivateModal(licenseId, clientName, licenseKey) {
        const modal = document.getElementById('confirm-deactivate-modal');
        const clientNameElement = document.getElementById('deactivate-client-name');
        const licenseKeyElement = document.getElementById('deactivate-license-key');

        if (clientNameElement) clientNameElement.textContent = clientName;
        if (licenseKeyElement) licenseKeyElement.textContent = licenseKey;

        // Store license ID for confirmation
        modal.dataset.licenseId = licenseId;

        this.showModal('confirm-deactivate-modal');
    }

    async confirmDeactivation() {
        const modal = document.getElementById('confirm-deactivate-modal');
        const licenseId = modal.dataset.licenseId;

        if (!licenseId) return;

        try {
            this.showLoading(true);
            
            const result = await licenseSystem.deactivateLicense(licenseId);
            
            if (result.success) {
                this.showToast('License deactivated successfully', 'success');
                this.loadLicenses();
                this.loadStats();
            } else {
                this.showToast('Failed to deactivate license: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deactivating license:', error);
            this.showToast('Failed to deactivate license', 'error');
        } finally {
            this.showLoading(false);
            this.hideModal('confirm-deactivate-modal');
        }
    }

    async deleteLicense(licenseId) {
        if (!confirm('Are you sure you want to permanently delete this license? This action cannot be undone.')) {
            return;
        }

        try {
            this.showLoading(true);
            
            const result = await licenseSystem.deleteLicense(licenseId);
            
            if (result.success) {
                this.showToast('License deleted successfully', 'success');
                this.loadLicenses();
                this.loadStats();
            } else {
                this.showToast('Failed to delete license: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting license:', error);
            this.showToast('Failed to delete license', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    copyLicenseKey() {
        const keyInput = document.getElementById('generated-key');
        if (keyInput) {
            keyInput.select();
            document.execCommand('copy');
            this.showToast('License key copied to clipboard!', 'success');
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
                <button class="toast-close">&times;</button>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);

        // Manual close
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            });
        }
    }
}