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
    where, 
    orderBy,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class PaymentManager {
    constructor() {
        this.customers = [];
        this.deliveries = [];
        this.payments = [];
        this.currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        this.filteredPayments = [];
        this.selectedCustomerForReminder = null;
        this.filteredCustomersForReminder = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setCurrentMonth();
        this.loadData();
    }

    setupEventListeners() {
        // Month selector
        const monthInput = document.getElementById('payment-month');
        if (monthInput) {
            monthInput.addEventListener('change', this.handleMonthChange.bind(this));
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-payments');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.loadData.bind(this));
        }

        // Payment status filter
        const statusFilter = document.getElementById('payment-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', this.applyFilters.bind(this));
        }

        // Search input
        const searchInput = document.getElementById('payment-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.applyFilters.bind(this));
        }

        // Payment reminders button
        const reminderBtn = document.getElementById('send-payment-reminders');
        if (reminderBtn) {
            reminderBtn.addEventListener('click', this.sendPaymentReminders.bind(this));
        }

        // Individual reminder elements
        const individualReminderSearch = document.getElementById('reminder-customer-search');
        if (individualReminderSearch) {
            individualReminderSearch.addEventListener('input', this.handleIndividualSearch.bind(this));
        }

        const individualReminderSelect = document.getElementById('reminder-customer-select');
        if (individualReminderSelect) {
            individualReminderSelect.addEventListener('change', this.handleIndividualSelect.bind(this));
        }

        const sendIndividualReminderBtn = document.getElementById('send-individual-reminder');
        if (sendIndividualReminderBtn) {
            sendIndividualReminderBtn.addEventListener('click', this.sendIndividualReminder.bind(this));
        }

        const clearReminderBtn = document.getElementById('clear-reminder-selection');
        if (clearReminderBtn) {
            clearReminderBtn.addEventListener('click', this.clearReminderSelection.bind(this));
        }

        // PDF generation button
        const pdfBtn = document.getElementById('generate-pdf-report');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', this.generatePDFReport.bind(this));
        }
    }

    setCurrentMonth() {
        const monthInput = document.getElementById('payment-month');
        if (monthInput) {
            monthInput.value = this.currentMonth;
        }
    }

    handleMonthChange(e) {
        this.currentMonth = e.target.value;
        this.loadData();
    }

    async loadData() {
        try {
            window.loadingManager.show('Loading payment data...');
            this.showLoading(true);
            await Promise.all([
                this.loadCustomers(),
                this.loadDeliveries(),
                this.loadPayments()
            ]);
            this.calculatePaymentData();
            this.applyFilters();
            this.populateCustomerDropdownForReminder();
        } catch (error) {
            console.error('Error loading payment data:', error);
            this.showError('Failed to load payment data');
        } finally {
            this.showLoading(false);
            window.loadingManager.hide();
        }
    }

    async loadCustomers() {
        try {
            const customersRef = collection(db, 'customers');
            const q = query(customersRef, orderBy('name'));
            const snapshot = await getDocs(q);
            
            this.customers = [];
            snapshot.forEach((doc) => {
                this.customers.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } catch (error) {
            console.error('Error loading customers:', error);
        }
    }

    async loadDeliveries() {
        try {
            const deliveriesRef = collection(db, 'deliveries');
            const startDate = `${this.currentMonth}-01`;
            const endDate = `${this.currentMonth}-31`;
            
            const q = query(
                deliveriesRef,
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
            
            const snapshot = await getDocs(q);
            
            this.deliveries = [];
            snapshot.forEach((doc) => {
                this.deliveries.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } catch (error) {
            console.error('Error loading deliveries:', error);
        }
    }

    async loadPayments() {
        try {
            const paymentsRef = collection(db, 'payments');
            const q = query(
                paymentsRef,
                where('month', '==', this.currentMonth)
            );
            
            const snapshot = await getDocs(q);
            
            this.payments = [];
            snapshot.forEach((doc) => {
                this.payments.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } catch (error) {
            console.error('Error loading payments:', error);
        }
    }

    calculatePaymentData() {
        this.paymentData = [];
        
        this.customers.forEach(customer => {
            // Get customer's deliveries for the month
            const customerDeliveries = this.deliveries.filter(d => d.customer_id === customer.id);
            
            // Calculate totals
            const totalDelivered = customerDeliveries
                .filter(d => d.status === 'delivered')
                .reduce((sum, d) => sum + d.qty, 0);
            
            const totalAmount = customerDeliveries
                .filter(d => d.status === 'delivered')
                .reduce((sum, d) => sum + d.amount, 0);
            
            const daysSkipped = customerDeliveries
                .filter(d => d.status === 'skipped').length;
            
            const daysDelivered = customerDeliveries
                .filter(d => d.status === 'delivered').length;
            
            // Get payment info
            const payment = this.payments.find(p => p.customer_id === customer.id);
            const paidAmount = payment ? payment.paid_amount : 0;
            const paymentStatus = this.getPaymentStatus(totalAmount, paidAmount);
            
            this.paymentData.push({
                customer: customer,
                totalMilk: totalDelivered,
                totalAmount: totalAmount,
                paidAmount: paidAmount,
                balanceAmount: totalAmount - paidAmount,
                daysDelivered: daysDelivered,
                daysSkipped: daysSkipped,
                paymentStatus: paymentStatus,
                paymentDate: payment ? payment.payment_date : null,
                paymentId: payment ? payment.id : null
            });
        });
        
        this.updateStats();
    }

    getPaymentStatus(totalAmount, paidAmount) {
        if (paidAmount === 0) return 'pending';
        if (paidAmount >= totalAmount) return 'paid';
        return 'partial';
    }

    updateStats() {
        const totalRevenue = this.paymentData.reduce((sum, data) => sum + data.totalAmount, 0);
        const totalPaid = this.paymentData.reduce((sum, data) => sum + data.paidAmount, 0);
        const paidCustomers = this.paymentData.filter(data => data.paymentStatus === 'paid').length;
        const pendingPayments = this.paymentData.filter(data => data.paymentStatus === 'pending').length;
        const totalMilk = this.paymentData.reduce((sum, data) => sum + data.totalMilk, 0);

        document.getElementById('total-monthly-revenue').textContent = `₹${totalRevenue}`;
        document.getElementById('paid-customers').textContent = paidCustomers;
        document.getElementById('pending-payments').textContent = pendingPayments;
        document.getElementById('total-milk-delivered').textContent = `${totalMilk}L`;
    }

    applyFilters() {
        const searchTerm = document.getElementById('payment-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('payment-status-filter')?.value || '';
        
        this.filteredPayments = this.paymentData.filter(data => {
            const matchesSearch = data.customer.name.toLowerCase().includes(searchTerm) ||
                                data.customer.phone.includes(searchTerm);
            const matchesStatus = !statusFilter || data.paymentStatus === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
        
        this.renderPaymentTable();
    }

    renderPaymentTable() {
        const tableContainer = document.getElementById('payments-table');
        if (!tableContainer) return;

        if (this.filteredPayments.length === 0) {
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <i data-feather="users"></i>
                    <h3>No payment data found</h3>
                    <p>No customers match the current filters.</p>
                </div>
            `;
            feather.replace();
            return;
        }

        const tableHTML = `
            <table class="payment-table">
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Days Delivered</th>
                        <th>Days Skipped</th>
                        <th>Total Milk (L)</th>
                        <th>Total Amount</th>
                        <th>Paid Amount</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredPayments.map(data => `
                        <tr class="payment-row">
                            <td>
                                <div class="customer-info">
                                    <div class="customer-name">${data.customer.name}</div>
                                    <div class="customer-phone">${data.customer.phone}</div>
                                </div>
                            </td>
                            <td>${data.daysDelivered}</td>
                            <td>${data.daysSkipped}</td>
                            <td>${data.totalMilk.toFixed(1)}</td>
                            <td>₹${data.totalAmount}</td>
                            <td>₹${data.paidAmount}</td>
                            <td>₹${data.balanceAmount}</td>
                            <td>
                                <span class="payment-status status-${data.paymentStatus}">
                                    ${data.paymentStatus.charAt(0).toUpperCase() + data.paymentStatus.slice(1)}
                                </span>
                            </td>
                            <td>
                                <div class="payment-actions">
                                    <button class="btn btn-primary btn-small" onclick="paymentManager.recordPayment('${data.customer.id}', ${data.totalAmount}, ${data.paidAmount})">
                                        <i data-feather="plus"></i>
                                        Record Payment
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = tableHTML;
        feather.replace();
    }

    async recordPayment(customerId, totalAmount, currentPaid) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        const balance = totalAmount - currentPaid;
        const amount = prompt(`Record payment for ${customer.name}\nBalance Amount: ₹${balance}\n\nEnter payment amount:`);
        
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            this.showError('Please enter a valid payment amount');
            return;
        }

        const paymentAmount = parseFloat(amount);
        const newPaidAmount = currentPaid + paymentAmount;

        try {
            this.showLoading(true);

            const paymentData = {
                customer_id: customerId,
                month: this.currentMonth,
                paid_amount: newPaidAmount,
                total_amount: totalAmount,
                payment_date: new Date().toISOString().split('T')[0],
                last_payment_amount: paymentAmount,
                updated_at: new Date().toISOString()
            };

            // Check if payment record exists
            const existingPayment = this.payments.find(p => p.customer_id === customerId);
            
            if (existingPayment) {
                // Update existing payment
                const paymentRef = doc(db, 'payments', existingPayment.id);
                await updateDoc(paymentRef, paymentData);
            } else {
                // Create new payment record
                paymentData.created_at = new Date().toISOString();
                await addDoc(collection(db, 'payments'), paymentData);
            }

            // Send payment recorded notification
            if (customer.tg_chat_id) {
                await this.sendPaymentRecordedNotification(customer, paymentAmount, newPaidAmount, totalAmount, this.currentMonth);
            }

            // Check if payment is now complete and send completion notification
            if (newPaidAmount >= totalAmount && customer.tg_chat_id) {
                await this.sendPaymentCompletionNotification(customer, totalAmount, this.currentMonth);
            }

            this.showSuccess(`Payment of ₹${paymentAmount} recorded for ${customer.name}`);
            await this.loadData(); // Refresh data

        } catch (error) {
            console.error('Error recording payment:', error);
            this.showError('Failed to record payment');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }

    showError(message) {
        if (window.app) {
            window.app.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    showSuccess(message) {
        if (window.app) {
            window.app.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }

    async sendPaymentRecordedNotification(customer, paymentAmount, totalPaid, totalAmount, month) {
        if (!customer.tg_chat_id) {
            console.log('No Telegram chat ID for customer:', customer.name);
            return;
        }

        try {
            const monthName = new Date(month + '-01').toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
            });

            const balance = totalAmount - totalPaid;
            const status = balance <= 0 ? 'Paid' : `Balance: ₹${balance}`;

            // Use config manager for payment message
            const message = configManager.getPaymentMessage(customer.name, monthName, paymentAmount, totalPaid, totalAmount, status);

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
                console.log('Payment recorded notification sent to:', customer.name);
            } else {
                console.error('Failed to send payment recorded notification');
            }
        } catch (error) {
            console.error('Error sending payment recorded notification:', error);
        }
    }

    async sendPaymentCompletionNotification(customer, totalAmount, month) {
        if (!customer.tg_chat_id) {
            console.log('No Telegram chat ID for customer:', customer.name);
            return;
        }

        try {
            const monthName = new Date(month + '-01').toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
            });

            // Use config manager for payment completion message
            const message = configManager.getPaymentCompletionMessage(customer.name, monthName, totalAmount);

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
                console.log('Payment completion notification sent to:', customer.name);
            } else {
                console.error('Failed to send payment completion notification');
            }
        } catch (error) {
            console.error('Error sending payment completion notification:', error);
        }
    }

    async sendPaymentReminders() {
        if (!this.paymentData || this.paymentData.length === 0) {
            this.showError('No payment data available. Please refresh the data first.');
            return;
        }

        // Filter customers with pending or partial payments who have Telegram IDs
        const eligibleCustomers = this.paymentData.filter(data => 
            (data.paymentStatus === 'pending' || data.paymentStatus === 'partial') && 
            data.customer.tg_chat_id && 
            data.customer.tg_chat_id.trim() !== ''
        );

        if (eligibleCustomers.length === 0) {
            this.showError('No customers with pending/partial payments have Telegram Chat ID configured.');
            return;
        }

        // Confirm with admin
        const confirmMessage = `Send payment reminders to ${eligibleCustomers.length} customers with pending/partial payments?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.showLoading(true);
            
            let successCount = 0;
            let failCount = 0;

            for (const data of eligibleCustomers) {
                try {
                    await this.sendPaymentReminderToCustomer(data);
                    successCount++;
                    console.log(`Payment reminder sent to ${data.customer.name}`);
                    
                    // Add delay between sends to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    failCount++;
                    console.error(`Failed to send reminder to ${data.customer.name}:`, error);
                    console.error('Customer data:', data.customer);
                    console.error('Payment data:', data);
                }
            }

            // Show results
            if (failCount === 0) {
                this.showSuccess(`Payment reminders sent successfully to all ${successCount} customers!`);
            } else {
                this.showError(`Reminders sent: ${successCount} successful, ${failCount} failed`);
            }

        } catch (error) {
            console.error('Error sending payment reminders:', error);
            this.showError('Failed to send payment reminders');
        } finally {
            this.showLoading(false);
        }
    }

    async sendPaymentReminderToCustomer(paymentData) {
        const { customer, totalAmount, paidAmount, balanceAmount, daysDelivered, totalMilk } = paymentData;
        
        if (!customer.tg_chat_id) {
            throw new Error('No Telegram chat ID');
        }

        try {
            const monthName = new Date(this.currentMonth + '-01').toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
            });

            const statusText = paymentData.paymentStatus === 'pending' ? 'Payment Pending' : 'Partial Payment';
            const dueDateText = this.getPaymentDueDate();

            // Debug logging
            console.log('Sending reminder for customer:', customer.name);
            console.log('Customer Telegram ID:', customer.tg_chat_id);
            console.log('Payment data for reminder:', {
                totalAmount, paidAmount, balanceAmount, daysDelivered, totalMilk: totalMilk.toFixed(1)
            });

            // Use config manager for payment reminder message
            const message = configManager.getPaymentReminderMessage(
                customer.name,
                monthName,
                statusText,
                totalAmount,
                paidAmount,
                balanceAmount,
                daysDelivered,
                totalMilk.toFixed(1),
                customer.rate,
                dueDateText
            );

            const settings = configManager.getSettings();
            const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
            
            // Validate bot token
            if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
                throw new Error('Telegram Bot Token is not configured');
            }
            
            console.log('Using bot token:', TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');
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

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Telegram API Error Response:', errorText);
                console.error('Request details:', {
                    chatId: customer.tg_chat_id,
                    messageLength: message.length,
                    botToken: TELEGRAM_BOT_TOKEN ? 'Present' : 'Missing'
                });
                throw new Error(`Telegram API error: ${errorText}`);
            }

            return response.json();
        } catch (error) {
            throw new Error(`Failed to send reminder: ${error.message}`);
        }
    }

    getPaymentDueDate() {
        // Calculate due date (e.g., 5th of next month)
        const currentDate = new Date();
        const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 5);
        
        return nextMonth.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }

    formatDate(dateString) {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    // Individual Reminder Methods
    populateCustomerDropdownForReminder() {
        const select = document.getElementById('reminder-customer-select');
        if (!select) return;

        select.innerHTML = '<option value="">Select a customer</option>';
        
        // Filter customers with Telegram chat IDs
        const customersWithTelegram = this.customers.filter(customer => 
            customer.tg_chat_id && customer.tg_chat_id.trim() !== ''
        );

        customersWithTelegram.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = `${customer.name} - ${customer.phone}`;
            select.appendChild(option);
        });
    }

    handleIndividualSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const select = document.getElementById('reminder-customer-select');
        
        if (searchTerm.length === 0) {
            select.style.display = 'none';
            this.clearReminderSelection();
            return;
        }

        // Filter customers based on search term
        this.filteredCustomersForReminder = this.customers.filter(customer => {
            const hasSearchMatch = customer.name.toLowerCase().includes(searchTerm) ||
                                  customer.phone.includes(searchTerm);
            const hasTelegramId = customer.tg_chat_id && customer.tg_chat_id.trim() !== '';
            return hasSearchMatch && hasTelegramId;
        });

        // Update dropdown options
        select.innerHTML = '<option value="">Select from search results...</option>';
        
        this.filteredCustomersForReminder.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = `${customer.name} - ${customer.phone}`;
            select.appendChild(option);
        });

        // Show dropdown if there are results
        if (this.filteredCustomersForReminder.length > 0) {
            select.style.display = 'block';
        } else {
            select.style.display = 'none';
        }
    }

    handleIndividualSelect(e) {
        const customerId = e.target.value;
        
        if (!customerId) {
            this.clearReminderSelection();
            return;
        }

        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        this.selectedCustomerForReminder = customer;
        
        // Update search input to show selected customer
        const searchInput = document.getElementById('reminder-customer-search');
        searchInput.value = `${customer.name} - ${customer.phone}`;
        
        // Hide dropdown
        const select = document.getElementById('reminder-customer-select');
        select.style.display = 'none';
        
        // Show customer info and enable send button
        this.displaySelectedCustomerInfo(customer);
        
        const sendBtn = document.getElementById('send-individual-reminder');
        sendBtn.disabled = false;
    }

    displaySelectedCustomerInfo(customer) {
        const infoContainer = document.getElementById('selected-customer-info');
        const nameElement = document.getElementById('selected-customer-name');
        const detailsElement = document.getElementById('selected-customer-details');
        
        nameElement.textContent = customer.name;
        
        // Get payment data for this customer
        const customerPaymentData = this.paymentData.find(data => data.customer.id === customer.id);
        
        if (customerPaymentData) {
            const monthName = new Date(this.currentMonth + '-01').toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
            });
            
            detailsElement.innerHTML = `
                <div>📞 Phone: ${customer.phone}</div>
                <div>📅 Month: ${monthName}</div>
                <div>💰 Total Amount: ₹${customerPaymentData.totalAmount}</div>
                <div>✅ Paid Amount: ₹${customerPaymentData.paidAmount}</div>
                <div>🔔 Balance Due: ₹${customerPaymentData.balanceAmount}</div>
                <div>📊 Status: ${customerPaymentData.paymentStatus.charAt(0).toUpperCase() + customerPaymentData.paymentStatus.slice(1)}</div>
                <div>💬 Telegram: ${customer.tg_chat_id}</div>
            `;
        } else {
            detailsElement.innerHTML = `
                <div>📞 Phone: ${customer.phone}</div>
                <div>💬 Telegram: ${customer.tg_chat_id}</div>
                <div>⚠️ No payment data for current month</div>
            `;
        }
        
        infoContainer.style.display = 'block';
    }

    async sendIndividualReminder() {
        if (!this.selectedCustomerForReminder) {
            this.showError('Please select a customer first');
            return;
        }

        const customer = this.selectedCustomerForReminder;
        const customerPaymentData = this.paymentData.find(data => data.customer.id === customer.id);
        
        if (!customerPaymentData) {
            this.showError('No payment data found for selected customer');
            return;
        }

        // Check if reminder is needed
        if (customerPaymentData.paymentStatus === 'paid') {
            if (!confirm(`${customer.name} has already paid. Send reminder anyway?`)) {
                return;
            }
        }

        try {
            this.showLoading(true);
            
            await this.sendPaymentReminderToCustomer(customerPaymentData);
            
            this.showSuccess(`Payment reminder sent successfully to ${customer.name}!`);
            
            // Clear selection after successful send
            this.clearReminderSelection();
            
        } catch (error) {
            console.error('Error sending individual reminder:', error);
            this.showError(`Failed to send reminder to ${customer.name}`);
        } finally {
            this.showLoading(false);
        }
    }

    clearReminderSelection() {
        this.selectedCustomerForReminder = null;
        
        // Clear search input
        const searchInput = document.getElementById('reminder-customer-search');
        searchInput.value = '';
        
        // Hide dropdown and customer info
        const select = document.getElementById('reminder-customer-select');
        select.style.display = 'none';
        
        const infoContainer = document.getElementById('selected-customer-info');
        infoContainer.style.display = 'none';
        
        // Disable send button
        const sendBtn = document.getElementById('send-individual-reminder');
        sendBtn.disabled = true;
        
        // Reset dropdown to default state
        this.populateCustomerDropdownForReminder();
    }

    async generatePDFReport() {
        if (!this.paymentData || this.paymentData.length === 0) {
            this.showError('No payment data available. Please refresh the data first.');
            return;
        }

        try {
            this.showLoading(true);

            // Get jsPDF from global window object
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Get current month name for title
            const monthName = new Date(this.currentMonth + '-01').toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
            });

            // PDF Title and Header
            doc.setFontSize(20);
            doc.setTextColor(40, 40, 40);
            doc.text('SUDHA SAGAR', 20, 25);
            
            doc.setFontSize(16);
            doc.text('Payment Management Report', 20, 35);
            
            doc.setFontSize(12);
            doc.text(`Month: ${monthName}`, 20, 45);
            doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 20, 52);

            // Summary Statistics
            const totalRevenue = this.paymentData.reduce((sum, data) => sum + data.totalAmount, 0);
            const totalPaid = this.paymentData.reduce((sum, data) => sum + data.paidAmount, 0);
            const paidCustomers = this.paymentData.filter(data => data.paymentStatus === 'paid').length;
            const pendingPayments = this.paymentData.filter(data => data.paymentStatus === 'pending').length;
            const partialPayments = this.paymentData.filter(data => data.paymentStatus === 'partial').length;
            const totalMilk = this.paymentData.reduce((sum, data) => sum + data.totalMilk, 0);

            // Summary box
            doc.setFillColor(245, 245, 245);
            doc.rect(20, 60, 170, 35, 'F');
            
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.text('MONTHLY SUMMARY', 25, 70);
            
            doc.text(`Total Customers: ${this.paymentData.length}`, 25, 78);
            doc.text(`Paid Customers: ${paidCustomers}`, 25, 84);
            doc.text(`Pending Payments: ${pendingPayments}`, 25, 90);
            
            doc.text(`Total Revenue: ₹${totalRevenue}`, 100, 78);
            doc.text(`Total Paid: ₹${totalPaid}`, 100, 84);
            doc.text(`Total Milk: ${totalMilk.toFixed(1)}L`, 100, 90);

            // Customer Payment Table
            const tableColumns = [
                'Customer Name',
                'Phone',
                'Days Delivered',
                'Milk (L)',
                'Total Amount',
                'Paid Amount',
                'Balance',
                'Status'
            ];

            const tableRows = this.paymentData.map(data => [
                data.customer.name,
                data.customer.phone,
                data.daysDelivered.toString(),
                data.totalMilk.toFixed(1),
                `₹${data.totalAmount}`,
                `₹${data.paidAmount}`,
                `₹${data.balanceAmount}`,
                data.paymentStatus.charAt(0).toUpperCase() + data.paymentStatus.slice(1)
            ]);

            // Use autoTable plugin to create the table
            doc.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 105,
                styles: {
                    fontSize: 8,
                    cellPadding: 3
                },
                headStyles: {
                    fillColor: [80, 150, 220],
                    textColor: 255,
                    fontSize: 9,
                    fontStyle: 'bold'
                },
                alternateRowStyles: {
                    fillColor: [250, 250, 250]
                },
                columnStyles: {
                    0: { cellWidth: 30 }, // Customer Name
                    1: { cellWidth: 22 }, // Phone
                    2: { cellWidth: 15 }, // Days Delivered
                    3: { cellWidth: 15 }, // Milk
                    4: { cellWidth: 20 }, // Total Amount
                    5: { cellWidth: 20 }, // Paid Amount
                    6: { cellWidth: 18 }, // Balance
                    7: { cellWidth: 18 }  // Status
                },
                didDrawCell: function(data) {
                    // Color code payment status
                    if (data.column.index === 7) { // Status column
                        const status = data.cell.text[0].toLowerCase();
                        if (status === 'paid') {
                            data.cell.styles.textColor = [34, 139, 34]; // Green
                        } else if (status === 'pending') {
                            data.cell.styles.textColor = [220, 20, 60]; // Red
                        } else if (status === 'partial') {
                            data.cell.styles.textColor = [255, 140, 0]; // Orange
                        }
                    }
                    
                    // Highlight balance amounts
                    if (data.column.index === 6) { // Balance column
                        const balance = parseFloat(data.cell.text[0].replace('₹', ''));
                        if (balance > 0) {
                            data.cell.styles.textColor = [220, 20, 60]; // Red for pending balance
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            });

            // Footer with timestamp
            const pageCount = doc.internal.getNumberOfPages();
            const pageHeight = doc.internal.pageSize.height;
            
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`Report generated by SUDHA SAGAR Management System`, 20, pageHeight - 20);
            doc.text(`Page 1 of ${pageCount}`, 170, pageHeight - 20);

            // Save the PDF
            const fileName = `SUDHA_SAGAR_Payment_Report_${this.currentMonth.replace('-', '_')}.pdf`;
            doc.save(fileName);

            this.showSuccess(`PDF report generated successfully! File: ${fileName}`);

        } catch (error) {
            console.error('Error generating PDF report:', error);
            this.showError('Failed to generate PDF report. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }
}

// Create global payment manager instance
const paymentManager = new PaymentManager();
window.paymentManager = paymentManager;

export default paymentManager;
