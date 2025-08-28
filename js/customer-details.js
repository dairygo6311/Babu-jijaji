import { db, auth } from './firebase-config.js';
import configManager from './config-manager.js';
import LoadingManager from './loading-utils.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

class CustomerDetailsManager {
    constructor() {
        this.customers = [];
        this.currentDetails = null;
        this.initialized = false;
        this.authReady = false;
        
        // Wait for authentication
        this.waitForAuth();
    }

    waitForAuth() {
        onAuthStateChanged(auth, (user) => {
            console.log('Auth state changed in customer details:', user ? 'logged in' : 'logged out');
            if (user) {
                this.authReady = true;
                console.log('Auth ready, initializing customer details...');
                this.init();
            } else {
                this.authReady = false;
                console.log('User not authenticated, waiting...');
            }
        });
    }

    init() {
        console.log('CustomerDetails init called:', { initialized: this.initialized, authReady: this.authReady });
        if (this.initialized || !this.authReady) return;
        
        console.log('Setting up customer details components...');
        this.setupEventListeners();
        this.setDefaultMonth();
        this.loadCustomers();
        this.initialized = true;
        console.log('Customer details initialization complete');
    }

    setupEventListeners() {
        const loadDetailsBtn = document.getElementById('load-details-btn');
        const sendToCustomerBtn = document.getElementById('send-details-to-customer');
        
        if (loadDetailsBtn) {
            loadDetailsBtn.addEventListener('click', () => this.loadCustomerDetails());
        } else {
            console.log('Load details button not found');
        }
        
        if (sendToCustomerBtn) {
            sendToCustomerBtn.addEventListener('click', () => this.sendDetailsToCustomer());
        } else {
            console.log('Send to customer button not found');
        }
    }

