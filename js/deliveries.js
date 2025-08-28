import { db, functions } from './firebase-config.js';
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
    where, 
    orderBy,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

class DeliveryManager {
    constructor() {
        this.deliveries = [];
        this.currentDate = new Date().toISOString().split('T')[0];
        this.customers = [];
        this.filteredCustomers = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setCurrentDate();
        this.loadDeliveries();
    }

    setupEventListeners() {
        // Date selector
        const dateInput = document.getElementById('delivery-date');
        if (dateInput) {
            dateInput.addEventListener('change', this.handleDateChange.bind(this));
        }

        // Mark all delivered button
        const markAllBtn = document.getElementById('mark-all-delivered-btn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', this.markAllDelivered.bind(this));
        }

        // Search input
        const searchInput = document.getElementById('delivery-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearch.bind(this));
        }

        // Time slot filter
        const timeSlotFilter = document.getElementById('time-slot-filter');
        if (timeSlotFilter) {
            timeSlotFilter.addEventListener('change', this.handleTimeSlotFilter.bind(this));
        }
    }

    setCurrentDate() {
        const dateInput = document.getElementById('delivery-date');
        if (dateInput) {
            dateInput.value = this.currentDate;
        }
    }

    handleDateChange(e) {
        this.currentDate = e.target.value;
        this.loadDeliveries();
    }

    async loadDeliveries() {
        try {
            window.loadingManager.show('Loading deliveries...');
            // First, get all customers
            await this.loadCustomers();
            
            // Then load deliveries for the selected date
            const deliveriesRef = collection(db, 'deliveries');
            const q = query(
                deliveriesRef, 
                where('date', '==', this.currentDate)
            );
            
            onSnapshot(q, (snapshot) => {
                this.deliveries = [];
                snapshot.forEach((doc) => {
                    this.deliveries.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                this.renderDeliveries();
                window.loadingManager.hide();
            }, (error) => {
                console.error('Error loading deliveries:', error);
                this.showError('Failed to load deliveries');
                window.loadingManager.hide();
            });
        } catch (error) {
            console.error('Error loading deliveries:', error);
            this.showError('Failed to load deliveries');
            window.loadingManager.hide();
        }
    }

    async loadCustomers() {
        try {
            const customersRef = collection(db, 'customers');
            const q = query(customersRef, where('status', '==', 'active'));
            const snapshot = await getDocs(q);
            
            this.customers = [];
            snapshot.forEach((doc) => {
                this.customers.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            this.applySearchFilter();
        } catch (error) {
            console.error('Error loading customers:', error);
        }
    }

    applySearchFilter() {
        const searchTerm = document.getElementById('delivery-search')?.value.toLowerCase() || '';
        const timeSlotFilter = document.getElementById('time-slot-filter')?.value || '';
        
        let filtered = [...this.customers];
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(customer => 
                customer.name.toLowerCase().includes(searchTerm) ||
                customer.phone.includes(searchTerm)
            );
        }
        
        // Apply time slot filter
        if (timeSlotFilter) {
            filtered = filtered.filter(customer => {
                const schedule = customer.delivery_schedule;
                
                if (timeSlotFilter === 'morning') {
                    return schedule === 'morning-only' || schedule === 'both' || 
                           (!schedule && customer.daily_qty); // Legacy customers default to morning
                } else if (timeSlotFilter === 'evening') {
                    return schedule === 'evening-only' || schedule === 'both';
                }
                
                return true;
            });
        }
        
        this.filteredCustomers = filtered;
        this.renderDeliveries();
    }

    handleSearch() {
        this.applySearchFilter();
    }

    handleTimeSlotFilter() {
        this.applySearchFilter();
    }

    renderDeliveries() {
        const deliveriesList = document.getElementById('deliveries-list');
        if (!deliveriesList) return;

        const customersToShow = this.filteredCustomers.length > 0 ? this.filteredCustomers : this.customers;
        
        if (customersToShow.length === 0) {
            deliveriesList.innerHTML = `
                <div class="empty-state">
                    <i data-feather="users"></i>
                    <h3>No active customers</h3>
                    <p>Add some active customers to manage deliveries.</p>
                </div>
            `;
            feather.replace();
            return;
        }

        // Create delivery items for filtered customers with time slots
        const deliveryItems = customersToShow.map(customer => {
            return this.createCustomerDeliveryItem(customer);
        }).join('');

        deliveriesList.innerHTML = deliveryItems;
        feather.replace();

        // Add event listeners for quantity inputs
        this.setupQuantityInputs();
    }

    setupQuantityInputs() {
        const qtyInputs = document.querySelectorAll('.qty-input');
        qtyInputs.forEach(input => {
            input.addEventListener('change', this.handleQuantityChange.bind(this));
        });
    }

    handleQuantityChange(e) {
        const customerId = e.target.dataset.customerId;
        const timeSlot = e.target.dataset.timeSlot || 'morning';
        const newQty = parseFloat(e.target.value);
        
        if (newQty <= 0) {
            e.target.value = this.getCustomerDefaultQty(customerId, timeSlot);
            return;
        }

        // Update the amount display
        this.updateAmountDisplay(customerId, newQty, timeSlot);
    }

    getCustomerDefaultQty(customerId, timeSlot = 'morning') {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return 1;
        
        if (timeSlot === 'morning') {
            return customer.morning_qty || customer.daily_qty || 1;
        } else {
            return customer.evening_qty || 0;
        }
    }

    createCustomerDeliveryItem(customer) {
        const deliveryItems = [];
        const timeSlotFilter = document.getElementById('time-slot-filter')?.value || '';
        
        // Handle legacy customers or customers with morning-only schedule
        if (!customer.delivery_schedule || customer.delivery_schedule === 'morning-only' || 
            (customer.daily_qty && !customer.delivery_schedule)) {
            if (!timeSlotFilter || timeSlotFilter === 'morning') {
                deliveryItems.push(this.createTimeSlotDelivery(customer, 'morning'));
            }
        }
        
        // Handle evening-only schedule
        if (customer.delivery_schedule === 'evening-only') {
            if (!timeSlotFilter || timeSlotFilter === 'evening') {
                deliveryItems.push(this.createTimeSlotDelivery(customer, 'evening'));
            }
        }
        
        // Handle both morning and evening
        if (customer.delivery_schedule === 'both') {
            if (!timeSlotFilter || timeSlotFilter === 'morning') {
                deliveryItems.push(this.createTimeSlotDelivery(customer, 'morning'));
            }
            if (!timeSlotFilter || timeSlotFilter === 'evening') {
                deliveryItems.push(this.createTimeSlotDelivery(customer, 'evening'));
            }
        }
        
        return deliveryItems.join('');
    }

    createTimeSlotDelivery(customer, timeSlot) {
        const existingDelivery = this.deliveries.find(d => 
            d.customer_id === customer.id && d.time_slot === timeSlot
        );
        
        const status = existingDelivery ? existingDelivery.status : 'pending';
        const quantity = existingDelivery ? existingDelivery.qty : this.getCustomerDefaultQty(customer.id, timeSlot);
        const amount = quantity * customer.rate;
        
        const timeDisplay = timeSlot === 'morning' ? 
            (customer.morning_time || '06:00') : 
            (customer.evening_time || '18:00');
        
        const timeSlotLabel = timeSlot === 'morning' ? 'Morning' : 'Evening';
        const timeSlotIcon = timeSlot === 'morning' ? 'sunrise' : 'sunset';
        
        return `
            <div class="delivery-item time-slot-${timeSlot}" data-customer-id="${customer.id}" data-time-slot="${timeSlot}">
                <div class="delivery-info">
                    <div class="delivery-customer">
                        <span class="customer-name">${customer.name}</span>
                        <span class="time-slot-badge">
                            <i data-feather="${timeSlotIcon}"></i>
                            ${timeSlotLabel} (${timeDisplay})
                        </span>
                    </div>
                    <div class="delivery-details">
                        ${customer.phone} • ₹${customer.rate}/L • Amount: ₹${amount}
                    </div>
                </div>
                <div class="delivery-qty">
                    <input 
                        type="number" 
                        class="qty-input" 
                        value="${quantity}" 
                        step="0.1" 
                        min="0.1"
                        data-customer-id="${customer.id}"
                        data-time-slot="${timeSlot}"
                        ${status !== 'pending' ? 'readonly' : ''}
                    >
                    <span>L</span>
                </div>
                <div class="delivery-actions">
                    ${status === 'pending' ? `
                        <button class="btn btn-success btn-small" onclick="deliveryManager.markDelivered('${customer.id}', '${timeSlot}')">
                            <i data-feather="check"></i>
                            Delivered
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deliveryManager.markSkipped('${customer.id}', '${timeSlot}')">
                            <i data-feather="x"></i>
                            Skipped
                        </button>
                    ` : `
                        <div class="delivery-status status-${status}">
                            ${status.charAt(0).toUpperCase() + status.slice(1)}
                        </div>
                        <button class="btn btn-secondary btn-small" onclick="deliveryManager.resetDelivery('${customer.id}', '${timeSlot}')">
                            <i data-feather="refresh-cw"></i>
                            Reset
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    updateAmountDisplay(customerId, quantity, timeSlot = 'morning') {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        const amount = quantity * customer.rate;
        const deliveryItem = document.querySelector(`[data-customer-id="${customerId}"][data-time-slot="${timeSlot}"]`);
        if (deliveryItem) {
            const detailsElement = deliveryItem.querySelector('.delivery-details');
            if (detailsElement) {
                detailsElement.textContent = `${customer.phone} • ₹${customer.rate}/L • Amount: ₹${amount}`;
            }
        }
    }

    async markDelivered(customerId, timeSlot = 'morning') {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        const qtyInput = document.querySelector(`input[data-customer-id="${customerId}"][data-time-slot="${timeSlot}"]`);
        const quantity = qtyInput ? parseFloat(qtyInput.value) : this.getCustomerDefaultQty(customerId, timeSlot);

        await this.saveDelivery(customerId, quantity, 'delivered', timeSlot);
    }

    async markSkipped(customerId, timeSlot = 'morning') {
        await this.saveDelivery(customerId, 0, 'skipped', timeSlot);
    }

    async resetDelivery(customerId, timeSlot = 'morning') {
        const existingDelivery = this.deliveries.find(d => 
            d.customer_id === customerId && d.time_slot === timeSlot
        );
        if (!existingDelivery) return;

        if (!confirm('Are you sure you want to reset this delivery?')) {
            return;
        }

        try {
            this.showLoading(true);
            
            // Remove the existing delivery record
            await deleteDoc(doc(db, 'deliveries', existingDelivery.id));
            
        } catch (error) {
            console.error('Error resetting delivery:', error);
            this.showError('Failed to reset delivery');
        } finally {
            this.showLoading(false);
        }
    }

    async saveDelivery(customerId, quantity, status, timeSlot = 'morning') {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        const deliveryData = {
            customer_id: customerId,
            date: this.currentDate,
            time_slot: timeSlot,
            qty: quantity,
            rate: customer.rate,
            amount: quantity * customer.rate,
            status: status,
            created_at: new Date().toISOString()
        };

        try {
            this.showLoading(true);

            // Check if delivery already exists for this time slot
            const existingDelivery = this.deliveries.find(d => 
                d.customer_id === customerId && d.time_slot === timeSlot
            );
            
            if (existingDelivery) {
                // Update existing delivery
                const deliveryRef = doc(db, 'deliveries', existingDelivery.id);
                await updateDoc(deliveryRef, {
                    ...deliveryData,
                    updated_at: new Date().toISOString()
                });
            } else {
                // Create new delivery
                await addDoc(collection(db, 'deliveries'), deliveryData);
            }

            // Send Telegram notification
            await this.sendTelegramNotification(customer, deliveryData);

        } catch (error) {
            console.error('Error saving delivery:', error);
            this.showError('Failed to save delivery');
        } finally {
            this.showLoading(false);
        }
    }

    async sendTelegramNotification(customer, deliveryData) {
        if (!customer.tg_chat_id) {
            console.log('No Telegram chat ID for customer:', customer.name);
            return; // No Telegram chat ID, skip notification
        }

        try {
            // Direct Telegram API call instead of Cloud Functions
            let message;
            
            const timeSlotEmoji = deliveryData.time_slot === 'morning' ? '🌅' : '🌆';
            const timeSlotText = deliveryData.time_slot === 'morning' ? 'सुबह (Morning)' : 'शाम (Evening)';
            const timeDisplay = deliveryData.time_slot === 'morning' ? 
                (customer.morning_time || '06:00') : 
                (customer.evening_time || '18:00');
            
            if (deliveryData.status === 'delivered') {
                // Use config manager for dynamic message content
                message = configManager.getDeliveryMessage(
                    customer.name,
                    deliveryData.date,
                    deliveryData.qty,
                    deliveryData.rate,
                    deliveryData.amount,
                    'delivered',
                    deliveryData.time_slot
                );
            } else if (deliveryData.status === 'skipped') {
                // Use config manager for dynamic message content
                message = configManager.getDeliveryMessage(
                    customer.name,
                    deliveryData.date,
                    deliveryData.qty,
                    deliveryData.rate,
                    deliveryData.amount,
                    'skipped',
                    deliveryData.time_slot
                );
            }

            const settings = configManager.getSettings();
            const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: customer.tg_chat_id,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            if (response.ok) {
                console.log(`Telegram notification sent to ${customer.name} (${customer.tg_chat_id})`);
                
                // Send same notification to admin
                await this.sendAdminNotification(customer, deliveryData, message);
                
                this.showSuccess(`Delivery saved and notification sent to ${customer.name}!`);
            } else {
                console.error('Telegram API error:', await response.text());
                this.showError(`Delivery saved but failed to send notification to ${customer.name}`);
            }
        } catch (error) {
            console.error('Error sending Telegram notification:', error);
            this.showError(`Delivery saved but failed to send notification to ${customer.name}`);
        }
    }

    async sendAdminNotification(customer, deliveryData, originalMessage) {
        const settings = configManager.getSettings();
        const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
        const ADMIN_CHAT_ID = settings?.telegram?.adminChatId || '5861659575';
        
        try {
            // Create admin-specific message with customer info
            let adminMessage;
            
            const timeSlotEmoji = deliveryData.time_slot === 'morning' ? '🌅' : '🌆';
            const timeSlotText = deliveryData.time_slot === 'morning' ? 'MORNING' : 'EVENING';
            const timeDisplay = deliveryData.time_slot === 'morning' ? 
                (customer.morning_time || '06:00') : 
                (customer.evening_time || '18:00');
            
            if (deliveryData.status === 'delivered') {
                // Use config manager for dynamic admin message
                adminMessage = configManager.getAdminDeliveryMessage(
                    customer.name,
                    customer.phone,
                    deliveryData.date,
                    deliveryData.qty,
                    deliveryData.rate,
                    deliveryData.amount,
                    'delivered'
                );
            } else if (deliveryData.status === 'skipped') {
                // Use config manager for dynamic admin message
                adminMessage = configManager.getAdminDeliveryMessage(
                    customer.name,
                    customer.phone,
                    deliveryData.date,
                    deliveryData.qty,
                    deliveryData.rate,
                    deliveryData.amount,
                    'skipped'
                );
            }
            
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: ADMIN_CHAT_ID,
                    text: adminMessage,
                    parse_mode: 'HTML'
                })
            });
            
            if (response.ok) {
                console.log(`Admin notification sent for ${customer.name} delivery`);
            } else {
                console.error('Failed to send admin notification:', await response.text());
            }
        } catch (error) {
            console.error('Error sending admin notification:', error);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('hi-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    showSuccess(message) {
        alert(`Success: ${message}`);
    }

    showError(message) {
        alert(`Error: ${message}`);
    }

    async markAllDelivered() {
        if (!confirm('Mark all pending deliveries as delivered?')) {
            return;
        }

        try {
            this.showLoading(true);

            const pendingCustomers = this.customers.filter(customer => {
                const existingDelivery = this.deliveries.find(d => d.customer_id === customer.id);
                return !existingDelivery || existingDelivery.status === 'pending';
            });

            for (const customer of pendingCustomers) {
                const qtyInput = document.querySelector(`input[data-customer-id="${customer.id}"]`);
                const quantity = qtyInput ? parseFloat(qtyInput.value) : customer.daily_qty;
                
                await this.saveDelivery(customer.id, quantity, 'delivered');
            }

        } catch (error) {
            console.error('Error marking all delivered:', error);
            this.showError('Failed to mark all deliveries');
        } finally {
            this.showLoading(false);
        }
    }

    getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const todayDeliveries = this.deliveries.filter(d => d.date === today);
        
        const delivered = todayDeliveries.filter(d => d.status === 'delivered').length;
        const skipped = todayDeliveries.filter(d => d.status === 'skipped').length;
        const pending = this.customers.length - todayDeliveries.length;
        
        const totalMilk = todayDeliveries
            .filter(d => d.status === 'delivered')
            .reduce((sum, d) => sum + d.qty, 0);
            
        const totalRevenue = todayDeliveries
            .filter(d => d.status === 'delivered')
            .reduce((sum, d) => sum + d.amount, 0);

        return {
            delivered,
            skipped,
            pending,
            totalMilk,
            totalRevenue
        };
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }

    showError(message) {
        alert(message);
    }
}

// Create global delivery manager instance
const deliveryManager = new DeliveryManager();
window.deliveryManager = deliveryManager;

export default deliveryManager;
