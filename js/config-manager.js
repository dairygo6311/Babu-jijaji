import { db } from './firebase-config.js';
import { 
    doc,
    getDoc, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class ConfigManager {
    constructor() {
        this.settings = null;
        this.listeners = [];
        this.init();
    }

    async init() {
        try {
            console.log('Initializing Config Manager');
            await this.loadSettings();
            this.setupRealtimeListener();
        } catch (error) {
            console.error('Failed to initialize Config Manager:', error);
            // Fallback to defaults if initialization fails
            this.settings = this.getDefaultSettings();
        }
    }

    async loadSettings() {
        try {
            // Try to get settings from localStorage first (fast access)
            const stored = localStorage.getItem('app_settings');
            if (stored) {
                this.settings = JSON.parse(stored);
            }

            // Then get from Firestore (authoritative source)
            const settingsDoc = await getDoc(doc(db, 'app_settings', 'main'));
            if (settingsDoc.exists()) {
                this.settings = settingsDoc.data();
                localStorage.setItem('app_settings', JSON.stringify(this.settings));
            }

            // If no settings found, use defaults
            if (!this.settings) {
                this.settings = this.getDefaultSettings();
                localStorage.setItem('app_settings', JSON.stringify(this.settings));
            }

            console.log('Settings loaded:', this.settings);
            this.notifyListeners();

        } catch (error) {
            console.error('Error loading settings:', error);
            this.settings = this.getDefaultSettings();
        }
    }

    setupRealtimeListener() {
        try {
            // Listen for settings changes in real-time
            const settingsRef = doc(db, 'app_settings', 'main');
            
            onSnapshot(settingsRef, (doc) => {
                if (doc.exists()) {
                    console.log('Settings updated from server');
                    this.settings = doc.data();
                    localStorage.setItem('app_settings', JSON.stringify(this.settings));
                    this.notifyListeners();
                }
            }, (error) => {
                console.error('Error listening to settings updates:', error);
                // Don't let listener failures break the app
            });
        } catch (error) {
            console.error('Failed to setup realtime listener:', error);
        }
    }

    getDefaultSettings() {
        return {
            projectName: 'SUDHA SAGAR',
            businessType: 'DAIRY',
            contactNumber: '9413577474',
            adminEmail: 'admin@sudhasagar.com',
            firebase: {
                apiKey: "AIzaSyBMCYSn55b_n6cn8a4RRGnWu3EaAg7IUtg",
  authDomain: "babul-ji.firebaseapp.com",
  databaseURL: "https://babul-ji-default-rtdb.firebaseio.com",
  projectId: "babul-ji",
  storageBucket: "babul-ji.firebasestorage.app",
  messagingSenderId: "860046675062",
  appId: "1:860046675062:web:1e4e4000deec9286e3e357",
  measurementId: "G-YW0VG1QMMB"
            },
            telegram: {
                botToken: '8414963882:AAHAxN6adnkt5HKV1yXhpGZVpwGv3rNd2yQ',
                adminChatId: '5861659575'
            },
            lastUpdated: new Date().toISOString()
        };
    }

    // Subscribe to settings changes
    onSettingsChange(callback) {
        this.listeners.push(callback);
        // Immediately call with current settings
        if (this.settings) {
            callback(this.settings);
        }
    }

    // Remove settings change listener
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.settings);
            } catch (error) {
                console.error('Error in settings listener:', error);
            }
        });
    }

    // Get current settings
    getSettings() {
        return this.settings;
    }

    // Get specific setting value
    get(key) {
        if (!this.settings) return null;
        
        // Support nested keys like 'telegram.botToken'
        const keys = key.split('.');
        let value = this.settings;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return null;
            }
        }
        
        return value;
    }

    // Message template helpers with current settings
    getDeliveryMessage(customerName, date, quantity, rate, amount, status = 'delivered', timeSlot = 'morning') {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        const timeSlotEmoji = timeSlot === 'morning' ? '🌅' : '🌆';
        const timeSlotText = timeSlot === 'morning' ? 'सुबह (Morning)' : 'शाम (Evening)';
        
        if (status === 'delivered') {
            return `🥛 *${projectName} ${businessType}*\n───────────────────\n\n🙏 नमस्ते *${customerName} जी*!\n\n✅ आज की ${timeSlotText} डिलीवरी पूरी हो गई\n\n${timeSlotEmoji} *डिलीवरी का विवरण:*\n📅 तारीख: ${this.formatDate(date)}\n🥛 मात्रा: *${quantity} लीटर*\n💰 रेट: ₹${rate}/लीटर\n💸 कुल राशि: *₹${amount}*\n\n───────────────────\n📞 किसी भी प्रश्न के लिए: *${contactNumber}*\n\n🙏 *धन्यवाद!*\n*${projectName} ${businessType}* 🥛`;
        } else if (status === 'skipped') {
            return `🥛 *${projectName} ${businessType}*\n───────────────────\n\n🙏 नमस्ते *${customerName} जी*!\n\n⚠️ आज की ${timeSlotText} डिलीवरी *रद्द* कर दी गई\n\n${timeSlotEmoji} *विवरण:*\n📅 तारीख: ${this.formatDate(date)}\n\n📝 *कारण:* ग्राहक की अनुपस्थिति / अन्य कारण\n\n───────────────────\n📞 किसी भी प्रश्न के लिए: *${contactNumber}*\n\n*${projectName} ${businessType}* 🥛`;
        }
    }

    getRegistrationMessage(customerData) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        return `🥛 ${projectName} ${businessType}

🎉 नमस्कार ${customerData.name}!

आपका registration हमारे ${projectName} ${businessType} में हो गया है! ✅

📋 आपकी Details:
👤 नाम: ${customerData.name}
📱 मोबाइल: ${customerData.phone}
🥛 Delivery Schedule: ${customerData.schedule || 'Daily'}
💰 Rate: ₹${customerData.rate}/L
${customerData.address ? `📍 Address: ${customerData.address}\n` : ''}📊 Status: ${customerData.status}
📅 Registration Date: ${this.formatDate(customerData.created_at)}

🌟 ${projectName} ${businessType} की तरफ से आपका हार्दिक स्वागत है!

✨ हमारी Services:
• Fresh & Pure Milk Daily
• Home Delivery
• Flexible Timing
• Quality Guaranteed

📞 किसी भी सवाल के लिए संपर्क करें: ${contactNumber}

शुक्रिया! 🙏

- Team ${projectName} ${businessType}`;
    }

    getPaymentMessage(customerName, monthName, paymentAmount, totalPaid, totalAmount, status) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        return `🥛 ${projectName} ${businessType}\n\n💰 ${customerName}\n\n${monthName} का payment received!\n\n✅ Received: ₹${paymentAmount}\n📊 Total Paid: ₹${totalPaid}\n💸 Total Amount: ₹${totalAmount}\n📋 ${status}\n\nकोई भी query के लिए: ${contactNumber}\n\nधन्यवाद! 🙏\n\n- ${projectName} ${businessType}`;
    }

    getMonthlyReportMessage(customer, deliveries, monthName, year) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        const deliveredDeliveries = deliveries.filter(d => d.status === 'delivered');
        const skippedDeliveries = deliveries.filter(d => d.status === 'skipped');
        
        const totalDays = deliveredDeliveries.length;
        const skippedDays = skippedDeliveries.length;
        const totalQuantity = deliveredDeliveries.reduce((sum, d) => sum + (d.qty || 0), 0);
        const totalAmount = deliveredDeliveries.reduce((sum, d) => sum + (d.amount || 0), 0);

        let report = `🥛 ${projectName} ${businessType}\n\n📄 ${monthName} ${year} Report – ${customer.name}\n\n`;
        report += `📊 Summary:\n`;
        report += `• कुल दिन Delivered: ${totalDays}\n`;
        report += `• कुल दिन Skipped: ${skippedDays}\n`;
        report += `• Total Quantity: ${totalQuantity.toFixed(1)} L\n`;
        report += `• Total Amount: ₹${totalAmount}\n\n`;

        if (deliveredDeliveries.length > 0) {
            report += `📅 Delivery Details:\n`;
            deliveredDeliveries.forEach(delivery => {
                const date = new Date(delivery.date).toLocaleDateString('en-IN');
                const timeSlotEmoji = delivery.time_slot === 'morning' ? '🌅' : delivery.time_slot === 'evening' ? '🌆' : '🕐';
                const timeSlotText = delivery.time_slot === 'morning' ? 'Morning' : delivery.time_slot === 'evening' ? 'Evening' : 'All Day';
                report += `${date} ${timeSlotEmoji} ${timeSlotText}: ${delivery.qty}L - ₹${delivery.amount}\n`;
            });
        }

        if (skippedDeliveries.length > 0) {
            report += `\n❌ Skipped Days:\n`;
            skippedDeliveries.forEach(delivery => {
                const date = new Date(delivery.date).toLocaleDateString('en-IN');
                const timeSlotEmoji = delivery.time_slot === 'morning' ? '🌅' : delivery.time_slot === 'evening' ? '🌆' : '🕐';
                const timeSlotText = delivery.time_slot === 'morning' ? 'Morning' : delivery.time_slot === 'evening' ? 'Evening' : 'All Day';
                report += `${date} ${timeSlotEmoji} ${timeSlotText}: Skipped\n`;
            });
        }

        report += `\nकोई भी query के लिए: ${contactNumber}\n\nधन्यवाद! 🙏\n\n- ${projectName} ${businessType}`;
        return report;
    }

    getAdminDeliveryMessage(customerName, customerPhone, date, quantity, rate, amount, status) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';

        if (status === 'delivered') {
            return `📊 ADMIN NOTIFICATION\n\n✅ Delivery Completed\n👤 Customer: ${customerName}\n📱 Phone: ${customerPhone}\n📅 Date: ${this.formatDate(date)}\n🥛 Quantity: ${quantity} L\n💰 Rate: ₹${rate}/L\n💸 Amount: ₹${amount}\n\n✅ Customer notified via Telegram\n\n- ${projectName} ${businessType} Admin`;
        } else if (status === 'skipped') {
            return `📊 ADMIN NOTIFICATION\n\n⏭️ Delivery Skipped\n👤 Customer: ${customerName}\n📱 Phone: ${customerPhone}\n📅 Date: ${this.formatDate(date)}\n\n✅ Customer notified via Telegram\n\n- ${projectName} ${businessType} Admin`;
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

    // Telegram API helper with current bot token
    async sendTelegramMessage(chatId, message, parseMode = 'HTML') {
        const settings = this.getSettings();
        const botToken = settings?.telegram?.botToken;
        
        if (!botToken) {
            throw new Error('Telegram Bot Token not configured');
        }

        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: parseMode
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.description || 'Failed to send Telegram message');
        }

        return data;
    }

    // Project branding helper
    getPaymentCompletionMessage(customerName, monthName, totalAmount) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        return `🥛 ${projectName} ${businessType}\n\n🎉 ${customerName}\n\nआपका ${monthName} का पूरा payment complete हो गया है!\n\n💰 Total Amount: ₹${totalAmount}\n✅ Status: Paid\n\nकोई भी query के लिए: ${contactNumber}\n\nधन्यवाद! 🙏\n\n- ${projectName} ${businessType}`;
    }

    getPaymentReminderMessage(customerName, monthName, statusText, totalAmount, paidAmount, balanceAmount, daysDelivered, totalMilk, rate, dueDateText) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        return `🥛 ${projectName} ${businessType}

⚠️ Payment Reminder - ${customerName}

📅 Month: ${monthName}
💸 Status: ${statusText}

📊 Payment Details:
• Total Amount: ₹${totalAmount}
• Paid Amount: ₹${paidAmount}
• Balance Due: ₹${balanceAmount}

📋 Service Details:
• Days Delivered: ${daysDelivered}
• Total Milk: ${totalMilk}L
• Rate: ₹${rate}/L

⏰ Due Date: ${dueDateText}

कृपया जल्द से जल्द payment करें। धन्यवाद! 🙏

Payment के लिए contact करें: ${contactNumber}
- ${projectName} ${businessType}`;
    }

    getCustomerUpdateMessage(customerData) {
        const settings = this.getSettings();
        const projectName = settings?.projectName || 'SUDHA SAGAR';
        const businessType = settings?.businessType || 'DAIRY';
        const contactNumber = settings?.contactNumber || '9413577474';

        return `🔄 ${projectName} ${businessType} - Details Updated

📢 नमस्कार ${customerData.name}!

आपकी details successfully update हो गई हैं! ✅

📋 Updated Details:
👤 नाम: ${customerData.name}
📱 मोबाइल: ${customerData.phone}
💰 Rate: ₹${customerData.rate}/L
${customerData.address ? `📍 Address: ${customerData.address}\n` : ''}📊 Status: ${customerData.status}
🕒 Last Updated: ${new Date().toLocaleDateString('en-IN')}

✨ यदि कोई भी details गलत है या कोई समस्या है तो कृपया तुरंत संपर्क करें।

📞 Contact: ${contactNumber}

धन्यवाद! 🙏

- Team ${projectName} ${businessType}`;
    }

    getProjectBranding() {
        const settings = this.getSettings();
        return {
            name: settings?.projectName || 'SUDHA SAGAR',
            type: settings?.businessType || 'DAIRY',
            fullName: `${settings?.projectName || 'SUDHA SAGAR'} ${settings?.businessType || 'DAIRY'}`,
            contact: settings?.contactNumber || '9413577474',
            adminEmail: settings?.adminEmail || 'admin@sudhasagar.com'
        };
    }
}

// Create global config manager instance
const configManager = new ConfigManager();
window.configManager = configManager;

// Export for other modules
export default configManager;
