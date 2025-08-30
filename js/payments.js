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

        // Show the modern payment dialog
        this.showPaymentDialog(customer, totalAmount, currentPaid);
    }

    showPaymentDialog(customer, totalAmount, currentPaid) {
        const dialog = document.getElementById('payment-dialog');
        const overlay = dialog;
        
        // Populate customer information
        document.getElementById('dialog-customer-name').textContent = customer.name;
        document.getElementById('dialog-customer-phone').textContent = customer.phone;
        document.getElementById('dialog-total-amount').textContent = `₹${totalAmount}`;
        document.getElementById('dialog-paid-amount').textContent = `₹${currentPaid}`;
        
        const balance = totalAmount - currentPaid;
        document.getElementById('dialog-balance-amount').textContent = `₹${balance}`;
        
        // Clear form
        document.getElementById('payment-amount').value = '';
        document.getElementById('payment-note').value = '';
        document.querySelector('input[name="payment-method"][value="cash"]').checked = true;
        
        // Store customer data for form submission
        this.currentPaymentData = { customer, totalAmount, currentPaid };
        
        // Show dialog with animation
        overlay.classList.add('active');
        
        // Focus on amount input
        setTimeout(() => {
            document.getElementById('payment-amount').focus();
        }, 300);
        
        // Setup event listeners if not already done
        this.setupPaymentDialogListeners();
    }

    setupPaymentDialogListeners() {
        // Prevent multiple event listeners
        if (this.dialogListenersSetup) return;
        this.dialogListenersSetup = true;
        
        const dialog = document.getElementById('payment-dialog');
        const closeBtn = document.getElementById('payment-dialog-close');
        const cancelBtn = document.getElementById('payment-cancel');
        const form = document.getElementById('payment-form');
        const amountInput = document.getElementById('payment-amount');
        
        // Close dialog handlers
        const closeDialog = () => {
            dialog.classList.remove('active');
            this.currentPaymentData = null;
        };
        
        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dialog.classList.contains('active')) {
                closeDialog();
            }
        });
        
        // Quick payment buttons
        document.querySelectorAll('.quick-payment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentPaymentData) return;
                
                const type = e.currentTarget.getAttribute('data-type');
                const balance = this.currentPaymentData.totalAmount - this.currentPaymentData.currentPaid;
                
                if (type === 'full') {
                    amountInput.value = balance;
                } else if (type === 'half') {
                    amountInput.value = Math.round(balance / 2);
                }
                
                // Add visual feedback
                e.currentTarget.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    e.currentTarget.style.transform = '';
                }, 150);
            });
        });
        
        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.processPaymentFromDialog();
        });
        
        // Amount input validation
        amountInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const submitBtn = document.getElementById('payment-submit');
            
            if (isNaN(value) || value <= 0) {
                submitBtn.disabled = true;
            } else {
                submitBtn.disabled = false;
            }
        });
    }

    async processPaymentFromDialog() {
        if (!this.currentPaymentData) return;
        
        const amountInput = document.getElementById('payment-amount');
        const noteInput = document.getElementById('payment-note');
        const selectedMethod = document.querySelector('input[name="payment-method"]:checked');
        const submitBtn = document.getElementById('payment-submit');
        
        const amount = amountInput.value.trim();
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            this.showError('Please enter a valid payment amount');
            amountInput.focus();
            return;
        }

        const paymentAmount = parseFloat(amount);
        const { customer, totalAmount, currentPaid } = this.currentPaymentData;
        const newPaidAmount = currentPaid + paymentAmount;

        // Disable submit button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-feather="loader"></i> Processing...';
        feather.replace();

        try {
            this.showLoading(true);

            const paymentData = {
                customer_id: customer.id,
                month: this.currentMonth,
                paid_amount: newPaidAmount,
                total_amount: totalAmount,
                payment_date: new Date().toISOString().split('T')[0],
                last_payment_amount: paymentAmount,
                payment_method: selectedMethod.value,
                payment_note: noteInput.value.trim() || null,
                updated_at: new Date().toISOString()
            };

            // Check if payment record exists
            const existingPayment = this.payments.find(p => p.customer_id === customer.id);
            
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
            
            // Close dialog
            document.getElementById('payment-dialog').classList.remove('active');
            this.currentPaymentData = null;
            
            await this.loadData(); // Refresh data

        } catch (error) {
            console.error('Error recording payment:', error);
            this.showError('Failed to record payment');
        } finally {
            this.showLoading(false);
            
            // Reset submit button
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-feather="check"></i> Record Payment';
            feather.replace();
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
            const status = balance <= 0 ? 'Paid' : `Balance Due: ₹${balance}`;

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

            // Modern PDF Header with gradient effect
            doc.setFillColor(124, 58, 237); // Purple gradient start
            doc.rect(0, 0, 210, 35, 'F');
            
            // Company Logo area (placeholder)
            doc.setFillColor(255, 255, 255);
            doc.circle(25, 17.5, 8, 'F');
            doc.setFontSize(8);
            doc.setTextColor(124, 58, 237);
            doc.text('SS', 22, 20);

            // Header Text
            doc.setFontSize(24);
            doc.setTextColor(255, 255, 255);
            doc.text('SUDHA SAGAR', 40, 20);
            
            doc.setFontSize(14);
            doc.setTextColor(240, 240, 240);
            doc.text('Payment Management Report', 40, 28);

            // Date info
            doc.setFontSize(10);
            doc.setTextColor(220, 220, 220);
            doc.text(`${monthName} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 140, 20);

            // Summary Statistics with colored cards
            const totalRevenue = this.paymentData.reduce((sum, data) => sum + data.totalAmount, 0);
            const totalPaid = this.paymentData.reduce((sum, data) => sum + data.paidAmount, 0);
            const totalBalance = totalRevenue - totalPaid;
            const paidCustomers = this.paymentData.filter(data => data.paymentStatus === 'paid').length;
            const pendingPayments = this.paymentData.filter(data => data.paymentStatus === 'pending').length;
            const partialPayments = this.paymentData.filter(data => data.paymentStatus === 'partial').length;
            const totalMilk = this.paymentData.reduce((sum, data) => sum + data.totalMilk, 0);

            // Summary Cards Row 1
            doc.setFontSize(12);
            doc.setTextColor(50, 50, 50);
            doc.text('MONTHLY OVERVIEW', 20, 50);

            // Revenue Card
            doc.setFillColor(220, 252, 231); // Light green
            doc.rect(20, 55, 50, 25, 'F');
            doc.setDrawColor(34, 197, 94);
            doc.rect(20, 55, 50, 25, 'S');
            
            doc.setFontSize(18);
            doc.setTextColor(21, 128, 61);
            doc.text(`₹${totalRevenue}`, 25, 66);
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            doc.text('Total Revenue', 25, 74);

            // Paid Amount Card
            doc.setFillColor(187, 247, 208); // Medium green
            doc.rect(75, 55, 50, 25, 'F');
            doc.setDrawColor(34, 197, 94);
            doc.rect(75, 55, 50, 25, 'S');
            
            doc.setFontSize(18);
            doc.setTextColor(21, 128, 61);
            doc.text(`₹${totalPaid}`, 80, 66);
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            doc.text('Amount Collected', 80, 74);

            // Balance Card
            doc.setFillColor(254, 226, 226); // Light red
            doc.rect(130, 55, 50, 25, 'F');
            doc.setDrawColor(239, 68, 68);
            doc.rect(130, 55, 50, 25, 'S');
            
            doc.setFontSize(18);
            doc.setTextColor(185, 28, 28);
            doc.text(`₹${totalBalance}`, 135, 66);
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            doc.text('Balance Due', 135, 74);

            // Customer Stats Row 2
            // Paid Customers
            doc.setFillColor(220, 252, 231);
            doc.rect(20, 85, 35, 20, 'F');
            doc.setDrawColor(34, 197, 94);
            doc.rect(20, 85, 35, 20, 'S');
            
            doc.setFontSize(16);
            doc.setTextColor(21, 128, 61);
            doc.text(`${paidCustomers}`, 25, 96);
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text('Paid Customers', 25, 102);

            // Pending Customers
            doc.setFillColor(254, 226, 226);
            doc.rect(60, 85, 35, 20, 'F');
            doc.setDrawColor(239, 68, 68);
            doc.rect(60, 85, 35, 20, 'S');
            
            doc.setFontSize(16);
            doc.setTextColor(185, 28, 28);
            doc.text(`${pendingPayments}`, 65, 96);
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text('Pending', 65, 102);

            // Partial Customers
            doc.setFillColor(255, 237, 213);
            doc.rect(100, 85, 35, 20, 'F');
            doc.setDrawColor(245, 158, 11);
            doc.rect(100, 85, 35, 20, 'S');
            
            doc.setFontSize(16);
            doc.setTextColor(217, 119, 6);
            doc.text(`${partialPayments}`, 105, 96);
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text('Partial', 105, 102);

            // Milk Delivered
            doc.setFillColor(239, 246, 255);
            doc.rect(140, 85, 40, 20, 'F');
            doc.setDrawColor(59, 130, 246);
            doc.rect(140, 85, 40, 20, 'S');
            
            doc.setFontSize(16);
            doc.setTextColor(29, 78, 216);
            doc.text(`${totalMilk.toFixed(1)}L`, 145, 96);
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text('Total Milk', 145, 102);

            // Customer Payment Table
            const tableColumns = [
                'Customer Name',
                'Phone',
                'Days',
                'Milk (L)',
                'Total',
                'Paid',
                'Balance Due',
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

            // Enhanced Table with better styling
            doc.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 115,
                styles: {
                    fontSize: 9,
                    cellPadding: 5,
                    lineColor: [200, 200, 200],
                    lineWidth: 0.5,
                    textColor: [50, 50, 50],
                    font: 'helvetica'
                },
                headStyles: {
                    fillColor: [124, 58, 237], // Purple header
                    textColor: [255, 255, 255],
                    fontSize: 10,
                    fontStyle: 'bold',
                    cellPadding: 6,
                    halign: 'center'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252] // Very light blue-gray
                },
                columnStyles: {
                    0: { cellWidth: 32, halign: 'left' }, // Customer Name
                    1: { cellWidth: 25, halign: 'left' }, // Phone
                    2: { cellWidth: 15, halign: 'center' }, // Days Delivered
                    3: { cellWidth: 18, halign: 'center' }, // Milk
                    4: { cellWidth: 22, halign: 'right' }, // Total Amount
                    5: { cellWidth: 22, halign: 'right' }, // Paid Amount
                    6: { cellWidth: 25, halign: 'right' }, // Balance Due
                    7: { cellWidth: 20, halign: 'center' }  // Status
                },
                didDrawCell: function(data) {
                    // Enhanced color coding for payment status
                    if (data.column.index === 7) { // Status column
                        const status = data.cell.text[0].toLowerCase();
                        if (status === 'paid') {
                            data.cell.styles.textColor = [22, 163, 74]; // Modern green
                            data.cell.styles.fillColor = [240, 253, 244]; // Light green background
                            data.cell.styles.fontStyle = 'bold';
                        } else if (status === 'pending') {
                            data.cell.styles.textColor = [239, 68, 68]; // Modern red
                            data.cell.styles.fillColor = [254, 242, 242]; // Light red background
                            data.cell.styles.fontStyle = 'bold';
                        } else if (status === 'partial') {
                            data.cell.styles.textColor = [217, 119, 6]; // Modern orange
                            data.cell.styles.fillColor = [255, 251, 235]; // Light orange background
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                    
                    // Enhanced balance column styling
                    if (data.column.index === 6) { // Balance Due column
                        const balance = parseFloat(data.cell.text[0].replace('₹', ''));
                        if (balance > 0) {
                            data.cell.styles.textColor = [185, 28, 28]; // Dark red for pending balance
                            data.cell.styles.fillColor = [254, 242, 242]; // Light red background
                            data.cell.styles.fontStyle = 'bold';
                        } else {
                            data.cell.styles.textColor = [22, 163, 74]; // Green for zero balance
                            data.cell.styles.fillColor = [240, 253, 244]; // Light green background
                        }
                    }

                    // Enhanced paid amount column styling
                    if (data.column.index === 5) { // Paid Amount column
                        const paidAmount = parseFloat(data.cell.text[0].replace('₹', ''));
                        if (paidAmount > 0) {
                            data.cell.styles.textColor = [22, 163, 74]; // Green for paid amounts
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }

                    // Enhanced total amount column styling
                    if (data.column.index === 4) { // Total Amount column
                        data.cell.styles.textColor = [30, 64, 175]; // Blue for total amounts
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            // Modern Footer with enhanced styling
            const pageCount = doc.internal.getNumberOfPages();
            const pageHeight = doc.internal.pageSize.height;
            
            // Footer background
            doc.setFillColor(248, 250, 252);
            doc.rect(0, pageHeight - 30, 210, 30, 'F');
            
            // Footer line
            doc.setDrawColor(124, 58, 237);
            doc.setLineWidth(1);
            doc.line(20, pageHeight - 25, 190, pageHeight - 25);
            
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Report generated by SUDHA SAGAR Management System`, 20, pageHeight - 15);
            
            doc.setTextColor(124, 58, 237);
            doc.text(`Page 1 of ${pageCount}`, 170, pageHeight - 15);
            
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(`${new Date().toLocaleString('en-IN')}`, 20, pageHeight - 8);

            // Save the PDF with enhanced filename
            const fileName = `SUDHA_SAGAR_Payment_Report_${monthName.replace(' ', '_')}_${this.currentMonth}.pdf`;
            doc.save(fileName);

            this.showSuccess(`Enhanced PDF report generated! File: ${fileName}`);

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