    setDefaultMonth() {
        const monthInput = document.getElementById('details-month');
        if (monthInput) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            monthInput.value = `${year}-${month}`;
        }
    }

    async loadCustomers() {
        try {
            console.log('Loading customers for customer details...');
            window.loadingManager.show('Loading customers...');
            
            // Check authentication first
            if (!auth.currentUser) {
                console.log('User not authenticated, waiting...');
                window.loadingManager.hide();
                return; // Will be called again when auth is ready
            }
            
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
            
            console.log('Loaded customers:', this.customers.length);
            this.renderCustomerDropdown();
        } catch (error) {
            console.error('Error loading customers:', error);
            this.showError('Failed to load customers: ' + error.message);
            // Set empty array so dropdown still works
            this.customers = [];
            this.renderCustomerDropdown();
        } finally {
            window.loadingManager.hide();
        }
    }

    renderCustomerDropdown() {
        console.log('Rendering customer dropdown...');
        const customerSelect = document.getElementById('details-customer');
        if (!customerSelect) {
            console.error('Customer select dropdown not found with ID: details-customer');
            return;
        }

        console.log('Found customer select element, clearing and populating...');
        customerSelect.innerHTML = '<option value="">Select a customer</option>';
        
        if (this.customers.length === 0) {
            console.log('No customers to display in dropdown');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No customers found';
            option.disabled = true;
            customerSelect.appendChild(option);
            return;
        }
        
        this.customers.forEach((customer, index) => {
            console.log(`Adding customer ${index + 1}:`, customer.name);
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name;
            customerSelect.appendChild(option);
        });
        
        console.log('Customer dropdown populated with', this.customers.length, 'customers');
    }

    async loadCustomerDetails() {
        const customerId = document.getElementById('details-customer')?.value;
        const monthInput = document.getElementById('details-month')?.value;
        
        console.log('Loading details for:', { customerId, monthInput });
        
        if (!customerId || !monthInput) {
            this.showError('Please select both customer and month');
            return;
        }

        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) {
            this.showError('Customer not found');
            return;
        }

        try {
            this.showLoading(true);
            
            // Check authentication first
            const user = auth.currentUser;
            if (!user) {
                throw new Error('User not authenticated. Please login first.');
            }
            console.log('User authenticated:', user.email);
            
            // Check if db is properly initialized
            if (!db) {
                throw new Error('Database not initialized');
            }
            console.log('Database initialized successfully');
            
            // Load ALL deliveries first, then filter
            console.log('Loading all deliveries from database...');
            
            const deliveriesRef = collection(db, 'deliveries');
            console.log('Deliveries collection reference created');
            
            const allDeliveriesQuery = query(deliveriesRef);
            console.log('Query created, executing...');
            
            const snapshot = await getDocs(allDeliveriesQuery);
            console.log('Query executed, total deliveries found:', snapshot.size);
            
            // Filter deliveries for this customer and month
            const [year, month] = monthInput.split('-');
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endDate = `${year}-${month.padStart(2, '0')}-31`;
            
            console.log('Filtering for date range:', { startDate, endDate, customerId });
            
            const deliveries = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Check if this delivery matches our criteria
                if (data.customer_id === customerId && 
                    data.date >= startDate && 
                    data.date <= endDate) {
                    deliveries.push({
                        id: doc.id,
                        ...data
                    });
                }
            });
            
            // Sort by date
            deliveries.sort((a, b) => a.date.localeCompare(b.date));
            
            console.log('Filtered deliveries found:', deliveries.length);

            this.currentDetails = {
                customer,
                deliveries,
                month: monthInput
            };

            this.renderDetailsTable();
            
        } catch (error) {
            console.error('Error loading customer details:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            this.showError('Failed to load customer details: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    renderDetailsTable() {
        if (!this.currentDetails) return;

        const { customer, deliveries, month } = this.currentDetails;
        const [year, monthNum] = month.split('-');
        const monthName = new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        // Show the table container
        const tableContainer = document.getElementById('customer-details-table-container');
        const tableTitle = document.getElementById('details-table-title');
        const table = document.getElementById('customer-details-table');
        
        if (!tableContainer || !table) return;

        tableContainer.style.display = 'block';
        tableTitle.textContent = `${customer.name} - ${monthName}`;

        // Generate all days of the month
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const allDays = [];
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${monthNum.padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const delivery = deliveries.find(d => d.date === dateStr);
            
            allDays.push({
                date: dateStr,
                day: day,
                delivery: delivery || null
            });
        }

        // Calculate totals
        const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;
        const skippedCount = deliveries.filter(d => d.status === 'skipped').length;
        const totalQuantity = deliveries.filter(d => d.status === 'delivered').reduce((sum, d) => sum + d.qty, 0);
        const totalAmount = deliveries.filter(d => d.status === 'delivered').reduce((sum, d) => sum + d.amount, 0);

        // Generate table HTML
        table.innerHTML = `
            <table class="details-data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Time Slot</th>
                        <th>Quantity (L)</th>
                        <th>Rate (₹/L)</th>
                        <th>Amount (₹)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${allDays.map(day => {
                        const delivery = day.delivery;
                        const dayName = new Date(day.date).toLocaleDateString('en', { weekday: 'short' });
                        
                        if (delivery) {
                            const statusClass = delivery.status === 'delivered' ? 'delivered' : 
                                              delivery.status === 'skipped' ? 'skipped' : 'pending';
                            const statusText = delivery.status === 'delivered' ? 'Delivered' : 
                                             delivery.status === 'skipped' ? 'Skipped' : 'Pending';
                            
                            const timeSlotIcon = delivery.time_slot === 'morning' ? '🌅' : delivery.time_slot === 'evening' ? '🌆' : '🕐';
                            const timeSlotText = delivery.time_slot === 'morning' ? 'Morning' : delivery.time_slot === 'evening' ? 'Evening' : 'All Day';
                            
                            return `
                                <tr class="status-${statusClass}">
                                    <td>${day.day}/${monthNum}</td>
                                    <td>${dayName}</td>
                                    <td>${timeSlotIcon} ${timeSlotText}</td>
                                    <td>${delivery.status === 'delivered' ? delivery.qty : '-'}</td>
                                    <td>${delivery.status === 'delivered' ? '₹' + delivery.rate : '-'}</td>
                                    <td>${delivery.status === 'delivered' ? '₹' + delivery.amount : '-'}</td>
                                    <td><span class="status-badge status-${statusClass}">${statusText}</span></td>
                                </tr>
                            `;
                        } else {
                            return `
                                <tr class="status-no-record">
                                    <td>${day.day}/${monthNum}</td>
                                    <td>${dayName}</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td><span class="status-badge status-no-record">No Record</span></td>
                                </tr>
                            `;
                        }
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr class="totals-row">
                        <td colspan="3"><strong>Summary</strong></td>
                        <td><strong>${totalQuantity.toFixed(1)}L</strong></td>
                        <td>-</td>
                        <td><strong>₹${totalAmount}</strong></td>
                        <td><strong>${deliveredCount} Delivered, ${skippedCount} Skipped</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    async sendDetailsToCustomer() {
        if (!this.currentDetails) {
            this.showError('Please load customer details first');
            return;
        }

        const { customer, deliveries, month } = this.currentDetails;
        
        if (!customer.tg_chat_id) {
            this.showError(`${customer.name} does not have a Telegram chat ID`);
            return;
        }

        try {
            this.showLoading(true);
            
            const reportText = this.generateDetailedReport(customer, deliveries, month);
            await this.sendReportViaTelegram(customer.tg_chat_id, reportText);
            
            this.showSuccess(`Monthly details sent to ${customer.name}!`);
            
        } catch (error) {
            console.error('Error sending details:', error);
            this.showError('Failed to send details to customer');
        } finally {
            this.showLoading(false);
        }
    }

    generateDetailedReport(customer, deliveries, monthInput) {
        const [year, month] = monthInput.split('-');
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const deliveredDeliveries = deliveries.filter(d => d.status === 'delivered');
        const skippedDeliveries = deliveries.filter(d => d.status === 'skipped');
        
        const totalDays = deliveredDeliveries.length;
        const totalQuantity = deliveredDeliveries.reduce((sum, d) => sum + d.qty, 0);
        const totalAmount = deliveredDeliveries.reduce((sum, d) => sum + d.amount, 0);
        const skippedDays = skippedDeliveries.length;

        // Use config manager for dynamic report header
        const settings = configManager.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        
        let report = `🥛 ${projectName} ${businessType}\n\n📋 ${monthName} Detailed Report – ${customer.name}\n\n`;
        report += `📊 Summary:\n`;
        report += `• कुल दिन Delivered: ${totalDays}\n`;
        report += `• कुल दिन Skipped: ${skippedDays}\n`;
        report += `• Total Quantity: ${totalQuantity.toFixed(1)} L\n`;
        report += `• Total Amount: ₹${totalAmount}\n\n`;

        if (deliveredDeliveries.length > 0) {
            report += `📅 Daily Delivery Details:\n`;
            deliveredDeliveries.forEach(delivery => {
                const date = new Date(delivery.date).toLocaleDateString('en-IN');
                const timeSlotEmoji = delivery.time_slot === 'morning' ? '🌅' : delivery.time_slot === 'evening' ? '🌆' : '🕐';
                const timeSlotText = delivery.time_slot === 'morning' ? 'Morning' : delivery.time_slot === 'evening' ? 'Evening' : 'All Day';
                report += `${date} ${timeSlotEmoji} ${timeSlotText}: ${delivery.qty}L × ₹${delivery.rate}/L = ₹${delivery.amount}\n`;
            });
        }

        if (skippedDeliveries.length > 0) {
            report += `\n❌ Skipped Days:\n`;
            skippedDeliveries.forEach(delivery => {
                const date = new Date(delivery.date).toLocaleDateString('en-IN');
                report += `${date}: Skipped\n`;
            });
        }

        report += `\n────────────────────\n`;
        report += `💰 Grand Total: ₹${totalAmount}\n`;
        // Use config manager for dynamic footer
        const contactNumber = settings?.contactNumber || '9413577474';
        report += `📞 कोई भी query के लिए contact करें: ${contactNumber}\n\n`;
        report += `धन्यवाद! 🙏\n\n- ${projectName} ${businessType}`;

        return report;
    }

    async sendReportViaTelegram(chatId, reportText) {
        try {
            const settings = configManager.getSettings();
            const TELEGRAM_BOT_TOKEN = settings?.telegram?.botToken || '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ';
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: reportText,
                    parse_mode: 'HTML'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Telegram API error:', errorText);
                throw new Error('Failed to send report via Telegram');
            }

            console.log(`Detailed report sent successfully to chat ID: ${chatId}`);
        } catch (error) {
            console.error('Error sending report via Telegram:', error);
            throw error;
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }

    showError(message) {
        console.error('CustomerDetailsManager Error:', message);
        alert(message);
    }

    showSuccess(message) {
        alert(message);
    }
}

// Initialize customer details manager
let customerDetailsManager = null;

// Create instance when page loads
function createCustomerDetailsManager() {
    if (!customerDetailsManager) {
        console.log('Creating CustomerDetailsManager instance');
        customerDetailsManager = new CustomerDetailsManager();
        window.customerDetailsManager = customerDetailsManager;
        
        // Force initialize if auth is already ready
        setTimeout(() => {
            if (auth.currentUser && !customerDetailsManager.initialized) {
                console.log('Force initializing customer details manager...');
                customerDetailsManager.authReady = true;
                customerDetailsManager.init();
            }
        }, 1000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(createCustomerDetailsManager, 500); // Wait a bit for other scripts to load
    });
} else {
    setTimeout(createCustomerDetailsManager, 500);
}

// Also try to initialize on window load
window.addEventListener('load', () => {
    if (!customerDetailsManager) {
        console.log('Creating customer details manager on window load...');
        createCustomerDetailsManager();
    }
});

export default CustomerDetailsManager;