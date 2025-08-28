import { db } from './firebase-config.js';
import configManager from './config-manager.js';
import LoadingManager from './loading-utils.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    query, 
    orderBy, 
    onSnapshot,
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class CustomerManager {
    constructor() {
        this.customers = [];
        this.filteredCustomers = [];
        this.currentEditingId = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCustomers();
    }

    setupEventListeners() {
        // Add customer button
        const addCustomerBtn = document.getElementById('add-customer-btn');
        if (addCustomerBtn) {
            addCustomerBtn.addEventListener('click', () => this.openCustomerModal());
        }

        // Customer form
        const customerForm = document.getElementById('customer-form');
        if (customerForm) {
            customerForm.addEventListener('submit', this.handleCustomerSubmit.bind(this));
        }

        // Delivery schedule dropdown
        const deliverySchedule = document.getElementById('delivery-schedule');
        if (deliverySchedule) {
            deliverySchedule.addEventListener('change', this.handleScheduleChange.bind(this));
        }

        // Modal close buttons
        const closeModal = document.getElementById('close-modal');
        const cancelModal = document.getElementById('cancel-modal');
        if (closeModal) closeModal.addEventListener('click', () => this.closeCustomerModal());
        if (cancelModal) cancelModal.addEventListener('click', () => this.closeCustomerModal());

        // Search and filter
        const searchInput = document.getElementById('customer-search');
        const statusFilter = document.getElementById('status-filter');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearch.bind(this));
        }
        
        if (statusFilter) {
            statusFilter.addEventListener('change', this.handleFilter.bind(this));
        }

        // Modal overlay click
        const modal = document.getElementById('customer-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeCustomerModal();
                }
            });
        }
    }

    async loadCustomers() {
        try {
            window.loadingManager.show('Loading customers...');
            const customersRef = collection(db, 'customers');
            const q = query(customersRef, orderBy('name'));
            
            // Set up real-time listener
            onSnapshot(q, (snapshot) => {
                this.customers = [];
                snapshot.forEach((doc) => {
                    this.customers.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                this.applyFilters();
                window.loadingManager.hide();
            }, (error) => {
                console.error('Error loading customers:', error);
                this.showError('Failed to load customers');
                window.loadingManager.hide();
            });
        } catch (error) {
            console.error('Error loading customers:', error);
            this.showError('Failed to load customers');
            window.loadingManager.hide();
        }
    }

    applyFilters() {
        const searchTerm = document.getElementById('customer-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('status-filter')?.value || '';

        this.filteredCustomers = this.customers.filter(customer => {
            const matchesSearch = customer.name.toLowerCase().includes(searchTerm) ||
                                customer.phone.includes(searchTerm);
            const matchesStatus = !statusFilter || customer.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });

        this.renderCustomers();
    }

    handleScheduleChange(e) {
        const schedule = e.target.value;
        const morningDetails = document.getElementById('morning-details');
        const eveningDetails = document.getElementById('evening-details');
        
        // Hide both initially
        if (morningDetails) morningDetails.style.display = 'none';
        if (eveningDetails) eveningDetails.style.display = 'none';
        
        // Show based on selection
        if (schedule === 'morning-only' || schedule === 'both') {
            if (morningDetails) morningDetails.style.display = 'block';
        }
        
        if (schedule === 'evening-only' || schedule === 'both') {
            if (eveningDetails) eveningDetails.style.display = 'block';
        }
    }

    handleSearch() {
        this.applyFilters();
    }

    handleFilter() {
        this.applyFilters();
    }

    renderCustomers() {
        const customersGrid = document.getElementById('customers-grid');
        if (!customersGrid) return;

        if (this.filteredCustomers.length === 0) {
            customersGrid.innerHTML = `
                <div class="empty-state">
                    <i data-feather="users"></i>
                    <h3>No customers found</h3>
                    <p>Add your first customer to get started.</p>
                </div>
            `;
            feather.replace();
            return;
        }

        customersGrid.innerHTML = this.filteredCustomers.map(customer => `
            <div class="customer-card">
                <div class="customer-header">
                    <div class="customer-name">${customer.name}</div>
                    <span class="customer-status status-${customer.status}">
                        ${customer.status}
                    </span>
                </div>
                <div class="customer-details">
                    <div class="customer-detail">
                        <i data-feather="phone"></i>
                        <span>${customer.phone}</span>
                    </div>
                    <div class="customer-detail">
                        <i data-feather="droplet"></i>
                        <span>${this.getScheduleDisplay(customer)}</span>
                    </div>
                    <div class="customer-detail">
                        <i data-feather="dollar-sign"></i>
                        <span>₹${customer.rate}/L</span>
                    </div>
                    ${customer.address ? `
                        <div class="customer-detail">
                            <i data-feather="map-pin"></i>
                            <span>${customer.address}</span>
                        </div>
                    ` : ''}
                    ${customer.tg_chat_id ? `
                        <div class="customer-detail">
                            <i data-feather="send"></i>
                            <span>Telegram: ${customer.tg_chat_id}</span>
                        </div>
                    ` : ''}
                    ${customer.created_at ? `
                        <div class="customer-detail">
                            <i data-feather="calendar"></i>
                            <span>Added: ${this.formatDate(customer.created_at)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="customer-actions">
                    <button class="btn btn-secondary btn-small" onclick="customerManager.editCustomer('${customer.id}')">
                        <i data-feather="edit"></i>
                        Edit
                    </button>
                    <button class="btn btn-danger btn-small" onclick="customerManager.deleteCustomer('${customer.id}')">
                        <i data-feather="trash-2"></i>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');

        feather.replace();
    }

    openCustomerModal(customer = null) {
        const modal = document.getElementById('customer-modal');
        const modalTitle = document.getElementById('modal-title');
        const form = document.getElementById('customer-form');
        
        if (!modal || !modalTitle || !form) return;

        this.currentEditingId = customer ? customer.id : null;
        modalTitle.textContent = customer ? 'Edit Customer' : 'Add Customer';
        
        if (customer) {
            document.getElementById('customer-name').value = customer.name || '';
            document.getElementById('customer-phone').value = customer.phone || '';
            document.getElementById('customer-rate').value = customer.rate || '';
            document.getElementById('customer-address').value = customer.address || '';
            
            // Set scheduling fields
            this.setSchedulingFields(customer);
            // Set added date field
            if (customer.created_at) {
                const date = new Date(customer.created_at);
                document.getElementById('customer-added-date').value = date.toISOString().split('T')[0];
            } else {
                document.getElementById('customer-added-date').value = '';
            }
            document.getElementById('customer-telegram').value = customer.tg_chat_id || '';
            document.getElementById('customer-status').value = customer.status || 'active';
        } else {
            form.reset();
            document.getElementById('customer-status').value = 'active';
            // Set today's date as default for new customers
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('customer-added-date').value = today;
            
            // Reset scheduling fields
            this.resetSchedulingFields();
        }

        modal.classList.add('active');
    }

    closeCustomerModal() {
        const modal = document.getElementById('customer-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentEditingId = null;
    }

    async handleCustomerSubmit(e) {
        e.preventDefault();
        
        const schedulingData = this.collectSchedulingData();
        if (!schedulingData) {
            return; // Error already shown in collectSchedulingData
        }
        
        const formData = {
            name: document.getElementById('customer-name').value.trim(),
            phone: document.getElementById('customer-phone').value.trim(),
            rate: parseInt(document.getElementById('customer-rate').value),
            address: document.getElementById('customer-address').value.trim(),
            tg_chat_id: document.getElementById('customer-telegram').value.trim(),
            status: document.getElementById('customer-status').value,
            updated_at: new Date().toISOString(),
            ...schedulingData
        };

        // Handle custom added date
        const addedDateValue = document.getElementById('customer-added-date').value;
        if (addedDateValue) {
            formData.created_at = new Date(addedDateValue).toISOString();
        }

        // Validation
        if (!formData.name || !formData.phone || !formData.rate) {
            this.showError('Please fill in all required fields');
            return;
        }

        if (formData.rate <= 0) {
            this.showError('Rate must be a positive number');
            return;
        }

        try {
            this.showLoading(true);

            if (this.currentEditingId) {
                // Update existing customer - don't overwrite created_at if not provided
                if (!formData.created_at) {
                    delete formData.created_at;
                }
                const customerRef = doc(db, 'customers', this.currentEditingId);
                await updateDoc(customerRef, formData);
                
                // Send update notification to Telegram
                if (formData.tg_chat_id) {
                    await this.sendUpdateNotification(formData);
                }
                
                this.showSuccess('Customer updated successfully!', 'success');
            } else {
                // Add new customer - use created_at from form or current date
                if (!formData.created_at) {
                    formData.created_at = new Date().toISOString();
                }
                await addDoc(collection(db, 'customers'), formData);
                
                // Send registration success notification to Telegram
                if (formData.tg_chat_id) {
                    await this.sendRegistrationNotification(formData);
                }
                
                this.showSuccess('Customer added successfully!', 'success');
            }

            this.closeCustomerModal();
        } catch (error) {
            console.error('Error saving customer:', error);
            this.showError('Failed to save customer');
        } finally {
            this.showLoading(false);
        }
    }

    editCustomer(customerId) {
        const customer = this.customers.find(c => c.id === customerId);
        if (customer) {
            this.openCustomerModal(customer);
        }
    }

    async deleteCustomer(customerId) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        if (!confirm(`Are you sure you want to delete ${customer.name}? This will permanently delete all their data including deliveries and payments. This action cannot be undone.`)) {
            return;
        }

        try {
            this.showLoading(true);
            
            // Delete all deliveries for this customer
            const deliveriesRef = collection(db, 'deliveries');
            const deliveriesQuery = query(deliveriesRef, where('customer_id', '==', customerId));
            const deliveriesSnapshot = await getDocs(deliveriesQuery);
            
            const deliveryDeletePromises = [];
            deliveriesSnapshot.forEach((deliveryDoc) => {
                deliveryDeletePromises.push(deleteDoc(doc(db, 'deliveries', deliveryDoc.id)));
            });
            
            // Delete all payments for this customer
            const paymentsRef = collection(db, 'payments');
            const paymentsQuery = query(paymentsRef, where('customer_id', '==', customerId));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            
            const paymentDeletePromises = [];
            paymentsSnapshot.forEach((paymentDoc) => {
                paymentDeletePromises.push(deleteDoc(doc(db, 'payments', paymentDoc.id)));
            });
            
            // Execute all deletions in parallel
            await Promise.all([
                ...deliveryDeletePromises,
                ...paymentDeletePromises
            ]);
            
            // Finally delete the customer record
            await deleteDoc(doc(db, 'customers', customerId));
            
            console.log(`Successfully deleted customer ${customer.name} and all related data`);
            
        } catch (error) {
            console.error('Error deleting customer and related data:', error);
            this.showError('Failed to delete customer and related data');
        } finally {
            this.showLoading(false);
        }
    }

    getCustomers() {
        return this.customers;
    }

    getActiveCustomers() {
        return this.customers.filter(customer => customer.status === 'active');
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const iconName = type === 'success' ? 'check-circle' : 
                        type === 'error' ? 'x-circle' : 
                        type === 'warning' ? 'alert-triangle' : 'info';
        
        toast.innerHTML = `
            <i class="toast-icon" data-feather="${iconName}"></i>
            <div class="toast-content">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i data-feather="x"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        // Replace feather icons
        feather.replace();
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 4000);
    }

    async sendRegistrationNotification(customerData) {
        if (!customerData.tg_chat_id) {
            console.log('No Telegram chat ID for customer:', customerData.name);
            return;
        }

        try {
            // Use config manager for registration message
            const message = configManager.getRegistrationMessage(customerData);

            const settings = configManager.getSettings();
            const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: customerData.tg_chat_id,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (response.ok) {
                console.log(`Registration notification sent to ${customerData.name} (${customerData.tg_chat_id})`);
            } else {
                console.error('Telegram API error:', await response.text());
            }
        } catch (error) {
            console.error('Error sending registration notification:', error);
        }
    }

    async sendUpdateNotification(customerData) {
        if (!customerData.tg_chat_id) {
            console.log('No Telegram chat ID for customer:', customerData.name);
            return;
        }

        try {
            // Use config manager for customer update message
            const message = configManager.getCustomerUpdateMessage(customerData);

            const settings = configManager.getSettings();
            const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: customerData.tg_chat_id,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (response.ok) {
                console.log(`Update notification sent to ${customerData.name} (${customerData.tg_chat_id})`);
            } else {
                console.error('Telegram API error:', await response.text());
            }
        } catch (error) {
            console.error('Error sending update notification:', error);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    setSchedulingFields(customer) {
        const deliveryScheduleSelect = document.getElementById('delivery-schedule');
        const morningQtyInput = document.getElementById('morning-qty');
        const morningTimeInput = document.getElementById('morning-time');
        const eveningQtyInput = document.getElementById('evening-qty');
        const eveningTimeInput = document.getElementById('evening-time');
        
        // Handle legacy data - if customer has daily_qty but no schedule, convert it
        if (customer.daily_qty && !customer.delivery_schedule) {
            // Legacy customer - convert to morning only
            deliveryScheduleSelect.value = 'morning-only';
            morningQtyInput.value = customer.daily_qty;
            morningTimeInput.value = customer.morning_time || '06:00';
        } else {
            // New scheduling system
            deliveryScheduleSelect.value = customer.delivery_schedule || '';
            morningQtyInput.value = customer.morning_qty || '';
            morningTimeInput.value = customer.morning_time || '06:00';
            eveningQtyInput.value = customer.evening_qty || '';
            eveningTimeInput.value = customer.evening_time || '18:00';
        }
        
        // Trigger schedule change to show/hide appropriate sections
        this.handleScheduleChange({ target: deliveryScheduleSelect });
    }

    resetSchedulingFields() {
        const deliveryScheduleSelect = document.getElementById('delivery-schedule');
        const morningDetails = document.getElementById('morning-details');
        const eveningDetails = document.getElementById('evening-details');
        
        deliveryScheduleSelect.value = '';
        if (morningDetails) morningDetails.style.display = 'none';
        if (eveningDetails) eveningDetails.style.display = 'none';
        
        document.getElementById('morning-qty').value = '';
        document.getElementById('morning-time').value = '06:00';
        document.getElementById('evening-qty').value = '';
        document.getElementById('evening-time').value = '18:00';
    }

    collectSchedulingData() {
        const deliverySchedule = document.getElementById('delivery-schedule').value;
        
        if (!deliverySchedule) {
            this.showError('Please select a delivery schedule');
            return null;
        }
        
        const data = {
            delivery_schedule: deliverySchedule
        };
        
        // Collect morning data if needed
        if (deliverySchedule === 'morning-only' || deliverySchedule === 'both') {
            const morningQty = parseFloat(document.getElementById('morning-qty').value);
            const morningTime = document.getElementById('morning-time').value;
            
            if (!morningQty || morningQty <= 0) {
                this.showError('Please enter a valid morning quantity');
                return null;
            }
            
            data.morning_qty = morningQty;
            data.morning_time = morningTime;
        }
        
        // Collect evening data if needed
        if (deliverySchedule === 'evening-only' || deliverySchedule === 'both') {
            const eveningQty = parseFloat(document.getElementById('evening-qty').value);
            const eveningTime = document.getElementById('evening-time').value;
            
            if (!eveningQty || eveningQty <= 0) {
                this.showError('Please enter a valid evening quantity');
                return null;
            }
            
            data.evening_qty = eveningQty;
            data.evening_time = eveningTime;
        }
        
        // Calculate total daily quantity for compatibility
        data.daily_qty = (data.morning_qty || 0) + (data.evening_qty || 0);
        
        return data;
    }

    getScheduleDisplay(customer) {
        // Handle legacy customers
        if (customer.daily_qty && !customer.delivery_schedule) {
            return `${customer.daily_qty}L daily (Morning)`;
        }
        
        // New scheduling system
        const schedule = customer.delivery_schedule;
        
        if (schedule === 'morning-only') {
            return `${customer.morning_qty}L Morning (${customer.morning_time})`;
        } else if (schedule === 'evening-only') {
            return `${customer.evening_qty}L Evening (${customer.evening_time})`;
        } else if (schedule === 'both') {
            const total = (customer.morning_qty || 0) + (customer.evening_qty || 0);
            return `${total}L (${customer.morning_qty}L Morning, ${customer.evening_qty}L Evening)`;
        }
        
        return `${customer.daily_qty || 0}L daily`;
    }

    getScheduleDisplayForNotification(customer) {
        // Handle legacy customers
        if (customer.daily_qty && !customer.delivery_schedule) {
            return `${customer.daily_qty}L (Morning - ${customer.morning_time || '06:00'})`;
        }
        
        // New scheduling system
        const schedule = customer.delivery_schedule;
        
        if (schedule === 'morning-only') {
            return `🌅 Morning - ${customer.morning_qty}L (${customer.morning_time})`;
        } else if (schedule === 'evening-only') {
            return `🌆 Evening - ${customer.evening_qty}L (${customer.evening_time})`;
        } else if (schedule === 'both') {
            return `🌅 Morning ${customer.morning_qty}L (${customer.morning_time}) + 🌆 Evening ${customer.evening_qty}L (${customer.evening_time})`;
        }
        
        return `${customer.daily_qty || 0}L daily`;
    }
}

// Create global customer manager instance
const customerManager = new CustomerManager();
window.customerManager = customerManager;

export default customerManager;
